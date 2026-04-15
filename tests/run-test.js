const axios = require('axios');
const fs = require('fs');

const SYSTEM_PROMPT = `You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {"food": "clean name including quantity", "calories": integer, "protein": integer, "carbs": integer, "fat": integer, "fibre": integer, "estimatedPriceZAR": integer_or_null}. All macros in grams. fibre = dietary fibre in grams. estimatedPriceZAR is the approximate cost in South African Rands at a restaurant/store (null if homemade or unknown). Use 2025/2026 SA prices. CRITICAL RULES: 1) ONLY estimate what was explicitly mentioned - do NOT add extra foods. 2) RESPECT SINGULAR vs PLURAL: 'egg' = 1 egg (~70 cal), 'eggs' = 2 eggs (~140 cal). 'slice of toast' = 1 slice, 'toast' = 2 slices. Always default to SINGULAR unless user specifies a number. 3) If description mentions quantity ('two', '2x', '3 slices'), multiply accordingly. 4) Use realistic SA portion sizes. 5) Drinks must use FULL SERVING sizes: beer=440ml (~155 cal), Red Bull=250ml (~112 cal), Monster=500ml (~230 cal), wine glass=175ml (~125 cal), cider=330ml (~170 cal). NEVER use per-100ml values. 6) SA portions: 1 slice cheese=~60 cal, 1 slice bread=~80 cal, 1 egg=~70 cal, biltong 50g=~125 cal, droewors 50g=~150 cal, handful of nuts=~160 cal (28g). 7) Bunny chow quarter=~650 cal. 8) COMPOSITE MEALS: sum ALL components realistically. 9) CHICKEN GUIDE: Plain 'chicken' = 1 breast (~130g, 200 cal). 'Chicken thigh' = 1 thigh (~100g, 200 cal). 'Fried chicken' = 1 piece KFC-style (~170g, 280 cal). 'Half chicken' = ~350g, 480 cal. 'Quarter chicken' = ~175g, 250 cal (Nando's style). 10) CONSERVATIVE BIAS: When uncertain, estimate on LOWER end. No extra text.`;

const API_KEY = process.env.OPENAI_API_KEY;
const testCases = JSON.parse(fs.readFileSync('./tests/new-test-cases.json', 'utf8'));

async function testItem(item) {
  const res = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: 'Nutrition for: ' + item[0] }
    ],
    temperature: 0.2
  }, { headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' }, timeout: 10000 });

  const content = res.data.choices[0].message.content.trim().replace(/```json|```/g, '').trim();
  return JSON.parse(content);
}

(async () => {
  const results = [];
  for (const tc of testCases) {
    const input = tc[0];
    const minCal = tc[1];
    const maxCal = tc[2];
    try {
      const result = await testItem(input);
      const actual = result.calories;
      const inRange = actual >= minCal && actual <= maxCal;
      results.push({ input, expected: { minCal, maxCal }, actual, inRange, result });
      console.log(JSON.stringify({ input, expected: [minCal, maxCal], actual, inRange, result: { food: result.food, protein: result.protein, carbs: result.carbs, fat: result.fat, fibre: result.fibre } }));
    } catch (e) {
      results.push({ input, expected: [minCal, maxCal], error: e.message });
      console.log(JSON.stringify({ input, expected: [minCal, maxCal], error: e.message }));
    }
  }
  fs.writeFileSync('./tests/test-results.json', JSON.stringify(results, null, 2));
  console.log('Results saved to tests/test-results.json');
})();