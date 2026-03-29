#!/usr/bin/env node

/**
 * Checkers Food Scraper for FitSorted
 * 
 * CURRENT LIMITATION:
 * Checkers.co.za uses a heavily JavaScript/React-driven site that is difficult to scrape.
 * Category pages return 404 when accessed directly, and the site structure changes frequently.
 * 
 * This script currently populates a starter set of common Checkers food items
 * with AI-estimated nutrition values.
 * 
 * FUTURE IMPROVEMENTS:
 * 1. Reverse engineer Checkers Sixty60 mobile app API
 * 2. Use Playwright with better JS handling
 * 3. Manual data entry of popular items
 * 4. Partner with Checkers for data access
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const OUTPUT_FILE = path.join(__dirname, '../data/checkers-products.json');
const EXTRA_FOODS_FILE = path.join(__dirname, '../extra-foods.json');

// Manually curated list of common Checkers ready-to-eat items
// Prices are approximate (March 2026) and should be updated regularly
const CHECKERS_PRODUCTS = [
  // Ready Meals
  { name: 'Checkers Ready Meal Chicken Curry with Rice 350g', price: 54.99, category: 'Ready Meals' },
  { name: 'Checkers Ready Meal Beef Lasagne 400g', price: 59.99, category: 'Ready Meals' },
  { name: 'Checkers Ready Meal Butter Chicken 350g', price: 54.99, category: 'Ready Meals' },
  { name: 'Checkers Macaroni Cheese 400g', price: 44.99, category: 'Ready Meals' },
  
  // Salads
  { name: 'Checkers Greek Salad Bowl 250g', price: 39.99, category: 'Salads' },
  { name: 'Checkers Caesar Salad Bowl 300g', price: 42.99, category: 'Salads' },
  { name: 'Checkers Chicken Mayo Salad Bowl 280g', price: 44.99, category: 'Salads' },
  { name: 'Checkers Garden Salad Bowl 200g', price: 32.99, category: 'Salads' },
  
  // Sandwiches & Wraps
  { name: 'Checkers Chicken Mayo Sandwich', price: 35.99, category: 'Sandwiches' },
  { name: 'Checkers Cheese & Tomato Sandwich', price: 29.99, category: 'Sandwiches' },
  { name: 'Checkers Ham & Cheese Sandwich', price: 32.99, category: 'Sandwiches' },
  { name: 'Checkers Chicken Wrap', price: 39.99, category: 'Wraps' },
  { name: 'Checkers Beef Wrap', price: 42.99, category: 'Wraps' },
  
  // Pies
  { name: 'Checkers Steak & Kidney Pie', price: 22.99, category: 'Pies' },
  { name: 'Checkers Chicken Pie', price: 22.99, category: 'Pies' },
  { name: 'Checkers Pepper Steak Pie', price: 22.99, category: 'Pies' },
  { name: 'Checkers Mince Pie', price: 19.99, category: 'Pies' },
  
  // Sushi
  { name: 'Checkers California Roll 8 Piece', price: 54.99, category: 'Sushi' },
  { name: 'Checkers Salmon Fashion Sandwich 6 Piece', price: 64.99, category: 'Sushi' },
  { name: 'Checkers Mixed Platter 16 Piece', price: 89.99, category: 'Sushi' },
  { name: 'Checkers Vegetable Roll 8 Piece', price: 44.99, category: 'Sushi' },
  
  // Deli
  { name: 'Checkers Rotisserie Chicken Whole', price: 74.99, category: 'Deli' },
  { name: 'Checkers Rotisserie Chicken Half', price: 42.99, category: 'Deli' },
  { name: 'Checkers Roast Beef Sliced 100g', price: 29.99, category: 'Deli' },
  { name: 'Checkers Ham Sliced 100g', price: 24.99, category: 'Deli' },
  
  // Desserts
  { name: 'Checkers Chocolate Mousse Cup 100g', price: 19.99, category: 'Desserts' },
  { name: 'Checkers Tiramisu Cup 100g', price: 22.99, category: 'Desserts' },
  { name: 'Checkers Cheesecake Slice', price: 32.99, category: 'Desserts' },
  { name: 'Checkers Brownie', price: 18.99, category: 'Desserts' },
  
  // Bakery
  { name: 'Checkers Croissant Plain', price: 12.99, category: 'Bakery' },
  { name: 'Checkers Chocolate Croissant', price: 15.99, category: 'Bakery' },
  { name: 'Checkers Blueberry Muffin', price: 16.99, category: 'Bakery' },
  { name: 'Checkers Cheese & Bacon Roll', price: 18.99, category: 'Bakery' }
];

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get nutrition data from OpenAI
 */
