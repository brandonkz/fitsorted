#!/usr/bin/env node
// Nightly edge case test - 2026-03-21
const axios = require('axios');
const fs = require('fs');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY not set");
  process.exit(1);
}

// 10 new test cases: [name, minCal, maxCal]
const newTests = [
  ["woolworths chicken mayo sandwich", 350, 550],
  ["droewors biltong combo 100g", 250, 400],
  ["steers flame grilled chicken burger", 450, 700],
  ["kfc dunked wings 6", 500, 800],
  ["amarula on ice", 200, 320],
  ["spur pancake stack", 500, 800],
  ["pick n pay rotisserie chicken thigh", 200, 350],
  ["checkers cheese grillers 2", 250, 450],
  ["mageu 500ml", 180, 320],
  ["gatsby vienna", 700, 1100]
];

const SYSTEM_PROMPT = `You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {"food": "clean name including quantity", "calories": integer, "protein": integer, "carbs": integer, "fat": integer, "fibre": integer, "estimatedPriceZAR": integer_or_null}. All macros in grams. fibre = dietary fibre in grams. estimatedPriceZAR is the approximate cost in South African Rands at a restaurant/store (null if homemade or unknown). Use 2025/2026 SA prices. CRITICAL RULES: 1) ONLY estimate what was explicitly mentioned. 2) RESPECT SINGULAR vs PLURAL. 3) If the description mentions a quantity, multiply accordingly. 4) Use realistic everyday South African portion sizes. 5) Drinks must use FULL SERVING sizes: beer=440ml (~155 cal), Red Bull=250ml (~112 cal), Monster=500ml (~230 cal), wine glass=175ml (~125 cal), cider=330ml (~170 cal). 6) SA portions: 1 slice cheese=~60 cal, 1 slice bread=~80 cal, 1 egg=~70 cal, biltong 50g=~125 cal, droewors 50g=~150 cal, handful of nuts=~160 cal. 7) Bunny chow quarter=~650 cal. 8) COOKING FATS: For fried/scrambled eggs add +30 cal per egg. 9) COMPOSITE MEALS: sum ALL components realistically. 10) If you return less than 200 cal for a meal with 3+ ingredients, recalculate. No extra text.`;

async function testItem(foodName) {
  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: foodName }
        ],
        temperature: 0.2
      },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" } }
    );
    const content = res.data.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error testing "${foodName}": ${err.message}`);
    return null;
  }
}

async function main() {
  const results = [];
  
  for (const [name, minCal, maxCal] of newTests) {
    const result = await testItem(name);
    const calories = result ? result.calories : null;
    const pass = calories !== null && calories >= minCal && calories <= maxCal;
    results.push({ name, minCal, maxCal, aiCalories: calories, pass, aiResult: result });
    console.log(`${pass ? '✅' : '❌'} ${name}: AI=${calories} (expected ${minCal}-${maxCal})`);
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log("\n--- RESULTS ---");
  console.log(JSON.stringify(results, null, 2));
}

main();
