import OpenAI from 'openai';
import fs from 'fs';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || fs.readFileSync('/Users/brandonkatz/.openclaw/workspace/fitsorted/.env', 'utf8').match(/OPENAI_API_KEY=(.*)/)?.[1]?.trim();

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {"food": "clean name including quantity", "calories": integer, "protein": integer, "carbs": integer, "fat": integer, "fibre": integer, "estimatedPriceZAR": integer_or_null}. All macros in grams. fibre = dietary fibre in grams. estimatedPriceZAR is the approximate cost in South African Rands at a restaurant/store (null if homemade or unknown). Use 2025/2026 SA prices. Examples: Nando's quarter chicken ~R75, Steers Wacky Wednesday burger ~R50, Kauai smoothie ~R65, Woolworths ready meal ~R60. CRITICAL RULES: 1) ONLY estimate what was explicitly mentioned - do NOT add extra foods. If user says 'scrambled', return 'scrambled eggs' ONLY - do not add toast, bacon, or other items unless specifically mentioned. If user says 'toast', return toast only - do not add eggs. 2) RESPECT SINGULAR vs PLURAL: 'egg' = 1 egg (~70 cal), 'eggs' = 2 eggs (~140 cal). 'slice of toast' = 1 slice, 'toast' = 2 slices. 'banana' = 1 banana. 'chicken breast' = 1 breast. Always default to the SINGULAR quantity unless the user uses plural or specifies a number. 3) If the description mentions a quantity (e.g. 'two', 'three', '2x', '3 slices'), multiply the calories AND macros accordingly and include the quantity in the food name. Example: 'two toasted cheese sandwiches' → {"food": "2x toasted cheese sandwich", "calories": 800, "protein": 30, "carbs": 80, "fat": 35, "fibre": 4, "estimatedPriceZAR": null}. 4) Use realistic everyday South African portion sizes - not restaurant or oversized portions. 5) Drinks must use FULL SERVING sizes: beer=440ml (~155 cal), Red Bull=250ml (~112 cal), Monster=500ml (~230 cal), wine glass=175ml (~125 cal), cider=330ml (~170 cal). NEVER use per-100ml values. 6) SA portions: 1 slice cheese=~60 cal (thin processed like Clover), 1 slice bread=~80 cal, 1 egg=~70 cal, biltong 50g=~125 cal, droewors 50g=~150 cal, handful of nuts=~160 cal (28g). 7) Bunny chow quarter=~650 cal (bread bowl + curry). 8) COOKING FATS: For fried/scrambled eggs add +30 cal per egg (oil/butter), for fried chicken/meat add +20% calories (oil), for sautéed vegetables add +50 cal (oil), for cooked rice/pasta assume butter/oil already included in base values. 9) COMPOSITE MEALS: When multiple ingredients are listed (e.g. 'chicken with rice and veg'), sum ALL components realistically. Chicken breast 165 cal + 1 cup rice 200 cal + vegetables 50 cal = 415 cal minimum. DO NOT underestimate. 10) If you return less than 200 cal for a meal with 3+ ingredients, you're probably wrong - recalculate. 11) PORTION SIZE: Always include estimated portion weight in the food name when the input is vague. 'chicken' → 'Chicken breast (~150g)', 'rice' → 'Rice (1 cup, ~200g)', 'pasta' → 'Pasta (1 cup cooked, ~200g)', 'steak' → 'Steak (~200g)'. If user specifies a size (e.g. 'large chicken breast', 'small portion'), adjust calories accordingly. Large portions = +40%, small = -30%. 12) CHICKEN GUIDE: Plain 'chicken' = 1 medium chicken breast (~130g, 200 cal). 'Chicken thigh' = 1 thigh with skin (~100g, 200 cal). 'Chicken drumstick' = 1 drumstick (~85g, 150 cal). 'Fried chicken' = 1 piece KFC-style (~170g, 280 cal). 'Half chicken' = ~350g, 480 cal. 'Quarter chicken' = ~175g, 250 cal (Nando's style). Always specify the cut and weight in the food name. 13) CONSERVATIVE BIAS: When portion size is uncertain, estimate on the LOWER end. Assume home-cooked portions are modest, not restaurant-sized. A typical plate of rice is ~150g cooked (~180 cal), not 200g. A typical serving of meat is ~120-150g, not 200g. People tend to overestimate how much they eat. Better to be slightly under than over — users can always add more. No extra text.`;

// 10 NEW test cases - random SA foods/drinks/combos/restaurant items
const newTestCases = [
  // [name, minCal, maxCal]
  ["kfc twister", 450, 650],
  ["steers bacon cheese burger", 600, 850],
  ["nandos chicken livers and rolls", 450, 700],
  ["roman's pizza large pepperoni", 1800, 2600],
  ["pick n pay rotisserie chicken quarter", 250, 400],
  ["hungry lion 4 piece and chips", 900, 1400],
  ["mugg and bean chicken mayo toasted sandwich", 450, 700],
  ["kauai mango smoothie", 220, 380],
  ["russian roll", 350, 550],
  ["checkers hot dog", 300, 500]
];

async function testFood(foodName) {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: foodName }
    ],
    temperature: 0.3,
  });
  const text = response.choices[0].message.content.trim();
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error(`Failed to parse response for "${foodName}": ${text}`);
    return null;
  }
}

async function main() {
  console.log("🧪 FitSorted Edge Case Testing - Round 25");
  console.log("=" .repeat(50));
  
  const results = [];
  const failures = [];
  
  for (const [name, minCal, maxCal] of newTestCases) {
    try {
      const result = await testFood(name);
      if (!result) {
        console.log(`❌ ${name}: PARSE ERROR`);
        failures.push({ name, reason: "parse error", result: null, expected: [minCal, maxCal] });
        results.push({ name, status: "error" });
        continue;
      }
      
      const cal = result.calories;
      const inRange = cal >= minCal && cal <= maxCal;
      const status = inRange ? "✅" : "❌";
      console.log(`${status} ${name}: ${cal} cal (expected ${minCal}-${maxCal}) → ${result.food}`);
      
      if (!inRange) {
        failures.push({ name, reason: `got ${cal}, expected ${minCal}-${maxCal}`, result, expected: [minCal, maxCal] });
      }
      
      results.push({ name, status: inRange ? "pass" : "fail", calories: cal, expected: [minCal, maxCal], result });
    } catch (e) {
      console.error(`Error testing "${name}": ${e.message}`);
      failures.push({ name, reason: e.message, result: null, expected: [minCal, maxCal] });
      results.push({ name, status: "error" });
    }
    
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log("\n" + "=".repeat(50));
  console.log(`Results: ${results.filter(r => r.status === "pass").length} passed, ${failures.length} failed out of ${newTestCases.length}`);
  
  if (failures.length > 0) {
    console.log("\n🔧 Failures requiring overrides:");
    for (const f of failures) {
      console.log(`  - ${f.name}: ${f.reason}`);
      if (f.result) {
        console.log(`    AI returned: ${JSON.stringify(f.result)}`);
      }
    }
  }
  
  // Output as JSON for processing
  fs.writeFileSync('/Users/brandonkatz/.openclaw/workspace/fitsorted/tests/latest-results.json', JSON.stringify({ results, failures, newTestCases }, null, 2));
  console.log("\nResults saved to tests/latest-results.json");
}

main().catch(console.error);
