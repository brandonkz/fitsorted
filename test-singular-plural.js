require("dotenv").config();
const axios = require("axios");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Copy the exact estimateCalories logic with post-processing
async function estimateCalories(food) {
  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {\"food\": \"clean name including quantity\", \"calories\": integer, \"protein\": integer, \"carbs\": integer, \"fat\": integer, \"fibre\": integer, \"estimatedPriceZAR\": integer_or_null}. All macros in grams. fibre = dietary fibre in grams. estimatedPriceZAR is the approximate cost in South African Rands at a restaurant/store (null if homemade or unknown). Use 2025/2026 SA prices. Examples: Nando's quarter chicken ~R75, Steers Wacky Wednesday burger ~R50, Kauai smoothie ~R65, Woolworths ready meal ~R60. CRITICAL RULES: 1) ONLY estimate what was explicitly mentioned - do NOT add extra foods. If user says 'scrambled', return 'scrambled eggs' ONLY - do not add toast, bacon, or other items unless specifically mentioned. If user says 'toast', return toast only - do not add eggs. 2) RESPECT SINGULAR vs PLURAL: 'egg' = 1 egg (~70 cal), 'eggs' = 2 eggs (~140 cal). 'slice of toast' = 1 slice, 'toast' = 2 slices. 'banana' = 1 banana. 'chicken breast' = 1 breast. Always default to the SINGULAR quantity unless the user uses plural or specifies a number. 3) If the description mentions a quantity (e.g. 'two', 'three', '2x', '3 slices'), multiply the calories AND macros accordingly and include the quantity in the food name. Example: 'two toasted cheese sandwiches' → {\"food\": \"2x toasted cheese sandwich\", \"calories\": 800, \"protein\": 30, \"carbs\": 80, \"fat\": 35, \"fibre\": 4, \"estimatedPriceZAR\": null}. 4) Use realistic everyday South African portion sizes - not restaurant or oversized portions. 5) Drinks must use FULL SERVING sizes: beer=440ml (~155 cal), Red Bull=250ml (~112 cal), Monster=500ml (~230 cal), wine glass=175ml (~125 cal), cider=330ml (~170 cal). NEVER use per-100ml values. 6) SA portions: 1 slice cheese=~60 cal (thin processed like Clover), 1 slice bread=~80 cal, 1 egg=~70 cal, biltong 50g=~125 cal, droewors 50g=~150 cal, handful of nuts=~160 cal (28g). 7) Bunny chow quarter=~650 cal (bread bowl + curry). No extra text." },
        { role: "user", content: `Nutrition for: ${food}` }
      ],
      temperature: 0.2
    },
    { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" } }
  );
  
  const content = res.data.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
  const result = JSON.parse(content);
  
  console.log(`  [RAW AI] ${result.food} - ${result.calories} cal`);
  
  // Clean up duplicate quantity phrases
  if (result.food) {
    result.food = result.food.replace(/(\([^)]+\))\s*\1/g, '$1');
  }
  
  // Post-processing: enforce singular/plural rules
  const inputLower = food.toLowerCase().trim();
  
  const pluralRules = [
    { singular: 'egg', plural: 'eggs', singleCal: 70 },
    { singular: 'banana', plural: 'bananas', singleCal: 105 },
    { singular: 'apple', plural: 'apples', singleCal: 95 },
  ];
  
  for (const rule of pluralRules) {
    // User typed plural but AI returned ~1 portion
    if (inputLower.includes(rule.plural) && !inputLower.match(/\d/) && !inputLower.includes('one ')) {
      if (rule.singleCal && result.calories < rule.singleCal * 1.5) {
        console.log(`  [FIX] Detected plural "${rule.plural}" but AI returned singular → doubling`);
        result.calories *= 2;
        result.protein = (result.protein || 0) * 2;
        result.carbs = (result.carbs || 0) * 2;
        result.fat = (result.fat || 0) * 2;
        result.fibre = (result.fibre || 0) * 2;
        if (!result.food.match(/^2x|^2 /i)) {
          result.food = `2x ${result.food}`;
        }
        break;
      }
    }
    
    // User typed singular but AI returned ~2 portions
    if (inputLower === rule.singular || inputLower.includes(` ${rule.singular} `)) {
      if (rule.singleCal && result.calories > rule.singleCal * 1.5) {
        console.log(`  [FIX] Detected singular "${rule.singular}" but AI returned plural → halving`);
        result.calories = Math.round(result.calories / 2);
        result.protein = Math.round((result.protein || 0) / 2);
        result.carbs = Math.round((result.carbs || 0) / 2);
        result.fat = Math.round((result.fat || 0) / 2);
        result.fibre = Math.round((result.fibre || 0) / 2);
        result.food = result.food.replace(/^2x\s*/i, '').replace(/^2\s+/, '');
        break;
      }
    }
  }
  
  return result;
}

async function test() {
  const tests = [
    { input: "egg", shouldBe: "1 egg, ~70 cal" },
    { input: "eggs", shouldBe: "2 eggs, ~140 cal" },
    { input: "scrambled egg", shouldBe: "1 scrambled egg, ~70 cal" },
    { input: "scrambled eggs", shouldBe: "2 scrambled eggs, ~140 cal" },
    { input: "banana", shouldBe: "1 banana, ~105 cal" },
    { input: "bananas", shouldBe: "2 bananas, ~210 cal" },
  ];
  
  console.log("🧪 Singular/Plural Post-Processing Test\n");
  
  for (const test of tests) {
    console.log(`Input: "${test.input}"`);
    console.log(`Expected: ${test.shouldBe}`);
    
    const result = await estimateCalories(test.input);
    
    console.log(`  [FINAL] ${result.food} - ${result.calories} cal`);
    console.log("");
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

test();
