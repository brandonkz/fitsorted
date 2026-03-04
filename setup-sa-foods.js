// Add branded chain foods to existing Supabase 'foods' table
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const SA_FOODS = [
  // Kauai smoothies
  { keywords: ["kauai peanut butter bomb large", "peanut butter bomb large", "large peanut butter bomb", "pbb large", "large pbb"], food: "Kauai Peanut Butter Bomb (Large 500ml)", calories: 764, protein: 22, carbs: 98, fat: 32, chain: "Kauai" },
  { keywords: ["kauai peanut butter bomb", "peanut butter bomb small", "small peanut butter bomb", "pbb small", "small pbb", "peanut butter bomb"], food: "Kauai Peanut Butter Bomb (Small 350ml)", calories: 467, protein: 14, carbs: 60, fat: 20, chain: "Kauai" },
  { keywords: ["kauai green machine large", "large green machine"], food: "Kauai Green Machine (Large 500ml)", calories: 380, protein: 8, carbs: 82, fat: 2, chain: "Kauai" },
  { keywords: ["kauai green machine", "green machine small", "green machine"], food: "Kauai Green Machine (Small 350ml)", calories: 266, protein: 6, carbs: 57, fat: 1, chain: "Kauai" },
  { keywords: ["kauai triple c large", "large triple c"], food: "Kauai Triple C (Large 500ml)", calories: 510, protein: 4, carbs: 122, fat: 1, chain: "Kauai" },
  { keywords: ["kauai triple c", "triple c"], food: "Kauai Triple C (Small 350ml)", calories: 357, protein: 3, carbs: 85, fat: 1, chain: "Kauai" },
  
  // Nando's - Full menu
  { keywords: ["nandos quarter chicken", "nando's quarter chicken", "quarter chicken nandos"], food: "Nando's Quarter Chicken (skin on)", calories: 429, protein: 45, carbs: 0, fat: 27, chain: "Nando's" },
  { keywords: ["nandos half chicken", "nando's half chicken", "half chicken nandos"], food: "Nando's Half Chicken", calories: 858, protein: 90, carbs: 0, fat: 54, chain: "Nando's" },
  { keywords: ["nandos full chicken", "nando's full chicken", "whole chicken nandos"], food: "Nando's Full Chicken", calories: 1716, protein: 180, carbs: 0, fat: 108, chain: "Nando's" },
  { keywords: ["nandos pita", "nando's pita"], food: "Nando's Chicken Pita", calories: 420, protein: 32, carbs: 45, fat: 12, chain: "Nando's" },
  { keywords: ["nandos wrap", "nando's wrap"], food: "Nando's Chicken Wrap", calories: 480, protein: 28, carbs: 48, fat: 18, chain: "Nando's" },
  { keywords: ["nandos fino burger", "nando's fino burger"], food: "Nando's Fino Burger", calories: 580, protein: 35, carbs: 52, fat: 25, chain: "Nando's" },
  { keywords: ["nandos supergrain burger", "nando's supergrain burger"], food: "Nando's Supergrain Burger", calories: 520, protein: 28, carbs: 58, fat: 18, chain: "Nando's" },
  { keywords: ["nandos peri chips", "nando's peri chips", "nandos chips"], food: "Nando's Peri-Peri Chips (regular)", calories: 430, protein: 6, carbs: 58, fat: 20, chain: "Nando's" },
  { keywords: ["nandos coleslaw", "nando's coleslaw"], food: "Nando's Coleslaw (regular)", calories: 140, protein: 2, carbs: 12, fat: 10, chain: "Nando's" },
  { keywords: ["nandos corn", "nando's corn", "nandos mielie"], food: "Nando's Corn on the Cob", calories: 120, protein: 4, carbs: 25, fat: 2, chain: "Nando's" },
  { keywords: ["nandos rice", "nando's rice"], food: "Nando's Spicy Rice (regular)", calories: 350, protein: 7, carbs: 68, fat: 6, chain: "Nando's" },
  { keywords: ["nandos garlic bread", "nando's garlic bread"], food: "Nando's Garlic Bread", calories: 280, protein: 8, carbs: 38, fat: 12, chain: "Nando's" },
  { keywords: ["nandos wings 5", "nando's wings 5", "5 wings nandos"], food: "Nando's Chicken Wings (5 pieces)", calories: 340, protein: 35, carbs: 0, fat: 22, chain: "Nando's" },
  { keywords: ["nandos wings 10", "nando's wings 10", "10 wings nandos"], food: "Nando's Chicken Wings (10 pieces)", calories: 680, protein: 70, carbs: 0, fat: 44, chain: "Nando's" },
  { keywords: ["nandos espetada", "nando's espetada"], food: "Nando's Chicken Espetada", calories: 520, protein: 55, carbs: 8, fat: 30, chain: "Nando's" },
  
  // Steers - Extended menu
  { keywords: ["steers regular burger", "steers burger"], food: "Steers Regular Burger", calories: 520, protein: 28, carbs: 45, fat: 25, chain: "Steers" },
  { keywords: ["steers cheese burger", "steers cheeseburger"], food: "Steers Cheese Burger", calories: 580, protein: 32, carbs: 46, fat: 30, chain: "Steers" },
  { keywords: ["steers king steer burger"], food: "Steers King Steer Burger", calories: 720, protein: 42, carbs: 48, fat: 38, chain: "Steers" },
  { keywords: ["steers bacon cheese burger"], food: "Steers Bacon & Cheese Burger", calories: 650, protein: 35, carbs: 47, fat: 35, chain: "Steers" },
  { keywords: ["steers chicken burger"], food: "Steers Chicken Burger", calories: 540, protein: 30, carbs: 50, fat: 22, chain: "Steers" },
  { keywords: ["steers onion rings"], food: "Steers Onion Rings (regular)", calories: 330, protein: 4, carbs: 42, fat: 16, chain: "Steers" },
  { keywords: ["steers chips", "steers fries"], food: "Steers Chips (regular)", calories: 380, protein: 5, carbs: 52, fat: 18, chain: "Steers" },
  { keywords: ["steers ribs full rack"], food: "Steers Ribs Full Rack", calories: 1200, protein: 85, carbs: 45, fat: 75, chain: "Steers" },
  { keywords: ["steers ribs half rack"], food: "Steers Ribs Half Rack", calories: 600, protein: 42, carbs: 22, fat: 38, chain: "Steers" },
  { keywords: ["steers milkshake"], food: "Steers Milkshake (regular)", calories: 450, protein: 12, carbs: 68, fat: 15, chain: "Steers" },
  
  // KFC
  { keywords: ["kfc streetwise 2", "kfc sw2"], food: "KFC Streetwise 2", calories: 680, protein: 48, carbs: 58, fat: 28, chain: "KFC" },
  { keywords: ["kfc streetwise 5", "kfc sw5"], food: "KFC Streetwise 5", calories: 1400, protein: 95, carbs: 120, fat: 55, chain: "KFC" },
  { keywords: ["kfc zinger burger"], food: "KFC Zinger Burger", calories: 550, protein: 28, carbs: 52, fat: 26, chain: "KFC" },
  { keywords: ["kfc twister"], food: "KFC Twister Wrap", calories: 480, protein: 25, carbs: 48, fat: 22, chain: "KFC" },
  { keywords: ["kfc dunked wings"], food: "KFC Dunked Wings (4pc)", calories: 520, protein: 42, carbs: 28, fat: 28, chain: "KFC" },
  { keywords: ["kfc pops", "kfc popcorn chicken"], food: "KFC Pops (regular)", calories: 380, protein: 22, carbs: 32, fat: 18, chain: "KFC" },
  { keywords: ["kfc coleslaw"], food: "KFC Coleslaw (regular)", calories: 150, protein: 2, carbs: 18, fat: 8, chain: "KFC" },
  { keywords: ["kfc chips", "kfc fries"], food: "KFC Chips (regular)", calories: 360, protein: 5, carbs: 48, fat: 17, chain: "KFC" },
  { keywords: ["kfc original recipe piece"], food: "KFC Original Recipe Piece", calories: 270, protein: 18, carbs: 12, fat: 17, chain: "KFC" },
  { keywords: ["kfc crunch burger"], food: "KFC Crunch Burger", calories: 480, protein: 24, carbs: 48, fat: 22, chain: "KFC" },
  
  // McDonald's
  { keywords: ["mcdonalds big mac", "mcd big mac"], food: "McDonald's Big Mac", calories: 540, protein: 25, carbs: 46, fat: 28, chain: "McDonald's" },
  { keywords: ["mcdonalds quarter pounder"], food: "McDonald's Quarter Pounder with Cheese", calories: 520, protein: 30, carbs: 42, fat: 26, chain: "McDonald's" },
  { keywords: ["mcdonalds mcchicken"], food: "McDonald's McChicken", calories: 400, protein: 15, carbs: 42, fat: 20, chain: "McDonald's" },
  { keywords: ["mcdonalds fries medium"], food: "McDonald's Medium Fries", calories: 340, protein: 4, carbs: 44, fat: 16, chain: "McDonald's" },
  { keywords: ["mcdonalds fries large"], food: "McDonald's Large Fries", calories: 510, protein: 6, carbs: 66, fat: 24, chain: "McDonald's" },
  { keywords: ["mcdonalds nuggets 6"], food: "McDonald's Chicken McNuggets (6pc)", calories: 280, protein: 16, carbs: 18, fat: 16, chain: "McDonald's" },
  { keywords: ["mcdonalds nuggets 9"], food: "McDonald's Chicken McNuggets (9pc)", calories: 420, protein: 24, carbs: 27, fat: 24, chain: "McDonald's" },
  { keywords: ["mcdonalds mcflurry oreo"], food: "McDonald's McFlurry Oreo", calories: 510, protein: 12, carbs: 72, fat: 18, chain: "McDonald's" },
  
  // Woolworths
  { keywords: ["woolworths protein shake", "ww protein shake"], food: "Woolworths Protein Shake", calories: 220, protein: 20, carbs: 28, fat: 3, chain: "Woolworths" },
  { keywords: ["woolworths chicken breast grilled"], food: "Woolworths Grilled Chicken Breast (pack)", calories: 280, protein: 52, carbs: 0, fat: 8, chain: "Woolworths" },
  { keywords: ["woolworths sushi california roll"], food: "Woolworths California Roll Sushi (8pc)", calories: 320, protein: 12, carbs: 54, fat: 5, chain: "Woolworths" },
  { keywords: ["woolworths sandwich chicken mayo"], food: "Woolworths Chicken Mayo Sandwich", calories: 420, protein: 22, carbs: 45, fat: 18, chain: "Woolworths" },
  { keywords: ["woolworths health bar"], food: "Woolworths Health Bar", calories: 250, protein: 8, carbs: 35, fat: 10, chain: "Woolworths" },
  { keywords: ["woolworths biltong 100g"], food: "Woolworths Biltong (100g)", calories: 300, protein: 52, carbs: 4, fat: 8, chain: "Woolworths" },
  { keywords: ["woolworths yoghurt low fat"], food: "Woolworths Low Fat Yoghurt (175g)", calories: 120, protein: 8, carbs: 18, fat: 2, chain: "Woolworths" },
  { keywords: ["woolworths greek yoghurt"], food: "Woolworths Greek Yoghurt (175g)", calories: 160, protein: 12, carbs: 15, fat: 6, chain: "Woolworths" },
  
  // Spur
  { keywords: ["spur ribs full rack"], food: "Spur Ribs Full Rack", calories: 1300, protein: 90, carbs: 48, fat: 80, chain: "Spur" },
  { keywords: ["spur ribs half rack"], food: "Spur Ribs Half Rack", calories: 650, protein: 45, carbs: 24, fat: 40, chain: "Spur" },
  { keywords: ["spur burger"], food: "Spur Burger", calories: 620, protein: 32, carbs: 48, fat: 32, chain: "Spur" },
  { keywords: ["spur steak 300g"], food: "Spur Steak (300g)", calories: 680, protein: 72, carbs: 0, fat: 42, chain: "Spur" },
  { keywords: ["spur chicken schnitzel"], food: "Spur Chicken Schnitzel", calories: 720, protein: 48, carbs: 52, fat: 35, chain: "Spur" },
  { keywords: ["spur chips"], food: "Spur Chips", calories: 400, protein: 5, carbs: 54, fat: 19, chain: "Spur" },
  
  // Ocean Basket
  { keywords: ["ocean basket hake fish"], food: "Ocean Basket Hake & Chips", calories: 720, protein: 45, carbs: 52, fat: 35, chain: "Ocean Basket" },
  { keywords: ["ocean basket calamari"], food: "Ocean Basket Calamari", calories: 580, protein: 32, carbs: 42, fat: 28, chain: "Ocean Basket" },
  { keywords: ["ocean basket prawn platter"], food: "Ocean Basket Prawn Platter", calories: 850, protein: 52, carbs: 48, fat: 45, chain: "Ocean Basket" },
  { keywords: ["ocean basket greek salad"], food: "Ocean Basket Greek Salad", calories: 320, protein: 12, carbs: 18, fat: 22, chain: "Ocean Basket" },
  
  // Wimpy
  { keywords: ["wimpy breakfast"], food: "Wimpy All Day Breakfast", calories: 680, protein: 32, carbs: 55, fat: 35, chain: "Wimpy" },
  { keywords: ["wimpy cheese grill"], food: "Wimpy Cheese Grill", calories: 520, protein: 28, carbs: 42, fat: 26, chain: "Wimpy" },
  { keywords: ["wimpy burger"], food: "Wimpy Burger", calories: 580, protein: 30, carbs: 48, fat: 28, chain: "Wimpy" },
  { keywords: ["wimpy chips"], food: "Wimpy Chips", calories: 380, protein: 5, carbs: 52, fat: 17, chain: "Wimpy" },
  { keywords: ["wimpy coffee"], food: "Wimpy Filter Coffee", calories: 20, protein: 0, carbs: 4, fat: 0, chain: "Wimpy" },
  { keywords: ["wimpy milkshake"], food: "Wimpy Milkshake", calories: 450, protein: 12, carbs: 68, fat: 15, chain: "Wimpy" },
];

