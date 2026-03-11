#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const BOT_FILE = path.join(__dirname, "bot.js");
const BOT_BACKUP = path.join(__dirname, "bot.js.backup");
const FAILED_LOOKUPS_FILE = path.join(__dirname, "failed-lookups.json");
const LOG_FILE = path.join(__dirname, "simple-foods-added.log");

// Common everyday foods (focus on healthy staples first)
const PROACTIVE_FOODS = {
  // Proteins (most important for fitness tracking)
  "chicken": 165,
  "chicken breast": 165,
  "grilled chicken": 165,
  "baked chicken": 165,
  "roasted chicken": 180,
  "fried chicken": 280,
  "chicken thigh": 210,
  "chicken drumstick": 180,
  "chicken wing": 100,
  "chicken wings": 100,
  "chicken strips": 250,
  "chicken tenders": 250,
  "chicken schnitzel": 320,
  "beef": 250,
  "steak": 250,
  "sirloin": 250,
  "fillet": 240,
  "rump steak": 260,
  "ribeye": 290,
  "mince": 250,
  "beef mince": 250,
  "lean mince": 200,
  "turkey mince": 150,
  "patty": 250,
  "beef patty": 250,
  "lamb": 280,
  "lamb chop": 280,
  "lamb shank": 300,
  "pork": 240,
  "pork chop": 240,
  "pork loin": 220,
  "bacon": 160,
  "gammon": 180,
  "ham": 120,
  "turkey": 130,
  "turkey breast": 120,
  "duck": 200,
  "venison": 160,
  "ostrich": 140,
  "fish": 140,
  "white fish": 120,
  "salmon": 180,
  "grilled salmon": 180,
  "smoked salmon": 120,
  "tuna": 130,
  "tuna steak": 150,
  "tuna can": 130,
  "hake": 120,
  "kingklip": 130,
  "snoek": 140,
  "sardines": 150,
  "mackerel": 160,
  "trout": 150,
  "cod": 120,
  "prawns": 100,
  "shrimp": 100,
  "calamari": 140,
  "squid": 140,
  "mussels": 90,
  "oysters": 70,
  "crab": 100,
  "lobster": 120,
  "eggs": 70,
  "egg": 70,
  "egg white": 17,
  "egg yolk": 55,
  "scrambled eggs": 70,
  "boiled egg": 70,
  "poached egg": 70,
  "fried egg": 90,
  "omelette": 200,
  "egg mayo": 200,
  "tofu": 80,
  "tempeh": 160,
  "edamame": 120,
  "chickpeas": 160,
  "lentils": 120,
  "beans": 110,
  "black beans": 120,
  "kidney beans": 110,
  
  // Quick SA items (less focus, but common)
  "pap": 100,
  "boerewors": 300,
  "biltong": 150,
  "braai meat": 300,
  
  // Carbs (everyday staples)
  "rice": 200,
  "brown rice": 215,
  "white rice": 200,
  "basmati rice": 190,
  "pasta": 350,
  "spaghetti": 350,
  "penne": 350,
  "whole wheat pasta": 340,
  "noodles": 320,
  "quinoa": 220,
  "couscous": 190,
  "potato": 180,
  "potatoes": 180,
  "baked potato": 180,
  "mashed potato": 200,
  "sweet potato": 160,
  "bread": 80,
  "slice of bread": 80,
  "toast": 80,
  "brown bread": 90,
  "white bread": 80,
  "wrap": 180,
  "tortilla": 150,
  "pita": 165,
  
  // Breakfast
  "oats": 150,
  "oatmeal": 150,
  "porridge": 150,
  "overnight oats": 200,
  "jungle oats": 150,
  "weetbix": 60,
  "pronutro": 180,
  "muesli": 200,
  "granola": 220,
  "corn flakes": 110,
  "special k": 110,
  "bran flakes": 100,
  "all bran": 90,
  "yogurt": 100,
  "greek yogurt": 120,
  "low fat yogurt": 80,
  "fat free yogurt": 60,
  "bacon rasher": 40,
  "sausage": 150,
  "pork sausage": 150,
  "chicken sausage": 120,
  "hash brown": 150,
  "pancake": 120,
  "waffle": 150,
  "french toast": 180,
  "crumpet": 90,
  "english muffin": 130,
  "breakfast wrap": 400,
  "breakfast burrito": 450,
  "eggs benedict": 450,
  "frittata": 250,
  "quiche": 320,
  "breakfast bowl": 400,
  "acai bowl": 350,
  "smoothie bowl": 300,
  
  // Vegetables (critical for health tracking)
  "broccoli": 50,
  "spinach": 25,
  "cauliflower": 30,
  "carrots": 40,
  "carrot": 40,
  "green beans": 35,
  "peas": 80,
  "corn": 90,
  "mushrooms": 20,
  "peppers": 30,
  "bell pepper": 30,
  "tomato": 20,
  "tomatoes": 20,
  "cucumber": 15,
  "lettuce": 10,
  "cabbage": 25,
  "zucchini": 20,
  "courgette": 20,
  "butternut": 45,
  "pumpkin": 40,
  "asparagus": 20,
  "mixed veg": 50,
  "stir fry veg": 50,
  
  // Fruits (common healthy options)
  "apple": 80,
  "banana": 90,
  "orange": 60,
  "berries": 50,
  "strawberries": 50,
  "blueberries": 60,
  "grapes": 100,
  "watermelon": 80,
  "melon": 60,
  "pineapple": 80,
  "mango": 100,
  "peach": 50,
  "pear": 100,
  "plum": 45,
  "kiwi": 60,
  "avocado": 240,
  "avo": 240,
  
  // Healthy Snacks
  "nuts": 170,
  "almonds": 160,
  "peanuts": 170,
  "cashews": 160,
  "walnuts": 185,
  "mixed nuts": 170,
  "trail mix": 180,
  "peanut butter": 190,
  "almond butter": 200,
  "protein bar": 200,
  "quest bar": 180,
  "rice cakes": 35,
  "hummus": 100,
  "cottage cheese": 100,
  "cheese": 100,
  "cheddar": 115,
  "feta": 75,
  "popcorn": 100,
  "beef jerky": 160,
  "droewors": 200,
  
  // Woolworths Specific
  "woolworths salad": 200,
  "woolies salad": 200,
  "woolworths wrap": 400,
  "woolies wrap": 400,
  "woolworths sandwich": 350,
  "woolies sandwich": 350,
  "woolworths sushi": 250,
  "woolies sushi": 250,
  "woolworths biltong": 150,
  "woolies biltong": 150,
  "woolworths droewors": 200,
  "woolies droewors": 200,
  "woolworths trail mix": 180,
  "woolies trail mix": 180,
  "woolworths yoghurt": 100,
  "woolies yoghurt": 100,
  "woolworths smoothie": 200,
  "woolies smoothie": 200,
  "woolworths fruit salad": 120,
  "woolies fruit salad": 120,
  "woolworths chicken": 300,
  "woolies chicken": 300,
  "woolworths roast chicken": 350,
  "woolies roast chicken": 350,
  "woolworths pasta": 400,
  "woolies pasta": 400,
  "woolworths curry": 450,
  "woolies curry": 450,
  "woolworths pie": 380,
  "woolies pie": 380,
  "woolworths quiche": 320,
  "woolies quiche": 320,
  "woolworths muffin": 280,
  "woolies muffin": 280,
  "woolworths croissant": 240,
  "woolies croissant": 240,
  "woolworths bagel": 250,
  "woolies bagel": 250,
  "woolworths scone": 220,
  "woolies scone": 220,
  "woolworths protein ball": 150,
  "woolies protein ball": 150,
  "woolworths energy bar": 200,
  "woolies energy bar": 200,
  "woolworths hummus": 100,
  "woolies hummus": 100,
  "woolworths guacamole": 120,
  "woolies guacamole": 120,
  "woolworths cheese platter": 350,
  "woolies cheese platter": 350,
  "woolworths meal": 500,
  "woolies meal": 500,
  "woolworths ready meal": 500,
  "woolies ready meal": 500,
  
  // Less healthy snacks (but common)
  "pretzel": 110,
  "pretzels": 110,
  "pretzel knots": 110,
  "giant pretzel": 220,
  "soft pretzel": 200,
  "pretzel bites": 150,
  "crackers": 120,
  "ritz crackers": 80,
  "cream crackers": 70,
  "provita": 20,
  "salticrax": 70,
  "biscuit": 50,
  "cookie": 50,
  "chocolate": 200,
  "chocolate bar": 200,
  "candy bar": 200,
  "chips": 150,
  "crisps": 150,
  "nachos": 280,
  "tortilla chips": 140,
  "corn chips": 150,
  "veggie chips": 130,
  "pita chips": 130,
  "rice crackers": 100,
  "seaweed snacks": 30,
  "caramel popcorn": 150,
  "cheese puffs": 160,
  "cheetos": 160,
  "nik naks": 140,
  "cheese curls": 160,
  "dried fruit": 120,
  "fruit roll up": 80,
  "granola bar": 150,
  "cereal bar": 120,
  "muesli bar": 140,
  "brownie": 240,
  "cupcake": 200,
  "donut": 250,
  "doughnut": 250,
  "cinnamon roll": 300,
  "danish": 280,
  "pastry": 280,
  
  // Drinks (Coffee & Healthy)
  "cappuccino": 80,
  "latte": 120,
  "flat white": 100,
  "cortado": 60,
  "macchiato": 40,
  "espresso": 5,
  "double espresso": 10,
  "americano": 10,
  "long black": 10,
  "mocha": 200,
  "hot chocolate": 200,
  "chai latte": 180,
  "matcha latte": 140,
  "iced coffee": 120,
  "iced latte": 140,
  "cold brew": 10,
  "almond milk latte": 100,
  "oat milk latte": 130,
  "soy latte": 110,
  "protein shake": 150,
  "whey shake": 150,
  "meal replacement shake": 200,
  "green smoothie": 180,
  "fruit smoothie": 200,
  "berry smoothie": 180,
  "protein smoothie": 220,
  "milkshake": 300,
  "juice": 120,
  "fresh juice": 120,
  "orange juice": 110,
  "apple juice": 120,
  "green juice": 100,
  "pressed juice": 120,
  
  // Sodas
  "coke": 140,
  "diet coke": 0,
  "coke zero": 0,
  "pepsi": 150,
  "fanta": 140,
  "sprite": 140,
  "cream soda": 160,
  "iron brew": 150,
  "stoney": 140,
  
  // Sports drinks
  "energade": 90,
  "powerade": 80,
  "game": 90,
  "red bull": 110,
  "monster": 110,
  
  // Fast Food (minimal - only most common)
  "burger": 500,
  "cheeseburger": 550,
  "big mac": 550,
  "whopper": 660,
  "chicken burger": 450,
  "fish and chips": 850,
  "fries": 320,
  "pie": 350,
  "pizza slice": 285,
  "pizza": 285,
  
  // Meals (home-cooked focus)
  "chicken and rice": 450,
  "chicken and veg": 300,
  "beef and rice": 500,
  "fish and veg": 280,
  "salmon and rice": 430,
  "stir fry": 400,
  "chicken stir fry": 400,
  "beef stir fry": 450,
  "curry": 450,
  "chicken curry": 450,
  "beef curry": 500,
  "lamb curry": 550,
  "beef stew": 400,
  "soup": 150,
  "chicken soup": 200,
  "salad": 150,
  "chicken salad": 300,
  "tuna salad": 280,
  "greek salad": 200,
  "caesar salad": 350,
  "sandwich": 300,
  "chicken sandwich": 380,
  "tuna sandwich": 320,
  "cheese sandwich": 320,
  "burrito": 500,
  "burrito bowl": 450,
  "sushi": 250,
  "sushi roll": 250,
  "tacos": 400,
  "quesadilla": 500,
  
  // Quick SA meals
  "bobotie": 450,
  "potjie": 500,
  "sosatie": 250,
  
  // Sides
  "side salad": 80,
  "coleslaw": 150,
  "garlic bread": 180,
  "naan": 260,
  "roti": 200,
  
  // Alcohol
  "beer": 150,
  "lager": 150,
  "ale": 180,
  "cider": 180,
  "wine": 125,
  "red wine": 125,
  "white wine": 120,
  "champagne": 90,
  "margarita": 220,
  "margaritas": 220,
  "vodka": 100,
  "gin": 100,
  "whiskey": 100,
  "rum": 100,
  "tequila": 100,
  "mojito": 200,
  "pina colada": 250,
  "cosmopolitan": 150,
};

