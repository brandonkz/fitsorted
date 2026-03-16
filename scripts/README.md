# Woolworths Food Scraper

## Overview

`scrape-woolworths.js` scrapes product data from Woolworths.co.za food categories and generates two output files:

1. **woolworths-products.json** - Raw product data (name, price, size, category, url)
2. **woolworths-food-db.json** - Nutrition-enriched database with calories, protein, carbs, fat

## Usage

```bash
# Scrape all categories
node scripts/scrape-woolworths.js

# Scrape a specific category for testing
node scripts/scrape-woolworths.js --category ready-meals
```

Available categories: `ready-meals`, `salads`, `sandwiches`, `snacks`, `meat`, `dairy`

## How it works

1. **Scraping**: Uses Puppeteer to load category pages and extract product cards
2. **Data extraction**: Extracts product name, price, size, and URL from each article element
3. **Nutrition lookup**: 
   - First checks `extra-foods.json` for existing nutrition data
   - Falls back to OpenAI GPT-4o-mini for AI estimates based on product name and size
4. **Rate limiting**: 2-3 second delays between pages, 1 second delay every 10 AI calls

## Output Format

### woolworths-products.json
```json
[
  {
    "name": "Beef Lasagne 300 g",
    "price": 86.99,
    "size": "300 g",
    "category": "Ready Meals",
    "url": "https://www.woolworths.co.za/prod/..."
  }
]
```

### woolworths-food-db.json
```json
{
  "beef lasagne 300 g": {
    "calories": 250,
    "protein": 20,
    "carbs": 30,
    "fat": 10,
    "price": 86.99,
    "size": "300 g",
    "pricePerServing": 86.99,
    "url": "https://www.woolworths.co.za/prod/..."
  }
}
```

## Current Status

### ✅ Working Categories
- **Ready Meals** (24 products) - Italian meals, global cuisine
- **Dairy** (24 products) - Note: Currently returning some beauty products due to incorrect category URL

### ⚠️ Issues
- **Salads, Sandwiches & Wraps, Meat & Poultry**: URLs return "no results" - likely outdated category links
- **Snacks**: Navigation timeout - page may be slow or category doesn't exist

### Next Steps
1. Verify correct category URLs by browsing Woolworths.co.za manually
2. Update the `CATEGORIES` object in the script with working URLs
3. Add filtering to exclude non-food items from results
4. Consider adding more Food-To-Go subcategories

## Technical Details

- **Chrome Path**: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- **Puppeteer**: Installed at `/opt/homebrew/lib/node_modules/puppeteer`
- **OpenAI API**: Uses GPT-4o-mini for nutrition estimates (configured via OPENAI_API_KEY in .env)
- **Selector Strategy**: Targets `<article>` tags, finds text links (not image alts), and `<strong>` price tags

## Dependencies

- puppeteer (globally installed)
- dotenv (for OPENAI_API_KEY)
- node-fetch (for OpenAI API calls)

## Rate Limiting

- 2-3 second delays between page loads
- 1 second delay every 10 OpenAI API calls
- Maximum 20 pages per category (safety limit)
