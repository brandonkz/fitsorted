import axios from "axios";
import fs from "fs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SYSTEM_PROMPT = `You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {"food": "clean name including quantity", "calories": integer, "protein": integer, "carbs": integer, "fat": integer, "fibre": integer, "estimatedPriceZAR": integer_or_null}. All macros in grams. fibre = dietary fibre in grams. estimatedPriceZAR is the approximate cost in South African Rands at a restaurant/store (null if homemade or unknown). Use 2025/2026 SA prices. Examples: Nando's quarter chicken ~R75, Steers Wacky Wednesday burger ~R50, Kauai smoothie ~R65, Woolworths ready meal ~R60. CRITICAL RULES: 1) ONLY estimate what was explicitly mentioned - do NOT add extra foods. If user says 'scrambled', return 'scrambled eggs' ONLY - do not add toast, bacon, or other items unless specifically mentioned. If user says 'toast', return toast only - do not add eggs. 2) RESPECT SINGULAR vs PLURAL: 'egg' = 1 egg (~70 cal), 'eggs' = 2 eggs (~140 cal). 'slice of toast' = 1 slice, 'toast' = 2 slices. 'banana' = 1 banana. 'chicken breast' = 1 breast. Always default to the SINGULAR quantity unless the user uses plural or specifies a number. 3) If the description mentions a quantity (e.g. 'two', 'three', '2x', '3 slices'), multiply the calories AND macros accordingly and include the quantity in the food name. Example: 'two toasted cheese sandwiches' → {"food": "2x toasted cheese sandwich", "calories": 800, "protein": 30, "carbs": 80, "fat": 35, "fibre": 4, "estimatedPriceZAR": null}. 4) Use realistic everyday South African portion sizes - not restaurant or oversized portions. 5) Drinks must use FULL SERVING sizes: beer=440ml (~155 cal), Red Bull=250ml (~112 cal), Monster=500ml (~230 cal), wine glass=175ml (~125 cal), cider=330ml (~170 cal). NEVER use per-100ml values. 6) SA portions: 1 slice cheese=~60 cal (thin processed like Clover), 1 slice bread=~80 cal, 1 egg=~70 cal, biltong 50g=~125 cal, droewors 50g=~150 cal, handful of nuts=~160 cal (28g). 7) Bunny chow quarter=~650 cal (bread bowl + curry). 8) COOKING FATS: For fried/scrambled eggs add +30 cal per egg (oil/butter), for fried chicken/meat add +20% calories (oil), for sautéed vegetables add +50 cal (oil), for cooked rice/pasta assume butter/oil already included in base values. 9) COMPOSITE MEALS: When multiple ingredients are listed (e.g. 'chicken with rice and veg'), sum ALL components realistically. Chicken breast 165 cal + 1 cup rice 200 cal + vegetables 50 cal = 415 cal minimum. DO NOT underestimate. 10) If you return less than 200 cal for a meal with 3+ ingredients, you're probably wrong - recalculate. 11) PORTION SIZE: Always include estimated portion weight in the food name when the input is vague. 'chicken' → 'Chicken breast (~150g)', 'rice' → 'Rice (1 cup, ~200g)', 'pasta' → 'Pasta (1 cup cooked, ~200g)', 'steak' → 'Steak (~200g)'. If user specifies a size (e.g. 'large chicken breast', 'small portion'), adjust calories accordingly. Large portions = +40%, small = -30%. 12) CHICKEN GUIDE: Plain 'chicken' = 1 medium chicken breast (~130g, 200 cal). 'Chicken thigh' = 1 thigh with skin (~100g, 200 cal). 'Chicken drumstick' = 1 drumstick (~85g, 150 cal). 'Fried chicken' = 1 piece KFC-style (~170g, 280 cal). 'Half chicken' = ~350g, 480 cal. 'Quarter chicken' = ~175g, 250 cal (Nando's style). Always specify the cut and weight in the food name. 13) CONSERVATIVE BIAS: When portion size is uncertain, estimate on the LOWER end. Assume home-cooked portions are modest, not restaurant-sized. A typical plate of rice is ~150g cooked (~180 cal), not 200g. A typical serving of meat is ~120-150g, not 200g. People tend to overestimate how much they eat. Better to be slightly under than over — users can always add more. No extra text.`;

const newTestCases = [
  ["woolworths chicken tikka pie", 350, 550],
  ["two slices french toast", 350, 550],
  ["rocomamas loaded fries", 600, 1000],
  ["king pie steak and cheese", 400, 600],
  ["mugg and bean cappuccino", 100, 200],
  ["steers onion rings", 250, 450],
  ["nandos peri peri wrap", 400, 650],
  ["checkers ready meal chicken curry", 350, 600],
  ["bar one milkshake", 450, 700],
  ["woolworths chicken strips 200g", 350, 550]
];

async function callOpenAI(food) {
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
    {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      timeout: 15000
    }
  );
  const content = res.data.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
  return JSON.parse(content);
}

async function main() {
  const results = [];
  const failures = [];

  for (const [food, minCal, maxCal] of newTestCases) {
    try {
      const result = await callOpenAI(food);
      const cal = result.calories;
      const pass = cal >= minCal && cal <= maxCal;
      results.push({ food, expected: `${minCal}-${maxCal}`, got: cal, pass, result });
      if (!pass) {
        failures.push({ food, minCal, maxCal, got: cal, result });
      }
      console.log(`${pass ? "✅" : "❌"} ${food}: ${cal} cal (expected ${minCal}-${maxCal})`);
      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`💥 ${food}: ${err.message}`);
      results.push({ food, expected: `${minCal}-${maxCal}`, got: "ERROR", pass: false });
      failures.push({ food, minCal, maxCal, got: 0, result: { food, calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 } });
    }
  }

  // Output results as JSON for the parent to process
  fs.writeFileSync("/Users/brandonkatz/.openclaw/workspace/fitsorted/tests/nightly-results.json", JSON.stringify({ results, failures, newTestCases }, null, 2));
  console.log(`\nDone: ${results.filter(r => r.pass).length}/${results.length} passed, ${failures.length} failures`);
}

main().catch(console.error);