function loadFailedLookups() {
  try {
    return JSON.parse(fs.readFileSync(FAILED_LOOKUPS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function loadBotFile() {
  return fs.readFileSync(BOT_FILE, "utf8");
}

// Parse the simple foods object properly using AST-like approach
function extractSimpleFoods(botContent) {
  const match = botContent.match(/const simple = \{([^}]+)\};/s);
  if (!match) {
    console.error("❌ Could not find 'const simple = {...}' in bot.js");
    return {};
  }
  
  const objContent = match[1];
  const foods = {};
  
  // More robust parsing: handle both single-line and multi-line entries
  const entries = objContent.split(/,\s*\n\s*/);
  
  for (const entry of entries) {
    const trimmed = entry.trim().replace(/,$/, ''); // Remove trailing comma
    if (!trimmed || trimmed === ',') continue; // Skip empty or lone commas
    
    const foodMatch = trimmed.match(/"([^"]+)":\s*(\d+)/);
    if (foodMatch) {
      const foodName = foodMatch[1];
      const calories = parseInt(foodMatch[2]);
      foods[foodName.toLowerCase()] = { name: foodName, calories };
    }
  }
  
  return foods;
}

function buildSimpleObject(foods) {
  // Sort alphabetically for consistency
  const sorted = Object.entries(foods).sort((a, b) => a[0].localeCompare(b[0]));
  
  let lines = [];
  for (const [key, data] of sorted) {
    lines.push(`    "${data.name}": ${data.calories}`);
  }
  
  return `const simple = {\n${lines.join(',\n')}\n  };`;
}

function replaceSimpleObject(botContent, newSimpleObj) {
  // Find and replace the entire const simple = {...}; block
  const replaced = botContent.replace(
    /const simple = \{[^}]+\};/s,
    newSimpleObj
  );
  
  if (replaced === botContent) {
    throw new Error("Failed to replace simple object - regex didn't match");
  }
  
  return replaced;
}

function validateSyntax(code) {
  try {
    // Basic syntax check: try to eval in a sandboxed way
    new Function(code);
    return true;
  } catch (err) {
    console.error(`❌ Syntax validation failed: ${err.message}`);
    return false;
  }
}

function backupFile(filePath) {
  const backupPath = `${filePath}.backup`;
  fs.copyFileSync(filePath, backupPath);
  console.log(`📋 Created backup: ${backupPath}`);
  return backupPath;
}

function logAdditions(foods) {
  const timestamp = new Date().toISOString();
  const logEntry = `\n[${timestamp}] Added ${Object.keys(foods).length} foods:\n${Object.entries(foods).map(([key, data]) => `  - ${data.name}: ${data.calories} cal`).join("\n")}\n`;
  fs.appendFileSync(LOG_FILE, logEntry);
  console.log(logEntry);
}

function main() {
  console.log("🍽️  Expanding simple foods (safe mode)...\n");
  
  // 1. Load current bot file
  const botContent = loadBotFile();
  const existingFoods = extractSimpleFoods(botContent);
  const failedLookups = loadFailedLookups();
  
  console.log(`📊 Current simple foods: ${Object.keys(existingFoods).length}`);
  
  // 2. Determine what to add
  const newFoods = {};
  
  // Add proactive foods (if not already present)
  for (const [food, calories] of Object.entries(PROACTIVE_FOODS)) {
    const key = food.toLowerCase();
    if (!existingFoods[key]) {
      newFoods[key] = { name: food, calories };
    }
  }
  
  // Add frequently failed lookups (3+ requests)
  for (const [food, data] of Object.entries(failedLookups)) {
    const key = food.toLowerCase();
    if (data.count >= 3 && !existingFoods[key] && !newFoods[key]) {
      console.log(`⚠️  High-demand food: "${food}" (${data.count} requests) - needs manual calorie lookup`);
    }
  }
  
  if (Object.keys(newFoods).length === 0) {
    console.log("✅ No new foods to add");
    return;
  }
  
  console.log(`📝 Adding ${Object.keys(newFoods).length} new foods...`);
  
  // 3. Backup before making changes
  backupFile(BOT_FILE);
  
  // 4. Merge and rebuild
  const mergedFoods = { ...existingFoods, ...newFoods };
  const newSimpleObj = buildSimpleObject(mergedFoods);
  
  // 5. Replace in bot content
  let updatedContent;
  try {
    updatedContent = replaceSimpleObject(botContent, newSimpleObj);
  } catch (err) {
    console.error(`❌ Failed to update bot.js: ${err.message}`);
    return;
  }
  
  // 6. Validate syntax
  const testCode = `const simple = ${newSimpleObj.match(/\{[^}]+\}/s)[0]}`;
  if (!validateSyntax(testCode)) {
    console.error("❌ Generated invalid JavaScript - aborting");
    return;
  }
  
  // 7. Write to file
  fs.writeFileSync(BOT_FILE, updatedContent);
  
  // 8. Log additions
  logAdditions(newFoods);
  
  console.log(`\n✅ Added ${Object.keys(newFoods).length} foods to simple lookup`);
  console.log(`📊 Total simple foods now: ${Object.keys(mergedFoods).length}`);
  console.log("🔄 Restart bot with: pm2 restart fitsorted");
}

// Only run if executed directly (not required as module)
if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`\n❌ Fatal error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

module.exports = { extractSimpleFoods, buildSimpleObject, validateSyntax };
