require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const cron = require("node-cron");

const app = express();
app.use(express.json());

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "fitsorted123";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const PORT = process.env.PORT || 3001;
const USERS_FILE = "./users.json";
const REFERRALS_FILE = "./referrals.json";
const ADMIN_NUMBER = "27837787970"; // Brandon's number

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

// ── User state ──
function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8") || "{}"); }
  catch { return {}; }
}
function saveUsers(u) { fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2)); }
function getUser(users, phone) {
  if (!users[phone]) users[phone] = { setup: false, step: null, profile: {}, goal: null, log: {} };
  if (!users[phone].log) users[phone].log = {};
  return users[phone];
}

function getToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
}
function getTodayEntries(user) { return user.log[getToday()] || []; }
function getTodayTotal(user) { return getTodayEntries(user).reduce((s, e) => s + e.calories, 0); }
function getTodayBurned(user) { return (user.exercise || {})[getToday()] || []; }
function getTodayBurnedTotal(user) { return getTodayBurned(user).reduce((s, e) => s + e.calories, 0); }
function getEffectiveGoal(user) { return user.goal + getTodayBurnedTotal(user); }

// ── TDEE / calorie goal calculator ──
// Mifflin-St Jeor BMR → × activity multiplier → adjust for goal
function calculateGoal(profile) {
  const { gender, weight, height, age, activity, target } = profile;

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

  const adjustments = {
    lose: -500,   // ~0.5kg/week loss
    maintain: 0,
    gain: +300,   // lean bulk
  };

  const goal = tdee + (adjustments[target] || 0);
  return { bmr: Math.round(bmr), tdee, goal };
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

// ── Calorie lookup ──
// ── SA chain food database (exact calories) ──
const SA_FOODS = [
  // Kauai smoothies
  { keywords: ["kauai peanut butter bomb", "peanut butter bomb large", "large peanut butter bomb", "pbb large", "large pbb"], food: "Kauai Peanut Butter Bomb (Large 500ml)", calories: 764 },
  { keywords: ["kauai peanut butter bomb small", "small peanut butter bomb", "peanut butter bomb small", "pbb small", "small pbb", "peanut butter bomb"], food: "Kauai Peanut Butter Bomb (Small 350ml)", calories: 467 },
  { keywords: ["kauai green machine large", "large green machine"], food: "Kauai Green Machine (Large 500ml)", calories: 380 },
  { keywords: ["kauai green machine", "green machine small", "green machine"], food: "Kauai Green Machine (Small 350ml)", calories: 266 },
  { keywords: ["kauai triple c large", "large triple c"], food: "Kauai Triple C (Large 500ml)", calories: 510 },
  { keywords: ["kauai triple c", "triple c"], food: "Kauai Triple C (Small 350ml)", calories: 357 },
  // Nu smoothies
  { keywords: ["nu peanut butter bomb", "nu pb bomb"], food: "Nu Peanut Butter Bomb", calories: 764 },
  // Nando's
  { keywords: ["nandos quarter chicken", "nando's quarter chicken", "quarter chicken nandos"], food: "Nando's Quarter Chicken (skin on)", calories: 429 },
  { keywords: ["nandos half chicken", "nando's half chicken", "half chicken nandos"], food: "Nando's Half Chicken", calories: 858 },
  { keywords: ["nandos pita", "nando's pita"], food: "Nando's Chicken Pita", calories: 420 },
  { keywords: ["nandos wrap", "nando's wrap"], food: "Nando's Chicken Wrap", calories: 480 },
  // Steers
  { keywords: ["steers regular burger", "steers burger"], food: "Steers Regular Burger", calories: 520 },
  { keywords: ["steers cheese burger", "steers cheeseburger"], food: "Steers Cheese Burger", calories: 580 },
  { keywords: ["steers onion rings"], food: "Steers Onion Rings (regular)", calories: 330 },
  { keywords: ["steers chips", "steers fries"], food: "Steers Chips (regular)", calories: 380 },
  // Woolworths
  { keywords: ["woolworths protein shake", "ww protein shake"], food: "Woolworths Protein Shake", calories: 220 },
];

function lookupSAFood(food) {
  const lower = food.toLowerCase();
  for (const item of SA_FOODS) {
    if (item.keywords.some(k => lower.includes(k))) {
      return { food: item.food, calories: item.calories };
    }
  }
  return null;
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

// ── Coaching mode — detects questions and gives personalised advice ──
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
- Objective: ${target === "lose" ? "lose weight (−500 cal deficit)" : target === "gain" ? "build muscle (+300 cal)" : "maintain weight"}
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
  // 1. Check user's custom foods first
  if (user) {
    const custom = lookupCustomFood(user, food);
    if (custom) return { ...custom, source: "custom" };
  }

  // 2. Check SA chain database
  const saMatch = lookupSAFood(food);
  if (saMatch) return saMatch;

  if (!OPENAI_API_KEY) {
    const simple = {
      "banana": 90, "apple": 80, "egg": 70, "eggs": 140,
      "chicken breast": 165, "rice": 200, "bread": 80,
      "coffee": 5, "milk": 120, "oats": 150, "protein shake": 150,
      "burger": 500, "pizza": 285, "chips": 300, "coke": 140,
    };
    const key = Object.keys(simple).find(k => food.toLowerCase().includes(k));
    return key ? { food: key, calories: simple[key] } : { food, calories: 200 };
  }

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a nutrition assistant. Given a food description, return ONLY a JSON object: {\"food\": \"clean name including quantity\", \"calories\": integer}. IMPORTANT: If the description mentions a quantity (e.g. 'two', 'three', '2x', '3 slices'), multiply the calories accordingly and include the quantity in the food name. Example: 'two toasted cheese sandwiches' → {\"food\": \"2x toasted cheese sandwich\", \"calories\": 800}. Return total calories for the full described amount. No extra text." },
        { role: "user", content: `Calories for: ${food}` }
      ],
      temperature: 0.2
    },
    { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" } }
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
    return `🔴 *${grams}g surplus* today — ${Math.abs(diff)} cal over goal.`;
  }
}

