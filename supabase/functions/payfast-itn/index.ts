import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHash } from "https://deno.land/std@0.168.0/node/crypto.ts";

const PAYFAST_MERCHANT_ID = "10803069";
const PAYFAST_PASSPHRASE = Deno.env.get("PAYFAST_PASSPHRASE") || "";
const SUPABASE_URL = Deno.env.get("SB_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SB_SERVICE_KEY")!;

// Verify PayFast ITN signature
function verifySignature(data: Record<string, string>, receivedSignature: string): boolean {
  // Build signature string (exclude signature field)
  const params = Object.entries(data)
    .filter(([key]) => key !== "signature")
    .map(([key, val]) => `${key}=${encodeURIComponent(val).replace(/%20/g, "+")}`)
    .join("&");

  const signatureString = PAYFAST_PASSPHRASE
    ? `${params}&passphrase=${encodeURIComponent(PAYFAST_PASSPHRASE).replace(/%20/g, "+")}`
    : params;

  const hash = createHash("md5").update(signatureString).digest("hex");
  return hash === receivedSignature;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.text();
    const params: Record<string, string> = {};
    new URLSearchParams(body).forEach((val, key) => { params[key] = val; });

    console.log("PayFast ITN received:", JSON.stringify(params));

    // Verify merchant ID
    if (params.merchant_id !== PAYFAST_MERCHANT_ID) {
      console.error("Invalid merchant ID");
      return new Response("Invalid merchant", { status: 400 });
    }

    // Verify signature
    if (params.signature && !verifySignature(params, params.signature)) {
      console.error("Signature mismatch");
      return new Response("Invalid signature", { status: 400 });
    }

    // Only process completed payments
    if (params.payment_status !== "COMPLETE") {
      console.log("Payment not complete, status:", params.payment_status);
      return new Response("OK", { status: 200 });
    }

    // Extract phone from custom_str1 (we'll pass it in the payment URL)
    const phone = params.custom_str1;
    if (!phone) {
      console.error("No phone number in custom_str1");
      return new Response("Missing phone", { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Look up user by phone
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("phone", phone)
      .single();

    if (userError || !user) {
      console.error("User not found for phone:", phone);
      return new Response("User not found", { status: 404 });
    }

    // Set expiry based on plan type
    const planType = params.custom_str2 || "monthly";
    const endsAt = new Date();
    if (planType === "annual") {
      endsAt.setDate(endsAt.getDate() + 366);
    } else {
      endsAt.setDate(endsAt.getDate() + 31);
    }

    // Cancel any existing active subscriptions first
    await supabase
      .from("subscriptions")
      .update({ status: "canceled" })
      .eq("user_id", user.id)
      .eq("status", "active");

    // Insert new active subscription
    const { error: subError } = await supabase
      .from("subscriptions")
      .insert({
        user_id: user.id,
        status: "active",
        started_at: new Date().toISOString(),
        ends_at: endsAt.toISOString(),
        provider: "payfast",
        external_id: params.pf_payment_id || params.m_payment_id || null,
      });

    if (subError) {
      console.error("Subscription upsert error:", subError);
      return new Response("DB error", { status: 500 });
    }

    console.log(`✅ Activated premium for phone ${phone} until ${endsAt.toISOString()}`);
    return new Response("OK", { status: 200 });

  } catch (err) {
    console.error("ITN handler error:", err);
    return new Response("Server error", { status: 500 });
  }
});
