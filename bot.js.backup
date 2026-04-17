require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const { createClient } = require('@supabase/supabase-js');
const crypto = require("crypto");

const app = express();
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const PORT = process.env.PORT || 3001;
const USERS_FILE = "./users.json";
const CHALLENGES_FILE = "./challenges.json";
const REFERRALS_FILE = "./referrals.json";
const FAILED_LOOKUPS_FILE = "./failed-lookups.json";
const ADMIN_NUMBER = "27837787970"; // Brandon's number
const PRO_LAUNCH = true; // PayFast live

// Beta feature flags - only enabled for specific numbers
const BETA_FEATURES = {
  priceEstimates: new Set(["27837787970"]), // Brandon only
};
const PRO_PRICE = "36";
const GRANDFATHER_DATE = new Date("2026-03-19T23:59:59Z"); // Users who joined before this get free access forever
const TRIAL_DAYS = 7;
const PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID;
const PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY;
const ITN_URL = "https://fuddzrlnbrseofguuikp.supabase.co/functions/v1/payfast-itn";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FOOD_LOG_SHEET_ID = "1RIOOA4F425JPJXq5MiQ_qoqfh1NiEQAifT0zGYE0yfk";
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const APP_SECRET = process.env.APP_SECRET;

const requiredEnv = [
  "VERIFY_TOKEN",
  "PAYFAST_MERCHANT_ID",
  "PAYFAST_MERCHANT_KEY",
  "RESEND_API_KEY",
  "ADMIN_SECRET",
  // "APP_SECRET" — optional, enable when Meta app secret is configured
];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
  throw new Error(`Missing required env vars: ${missingEnv.join(", ")}`);
}

// Promo codes — { CODE: discountPercent } (use 100 for free/founder access)
// Promo codes — { CODE: discountPercent }
// At R36 base, EARLYBIRD no longer needed but kept for existing users
const PROMO_CODES = {
  SPRING: 10,
  LAUNCH: 20,
  FITFAM: 15,
  EARLYBIRD: 0,   // R36 is already the launch price
  FOUNDER: 100,
};

// Codes with signup-relative expiry (days from joinedAt)
const PROMO_EXPIRY_DAYS = {
  EARLYBIRD: 14,
};
const RETURN_URL = "https://fitsorted.co.za";
const CANCEL_URL = "https://fitsorted.co.za";

// Supabase client for SA foods database
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Supabase service client for subscription writes
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Check if a phone number has an active subscription
async function isPremium(phone) {
  try {
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("phone", phone)
      .single();
    if (!user) return false;

    const now = new Date().toISOString();
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("status, ends_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gte("ends_at", now)
      .single();

    return !!sub;
  } catch {
    return false;
  }
}

// Check if user is a grandfathered user (joined before GRANDFATHER_DATE)
function isGrandfathered(userObj) {
  if (!userObj.joinedAt) return false;
  return new Date(userObj.joinedAt) < GRANDFATHER_DATE;
}

// Check if user is within 7-day free trial (new users after GRANDFATHER_DATE)
function isInTrial(userObj) {
  // Grandfathered users are never "in trial" — they have permanent access
  if (userObj.joinedAt && new Date(userObj.joinedAt) < GRANDFATHER_DATE) return false;
  const trialStart = userObj.trialStartDate || userObj.joinedAt;
  if (!trialStart) return false;
  return (Date.now() - new Date(trialStart).getTime()) < TRIAL_DAYS * 86400000;
}

// Check if user has access (grandfathered OR trial OR referral free months OR paid)
async function hasAccess(phone, userObj) {
  // Grandfathered users always have access
  if (userObj.joinedAt && new Date(userObj.joinedAt) < GRANDFATHER_DATE) return true;
  if (userObj.isPro) return true;
  // Paid subscription
  if (userObj.isPremium || userObj.subscription) return true;
  // 7-day trial for new users
  if (isInTrial(userObj)) return true;
  // Check referral free months (each month = 30 days from end of trial)
  if (userObj.referralFreeMonths && userObj.referralFreeMonths > 0 && userObj.joinedAt) {
    const trialEnd = new Date(userObj.trialStartDate || userObj.joinedAt).getTime() + (TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const freeUntil = trialEnd + (userObj.referralFreeMonths * 30 * 24 * 60 * 60 * 1000);
    if (Date.now() < freeUntil) return true;
  }
  return await isPremium(phone);
}

// Get last food log date for a user (for smart send frequency) — returns Date or null
function getLastActivityDate(user) {
  const logs = user.log || {};
  const dates = Object.keys(logs).sort().reverse();
  for (const d of dates) {
    if (logs[d] && logs[d].length > 0) return new Date(d);
  }
  return user.lastActivity ? new Date(user.lastActivity) : null;
}

// Apply discount to a price
function applyDiscount(price, discountPct) {
  if (!discountPct) return price.toFixed(2);
  return (price * (1 - discountPct / 100)).toFixed(2);
}

// Generate PayFast monthly subscription link (pay immediately)
function getPayFastMonthlyLink(phone, discountPct = 0, firstName = "FitSorted", lastName = "User") {
  const monthly = parseFloat(applyDiscount(36, discountPct));
  const params = new URLSearchParams({
    merchant_id: PAYFAST_MERCHANT_ID,
    merchant_key: PAYFAST_MERCHANT_KEY,
    return_url: RETURN_URL,
    cancel_url: CANCEL_URL,
    notify_url: ITN_URL,
    name_first: firstName || "FitSorted",
    name_last: lastName || "User",
    m_payment_id: `fs_m_${phone}_${Date.now()}`,
    amount: monthly.toFixed(2),
    recurring_amount: monthly.toFixed(2),
    item_name: discountPct ? `FitSorted Premium Monthly (${discountPct}% off)` : "FitSorted Premium Monthly",
    subscription_type: "1",
    frequency: "3",
    cycles: "0",
    custom_str1: phone,
    custom_str2: "monthly",
  });
  return `https://www.payfast.co.za/eng/process?${params.toString()}`;
}

function getPayFastAnnualLink(phone, discountPct = 0, firstName = "FitSorted", lastName = "User") {
  const annual = parseFloat(applyDiscount(399, discountPct));
  const params = new URLSearchParams({
    merchant_id: PAYFAST_MERCHANT_ID,
    merchant_key: PAYFAST_MERCHANT_KEY,
    return_url: RETURN_URL,
    cancel_url: CANCEL_URL,
    notify_url: ITN_URL,
    name_first: firstName || "FitSorted",
    name_last: lastName || "User",
    m_payment_id: `fs_a_${phone}_${Date.now()}`,
    amount: annual.toFixed(2),
    recurring_amount: annual.toFixed(2),
    item_name: discountPct ? `FitSorted Premium Annual (50% off + ${discountPct}% promo)` : "FitSorted Premium Annual (50% off)",
    subscription_type: "1",
    frequency: "5",
    cycles: "0",
    custom_str1: phone,
    custom_str2: "annual",
  });
  return `https://www.payfast.co.za/eng/process?${params.toString()}`;
}

function getCleanPayLink(plan, phone, discountPct = 0, firstName = "FitSorted", lastName = "User") {
  const params = new URLSearchParams({
    plan,
    phone,
    discount: String(discountPct || 0),
    firstName,
    lastName,
  });
  return `https://fitsorted.co.za/pay?${params.toString()}`;
}

function getPayFastLink(phone) {
  return getPayFastMonthlyLink(phone);
}

// ── Referral helpers ──
function loadReferrals() {
  try { return JSON.parse(fs.readFileSync(REFERRALS_FILE, "utf8") || "{}"); }
  catch { return {}; }
}
function saveReferrals(r) { fs.writeFileSync(REFERRALS_FILE, JSON.stringify(r, null, 2)); }

function trackReferral(code, userPhone) {
  const refs = loadReferrals();
  const key = code.toUpperCase();
  if (!refs[key]) refs[key] = { signups: [], active: [] };
  if (!refs[key].signups.includes(userPhone)) {
    refs[key].signups.push(userPhone);
  }
  saveReferrals(refs);
}

function getReferralStats(code) {
  const refs = loadReferrals();
  const key = code.toUpperCase();
  return refs[key] || null;
}

// ── Influencer system ──
const INFLUENCERS_FILE = "./influencers.json";

function loadInfluencers() {
  try { return JSON.parse(fs.readFileSync(INFLUENCERS_FILE, "utf8") || "{}"); }
  catch { return {}; }
}
function saveInfluencers(data) { fs.writeFileSync(INFLUENCERS_FILE, JSON.stringify(data, null, 2)); }

function trackInfluencerSignup(code, newUserPhone) {
  const influencers = loadInfluencers();
  const key = code.toUpperCase();
  if (!influencers[key]) return false;
  if (!influencers[key].signups) influencers[key].signups = [];
  if (!influencers[key].signups.find(s => s.phone === newUserPhone)) {
    influencers[key].signups.push({
      phone: newUserPhone,
      date: new Date().toISOString(),
      paidOut: false
    });
    influencers[key].totalEarned = (influencers[key].totalEarned || 0) + 10;
    influencers[key].pendingPayout = (influencers[key].pendingPayout || 0) + 10;
    saveInfluencers(influencers);
  }
  return true;
}

function getInfluencerByCode(code) {
  const influencers = loadInfluencers();
  return influencers[code.toUpperCase()] || null;
}

function isInfluencerCode(code) {
  const influencers = loadInfluencers();
  return !!influencers[code.toUpperCase()];
}

// ── Email export (Resend) ──
async function sendFoodLogEmail(toEmail, userName, entries, date, macros, totalCal, goal, spendTotal, budget) {
  const dateStr = new Date(date).toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  const foodRows = entries.map((e, i) => {
    const macroStr = (e.protein || e.carbs || e.fat) 
      ? `<td style="padding:8px;border-bottom:1px solid #eee;color:#666;font-size:13px;">P:${e.protein || 0}g C:${e.carbs || 0}g F:${e.fat || 0}g Fibre:${e.fibre || 0}g</td>` 
      : `<td style="padding:8px;border-bottom:1px solid #eee;color:#999;font-size:13px;">-</td>`;
    const priceStr = e.priceZAR ? `~R${e.priceZAR}` : '-';
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${e.food}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${e.calories} cal</td>
      ${macroStr}
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${priceStr}</td>
    </tr>`;
  }).join('');

  const remaining = goal - totalCal;
  const statusEmoji = remaining > 0 ? '🟢' : '🔴';
  const statusText = remaining > 0 ? `${remaining} cal remaining` : `${Math.abs(remaining)} cal over`;
  
  const spendSection = spendTotal > 0 ? `
    <div style="background:#f0fdf4;padding:15px;border-radius:8px;margin:15px 0;">
      <strong>💰 Food spend today:</strong> R${spendTotal}${budget ? ` / R${budget} budget` : ''}
    </div>` : '';

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <div style="text-align:center;margin-bottom:20px;">
        <h1 style="color:#22c55e;margin:0;">🥗 FitSorted</h1>
        <p style="color:#666;margin:5px 0;">Your food log for ${dateStr}</p>
      </div>
      
      <div style="background:#f8fafc;padding:15px;border-radius:8px;margin:15px 0;text-align:center;">
        <span style="font-size:28px;font-weight:bold;">${totalCal}</span>
        <span style="color:#666;"> / ${goal} cal</span>
        <br/><span style="font-size:14px;">${statusEmoji} ${statusText}</span>
      </div>

      ${spendSection}
      
      <table style="width:100%;border-collapse:collapse;margin:15px 0;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:8px;text-align:left;">Food</th>
            <th style="padding:8px;text-align:center;">Calories</th>
            <th style="padding:8px;text-align:center;">Macros</th>
            <th style="padding:8px;text-align:center;">Cost</th>
          </tr>
        </thead>
        <tbody>${foodRows}</tbody>
      </table>
      
      ${macros.protein > 0 ? `
      <div style="background:#f8fafc;padding:15px;border-radius:8px;margin:15px 0;">
        <strong>Macros:</strong><br/>
        🥩 Protein: ${macros.protein}g | 🍞 Carbs: ${macros.carbs}g | 🥑 Fat: ${macros.fat}g
      </div>` : ''}
      
      <div style="text-align:center;margin-top:20px;padding-top:15px;border-top:1px solid #eee;">
        <p style="color:#999;font-size:12px;">Sent from FitSorted - Your SA Calorie Tracker<br/>
        <a href="https://fitsorted.co.za" style="color:#22c55e;">fitsorted.co.za</a></p>
      </div>
    </div>`;

  try {
    await axios.post('https://api.resend.com/emails', {
      from: 'FitSorted <hello@fitsorted.co.za>',
      to: [toEmail],
      subject: `Your food log - ${dateStr} (${totalCal} cal)`,
      html: html
    }, {
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}` },
      timeout: 10000
    });
    return true;
  } catch (err) {
    console.error('Email send error:', err.response?.data || err.message);
    return false;
  }
}

// Generate unique referral code from phone number
function generateReferralCode(phone) {
  // Simple hash: take last 6 digits + first 2 letters of base36 hash
  const hash = parseInt(phone.slice(-6)).toString(36).toUpperCase();
  return `FS${hash.slice(0, 6).padStart(6, '0')}`;
}

// Credit referral rewards (R10 off for both parties)
function creditReferralRewards(referrerPhone, newUserPhone, users) {
  const referrer = users[referrerPhone];
  const newUser = users[newUserPhone];
  
  if (referrer) {
    // Give referrer a free month (extend trial by 30 days or add 30 days credit)
    if (!referrer.referralFreeMonths) referrer.referralFreeMonths = 0;
    referrer.referralFreeMonths += 1;
    
    if (!referrer.referrals) referrer.referrals = [];
    referrer.referrals.push({
      phone: newUserPhone,
      date: new Date().toISOString(),
      reward: "free_month"
    });
  }
  
  if (newUser) {
    // Give new user a free month too
    if (!newUser.referralFreeMonths) newUser.referralFreeMonths = 0;
    newUser.referralFreeMonths += 1;
    newUser.referredBy = referrerPhone;
  }
  
  return true;
}

// ── User state ──
function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8") || "{}"); }
  catch { return {}; }
}
function saveUsers(u) { fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2)); }

// ── Challenge state ──
function loadChallenges() {
  try { return JSON.parse(fs.readFileSync(CHALLENGES_FILE, "utf8") || "{}"); }
  catch { return {}; }
}
function saveChallenges(c) { fs.writeFileSync(CHALLENGES_FILE, JSON.stringify(c, null, 2)); }

// ── Google Sheets Food Log Append ──
async function appendToFoodLogSheet(phone, userId, food, calories, protein, carbs, fat, fibre, source) {
  try {
    const { execFileSync } = require('child_process');
    const timestamp = new Date().toISOString();
    const rowValue = [
      timestamp,
      phone,
      userId,
      food,
      calories,
      protein || 0,
      carbs || 0,
      fat || 0,
      fibre || 0,
      source || 'unknown'
    ].join('|');
    
    // Use gog to append row (v0.12.0+ syntax - values as arguments)
    execFileSync('gog', [
      'sheets',
      'append',
      FOOD_LOG_SHEET_ID,
      'Sheet1!A:J',
      rowValue,
      '--account',
      'alphaxasset@gmail.com'
    ], {
      timeout: 5000,
      stdio: 'ignore' // Don't block on output
    });
  } catch (e) {
    console.error('[sheets append error]', e.message);
    // Silent fail - don't block user experience if Sheets API fails
  }
}

// ── Failed Lookups Tracking ──
function loadFailedLookups() {
  try { return JSON.parse(fs.readFileSync(FAILED_LOOKUPS_FILE, "utf8") || "{}"); }
  catch { return {}; }
}

function saveFailedLookups(data) {
  fs.writeFileSync(FAILED_LOOKUPS_FILE, JSON.stringify(data, null, 2));
}

function trackFailedLookup(foodText, phone) {
  const failed = loadFailedLookups();
  const key = foodText.toLowerCase().trim();
  if (!key) return;
  
  if (!failed[key]) {
    failed[key] = {
      text: foodText,
      count: 0,
      users: [],
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    };
  }
  
  failed[key].count++;
  failed[key].lastSeen = new Date().toISOString();
  
  if (!failed[key].users.includes(phone)) {
    failed[key].users.push(phone);
  }
  
  saveFailedLookups(failed);
  
  // Notify admin if this food has been requested 5+ times
  if (failed[key].count === 5) {
    send(ADMIN_NUMBER, `🚨 *Failed Lookup Alert*\n\n"${foodText}" has been requested 5 times by ${failed[key].users.length} users.\n\nConsider adding to database.`).catch(() => {});
  }
}

function getUser(users, phone) {
  if (!users[phone]) {
    const nowIso = new Date().toISOString();
    const isGrandfatheredNew = new Date(nowIso) < GRANDFATHER_DATE;
    users[phone] = {
      setup: false,
      step: null,
      profile: {},
      goal: null,
      log: {},
      joinedAt: nowIso,  // Track when they joined
      trialStartDate: isGrandfatheredNew ? undefined : nowIso,  // 7-day trial for new users
      isPro: false,
      proPrompted: false,
      lastStreakMilestone: 0
    };
  }
  if (!users[phone].log) users[phone].log = {};
  // Backfill joinedAt for existing users
  if (!users[phone].joinedAt) users[phone].joinedAt = new Date().toISOString();
  if (typeof users[phone].isPro !== 'boolean') users[phone].isPro = false;
  if (typeof users[phone].proPrompted !== 'boolean') users[phone].proPrompted = false;
  if (typeof users[phone].lastStreakMilestone !== 'number') users[phone].lastStreakMilestone = 0;
  return users[phone];
}

function getToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
}

function normalizeBuddyPhone(input) {
  const cleaned = (input || "").replace(/[^\d]/g, "");
  if (cleaned.startsWith("27") && cleaned.length === 11) return cleaned;
  return null;
}

function isAdminAuthorized(req) {
  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const queryKey = req.query.key;
  return queryKey === ADMIN_SECRET || bearerToken === ADMIN_SECRET;
}

function requireAdmin(req, res, next) {
  if (isAdminAuthorized(req)) return next();
  return res.sendStatus(401);
}

function isValidWebhookSignature(req) {
  const signature = req.get("X-Hub-Signature-256");
  if (!signature) return false;
  const [algo, hash] = signature.split("=");
  if (algo !== "sha256" || !hash) return false;
  const expected = crypto
    .createHmac("sha256", APP_SECRET)
    .update(req.rawBody || Buffer.from(""))
    .digest("hex");
  const signatureBuf = Buffer.from(hash, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (signatureBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(signatureBuf, expectedBuf);
}
function getYesterday() {
  const yesterday = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Johannesburg" }));
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
}

// Parse date prefix from message like "yesterday: chicken", "last night: pizza", "monday: eggs"
function parseDatePrefix(msg) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Johannesburg" }));

  // yesterday / last night - with colon OR natural phrasing ("last night I had...")
  let match = msg.match(/^(yesterday|last\s*night)\s*[:;,.\---]\s*/i);
  if (!match) match = msg.match(/^(yesterday|last\s*night)\s+(?:I\s+)?(?:also\s+)?(?:then\s+)?(?:had|ate|got|made|cooked|ordered|grabbed|picked up|went for)\s+/i);
  if (match) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    const food = msg.slice(match[0].length).trim();
    // For natural phrasing, the food is already extracted (after "I had" etc.)
    return { date: d.toLocaleDateString("en-CA"), food: food, label: "yesterday" };
  }

  // N days ago - with colon OR natural phrasing
  match = msg.match(/^(\d+)\s*days?\s*ago\s*[:;,.\---]\s*/i);
  if (!match) match = msg.match(/^(\d+)\s*days?\s*ago\s+(?:I\s+)?(?:also\s+)?(?:then\s+)?(?:had|ate|got|made|cooked|ordered|grabbed)\s+/i);
  if (match) {
    const n = parseInt(match[1]);
    if (n >= 1 && n <= 7) {
      const d = new Date(now);
      d.setDate(d.getDate() - n);
      return { date: d.toLocaleDateString("en-CA"), food: msg.slice(match[0].length).trim(), label: `${n} day${n > 1 ? 's' : ''} ago` };
    }
  }

  // day of week (monday, tuesday, etc.) - with colon OR natural phrasing
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  match = msg.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*[:;,.\---]\s*/i);
  if (!match) match = msg.match(/^(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:I\s+)?(?:also\s+)?(?:then\s+)?(?:had|ate|got|made|cooked|ordered|grabbed)\s+/i);
  if (match) {
    const targetDay = days.indexOf(match[1].toLowerCase());
    const currentDay = now.getDay();
    let diff = currentDay - targetDay;
    if (diff <= 0) diff += 7; // go back to last occurrence
    if (diff >= 1 && diff <= 7) {
      const d = new Date(now);
      d.setDate(d.getDate() - diff);
      return { date: d.toLocaleDateString("en-CA"), food: msg.slice(match[0].length).trim(), label: match[1].toLowerCase() };
    }
  }

  // this morning / earlier / earlier today - still today, no special handling needed
  match = msg.match(/^(this\s*morning|earlier(\s*today)?)\s*[:;,.\---]\s*/i);
  if (!match) match = msg.match(/^(this\s*morning|earlier(\s*today)?)\s+(?:I\s+)?(?:had|ate|got|made|cooked|ordered|grabbed)\s+/i);
  if (match) {
    return { date: now.toLocaleDateString("en-CA"), food: msg.slice(match[0].length).trim(), label: null };
  }

  return null; // no date prefix found
}
function getTodayEntries(user) { return user.log[getToday()] || []; }
function getTodayTotal(user) { return getTodayEntries(user).reduce((s, e) => s + e.calories, 0); }
function getYesterdayEntries(user) { return user.log[getYesterday()] || []; }
function getYesterdayTotal(user) { return getYesterdayEntries(user).reduce((s, e) => s + e.calories, 0); }
function getTodayBurned(user) { return (user.exercise || {})[getToday()] || []; }
function getTodayBurnedTotal(user) { return getTodayBurned(user).reduce((s, e) => s + e.calories, 0); }
function getEffectiveGoal(user) { return user.goal + getTodayBurnedTotal(user); }

// Macro totals
function getTodayMacros(user) {
  const entries = getTodayEntries(user);
  return {
    protein: entries.reduce((sum, e) => sum + (e.protein || 0), 0),
    carbs: entries.reduce((sum, e) => sum + (e.carbs || 0), 0),
    fat: entries.reduce((sum, e) => sum + (e.fat || 0), 0),
    fibre: entries.reduce((sum, e) => sum + (e.fibre || 0), 0)
  };
}

// ── Weekly Stats ─────────────────────────────
function getLastNDates(n) {
  const dates = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Johannesburg" }));
    d.setDate(d.getDate() - i);
    dates.push(d.toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }));
  }
  return dates;
}

function getCurrentStreak(user) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Johannesburg" }));
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
    if ((user.log[dateStr] || []).length > 0) streak++;
    else break;
  }
  return streak;
}

function getWeekDatesMonSun() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Johannesburg" }));
  const day = now.getDay(); // 0=Sun, 1=Mon
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }));
  }
  return dates;
}

function countUnderGoalDaysThisWeek(user) {
  const dates = getWeekDatesMonSun();
  let count = 0;
  for (const date of dates) {
    const entries = user.log[date] || [];
    if (!entries.length) continue;
    const total = entries.reduce((s, e) => s + e.calories, 0);
    if (total <= user.goal) count++;
  }
  return count;
}

// ── Challenge helpers ──
function generateChallengeCode(challenges) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < 1000; i++) {
    let code = "FIT-";
    for (let j = 0; j < 3; j++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!challenges[code]) return code;
  }
  return `FIT-${Math.random().toString(36).toUpperCase().slice(2, 5)}`;
}

function getMemberFirstName(users, phone) {
  const name = users[phone]?.name;
  if (!name) return phone;
  return name.split(" ")[0];
}

function parseDateStr(dateStr) {
  return new Date(dateStr + "T00:00:00Z");
}

function addDaysToDateStr(dateStr, days) {
  const d = parseDateStr(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function daysBetweenDates(startDateStr, endDateStr) {
  return Math.floor((parseDateStr(endDateStr) - parseDateStr(startDateStr)) / 86400000);
}

function compareDateStr(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function getChallengeStartDateStr(challenge) {
  if (!challenge.startedAt) return null;
  return new Date(challenge.startedAt).toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
}

function getChallengeEndDateStr(challenge) {
  if (!challenge.startedAt) return null;
  const startDate = getChallengeStartDateStr(challenge);
  return addDaysToDateStr(startDate, (challenge.duration || 30) - 1);
}

function getDateRange(startDateStr, endDateStr) {
  const dates = [];
  if (!startDateStr || !endDateStr) return dates;
  let d = parseDateStr(startDateStr);
  const end = parseDateStr(endDateStr);
  while (d <= end) {
    dates.push(d.toISOString().split("T")[0]);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

function formatChallengePoints(points) {
  const fixed = points.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

function calculateChallengeScoreForRange(user, startDateStr, endDateStr) {
  const dates = getDateRange(startDateStr, endDateStr);
  let points = 0;
  let streak = 0;
  let underGoalDays = 0;
  for (const date of dates) {
    const entries = user.log[date] || [];
    if (entries.length > 0) {
      const total = entries.reduce((s, e) => s + e.calories, 0);
      if (total <= user.goal) {
        points += 1;
        underGoalDays++;
      }
      if (entries.length >= 3) points += 0.5;
      streak++;
      if (streak % 7 === 0) points += 1;
    } else {
      streak = 0;
    }
  }
  return { points, underGoalDays };
}

function getChallengeScoresForRange(challenge, users, startDateStr, endDateStr) {
  const scores = [];
  for (const phone of (challenge.members || [])) {
    const u = users[phone];
    if (!u || !u.goal) continue;
    const score = calculateChallengeScoreForRange(u, startDateStr, endDateStr);
    scores.push({
      phone,
      name: getMemberFirstName(users, phone),
      points: score.points,
      underGoalDays: score.underGoalDays
    });
  }
  scores.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  return scores;
}

function buildChallengeLeaderboardMessage(challenge, users, viewerPhone) {
  if (!challenge.startedAt) {
    const members = (challenge.members || []).map(p => getMemberFirstName(users, p)).join(", ");
    return `🏆 *${challenge.name}* hasn't started yet.\n\nMembers: ${members || "None yet"}\n\nStart with: *challenge start*`;
  }
  const today = getToday();
  const startDateStr = getChallengeStartDateStr(challenge);
  const endDateStr = getChallengeEndDateStr(challenge);
  const effectiveEnd = compareDateStr(today, endDateStr) > 0 ? endDateStr : today;
  const dayNumber = Math.min(challenge.duration || 30, daysBetweenDates(startDateStr, effectiveEnd) + 1);
  const scores = getChallengeScoresForRange(challenge, users, startDateStr, effectiveEnd);
  const lines = scores.map((s, i) => {
    const rank = i + 1;
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "";
    const name = s.phone === viewerPhone ? "You" : s.name;
    return `${rank}. ${name} — ${formatChallengePoints(s.points)} pts${medal ? " " + medal : ""}`;
  });
  let displayLines = lines;
  if (lines.length > 5) displayLines = lines.slice(0, 5);
  if (scores.length > 5) {
    const viewerIndex = scores.findIndex(s => s.phone === viewerPhone);
    if (viewerIndex >= 5) {
      const viewer = scores[viewerIndex];
      displayLines.push(`${viewerIndex + 1}. You — ${formatChallengePoints(viewer.points)} pts`);
    }
  }
  return `🏆 *${challenge.name} — Day ${dayNumber}/${challenge.duration || 30}*\n${displayLines.join("\n")}`;
}

function buildWeeklyChallengeRecap(challenge, users, viewerPhone) {
  if (!challenge.startedAt) return "";
  const today = getToday();
  const startDateStr = getChallengeStartDateStr(challenge);
  const endDateStr = getChallengeEndDateStr(challenge);
  const effectiveEnd = compareDateStr(today, endDateStr) > 0 ? endDateStr : today;
  const dayNumber = Math.min(challenge.duration || 30, daysBetweenDates(startDateStr, effectiveEnd) + 1);
  const totalWeeks = Math.max(1, Math.round((challenge.duration || 30) / 7));
  const weekNumber = Math.min(totalWeeks, Math.ceil(dayNumber / 7));
  const last7 = getLastNDates(7).filter(d => compareDateStr(d, startDateStr) >= 0 && compareDateStr(d, effectiveEnd) <= 0);
  const weekStart = last7[0] || startDateStr;
  const weekEnd = last7[last7.length - 1] || effectiveEnd;
  const scores = getChallengeScoresForRange(challenge, users, startDateStr, effectiveEnd);
  const weeklyPoints = {};
  for (const phone of (challenge.members || [])) {
    const u = users[phone];
    if (!u || !u.goal) continue;
    weeklyPoints[phone] = calculateChallengeScoreForRange(u, weekStart, weekEnd).points;
  }
  const top = scores.slice(0, 5);
  if (top.length === 0) return "";
  let bestWeeklyPhone = null;
  let bestWeekly = -Infinity;
  for (const phone of Object.keys(weeklyPoints)) {
    if (weeklyPoints[phone] > bestWeekly) {
      bestWeekly = weeklyPoints[phone];
      bestWeeklyPhone = phone;
    }
  }
  const lines = top.map((s, i) => {
    const rank = i + 1;
    const name = s.phone === viewerPhone ? "You" : s.name;
    const weekly = weeklyPoints[s.phone] || 0;
    const suffix = rank === 1 ? " 🔥" : (bestWeeklyPhone === s.phone ? " 📈" : "");
    return `${rank}. ${name} — ${formatChallengePoints(s.points)} pts (+${formatChallengePoints(weekly)} this week)${suffix}`;
  });
  const leaderPhone = scores[0]?.phone;
  const leaderName = leaderPhone === viewerPhone ? "You" : (scores[0]?.name || "Someone");
  const comment = leaderPhone === viewerPhone
    ? `💬 You're leading! Keep the momentum.`
    : `💬 ${leaderName} is pulling ahead! Time to step it up.`;
  return `🏆 *Weekly Standings — ${challenge.name}*\nWeek ${weekNumber} of ${totalWeeks}\n\n${lines.join("\n")}\n\n${comment}`;
}

function buildFinalChallengeResultsMessage(challenge, users) {
  const startDateStr = getChallengeStartDateStr(challenge);
  const endDateStr = getChallengeEndDateStr(challenge);
  if (!startDateStr || !endDateStr) return "";
  const scores = getChallengeScoresForRange(challenge, users, startDateStr, endDateStr);
  if (scores.length === 0) return "";
  const top = scores.slice(0, 3);
  const medals = ["🥇", "🥈", "🥉"];
  const lines = top.map((s, i) => {
    const medal = medals[i];
    if (i === 0) {
      const winnerUser = users[s.phone];
      const underGoal = winnerUser ? calculateChallengeScoreForRange(winnerUser, startDateStr, endDateStr).underGoalDays : 0;
      return `${medal} ${s.name} — ${formatChallengePoints(s.points)} pts (${underGoal}/${challenge.duration || 30} days under goal!)`;
    }
    return `${medal} ${s.name} — ${formatChallengePoints(s.points)} pts`;
  });
  return `🏆 *${challenge.name} — COMPLETE!*\n\n${lines.join("\n")}\n\nWhat a month! Create a new challenge: *challenge create [name]*`;
}

function buildWeeklyStats(user) {
  const dates = getLastNDates(7);
  const goal = user.goal || 2000;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  let totalCal = 0, loggedDays = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;
  let totalUnits = 0, totalAlcoholCal = 0, totalDeficit = 0;
  let bestDay = null, bestCal = Infinity;
  const rows = [];

  for (const date of dates) {
    const entries = user.log[date] || [];
    const dayLabel = dayNames[new Date(date + "T12:00:00").getDay()];
    const cal = entries.reduce((s, e) => s + e.calories, 0);
    const exercise = (user.exercise || {})[date] || [];
    const burned = exercise.reduce((s, e) => s + e.calories, 0);
    const effectiveGoal = goal + burned;
    const alcohol = entries.filter(e => e.isAlcohol);
    const dayUnits = alcohol.reduce((s, e) => s + (e.units || 0), 0);
    const dayAlcoholCal = alcohol.reduce((s, e) => s + e.calories, 0);

    if (entries.length > 0) {
      loggedDays++;
      totalCal += cal;
      totalProtein += entries.reduce((s, e) => s + (e.protein || 0), 0);
      totalCarbs += entries.reduce((s, e) => s + (e.carbs || 0), 0);
      totalFat += entries.reduce((s, e) => s + (e.fat || 0), 0);
      totalUnits += dayUnits;
      totalAlcoholCal += dayAlcoholCal;
      const deficit = effectiveGoal - cal;
      totalDeficit += deficit;
      if (Math.abs(cal - goal) < Math.abs((bestCal || 0) - goal)) {
        bestDay = dayLabel;
        bestCal = cal;
      }
    }

    // Build row
    let icon = entries.length === 0 ? "⬜" : cal <= effectiveGoal ? "✅" : "⚠️";
    const calStr = entries.length === 0 ? "—" : `${cal.toLocaleString()} cal`;
    const burnStr = burned > 0 ? ` (+${burned} burned)` : "";
    rows.push(`${dayLabel}  ${icon}  ${calStr}${burnStr}`);
  }

  const avgCal = loggedDays > 0 ? Math.round(totalCal / loggedDays) : 0;
  const avgProtein = loggedDays > 0 ? Math.round(totalProtein / loggedDays) : 0;
  const streakDates = [...dates].reverse();
  let streak = 0;
  for (const d of streakDates) {
    if ((user.log[d] || []).length > 0) streak++;
    else break;
  }

  // Top foods
  const foodCount = {};
  for (const date of dates) {
    for (const e of (user.log[date] || [])) {
      if (!e.isAlcohol) foodCount[e.food] = (foodCount[e.food] || 0) + 1;
    }
  }
  const topFoods = Object.entries(foodCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f]) => f);

  let msg = `📊 *Your Week (${dates[0].slice(5)} → ${dates[6].slice(5)})*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += rows.join("\n");
  msg += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg += `🔥 *${streak} day streak* | ${loggedDays}/7 days logged\n`;
  msg += `🍽️ *Avg daily:* ${avgCal.toLocaleString()} cal (goal: ${goal.toLocaleString()})\n`;
  if (avgProtein > 0) msg += `🥩 *Avg protein:* ${avgProtein}g/day\n`;

  if (totalDeficit !== 0 && loggedDays > 0) {
    const direction = totalDeficit > 0 ? "deficit" : "surplus";
    msg += `📉 *Weekly ${direction}:* ${Math.abs(Math.round(totalDeficit)).toLocaleString()} cal`;
    if (user.profile?.target === "lose") {
      const kgLost = (Math.abs(totalDeficit) / 7700).toFixed(2);
      msg += ` (~${kgLost}kg)`;
    }
    msg += `\n`;
  }

  if (totalUnits > 0) {
    msg += `🍺 *Liquid cals:* ${totalAlcoholCal} cal | ${totalUnits.toFixed(1)} units\n`;
  }

  if (topFoods.length > 0) {
    msg += `\n🍴 *Most logged:* ${topFoods.join(", ")}\n`;
  }

  if (bestDay && loggedDays > 1) {
    msg += `🏆 *Best day:* ${bestDay} (${bestCal.toLocaleString()} cal)\n`;
  }

  // Weight trend
  if (user.weights && user.weights.length >= 2) {
    const recent = user.weights.slice(-2);
    const diff = (recent[1].kg - recent[0].kg).toFixed(1);
    const arrow = diff > 0 ? "📈" : diff < 0 ? "📉" : "➡️";
    msg += `${arrow} *Weight:* ${recent[1].kg}kg (${diff > 0 ? "+" : ""}${diff}kg)\n`;
  }

  msg += `\nType *log* for today's summary or *help* for all commands.`;
  return msg;
}

// Calculate macro targets based on user profile
function getMacroTargets(user) {
  const { weight, target } = user.profile || {};
  if (!weight) return null;

  // g/kg bodyweight approach
  let proteinPerKg, fatPerKg;

  if (target === "lose") {
    proteinPerKg = 2.0;  // Higher protein to preserve muscle
    fatPerKg = 0.8;
  } else if (target === "gain") {
    proteinPerKg = 1.8;
    fatPerKg = 1.0;
  } else {
    proteinPerKg = 1.6;
    fatPerKg = 0.9;
  }

  const proteinTarget = Math.round(weight * proteinPerKg);
  const fatTarget = Math.round(weight * fatPerKg);

  // Calculate carbs from remaining calories
  const goal = user.goal || 2000;
  const proteinCals = proteinTarget * 4;
  const fatCals = fatTarget * 9;
  const remainingCals = goal - proteinCals - fatCals;
  const carbTarget = Math.round(Math.max(0, remainingCals / 4));

  // Fibre targets: Men 30-38g (use 30), Women 21-25g (use 25)
  const gender = (user.profile?.gender || '').toLowerCase();
  const fibreTarget = (gender === 'female' || gender === 'f') ? 25 : 30;

  return { protein: proteinTarget, carbs: carbTarget, fat: fatTarget, fibre: fibreTarget };
}

// Calculate weight projection assuming perfect calorie adherence
function calculateWeightProjection(user) {
  if (!user.goal || !user.profile || !user.joinedAt) return null;
  
  // Use logged weight if available, otherwise use signup profile weight
  const startWeight = user.weights && user.weights.length > 0 
    ? user.weights[0].kg 
    : user.profile.weight;
  
  if (!startWeight) return null;
  
  const startDate = new Date(user.joinedAt);
  
  // Current weight: latest logged weight or profile weight
  const currentWeight = user.weights && user.weights.length > 0
    ? user.weights[user.weights.length - 1].kg
    : user.profile.weight;
  
  // Calculate days since signup
  const daysSinceStart = Math.floor((Date.now() - startDate.getTime()) / 86400000);
  if (daysSinceStart < 1) return null;
  
  // Calculate TDEE (maintenance calories)
  const { gender, weight, height, age, activity } = user.profile;
  if (!gender || !weight || !height || !age || !activity) return null;
  
  let bmr;
  if (gender === "male") {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  }
  
  const multipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    veryActive: 1.9
  };
  
  const tdee = bmr * (multipliers[activity] || 1.2);
  
  // Daily deficit if they hit their goal every day
  const dailyDeficit = tdee - user.goal;
  
  // Total deficit over all days
  const totalDeficit = dailyDeficit * daysSinceStart;
  
  // Convert to kg (7700 cal = 1kg)
  const expectedWeightLoss = totalDeficit / 7700;
  const projectedWeight = startWeight - expectedWeightLoss;
  
  return {
    projected: Math.round(projectedWeight * 10) / 10,
    current: currentWeight,
    expectedLoss: Math.round(expectedWeightLoss * 10) / 10,
    daysSinceStart,
    startWeight
  };
}

// ── TDEE / calorie goal calculator ──
// Mifflin-St Jeor BMR → × activity multiplier → adjust for goal
function calculateGoal(profile) {
  const { gender, weight, height, age, activity, target, pace } = profile;

  // BMR
  let bmr;
  if (gender === "male") {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  }

  const multipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
  };

  const tdee = Math.round(bmr * (multipliers[activity] || 1.375));

  // Pace-based adjustments
  const adjustments = {
    lose: {
      aggressive: -750,  // 0.75kg/week loss
      standard: -500,    // 0.5kg/week loss
      chill: -250,       // 0.25kg/week loss
    },
    maintain: {
      standard: 0,
    },
    gain: {
      aggressive: +500,  // faster muscle gain (higher fat gain risk)
      standard: +300,    // lean bulk
      chill: +200,       // very lean bulk
    },
  };

  const adjustment = adjustments[target]?.[pace || 'standard'] || 0;
  const goal = tdee + adjustment;

  return { bmr: Math.round(bmr), tdee, goal, pace };
}

// ── Workout detection ──
const WORKOUT_KEYWORDS = ["run", "ran", "walk", "walked", "gym", "weights", "cycling", "bike", "swim", "hiit", "cardio", "workout", "training", "min ", "minutes", "km", "steps", "pushups", "pull-ups", "pull ups", "squats", "jog", "jogged", "skipped", "rope", "crossfit", "yoga", "pilates", "stretch", "hike", "hiking", "spinning", "spin class", "tennis", "padel", "football", "soccer", "rugby", "basketball", "cricket", "surfing", "dancing", "burpees", "plank", "treadmill", "deadlift", "bench press", "leg day", "upper body", "full body", "wod", "climbed stairs", "gardening", "cleaning"];

function isWorkout(text) {
  return WORKOUT_KEYWORDS.some(k => text.toLowerCase().includes(k));
}

// Retry wrapper for OpenAI API calls with exponential backoff
async function retryOpenAI(fn, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err.response?.status;
      if (status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(err.response?.headers?.['retry-after'] || '0');
        const delayMs = retryAfter ? retryAfter * 1000 : Math.min(1000 * Math.pow(2, attempt), 8000);
        console.log(`[retry] OpenAI 429 - attempt ${attempt + 1}/${maxRetries}, waiting ${delayMs}ms`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      if (status === 500 || status === 502 || status === 503) {
        if (attempt < maxRetries) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000);
          console.log(`[retry] OpenAI ${status} - attempt ${attempt + 1}/${maxRetries}, waiting ${delayMs}ms`);
          await new Promise(r => setTimeout(r, delayMs));
          continue;
        }
      }
      throw err;
    }
  }
}

async function estimateCaloriesBurned(activity) {
  const lower = activity.toLowerCase().trim();

  // Workout overrides for common items AI gets wrong
  const workoutOverrides = {
    "gym 1 hour": { activity: "Gym Session (1 hour)", calories: 300 },
    "gym": { activity: "Gym Session", calories: 300 },
    "gym session": { activity: "Gym Session", calories: 300 },
    "gym 45 min": { activity: "Gym Session (45 min)", calories: 225 },
    "gym 30 min": { activity: "Gym Session (30 min)", calories: 150 },
    "cricket 2 hours": { activity: "Cricket (2 hours)", calories: 350 },
    "cricket 1 hour": { activity: "Cricket (1 hour)", calories: 175 },
    "cricket": { activity: "Cricket (1 hour)", calories: 175 },
    "walked to the shop": { activity: "Short Walk", calories: 60 },
    "walked to the store": { activity: "Short Walk", calories: 60 },
    "walked to work": { activity: "Walk to Work", calories: 120 },
    "quick walk": { activity: "Quick Walk (15 min)", calories: 60 },
  };
  if (workoutOverrides[lower]) return workoutOverrides[lower];

  if (!OPENAI_API_KEY) {
    // Simple fallback
    if (lower.includes("run") || lower.includes("jog")) return { activity, calories: 300 };
    if (lower.includes("walk")) return { activity, calories: 150 };
    if (lower.includes("gym") || lower.includes("weights")) return { activity, calories: 250 };
    if (lower.includes("hiit") || lower.includes("cardio")) return { activity, calories: 350 };
    return { activity, calories: 200 };
  }

  const res = await retryOpenAI(() => axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a fitness assistant. Given a workout description, return ONLY a JSON object: {\"activity\": \"clean name\", \"calories\": integer} for estimated calories burned. Assume average person (75kg). IMPORTANT: Weight training burns ~200-350 cal/hour (not cardio-level). Walking short distances (to shop/store) burns 40-80 cal. Cricket is low-intensity (~175 cal/hour for fielding). Pull-ups burn ~0.5 cal each. Don't overestimate strength training or low-intensity activities. No extra text." },
        { role: "user", content: `Calories burned for: ${activity}` }
      ],
      temperature: 0.2
    },
    { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" } }
  ));
  const content = res.data.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
  return JSON.parse(content);
}

// ── Calorie lookup from Supabase SA Foods database (414 items) ──
async function lookupSAFood(food) {
  if (!food) return null;
  const lower = food.toLowerCase();

  try {
    // Query Supabase for matching foods
    // Sanitize input: remove ALL chars that break PostgreSQL array literals or .or() queries
    // This fixes "malformed array literal" errors from quotes, parens, braces, etc.
    const sanitized = lower
      .replace(/[,(){}%"'\\]/g, ' ')  // remove array-breaking chars + quotes
      .replace(/\s+/g, ' ')
      .trim();
    if (sanitized.length < 2) return null; // too short to search
    
    // Use only ilike for safety — .cs (array contains) breaks with complex inputs
    // Search name with ilike, then filter name_alt in JS
    const { data, error } = await supabase
      .from('foods')
      .select('*')
      .ilike('name', `%${sanitized}%`);

    if (error) {
      console.error('Supabase lookup error:', error.message);
      return null;
    }

    // If name ilike found nothing, try a broader text search on name_alt
    let results = data || [];
    if (results.length === 0) {
      try {
        // Search name_alt using textSearch or a simpler ilike on cast
        // Split sanitized into keywords and search each
        const keywords = sanitized.split(' ').filter(w => w.length >= 3);
        if (keywords.length > 0) {
          const { data: altData, error: altError } = await supabase
            .from('foods')
            .select('*')
            .ilike('name', `%${keywords[0]}%`);
          if (!altError && altData) results = altData;
        }
      } catch (e) { /* fallback failed, continue with empty */ }
    }

    if (results.length === 0) return null;

    // Find best match by checking name_alt keywords
    for (const item of results) {
      const nameMatch = item.name.toLowerCase().includes(lower);
      const altMatch = item.name_alt?.some(alt =>
        lower.includes(alt.toLowerCase()) || alt.toLowerCase().includes(lower)
      );

      if (nameMatch || altMatch) {
        return {
          food: `${item.name}${item.serving ? ` (${item.serving})` : ''}`,
          calories: item.calories,
          protein: item.protein || 0,
          carbs: item.carbs || 0,
          fat: item.fat || 0,
          fibre: item.fibre || 0
        };
      }
    }

    return null;
  } catch (err) {
    console.error('SA food lookup failed:', err.message);
    return null;
  }
}

// ── Custom food database (per user) ──
function lookupCustomFood(user, food) {
  if (!user.customFoods || !food) return null;
  const lower = food.toLowerCase().trim();
  for (const [name, calories] of Object.entries(user.customFoods)) {
    if (lower.includes(name.toLowerCase()) || name.toLowerCase().includes(lower)) {
      return { food: name, calories };
    }
  }
  return null;
}

// ── Coaching mode - detects questions and gives personalised advice ──
const QUESTION_PATTERNS = [
  /^(what|how|can i|should i|suggest|recommend|give me|tell me|help me|what's|whats|am i|will i|is it)/i,
  /\?$/,
  /(under|below|less than|around|about)\s+\d+\s*cal/i,
  /(on track|doing well|going well|hit my goal|reach my goal)/i,
  /(meal idea|food idea|what to eat|what can i eat|what should i eat|what.*eat)/i,
  /(high protein|low carb|healthy option|light meal|quick meal)/i,
];

function isQuestion(msg) {
  return QUESTION_PATTERNS.some(p => p.test(msg));
}

async function coachResponse(msg, user) {
  const today = getToday();
  const entries = getTodayEntries(user);
  const total = getTodayTotal(user);
  const burned = getTodayBurnedTotal(user);
  const effectiveGoal = getEffectiveGoal(user);
  const remaining = effectiveGoal - total;
  const { gender, weight, height, age, target } = user.profile || {};

  // Build food history from last 7 days
  const allDays = Object.entries(user.log || {})
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 7);
  const foodFreq = {};
  for (const [, dayEntries] of allDays) {
    for (const e of dayEntries) {
      const key = e.food.toLowerCase();
      if (!foodFreq[key]) foodFreq[key] = { food: e.food, calories: e.calories, count: 0 };
      foodFreq[key].count++;
    }
  }
  const topFoods = Object.values(foodFreq)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map(f => `${f.food} (${f.calories} cal, eaten ${f.count}x this week)`);

  // Custom saved foods
  const customFoodList = user.customFoods
    ? Object.entries(user.customFoods).slice(0, 5).map(([n, c]) => `${n} (${c} cal)`)
    : [];

  const context = `
User profile:
- Goal: ${user.goal} cal/day (effective today: ${effectiveGoal} cal with exercise)
- Objective: ${target === "lose" ? "lose weight (-500 cal deficit)" : target === "gain" ? "build muscle (+300 cal)" : "maintain weight"}
- Gender: ${gender || "unknown"}, Weight: ${weight || "?"}kg, Height: ${height || "?"}cm, Age: ${age || "?"}

Today's intake:
- Eaten: ${total} cal
- Burned via exercise: ${burned} cal
- Remaining budget: ${remaining} cal
- Logged foods today: ${entries.length > 0 ? entries.map(e => `${e.food} (${e.calories} cal)`).join(", ") : "nothing yet"}

Foods they regularly eat (prioritise these in suggestions):
${topFoods.length > 0 ? topFoods.join("\n") : "No history yet"}

Their saved custom foods:
${customFoodList.length > 0 ? customFoodList.join(", ") : "None saved yet"}
`;

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are FitSorted, a friendly SA-flavoured nutrition coach on WhatsApp. Keep replies SHORT (max 5 lines), warm, and practical. Use simple language. Format nicely for WhatsApp (bold with *asterisks*, line breaks). Don't use markdown headers. Give specific, actionable advice. If suggesting meals, give 2-3 real SA-friendly examples with calorie estimates. Never be preachy.`
        },
        { role: "user", content: `${context}\n\nUser asks: ${msg}` }
      ],
      temperature: 0.7,
      max_tokens: 300
    },
    { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" } }
  );

  return res.data.choices[0].message.content.trim();
}

async function estimateCalories(food, user) {
  const aiDebugLog = `/Users/brandonkatz/.openclaw/workspace/fitsorted/debug-ai.log`;
  fs.appendFileSync(aiDebugLog, `\n[${new Date().toISOString()}] estimateCalories() CALLED with food="${food}"\n`);

  if (!food || typeof food !== 'string') {
    throw new Error("Invalid food input");
  }
  
  // 0. Input validation: reject very short or nonsensical inputs
  const lower = food.toLowerCase().trim();
  if (food.trim().length === 1 || (food.trim().length === 2 && !/\d/.test(food))) {
    // Single char or 2-char with no numbers - probably typo/nonsense
    throw new Error("Input too short or unclear");
  }
  
  // 1. Special case: zero-calorie drinks (catch FIRST before any DB lookups)
  if (lower === "water" || lower === "h2o" || lower === "ice" || 
      lower.includes("sparkling") || lower.includes("soda water") || 
      lower.includes("mineral water") || lower.includes("ice water")) {
    return { food: "Water", calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
  }

  // 1b. Sugar-free / zero-cal energy drinks & sodas (AI often gets these wrong)
  const zeroDrinks = {
    "white monster": { food: "White Monster Ultra Zero 500ml", calories: 10, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "monster zero": { food: "Monster Zero Sugar 500ml", calories: 10, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "monster ultra": { food: "Monster Ultra Zero 500ml", calories: 10, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "monster ultra zero": { food: "Monster Ultra Zero 500ml", calories: 10, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "sugar free red bull": { food: "Red Bull Sugar Free 250ml", calories: 5, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "red bull zero": { food: "Red Bull Zero 250ml", calories: 5, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "coke zero": { food: "Coke Zero 330ml", calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "diet coke": { food: "Diet Coke 330ml", calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "pepsi max": { food: "Pepsi Max 330ml", calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "sprite zero": { food: "Sprite Zero 330ml", calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "fanta zero": { food: "Fanta Zero Orange 330ml", calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "stoney zero": { food: "Stoney Zero 330ml", calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
  };
  // Match exact or partial (e.g. "coke zero" matches "coke zero 500ml" input)
  const zeroDrinkKey = Object.keys(zeroDrinks).find(k => lower === k || lower.includes(k) || k.includes(lower.replace(/\s+/g, ' ')));
  if (zeroDrinkKey) return zeroDrinks[zeroDrinkKey];

  // 1c. Common items AI consistently gets wrong (SA portions)
  const overrides = {
    "monster energy": { food: "Monster Energy 500ml", calories: 230, protein: 0, carbs: 56, fat: 0, fibre: 0 },
    "monster": { food: "Monster Energy 500ml", calories: 230, protein: 0, carbs: 56, fat: 0, fibre: 0 },
    "red bull": { food: "Red Bull 250ml", calories: 112, protein: 0, carbs: 27, fat: 0, fibre: 0 },
    "beer": { food: "Beer (440ml)", calories: 155, protein: 1, carbs: 12, fat: 0, fibre: 0 },
    "a beer": { food: "Beer (440ml)", calories: 155, protein: 1, carbs: 12, fat: 0, fibre: 0 },
    "castle lager": { food: "Castle Lager 440ml", calories: 155, protein: 1, carbs: 12, fat: 0, fibre: 0 },
    "black label": { food: "Carling Black Label 440ml", calories: 175, protein: 1, carbs: 15, fat: 0, fibre: 0 },
    "windhoek": { food: "Windhoek Lager 440ml", calories: 160, protein: 1, carbs: 13, fat: 0, fibre: 0 },
    "savanna": { food: "Savanna Dry 330ml", calories: 170, protein: 0, carbs: 18, fat: 0, fibre: 0 },
    "savanna dry": { food: "Savanna Dry 330ml", calories: 170, protein: 0, carbs: 18, fat: 0, fibre: 0 },
    "hunters gold": { food: "Hunter's Gold 330ml", calories: 180, protein: 0, carbs: 20, fat: 0, fibre: 0 },
    "1 slice of cheese": { food: "1 slice cheese (SA processed)", calories: 60, protein: 4, carbs: 1, fat: 5, fibre: 0 },
    "slice of cheese": { food: "1 slice cheese (SA processed)", calories: 60, protein: 4, carbs: 1, fat: 5, fibre: 0 },
    "handful of almonds": { food: "Handful of almonds (~28g)", calories: 160, protein: 6, carbs: 6, fat: 14, fibre: 3 },
    "handful almonds": { food: "Handful of almonds (~28g)", calories: 160, protein: 6, carbs: 6, fat: 14, fibre: 3 },
    // SA classics AI gets wrong
    "koeksister": { food: "Koeksister", calories: 250, protein: 3, carbs: 38, fat: 10, fibre: 1 },
    "rusks": { food: "Ouma Rusk (1)", calories: 140, protein: 3, carbs: 22, fat: 5, fibre: 1 },
    "rusk": { food: "Ouma Rusk (1)", calories: 140, protein: 3, carbs: 22, fat: 5, fibre: 1 },
    "ouma rusk": { food: "Ouma Rusk (1)", calories: 140, protein: 3, carbs: 22, fat: 5, fibre: 1 },
    "samp and beans": { food: "Samp & Beans (serving)", calories: 320, protein: 12, carbs: 55, fat: 4, fibre: 8 },
    // Drinks AI underestimates
    "brandy and coke": { food: "Brandy & Coke", calories: 210, protein: 0, carbs: 22, fat: 0, fibre: 0 },
    "double brandy and coke": { food: "Double Brandy & Coke", calories: 420, protein: 0, carbs: 22, fat: 0, fibre: 0 },
    "whisky neat": { food: "Whisky (single, neat)", calories: 70, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "whiskey neat": { food: "Whisky (single, neat)", calories: 70, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "whisky": { food: "Whisky (single)", calories: 70, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "whiskey": { food: "Whisky (single)", calories: 70, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    // Foods AI underestimates
    "cottage cheese": { food: "Cottage Cheese (100g)", calories: 98, protein: 11, carbs: 3, fat: 4, fibre: 0 },
    "acai bowl": { food: "Açaí Bowl", calories: 450, protein: 6, carbs: 65, fat: 18, fibre: 7 },
    "mcdonalds large fries": { food: "McDonald's Large Fries", calories: 490, protein: 7, carbs: 66, fat: 23, fibre: 6 },
    "large fries": { food: "Large Fries", calories: 490, protein: 7, carbs: 66, fat: 23, fibre: 6 },
    "roman's pizza large pepperoni": { food: "Roman's Pizza Large Pepperoni (whole)", calories: 2200, protein: 100, carbs: 240, fat: 90, fibre: 12 },
    "russian roll": { food: "Russian Roll", calories: 420, protein: 14, carbs: 35, fat: 24, fibre: 2 },
    "checkers hot dog": { food: "Checkers Hot Dog", calories: 350, protein: 12, carbs: 30, fat: 18, fibre: 2 },
    // Round 3 fixes
    "gatsby steak": { food: "Steak Gatsby", calories: 1050, protein: 40, carbs: 95, fat: 50, fibre: 5 },
    "steak gatsby": { food: "Steak Gatsby", calories: 1050, protein: 40, carbs: 95, fat: 50, fibre: 5 },
    "amagwinya": { food: "Amagwinya (fat cake)", calories: 300, protein: 4, carbs: 35, fat: 16, fibre: 1 },
    "fat cake": { food: "Fat Cake (amagwinya)", calories: 300, protein: 4, carbs: 35, fat: 16, fibre: 1 },
    "fat cakes": { food: "Fat Cake (amagwinya)", calories: 300, protein: 4, carbs: 35, fat: 16, fibre: 1 },
    "pap and wors": { food: "Pap & Boerewors", calories: 600, protein: 25, carbs: 50, fat: 32, fibre: 3 },
    "chakalaka and pap": { food: "Chakalaka & Pap", calories: 300, protein: 8, carbs: 50, fat: 6, fibre: 5 },
    "savanna light": { food: "Savanna Light 330ml", calories: 105, protein: 0, carbs: 8, fat: 0, fibre: 0 },
    "corona": { food: "Corona 355ml", calories: 148, protein: 1, carbs: 14, fat: 0, fibre: 0 },
    "cup of milo": { food: "Cup of Milo (with milk)", calories: 200, protein: 6, carbs: 30, fat: 6, fibre: 2 },
    "milo": { food: "Cup of Milo (with milk)", calories: 200, protein: 6, carbs: 30, fat: 6, fibre: 2 },
    // Round 4 fixes - SA snacks & cereals
    "tex bar": { food: "Tex Bar", calories: 250, protein: 3, carbs: 32, fat: 12, fibre: 1 },
    "lunch bar": { food: "Lunch Bar", calories: 250, protein: 4, carbs: 30, fat: 12, fibre: 1 },
    "marie biscuit": { food: "Marie Biscuit (1)", calories: 35, protein: 1, carbs: 6, fat: 1, fibre: 0 },
    "future life": { food: "Future Life Cereal (with milk)", calories: 250, protein: 12, carbs: 38, fat: 5, fibre: 4 },
    "future life cereal": { food: "Future Life Cereal (with milk)", calories: 250, protein: 12, carbs: 38, fat: 5, fibre: 4 },
    "jungle oats": { food: "Jungle Oats (with milk)", calories: 300, protein: 10, carbs: 45, fat: 8, fibre: 5 },
    "vodka lime soda": { food: "Vodka Lime & Soda", calories: 90, protein: 0, carbs: 2, fat: 0, fibre: 0 },
    "vodka lime and soda": { food: "Vodka Lime & Soda", calories: 90, protein: 0, carbs: 2, fat: 0, fibre: 0 },
    "kfc bucket": { food: "KFC 8-Piece Bucket", calories: 2000, protein: 140, carbs: 100, fat: 110, fibre: 6 },
    "kfc bucket 8 piece": { food: "KFC 8-Piece Bucket", calories: 2000, protein: 140, carbs: 100, fat: 110, fibre: 6 },
    // Round 5 - SA traditional foods
    "umfino": { food: "Umfino (wild greens)", calories: 150, protein: 5, carbs: 15, fat: 8, fibre: 6 },
    "amadumbe": { food: "Amadumbe (SA yam)", calories: 200, protein: 2, carbs: 45, fat: 0, fibre: 4 },
    "isopho": { food: "Isopho (beef soup)", calories: 300, protein: 20, carbs: 25, fat: 12, fibre: 3 },
    "uphuthu": { food: "Uphuthu (crumbly pap)", calories: 275, protein: 5, carbs: 58, fat: 2, fibre: 2 },
    "isidudu": { food: "Isidudu (soft porridge)", calories: 275, protein: 5, carbs: 55, fat: 3, fibre: 2 },
    // Round 5 - Fruit (AI uses tiny portions)
    "apple": { food: "Apple (medium)", calories: 80, protein: 0, carbs: 20, fat: 0, fibre: 3 },
    "orange": { food: "Orange (medium)", calories: 65, protein: 1, carbs: 15, fat: 0, fibre: 3 },
    "mango": { food: "Mango (whole)", calories: 150, protein: 1, carbs: 35, fat: 1, fibre: 3 },
    "chicken wing": { food: "Chicken Wing (1)", calories: 90, protein: 8, carbs: 0, fat: 6, fibre: 0 },
    // Round 5 - SA restaurants
    "nandos espetada": { food: "Nando's Espetada", calories: 500, protein: 45, carbs: 5, fat: 30, fibre: 1 },
    "john dorys fish": { food: "John Dory's Fish", calories: 400, protein: 35, carbs: 30, fat: 18, fibre: 2 },
    "john dorys": { food: "John Dory's Fish & Chips", calories: 650, protein: 35, carbs: 55, fat: 30, fibre: 3 },
    "woolworths butter chicken": { food: "Woolworths Butter Chicken", calories: 500, protein: 30, carbs: 35, fat: 25, fibre: 3 },
    "butter chicken and naan": { food: "Butter Chicken & Naan", calories: 750, protein: 35, carbs: 70, fat: 35, fibre: 4 },
    "chicken fried rice": { food: "Chicken Fried Rice", calories: 525, protein: 22, carbs: 65, fat: 18, fibre: 3 },
    "sushi platter": { food: "Sushi Platter (~20 pieces)", calories: 800, protein: 30, carbs: 110, fat: 15, fibre: 4 },
    // Round 5 - SA snack brands (AI doesn't know full bag sizes)
    "simba chipniks": { food: "Simba Chipniks (full bag)", calories: 450, protein: 5, carbs: 55, fat: 24, fibre: 3 },
    "chipniks": { food: "Simba Chipniks (full bag)", calories: 450, protein: 5, carbs: 55, fat: 24, fibre: 3 },
    "nik naks": { food: "Nik Naks (full bag)", calories: 450, protein: 5, carbs: 52, fat: 25, fibre: 3 },
    "ghost pops": { food: "Ghost Pops (full bag)", calories: 400, protein: 3, carbs: 58, fat: 18, fibre: 2 },
    "bakers choice assorted": { food: "Bakers Choice Assorted (1)", calories: 47, protein: 1, carbs: 7, fat: 2, fibre: 0 },
    // Round 5 - SA soft drinks
    "appletiser": { food: "Appletiser 330ml", calories: 120, protein: 0, carbs: 30, fat: 0, fibre: 0 },
    "grapetiser": { food: "Grapetiser 330ml", calories: 140, protein: 0, carbs: 35, fat: 0, fibre: 0 },
    // Round 6 fixes
    "boerekos": { food: "Boerekos (mixed plate)", calories: 650, protein: 35, carbs: 60, fat: 30, fibre: 5 },
    "vienna and bread": { food: "Vienna & Bread", calories: 325, protein: 10, carbs: 35, fat: 16, fibre: 2 },
    "vienna": { food: "Vienna Sausage (1)", calories: 160, protein: 6, carbs: 2, fat: 14, fibre: 0 },
    "viennas": { food: "Vienna Sausage (1)", calories: 160, protein: 6, carbs: 2, fat: 14, fibre: 0 },
    "checkers rotisserie chicken": { food: "Checkers Rotisserie Chicken (whole)", calories: 1100, protein: 90, carbs: 5, fat: 78, fibre: 0 },
    "rotisserie chicken": { food: "Rotisserie Chicken (whole)", calories: 1100, protein: 90, carbs: 5, fat: 78, fibre: 0 },
    "mass gainer": { food: "Mass Gainer (1 scoop)", calories: 400, protein: 30, carbs: 55, fat: 8, fibre: 2 },
    "mass gainer scoop": { food: "Mass Gainer (1 scoop)", calories: 400, protein: 30, carbs: 55, fat: 8, fibre: 2 },
    "pre workout": { food: "Pre-Workout", calories: 10, protein: 0, carbs: 2, fat: 0, fibre: 0 },
    "yogi sip": { food: "Yogi Sip", calories: 150, protein: 5, carbs: 22, fat: 4, fibre: 0 },
    "ice cream scoop": { food: "Ice Cream (1 scoop)", calories: 150, protein: 2, carbs: 18, fat: 8, fibre: 0 },
    "ice cream": { food: "Ice Cream (1 scoop)", calories: 150, protein: 2, carbs: 18, fat: 8, fibre: 0 },
    "cappuccino large": { food: "Large Cappuccino", calories: 200, protein: 8, carbs: 16, fat: 10, fibre: 0 },
    "large cappuccino": { food: "Large Cappuccino", calories: 200, protein: 8, carbs: 16, fat: 10, fibre: 0 },
    // Round 7 - nightly edge case test 2026-03-12
    "double vodka": { food: "Double Vodka (50ml)", calories: 140, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "nandos quarter chicken": { food: "Nando's Quarter Chicken (with skin)", calories: 650, protein: 45, carbs: 5, fat: 50, fibre: 0 },
    "nandos quarter": { food: "Nando's Quarter Chicken (with skin)", calories: 650, protein: 45, carbs: 5, fat: 50, fibre: 0 },
    "craft beer": { food: "Craft Beer (440ml)", calories: 210, protein: 2, carbs: 20, fat: 0, fibre: 0 },
    "steers wacky wednesday": { food: "Steers Wacky Wednesday Burger", calories: 600, protein: 30, carbs: 45, fat: 30, fibre: 3 },
    "wacky wednesday": { food: "Steers Wacky Wednesday Burger", calories: 600, protein: 30, carbs: 45, fat: 30, fibre: 3 },
    "melkkos": { food: "Melkkos (serving)", calories: 300, protein: 8, carbs: 40, fat: 12, fibre: 1 },
    "chocolate milk": { food: "Chocolate Milk (250ml)", calories: 210, protein: 8, carbs: 28, fat: 8, fibre: 1 },
    "milkshake": { food: "Milkshake", calories: 450, protein: 10, carbs: 60, fat: 18, fibre: 0 },
    "bacon and eggs": { food: "Bacon & Eggs (2 rashers, 2 eggs)", calories: 350, protein: 24, carbs: 1, fat: 27, fibre: 0 },
    "mcflurry": { food: "McFlurry", calories: 420, protein: 8, carbs: 62, fat: 16, fibre: 1 },
    "biltong and cheese platter": { food: "Biltong & Cheese Platter", calories: 500, protein: 40, carbs: 5, fat: 35, fibre: 0 },
    "biltong and cheese": { food: "Biltong & Cheese Platter", calories: 500, protein: 40, carbs: 5, fat: 35, fibre: 0 },
    "caesar salad": { food: "Caesar Salad", calories: 400, protein: 15, carbs: 20, fat: 28, fibre: 3 },
    "chai latte": { food: "Chai Latte", calories: 180, protein: 5, carbs: 28, fat: 5, fibre: 0 },
    // Round 8 - nightly edge case test 2026-03-14
    "boerewors roll": { food: "Boerewors Roll", calories: 425, protein: 18, carbs: 35, fat: 22, fibre: 2 },
    "chicken and rice": { food: "Chicken & Rice (serving)", calories: 450, protein: 35, carbs: 45, fat: 12, fibre: 2 },
    "eggs on toast": { food: "Eggs on Toast (2 eggs, 2 slices)", calories: 310, protein: 18, carbs: 30, fat: 14, fibre: 2 },
    "gin and tonic": { food: "Gin & Tonic (single)", calories: 120, protein: 0, carbs: 8, fat: 0, fibre: 0 },
    "debonairs medium pizza": { food: "Debonairs Medium Pizza (whole)", calories: 1500, protein: 60, carbs: 160, fat: 60, fibre: 8 },
    "debonairs pizza": { food: "Debonairs Medium Pizza (whole)", calories: 1500, protein: 60, carbs: 160, fat: 60, fibre: 8 },
    "chicken stirfry": { food: "Chicken Stir-Fry (serving)", calories: 400, protein: 30, carbs: 30, fat: 14, fibre: 4 },
    "chicken stir fry": { food: "Chicken Stir-Fry (serving)", calories: 400, protein: 30, carbs: 30, fat: 14, fibre: 4 },
    "ocean basket calamari": { food: "Ocean Basket Calamari", calories: 500, protein: 28, carbs: 35, fat: 25, fibre: 2 },
    "ocean basket prawns": { food: "Ocean Basket Prawns", calories: 400, protein: 30, carbs: 15, fat: 22, fibre: 2 },
    "vida e caffe latte": { food: "Vida e Caffè Latte", calories: 180, protein: 8, carbs: 16, fat: 8, fibre: 0 },
    "vida latte": { food: "Vida e Caffè Latte", calories: 180, protein: 8, carbs: 16, fat: 8, fibre: 0 },
    "checkers chicken strips": { food: "Checkers Chicken Strips", calories: 400, protein: 25, carbs: 30, fat: 20, fibre: 2 },
    "spur cheese burger": { food: "Spur Cheese Burger", calories: 650, protein: 35, carbs: 45, fat: 35, fibre: 3 },
    "spur cheeseburger": { food: "Spur Cheese Burger", calories: 650, protein: 35, carbs: 45, fat: 35, fibre: 3 },
    "sparletta pine nut": { food: "Sparletta Pine Nut 330ml", calories: 180, protein: 0, carbs: 45, fat: 0, fibre: 0 },
    "sparletta": { food: "Sparletta 330ml", calories: 180, protein: 0, carbs: 45, fat: 0, fibre: 0 },
    "woolworths sushi 12 pack": { food: "Woolworths Sushi 12 Pack", calories: 500, protein: 20, carbs: 70, fat: 12, fibre: 4 },
    "woolworths sushi": { food: "Woolworths Sushi 12 Pack", calories: 500, protein: 20, carbs: 70, fat: 12, fibre: 4 },
    "simba chips original": { food: "Simba Chips Original (125g)", calories: 500, protein: 5, carbs: 60, fat: 28, fibre: 4 },
    "simba chips": { food: "Simba Chips (125g)", calories: 500, protein: 5, carbs: 60, fat: 28, fibre: 4 },
    // Round 9 - nightly edge case test 2026-03-15
    "chicken licken big john": { food: "Chicken Licken Big John Burger", calories: 650, protein: 30, carbs: 50, fat: 35, fibre: 3 },
    "big john": { food: "Chicken Licken Big John Burger", calories: 650, protein: 30, carbs: 50, fat: 35, fibre: 3 },
    "spur wings 6": { food: "Spur Chicken Wings (6)", calories: 540, protein: 36, carbs: 15, fat: 38, fibre: 1 },
    "spur wings": { food: "Spur Chicken Wings (6)", calories: 540, protein: 36, carbs: 15, fat: 38, fibre: 1 },
    "lays salt and vinegar": { food: "Lay's Salt & Vinegar (120g)", calories: 480, protein: 5, carbs: 55, fat: 28, fibre: 3 },
    "lays": { food: "Lay's Chips (120g)", calories: 480, protein: 5, carbs: 55, fat: 28, fibre: 3 },
    "astros": { food: "Astros (40g box)", calories: 210, protein: 3, carbs: 25, fat: 11, fibre: 1 },
    "liqui fruit orange": { food: "Liqui-Fruit Orange (330ml)", calories: 180, protein: 1, carbs: 42, fat: 0, fibre: 0 },
    "liqui fruit": { food: "Liqui-Fruit (330ml)", calories: 180, protein: 1, carbs: 42, fat: 0, fibre: 0 },
    "bunny chow half": { food: "Bunny Chow (half)", calories: 1100, protein: 40, carbs: 120, fat: 45, fibre: 8 },
    "half bunny chow": { food: "Bunny Chow (half)", calories: 1100, protein: 40, carbs: 120, fat: 45, fibre: 8 },
    "beacon flings": { food: "Beacon Flings (100g bag)", calories: 430, protein: 4, carbs: 52, fat: 23, fibre: 2 },
    "flings": { food: "Beacon Flings (100g bag)", calories: 430, protein: 4, carbs: 52, fat: 23, fibre: 2 },
    "potjiekos": { food: "Potjiekos (serving)", calories: 550, protein: 30, carbs: 35, fat: 30, fibre: 4 },
    "potjie": { food: "Potjiekos (serving)", calories: 550, protein: 30, carbs: 35, fat: 30, fibre: 4 },
    "kauai smoothie bowl": { food: "Kauai Smoothie Bowl", calories: 450, protein: 10, carbs: 65, fat: 15, fibre: 6 },
    "bredie": { food: "Bredie (SA stew serving)", calories: 450, protein: 25, carbs: 30, fat: 25, fibre: 5 },
    "tomato bredie": { food: "Tomato Bredie (serving)", calories: 450, protein: 25, carbs: 30, fat: 25, fibre: 5 },
    "wimpy breakfast": { food: "Wimpy Full Breakfast", calories: 800, protein: 35, carbs: 60, fat: 45, fibre: 4 },
    // Round 10 - nightly edge case test 2026-03-16
    "white monster": { food: "Monster Ultra (Zero Sugar) 500ml", calories: 5, protein: 0, carbs: 1, fat: 0, fibre: 0 },
    // Round 11 - nightly edge case test 2026-04-10
    "rooibos tea with honey": { food: "Rooibos Tea with Honey & Milk", calories: 60, protein: 2, carbs: 12, fat: 1, fibre: 0 },
    "curry and rice": { food: "Curry & Rice (SA serving)", calories: 550, protein: 18, carbs: 75, fat: 15, fibre: 4 },
    "dumpling": { food: "Dumpling (~100g)", calories: 120, protein: 3, carbs: 20, fat: 3, fibre: 1 },
    "dumpling 1": { food: "Dumpling (~100g)", calories: 120, protein: 3, carbs: 20, fat: 3, fibre: 1 },
    "kfc wednesday special": { food: "KFC Wednesday Special (2-3 pieces)", calories: 600, protein: 40, carbs: 25, fat: 40, fibre: 2 },
    "chicken licken wednesday special": { food: "Chicken Licken Wednesday Special (2-3 pieces)", calories: 600, protein: 40, carbs: 25, fat: 40, fibre: 2 },
    "monster zero": { food: "Monster Zero Sugar 500ml", calories: 5, protein: 0, carbs: 1, fat: 0, fibre: 0 },
    "pap and vleis": { food: "Pap & Vleis (serving)", calories: 550, protein: 35, carbs: 55, fat: 20, fibre: 3 },
    "avocado toast": { food: "Avocado Toast", calories: 350, protein: 8, carbs: 35, fat: 20, fibre: 7 },
    "nandos peri peri chips": { food: "Nando's Peri-Peri Chips", calories: 320, protein: 4, carbs: 40, fat: 16, fibre: 4 },
    "nandos chips": { food: "Nando's Peri-Peri Chips", calories: 320, protein: 4, carbs: 40, fat: 16, fibre: 4 },
    "tropika dairy blend": { food: "Tropika Dairy Blend (330ml)", calories: 190, protein: 3, carbs: 30, fat: 6, fibre: 0 },
    "tropika": { food: "Tropika Dairy Blend (330ml)", calories: 190, protein: 3, carbs: 30, fat: 6, fibre: 0 },
    "chicken licken soul fire wings 6": { food: "Chicken Licken Soul Fire Wings (6)", calories: 550, protein: 35, carbs: 20, fat: 35, fibre: 1 },
    "soul fire wings": { food: "Chicken Licken Soul Fire Wings (6)", calories: 550, protein: 35, carbs: 20, fat: 35, fibre: 1 },
    "walkie talkies": { food: "Walkie Talkies (chicken feet)", calories: 200, protein: 18, carbs: 0, fat: 14, fibre: 0 },
    "chicken feet": { food: "Chicken Feet (walkie talkies)", calories: 200, protein: 18, carbs: 0, fat: 14, fibre: 0 },
    "macaroni and cheese": { food: "Macaroni & Cheese (serving)", calories: 400, protein: 15, carbs: 45, fat: 18, fibre: 2 },
    "mac and cheese": { food: "Macaroni & Cheese (serving)", calories: 400, protein: 15, carbs: 45, fat: 18, fibre: 2 },
    "ocean basket grilled linefish": { food: "Ocean Basket Grilled Linefish", calories: 380, protein: 40, carbs: 15, fat: 18, fibre: 2 },
    "grilled linefish": { food: "Grilled Linefish (with sides)", calories: 380, protein: 40, carbs: 15, fat: 18, fibre: 2 },
    "coo-ee orange": { food: "Coo-ee Orange 500ml", calories: 150, protein: 0, carbs: 38, fat: 0, fibre: 0 },
    "coo-ee": { food: "Coo-ee 500ml", calories: 150, protein: 0, carbs: 38, fat: 0, fibre: 0 },
    // Round 11 - nightly edge case test 2026-03-19
    "chicken licken 4 piece": { food: "Chicken Licken 4 Piece", calories: 880, protein: 60, carbs: 40, fat: 52, fibre: 2 },
    "4 piece chicken licken": { food: "Chicken Licken 4 Piece", calories: 880, protein: 60, carbs: 40, fat: 52, fibre: 2 },
    "spur salad bar": { food: "Spur Salad Bar (plate)", calories: 300, protein: 8, carbs: 25, fat: 18, fibre: 5 },
    "two provitas with peanut butter": { food: "2x Provita with Peanut Butter", calories: 250, protein: 9, carbs: 22, fat: 14, fibre: 3 },
    "provita with peanut butter": { food: "Provita with Peanut Butter", calories: 125, protein: 5, carbs: 11, fat: 7, fibre: 2 },
    // Round 12 - nightly edge case test 2026-03-21
    "amarula on ice": { food: "Amarula on Ice (100ml double)", calories: 280, protein: 1, carbs: 32, fat: 6, fibre: 0 },
    "amarula": { food: "Amarula (100ml double)", calories: 280, protein: 1, carbs: 32, fat: 6, fibre: 0 },
    "spur pancake stack": { food: "Spur Pancake Stack", calories: 650, protein: 10, carbs: 85, fat: 30, fibre: 2 },
    "spur pancakes": { food: "Spur Pancake Stack", calories: 650, protein: 10, carbs: 85, fat: 30, fibre: 2 },
    "checkers cheese grillers 2": { food: "Checkers Cheese Grillers (2)", calories: 300, protein: 16, carbs: 6, fat: 24, fibre: 0 },
    "cheese grillers 2": { food: "Cheese Grillers (2)", calories: 300, protein: 16, carbs: 6, fat: 24, fibre: 0 },
    "cheese griller": { food: "Cheese Griller (1)", calories: 150, protein: 8, carbs: 3, fat: 12, fibre: 0 },
    // Round 13 - nightly edge case test 2026-03-22
    "gatsby masala steak": { food: "Masala Steak Gatsby", calories: 1050, protein: 42, carbs: 100, fat: 45, fibre: 5 },
    "masala steak gatsby": { food: "Masala Steak Gatsby", calories: 1050, protein: 42, carbs: 100, fat: 45, fibre: 5 },
    "cremora rooibos tea": { food: "Rooibos Tea with Cremora", calories: 50, protein: 0, carbs: 6, fat: 3, fibre: 0 },
    "cremora rooibos": { food: "Rooibos Tea with Cremora", calories: 50, protein: 0, carbs: 6, fat: 3, fibre: 0 },
    "cremora tea": { food: "Tea with Cremora", calories: 50, protein: 0, carbs: 6, fat: 3, fibre: 0 },
    "rocomamas wing roulette 6": { food: "RocoMamas Wing Roulette (6)", calories: 580, protein: 40, carbs: 12, fat: 38, fibre: 1 },
    "rocomamas wings 6": { food: "RocoMamas Wings (6)", calories: 580, protein: 40, carbs: 12, fat: 38, fibre: 1 },
    "rocomamas wings": { food: "RocoMamas Wings (6)", calories: 580, protein: 40, carbs: 12, fat: 38, fibre: 1 },
    "castle milk stout": { food: "Castle Milk Stout 440ml", calories: 220, protein: 2, carbs: 22, fat: 0, fibre: 0 },
    "milk stout": { food: "Castle Milk Stout 440ml", calories: 220, protein: 2, carbs: 22, fat: 0, fibre: 0 },
    // Round 14 - nightly edge case test 2026-03-23
    "bunny chow beans": { food: "Bean Bunny Chow (quarter)", calories: 500, protein: 18, carbs: 75, fat: 12, fibre: 10 },
    "bean bunny chow": { food: "Bean Bunny Chow (quarter)", calories: 500, protein: 18, carbs: 75, fat: 12, fibre: 10 },
    // Round 15 - nightly edge case test 2026-03-24
    "rooibos latte": { food: "Rooibos Latte (steamed milk)", calories: 120, protein: 5, carbs: 10, fat: 5, fibre: 0 },
    // Round 16 - nightly edge case test 2026-03-26
    "magwinya with atchar": { food: "Magwinya with Atchar", calories: 400, protein: 5, carbs: 55, fat: 16, fibre: 3 },
    "fat cake with atchar": { food: "Fat Cake with Atchar", calories: 400, protein: 5, carbs: 55, fat: 16, fibre: 3 },
    "checkers banana bread slice": { food: "Checkers Banana Bread (slice)", calories: 280, protein: 4, carbs: 42, fat: 11, fibre: 2 },
    "banana bread slice": { food: "Banana Bread (slice)", calories: 280, protein: 4, carbs: 42, fat: 11, fibre: 2 },
    "banana bread": { food: "Banana Bread (slice)", calories: 280, protein: 4, carbs: 42, fat: 11, fibre: 2 },
    // Round 17 - nightly edge case test 2026-03-27
    "peri peri livers": { food: "Peri-Peri Chicken Livers (serving)", calories: 320, protein: 35, carbs: 5, fat: 16, fibre: 1 },
    "chicken livers": { food: "Chicken Livers (serving)", calories: 280, protein: 32, carbs: 3, fat: 14, fibre: 0 },
    "chicken mayo toastie": { food: "Chicken Mayo Toastie", calories: 420, protein: 22, carbs: 40, fat: 20, fibre: 2 },
    "chicken mayo toasted sandwich": { food: "Chicken Mayo Toastie", calories: 420, protein: 22, carbs: 40, fat: 20, fibre: 2 },
    "steers wacky wednesday chips and drink": { food: "Steers Wacky Wednesday + Chips + Drink", calories: 1000, protein: 35, carbs: 110, fat: 45, fibre: 5 },
    "wacky wednesday chips and drink": { food: "Steers Wacky Wednesday + Chips + Drink", calories: 1000, protein: 35, carbs: 110, fat: 45, fibre: 5 },
    "wacky wednesday meal": { food: "Steers Wacky Wednesday + Chips + Drink", calories: 1000, protein: 35, carbs: 110, fat: 45, fibre: 5 },
    // Round 18 - nightly edge case test 2026-03-28
    "peppermint crisp": { food: "Peppermint Crisp Bar", calories: 230, protein: 2, carbs: 30, fat: 11, fibre: 0 },
    "peppermint crisp bar": { food: "Peppermint Crisp Bar", calories: 230, protein: 2, carbs: 30, fat: 11, fibre: 0 },
    "gatsby calamari": { food: "Calamari Gatsby", calories: 950, protein: 30, carbs: 95, fat: 45, fibre: 4 },
    "calamari gatsby": { food: "Calamari Gatsby", calories: 950, protein: 30, carbs: 95, fat: 45, fibre: 4 },
    // Round 19 - nightly edge case test 2026-03-29
    "nandos double chicken burger": { food: "Nando's Double Chicken Burger", calories: 800, protein: 55, carbs: 50, fat: 38, fibre: 3 },
    "nandos double burger": { food: "Nando's Double Chicken Burger", calories: 800, protein: 55, carbs: 50, fat: 38, fibre: 3 },
    "pick n pay chicken burger": { food: "Pick n Pay Chicken Burger", calories: 450, protein: 25, carbs: 38, fat: 20, fibre: 2 },
    "pnp chicken burger": { food: "Pick n Pay Chicken Burger", calories: 450, protein: 25, carbs: 38, fat: 20, fibre: 2 },
    "chicken mayo kota": { food: "Chicken Mayo Kota", calories: 650, protein: 28, carbs: 65, fat: 28, fibre: 3 },
    "kota with atchar and cheese": { food: "Kota with atchar & cheese", calories: 800, protein: 24, carbs: 95, fat: 30, fibre: 4 },
    "pickled fish": { food: "Pickled Fish (serving)", calories: 280, protein: 30, carbs: 10, fat: 12, fibre: 1 },
    "malva pudding": { food: "Malva Pudding (slice)", calories: 380, protein: 4, carbs: 55, fat: 16, fibre: 1 },
    "malva pudding slice": { food: "Malva Pudding (slice)", calories: 380, protein: 4, carbs: 55, fat: 16, fibre: 1 },
    // Round 20 - Protein shakes (SA brands, accurate per-scoop macros from fatsecret.co.za)
    // Generic - assumes whey with water (most common)
    "protein shake": { food: "Protein Shake (1 scoop with water)", calories: 120, protein: 24, carbs: 3, fat: 2, fibre: 1 },
    "protein shake with water": { food: "Protein Shake (1 scoop with water)", calories: 120, protein: 24, carbs: 3, fat: 2, fibre: 1 },
    "protein shake with milk": { food: "Protein Shake (1 scoop with 250ml milk)", calories: 270, protein: 32, carbs: 15, fat: 10, fibre: 1 },
    "whey shake": { food: "Whey Protein Shake (1 scoop with water)", calories: 120, protein: 24, carbs: 3, fat: 2, fibre: 1 },
    "whey protein": { food: "Whey Protein (1 scoop with water)", calories: 120, protein: 24, carbs: 3, fat: 2, fibre: 1 },
    "whey protein shake": { food: "Whey Protein Shake (1 scoop with water)", calories: 120, protein: 24, carbs: 3, fat: 2, fibre: 1 },
    "protein powder": { food: "Protein Powder (1 scoop with water)", calories: 120, protein: 24, carbs: 3, fat: 2, fibre: 1 },
    "scoop of protein": { food: "Protein Shake (1 scoop with water)", calories: 120, protein: 24, carbs: 3, fat: 2, fibre: 1 },
    "2 scoops protein": { food: "Protein Shake (2 scoops with water)", calories: 240, protein: 48, carbs: 6, fat: 4, fibre: 2 },
    "double scoop protein": { food: "Protein Shake (2 scoops with water)", calories: 240, protein: 48, carbs: 6, fat: 4, fibre: 2 },
    "double protein shake": { food: "Protein Shake (2 scoops with water)", calories: 240, protein: 48, carbs: 6, fat: 4, fibre: 2 },
    // USN (SA's biggest brand) — 30g scoop
    "usn whey": { food: "USN Whey Protein (1 scoop)", calories: 117, protein: 24, carbs: 2, fat: 2, fibre: 1 },
    "usn whey protein": { food: "USN Whey Protein (1 scoop)", calories: 117, protein: 24, carbs: 2, fat: 2, fibre: 1 },
    "usn whey shake": { food: "USN Whey Protein (1 scoop)", calories: 117, protein: 24, carbs: 2, fat: 2, fibre: 1 },
    "usn protein shake": { food: "USN Whey Protein (1 scoop)", calories: 117, protein: 24, carbs: 2, fat: 2, fibre: 1 },
    "usn premium whey": { food: "USN Premium Whey (1 scoop)", calories: 126, protein: 25, carbs: 3, fat: 2, fibre: 1 },
    "usn bluelab": { food: "USN BlueLab Whey (1 scoop)", calories: 124, protein: 24, carbs: 3, fat: 2, fibre: 1 },
    "usn bluelab whey": { food: "USN BlueLab Whey (1 scoop)", calories: 124, protein: 24, carbs: 3, fat: 2, fibre: 1 },
    "usn hardcore whey": { food: "USN Hardcore Whey (1 scoop)", calories: 132, protein: 25, carbs: 5, fat: 2, fibre: 1 },
    "usn diet fuel": { food: "USN Diet Fuel (2 scoops)", calories: 200, protein: 32, carbs: 12, fat: 3, fibre: 4 },
    "usn isopro whey": { food: "USN IsoPro Whey Isolate (1 scoop)", calories: 110, protein: 27, carbs: 0, fat: 0, fibre: 0 },
    "usn whey isolate": { food: "USN Whey Isolate (1 scoop)", calories: 110, protein: 27, carbs: 0, fat: 0, fibre: 0 },
    // NPL — 30g scoop
    "npl whey": { food: "NPL Whey Protein (1 scoop)", calories: 108, protein: 25, carbs: 4, fat: 1, fibre: 2 },
    "npl whey protein": { food: "NPL Whey Protein (1 scoop)", calories: 108, protein: 25, carbs: 4, fat: 1, fibre: 2 },
    "npl protein shake": { food: "NPL Whey Protein (1 scoop)", calories: 108, protein: 25, carbs: 4, fat: 1, fibre: 2 },
    "npl platinum whey": { food: "NPL Platinum Whey (1 scoop)", calories: 123, protein: 25, carbs: 4, fat: 1, fibre: 1 },
    "npl whey isolate": { food: "NPL 100% Whey Isolate (1 scoop)", calories: 93, protein: 22, carbs: 1, fat: 0, fibre: 0 },
    "npl anabolic whey": { food: "NPL Anabolic Whey (1 scoop)", calories: 166, protein: 30, carbs: 8, fat: 2, fibre: 1 },
    // Biogen (Dis-Chem house brand)
    "biogen whey": { food: "Biogen ISO-Whey Premium (1 scoop)", calories: 117, protein: 24, carbs: 3, fat: 2, fibre: 1 },
    "biogen whey protein": { food: "Biogen ISO-Whey Premium (1 scoop)", calories: 117, protein: 24, carbs: 3, fat: 2, fibre: 1 },
    "biogen protein shake": { food: "Biogen ISO-Whey Premium (1 scoop)", calories: 117, protein: 24, carbs: 3, fat: 2, fibre: 1 },
    "biogen iso whey": { food: "Biogen ISO-Whey (1 scoop)", calories: 158, protein: 30, carbs: 5, fat: 2, fibre: 1 },
    "biogen lean whey": { food: "Biogen Lean Whey (1 serving)", calories: 128, protein: 24, carbs: 6, fat: 2, fibre: 2 },
    "biogen diet protein": { food: "Biogen Diet Protein (1 serving)", calories: 153, protein: 26, carbs: 8, fat: 3, fibre: 3 },
    "biogen plant protein": { food: "Biogen Plant Protein (1 serving)", calories: 151, protein: 20, carbs: 10, fat: 4, fibre: 5 },
    // EVOX
    "evox whey": { food: "EVOX 100% Whey Protein (1 scoop)", calories: 124, protein: 24, carbs: 4, fat: 2, fibre: 1 },
    "evox whey protein": { food: "EVOX 100% Whey Protein (1 scoop)", calories: 124, protein: 24, carbs: 4, fat: 2, fibre: 1 },
    "evox protein shake": { food: "EVOX 100% Whey Protein (1 scoop)", calories: 124, protein: 24, carbs: 4, fat: 2, fibre: 1 },
    // SSA Supplements
    "ssa whey": { food: "SSA Pure Whey (1 serving)", calories: 116, protein: 24, carbs: 3, fat: 1, fibre: 1 },
    "ssa whey protein": { food: "SSA Pure Whey (1 serving)", calories: 116, protein: 24, carbs: 3, fat: 1, fibre: 1 },
    "ssa protein shake": { food: "SSA Pure Whey (1 serving)", calories: 116, protein: 24, carbs: 3, fat: 1, fibre: 1 },
    // Nutritech
    "nutritech whey": { food: "Nutritech Premium Whey (1 serving)", calories: 120, protein: 24, carbs: 4, fat: 2, fibre: 1 },
    "nutritech whey protein": { food: "Nutritech Premium Whey (1 serving)", calories: 120, protein: 24, carbs: 4, fat: 2, fibre: 1 },
    "nutritech protein shake": { food: "Nutritech Premium Whey (1 serving)", calories: 120, protein: 24, carbs: 4, fat: 2, fibre: 1 },
    // Optimum Nutrition (imported, popular in SA)
    "gold standard whey": { food: "ON Gold Standard Whey (1 scoop)", calories: 120, protein: 24, carbs: 3, fat: 2, fibre: 1 },
    "optimum nutrition whey": { food: "ON Gold Standard Whey (1 scoop)", calories: 120, protein: 24, carbs: 3, fat: 2, fibre: 1 },
    "on whey": { food: "ON Gold Standard Whey (1 scoop)", calories: 120, protein: 24, carbs: 3, fat: 2, fibre: 1 },
    // Casein
    "casein shake": { food: "Casein Protein Shake (1 scoop)", calories: 120, protein: 24, carbs: 3, fat: 1, fibre: 0 },
    "casein protein": { food: "Casein Protein (1 scoop)", calories: 120, protein: 24, carbs: 3, fat: 1, fibre: 0 },
    // Plant-based
    "plant protein shake": { food: "Plant Protein Shake (1 scoop)", calories: 130, protein: 20, carbs: 6, fat: 3, fibre: 3 },
    "vegan protein shake": { food: "Vegan Protein Shake (1 scoop)", calories: 130, protein: 20, carbs: 6, fat: 3, fibre: 3 },
    "pea protein shake": { food: "Pea Protein Shake (1 scoop)", calories: 120, protein: 22, carbs: 3, fat: 2, fibre: 2 },
    // Round 20b - More SA brands + protein bars + mass gainers (fatsecret.co.za scrape)
    // USN extras
    "usn hyperbolic mass": { food: "USN Hyperbolic Mass (3 scoops)", calories: 1164, protein: 60, carbs: 210, fat: 1, fibre: 2 },
    "hyperbolic mass": { food: "USN Hyperbolic Mass (3 scoops)", calories: 1164, protein: 60, carbs: 210, fat: 1, fibre: 2 },
    "usn diet protein": { food: "USN Diet Protein (1 scoop)", calories: 184, protein: 20, carbs: 20, fat: 2, fibre: 3 },
    "usn hydrotech whey": { food: "USN Hydrotech Whey (1 scoop)", calories: 112, protein: 20, carbs: 3, fat: 2, fibre: 2 },
    "usn hydrotech": { food: "USN Hydrotech Whey (1 scoop)", calories: 112, protein: 20, carbs: 3, fat: 2, fibre: 2 },
    // USN bars
    "usn trust bar": { food: "USN Trust Crunch Bar", calories: 220, protein: 20, carbs: 22, fat: 8, fibre: 2 },
    "usn trust crunch": { food: "USN Trust Crunch Bar", calories: 220, protein: 20, carbs: 22, fat: 8, fibre: 2 },
    "usn pro protein bar": { food: "USN Pro Protein Bar (68g)", calories: 232, protein: 21, carbs: 27, fat: 7, fibre: 3 },
    "usn protein bar": { food: "USN Pro Protein Bar (68g)", calories: 232, protein: 21, carbs: 27, fat: 7, fibre: 3 },
    // Metalab
    "metalab whey": { food: "Metalab Whey Protein (1 serving)", calories: 149, protein: 25, carbs: 7, fat: 2, fibre: 1 },
    "metalab whey protein": { food: "Metalab Whey Protein (1 serving)", calories: 149, protein: 25, carbs: 7, fat: 2, fibre: 1 },
    "metalab protein shake": { food: "Metalab Whey Protein (1 serving)", calories: 149, protein: 25, carbs: 7, fat: 2, fibre: 1 },
    // Biogen extras
    "biogen complete whey": { food: "Biogen Complete Whey (1 scoop)", calories: 150, protein: 25, carbs: 4, fat: 3, fibre: 1 },
    "biogen rage whey": { food: "Biogen Rage Whey (1 scoop)", calories: 125, protein: 24, carbs: 4, fat: 2, fibre: 1 },
    // NPL extras
    "npl low carb whey": { food: "NPL Low Carb Whey Slim (1 scoop)", calories: 117, protein: 23, carbs: 3, fat: 2, fibre: 4 },
    "npl low carb whey slim": { food: "NPL Low Carb Whey Slim (1 scoop)", calories: 117, protein: 23, carbs: 3, fat: 2, fibre: 4 },
    "npl whey slim": { food: "NPL Low Carb Whey Slim (1 scoop)", calories: 117, protein: 23, carbs: 3, fat: 2, fibre: 4 },
    // SSA extras
    "ssa whey extreme": { food: "SSA Whey Extreme (1 serving)", calories: 123, protein: 22, carbs: 10, fat: 1, fibre: 1 },
    // EVOX extras
    "evox whey advanced": { food: "EVOX Whey Protein Advanced (1 serving)", calories: 120, protein: 23, carbs: 3, fat: 2, fibre: 0 },
    "evox casein": { food: "EVOX Casein Protein (1 serving)", calories: 109, protein: 24, carbs: 3, fat: 1, fibre: 0 },
    "evox casein protein": { food: "EVOX Casein Protein (1 serving)", calories: 109, protein: 24, carbs: 3, fat: 1, fibre: 0 },
    // Nutritech extras
    "nutritech pure whey": { food: "Nutritech 100% Pure Whey (1 serving)", calories: 106, protein: 24, carbs: 2, fat: 1, fibre: 0 },
    "nutritech premium pure whey": { food: "Nutritech Premium Pure Whey (1 serving)", calories: 122, protein: 23, carbs: 3, fat: 2, fibre: 2 },
    // MyProtein (popular import in SA)
    "myprotein whey": { food: "MyProtein Impact Whey (1 scoop)", calories: 95, protein: 19, carbs: 1, fat: 2, fibre: 0 },
    "myprotein impact whey": { food: "MyProtein Impact Whey (1 scoop)", calories: 95, protein: 19, carbs: 1, fat: 2, fibre: 0 },
    "myprotein protein shake": { food: "MyProtein Impact Whey (1 scoop)", calories: 95, protein: 19, carbs: 1, fat: 2, fibre: 0 },
    // Protein bars (SA favourites)
    "quest bar": { food: "Quest Protein Bar", calories: 190, protein: 21, carbs: 21, fat: 7, fibre: 14 },
    "quest protein bar": { food: "Quest Protein Bar", calories: 190, protein: 21, carbs: 21, fat: 7, fibre: 14 },
    "barebells bar": { food: "Barebells Protein Bar", calories: 200, protein: 20, carbs: 18, fat: 8, fibre: 3 },
    "barebells protein bar": { food: "Barebells Protein Bar", calories: 200, protein: 20, carbs: 18, fat: 8, fibre: 3 },
    "barebells": { food: "Barebells Protein Bar", calories: 200, protein: 20, carbs: 18, fat: 8, fibre: 3 },
    "rxbar": { food: "RXBAR Protein Bar", calories: 210, protein: 12, carbs: 24, fat: 9, fibre: 5 },
    "rx bar": { food: "RXBAR Protein Bar", calories: 210, protein: 12, carbs: 24, fat: 9, fibre: 5 },
    "npl protein bar": { food: "NPL Protein Bar", calories: 238, protein: 20, carbs: 25, fat: 8, fibre: 3 },
    "biogen protein bar": { food: "Biogen Lean Whey Protein Bar", calories: 160, protein: 15, carbs: 17, fat: 5, fibre: 2 },
    "fulfil bar": { food: "Fulfil Protein Bar", calories: 200, protein: 20, carbs: 18, fat: 7, fibre: 2 },
    "fulfil protein bar": { food: "Fulfil Protein Bar", calories: 200, protein: 20, carbs: 18, fat: 7, fibre: 2 },
    // FuturLife (SA brand, not pure protein but popular)
    "futurelife shake": { food: "FutureLife High Protein Shake (sachet)", calories: 215, protein: 15, carbs: 28, fat: 5, fibre: 4 },
    "futurelife high protein": { food: "FutureLife High Protein (sachet)", calories: 215, protein: 15, carbs: 28, fat: 5, fibre: 4 },
    "futurelife protein": { food: "FutureLife High Protein (sachet)", calories: 215, protein: 15, carbs: 28, fat: 5, fibre: 4 },
    "futurelife smart protein": { food: "FutureLife Smart Protein (sachet)", calories: 200, protein: 12, carbs: 30, fat: 4, fibre: 3 },
    // Woolworths protein products
    "woolworths protein shake": { food: "Woolworths Protein Shake (bottle)", calories: 160, protein: 25, carbs: 8, fat: 3, fibre: 0 },
    "woolies protein shake": { food: "Woolworths Protein Shake (bottle)", calories: 160, protein: 25, carbs: 8, fat: 3, fibre: 0 },
    "woolworths protein yoghurt": { food: "Woolworths Protein Yoghurt (175g)", calories: 130, protein: 15, carbs: 10, fat: 3, fibre: 0 },
    "woolies protein yoghurt": { food: "Woolworths Protein Yoghurt (175g)", calories: 130, protein: 15, carbs: 10, fat: 3, fibre: 0 },
    // Dis-Chem house brand RTD
    "biogen protein drink": { food: "Biogen Protein Drink (bottle)", calories: 150, protein: 25, carbs: 6, fat: 2, fibre: 0 },
    "protein water": { food: "Protein Water (500ml)", calories: 80, protein: 20, carbs: 1, fat: 0, fibre: 0 },
    // Mass gainers (common SA request)
    "mass gainer shake": { food: "Mass Gainer (2 scoops)", calories: 400, protein: 30, carbs: 55, fat: 8, fibre: 2 },
    "serious mass": { food: "ON Serious Mass (2 scoops)", calories: 625, protein: 25, carbs: 125, fat: 3, fibre: 2 },
    "usn muscle fuel anabolic": { food: "USN Muscle Fuel Anabolic (3 scoops)", calories: 550, protein: 50, carbs: 65, fat: 8, fibre: 3 },
    "muscle fuel anabolic": { food: "USN Muscle Fuel Anabolic (3 scoops)", calories: 550, protein: 50, carbs: 65, fat: 8, fibre: 3 },
    // Round 21 - Common foods users log that hit AI (from debug-ai.log analysis)
    // 2026-04-15 edge case test - night 2
    "chicken licken lots of legs": { food: "Chicken Licken Lots of Legs (8 piece)", calories: 1500, protein: 100, carbs: 60, fat: 90, fibre: 3 },
    "red square": { food: "Red Square Energy Drink (250ml)", calories: 150, protein: 0, carbs: 35, fat: 0, fibre: 0 },
    "red square energy drink": { food: "Red Square Energy Drink (250ml)", calories: 150, protein: 0, carbs: 35, fat: 0, fibre: 0 },
    "kombucha": { food: "Kombucha (330ml)", calories: 120, protein: 0, carbs: 28, fat: 0, fibre: 1 },
    "fibratech": { food: "Fibratech Bar", calories: 170, protein: 6, carbs: 30, fat: 3, fibre: 8 },
    "fibratech bar": { food: "Fibratech Bar", calories: 170, protein: 6, carbs: 30, fat: 3, fibre: 8 },
    "galitos wings": { food: "Galito's Wings (6 piece)", calories: 500, protein: 40, carbs: 25, fat: 30, fibre: 1 },
    "galitos wings 6": { food: "Galito's Wings (6 piece)", calories: 500, protein: 40, carbs: 25, fat: 30, fibre: 1 },
    "chicken licken lips": { food: "Chicken Licken Lips (6 piece)", calories: 550, protein: 35, carbs: 30, fat: 35, fibre: 1 },
    "chicken licken lips 6": { food: "Chicken Licken Lips (6 piece)", calories: 550, protein: 35, carbs: 30, fat: 35, fibre: 1 },
    "ocean basket garlic prawns": { food: "Ocean Basket Garlic Prawns (serving)", calories: 420, protein: 30, carbs: 20, fat: 25, fibre: 1 },
    // Drinks
    "rooibos tea": { food: "Rooibos Tea (plain)", calories: 2, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "rooibos": { food: "Rooibos Tea (plain)", calories: 2, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "rooibos tea with milk": { food: "Rooibos Tea with Milk", calories: 40, protein: 2, carbs: 3, fat: 2, fibre: 0 },
    "rooibos with milk": { food: "Rooibos Tea with Milk", calories: 40, protein: 2, carbs: 3, fat: 2, fibre: 0 },
    "tea with milk": { food: "Tea with Milk", calories: 30, protein: 1, carbs: 3, fat: 1, fibre: 0 },
    "tea with milk and sugar": { food: "Tea with Milk & Sugar", calories: 50, protein: 1, carbs: 10, fat: 1, fibre: 0 },
    "nescafe cappuccino": { food: "Nescafé Cappuccino (sachet)", calories: 60, protein: 1, carbs: 10, fat: 2, fibre: 0 },
    "nescafe cappuccino sachet": { food: "Nescafé Cappuccino (sachet)", calories: 60, protein: 1, carbs: 10, fat: 2, fibre: 0 },
    "nescafe gold cappuccino": { food: "Nescafé Gold Cappuccino (sachet)", calories: 60, protein: 1, carbs: 10, fat: 2, fibre: 0 },
    "guinness": { food: "Guinness Draught (440ml)", calories: 176, protein: 2, carbs: 14, fat: 0, fibre: 0 },
    "guiness": { food: "Guinness Draught (440ml)", calories: 176, protein: 2, carbs: 14, fat: 0, fibre: 0 },
    "cup of coffee with milk": { food: "Coffee with Milk", calories: 30, protein: 1, carbs: 3, fat: 1, fibre: 0 },
    "coffee with full cream milk": { food: "Coffee with Full Cream Milk", calories: 45, protein: 2, carbs: 3, fat: 2, fibre: 0 },
    // Breakfast
    "hot cross bun": { food: "Hot Cross Bun (1)", calories: 180, protein: 4, carbs: 32, fat: 4, fibre: 1 },
    "condensed milk hot cross bun": { food: "Condensed Milk Hot Cross Bun (1)", calories: 220, protein: 4, carbs: 40, fat: 5, fibre: 1 },
    "weetbix": { food: "Weet-Bix (2 biscuits)", calories: 130, protein: 4, carbs: 23, fat: 1, fibre: 4 },
    "weetbix with milk": { food: "Weet-Bix (2) with Milk", calories: 260, protein: 12, carbs: 35, fat: 9, fibre: 4 },
    "2 weetbix": { food: "Weet-Bix (2 biscuits)", calories: 130, protein: 4, carbs: 23, fat: 1, fibre: 4 },
    "2 weetbix with milk": { food: "Weet-Bix (2) with Milk", calories: 260, protein: 12, carbs: 35, fat: 9, fibre: 4 },
    "bokomo oats": { food: "Bokomo Oats (1 sachet with milk)", calories: 250, protein: 8, carbs: 38, fat: 7, fibre: 4 },
    "50g oats": { food: "Oats (50g dry)", calories: 190, protein: 7, carbs: 32, fat: 4, fibre: 4 },
    "sourdough bread": { food: "Sourdough Bread (1 slice)", calories: 100, protein: 4, carbs: 18, fat: 1, fibre: 1 },
    "sourdough toast": { food: "Sourdough Toast (1 slice)", calories: 100, protein: 4, carbs: 18, fat: 1, fibre: 1 },
    "slice of sourdough": { food: "Sourdough Bread (1 slice)", calories: 100, protein: 4, carbs: 18, fat: 1, fibre: 1 },
    // Eggs (common combos hitting AI)
    "2 boiled eggs": { food: "2 Boiled Eggs", calories: 140, protein: 12, carbs: 1, fat: 10, fibre: 0 },
    "3 boiled eggs": { food: "3 Boiled Eggs", calories: 210, protein: 18, carbs: 2, fat: 15, fibre: 0 },
    "2 fried eggs": { food: "2 Fried Eggs", calories: 200, protein: 12, carbs: 1, fat: 16, fibre: 0 },
    "2 scrambled eggs": { food: "2 Scrambled Eggs (with butter)", calories: 200, protein: 12, carbs: 2, fat: 15, fibre: 0 },
    "2 poached eggs": { food: "2 Poached Eggs", calories: 140, protein: 12, carbs: 1, fat: 10, fibre: 0 },
    "3 egg whites": { food: "3 Egg Whites", calories: 51, protein: 11, carbs: 1, fat: 0, fibre: 0 },
    "3 x egg whites": { food: "3 Egg Whites", calories: 51, protein: 11, carbs: 1, fat: 0, fibre: 0 },
    "egg white": { food: "Egg White (1 large)", calories: 17, protein: 4, carbs: 0, fat: 0, fibre: 0 },
    "egg whites": { food: "Egg Whites (3)", calories: 51, protein: 11, carbs: 1, fat: 0, fibre: 0 },
    // SA snacks
    "tinkies": { food: "Tinkies (1)", calories: 190, protein: 2, carbs: 28, fat: 8, fibre: 0 },
    "tinkie": { food: "Tinkies (1)", calories: 190, protein: 2, carbs: 28, fat: 8, fibre: 0 },
    "freezo": { food: "Freezo Ice Lolly (1)", calories: 60, protein: 0, carbs: 15, fat: 0, fibre: 0 },
    "rice cake": { food: "Rice Cake (1)", calories: 35, protein: 1, carbs: 7, fat: 0, fibre: 0 },
    "rice cakes": { food: "Rice Cakes (2)", calories: 70, protein: 2, carbs: 14, fat: 0, fibre: 0 },
    "2 rice cakes": { food: "Rice Cakes (2)", calories: 70, protein: 2, carbs: 14, fat: 0, fibre: 0 },
    // Fruit & veg
    "beetroot": { food: "Beetroot (100g)", calories: 43, protein: 2, carbs: 10, fat: 0, fibre: 2 },
    "blueberries": { food: "Blueberries (100g)", calories: 57, protein: 1, carbs: 14, fat: 0, fibre: 2 },
    "100g blueberries": { food: "Blueberries (100g)", calories: 57, protein: 1, carbs: 14, fat: 0, fibre: 2 },
    "raspberries": { food: "Raspberries (100g)", calories: 52, protein: 1, carbs: 12, fat: 1, fibre: 7 },
    "dates": { food: "Dates (2 Medjool)", calories: 133, protein: 1, carbs: 36, fat: 0, fibre: 3 },
    "2 dates": { food: "Dates (2 Medjool)", calories: 133, protein: 1, carbs: 36, fat: 0, fibre: 3 },
    "date": { food: "Date (1 Medjool)", calories: 66, protein: 0, carbs: 18, fat: 0, fibre: 2 },
    "dried pear": { food: "Dried Pear (30g)", calories: 80, protein: 1, carbs: 19, fat: 0, fibre: 3 },
    "marrow": { food: "Marrow (100g cooked)", calories: 20, protein: 1, carbs: 3, fat: 0, fibre: 1 },
    "half avo": { food: "Half Avocado (~68g)", calories: 120, protein: 1, carbs: 6, fat: 11, fibre: 5 },
    // Dairy & cheese
    "toasted cheese": { food: "Toasted Cheese Sandwich", calories: 300, protein: 12, carbs: 30, fat: 15, fibre: 2 },
    "toasted cheese sandwich": { food: "Toasted Cheese Sandwich", calories: 300, protein: 12, carbs: 30, fat: 15, fibre: 2 },
    "grilled cheese": { food: "Grilled Cheese Sandwich", calories: 300, protein: 12, carbs: 30, fat: 15, fibre: 2 },
    "150g greek yogurt": { food: "Greek Yoghurt (150g)", calories: 146, protein: 13, carbs: 6, fat: 8, fibre: 0 },
    "150g greek yoghurt": { food: "Greek Yoghurt (150g)", calories: 146, protein: 13, carbs: 6, fat: 8, fibre: 0 },
    "greek yoghurt": { food: "Greek Yoghurt (150g)", calories: 146, protein: 13, carbs: 6, fat: 8, fibre: 0 },
    "greek yogurt": { food: "Greek Yoghurt (150g)", calories: 146, protein: 13, carbs: 6, fat: 8, fibre: 0 },
    "kiri cheese": { food: "Kiri Cream Cheese (1 portion)", calories: 40, protein: 2, carbs: 1, fat: 3, fibre: 0 },
    "kiri": { food: "Kiri Cream Cheese (1 portion)", calories: 40, protein: 2, carbs: 1, fat: 3, fibre: 0 },
    // Meat
    "braai lamb chop": { food: "Braai Lamb Chop (1)", calories: 230, protein: 20, carbs: 0, fat: 16, fibre: 0 },
    "braai lamb chops": { food: "Braai Lamb Chops (2)", calories: 460, protein: 40, carbs: 0, fat: 32, fibre: 0 },
    "braai lamb chops 4": { food: "Braai Lamb Chops (4)", calories: 920, protein: 80, carbs: 0, fat: 64, fibre: 0 },
    "lamb chop": { food: "Lamb Chop (1, grilled)", calories: 230, protein: 20, carbs: 0, fat: 16, fibre: 0 },
    "lamb chops": { food: "Lamb Chops (2, grilled)", calories: 460, protein: 40, carbs: 0, fat: 32, fibre: 0 },
    "ostrich meatballs": { food: "Ostrich Meatballs (6)", calories: 240, protein: 36, carbs: 8, fat: 6, fibre: 1 },
    "6 ostrich meatballs": { food: "Ostrich Meatballs (6)", calories: 240, protein: 36, carbs: 8, fat: 6, fibre: 1 },
    "6 ostrich meat balls": { food: "Ostrich Meatballs (6)", calories: 240, protein: 36, carbs: 8, fat: 6, fibre: 1 },
    "breaded fish": { food: "Breaded Fish Fillet (1)", calories: 250, protein: 15, carbs: 18, fat: 13, fibre: 1 },
    "breaded fish fillet": { food: "Breaded Fish Fillet (1)", calories: 250, protein: 15, carbs: 18, fat: 13, fibre: 1 },
    "battered fish": { food: "Battered Fish Fillet (1)", calories: 280, protein: 15, carbs: 20, fat: 15, fibre: 1 },
    "one droewors": { food: "Droëwors (1 stick, ~30g)", calories: 90, protein: 12, carbs: 1, fat: 5, fibre: 0 },
    "droewors stick": { food: "Droëwors (1 stick, ~30g)", calories: 90, protein: 12, carbs: 1, fat: 5, fibre: 0 },
    // Meals
    "chickpea curry": { food: "Chickpea Curry (serving)", calories: 350, protein: 12, carbs: 40, fat: 15, fibre: 8 },
    "pesto pasta": { food: "Pesto Pasta (serving)", calories: 450, protein: 14, carbs: 55, fat: 18, fibre: 3 },
    "indomie": { food: "Indomie Mi Goreng (1 packet)", calories: 390, protein: 8, carbs: 52, fat: 17, fibre: 2 },
    "indomie noodles": { food: "Indomie Noodles (1 packet)", calories: 390, protein: 8, carbs: 52, fat: 17, fibre: 2 },
    "toasted chicken wrap": { food: "Toasted Chicken Wrap", calories: 400, protein: 25, carbs: 35, fat: 18, fibre: 3 },
    "chicken wrap": { food: "Chicken Wrap", calories: 380, protein: 25, carbs: 35, fat: 16, fibre: 3 },
    // SA dairy drinks
    "first choice high protein": { food: "First Choice High Protein Milk (500ml)", calories: 250, protein: 35, carbs: 20, fat: 4, fibre: 0 },
    "first choice protein milk": { food: "First Choice High Protein Milk (500ml)", calories: 250, protein: 35, carbs: 20, fat: 4, fibre: 0 },
    // Wimpy
    "wimpy fullhouse breakfast": { food: "Wimpy Full Breakfast", calories: 800, protein: 35, carbs: 60, fat: 45, fibre: 4 },
    // Nutter smoothie (Nu restaurant — SA chain)
    "the nutter": { food: "Nu Large Nutter Smoothie", calories: 510, protein: 15, carbs: 65, fat: 22, fibre: 5 },
    "the nutter large": { food: "Nu Large Nutter Smoothie", calories: 510, protein: 15, carbs: 65, fat: 22, fibre: 5 },
    "large nutter": { food: "Nu Large Nutter Smoothie", calories: 510, protein: 15, carbs: 65, fat: 22, fibre: 5 },
    "nu nutter": { food: "Nu Large Nutter Smoothie", calories: 510, protein: 15, carbs: 65, fat: 22, fibre: 5 },
    "nu nutter smoothie": { food: "Nu Large Nutter Smoothie", calories: 510, protein: 15, carbs: 65, fat: 22, fibre: 5 },
    "nutter smoothie": { food: "Nu Large Nutter Smoothie", calories: 510, protein: 15, carbs: 65, fat: 22, fibre: 5 },
    // Diet protein (already had generic, adding common variant)
    "diet protein shake": { food: "Diet Protein Shake (1 scoop)", calories: 150, protein: 25, carbs: 8, fat: 2, fibre: 3 },
    "1 scoop whey protein": { food: "Whey Protein (1 scoop with water)", calories: 120, protein: 24, carbs: 3, fat: 2, fibre: 1 },
    // Round 22 - More common user inputs from debug-ai.log (bulk add)
    // Egg variants people type
    "1 egg": { food: "Egg (1, boiled)", calories: 70, protein: 6, carbs: 1, fat: 5, fibre: 0 },
    "2 eggs": { food: "2 Eggs (boiled)", calories: 140, protein: 12, carbs: 1, fat: 10, fibre: 0 },
    "3 eggs": { food: "3 Eggs (boiled)", calories: 210, protein: 18, carbs: 2, fat: 15, fibre: 0 },
    "4 eggs": { food: "4 Eggs (boiled)", calories: 280, protein: 24, carbs: 2, fat: 20, fibre: 0 },
    "1 hard boiled egg": { food: "Hard Boiled Egg (1)", calories: 70, protein: 6, carbs: 1, fat: 5, fibre: 0 },
    "two boiled eggs": { food: "2 Boiled Eggs", calories: 140, protein: 12, carbs: 1, fat: 10, fibre: 0 },
    "1 banana": { food: "Banana (1 medium)", calories: 90, protein: 1, carbs: 23, fat: 0, fibre: 3 },
    // Coffee variants
    "one coffee": { food: "Coffee with Milk", calories: 30, protein: 1, carbs: 3, fat: 1, fibre: 0 },
    "coffee and milk": { food: "Coffee with Milk", calories: 30, protein: 1, carbs: 3, fat: 1, fibre: 0 },
    "1 cup of coffee": { food: "Coffee with Milk", calories: 30, protein: 1, carbs: 3, fat: 1, fibre: 0 },
    "cup of coffee": { food: "Coffee with Milk", calories: 30, protein: 1, carbs: 3, fat: 1, fibre: 0 },
    "1 cup of coffee with milk": { food: "Coffee with Milk", calories: 30, protein: 1, carbs: 3, fat: 1, fibre: 0 },
    "2 cups of black coffee": { food: "2 Cups Black Coffee", calories: 4, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "sugar free cappuccino": { food: "Sugar Free Cappuccino", calories: 40, protein: 3, carbs: 4, fat: 2, fibre: 0 },
    // Tea variants
    "tea": { food: "Tea (plain)", calories: 2, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "one tea": { food: "Tea with Milk", calories: 30, protein: 1, carbs: 3, fat: 1, fibre: 0 },
    "1 cup of tea": { food: "Tea with Milk", calories: 30, protein: 1, carbs: 3, fat: 1, fibre: 0 },
    "cup of tea": { food: "Tea with Milk", calories: 30, protein: 1, carbs: 3, fat: 1, fibre: 0 },
    "1 cup tea with sugar": { food: "Tea with Milk & Sugar", calories: 50, protein: 1, carbs: 10, fat: 1, fibre: 0 },
    "joko tea": { food: "Joko Tea with Milk", calories: 30, protein: 1, carbs: 3, fat: 1, fibre: 0 },
    "peppermint tea": { food: "Peppermint Tea", calories: 2, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    // Bread/toast variants
    "1x white bread toast": { food: "White Toast (1 slice)", calories: 80, protein: 2, carbs: 15, fat: 1, fibre: 1 },
    "white toast": { food: "White Toast (1 slice)", calories: 80, protein: 2, carbs: 15, fat: 1, fibre: 1 },
    "toast and avocado": { food: "Toast with Avocado", calories: 200, protein: 4, carbs: 20, fat: 12, fibre: 5 },
    "toast with butter": { food: "Toast with Butter (1 slice)", calories: 120, protein: 2, carbs: 15, fat: 5, fibre: 1 },
    "1 slice of bread": { food: "Bread (1 slice)", calories: 80, protein: 3, carbs: 14, fat: 1, fibre: 1 },
    "slice of bread": { food: "Bread (1 slice)", calories: 80, protein: 3, carbs: 14, fat: 1, fibre: 1 },
    "slice of brown bread": { food: "Brown Bread (1 slice)", calories: 75, protein: 3, carbs: 14, fat: 1, fibre: 2 },
    "two slices of bread with butter": { food: "2 Slices Bread with Butter", calories: 240, protein: 5, carbs: 28, fat: 11, fibre: 2 },
    "two slices of white bread": { food: "2 Slices White Bread", calories: 160, protein: 5, carbs: 30, fat: 2, fibre: 2 },
    "two slices": { food: "2 Slices Bread", calories: 160, protein: 5, carbs: 28, fat: 2, fibre: 2 },
    "white roll": { food: "White Roll (1)", calories: 150, protein: 4, carbs: 28, fat: 2, fibre: 1 },
    "english muffin": { food: "English Muffin (1)", calories: 130, protein: 5, carbs: 25, fat: 1, fibre: 2 },
    "pita": { food: "Pita Bread (1)", calories: 165, protein: 5, carbs: 33, fat: 1, fibre: 1 },
    "1 pita": { food: "Pita Bread (1)", calories: 165, protein: 5, carbs: 33, fat: 1, fibre: 1 },
    "1 x pita": { food: "Pita Bread (1)", calories: 165, protein: 5, carbs: 33, fat: 1, fibre: 1 },
    "wrap": { food: "Wrap/Tortilla (1)", calories: 120, protein: 3, carbs: 20, fat: 3, fibre: 1 },
    "1 wrap": { food: "Wrap/Tortilla (1)", calories: 120, protein: 3, carbs: 20, fat: 3, fibre: 1 },
    "wraps": { food: "Wraps (2)", calories: 240, protein: 6, carbs: 40, fat: 6, fibre: 2 },
    "two wholewheat wraps": { food: "2 Wholewheat Wraps", calories: 220, protein: 8, carbs: 36, fat: 6, fibre: 4 },
    "seed loaf": { food: "Seed Loaf (1 slice)", calories: 90, protein: 4, carbs: 14, fat: 3, fibre: 2 },
    "woolworths seed loaf": { food: "Woolworths Seed Loaf (1 slice)", calories: 90, protein: 4, carbs: 14, fat: 3, fibre: 2 },
    "1 slice woolworths seed loaf": { food: "Woolworths Seed Loaf (1 slice)", calories: 90, protein: 4, carbs: 14, fat: 3, fibre: 2 },
    // Meat & fish
    "1 basa fish": { food: "Basa Fish Fillet (1)", calories: 130, protein: 22, carbs: 0, fat: 4, fibre: 0 },
    "basa fish": { food: "Basa Fish Fillet (1)", calories: 130, protein: 22, carbs: 0, fat: 4, fibre: 0 },
    "hake": { food: "Hake Fillet (grilled, ~150g)", calories: 150, protein: 30, carbs: 0, fat: 2, fibre: 0 },
    "1 chicken breast": { food: "Chicken Breast (1, ~150g)", calories: 230, protein: 35, carbs: 0, fat: 9, fibre: 0 },
    "1 chicken drumstick": { food: "Chicken Drumstick (1)", calories: 150, protein: 16, carbs: 0, fat: 9, fibre: 0 },
    "chicken drumstick": { food: "Chicken Drumstick (1)", calories: 150, protein: 16, carbs: 0, fat: 9, fibre: 0 },
    "2 chicken drumsticks": { food: "2 Chicken Drumsticks", calories: 300, protein: 32, carbs: 0, fat: 18, fibre: 0 },
    "chicken thigh": { food: "Chicken Thigh (1, with skin)", calories: 200, protein: 18, carbs: 0, fat: 14, fibre: 0 },
    "2 chicken thighs": { food: "2 Chicken Thighs", calories: 400, protein: 36, carbs: 0, fat: 28, fibre: 0 },
    "chicken kebab": { food: "Chicken Kebab (1 skewer)", calories: 180, protein: 22, carbs: 5, fat: 8, fibre: 1 },
    "chicken sosatie": { food: "Chicken Sosatie (1 skewer)", calories: 200, protein: 22, carbs: 8, fat: 8, fibre: 1 },
    "1 chicken sosatie": { food: "Chicken Sosatie (1 skewer)", calories: 200, protein: 22, carbs: 8, fat: 8, fibre: 1 },
    "steak": { food: "Steak (~200g, grilled)", calories: 400, protein: 50, carbs: 0, fat: 20, fibre: 0 },
    "150g steak": { food: "Steak (150g, grilled)", calories: 300, protein: 38, carbs: 0, fat: 15, fibre: 0 },
    "100g steak": { food: "Steak (100g, grilled)", calories: 200, protein: 25, carbs: 0, fat: 10, fibre: 0 },
    "200g steak": { food: "Steak (200g, grilled)", calories: 400, protein: 50, carbs: 0, fat: 20, fibre: 0 },
    "300g steak": { food: "Steak (300g, grilled)", calories: 600, protein: 75, carbs: 0, fat: 30, fibre: 0 },
    "roast beef": { food: "Roast Beef (100g)", calories: 200, protein: 25, carbs: 0, fat: 10, fibre: 0 },
    "tuna": { food: "Tuna in Brine (1 can, drained)", calories: 120, protein: 26, carbs: 0, fat: 1, fibre: 0 },
    "1 can tuna": { food: "Tuna in Brine (1 can)", calories: 120, protein: 26, carbs: 0, fat: 1, fibre: 0 },
    "tuna in olive oil": { food: "Tuna in Olive Oil (1 can)", calories: 200, protein: 26, carbs: 0, fat: 10, fibre: 0 },
    "tuna chunks in vegetable oil": { food: "Tuna in Oil (1 can)", calories: 200, protein: 26, carbs: 0, fat: 10, fibre: 0 },
    "salami": { food: "Salami (3 slices, ~30g)", calories: 100, protein: 7, carbs: 0, fat: 8, fibre: 0 },
    "wors": { food: "Boerewors (1 piece ~150g)", calories: 450, protein: 22, carbs: 3, fat: 38, fibre: 0 },
    "2 viennas": { food: "2 Vienna Sausages", calories: 320, protein: 12, carbs: 4, fat: 28, fibre: 0 },
    "pork sausage": { food: "Pork Sausage (1)", calories: 200, protein: 10, carbs: 2, fat: 16, fibre: 0 },
    "1 pork sausage": { food: "Pork Sausage (1)", calories: 200, protein: 10, carbs: 2, fat: 16, fibre: 0 },
    // Fruit
    "1 pear": { food: "Pear (1 medium)", calories: 100, protein: 1, carbs: 25, fat: 0, fibre: 5 },
    "plum": { food: "Plum (1)", calories: 30, protein: 0, carbs: 8, fat: 0, fibre: 1 },
    "small plum": { food: "Plum (1 small)", calories: 30, protein: 0, carbs: 8, fat: 0, fibre: 1 },
    "nartjie": { food: "Nartjie (1)", calories: 40, protein: 1, carbs: 10, fat: 0, fibre: 2 },
    "two nartjies": { food: "2 Nartjies", calories: 80, protein: 2, carbs: 20, fat: 0, fibre: 4 },
    "grapes": { food: "Grapes (handful, ~80g)", calories: 55, protein: 1, carbs: 14, fat: 0, fibre: 1 },
    "10 grapes": { food: "Grapes (10)", calories: 35, protein: 0, carbs: 9, fat: 0, fibre: 0 },
    "grenadilla": { food: "Granadilla (1)", calories: 18, protein: 0, carbs: 4, fat: 0, fibre: 2 },
    "1 grenadilla": { food: "Granadilla (1)", calories: 18, protein: 0, carbs: 4, fat: 0, fibre: 2 },
    "pineapple": { food: "Pineapple (1 cup, ~165g)", calories: 82, protein: 1, carbs: 22, fat: 0, fibre: 2 },
    "two pieces of pineapple": { food: "Pineapple (2 pieces)", calories: 40, protein: 0, carbs: 10, fat: 0, fibre: 1 },
    "green apple": { food: "Green Apple (1 medium)", calories: 80, protein: 0, carbs: 20, fat: 0, fibre: 3 },
    "1 green apple": { food: "Green Apple (1 medium)", calories: 80, protein: 0, carbs: 20, fat: 0, fibre: 3 },
    // Vegetables
    "onion": { food: "Onion (1 medium)", calories: 44, protein: 1, carbs: 10, fat: 0, fibre: 2 },
    "2 mushrooms": { food: "Mushrooms (2 medium)", calories: 8, protein: 1, carbs: 1, fat: 0, fibre: 0 },
    "mushrooms": { food: "Mushrooms (100g)", calories: 22, protein: 3, carbs: 3, fat: 0, fibre: 1 },
    "bell pepper": { food: "Bell Pepper (1 medium)", calories: 30, protein: 1, carbs: 6, fat: 0, fibre: 2 },
    "some bell peppers": { food: "Bell Peppers (~100g)", calories: 30, protein: 1, carbs: 6, fat: 0, fibre: 2 },
    "spinach": { food: "Spinach (100g cooked)", calories: 23, protein: 3, carbs: 4, fat: 0, fibre: 2 },
    "broccoli": { food: "Broccoli (100g)", calories: 34, protein: 3, carbs: 7, fat: 0, fibre: 3 },
    "cabbage": { food: "Cabbage (1 cup)", calories: 22, protein: 1, carbs: 5, fat: 0, fibre: 2 },
    "cauliflower": { food: "Cauliflower (100g)", calories: 25, protein: 2, carbs: 5, fat: 0, fibre: 2 },
    "steamed veg": { food: "Steamed Vegetables (~150g)", calories: 50, protein: 3, carbs: 10, fat: 0, fibre: 4 },
    "150g steamed veg": { food: "Steamed Vegetables (150g)", calories: 50, protein: 3, carbs: 10, fat: 0, fibre: 4 },
    // Dairy
    "150ml full cream milk": { food: "Full Cream Milk (150ml)", calories: 95, protein: 5, carbs: 7, fat: 5, fibre: 0 },
    "1/2 cup of full cream milk": { food: "Full Cream Milk (125ml)", calories: 80, protein: 4, carbs: 6, fat: 4, fibre: 0 },
    "yogurt": { food: "Yoghurt (175g)", calories: 100, protein: 5, carbs: 13, fat: 3, fibre: 0 },
    "yoghurt": { food: "Yoghurt (175g)", calories: 100, protein: 5, carbs: 13, fat: 3, fibre: 0 },
    "two tablespoons of cottage cheese": { food: "Cottage Cheese (2 tbsp)", calories: 30, protein: 4, carbs: 1, fat: 1, fibre: 0 },
    // Condiments & extras
    "tablespoon butter": { food: "Butter (1 tbsp)", calories: 100, protein: 0, carbs: 0, fat: 11, fibre: 0 },
    "1 tablespoon of olive oil": { food: "Olive Oil (1 tbsp)", calories: 120, protein: 0, carbs: 0, fat: 14, fibre: 0 },
    "table spoon of olive oil": { food: "Olive Oil (1 tbsp)", calories: 120, protein: 0, carbs: 0, fat: 14, fibre: 0 },
    "1 tsp peanut butter": { food: "Peanut Butter (1 tsp)", calories: 33, protein: 1, carbs: 1, fat: 3, fibre: 0 },
    "1tbsp peanut butter": { food: "Peanut Butter (1 tbsp)", calories: 95, protein: 4, carbs: 3, fat: 8, fibre: 1 },
    "teaspoon of honey": { food: "Honey (1 tsp)", calories: 21, protein: 0, carbs: 6, fat: 0, fibre: 0 },
    "tea spoon of honey": { food: "Honey (1 tsp)", calories: 21, protein: 0, carbs: 6, fat: 0, fibre: 0 },
    "some honey": { food: "Honey (1 tbsp)", calories: 64, protein: 0, carbs: 17, fat: 0, fibre: 0 },
    "1 teaspoon of sugar": { food: "Sugar (1 tsp)", calories: 16, protein: 0, carbs: 4, fat: 0, fibre: 0 },
    "1 tsp sugar": { food: "Sugar (1 tsp)", calories: 16, protein: 0, carbs: 4, fat: 0, fibre: 0 },
    "1 sugar": { food: "Sugar (1 tsp)", calories: 16, protein: 0, carbs: 4, fat: 0, fibre: 0 },
    "tzatziki": { food: "Tzatziki (2 tbsp)", calories: 35, protein: 2, carbs: 2, fat: 2, fibre: 0 },
    "hummus": { food: "Hummus (2 tbsp)", calories: 70, protein: 2, carbs: 6, fat: 4, fibre: 1 },
    "mayo": { food: "Mayonnaise (1 tbsp)", calories: 94, protein: 0, carbs: 0, fat: 10, fibre: 0 },
    "tomato chutney": { food: "Tomato Chutney (1 tbsp)", calories: 25, protein: 0, carbs: 6, fat: 0, fibre: 0 },
    // SA snacks & chocolate
    "marshmallow easter egg": { food: "Marshmallow Easter Egg (1)", calories: 75, protein: 1, carbs: 14, fat: 2, fibre: 0 },
    "marsmellow easter egg": { food: "Marshmallow Easter Egg (1)", calories: 75, protein: 1, carbs: 14, fat: 2, fibre: 0 },
    "beacon marshmallow egg": { food: "Beacon Marshmallow Egg (1)", calories: 75, protein: 1, carbs: 14, fat: 2, fibre: 0 },
    "1 beacon marshmallow egg": { food: "Beacon Marshmallow Egg (1)", calories: 75, protein: 1, carbs: 14, fat: 2, fibre: 0 },
    "two beacon marshmallow eggs": { food: "2 Beacon Marshmallow Eggs", calories: 150, protein: 2, carbs: 28, fat: 4, fibre: 0 },
    "chomp": { food: "Chomp Chocolate Bar", calories: 130, protein: 1, carbs: 17, fat: 6, fibre: 0 },
    "1 chomp": { food: "Chomp Chocolate Bar", calories: 130, protein: 1, carbs: 17, fat: 6, fibre: 0 },
    "chomp chocolate": { food: "Chomp Chocolate Bar", calories: 130, protein: 1, carbs: 17, fat: 6, fibre: 0 },
    "small kitkat": { food: "KitKat (2 finger)", calories: 105, protein: 1, carbs: 13, fat: 5, fibre: 0 },
    "kitkat": { food: "KitKat (4 finger)", calories: 210, protein: 3, carbs: 27, fat: 11, fibre: 0 },
    "oreo": { food: "Oreo (1 cookie)", calories: 55, protein: 1, carbs: 8, fat: 2, fibre: 0 },
    "1 oreo": { food: "Oreo (1 cookie)", calories: 55, protein: 1, carbs: 8, fat: 2, fibre: 0 },
    "small jelly tots": { food: "Jelly Tots (small bag, 40g)", calories: 140, protein: 2, carbs: 33, fat: 0, fibre: 0 },
    "jelly tots": { food: "Jelly Tots (100g bag)", calories: 350, protein: 5, carbs: 82, fat: 0, fibre: 0 },
    // Drinks (alcohol)
    "red wine": { food: "Red Wine (1 glass, 175ml)", calories: 125, protein: 0, carbs: 4, fat: 0, fibre: 0 },
    "1 glass red wine": { food: "Red Wine (1 glass, 175ml)", calories: 125, protein: 0, carbs: 4, fat: 0, fibre: 0 },
    "red wine glass": { food: "Red Wine (1 glass, 175ml)", calories: 125, protein: 0, carbs: 4, fat: 0, fibre: 0 },
    "two glasses red wine": { food: "2 Glasses Red Wine", calories: 250, protein: 0, carbs: 8, fat: 0, fibre: 0 },
    "white wine": { food: "White Wine (1 glass, 175ml)", calories: 130, protein: 0, carbs: 4, fat: 0, fibre: 0 },
    "stella": { food: "Stella Artois (440ml)", calories: 190, protein: 1, carbs: 14, fat: 0, fibre: 0 },
    "1 stella": { food: "Stella Artois (440ml)", calories: 190, protein: 1, carbs: 14, fat: 0, fibre: 0 },
    "stella beer": { food: "Stella Artois (440ml)", calories: 190, protein: 1, carbs: 14, fat: 0, fibre: 0 },
    "1 draught beer": { food: "Draught Beer (500ml)", calories: 200, protein: 1, carbs: 15, fat: 0, fibre: 0 },
    "draught beer": { food: "Draught Beer (500ml)", calories: 200, protein: 1, carbs: 15, fat: 0, fibre: 0 },
    "windhoek draught": { food: "Windhoek Draught (440ml)", calories: 165, protein: 1, carbs: 13, fat: 0, fibre: 0 },
    "1 x windhoek draft": { food: "Windhoek Draught (440ml)", calories: 165, protein: 1, carbs: 13, fat: 0, fibre: 0 },
    "1 shot of amarula": { food: "Amarula (1 shot, 50ml)", calories: 140, protein: 0, carbs: 16, fat: 3, fibre: 0 },
    "redbull": { food: "Red Bull (250ml)", calories: 112, protein: 0, carbs: 27, fat: 0, fibre: 0 },
    "1 redbull": { food: "Red Bull (250ml)", calories: 112, protein: 0, carbs: 27, fat: 0, fibre: 0 },
    "sugar free red bull": { food: "Red Bull Sugar Free (250ml)", calories: 5, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "sugar free coke": { food: "Coke Zero (330ml)", calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    "sprite": { food: "Sprite (330ml)", calories: 140, protein: 0, carbs: 35, fat: 0, fibre: 0 },
    "original taste coke": { food: "Coca-Cola (330ml)", calories: 140, protein: 0, carbs: 35, fat: 0, fibre: 0 },
    "coke": { food: "Coca-Cola (330ml)", calories: 140, protein: 0, carbs: 35, fat: 0, fibre: 0 },
    "sparkling water": { food: "Sparkling Water", calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
    // Meals
    "toasted cheese and ham": { food: "Toasted Cheese & Ham Sandwich", calories: 380, protein: 18, carbs: 30, fat: 20, fibre: 2 },
    "toasted tuna sandwich": { food: "Toasted Tuna Sandwich", calories: 350, protein: 20, carbs: 30, fat: 16, fibre: 2 },
    "shepherds pie": { food: "Shepherd's Pie (serving)", calories: 400, protein: 20, carbs: 35, fat: 20, fibre: 3 },
    "cottage pie": { food: "Cottage Pie (serving)", calories: 400, protein: 22, carbs: 35, fat: 18, fibre: 3 },
    "small cottage pie": { food: "Cottage Pie (small)", calories: 280, protein: 15, carbs: 25, fat: 13, fibre: 2 },
    "vegetable soup": { food: "Vegetable Soup (bowl)", calories: 120, protein: 4, carbs: 18, fat: 3, fibre: 4 },
    "chicken soup": { food: "Chicken Soup (bowl)", calories: 150, protein: 10, carbs: 15, fat: 5, fibre: 2 },
    "soup": { food: "Soup (bowl)", calories: 150, protein: 6, carbs: 18, fat: 5, fibre: 3 },
    "samp with beef stew": { food: "Samp with Beef Stew", calories: 500, protein: 25, carbs: 60, fat: 16, fibre: 6 },
    "mince lasagna": { food: "Mince Lasagna (serving)", calories: 500, protein: 25, carbs: 40, fat: 25, fibre: 3 },
    "lasagna": { food: "Lasagna (serving)", calories: 500, protein: 25, carbs: 40, fat: 25, fibre: 3 },
    "3 hotdogs": { food: "3 Hotdogs", calories: 900, protein: 30, carbs: 75, fat: 48, fibre: 3 },
    "hotdog": { food: "Hotdog (1)", calories: 300, protein: 10, carbs: 25, fat: 16, fibre: 1 },
    "nachos": { food: "Nachos (small portion)", calories: 350, protein: 10, carbs: 35, fat: 18, fibre: 3 },
    "taco": { food: "Taco (1)", calories: 250, protein: 12, carbs: 20, fat: 14, fibre: 2 },
    "sweet chilli chicken wrap": { food: "Sweet Chilli Chicken Wrap", calories: 420, protein: 25, carbs: 40, fat: 18, fibre: 3 },
    // SA specific
    "woolworths hot cross bun": { food: "Woolworths Hot Cross Bun (1)", calories: 190, protein: 4, carbs: 35, fat: 4, fibre: 1 },
    "two hot cross buns": { food: "2 Hot Cross Buns", calories: 360, protein: 8, carbs: 64, fat: 8, fibre: 2 },
    "woolworths crumbed chicken schnitzel": { food: "Woolworths Chicken Schnitzel (1)", calories: 350, protein: 25, carbs: 20, fat: 18, fibre: 1 },
    "woolies chicken strips": { food: "Woolworths Chicken Strips (serving)", calories: 350, protein: 25, carbs: 20, fat: 18, fibre: 1 },
    "woolworths luxury tree nuts 30g": { food: "Woolworths Tree Nuts (30g)", calories: 185, protein: 5, carbs: 4, fat: 17, fibre: 2 },
    "1 checkers chicken wrap": { food: "Checkers Chicken Wrap", calories: 380, protein: 22, carbs: 35, fat: 16, fibre: 2 },
    "checkers chicken wrap": { food: "Checkers Chicken Wrap", calories: 380, protein: 22, carbs: 35, fat: 16, fibre: 2 },
    "spar blueberry muffin": { food: "Spar Blueberry Muffin (medium)", calories: 380, protein: 5, carbs: 50, fat: 18, fibre: 1 },
    "spar medium blueberry muffin": { food: "Spar Blueberry Muffin (medium)", calories: 380, protein: 5, carbs: 50, fat: 18, fibre: 1 },
    "vanilla muffin": { food: "Vanilla Muffin", calories: 350, protein: 5, carbs: 48, fat: 16, fibre: 1 },
    "muffin": { food: "Muffin (1 medium)", calories: 350, protein: 5, carbs: 48, fat: 16, fibre: 1 },
    // Noodles
    "maggi 2 minute noodles": { food: "Maggi 2 Minute Noodles (1 packet)", calories: 370, protein: 8, carbs: 50, fat: 15, fibre: 2 },
    "2 minute noodles": { food: "2 Minute Noodles (1 packet)", calories: 370, protein: 8, carbs: 50, fat: 15, fibre: 2 },
    // Quick SA items
    "samoosa": { food: "Samoosa (1, chicken)", calories: 150, protein: 6, carbs: 15, fat: 7, fibre: 1 },
    "samosa": { food: "Samosa (1, chicken)", calories: 150, protein: 6, carbs: 15, fat: 7, fibre: 1 },
    "1 x chicken samoosa": { food: "Chicken Samoosa (1)", calories: 150, protein: 6, carbs: 15, fat: 7, fibre: 1 },
    "1 x chicken samosa": { food: "Chicken Samosa (1)", calories: 150, protein: 6, carbs: 15, fat: 7, fibre: 1 },
    "mini sausage roll": { food: "Mini Sausage Roll (1)", calories: 120, protein: 4, carbs: 10, fat: 7, fibre: 0 },
    "1 x mini sausage roll": { food: "Mini Sausage Roll (1)", calories: 120, protein: 4, carbs: 10, fat: 7, fibre: 0 },
    "sausage roll": { food: "Sausage Roll (1)", calories: 280, protein: 8, carbs: 22, fat: 18, fibre: 1 },
    "mini steak pie": { food: "Mini Steak Pie (1)", calories: 250, protein: 8, carbs: 22, fat: 14, fibre: 1 },
    "1 x mini steak pie": { food: "Mini Steak Pie (1)", calories: 250, protein: 8, carbs: 22, fat: 14, fibre: 1 },
    "steak pie": { food: "Steak Pie (1)", calories: 450, protein: 15, carbs: 40, fat: 25, fibre: 2 },
    "spinach quiche slice": { food: "Spinach Quiche (1 slice)", calories: 280, protein: 10, carbs: 18, fat: 18, fibre: 2 },
    "quiche": { food: "Quiche (1 slice)", calories: 300, protein: 12, carbs: 20, fat: 18, fibre: 1 },
    // Ice cream / dessert
    "soft serve": { food: "Soft Serve Cone", calories: 200, protein: 4, carbs: 30, fat: 7, fibre: 0 },
    "soft serve cone": { food: "Soft Serve Cone", calories: 200, protein: 4, carbs: 30, fat: 7, fibre: 0 },
    "soft serve cone ice cream": { food: "Soft Serve Cone", calories: 200, protein: 4, carbs: 30, fat: 7, fibre: 0 },
    // Couscous
    "couscous": { food: "Couscous (1 cup cooked)", calories: 175, protein: 6, carbs: 36, fat: 0, fibre: 2 },
    "cous cous": { food: "Couscous (1 cup cooked)", calories: 175, protein: 6, carbs: 36, fat: 0, fibre: 2 },
    "quarter cup couscous": { food: "Couscous (1/4 cup dry)", calories: 160, protein: 6, carbs: 33, fat: 0, fibre: 2 },
    // Grains
    "quinoa": { food: "Quinoa (1 cup cooked)", calories: 222, protein: 8, carbs: 39, fat: 4, fibre: 5 },
    "1 cup quinoa": { food: "Quinoa (1 cup cooked)", calories: 222, protein: 8, carbs: 39, fat: 4, fibre: 5 },
    "1 cup white rice": { food: "White Rice (1 cup cooked)", calories: 205, protein: 4, carbs: 45, fat: 0, fibre: 1 },
    "1tbsp chia seeds": { food: "Chia Seeds (1 tbsp)", calories: 58, protein: 2, carbs: 5, fat: 4, fibre: 4 },
    "chia seeds": { food: "Chia Seeds (1 tbsp)", calories: 58, protein: 2, carbs: 5, fat: 4, fibre: 4 },
    // Popcorn
    "popcorn": { food: "Popcorn (1 cup, air-popped)", calories: 31, protein: 1, carbs: 6, fat: 0, fibre: 1 },
    // Dried fruit
    "raisins": { food: "Raisins (30g)", calories: 85, protein: 1, carbs: 22, fat: 0, fibre: 1 },
    "dried fruit": { food: "Dried Fruit Mix (30g)", calories: 80, protein: 1, carbs: 20, fat: 0, fibre: 2 },
    // Jungle bars
    "jungle energy bar": { food: "Jungle Energy Bar (1)", calories: 200, protein: 3, carbs: 30, fat: 8, fibre: 2 },
    "1 jungle energy bar": { food: "Jungle Energy Bar (1)", calories: 200, protein: 3, carbs: 30, fat: 8, fibre: 2 },
    "jungle oats bar": { food: "Jungle Oats Bar (1)", calories: 180, protein: 3, carbs: 28, fat: 7, fibre: 2 },
    // KFC extras
    "kfc boxmaster": { food: "KFC Boxmaster", calories: 650, protein: 30, carbs: 55, fat: 32, fibre: 3 },
    "10 kfc dunked wings": { food: "KFC Dunked Wings (10)", calories: 800, protein: 60, carbs: 30, fat: 50, fibre: 2 },
    // McDonalds
    "mcdonalds junior cheeseburger": { food: "McDonald's Junior Cheeseburger", calories: 290, protein: 14, carbs: 28, fat: 13, fibre: 1 },
    "two mc donalds junior cheese burgers": { food: "2 McDonald's Junior Cheeseburgers", calories: 580, protein: 28, carbs: 56, fat: 26, fibre: 2 },
    "sausage egg mcmuffin": { food: "McDonald's Sausage & Egg McMuffin", calories: 450, protein: 20, carbs: 30, fat: 27, fibre: 1 },
    "1 mac donald's sausage egg mc muffin": { food: "McDonald's Sausage & Egg McMuffin", calories: 450, protein: 20, carbs: 30, fat: 27, fibre: 1 },
    // Salmon
    "salmon": { food: "Salmon Fillet (150g, grilled)", calories: 300, protein: 34, carbs: 0, fat: 18, fibre: 0 },
    "salmon bagel": { food: "Salmon Bagel", calories: 400, protein: 20, carbs: 45, fat: 14, fibre: 2 },
    "salmon fish cake": { food: "Salmon Fish Cake (1)", calories: 180, protein: 10, carbs: 15, fat: 9, fibre: 1 },
    // Potatoes
    "potato": { food: "Potato (1 medium, ~150g)", calories: 130, protein: 3, carbs: 30, fat: 0, fibre: 2 },
    "1 potato": { food: "Potato (1 medium)", calories: 130, protein: 3, carbs: 30, fat: 0, fibre: 2 },
    "1 large potato": { food: "Large Potato (1, ~300g)", calories: 260, protein: 6, carbs: 60, fat: 0, fibre: 4 },
    "roast potatoes": { food: "Roast Potatoes (3 wedges)", calories: 200, protein: 3, carbs: 28, fat: 8, fibre: 2 },
    "mash": { food: "Mashed Potato (serving)", calories: 200, protein: 4, carbs: 30, fat: 7, fibre: 2 },
    // Baked beans
    "baked beans": { food: "Baked Beans (1 cup, ~250g)", calories: 240, protein: 12, carbs: 40, fat: 2, fibre: 10 },
    "koo baked beans": { food: "KOO Baked Beans (1 cup)", calories: 240, protein: 12, carbs: 40, fat: 2, fibre: 10 },
    // Mielie
    "mielie": { food: "Mielie/Corn on the Cob (1)", calories: 90, protein: 3, carbs: 19, fat: 1, fibre: 2 },
    "1 mielie": { food: "Mielie/Corn on the Cob (1)", calories: 90, protein: 3, carbs: 19, fat: 1, fibre: 2 },
    "corn on the cob": { food: "Corn on the Cob (1)", calories: 90, protein: 3, carbs: 19, fat: 1, fibre: 2 },
    // Burfee
    "burfee": { food: "Burfee (1 piece)", calories: 120, protein: 2, carbs: 18, fat: 5, fibre: 0 },
    // Round 23 - nightly edge case test 2026-03-30
    "two slices french toast": { food: "French Toast (2 slices)", calories: 420, protein: 12, carbs: 52, fat: 18, fibre: 2 },
    "french toast": { food: "French Toast (2 slices)", calories: 420, protein: 12, carbs: 52, fat: 18, fibre: 2 },
    "french toast 1 slice": { food: "French Toast (1 slice)", calories: 210, protein: 6, carbs: 26, fat: 9, fibre: 1 },
    "bar one milkshake": { food: "Bar One Milkshake", calories: 550, protein: 12, carbs: 75, fat: 22, fibre: 1 },
    // Round 24 - nightly edge case test 2026-03-31
    "chutney sandwich": { food: "Chutney Sandwich (2 slices bread)", calories: 250, protein: 5, carbs: 42, fat: 7, fibre: 2 },
    "grilled chicken salad": { food: "Grilled Chicken Salad", calories: 350, protein: 30, carbs: 12, fat: 18, fibre: 4 },
    "steers flame grilled rib burger": { food: "Steers Flame Grilled Rib Burger", calories: 650, protein: 35, carbs: 45, fat: 35, fibre: 3 },
    "steers rib burger": { food: "Steers Rib Burger", calories: 650, protein: 35, carbs: 45, fat: 35, fibre: 3 },
    "nandos butterfly chicken": { food: "Nando's Butterfly Chicken (whole)", calories: 1400, protein: 120, carbs: 5, fat: 95, fibre: 0 },
    "nandos butterfly": { food: "Nando's Butterfly Chicken (whole)", calories: 1400, protein: 120, carbs: 5, fat: 95, fibre: 0 },
    "butterfly chicken": { food: "Nando's Butterfly Chicken (whole)", calories: 1400, protein: 120, carbs: 5, fat: 95, fibre: 0 },
    // Round 25 - nightly edge case test 2026-04-01
    "mugg and bean breakfast wrap": { food: "Mugg & Bean Breakfast Wrap", calories: 550, protein: 25, carbs: 45, fat: 30, fibre: 3 },
    "mugg and bean wrap": { food: "Mugg & Bean Breakfast Wrap", calories: 550, protein: 25, carbs: 45, fat: 30, fibre: 3 },
    "rocomamas smash burger with chips": { food: "RocoMamas Smash Burger with Chips", calories: 1050, protein: 45, carbs: 85, fat: 55, fibre: 5 },
    "rocomamas burger and chips": { food: "RocoMamas Smash Burger with Chips", calories: 1050, protein: 45, carbs: 85, fat: 55, fibre: 5 },
    // Round 26 - nightly edge case test 2026-04-04
    "spur baby back ribs": { food: "Spur Baby Back Ribs (full)", calories: 950, protein: 55, carbs: 10, fat: 65, fibre: 1 },
    "baby back ribs": { food: "Baby Back Ribs (full serving)", calories: 950, protein: 55, carbs: 10, fat: 65, fibre: 1 },
    // Round 27 - nightly edge case test 2026-04-10
    "tropika tropicol": { food: "Tropika Tropicol (500ml)", calories: 160, protein: 0, carbs: 40, fat: 0, fibre: 0 },
    "chicken licken lips": { food: "Chicken Licken Lips (6 pieces)", calories: 550, protein: 30, carbs: 25, fat: 35, fibre: 2 },
    // Round 28 - nightly edge case test 2026-04-11
    "red square energy drink": { food: "Red Square Energy Drink 500ml", calories: 160, protein: 0, carbs: 40, fat: 0, fibre: 0 },
    // Round 29 - nightly edge case test 2026-04-12
    "chicken licken lots of legs": { food: "Chicken Licken Lots of Legs (8 piece)", calories: 1500, protein: 90, carbs: 40, fat: 85, fibre: 2 },
    "chicken licken lips 6": { food: "Chicken Licken Lips (6 pieces)", calories: 650, protein: 35, carbs: 30, fat: 40, fibre: 2 },
    "kombucha": { food: "Kombucha (500ml bottle)", calories: 140, protein: 0, carbs: 35, fat: 0, fibre: 0 },
    "fibratech": { food: "Fibratech Bar", calories: 170, protein: 15, carbs: 22, fat: 5, fibre: 8 },
    "ocean basket garlic prawns": { food: "Ocean Basket Garlic Prawns (portion)", calories: 450, protein: 35, carbs: 15, fat: 25, fibre: 1 },
    "kombucha 500ml": { food: "Kombucha 500ml", calories: 120, protein: 0, carbs: 28, fat: 0, fibre: 0 },
    "ocean basket garlic prawns": { food: "Ocean Basket Garlic Prawns (200g)", calories: 450, protein: 30, carbs: 15, fat: 28, fibre: 1 },
    // Round 30 - nightly edge case test 2026-04-13
    "nandos chicken wraps 2": { food: "2x Nando's Chicken Wrap", calories: 550, protein: 35, carbs: 50, fat: 28, fibre: 5 },
    "pick n pay samoosa 3": { food: "3x Pick n Pay samoosa", calories: 400, protein: 10, carbs: 45, fat: 22, fibre: 4 },
    "ocean basket hake": { food: "Ocean Basket Hake & Chips", calories: 400, protein: 30, carbs: 35, fat: 22, fibre: 3 },
    // Round 31 - nightly edge case test 2026-04-14
    "sparlenthus": { food: "Sparlenthus (500ml)", calories: 200, protein: 0, carbs: 50, fat: 0, fibre: 0 },
    "sugar bird friday": { food: "Sugar Bird Friday (250ml)", calories: 180, protein: 0, carbs: 22, fat: 0, fibre: 0 },
    "disco Milo jar": { food: "Disco Milo Jar (400g)", calories: 450, protein: 12, carbs: 70, fat: 12, fibre: 2 },
    // Round 32 - nightly edge case test 2026-04-15
    "pick n pay samoosa 4": { food: "4x Pick n Pay samoosa", calories: 440, protein: 10, carbs: 50, fat: 24, fibre: 4 },
    "ocean basket grilled calamari": { food: "Ocean Basket Grilled Calamari (serving)", calories: 550, protein: 35, carbs: 35, fat: 28, fibre: 2 },
    "woolworths chicken lasagne": { food: "Woolworths Chicken Lasagne (serving)", calories: 500, protein: 25, carbs: 45, fat: 22, fibre: 4 },
    // Round 33 - nightly edge case test 2026-04-15
    "chicken licken 6 piece": { food: "Chicken Licken 6-Piece Box", calories: 1050, protein: 70, carbs: 35, fat: 65, fibre: 2 },
    "ocean basket kingklip": { food: "Ocean Basket Kingklip (serving)", calories: 450, protein: 40, carbs: 15, fat: 22, fibre: 1 },
    "vida e caffe avo toast": { food: "Vida e Caffè Avo Toast (2 slices)", calories: 450, protein: 10, carbs: 35, fat: 28, fibre: 8 },
  };
  // Check overrides (exact match first, then includes)
  if (overrides[lower]) return overrides[lower];
  const overrideKey = Object.keys(overrides).find(k => lower === k);
  if (overrideKey) return overrides[overrideKey];

  // 2. Check simple common foods FIRST (before expensive DB/API calls)
  // Extract quantity multiplier from input
  const extractQuantity = (text) => {
    const numMatch = text.match(/^(\d+)\s/); // "5 eggs"
    if (numMatch) return parseInt(numMatch[1]);
    
    const wordMatch = text.match(/^(two|three|four|five|six|seven|eight|nine|ten)\s/i);
    if (wordMatch) {
      const wordToNum = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
      return wordToNum[wordMatch[1].toLowerCase()] || 1;
    }
    
    return 1;
  };
  
  const simple = {
    "acai bowl": 350,
    "ale": 180,
    "all bran": 90,
    "almond butter": 200,
    "almond milk latte": 100,
    "almonds": 160,
    "americano": 10,
    "apple": 80,
    "apple juice": 120,
    "asparagus": 20,
    "avo": 240,
    "avocado": 240,
    "bacon": 160,
    "bacon rasher": 40,
    "baked chicken": 165,
    "baked potato": 180,
    "banana": 90,
    "bar one": 240,
    "basmati rice": 190,
    "beans": 110,
    "beef": 250,
    "beef and rice": 500,
    "beef curry": 500,
    "beef jerky": 160,
    "beef mince": 250,
    "beef patty": 250,
    "beef stew": 400,
    "beef stir fry": 450,
    "beer": 150,
    "bell pepper": 30,
    "berries": 50,
    "berry smoothie": 180,
    "big mac": 550,
    "biltong": 150,
    "biscuit": 50,
    "black beans": 120,
    "blueberries": 60,
    "bobotie": 450,
    "boerewors": 300,
    "boerewors roll": 400,
    "boiled egg": 70,
    "braai meat": 300,
    "bran flakes": 100,
    "bread": 80,
    "breakfast bowl": 400,
    "breakfast burrito": 450,
    "breakfast wrap": 400,
    "broccoli": 50,
    "brown bread": 90,
    "brown rice": 215,
    "brownie": 240,
    "bunny chow": 600,
    "burger": 500,
    "burrito": 500,
    "burrito bowl": 450,
    "butternut": 45,
    "cabbage": 25,
    "caesar salad": 350,
    "calamari": 140,
    "candy bar": 200,
    "cappuccino": 80,
    "caramel popcorn": 150,
    "carrot": 40,
    "carrots": 40,
    "cashews": 160,
    "cauliflower": 30,
    "cereal bar": 120,
    "chai latte": 180,
    "chakalaka": 80,
    "champagne": 90,
    "cheddar": 115,
    "cheese": 100,
    "cheese curls": 160,
    "cheese puffs": 160,
    "cheese sandwich": 320,
    "cheeseburger": 550,
    "cheetos": 160,
    "chicken": 165,
    "chicken and chips": 700,
    "chicken and rice": 450,
    "chicken and veg": 300,
    "chicken breast": 165,
    "chicken burger": 450,
    "chicken curry": 450,
    "chicken drumstick": 180,
    "chicken licken burger": 500,
    "chicken pie": 380,
    "chicken salad": 300,
    "chicken sandwich": 380,
    "chicken sausage": 120,
    "chicken schnitzel": 320,
    "chicken soup": 200,
    "chicken stir fry": 400,
    "chicken strips": 250,
    "chicken tenders": 250,
    "chicken thigh": 210,
    "chicken wing": 100,
    "chicken wings": 100,
    "chicken wrap": 400,
    "chickpeas": 160,
    "chips": 320,
    "chocolate": 200,
    "chocolate bar": 200,
    "cider": 180,
    "cinnamon roll": 300,
    "cod": 120,
    "coffee": 5,
    "coke": 140,
    "coke zero": 0,
    "cold brew": 10,
    "coleslaw": 150,
    "cookie": 50,
    "corn": 90,
    "corn chips": 150,
    "corn flakes": 110,
    "cortado": 60,
    "cosmopolitan": 150,
    "cottage cheese": 100,
    "courgette": 20,
    "couscous": 190,
    "crab": 100,
    "crackers": 120,
    "cream crackers": 70,
    "cream soda": 160,
    "crisps": 150,
    "crumpet": 90,
    "cucumber": 15,
    "cupcake": 200,
    "curry": 450,
    "danish": 280,
    "diet coke": 0,
    "donut": 250,
    "doritos": 150,
    "double espresso": 10,
    "doughnut": 250,
    "dried fruit": 120,
    "droewors": 200,
    "duck": 200,
    "edamame": 120,
    "egg": 70,
    "egg mayo": 200,
    "egg white": 17,
    "egg yolk": 55,
    "eggs": 70,
    "eggs benedict": 450,
    "energade": 90,
    "english muffin": 130,
    "espresso": 5,
    "fanta": 140,
    "fat free yogurt": 60,
    "feta": 75,
    "fillet": 240,
    "fish": 140,
    "fish and chips": 850,
    "fish and veg": 280,
    "flat white": 100,
    "french toast": 180,
    "fresh juice": 120,
    "fried chicken": 280,
    "fried egg": 90,
    "fries": 320,
    "frittata": 250,
    "fruit roll up": 80,
    "fruit smoothie": 200,
    "game": 90,
    "gammon": 180,
    "garlic bread": 180,
    "gatsby": 1200,
    "giant pretzel": 220,
    "gin": 100,
    "granola": 220,
    "granola bar": 150,
    "grapes": 100,
    "greek salad": 200,
    "greek yogurt": 120,
    "green beans": 35,
    "green juice": 100,
    "green smoothie": 180,
    "grilled chicken": 165,
    "grilled salmon": 180,
    "hake": 120,
    "ham": 120,
    "hash brown": 150,
    "hot chocolate": 200,
    "hummus": 100,
    "iced coffee": 120,
    "iced latte": 140,
    "iron brew": 150,
    "juice": 120,
    "jungle oats": 150,
    "kfc burger": 450,
    "kidney beans": 110,
    "kingklip": 130,
    "kit kat": 210,
    "kiwi": 60,
    "koeksister": 250,
    "kota": 650,
    "lager": 150,
    "lamb": 280,
    "lamb chop": 280,
    "lamb curry": 500,
    "lamb shank": 300,
    "lasagna": 450,
    "latte": 120,
    "lean mince": 200,
    "lentils": 120,
    "lettuce": 10,
    "lobster": 120,
    "long black": 10,
    "low fat yogurt": 80,
    "mac and cheese": 400,
    "macchiato": 40,
    "mackerel": 160,
    "mango": 100,
    "margarita": 220,
    "margaritas": 220,
    "mashed potato": 200,
    "matcha latte": 140,
    "meal replacement shake": 200,
    "mealie pap": 100,
    "melon": 60,
    "milk": 120,
    "milkshake": 300,
    "mince": 250,
    "mixed nuts": 170,
    "mixed veg": 50,
    "mocha": 200,
    "mojito": 200,
    "monster": 110,
    "white monster": 10,
    "monster zero": 10,
    "monster ultra": 10,
    "monster ultra zero": 10,
    "muesli": 200,
    "muesli bar": 140,
    "mushrooms": 20,
    "mussels": 90,
    "naan": 260,
    "nachos": 280,
    "nik naks": 140,
    "noodles": 320,
    "nuts": 170,
    "oat milk latte": 130,
    "oatmeal": 150,
    "oats": 150,
    "omelette": 200,
    "onion rings": 300,
    "orange": 60,
    "orange juice": 110,
    "ostrich": 140,
    "ouma rusks": 80,
    "overnight oats": 200,
    "oysters": 70,
    "pancake": 120,
    "pap": 100,
    "pasta": 350,
    "pastry": 280,
    "patty": 250,
    "peach": 50,
    "peanut butter": 190,
    "peanuts": 170,
    "pear": 100,
    "peas": 80,
    "penne": 350,
    "peppers": 30,
    "pepsi": 150,
    "pie": 350,
    "pina colada": 250,
    "pineapple": 80,
    "pita": 165,
    "pita chips": 130,
    "pizza": 285,
    "pizza slice": 285,
    "plum": 45,
    "poached egg": 70,
    "popcorn": 100,
    "pork": 240,
    "pork chop": 240,
    "pork loin": 220,
    "pork sausage": 150,
    "porridge": 150,
    "potato": 180,
    "potatoes": 180,
    "potjie": 500,
    "powerade": 80,
    "prawns": 100,
    "pressed juice": 120,
    "pretzel": 110,
    "pretzel bites": 150,
    "pretzel knots": 110,
    "pretzels": 110,
    "pronutro": 180,
    "protein bar": 200,
    "protein shake": 120,
    "protein smoothie": 220,
    "provita": 20,
    "pumpkin": 40,
    "quarter pounder": 520,
    "quesadilla": 500,
    "quest bar": 180,
    "quiche": 320,
    "quinoa": 220,
    "red bull": 110,
    "red wine": 125,
    "ribeye": 290,
    "rice": 200,
    "rice cakes": 35,
    "vital rice cakes": { food: "Vital Mini Rice Cakes (small packet)", calories: 121, protein: 2, carbs: 24, fat: 1, fibre: 1 },
    "mini rice cakes": { food: "Vital Mini Rice Cakes (small packet)", calories: 121, protein: 2, carbs: 24, fat: 1, fibre: 1 },
    "ps mini": { food: "P.S. Mini (single)", calories: 100, protein: 1, carbs: 12, fat: 5, fibre: 0 },
    "ps minis": { food: "P.S. Mini (single)", calories: 100, protein: 1, carbs: 12, fat: 5, fibre: 0 },
    "p.s. mini": { food: "P.S. Mini (single)", calories: 100, protein: 1, carbs: 12, fat: 5, fibre: 0 },
    "p.s. minis": { food: "P.S. Mini (single)", calories: 100, protein: 1, carbs: 12, fat: 5, fibre: 0 },
    "kitkat mini": { food: "KitKat Mini (2 fingers)", calories: 102, protein: 1, carbs: 13, fat: 5, fibre: 0 },
    "kit kat mini": { food: "KitKat Mini (2 fingers)", calories: 102, protein: 1, carbs: 13, fat: 5, fibre: 0 },
    "trigz": { food: "Trigz Sweet Chilli (28g packet)", calories: 107, protein: 2, carbs: 18, fat: 3, fibre: 1 },
    "trigz chips": { food: "Trigz Sweet Chilli (28g packet)", calories: 107, protein: 2, carbs: 18, fat: 3, fibre: 1 },
    "multigrain seaweed chips": { food: "Multigrain & Seaweed Chips (25g)", calories: 127, protein: 2, carbs: 17, fat: 6, fibre: 1 },
    "seaweed chips": { food: "Multigrain & Seaweed Chips (25g)", calories: 127, protein: 2, carbs: 17, fat: 6, fibre: 1 },
    "oven baked munchies": { food: "Oven Baked Munchies (28g)", calories: 136, protein: 2, carbs: 17, fat: 7, fibre: 1 },
    "baked munchies": { food: "Oven Baked Munchies (28g)", calories: 136, protein: 2, carbs: 17, fat: 7, fibre: 1 },
    "woolworths popcorn": { food: "Woolworths Popcorn (small packet)", calories: 136, protein: 3, carbs: 16, fat: 7, fibre: 2 },
    "woolies popcorn": { food: "Woolworths Popcorn (small packet)", calories: 136, protein: 3, carbs: 16, fat: 7, fibre: 2 },
    "jalapeno popper corn snack": { food: "Jalapeño Popper Corn Snack (30g)", calories: 142, protein: 2, carbs: 19, fat: 7, fibre: 1 },
    "jalapeno corn snack": { food: "Jalapeño Popper Corn Snack (30g)", calories: 142, protein: 2, carbs: 19, fat: 7, fibre: 1 },
    "crunch corn snack": { food: "Crunch Corn Snack (30g)", calories: 142, protein: 2, carbs: 19, fat: 7, fibre: 1 },
    "mini oat crunchies": { food: "Mini Oat Crunchies (30g packet)", calories: 145, protein: 2, carbs: 20, fat: 6, fibre: 2 },
    "oat crunchies": { food: "Mini Oat Crunchies (30g packet)", calories: 145, protein: 2, carbs: 20, fat: 6, fibre: 2 },
    "rice crackers": 100,
    "ritz crackers": 80,
    "roasted chicken": 180,
    "roti": 200,
    "rum": 100,
    "rump steak": 260,
    "rusks": 80,
    "salad": 150,
    "salmon": 180,
    "salmon and rice": 430,
    "salticrax": 70,
    "sandwich": 300,
    "sardines": 150,
    "sausage": 150,
    "scrambled eggs": 70,
    "seaweed snacks": 30,
    "shrimp": 100,
    "side salad": 80,
    "simba chips": 150,
    "sirloin": 250,
    "slice of bread": 80,
    "slice of toast": 80,
    "smoked salmon": 120,
    "smoothie": 200,
    "smoothie bowl": 300,
    "snoek": 140,
    "soft pretzel": 200,
    "sosatie": 250,
    "soup": 150,
    "soy latte": 110,
    "spaghetti": 350,
    "special k": 110,
    "spinach": 25,
    "sprite": 140,
    "squid": 140,
    "steak": 250,
    "steak pie": 400,
    "steers burger": 600,
    "stir fry": 400,
    "stir fry veg": 50,
    "stoney": 140,
    "strawberries": 50,
    "sushi": 250,
    "sushi roll": 250,
    "sweet potato": 160,
    "tacos": 400,
    "tempeh": 160,
    "tennis biscuit": 60,
    "tequila": 100,
    "toast": 80,
    "toasted sandwich": 350,
    "tofu": 80,
    "tomato": 20,
    "tomatoes": 20,
    "tortilla": 150,
    "tortilla chips": 140,
    "trail mix": 180,
    "trout": 150,
    "tuna": 130,
    "tuna can": 130,
    "tuna salad": 280,
    "tuna sandwich": 320,
    "tuna steak": 150,
    "turkey": 130,
    "turkey breast": 120,
    "turkey mince": 150,
    "veggie chips": 130,
    "venison": 160,
    "vetkoek": 320,
    "vodka": 100,
    "waffle": 150,
    "walnuts": 185,
    "watermelon": 80,
    "weetbix": 60,
    "whey shake": 120,
    "whiskey": 100,
    "white bread": 80,
    "white fish": 120,
    "white rice": 200,
    "white wine": 120,
    "whole wheat pasta": 340,
    "whopper": 660,
    "wimpy burger": 550,
    "wine": 125,
    "woolies bagel": 250,
    "woolies biltong": 150,
    "woolies cheese platter": 350,
    "woolies chicken": 300,
    "woolies croissant": 240,
    "woolies curry": 450,
    "woolies droewors": 200,
    "woolies energy bar": 200,
    "woolies fruit salad": 120,
    "woolies guacamole": 120,
    "woolies hummus": 100,
    "woolies meal": 500,
    "woolies muffin": 280,
    "woolies pasta": 400,
    "woolies pie": 380,
    "woolies protein ball": 150,
    "woolies quiche": 320,
    "woolies ready meal": 500,
    "woolies roast chicken": 350,
    "woolies salad": 200,
    "woolies sandwich": 350,
    "woolies scone": 220,
    "woolies smoothie": 200,
    "woolies sushi": 250,
    "woolies trail mix": 180,
    "woolies wrap": 400,
    "woolies yoghurt": 100,
    "woolworths bagel": 250,
    "woolworths biltong": 150,
    "woolworths cheese platter": 350,
    "woolworths chicken": 300,
    "woolworths croissant": 240,
    "woolworths curry": 450,
    "woolworths droewors": 200,
    "woolworths energy bar": 200,
    "woolworths fruit salad": 120,
    "woolworths guacamole": 120,
    "woolworths hummus": 100,
    "woolworths meal": 500,
    "woolworths muffin": 280,
    "woolworths pasta": 400,
    "woolworths pie": 380,
    "woolworths protein ball": 150,
    "woolworths quiche": 320,
    "woolworths ready meal": 500,
    "woolworths roast chicken": 350,
    "woolworths salad": 200,
    "woolworths sandwich": 350,
    "woolworths scone": 220,
    "woolworths smoothie": 200,
    "woolworths sushi": 250,
    "woolworths trail mix": 180,
    "woolworths wrap": 400,
    "woolworths yoghurt": 100,
    "wrap": 350,
    "yogurt": 100,
    "zinger burger": 450,
    "zucchini": 20
  };
  
  // Merge extra foods from external file (added nightly by automation)
  try {
    const extraFoodsPath = require('path').join(__dirname, 'extra-foods.json');
    if (require('fs').existsSync(extraFoodsPath)) {
      const extraFoods = JSON.parse(require('fs').readFileSync(extraFoodsPath, 'utf8'));
      Object.assign(simple, extraFoods);
    }
  } catch (e) { console.error('[foods] Error loading extra-foods.json:', e.message); }
  
  // Skip simple lookup if input mentions a restaurant/chain (those need specific data)
  const restaurantNames = ['nando', 'steers', 'kfc', 'kauai', 'woolworths', 'woolies', 'spur', 'mcdonalds', 'mcdonald', 'burger king', 'wimpy', 'ocean basket', 'debonairs', 'roman', 'chicken licken', 'fishaways', 'pedros', 'col\'cacchio', 'mugg', 'vida', 'starbucks', 'nu ', 'nu food', 'nu juice'];
  const isRestaurantItem = restaurantNames.some(r => lower.includes(r));

  if (!isRestaurantItem) {
    // Strip quantity prefix for matching: "3 eggs" → "eggs", "two bananas" → "bananas"
    const quantity = extractQuantity(lower);
    const stripped = lower.replace(/^\d+\s+/, '').replace(/^(two|three|four|five|six|seven|eight|nine|ten)\s+/i, '').replace(/x\s+/, '');
    
    // If OpenAI is available, skip simple lookup and let AI return full macros + fibre
    // Simple lookup only used as fallback when no API key is set
    if (!OPENAI_API_KEY) {
      // Exact match first (after stripping quantity)
      if (simple[stripped]) {
        const totalCal = simple[stripped] * quantity;
        const displayName = quantity > 1 ? `${quantity}x ${stripped}` : stripped;
        return { food: displayName, calories: totalCal, protein: 0, carbs: 0, fat: 0, fibre: 0 };
      }
      
      // Partial match ONLY if the input is a single word or the simple key is multi-word
      const key = Object.keys(simple).find(k => {
        if (stripped === k) return true;
        if (k.split(' ').length > 1 && stripped.includes(k)) return true;
        if (stripped === k + 's' || stripped === k + 'es') return true;
        return false;
      });
      if (key) {
        const baseCal = simple[key];
        const totalCal = baseCal * quantity;
        const displayName = quantity > 1 ? `${quantity}x ${key}` : key;
        return { food: displayName, calories: totalCal, protein: 0, carbs: 0, fat: 0, fibre: 0 };
      }
    }
  }

  // 3. Check user's custom foods
  if (user) {
    const custom = lookupCustomFood(user, food);
    if (custom) return { ...custom, source: "custom" };
  }

  // 4. Check SA database (491 SA foods from Supabase)
  let saMatch = await lookupSAFood(food);
  fs.appendFileSync(aiDebugLog, `[SA DB] Checked "${food}" → ${saMatch ? `FOUND: ${saMatch.food} (${saMatch.calories} cal)` : 'not found'}\n`);
  
  // Apply singular/plural fix to SA results too
  if (saMatch) {
    // Clean up duplicate text like "(2 eggs) (2 eggs)"
    const before = saMatch.food;
    saMatch.food = saMatch.food.replace(/(\([^)]+\))\s*\1+/g, '$1');
    if (before !== saMatch.food) {
      fs.appendFileSync(aiDebugLog, `[SA DB CLEANUP] Removed duplicate: "${before}" → "${saMatch.food}"\n`);
    }
    
    const inputLower = food.toLowerCase().trim();
    const pluralRules = [
      { singular: 'egg', plural: 'eggs', singleCal: 70 },
      { singular: 'banana', plural: 'bananas', singleCal: 105 },
    ];
    
    for (const rule of pluralRules) {
      const hasSingular = inputLower === rule.singular || 
                          inputLower.includes(` ${rule.singular} `) || 
                          inputLower.endsWith(` ${rule.singular}`) ||
                          inputLower === `scrambled ${rule.singular}` ||
                          inputLower === `fried ${rule.singular}` ||
                          inputLower === `boiled ${rule.singular}`;
      
      const hasPlural = inputLower.includes(rule.plural);
      
      // User typed singular but SA returned plural calories
      if (hasSingular && !hasPlural && saMatch.calories > rule.singleCal * 1.5) {
        fs.appendFileSync(aiDebugLog, `[SA DB SINGULAR FIX] Input "${food}" has singular but SA returned ${saMatch.calories} cal → halving\n`);
        saMatch.calories = Math.round(saMatch.calories / 2);
        saMatch.protein = Math.round(saMatch.protein / 2);
        saMatch.carbs = Math.round(saMatch.carbs / 2);
        saMatch.fat = Math.round(saMatch.fat / 2);
        saMatch.food = saMatch.food.replace(/^2x\s*/i, '').replace(/eggs/i, 'egg').replace(/\(2 eggs\)/g, '(1 egg)');
        break;
      }
    }
  }
  
  if (saMatch) {
    // SA DB doesn't have fibre — quick AI lookup to fill it in
    if (OPENAI_API_KEY && !saMatch.fibre) {
      try {
        const fibreRes = await axios.post("https://api.openai.com/v1/chat/completions", {
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Return ONLY a JSON object: {\"fibre\": integer}. Dietary fibre in grams for the given food. No extra text." },
            { role: "user", content: saMatch.food }
          ],
          temperature: 0.1, max_tokens: 20
        }, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, timeout: 3000 });
        const fc = fibreRes.data.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
        const fd = JSON.parse(fc);
        if (fd.fibre != null) saMatch.fibre = fd.fibre;
      } catch (e) { /* silent */ }
    }
    return saMatch;
  }

  // 4b. If restaurant item didn't match SA DB, try simple exact lookup as fallback
  if (isRestaurantItem) {
    const quantity = extractQuantity(lower);
    const stripped = lower.replace(/^\d+\s+/, '').replace(/^(two|three|four|five|six|seven|eight|nine|ten)\s+/i, '').replace(/x\s+/, '');
    if (simple[stripped]) {
      const totalCal = simple[stripped] * quantity;
      const displayName = quantity > 1 ? `${quantity}x ${stripped}` : stripped;
      return { food: displayName, calories: totalCal, protein: 0, carbs: 0, fat: 0, fibre: 0 };
    }
  }

  // 5. Fall back to OpenAI if all lookups fail
  if (!OPENAI_API_KEY) {
    return { food, calories: 200 };
  }

  fs.appendFileSync(aiDebugLog, `[OPENAI] Calling API for "${food}"\n`);
  
  const res = await retryOpenAI(() => axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {\"food\": \"clean name including quantity\", \"calories\": integer, \"protein\": integer, \"carbs\": integer, \"fat\": integer, \"fibre\": integer, \"estimatedPriceZAR\": integer_or_null}. All macros in grams. fibre = dietary fibre in grams. estimatedPriceZAR is the approximate cost in South African Rands at a restaurant/store (null if homemade or unknown). Use 2025/2026 SA prices. Examples: Nando's quarter chicken ~R75, Steers Wacky Wednesday burger ~R50, Kauai smoothie ~R65, Woolworths ready meal ~R60. CRITICAL RULES: 1) ONLY estimate what was explicitly mentioned - do NOT add extra foods. If user says 'scrambled', return 'scrambled eggs' ONLY - do not add toast, bacon, or other items unless specifically mentioned. If user says 'toast', return toast only - do not add eggs. 2) RESPECT SINGULAR vs PLURAL: 'egg' = 1 egg (~70 cal), 'eggs' = 2 eggs (~140 cal). 'slice of toast' = 1 slice, 'toast' = 2 slices. 'banana' = 1 banana. 'chicken breast' = 1 breast. Always default to the SINGULAR quantity unless the user uses plural or specifies a number. 3) If the description mentions a quantity (e.g. 'two', 'three', '2x', '3 slices'), multiply the calories AND macros accordingly and include the quantity in the food name. Example: 'two toasted cheese sandwiches' → {\"food\": \"2x toasted cheese sandwich\", \"calories\": 800, \"protein\": 30, \"carbs\": 80, \"fat\": 35, \"fibre\": 4, \"estimatedPriceZAR\": null}. 4) Use realistic everyday South African portion sizes - not restaurant or oversized portions. 5) Drinks must use FULL SERVING sizes: beer=440ml (~155 cal), Red Bull=250ml (~112 cal), Monster=500ml (~230 cal), wine glass=175ml (~125 cal), cider=330ml (~170 cal). NEVER use per-100ml values. 6) SA portions: 1 slice cheese=~60 cal (thin processed like Clover), 1 slice bread=~80 cal, 1 egg=~70 cal, biltong 50g=~125 cal, droewors 50g=~150 cal, handful of nuts=~160 cal (28g). 7) Bunny chow quarter=~650 cal (bread bowl + curry). 8) COOKING FATS: For fried/scrambled eggs add +30 cal per egg (oil/butter), for fried chicken/meat add +20% calories (oil), for sautéed vegetables add +50 cal (oil), for cooked rice/pasta assume butter/oil already included in base values. 9) COMPOSITE MEALS: When multiple ingredients are listed (e.g. 'chicken with rice and veg'), sum ALL components realistically. Chicken breast 165 cal + 1 cup rice 200 cal + vegetables 50 cal = 415 cal minimum. DO NOT underestimate. 10) If you return less than 200 cal for a meal with 3+ ingredients, you're probably wrong - recalculate. 11) PORTION SIZE: Always include estimated portion weight in the food name when the input is vague. 'chicken' → 'Chicken breast (~150g)', 'rice' → 'Rice (1 cup, ~200g)', 'pasta' → 'Pasta (1 cup cooked, ~200g)', 'steak' → 'Steak (~200g)'. If user specifies a size (e.g. 'large chicken breast', 'small portion'), adjust calories accordingly. Large portions = +40%, small = -30%. 12) CHICKEN GUIDE: Plain 'chicken' = 1 medium chicken breast (~130g, 200 cal). 'Chicken thigh' = 1 thigh with skin (~100g, 200 cal). 'Chicken drumstick' = 1 drumstick (~85g, 150 cal). 'Fried chicken' = 1 piece KFC-style (~170g, 280 cal). 'Half chicken' = ~350g, 480 cal. 'Quarter chicken' = ~175g, 250 cal (Nando's style). Always specify the cut and weight in the food name. 13) CONSERVATIVE BIAS: When portion size is uncertain, estimate on the LOWER end. Assume home-cooked portions are modest, not restaurant-sized. A typical plate of rice is ~150g cooked (~180 cal), not 200g. A typical serving of meat is ~120-150g, not 200g. People tend to overestimate how much they eat. Better to be slightly under than over — users can always add more. No extra text." },
        { role: "user", content: `Nutrition for: ${food}` }
      ],
      temperature: 0.2
    },
    { 
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      timeout: 10000 // 10 second timeout to prevent hanging
    }
  ));

  const content = res.data.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
  let result;
  try {
    result = JSON.parse(content);
  } catch (e) {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        result = JSON.parse(match[0]);
      } catch (e2) {
        result = { food, calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
      }
    } else {
      result = { food, calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
    }
  }

  // Guard against null/NaN calories or missing food name
  if (result.calories == null || Number.isNaN(Number(result.calories))) result.calories = 0;
  if (!result.food || typeof result.food !== 'string') result.food = food;
  result.calories = Number(result.calories);
  
  // Validation: Block invalid entries
  const foodLower = result.food.toLowerCase();
  const invalidKeywords = ['reset', 'nevermind', 'tdee', 'unknown', 'tricep', 'pull down', 'workout', 'exercise'];
  if (invalidKeywords.some(kw => foodLower.includes(kw))) {
    result.calories = 0;
    result.protein = 0;
    result.carbs = 0;
    result.fat = 0;
    result.fibre = 0;
    fs.appendFileSync(aiDebugLog, `[VALIDATION FAIL] Invalid entry detected: "${result.food}"\n`);
    return result; // Return early with 0 cal so user gets error message
  }
  
  // Validation: Reject zero calories unless it's water or zero-cal drinks
  const zeroCalAllowed = ['water', 'coke zero', 'diet coke', 'sprite zero', 'fanta zero', 'monster zero', 'red bull zero'];
  if (result.calories === 0 && !zeroCalAllowed.some(kw => foodLower.includes(kw))) {
    fs.appendFileSync(aiDebugLog, `[VALIDATION FAIL] Zero calories for non-zero-cal food: "${result.food}"\n`);
    // Don't return - let macro check handle it
  }
  
  // Validation: Macro sanity check
  const macroCalories = (result.protein || 0) * 4 + (result.carbs || 0) * 4 + (result.fat || 0) * 9;
  if (macroCalories > 50 && result.calories > 0) {
    const diff = Math.abs(macroCalories - result.calories);
    const tolerance = result.calories * 0.6; // 60% tolerance
    if (diff > tolerance) {
      fs.appendFileSync(aiDebugLog, `[VALIDATION WARN] Macro mismatch: ${result.calories} cal stated vs ${macroCalories} from macros (diff: ${diff})\n`);
      // Use the higher value to be safe
      if (macroCalories > result.calories * 1.3) {
        result.calories = Math.round(macroCalories);
        fs.appendFileSync(aiDebugLog, `[VALIDATION FIX] Adjusted calories to ${result.calories} based on macros\n`);
      }
    }
  }
  
  fs.appendFileSync(aiDebugLog, `\n[${new Date().toISOString()}] AI RAW: "${food}" → ${result.food} (${result.calories} cal)\n`);
  
  // Clean up duplicate quantity phrases like "(2 eggs) (2 eggs)" → "(2 eggs)"
  // More aggressive: remove any duplicate parenthesized text
  if (result.food) {
    const before = result.food;
    result.food = result.food.replace(/(\([^)]+\))\s*\1+/g, '$1'); // Match one or more duplicates
    if (before !== result.food) {
      fs.appendFileSync(aiDebugLog, `[CLEANUP] Removed duplicate: "${before}" → "${result.food}"\n`);
    }
  }
  
  // Post-processing: enforce singular/plural rules
  // If user typed plural but AI returned singular calories, fix it
  const inputLower = food.toLowerCase().trim();
  const resultLower = result.food.toLowerCase();
  
  // Common plural foods that should be 2x when plural
  const pluralRules = [
    { singular: 'egg', plural: 'eggs', singleCal: 70 },
    { singular: 'banana', plural: 'bananas', singleCal: 105 },
    { singular: 'apple', plural: 'apples', singleCal: 95 },
    { singular: 'orange', plural: 'oranges', singleCal: 65 },
    { singular: 'slice', plural: 'slices', singleCal: null }, // context-dependent
  ];
  
  for (const rule of pluralRules) {
    // User typed plural (e.g., "eggs") but AI returned ~1 portion
    if (inputLower.includes(rule.plural) && !inputLower.match(/\d/) && !inputLower.includes('one ')) {
      // Check if AI returned roughly 1 portion (within 20% of single cal)
      if (rule.singleCal && result.calories < rule.singleCal * 1.5) {
        fs.appendFileSync(aiDebugLog, `[PLURAL FIX] Input "${food}" has plural "${rule.plural}" but AI returned ${result.calories} cal (<${rule.singleCal * 1.5}) → doubling\n`);
        // User said plural, AI returned singular - double it
        result.calories *= 2;
        result.protein = (result.protein || 0) * 2;
        result.carbs = (result.carbs || 0) * 2;
        result.fat = (result.fat || 0) * 2;
        result.fibre = (result.fibre || 0) * 2;
        
        // Update food name to show 2x
        if (!result.food.match(/^2x|^2 /i)) {
          result.food = `2x ${result.food}`;
        }
        break;
      }
    }
    
    // User typed singular (e.g., "egg" or "scrambled egg") but AI returned ~2 portions
    const hasSingular = inputLower === rule.singular || 
                        inputLower.includes(` ${rule.singular} `) || 
                        inputLower.endsWith(` ${rule.singular}`) ||
                        inputLower === `scrambled ${rule.singular}` ||
                        inputLower === `fried ${rule.singular}` ||
                        inputLower === `boiled ${rule.singular}`;
    
    const hasPlural = inputLower.includes(rule.plural);
    
    if (hasSingular && !hasPlural) {
      if (rule.singleCal && result.calories > rule.singleCal * 1.5) {
        fs.appendFileSync(aiDebugLog, `[SINGULAR FIX] Input "${food}" has singular "${rule.singular}" but AI returned ${result.calories} cal (>${rule.singleCal * 1.5}) → halving\n`);
        // User said singular, AI returned plural - halve it
        result.calories = Math.round(result.calories / 2);
        result.protein = Math.round((result.protein || 0) / 2);
        result.carbs = Math.round((result.carbs || 0) / 2);
        result.fat = Math.round((result.fat || 0) / 2);
        result.fibre = Math.round((result.fibre || 0) / 2);
        
        // Update food name to remove 2x/plural if present
        result.food = result.food.replace(/^2x\s*/i, '').replace(/^2\s+/, '').replace(/eggs/i, 'egg').replace(/bananas/i, 'banana');
        break;
      }
    }
  }
  
  // Post-processing: reject 0-calorie results for real food (not water/black coffee/etc)
  // If AI returned 0 calories for something that's clearly food, estimate based on description
  const zeroCalAllowed2 = ['water', 'black coffee', 'diet', 'zero', 'sugar free', 'sparkling', 'ice', 'tea unsweetened', 'magnesium', 'hydrate', 'pre workout', 'supplement', 'vitamin', 'electrolyte', 'bcaa'];
  const isZeroCalOk = zeroCalAllowed2.some(z => inputLower.includes(z));
  
  if (result.calories === 0 && !isZeroCalOk) {
    fs.appendFileSync(aiDebugLog, `[ZERO-CAL FIX] AI returned 0 cal for "${food}" — estimating based on description\n`);
    
    // Estimate based on food type keywords
    let estimatedCal = 250; // default fallback for unknown food
    let estP = 10, estC = 30, estF = 10;
    
    if (inputLower.includes('pizza') || inputLower.includes('pasta') || inputLower.includes('biryani') || inputLower.includes('curry')) {
      estimatedCal = 500; estP = 20; estC = 60; estF = 18;
    } else if (inputLower.includes('salad')) {
      estimatedCal = 200; estP = 8; estC = 15; estF = 12;
    } else if (inputLower.includes('stew') || inputLower.includes('soup') || inputLower.includes('broth')) {
      estimatedCal = 350; estP = 20; estC = 25; estF = 15;
    } else if (inputLower.includes('cake') || inputLower.includes('cheesecake') || inputLower.includes('dessert') || inputLower.includes('brownie')) {
      estimatedCal = 350; estP = 5; estC = 45; estF = 18;
    } else if (inputLower.includes('chicken') || inputLower.includes('beef') || inputLower.includes('lamb') || inputLower.includes('fish') || inputLower.includes('meat') || inputLower.includes('pork')) {
      estimatedCal = 400; estP = 30; estC = 15; estF = 22;
    } else if (inputLower.includes('rice') || inputLower.includes('noodle') || inputLower.includes('bread') || inputLower.includes('wrap') || inputLower.includes('roti')) {
      estimatedCal = 350; estP = 10; estC = 55; estF = 8;
    } else if (inputLower.includes('smoothie') || inputLower.includes('shake') || inputLower.includes('juice') || inputLower.includes('latte') || inputLower.includes('cappuccino')) {
      estimatedCal = 200; estP = 5; estC = 35; estF = 5;
    } else if (inputLower.includes('egg') || inputLower.includes('omelette') || inputLower.includes('frittata')) {
      estimatedCal = 200; estP = 14; estC = 2; estF = 15;
    } else if (inputLower.includes('fruit') || inputLower.includes('berry') || inputLower.includes('melon')) {
      estimatedCal = 80; estP = 1; estC = 20; estF = 0;
    } else if (inputLower.includes('amala') || inputLower.includes('fufu') || inputLower.includes('ugali') || inputLower.includes('sadza') || inputLower.includes('keema') || inputLower.includes('tagine') || inputLower.includes('jollof')) {
      estimatedCal = 500; estP = 20; estC = 55; estF = 20;
    } else if (inputLower.includes('plate') || inputLower.includes('meal') || inputLower.includes('dinner') || inputLower.includes('lunch') || inputLower.includes('serving')) {
      estimatedCal = 500; estP = 25; estC = 45; estF = 20;
    }
    
    result.calories = estimatedCal;
    result.protein = estP;
    result.carbs = estC;
    result.fat = estF;
    result.food = result.food + ' (est.)';
    
    fs.appendFileSync(aiDebugLog, `[ZERO-CAL FIX] Estimated: ${result.food} → ${estimatedCal} cal | P:${estP}g C:${estC}g F:${estF}g\n`);
  }
  
  // Also catch suspiciously low calories for substantial foods
  // Anything marketed as a "bar", "nutter", "biscuit", "cookie", "cake", "muffin", "scone" should be at least 150 cal
  const isSubstantialSnack = /\b(bar|nutter|biscuit|cookie|cake|muffin|scone|brownie|slice|tart|pastry|croissant|donut|doughnut)\b/i.test(inputLower);
  
  if (result.calories > 0 && result.calories < 20 && !isZeroCalOk && !inputLower.includes('gum') && !inputLower.includes('mint') && !inputLower.includes('pickle')) {
    fs.appendFileSync(aiDebugLog, `[LOW-CAL FIX] AI returned only ${result.calories} cal for "${food}" — bumping to minimum 50 cal\n`);
    result.calories = Math.max(result.calories, 50);
  }
  
  // Catch substantial snacks that AI grossly underestimated
  if (isSubstantialSnack && result.calories < 150) {
    fs.appendFileSync(aiDebugLog, `[SNACK-CAL FIX] "${food}" is a substantial snack but AI returned only ${result.calories} cal — bumping to minimum 400 cal\n`);
    result.calories = Math.max(result.calories, 400);
    result.protein = Math.max(result.protein, 5);
    result.carbs = Math.max(result.carbs, 40);
    result.fat = Math.max(result.fat, 15);
  }
  
  // Catch multi-ingredient meals that AI underestimated
  // If input has 3+ ingredients (contains "and" or "with" + commas) and < 250 cal, likely too low
  const ingredientCount = (inputLower.match(/\b(and|with|,)\b/g) || []).length;
  const hasMultipleIngredients = ingredientCount >= 2;
  const isMeal = /\b(breakfast|lunch|dinner|meal|plate|bowl)\b/i.test(inputLower) || hasMultipleIngredients;
  
  if (isMeal && result.calories < 250 && result.calories > 0) {
    const boosted = Math.round(result.calories * 1.6); // 60% boost for underestimated meals
    fs.appendFileSync(aiDebugLog, `[MEAL-CAL FIX] "${food}" looks like a multi-ingredient meal but AI returned only ${result.calories} cal — boosting to ${boosted} cal\n`);
    result.calories = boosted;
    result.protein = Math.round(result.protein * 1.4);
    result.carbs = Math.round(result.carbs * 1.4);
    result.fat = Math.round(result.fat * 1.8); // Fat gets bigger boost (cooking oils)
  }
  
  // Macro sanity check: macros should roughly add up to calories (P*4 + C*4 + F*9 ≈ calories)
  // Allow 30% tolerance — if wildly off, recalculate macros from calories
  const macroCal = (result.protein || 0) * 4 + (result.carbs || 0) * 4 + (result.fat || 0) * 9;
  if (result.calories > 0 && macroCal > 0) {
    const ratio = macroCal / result.calories;
    if (ratio > 2.0 || ratio < 0.3) {
      fs.appendFileSync(aiDebugLog, `[MACRO FIX] Macros don't add up for "${food}": macros=${macroCal} cal vs reported=${result.calories} cal (ratio: ${ratio.toFixed(2)}) — recalculating\n`);
      // Recalculate macros to roughly match calories using typical ratios
      // Assume 30% protein, 40% carbs, 30% fat
      result.protein = Math.round((result.calories * 0.30) / 4);
      result.carbs = Math.round((result.calories * 0.40) / 4);
      result.fat = Math.round((result.calories * 0.30) / 9);
      fs.appendFileSync(aiDebugLog, `[MACRO FIX] Recalculated: P:${result.protein}g C:${result.carbs}g F:${result.fat}g\n`);
    }
  }

  fs.appendFileSync(aiDebugLog, `[AI FINAL] "${food}" → ${result.food} (${result.calories} cal)\n`);
  return result;
}

// ── Deficit message ──
// 7700 cal deficit = 1kg of fat lost
function deficitMessage(total, goal) {
  const diff = goal - total;
  if (diff > 0) {
    const grams = Math.round((diff / 7700) * 1000);
    return `🟢 Stop here and you'll lose *${grams}g of fat today*.\n${diff} cal remaining if you want to eat more.`;
  } else if (diff === 0) {
    return `🎯 Exactly on goal. Maintenance day.`;
  } else {
    const grams = Math.round((Math.abs(diff) / 7700) * 1000);
    return `🔴 *${grams}g surplus* today - ${Math.abs(diff)} cal over goal.`;
  }
}

// ── WhatsApp sender ──
async function send(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`,
      { messaging_product: "whatsapp", to, type: "text", text: { body: (text || "").slice(0, 4096) } },
      { headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(`Send failed to ${to}:`, err.response?.data ? JSON.stringify(err.response.data) : err.message);
    throw err;
  }
}

async function sendImage(to, imageId, caption) {
  await axios.post(
    `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`,
    { messaging_product: "whatsapp", to, type: "image", image: { id: imageId, caption: caption || "" } },
    { headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } }
  );
}

async function getMediaUrl(mediaId) {
  const res = await axios.get(`https://graph.facebook.com/v18.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  return res.data?.url;
}

async function downloadMediaBuffer(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  return Buffer.from(res.data);
}

const VISION_USAGE_FILE = './vision-usage.json';
const VISION_MONTHLY_CAP_USD = 20;
const VISION_EST_COST_PER_IMAGE_USD = 0.0006; // conservative estimate

function getVisionUsage() {
  try {
    const data = JSON.parse(fs.readFileSync(VISION_USAGE_FILE, 'utf8'));
    return data;
  } catch {
    return { month: new Date().toISOString().slice(0,7), count: 0, estCost: 0 };
  }
}

function saveVisionUsage(data) {
  fs.writeFileSync(VISION_USAGE_FILE, JSON.stringify(data, null, 2));
}

function canUseVision() {
  const month = new Date().toISOString().slice(0,7);
  let usage = getVisionUsage();
  if (usage.month !== month) {
    usage = { month, count: 0, estCost: 0 };
  }
  return usage.estCost < VISION_MONTHLY_CAP_USD;
}

function recordVisionUsage() {
  const month = new Date().toISOString().slice(0,7);
  let usage = getVisionUsage();
  if (usage.month !== month) {
    usage = { month, count: 0, estCost: 0 };
  }
  usage.count += 1;
  usage.estCost = +(usage.count * VISION_EST_COST_PER_IMAGE_USD).toFixed(2);
  saveVisionUsage(usage);
}

async function guessFoodFromImage(imageId) {
  if (!OPENAI_API_KEY) return null;
  if (!canUseVision()) return null;
  try {
    const url = await getMediaUrl(imageId);
    if (!url) return null;
    const buffer = await downloadMediaBuffer(url);
    const b64 = buffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${b64}`;

    const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a nutrition assistant. Identify the food item in the image. Include an estimated portion size (e.g. "grilled chicken breast ~150g", "plate of pasta ~250g", "small bowl of rice ~150g"). If it\'s a branded item, include the brand. If unclear on size, estimate based on plate/bowl/hand size visible in the image. Always include a weight or size estimate. IMPORTANT: Be conservative with portion estimates — home-cooked portions are typically smaller than they look in photos. Estimate on the lower end.' },
        { role: 'user', content: [
          { type: 'text', text: 'What food is this? Reply with the food name and estimated portion size.' },
          { type: 'image_url', image_url: { url: dataUrl } }
        ] }
      ],
      max_tokens: 50,
      temperature: 0.2
    }, {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' }
    });

    const guess = resp.data?.choices?.[0]?.message?.content?.trim();
    if (guess) recordVisionUsage();
    return guess || null;
  } catch (err) {
    return null;
  }
}

async function sendProOffer(from, reason = '') {
  const reasonLine = reason ? `${reason}\n\n` : '';
  await send(from,
    `${reasonLine}*FitSorted Pro* - R${PRO_PRICE}/mo\n` +
    `✅ Photo logging\n✅ Meal suggestions\n✅ Weekly insights\n✅ Macro targets & streaks\n\n` +
    `Reply *PRO* to upgrade.`
  );
}

async function maybePromptEmail(from, user, users) {
  if (user.email || user.emailPrompted) return; // already have it or already asked
  const joinedAt = user.joinedAt ? new Date(user.joinedAt) : new Date();
  const daysSinceJoin = (Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceJoin < 3) return; // wait 3 days
  const loggedDays = Object.values(user.log || {}).filter(arr => Array.isArray(arr) && arr.length > 0).length;
  if (loggedDays < 2) return; // must have actually used it
  user.emailPrompted = true;
  saveUsers(users);
  await send(from,
    `Hey ${user.name || 'there'} 👋 You've been crushing it!\n\n` +
    `Drop me your email and I'll send you exclusive tips, SA-specific meal ideas, and early access to new features.\n\n` +
    `_(Just reply with your email, or type *skip* to pass)_`
  );
  user.step = "email_late";
  saveUsers(users);
}

async function maybeFirstLogMenu(from, user, users) {
  if (user.sentMenuCard) return;
  const totalEntries = Object.values(user.log || {}).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
  if (totalEntries === 1) {
    user.sentMenuCard = true;
    saveUsers(users);
    await send(from,
      `🎉 *First meal logged!*\n\nKeep going — just type your next meal whenever you eat.\n\n` +
      `📌 *Pin this for quick reference:*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 *log* — today's entries\n` +
      `⚖️ *weight 82.5* — log weigh-in\n` +
      `🍺 *drinks* — drunk-o-meter\n` +
      `↩️ *undo* — remove last entry\n` +
      `💡 *suggest* — meal ideas\n` +
      `📸 Send a photo — I'll ID it\n` +
      `📋 *commands* — full menu\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━`
    );
  }
  // PWA dashboard nudge — show once on 3rd entry
  if (!user.sentPwaNudge && totalEntries === 3) {
    user.sentPwaNudge = true;
    saveUsers(users);
    const crypto = require('crypto');
    const pwaToken = crypto.createHash('sha256').update(String(from)).digest('hex').slice(0, 8);
    await send(from,
      `💡 *Did you know?* We have a full dashboard with a meal database, your daily stats, and macro breakdowns.\n\n` +
      `📱 Your personal dashboard: https://fitsorted.co.za/app/?t=${pwaToken}#t=${pwaToken}\n\n` +
      `_Add it to your home screen for quick access — it works like an app!_`
    );
  }
}

async function maybePromptPro(from, user, users) {
  if (!PRO_LAUNCH) return;
  if (user.proPrompted) return;
  // Don't prompt if already premium or in trial
  const premium = await isPremium(from);
  if (premium || isInTrial(user)) return;
  const loggedDays = Object.values(user.log || {}).filter(arr => Array.isArray(arr) && arr.length > 0).length;
  if (loggedDays >= 3) {
    user.proPrompted = true;
    saveUsers(users);
    const monthlyLink = getPayFastMonthlyLink(from);
    const annualLink = getPayFastAnnualLink(from);
    await send(from,
      `You've logged 3 days in a row ✅\n\n` +
      `Subscribe to keep going:\n\n` +
      `📅 *Monthly — R36/mo*\n👉 ${monthlyLink}\n\n` +
      `🏆 *Annual — R399/year* _(save R189)_\n👉 ${annualLink}`
    );
  }
}

async function sendButtons(to, body, buttons) {
  console.log('[sendButtons] Called with:', { to, bodyLength: body.length, buttonCount: buttons.length });
  try {
    // WhatsApp enforces: body max 1024 chars, button title max 20 chars, button id max 256 chars, max 3 buttons
    const safeBtns = buttons.slice(0, 3).map(b => ({
      type: "reply",
      reply: {
        id: (b.id || "").slice(0, 256),
        title: (b.title || "").slice(0, 20)
      }
    }));
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: (body || "").slice(0, 1024) },
          action: { buttons: safeBtns }
        }
      },
      { headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error('[sendButtons] Error sending buttons, falling back to plain message:', error.response?.data || error.message);
    // Fallback to regular text message
    await send(to, body);
  }
}

async function sendList(to, body, buttonText, sections) {
  // WhatsApp List Message: up to 10 rows across sections
  // Each row: id (max 200), title (max 24), description (max 72)
  const safeSections = sections.map(s => ({
    title: (s.title || "").slice(0, 24),
    rows: (s.rows || []).slice(0, 10).map(r => ({
      id: (r.id || "").slice(0, 200),
      title: (r.title || "").slice(0, 24),
      description: (r.description || "").slice(0, 72),
    })),
  }));
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: (body || "").slice(0, 1024) },
          action: {
            button: (buttonText || "Menu").slice(0, 20),
            sections: safeSections,
          },
        },
      },
      { headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error('[sendList] Error sending list, falling back to plain message:', error.response?.data || error.message);
    const fallbackRows = safeSections.flatMap(s => [
      s.title ? `*${s.title}*` : null,
      ...s.rows.map(r => `• ${r.title}${r.description ? ` — ${r.description}` : ""}`)
    ]).filter(Boolean);
    const fallbackText = [
      body || "",
      ...fallbackRows
    ].filter(Boolean).join("\n");
    await send(to, fallbackText);
  }
}

// ── Setup flow ──
async function handleSetup(from, user, msg, users) {
  if (!users) users = loadUsers(); // fallback if not passed
  const step = user.step;

  if (!step || step === "gender") {
    user.step = "awaiting_gender";
    await sendButtons(from,
      "Howzit! 👋 Welcome to *FitSorted* — your calorie tracker on WhatsApp.\n\n✅ *Free forever* — calorie tracking with no limits\n💎 *7-day free trial* — unlock all features\n\n_WhatsApp is 100% free — you only pay if you upgrade to Premium (via secure link, not through WhatsApp)._\n\nNo app. No login. Just chat like you're messaging a mate.\n\n🍗 Log any food — I'll figure out the calories (yes, even pap and vleis)\n📸 Snap a photo of your plate — I'll ID it\n🥩 Track macros (protein, carbs, fat)\n🏃 Log your gym session or run\n🍺 Built-in drunk-o-meter\n🧠 Ask me anything — meal ideas, what to eat under 400 cal\n\nLet's get you set up — takes 30 seconds 👇\n\nWhat's your biological sex?",
      [{ id: "setup:male", title: "Male" }, { id: "setup:female", title: "Female" }]
    );
    return;
  }

  // Back/undo during onboarding
  if (step && ["back","undo","go back","oops","mistake","wrong"].includes(msg.toLowerCase())) {
    const stepOrder = ["awaiting_gender", "weight", "height", "age", "activity", "target", "pace", "name", "email", "budget"];
    const currentIdx = stepOrder.indexOf(step);
    if (currentIdx <= 0) {
      await send(from, "You're at the first step already. Let's go 👇");
      user.step = "awaiting_gender";
      await sendButtons(from, "What's your biological sex?", [{ id: "setup:male", title: "Male" }, { id: "setup:female", title: "Female" }]);
      return;
    }
    const prevStep = stepOrder[currentIdx - 1];
    user.step = prevStep;
    saveUsers(users);
    const prompts = {
      "awaiting_gender": async () => await sendButtons(from, "What's your biological sex?", [{ id: "setup:male", title: "Male" }, { id: "setup:female", title: "Female" }]),
      "weight": async () => await send(from, "↩️ No worries! What's your current weight in kg? (e.g. *86*)"),
      "height": async () => await send(from, "↩️ Got it. What's your height in cm? (e.g. *178*)"),
      "age": async () => await send(from, "↩️ And your age?"),
      "activity": async () => await sendButtons(from, "↩️ How active are you?", [{ id: "setup:sedentary", title: "Desk job 🪑" }, { id: "setup:light", title: "Light exercise" }, { id: "setup:active", title: "Very active 💪" }]),
      "target": async () => await sendButtons(from, "↩️ What's your goal?", [{ id: "setup:lose", title: "Lose weight" }, { id: "setup:maintain", title: "Maintain" }, { id: "setup:gain", title: "Build muscle" }]),
      "name": async () => await send(from, "↩️ What should I call you? (first name)"),
      "email": async () => await send(from, `↩️ What's your email?\n\nI'll send you daily food logs and weekly reports.\n\n_(Type *skip* if you'd rather not)_`),
      "budget": async () => await sendButtons(from, "↩️ Want to set a daily food budget?", [{ id: "setup:budget_100", title: "R100/day" }, { id: "setup:budget_150", title: "R150/day" }, { id: "setup:budget_200", title: "R200/day" }, { id: "setup:budget_skip", title: "Skip for now" }]),
    };
    if (prompts[prevStep]) await prompts[prevStep]();
    return;
  }

  if (step === "weight") {
    const w = parseFloat(msg);
    if (isNaN(w) || w < 30 || w > 300) {
      await send(from, "Please send your weight in kg (e.g. *82*)");
      return;
    }
    user.profile.weight = w;
    user.step = "height";
    await send(from, "Got it. What's your height in cm? (e.g. *178*)");
    return;
  }

  if (step === "height") {
    const h = parseFloat(msg);
    if (isNaN(h) || h < 100 || h > 250) {
      await send(from, "Please send your height in cm (e.g. *178*)");
      return;
    }
    user.profile.height = h;
    user.step = "age";
    await send(from, "And your age?");
    return;
  }

  if (step === "age") {
    const a = parseInt(msg);
    if (isNaN(a) || a < 10 || a > 100) {
      await send(from, "Please send your age as a number (e.g. *38*)");
      return;
    }
    user.profile.age = a;
    user.step = "activity";
    await sendButtons(from,
      "How active are you?",
      [
        { id: "setup:sedentary", title: "Desk job 🪑" },
        { id: "setup:light", title: "Light exercise" },
        { id: "setup:active", title: "Very active 💪" },
      ]
    );
    return;
  }

  // Late email capture (after 3 days)
  if (step === "email_late") {
    const email = msg.trim().toLowerCase();
    if (email === "skip") {
      user.email = null;
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        await send(from, "That doesn't look like a valid email. Try again or type *skip*");
        return;
      }
      user.email = email;
      await send(from, `✅ Got it! I'll send tips and updates to *${email}*. You can update this anytime with *email update*.`);
    }
    user.step = null;
    saveUsers(users);
    return;
  }

  if (step === "name") {
    const name = msg.trim();
    if (name.length < 1 || name.length > 50) {
      await send(from, "Please send your name (1-50 characters)");
      return;
    }
    user.name = name;
    user.step = "email";
    saveUsers(users);

    await send(from, `Nice one, ${name}! 👋\n\nWhat's your email address?\n\nI'll send you daily food logs and weekly progress reports. 📧`);
    return;
  }

  if (step === "email") {
    const emailText = msg.trim().toLowerCase();
    
    if (emailText === "skip" || emailText === "no" || emailText === "n") {
      await send(from, `I need your email to send you daily food logs and weekly reports — it's a big part of the experience! 💪\n\nJust type your email address:`);
      return;
    }
    
    // If it looks like food (no @ sign, common food words), skip email and log the food
    const foodIndicators = /^(coffee|tea|water|toast|eggs?|chicken|rice|bread|milk|juice|banana|apple|sandwich|salad|burger|pizza|pasta|cereal|oats|yoghurt|biltong|droewors|nandos|kfc|steers|mcdonalds|spur|wimpy|woolworths|checkers|\d+\s*(x|×)?\s*\w)/i;
    if (!emailText.includes('@') && foodIndicators.test(emailText)) {
      // User wants to log food, not give email — skip email step
      user.step = null;
      saveUsers(users);
      // Fall through to food logging below (don't return)
    } else {
      // Validate email
      const emailMatch = emailText.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/);
      if (!emailMatch) {
        await send(from, `That doesn't look like a valid email.\n\nTry again, or type *skip* to continue without email.`);
        return;
      }
    
      if (!user.profile) user.profile = {};
      user.profile.exportEmail = emailText;
      user.step = "budget";
      saveUsers(users);

      try {
        await sendButtons(from,
          `✅ Got it!\n\nLast thing — want to set a daily food budget?\n\nI'll track what you spend on food alongside your calories. You'll see exactly where your money goes.`,
          [
            { id: "setup:budget_100", title: "R100/day" },
            { id: "setup:budget_150", title: "R150/day" },
            { id: "setup:budget_200", title: "R200/day" },
            { id: "setup:budget_skip", title: "Skip for now" },
          ]
        );
      } catch {
        await send(from, `✅ Got it!\n\nLast thing — want to set a daily food budget?\n\nI'll track what you spend alongside your calories.\n\nReply with an amount (e.g. *R150*) or *skip*`);
      }
      return;
    }
  }

  if (step === "budget") {
    const budgetVal = msg.toLowerCase();
    if (budgetVal === "skip" || budgetVal === "setup:budget_skip" || budgetVal === "no") {
      // No budget set, continue to completion
    } else if (budgetVal === "setup:budget_100") {
      if (!user.profile) user.profile = {};
      user.profile.foodBudget = 100;
    } else if (budgetVal === "setup:budget_150") {
      if (!user.profile) user.profile = {};
      user.profile.foodBudget = 150;
    } else if (budgetVal === "setup:budget_200") {
      if (!user.profile) user.profile = {};
      user.profile.foodBudget = 200;
    } else {
      const amount = budgetVal.match(/(\d+)/);
      if (amount) {
        const budget = parseInt(amount[1]);
        if (budget >= 10 && budget <= 5000) {
          if (!user.profile) user.profile = {};
          user.profile.foodBudget = budget;
        }
      }
    }
    user.setup = true;
    user.step = "onboard_offer";
    saveUsers(users);

    const budgetMsg = user.profile?.foodBudget
      ? `\n💰 Food budget: *R${user.profile.foodBudget}/day*`
      : "";
    
    const emailMsg = user.profile?.exportEmail
      ? `\n📧 Email exports: *${user.profile.exportEmail}*`
      : "";

    await send(from,
      `✅ *All set, ${user.name}!*\n\n` +
      `Your goal: *${user.goal} cal/day*${budgetMsg}${emailMsg}\n\n` +
      `You're on a *7-day free trial* with all features unlocked 🎉\n\n` +
      `🔥 *Sign up now and get 10% off:*\n\n` +
      `📅 *Annual — R33/mo* (R399/yr, save 32%)\n` +
      `📅 *Monthly — R32.40/mo* (10% off R36)\n\n` +
      `This offer is only available right now 👇`
    );

    try {
      await sendButtons(from,
        `Lock in your 10% discount?`,
        [
          { id: "onboard_annual", title: "Annual R399/yr ⭐" },
          { id: "onboard_subscribe", title: "Monthly R32.40/mo" },
          { id: "onboard_skip", title: "Start Free Trial" },
        ]
      );
    } catch {
      await send(from, `💎 Subscribe now (10% off): ${discountLink}\n\nOr just start logging — type what you ate!`);
      user.step = null;
      saveUsers(users);
    }

    // Menu card now sent after first food log (see maybeFirstLogMenu below)
    return;
  }

  if (step === "onboard_offer") {
    const response = msg.toLowerCase().trim();
    if (response === "onboard_annual") {
      const link = getPayFastAnnualLink(from, 0);
      user.step = null;
      saveUsers(users);
      await send(from,
        `🎉 Smart choice! Here's your secure payment link:\n\n` +
        `${link}\n\n` +
        `✅ *R399/year* (R33/mo — best value)\n` +
        `✅ 7-day free trial — you won't be charged today\n` +
        `✅ Cancel anytime\n\n` +
        `While that's processing, let's log your first meal!\n\n` +
        `Just type what you've eaten, like:\n_"2 eggs on toast"_`
      );
    } else if (response === "onboard_subscribe") {
      const link = getPayFastMonthlyLink(from, 10);
      user.step = null;
      saveUsers(users);
      await send(from,
        `🎉 Great choice! Here's your secure payment link:\n\n` +
        `${link}\n\n` +
        `✅ 10% off locked in — *R32.40/month*\n` +
        `✅ 7-day free trial — you won't be charged today\n` +
        `✅ Cancel anytime\n\n` +
        `While that's processing, let's log your first meal!\n\n` +
        `Just type what you've eaten, like:\n_"2 eggs on toast"_`
      );
    } else {
      // Skip or any other message — start free trial
      user.step = null;
      saveUsers(users);
      await send(from,
        `No problem! Your *7-day free trial* is active 🎉\n\n` +
        `Let's log your first meal right now 👇\n\n` +
        `Just type what you've eaten today, like:\n` +
        `_"2 eggs on toast"_\n` +
        `_"coffee with milk"_\n` +
        `_"woolworths chicken wrap"_\n\n` +
        `Or snap a photo of your plate 📸\n\n` +
        `Go — what did you have for breakfast?`
      );
    }
    return;
  }

  if (step === "target") {
    try {
      await sendButtons(from,
        "What's your goal?",
        [
          { id: "setup:lose", title: "Lose weight" },
          { id: "setup:maintain", title: "Maintain" },
          { id: "setup:gain", title: "Build muscle" },
        ]
      );
    } catch {
      await send(from, "What's your goal?\n\nReply with one:\n• *lose* - lose weight\n• *maintain* - stay the same\n• *gain* - build muscle");
    }
    return;
  }

  if (step === "pace_lose") {
    try {
      await sendButtons(from,
        "How fast do you want to lose weight?",
        [
          { id: "setup:pace_aggressive", title: "Fast (0.75kg/wk)" },
          { id: "setup:pace_standard", title: "Normal (0.5kg/wk)" },
          { id: "setup:pace_chill", title: "Slow (0.25kg/wk)" },
        ]
      );
    } catch {
      await send(from, "How fast do you want to lose weight?\n\nReply with one:\n• *fast* - 0.75kg/week\n• *normal* - 0.5kg/week\n• *slow* - 0.25kg/week");
    }
    return;
  }

  if (step === "pace_gain") {
    try {
    await sendButtons(from,
      "How fast do you want to gain muscle?",
      [
        { id: "setup:pace_aggressive", title: "Fast (+500 cal)" },
        { id: "setup:pace_standard", title: "Normal (+300 cal)" },
        { id: "setup:pace_chill", title: "Lean (+200 cal)" },
      ]
    );
    } catch {
      await send(from, "How fast do you want to gain?\n\nReply with one:\n• *fast* - +500 cal/day\n• *normal* - +300 cal/day\n• *lean* - +200 cal/day");
    }
    return;
  }
}

// ── Main handler ──
async function handleMessage(from, text, imageId) {
  const users = loadUsers();
  const user = getUser(users, from);
  const msg = (text || "").trim();
  let msgLower = msg.toLowerCase();

  // ── Feedback capture ──
  if (user.awaitingFeedback && msg.length > 2 && !msg.startsWith('/')) {
    // Time window: only capture feedback if asked within the last 30 minutes
    const feedbackAskTime = user.feedbackAskedAt ? new Date(user.feedbackAskedAt).getTime() : 0;
    const minutesSinceAsk = (Date.now() - feedbackAskTime) / 60000;
    if (minutesSinceAsk > 30) {
      // Too long ago — they're probably logging food now, clear the flag
      user.awaitingFeedback = false;
      delete user.feedbackAskedAt;
      saveUsers(users);
    }
    // Don't capture if it looks like a food log or command
    const looksLikeFood = /^\d|^(undo|log|help|buddy|weight|export|goal|profile|settings|menu|subscribe|status)/i.test(msgLower);
    if (user.awaitingFeedback && !looksLikeFood) {
      const feedbackFile = './feedback.json';
      let feedback = [];
      try { feedback = JSON.parse(fs.readFileSync(feedbackFile, 'utf8')); } catch {}
      feedback.push({
        phone: phone.slice(-4), // anonymised
        name: user.name || 'Unknown',
        date: new Date().toISOString(),
        streak: user.streak || 0,
        daysActive: Object.keys(user.log || {}).filter(d => (user.log[d] || []).length > 0).length,
        message: msg
      });
      fs.writeFileSync(feedbackFile, JSON.stringify(feedback, null, 2));
      user.awaitingFeedback = false;
      saveUsers(users);
      await send(from, `🙏 Thanks for the feedback! We read every single response and it genuinely helps us improve. Keep tracking! 💪`);
      return;
    }
    // If it looks like food, clear the flag and let normal flow handle it
    user.awaitingFeedback = false;
    saveUsers(users);
  }

  const buddyAccept = (msgLower === "accept" || msgLower === "buddy accept");
  const buddyDecline = (msgLower === "decline" || msgLower === "buddy decline" || msgLower === "buddy reject");

  // ── Buddy request response ──
  if (user.buddyRequest && (buddyAccept || buddyDecline)) {
    const requesterPhone = user.buddyRequest.from;
    const requester = users[requesterPhone];

    if (!requester) {
      delete user.buddyRequest;
      delete user.awaitingBuddyResponse;
      saveUsers(users);
      await send(from, "⚠️ That buddy request is no longer valid.");
      return;
    }

    if (buddyAccept) {
      if (user.buddy?.paired) {
        await send(from, "⚠️ You're already paired. Send *buddy remove* first.");
        return;
      }
      if (requester?.buddy?.paired) {
        await send(from, "⚠️ They already have a buddy. Ask them to send *buddy remove* first.");
        return;
      }
      const nowIso = new Date().toISOString();
      user.buddy = { phone: requesterPhone, paired: true, pairedAt: nowIso };
      if (requester) requester.buddy = { phone: from, paired: true, pairedAt: nowIso };
      delete user.buddyRequest;
      delete user.awaitingBuddyResponse;
      saveUsers(users);
      await send(from, `✅ You're now buddies with *${requester?.name || requesterPhone}*`);
      if (requester) {
        await send(requesterPhone, `✅ *${user.name || from}* accepted your buddy request. You're now accountability buddies!`);
      }
      return;
    }

    if (buddyDecline) {
      delete user.buddyRequest;
      delete user.awaitingBuddyResponse;
      saveUsers(users);
      await send(from, `No worries — request declined.`);
      if (requester) {
        await send(requesterPhone, `❌ *${user.name || from}* declined your buddy request.`);
      }
      return;
    }
  }

  // ── Pending buddy request check ──
  if (user.buddyRequest && !user.awaitingBuddyResponse) {
    const requester = users[user.buddyRequest.from];
    const requesterName = requester?.name || user.buddyRequest.from;
    user.awaitingBuddyResponse = true;
    saveUsers(users);
    await send(from, `🤝 *${requesterName}* wants to be accountability buddies!\nReply *accept* or *decline*`);
  }

  // ── Influencer tracking (check for INF_ code in first message) ──
  if (msg.toUpperCase().includes('INF_') && !user.setup && !user.referredBy) {
    const infMatch = msg.match(/INF_([A-Z0-9_]+)/i);
    if (infMatch) {
      const infCode = infMatch[1].toUpperCase();
      if (isInfluencerCode(infCode)) {
        trackInfluencerSignup(infCode, from);
        user.referredBy = `INF_${infCode}`;
        saveUsers(users);
        
        const influencer = getInfluencerByCode(infCode);
        const infName = influencer.name || infCode;
        await send(from, `👋 Welcome to FitSorted!\n\nRecommended by *${infName}*. Let's get you set up! 🎉`);
        
        // Notify influencer (if they have a WhatsApp number)
        if (influencer.phone) {
          const signupCount = (influencer.signups || []).length;
          await send(influencer.phone, `🎉 New signup via your link!\n\n📊 Total signups: *${signupCount}*\n💰 Pending payout: *R${influencer.pendingPayout || 0}*\n\nKeep sharing! wa.me/27690684940?text=INF_${infCode}`);
        }
      }
    }
  }

  // ── Referral tracking (check for REF_ code in first message) ──
  if (msg.toUpperCase().includes('REF_') && !user.setup && !user.referredBy) {
    const refMatch = msg.match(/REF_([A-Z0-9]+)/i);
    if (refMatch) {
      const refCode = refMatch[1].toUpperCase();
      // Find referrer by code
      const referrerPhone = Object.keys(users).find(phone => {
        return generateReferralCode(phone) === `FS${refCode}`;
      });
      
      if (referrerPhone && referrerPhone !== from) {
        creditReferralRewards(referrerPhone, from, users);
        trackReferral(refCode, from);
        saveUsers(users);
        
        await send(from, `👋 Welcome to FitSorted!\n\nYou were referred by a friend — you both get a *free month of Premium!* 🎉\n\nLet's get you set up...`);
        
        const referrer = users[referrerPhone];
        const newReferralCount = (referrer.referrals || []).length;
        await send(referrerPhone, `🎉 Great news!\n\nSomeone just joined FitSorted using your referral link!\n\n🎁 *+1 free month of Premium earned!*\n📊 Total referrals: ${newReferralCount}\n\nKeep sharing to earn more free months!`);
      }
    }
  }

  // ── Image handling: try guess, then confirm ──
  if (imageId) {
    if (!msg) {
      if (!PRO_LAUNCH) {
        await send(from, "📸 Photo logging isn't live yet. Please type what you ate.");
        return;
      }
      const access = await hasAccess(from, user);
      if (!access) {
        const monthlyLink = getCleanPayLink("monthly", from);
        const annualLink = getCleanPayLink("annual", from);
        await send(from,
          `📸 Your 7-day free trial has ended.\n\n` +
          `Subscribe to keep using FitSorted:\n\n` +
          `📅 *Monthly — R36/mo*\n👉 ${monthlyLink}\n\n` +
          `🏆 *Annual — R399/year* _(save R189)_\n👉 ${annualLink}`
        );
        return;
      }
      const guess = await guessFoodFromImage(imageId);
      if (guess) {
        user.pendingFood = { text: guess, source: "image_guess", time: new Date().toISOString() };
        saveUsers(users);
        try {
          await sendButtons(from, `I think this is:\n*${guess}*\n\nLook right? If the portion size is off, tell me (e.g. _"large"_ or _"small"_ or _"about 300g"_).`, [
            { id: "confirm_log", title: "✅ Log it" },
            { id: "portion_small", title: "🤏 Smaller" },
            { id: "portion_large", title: "🍖 Bigger" }
          ]);
        } catch {
          await send(from, `I think this is:\n*${guess}*\n\nReply *log it* to confirm.\nSay *smaller* or *bigger* to adjust portion.\nOr *wrong* to cancel.`);
        }
        return;
      }
      await send(from, "📸 Got the photo. I couldn't confidently identify it.\n\nPlease type what you ate, e.g. *\"5 Finn Crisp with cheese\"*.");
      return;
    }
    // Save pending caption for confirmation
    user.pendingFood = { text: msg, source: "image", time: new Date().toISOString() };
    saveUsers(users);
    try {
      await sendButtons(from, `I can log this:\n*${msg}*\n\nLog it?`, [
        { id: "confirm_log", title: "Log it" },
        { id: "cancel_log", title: "Wrong" }
      ]);
    } catch {
      await send(from, `I can log this:\n*${msg}*\n\nReply *log it* to confirm, or *wrong* to cancel.`);
    }
    return;
  }

  // ── Referral code capture: JOIN-CODE ──
  if (/^join-[a-z0-9]+$/i.test(msgLower)) {
    const code = msg.substring(5).toUpperCase();
    const alreadyReferred = user.referredBy;
    if (!alreadyReferred) {
      user.referredBy = code;
      saveUsers(users);
      trackReferral(code, from);
    }
    // Continue into normal onboarding
    user.setup = false;
    user.step = "gender";
    user.profile = {};
    user.goal = null;
    saveUsers(users);
    await handleSetup(from, user, msg, users);
    saveUsers(users);
    return;
  }

  // ── Confirm pending food from image ──
  if (user.pendingFood) {
    const pending = user.pendingFood;
    if (["confirm_log","log it","yes","yep","confirm"].includes(msgLower)) {
      try {
        const result = await estimateCalories(pending.text, user);
        const today = getToday();
        if (!user.log[today]) user.log[today] = [];
        
        // Detect alcohol from pending text AND AI result
        const alcoholMatch = detectAlcohol(pending.text) || detectAlcohol(result.food);
        const alcoholUnits = alcoholMatch ? (alcoholMatch.units || 0) : 0;
        
        user.log[today].push({
          food: result.food,
          calories: result.calories,
          protein: result.protein || 0,
          carbs: result.carbs || 0,
          fat: result.fat || 0,
      fibre: result.fibre || 0,
          time: new Date().toISOString(),
          isAlcohol: !!alcoholMatch,
          units: alcoholUnits,
        });
        delete user.pendingFood;
        saveUsers(users);
        const total = getTodayTotal(user);
        const effectiveGoal = getEffectiveGoal(user);
        
        // Show drunk-o-meter for alcohol
        if (alcoholMatch) {
          const todayDrinks = getTodayAlcohol(user);
          const totalUnits = todayDrinks.reduce((s, e) => s + (e.units || 0), 0);
          const totalAlcoholCal = todayDrinks.reduce((s, e) => s + e.calories, 0);
          const gender = user.profile?.gender || "male";
          let alcoholMsg = `✅ *${result.food}* logged — ${result.calories} cal | ${alcoholUnits.toFixed(1)} units\n\n`;
          alcoholMsg += buildDrunkOMeterMessage(totalUnits, totalAlcoholCal, gender, todayDrinks);
          alcoholMsg += `\n\n📊 Today total: *${total} / ${effectiveGoal} cal*`;
          await send(from, alcoholMsg);
        } else {
          const message = `✅ *${result.food}* - ${result.calories} cal\n\n📊 Today: *${total} / ${effectiveGoal} cal*\n${deficitMessage(total, effectiveGoal)}`;
          console.log('[FOOD] Attempting to send buttons for:', result.food);
          await sendButtons(from, message, [
            { id: 'correct_last', title: '✏️ Edit' },
            { id: 'undo_last', title: '❌ Remove' }
          ]);
        }
        await maybeFirstLogMenu(from, user, users);
        await maybePromptPro(from, user, users);
      } catch (err) {
        delete user.pendingFood;
        saveUsers(users);
        await send(from, "Couldn't estimate that from the caption. Please type the food details.");
      }
      return;
    }
    if (["cancel_log","wrong","no","nope"].includes(msgLower)) {
      delete user.pendingFood;
      saveUsers(users);
      await send(from, "No worries. Please type the correct food details.");
      return;
    }
    // Portion size adjustments
    if (msgLower === "portion_small" || msgLower === "smaller" || msgLower === "small" || msgLower === "small portion" || msgLower === "🤏") {
      pending.text = `small portion of ${pending.text}`;
      user.pendingFood = pending;
      saveUsers(users);
      await send(from, `Got it — logging a *small portion* of ${pending.text.replace('small portion of ', '')}.\n\nReply *log it* to confirm.`);
      return;
    }
    if (msgLower === "portion_large" || msgLower === "bigger" || msgLower === "large" || msgLower === "big" || msgLower === "big portion" || msgLower === "large portion" || msgLower === "🍖") {
      pending.text = `large portion of ${pending.text}`;
      user.pendingFood = pending;
      saveUsers(users);
      await send(from, `Got it — logging a *large portion* of ${pending.text.replace('large portion of ', '')}.\n\nReply *log it* to confirm.`);
      return;
    }
    // User specifies exact size (e.g. "about 300g", "200 grams")
    if (/\d+\s*g(rams?)?/i.test(msgLower)) {
      pending.text = `${pending.text} (${msg.trim()})`;
      user.pendingFood = pending;
      saveUsers(users);
      await send(from, `Got it — logging *${pending.text}*.\n\nReply *log it* to confirm.`);
      return;
    }
  }

  // ── Button callbacks: correct_last, undo_last ──
  if (msgLower === 'correct_last') {
    await send(from, `📝 *Enter correct calories*\n\nFormat: *food name | calories*\n(Use the pipe symbol | not slash /)\n\nExample:\n_the nutter large | 865_`);
    return;
  }

  if (msgLower === 'undo_last') {
    // Trigger undo flow
    return handleMessage(from, 'undo', null);
  }

  // ── Admin: "users" shows user count + activity ──
  if (msgLower === "users" && from === ADMIN_NUMBER) {
    const now = new Date();
    const oneDay = 86400000;
    const allUsers = Object.entries(users).filter(([p]) => !p.includes('backup'));
    let active1d = 0, active7d = 0, active30d = 0;
    for (const [phone, u] of allUsers) {
      const dates = Object.keys(u.log || {}).sort().reverse();
      if (!dates.length) continue;
      const last = new Date(dates[0] + 'T23:59:59');
      const days = (now - last) / oneDay;
      if (days <= 1) active1d++;
      if (days <= 7) active7d++;
      if (days <= 30) active30d++;
    }
    const totalLogs = allUsers.reduce((sum, [,u]) => sum + Object.values(u.log || {}).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0), 0);
    await send(from,
      `📊 *FitSorted Users*\n\n` +
      `👥 Total: *${allUsers.length}*\n` +
      `🟢 Active today: *${active1d}*\n` +
      `🟡 Active 7 days: *${active7d}*\n` +
      `🔵 Active 30 days: *${active30d}*\n` +
      `📝 Total food logs: *${totalLogs}*`
    );
    return;
  }

  // ── Admin stats: "stats CODE" or "stats all" ──
  if (msgLower.startsWith("stats") && from === ADMIN_NUMBER) {
    const parts = msg.split(" ");
    const target = parts[1] ? parts[1].toUpperCase() : null;
    const refs = loadReferrals();

    if (!target || target === "ALL") {
      if (Object.keys(refs).length === 0) {
        await send(from, "📊 No referrals tracked yet.");
        return;
      }
      const lines = Object.entries(refs)
        .sort((a, b) => b[1].signups.length - a[1].signups.length)
        .map(([code, data]) => `• *${code}* - ${data.signups.length} signup${data.signups.length !== 1 ? "s" : ""}`)
        .join("\n");
      await send(from, `📊 *Referral Stats - All Codes:*\n\n${lines}`);
    } else {
      const data = getReferralStats(target);
      if (!data) {
        await send(from, `❌ No data for code *${target}*`);
        return;
      }
      await send(from, `📊 *Referral Stats - ${target}*\n\n👥 Signups: ${data.signups.length}`);
    }
    return;
  }

  // ── Admin: Influencer management ──
  // Add influencer: "inf add CODE NAME PHONE" e.g. "inf add SARAH Sarah Jones 27821234567"
  if (msgLower.startsWith("inf add ") && from === ADMIN_NUMBER) {
    const parts = msg.slice(8).trim().split(/\s+/);
    if (parts.length < 2) {
      await send(from, "Usage: *inf add CODE NAME [PHONE]*\n\ne.g. inf add SARAH Sarah 27821234567");
      return;
    }
    const code = parts[0].toUpperCase();
    const phone = parts[parts.length - 1].match(/^27\d{9}$/) ? parts.pop() : null;
    const name = parts.slice(1).join(" ");
    
    const influencers = loadInfluencers();
    influencers[code] = {
      name: name || code,
      phone: phone,
      createdAt: new Date().toISOString(),
      signups: [],
      totalEarned: 0,
      pendingPayout: 0,
      totalPaid: 0
    };
    saveInfluencers(influencers);
    
    const link = `wa.me/27690684940?text=INF_${code}`;
    await send(from, `✅ Influencer added!\n\n👤 *${name || code}*\nCode: INF_${code}\n${phone ? `Phone: ${phone}\n` : ""}Link: ${link}\nRate: R10/signup\n\nShare this link with them.`);
    return;
  }

  // List all influencers: "inf list"
  if (msgLower === "inf list" && from === ADMIN_NUMBER) {
    const influencers = loadInfluencers();
    if (Object.keys(influencers).length === 0) {
      await send(from, "📊 No influencers set up yet.\n\nAdd one with: *inf add CODE NAME [PHONE]*");
      return;
    }
    const lines = Object.entries(influencers)
      .map(([code, inf]) => {
        const signups = (inf.signups || []).length;
        return `• *${inf.name}* (INF_${code})\n  📊 ${signups} signups | 💰 R${inf.pendingPayout || 0} pending | R${inf.totalPaid || 0} paid`;
      })
      .join("\n\n");
    await send(from, `📊 *Influencer Dashboard*\n\n${lines}`);
    return;
  }

  // Influencer stats: "inf stats CODE"
  if (msgLower.startsWith("inf stats ") && from === ADMIN_NUMBER) {
    const code = msg.slice(10).trim().toUpperCase();
    const influencers = loadInfluencers();
    const inf = influencers[code];
    if (!inf) {
      await send(from, `❌ No influencer with code *${code}*`);
      return;
    }
    const signups = (inf.signups || []);
    const recentSignups = signups.slice(-5).map(s => 
      `  • ${s.phone.slice(0,5)}***${s.phone.slice(-3)} — ${new Date(s.date).toLocaleDateString()}`
    ).join("\n");
    
    await send(from,
      `📊 *${inf.name}* (INF_${code})\n\n` +
      `👥 Total signups: *${signups.length}*\n` +
      `💰 Total earned: *R${inf.totalEarned || 0}*\n` +
      `⏳ Pending payout: *R${inf.pendingPayout || 0}*\n` +
      `✅ Total paid out: *R${inf.totalPaid || 0}*\n` +
      `📅 Created: ${new Date(inf.createdAt).toLocaleDateString()}\n` +
      `🔗 Link: wa.me/27690684940?text=INF_${code}` +
      (recentSignups ? `\n\n*Recent signups:*\n${recentSignups}` : "")
    );
    return;
  }

  // Mark influencer as paid: "inf paid CODE AMOUNT"
  if (msgLower.startsWith("inf paid ") && from === ADMIN_NUMBER) {
    const parts = msg.slice(9).trim().split(/\s+/);
    const code = (parts[0] || "").toUpperCase();
    const amount = parseInt(parts[1]) || 0;
    
    const influencers = loadInfluencers();
    if (!influencers[code]) {
      await send(from, `❌ No influencer with code *${code}*`);
      return;
    }
    
    influencers[code].totalPaid = (influencers[code].totalPaid || 0) + amount;
    influencers[code].pendingPayout = Math.max(0, (influencers[code].pendingPayout || 0) - amount);
    if (!influencers[code].payouts) influencers[code].payouts = [];
    influencers[code].payouts.push({ amount, date: new Date().toISOString() });
    saveInfluencers(influencers);
    
    await send(from, `✅ Marked *R${amount}* paid to *${influencers[code].name}*\n\n⏳ Remaining pending: R${influencers[code].pendingPayout}`);
    
    // Notify influencer if they have a phone number
    if (influencers[code].phone) {
      await send(influencers[code].phone, `💰 *FitSorted payout!*\n\nR${amount} has been sent to you. Thanks for spreading the word! 🙏\n\nKeep sharing: wa.me/27690684940?text=INF_${code}`);
    }
    return;
  }

  // Remove influencer: "inf remove CODE"
  if (msgLower.startsWith("inf remove ") && from === ADMIN_NUMBER) {
    const code = msg.slice(11).trim().toUpperCase();
    const influencers = loadInfluencers();
    if (!influencers[code]) {
      await send(from, `❌ No influencer with code *${code}*`);
      return;
    }
    const name = influencers[code].name;
    delete influencers[code];
    saveInfluencers(influencers);
    await send(from, `✅ Removed influencer *${name}* (${code})`);
    return;
  }

  // ── Admin broadcast: "broadcast: message" or send image with caption "broadcast: message" ──
  if (msgLower.startsWith("broadcast:") && from === ADMIN_NUMBER) {
    const broadcastMsg = msg.slice("broadcast:".length).trim();
    if (!broadcastMsg && !imageId) {
      await send(from, "❌ Usage:\n• Text: *broadcast: Your message here*\n• Image: Send an image with caption *broadcast: Your caption*");
      return;
    }

    const recipients = Object.entries(users).filter(([phone, u]) => u.setup && u.goal && phone !== ADMIN_NUMBER && !u.optedOut);
    let sent = 0, failed = 0;

    for (const [phone, u] of recipients) {
      try {
        if (imageId) {
          await sendImage(phone, imageId, broadcastMsg || "");
        } else {
          await send(phone, broadcastMsg);
        }
        sent++;
        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error(`Broadcast failed for ${phone}:`, err.message);
        failed++;
      }
    }

    await send(from, `📢 *Broadcast sent!*\n\n✅ Delivered: ${sent}\n❌ Failed: ${failed}\n👥 Total users: ${recipients.length}`);
    return;
  }

  // ── Admin export emails: "export-emails" ──
  if (msgLower === "export-emails" && from === ADMIN_NUMBER) {
    const usersWithEmails = Object.entries(users)
      .filter(([phone, user]) => user.email && user.email.trim().length > 0)
      .map(([phone, user]) => {
        const joinDate = user.joinedAt ? new Date(user.joinedAt).toISOString().split('T')[0] : 'unknown';
        const target = user.profile?.target || 'unknown';
        return {
          name: user.name || 'N/A',
          email: user.email,
          phone: phone,
          joined: joinDate,
          goal: user.goal || 'N/A',
          target: target
        };
      });

    if (usersWithEmails.length === 0) {
      await send(from, "📧 No users have provided emails yet.");
      return;
    }

    // Generate CSV
    const csv = [
      "Name,Email,Phone,Joined,Goal (cal/day),Target",
      ...usersWithEmails.map(u => `"${u.name}","${u.email}","${u.phone}","${u.joined}","${u.goal}","${u.target}"`)
    ].join("\n");

    // Save to file
    const exportPath = '/Users/brandonkatz/.openclaw/workspace/fitsorted/email-export.csv';
    fs.writeFileSync(exportPath, csv);

    await send(from,
      `📧 *Email Export Ready*\n\n` +
      `✅ ${usersWithEmails.length} user${usersWithEmails.length !== 1 ? 's' : ''} with emails\n\n` +
      `Saved to: \`email-export.csv\`\n\n` +
      `Ready to import to Beehiiv! 🐝`
    );
    return;
  }

  // ── Handle menu list selections - redirect to actual commands ──
  console.log(`[handleMessage] from=${from} msgLower="${msgLower}"`);
  const menuMap = {
    "menu:log": "log", "menu:undo": "undo", "menu:weight_history": "weight history",
    "menu:projection": "projection", "menu:my_foods": "my foods", "menu:start": "start", 
    "menu:export": "export", "menu:help": "help",
  };
  if (menuMap[msgLower]) { console.log(`[menu] Redirecting ${msgLower} → ${menuMap[msgLower]}`); msgLower = menuMap[msgLower]; }

  // ── Natural language intent matching ──
  // Routes conversational phrases to existing commands so users don't need to remember exact keywords
  const intentPatterns = [
    // Drinking / BAC
    { patterns: [/how drunk/i, /am i drunk/i, /can i drive/i, /over the limit/i, /how many drinks/i, /how many units/i, /what did i drink/i, /what have i drunk/i, /drink count/i, /my drinks/i, /how much (have i|did i) (drunk|drank|drink)/i, /show.*drinks/i, /tonight'?s drinks/i, /drinking/i], redirect: "drinks" },
    // Today's log
    { patterns: [/what (have i|did i) eat/i, /how('?s| is) my day/i, /show me today/i, /today'?s (food|log|calories|cals)/i, /check my day/i, /day so far/i, /how many cal/i, /how many calories/i, /calorie count/i, /my calories/i, /what('?s| is) my total/i, /where am i at/i, /how am i doing/i], redirect: "log" },
    // Weekly stats
    { patterns: [/how was my week/i, /this week/i, /weekly (stats|summary|report|progress)/i, /my week/i, /show.*week/i, /past.*week/i, /7 day/i], redirect: "week" },
    // Weight
    { patterns: [/how much do i weigh/i, /weight (trend|history|progress|graph)/i, /show.*weight/i, /weigh-?ins?/i, /track.*weight/i], redirect: "weight history" },
    // Steps
    { patterns: [/how many steps/i, /step count/i, /show.*steps/i, /step (progress|trend|streak)/i, /my steps/i, /did i hit.*steps/i], redirect: "steps" },
    // Profile / settings
    { patterns: [/my (settings|profile|details|info)/i, /show.*(profile|settings)/i, /what are my (stats|settings|details)/i, /view.*profile/i], redirect: "my profile" },
    // Profile fix requests (no specific value — guide them)
    { patterns: [/(?:fix|change|update|correct|wrong|incorrect|edit)\s+(?:my\s+)?(?:calorie|calories|allowance|daily|target|goal|budget)/i, /calorie.*(wrong|incorrect|too low|too high|fix|change)/i, /my (?:calorie|daily|target).*(wrong|off|incorrect)/i, /(?:recalculate|recalc|redo)\s+(?:my\s+)?(?:calories|goal|target|allowance)/i], redirect: "profile_fix_guide" },
    // Undo
    { patterns: [/that('?s| was| is) wrong/i, /take (that|it) back/i, /made a mistake/i, /remove (the )?last/i, /wrong (one|entry|food|item)/i, /didn'?t (eat|have|mean) that/i, /oops/i, /scratch that/i, /cancel (that|last)/i], redirect: "undo" },
    // Correct / manual entry
    { patterns: [/(wrong|incorrect) (calorie|calories|cal|amount)/i, /(fix|correct|adjust|change) (the )?(calorie|calories|last entry)/i, /manual(ly)? (enter|add|log)/i, /let me (enter|type|add) (it|calories) manual/i], redirect: "correct" },
    // Meal suggestions
    { patterns: [/what (should|can|could) i eat/i, /suggest.*(meal|food|snack|lunch|dinner|breakfast)/i, /meal idea/i, /what('?s| is) (good|healthy) to eat/i, /i'?m hungry/i, /snack idea/i, /low cal.*(idea|option|suggestion|meal)/i, /under \d+ cal/i], redirect: "menu:suggest" },
    // Help / menu
    { patterns: [/how does this work/i, /what do you do/i, /how to use/i, /show me.*menu/i, /what are.*(commands|options|features)/i], redirect: "help" },
    // Subscription / status
    { patterns: [/am i (on )?(premium|pro|free|trial)/i, /my (plan|subscription|account)/i, /when does.*(trial|sub)/i], redirect: "status" },
    // Referral
    { patterns: [/tell (my |a )?friend/i, /share.*fitsorted/i, /how (do|can) i (invite|refer|share)/i, /get.*(free|discount|reward)/i], redirect: "invite" },
    // Export
    { patterns: [/email.*(log|report|data|food)/i, /send.*email/i, /download.*(data|log|food)/i, /give me my data/i, /get my data/i], redirect: "export" },
    // Budget
    { patterns: [/food budget/i, /how much.*(spent|spending)/i, /my (food )?spending/i, /daily (food )?budget/i, /what did i spend/i], redirect: "budget" },
  ];

  for (const { patterns, redirect } of intentPatterns) {
    if (patterns.some(p => p.test(msgLower))) {
      console.log(`[intent] "${msgLower}" → ${redirect}`);
      msgLower = redirect;
      break;
    }
  }

  // ── Budget setting (premium feature) ──
  const budgetMatch = msgLower.match(/^budget\s+r?(\d+)$/);
  if (budgetMatch) {
    const budgetAccess = await hasAccess(from, user);
    if (!budgetAccess) {
      const monthlyLink = getPayFastMonthlyLink(from);
      await send(from,
        `💰 *Food budget tracking is a Premium feature*\n\n` +
        `Track how much you spend on food alongside your calories. Set a daily budget and watch every rand.\n\n` +
        `💎 *R${PRO_PRICE}/mo* — 7-day free trial\n` +
        `🔗 ${monthlyLink}\n\n` +
        `_Launch price — won't last forever._`
      );
      return;
    }
    const budget = parseInt(budgetMatch[1]);
    if (budget < 10 || budget > 5000) {
      await send(from, "Budget should be between R10 and R5,000 per day.");
      return;
    }
    if (!user.profile) user.profile = {};
    user.profile.foodBudget = budget;
    saveUsers(users);
    await send(from, `✅ Daily food budget set to *R${budget}*\n\nI'll track your spending alongside calories. Change anytime with *budget R[amount]*.`);
    return;
  }
  if (msgLower === "budget") {
    const budget = user.profile?.foodBudget;
    const today = getToday();
    const dailySpend = (user.log[today] || []).reduce((s, e) => s + (e.priceZAR || 0), 0);
    if (budget) {
      const remaining = budget - dailySpend;
      const emoji = remaining >= 0 ? "🟢" : "🔴";
      await send(from, `💰 *Food Budget*\nToday: R${dailySpend} / R${budget} ${emoji}\n${remaining >= 0 ? `R${remaining} left` : `R${Math.abs(remaining)} over budget`}\n\nChange with *budget R[amount]*`);
    } else {
      await send(from, `💰 No daily food budget set yet.\n\nSet one with *budget R150* (or any amount).`);
    }
    return;
  }

  if (msgLower === "menu:weight") {
    user.awaitingWeight = true;
    saveUsers(users);
    await send(from, "⚖️ What do you weigh today?\n\nJust send the number, e.g. *84.5*");
    return;
  }
  if (msgLower === "menu:suggest") {
    const remaining = user.goal - getTodayTotal(user);
    await send(from, `🧠 You have *${Math.max(0, remaining)} cal* left today.\n\nWhat kind of meal are you looking for? Just ask!\n\n_e.g. "what can I eat under ${Math.max(200, remaining)} cal?" or "high protein lunch ideas"_`);
    return;
  }
  if (msgLower === "menu:support") {
    console.log(`[support] Support menu triggered by ${from}`);
    // Generate debug snapshot and send to admin
    const now = new Date();
    const today = getToday();
    const todayEntries = (user.log?.[today] || []);
    const totalCal = todayEntries.reduce((s, e) => s + (e.calories || 0), 0);
    const lastWeight = user.weights?.length ? user.weights[user.weights.length - 1] : null;
    const daysSinceSignup = user.joinedAt ? Math.floor((now - new Date(user.joinedAt)) / 86400000) : '?';
    const totalEntries = Object.values(user.log || {}).reduce((s, arr) => s + arr.length, 0);
    const streak = user.streak || 0;

    const debug = [
      `🔧 *Support Request*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `👤 *${user.name || 'Unknown'}* (${from})`,
      `📅 Signed up: ${daysSinceSignup} days ago`,
      ``,
      `⚙️ *Account State*`,
      `• Setup complete: ${user.setup ? '✅' : '❌'}`,
      `• Current step: ${user.step || 'none'}`,
      `• Goal: ${user.goal || 'not set'} cal/day`,
      `• Profile: ${user.profile?.gender || '?'}, ${user.profile?.weight || '?'}kg, ${user.profile?.height || '?'}cm, age ${user.profile?.age || '?'}`,
      `• Activity: ${user.profile?.activity || '?'}`,
      `• Target: ${user.profile?.target || '?'} (${user.profile?.pace || '?'})`,
      `• Pro: ${user.pro ? '✅' : '❌'}`,
      ``,
      `📊 *Today (${today})*`,
      `• Entries: ${todayEntries.length}`,
      `• Calories: ${totalCal} / ${user.goal || '?'}`,
      `• Last 3: ${todayEntries.slice(-3).map(e => `${e.food || e.description || '?'} (${e.calories})`).join(', ') || 'none'}`,
      ``,
      `📈 *Overall*`,
      `• Total entries: ${totalEntries}`,
      `• Streak: ${streak} days`,
      `• Last weight: ${lastWeight ? `${lastWeight.kg}kg (${lastWeight.date})` : 'never'}`,
      `• Weights logged: ${user.weights?.length || 0}`,
      `• Custom foods: ${Object.keys(user.customFoods || {}).length}`,
      ``,
      `🍽️ *Custom Foods:* ${Object.keys(user.customFoods || {}).length > 0 ? Object.entries(user.customFoods).map(([name, cal]) => `${name} (${cal})`).join(', ') : 'none'}`,
    ].join('\n');

    // Acknowledge user immediately
    await send(from, `✅ *Support request received!*\n\nI'm sending your debug info to the team now.`);

    // Send debug to admin
    if (ADMIN_NUMBER) {
      await send(ADMIN_NUMBER, debug);
    }

    // Save to support log
    const supportFile = "/Users/brandonkatz/.openclaw/workspace/fitsorted/support-requests.jsonl";
    try {
      fs.appendFileSync(supportFile, JSON.stringify({
        time: now.toISOString(), from, name: user.name, debug
      }) + "\n");
    } catch (e) {}

    await send(from,
      `🔧 *Support ticket created!*\n\n` +
      `I've sent your account details to our team so they can help faster.\n\n` +
      `*In the meantime, try:*\n` +
      `• Send *start* to redo your setup\n` +
      `• Send *undo* to fix a wrong entry\n` +
      `• Send *bug: [describe issue]* for specific problems\n\n` +
      `We'll get back to you soon! 💪`
    );
    console.log(`[support] Debug sent to admin for ${from}`);
    return;
  }
  if (msgLower.startsWith("menu:")) {
    console.log(`[menu] Unknown menu action: ${msgLower}`);
    await send(from, "⚠️ That menu option didn't register. Try again.");
    return;
  }

  // Reset
  if (msgLower === "start" || msgLower === "/start" || msgLower === "reset" || msgLower === "hi" || msgLower === "hello") {
    // Re-opt-in if previously opted out
    if (user.optedOut) {
      user.optedOut = false;
      delete user.optedOutAt;
      saveUsers(users);
      await send(from, `Welcome back! 🎉 Great to have you here again.\n\nYour data is still saved. Just type what you're eating and I'll track it for you! 💪`);
      return;
    }
    user.setup = false;
    user.step = "gender";
    user.profile = {};
    user.goal = null;
    saveUsers(users);
    await handleSetup(from, user, msg, users);
    saveUsers(users);
    return;
  }

  // Force setup if goal is missing (but not mid-setup button press)
  if (!user.goal && !msg.startsWith("setup:") && !user.step) {
    user.setup = false;
    user.step = "gender";
    user.profile = {};
    saveUsers(users);
    await handleSetup(from, user, msg, users);
    saveUsers(users);
    return;
  }

  // Handle setup button responses
  if (msg.startsWith("setup:")) {
    const val = msg.replace("setup:", "");

    if (val === "earlybird:monthly" || val === "earlybird:annual" || val === "earlybird:skip") {
      if (val === "earlybird:skip") {
        await send(from, `No worries! What's your current weight in kg? (e.g. *86*)`);
      } else {
        const isAnnual = val === "earlybird:annual";
        const link = isAnnual ? getPayFastAnnualLink(from, 39) : getPayFastMonthlyLink(from, 39);
        const price = isAnnual ? "R399/year" : "R36/mo";
        user.promoCode = "EARLYBIRD";
        user.promoDiscount = 39;
        saveUsers(users);
        await send(from,
          `🎉 Great choice! Here's your early bird link:\n\n` +
          `👉 ${link}\n\n` +
          `7-day free trial, then ${price}. Your card is stored securely by PayFast — cancel anytime.\n\n` +
          `_Meanwhile, let's set up your goals..._\n\nWhat's your current weight in kg? (e.g. *86*)`
        );
      }
      return;
    }

    if (val === "male" || val === "female") {
      user.profile.gender = val;
      user.step = "weight";
      saveUsers(users);
      await send(from, `Got it! 💪 What's your current weight in kg? (e.g. *86*)`);
      return;
    }

    if (["sedentary", "light", "moderate", "active"].includes(val)) {
      user.profile.activity = val;
      user.step = "target";
      saveUsers(users);
      await handleSetup(from, user, msg, users);
      saveUsers(users);
      return;
    }

    if (["lose", "gain"].includes(val)) {
      user.profile.target = val;
      user.step = `pace_${val}`;  // Go to pace selection
      saveUsers(users);
      await handleSetup(from, user, msg, users);
      saveUsers(users);
      return;
    }

    if (val === "maintain") {
      user.profile.target = "maintain";
      user.profile.pace = "standard";  // Maintain has no pace options
      const { bmr, tdee, goal } = calculateGoal(user.profile);
      user.goal = goal;
      user.step = "name";  // Ask for name next
      saveUsers(users);

      await send(from, `Got it! Your goal is *${goal} cal/day* to maintain weight.\n\nWhat's your name? (First name is fine)`);
      return;
    }

    if (val.startsWith("pace_")) {
      const pace = val.replace("pace_", "");  // aggressive, standard, or chill
      user.profile.pace = pace;
      const { bmr, tdee, goal } = calculateGoal(user.profile);
      user.goal = goal;
      user.step = "name";  // Ask for name next
      saveUsers(users);

      const target = user.profile.target;
      const paceLabels = {
        lose: {
          aggressive: "aggressive loss (-750 cal, 0.75kg/week)",
          standard: "standard loss (-500 cal, 0.5kg/week)",
          chill: "chill loss (-250 cal, 0.25kg/week)",
        },
        gain: {
          aggressive: "aggressive gain (+500 cal)",
          standard: "lean bulk (+300 cal)",
          chill: "very lean bulk (+200 cal)",
        },
      };

      const targetLabel = paceLabels[target]?.[pace] || "custom goal";

      await send(from, `Got it! Your goal is *${goal} cal/day* (${targetLabel}).\n\nWhat's your name? (First name is fine)`);
      return;
    }
  }

  // Still in setup flow
  if (!user.setup) {
    if (!user.step) user.step = "gender";
    await handleSetup(from, user, msg, users);
    saveUsers(users);
    return;
  }

  // In setup text steps (including late email capture)
  if (user.step && ["weight", "height", "age", "name", "email", "email_late", "budget", "onboard_offer"].includes(user.step)) {
    await handleSetup(from, user, msg, users);
    saveUsers(users);
    return;
  }

  // Stuck on pace selection - handle text replies or default to standard
  if (user.step && (user.step === "pace_lose" || user.step === "pace_gain")) {
    // Map text replies to pace values
    const paceMap = { fast: "aggressive", normal: "standard", slow: "chill", lean: "chill", aggressive: "aggressive", standard: "standard", chill: "chill" };
    const pace = paceMap[msgLower] || "standard";
    user.profile.pace = pace;
    const { bmr, tdee, goal } = calculateGoal(user.profile);
    user.goal = goal;
    user.step = "name";
    saveUsers(users);
    const paceLabel = pace === "aggressive" ? "fast" : pace === "chill" ? "slow" : "normal";
    await send(from, `Got it - *${paceLabel}* pace.\n\nYour daily goal: *${goal} cal/day*\n\nWhat's your name? (First name is fine)`);
    return;
  }

  // Stuck on target selection - handle text replies
  if (user.step === "target") {
    const targetMap = { lose: "lose", "lose weight": "lose", maintain: "maintain", gain: "gain", "build muscle": "gain", muscle: "gain" };
    const target = targetMap[msgLower];
    if (target) {
      user.profile.target = target;
      if (target === "maintain") {
        user.profile.pace = "standard";
        const { bmr, tdee, goal } = calculateGoal(user.profile);
        user.goal = goal;
        user.step = "name";
        saveUsers(users);
        await send(from, `Got it! Your goal is *${goal} cal/day* to maintain weight.\n\nWhat's your name? (First name is fine)`);
      } else {
        user.step = `pace_${target}`;
        saveUsers(users);
        await handleSetup(from, user, msg, users);
        saveUsers(users);
      }
      return;
    }
    // Unrecognized - resend the question
    await send(from, "What's your goal?\n\nReply with one:\n• *lose* - lose weight\n• *maintain* - stay the same\n• *gain* - build muscle");
    return;
  }

  // ── Challenges ──
  const challenges = loadChallenges();
  if (user.challenge && (!challenges[user.challenge] || !challenges[user.challenge].active)) {
    delete user.challenge;
    saveUsers(users);
  }

  if (msgLower === "challenge create") {
    await send(from, "Usage: *challenge create [name]*");
    return;
  }

  const challengeCreateMatch = msg.match(/^challenge\s+create\s+(.+)$/i);
  if (challengeCreateMatch) {
    if (!user.setup || !user.goal) {
      await send(from, "⚠️ Finish setup first, then create a challenge.");
      return;
    }
    if (user.challenge) {
      await send(from, "⚠️ You're already in a challenge. Send *challenge leave* first.");
      return;
    }
    const name = challengeCreateMatch[1].trim();
    if (!name) {
      await send(from, "Usage: *challenge create [name]*");
      return;
    }
    const code = generateChallengeCode(challenges);
    const nowIso = new Date().toISOString();
    challenges[code] = {
      name,
      code,
      creator: from,
      createdAt: nowIso,
      startedAt: null,
      endsAt: null,
      duration: 30,
      members: [from],
      active: true
    };
    user.challenge = code;
    saveChallenges(challenges);
    saveUsers(users);
    await send(from,
      `🏆 Challenge *${name}* created!\n\n` +
      `Share this code with your mates:\n*${code}*\n\n` +
      `They just send: *join ${code}*\n\n` +
      `30 days starts when you say *challenge start* (or auto-starts when 3+ people join)`
    );
    return;
  }

  const challengeJoinMatch = msg.match(/^(?:join|challenge\s+join)\s+([a-z0-9-]+)$/i);
  if (challengeJoinMatch) {
    if (!user.setup || !user.goal) {
      await send(from, "⚠️ Finish setup first, then join a challenge.");
      return;
    }
    const code = challengeJoinMatch[1].toUpperCase();
    if (!/^FIT-[A-Z0-9]{3}$/.test(code)) {
      await send(from, "❌ Invalid code. Format: *FIT-A3K*");
      return;
    }
    const challenge = challenges[code];
    if (!challenge || !challenge.active) {
      await send(from, "❌ Challenge not found or no longer active.");
      return;
    }
    if (user.challenge && user.challenge !== code) {
      await send(from, "⚠️ You're already in a challenge. Send *challenge leave* first.");
      return;
    }
    const members = challenge.members || [];
    if (!members.includes(from) && members.length >= 20) {
      await send(from, "⚠️ This challenge is full (max 20 members).");
      return;
    }
    if (!members.includes(from)) members.push(from);
    challenge.members = members;
    user.challenge = code;

    let autoStarted = false;
    if (!challenge.startedAt && challenge.members.length >= 3) {
      const startDateStr = getToday();
      const endDateStr = addDaysToDateStr(startDateStr, (challenge.duration || 30) - 1);
      challenge.startedAt = new Date().toISOString();
      challenge.endsAt = new Date(endDateStr + "T23:59:59Z").toISOString();
      autoStarted = true;
    }

    saveChallenges(challenges);
    saveUsers(users);

    const memberNames = challenge.members.map(p => getMemberFirstName(users, p)).join(", ");
    let joinMsg = `✅ You've joined *${challenge.name}*! ${challenge.members.length} people so far.\n\nMembers: ${memberNames}`;
    if (autoStarted) {
      joinMsg += `\n\n🏁 Challenge started! Day 1/${challenge.duration || 30}`;
    }
    await send(from, joinMsg);

    for (const phone of challenge.members) {
      if (phone === from) continue;
      await send(phone, `${user.name || from} just joined the challenge! 💪`);
    }
    return;
  }

  if (msgLower === "challenge join") {
    await send(from, "Usage: *join FIT-XXX*");
    return;
  }

  if (msgLower === "challenge start") {
    if (!user.challenge) {
      await send(from, "⚠️ You're not in a challenge yet.\n\nCreate one with: *challenge create [name]*");
      return;
    }
    const challenge = challenges[user.challenge];
    if (!challenge || !challenge.active) {
      delete user.challenge;
      saveUsers(users);
      await send(from, "⚠️ That challenge no longer exists.");
      return;
    }
    if (challenge.creator !== from) {
      await send(from, "⚠️ Only the creator can start this challenge.");
      return;
    }
    if (challenge.startedAt) {
      await send(from, `🏁 *${challenge.name}* already started.`);
      return;
    }
    const startDateStr = getToday();
    const endDateStr = addDaysToDateStr(startDateStr, (challenge.duration || 30) - 1);
    challenge.startedAt = new Date().toISOString();
    challenge.endsAt = new Date(endDateStr + "T23:59:59Z").toISOString();
    saveChallenges(challenges);
    let startMsg = `✅ Challenge started! Day 1/${challenge.duration || 30}`;
    const memberCount = (challenge.members || []).length;
    if (memberCount < 2) {
      startMsg = `⚠️ Only ${memberCount} member${memberCount === 1 ? "" : "s"} so far — min 2 recommended, but starting anyway.\n\n${startMsg}`;
    }
    await send(from, startMsg);
    return;
  }

  if (msgLower === "challenge leave") {
    if (!user.challenge) {
      await send(from, "⚠️ You're not in a challenge.");
      return;
    }
    const challenge = challenges[user.challenge];
    if (!challenge) {
      delete user.challenge;
      saveUsers(users);
      await send(from, "⚠️ That challenge no longer exists.");
      return;
    }
    challenge.members = (challenge.members || []).filter(p => p !== from);
    delete user.challenge;
    if (challenge.members.length === 0) challenge.active = false;
    saveChallenges(challenges);
    saveUsers(users);
    await send(from, `✅ You left *${challenge.name}*.`);
    return;
  }

  if (msgLower === "leaderboard" || msgLower === "challenge") {
    if (!user.challenge) {
      await send(from, "🏆 You're not in a challenge yet.\n\nCreate one with *challenge create [name]* or join with *join FIT-XXX*.");
      return;
    }
    const challenge = challenges[user.challenge];
    if (!challenge || !challenge.active) {
      delete user.challenge;
      saveUsers(users);
      await send(from, "⚠️ That challenge is no longer active.");
      return;
    }
    const leaderboardMsg = buildChallengeLeaderboardMessage(challenge, users, from);
    await send(from, leaderboardMsg);
    return;
  }

  // Log view
  // Weekly stats / progress dashboard
  if (["stats", "progress", "weekly", "week", "analytics", "dashboard"].includes(msgLower)) {
    const statsMsg = buildWeeklyStats(user);
    await send(from, statsMsg);
    return;
  }

  // ── Accountability buddies ──
  if (msgLower === "buddy") {
    if (user.buddy?.paired) {
      const buddyUser = users[user.buddy.phone];
      await send(from, `🤝 *Buddy:* ${buddyUser?.name || user.buddy.phone}\n\nSend *buddy remove* to unpair.`);
      return;
    }
    if (user.buddyRequest) {
      const requester = users[user.buddyRequest.from];
      await send(from, `🤝 *Buddy request from ${requester?.name || user.buddyRequest.from}*\nReply *accept* or *decline*`);
      return;
    }
    await send(from, `🤝 No buddy yet.\n\nSend *buddy 27XXXXXXXXX* to add one.`);
    return;
  }

  if (msgLower === "buddy remove") {
    if (!user.buddy?.paired) {
      await send(from, "⚠️ You don't have a buddy yet.");
      return;
    }
    const buddyPhone = user.buddy.phone;
    const buddyUser = users[buddyPhone];
    delete user.buddy;
    delete user.awaitingBuddyResponse;
    if (buddyUser?.buddy?.phone === from) delete buddyUser.buddy;
    saveUsers(users);
    await send(from, "✅ Buddy removed.");
    return;
  }

  const buddyMatch = msg.match(/^buddy\s+(.+)$/i);
  if (buddyMatch) {
    const targetRaw = buddyMatch[1].trim();
    if (["remove", "accept", "decline", "reject"].includes(targetRaw.toLowerCase())) {
      // Handled elsewhere
    } else {
      if (!user.setup || !user.goal) {
        await send(from, "⚠️ Finish setup first, then add a buddy.");
        return;
      }
      if (user.buddy?.paired) {
        await send(from, "⚠️ You're already paired. Send *buddy remove* first.");
        return;
      }
      const buddyPhone = normalizeBuddyPhone(targetRaw);
      if (!buddyPhone) {
        await send(from, "❌ Invalid number. Use format: *buddy 27XXXXXXXXX*");
        return;
      }
      if (buddyPhone === from) {
        await send(from, "⚠️ You can't buddy with yourself.");
        return;
      }
      const buddyUser = users[buddyPhone];
      if (!buddyUser || !buddyUser.setup) {
        await send(from, "❌ That number isn't registered on FitSorted yet.");
        return;
      }
      if (buddyUser.buddy?.paired) {
        await send(from, "⚠️ That user already has a buddy.");
        return;
      }
      if (buddyUser.buddyRequest) {
        await send(from, "⚠️ That user already has a pending buddy request.");
        return;
      }
      buddyUser.buddyRequest = { from, at: new Date().toISOString() };
      delete buddyUser.awaitingBuddyResponse;
      saveUsers(users);
      await send(from, `✅ Buddy request sent to *${buddyUser.name || buddyPhone}*! They'll see it next time they message.`);
      return;
    }
  }

  // Summary / log for any day: "summary", "yesterday", "summarize yesterday", "log yesterday", "monday log"
  const daySummaryMatch = msgLower.match(/(?:summary|summarize|summarise|log|show|view)\s+(?:of\s+)?(?:for\s+)?(yesterday(?:'s)?|last\s*night(?:'s)?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|(\d+)\s*days?\s*ago)(?:\s+(?:calories|cals|food|log|meals))?/i)
    || msgLower.match(/^(yesterday(?:'s)?)\s+(?:summary|log|calories|cals|food|meals)$/i);
  if (daySummaryMatch) {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Johannesburg" }));
    let targetDate, label;
    const keyword = (daySummaryMatch[1] || "").toLowerCase().replace("'s", "");

    if (keyword === "yesterday" || keyword === "last night" || keyword === "lastnight") {
      const d = new Date(now); d.setDate(d.getDate() - 1);
      targetDate = d.toLocaleDateString("en-CA");
      label = "Yesterday";
    } else if (daySummaryMatch[2]) {
      const n = parseInt(daySummaryMatch[2]);
      const d = new Date(now); d.setDate(d.getDate() - n);
      targetDate = d.toLocaleDateString("en-CA");
      label = `${n} day${n > 1 ? 's' : ''} ago`;
    } else {
      const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
      const targetDay = days.indexOf(keyword);
      const currentDay = now.getDay();
      let diff = currentDay - targetDay;
      if (diff <= 0) diff += 7;
      const d = new Date(now); d.setDate(d.getDate() - diff);
      targetDate = d.toLocaleDateString("en-CA");
      label = keyword.charAt(0).toUpperCase() + keyword.slice(1);
    }

    const entries = user.log[targetDate] || [];
    if (!entries.length) {
      await send(from, `📋 Nothing logged for *${label}* (${targetDate}).`);
      return;
    }
    const list = entries.map((e, i) => `${i + 1}. ${e.food} - ${e.calories} cal`).join("\n");
    const total = entries.reduce((s, e) => s + e.calories, 0);
    const macros = {
      protein: entries.reduce((s, e) => s + (e.protein || 0), 0),
      carbs: entries.reduce((s, e) => s + (e.carbs || 0), 0),
      fat: entries.reduce((s, e) => s + (e.fat || 0), 0)
    };
    let macroStr = "";
    if (macros.protein > 0 || macros.carbs > 0 || macros.fat > 0) {
      macroStr = `\n\n*Macros:*\n🥩 Protein: ${macros.protein}g\n🍞 Carbs: ${macros.carbs}g\n🥑 Fat: ${macros.fat}g | 🌾 Fibre: ${macros.fibre || 0}g`;
    }

    await send(from, `📋 *${label}'s log (${targetDate}):*\n${list}\n\n🔢 *${total} cal total*${macroStr}`);
    return;
  }

  if (/^(log|today|total|summary|summarize|summarise|daily|how am i doing|how's my day|hows my day|what have i eaten|what did i eat|show me today|my day|daily log|today's log|todays log|check my day|day so far)$/i.test(msgLower)) {
    const entries = getTodayEntries(user);
    const total = getTodayTotal(user);
    if (entries.length === 0) {
      await send(from, `📋 Nothing logged today yet.\n\nJust tell me what you ate!`);
      return;
    }
    const list = entries.map((e, i) => `${i + 1}. ${e.food} - ${e.calories} cal`).join("\n");
    const burned = getTodayBurned(user);
    const burnedTotal = getTodayBurnedTotal(user);
    const effectiveGoal = getEffectiveGoal(user);
    let exerciseStr = "";
    if (burned.length > 0) {
      exerciseStr = "\n\n🔥 *Exercise:*\n" + burned.map(e => `• ${e.activity} - -${e.calories} cal`).join("\n") + `\nTotal burned: ${burnedTotal} cal`;
    }
    // Calculate total macros
    const todayMacros = getTodayMacros(user);
    const macroTargets = getMacroTargets(user);

    const logHasAccess = await hasAccess(from, user);
    let macroStr = "";
    if (logHasAccess && (todayMacros.protein > 0 || todayMacros.carbs > 0 || todayMacros.fat > 0)) {
      if (macroTargets) {
        const fibrePct = Math.round(((todayMacros.fibre || 0) / macroTargets.fibre) * 100);
        const fibreIcon = fibrePct >= 100 ? '✅' : fibrePct >= 50 ? '🟡' : '🔴';
        macroStr = `\n\n*Macros:*\n🥩 Protein: ${todayMacros.protein}g / ${macroTargets.protein}g\n🍞 Carbs: ${todayMacros.carbs}g / ${macroTargets.carbs}g\n🥑 Fat: ${todayMacros.fat}g / ${macroTargets.fat}g\n🌾 Fibre: ${todayMacros.fibre || 0}g / ${macroTargets.fibre}g ${fibreIcon}`;
      } else {
        macroStr = `\n\n🥩 Protein: ${todayMacros.protein}g | 🍞 Carbs: ${todayMacros.carbs}g | 🥑 Fat: ${todayMacros.fat}g | 🌾 Fibre: ${todayMacros.fibre || 0}g`;
      }
    } else if (!logHasAccess && (todayMacros.protein > 0)) {
      macroStr = `\n\n_🔒 Macro tracking is Premium - upgrade for protein/carbs/fat breakdown_`;
    }

    let premiumCTA = "";
    if (!logHasAccess && !user.seenPremiumCTA) {
      premiumCTA = `\n\n💎 Want macros + coaching? Upgrade for R36/mo — type *upgrade*`;
      users[from].seenPremiumCTA = true;
      saveUsers(users);
    }

    await send(from, `📋 *Today's log:*\n${list}${exerciseStr}\n\n🔢 *${total} / ${effectiveGoal} cal*${macroStr}${premiumCTA}\n${deficitMessage(total, effectiveGoal)}`);
        await maybeFirstLogMenu(from, user, users);
        await maybePromptPro(from, user, users);
    return;
  }

  // ── Email export ──
  // Set email: "email me at x@y.com" or "email x@y.com"
  const emailSetMatch = msg.match(/^(?:email\s+(?:me\s+)?(?:at\s+)?|send\s+(?:my\s+)?(?:meals?\s+)?(?:to\s+)?)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/i);
  if (emailSetMatch) {
    const email = emailSetMatch[1].toLowerCase();
    if (!user.profile) user.profile = {};
    user.profile.exportEmail = email;
    saveUsers(users);
    await send(from, `✅ Export email set to *${email}*\n\nType *export* to email today's food log anytime.`);
    return;
  }

  // Export: "export" sends today's log to their email
  if (msgLower === "export" || msgLower === "email report" || msgLower === "email log" || msgLower === "email export") {
    const exportEmail = user.profile?.exportEmail || user.email;
    if (!exportEmail) {
      await send(from, `📧 No email set up yet.\n\nType: *email yourname@gmail.com*\n\nThen use *export* to send your food log.`);
      return;
    }
    
    const access = await hasAccess(from, user);
    if (!access) {
      const monthlyLink = getPayFastMonthlyLink(from);
      await send(from,
        `📧 *Email export is a Premium feature*\n\n` +
        `Get your daily food log delivered straight to your inbox.\n\n` +
        `💎 *R${PRO_PRICE}/mo* — 7-day free trial\n` +
        `🔗 ${monthlyLink}\n\n` +
        `_Launch price — won't last forever._`
      );
      return;
    }

    const entries = getTodayEntries(user);
    if (entries.length === 0) {
      await send(from, `📋 Nothing logged today yet. Log some food first, then export!`);
      return;
    }
    const totalCal = getTodayTotal(user);
    const todayMacros = getTodayMacros(user);
    const effectiveGoal = getEffectiveGoal(user);
    const spendTotal = entries.reduce((sum, e) => sum + (e.priceZAR || 0), 0);
    const budget = user.profile?.foodBudget || null;

    const sent = await sendFoodLogEmail(exportEmail, user.name || 'there', entries, new Date().toISOString(), todayMacros, totalCal, effectiveGoal, spendTotal, budget);
    if (sent) {
      await send(from, `✅ Food log sent to *${exportEmail}*! 📧\n\nCheck your inbox (or spam folder).`);
    } else {
      await send(from, `❌ Couldn't send the email. Please check the address and try again.\n\nYour email: *${exportEmail}*\nUpdate with: *email newaddress@gmail.com*`);
    }
    return;
  }

  // Export week: "export week" sends last 7 days
  if (msgLower === "export week" || msgLower === "export weekly" || msgLower === "email week") {
    const exportEmail = user.profile?.exportEmail || user.email;
    if (!exportEmail) {
      await send(from, `📧 No email set up yet.\n\nType: *email yourname@gmail.com*\n\nThen use *export week* to send your weekly log.`);
      return;
    }
    
    const access = await hasAccess(from, user);
    if (!access) {
      const monthlyLink = getPayFastMonthlyLink(from);
      await send(from,
        `📧 *Email export is a Premium feature*\n\n` +
        `Get your weekly food log delivered straight to your inbox.\n\n` +
        `💎 *R${PRO_PRICE}/mo* — 7-day free trial\n` +
        `🔗 ${monthlyLink}\n\n` +
        `_Launch price — won't last forever._`
      );
      return;
    }

    const effectiveGoal = getEffectiveGoal(user);
    const budget = user.profile?.foodBudget || null;
    
    // Collect last 7 days
    const days = [];
    let weekTotalCal = 0, weekTotalSpend = 0, weekTotalEntries = 0;
    const weekMacros = { protein: 0, carbs: 0, fat: 0, fibre: 0  };
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const entries = user.log[dateKey] || [];
      const dayCal = entries.reduce((s, e) => s + (e.calories || 0), 0);
      const daySpend = entries.reduce((s, e) => s + (e.priceZAR || 0), 0);
      const dayMacros = { 
        protein: entries.reduce((s, e) => s + (e.protein || 0), 0),
        carbs: entries.reduce((s, e) => s + (e.carbs || 0), 0),
        fat: entries.reduce((s, e) => s + (e.fat || 0), 0)
      };
      weekTotalCal += dayCal;
      weekTotalSpend += daySpend;
      weekTotalEntries += entries.length;
      weekMacros.protein += dayMacros.protein;
      weekMacros.carbs += dayMacros.carbs;
      weekMacros.fat += dayMacros.fat;
      weekMacros.fibre += (dayMacros.fibre || 0);
      days.push({ dateKey, entries, dayCal, daySpend, dayMacros });
    }

    if (weekTotalEntries === 0) {
      await send(from, `📋 No food logged in the last 7 days.`);
      return;
    }

    const avgCal = Math.round(weekTotalCal / 7);
    const avgSpend = Math.round(weekTotalSpend / 7);

    // Build weekly HTML email
    const dayRows = days.map(day => {
      const dateLabel = new Date(day.dateKey).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
      const statusColor = day.dayCal <= effectiveGoal ? '#22c55e' : '#ef4444';
      const entryList = day.entries.length > 0 
        ? day.entries.map(e => `${e.food} (${e.calories} cal${e.priceZAR ? ', ~R' + e.priceZAR : ''})`).join(', ')
        : '<span style="color:#999;">No entries</span>';
      return `<tr>
        <td style="padding:10px;border-bottom:1px solid #eee;font-weight:bold;">${dateLabel}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;color:${statusColor};font-weight:bold;">${day.dayCal} cal</td>
        <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;">${day.daySpend > 0 ? 'R' + day.daySpend : '-'}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;font-size:12px;color:#666;">${entryList}</td>
      </tr>`;
    }).join('');

    const weekStart = days[0].dateKey;
    const weekEnd = days[6].dateKey;
    const startLabel = new Date(weekStart).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
    const endLabel = new Date(weekEnd).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

    const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:650px;margin:0 auto;padding:20px;">
      <div style="text-align:center;margin-bottom:20px;">
        <h1 style="color:#22c55e;margin:0;">🥗 FitSorted</h1>
        <p style="color:#666;margin:5px 0;">Weekly Report: ${startLabel} - ${endLabel}</p>
      </div>
      
      <div style="display:flex;justify-content:space-around;margin:20px 0;">
        <div style="text-align:center;background:#f8fafc;padding:15px 25px;border-radius:8px;">
          <div style="font-size:24px;font-weight:bold;">${avgCal}</div>
          <div style="color:#666;font-size:13px;">avg cal/day</div>
        </div>
        <div style="text-align:center;background:#f8fafc;padding:15px 25px;border-radius:8px;">
          <div style="font-size:24px;font-weight:bold;">${weekTotalEntries}</div>
          <div style="color:#666;font-size:13px;">meals logged</div>
        </div>
        ${weekTotalSpend > 0 ? `<div style="text-align:center;background:#f0fdf4;padding:15px 25px;border-radius:8px;">
          <div style="font-size:24px;font-weight:bold;">R${weekTotalSpend}</div>
          <div style="color:#666;font-size:13px;">total spend</div>
        </div>` : ''}
      </div>

      ${weekTotalSpend > 0 ? `
      <div style="background:#f0fdf4;padding:12px;border-radius:8px;text-align:center;margin:10px 0;">
        💰 Daily avg: <strong>R${avgSpend}/day</strong>${budget ? ` (budget: R${budget}/day)` : ''}
      </div>` : ''}

      <table style="width:100%;border-collapse:collapse;margin:15px 0;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:10px;text-align:left;">Day</th>
            <th style="padding:10px;text-align:center;">Calories</th>
            <th style="padding:10px;text-align:center;">Spend</th>
            <th style="padding:10px;text-align:left;">Foods</th>
          </tr>
        </thead>
        <tbody>${dayRows}</tbody>
      </table>

      <div style="background:#f8fafc;padding:15px;border-radius:8px;margin:15px 0;">
        <strong>Weekly Macros:</strong><br/>
        🥩 Protein: ${weekMacros.protein}g (avg ${Math.round(weekMacros.protein/7)}g/day) | 
        🍞 Carbs: ${weekMacros.carbs}g (avg ${Math.round(weekMacros.carbs/7)}g/day) | 
        🥑 Fat: ${weekMacros.fat}g (avg ${Math.round(weekMacros.fat/7)}g/day) |
        🌾 Fibre: ${weekMacros.fibre}g (avg ${Math.round(weekMacros.fibre/7)}g/day)
      </div>

      <div style="text-align:center;margin-top:20px;padding-top:15px;border-top:1px solid #eee;">
        <p style="color:#999;font-size:12px;">Sent from FitSorted - Your SA Calorie Tracker<br/>
        <a href="https://fitsorted.co.za" style="color:#22c55e;">fitsorted.co.za</a></p>
      </div>
    </div>`;

    try {
      await axios.post('https://api.resend.com/emails', {
        from: 'FitSorted <hello@fitsorted.co.za>',
        to: [exportEmail],
        subject: `Your week in food - ${startLabel} to ${endLabel} (avg ${avgCal} cal/day)`,
        html: html
      }, {
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}` },
        timeout: 10000
      });
      await send(from, `✅ Weekly report sent to *${exportEmail}*! 📧\n\n📊 7 days | ${weekTotalEntries} meals | avg ${avgCal} cal/day${weekTotalSpend > 0 ? ` | R${weekTotalSpend} total spend` : ''}`);
    } catch (err) {
      console.error('Weekly email error:', err.response?.data || err.message);
      await send(from, `❌ Couldn't send the email. Please try again later.`);
    }
    return;
  }

  // ── Update profile settings ──
  // Semantic: "my weight is actually 95", "I weigh 95 not 30", "change my weight to 95",
  // "my body weight should be 95", "fix my weight it's 95", "I'm actually 95kg"
  const profileUpdateMatch = msg.match(/^(?:update|change|set|fix|correct|adjust)\s+(?:my\s+)?(?:body\s+|profile\s+)?weight\s+(?:to\s+|=\s*|it'?s\s+)?([\d.]+)\s*(?:kg|kgs)?$/i)
    || msg.match(/^(?:my (?:body\s+|actual\s+|real\s+|profile\s+)?weight (?:is|should be|isn'?t|isnt|was wrong|is actually|is really|is supposed to be)\s+)(?:it'?s\s+|its\s+)?([\d.]+)\s*(?:kg|kgs)?$/i)
    || msg.match(/^i(?:'?m| am| weigh) (?:actually |really |not \d+\s*(?:kg)?\s*(?:i'?m|i am|but|,)\s*)?([\d.]+)\s*(?:kg|kgs)\s*(?:not|actually|really)?/i)
    || msg.match(/(?:wrong|incorrect|fix)\s+(?:weight|body\s*weight).*?([\d.]+)\s*(?:kg|kgs)?/i)
    || msg.match(/(?:body\s*)?weight\s+(?:is\s+)?wrong.*?([\d.]+)\s*(?:kg|kgs)?/i)
    || msg.match(/(?:should be|supposed to be|meant to be|actually)\s+([\d.]+)\s*(?:kg|kgs)?\s*(?:not|instead)/i);
  if (profileUpdateMatch) {
    const newWeight = parseFloat(profileUpdateMatch[1]);
    if (newWeight >= 30 && newWeight <= 300) {
      const oldWeight = user.profile.weight;
      user.profile.weight = newWeight;
      const { bmr, tdee, goal } = calculateGoal(user.profile);
      user.goal = goal;
      saveUsers(users);
      await send(from, `✅ *Profile weight updated: ${oldWeight} kg → ${newWeight} kg*\n\n🔄 Your daily calorie goal has been recalculated:\n🎯 *${goal} cal/day*\n\n_(BMR: ${bmr} cal | TDEE: ${tdee} cal)_`);
      return;
    }
  }

  // "my height is 186", "I'm 186cm", "change my height to 186", "height is wrong it's 186"
  const heightUpdateMatch = msg.match(/^(?:update|change|set|fix|correct|adjust)\s+(?:my\s+)?height\s+(?:to\s+|=\s*|it'?s\s+)?([\d.]+)\s*(?:cm)?$/i)
    || msg.match(/^my height (?:is|should be|is actually|is really)\s+([\d.]+)\s*(?:cm)?$/i)
    || msg.match(/^i(?:'?m| am)\s+([\d.]+)\s*cm\s*(?:tall)?$/i)
    || msg.match(/(?:height)\s+(?:is\s+)?(?:wrong|incorrect).*?([\d.]+)\s*(?:cm)?/i);
  if (heightUpdateMatch) {
    const newHeight = parseFloat(heightUpdateMatch[1]);
    if (newHeight >= 100 && newHeight <= 250) {
      user.profile.height = newHeight;
      const { bmr, tdee, goal } = calculateGoal(user.profile);
      user.goal = goal;
      saveUsers(users);
      await send(from, `✅ *Height updated to ${newHeight} cm*\n\n🔄 Calorie goal recalculated: 🎯 *${goal} cal/day*`);
      return;
    }
  }

  // "my age is 34", "I'm 34 years old", "change my age to 34", "age is wrong it's 34"
  const ageUpdateMatch = msg.match(/^(?:update|change|set|fix|correct|adjust)\s+(?:my\s+)?age\s+(?:to\s+|=\s*|it'?s\s+)?([\d]+)$/i)
    || msg.match(/^my age (?:is|should be|is actually)\s+([\d]+)$/i)
    || msg.match(/^i(?:'?m| am)\s+([\d]+)\s*(?:years?\s*old)?$/i)
    || msg.match(/(?:age)\s+(?:is\s+)?(?:wrong|incorrect).*?([\d]+)/i);
  if (ageUpdateMatch) {
    const newAge = parseInt(ageUpdateMatch[1]);
    if (newAge >= 13 && newAge <= 100) {
      user.profile.age = newAge;
      const { bmr, tdee, goal } = calculateGoal(user.profile);
      user.goal = goal;
      saveUsers(users);
      await send(from, `✅ *Age updated to ${newAge}*\n\n🔄 Calorie goal recalculated: 🎯 *${goal} cal/day*`);
      return;
    }
  }

  // "I want to lose weight", "switch to maintain", "I want to bulk", "change goal to gain", "I want to cut"
  const goalUpdateMatch = msg.match(/^(?:update|change|set|switch)\s+(?:my\s+)?(?:goal|target)\s+(?:to\s+)?(lose|maintain|gain|cut|bulk)/i)
    || msg.match(/^i\s+(?:want|need|'?d like|would like)\s+to\s+(lose|maintain|gain|cut|bulk)/i)
    || msg.match(/^(?:switch|change)\s+(?:to|my goal to)\s+(lose|maintain|gain|cut|bulk)/i)
    || msg.match(/^(lose|maintain|gain|cut|bulk)\s*(?:weight|muscle|fat)?$/i);
  if (goalUpdateMatch) {
    const goalMap = { lose: "lose", cut: "lose", maintain: "maintain", gain: "gain", bulk: "gain" };
    // Find first captured group across the different regex patterns
    const goalWord = (goalUpdateMatch[1] || goalUpdateMatch[0]).toLowerCase().trim();
    user.profile.target = goalMap[goalWord] || "maintain";
    const { bmr, tdee, goal } = calculateGoal(user.profile);
    user.goal = goal;
    saveUsers(users);
    await send(from, `✅ *Goal updated to: ${user.profile.target}*\n\n🔄 Calorie goal recalculated: 🎯 *${goal} cal/day*`);
    return;
  }

  // Guide for "fix my calories" / "my allowance is wrong" (no specific value given)
  if (msgLower === "profile_fix_guide" || /^(?:fix|change|update|correct|redo|recalc)\s+(?:my\s+)?(?:calorie|calories|allowance|daily|target|goal)s?$/i.test(msgLower) || /^(?:my\s+)?(?:calorie|calories|allowance|daily target|goal)s?\s+(?:is|are)\s+(?:wrong|incorrect|too low|too high|off)$/i.test(msgLower) || /^(?:recalculate|recalc|redo)\s+(?:my\s+)?(?:calories|goal|target|allowance)$/i.test(msgLower)) {
    const p = user.profile;
    const { goal } = calculateGoal(p);
    await send(from, `🔧 *Your current calorie target: ${goal} cal/day*\n\nBased on:\n⚖️ Weight: ${p.weight} kg\n📏 Height: ${p.height} cm\n🎂 Age: ${p.age}\n🏃 Activity: ${p.activity}\n🎯 Goal: ${p.target}\n\nTo fix it, just tell me what's wrong:\n• _"my weight is actually 85"_\n• _"I'm 180cm tall"_\n• _"my age is 30"_\n• _"I want to lose weight"_\n• _"update weight 95"_\n\nI'll recalculate everything automatically.`);
    return;
  }

  // "my settings", "my profile", "show profile", "profile", "settings"
  if (/^(my (settings|profile)|show (my )?profile|profile|settings)$/i.test(msgLower)) {
    const p = user.profile;
    const { bmr, tdee, goal } = calculateGoal(p);
    await send(from, `📋 *Your Profile*\n\n👤 ${user.name || 'Not set'}\n⚧ ${p.gender || '?'}\n⚖️ ${p.weight} kg\n📏 ${p.height} cm\n🎂 ${p.age} years\n🏃 Activity: ${p.activity}\n🎯 Goal: ${p.target} (${p.pace || 'standard'})\n\n📊 BMR: ${bmr} cal\n🔥 TDEE: ${tdee} cal\n🎯 Daily target: *${goal} cal*\n\n_To update, send:_\n• *update weight 85*\n• *update height 180*\n• *update age 30*\n• *update goal lose/maintain/gain*`);
    return;
  }

  // ── Step tracking ──
  // "8000 steps", "walked 8000 steps", "steps 8000", "I did 12000 steps today", "10k steps"
  const stepMatch = msg.match(/^([\d,.]+)\s*k?\s*steps$/i)
    || msg.match(/^steps?\s+([\d,.]+)\s*k?$/i)
    || msg.match(/^(?:walked|did|got|logged|hit)\s+([\d,.]+)\s*k?\s*steps/i)
    || msg.match(/^(?:i\s+(?:did|walked|got|hit|logged))\s+([\d,.]+)\s*k?\s*steps/i)
    || msg.match(/^([\d,.]+)\s*k\s*steps$/i);
  
  if (stepMatch) {
    let rawSteps = (stepMatch[1] || stepMatch[0]).replace(/,/g, '');
    let steps = parseFloat(rawSteps);
    // Handle "10k steps" → 10000
    if (msg.toLowerCase().includes('k') && steps < 1000) steps = steps * 1000;
    steps = Math.round(steps);
    
    if (steps >= 1 && steps <= 200000) {
      const today = getToday();
      if (!user.steps) user.steps = {};
      if (!user.steps[today]) user.steps[today] = { count: 0, logs: [] };
      
      user.steps[today].count += steps;
      user.steps[today].logs.push({ steps, time: new Date().toISOString() });
      
      const totalToday = user.steps[today].count;
      const stepGoal = user.stepGoal || 10000;
      const remaining = Math.max(0, stepGoal - totalToday);
      const pct = Math.min(100, Math.round((totalToday / stepGoal) * 100));
      
      // Calories burned estimate: ~0.04 cal per step (avg person)
      const calBurned = Math.round(steps * 0.04);
      
      // Progress bar
      const filled = Math.round(pct / 10);
      const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
      
      // Streak calculation
      let streak = 0;
      const d = new Date();
      for (let i = 0; i < 365; i++) {
        const dateStr = d.toISOString().slice(0, 10);
        if (user.steps[dateStr] && user.steps[dateStr].count >= stepGoal) {
          streak++;
        } else if (i > 0) break; // today doesn't break streak if not yet hit
        d.setDate(d.getDate() - 1);
      }
      
      let msg2 = `🚶 *${steps.toLocaleString()} steps logged* (~${calBurned} cal burned)\n\n`;
      msg2 += `${bar} ${pct}%\n`;
      msg2 += `📊 *${totalToday.toLocaleString()} / ${stepGoal.toLocaleString()}* steps today\n`;
      
      if (remaining > 0) {
        msg2 += `👟 ${remaining.toLocaleString()} to go`;
      } else {
        msg2 += `🎉 *Goal smashed!*`;
      }
      
      if (streak > 1) msg2 += `\n🔥 ${streak}-day streak!`;
      
      msg2 += `\n\n_Send *step history* to see your trends._`;
      
      saveUsers(users);
      await send(from, msg2);
      return;
    }
  }
  
  // Step history: "step history", "steps", "my steps", "step count", "step streak"
  if (/^(step history|steps|my steps|step count|step streak|step goal|step trend|show steps|step log)$/i.test(msgLower)) {
    const stepGoal = user.stepGoal || 10000;
    const stepData = user.steps || {};
    const dates = Object.keys(stepData).sort().reverse().slice(0, 7);
    
    if (dates.length === 0) {
      await send(from, `🚶 No steps logged yet.\n\nJust tell me: *8000 steps* and I'll track it.\n\n🎯 Daily goal: ${stepGoal.toLocaleString()} steps\n\n_Change with: *step goal 8000*_`);
      return;
    }
    
    let msg2 = `🚶 *Step History* (last 7 days)\n\n`;
    let totalWeek = 0;
    let daysHit = 0;
    
    for (const date of dates) {
      const count = stepData[date].count || 0;
      totalWeek += count;
      const hit = count >= stepGoal;
      if (hit) daysHit++;
      const pct = Math.min(100, Math.round((count / stepGoal) * 100));
      const icon = hit ? '✅' : count > 0 ? '🟡' : '⬜';
      const dayLabel = date === getToday() ? 'Today' : new Date(date + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
      msg2 += `${icon} ${dayLabel}: *${count.toLocaleString()}* (${pct}%)\n`;
    }
    
    const avgSteps = Math.round(totalWeek / dates.length);
    msg2 += `\n📊 Avg: ${avgSteps.toLocaleString()} steps/day`;
    msg2 += `\n🎯 Goal hit: ${daysHit}/${dates.length} days`;
    msg2 += `\n\n_Change goal: *step goal 8000*_`;
    
    await send(from, msg2);
    return;
  }
  
  // Set step goal: "step goal 8000", "set step goal to 12000"
  const stepGoalMatch = msg.match(/^(?:step goal|set step goal|steps goal|daily steps|set steps)\s+(?:to\s+)?([\d,]+)$/i);
  if (stepGoalMatch) {
    const newGoal = parseInt(stepGoalMatch[1].replace(/,/g, ''));
    if (newGoal >= 1000 && newGoal <= 100000) {
      user.stepGoal = newGoal;
      saveUsers(users);
      await send(from, `🎯 Step goal updated to *${newGoal.toLocaleString()} steps/day*`);
      return;
    }
  }

  // ── Weight tracking ──
  // Flexible: "weight 84", "I weigh 84", "84kg", "84 kg", "my weight is 84", "scale says 84.5", "i'm 84kg now", "currently 84kg"
  let weightLog = msg.match(/^(?:weight|weigh|w)\s+([\d.]+)\s*(?:kg|kgs)?$/i)
    || msg.match(/^([\d.]+)\s*(?:kg|kgs)\.?$/i)
    || msg.match(/(?:i\s+(?:now\s+)?weigh|i'm|im|i\s+am|my\s+weight\s+is|scale\s+(?:says|reads|shows)|currently|weighed\s+in\s+at|weigh-in)\s+([\d.]+)\s*(?:kg|kgs)?$/i)
    || msg.match(/^(?:logged?|update|updated?|set)\s+(?:my\s+)?weight\s+(?:to\s+|at\s+)?([\d.]+)\s*(?:kg|kgs)?$/i);

  // If message is just a number (30-300), assume it's a weigh-in
  if (!weightLog && /^\d+(?:\.\d+)?$/.test(msgLower)) {
    weightLog = [msgLower, msgLower];
  }
  if (weightLog) {
    // Find the first captured group with a number (different regexes capture in different positions)
    const kg = parseFloat(weightLog[2] || weightLog[1]);
    if (kg >= 30 && kg <= 300) {
      if (!user.weights) user.weights = [];
      user.weights.push({ kg, date: getToday(), time: new Date().toISOString() });
      user.awaitingWeight = false;
      // Keep last 90 entries
      if (user.weights.length > 90) user.weights = user.weights.slice(-90);
      saveUsers(users);

      // Calculate change from previous
      let changeStr = "";
      if (user.weights.length >= 2) {
        const prev = user.weights[user.weights.length - 2].kg;
        const diff = kg - prev;
        const arrow = diff < 0 ? "📉" : diff > 0 ? "📈" : "➡️";
        changeStr = `\n${arrow} ${diff > 0 ? "+" : ""}${diff.toFixed(1)} kg since last entry`;
      }

      // Progress toward goal weight
      const startWeight = user.weights[0].kg;
      const totalChange = kg - startWeight;
      const progressStr = user.weights.length > 1
        ? `\n📊 Total change: ${totalChange > 0 ? "+" : ""}${totalChange.toFixed(1)} kg since you started`
        : "";

      await send(from, `⚖️ *${kg} kg logged*${changeStr}${progressStr}\n\nSend *weight history* to see your trend.`);
      return;
    } else {
      user.awaitingWeight = false;
      await send(from, "That doesn't look right. Send your weight like: *weight 84.5*");
      return;
    }
  }

  // Weight history
  if (/^(weight history|my weight|weight trend|weight log|show my weight|how much do i weigh|weigh-ins|weight progress|weight graph|track my weight|all weights)$/i.test(msgLower)) {
    const weights = user.weights || [];
    if (weights.length === 0) {
      await send(from, `⚖️ No weight logged yet.\n\nSend your weight like: *weight 84.5*`);
      return;
    }
    const last7 = weights.slice(-7).reverse();
    const lines = last7.map((w, i) => {
      const next = last7[i + 1];
      const diff = next ? w.kg - next.kg : null;
      const arrow = diff === null ? "" : diff < 0 ? " 📉" : diff > 0 ? " 📈" : " ➡️";
      return `• ${w.date} - *${w.kg} kg*${arrow}`;
    }).join("\n");

    const start = weights[0].kg;
    const current = weights[weights.length - 1].kg;
    const total = current - start;
    const totalStr = `\n\n📊 *Total: ${total > 0 ? "+" : ""}${total.toFixed(1)} kg* since ${weights[0].date}`;

    await send(from, `⚖️ *Your weight trend:*\n\n${lines}${totalStr}`);
    return;
  }

  // Weight projection
  if (/^(projection|what if|if i stuck|weight projection|should weigh|could weigh)$/i.test(msgLower)) {
    const projection = calculateWeightProjection(user);
    
    if (!projection) {
      await send(from, "Log your first weigh-in with *weight 75* to see projections.");
      return;
    }
    
    let msg = `⚖️ *Weight Projection*\n\n`;
    msg += `${projection.daysSinceStart} days since you started tracking.\n\n`;
    msg += `If you'd hit *${user.goal} cal* every day, you would have lost *${projection.expectedLoss} kg* by now.\n\n`;
    msg += `Starting weight: *${projection.startWeight} kg*\n`;
    msg += `You'd weigh: *${projection.projected} kg*`;
    
    await send(from, msg);
    return;
  }

  // Undo
  // "This was last night" / "that was yesterday" - move last entry to a past date
  const moveMatch = msgLower.match(/^(?:this|that|it)\s+was\s+(?:from\s+)?(yesterday|last\s*night|monday|tuesday|wednesday|thursday|friday|saturday|sunday|(\d+)\s*days?\s*ago)/i);
  if (moveMatch) {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Johannesburg" }));
    const today = getToday();
    const entries = user.log[today] || [];

    if (!entries.length) {
      await send(from, "Nothing logged today to move. Log the food first, then tell me when it was.");
      return;
    }

    let targetDate;
    let label;
    const keyword = moveMatch[1].toLowerCase();

    if (keyword === "yesterday" || keyword === "last night" || keyword === "lastnight") {
      const d = new Date(now); d.setDate(d.getDate() - 1);
      targetDate = d.toLocaleDateString("en-CA");
      label = "yesterday";
    } else if (moveMatch[2]) {
      const n = parseInt(moveMatch[2]);
      const d = new Date(now); d.setDate(d.getDate() - n);
      targetDate = d.toLocaleDateString("en-CA");
      label = `${n} day${n > 1 ? 's' : ''} ago`;
    } else {
      const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
      const targetDay = days.indexOf(keyword);
      const currentDay = now.getDay();
      let diff = currentDay - targetDay;
      if (diff <= 0) diff += 7;
      const d = new Date(now); d.setDate(d.getDate() - diff);
      targetDate = d.toLocaleDateString("en-CA");
      label = keyword;
    }

    const lastEntry = entries.pop();
    user.log[today] = entries;
    if (!user.log[targetDate]) user.log[targetDate] = [];
    user.log[targetDate].push(lastEntry);
    saveUsers(users);

    await send(from, `↩️ Moved *${lastEntry.food}* (${lastEntry.calories} cal) to *${label}* (${targetDate})\n\n📊 Today: *${getTodayTotal(user)} / ${getEffectiveGoal(user)} cal*`);
    return;
  }

  // Quick correction: "wrong" / "incorrect" -> undo last entry
  if (["wrong","incorrect","nope","not right","that's wrong","thats wrong"].includes(msgLower)) {
    const today = getToday();
    const entries = user.log[today] || [];
    if (!entries.length) { await send(from, "Nothing to undo."); return; }
    const removed = entries.pop();
    user.log[today] = entries;
    saveUsers(users);
    const total = getTodayTotal(user);
    await send(from, `↩️ Removed: *${removed.food}* (${removed.calories} cal)\n\nSend the correct food and I'll log it.`);
    return;
  }

  // ── Unsubscribe / Stop / Cancel handler ──
  if (/^(unsubscribe|stop|stop messages|cancel|opt out|opt-out|leave|remove me|don'?t message me|stop messaging)$/i.test(msgLower)) {
    user.optedOut = true;
    user.optedOutAt = new Date().toISOString();
    saveUsers();
    await send(from, `No problem at all! 👋 I've stopped all messages.\n\nYour data is still saved — if you ever want to come back, just send *Hi* and we'll pick up where you left off.\n\nThanks for trying FitSorted! 🙏`);
    return;
  }

  if (/^(undo|u do|undo that|oops|take that back|remove last|undo last|cancel last|delete last|wrong|that was wrong|made a mistake|undo last entry)$/i.test(msgLower)) {
    const today = getToday();
    const foodEntries = user.log[today] || [];
    const exerciseEntries = (user.exercise && user.exercise[today]) || [];

    // Find the most recent entry across both food and exercise
    const lastFood = foodEntries.length ? foodEntries[foodEntries.length - 1] : null;
    const lastExercise = exerciseEntries.length ? exerciseEntries[exerciseEntries.length - 1] : null;

    if (!lastFood && !lastExercise) { await send(from, "Nothing to undo."); return; }

    // Compare timestamps to find which was logged last
    const foodTime = lastFood && lastFood.time ? new Date(lastFood.time).getTime() : 0;
    const exTime = lastExercise && lastExercise.time ? new Date(lastExercise.time).getTime() : 0;

    if (exTime > foodTime && lastExercise) {
      // Undo exercise
      exerciseEntries.pop();
      user.exercise[today] = exerciseEntries;
      saveUsers(users);
      const effectiveGoal = getEffectiveGoal(user);
      const total = getTodayTotal(user);
      await send(from, `↩️ Removed: *${lastExercise.activity}* (${lastExercise.calories} cal burned)\n\n${deficitMessage(total, effectiveGoal)}`);
    } else if (lastFood) {
      // Undo food
      foodEntries.pop();
      user.log[today] = foodEntries;
      saveUsers(users);
      const total = getTodayTotal(user);
      await send(from, `↩️ Removed: *${lastFood.food}* (${lastFood.calories} cal)\n\n${deficitMessage(total, user.goal)}`);
    } else {
      await send(from, "Nothing to undo.");
    }
    return;
  }

  // ── Correct/Manual Entry ──
  if (msgLower === 'correct' || /^(wrong|incorrect) (calorie|calories)/i.test(msgLower) || /manual(ly)? (enter|log)/i.test(msgLower)) {
    await send(from, `📝 *Manual Entry Mode*\n\nType your entry in this format:\n\n*food name | calories*\n\nExample:\n_the nutter | 865_\n\nI'll log it exactly as you say.`);
    return;
  }

  // Check if message is manual entry format: "food name | calories"
  const manualMatch = msg.match(/^(.+?)\s*\|\s*(\d+)$/);
  if (manualMatch) {
    const foodName = manualMatch[1].trim();
    const calories = parseInt(manualMatch[2]);
    
    if (calories < 1 || calories > 5000) {
      await send(from, `⚠️ Calories must be between 1-5000. Try again with a realistic value.`);
      return;
    }

    const today = getToday();
    if (!user.log[today]) user.log[today] = [];
    
    const entry = {
      food: foodName + ' (manual)',
      calories: calories,
      protein: 0,
      carbs: 0,
      fat: 0,
      fibre: 0,
      priceZAR: 0,
      time: new Date().toISOString()
    };
    
    user.log[today].push(entry);
    saveUsers(users);

    const total = getTodayTotal(user);
    await send(from, `✅ Logged: *${foodName}* (${calories} cal)\n\n` + deficitMessage(total, user.goal));
    return;
  }

  // ── Feedback / bug reports - saved to workspace for Milan ──
  // Also catch standalone "feedback" / "bug" with no content → prompt for it
  const feedbackStandaloneMatch = msg.match(/^(feedback|bug|issue|suggestion|feature|request|improve|improvement)\s*[!?.]*$/i);
  if (feedbackStandaloneMatch) {
    user.awaitingFeedback = true;
    user.feedbackAskedAt = new Date().toISOString();
    saveUsers(users);
    await send(from, `💬 We'd love to hear it! What's on your mind?\n\n_(Type anything — good or bad, we read every message)_`);
    return;
  }
  const feedbackMatch = msg.match(/^(feedback|bug|issue|suggestion|feature|request|improve|improvement)[\s:;,.\---]+(.+)/is);
  if (feedbackMatch) {
    const type = feedbackMatch[1].toLowerCase();
    const content = feedbackMatch[2].trim();
    const entry = {
      phone: from,
      name: user.name || "unknown",
      type: type === "bug" || type === "issue" ? "bug" : "feedback",
      message: content,
      timestamp: new Date().toISOString(),
      profile: { goal: user.goal, setup: user.setup, step: user.step }
    };

    // Append to feedback file
    const feedbackFile = "/Users/brandonkatz/.openclaw/workspace/fitsorted/feedback.jsonl";
    try {
      fs.appendFileSync(feedbackFile, JSON.stringify(entry) + "\n");
    } catch (e) {
      console.error("Failed to save feedback:", e.message);
    }

    await send(from, `✅ *Thanks for the ${entry.type === "bug" ? "bug report" : "feedback"}!*\n\nWe've logged it and our team will look at it.\n\n_"${content.slice(0, 100)}${content.length > 100 ? '...' : ''}"_`);
    return;
  }

  // ── Support / stuck detection ──
  if (/^(support|stuck|not working|broken|bug|problem|issue|help me|can't log|cant log|it's not|its not|doesn't work|doesnt work|won't work|wont work)$/i.test(msgLower) ||
      /^(something.*(wrong|broken)|nothing.*(happen|work)|i('m| am) stuck)/i.test(msgLower)) {

    // Check if they're mid-setup
    if (!user.setup || user.step) {
      await send(from,
        `🔧 *Looks like something went wrong during setup.*\n\n` +
        `No worries - send *start* to begin fresh.\n\n` +
        `This will reset your setup (your food logs are safe).`
      );
    } else {
      await send(from,
        `🔧 *Need help?*\n\n` +
        `*Common fixes:*\n` +
        `• Send *start* to redo your setup\n` +
        `• Send *help* to see all commands\n` +
        `• Send *log* to see today's entries\n` +
        `• Send *undo* to remove last entry\n\n` +
        `*Report a problem:*\n` +
        `Send *bug: describe the issue*\n\n` +
        `*Request a feature:*\n` +
        `Send *feedback: your idea*\n\n` +
        `📧 Email: alphaxasset@gmail.com\n` +
        `🌐 FAQ: fitsorted.co.za/support`
      );
    }
    return;
  }

  // ── POPIA Compliance: Data Export ──
  if (/^(export|export my data|download|download my data|get my data|give me my data|data export|export data)$/i.test(msgLower)) {
    const exportData = {
      phone: from,
      profile: user.profile || {},
      goal: user.goal,
      setup: user.setup,
      log: user.log || {},
      exercise: user.exercise || {},
      weights: user.weights || [],
      customFoods: user.customFoods || {},
      referredBy: user.referredBy || null,
      exportedAt: new Date().toISOString()
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    const fileName = `fitsorted-data-${from}.json`;

    await send(from,
      `📦 *Your FitSorted Data*\n\n` +
      `Here's everything we have stored about you:\n\n` +
      `• Profile (age, weight, height, goal)\n` +
      `• Food logs (${Object.keys(user.log || {}).length} days)\n` +
      `• Exercise logs\n` +
      `• Weight history (${(user.weights || []).length} entries)\n` +
      `• Custom foods (${Object.keys(user.customFoods || {}).length} saved)\n\n` +
      `*Your data (JSON):*\n\n` +
      `\`\`\`${jsonStr.substring(0, 3000)}${jsonStr.length > 3000 ? '\n\n... (truncated, full export available on request)' : ''}\`\`\`\n\n` +
      `This is your data under POPIA. You can save this file.\n\n` +
      `To delete your account, send: *delete*`
    );
    return;
  }

  // ── POPIA Compliance: Data Deletion ──
  if (msgLower === "delete" || msgLower === "delete my data" || msgLower === "delete my account") {
    // Check if already in deletion confirmation state
    if (user.deletionRequested) {
      await send(from,
        `⚠️ *Account Deletion Cancelled*\n\n` +
        `Your account is still active. No data was deleted.\n\n` +
        `If you want to delete your account, send: *delete*`
      );
      delete user.deletionRequested;
      saveUsers(users);
      return;
    }

    // First request - ask for confirmation
    user.deletionRequested = true;
    user.deletionRequestedAt = new Date().toISOString();
    saveUsers(users);

    await send(from,
      `⚠️ *Confirm Account Deletion*\n\n` +
      `This will permanently delete:\n` +
      `• Your profile\n` +
      `• All food logs (${Object.keys(user.log || {}).length} days)\n` +
      `• Exercise logs\n` +
      `• Weight history (${(user.weights || []).length} entries)\n` +
      `• Custom foods\n\n` +
      `*This cannot be undone.*\n\n` +
      `To confirm deletion, send: *confirm delete*\n\n` +
      `To cancel, send any other message.`
    );
    return;
  }

  // Deletion confirmation
  if ((msgLower === "confirm delete" || msgLower === "yes delete" || msgLower === "delete confirm") && user.deletionRequested) {
    // Delete user from database
    delete users[from];
    saveUsers(users);

    // Remove from referrals if exists
    try {
      const refs = loadReferrals();
      for (const code in refs) {
        refs[code].signups = refs[code].signups.filter(phone => phone !== from);
        refs[code].active = refs[code].active.filter(phone => phone !== from);
      }
      saveReferrals(refs);
    } catch (err) {
      console.error("Error cleaning referrals:", err);
    }

    await send(from,
      `✅ *Account Deleted*\n\n` +
      `Your FitSorted account and all data have been permanently deleted.\n\n` +
      `If you change your mind, you can always start fresh by sending any message.\n\n` +
      `Thanks for trying FitSorted! 🙏`
    );
    return;
  }

  // Cancel deletion if user sends something else after requesting deletion
  if (user.deletionRequested && msgLower !== "delete" && msgLower !== "confirm delete") {
    delete user.deletionRequested;
    delete user.deletionRequestedAt;
    saveUsers(users);
    await send(from, `✅ Deletion cancelled. Your account is still active.`);
    // Continue processing the message normally
  }

  // Alcohol summary / drunk-o-meter
  if (msgLower === "drinks" || msgLower === "alcohol" || msgLower === "units" || msgLower === "drunk" || msgLower === "drink meter" || msgLower === "drunk meter" || msgLower === "bac") {
    const todayDrinks = getTodayAlcohol(user);
    if (!todayDrinks.length) {
      await send(from, `🥤 No drinks logged today. Sober as a judge 😇\n\nTo track drinks just tell me what you had:\n_"2 Castles and a tequila shot"_`);
      return;
    }
    const totalUnits = todayDrinks.reduce((s, e) => s + (e.units || 0), 0);
    const totalCal = todayDrinks.reduce((s, e) => s + e.calories, 0);
    const gender = user.profile?.gender || "male";
    await send(from, buildDrunkOMeterMessage(totalUnits, totalCal, gender, todayDrinks));
    return;
  }

  // Subscription status
  if (msgLower === "status" || msgLower === "subscription" || msgLower === "my plan") {
    const premium = await isPremium(from);
    const inTrial = isInTrial(user);
    
    if (premium) {
      const { data: dbUser } = await supabaseAdmin.from("users").select("id").eq("phone", from).single();
      const { data: sub } = dbUser ? await supabaseAdmin.from("subscriptions").select("ends_at").eq("user_id", dbUser.id).eq("status", "active").single() : { data: null };
      const expiryStr = sub?.ends_at ? new Date(sub.ends_at).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }) : "unknown";
      await send(from, `✅ *FitSorted Premium* — Active\n\nRenews: ${expiryStr}\n\nType *upgrade* to renew early.`);
    } else if (inTrial) {
      const trialStart = user.trialStartDate || user.joinedAt;
      const daysSinceTrial = trialStart ? (Date.now() - new Date(trialStart).getTime()) / (1000 * 60 * 60 * 24) : 0;
      const daysLeft = Math.max(0, Math.ceil(TRIAL_DAYS - daysSinceTrial));
      await send(from, `✅ *FitSorted Premium* — 7-Day Free Trial\n\n${daysLeft} days left of all features.\n\nAfter that, calorie tracking stays free forever.\n\nUpgrade for R36/mo to keep Premium features — type *upgrade*`);
    } else {
      await send(from, `✅ *FitSorted* — Free forever\n\nYou can track calories for life, no limits.\n\nUpgrade to Premium for R36/mo to unlock:\n🥩 Macro tracking\n🧠 Coaching mode\n📧 Email exports\n💰 Budget tracking\n\nType *upgrade* to subscribe.`);
    }
    return;
  }

  // Promo code handler
  if (msgLower.startsWith("promo ") || msgLower.startsWith("code ") || msgLower.startsWith("coupon ")) {
    const code = msg.replace(/^(promo|code|coupon)\s+/i, "").trim().toUpperCase();
    const discount = PROMO_CODES[code];
    if (!discount) {
      await send(from, `❌ *"${code}"* isn't a valid promo code. Check the spelling and try again.`);
      return;
    }

    // Check signup-relative expiry
    if (PROMO_EXPIRY_DAYS[code]) {
      const joinedAt = user.joinedAt ? new Date(user.joinedAt) : new Date();
      const daysSinceJoin = (Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceJoin > PROMO_EXPIRY_DAYS[code]) {
        await send(from, `⏰ Sorry, the *${code}* early bird offer expired ${PROMO_EXPIRY_DAYS[code]} days after signup. The standard price is R36/mo.\n\nType *upgrade* to subscribe.`);
        return;
      }
    }

    const alreadyPremium = await isPremium(from);
    if (alreadyPremium) {
      await send(from, `✅ You're already on Premium — promo codes apply to new subscriptions only.`);
      return;
    }

    // 100% off — activate directly, no PayFast needed
    if (discount === 100) {
      const { data: dbUser } = await supabaseAdmin.from("users").select("id").eq("phone", from).single();
      if (dbUser) {
        await supabaseAdmin.from("subscriptions").update({ status: "canceled" }).eq("user_id", dbUser.id).eq("status", "active");
        const endsAt = new Date();
        endsAt.setFullYear(endsAt.getFullYear() + 10); // 10-year access
        await supabaseAdmin.from("subscriptions").insert({
          user_id: dbUser.id,
          status: "active",
          started_at: new Date().toISOString(),
          ends_at: endsAt.toISOString(),
          provider: "founder",
          external_id: code,
        });
      }
      user.promoCode = code;
      user.promoDiscount = 100;
      saveUsers(users);
      await send(from, `🏅 *FOUNDER access activated!*\n\nYou're in — full Premium, on us. Welcome to the founding team. 🎉\n\nText *status* to confirm your account.`);
      return;
    }

    user.promoCode = code;
    user.promoDiscount = discount;
    saveUsers(users);
    const monthlyPrice = applyDiscount(49, discount);
    const annualPrice = applyDiscount(280, discount);
    const monthlyLink = getPayFastMonthlyLink(from, discount);
    const annualLink = getPayFastAnnualLink(from, discount);
    await send(from,
      `🎉 Code *${code}* applied — *${discount}% off*!\n\n` +
      `Free forever + 7-day free trial, then:\n\n` +
      `📅 *Monthly — R${monthlyPrice}/mo*\n👉 ${monthlyLink}\n\n` +
      `🏆 *Annual — R${annualPrice}/year* _(save R${280-annualPrice})_\n👉 ${annualLink}`
    );
    return;
  }

  // PRO upgrade
  if (msgLower === "pro" || msgLower === "upgrade") {
    const alreadyPremium = await isPremium(from);
    if (alreadyPremium) {
      await send(from, "✅ You're already on FitSorted Premium! Keep crushing it 💪");
      return;
    }
    const discount = user.promoDiscount || 0;
    const promoCode = user.promoCode || null;
    const monthlyPrice = applyDiscount(49, discount);
    const annualPrice = applyDiscount(280, discount);
    const monthlyLink = getPayFastMonthlyLink(from, discount);
    const annualLink = getPayFastAnnualLink(from, discount);
    const promoLine = promoCode ? `🎉 Code *${promoCode}* applied (${discount}% off)\n\n` : "";
    await send(from,
      `*FitSorted Premium* 🚀\n\n` +
      promoLine +
      `✅ Calorie tracking is free forever\n\n` +
      `Get a 7-day free trial of Premium, then just R36/mo:\n\n` +
      `📅 *Monthly — R${monthlyPrice}/mo*\n` +
      `👉 ${monthlyLink}\n\n` +
      `🏆 *Annual — R${annualPrice}/year* _(save R${280-annualPrice})_\n` +
      `👉 ${annualLink}\n\n` +
      `Got a promo code? Type *promo CODE*\n` +
      `Cancel anytime — free tier stays forever. ✅`
    );
    return;
  }

  // Admin: activate/deactivate pro
  if (from === ADMIN_NUMBER && msgLower.startsWith("pro-on ")) {
    const target = msgLower.replace("pro-on ", "").trim();
    if (users[target]) {
      users[target].isPro = true;
      saveUsers(users);
      await send(from, `✅ Pro enabled for ${target}`);
    } else {
      await send(from, `User ${target} not found`);
    }
    return;
  }
  if (from === ADMIN_NUMBER && msgLower.startsWith("pro-off ")) {
    const target = msgLower.replace("pro-off ", "").trim();
    if (users[target]) {
      users[target].isPro = false;
      saveUsers(users);
      await send(from, `✅ Pro disabled for ${target}`);
    } else {
      await send(from, `User ${target} not found`);
    }
    return;
  }

  // Help
  // ── Interactive menu button ──
  if (msgLower === "commands" || msgLower === "options" || msgLower === "what can you do" || msgLower === "features") {
    await sendList(from,
      `🏋️ *FitSorted*\n\nTap a feature below to use it, or just type naturally!`,
      "📋 Open Menu",
      [
        {
          title: "📊 Tracking",
          rows: [
            { id: "menu:log", title: "📝 Today's Log", description: "See everything you've eaten today" },
            { id: "menu:undo", title: "↩️ Undo Last Entry", description: "Remove your last logged item" },
            { id: "menu:weight", title: "⚖️ Log Weight", description: "Record today's weigh-in" },
            { id: "menu:weight_history", title: "📈 Weight History", description: "See your weight trend over time" },
            { id: "menu:projection", title: "🎯 Weight Projection", description: "See where you could be if you'd stuck to plan" },
          ],
        },
        {
          title: "🍔 Foods",
          rows: [
            { id: "menu:my_foods", title: "🍽️ My Saved Foods", description: "View your custom food list" },
            { id: "menu:suggest", title: "💡 Meal Ideas", description: "Get meal suggestions for your budget" },
          ],
        },
        {
          title: "⚙️ Settings",
          rows: [
            { id: "menu:start", title: "🔄 Recalculate Goals", description: "Update your calorie target" },
            { id: "menu:export", title: "📤 Export Data", description: "Download all your data (POPIA)" },
            { id: "menu:support", title: "🆘 Get Support", description: "Something not working? We'll help" },
          ],
        },
      ]
    );
    return;
  }

  // Referral system
  if (msgLower === "invite" || msgLower === "referral" || msgLower === "share" || msgLower === "refer") {
    const referralCode = generateReferralCode(from);
    const referralLink = `https://wa.me/27690684940?text=REF_${referralCode}`;
    
    const stats = user.referrals || [];
    const credits = user.referralCredits || 0;
    
    let msg = `🎁 *Invite Friends, Get Rewarded*\n\n`;
    msg += `Share FitSorted and earn *R10 off* for each friend who joins!\n\n`;
    msg += `📱 *Your referral link:*\n${referralLink}\n\n`;
    msg += `💰 *Your rewards:*\n`;
    msg += `• ${stats.length} friends referred\n`;
    msg += `• R${credits} in credits earned\n\n`;
    
    if (stats.length > 0) {
      msg += `🏆 *Leaderboard status:*\n`;
      if (stats.length >= 10) msg += `⭐ Top Referrer (10+ friends)\n`;
      else if (stats.length >= 5) msg += `🔥 Referral Champion (5+ friends)\n`;
      else if (stats.length >= 3) msg += `💪 Rising Star (3+ friends)\n`;
      else msg += `🌱 Getting Started (${stats.length}/3 to Rising Star)\n`;
    }
    
    msg += `\n📋 *Share this:*\n`;
    msg += `"Try FitSorted - free calorie tracker on WhatsApp! No apps, just text what you ate. ${referralLink}"`;
    
    await send(from, msg);
    return;
  }

  if (msgLower === "help" || msgLower === "menu") {
    await send(from,
      `🏋️ *FitSorted*\n\n` +
      `Just talk to me like a friend. No commands needed.\n\n` +
      `🍽️ *"2 eggs, a banana and coffee"*\n` +
      `🏃 *"ran 5km"* or *"45 min gym"*\n` +
      `🍺 *"2 glasses of wine"*\n` +
      `⚖️ *"weight 82.5"*\n\n` +
      `Ask me anything:\n` +
      `_"what should I eat for lunch?"_\n` +
      `_"how am I doing today?"_\n` +
      `_"how drunk am I?"_\n` +
      `_"can I drive?"_\n\n` +
      `Fix mistakes: _"undo"_ or _"that was yesterday"_\n` +
      `Past days: _"yesterday: chicken curry"_\n\n` +
      `Your goal: *${user.goal} cal/day*\n\n` +
      `Type *commands* for the full menu.`
    );
    return;
  }

  // ── Coaching mode - questions get personalised advice (PREMIUM) ──
  if (isQuestion(msg) && !isWorkout(msg)) {
    const coachAccess = await hasAccess(from, user);
    if (!coachAccess) {
      const monthlyLink = getPayFastMonthlyLink(from);
      await send(from,
        `🧠 *Coaching mode is a Premium feature*\n\n` +
        `Upgrade to get personalised meal suggestions, nutrition advice, and answers to any food question.\n\n` +
        `💎 *R${PRO_PRICE}/mo* — 7-day free trial\n` +
        `🔗 ${monthlyLink}\n\n` +
        `_Launch price — won't last forever._`
      );
      return;
    }
    try {
      const reply = await coachResponse(msg, user);
      await send(from, reply);
    } catch (err) {
      console.error("Coach error:", err.message);
      await send(from, "Having trouble answering that right now. Try asking again!");
    }
    return;
  }

  // Workout log
  if (isWorkout(msg)) {
    try {
      const result = await estimateCaloriesBurned(msg);
      const today = getToday();
      if (!user.exercise) user.exercise = {};
      if (!user.exercise[today]) user.exercise[today] = [];
      user.exercise[today].push({ activity: result.activity, calories: result.calories, time: new Date().toISOString() });
      const total = getTodayTotal(user);
      const effectiveGoal = getEffectiveGoal(user);
      const burned = getTodayBurnedTotal(user);
      saveUsers(users);
      await send(from,
        `🔥 *${result.activity}* - burned ${result.calories} cal\n\n` +
        `📊 Today: *${total} eaten / ${effectiveGoal} cal goal*\n` +
        `_(base ${user.goal} + ${burned} exercise)_\n` +
        `${deficitMessage(total, effectiveGoal)}`
      );
    } catch (err) {
      console.error("Workout lookup error:", err.message);
      await send(from, "Couldn't estimate that workout. Try \"30 min run\" or \"45 min gym\".");
    }
    return;
  }

  // Save custom food: "save boerewors roll = 450"
  if (msgLower.startsWith("save ") && msgLower.includes("=")) {
    const parts = msg.substring(5).split("=");
    if (parts.length === 2) {
      const foodName = parts[0].trim();
      const calories = parseInt(parts[1].trim());
      if (!foodName || isNaN(calories) || calories < 1 || calories > 9999) {
        await send(from, `❌ Format: *save [food name] = [calories]*\n\nExample: _save boerewors roll = 450_`);
        return;
      }
      if (!user.customFoods) user.customFoods = {};
      user.customFoods[foodName.toLowerCase()] = calories;
      saveUsers(users);
      await send(from, `✅ *Saved!* "${foodName}" = ${calories} cal\n\nNext time you log it, I'll use your number. 💾\n\nSee all saved foods: *my foods*`);
      return;
    }
  }

  // Alternative custom food syntax: "custom my protein shake 250"
  if (msgLower.startsWith("custom ")) {
    const rest = msg.slice(7).trim();
    const parts = rest.split(/\s+/);
    
    if (parts.length < 2) {
      await send(from, `❌ Format: custom [food name] [calories]\n\nExample: custom my protein shake 250`);
      return;
    }
    
    const lastPart = parts[parts.length - 1];
    const calories = parseInt(lastPart);
    
    if (isNaN(calories) || calories < 0) {
      await send(from, `❌ Last number must be calories.\n\nExample: custom my protein shake 250`);
      return;
    }
    
    const foodName = parts.slice(0, -1).join(" ");
    
    if (!user.customFoods) user.customFoods = {};
    user.customFoods[foodName.toLowerCase()] = calories;
    saveUsers(users);
    await send(from, `✅ *Saved!* "${foodName}" = ${calories} cal\n\nNext time you log it, I'll use your number. 💾\n\nSee all: *my foods*`);
    return;
  }

  // View custom foods: "my foods"
  if (/^(my foods?|saved foods?|custom foods?|my saved foods?|show my foods?|food list|my list)$/i.test(msgLower)) {
    const foods = user.customFoods && Object.keys(user.customFoods).length > 0
      ? Object.entries(user.customFoods).map(([name, cal]) => `• ${name} - ${cal} cal`).join("\n")
      : null;
    if (!foods) {
      await send(from, `📚 You haven't saved any custom foods yet.\n\nTo save one:\n*save boerewors roll = 450*`);
    } else {
      await send(from, `📚 *Your saved foods:*\n\n${foods}\n\nTo remove one: *delete [food name]*`);
    }
    return;
  }

  // Delete custom food: "delete boerewors roll"
  if (msgLower.startsWith("delete ") || msgLower.startsWith("remove ")) {
    const foodName = msg.replace(/^(delete|remove)\s+/i, "").trim().toLowerCase();
    if (user.customFoods && user.customFoods[foodName] !== undefined) {
      const cal = user.customFoods[foodName];
      delete user.customFoods[foodName];
      saveUsers(users);
      await send(from, `🗑️ Removed *${foodName}* (${cal} cal) from your saved foods.`);
    } else {
      await send(from, `❌ "${foodName}" not found in your saved foods.\n\nSee your list: *my foods*`);
    }
    return;
  }

  // Premium features expired - remind about upgrade (but still allow basic calorie logging)
  const userHasAccess = await hasAccess(from, user);
  if (!userHasAccess && !user.shownFreeForeverMessage) {
    const monthlyLink = getPayFastMonthlyLink(from);
    const annualLink = getPayFastAnnualLink(from);
    await send(from,
      `✅ *FitSorted is free forever*\n\n` +
      `You can track calories for as long as you want.\n\n` +
      `Your 7-day free trial has ended. Upgrade for just *R36/mo* to unlock:\n\n` +
      `• 🥩 Macro tracking (protein, carbs, fat)\n` +
      `• 🧠 Coaching mode (meal suggestions, Q&A)\n` +
      `• 📧 Email exports\n` +
      `• 💰 Food budget tracking\n\n` +
      `📅 *Monthly — R36/mo*\n👉 ${monthlyLink}\n\n` +
      `🏆 *Annual — R399/year* _(save R189)_\n👉 ${annualLink}`
    );
    users[from].shownFreeForeverMessage = true;
    saveUsers(users);
    // DON'T return - let them continue logging
  }

  // Food log (with optional date prefix: "yesterday: chicken stir fry")
  // Guard: skip non-food inputs (menu commands, bot artifacts, system strings)
  const junkPatterns = /^(menu:|confirm_log|button_|clean name|unnamed food|test$|\.{1,3}$|feedback$|bug$|issue$|suggestion$|feature$|improve(ment)?$)/i;
  if (junkPatterns.test(msgLower)) {
    console.log(`[guard] Skipped junk input as food: "${msg}"`);
    return;
  }

  // Guard: detect non-food intents (complaints, support requests, goal changes, conversation)
  const nonFoodPatterns = [
    // Complaints & frustration
    /^(you are |you're |this is |it's |its )(glitch|broken|wrong|bad|terrible|awful|useless|stupid|rubbish|trash|crap|shit|buggy|slow|not work)/i,
    /^(does not|doesn't|dont|don't|not) work/i,
    /^(fix |broken|glitch|bug|error|crash|problem|issue)/i,
    // Goal/setting changes
    /^(set|change|adjust|update|fix) my (calorie|macro|protein|carb|fat|daily|goal|target)/i,
    /my (calorie|macro|daily|goal|target)s? (is|are|seem|look) (wrong|incorrect|too|very|completely)/i,
    /^(i want|please) (my |to )?(change|set|adjust|update) (my )?(calorie|macro|goal|target|daily)/i,
    /^(change|set) (my )?(daily )?(calorie|cal|macro) (goal|target|limit|budget|allowance) to \d+/i,
    // Conversational / not food
    /^(i haven'?t eaten|i didn'?t eat|i haven'?t had|haven'?t logged|didn'?t log)/i,
    /^(how many|how much|what'?s my|show me|what did i|what have i)/i,
    /^(thank you|thanks|cheers|ta|appreciate|great job|good job|well done)/i,
    /^(hello|hey|hi there|good morning|good evening|good afternoon|howzit)$/i,
    /^(sorry|oops|my bad|nevermind|never mind|ignore that)/i,
    /we'?re unavailable/i,
    /^(can i|how do i|how can i|is there|what if|why does|why is|why do)/i,
  ];

  const isNonFood = nonFoodPatterns.some(p => p.test(msgLower));
  if (isNonFood) {
    console.log(`[guard] Detected non-food intent: "${msg}"`);
    
    // Check if it's a goal change request
    const goalChangeMatch = msgLower.match(/(calorie|cal|macro).*?(\d{3,4})/);
    if (goalChangeMatch) {
      const newGoal = parseInt(goalChangeMatch[2]);
      if (newGoal >= 800 && newGoal <= 5000) {
        user.goal = newGoal;
        saveUsers(users);
        await send(from, `✅ Daily calorie goal updated to *${newGoal} cal*!\n\nYour daily tracking will now use this target.`);
        return;
      }
    }
    
    // Check if it's a complaint/frustration
    const isComplaint = /glitch|broken|wrong|bad|terrible|not work|doesn't work|does not work|buggy|useless|stupid|rubbish|trash|crap/i.test(msgLower);
    if (isComplaint) {
      await send(from, `😔 Sorry you're having trouble! We're actively improving FitSorted.\n\n*Quick fixes:*\n• Type *profile* to check/update your settings\n• Type *goal 2000* to set your daily calories\n• Type *help* for all commands\n\nIf something specific is wrong, describe the issue and we'll look into it. 🙏`);
      return;
    }
    
    // Check if it's a question
    const isQuestion = /^(can i|how do i|how can i|is there|what if|why does|why is|why do|how many|how much)/i.test(msgLower);
    if (isQuestion) {
      await send(from, `💡 Great question! Here are some things I can help with:\n\n• Type *help* for all commands\n• Type *profile* to update your details\n• Type *goal [number]* to set calorie target\n• Type *coach* to ask nutrition questions\n• Just type what you ate to log food!\n\nExample: _2 eggs and toast_`);
      return;
    }
    
    // Generic non-food response
    return;
  }

  try {
    const debugLog = `/Users/brandonkatz/.openclaw/workspace/fitsorted/debug-food-entry.log`;
    fs.appendFileSync(debugLog, `\n[${new Date().toISOString()}] FOOD ENTRY: "${msg}" from ${from}\n`);
    
    const dateInfo = parseDatePrefix(msg);
    const foodText = dateInfo ? dateInfo.food : msg;
    const logDate = dateInfo ? dateInfo.date : getToday();
    const isBacklog = dateInfo && dateInfo.label; // logging to a past date

    if (dateInfo && !dateInfo.food.trim()) {
      await send(from, `🤔 Looks like you want to log to *${dateInfo.label}* but didn't say what you ate.\n\nTry: _yesterday: chicken stir fry with rice_`);
      return;
    }

    // ── Multi-item splitting ──
    // Split messages like "3 scrambled eggs. One banana and 2 dates" into separate items
    // But preserve compound foods like "chicken and rice", "mac and cheese", "pap and vleis"
    const compoundFoods = [
      'mac and cheese', 'macaroni and cheese', 'pap and vleis', 'pap and wors',
      'bread and butter', 'peanut butter and jelly', 'pb and j', 'pbj',
      'fish and chips', 'bangers and mash', 'rice and beans', 'chicken and rice',
      'chicken and chips', 'steak and chips', 'steak and eggs', 'bacon and eggs',
      'ham and cheese', 'beans and toast', 'eggs and toast', 'toast and eggs',
      'burger and chips', 'burger and fries', 'pie and chips', 'curry and rice',
      'samp and beans', 'pap and chakalaka', 'pap and mince', 'pap and stew',
      'chicken and waffles', 'salt and vinegar', 'oil and vinegar',
      'gin and tonic', 'rum and coke', 'scotch and soda', 'vodka and soda',
      'jack and coke', 'brandy and coke', 'whiskey and coke',
      'cheese and crackers', 'milk and cookies', 'peaches and cream',
      'strawberries and cream', 'biscuits and gravy', 'chips and dip',
      'hummus and pita', 'soup and bread', 'salad and bread',
    ];
    
    function splitFoodItems(text) {
      const lower = text.toLowerCase().trim();
      
      // Check if the whole input is a known compound food
      for (const compound of compoundFoods) {
        if (lower.includes(compound)) return [text.trim()];
      }
      
      // If the text has sentence-like structure with periods or commas, split on those
      // Also split on " and " when preceded by a quantity or food-like pattern
      // Strategy: split on ". " and ", " first, then split remaining parts on " and " 
      // only if both sides look like separate food items (have quantities or are known foods)
      
      let parts = [];
      
      // Step 1: Split on period-space and comma
      const roughParts = text.split(/(?:\.\s+|,\s*)/);
      
      for (const part of roughParts) {
        const trimmed = part.trim().replace(/\.$/, '').trim();
        if (!trimmed) continue;
        
        // Step 2: Try splitting on " and " within each part
        // Only split if both sides start with a quantity word/number (looks like separate items)
        const andParts = trimmed.split(/\s+and\s+/i);
        if (andParts.length >= 2) {
          const quantityPattern = /^(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an|some|half)\s/i;
          const allHaveQuantities = andParts.every(p => quantityPattern.test(p.trim()));
          if (allHaveQuantities) {
            parts.push(...andParts.map(p => p.trim()).filter(Boolean));
          } else {
            parts.push(trimmed);
          }
        } else {
          parts.push(trimmed);
        }
      }
      
      // If splitting produced nothing useful, return the original
      if (parts.length === 0) return [text.trim()];
      return parts.filter(p => p.length > 0);
    }
    
    const foodItems = splitFoodItems(foodText);
    
    // If multiple items detected, process each separately
    if (foodItems.length > 1) {
      const results = [];
      const userCanSeePrice = await hasAccess(from, user) || BETA_FEATURES.priceEstimates.has(from);
      if (!user.log[logDate]) user.log[logDate] = [];
      
      for (let itemIdx = 0; itemIdx < foodItems.length; itemIdx++) {
        const item = foodItems[itemIdx];
        // Stagger API calls to avoid rate limits (200ms between items)
        if (itemIdx > 0) await new Promise(r => setTimeout(r, 200));
        try {
          const result = await estimateCalories(item, user);
          
          // Price estimate
          if (userCanSeePrice && !result.estimatedPriceZAR && OPENAI_API_KEY) {
            try {
              const priceRes = await axios.post(
                "https://api.openai.com/v1/chat/completions",
                {
                  model: "gpt-4o-mini",
                  messages: [
                    { role: "system", content: "You are a South African food price estimator. Given a food item, return ONLY a JSON object: {\"priceZAR\": integer}. Estimate the approximate 2025/2026 cost in South African Rands. For restaurant/takeaway items, use menu prices. For homemade/grocery items, estimate the ingredient cost per serving using SA supermarket prices. Always return a number, never null. Round to nearest rand." },
                    { role: "user", content: result.food }
                  ],
                  temperature: 0.1,
                  max_tokens: 30
                },
                { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, timeout: 5000 }
              );
              const priceContent = priceRes.data.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
              const priceData = JSON.parse(priceContent);
              if (priceData.priceZAR) result.estimatedPriceZAR = priceData.priceZAR;
            } catch (e) { /* Silent fail */ }
          }
          
          // Guard: reject junk
          const legitimateZeroCalFoods = ['water', 'h2o', 'sparkling', 'soda water', 'mineral water', 'ice', 'tea', 'coffee'];
          const itemLower = item.toLowerCase();
          const resultLower = result.food.toLowerCase();
          const isLegitimateZeroCal = legitimateZeroCalFoods.some(f => itemLower.includes(f) || resultLower.includes(f));
          if ((result.calories === 0 && !isLegitimateZeroCal) || /^clean name/i.test(result.food) || /^unnamed/i.test(result.food)) {
            console.log(`[guard] Rejected junk AI result in multi-item: "${result.food}" for input: "${item}"`);
            continue;
          }
          
          const alcoholMatch = detectAlcohol(item) || detectAlcohol(result.food);
          const alcoholUnits = alcoholMatch ? (alcoholMatch.units || 0) : 0;
          
          user.log[logDate].push({
            food: result.food,
            calories: result.calories,
            protein: result.protein || 0,
            carbs: result.carbs || 0,
            fat: result.fat || 0,
      fibre: result.fibre || 0,
            priceZAR: result.estimatedPriceZAR || 0,
            time: new Date().toISOString(),
            isAlcohol: !!alcoholMatch,
            units: alcoholUnits,
          });
          
          // Append to Google Sheets (async, non-blocking)
          appendToFoodLogSheet(from, user.id || from, result.food, result.calories, result.protein || 0, result.carbs || 0, result.fat || 0, result.fibre || 0, result.source || 'AI').catch(e => console.error('[sheets]', e.message));
          
          results.push(result);
        } catch (e) {
          console.error(`[multi-item] Failed to process "${item}":`, e.message);
        }
      }
      
      if (results.length === 0) {
        await send(from, `🤔 I couldn't figure out any of those foods. Try listing them separately.`);
        return;
      }
      
      saveUsers(users);
      
      const total = getTodayTotal(user);
      const effectiveGoal = getEffectiveGoal(user);
      const todayMacros = getTodayMacros(user);
      const macroTargets = getMacroTargets(user);
      const userHasPremium = await hasAccess(from, user);
      
      // Build combined response
      const itemLines = results.map(r => {
        const macros = (userHasPremium && (r.protein || r.carbs || r.fat))
          ? ` (P:${r.protein}g C:${r.carbs}g F:${r.fat}g Fibre:${r.fibre || 0}g)`
          : "";
        const price = (userCanSeePrice && r.estimatedPriceZAR) ? ` ~R${r.estimatedPriceZAR}` : "";
        return `✅ *${r.food}* - ${r.calories} cal${macros}${price}`;
      });
      
      const totalItemCal = results.reduce((s, r) => s + r.calories, 0);
      const totalItemPrice = results.reduce((s, r) => s + (r.estimatedPriceZAR || 0), 0);
      
      let priceTag = "";
      if (userCanSeePrice && totalItemPrice > 0) {
        const dailySpend = user.log[logDate].reduce((s, e) => s + (e.priceZAR || 0), 0);
        const budgetGoal = user.profile?.foodBudget;
        if (budgetGoal) {
          const emoji = (budgetGoal - dailySpend) >= 0 ? "🟢" : "🔴";
          priceTag = `\n💰 ~R${totalItemPrice} | Today: *R${dailySpend} / R${budgetGoal}* ${emoji}`;
        } else {
          priceTag = `\n💰 ~R${totalItemPrice} | Today: *R${dailySpend}* spent`;
        }
      }
      
      let macroProgress = "";
      if (userHasPremium && macroTargets && (todayMacros.protein > 0 || todayMacros.carbs > 0 || todayMacros.fat > 0)) {
        const fibrePct1 = Math.round(((todayMacros.fibre || 0) / macroTargets.fibre) * 100);
        const fibreIcon1 = fibrePct1 >= 100 ? '✅' : fibrePct1 >= 50 ? '🟡' : '🔴';
        macroProgress = `\n\n*Macros Today:*\n🥩 Protein: ${todayMacros.protein}g / ${macroTargets.protein}g\n🍞 Carbs: ${todayMacros.carbs}g / ${macroTargets.carbs}g\n🥑 Fat: ${todayMacros.fat}g / ${macroTargets.fat}g\n🌾 Fibre: ${todayMacros.fibre || 0}g / ${macroTargets.fibre}g ${fibreIcon1}`;
      }
      
      if (isBacklog) {
        const logDateTotal = user.log[logDate].reduce((s, e) => s + e.calories, 0);
        await send(from, `${itemLines.join("\n")}\n\n📅 _Logged to ${dateInfo.label} (${logDate})_\n📊 ${dateInfo.label}: *${logDateTotal} cal total*`);
      } else {
        await send(from, `${itemLines.join("\n")}\n\n📊 Today: *${total} / ${effectiveGoal} cal*${priceTag}${macroProgress}\n${deficitMessage(total, effectiveGoal)}`);
      }
      await maybeFirstLogMenu(from, user, users);
        await maybePromptPro(from, user, users);
      await maybePromptEmail(from, user, users);
      return;
    }

    const result = await estimateCalories(foodText, user);

    // Price estimates: for users with access (trial or premium) or beta testers
    const userCanSeePrice = await hasAccess(from, user) || BETA_FEATURES.priceEstimates.has(from);
    if (userCanSeePrice && !result.estimatedPriceZAR && OPENAI_API_KEY) {
      try {
        const priceRes = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are a South African food price estimator. Given a food item, return ONLY a JSON object: {\"priceZAR\": integer}. Estimate the approximate 2025/2026 cost in South African Rands. For restaurant/takeaway items, use menu prices (Nando's quarter chicken = 75, Steers burger = 65, Kauai smoothie = 65). For homemade/grocery items, estimate the ingredient cost per serving using SA supermarket prices (2 eggs on toast = 8, bowl of pap with mince = 18, chicken stir fry with rice = 25, protein shake = 15, banana = 4). Always return a number, never null. Round to nearest rand." },
              { role: "user", content: result.food }
            ],
            temperature: 0.1,
            max_tokens: 30
          },
          { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, timeout: 5000 }
        );
        const priceContent = priceRes.data.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
        const priceData = JSON.parse(priceContent);
        if (priceData.priceZAR) result.estimatedPriceZAR = priceData.priceZAR;
      } catch (e) {
        // Silent fail - price is a nice-to-have
      }
    }

    // Guard: reject AI responses that look like placeholder/junk
    // Allow legitimate zero-calorie items (water, tea, coffee, etc.)
    const legitimateZeroCalFoods = ['water', 'h2o', 'sparkling', 'soda water', 'mineral water', 'ice', 'tea', 'coffee', 'coke zero', 'diet coke', 'sprite zero', 'fanta zero'];
    const inputLower = foodText.toLowerCase();
    const resultLower = result.food.toLowerCase();
    const isLegitimateZeroCal = legitimateZeroCalFoods.some(f => 
      inputLower.includes(f) || resultLower.includes(f)
    );
    
    if ((result.calories === 0 && !isLegitimateZeroCal) || /^clean name/i.test(result.food) || /^unnamed/i.test(result.food)) {
      console.log(`[guard] Rejected junk AI result: "${result.food}" (${result.calories} cal) for input: "${foodText}"`);
      await send(from, `🤔 I couldn't figure out what that is. Try describing the food, e.g. _2 eggs on toast_`);
      return;
    }
    
    // Guard: Extreme values require confirmation (unless it's bulk meal prep like "10x")
    if (result.calories > 2500 && !/\d+x/i.test(result.food)) {
      console.log(`[guard] Extreme calories detected: "${result.food}" (${result.calories} cal)`);
      await send(from, `⚠️ That's ${result.calories} calories - is that correct? Reply with:\n\n*yes* to log it\n*no* to cancel`);
      user.pendingConfirmation = { action: 'logFood', data: result };
      saveUsers(users);
      return;
    }

    if (!user.log[logDate]) user.log[logDate] = [];
    // Detect alcohol (check both user input AND AI result name for photo logs)
    const alcoholMatch = detectAlcohol(foodText) || detectAlcohol(result.food);
    const alcoholUnits = alcoholMatch ? (alcoholMatch.units || 0) : 0;

    user.log[logDate].push({
      food: result.food,
      calories: result.calories,
      protein: result.protein || 0,
      carbs: result.carbs || 0,
      fat: result.fat || 0,
      fibre: result.fibre || 0,
      priceZAR: result.estimatedPriceZAR || 0,
      time: new Date().toISOString(),
      isAlcohol: !!alcoholMatch,
      units: alcoholUnits,
    });

    const logDateTotal = user.log[logDate].reduce((s, e) => s + e.calories, 0);
    const total = getTodayTotal(user);
    const effectiveGoal = getEffectiveGoal(user);
    const todayMacros = getTodayMacros(user);
    const macroTargets = getMacroTargets(user);
    saveUsers(users);
    
    // Append to Google Sheets (async, non-blocking)
    appendToFoodLogSheet(from, user.id || from, result.food, result.calories, result.protein, result.carbs, result.fat, result.fibre, result.source || 'AI').catch(e => console.error('[sheets]', e.message));

    const sourceTag = result.source === "custom" ? " _(your saved entry)_" : "";
    const userHasPremium = await hasAccess(from, user);
    const itemMacros = (userHasPremium && (result.protein || result.carbs || result.fat))
      ? `\n🥩 P: ${result.protein}g | 🍞 C: ${result.carbs}g | 🥑 F: ${result.fat}g | 🌾 Fibre: ${result.fibre || 0}g`
      : "";

    // Price estimates: shown for premium/trial users and beta testers
    const showPrice = userCanSeePrice;
    let priceTag = "";
    if (showPrice && result.estimatedPriceZAR) {
      const dailySpend = user.log[logDate].reduce((s, e) => s + (e.priceZAR || 0), 0);
      const budgetGoal = user.profile?.foodBudget;
      if (budgetGoal) {
        const remaining = budgetGoal - dailySpend;
        const emoji = remaining >= 0 ? "🟢" : "🔴";
        priceTag = `\n💰 ~R${result.estimatedPriceZAR} | Today: *R${dailySpend} / R${budgetGoal}* ${emoji}`;
      } else {
        priceTag = `\n💰 ~R${result.estimatedPriceZAR} | Today: *R${dailySpend}* spent`;
      }
    }

    if (isBacklog) {
      // Logging to a past date
      await send(from, `✅ *${result.food}* - ${result.calories} cal${sourceTag}${itemMacros}${priceTag}\n\n📅 _Logged to ${dateInfo.label} (${logDate})_\n📊 ${dateInfo.label}: *${logDateTotal} cal total*`);
    } else {
      // Normal today logging
      let macroProgress = "";
      if (userHasPremium && macroTargets && (todayMacros.protein > 0 || todayMacros.carbs > 0 || todayMacros.fat > 0)) {
        const fibrePct2 = Math.round(((todayMacros.fibre || 0) / macroTargets.fibre) * 100);
        const fibreIcon2 = fibrePct2 >= 100 ? '✅' : fibrePct2 >= 50 ? '🟡' : '🔴';
        macroProgress = `\n\n*Macros Today:*\n🥩 Protein: ${todayMacros.protein}g / ${macroTargets.protein}g\n🍞 Carbs: ${todayMacros.carbs}g / ${macroTargets.carbs}g\n🥑 Fat: ${todayMacros.fat}g / ${macroTargets.fat}g\n🌾 Fibre: ${todayMacros.fibre || 0}g / ${macroTargets.fibre}g ${fibreIcon2}`;
      }
      
      // Alcohol tracking
      if (alcoholMatch) {
        const todayDrinks = getTodayAlcohol(user);
        const totalUnits = todayDrinks.reduce((s, e) => s + (e.units || 0), 0);
        const totalAlcoholCal = todayDrinks.reduce((s, e) => s + e.calories, 0);
        const gender = user.profile?.gender || "male";

        let alcoholMsg = `✅ *${result.food}* logged — ${result.calories} cal | ${alcoholUnits.toFixed(1)} units\n\n`;
        alcoholMsg += buildDrunkOMeterMessage(totalUnits, totalAlcoholCal, gender, todayDrinks);
        alcoholMsg += `\n\n📊 Today total: *${total} / ${effectiveGoal} cal*`;
        await send(from, alcoholMsg);
      } else {
        const message = `✅ *${result.food}* - ${result.calories} cal${sourceTag}${itemMacros}${priceTag}\n\n📊 Today: *${total} / ${effectiveGoal} cal*${macroProgress}\n${deficitMessage(total, effectiveGoal)}`;
        console.log('[FOOD] Sending food log with buttons');
        await sendButtons(from, message, [
          { id: 'correct_last', title: '✏️ Edit' },
          { id: 'undo_last', title: '❌ Remove' }
        ]);
      }
      await maybeFirstLogMenu(from, user, users);
        await maybePromptPro(from, user, users);
      await maybePromptEmail(from, user, users);
    }
  } catch (err) {
    console.error("Food lookup error:", err.message);
    
    // Track failed lookup for admin review
    trackFailedLookup(text, from);
    
    // Smart error message based on input
    let errorMsg = "❌ Couldn't estimate that.\n\n";
    
    // Detect common issues and suggest fixes
    if (text.length < 3) {
      errorMsg += "💡 Try being more specific:\n";
      errorMsg += "• \"2 eggs\" instead of \"eg\"\n";
      errorMsg += "• \"200g chicken\" instead of \"ch\"\n";
    } else if (!text.match(/\d/)) {
      errorMsg += "💡 Include quantity:\n";
      errorMsg += "• \"2 slices bread\" ✅\n";
      errorMsg += "• \"200g chicken\" ✅\n";
      errorMsg += "• \"bread\" ❌\n";
    } else {
      errorMsg += "💡 Try:\n";
      errorMsg += "• Be more specific (\"grilled chicken breast\" vs \"chicken\")\n";
      errorMsg += "• Check spelling\n";
      errorMsg += "• Use grams/ml (\"200g rice\")\n";
    }
    
    errorMsg += "\n📝 *Common formats:*\n";
    errorMsg += "• 2 eggs\n";
    errorMsg += "• 200g chicken breast\n";
    errorMsg += "• 1 banana\n";
    errorMsg += "• half avo\n";
    errorMsg += "• nandos peri chicken burger\n\n";
    
    errorMsg += "🔧 *Still stuck?*\n";
    errorMsg += "Reply: custom [food] [calories]\n";
    errorMsg += "Example: custom my protein shake 250\n\n";
    
    errorMsg += "_This will save it for future logs._";
    
    await send(from, errorMsg);
  }
}

// ── Webhook ──
app.get("/pay", (req, res) => {
  try {
    const plan = req.query.plan === "annual" ? "annual" : "monthly";
    const phone = String(req.query.phone || "unknown");
    const discountPct = Number(req.query.discount || 0) || 0;
    const firstName = String(req.query.firstName || "FitSorted");
    const lastName = String(req.query.lastName || "User");
    const payfastUrl = plan === "annual"
      ? getPayFastAnnualLink(phone, discountPct, firstName, lastName)
      : getPayFastMonthlyLink(phone, discountPct, firstName, lastName);
    return res.redirect(302, payfastUrl);
  } catch (error) {
    console.error("[pay] redirect error", error.message);
    return res.status(500).send("Payment link unavailable");
  }
});

app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  if (APP_SECRET && !isValidWebhookSignature(req)) {
    return res.sendStatus(403);
  }
  res.sendStatus(200);
  try {
    const entry = req.body?.entry?.[0];
    const messages = entry?.changes?.[0]?.value?.messages;
    if (!messages?.length) return;
    const msg = messages[0];
    const from = msg.from;
    let text = "";
    let imageId = null;
    if (msg.type === "text") text = msg.text?.body || "";
    else if (msg.type === "interactive") {
      text = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || "";
      console.log("INTERACTIVE:", JSON.stringify(msg.interactive));
    }
    else if (msg.type === "image") {
      imageId = msg.image?.id || null;
      text = msg.image?.caption || "";
    }

    console.log(`[webhook] Calling handleMessage from=${from} text="${text}" imageId=${imageId}`);
    await handleMessage(from, text, imageId);
    console.log(`[webhook] handleMessage completed`);
  } catch (err) {
    console.error("Webhook error:", err.message, err.stack?.split('\n').slice(0,3).join('\n'));
    
    // Critical safeguard: ALWAYS reply to the user, even on unexpected errors
    try {
      const from = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
      if (from) {
        await send(from, 
          `⚠️ Something went wrong.\n\n` +
          `I've logged the error and will fix it soon.\n\n` +
          `In the meantime, try:\n` +
          `• Rephrasing your message\n` +
          `• Using simpler food descriptions\n` +
          `• Text *support* for help`
        );
      }
    } catch (sendErr) {
      console.error("[webhook] Failed to send error message:", sendErr.message);
    }
  }
});

// ── Cron dedup: prevent double-sends on restart ──
const CRON_STATE_FILE = './cron-state.json';
const ENABLE_NUDGES = false;
function cronAlreadyRan(jobName) {
  const today = getToday();
  try {
    const state = JSON.parse(fs.readFileSync(CRON_STATE_FILE, 'utf8'));
    return state[jobName] === today;
  } catch { return false; }
}
function markCronRan(jobName) {
  const today = getToday();
  let state = {};
  try { state = JSON.parse(fs.readFileSync(CRON_STATE_FILE, 'utf8')); } catch {}
  state[jobName] = today;
  fs.writeFileSync(CRON_STATE_FILE, JSON.stringify(state, null, 2));
}

// ── 6:30 AM morning check-in ── DISABLED: 19% conversion, not worth the cost
// cron.schedule("30 6 * * *", async () => {
if (false) { (async () => {
  if (cronAlreadyRan('morning')) { console.log('[cron] Morning already sent today, skipping'); return; }
  markCronRan('morning');
  const users = loadUsers();
  for (const [phone, user] of Object.entries(users)) {
    if (!user.setup || !user.goal) continue;
    if (user.optedOut) continue; // respect opt-out
    const lastActivity = getLastActivityDate(user);
    const daysSinceActivity = lastActivity ? (Date.now() - lastActivity.getTime()) / 86400000 : 999;
    if (!await hasAccess(phone, user)) continue; // skip free users
    if (daysSinceActivity > 14) continue; // gone - stop all
    if (daysSinceActivity > 7) continue; // inactive - no morning checkin
    // Only send morning check-in every 3 days per user
    if (user.lastMorning) {
      const daysSince = Math.floor((Date.now() - new Date(user.lastMorning)) / 86400000);
      if (daysSince < 3) continue;
    } else if (user.joinedAt) {
      const joinedAt = new Date(user.joinedAt);
      const daysSinceJoin = Math.floor((Date.now() - joinedAt.getTime()) / 86400000);
      if (daysSinceJoin % 3 !== 0) continue;
    }
    try {
      const { target } = user.profile || {};
      const targetMsg = target === "lose" ? "lose weight" : target === "gain" ? "build muscle" : "stay on track";

      // Yesterday's full recap with food list + macros
      const yesterdayEntries = getYesterdayEntries(user);
      const yesterdayTotal = yesterdayEntries.reduce((s, e) => s + e.calories, 0);
      let yesterdayStr = "";
      if (yesterdayTotal > 0) {
        // Food list
        const foodList = yesterdayEntries.map(e => `• ${e.food} - ${e.calories} cal`).join("\n");

        // Macros
        const yMacros = {
          protein: yesterdayEntries.reduce((s, e) => s + (e.protein || 0), 0),
          carbs: yesterdayEntries.reduce((s, e) => s + (e.carbs || 0), 0),
          fat: yesterdayEntries.reduce((s, e) => s + (e.fat || 0), 0),
          fibre: yesterdayEntries.reduce((s, e) => s + (e.fibre || 0), 0)
        };
        let macroStr = "";
        if (yMacros.protein > 0 || yMacros.carbs > 0 || yMacros.fat > 0) {
          macroStr = `\n🥩 P: ${yMacros.protein}g | 🍞 C: ${yMacros.carbs}g | 🥑 F: ${yMacros.fat}g | 🌾 Fibre: ${yMacros.fibre}g`;
        }

        // Deficit/surplus verdict
        const diff = user.goal - yesterdayTotal;
        let verdict;
        if (diff > 0) {
          const grams = Math.round((diff / 7700) * 1000);
          verdict = `${grams}g fat lost ✅`;
        } else if (diff === 0) {
          verdict = `Right on goal 🎯`;
        } else {
          const grams = Math.round((Math.abs(diff) / 7700) * 1000);
          verdict = `${grams}g surplus`;
        }

        yesterdayStr = `\n\n📊 *Yesterday's recap:*\n${foodList}\n\n🔢 *${yesterdayTotal} / ${user.goal} cal* - ${verdict}${macroStr}`;
      }

      const greeting = user.name ? `☀️ *Morning, ${user.name}!*` : `☀️ *Morning!*`;
      await send(phone, `${greeting}${yesterdayStr}\n\nFresh day. ${user.goal} cal to ${targetMsg}.\n\nLog your breakfast when you're ready 👊`);
      users[phone].lastMorning = new Date().toISOString();
    } catch (err) {
      console.error(`Morning message failed for ${phone}:`, err.message);
    }
  }
  saveUsers(users);
})(); } // end disabled morning check-in

// ── 8 PM daily summary ──
cron.schedule("0 20 * * *", async () => {
  if (cronAlreadyRan('evening')) { console.log('[cron] Evening summary already sent today, skipping'); return; }
  markCronRan('evening');
  const users = loadUsers();
  const challenges = loadChallenges();
  for (const [phone, user] of Object.entries(users)) {
    if (!user.setup || !user.goal) continue;
    if (user.optedOut) continue; // respect opt-out
    try {
      const lastActivity = getLastActivityDate(user);
      const daysSinceActivity = lastActivity ? (Date.now() - lastActivity.getTime()) / 86400000 : 999;
      const eveningHasAccess = await hasAccess(phone, user);
      if (!eveningHasAccess) continue; // skip free users
      if (daysSinceActivity > 14) continue; // gone - stop all
      if (daysSinceActivity > 7) {
        // inactive — weekly Monday nudge only
        if (new Date().getDay() !== 1) continue;
        // Send nudge instead of summary
        await send(phone, `👋 Hey! It's been a while since you logged food. Jump back in — even one meal counts. 🥗`);
        continue;
      }
      const total = getTodayTotal(user);
      if (total === 0) continue;
      const todayMacros = getTodayMacros(user);
      const macroTargets = getMacroTargets(user);

      let macroStr = "";
      if (eveningHasAccess && (todayMacros.protein > 0 || todayMacros.carbs > 0 || todayMacros.fat > 0)) {
        if (macroTargets) {
          const fibrePct3 = Math.round(((todayMacros.fibre || 0) / macroTargets.fibre) * 100);
          const fibreIcon3 = fibrePct3 >= 100 ? '✅' : fibrePct3 >= 50 ? '🟡' : '🔴';
          macroStr = `\n\n*Macros:*\n🥩 P: ${todayMacros.protein}g / ${macroTargets.protein}g\n🍞 C: ${todayMacros.carbs}g / ${macroTargets.carbs}g\n🥑 F: ${todayMacros.fat}g / ${macroTargets.fat}g\n🌾 Fibre: ${todayMacros.fibre || 0}g / ${macroTargets.fibre}g ${fibreIcon3}`;
        } else {
          macroStr = `\n🥩 P: ${todayMacros.protein}g | 🍞 C: ${todayMacros.carbs}g | 🥑 F: ${todayMacros.fat}g | 🌾 Fibre: ${todayMacros.fibre || 0}g`;
        }
      }

      // Daily spend summary (premium/trial users)
      let spendStr = "";
      if (eveningHasAccess) {
        const today = getToday();
        const dailySpend = (user.log[today] || []).reduce((s, e) => s + (e.priceZAR || 0), 0);
        if (dailySpend > 0) {
          const budgetGoal = user.profile?.foodBudget;
          if (budgetGoal) {
            const remaining = budgetGoal - dailySpend;
            const emoji = remaining >= 0 ? "🟢" : "🔴";
            spendStr = `\n💰 R${dailySpend} / R${budgetGoal} budget ${emoji} (R${Math.abs(remaining)} ${remaining >= 0 ? "left" : "over"})`;
          } else {
            spendStr = `\n💰 R${dailySpend} spent on food today`;
          }
        }
      }

      // Trial reminder append
      let trialReminderStr = "";
      const trialDaysLeft = user.trialStartDate ? Math.ceil((TRIAL_DAYS * 86400000 - (Date.now() - new Date(user.trialStartDate).getTime())) / 86400000) : null;
      if (trialDaysLeft === 2) {
        trialReminderStr = `\n\n⏰ Your free trial ends in 2 days — upgrade to keep Premium features! R36/mo`;
      } else if (trialDaysLeft !== null && trialDaysLeft <= 0) {
        trialReminderStr = `\n\n Your free trial has ended. Upgrade to Premium for R36/mo or continue with free calorie tracking.`;
      }

      // Streak + milestones
      const streak = getCurrentStreak(user);
      user.streak = streak;
      let streakStr = `\n🔥 ${streak}-day streak`;
      let milestoneStr = "";
      const milestoneMessages = {
        3: { badge: "🌱", text: "3-day streak! Habit forming..." },
        7: { badge: "🔥", text: "1 week streak! You're on fire" },
        14: { badge: "⭐", text: "2 weeks! This is becoming second nature" },
        21: { badge: "💪", text: "21 days — they say that's how habits are made" },
        30: { badge: "🏅", text: "30-DAY STREAK! You're in the top 5% of users" },
        50: { badge: "🏆", text: "50 days! Absolute machine" },
        100: { badge: "👑", text: "100 DAYS. Legend status unlocked" }
      };
      const milestones = [3, 7, 14, 21, 30, 50, 100];
      const newMilestone = milestones.filter(m => streak >= m).pop();
      if (newMilestone && newMilestone > (user.lastStreakMilestone || 0)) {
        user.lastStreakMilestone = newMilestone;
        const m = milestoneMessages[newMilestone];
        milestoneStr = `\n${m.badge} ${m.text}`;
        // Ask for feedback on milestone (only on 7+ day milestones)
        if (newMilestone >= 7) {
          milestoneStr += `\n\n💬 Quick question — what's one thing you'd change about FitSorted?`;
          user.awaitingFeedback = true;
          user.feedbackAskedAt = new Date().toISOString();
        }
      }

      // Buddy stats (only if both logged today)
      let buddyStr = "";
      if (user.buddy?.paired && users[user.buddy.phone]) {
        const buddyUser = users[user.buddy.phone];
        const buddyTodayEntries = buddyUser.log[getToday()] || [];
        if (buddyTodayEntries.length > 0) {
          const buddyTotal = buddyTodayEntries.reduce((s, e) => s + e.calories, 0);
          const buddyIcon = buddyTotal <= buddyUser.goal ? "✅" : "⚠️";
          const userUnder = countUnderGoalDaysThisWeek(user);
          const buddyUnder = countUnderGoalDaysThisWeek(buddyUser);
          buddyStr = `\n\n🤝 *Buddy: ${buddyUser.name || user.buddy.phone}*\n` +
            `Their day: ${buddyTotal.toLocaleString()} / ${buddyUser.goal.toLocaleString()} cal ${buddyIcon}\n` +
            `This week: You ${userUnder} ✅ — Them ${buddyUnder} ✅`;
        }
      }

      let challengeStr = "";
      let weeklyChallengeStr = "";
      if (user.challenge) {
        const challenge = challenges[user.challenge];
        if (challenge && challenge.active && challenge.startedAt) {
          const leaderboardMsg = buildChallengeLeaderboardMessage(challenge, users, phone);
          if (leaderboardMsg) challengeStr = `\n\n${leaderboardMsg}`;
          const isFriday = new Date().getDay() === 5;
          if (isFriday) {
            const weeklyMsg = buildWeeklyChallengeRecap(challenge, users, phone);
            if (weeklyMsg) weeklyChallengeStr = `\n\n${weeklyMsg}`;
          }
        }
      }

      const summaryMsg = `📊 *Daily Summary*\n${total} / ${user.goal} cal${macroStr}${spendStr}\n${deficitMessage(total, user.goal)}${streakStr}${milestoneStr}${trialReminderStr}${buddyStr}${challengeStr}${weeklyChallengeStr}`;
      await send(phone, summaryMsg);

      // ── First 3 days: Send command reminder ──
      if (user.joinedAt) {
        const joinDate = new Date(user.joinedAt);
        const now = new Date();
        const daysSinceJoin = Math.floor((now - joinDate) / (1000 * 60 * 60 * 24));

        if (daysSinceJoin <= 2) {  // Days 0, 1, 2 (first 3 days)
          const reminders = [
            // Day 0
            `💡 *Quick tip:* You can also log exercise!\n\nExample: *"45 min weights"* or *"30 min run"*\n\nI'll add those calories back to your daily budget. 🏋️`,
            // Day 1
            `💡 *Quick tip:* Made a mistake?\n\nJust say *undo* and I'll remove your last entry.\n\nOr say *log* to see everything you've eaten today. 📝`,
            // Day 2
            `💡 *Quick tip:* Stuck on what to eat?\n\nAsk me things like:\n• *"what can I eat under 400 cal?"*\n• *"is this healthy?"*\n• *"how many cals in a chicken wrap?"*\n\nI'm here to help! 🧠`
          ];

          if (reminders[daysSinceJoin]) {
            await send(phone, reminders[daysSinceJoin]);
          }
        }

        // ── Day 7 feedback ask ──
        if (daysSinceJoin === 7 && !user.sentDay7Feedback) {
          await send(phone, `You've been using FitSorted for a week! 🎉 How's it going?\n\nReply with any feedback — good or bad, we read everything.`);
          user.sentDay7Feedback = true;
          user.awaitingFeedback = true;
          user.feedbackAskedAt = new Date().toISOString();
        }

        // ── Friday feedback for power users (5+ days logged this week) ──
        const isFriday = new Date().getDay() === 5;
        if (isFriday && !user.awaitingFeedback && daysSinceJoin > 7) {
          const last7dates = getLastNDates(7);
          const daysLoggedThisWeek = last7dates.filter(d => (user.log[d] || []).length > 0).length;
          // Only ask if logged 5+ days AND we haven't asked in the last 30 days
          const lastFeedbackAsk = user.lastFeedbackAskDate ? new Date(user.lastFeedbackAskDate) : null;
          const daysSinceLastAsk = lastFeedbackAsk ? (Date.now() - lastFeedbackAsk.getTime()) / 86400000 : 999;
          if (daysLoggedThisWeek >= 5 && daysSinceLastAsk > 30) {
            const fridayQuestions = [
              `💬 You crushed it this week. Anything we should improve?`,
              `💬 Quick one — what feature do you wish FitSorted had?`,
              `💬 Would you recommend FitSorted to a friend? Why or why not?`,
              `💬 On a scale of 1-10, how would you rate FitSorted?`
            ];
            const questionIndex = Math.floor(Date.now() / 604800000) % fridayQuestions.length; // rotate weekly
            await send(phone, fridayQuestions[questionIndex]);
            user.awaitingFeedback = true;
            user.feedbackAskedAt = new Date().toISOString();
            user.lastFeedbackAskDate = new Date().toISOString();
          }
        }
      }
    } catch (err) {
      console.error(`Summary failed for ${phone}:`, err.message);
    }
  }
  const today = getToday();
  for (const challenge of Object.values(challenges)) {
    if (!challenge.active || !challenge.startedAt) continue;
    const endDateStr = getChallengeEndDateStr(challenge);
    if (!endDateStr || compareDateStr(today, endDateStr) < 0) continue;
    const finalMsg = buildFinalChallengeResultsMessage(challenge, users);
    if (finalMsg) {
      for (const phone of (challenge.members || [])) {
        if (users[phone]?.optedOut) continue;
        await send(phone, finalMsg);
      }
    }
    challenge.active = false;
    for (const phone of (challenge.members || [])) {
      if (users[phone]?.challenge === challenge.code) delete users[phone].challenge;
    }
  }
  saveChallenges(challenges);
  saveUsers(users);
}, { timezone: "Africa/Johannesburg" });

// ── Friday 9 AM weight projection ──
cron.schedule("0 9 * * 5", async () => {
  if (cronAlreadyRan('friday-projection')) { console.log('[cron] Friday projection already sent, skipping'); return; }
  markCronRan('friday-projection');
  const users = loadUsers();
  
  for (const [phone, user] of Object.entries(users)) {
    if (!user.setup || !user.goal) continue;
    
    try {
      const projection = calculateWeightProjection(user);
      
      // Need at least 7 days to show meaningful projection
      if (!projection || projection.daysSinceStart < 7) continue;
      
      const name = user.name || "Brandon";
      
      let msg = `Hey ${name} 👋\n\n`;
      msg += `If you'd hit your calories every day, you would have lost *${projection.expectedLoss} kg* by now.\n\n`;
      msg += `Starting weight: *${projection.startWeight} kg*\n`;
      msg += `You'd weigh: *${projection.projected} kg*`;
      
      await send(phone, msg);
    } catch (err) {
      console.error(`Friday projection failed for ${phone}:`, err.message);
    }
  }
}, { timezone: "Africa/Johannesburg" });

// ── 9 AM new user motivation (day 1) ──
cron.schedule("0 9 * * *", async () => {
  if (cronAlreadyRan('day1-motivation')) { console.log('[cron] Day 1 motivation already sent, skipping'); return; }
  markCronRan('day1-motivation');
  const users = loadUsers();
  
  for (const [phone, user] of Object.entries(users)) {
    if (!user.setup || !user.goal || !user.joinedAt) continue;
    
    // Skip if already sent this message
    if (user.sentDay1Motivation) continue;
    
    const joinedAt = new Date(user.joinedAt);
    const daysSinceJoin = Math.floor((Date.now() - joinedAt.getTime()) / 86400000);
    
    // Only send on day 1 (24-48 hours after signup)
    if (daysSinceJoin !== 1) continue;
    
    try {
      const { gender, weight, height, age, activity } = user.profile || {};
      if (!gender || !weight || !height || !age || !activity) continue;
      
      // Calculate TDEE
      let bmr;
      if (gender === "male") {
        bmr = 10 * weight + 6.25 * height - 5 * age + 5;
      } else {
        bmr = 10 * weight + 6.25 * height - 5 * age - 161;
      }
      
      const multipliers = {
        sedentary: 1.2,
        light: 1.375,
        moderate: 1.55,
        active: 1.725,
        veryActive: 1.9
      };
      
      const tdee = bmr * (multipliers[activity] || 1.2);
      const dailyDeficit = tdee - user.goal;
      
      // 7-day projection
      const weekDeficit = dailyDeficit * 7;
      const weekLoss = weekDeficit / 7700;
      const weekWeight = weight - weekLoss;
      
      const name = user.name || "Hey";
      
      let msg = `${name} 👋\n\n`;
      msg += `If you stick to your calorie goals, you'll weigh *${weekWeight.toFixed(1)} kg* in one week.\n\n`;
      msg += `That's *${weekLoss.toFixed(1)} kg* down from where you started.\n\n`;
      msg += `Keep it up 💪`;
      
      await send(phone, msg);
      
      // Mark as sent
      users[phone].sentDay1Motivation = true;
    } catch (err) {
      console.error(`Day 1 motivation failed for ${phone}:`, err.message);
    }
  }
  
  saveUsers(users);
}, { timezone: "Africa/Johannesburg" });

// ── 10 AM Day 3 nudge (danger zone) ──
cron.schedule("0 10 * * *", async () => {
  if (cronAlreadyRan('day3-nudge')) { console.log('[cron] Day 3 nudge already sent, skipping'); return; }
  markCronRan('day3-nudge');
  const users = loadUsers();
  
  for (const [phone, user] of Object.entries(users)) {
    if (!user.setup || !user.joinedAt) continue;
    if (user.sentDay3Nudge) continue;
    
    const daysSinceJoin = Math.floor((Date.now() - new Date(user.joinedAt).getTime()) / 86400000);
    if (daysSinceJoin !== 3) continue;
    
    try {
      const daysLogged = Object.keys(user.log || {}).length;
      const name = user.name || "Hey";
      
      let msg;
      if (daysLogged >= 3) {
        // Streak celebration
        msg = `${name} 🔥\n\n3 days tracked! You're building a real habit here.\n\nKeep the streak alive today 💪`;
      } else if (daysLogged === 0) {
        // Never logged - stronger nudge
        msg = `${name} 👋\n\nYou signed up 3 days ago but haven't logged any meals yet.\n\nJust try one day - tell me what you eat today and I'll count it for you.\n\nNo pressure, just track 🍽️`;
      } else {
        // Logged some but not consistent
        msg = `${name} 👋\n\nYou've logged ${daysLogged} day${daysLogged === 1 ? '' : 's'} so far.\n\nLet's keep the momentum going - log something today! 💪`;
      }
      
      await send(phone, msg);
      users[phone].sentDay3Nudge = true;
    } catch (err) {
      console.error(`Day 3 nudge failed for ${phone}:`, err.message);
    }
  }
  
  saveUsers(users);
}, { timezone: "Africa/Johannesburg" });

// ── 11 AM Day 7 re-engagement ── DISABLED: 33% but tiny sample, both converts already active
// cron.schedule("0 11 * * *", async () => {
if (false) { (async () => {
  if (cronAlreadyRan('day7-reengagement')) { console.log('[cron] Day 7 re-engagement already sent, skipping'); return; }
  markCronRan('day7-reengagement');
  const users = loadUsers();
  
  for (const [phone, user] of Object.entries(users)) {
    if (!user.setup || !user.joinedAt) continue;
    if (user.sentDay7Reengagement) continue;
    
    const daysSinceJoin = Math.floor((Date.now() - new Date(user.joinedAt).getTime()) / 86400000);
    if (daysSinceJoin !== 7) continue;
    
    try {
      // Check if active in last 3 days
      const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
      const recentlyActive = Object.values(user.log || {}).some(entries =>
        entries.some(e => new Date(e.time) > threeDaysAgo)
      );
      
      // Only send if inactive
      if (recentlyActive) {
        users[phone].sentDay7Reengagement = true;
        continue;
      }
      
      const daysLogged = Object.keys(user.log || {}).length;
      const name = user.name || "Hey";
      
      let msg = `${name} 👋\n\n`;
      if (daysLogged > 0) {
        msg += `You logged ${daysLogged} day${daysLogged === 1 ? '' : 's'} last week but went quiet.\n\n`;
        msg += `Life gets busy - I get it.\n\n`;
        msg += `But even logging one meal helps you stay aware.\n\n`;
        msg += `Give it another shot today? 🍽️`;
      } else {
        msg += `It's been a week since you signed up.\n\n`;
        msg += `Still interested in tracking calories?\n\n`;
        msg += `Just send me any meal and I'll help you get started 💪`;
      }
      
      await send(phone, msg);
      users[phone].sentDay7Reengagement = true;
    } catch (err) {
      console.error(`Day 7 re-engagement failed for ${phone}:`, err.message);
    }
  }
  
  saveUsers(users);
})(); } // end disabled day 7 re-engagement

// ── 10 AM Day 5 trial conversion nudge (2 days left — show what they'll lose) ──
cron.schedule("0 10 * * *", async () => {
  if (cronAlreadyRan('day5-conversion')) { return; }
  markCronRan('day5-conversion');
  const users = loadUsers();
  
  for (const [phone, user] of Object.entries(users)) {
    if (!user.setup || !user.joinedAt) continue;
    if (user.sentDay5Conversion) continue;
    if (isGrandfathered(user)) continue;
    
    const daysSinceJoin = Math.floor((Date.now() - new Date(user.joinedAt).getTime()) / 86400000);
    if (daysSinceJoin !== 5) continue;
    
    // Only nudge active users (they have something to lose)
    const daysLogged = Object.values(user.log || {}).filter(a => Array.isArray(a) && a.length > 0).length;
    if (daysLogged < 2) continue;
    
    // Already paid? Skip
    const premium = await isPremium(phone);
    if (premium) { users[phone].sentDay5Conversion = true; continue; }
    
    try {
      const name = user.name || "Hey";
      const totalEntries = Object.values(user.log || {}).reduce((s, a) => s + (Array.isArray(a) ? a.length : 0), 0);
      
      // Calculate their actual stats to make it personal
      const todayMacros = getTodayMacros(user);
      const hasUsedMacros = todayMacros.protein > 0;
      const hasUsedPhotos = Object.values(user.log || {}).flat().some(e => e?.source === 'photo');
      const hasWeights = (user.weights || []).length > 0;
      
      let features = [];
      if (hasUsedMacros) features.push("🥩 Macro tracking (protein, carbs, fat)");
      features.push("🧠 Coaching mode & meal suggestions");
      features.push("📸 Photo food logging");
      if (hasWeights) features.push("⚖️ Weight trend tracking");
      features.push("📧 Weekly email reports");
      features.push("💰 Food budget tracking");
      
      const monthlyLink = getPayFastMonthlyLink(phone);
      const annualLink = getPayFastAnnualLink(phone);
      
      await send(phone,
        `${name} — your free trial ends in *2 days* ⏰\n\n` +
        `You've logged *${totalEntries} meals* across *${daysLogged} days*. That's real progress.\n\n` +
        `After your trial, you keep *free calorie tracking forever*. But these Premium features go away:\n\n` +
        `${features.join("\n")}\n\n` +
        `Lock it in for *R36/mo* (R1.20/day):\n` +
        `👉 ${monthlyLink}\n\n` +
        `Or save with annual — *R399/year*:\n` +
        `👉 ${annualLink}\n\n` +
        `_Cancel anytime. Free tracking stays forever._`
      );
      users[phone].sentDay5Conversion = true;
    } catch (err) {
      console.error(`Day 5 conversion failed for ${phone}:`, err.message);
    }
  }
  saveUsers(users);
}, { timezone: "Africa/Johannesburg" });

// ── 9 AM Day 7 trial expiry conversion (last chance — urgency) ──
cron.schedule("0 9 * * *", async () => {
  if (cronAlreadyRan('day7-conversion')) { return; }
  markCronRan('day7-conversion');
  const users = loadUsers();
  
  for (const [phone, user] of Object.entries(users)) {
    if (!user.setup || !user.joinedAt) continue;
    if (user.sentDay7Conversion) continue;
    if (isGrandfathered(user)) continue;
    
    const daysSinceJoin = Math.floor((Date.now() - new Date(user.joinedAt).getTime()) / 86400000);
    if (daysSinceJoin !== 7) continue;
    
    const daysLogged = Object.values(user.log || {}).filter(a => Array.isArray(a) && a.length > 0).length;
    if (daysLogged < 1) continue;
    
    const premium = await isPremium(phone);
    if (premium) { users[phone].sentDay7Conversion = true; continue; }
    
    try {
      const name = user.name || "Hey";
      const totalEntries = Object.values(user.log || {}).reduce((s, a) => s + (Array.isArray(a) ? a.length : 0), 0);
      
      // Calculate weight change if they've logged weights
      let weightStr = "";
      if (user.weights && user.weights.length >= 2) {
        const first = user.weights[0].kg;
        const last = user.weights[user.weights.length - 1].kg;
        const diff = last - first;
        if (diff < 0) weightStr = `\n\n📉 You've lost *${Math.abs(diff).toFixed(1)} kg* since you started. Don't stop now.`;
      }
      
      const monthlyLink = getPayFastMonthlyLink(phone);
      const annualLink = getPayFastAnnualLink(phone);
      
      await send(phone,
        `${name} — your free trial ends *today* 🔔\n\n` +
        `*${totalEntries} meals logged. ${daysLogged} days tracked.* That's commitment.${weightStr}\n\n` +
        `Starting tomorrow, calorie tracking stays *100% free*.\n\n` +
        `But Premium features (macros, coaching, photos, exports) are going away.\n\n` +
        `Keep everything for just *R36/mo* — that's less than a coffee:\n` +
        `📅 Monthly: ${monthlyLink}\n` +
        `🏆 Annual (save R189): ${annualLink}\n\n` +
        `Or just keep tracking for free — no hard feelings 🤝`
      );
      users[phone].sentDay7Conversion = true;
    } catch (err) {
      console.error(`Day 7 conversion failed for ${phone}:`, err.message);
    }
  }
  saveUsers(users);
}, { timezone: "Africa/Johannesburg" });

// ── 10 AM Day 14 win-back (one week post-trial — last attempt) ──
cron.schedule("0 10 * * *", async () => {
  if (cronAlreadyRan('day14-winback')) { return; }
  markCronRan('day14-winback');
  const users = loadUsers();
  
  for (const [phone, user] of Object.entries(users)) {
    if (!user.setup || !user.joinedAt) continue;
    if (user.sentDay14Winback) continue;
    if (isGrandfathered(user)) continue;
    
    const daysSinceJoin = Math.floor((Date.now() - new Date(user.joinedAt).getTime()) / 86400000);
    if (daysSinceJoin !== 14) continue;
    
    const premium = await isPremium(phone);
    if (premium) { users[phone].sentDay14Winback = true; continue; }
    
    // Only win back users who were actually active
    const daysLogged = Object.values(user.log || {}).filter(a => Array.isArray(a) && a.length > 0).length;
    if (daysLogged < 3) continue;
    
    // Check if they're still using the free tier
    const lastActivity = getLastActivityDate(user);
    const daysSinceActivity = lastActivity ? (Date.now() - lastActivity.getTime()) / 86400000 : 999;
    
    try {
      const name = user.name || "Hey";
      const monthlyLink = getPayFastMonthlyLink(phone);
      
      if (daysSinceActivity <= 3) {
        // Still active on free tier — they're getting value, upsell premium
        await send(phone,
          `${name} 👋 You're still tracking — love to see it.\n\n` +
          `Missing macros and coaching? Get Premium back for R36/mo:\n👉 ${monthlyLink}\n\n` +
          `_This is my last upgrade message — I won't bug you again_ ✌️`
        );
      } else {
        // Churned — try to re-engage
        await send(phone,
          `${name} 👋 It's been a while.\n\n` +
          `You tracked *${daysLogged} days* — that's more than most people manage.\n\n` +
          `Ready to go again? Just send me what you ate today.\n\n` +
          `_Free calorie tracking, always. No catch._ 🍽️`
        );
      }
      users[phone].sentDay14Winback = true;
    } catch (err) {
      console.error(`Day 14 winback failed for ${phone}:`, err.message);
    }
  }
  saveUsers(users);
}, { timezone: "Africa/Johannesburg" });

// ── Sunday 8 AM weight reminder ──
cron.schedule("0 8 * * 0", async () => {
  if (cronAlreadyRan('weight-reminder')) { console.log('[cron] Weight reminder already sent, skipping'); return; }
  markCronRan('weight-reminder');
  const users = loadUsers();
  
  for (const [phone, user] of Object.entries(users)) {
    if (!user.setup || !user.goal) continue;
    
    // Check if they've logged weight in the last 7 days
    const weights = user.weights || [];
    if (weights.length === 0) {
      // Never logged weight - send gentle nudge
      try {
        await send(phone, `⚖️ *Weekly weigh-in reminder*\n\nHaven't seen a weight log from you yet!\n\nJust send your weight like: *weight 75*\n\nIt helps track your progress and shows if you're on track 📊`);
      } catch (err) {
        console.error(`Weight reminder failed for ${phone}:`, err.message);
      }
      continue;
    }
    
    const lastWeight = weights[weights.length - 1];
    const lastWeightDate = new Date(lastWeight.date || lastWeight.time);
    const daysSinceLastWeight = Math.floor((Date.now() - lastWeightDate.getTime()) / 86400000);
    
    // If it's been more than 7 days, remind them
    if (daysSinceLastWeight >= 7) {
      try {
        const name = user.name || "Hey";
        await send(phone, `⚖️ *${name}, time for a weigh-in*\n\nIt's been ${daysSinceLastWeight} days since you last logged your weight.\n\nJump on the scale and send me the number: *weight 75*\n\nConsistent tracking = better results 💪`);
      } catch (err) {
        console.error(`Weight reminder failed for ${phone}:`, err.message);
      }
    }
  }
}, { timezone: "Africa/Johannesburg" });

// ── 1 PM nudge (every 2nd day, zero logs only) ──
cron.schedule("0 13 * * *", async () => {
  if (!ENABLE_NUDGES) { console.log('[cron] Nudge disabled'); return; }
  if (cronAlreadyRan('nudge')) { console.log('[cron] Nudge already sent today, skipping'); return; }
  markCronRan('nudge');
  const users = loadUsers();
  const today = getToday();
  let nudged = 0;

  for (const [phone, user] of Object.entries(users)) {
    if (!user.setup || !user.goal) continue;

    // Skip brand new users with no log history
    const totalEntries = Object.values(user.log || {}).reduce((s, arr) => s + arr.length, 0);
    if (totalEntries === 0) continue;

    // Skip if they've already logged today
    const todayEntries = (user.log && user.log[today]) ? user.log[today].length : 0;
    if (todayEntries > 0) continue;

    // Only send every 2nd day - check lastNudge
    if (user.lastNudge) {
      const daysSince = Math.floor((Date.now() - new Date(user.lastNudge)) / (1000 * 60 * 60 * 24));
      if (daysSince < 2) continue;
    }

    try {
      const nudges = [
        `Hey 👋 Haven't seen you log anything today yet. Still on track?`,
        `Quick check-in - nothing logged today. Even a rough estimate counts. 💪`,
        `Just a nudge - no entries yet today. Log something when you get a chance!`,
        `Hey, today's still a blank. Log what you've eaten so far and I'll keep the count. 🍽️`,
      ];
      const msg = nudges[Math.floor(Math.random() * nudges.length)];
      await send(phone, msg);

      // Update lastNudge
      users[phone].lastNudge = new Date().toISOString();
      nudged++;
    } catch (err) {
      console.error(`Nudge failed for ${phone}:`, err.message);
    }
  }

  saveUsers(users);
  console.log(`[nudge] Sent to ${nudged} users`);
}, { timezone: "Africa/Johannesburg" });

// ── 8:05 PM admin report ──
cron.schedule("5 20 * * *", async () => {
  if (cronAlreadyRan('admin_report')) { console.log('[cron] Admin report already sent today, skipping'); return; }
  markCronRan('admin_report');
  const users = loadUsers();
  const today = getToday();
  let activeUsers = 0;
  let totalEntries = 0;
  let topUser = null;

  for (const [phone, user] of Object.entries(users)) {
    const entries = (user.log && user.log[today]) ? user.log[today].length : 0;
    if (entries > 0) activeUsers++;
    totalEntries += entries;
    if (!topUser || entries > topUser.entries) topUser = { phone, entries };
  }

  const msg = `📈 *FitSorted Daily Admin*

👥 Active users today: *${activeUsers}*
🍽️ Total entries: *${totalEntries}*
🏆 Most active: *${topUser ? topUser.phone : 'n/a'}* (${topUser ? topUser.entries : 0} entries)`;
  try {
    await send(ADMIN_NUMBER, msg);
  } catch (err) {
    console.error('Admin report failed:', err.message);
  }
}, { timezone: "Africa/Johannesburg" });

// ── 3:00 AM daily: Expand simple foods from failed lookups + proactive additions ──
cron.schedule("0 3 * * *", async () => {
  if (cronAlreadyRan('expand_foods')) { console.log('[cron] Food expansion already ran today, skipping'); return; }
  markCronRan('expand_foods');
  
  console.log('[cron] Running food expansion...');
  const { exec } = require('child_process');
  exec('node /Users/brandonkatz/.openclaw/workspace/fitsorted/expand-simple-foods.js && pm2 restart fitsorted', (err, stdout, stderr) => {
    if (err) {
      console.error('[cron] Food expansion error:', err);
      return;
    }
    console.log('[cron] Food expansion complete:', stdout);
  });
}, { timezone: "Africa/Johannesburg" });

// ── Every 5 minutes: Regenerate stats for War Room ──
// Update dashboard data every 2 hours
cron.schedule("0 */2 * * *", () => {
  console.log('[cron] Updating dashboard...');
  const { exec } = require('child_process');
  exec('node /Users/brandonkatz/.openclaw/workspace/fitsorted/update-dashboard.js', (err, stdout) => {
    if (err) console.error('[cron] Dashboard update error:', err);
    else console.log('[cron] Dashboard:', stdout.trim());
  });
});

// ── Setup abandonment reminder ──
// Checks every 30 min for users who started setup but didn't finish (30+ min ago)
cron.schedule("*/30 * * * *", async () => {
  try {
    const users = loadUsers();
    const now = Date.now();
    let nudged = 0;
    
    for (const [phone, u] of Object.entries(users)) {
      if (phone.includes('backup')) continue;
      // User has a step (mid-setup) but setup not complete
      if (u.step && !u.setup && !u.setupReminderSent) {
        const created = new Date(u.created || u.joinedAt || 0).getTime();
        const timeSinceSignup = now - created;
        
        // Only nudge if 30 min - 24 hours since signup (don't nag old users)
        if (timeSinceSignup >= 30 * 60 * 1000 && timeSinceSignup <= 24 * 60 * 60 * 1000) {
          await send(phone,
            "Hey! 👋 Looks like you started setting up but didn't finish.\n\n" +
            "It only takes 30 seconds — just tap a button below to pick up where you left off.\n\n" +
            "Your free calorie tracker is waiting! 🍽️"
          );
          
          // Re-trigger the setup step they were on
          await handleSetup(phone, u, '', users);
          
          u.setupReminderSent = true;
          saveUsers(users);
          nudged++;
          console.log(`[setup-reminder] Nudged ${phone.slice(0,5)}***`);
        }
      }
      
      // Also catch users who never even started (no step, no setup, created 30+ min ago)
      if (!u.step && !u.setup && !u.goal && !u.setupReminderSent) {
        const created = new Date(u.created || u.joinedAt || 0).getTime();
        const timeSinceSignup = now - created;
        
        if (timeSinceSignup >= 30 * 60 * 1000 && timeSinceSignup <= 24 * 60 * 60 * 1000) {
          // Restart setup from scratch
          u.step = null;
          await handleSetup(phone, u, '', users);
          
          u.setupReminderSent = true;
          saveUsers(users);
          nudged++;
          console.log(`[setup-reminder] Re-started setup for ${phone.slice(0,5)}***`);
        }
      }
    }
    
    if (nudged > 0) console.log(`[setup-reminder] Nudged ${nudged} user(s)`);
  } catch(e) { console.error('[setup-reminder] Error:', e.message); }
}, { timezone: "Africa/Johannesburg" });

cron.schedule("*/5 * * * *", () => {
  console.log('[cron] Regenerating stats...');
  const { exec } = require('child_process');
  exec('node /Users/brandonkatz/.openclaw/workspace/fitsorted/generate-stats.js', (err, stdout, stderr) => {
    if (err) {
      console.error('[cron] Stats generation error:', err);
      return;
    }
    console.log('[cron] Stats updated:', stdout.trim());
  });
});

// ── Admin Dashboard Endpoints ──
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(__dirname + '/admin.html');
});

app.get('/dashboard', requireAdmin, (req, res) => {
  res.sendFile(__dirname + '/dashboard.html');
});

app.get('/api/dashboard', requireAdmin, (req, res) => {
  const users = loadUsers();
  const userData = [];
  for (const [phone, u] of Object.entries(users)) {
    if (!u.setup && !u.name) continue;
    if (phone.includes('backup')) continue;
    let totalLogs = 0;
    const foodFreq = {};
    for (const [date, entries] of Object.entries(u.log || {})) {
      if (!Array.isArray(entries)) continue;
      totalLogs += entries.length;
      for (const e of entries) {
        const key = (e.food || '').toLowerCase().slice(0, 40);
        foodFreq[key] = (foodFreq[key] || 0) + 1;
      }
    }
    const topFoods = Object.entries(foodFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([food, count]) => ({ food, count }));
    const logDates = Object.keys(u.log || {}).filter(d => Array.isArray(u.log[d]) && u.log[d].length > 0);
    const daysLogged = logDates.length;
    const lastActive = logDates.sort().pop() || 'never';
    userData.push({
      phone: phone.slice(0,5) + '***' + phone.slice(-3),
      name: u.name || 'Not set',
      goal: u.goal || '-',
      joined: u.joinedAt ? new Date(u.joinedAt).toLocaleDateString('en-ZA') : 'unknown',
      totalLogs, daysLogged, lastActive, topFoods,
      isPro: u.isPro || false,
      budget: u.profile?.foodBudget || null,
      weight: u.profile?.weight || null,
      target: u.profile?.target || null,
    });
  }
  userData.sort((a, b) => b.totalLogs - a.totalLogs);
  res.json(userData);
});

app.get('/api/stats', requireAdmin, (req, res) => {
  const users = loadUsers();
  const today = getToday();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const phones = Object.keys(users).filter(p => !p.includes('backup'));
  
  let totalUsers = 0, setupComplete = 0, proUsers = 0;
  let activeToday = 0, activeYesterday = 0, activeWeek = 0;
  let logsToday = 0, totalLogsAllTime = 0;
  let signupsToday = 0, signupsYesterday = 0, signupsThisWeek = 0;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const signupsByDay = {};
  
  for (const phone of phones) {
    const u = users[phone];
    totalUsers++;
    if (u.setup || u.goal) setupComplete++;
    if (u.isPro) proUsers++;
    
    // Signup tracking
    const created = u.created || u.joinedAt || '';
    if (created) {
      const day = created.slice(0, 10);
      signupsByDay[day] = (signupsByDay[day] || 0) + 1;
      if (day === today) signupsToday++;
      if (day === yesterday) signupsYesterday++;
      if (day >= weekAgo) signupsThisWeek++;
    }
    
    // Activity tracking
    const log = u.log || {};
    if (log[today] && Array.isArray(log[today]) && log[today].length > 0) {
      activeToday++;
      logsToday += log[today].length;
    }
    if (log[yesterday] && Array.isArray(log[yesterday]) && log[yesterday].length > 0) {
      activeYesterday++;
    }
    
    // Weekly activity
    for (const date of Object.keys(log)) {
      if (date >= weekAgo && Array.isArray(log[date]) && log[date].length > 0) {
        activeWeek++;
        break;
      }
    }
    
    // Total logs
    for (const entries of Object.values(log)) {
      if (Array.isArray(entries)) totalLogsAllTime += entries.length;
    }
  }
  
  // Recent signups list
  const recentSignups = phones
    .map(p => ({ phone: p.slice(0,5) + '***' + p.slice(-3), name: users[p].name || users[p].profile?.name || 'anon', created: users[p].created || users[p].joinedAt || '', setup: !!(users[p].setup || users[p].goal) }))
    .filter(u => u.created)
    .sort((a, b) => b.created.localeCompare(a.created))
    .slice(0, 10);
  
  // Monday Launch Monitor: signups in last hour
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const signupsLastHour = phones.filter(p => {
    const created = users[p].created || users[p].joinedAt || '';
    return created >= oneHourAgo;
  }).length;
  
  // Peak hour (hour with most signups today)
  const signupsByHour = {};
  for (const phone of phones) {
    const created = users[phone].created || users[phone].joinedAt || '';
    if (created.startsWith(today)) {
      const hour = new Date(created).getHours();
      signupsByHour[hour] = (signupsByHour[hour] || 0) + 1;
    }
  }
  const peakHourNum = Object.entries(signupsByHour).sort((a, b) => b[1] - a[1])[0]?.[0];
  const peakHour = peakHourNum !== undefined ? `${peakHourNum}:00` : '—';
  
  res.json({
    totalUsers, setupComplete, proUsers,
    activeToday, activeYesterday, activeWeek,
    logsToday, totalLogsAllTime,
    signupsToday, signupsYesterday, signupsThisWeek,
    signupsByDay,
    recentSignups,
    signupsLastHour,
    peakHour,
    timestamp: new Date().toISOString()
  });
});

// Push stats to mission-control repo every 5 minutes
const STATS_FILE = '/Users/brandonkatz/.openclaw/workspace/mission-control-static/fitsorted-stats.json';
function pushStats() {
  try {
    const users = loadUsers();
    const today = getToday();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const phones = Object.keys(users).filter(p => !p.includes('backup'));
    let totalUsers = 0, setupComplete = 0, proUsers = 0;
    let activeToday = 0, activeWeek = 0, logsToday = 0, totalLogsAllTime = 0;
    let signupsToday = 0, signupsThisWeek = 0;
    const signupsByDay = {};
    const recentSignups = [];
    
    for (const phone of phones) {
      const u = users[phone];
      totalUsers++;
      if (u.setup || u.goal) setupComplete++;
      if (u.isPro) proUsers++;
      const created = u.created || u.joinedAt || '';
      if (created) {
        const day = created.slice(0, 10);
        signupsByDay[day] = (signupsByDay[day] || 0) + 1;
        if (day === today) signupsToday++;
        if (day >= weekAgo) signupsThisWeek++;
        recentSignups.push({ phone: phone.slice(0,3) + '***' + phone.slice(-2), name: u.name || u.profile?.name || 'anon', created, setup: !!(u.setup || u.goal) });
      }
      const log = u.log || {};
      if (log[today] && Array.isArray(log[today]) && log[today].length > 0) { activeToday++; logsToday += log[today].length; }
      for (const date of Object.keys(log)) { if (date >= weekAgo && Array.isArray(log[date]) && log[date].length > 0) { activeWeek++; break; } }
      for (const entries of Object.values(log)) { if (Array.isArray(entries)) totalLogsAllTime += entries.length; }
    }
    
    recentSignups.sort((a, b) => b.created.localeCompare(a.created));
    const stats = { totalUsers, setupComplete, proUsers, activeToday, activeWeek, logsToday, totalLogsAllTime, signupsToday, signupsThisWeek, signupsByDay, recentSignups: recentSignups.slice(0, 10), updatedAt: new Date().toISOString() };
    require('fs').writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  } catch(e) { console.error('[stats push error]', e.message); }
}
pushStats();
setInterval(pushStats, 300000); // every 5 min

app.get('/admin/failed-lookups', requireAdmin, (req, res) => {
  const failed = loadFailedLookups();
  res.json(failed);
});

app.post('/admin/add-food', requireAdmin, async (req, res) => {
  const { name, calories, protein, carbs, fat } = req.body;

  if (!name || !calories) {
    return res.json({ success: false, error: 'Name and calories required' });
  }

  try {
    // Add to Supabase SA foods database (use admin client to bypass RLS)
    const { error } = await supabaseAdmin
      .from('foods')
      .insert([{
        name: name,
        name_alt: [name.toLowerCase()],
        calories: parseInt(calories),
        protein: parseInt(protein) || 0,
        carbs: parseInt(carbs) || 0,
        fat: parseInt(fat) || 0,
        serving: null,
        source: 'admin'
      }]);

    if (error) {
      console.error('Supabase insert error:', error);
      return res.json({ success: false, error: error.message });
    }

    // Remove from failed lookups
    const failed = loadFailedLookups();
    const key = name.toLowerCase().trim();
    delete failed[key];
    saveFailedLookups(failed);

    res.json({ success: true });
  } catch (err) {
    console.error('Add food error:', err);
    res.json({ success: false, error: err.message });
  }
});

app.post('/admin/dismiss-lookup', requireAdmin, (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.json({ success: false, error: 'Name required' });
  }

  try {
    const failed = loadFailedLookups();
    const key = name.toLowerCase().trim();
    delete failed[key];
    saveFailedLookups(failed);

    res.json({ success: true });
  } catch (err) {
    console.error('Dismiss error:', err);
    res.json({ success: false, error: err.message });
  }
});

// ── Step sync webhook (for Apple Health Shortcuts / external integrations) ──
// POST /api/steps { phone: "27...", steps: 8500, token: "hash" }
// Token = first 8 chars of SHA256(phone) — same as PWA token for simplicity
app.post('/api/steps', async (req, res) => {
  try {
    const body = req.body || {};
    console.log('[steps API] Received:', JSON.stringify(body));
    const phone = body.phone;
    const token = body.token;
    // Handle various formats from Apple Health Shortcuts:
    // - plain number: { steps: 8000 }
    // - string: { steps: "8000" }
    // - array of samples: { steps: [{ value: 8000 }, ...] }
    // - Health Sample object: { steps: { value: 8000 } }
    let steps = body.steps;
    if (Array.isArray(steps)) {
      // Sum all sample values
      steps = steps.reduce((sum, s) => sum + (parseFloat(s.value || s.qty || s) || 0), 0);
    } else if (typeof steps === 'object' && steps !== null) {
      steps = parseFloat(steps.value || steps.qty || steps.count || 0);
    } else {
      steps = parseFloat(steps);
    }
    if (!phone || !steps || !token) return res.status(400).json({ error: 'Missing phone, steps, or token', received: { phone: !!phone, steps: body.steps, token: !!token } });
    
    const crypto = require('crypto');
    const expectedToken = crypto.createHash('sha256').update(String(phone)).digest('hex').slice(0, 8);
    if (token !== expectedToken) return res.status(401).json({ error: 'Invalid token' });
    
    const users = loadUsers();
    const user = users[phone];
    if (!user || !user.setup) return res.status(404).json({ error: 'User not found' });
    
    const stepCount = parseInt(steps);
    if (isNaN(stepCount) || stepCount < 1 || stepCount > 200000) return res.status(400).json({ error: 'Invalid step count' });
    
    const today = getToday();
    if (!user.steps) user.steps = {};
    // For auto-sync, REPLACE today's count (not add) since Health app sends total
    user.steps[today] = { count: stepCount, logs: [{ steps: stepCount, time: new Date().toISOString(), source: 'auto' }] };
    saveUsers(users);
    
    const stepGoal = user.stepGoal || 10000;
    const hit = stepCount >= stepGoal;
    
    // Only send WhatsApp notification if they hit their goal (avoid spam)
    if (hit && !user.steps[today].notified) {
      user.steps[today].notified = true;
      saveUsers(users);
      await send(phone, `🎉 *Step goal smashed!*\n\n🚶 ${stepCount.toLocaleString()} / ${stepGoal.toLocaleString()} steps today\n\nKeep it up 💪`);
    }
    
    res.json({ ok: true, steps: stepCount, goal: stepGoal, hit });
  } catch (err) {
    console.error('[steps API] Error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/steps/setup?phone=27... — returns shortcut install instructions + token
app.get('/api/steps/setup', (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.status(400).send('Missing phone parameter');
  
  const crypto = require('crypto');
  const token = crypto.createHash('sha256').update(String(phone)).digest('hex').slice(0, 8);
  
  // The webhook URL that the iOS Shortcut will POST to
  const webhookUrl = `https://fitsorted.co.za/api/steps`;
  
  res.json({
    instructions: 'Create an iOS Shortcut with these steps: 1) Find Health Samples (Step Count, today) → 2) Get contents of URL (POST to webhook with JSON body)',
    webhookUrl,
    phone,
    token,
    body: { phone, steps: '{{steps}}', token }
  });
});

app.listen(PORT, () => console.log(`✅ FitSorted calorie tracker on port ${PORT}`));
// ══════════════════════════════════════════════
// ALCOHOL TRACKER
// ══════════════════════════════════════════════

const SA_DRINKS = {
  // Beers (per 340ml can unless noted)
  "castle lager": { cal: 150, units: 1.7, vol: 340 },
  "castle": { cal: 150, units: 1.7, vol: 340 },
  "black label": { cal: 158, units: 1.9, vol: 340 },
  "carling black label": { cal: 158, units: 1.9, vol: 340 },
  "heineken": { cal: 150, units: 1.7, vol: 330 },
  "corona": { cal: 148, units: 1.8, vol: 355 },
  "windhoek lager": { cal: 153, units: 1.7, vol: 340 },
  "windhoek draught": { cal: 144, units: 1.6, vol: 340 },
  "hansa": { cal: 143, units: 1.6, vol: 340 },
  "lion lager": { cal: 148, units: 1.7, vol: 340 },
  "amstel": { cal: 145, units: 1.7, vol: 340 },
  "sol": { cal: 130, units: 1.6, vol: 330 },
  "peroni": { cal: 142, units: 1.7, vol: 330 },
  "stella artois": { cal: 154, units: 1.8, vol: 330 },

  // Ciders & RTDs
  "savanna": { cal: 174, units: 2.0, vol: 330 },
  "savanna dry": { cal: 174, units: 2.0, vol: 330 },
  "hunters dry": { cal: 186, units: 2.1, vol: 330 },
  "hunters gold": { cal: 193, units: 2.0, vol: 330 },
  "brutal fruit": { cal: 200, units: 1.9, vol: 275 },
  "bernini": { cal: 175, units: 1.8, vol: 275 },
  "flying fish": { cal: 168, units: 2.0, vol: 330 },
  "jack daniel": { cal: 228, units: 2.2, vol: 275 },
  "jack and coke": { cal: 228, units: 2.2, vol: 275 },

  // Spirits (per 25ml shot)
  "tequila": { cal: 65, units: 1.0, vol: 25 },
  "tequila shot": { cal: 65, units: 1.0, vol: 25 },
  "vodka": { cal: 55, units: 1.0, vol: 25 },
  "vodka shot": { cal: 55, units: 1.0, vol: 25 },
  "whisky": { cal: 65, units: 1.0, vol: 25 },
  "whiskey": { cal: 65, units: 1.0, vol: 25 },
  "rum": { cal: 65, units: 1.0, vol: 25 },
  "gin": { cal: 55, units: 1.0, vol: 25 },
  "brandy": { cal: 65, units: 1.0, vol: 25 },
  "amarula": { cal: 114, units: 0.8, vol: 25 },
  "jagermeister": { cal: 77, units: 1.1, vol: 25 },
  "jager": { cal: 77, units: 1.1, vol: 25 },

  // Wine (per 150ml glass)
  "red wine": { cal: 125, units: 1.8, vol: 150 },
  "white wine": { cal: 121, units: 1.8, vol: 150 },
  "rose wine": { cal: 121, units: 1.8, vol: 150 },
  "rosé": { cal: 121, units: 1.8, vol: 150 },
  "wine": { cal: 123, units: 1.8, vol: 150 },
  "champagne": { cal: 90, units: 1.5, vol: 120 },
  "prosecco": { cal: 90, units: 1.5, vol: 120 },

  // Cocktails
  "cocktail": { cal: 250, units: 1.8, vol: 200 },
  "mojito": { cal: 217, units: 1.7, vol: 240 },
  "margarita": { cal: 274, units: 2.0, vol: 200 },
  "martini": { cal: 120, units: 1.6, vol: 150 },
  "dry martini": { cal: 120, units: 1.6, vol: 150 },
  "pina colada": { cal: 245, units: 1.5, vol: 200 },
  "long island": { cal: 275, units: 3.5, vol: 300 },
  "gin and tonic": { cal: 120, units: 1.3, vol: 200 },
  "g&t": { cal: 120, units: 1.3, vol: 200 },
};

function getDrunkOMeter(totalUnits) {
  if (totalUnits === 0) return null;
  if (totalUnits < 1)  return { label: "Barely touched it 😇", bar: "▓░░░░░░░░░", pct: 10, color: "green" };
  if (totalUnits <= 2) return { label: "Warm 🌡️", bar: "▓▓▓░░░░░░░", pct: 25, color: "green" };
  if (totalUnits <= 3) return { label: "Tipsy 🥴", bar: "▓▓▓▓▓░░░░░", pct: 45, color: "yellow" };
  if (totalUnits <= 5) return { label: "Drunk 🍻", bar: "▓▓▓▓▓▓▓░░░", pct: 65, color: "orange" };
  if (totalUnits <= 7) return { label: "Very Drunk 😵", bar: "▓▓▓▓▓▓▓▓▓░", pct: 85, color: "red" };
  if (totalUnits <= 10) return { label: "Hammered 🤯", bar: "▓▓▓▓▓▓▓▓▓▓", pct: 100, color: "red" };
  return { label: "Send help 🚑", bar: "▓▓▓▓▓▓▓▓▓▓", pct: 100, color: "red" };
}

// SA legal BAC limit is 0.05g/100ml (stricter than UK/US)
// Roughly: ~2.5 units for avg male (80kg), ~2 units for avg female (65kg)
function isOverLimit(totalUnits, gender) {
  const limit = gender === "female" ? 2.0 : 2.5;
  return totalUnits > limit;
}

// Hours to sober up — body processes ~1 unit/hour
function hoursToSober(totalUnits) {
  if (totalUnits <= 0) return 0;
  return Math.ceil(totalUnits);
}

function getStopDrinkingNudge(totalUnits, gender) {
  const overLimit = isOverLimit(totalUnits, gender);
  if (totalUnits === 0) return null;
  if (totalUnits <= 2) return `💚 Still in the safe zone. Keep it here and you'll thank yourself tomorrow.`;
  if (totalUnits <= 3) return `💛 You're feeling it. This is a good place to switch to water — you'll still have fun and wake up fine.`;
  if (totalUnits <= 5) return `🟠 Your judgment is impaired right now. No more driving. Consider switching to water — sleep quality drops significantly after this point.`;
  if (overLimit) return `🔴 You have had a lot. Slow down, drink water, eat something, and avoid driving. If you need to get home, take an Uber.`;
  return `🔴 This is doing real damage. Your liver is working overtime, your sleep will be wrecked, and tomorrow will be rough. Stop now and drink water.`;
}

function buildDrunkOMeterMessage(totalUnits, totalCal, gender, drinks) {
  const meter = getDrunkOMeter(totalUnits);
  const overLimit = isOverLimit(totalUnits, gender);
  const hours = hoursToSober(totalUnits);
  const nudge = getStopDrinkingNudge(totalUnits, gender);
  const breadSlices = Math.round(totalCal / 80);
  const drinkList = drinks.map(e => `  • ${e.food} — ${(e.units||0).toFixed(1)} units`).join("\n");

  let msg = `🍺 *Drunk-o-Meter*\n`;
  msg += `━━━━━━━━━━━━━━━\n`;
  if (meter) msg += `${meter.bar} ${meter.label}\n`;
  msg += `━━━━━━━━━━━━━━━\n\n`;
  msg += `📊 *${totalUnits.toFixed(1)} units tonight*\n`;
  msg += `${drinkList}\n\n`;
  msg += `🔥 *${totalCal} liquid calories* _(${breadSlices} slices of bread)_\n`;
  
  // Exercise equivalent — makes calories tangible
  const runMinutes = Math.round(totalCal / 10); // ~10 cal/min running
  if (totalCal > 100) {
    msg += `🏃 That's *${runMinutes} min of running* to burn off\n`;
  }
  
  msg += `⏱️ *Sober by:* ~${hours} hour${hours !== 1 ? "s" : ""} from now\n\n`;

  // NOTE: We no longer state legal limit status explicitly

  // Drink swap suggestion — show a lower-cal alternative
  if (totalCal > 200) {
    const swaps = {
      "wine": { swap: "gin & soda water", savePer: 70 },
      "red wine": { swap: "gin & soda water", savePer: 70 },
      "white wine": { swap: "vodka & soda", savePer: 65 },
      "rosé": { swap: "vodka & soda", savePer: 65 },
      "beer": { swap: "light beer", savePer: 50 },
      "castle": { swap: "Castle Lite", savePer: 45 },
      "castle lager": { swap: "Castle Lite", savePer: 45 },
      "black label": { swap: "Castle Lite", savePer: 53 },
      "cocktail": { swap: "gin & soda with lime", savePer: 130 },
      "mojito": { swap: "vodka soda with mint", savePer: 160 },
      "margarita": { swap: "tequila soda with lime", savePer: 200 },
      "pina colada": { swap: "vodka soda with lime", savePer: 190 },
      "long island": { swap: "gin & tonic", savePer: 155 },
      "savanna": { swap: "vodka soda", savePer: 120 },
      "hunters dry": { swap: "vodka soda", savePer: 130 },
      "brutal fruit": { swap: "vodka soda with fruit", savePer: 145 },
      "cider": { swap: "vodka soda", savePer: 120 },
    };
    
    // Find the highest-cal drink the user logged and suggest a swap
    const highestCalDrink = drinks.reduce((best, d) => (!best || d.calories > best.calories) ? d : best, null);
    if (highestCalDrink) {
      const drinkLower = highestCalDrink.food.toLowerCase();
      const swapEntry = Object.entries(swaps).find(([k]) => drinkLower.includes(k));
      if (swapEntry) {
        const [, { swap, savePer }] = swapEntry;
        const drinkCount = drinks.filter(d => d.food.toLowerCase().includes(swapEntry[0])).length;
        const totalSaved = savePer * drinkCount;
        if (totalSaved >= 50) {
          msg += `\n💡 *Swap tip:* Switch ${highestCalDrink.food} → ${swap} and save ~${totalSaved} cal next time\n`;
        }
      }
    }
  }

  // Removed nudge lines per request

  msg += `\n⚠️ *Rough estimate only.* Can be off by 20–40% based on drink size, timing, and body size. Don’t use this to decide if you can drive.`;
  return msg;
}

function detectAlcohol(text) {
  const lower = text.toLowerCase();
  for (const [drink, data] of Object.entries(SA_DRINKS)) {
    if (lower.includes(drink)) return { drink, ...data };
  }
  return null;
}

function getTodayAlcohol(user) {
  const today = getToday();
  const entries = user.log[today] || [];
  return entries.filter(e => e.isAlcohol);
}
