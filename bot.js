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
const PRO_PRICE = process.env.PRO_PRICE || "59";
const PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID || "10803069";
const PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY || "heptrxgjismzp";
const ITN_URL = "https://fuddzrlnbrseofguuikp.supabase.co/functions/v1/payfast-itn";

// Promo codes — { CODE: discountPercent } (use 100 for free/founder access)
// EARLYBIRD: R59 → R36 = ~39% off, only valid within 14 days of signup
const PROMO_CODES = {
  SPRING: 10,
  LAUNCH: 20,
  FITFAM: 15,
  EARLYBIRD: 39,
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

// Check if user is within 7-day free trial
function isInTrial(userObj) {
  if (!userObj.joinedAt) return true; // Backfill: assume in trial if no join date
  const joinedAt = new Date(userObj.joinedAt);
  const daysSinceJoin = (Date.now() - joinedAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceJoin < 7;
}

// Check if user has access (trial OR paid)
async function hasAccess(phone, userObj) {
  if (isInTrial(userObj)) return true;
  return await isPremium(phone);
}

// Get billing date 7 days from now (YYYY-MM-DD)
function getTrialEndDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}

// Apply discount to a price
function applyDiscount(price, discountPct) {
  if (!discountPct) return price.toFixed(2);
  return (price * (1 - discountPct / 100)).toFixed(2);
}

// Generate PayFast monthly subscription link (7-day free trial)
function getPayFastMonthlyLink(phone, discountPct = 0) {
  const monthly = parseFloat(applyDiscount(59, discountPct));
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

// Generate PayFast annual subscription link (7-day free trial)
function getPayFastAnnualLink(phone, discountPct = 0) {
  const annual = parseFloat(applyDiscount(280, discountPct));
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
    if (!referrer.referralCredits) referrer.referralCredits = 0;
    referrer.referralCredits += 10;
    
    if (!referrer.referrals) referrer.referrals = [];
    referrer.referrals.push({
      phone: newUserPhone,
      date: new Date().toISOString(),
      credited: 10
    });
  }
  
  if (newUser) {
    if (!newUser.referralCredits) newUser.referralCredits = 0;
    newUser.referralCredits += 10;
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
    fat: entries.reduce((sum, e) => sum + (e.fat || 0), 0)
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

  return { protein: proteinTarget, carbs: carbTarget, fat: fatTarget };
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
const WORKOUT_KEYWORDS = ["run", "ran", "walk", "walked", "gym", "weights", "cycling", "bike", "swim", "hiit", "cardio", "workout", "training", "min ", "minutes", "km", "steps", "pushups", "pull-ups", "squats", "jog", "jogged", "skipped", "rope", "crossfit"];

function isWorkout(text) {
  return WORKOUT_KEYWORDS.some(k => text.toLowerCase().includes(k));
}

async function estimateCaloriesBurned(activity) {
  if (!OPENAI_API_KEY) {
    // Simple fallback
    if (activity.includes("run") || activity.includes("jog")) return { activity, calories: 300 };
    if (activity.includes("walk")) return { activity, calories: 150 };
    if (activity.includes("gym") || activity.includes("weights")) return { activity, calories: 250 };
    if (activity.includes("hiit") || activity.includes("cardio")) return { activity, calories: 350 };
    return { activity, calories: 200 };
  }

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a fitness assistant. Given a workout description, return ONLY a JSON object: {\"activity\": \"clean name\", \"calories\": integer} for estimated calories burned. No extra text." },
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
          fat: item.fat || 0
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
    return { food: "Water", calories: 0, protein: 0, carbs: 0, fat: 0 };
  }

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
  
  const key = Object.keys(simple).find(k => food.toLowerCase().includes(k));
  if (key) {
    const quantity = extractQuantity(lower);
    const baseCal = simple[key];
    const totalCal = baseCal * quantity;
    const displayName = quantity > 1 ? `${quantity}x ${key}` : key;
    return { food: displayName, calories: totalCal, protein: 0, carbs: 0, fat: 0 };
  }

  // 3. Check user's custom foods
  if (user) {
    const custom = lookupCustomFood(user, food);
    if (custom) return { ...custom, source: "custom" };
  }

  // 4. Check SA database (491 SA foods from Supabase)
  const saMatch = await lookupSAFood(food);
  if (saMatch) return saMatch;

  // 5. Fall back to OpenAI if all lookups fail
  if (!OPENAI_API_KEY) {
    return { food, calories: 200 };
  }

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {\"food\": \"clean name including quantity\", \"calories\": integer, \"protein\": integer, \"carbs\": integer, \"fat\": integer}. All macros in grams. IMPORTANT: If the description mentions a quantity (e.g. 'two', 'three', '2x', '3 slices'), multiply the calories AND macros accordingly and include the quantity in the food name. Example: 'two toasted cheese sandwiches' → {\"food\": \"2x toasted cheese sandwich\", \"calories\": 800, \"protein\": 30, \"carbs\": 80, \"fat\": 35}. Return total values for the full described amount. Use realistic everyday South African portion sizes - not restaurant or oversized portions. For example: 1 slice of cheese = ~60 cal (standard thin processed cheese slice like Clover/Woolworths), 1 slice of bread = ~80 cal, 1 egg = ~70 cal. No extra text." },
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
      `📅 *Monthly — R59/mo*\n👉 ${monthlyLink}\n\n` +
      `🏆 *Annual — R280/year* _(save R428)_\n👉 ${annualLink}`
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
      "Howzit! 👋 Welcome to *FitSorted* — your free calorie tracker on WhatsApp.\n\nNo app. No login. Just chat like you're messaging a mate.\n\n*100% free to use:*\n🍗 Log any food — I'll figure out the calories (yes, even pap and vleis)\n🥩 Track macros (protein, carbs, fat)\n🏃 Log your gym session or run\n📊 Running calorie deficit in real time\n🧠 Ask me anything — meal ideas, what can I eat under 400 cal?\n\n✨ *Want more?* Premium unlocks photo logging, personalised meal plans, weekly insights, and massive upgrades coming soon — starting at just R36/mo (early bird price, won't last). Type *promo EARLYBIRD* after your free trial to claim it.\n\n🍺 *Bonus:* Built-in drunk-o-meter — log your drinks and I'll tell you exactly how drunk you are, how many calories you've drunk, and whether you're over the legal driving limit.\n\nLet's get your calorie goal sorted — takes 30 seconds 👇\n\nFirst, what's your biological sex?",
      [{ id: "setup:male", title: "Male" }, { id: "setup:female", title: "Female" }]
    );
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
    user.setup = true;
    user.step = null;
    saveUsers(users);

    await send(from,
      `✅ *All set, ${user.name}!*\n\n` +
      `Your goal: *${user.goal} cal/day*\n\n` +
      `Now just tell me what you eat throughout the day and I'll track it. 🍽️\n\n` +
      `🎁 *You're on a 7-day free trial* — full access to everything including photo logging, meal suggestions, and weekly insights.\n\n` +
      `After 7 days you'll drop to our free tier (calorie counting, macros, exercise logging — still great!). ` +
      `Or upgrade to Premium anytime for R59/mo to keep all features.\n\n` +
      `Send *log* to see today's total or *help* for commands.`
    );

    // Send pinnable menu card
    await send(from,
      `📌 *Pin this message for quick access!*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🏋️ *FitSorted - Quick Menu*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🍽️ *Log Food*\n` +
      `Just type what you ate:\n` +
      `_"2 eggs and toast"_\n` +
      `_"large Kauai smoothie"_\n\n` +
      `🏃 *Log Exercise*\n` +
      `_"ran 5km"_ · _"45 min weights"_\n\n` +
      `📊 *Check Progress*\n` +
      `• *log* - today's entries\n` +
      `• *summary* - daily overview\n` +
      `• *weight history* - weight trend\n\n` +
      `⚖️ *Update Weight*\n` +
      `• *weight 82.5* - log weigh-in\n\n` +
      `🍔 *Custom Foods*\n` +
      `• *save [food] = [cal]* - save a food\n` +
      `• *custom [food] [cal]* - alt syntax\n` +
      `• *my foods* - see your list\n\n` +
      `↩️ *Fix Mistakes*\n` +
      `• *undo* - remove last entry\n\n` +
      `🧠 *Ask Me Anything*\n` +
      `_"what can I eat under 400 cal?"_\n` +
      `_"suggest a high protein meal"_\n\n` +
      `⚙️ *Settings*\n` +
      `• *start* - recalculate goals\n` +
      `• *export* - download your data\n` +
      `• *help* - full command list\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Long-press this message → Pin_ 📌`
    );
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
        // Credit both parties with R10
        creditReferralRewards(referrerPhone, from, users);
        trackReferral(refCode, from);
        saveUsers(users);
        
        // Welcome message with referral acknowledgment
        await send(from, `👋 Welcome to FitSorted!\n\nYou were referred by a friend — you both just earned *R10 off!*\n\nLet's get you set up...`);
        
        // Notify referrer
        const referrer = users[referrerPhone];
        const newReferralCount = (referrer.referrals || []).length;
        await send(referrerPhone, `🎉 Great news!\n\nSomeone just joined FitSorted using your referral link!\n\n💰 *+R10 credit earned*\n📊 Total referrals: ${newReferralCount}\n\nKeep sharing to earn more!`);
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
          `📸 Your 7-day free trial has ended.\n\n` +
          `Subscribe to keep using FitSorted:\n\n` +
          `📅 *Monthly — R59/mo*\n👉 ${monthlyLink}\n\n` +
          `🏆 *Annual — R280/year* _(save R428)_\n👉 ${annualLink}`
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
        user.log[today].push({
          food: result.food,
          calories: result.calories,
          protein: result.protein || 0,
          carbs: result.carbs || 0,
          fat: result.fat || 0,
          time: new Date().toISOString()
        });
        delete user.pendingFood;
        saveUsers(users);
        const total = getTodayTotal(user);
        const effectiveGoal = getEffectiveGoal(user);
        await send(from, `✅ *${result.food}* - ${result.calories} cal\n\n📊 Today: *${total} / ${effectiveGoal} cal*\n${deficitMessage(total, effectiveGoal)}`);
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
    "menu:my_foods": "my foods", "menu:start": "start", "menu:export": "export", "menu:help": "help",
  };
  if (menuMap[msgLower]) { console.log(`[menu] Redirecting ${msgLower} → ${menuMap[msgLower]}`); msgLower = menuMap[msgLower]; }
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
      `• Custom foods: ${user.customFoods?.length || 0}`,
      ``,
      `🍽️ *Custom Foods:* ${(user.customFoods || []).map(f => f.name).join(', ') || 'none'}`,
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
        const price = isAnnual ? "R280/year" : "R36/mo";
        user.promoCode = "EARLYBIRD";
        user.promoDiscount = 39;
        saveUsers(users);
        await send(from,
          `🎉 Great choice! Here's your early bird link:\n\n` +
          `👉 ${link}\n\n` +
          `7 days free, then ${price}. Your card is stored securely by PayFast — cancel anytime.\n\n` +
          `_Meanwhile, let's set up your goals..._\n\nWhat's your current weight in kg? (e.g. *86*)`
        );
      }
      return;
    }

    if (val === "male" || val === "female") {
      user.profile.gender = val;
      user.step = "weight";
      saveUsers(users);
      // Offer premium right after gender — catch early excitement
      const monthlyLink = getPayFastMonthlyLink(from, 39); // EARLYBIRD price
      const annualLink = getPayFastAnnualLink(from, 39);
      try {
        await sendButtons(from,
          `Got it! 💪\n\n` +
          `Before we set up your goals — want to lock in our *early bird price* while it lasts?\n\n` +
          `☕ *R36/mo* (usually R59) — 7 days free, then auto-billed.\n` +
          `Includes photo logging, meal plans, weekly insights + more coming soon.\n\n` +
          `Or just continue for free — you can always upgrade later.`,
          [
            { id: "earlybird:monthly", title: "R36/mo 🔥" },
            { id: "earlybird:annual", title: "R280/yr 🏆" },
            { id: "earlybird:skip", title: "Continue free" }
          ]
        );
      } catch {
        await send(from, `Got it. What's your current weight in kg? (e.g. *86*)`);
      }
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
  if (user.step && ["weight", "height", "age", "name", "email", "email_late"].includes(user.step)) {
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
      macroStr = `\n\n*Macros:*\n🥩 Protein: ${macros.protein}g\n🍞 Carbs: ${macros.carbs}g\n🥑 Fat: ${macros.fat}g`;
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

    let macroStr = "";
    if (todayMacros.protein > 0 || todayMacros.carbs > 0 || todayMacros.fat > 0) {
      if (macroTargets) {
        macroStr = `\n\n*Macros:*\n🥩 Protein: ${todayMacros.protein}g / ${macroTargets.protein}g\n🍞 Carbs: ${todayMacros.carbs}g / ${macroTargets.carbs}g\n🥑 Fat: ${todayMacros.fat}g / ${macroTargets.fat}g`;
      } else {
        macroStr = `\n\n🥩 Protein: ${todayMacros.protein}g | 🍞 Carbs: ${todayMacros.carbs}g | 🥑 Fat: ${todayMacros.fat}g`;
      }
    }

    await send(from, `📋 *Today's log:*\n${list}${exerciseStr}\n\n🔢 *${total} / ${effectiveGoal} cal*${macroStr}\n${deficitMessage(total, effectiveGoal)}`);
        await maybePromptPro(from, user);
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
        `📧 Email: support@fitsorted.co.za\n` +
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
    if (premium) {
      const { data: user } = await supabaseAdmin.from("users").select("id").eq("phone", from).single();
      const { data: sub } = user ? await supabaseAdmin.from("subscriptions").select("ends_at").eq("user_id", user.id).eq("status", "active").single() : { data: null };
      const expiryStr = sub?.ends_at ? new Date(sub.ends_at).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }) : "unknown";
      await send(from, `✅ *FitSorted Premium* — Active\n\nRenews: ${expiryStr}\n\nType *upgrade* to renew early.`);
    } else {
      await send(from, `📋 *Your Plan:* Free\n\nUpgrade to Premium for R36/mo:\n📸 Photo logging\n🍽️ Meal suggestions\n📊 Weekly insights\n\nType *upgrade* to subscribe.`);
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
        await send(from, `⏰ Sorry, the *${code}* early bird offer expired ${PROMO_EXPIRY_DAYS[code]} days after signup. The standard price is R59/mo.\n\nType *upgrade* to subscribe.`);
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
    const monthlyPrice = applyDiscount(59, discount);
    const annualPrice = applyDiscount(280, discount);
    const monthlyLink = getPayFastMonthlyLink(from, discount);
    const annualLink = getPayFastAnnualLink(from, discount);
    await send(from,
      `🎉 Code *${code}* applied — *${discount}% off*!\n\n` +
      `7 days free, then:\n\n` +
      `📅 *Monthly — R${monthlyPrice}/mo* _(was R59)_\n👉 ${monthlyLink}\n\n` +
      `🏆 *Annual — R${annualPrice}/year* _(was R708)_\n👉 ${annualLink}`
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
    const monthlyPrice = applyDiscount(59, discount);
    const annualPrice = applyDiscount(280, discount);
    const monthlyLink = getPayFastMonthlyLink(from, discount);
    const annualLink = getPayFastAnnualLink(from, discount);
    const promoLine = promoCode ? `🎉 Code *${promoCode}* applied (${discount}% off)\n\n` : "";
    await send(from,
      `*FitSorted Premium* 🚀\n\n` +
      promoLine +
      `7 days free, then choose your plan:\n\n` +
      `📅 *Monthly — R${monthlyPrice}/mo*\n` +
      `👉 ${monthlyLink}\n\n` +
      `🏆 *Annual — R${annualPrice}/year* _(50% off)_\n` +
      `👉 ${annualLink}\n\n` +
      `Got a promo code? Type *promo CODE*\n` +
      `Cancel anytime by texting *cancel*. ✅`
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
      `📌 *Pin this message for quick access!*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🏋️ *FitSorted - Quick Menu*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🍽️ *Log Food*\n` +
      `Just type what you ate:\n` +
      `_"2 eggs and toast"_\n` +
      `_"large Kauai smoothie"_\n\n` +
      `🏃 *Log Exercise*\n` +
      `_"ran 5km"_ · _"45 min weights"_\n\n` +
      `📊 *Check Progress*\n` +
      `• *log* - today's entries\n` +
      `• *summary* - daily overview\n` +
      `• *weight history* - weight trend\n\n` +
      `⚖️ *Update Weight*\n` +
      `• *weight 82.5* - log weigh-in\n\n` +
      `🍔 *Custom Foods*\n` +
      `• *save [food] = [cal]* - save a food\n` +
      `• *custom [food] [cal]* - alt syntax\n` +
      `• *my foods* - see your list\n\n` +
      `↩️ *Fix Mistakes*\n` +
      `• *undo* - remove last entry\n` +
      `• *yesterday: [food]* - log to past day\n\n` +
      `🧠 *Ask Me Anything*\n` +
      `_"what can I eat under 400 cal?"_\n` +
      `_"suggest a high protein meal"_\n` +
      `_"am I on track today?"_\n\n` +
      `🎁 *Earn Rewards*\n` +
      `• *invite* - share & earn R10 per friend\n\n` +
      `⚙️ *Settings*\n` +
      `• *start* - recalculate goals\n` +
      `• *export* - download your data\n` +
      `• *delete* - delete account\n\n` +
      `Your goal: *${user.goal} cal/day*\n` +
      `Privacy: fitsorted.co.za/privacy.html\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Long-press this message → Pin_ 📌`
    );
    return;
  }

  // ── Coaching mode - questions get personalised advice ──
  if (isQuestion(msg) && !isWorkout(msg)) {
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

  // Trial / subscription gate
  const userHasAccess = await hasAccess(from, user);
  if (!userHasAccess) {
    const monthlyLink = getPayFastMonthlyLink(from);
    const annualLink = getPayFastAnnualLink(from);
    await send(from,
      `⏰ Your 7-day free trial has ended.\n\n` +
      `Subscribe to keep tracking:\n\n` +
      `📅 *Monthly — R59/mo*\n👉 ${monthlyLink}\n\n` +
      `🏆 *Annual — R280/year* _(save R428)_\n👉 ${annualLink}\n\n` +
      `All your data is safe — pick up right where you left off. 💪`
    );
    return;
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

    const result = await estimateCalories(foodText, user);

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
    // Detect alcohol
    const alcoholMatch = detectAlcohol(foodText);
    const alcoholUnits = alcoholMatch ? (alcoholMatch.units || 0) : 0;

    user.log[logDate].push({
      food: result.food,
      calories: result.calories,
      protein: result.protein || 0,
      carbs: result.carbs || 0,
      fat: result.fat || 0,
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
    const itemMacros = (result.protein || result.carbs || result.fat)
      ? `\n🥩 P: ${result.protein}g | 🍞 C: ${result.carbs}g | 🥑 F: ${result.fat}g`
      : "";

    if (isBacklog) {
      // Logging to a past date
      await send(from, `✅ *${result.food}* - ${result.calories} cal${sourceTag}${itemMacros}\n\n📅 _Logged to ${dateInfo.label} (${logDate})_\n📊 ${dateInfo.label}: *${logDateTotal} cal total*`);
    } else {
      // Normal today logging
      let macroProgress = "";
      if (macroTargets && (todayMacros.protein > 0 || todayMacros.carbs > 0 || todayMacros.fat > 0)) {
        macroProgress = `\n\n*Macros Today:*\n🥩 Protein: ${todayMacros.protein}g / ${macroTargets.protein}g\n🍞 Carbs: ${todayMacros.carbs}g / ${macroTargets.carbs}g\n🥑 Fat: ${todayMacros.fat}g / ${macroTargets.fat}g`;
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
        await send(from, `✅ *${result.food}* - ${result.calories} cal${sourceTag}${itemMacros}\n\n📊 Today: *${total} / ${effectiveGoal} cal*${macroProgress}\n${deficitMessage(total, effectiveGoal)}`);
      }
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
          fat: yesterdayEntries.reduce((s, e) => s + (e.fat || 0), 0)
        };
        let macroStr = "";
        if (yMacros.protein > 0 || yMacros.carbs > 0 || yMacros.fat > 0) {
          macroStr = `\n🥩 P: ${yMacros.protein}g | 🍞 C: ${yMacros.carbs}g | 🥑 F: ${yMacros.fat}g`;
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

      let macroStr = "";
      if (todayMacros.protein > 0 || todayMacros.carbs > 0 || todayMacros.fat > 0) {
        if (macroTargets) {
          macroStr = `\n\n*Macros:*\n🥩 P: ${todayMacros.protein}g / ${macroTargets.protein}g\n🍞 C: ${todayMacros.carbs}g / ${macroTargets.carbs}g\n🥑 F: ${todayMacros.fat}g / ${macroTargets.fat}g`;
        } else {
          macroStr = `\n🥩 P: ${todayMacros.protein}g | 🍞 C: ${todayMacros.carbs}g | 🥑 F: ${todayMacros.fat}g`;
        }
      }

      await send(phone, `📊 *Daily Summary*\n${total} / ${user.goal} cal${macroStr}\n${deficitMessage(total, user.goal)}`);

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
  if (overLimit) return `🔴 You are over the SA legal driving limit. Your reaction time, judgment, and coordination are all affected. *Stop drinking now.* Drink water, eat something, call an Uber if you need to get home.`;
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
  msg += `⏱️ *Sober by:* ~${hours} hour${hours !== 1 ? "s" : ""} from now\n\n`;

  if (overLimit) {
    msg += `🚨 *OVER THE LEGAL DRIVING LIMIT*\n`;
    msg += `SA law: 0.05g/100ml BAC. You're above it.\n`;
    msg += `🚗 *Do NOT drive. Call an Uber.*\n\n`;
  }

  if (nudge) msg += `${nudge}`;
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
