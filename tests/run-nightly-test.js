// Nightly edge case test runner - 2026-04-17
const axios = require('axios');
const fs = require('fs');
require('dotenv').config({ path: __dirname + '/../.env' });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const testCases = [
  ['magwinya 2', 550, 750],
  ['morvite with milk', 280, 400],
  ['inkomazi', 350, 550],
  ['pick n pay samoosa 2', 260, 380],
  ['steers onion rings', 200, 350],
  ['red square energy', 100, 180],
  ['kransky', 180, 280],
  ['spur breakfast', 650, 950],
  ['kfc coleslaw', 120, 220],
  ['house of pizza slice', 200, 350]
];

const systemPrompt = `You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {"food": "clean name including quantity", "calories": integer, "protein": integer, "carbs": integer, "fat": integer, "fibre": integer, "estimatedPriceZAR": integer_or_null}. All macros in grams. fibre = dietary fibre in grams. estimatedPriceZAR is the approximate cost in South African Rands at a restaurant/store (null if homemade or unknown). Use 2025/2026 SA prices. CRITICAL RULES: 1) ONLY estimate what was explicitly mentioned - do NOT add extra foods. 2) RESPECT SINGULAR vs PLURAL: 'egg' = 1 egg (~70 cal), 'eggs' = 2 eggs (~140 cal). 'slice of toast' = 1 slice, 'toast' = 2 slices. 3) If the description mentions a quantity, multiply accordingly. 4) Use realistic everyday South African portion sizes - not restaurant or oversized portions. 5) Drinks must use FULL SERVING sizes: beer=440ml (~155 cal), Red Bull=250ml, Monster=500ml. 6) SA portions: 1 slice cheese=~60 cal, 1 slice bread=~80 cal, 1 egg=~70 cal. 7) COOKING FATS: For fried/scrambled eggs add +30 cal per egg. 8) COMPOSITE MEALS: sum ALL components. 9) If you return less than 200 cal for a meal with 3+ ingredients, recalculate. 10) PORTION SIZE: Always include estimated portion weight. 11) CHICKEN GUIDE: Plain 'chicken' = 1 medium breast (~130g, 200 cal). 12) CONSERVATIVE BIAS - people tend to overestimate how much they eat. Better to be slightly under than over. No extra text.`;

async function testItem(food, minCal, maxCal) {
  try {
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Nutrition for: ' + food }
      ],
      temperature: 0.2
    }, { headers: { Authorization: 'Bearer ' + OPENAI_API_KEY, 'Content-Type': 'application/json' }, timeout: 10000 });
    
    const content = res.data.choices[0].message.content.trim();
    let result;
    try {
      result = JSON.parse(content.replace(/```json|```/g, '').trim());
    } catch(e) {
      const match = content.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : { calories: 0, food: food };
    }
    
    const actual = result.calories || 0;
    const pass = actual >= minCal && actual <= maxCal;
    console.log(JSON.stringify({ food, expected: minCal + '-' + maxCal, actual, pass, result: result.food }));
    return { food, expected: [minCal, maxCal], actual, result: result, pass };
  } catch(e) {
    console.log(JSON.stringify({ food, error: e.message }));
    return { food, expected: [minCal, maxCal], error: e.message };
  }
}

(async () => {
  const results = [];
  for (const tc of testCases) {
    const r = await testItem(tc[0], tc[1], tc[2]);
    results.push(r);
  }
  fs.writeFileSync(__dirname + '/results-2026-04-17.json', JSON.stringify(results, null, 2));
  console.log('Results written to results-2026-04-17.json');
})();