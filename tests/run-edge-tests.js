#!/usr/bin/env node
// FitSorted Edge Case Calorie Accuracy Tester
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) { console.error("Missing OPENAI_API_KEY"); process.exit(1); }

const SYSTEM_PROMPT = `You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {"food": "clean name including quantity", "calories": integer, "protein": integer, "carbs": integer, "fat": integer, "fibre": integer, "estimatedPriceZAR": integer_or_null}. All macros in grams. fibre = dietary fibre in grams. estimatedPriceZAR is the approximate cost in South African Rands at a restaurant/store (null if homemade or unknown). Use 2025/2026 SA prices. Examples: Nando's quarter chicken ~R75, Steers Wacky Wednesday burger ~R50, Kauai smoothie ~R65, Woolworths ready meal ~R60. IMPORTANT: If the description mentions a quantity (e.g. 'two', 'three', '2x', '3 slices'), multiply the calories AND macros accordingly and include the quantity in the food name. Example: 'two toasted cheese sandwiches' → {"food": "2x toasted cheese sandwich", "calories": 800, "protein": 30, "carbs": 80, "fat": 35, "fibre": 4, "estimatedPriceZAR": null}. Return total values for the full described amount. Use realistic everyday South African portion sizes - not restaurant or oversized portions. CRITICAL RULES: 1) Drinks must use FULL SERVING sizes: beer=440ml (~155 cal), Red Bull=250ml (~112 cal), Monster=500ml (~230 cal), wine glass=175ml (~125 cal), cider=330ml (~170 cal). NEVER use per-100ml values. 2) SA portions: 1 slice cheese=~60 cal (thin processed like Clover), 1 slice bread=~80 cal, 1 egg=~70 cal, biltong 50g=~125 cal, droewors 50g=~150 cal, handful of nuts=~160 cal (28g). 3) Bunny chow quarter=~650 cal (bread bowl + curry). No extra text.`;

async function testFood(food) {
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
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, timeout: 15000 }
    );
    const content = res.data.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
    return JSON.parse(content);
  } catch (e) {
    return { error: e.message, calories: -1 };
  }
}

async function main() {
  const libPath = path.join(__dirname, "edge-case-library.json");
  const existing = JSON.parse(fs.readFileSync(libPath, "utf8"));

  // 20 new test cases - random SA foods, drinks, snacks, combos, restaurant items
  const newCases = [
    ["droewors 100g", 240, 360],
    ["woolworths chicken pie", 350, 550],
    ["steers rib burger", 500, 750],
    ["pick n pay baguette", 250, 400],
    ["rooibos tea with milk", 30, 70],
    ["biltong and cheese platter", 400, 650],
    ["ocean basket calamari", 400, 650],
    ["nandos peri peri chips", 250, 400],
    ["kauai smoothie bowl", 350, 550],
    ["mugg and bean toasted sandwich", 400, 650],
    ["vida e caffe latte", 150, 250],
    ["pronutro with milk", 250, 400],
    ["2 slices toast with butter", 200, 340],
    ["mcflurry", 350, 550],
    ["roman's pizza slice", 250, 400],
    ["boerewors 100g", 250, 350],
    ["provita with cottage cheese", 80, 160],
    ["oros cordial glass", 40, 100],
    ["sasko bread 2 slices", 120, 200],
    ["spur ribs half rack", 500, 800]
  ];

  const allCases = [...existing, ...newCases];
  
  const results = { passed: [], failed: [], errors: [] };
  
  console.log(`Testing ${allCases.length} items (${existing.length} existing + ${newCases.length} new)...\n`);
  
  // Test in batches of 5 to avoid rate limits
  for (let i = 0; i < allCases.length; i += 5) {
    const batch = allCases.slice(i, i + 5);
    const promises = batch.map(async ([food, minCal, maxCal]) => {
      const result = await testFood(food);
      const cal = result.calories;
      const status = (cal >= minCal && cal <= maxCal) ? "PASS" : "FAIL";
      
      if (result.error) {
        results.errors.push({ food, error: result.error });
        console.log(`  ❌ ERROR: "${food}" - ${result.error}`);
      } else if (status === "PASS") {
        results.passed.push({ food, cal, min: minCal, max: maxCal, result });
        console.log(`  ✅ "${food}" → ${cal} cal (expected ${minCal}-${maxCal})`);
      } else {
        results.failed.push({ food, cal, min: minCal, max: maxCal, result });
        console.log(`  ❌ FAIL: "${food}" → ${cal} cal (expected ${minCal}-${maxCal})`);
      }
    });
    await Promise.all(promises);
    // Small delay between batches
    if (i + 5 < allCases.length) await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log(`\n=== RESULTS ===`);
  console.log(`Tested: ${allCases.length}`);
  console.log(`Passed: ${results.passed.length}`);
  console.log(`Failed: ${results.failed.length}`);
  console.log(`Errors: ${results.errors.length}`);
  
  if (results.failed.length > 0) {
    console.log(`\n=== FAILURES ===`);
    results.failed.forEach(f => {
      console.log(`"${f.food}": got ${f.cal} cal, expected ${f.min}-${f.max} | AI returned: ${JSON.stringify(f.result)}`);
    });
  }
  
  // Write results to JSON for processing
  fs.writeFileSync(path.join(__dirname, "test-results.json"), JSON.stringify(results, null, 2));
  
  // Update library with new cases
  const updatedLib = [...existing, ...newCases];
  fs.writeFileSync(libPath, JSON.stringify(updatedLib, null, 2));
  console.log(`\nUpdated edge-case-library.json with ${newCases.length} new test cases.`);
}

main().catch(e => { console.error(e); process.exit(1); });
