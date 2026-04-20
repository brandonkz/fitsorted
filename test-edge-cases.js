require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const testCases = [
  ['steers mega chops', 400, 650],
  ['dischem mass gainer', 250, 450],
  ['fanta orange 330ml', 100, 180],
  ['woolworths chicken schnitzel meal', 400, 650],
  ['crumpets 2', 150, 280],
  ['mielie bread slice', 80, 180],
  ['honey and oats cereal', 200, 350],
  ['spur chicken nuggets 6', 350, 550],
  ['fruit and yogurt', 150, 300],
  ['potato wedges', 200, 400]
];

const systemPrompt = `You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {"food": "clean name including quantity", "calories": integer, "protein": integer, "carbs": integer, "fat": integer, "fibre": integer, "estimatedPriceZAR": integer_or_null}. All macros in grams. fibre = dietary fibre in grams. estimatedPriceZAR is the approximate cost in South African Rands at a restaurant/store (null if homemade or unknown). Use 2025/2026 SA prices. Examples: Nando's quarter chicken ~R75, Steers Wacky Wednesday burger ~R50, Kauai smoothie ~R65, Woolworths ready meal ~R60. CRITICAL RULES: 1) ONLY estimate what was explicitly mentioned - do NOT add extra foods. If user says 'scrambled', return 'scrambled eggs' ONLY - do not add toast, bacon, or other items unless specifically mentioned. If user says 'toast', return toast only - do not add eggs. 2) RESPECT SINGULAR vs PLURAL: 'egg' = 1 egg (~70 cal), 'eggs' = 2 eggs (~140 cal). 'slice of toast' = 1 slice, 'toast' = 2 slices. 'banana' = 1 banana. 'chicken breast' = 1 breast. Always default to the SINGULAR quantity unless the user uses plural or specifies a number. 3) If the description mentions a quantity (e.g. 'two', 'three', '2x', '3 slices'), multiply the calories AND macros accordingly and include the quantity in the food name. Example: 'two toasted cheese sandwiches' → {"food": "2x toasted cheese sandwich", "calories": 800, "protein": 30, "carbs": 80, "fat": 35, "fibre": 4, "estimatedPriceZAR": null}. 4) Use realistic everyday South African portion sizes - not restaurant or oversized portions. 5) Drinks must use FULL SERVING sizes: beer=440ml (~155 cal), Red Bull=250ml (~112 cal), Monster=500ml (~230 cal), wine glass=175ml (~125 cal), cider=330ml (~170 cal). NEVER use per-100ml values. 6) SA portions: 1 slice cheese=~60 cal (thin processed like Clover), 1 slice bread=~80 cal, 1 egg=~70 cal, biltong 50g=~125 cal, droewors 50g=~150 cal, handful of nuts=~160 cal (28g). 7) Bunny chow quarter=~650 cal (bread bowl + curry). 8) COOKING FATS: For fried/scrambled eggs add +30 cal per egg (oil/butter), for fried chicken/meat add +20% calories (oil), for sautéed vegetables add +50 cal (oil), for cooked rice/pasta assume butter/oil already included in base values. 9) COMPOSITE MEALS: When multiple ingredients are listed (e.g. 'chicken with rice and veg'), sum ALL components realistically. Chicken breast 165 cal + 1 cup rice 200 cal + vegetables 50 cal = 415 cal minimum. DO NOT underestimate. 10) If you return less than 200 cal for a meal with 3+ ingredients, you're probably wrong - recalculate. 11) PORTION SIZE: Always include estimated portion weight in the food name when the input is vague. 'chicken' → 'Chicken breast (~150g)', 'rice' → 'Rice (1 cup, ~200g)', 'pasta' → 'Pasta (1 cup cooked, ~200g)', 'steak' → 'Steak (~200g)'. If user specifies a size (e.g. 'large chicken breast', 'small portion'), adjust calories accordingly. Large portions = +40%, small = -30%. 12) CHICKEN GUIDE: Plain 'chicken' = 1 medium chicken breast (~130g, 200 cal). 'Chicken thigh' = 1 thigh with skin (~100g, 200 cal). 'Chicken drumstick' = 1 drumstick (~85g, 150 cal). 'Fried chicken' = 1 piece KFC-style (~170g, 280 cal). 'Half chicken' = ~350g, 480 cal. 'Quarter chicken' = ~175g, 250 cal (Nando's style). Always specify the cut and weight in the food name. 13) CONSERVATIVE BIAS: When portion size is uncertain, estimate on the LOWER end. Assume home-cooked portions are modest, not restaurant-sized. A typical plate of rice is ~150g cooked (~180 cal), not 200g. A typical serving of meat is ~120-150g, not 200g. People tend to overestimate how much they eat. Better to be slightly under than over — users can always add more. No extra text.`;

async function test() {
  let results = [];
  for (const [food, minCal, maxCal] of testCases) {
    try {
      const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: food }
        ],
        temperature: 0.3
      }, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 10000 });
      
      const content = resp.data.choices[0].message.content;
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch(e) {
        const match = content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(match[0]);
      }
      const cal = parsed.calories;
      const inRange = cal >= minCal && cal <= maxCal;
      results.push({ food, expected: [minCal, maxCal], actual: cal, inRange, parsed });
      console.log(JSON.stringify({ food, expected: [minCal, maxCal], actual: cal, inRange }));
    } catch (e) {
      results.push({ food, expected: [minCal, maxCal], error: e.message });
      console.log(JSON.stringify({ food, expected: [minCal, maxCal], error: e.message }));
    }
  }
  
  fs.writeFileSync('./test-results.json', JSON.stringify(results, null, 2));
  console.log('\n=== Summary ===');
  const passed = results.filter(r => r.inRange).length;
  const failed = results.filter(r => !r.inRange && !r.error).length;
  console.log(`Passed: ${passed}/${testCases.length}`);
  console.log(`Failed: ${failed}/${testCases.length}`);
  if (failed > 0) {
    console.log('\nFailed items:');
    results.filter(r => !r.inRange && !r.error).forEach(r => {
      console.log(`  ${r.food}: expected ${r.expected[0]}-${r.expected[1]}, got ${r.actual}`);
    });
  }
}

test();