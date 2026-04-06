#!/usr/bin/env node
// FitSorted Edge Case Tester - NEW items only (uses same prompt as bot.js)

const axios = require("axios");
const fs = require("fs");
const path = require("path");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || fs.readFileSync(path.join(__dirname, "../.env"), "utf8").match(/OPENAI_API_KEY=(.+)/)?.[1];

if (!OPENAI_API_KEY) {
  console.error("No OPENAI_API_KEY found");
  process.exit(1);
}

const SYSTEM_PROMPT = `You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {"food": "clean name including quantity", "calories": integer, "protein": integer, "carbs": integer, "fat": integer, "fibre": integer, "estimatedPriceZAR": integer_or_null}. All macros in grams. fibre = dietary fibre in grams. estimatedPriceZAR is the approximate cost in South African Rands at a restaurant/store (null if homemade or unknown). Use 2025/2026 SA prices. Examples: Nando's quarter chicken ~R75, Steers Wacky Wednesday burger ~R50, Kauai smoothie ~R65, Woolworths ready meal ~R60. CRITICAL RULES: 1) ONLY estimate what was explicitly mentioned - do NOT add extra foods. If user says 'scrambled', return 'scrambled eggs' ONLY - do not add toast, bacon, or other items unless specifically mentioned. If user says 'toast', return toast only - do not add eggs. 2) RESPECT SINGULAR vs PLURAL: 'egg' = 1 egg (~70 cal), 'eggs' = 2 eggs (~140 cal). 'slice of toast' = 1 slice, 'toast' = 2 slices. 'banana' = 1 banana. 'chicken breast' = 1 breast. Always default to the SINGULAR quantity unless the user uses plural or specifies a number. 3) If the description mentions a quantity (e.g. 'two', 'three', '2x', '3 slices'), multiply the calories AND macros accordingly and include the quantity in the food name. Example: 'two toasted cheese sandwiches' → {"food": "2x toasted cheese sandwich", "calories": 800, "protein": 30, "carbs": 80, "fat": 35, "fibre": 4, "estimatedPriceZAR": null}. 4) Use realistic everyday South African portion sizes - not restaurant or oversized portions. 5) Drinks must use FULL SERVING sizes: beer=440ml (~155 cal), Red Bull=250ml (~112 cal), Monster=500ml (~230 cal), wine glass=175ml (~125 cal), cider=330ml (~170 cal). NEVER use per-100ml values. 6) SA portions: 1 slice cheese=~60 cal (thin processed like Clover), 1 slice bread=~80 cal, 1 egg=~70 cal, biltong 50g=~125 cal, droewors 50g=~150 cal, handful of nuts=~160 cal (28g). 7) Bunny chow quarter=~650 cal (bread bowl + curry). 8) COOKING FATS: For fried/scrambled eggs add +30 cal per egg (oil/butter), for fried chicken/meat add +20% calories (oil), for sautéed vegetables add +50 cal (oil), for cooked rice/pasta assume butter/oil already included in base values. 9) COMPOSITE MEALS: When multiple ingredients are listed (e.g. 'chicken with rice and veg'), sum ALL components realistically. Chicken breast 165 cal + 1 cup rice 200 cal + vegetables 50 cal = 415 cal minimum. DO NOT underestimate. 10) If you return less than 200 cal for a meal with 3+ ingredients, you're probably wrong - recalculate. 11) PORTION SIZE: Always include estimated portion weight in the food name when the input is vague. 'chicken' → 'Chicken breast (~150g)', 'rice' → 'Rice (1 cup, ~200g)', 'pasta' → 'Pasta (1 cup cooked, ~200g)', 'steak' → 'Steak (~200g)'. If user specifies a size (e.g. 'large chicken breast', 'small portion'), adjust calories accordingly. Large portions = +40%, small = -30%. 12) CHICKEN GUIDE: Plain 'chicken' = 1 medium chicken breast (~130g, 200 cal). 'Chicken thigh' = 1 thigh with skin (~100g, 200 cal). 'Chicken drumstick' = 1 drumstick (~85g, 150 cal). 'Fried chicken' = 1 piece KFC-style (~170g, 280 cal). 'Half chicken' = ~350g, 480 cal. 'Quarter chicken' = ~175g, 250 cal (Nando's style). Always specify the cut and weight in the food name. 13) CONSERVATIVE BIAS: When portion size is uncertain, estimate on the LOWER end. Assume home-cooked portions are modest, not restaurant-sized. A typical plate of rice is ~150g cooked (~180 cal), not 200g. A typical serving of meat is ~120-150g, not 200g. People tend to overestimate how much they eat. Better to be slightly under than over — users can always add more. No extra text.`;

const newCases = [
  ["kfc mash and gravy", 150, 250],
  ["hungry lion chicken burger", 450, 700],
  ["nandos veggie burger", 400, 650],
  ["wimpy chicken mayo wrap", 450, 700],
  ["boerewors roll with chakalaka", 450, 700],
  ["kota with atchar and cheese", 650, 950],
  ["roman's pizza cheesy garlic roll", 300, 500],
  ["woolworths chicken biryani ready meal", 450, 700],
  ["sparletta creme soda 500ml", 200, 320],
  ["steers chicken mayo burger", 450, 700]
];

async function testItem(food) {
  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Nutrition for: ${food}` }
        ],
        temperature: 0.2
      },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, timeout: 10000 }
    );
    const text = res.data.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text);
    return parsed;
  } catch (e) {
    return { error: e.message, calories: -1 };
  }
}

async function main() {
  const libPath = path.join(__dirname, "edge-case-library.json");
  const existing = JSON.parse(fs.readFileSync(libPath, "utf8"));
  const existingSet = new Set(existing.map(([food]) => food));
  const cases = newCases.filter(([food]) => !existingSet.has(food));

  console.log(`Testing ${cases.length} new items...`);

  const results = [];
  const failures = [];

  for (let i = 0; i < cases.length; i += 5) {
    const batch = cases.slice(i, i + 5);
    const promises = batch.map(async ([food, minCal, maxCal]) => {
      const result = await testItem(food);
      const cal = result.calories;
      const pass = cal >= minCal && cal <= maxCal;
      const item = { food, expected: [minCal, maxCal], got: cal, pass, result };
      results.push(item);
      if (!pass) {
        failures.push(item);
        console.log(`  ❌ "${food}": got ${cal} cal (expected ${minCal}-${maxCal}) ${cal < minCal ? '↓ TOO LOW' : '↑ TOO HIGH'}`);
      } else {
        console.log(`  ✅ "${food}": ${cal} cal`);
      }
      return item;
    });
    await Promise.all(promises);
    if (i + 5 < cases.length) await new Promise(r => setTimeout(r, 1000));
  }

  const outPath = path.join(__dirname, "latest-results.json");
  fs.writeFileSync(outPath, JSON.stringify({
    date: new Date().toISOString(),
    total: results.length,
    passed: results.filter(r => r.pass).length,
    failed: failures.length,
    failures: failures.map(f => ({ food: f.food, expected: f.expected, got: f.got, aiResult: f.result }))
  }, null, 2));

  console.log(`\n=== RESULTS ===`);
  console.log(`Total: ${results.length}, Passed: ${results.filter(r => r.pass).length}, Failed: ${failures.length}`);
  if (failures.length > 0) {
    console.log(`\n=== FAILURES (need overrides?) ===`);
    for (const f of failures) {
      console.log(`"${f.food}": got ${f.got} cal (expected ${f.expected[0]}-${f.expected[1]}), AI returned: ${JSON.stringify(f.result)}`);
    }
  }
}

main().catch(console.error);