async function getNutritionFromAI(productName, size) {
  const prompt = `Estimate the nutrition information for this Checkers South Africa product:
Product: ${productName}

Respond ONLY with a JSON object (no markdown, no explanation):
{
  "calories": <number>,
  "protein": <number in grams>,
  "carbs": <number in grams>,
  "fat": <number in grams>
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })
    });
    
    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    
    let jsonStr = content;
    if (content.includes('```')) {
      jsonStr = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }
    
    const nutrition = JSON.parse(jsonStr);
    return nutrition;
    
  } catch (error) {
    console.error(`    ⚠️  AI failed:`, error.message);
    return { calories: 0, protein: 0, carbs: 0, fat: 0 };
  }
}

/**
 * Update extra-foods.json
 */
async function updateExtraFoods() {
  console.log('\n📝 Updating extra-foods.json with Checkers items...');
  
  // Load existing
  let extraFoods = {};
  try {
    const data = fs.readFileSync(EXTRA_FOODS_FILE, 'utf-8');
    extraFoods = JSON.parse(data);
    console.log(`  Loaded ${Object.keys(extraFoods).length} existing items`);
  } catch (err) {
    console.log('  Creating new file');
  }
  
  let newItems = 0;
  let skipped = 0;
  
  for (const product of CHECKERS_PRODUCTS) {
    // Create key with "checkers " prefix (lowercase)
    const key = ('checkers ' + product.name.toLowerCase()
      .replace(/checkers\s*/i, '')
      .trim());
    
    if (extraFoods[key]) {
      console.log(`  ⏭️  Skip: ${product.name}`);
      skipped++;
      continue;
    }
    
    // Get AI estimate
    console.log(`  🤖 AI: ${product.name}`);
    const nutrition = await getNutritionFromAI(product.name);
    
    extraFoods[key] = nutrition.calories;
    newItems++;
    
    // Rate limit
    if (newItems % 5 === 0) {
      await sleep(1000);
    }
  }
  
  // Save
  fs.writeFileSync(EXTRA_FOODS_FILE, JSON.stringify(extraFoods, null, 2));
  console.log(`\n  ✅ Added ${newItems} new items`);
  console.log(`  ⏭️  Skipped ${skipped} duplicates`);
}

/**
 * Extract size from name
 */
function extractSize(name) {
  const match = name.match(/(\d+(?:\.\d+)?)\s*(g|kg|ml|l)/i);
  return match ? match[0] : null;
}

/**
 * Main
 */
async function main() {
  console.log('🛒 Checkers Food Database Builder for FitSorted\n');
  console.log('📌 NOTE: This script uses a curated list of common Checkers items.');
  console.log('   For live scraping, Checkers API access or manual data entry is needed.\n');
  
  // Add size info to products
  const productsWithSize = CHECKERS_PRODUCTS.map(p => ({
    ...p,
    size: extractSize(p.name) || 'per item',
    url: 'https://www.checkers.co.za'
  }));
  
  // Save products
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(productsWithSize, null, 2));
  console.log(`💾 Saved ${productsWithSize.length} products to ${OUTPUT_FILE}`);
  
  // Update extra-foods.json
  await updateExtraFoods();
  
  console.log('\n✅ Complete!\n');
  console.log('📝 To expand this database:');
  console.log('   1. Add more items to CHECKERS_PRODUCTS array in this script');
  console.log('   2. Visit checkers.co.za and note popular ready-to-eat items');
  console.log('   3. Update prices periodically (they change often)\n');
}

// Run
main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
