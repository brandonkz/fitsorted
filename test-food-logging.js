require("dotenv").config();
const axios = require("axios");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Simulate the estimateCalories function
async function testEstimate(food) {
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
  return JSON.parse(content);
}

const edgeCases = [
  // Singular vs plural
  { input: "egg", expect: "1 egg", expectCal: "~70" },
  { input: "eggs", expect: "2 eggs", expectCal: "~140" },
  { input: "banana", expect: "1 banana", expectCal: "~105" },
  { input: "bananas", expect: "2+ bananas", expectCal: ">200" },
  
  // Very short inputs
  { input: "toast", expect: "2 slices toast", expectCal: "~160" },
  { input: "coffee", expect: "black coffee", expectCal: "~5" },
  { input: "apple", expect: "1 apple", expectCal: "~95" },
  
  // Written numbers
  { input: "two eggs", expect: "2 eggs", expectCal: "~140" },
  { input: "three bananas", expect: "3 bananas", expectCal: "~315" },
  { input: "half chicken", expect: "half chicken", expectCal: "~400" },
  
  // Compound without "and"
  { input: "scrambled", expect: "JUST eggs, NO toast", expectCal: "~140" },
  { input: "scrambled egg", expect: "1 egg ONLY", expectCal: "~70" },
  
  // Ambiguous portions
  { input: "chicken", expect: "reasonable portion", expectCal: "200-300" },
  { input: "rice", expect: "1 cup cooked", expectCal: "~200" },
  { input: "pasta", expect: "1 cup cooked", expectCal: "~200" },
  
  // SA-specific
  { input: "biltong", expect: "~50g portion", expectCal: "~125" },
  { input: "pap", expect: "1 cup", expectCal: "~120" },
  { input: "boerewors", expect: "1 roll/portion", expectCal: "~300" },
  
  // Drinks
  { input: "beer", expect: "1 can 440ml", expectCal: "~155" },
  { input: "wine", expect: "1 glass 175ml", expectCal: "~125" },
  { input: "coke", expect: "1 can 330ml", expectCal: "~139" },
];

async function runTests() {
  console.log("🧪 Testing FitSorted food logging edge cases\n");
  
  let passed = 0;
  let failed = 0;
  const issues = [];
  
  for (const test of edgeCases) {
    try {
      const result = await testEstimate(test.input);
      const foodName = result.food.toLowerCase();
      const calories = result.calories;
      
      console.log(`📝 "${test.input}"`);
      console.log(`   Got: ${result.food} - ${calories} cal`);
      console.log(`   Expected: ${test.expect} (${test.expectCal} cal)`);
      
      // Flag potential issues
      if (test.input === "scrambled" && foodName.includes("toast")) {
        console.log(`   ❌ FAIL: Added toast when user only said "scrambled"`);
        issues.push({ input: test.input, issue: "Hallucinated extra food (toast)", got: result.food });
        failed++;
      } else if (test.input === "egg" && calories > 80) {
        console.log(`   ❌ FAIL: Singular "egg" should be 1 egg (~70 cal), got ${calories} cal`);
        issues.push({ input: test.input, issue: "Ignored singular", got: `${calories} cal` });
        failed++;
      } else if (test.input === "banana" && calories > 120) {
        console.log(`   ❌ FAIL: Singular "banana" should be 1 (~105 cal), got ${calories} cal`);
        issues.push({ input: test.input, issue: "Ignored singular", got: `${calories} cal` });
        failed++;
      } else {
        console.log(`   ✅ OK`);
        passed++;
      }
      
      console.log("");
      
      // Rate limit protection
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (err) {
      console.log(`   ❌ ERROR: ${err.message}\n`);
      failed++;
    }
  }
  
  console.log("\n" + "=".repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (issues.length > 0) {
    console.log("\n🚨 Issues found:");
    issues.forEach(({ input, issue, got }) => {
      console.log(`   • "${input}": ${issue} → ${got}`);
    });
  } else {
    console.log("\n🎉 All tests passed!");
  }
}

runTests();
