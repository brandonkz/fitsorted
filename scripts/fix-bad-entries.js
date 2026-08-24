#!/usr/bin/env node
/**
 * FitSorted Bad Entry Scanner
 * Runs periodically to find and fix obviously wrong log entries.
 * - Messages logged as food (questions, complaints, commands)
 * - Food logged as exercise
 * - Exercise logged as food
 * Does NOT touch bot.js. Reads/writes users.json directly.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Load env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const TOKEN = process.env.WHATSAPP_TOKEN || 'EAAaqERgjQV4BQZCINzDjNvNGO38gYh5ZAlb33USmp77layWPH17hKehhgCqj0SuEmw8ZB0Wl9fkCTyQ3Gzn5zZByXERkTyoMhCg08jiafbXSQbZBEcwCsVwbNYSee0JIdxbNjqdEzL5qZAAtgMFtaRnCZB6kZAiDXylE7831lN3JiYbamJrSgrXzQ2lEN7V06wZDZD';
const PHONE_ID = process.env.PHONE_NUMBER_ID || '969261306279085';

const USERS_PATH = path.join(__dirname, '..', 'users.json');
const STATE_PATH = path.join(__dirname, '..', 'fix-state.json');

// Patterns that are clearly NOT food
const NOT_FOOD_PATTERNS = [
  /^this cannot be right/i,
  /^please change/i,
  /^how do i/i,
  /^how much/i,
  /^can you/i,
  /^what is/i,
  /^why is/i,
  /^i sent a picture/i,
  /^i don'?t understand/i,
  /^help$/i,
  /^keep as is/i,
  /^never\s*mind/i,
  /^reset/i,
  /^i want to start/i,
  /^can you calculate/i,
  /daily calorie goal/i,
  /change.*(my|the).*(goal|calories|target)/i,
  /set.*(my|the).*goal/i,
];

// Patterns that are food, not exercise
const FOOD_NOT_EXERCISE = [
  /granola/i, /muesli/i, /yoghurt/i, /yogurt/i, /oats/i, /bread/i,
  /chicken/i, /beef/i, /rice/i, /pasta/i, /egg/i, /protein shake/i,
  /woolworths/i, /woolies/i, /nando/i, /kfc/i, /steers/i,
  /milk/i, /cheese/i, /butter/i, /fruit/i, /apple/i, /banana/i,
  /biltong/i, /rusk/i, /coffee/i, /tea/i, /smoothie/i,
];

// Exercise-like patterns (shouldn't be in food log)
const EXERCISE_PATTERNS = [
  /^\d+\s*min(ute)?s?\s+(walk|run|jog|swim|cycle|gym|workout)/i,
  /^(walk|run|jog|swim|cycle|gym|workout|exercise|training|crossfit|yoga|pilates)/i,
  /^food consumption$/i,
  /^eating$/i,
];

function estimateBrokenFoodEntry(food) {
  if (!food || typeof food !== 'string') return null;
  const lower = food.toLowerCase().trim();
  if (!lower) return null;

  let calories = 180;
  let protein = 8;
  let carbs = 20;
  let fat = 8;
  let fibre = 0;

  if (/\b(pizza|pasta|biryani|curry|burger|bunny chow|gatsby|lasagna)\b/.test(lower)) {
    calories = 520; protein = 22; carbs = 58; fat = 22;
  } else if (/\b(stew|soup|broth|potjie)\b/.test(lower)) {
    calories = 360; protein = 22; carbs = 24; fat = 16;
  } else if (/\b(cake|cheesecake|dessert|brownie|muffin|pastry|croissant|donut|doughnut|waffle|mousse|ice cream|creme brulee)\b/.test(lower)) {
    calories = 340; protein = 5; carbs = 42; fat = 16; fibre = 1;
  } else if (/\b(smoothie|shake|juice|latte|cappuccino|frappe)\b/.test(lower)) {
    calories = 220; protein = 8; carbs = 30; fat = 7;
  } else if (/\b(chicken|beef|lamb|fish|salmon|meat|pork|steak|mince|rib)\b/.test(lower)) {
    calories = 260; protein = 28; carbs = 6; fat = 14;
  } else if (/\b(rice|noodle|bread|toast|wrap|roti|sandwich|bagel|pap|roll|popcorn)\b/.test(lower)) {
    calories = 320; protein = 10; carbs = 46; fat = 10; fibre = 2;
  } else if (/\b(egg|eggs|omelette|frittata)\b/.test(lower)) {
    calories = 180; protein = 14; carbs = 4; fat = 12;
  } else if (/\b(salad|veg|vegetable|broccoli|spinach)\b/.test(lower)) {
    calories = 190; protein = 8; carbs = 14; fat = 10; fibre = 4;
  } else if (/\b(fruit|berry|melon|apple|banana|orange|yoghurt|yogurt)\b/.test(lower)) {
    calories = 140; protein = 6; carbs = 22; fat = 3; fibre = 1;
  } else if (/\b(plate|meal|dinner|lunch|breakfast|bowl|serving)\b/.test(lower)) {
    calories = 420; protein = 24; carbs = 40; fat = 18; fibre = 3;
  }

  if (/\b500g\b/.test(lower)) {
    calories = Math.round(calories * 2.2);
    protein = Math.round(protein * 2.2);
    carbs = Math.round(carbs * 2.2);
    fat = Math.round(fat * 2.2);
    fibre = Math.round(fibre * 2.2);
  } else if (/\b(4 slices|4 pieces|4 milho|4 x|4x)\b/.test(lower)) {
    calories = Math.round(calories * 1.9);
    protein = Math.round(protein * 1.8);
    carbs = Math.round(carbs * 1.8);
    fat = Math.round(fat * 1.8);
    fibre = Math.round(fibre * 1.8);
  } else if (/\b3\b/.test(lower) && /\b(rib|ribs|pieces)\b/.test(lower)) {
    calories = Math.round(calories * 1.5);
    protein = Math.round(protein * 1.4);
    carbs = Math.round(carbs * 1.2);
    fat = Math.round(fat * 1.5);
  } else if (/\b2\b/.test(lower) && /\b(slider|thigh|piece|pieces)\b/.test(lower)) {
    calories = Math.round(calories * 1.6);
    protein = Math.round(protein * 1.5);
    carbs = Math.round(carbs * 1.3);
    fat = Math.round(fat * 1.5);
  }

  return { calories, protein, carbs, fat, fibre };
}

async function send(to, msg) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`,
      { messaging_product: 'whatsapp', to, type: 'text', text: { body: msg.slice(0, 4096) } },
      { headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } }
    );
    console.log(`  ✉️  Sent fix message to ${to}`);
  } catch (err) {
    console.error(`  ❌ Failed to send to ${to}:`, err.response?.data?.error?.message || err.message);
  }
}

async function main() {
  const users = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
  
  // Load state to avoid double-fixing
  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch (e) {}
  
  const today = new Date().toISOString().split('T')[0];
  if (!state[today]) state[today] = {};
  
  let totalFixes = 0;
  let totalMessages = 0;
  const fixes = [];

  for (const [phone, u] of Object.entries(users)) {
    const todayLogs = u.log?.[today] || [];
    const todayExercise = u.exercise?.[today] || [];
    const name = u.name || 'there';
    const userKey = `${phone}_${today}`;
    
    // Skip if already processed this run window
    const lastFixed = state[today][phone];
    
    let removedFoods = [];
    let removedExercises = [];
    let movedToFood = [];
    let fixedFallbacks = [];

    // Check food logs for non-food entries
    const cleanedLogs = todayLogs.filter(l => {
      const food = l.food || '';
      // Check if it matches non-food patterns
      for (const pattern of NOT_FOOD_PATTERNS) {
        if (pattern.test(food)) {
          // Only flag if we haven't already fixed this exact entry
          if (!lastFixed || !lastFixed.includes(food.slice(0, 50))) {
            removedFoods.push(food);
            return false;
          }
        }
      }
      return true;
    });

    const repairedLogs = cleanedLogs.map((entry) => {
      const isBrokenFallback = entry.calories === 250 &&
        (entry.protein || 0) === 0 &&
        (entry.carbs || 0) === 0 &&
        (entry.fat || 0) === 0;

      if (!isBrokenFallback) return entry;

      const estimate = estimateBrokenFoodEntry(entry.food);
      if (!estimate) return entry;

      fixedFallbacks.push(entry.food);
      return {
        ...entry,
        ...estimate,
      };
    });

    // Check exercise logs for food items
    const cleanedExercise = todayExercise.filter(e => {
      const activity = e.activity || '';
      for (const pattern of FOOD_NOT_EXERCISE) {
        if (pattern.test(activity)) {
          if (!lastFixed || !lastFixed.includes('ex:' + activity.slice(0, 50))) {
            movedToFood.push({ activity, calories: e.calories });
            return false;
          }
        }
      }
      // Also catch non-exercise in exercise
      if (/^(food consumption|eating)$/i.test(activity)) {
        removedExercises.push(activity);
        return false;
      }
      return true;
    });

    // Apply fixes
    if (removedFoods.length > 0 || movedToFood.length > 0 || removedExercises.length > 0 || fixedFallbacks.length > 0) {
      // Update food logs
      if (removedFoods.length > 0 || fixedFallbacks.length > 0) {
        u.log[today] = repairedLogs;
      }

      // Move food items from exercise to food log
      for (const item of movedToFood) {
        repairedLogs.push({
          food: item.activity,
          calories: item.calories,
          protein: 0, carbs: 0, fat: 0, fibre: 0,
          priceZAR: 0,
          time: new Date().toISOString(),
          isAlcohol: false,
          units: 0,
        });
        u.log[today] = repairedLogs;
      }

      // Update exercise
      if (removedExercises.length > 0 || movedToFood.length > 0) {
        u.exercise[today] = cleanedExercise;
      }

      // Build message
      let msg = `Hey ${name}! 👋 Quick fix — `;
      const parts = [];

      if (removedFoods.length > 0) {
        parts.push(`I removed ${removedFoods.length} accidental ${removedFoods.length === 1 ? 'entry' : 'entries'} from your food log ("${removedFoods[0].slice(0, 40)}...")`);
      }
      if (movedToFood.length > 0) {
        parts.push(`I moved "${movedToFood[0].activity}" from exercise to your food log where it belongs`);
      }
      if (removedExercises.length > 0) {
        parts.push(`I cleaned up ${removedExercises.length} accidental exercise ${removedExercises.length === 1 ? 'entry' : 'entries'}`);
      }
      if (fixedFallbacks.length > 0) {
        parts.push(`I corrected ${fixedFallbacks.length} low-confidence calorie ${fixedFallbacks.length === 1 ? 'estimate' : 'estimates'} that had placeholder macros`);
      }

      msg += parts.join(', and ') + '.';
      msg += '\n\nTip: Type *undo* to remove your last entry, or *correct* to fix it. Happy tracking! 💪';

      // Only message if user was active in last 24h (free message)
      const lastLogTime = todayLogs.length > 0 ? new Date(todayLogs[todayLogs.length - 1].time).getTime() : 0;
      const isRecent = (Date.now() - lastLogTime) < 24 * 60 * 60 * 1000;

      if (isRecent) {
        await send(phone, msg);
        totalMessages++;
      }

      totalFixes += removedFoods.length + movedToFood.length + removedExercises.length + fixedFallbacks.length;
      
      // Track what we fixed
      state[today][phone] = [
        ...removedFoods.map(f => f.slice(0, 50)),
        ...movedToFood.map(f => 'ex:' + f.activity.slice(0, 50)),
        ...removedExercises.map(e => 'rx:' + e.slice(0, 50)),
        ...fixedFallbacks.map(f => 'fx:' + f.slice(0, 50)),
      ];

      fixes.push({ name, phone: phone.slice(0, 5) + '***', removedFoods, movedToFood: movedToFood.map(f => f.activity), removedExercises, fixedFallbacks });
    }
  }

  // Save
  if (totalFixes > 0) {
    fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
    console.log(`\n✅ Fixed ${totalFixes} bad entries, sent ${totalMessages} messages`);
  } else {
    console.log('✅ No bad entries found');
  }
  
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  
  // Summary
  if (fixes.length > 0) {
    console.log('\nFixes applied:');
    fixes.forEach(f => {
      console.log(`  ${f.name} (${f.phone}): removed ${f.removedFoods.length} food, moved ${f.movedToFood.length} to food, removed ${f.removedExercises.length} exercise, repaired ${f.fixedFallbacks.length} placeholder estimates`);
    });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
