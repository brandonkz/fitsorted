const axios = require("axios");
const fs = require("fs");

require("dotenv").config({ path: "/Users/brandonkatz/.openclaw/workspace/fitsorted/.env" });
const API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT = `You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {"food": "clean name including quantity", "calories": integer, "protein": integer, "carbs": integer, "fat": integer, "fibre": integer, "estimatedPriceZAR": integer_or_null}. All macros in grams. fibre = dietary fibre in grams. estimatedPriceZAR is the approximate cost in South African Rands at a restaurant/store (null if homemade or unknown). Use 2025/2026 SA prices. CRITICAL RULES: 1) ONLY estimate what was explicitly mentioned. 2) RESPECT SINGULAR vs PLURAL. 3) Use realistic everyday South African portion sizes. 4) Drinks must use FULL SERVING sizes: beer=440ml (~155 cal), Red Bull=250ml (~112 cal), Monster=500ml (~230 cal). 5) SA portions: 1 slice cheese=~60 cal, 1 slice bread=~80 cal, 1 egg=~70 cal, biltong 50g=~125 cal. 6) CONSERVATIVE BIAS: estimate on the LOWER end. No extra text.`;

// New test cases for 2026-03-29
const newTests = [
  ["woolworths chicken schnitzel wrap", 350, 600],
  ["checkers footlong", 500, 800],
  ["kfc streetwise 5", 800, 1200],
  ["nandos double chicken burger", 700, 1000],
  ["pick n pay chicken burger", 400, 650],
  ["romany creams 3", 150, 280],
  ["bakers blue label marie biscuits 4", 100, 200],
  ["chicken mayo kota", 550, 850],
  ["pickled fish", 200, 350],
  ["malva pudding", 300, 500]
];

async function testItem(food) {
  const resp = await axios.post("https://api.openai.com/v1/chat/completions", {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: food }
    ],
    temperature: 0.3
  }, { headers: { Authorization: `Bearer ${API_KEY}` } });

  const text = resp.data.choices[0].message.content.trim();
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from text
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error(`Bad JSON: ${text}`);
  }
}

async function main() {
  const results = [];
  const failures = [];

  for (const [food, minCal, maxCal] of newTests) {
    try {
      const res = await testItem(food);
      const cal = res.calories;
      const pass = cal >= minCal && cal <= maxCal;
      results.push({ food, expected: `${minCal}-${maxCal}`, got: cal, pass, aiResult: res });
      if (!pass) {
        failures.push({ food, expected: `${minCal}-${maxCal}`, got: cal, aiResult: res });
      }
      console.log(`${pass ? "✅" : "❌"} ${food}: ${cal} cal (expected ${minCal}-${maxCal})`);
      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.log(`❌ ${food}: ERROR - ${err.message}`);
      results.push({ food, expected: `${minCal}-${maxCal}`, got: "ERROR", pass: false });
      failures.push({ food, expected: `${minCal}-${maxCal}`, got: "ERROR" });
    }
  }

  // Output
  console.log("\n=== SUMMARY ===");
  console.log(`Tested: ${results.length}`);
  console.log(`Passed: ${results.filter(r => r.pass).length}`);
  console.log(`Failed: ${failures.length}`);
  
  if (failures.length > 0) {
    console.log("\n=== FAILURES (need overrides) ===");
    for (const f of failures) {
      console.log(JSON.stringify(f));
    }
  }

  // Write results to file for processing
  fs.writeFileSync("/Users/brandonkatz/.openclaw/workspace/fitsorted/tests/latest-results.json", JSON.stringify({ results, failures, newTests }, null, 2));
}

main().catch(console.error);
