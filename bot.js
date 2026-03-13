require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const cron = require("node-cron");
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "fitsorted123";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const PORT = process.env.PORT || 3001;
const USERS_FILE = "./users.json";
const REFERRALS_FILE = "./referrals.json";
const FAILED_LOOKUPS_FILE = "./failed-lookups.json";
const ADMIN_NUMBER = "27837787970"; // Brandon's number
const PRO_LAUNCH = true; // PayFast live

// Beta feature flags - only enabled for specific numbers
const BETA_FEATURES = {
  priceEstimates: new Set(["27837787970"]), // Brandon only
};
const PRO_PRICE = process.env.PRO_PRICE || "18";
const PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID || "10803069";
const PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY || "heptrxgjismzp";
const ITN_URL = "https://fuddzrlnbrseofguuikp.supabase.co/functions/v1/payfast-itn";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "re_bDTutSXR_G4Q84ays1Noi7JqwuEGoS2tM";

// Promo codes — { CODE: discountPercent } (use 100 for free/founder access)
// Promo codes — { CODE: discountPercent }
// At R18 base, EARLYBIRD no longer needed but kept for existing users
const PROMO_CODES = {
  SPRING: 10,
  LAUNCH: 20,
  FITFAM: 15,
  EARLYBIRD: 0,   // R18 is already the launch price
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

// Check if user is within 30-day free trial
function isInTrial(userObj) {
  if (!userObj.joinedAt) return true; // Backfill: assume in trial if no join date
  const joinedAt = new Date(userObj.joinedAt);
  const daysSinceJoin = (Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceJoin < 30;
}

// Check if user has access (trial OR referral free months OR paid)
async function hasAccess(phone, userObj) {
  if (isInTrial(userObj)) return true;
  // Check referral free months (each month = 30 days from end of trial)
  if (userObj.referralFreeMonths && userObj.referralFreeMonths > 0 && userObj.joinedAt) {
    const trialEnd = new Date(userObj.joinedAt).getTime() + (30 * 24 * 60 * 60 * 1000);
    const freeUntil = trialEnd + (userObj.referralFreeMonths * 30 * 24 * 60 * 60 * 1000);
    if (Date.now() < freeUntil) return true;
  }
  return await isPremium(phone);
}

// Get billing date 30 days from now (YYYY-MM-DD)
function getTrialEndDate() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split("T")[0];
}

// Apply discount to a price
function applyDiscount(price, discountPct) {
  if (!discountPct) return price.toFixed(2);
  return (price * (1 - discountPct / 100)).toFixed(2);
}

// Generate PayFast monthly subscription link (30-day free trial)
function getPayFastMonthlyLink(phone, discountPct = 0) {
  const monthly = parseFloat(applyDiscount(18, discountPct));
  const params = new URLSearchParams({
    merchant_id: PAYFAST_MERCHANT_ID,
    merchant_key: PAYFAST_MERCHANT_KEY,
    return_url: RETURN_URL,
    cancel_url: CANCEL_URL,
    notify_url: ITN_URL,
    name_first: "FitSorted",
    name_last: "User",
    m_payment_id: `fs_m_${phone}_${Date.now()}`,
    amount: "0.00",
    recurring_amount: monthly.toFixed(2),
    item_name: discountPct ? `FitSorted Premium Monthly (${discountPct}% off)` : "FitSorted Premium Monthly",
    subscription_type: "1",
    billing_date: getTrialEndDate(),
    frequency: "3",
    cycles: "0",
    custom_str1: phone,
    custom_str2: "monthly",
  });
  return `https://www.payfast.co.za/eng/process?${params.toString()}`;
}

// Generate PayFast annual subscription link (30-day free trial)
function getPayFastAnnualLink(phone, discountPct = 0) {
  const annual = parseFloat(applyDiscount(100, discountPct)); // R18 x 12 = R216, discounted to R100/yr
  const params = new URLSearchParams({
    merchant_id: PAYFAST_MERCHANT_ID,
    merchant_key: PAYFAST_MERCHANT_KEY,
    return_url: RETURN_URL,
    cancel_url: CANCEL_URL,
    notify_url: ITN_URL,
    name_first: "FitSorted",
    name_last: "User",
    m_payment_id: `fs_a_${phone}_${Date.now()}`,
    amount: "0.00",
    recurring_amount: annual.toFixed(2),
    item_name: discountPct ? `FitSorted Premium Annual (50% off + ${discountPct}% promo)` : "FitSorted Premium Annual (50% off)",
    subscription_type: "1",
    billing_date: getTrialEndDate(),
    frequency: "5",
    cycles: "0",
    custom_str1: phone,
    custom_str2: "annual",
  });
  return `https://www.payfast.co.za/eng/process?${params.toString()}`;
}

// Legacy single-payment link (kept for manual use)
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
    users[phone] = {
      setup: false,
      step: null,
      profile: {},
      goal: null,
      log: {},
      joinedAt: new Date().toISOString(),  // Track when they joined
      isPro: false,
      proPrompted: false
    };
  }
  if (!users[phone].log) users[phone].log = {};
  // Backfill joinedAt for existing users
  if (!users[phone].joinedAt) users[phone].joinedAt = new Date().toISOString();
  if (typeof users[phone].isPro !== 'boolean') users[phone].isPro = false;
  if (typeof users[phone].proPrompted !== 'boolean') users[phone].proPrompted = false;
  return users[phone];
}

function getToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
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

  const res = await axios.post(
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
  );
  const content = res.data.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
  return JSON.parse(content);
}

// ── Calorie lookup from Supabase SA Foods database (414 items) ──
async function lookupSAFood(food) {
  const lower = food.toLowerCase();

  try {
    // Query Supabase for matching foods
    const { data, error } = await supabase
      .from('foods')
      .select('*')
      .or(`name.ilike.%${lower}%,name_alt.cs.{${lower}}`);

    if (error) {
      console.error('Supabase lookup error:', error.message);
      return null;
    }

    if (!data || data.length === 0) return null;

    // Find best match by checking name_alt keywords
    for (const item of data) {
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
  if (!user.customFoods) return null;
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
  };
  const zeroDrinkKey = Object.keys(zeroDrinks).find(k => lower === k || lower.includes(k));
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
    "protein shake": 150,
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
    "whey shake": 150,
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
  const restaurantNames = ['nando', 'steers', 'kfc', 'kauai', 'woolworths', 'woolies', 'spur', 'mcdonalds', 'mcdonald', 'burger king', 'wimpy', 'ocean basket', 'debonairs', 'roman', 'chicken licken', 'fishaways', 'pedros', 'col\'cacchio', 'mugg', 'vida', 'starbucks'];
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
  const saMatch = await lookupSAFood(food);
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

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {\"food\": \"clean name including quantity\", \"calories\": integer, \"protein\": integer, \"carbs\": integer, \"fat\": integer, \"fibre\": integer, \"estimatedPriceZAR\": integer_or_null}. All macros in grams. fibre = dietary fibre in grams. estimatedPriceZAR is the approximate cost in South African Rands at a restaurant/store (null if homemade or unknown). Use 2025/2026 SA prices. Examples: Nando's quarter chicken ~R75, Steers Wacky Wednesday burger ~R50, Kauai smoothie ~R65, Woolworths ready meal ~R60. CRITICAL RULES: 1) ONLY estimate what was explicitly mentioned - do NOT add extra foods. If user says 'scrambled', return 'scrambled eggs' ONLY - do not add toast, bacon, or other items unless specifically mentioned. If user says 'toast', return toast only - do not add eggs. 2) If the description mentions a quantity (e.g. 'two', 'three', '2x', '3 slices'), multiply the calories AND macros accordingly and include the quantity in the food name. Example: 'two toasted cheese sandwiches' → {\"food\": \"2x toasted cheese sandwich\", \"calories\": 800, \"protein\": 30, \"carbs\": 80, \"fat\": 35, \"fibre\": 4, \"estimatedPriceZAR\": null}. 3) If no quantity mentioned, assume a standard single serving (e.g. 'scrambled' = 2 scrambled eggs, 'toast' = 2 slices). 4) Use realistic everyday South African portion sizes - not restaurant or oversized portions. 5) Drinks must use FULL SERVING sizes: beer=440ml (~155 cal), Red Bull=250ml (~112 cal), Monster=500ml (~230 cal), wine glass=175ml (~125 cal), cider=330ml (~170 cal). NEVER use per-100ml values. 6) SA portions: 1 slice cheese=~60 cal (thin processed like Clover), 1 slice bread=~80 cal, 1 egg=~70 cal, biltong 50g=~125 cal, droewors 50g=~150 cal, handful of nuts=~160 cal (28g). 7) Bunny chow quarter=~650 cal (bread bowl + curry). No extra text." },
        { role: "user", content: `Nutrition for: ${food}` }
      ],
      temperature: 0.2
    },
    { 
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      timeout: 10000 // 10 second timeout to prevent hanging
    }
  );

  const content = res.data.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
  return JSON.parse(content);
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
        { role: 'system', content: 'You are a nutrition assistant. Identify the food item in the image. Return a short, specific name (brand + item if visible). If unclear, return a generic guess like "protein bar".' },
        { role: 'user', content: [
          { type: 'text', text: 'What food is this? Reply with just the food name.' },
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

async function maybeFirstLogMenu(from, user) {
  if (user.sentMenuCard) return;
  const totalEntries = Object.values(user.log || {}).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
  if (totalEntries === 1) {
    user.sentMenuCard = true;
    saveUsers(loadUsers());
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
}

async function maybePromptPro(from, user) {
  if (!PRO_LAUNCH) return;
  if (user.proPrompted) return;
  // Don't prompt if already premium or in trial
  const premium = await isPremium(from);
  if (premium || isInTrial(user)) return;
  const loggedDays = Object.values(user.log || {}).filter(arr => Array.isArray(arr) && arr.length > 0).length;
  if (loggedDays >= 3) {
    user.proPrompted = true;
    saveUsers(loadUsers());
    const monthlyLink = getPayFastMonthlyLink(from);
    const annualLink = getPayFastAnnualLink(from);
    await send(from,
      `You've logged 3 days in a row ✅\n\n` +
      `Subscribe to keep going:\n\n` +
      `📅 *Monthly — R18/mo*\n👉 ${monthlyLink}\n\n` +
      `🏆 *Annual — R100/year* _(save R116)_\n👉 ${annualLink}`
    );
  }
}

async function sendButtons(to, body, buttons) {
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
}

// ── Setup flow ──
async function handleSetup(from, user, msg, users) {
  if (!users) users = loadUsers(); // fallback if not passed
  const step = user.step;

  if (!step || step === "gender") {
    user.step = "awaiting_gender";
    await sendButtons(from,
      "Howzit! 👋 Welcome to *FitSorted* — your calorie tracker on WhatsApp.\n\n✅ *Free forever* — calorie tracking with no limits\n💎 *30-day Premium bonus* — unlock all features\n\nNo app. No login. Just chat like you're messaging a mate.\n\n🍗 Log any food — I'll figure out the calories (yes, even pap and vleis)\n📸 Snap a photo of your plate — I'll ID it\n🥩 Track macros (protein, carbs, fat)\n🏃 Log your gym session or run\n🍺 Built-in drunk-o-meter\n🧠 Ask me anything — meal ideas, what to eat under 400 cal\n\nLet's get you set up — takes 30 seconds 👇\n\nWhat's your biological sex?",
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

    await send(from, `Nice one, ${name}! 👋\n\nWhat's your email?\n\nI'll send you daily food logs and weekly reports.\n\n_(Type *skip* if you'd rather not)_`);
    return;
  }

  if (step === "email") {
    const emailText = msg.trim().toLowerCase();
    
    if (emailText === "skip" || emailText === "no") {
      // Skip email, go to budget
      user.step = "budget";
      saveUsers(users);
      
      try {
        await sendButtons(from,
          `No worries! Last thing — want to set a daily food budget?\n\nI'll track what you spend on food alongside your calories. You'll see exactly where your money goes.`,
          [
            { id: "setup:budget_100", title: "R100/day" },
            { id: "setup:budget_150", title: "R150/day" },
            { id: "setup:budget_200", title: "R200/day" },
            { id: "setup:budget_skip", title: "Skip for now" },
          ]
        );
      } catch {
        await send(from, `No worries! Last thing — want to set a daily food budget?\n\nI'll track what you spend alongside your calories.\n\nReply with an amount (e.g. *R150*) or *skip*`);
      }
      return;
    }
    
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
    user.step = null;
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
      `Let's log your first meal right now 👇\n\n` +
      `Just type what you've eaten today, like:\n` +
      `_"2 eggs on toast"_\n` +
      `_"coffee with milk"_\n` +
      `_"woolworths chicken wrap"_\n\n` +
      `Or snap a photo of your plate 📸\n\n` +
      `Go — what did you have for breakfast?`
    );

    // Menu card now sent after first food log (see maybeFirstLogMenu below)
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
        const monthlyLink = getPayFastMonthlyLink(from);
        const annualLink = getPayFastAnnualLink(from);
        await send(from,
          `📸 Your 30-day free trial has ended.\n\n` +
          `Subscribe to keep using FitSorted:\n\n` +
          `📅 *Monthly — R18/mo*\n👉 ${monthlyLink}\n\n` +
          `🏆 *Annual — R100/year* _(save R116)_\n👉 ${annualLink}`
        );
        return;
      }
      const guess = await guessFoodFromImage(imageId);
      if (guess) {
        user.pendingFood = { text: guess, source: "image_guess", time: new Date().toISOString() };
        saveUsers(users);
        try {
          await sendButtons(from, `I think this is:\n*${guess}*\n\nLog it?`, [
            { id: "confirm_log", title: "Log it" },
            { id: "cancel_log", title: "Wrong" }
          ]);
        } catch {
          await send(from, `I think this is:\n*${guess}*\n\nReply *log it* to confirm, or *wrong* to cancel.`);
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
          await send(from, `✅ *${result.food}* - ${result.calories} cal\n\n📊 Today: *${total} / ${effectiveGoal} cal*\n${deficitMessage(total, effectiveGoal)}`);
        }
        await maybeFirstLogMenu(from, user);
        await maybePromptPro(from, user);
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

    const recipients = Object.entries(users).filter(([phone, u]) => u.setup && u.goal && phone !== ADMIN_NUMBER);
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
    const fs = require('fs');
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
    { patterns: [/how much do i weigh/i, /my weight/i, /weight (trend|history|progress|graph)/i, /show.*weight/i, /weigh-?ins?/i, /track.*weight/i], redirect: "weight history" },
    // Undo
    { patterns: [/that('?s| was| is) wrong/i, /take (that|it) back/i, /made a mistake/i, /remove (the )?last/i, /wrong (one|entry|food|item)/i, /didn'?t (eat|have|mean) that/i, /oops/i, /scratch that/i, /cancel (that|last)/i], redirect: "undo" },
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
        `💎 *R${PRO_PRICE}/mo* — 30 days free\n` +
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
    const remaining = user.goal - (user.todayCals || 0);
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
        const price = isAnnual ? "R100/year" : "R18/mo";
        user.promoCode = "EARLYBIRD";
        user.promoDiscount = 39;
        saveUsers(users);
        await send(from,
          `🎉 Great choice! Here's your early bird link:\n\n` +
          `👉 ${link}\n\n` +
          `30 days free, then ${price}. Your card is stored securely by PayFast — cancel anytime.\n\n` +
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
  if (user.step && ["weight", "height", "age", "name", "email", "email_late", "budget"].includes(user.step)) {
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

  // Log view
  // Weekly stats / progress dashboard
  if (["stats", "progress", "weekly", "week", "analytics", "dashboard"].includes(msgLower)) {
    const statsMsg = buildWeeklyStats(user);
    await send(from, statsMsg);
    return;
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
      premiumCTA = `\n\n💎 Want macros + coaching? Upgrade for R18/mo — type *upgrade*`;
      users[from].seenPremiumCTA = true;
      saveUsers(users);
    }

    await send(from, `📋 *Today's log:*\n${list}${exerciseStr}\n\n🔢 *${total} / ${effectiveGoal} cal*${macroStr}${premiumCTA}\n${deficitMessage(total, effectiveGoal)}`);
        await maybeFirstLogMenu(from, user);
        await maybePromptPro(from, user);
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
        `💎 *R${PRO_PRICE}/mo* — 30 days free\n` +
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
        `💎 *R${PRO_PRICE}/mo* — 30 days free\n` +
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

  if (/^(undo|undo that|oops|take that back|remove last|undo last|cancel last|delete last|wrong|that was wrong|made a mistake|undo last entry)$/i.test(msgLower)) {
    const today = getToday();
    const entries = user.log[today] || [];
    if (!entries.length) { await send(from, "Nothing to undo."); return; }
    const removed = entries.pop();
    user.log[today] = entries;
    saveUsers(users);
    const total = getTodayTotal(user);
    await send(from, `↩️ Removed: *${removed.food}* (${removed.calories} cal)\n\n${deficitMessage(total, user.goal)}`);
    return;
  }

  // ── Feedback / bug reports - saved to workspace for Milan ──
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
      const daysLeft = Math.ceil(30 - ((Date.now() - new Date(user.joinedAt).getTime()) / (1000 * 60 * 60 * 24)));
      await send(from, `✅ *FitSorted Premium* — Free 30-day bonus\n\n${daysLeft} days left of all features.\n\nAfter that, calorie tracking stays free forever.\n\nUpgrade for R18/mo to keep Premium features — type *upgrade*`);
    } else {
      await send(from, `✅ *FitSorted* — Free forever\n\nYou can track calories for life, no limits.\n\nUpgrade to Premium for R18/mo to unlock:\n🥩 Macro tracking\n🧠 Coaching mode\n📧 Email exports\n💰 Budget tracking\n\nType *upgrade* to subscribe.`);
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
        await send(from, `⏰ Sorry, the *${code}* early bird offer expired ${PROMO_EXPIRY_DAYS[code]} days after signup. The standard price is R18/mo.\n\nType *upgrade* to subscribe.`);
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
    const monthlyPrice = applyDiscount(18, discount);
    const annualPrice = applyDiscount(280, discount);
    const monthlyLink = getPayFastMonthlyLink(from, discount);
    const annualLink = getPayFastAnnualLink(from, discount);
    await send(from,
      `🎉 Code *${code}* applied — *${discount}% off*!\n\n` +
      `Free forever + 30-day Premium bonus, then:\n\n` +
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
    const monthlyPrice = applyDiscount(18, discount);
    const annualPrice = applyDiscount(280, discount);
    const monthlyLink = getPayFastMonthlyLink(from, discount);
    const annualLink = getPayFastAnnualLink(from, discount);
    const promoLine = promoCode ? `🎉 Code *${promoCode}* applied (${discount}% off)\n\n` : "";
    await send(from,
      `*FitSorted Premium* 🚀\n\n` +
      promoLine +
      `✅ Calorie tracking is free forever\n\n` +
      `Get 30 days of Premium features free, then just R18/mo:\n\n` +
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
        `💎 *R${PRO_PRICE}/mo* — 30 days free\n` +
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
      `Your first 30 days of Premium features have ended. Upgrade for just *R18/mo* to unlock:\n\n` +
      `• 🥩 Macro tracking (protein, carbs, fat)\n` +
      `• 🧠 Coaching mode (meal suggestions, Q&A)\n` +
      `• 📧 Email exports\n` +
      `• 💰 Food budget tracking\n\n` +
      `📅 *Monthly — R18/mo*\n👉 ${monthlyLink}\n\n` +
      `🏆 *Annual — R100/year* _(save R116)_\n👉 ${annualLink}`
    );
    users[from].shownFreeForeverMessage = true;
    saveUsers(users);
    // DON'T return - let them continue logging
  }

  // Food log (with optional date prefix: "yesterday: chicken stir fry")
  // Guard: skip non-food inputs (menu commands, bot artifacts, system strings)
  const junkPatterns = /^(menu:|confirm_log|button_|clean name|unnamed food|test$|\.{1,3}$)/i;
  if (junkPatterns.test(msgLower)) {
    console.log(`[guard] Skipped junk input as food: "${msg}"`);
    return;
  }

  try {
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
      
      for (const item of foodItems) {
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
      await maybeFirstLogMenu(from, user);
        await maybePromptPro(from, user);
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
    const legitimateZeroCalFoods = ['water', 'h2o', 'sparkling', 'soda water', 'mineral water', 'ice', 'tea', 'coffee'];
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
        await send(from, `✅ *${result.food}* - ${result.calories} cal${sourceTag}${itemMacros}${priceTag}\n\n📊 Today: *${total} / ${effectiveGoal} cal*${macroProgress}\n${deficitMessage(total, effectiveGoal)}`);
      }
      await maybeFirstLogMenu(from, user);
        await maybePromptPro(from, user);
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
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
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

// ── 6:30 AM morning check-in ──
cron.schedule("30 6 * * *", async () => {
  if (cronAlreadyRan('morning')) { console.log('[cron] Morning already sent today, skipping'); return; }
  markCronRan('morning');
  const users = loadUsers();
  for (const [phone, user] of Object.entries(users)) {
    if (!user.setup || !user.goal) continue;
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
}, { timezone: "Africa/Johannesburg" });

// ── 8 PM daily summary ──
cron.schedule("0 20 * * *", async () => {
  if (cronAlreadyRan('evening')) { console.log('[cron] Evening summary already sent today, skipping'); return; }
  markCronRan('evening');
  const users = loadUsers();
  for (const [phone, user] of Object.entries(users)) {
    if (!user.setup || !user.goal) continue;
    try {
      const total = getTodayTotal(user);
      if (total === 0) continue;
      const todayMacros = getTodayMacros(user);
      const macroTargets = getMacroTargets(user);
      const eveningHasAccess = await hasAccess(phone, user);

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

      await send(phone, `📊 *Daily Summary*\n${total} / ${user.goal} cal${macroStr}${spendStr}\n${deficitMessage(total, user.goal)}`);

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
      }
    } catch (err) {
      console.error(`Summary failed for ${phone}:`, err.message);
    }
  }
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

// ── 11 AM Day 7 re-engagement ──
cron.schedule("0 11 * * *", async () => {
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
app.get('/admin', (req, res) => {
  res.sendFile(__dirname + '/admin.html');
});

app.get('/dashboard', (req, res) => {
  res.sendFile(__dirname + '/dashboard.html');
});

app.get('/api/dashboard', (req, res) => {
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

app.get('/api/stats', (req, res) => {
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
  
  res.json({
    totalUsers, setupComplete, proUsers,
    activeToday, activeYesterday, activeWeek,
    logsToday, totalLogsAllTime,
    signupsToday, signupsYesterday, signupsThisWeek,
    signupsByDay,
    recentSignups,
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

app.get('/admin/failed-lookups', (req, res) => {
  const failed = loadFailedLookups();
  res.json(failed);
});

app.post('/admin/add-food', async (req, res) => {
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

app.post('/admin/dismiss-lookup', (req, res) => {
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
