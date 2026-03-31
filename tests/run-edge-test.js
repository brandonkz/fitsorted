#!/usr/bin/env node
// Nightly Edge Case Test - Round 24 (2026-03-31)
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SYSTEM_PROMPT = `You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {"food": "clean name including quantity", "calories": integer, "protein": integer, "carbs": integer, "fat": integer, "fibre": integer, "estimatedPriceZAR": integer_or_null}. All macros in grams. fibre = dietary fibre in grams. estimatedPriceZAR is the approximate cost in South African Rands at a restaurant/store (null if homemade or unknown). Use 2025/2026 SA prices. CRITICAL RULES: 1) ONLY estimate what was explicitly mentioned - do NOT add extra foods. 2) RESPECT SINGULAR vs PLURAL. 3) If the description mentions a quantity, multiply accordingly. 4) Use realistic everyday South African portion sizes. 5) Drinks must use FULL SERVING sizes: beer=440ml (~155 cal), Red Bull=250ml (~112 cal), Monster=500ml (~230 cal), wine glass=175ml (~125 cal), cider=330ml (~170 cal). 6) SA portions: 1 slice cheese=~60 cal, 1 slice bread=~80 cal, 1 egg=~70 cal, biltong 50g=~125 cal, droewors 50g=~150 cal, handful of nuts=~160 cal (28g). 7) CONSERVATIVE BIAS: When portion size is uncertain, estimate on the LOWER end. No extra text.`;

const NEW_TEST_CASES = [
  // Random SA foods, drinks, snacks, combos, restaurant items
  ["wimpy cheese burger", 500, 750],
  ["spur chicken wings 12", 900, 1300],
  ["woolworths chicken tikka salad", 250, 450],
  ["mageu 250ml", 90, 180],
  ["chutney sandwich", 200, 350],
  ["samoosa 1", 80, 200],
  ["grilled chicken salad", 250, 450],
  ["steers flame grilled rib burger", 550, 850],
  ["kfc colonel burger", 450, 700],
  ["nandos butterfly chicken", 1200, 1800],
];

async function callOpenAI(food) {
  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Nutrition for: ${food}` },
      ],
      temperature: 0.2,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );
  const content = res.data.choices[0].message.content
    .trim()
    .replace(/```json|```/g, "")
    .trim();
  return JSON.parse(content);
}

async function main() {
  const results = [];
  const failures = [];

  for (const [food, minCal, maxCal] of NEW_TEST_CASES) {
    try {
      // Add 1.5s delay between calls to avoid rate limits
      await new Promise((r) => setTimeout(r, 1500));
      const ai = await callOpenAI(food);
      const cal = ai.calories;
      const pass = cal >= minCal && cal <= maxCal;
      results.push({ food, minCal, maxCal, aiCal: cal, pass, ai });
      if (!pass) {
        failures.push({ food, minCal, maxCal, aiCal: cal, ai });
      }
      console.log(
        `${pass ? "✅" : "❌"} "${food}" → ${cal} cal (expected ${minCal}-${maxCal})${
          !pass ? ` | protein:${ai.protein} carbs:${ai.carbs} fat:${ai.fat} fibre:${ai.fibre}` : ""
        }`
      );
    } catch (e) {
      console.error(`⚠️ Error testing "${food}":`, e.message);
      results.push({ food, minCal, maxCal, aiCal: -1, pass: false, error: e.message });
      failures.push({ food, minCal, maxCal, aiCal: -1, error: e.message });
    }
  }

  // Output results as JSON for the parent process
  const output = { results, failures, tested: results.length, failed: failures.length };
  fs.writeFileSync(path.join(__dirname, "last-run-results.json"), JSON.stringify(output, null, 2));
  console.log(`\n--- SUMMARY ---`);
  console.log(`Tested: ${results.length}, Failed: ${failures.length}`);
  if (failures.length > 0) {
    console.log(`\nFailures:`);
    for (const f of failures) {
      console.log(`  "${f.food}": AI=${f.aiCal} expected=${f.minCal}-${f.maxCal}`);
      if (f.ai) console.log(`    Full: protein=${f.ai.protein} carbs=${f.ai.carbs} fat=${f.ai.fat} fibre=${f.ai.fibre}`);
    }
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
