#!/usr/bin/env node
// Nightly edge case test - 2026-04-04
const fs = require('fs');
const path = require('path');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY not set');
  process.exit(1);
}

// 10 new random SA food test cases: [name, minCal, maxCal]
const newTestCases = [
  ["woolworths chicken mayo sub", 400, 650],
  ["steers loaded nachos", 600, 1000],
  ["nandos garlic bread", 180, 320],
  ["spur baby back ribs", 800, 1200],
  ["checkers peppered steak pie", 350, 550],
  ["chicken licken crunch burger", 450, 700],
  ["mcdonalds quarter pounder", 450, 600],
  ["vida e caffe chocolate muffin", 350, 500],
  ["hunters edge", 100, 180],
  ["woolworths chicken tikka pizza slice", 250, 450]
];

const systemPrompt = `You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {"food": "clean name including quantity", "calories": integer, "protein": integer, "carbs": integer, "fat": integer, "fibre": integer, "estimatedPriceZAR": integer_or_null}. All macros in grams. fibre = dietary fibre in grams. estimatedPriceZAR is the approximate cost in South African Rands at a restaurant/store (null if homemade or unknown). Use 2025/2026 SA prices. Examples: Nando's quarter chicken ~R75, Steers Wacky Wednesday burger ~R50, Kauai smoothie ~R65, Woolworths ready meal ~R60. CRITICAL RULES: 1) ONLY estimate what was explicitly mentioned - do NOT add extra foods. If user says 'scrambled', return 'scrambled eggs' ONLY - do not add toast, bacon, or other items unless specifically mentioned. If user says 'toast', return toast only - do not add eggs. 2) RESPECT SINGULAR vs PLURAL: 'egg' = 1 egg (~70 cal), 'eggs' = 2 eggs (~140 cal). 'slice of toast' = 1 slice, 'toast' = 2 slices. 'banana' = 1 banana. 'chicken breast' = 1 breast. Always default to the SINGULAR quantity unless the user uses plural or specifies a number. 3) If the description mentions a quantity (e.g. 'two', 'three', '2x', '3 slices'), multiply the calories AND macros accordingly and include the quantity in the food name. 4) Use realistic everyday South African portion sizes - not restaurant or oversized portions. 5) Drinks must use FULL SERVING sizes: beer=440ml (~155 cal), Red Bull=250ml (~112 cal), Monster=500ml (~230 cal), wine glass=175ml (~125 cal), cider=330ml (~170 cal). NEVER use per-100ml values. 6) SA portions: 1 slice cheese=~60 cal (thin processed like Clover), 1 slice bread=~80 cal, 1 egg=~70 cal, biltong 50g=~125 cal, droewors 50g=~150 cal, handful of nuts=~160 cal (28g). 7) Bunny chow quarter=~650 cal (bread bowl + curry). 8) COOKING FATS: For fried/scrambled eggs add +30 cal per egg (oil/butter), for fried chicken/meat add +20% calories (oil), for sautéed vegetables add +50 cal (oil), for cooked rice/pasta assume butter/oil already included in base values. 9) COMPOSITE MEALS: When multiple ingredients are listed (e.g. 'chicken with rice and veg'), sum ALL components realistically. Chicken breast 165 cal + 1 cup rice 200 cal + vegetables 50 cal = 415 cal minimum. DO NOT underestimate. 10) If you return less than 200 cal for a meal with 3+ ingredients, you're probably wrong - recalculate. 11) PORTION SIZE: Always include estimated portion weight in the food name when the input is vague. 12) CHICKEN GUIDE: Plain 'chicken' = 1 medium chicken breast (~130g, 200 cal). 13) CONSERVATIVE BIAS: When portion size is uncertain, estimate on the LOWER end. No extra text.`;

async function testFood(foodName) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: foodName }
      ],
      temperature: 0.3
    })
  });
  
  const data = await response.json();
  const content = data.choices[0].message.content.trim();
  
  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

async function main() {
  const results = [];
  const failures = [];
  
  console.log('Testing 10 new edge cases against OpenAI API...\n');
  
  for (const [name, minCal, maxCal] of newTestCases) {
    const result = await testFood(name);
    if (!result) {
      console.log(`❌ ${name}: API returned unparseable response`);
      failures.push({ name, reason: 'unparseable', minCal, maxCal });
      results.push({ name, minCal, maxCal, aiCal: null, passed: false });
      continue;
    }
    
    const aiCal = result.calories;
    const passed = aiCal >= minCal && aiCal <= maxCal;
    
    if (passed) {
      console.log(`✅ ${name}: ${aiCal} cal (range: ${minCal}-${maxCal})`);
    } else {
      console.log(`❌ ${name}: ${aiCal} cal (expected: ${minCal}-${maxCal}) — protein:${result.protein}g carbs:${result.carbs}g fat:${result.fat}g`);
      failures.push({ 
        name, 
        aiCal, 
        minCal, 
        maxCal, 
        protein: result.protein,
        carbs: result.carbs,
        fat: result.fat,
        fibre: result.fibre || 0,
        food: result.food
      });
    }
    
    results.push({ name, minCal, maxCal, aiCal, passed, result });
    
    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`\n--- Summary ---`);
  console.log(`Tested: ${results.length}`);
  console.log(`Passed: ${results.filter(r => r.passed).length}`);
  console.log(`Failed: ${failures.length}`);
  
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(JSON.stringify(f));
    }
  }
  
  // Output results as JSON for the parent script
  fs.writeFileSync('/tmp/fitsorted-test-results.json', JSON.stringify({ results, failures, newTestCases }, null, 2));
}

main().catch(console.error);