async function setupDatabase() {
  console.log('🔧 Adding branded chain foods to existing Supabase database...\n');
  console.log(`📥 Inserting ${SA_FOODS.length} foods from Kauai, Nando's, Steers, KFC, McDonald's, Woolworths, Spur, Ocean Basket, Wimpy...`);
  
  const foodsToInsert = SA_FOODS.map(food => {
    // Extract serving size from food name if present
    const servingMatch = food.food.match(/\(([^)]+)\)$/);
    const serving = servingMatch ? servingMatch[1] : null;
    const nameWithoutServing = serving ? food.food.replace(/\s*\([^)]+\)$/, '') : food.food;
    
    return {
      name: nameWithoutServing,
      name_alt: food.keywords,
      calories: food.calories,
      protein: food.protein || null,
      carbs: food.carbs || null,
      fat: food.fat || null,
      serving: serving,
      brand: food.chain || null,
      category: 'restaurant',
      source: 'Manual'
    };
  });
  
  // Insert in batches of 10 to avoid rate limits
  for (let i = 0; i < foodsToInsert.length; i += 10) {
    const batch = foodsToInsert.slice(i, i + 10);
    const { error } = await supabase
      .from('foods')
      .insert(batch);
    
    if (error) {
      console.error(`❌ Error inserting batch ${i / 10 + 1}:`, error.message);
      console.error('Details:', error.details);
    } else {
      console.log(`✅ Batch ${i / 10 + 1}/${Math.ceil(foodsToInsert.length / 10)} inserted`);
    }
  }
  
  // Verify
  const { count } = await supabase
    .from('foods')
    .select('*', { count: 'exact', head: true });
  
  console.log(`\n📊 Total foods in database: ${count}`);
  console.log('✅ Setup complete!');
}

setupDatabase().catch(console.error);
