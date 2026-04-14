// Run edge case tests
const axios = require('axios');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const testItems = [
  "sparlenthus",
  "crumpet with butter",
  "tomtom sweets",
  "sugar bird friday",
  "tastic rice cup",
  "honey glow yogurt",
  "steers coleslaw",
  "nandos spicy rice",
  "roasted chicken leg 150g",
  "disco Milo jar"
];

const systemPrompt = `You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {"food": "clean name including quantity", "calories": integer, "protein": integer, "carbs": integer, "fat": integer, "fibre": integer, "estimatedPriceZAR": integer_or_null}. All macros in grams. fibre = dietary fibre in grams. estimatedPriceZAR is the approximate cost in South African Rands at a restaurant/store (null if homemade or unknown). Use 2025/2026 SA prices. Examples: Nando's quarter chicken ~R75, Steers Wacky Wednesday burger ~R50, Kauai smoothie ~R65, Woolworths ready meal ~R60. CRITICAL RULES: 1) ONLY estimate what was explicitly mentioned - do NOT add extra foods. 2) RESPECT SINGULAR vs PLURAL: 'egg' = 1 egg (~70 cal), 'eggs' = 2 eggs (~140 cal). 3) If the description mentions a quantity (e.g. 'two', 'three', '2x', '3 slices'), multiply accordingly. 4) Use realistic everyday South African portion sizes. 5) Drinks must use FULL SERVING sizes: beer=440ml (~155 cal), Red Bull=250ml (~112 cal), Monster=500ml (~230 cal). 6) SA portions: 1 slice cheese=~60 cal, 1 slice bread=~80 cal, 1 egg=~70 cal. 7) COOKING FATS: For fried/scrambled eggs add +30 cal per egg. 8) COMPOSITE MEALS: sum all components realistically. 9) If you return less than 200 cal for a meal with 3+ ingredients, you're probably wrong. 10) CONSERVATIVE BIAS. No extra text.`;

async function testItem(item) {
  try {
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Nutrition for: ' + item }
      ],
      temperature: 0.2
    }, { 
      headers: { Authorization: 'Bearer ' + OPENAI_API_KEY, 'Content-Type': 'application/json' }, 
      timeout: 10000 
    });
    
    const content = res.data.choices[0].message.content.trim().replace(/```json|```/g, '').trim();
    const result = JSON.parse(content);
    console.log('RESULT:', JSON.stringify({ item, result }));
    return { item, result, success: true };
  } catch (e) {
    console.error('ERROR:', item, e.message);
    return { item, error: e.message, success: false };
  }
}

async function runTests() {
  console.log('Starting tests...\n');
  const results = [];
  for (const item of testItems) {
    const r = await testItem(item);
    results.push(r);
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  console.log('\n=== FINAL RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
}

runTests();