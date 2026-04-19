const axios = require('axios');

const systemPrompt = `You are a nutrition assistant for South African users. Given a food description, return ONLY a JSON object: {"food": "clean name including quantity", "calories": integer, "protein": integer, "carbs": integer, "fat": integer, "fibre": integer, "estimatedPriceZAR": integer_or_null}. All macros in grams. fibre = dietary fibre in grams. Use 2025/2026 SA prices. CRITICAL RULES:
1) ONLY estimate what was explicitly mentioned - do NOT add extra foods.
2) RESPECT SINGULAR vs PLURAL: 'egg' = 1 egg (~70 cal), 'eggs' = 2 eggs (~140 cal). 'slice of toast' = 1 slice, 'toast' = 2 slices. 'banana' = 1 banana.
3) If the description mentions a quantity, multiply the calories AND macros accordingly.
4) Use realistic everyday South African portion sizes - not restaurant or oversized portions.
5) Drinks must use FULL SERVING sizes: beer=440ml (~155 cal), Red Bull=250ml (~112 cal), Monster=500ml (~230 cal), wine glass=175ml (~125 cal), cider=330ml (~170 cal).
6) SA portions: 1 slice cheese=~60 cal, 1 slice bread=~80 cal, 1 egg=~70 cal, biltong 50g=~125 cal, droewors 50g=~150 cal, handful of nuts=~160 cal (28g).
7) Bunny chow quarter=~650 cal.
8) COMPOSITE MEALS: When multiple ingredients are listed, sum ALL components realistically.
9) CONSERVATIVE BIAS: When portion size is uncertain, estimate on the LOWER end. No extra text.`;

const testItems = [
  ['funky lady', 150, 250],
  ['fridays orange crush', 180, 280],
  ['spar chicken livers', 180, 320],
  ['chicken feet', 150, 280],
  ['mielie meal porridge', 180, 350],
  ['chocolate teddy', 450, 650],
  ['naked sports drink', 80, 180],
  ['brutal fruit smooth', 150, 280],
  ['chips and chicken livers', 350, 550],
  ['mikes hard lemonade', 180, 280]
];

async function testFood(food) {
  const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Nutrition for: ${food}` }
    ],
    temperature: 0.2
  }, { 
    headers: { 
      'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY, 
      'Content-Type': 'application/json' 
    } 
  });
  
  const text = resp.data.choices[0].message.content;
  const result = JSON.parse(text);
  return result;
}

async function runTests() {
  console.log('Running edge case tests...\n');
  for (const item of testItems) {
    const [food, minCal, maxCal] = item;
    try {
      const result = await testFood(food);
      const calories = result.calories;
      const passed = calories >= minCal && calories <= maxCal;
      console.log(JSON.stringify({ 
        food, 
        minCal, 
        maxCal, 
        actual: calories, 
        passed,
        result 
      }));
    } catch(e) {
      console.log(JSON.stringify({ 
        food, 
        minCal, 
        maxCal, 
        error: e.message 
      }));
    }
  }
}

runTests();