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
    if (removedFoods.length > 0 || movedToFood.length > 0 || removedExercises.length > 0) {
      // Update food logs
      if (removedFoods.length > 0) {
        u.log[today] = cleanedLogs;
      }

      // Move food items from exercise to food log
      for (const item of movedToFood) {
        cleanedLogs.push({
          food: item.activity,
          calories: item.calories,
          protein: 0, carbs: 0, fat: 0, fibre: 0,
          priceZAR: 0,
          time: new Date().toISOString(),
          isAlcohol: false,
          units: 0,
        });
        u.log[today] = cleanedLogs;
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

      msg += parts.join(', and ') + '.';
      msg += '\n\nTip: Type *undo* to remove your last entry, or *correct* to fix it. Happy tracking! 💪';

      // Only message if user was active in last 24h (free message)
      const lastLogTime = todayLogs.length > 0 ? new Date(todayLogs[todayLogs.length - 1].time).getTime() : 0;
      const isRecent = (Date.now() - lastLogTime) < 24 * 60 * 60 * 1000;

      if (isRecent) {
        await send(phone, msg);
        totalMessages++;
      }

      totalFixes += removedFoods.length + movedToFood.length + removedExercises.length;
      
      // Track what we fixed
      state[today][phone] = [
        ...removedFoods.map(f => f.slice(0, 50)),
        ...movedToFood.map(f => 'ex:' + f.activity.slice(0, 50)),
        ...removedExercises.map(e => 'rx:' + e.slice(0, 50)),
      ];

      fixes.push({ name, phone: phone.slice(0, 5) + '***', removedFoods, movedToFood: movedToFood.map(f => f.activity), removedExercises });
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
      console.log(`  ${f.name} (${f.phone}): removed ${f.removedFoods.length} food, moved ${f.movedToFood.length} to food, removed ${f.removedExercises.length} exercise`);
    });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