// ── WhatsApp sender ──
async function send(to, text) {
  await axios.post(
    `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`,
    { messaging_product: "whatsapp", to, type: "text", text: { body: text } },
    { headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } }
  );
}

async function sendButtons(to, body, buttons) {
  await axios.post(
    `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: { buttons: buttons.map(b => ({ type: "reply", reply: { id: b.id, title: b.title } })) }
      }
    },
    { headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } }
  );
}

// ── Setup flow ──
async function handleSetup(from, user, msg) {
  const step = user.step;

  if (!step || step === "gender") {
    user.step = "awaiting_gender";
    await sendButtons(from,
      "Howzit! 👋 Welcome to *FitSorted* — your free calorie tracker on WhatsApp.\n\nNo app to download. No login. Just chat to me like you're messaging a mate.\n\n*What I can do:*\n🍗 Log any food — I'll figure out the calories (yes, even pap and vleis)\n🏃 Log your gym session or run — adds cals back to your budget\n📊 See your running deficit in real time\n🧠 Ask me anything — meal ideas, am I on track, what can I eat under 400 cal?\n⏰ Daily check-in every evening at 8 PM\n↩️ Ate something wrong? Just say *undo*\n\n*The more you log, the smarter I get* — after a week I'll suggest meals based on what you actually eat.\n\n*How to use me:*\n• Log food → *\"2 slices of white bread and peanut butter\"*\n• Log exercise → *\"45 min weights session\"*\n• Ask anything → *\"what can I eat under 375 calories?\"*\n• Check your day → *\"summary\"*\n• Need help → *\"help\"*\n\nLet's sort out your personal calorie goal real quick — takes about 30 seconds 👇\n\nFirst, what's your biological sex?",
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

  if (step === "target") {
    await sendButtons(from,
      "What's your goal?",
      [
        { id: "setup:lose", title: "Lose weight 📉" },
        { id: "setup:maintain", title: "Maintain ⚖️" },
        { id: "setup:gain", title: "Build muscle 📈" },
      ]
    );
    return;
  }
}

// ── Main handler ──
async function handleMessage(from, text) {
  const users = loadUsers();
  const user = getUser(users, from);
  const msg = (text || "").trim();
  const msgLower = msg.toLowerCase();

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
    await handleSetup(from, user, msg);
    saveUsers(users);
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
        .map(([code, data]) => `• *${code}* — ${data.signups.length} signup${data.signups.length !== 1 ? "s" : ""}`)
        .join("\n");
      await send(from, `📊 *Referral Stats — All Codes:*\n\n${lines}`);
    } else {
      const data = getReferralStats(target);
      if (!data) {
        await send(from, `❌ No data for code *${target}*`);
        return;
      }
      await send(from, `📊 *Referral Stats — ${target}*\n\n👥 Signups: ${data.signups.length}`);
    }
    return;
  }

  // Reset
  if (msgLower === "start" || msgLower === "/start" || msgLower === "reset" || msgLower === "hi" || msgLower === "hello") {
    user.setup = false;
    user.step = "gender";
    user.profile = {};
    user.goal = null;
    saveUsers(users);
    await handleSetup(from, user, msg);
    saveUsers(users);
    return;
  }

  // Force setup if goal is missing (but not mid-setup button press)
  if (!user.goal && !msg.startsWith("setup:") && !user.step) {
    user.setup = false;
    user.step = "gender";
    user.profile = {};
    saveUsers(users);
    await handleSetup(from, user, msg);
    saveUsers(users);
    return;
  }

  // Handle setup button responses
  if (msg.startsWith("setup:")) {
    const val = msg.replace("setup:", "");

    if (val === "male" || val === "female") {
      user.profile.gender = val;
      user.step = "weight";
      saveUsers(users);
      await send(from, `Got it. What's your current weight in kg? (e.g. *86*)`);
      return;
    }

    if (["sedentary", "light", "moderate", "active"].includes(val)) {
      user.profile.activity = val;
      user.step = "target";
      saveUsers(users);
      await handleSetup(from, user, msg);
      saveUsers(users);
      return;
    }

    if (["lose", "maintain", "gain"].includes(val)) {
      user.profile.target = val;
      const { bmr, tdee, goal } = calculateGoal(user.profile);
      user.goal = goal;
      user.setup = true;
      user.step = null;
      saveUsers(users);

      const targetLabel = { lose: "lose weight (−500 cal deficit)", maintain: "maintain weight", gain: "build muscle (+300 cal)" }[val];
      await send(from,
        `✅ *Your calorie goal: ${goal} cal/day*\n\n` +
        `BMR: ${bmr} cal | TDEE: ${tdee} cal\n` +
        `Goal: ${targetLabel}\n\n` +
        `Now just tell me what you eat throughout the day and I'll track it. 🍽️\n\n` +
        `Send *log* to see today's total or *help* for commands.`
      );
      return;
    }
  }

  // Still in setup flow
  if (!user.setup) {
    if (!user.step) user.step = "gender";
    await handleSetup(from, user, msg);
    saveUsers(users);
    return;
  }

  // In setup number steps
  if (user.step && ["weight", "height", "age"].includes(user.step)) {
    await handleSetup(from, user, msg);
    saveUsers(users);
    return;
  }

  // Log view
  if (msgLower === "log" || msgLower === "today" || msgLower === "total") {
    const entries = getTodayEntries(user);
    const total = getTodayTotal(user);
    if (entries.length === 0) {
      await send(from, `📋 Nothing logged today yet.\n\nJust tell me what you ate!`);
      return;
    }
    const list = entries.map((e, i) => `${i + 1}. ${e.food} — ${e.calories} cal`).join("\n");
    const burned = getTodayBurned(user);
    const burnedTotal = getTodayBurnedTotal(user);
    const effectiveGoal = getEffectiveGoal(user);
    let exerciseStr = "";
    if (burned.length > 0) {
      exerciseStr = "\n\n🔥 *Exercise:*\n" + burned.map(e => `• ${e.activity} — −${e.calories} cal`).join("\n") + `\nTotal burned: ${burnedTotal} cal`;
    }
    await send(from, `📋 *Today's log:*\n${list}${exerciseStr}\n\n🔢 *${total} / ${effectiveGoal} cal*\n${deficitMessage(total, effectiveGoal)}`);
    return;
  }

  // ── Weight tracking ──
  // Log: "weight 84.5" or "84.5kg"
  const weightLog = msg.match(/^(?:weight|weigh|w)\s+([\d.]+)\s*(?:kg)?$/i) || msg.match(/^([\d.]+)\s*kg$/i);
  if (weightLog) {
    const kg = parseFloat(weightLog[1]);
    if (kg >= 30 && kg <= 300) {
      if (!user.weights) user.weights = [];
      user.weights.push({ kg, date: getToday(), time: new Date().toISOString() });
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
      await send(from, "That doesn't look right. Send your weight like: *weight 84.5*");
      return;
    }
  }

  // Weight history
  if (msgLower === "weight history" || msgLower === "my weight" || msgLower === "weight trend") {
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
      return `• ${w.date} — *${w.kg} kg*${arrow}`;
    }).join("\n");

    const start = weights[0].kg;
    const current = weights[weights.length - 1].kg;
    const total = current - start;
    const totalStr = `\n\n📊 *Total: ${total > 0 ? "+" : ""}${total.toFixed(1)} kg* since ${weights[0].date}`;

    await send(from, `⚖️ *Your weight trend:*\n\n${lines}${totalStr}`);
    return;
  }

  // Undo
  if (msgLower === "undo") {
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

  // Help
  if (msgLower === "help" || msgLower === "menu") {
    await send(from,
      `*FitSorted — Calorie Tracker*\n\n` +
      `Just tell me what you ate and I'll log it. You can also ask me anything!\n\n` +
      `*Ask me things like:*\n` +
      `• _"What can I eat under 400 cal?"_\n` +
      `• _"Am I on track today?"_\n` +
      `• _"Suggest a high protein meal"_\n\n` +
      `*Commands:*\n` +
      `• *log* — see today's entries\n` +
      `• *undo* — remove last entry\n` +
      `• *weight 84.5* — log your weight\n` +
      `• *weight history* — see your trend\n` +
      `• *my foods* — your saved custom foods\n` +
      `• *save [food] = [cal]* — save a custom food\n` +
      `• *delete [food]* — remove a saved food\n` +
      `• *start* — recalculate your goal\n` +
      `• *help* — this menu\n\n` +
      `Your goal: *${user.goal} cal/day*`
    );
    return;
  }

  // ── Coaching mode — questions get personalised advice ──
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
        `🔥 *${result.activity}* — burned ${result.calories} cal\n\n` +
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

  // View custom foods: "my foods"
  if (msgLower === "my foods" || msgLower === "saved foods" || msgLower === "my food") {
    const foods = user.customFoods && Object.keys(user.customFoods).length > 0
      ? Object.entries(user.customFoods).map(([name, cal]) => `• ${name} — ${cal} cal`).join("\n")
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

  // Food log
  try {
    const result = await estimateCalories(msg, user);
    const today = getToday();
    if (!user.log[today]) user.log[today] = [];
    user.log[today].push({ food: result.food, calories: result.calories, time: new Date().toISOString() });
    const total = getTodayTotal(user);
    const effectiveGoal = getEffectiveGoal(user);
    saveUsers(users);
    const sourceTag = result.source === "custom" ? " _(your saved entry)_" : "";
    await send(from, `✅ *${result.food}* — ${result.calories} cal${sourceTag}\n\n📊 Today: *${total} / ${effectiveGoal} cal*\n${deficitMessage(total, effectiveGoal)}`);
  } catch (err) {
    console.error("Food lookup error:", err.message);
    await send(from, "Couldn't estimate that. Try something like \"200g chicken breast\" or \"2 eggs\".");
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
    if (msg.type === "text") text = msg.text?.body || "";
    else if (msg.type === "interactive") text = msg.interactive?.button_reply?.id || "";
    await handleMessage(from, text);
  } catch (err) {
    console.error("Webhook error:", err.message);
  }
});

// ── 8 PM daily summary ──
cron.schedule("0 20 * * *", async () => {
  const users = loadUsers();
  for (const [phone, user] of Object.entries(users)) {
    if (!user.setup || !user.goal) continue;
    try {
      const total = getTodayTotal(user);
      await send(phone, `📊 *Daily Summary*\n${total} / ${user.goal} cal\n${deficitMessage(total, user.goal)}`);
    } catch (err) {
      console.error(`Summary failed for ${phone}:`, err.message);
    }
  }
}, { timezone: "Africa/Johannesburg" });

app.listen(PORT, () => console.log(`✅ FitSorted calorie tracker on port ${PORT}`));
