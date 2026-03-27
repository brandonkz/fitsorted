#!/usr/bin/env node
// Nightly edge case calorie accuracy test
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LIBRARY_PATH = path.join(__dirname, 'edge-case-library.json');
const BOT_PATH = path.join(__dirname, '..', 'bot.js');

// The same system prompt from bot.js line ~1968
const SYSTEM_PROMPT = `You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {"food": "clean name including quantity", "calories": integer, "protein": integer, "carbs": integer, "fat": integer, "fibre": integer, "estimatedPriceZAR": integer_or_null}. All macros in grams. fibre = dietary fibre in grams. estimatedPriceZAR is the approximate cost in South African Rands at a restaurant/store (null if homemade or unknown). Use 2025/2026 SA prices. Examples: Nando's quarter chicken ~R75, Steers Wacky Wednesday burger ~R50, Kauai smoothie ~R65, Woolworths ready meal ~R60. CRITICAL RULES: 1) ONLY estimate what was explicitly mentioned - do NOT add extra foods. If user says 'scrambled', return 'scrambled eggs' ONLY - do not add toast, bacon, or other items unless specifically mentioned. If user says 'toast', return toast only - do not add eggs. 2) RESPECT SINGULAR vs PLURAL: 'egg' = 1 egg (~70 cal), 'eggs' = 2 eggs (~140 cal). 'slice of toast' = 1 slice, 'toast' = 2 slices. 'banana' = 1 banana. 'chicken breast' = 1 breast. Always default to the SINGULAR quantity unless the user uses plural or specifies a number. 3) If the description mentions a quantity (e.g. 'two', 'three', '2x', '3 slices'), multiply the calories AND macros accordingly and include the quantity in the food name. 4) Use realistic everyday South African portion sizes - not restaurant or oversized portions. 5) Drinks must use FULL SERVING sizes: beer=440ml (~155 cal), Red Bull=250ml (~112 cal), Monster=500ml (~230 cal), wine glass=175ml (~125 cal), cider=330ml (~170 cal). NEVER use per-100ml values. 6) SA portions: 1 slice cheese=~60 cal (thin processed like Clover), 1 slice bread=~80 cal, 1 egg=~70 cal, biltong 50g=~125 cal, droewors 50g=~150 cal, handful of nuts=~160 cal (28g). 7) Bunny chow quarter=~650 cal (bread bowl + curry). 8) COOKING FATS: For fried/scrambled eggs add +30 cal per egg (oil/butter), for fried chicken/meat add +20% calories (oil), for sautéed vegetables add +50 cal (oil), for cooked rice/pasta assume butter/oil already included in base values. 9) COMPOSITE MEALS: When multiple ingredients are listed (e.g. 'chicken with rice and veg'), sum ALL components realistically. 10) If you return less than 200 cal for a meal with 3+ ingredients, you're probably wrong - recalculate. 11) PORTION SIZE: Always include estimated portion weight in the food name when the input is vague. 12) CHICKEN GUIDE: Plain 'chicken' = 1 medium chicken breast (~130g, 200 cal). 13) CONSERVATIVE BIAS: When portion size is uncertain, estimate on the LOWER end. No extra text.`;

// 10 new test cases - healthy/diet foods people actually log
const NEW_TESTS = [
  ["woolworths skinless chicken breast 200g", 220, 340],
  ["woolworths greek yoghurt plain 175g", 130, 200],
  ["woolworths superfood salad bowl", 200, 380],
  ["kauai fit bowl", 350, 550],
  ["scrambled eggs on whole wheat toast", 280, 420],
  ["woolworths cottage cheese 250g", 180, 280],
  ["grilled chicken salad no dressing", 200, 350],
  ["oats with banana and honey", 300, 450],
  ["woolworths protein smoothie", 180, 300],
  ["steamed vegetables with brown rice", 250, 400],
];

async function queryOpenAI(food) {
  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: food }
      ],
      temperature: 0.2
    },
    { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" } }
  );
  const content = res.data.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
  return JSON.parse(content);
}

async function main() {
  console.log("🧪 FitSorted Nightly Edge Case Test - " + new Date().toISOString());
  console.log("Testing", NEW_TESTS.length, "new items...\n");

  const results = [];
  const failures = [];

  for (const [food, minCal, maxCal] of NEW_TESTS) {
    try {
      const result = await queryOpenAI(food);
      const cal = result.calories;
      const pass = cal >= minCal && cal <= maxCal;
      const status = pass ? "✅" : "❌";
      console.log(`${status} "${food}" → ${cal} cal (expected ${minCal}-${maxCal})`);
      results.push({ food, cal, minCal, maxCal, pass, result });
      if (!pass) {
        failures.push({ food, cal, minCal, maxCal, result });
      }
      // Rate limit
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`⚠️ Error testing "${food}":`, err.message);
      results.push({ food, cal: null, minCal, maxCal, pass: false, error: err.message });
      failures.push({ food, cal: null, minCal, maxCal, error: err.message });
    }
  }

  console.log(`\n📊 Results: ${results.filter(r => r.pass).length}/${results.length} passed, ${failures.length} failed`);
  
  // Output results as JSON for the parent script to process
  const output = { results, failures, tested: results.length, passed: results.filter(r=>r.pass).length, failed: failures.length };
  fs.writeFileSync(path.join(__dirname, 'nightly-results.json'), JSON.stringify(output, null, 2));
  console.log("\nResults saved to nightly-results.json");
}

main().catch(console.error);
