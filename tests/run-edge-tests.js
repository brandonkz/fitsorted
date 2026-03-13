#!/usr/bin/env node
// FitSorted Edge Case Tester - runs all items against OpenAI API

const axios = require("axios");
const fs = require("fs");
const path = require("path");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || fs.readFileSync(path.join(__dirname, "../.env"), "utf8").match(/OPENAI_API_KEY=(.+)/)?.[1];

if (!OPENAI_API_KEY) {
  console.error("No OPENAI_API_KEY found");
  process.exit(1);
}

const SYSTEM_PROMPT = `You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {"food": "clean name including quantity", "calories": integer, "protein": integer, "carbs": integer, "fat": integer, "fibre": integer, "estimatedPriceZAR": integer_or_null}. All macros in grams. fibre = dietary fibre in grams. estimatedPriceZAR is the approximate cost in South African Rands at a restaurant/store (null if homemade or unknown). Use 2025/2026 SA prices. Examples: Nando's quarter chicken ~R75, Steers Wacky Wednesday burger ~R50, Kauai smoothie ~R65, Woolworths ready meal ~R60. CRITICAL RULES: 1) ONLY estimate what was explicitly mentioned - do NOT add extra foods. If user says 'scrambled', return 'scrambled eggs' ONLY - do not add toast, bacon, or other items unless specifically mentioned. If user says 'toast', return toast only - do not add eggs. 2) RESPECT SINGULAR vs PLURAL: 'egg' = 1 egg (~70 cal), 'eggs' = 2 eggs (~140 cal). 'slice of toast' = 1 slice, 'toast' = 2 slices. 'banana' = 1 banana. 'chicken breast' = 1 breast. Always default to the SINGULAR quantity unless the user uses plural or specifies a number. 3) If the description mentions a quantity (e.g. 'two', 'three', '2x', '3 slices'), multiply the calories AND macros accordingly and include the quantity in the food name. Example: 'two toasted cheese sandwiches' → {"food": "2x toasted cheese sandwich", "calories": 800, "protein": 30, "carbs": 80, "fat": 35, "fibre": 4, "estimatedPriceZAR": null}. 4) Use realistic everyday South African portion sizes - not restaurant or oversized portions. 5) Drinks must use FULL SERVING sizes: beer=440ml (~155 cal), Red Bull=250ml (~112 cal), Monster=500ml (~230 cal), wine glass=175ml (~125 cal), cider=330ml (~170 cal). NEVER use per-100ml values. 6) SA portions: 1 slice cheese=~60 cal (thin processed like Clover), 1 slice bread=~80 cal, 1 egg=~70 cal, biltong 50g=~125 cal, droewors 50g=~150 cal, handful of nuts=~160 cal (28g). 7) Bunny chow quarter=~650 cal (bread bowl + curry). No extra text.`;

async function testItem(food) {
  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: food }
        ],
        temperature: 0.3,
        max_tokens: 200
      },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" } }
    );
    const text = res.data.choices[0].message.content.trim();
    const parsed = JSON.parse(text);
    return parsed;
  } catch (e) {
    return { error: e.message, calories: -1 };
  }
}

async function main() {
  // Load existing test cases
  const libPath = path.join(__dirname, "edge-case-library.json");
  const existing = JSON.parse(fs.readFileSync(libPath, "utf8"));

  // New 20 test cases
  const newCases = [
    ["biltong 100g", 200, 320],
    ["gatsby chicken", 800, 1200],
    ["spur cheese burger", 550, 800],
    ["wimpy toasted sandwich", 350, 550],
    ["checkers chicken strips", 300, 500],
    ["woolworths mac and cheese", 350, 550],
    ["pnp cream soda 2l", 600, 900],
    ["stoney ginger beer", 150, 240],
    ["iron brew", 150, 230],
    ["sparletta pine nut", 150, 230],
    ["pie from garage", 350, 550],
    ["nandos full chicken", 1800, 2600],
    ["chicken licken hotwings 6", 500, 750],
    ["fishaways hake and chips", 500, 800],
    ["ocean basket prawns", 350, 550],
    ["vida e caffe croissant", 250, 400],
    ["woolworths sushi 12 pack", 400, 650],
    ["spur ribs full rack", 900, 1400],
    ["two slices polony on bread", 200, 380],
    ["simba chips original", 400, 600]
  ];

  const allCases = [...existing, ...newCases];
  
  console.log(`Testing ${allCases.length} items (${existing.length} existing + ${newCases.length} new)...`);
  
  const results = [];
  const failures = [];
  
  // Test in batches of 5 to avoid rate limits
  for (let i = 0; i < allCases.length; i += 5) {
    const batch = allCases.slice(i, i + 5);
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
    // Small delay between batches
    if (i + 5 < allCases.length) await new Promise(r => setTimeout(r, 1000));
  }

  // Write results
  const outPath = path.join(__dirname, "test-results.json");
  fs.writeFileSync(outPath, JSON.stringify({ 
    date: new Date().toISOString(),
    total: results.length,
    passed: results.filter(r => r.pass).length,
    failed: failures.length,
    failures: failures.map(f => ({ food: f.food, expected: f.expected, got: f.got, aiResult: f.result }))
  }, null, 2));
  
  // Save updated library with new cases
  fs.writeFileSync(libPath, JSON.stringify(allCases, null, 2));
  
  console.log(`\n=== RESULTS ===`);
  console.log(`Total: ${results.length}, Passed: ${results.filter(r => r.pass).length}, Failed: ${failures.length}`);
  console.log(`\nFailures saved to: ${outPath}`);
  
  if (failures.length > 0) {
    console.log(`\n=== FAILURES (need overrides) ===`);
    for (const f of failures) {
      console.log(`"${f.food}": got ${f.got} cal (expected ${f.expected[0]}-${f.expected[1]}), AI returned: ${JSON.stringify(f.result)}`);
    }
  }
}

main().catch(console.error);
