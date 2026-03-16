#!/usr/bin/env node

/**
 * Woolworths Food Scraper for FitSorted
 * Scrapes product data from Woolworths.co.za food categories
 */

const puppeteer = require('/opt/homebrew/lib/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUTPUT_FILE = path.join(__dirname, '../data/woolworths-products.json');
const FOOD_DB_FILE = path.join(__dirname, '../data/woolworths-food-db.json');
const EXTRA_FOODS_FILE = path.join(__dirname, '../extra-foods.json');

const CATEGORIES = {
  'ready-meals': {
    name: 'Ready Meals',
    url: 'https://www.woolworths.co.za/cat/Food/Food-To-Go/Heat-Eat-Single-Ready-Meals/_/N-149xjj0'
  },
  'salads': {
    name: 'Salads',
    url: 'https://www.woolworths.co.za/cat/Food/Food-To-Go/Salads/_/N-1z13rvx'
  },
  'sandwiches': {
    name: 'Sandwiches & Wraps',
    url: 'https://www.woolworths.co.za/cat/Food/Food-To-Go/Sandwiches-Wraps/_/N-1z13rvy'
  },
  'snacks': {
    name: 'Snacks',
    url: 'https://www.woolworths.co.za/cat/Food/Food-To-Go/Snacks/_/N-1z13rvz'
  },
  'meat': {
    name: 'Meat & Poultry',
    url: 'https://www.woolworths.co.za/cat/Food/Meat-Poultry-Fish/_/N-1z13s1d'
  },
  'dairy': {
    name: 'Dairy',
    url: 'https://www.woolworths.co.za/cat/Food/Dairy-Eggs-Milk/_/N-1z13ryp'
  }
};

// Parse command line args
const args = process.argv.slice(2);
let targetCategory = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--category' && args[i + 1]) {
    targetCategory = args[i + 1];
  }
}

/**
 * Sleep helper for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract size from product name (e.g., "300 g", "1 kg", "500ml")
 */
function extractSize(name) {
  const sizeRegex = /(\d+(?:\.\d+)?)\s*(g|kg|ml|l|pack|count|piece)/i;
  const match = name.match(sizeRegex);
  return match ? match[0] : null;
}

/**
 * Extract price from text (e.g., "R 84.99")
 */
function parsePrice(priceText) {
  if (!priceText) return null;
  const match = priceText.match(/R?\s*(\d+(?:[.,]\d{2})?)/);
  if (!match) return null;
  return parseFloat(match[1].replace(',', '.'));
}

/**
 * Scrape products from a category page
 */
async function scrapeCategory(browser, categoryKey, categoryData) {
  console.log(`\n📦 Scraping ${categoryData.name}...`);
  const page = await browser.newPage();
  
  try {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(categoryData.url, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    
    // Wait for products to load
    await sleep(3000);
    
    let products = [];
    let pageNum = 1;
    let hasMorePages = true;
    
    while (hasMorePages) {
      console.log(`  Page ${pageNum}...`);
      
      // Extract products from current page
      const pageProducts = await page.evaluate((categoryName) => {
        const items = [];
        
        // Woolworths uses <article> tags for product cards
        const productCards = document.querySelectorAll('article');
        
        productCards.forEach(card => {
          try {
            // Find all links in the article
            const links = Array.from(card.querySelectorAll('a[href*="/prod/"]'));
            
            // Get the product name from the text link (not image alt)
            // The second link usually has the product name text
            const textLink = links.find(link => link.textContent.trim().length > 5);
            const name = textLink ? textLink.textContent.trim() : null;
            
            // Extract price from <strong> tag
            const priceEl = card.querySelector('strong');
            const priceText = priceEl ? priceEl.textContent.trim() : null;
            
            // Extract product URL (use the first link)
            const url = links[0] ? links[0].href : null;
            
            if (name && priceText && name.length > 3) {
              items.push({
                name,
                priceText,
                url,
                category: categoryName
              });
            }
          } catch (err) {
            console.error('Error extracting product:', err);
          }
        });
        
        return items;
      }, categoryData.name);
      
      // Process extracted products
      for (const item of pageProducts) {
        const price = parsePrice(item.priceText);
        const size = extractSize(item.name);
        
        if (price) {
          products.push({
            name: item.name,
            price,
            size,
            category: item.category,
            url: item.url
          });
        }
      }
      
      console.log(`    Found ${pageProducts.length} products`);
      
      // Check for next page button
      const nextButton = await page.$('[aria-label="Next page"], .pagination-next, button[class*="next"]');
      
      if (nextButton) {
        const isDisabled = await page.evaluate(btn => {
          return btn.disabled || btn.classList.contains('disabled') || btn.getAttribute('aria-disabled') === 'true';
        }, nextButton);
        
        if (!isDisabled) {
          await nextButton.click();
          await sleep(2500); // Rate limiting
          pageNum++;
        } else {
          hasMorePages = false;
        }
      } else {
        hasMorePages = false;
      }
      
      // Safety limit
      if (pageNum > 20) {
        console.log('    Reached page limit (20), stopping...');
        hasMorePages = false;
      }
    }
    
    console.log(`  ✅ Total: ${products.length} products`);
    return products;
    
  } catch (error) {
    console.error(`  ❌ Error scraping ${categoryData.name}:`, error.message);
    return [];
  } finally {
    await page.close();
  }
}

/**
 * Get nutrition data from OpenAI GPT-4o-mini
 */
async function getNutritionFromAI(productName, size) {
  const prompt = `Estimate the nutrition information for this Woolworths South Africa product:
Product: ${productName}
Size: ${size || 'typical serving'}

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
    
    // Try to parse JSON, handle markdown code blocks
    let jsonStr = content;
    if (content.includes('```')) {
      jsonStr = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }
    
    const nutrition = JSON.parse(jsonStr);
    return nutrition;
    
  } catch (error) {
    console.error(`    ⚠️  AI nutrition lookup failed for "${productName}":`, error.message);
    // Return defaults
    return { calories: 0, protein: 0, carbs: 0, fat: 0 };
  }
}

/**
 * Build the food database with nutrition info
 */
async function buildFoodDatabase(products) {
  console.log('\n🔬 Building food database with nutrition data...');
  
  // Load existing extra-foods.json
  let extraFoods = {};
  try {
    const data = fs.readFileSync(EXTRA_FOODS_FILE, 'utf-8');
    extraFoods = JSON.parse(data);
    console.log(`  Loaded ${Object.keys(extraFoods).length} items from extra-foods.json`);
  } catch (err) {
    console.log('  No extra-foods.json found, will use AI for all products');
  }
  
  const foodDb = {};
  let aiCalls = 0;
  let cacheHits = 0;
  
  for (const product of products) {
    const key = product.name.toLowerCase().replace(/woolworths?\s*/i, '').trim();
    
    // Check if we already have this in extra-foods
    let nutrition = null;
    
    if (extraFoods[key]) {
      nutrition = {
        calories: extraFoods[key],
        protein: 0,
        carbs: 0,
        fat: 0
      };
      cacheHits++;
    } else {
      // Call OpenAI for estimate
      console.log(`  🤖 AI lookup: ${product.name}`);
      nutrition = await getNutritionFromAI(product.name, product.size);
      aiCalls++;
      
      // Rate limit OpenAI calls
      if (aiCalls % 10 === 0) {
        await sleep(1000);
      }
    }
    
    foodDb[key] = {
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fat: nutrition.fat,
      price: product.price,
      size: product.size || 'unknown',
      pricePerServing: product.price,
      url: product.url
    };
  }
  
  console.log(`  ✅ Database built: ${Object.keys(foodDb).length} items`);
  console.log(`  📊 Cache hits: ${cacheHits}, AI calls: ${aiCalls}`);
  
  return foodDb;
}

/**
 * Main execution
 */
async function main() {
  console.log('🛒 Woolworths Food Scraper for FitSorted\n');
  
  // Determine which categories to scrape
  const categoriesToScrape = targetCategory 
    ? { [targetCategory]: CATEGORIES[targetCategory] }
    : CATEGORIES;
  
  if (targetCategory && !CATEGORIES[targetCategory]) {
    console.error(`❌ Unknown category: ${targetCategory}`);
    console.log('Available categories:', Object.keys(CATEGORIES).join(', '));
    process.exit(1);
  }
  
  console.log(`📋 Scraping ${Object.keys(categoriesToScrape).length} categories\n`);
  
  // Launch browser
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  let allProducts = [];
  
  try {
    // Scrape each category
    for (const [key, data] of Object.entries(categoriesToScrape)) {
      const products = await scrapeCategory(browser, key, data);
      allProducts = allProducts.concat(products);
      
      // Rate limit between categories
      await sleep(2000);
    }
    
    // Save raw products
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allProducts, null, 2));
    console.log(`\n💾 Saved ${allProducts.length} products to ${OUTPUT_FILE}`);
    
    // Build food database
    const foodDb = await buildFoodDatabase(allProducts);
    fs.writeFileSync(FOOD_DB_FILE, JSON.stringify(foodDb, null, 2));
    console.log(`💾 Saved food database to ${FOOD_DB_FILE}`);
    
  } finally {
    await browser.close();
  }
  
  console.log('\n✅ Scraping complete!\n');
}

// Run
main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
