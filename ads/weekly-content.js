const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const runMin = (cal) => Math.round(cal / 10);
const DIR = __dirname;
const POSTIZ_KEY = process.env.POSTIZ_API_KEY;
const IG_ID = "cmmkap1k000chqn0ygg2aihz1";
const TT_ID = "cmmlw6wkv04yyqn0yt0mxv928";

// ═══════════════════════════════════════════
// MASTER FOOD LIBRARY
// ═══════════════════════════════════════════
const allFoods = [
  // SA Restaurants
  { name:"steers-wacky-wednesday", food:"Steers Wacky Wednesday", subtitle:"King Steer burger deal", calories:680, protein:35, carbs:52, fat:38, fibre:3, accentColor:"#ef4444", verdict:"Cheap doesn't mean free calories.", tag:"FAST FOOD" },
  { name:"kfc-streetwise-2", food:"KFC Streetwise 2", subtitle:"2 pieces + chips + roll", calories:740, protein:32, carbs:65, fat:38, fibre:4, accentColor:"#dc2626", verdict:"That roll alone is 180 cal. Skip it, save a run.", tag:"FAST FOOD" },
  { name:"spur-burger-ribs", food:"Spur Burger & Ribs Combo", subtitle:"The classic Spur special", calories:1150, protein:55, carbs:72, fat:68, fibre:4, accentColor:"#f97316", verdict:"115 min running. That's a half marathon.", tag:"RESTAURANT" },
  { name:"mcdonalds-big-mac-meal", food:"McDonald's Big Mac Meal", subtitle:"Big Mac + medium fries + Coke", calories:1080, protein:29, carbs:140, fat:44, fibre:5, accentColor:"#fbbf24", verdict:"The Coke alone is 200 cal. Swap for water, save 20 min running.", tag:"FAST FOOD" },
  { name:"wimpy-burger", food:"Wimpy Dagwood Burger", subtitle:"The thick one", calories:850, protein:42, carbs:58, fat:48, fibre:4, accentColor:"#f59e0b", verdict:"Two patties. Two problems. 85 min on the road.", tag:"FAST FOOD" },
  { name:"ocean-basket-fish-chips", food:"Ocean Basket Fish & Chips", subtitle:"Hake + tartare + chips", calories:780, protein:38, carbs:62, fat:40, fibre:3, accentColor:"#3b82f6", verdict:"The tartare sauce adds 150 cal. Ask for lemon instead.", tag:"RESTAURANT" },
  { name:"nandos-full-chicken", food:"Nando's Full Chicken", subtitle:"With 2 large sides", calories:1400, protein:95, carbs:85, fat:65, fibre:8, accentColor:"#ef4444", verdict:"Enough protein for an entire day. Share it.", tag:"RESTAURANT" },
  { name:"roosters-wrap", food:"Rooster's Chicken Wrap", subtitle:"Grilled wrap meal", calories:520, protein:30, carbs:48, fat:22, fibre:4, accentColor:"#22c55e", verdict:"Not bad for fast food. The grilled option saves 150 cal.", tag:"QUICK LUNCH" },
  { name:"debonairs-triple-decker", food:"Debonairs Triple Decker", subtitle:"3 layers of regret", calories:2400, protein:85, carbs:210, fat:120, fibre:12, accentColor:"#dc2626", verdict:"That's more than most people's entire daily goal. Split it 4 ways.", tag:"DANGER ZONE" },
  { name:"fishaways-2piece", food:"Fishaways 2 Piece & Chips", subtitle:"Quick fish fix", calories:650, protein:28, carbs:55, fat:35, fibre:3, accentColor:"#0ea5e9", verdict:"Battered = +200 cal. Grilled option exists for 450 cal.", tag:"FAST FOOD" },
  
  // Home Meals
  { name:"chicken-stirfry", food:"Chicken Stir Fry", subtitle:"Homemade with veg + rice", calories:420, protein:35, carbs:45, fat:10, fibre:5, accentColor:"#22c55e", verdict:"High protein, low fat. This is how you win.", tag:"HOME COOKING" },
  { name:"pasta-bolognese", food:"Pasta Bolognese", subtitle:"Homemade, 1 serving", calories:550, protein:28, carbs:65, fat:18, fibre:4, accentColor:"#f97316", verdict:"Portion control is everything. One serving, not the pot.", tag:"HOME COOKING" },
  { name:"steak-and-chips", food:"Steak & Chips", subtitle:"200g rump + potato chips", calories:720, protein:48, carbs:45, fat:38, fibre:3, accentColor:"#dc2626", verdict:"Swap chips for sweet potato. Save 150 cal.", tag:"HOME COOKING" },
  { name:"egg-toast-avocado", food:"Eggs on Toast + Avo", subtitle:"2 eggs + toast + half avo", calories:430, protein:18, carbs:30, fat:28, fibre:7, accentColor:"#84cc16", verdict:"The avo is 160 cal. Worth every bite.", tag:"BREAKFAST" },
  { name:"oats-banana-peanut-butter", food:"Oats + Banana + PB", subtitle:"The gym bro breakfast", calories:450, protein:15, carbs:58, fat:18, fibre:6, accentColor:"#f59e0b", verdict:"Simple, filling, cheap. 1 tbsp PB, not 3.", tag:"BREAKFAST" },
  { name:"bobotie", food:"Bobotie", subtitle:"South African classic", calories:380, protein:25, carbs:20, fat:22, fibre:3, accentColor:"#f97316", verdict:"Lighter than you think. The egg topping is only 70 cal.", tag:"SA CLASSIC" },
  { name:"bunny-chow", food:"Bunny Chow (Quarter)", subtitle:"Durban's famous curry bread", calories:650, protein:22, carbs:75, fat:28, fibre:5, accentColor:"#eab308", verdict:"The bread bowl is 300 cal. The curry is 350. Now you know.", tag:"SA CLASSIC" },
  { name:"chicken-mayo-sandwich", food:"Chicken Mayo Sandwich", subtitle:"The office lunch default", calories:380, protein:20, carbs:35, fat:18, fibre:2, accentColor:"#a3a3a3", verdict:"Add lettuce and tomato. Same sandwich, more fibre, more full.", tag:"QUICK LUNCH" },
  { name:"braai-plate-full", food:"Full Braai Plate", subtitle:"Boerie + steak + chicken + pap + salad", calories:1200, protein:75, carbs:80, fat:60, fibre:6, accentColor:"#f97316", verdict:"120 min running. Or just enjoy it — it's Saturday.", tag:"BRAAI PLATE" },
  { name:"vetkoek-mince", food:"Vetkoek & Mince", subtitle:"Deep fried dough + savoury mince", calories:480, protein:18, carbs:45, fat:26, fibre:3, accentColor:"#f59e0b", verdict:"The vetkoek alone is 280 cal. The mince is the healthy part.", tag:"SA CLASSIC" },
  
  // Snacks
  { name:"droewors-50g", food:"Droëwors (50g)", subtitle:"SA's trail snack", calories:150, protein:20, carbs:1, fat:8, fibre:0, accentColor:"#ef4444", verdict:"20g protein, almost zero carbs. Perfect snack.", tag:"SA SUPERFOOD" },
  { name:"pro-nutro-bowl", food:"Pro Nutro with Milk", subtitle:"Original flavour", calories:290, protein:10, carbs:45, fat:8, fibre:4, accentColor:"#3b82f6", verdict:"Use low-fat milk to save 60 cal. Still tastes the same.", tag:"BREAKFAST" },
  { name:"simba-chips-125g", food:"Simba Chips (125g)", subtitle:"The sharing bag you don't share", calories:660, protein:7, carbs:72, fat:38, fibre:5, accentColor:"#eab308", verdict:"660 cal you eat without thinking. That's 66 min running.", tag:"SNACK ATTACK" },
  { name:"yoghurt-granola", food:"Yoghurt & Granola", subtitle:"Woolworths Greek + granola", calories:350, protein:15, carbs:42, fat:14, fibre:3, accentColor:"#a855f7", verdict:"Looks healthy. But granola is sneaky — measure it.", tag:"SNACK" },
  { name:"two-rusks-coffee", food:"2 Ouma Rusks + Coffee", subtitle:"The South African tea break", calories:280, protein:5, carbs:42, fat:10, fibre:2, accentColor:"#92400e", verdict:"Buttermilk rusks = 140 each. Bran rusks = 90. Choose wisely.", tag:"TEA TIME" },
  { name:"banana-peanut-butter", food:"Banana + Peanut Butter", subtitle:"1 banana + 1 tbsp PB", calories:200, protein:5, carbs:28, fat:9, fibre:3, accentColor:"#eab308", verdict:"Perfect pre-workout. Quick energy + healthy fats.", tag:"SMART SNACK" },
  
  // Comparisons
  { name:"uber-eats-vs-homemade", food:"Uber Eats Burger vs Homemade", subtitle:"Same burger, different calories", comparison:true, left:{name:"Uber Eats", cal:850}, right:{name:"Homemade", cal:450}, saved:400, accentColor:"#f97316", tag:"SWAP & SAVE" },
  { name:"white-bread-vs-whole-wheat", food:"White Bread vs Whole Wheat", subtitle:"Per 2 slices", comparison:true, left:{name:"White", cal:160}, right:{name:"Whole Wheat", cal:140}, saved:20, accentColor:"#22c55e", tag:"DID YOU KNOW" },
  { name:"coke-vs-coke-zero", food:"Coke vs Coke Zero", subtitle:"330ml can", comparison:true, left:{name:"Coke", cal:140}, right:{name:"Coke Zero", cal:0}, saved:140, accentColor:"#dc2626", tag:"EASY SWAP" },
  { name:"latte-vs-americano", food:"Latte vs Americano", subtitle:"Your daily coffee", comparison:true, left:{name:"Latte", cal:190}, right:{name:"Americano", cal:15}, saved:175, accentColor:"#92400e", tag:"COFFEE SWAP" },
  { name:"mcflurry-vs-frozen-yoghurt", food:"McFlurry vs Frozen Yoghurt", subtitle:"Sweet treat showdown", comparison:true, left:{name:"McFlurry", cal:510}, right:{name:"Frozen Yoghurt", cal:180}, saved:330, accentColor:"#ec4899", tag:"DESSERT SWAP" },
  { name:"fried-chicken-vs-grilled", food:"Fried Chicken vs Grilled", subtitle:"Same chicken, different prep", comparison:true, left:{name:"Fried (2pc)", cal:480}, right:{name:"Grilled (2pc)", cal:280}, saved:200, accentColor:"#f59e0b", tag:"SMART SWAP" },
  
  // SA Low-Cal Snacks (100-150 cal range)
  { name:"ps-mini", food:"P.S. Mini", subtitle:"Single mini bar", calories:100, protein:1, carbs:12, fat:5, fibre:0, accentColor:"#a855f7", verdict:"100 cal chocolate fix. Better than raiding the full bar.", tag:"SMART SNACK" },
  { name:"kitkat-mini", food:"KitKat Mini (2 Fingers)", subtitle:"The guilt-free break", calories:102, protein:1, carbs:13, fat:5, fibre:0, accentColor:"#ef4444", verdict:"102 cal for a chocolate break. That's 10 min walking.", tag:"SMART SNACK" },
  { name:"trigz-sweet-chilli", food:"Trigz Sweet Chilli", subtitle:"28g popped chips", calories:107, protein:2, carbs:18, fat:3, fibre:1, accentColor:"#f97316", verdict:"Popped not fried. Crunchy + low cal = snack hack.", tag:"SMART SNACK" },
  { name:"vital-rice-cakes", food:"Vital Mini Rice Cakes", subtitle:"Small packet", calories:121, protein:2, carbs:24, fat:1, fibre:1, accentColor:"#22c55e", verdict:"Almost zero fat. Crunch without the guilt.", tag:"SMART SNACK" },
  { name:"multigrain-seaweed-chips", food:"Multigrain & Seaweed Chips", subtitle:"25g packet", calories:127, protein:2, carbs:17, fat:6, fibre:1, accentColor:"#0ea5e9", verdict:"Sounds weird, tastes amazing. 127 cal well spent.", tag:"SMART SNACK" },
  { name:"oven-baked-munchies", food:"Oven Baked Munchies", subtitle:"28g packet", calories:136, protein:2, carbs:17, fat:7, fibre:1, accentColor:"#f59e0b", verdict:"Baked not fried. Same crunch, way fewer calories.", tag:"SMART SNACK" },
  { name:"woolies-popcorn", food:"Woolworths Popcorn", subtitle:"Small packet, sour cream & chives", calories:136, protein:3, carbs:16, fat:7, fibre:2, accentColor:"#8b5cf6", verdict:"Air popped = 136 cal. Cinema popcorn = 600+. Know the difference.", tag:"SMART SNACK" },
  { name:"jalapeno-popper-corn", food:"Jalapeño Popper Corn Snack", subtitle:"30g packet", calories:142, protein:2, carbs:19, fat:7, fibre:1, accentColor:"#22c55e", verdict:"Spicy and crunchy. 142 cal — less than a banana + PB.", tag:"SMART SNACK" },
  { name:"mini-oat-crunchies", food:"Mini Oat Crunchies", subtitle:"30g packet", calories:145, protein:2, carbs:20, fat:6, fibre:2, accentColor:"#f97316", verdict:"145 cal with fibre. Keeps you full longer than chips.", tag:"SMART SNACK" },
];

// ═══════════════════════════════════════════
// MASTER DRINK LIBRARY
// ═══════════════════════════════════════════
const allDrinks = [
  { name:"windhoek-lager", food:"Windhoek Lager (440ml)", subtitle:"Brewed to the Reinheitsgebot", calories:160, protein:1, carbs:13, fat:0, fibre:0, accentColor:"#f59e0b", verdict:"Namibia's finest. But 3 rounds = 480 cal = a full meal.", tag:"PUB NIGHT" },
  { name:"hunters-gold", food:"Hunter's Gold (330ml)", subtitle:"SA's other cider", calories:180, protein:0, carbs:20, fat:0, fibre:0, accentColor:"#eab308", verdict:"Sweeter than Savanna. 10 more calories per bottle.", tag:"SUNDOWNER" },
  { name:"black-label", food:"Carling Black Label (440ml)", subtitle:"SA's best seller", calories:175, protein:1, carbs:15, fat:0, fibre:0, accentColor:"#1e3a5f", verdict:"Champion beer, champion calories. 4 cans = 700 cal.", tag:"PUB NIGHT" },
  { name:"gin-and-tonic", food:"Gin & Tonic", subtitle:"Single gin + tonic water", calories:120, protein:0, carbs:8, fat:0, fibre:0, accentColor:"#6ee7b7", verdict:"Use slimline tonic. Save 50 cal. Same taste.", tag:"SUNDOWNER" },
  { name:"mojito", food:"Mojito", subtitle:"Rum + mint + sugar + lime", calories:217, protein:0, carbs:24, fat:0, fibre:0, accentColor:"#22c55e", verdict:"The sugar syrup is 80 cal. Ask for less.", tag:"COCKTAIL HOUR" },
  { name:"pinotage", food:"Pinotage (175ml)", subtitle:"SA's signature grape", calories:130, protein:0, carbs:4, fat:0, fibre:0, accentColor:"#7f1d1d", verdict:"SA's own grape. One glass is fine. Don't finish the bottle.", tag:"WINE O'CLOCK" },
  { name:"espresso-martini", food:"Espresso Martini", subtitle:"The brunch-to-dinner bridge", calories:250, protein:0, carbs:18, fat:0, fibre:0, accentColor:"#451a03", verdict:"Vodka + coffee liqueur + espresso. Tastes light, isn't.", tag:"COCKTAIL HOUR" },
  { name:"jack-and-coke", food:"Jack & Coke", subtitle:"Single Jack + Coke", calories:195, protein:0, carbs:18, fat:0, fibre:0, accentColor:"#92400e", verdict:"Swap to Coke Zero. Same vibe, 140 cal saved.", tag:"BAR CLASSIC" },
  { name:"prosecco", food:"Prosecco (125ml)", subtitle:"A glass of bubbles", calories:80, protein:0, carbs:2, fat:0, fibre:0, accentColor:"#fcd34d", verdict:"Lowest calorie wine option. Celebrate guilt-free.", tag:"CELEBRATIONS" },
  { name:"brandy-and-coke", food:"Brandy & Coke", subtitle:"KWV + Coke — SA classic", calories:210, protein:0, carbs:22, fat:0, fibre:0, accentColor:"#b45309", verdict:"SA's go-to. The Coke is half the calories. Use Coke Zero.", tag:"SA CLASSIC" },
  { name:"savanna-light", food:"Savanna Light (330ml)", subtitle:"The lighter cider", calories:105, protein:0, carbs:8, fat:0, fibre:0, accentColor:"#84cc16", verdict:"65 cal less than regular Savanna. Smart swap.", tag:"SWAP & SAVE" },
  { name:"cosmopolitan", food:"Cosmopolitan", subtitle:"Vodka + cranberry + cointreau", calories:146, protein:0, carbs:10, fat:0, fibre:0, accentColor:"#ec4899", verdict:"Looks fancy, reasonably light. One of the better cocktails.", tag:"GIRLS NIGHT" },
  { name:"tequila-shot", food:"Tequila Shot", subtitle:"Just the shot", calories:64, protein:0, carbs:0, fat:0, fibre:0, accentColor:"#84cc16", verdict:"64 cal per shot. The lowest calorie spirit. The lime is free.", tag:"NIGHT OUT" },
  { name:"craft-ipa", food:"Craft IPA (340ml)", subtitle:"Devil's Peak, CBC, Jack Black", calories:210, protein:2, carbs:18, fat:0, fibre:0, accentColor:"#c2410c", verdict:"Craft = more flavour AND more calories. 30% more than a lager.", tag:"CRAFT CORNER" },
  { name:"daiquiri", food:"Strawberry Daiquiri", subtitle:"Frozen or shaken", calories:220, protein:0, carbs:22, fat:0, fibre:0, accentColor:"#fb7185", verdict:"The frozen version has more sugar syrup. Ask for shaken.", tag:"COCKTAIL HOUR" },
  { name:"jagerbomb", food:"Jägerbomb", subtitle:"Jäger + Red Bull", calories:210, protein:0, carbs:25, fat:0, fibre:0, accentColor:"#16a34a", verdict:"210 cal you drink in 3 seconds. At least the Red Bull has caffeine.", tag:"CLUB NIGHT" },
  { name:"white-wine-spritzer", food:"White Wine Spritzer", subtitle:"Wine + soda water", calories:73, protein:0, carbs:2, fat:0, fibre:0, accentColor:"#fef9c3", verdict:"Half the calories of a full glass. Best summer hack.", tag:"SMART SWAP" },
];

// ═══════════════════════════════════════════
// TRACKING - used items
// ═══════════════════════════════════════════
const USED_FILE = path.join(DIR, 'weekly-used.json');

function getUsed() {
  try { return JSON.parse(fs.readFileSync(USED_FILE, 'utf8')); }
  catch { return { foods: [], drinks: [] }; }
}

function saveUsed(used) {
  fs.writeFileSync(USED_FILE, JSON.stringify(used, null, 2));
}

function pickItems(pool, used, count) {
  // Prefer unused items, then reset if needed
  let available = pool.filter(p => !used.includes(p.name));
  if (available.length < count) {
    // Reset — all items available again
    available = [...pool];
    used.length = 0;
  }
  // Shuffle and pick
  const shuffled = available.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ═══════════════════════════════════════════
// IMAGE GENERATION (DALL-E 3)
// ═══════════════════════════════════════════
function generatePrompt(item) {
  if (item.comparison) {
    return `Professional food photography split comparison of ${item.left.name} and ${item.right.name}, side by side on dark background, dramatic top-down lighting, moody restaurant atmosphere, 4k, photorealistic`;
  }
  const type = item.fibre !== undefined ? 'food' : 'drink';
  if (type === 'food') {
    return `Professional food photography of ${item.food}, beautifully plated on dark background, dramatic top-down lighting, restaurant quality, moody atmosphere, 4k, photorealistic`;
  }
  return `Professional food photography of ${item.food} drink, on a dark bar counter, dramatic moody lighting, condensation, bar atmosphere, 4k, photorealistic`;
}

async function generateImage(prompt, filename) {
  const apiKey = process.env.OPENAI_API_KEY;
  const body = JSON.stringify({ model: "dall-e-3", prompt, n: 1, size: "1024x1024", quality: "standard" });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com', path: '/v1/images/generations', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.data && json.data[0]) {
            https.get(json.data[0].url, (imgRes) => {
              const chunks = [];
              imgRes.on('data', c => chunks.push(c));
              imgRes.on('end', () => { fs.writeFileSync(filename, Buffer.concat(chunks)); resolve(); });
            });
          } else { console.error('API error:', data.slice(0, 200)); reject(new Error('No image')); }
        } catch(e) { reject(e); }
      });
    });
    req.write(body);
    req.end();
  });
}

// ═══════════════════════════════════════════
// CHEAT SHEET / INFOGRAPHIC LIBRARY
// ═══════════════════════════════════════════
const allCheatSheets = [
  { name: "high-protein-snacks", title: "High Protein Snacks Under 200 Cal", subtitle: "Save this for when hunger hits", accentColor: "#22c55e", tag: "CHEAT SHEET",
    items: [
      { food: "Biltong (50g)", cal: 125, highlight: "20g protein" },
      { food: "Droëwors (50g)", cal: 150, highlight: "20g protein" },
      { food: "2 Boiled Eggs", cal: 140, highlight: "12g protein" },
      { food: "Greek Yoghurt (150g)", cal: 130, highlight: "15g protein" },
      { food: "Woolworths Chicken Strips", cal: 180, highlight: "22g protein" },
      { food: "Cottage Cheese (100g)", cal: 98, highlight: "11g protein" },
      { food: "Tuna Tin (80g)", cal: 90, highlight: "19g protein" },
      { food: "Peanut Butter (2 tbsp)", cal: 190, highlight: "8g protein" },
    ]},
  { name: "sa-braai-cheat-sheet", title: "The SA Braai Calorie Guide", subtitle: "Know before you braai", accentColor: "#f97316", tag: "BRAAI GUIDE",
    items: [
      { food: "Boerewors (1 coil)", cal: 450, highlight: "28g protein" },
      { food: "Chicken drumstick", cal: 130, highlight: "15g protein" },
      { food: "T-bone steak (250g)", cal: 500, highlight: "45g protein" },
      { food: "Lamb chop x2", cal: 320, highlight: "25g protein" },
      { food: "Pap + sauce (cup)", cal: 200, highlight: "4g protein" },
      { food: "Braai broodjie", cal: 280, highlight: "10g protein" },
      { food: "Potato salad (scoop)", cal: 250, highlight: "3g protein" },
      { food: "Green salad (bowl)", cal: 45, highlight: "2g fibre" },
    ]},
  { name: "coffee-shop-calories", title: "Coffee Shop Calorie Guide", subtitle: "Your daily coffee might be a meal", accentColor: "#92400e", tag: "COFFEE GUIDE",
    items: [
      { food: "Americano (black)", cal: 15, highlight: "Almost free" },
      { food: "Flat White", cal: 120, highlight: "7g protein" },
      { food: "Cappuccino", cal: 130, highlight: "7g protein" },
      { food: "Latte (full cream)", cal: 190, highlight: "10g protein" },
      { food: "Mocha", cal: 290, highlight: "8g protein" },
      { food: "Frappuccino", cal: 380, highlight: "Sugar bomb" },
      { food: "Chai Latte", cal: 200, highlight: "12g sugar" },
      { food: "Hot Chocolate", cal: 320, highlight: "Dessert in a cup" },
    ]},
  { name: "woolworths-ready-meals", title: "Woolworths Ready Meals Ranked", subtitle: "Best to worst by calories", accentColor: "#8b5cf6", tag: "WOOLIES GUIDE",
    items: [
      { food: "Chicken Stir Fry", cal: 280, highlight: "Best pick" },
      { food: "Butter Chicken + Rice", cal: 380, highlight: "Solid choice" },
      { food: "Thai Green Curry", cal: 350, highlight: "Watch the rice" },
      { food: "Cottage Pie", cal: 420, highlight: "Comfort food" },
      { food: "Mac & Cheese", cal: 480, highlight: "Cheesy trap" },
      { food: "Chicken Schnitzel", cal: 520, highlight: "The crumb adds up" },
      { food: "Lasagne", cal: 560, highlight: "Share it" },
      { food: "Chicken Alfredo", cal: 600, highlight: "Cream overload" },
    ]},
  { name: "kauai-menu-guide", title: "Kauai Menu: Calories Exposed", subtitle: "Not all smoothie bowls are healthy", accentColor: "#22c55e", tag: "KAUAI GUIDE",
    items: [
      { food: "Active Green Smoothie", cal: 180, highlight: "Best choice" },
      { food: "Lean Chicken Wrap", cal: 350, highlight: "High protein" },
      { food: "Acai Bowl (regular)", cal: 420, highlight: "Sugar hiding" },
      { food: "Peanut Butter Smoothie", cal: 450, highlight: "Liquid meal" },
      { food: "Power Breakfast", cal: 480, highlight: "Big portions" },
      { food: "Chicken Schnitzel Bowl", cal: 520, highlight: "Not light" },
      { food: "Vegan Buddha Bowl", cal: 380, highlight: "Decent option" },
      { food: "Berry Bliss Smoothie", cal: 310, highlight: "Fruity sugar" },
    ]},
  { name: "nandos-calorie-hack", title: "Nando's: Smart Ordering Guide", subtitle: "How to eat Nando's under 600 cal", accentColor: "#ef4444", tag: "NANDO'S HACK",
    items: [
      { food: "Quarter chicken (breast)", cal: 210, highlight: "Best base" },
      { food: "Quarter chicken (leg)", cal: 280, highlight: "More fat" },
      { food: "Spicy rice (reg)", cal: 200, highlight: "Skip for salad" },
      { food: "Coleslaw (reg)", cal: 130, highlight: "Sneaky mayo" },
      { food: "Mediterranean salad", cal: 80, highlight: "Smart side" },
      { food: "Corn on the cob", cal: 90, highlight: "Clean carbs" },
      { food: "Garlic bread (4 slices)", cal: 320, highlight: "Calorie trap" },
      { food: "Full chicken platter", cal: 1400, highlight: "Share it!" },
    ]},
  { name: "low-cal-alcohol", title: "Low Calorie Drinks for a Night Out", subtitle: "If you're going to drink, drink smart", accentColor: "#6ee7b7", tag: "DRINK SMART",
    items: [
      { food: "Vodka + soda + lime", cal: 65, highlight: "Lowest option" },
      { food: "Gin & slimline tonic", cal: 70, highlight: "Classic low cal" },
      { food: "Prosecco (125ml)", cal: 80, highlight: "Celebrate smart" },
      { food: "Light beer (340ml)", cal: 95, highlight: "Castle Lite" },
      { food: "Dry white wine (150ml)", cal: 120, highlight: "Sip slowly" },
      { food: "Savanna Dry", cal: 174, highlight: "SA favourite" },
      { food: "Long Island Iced Tea", cal: 350, highlight: "Danger zone" },
      { food: "Piña Colada", cal: 490, highlight: "A milkshake with rum" },
    ]},
  { name: "high-fibre-foods", title: "High Fibre Foods SA", subtitle: "Most South Africans get half the fibre they need", accentColor: "#84cc16", tag: "FIBRE FIX",
    items: [
      { food: "All Bran Flakes (cup)", cal: 120, highlight: "13g fibre" },
      { food: "Avo (half)", cal: 160, highlight: "7g fibre" },
      { food: "Lentils (cup cooked)", cal: 230, highlight: "16g fibre" },
      { food: "Popcorn (3 cups)", cal: 90, highlight: "4g fibre" },
      { food: "Sweet potato (medium)", cal: 103, highlight: "4g fibre" },
      { food: "Pear (medium)", cal: 100, highlight: "6g fibre" },
      { food: "Brown rice (cup)", cal: 215, highlight: "4g fibre" },
      { food: "Baked beans (half tin)", cal: 160, highlight: "7g fibre" },
    ]},
  { name: "fast-food-under-500", title: "Fast Food Meals Under 500 Cal", subtitle: "Yes, it's possible", accentColor: "#3b82f6", tag: "UNDER 500",
    items: [
      { food: "Nando's quarter + salad", cal: 290, highlight: "Best option" },
      { food: "Steers Junior burger", cal: 350, highlight: "Skip the fries" },
      { food: "KFC grilled 2-piece", cal: 380, highlight: "Not fried" },
      { food: "Fishaways grilled fish", cal: 420, highlight: "Ask for grilled" },
      { food: "Roosters grilled wrap", cal: 450, highlight: "Decent macros" },
      { food: "McDonald's Happy Meal", cal: 475, highlight: "Adult hack" },
      { food: "Spur house salad + chicken", cal: 380, highlight: "No dressing" },
      { food: "Vida e Caffè wrap", cal: 400, highlight: "Coffee shop win" },
    ]},
  { name: "midnight-snack-guide", title: "Late Night Snacks: Ranked", subtitle: "Because we all raid the kitchen at 11pm", accentColor: "#a855f7", tag: "MIDNIGHT MUNCH",
    items: [
      { food: "Apple + peanut butter", cal: 200, highlight: "Best choice" },
      { food: "Greek yoghurt + honey", cal: 170, highlight: "Protein hit" },
      { food: "2 slices toast + cheese", cal: 280, highlight: "Quick fix" },
      { food: "Simba chips (small bag)", cal: 230, highlight: "Mindless eating" },
      { food: "Bowl of cereal + milk", cal: 300, highlight: "Depends on cereal" },
      { food: "Leftover pizza (1 slice)", cal: 280, highlight: "Just one!" },
      { food: "Ice cream (scoop)", cal: 200, highlight: "Keep it to one" },
      { food: "Entire tub of ice cream", cal: 1200, highlight: "We've all been there" },
    ]},
];

// ═══════════════════════════════════════════
// HTML TEMPLATES
// ═══════════════════════════════════════════
function foodHTML(post, imgSrc) {
  if (post.comparison) {
    const leftRun = runMin(post.left.cal), rightRun = runMin(post.right.cal);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box;}body{width:1080px;height:1080px;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;position:relative;}
      .bg-img{position:absolute;inset:0;background:url('${imgSrc}') center/cover;filter:brightness(0.55) blur(2px);}.overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.7) 0%,rgba(0,0,0,0.5) 50%,rgba(0,0,0,0.8) 100%);}
      .content{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;align-items:center;padding:60px;justify-content:center;}
      .tag{background:rgba(0,0,0,0.6);border:1px solid ${post.accentColor}40;color:${post.accentColor};font-size:24px;font-weight:700;padding:10px 28px;border-radius:50px;letter-spacing:2px;margin-bottom:30px;}
      .title{font-size:52px;font-weight:800;color:#fff;text-align:center;margin-bottom:8px;}.subtitle{font-size:26px;color:#ccc;margin-bottom:45px;}
      .vs-container{display:flex;align-items:center;gap:30px;margin-bottom:40px;}
      .vs-card{background:rgba(0,0,0,0.7);border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:36px;text-align:center;width:360px;}
      .vs-name{font-size:28px;color:#fff;font-weight:700;margin-bottom:12px;}.vs-cal{font-size:72px;font-weight:900;}.vs-unit{font-size:20px;color:#aaa;margin-bottom:10px;}
      .vs-run{font-size:22px;color:#aaa;margin-top:8px;}.vs-run span{color:#fff;font-weight:700;}.vs-text{font-size:64px;font-weight:900;color:rgba(255,255,255,0.3);}
      .saved{font-size:34px;font-weight:700;color:#25D366;margin-bottom:30px;}
      .brand{display:flex;align-items:center;gap:12px;position:absolute;bottom:40px;}
      .brand-badge{background:rgba(37,211,102,0.2);border:1px solid rgba(37,211,102,0.3);color:#25D366;font-size:22px;font-weight:700;padding:10px 24px;border-radius:50px;}.brand-sub{color:rgba(255,255,255,0.5);font-size:20px;}
    </style></head><body><div class="bg-img"></div><div class="overlay"></div><div class="content">
      <div class="tag">${post.tag}</div><div class="title">${post.food}</div><div class="subtitle">${post.subtitle}</div>
      <div class="vs-container"><div class="vs-card"><div class="vs-name">${post.left.name}</div><div class="vs-cal" style="color:#ef4444;">${post.left.cal}</div><div class="vs-unit">calories</div><div class="vs-run">🏃‍♀️ <span>${leftRun} min</span></div></div>
      <div class="vs-text">VS</div>
      <div class="vs-card"><div class="vs-name">${post.right.name}</div><div class="vs-cal" style="color:#25D366;">${post.right.cal}</div><div class="vs-unit">calories</div><div class="vs-run">🏃‍♀️ <span>${rightRun} min</span></div></div></div>
      <div class="saved">Save ${post.saved} cal — ${runMin(post.saved)} fewer min running 💡</div>
      <div class="brand"><div class="brand-badge">🏋️ FITSORTED</div><div class="brand-sub">Track on WhatsApp 🇿🇦</div></div>
    </div></body></html>`;
  }
  const mins = runMin(post.calories), km = (mins/10).toFixed(1);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;}body{width:1080px;height:1080px;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;position:relative;}
    .bg-img{position:absolute;inset:0;background:url('${imgSrc}') center/cover;filter:brightness(0.65);}.overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.2) 0%,rgba(0,0,0,0.15) 25%,rgba(0,0,0,0.8) 65%,rgba(0,0,0,0.95) 100%);}
    .content{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;justify-content:flex-end;padding:55px;}
    .tag{background:rgba(0,0,0,0.6);border:1px solid ${post.accentColor}40;color:${post.accentColor};font-size:22px;font-weight:700;padding:8px 24px;border-radius:50px;letter-spacing:2px;margin-bottom:14px;display:inline-block;align-self:flex-start;}
    .food-name{font-size:56px;font-weight:800;color:#fff;margin-bottom:4px;}.food-sub{font-size:24px;color:#ccc;margin-bottom:20px;}
    .cal-row{display:flex;align-items:baseline;gap:12px;margin-bottom:14px;}.cal-big{font-size:96px;font-weight:900;color:${post.accentColor};}.cal-label{font-size:26px;color:#aaa;font-weight:600;}
    .run-stat{background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:14px 24px;margin-bottom:16px;display:inline-flex;align-items:center;gap:10px;align-self:flex-start;}
    .run-stat-text{font-size:24px;color:#fff;font-weight:700;}.run-stat-sub{font-size:20px;color:#aaa;}
    .macros{display:flex;gap:14px;margin-bottom:16px;}.macro{background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:12px 20px;text-align:center;}
    .macro-val{font-size:26px;font-weight:800;color:#fff;}.macro-label{font-size:13px;color:#888;margin-top:2px;}
    .verdict{font-size:22px;color:#ccc;font-style:italic;margin-bottom:20px;line-height:1.4;}
    .brand{display:flex;align-items:center;gap:12px;}.brand-badge{background:rgba(37,211,102,0.2);border:1px solid rgba(37,211,102,0.3);color:#25D366;font-size:20px;font-weight:700;padding:8px 20px;border-radius:50px;}.brand-sub{color:rgba(255,255,255,0.5);font-size:18px;}
  </style></head><body><div class="bg-img"></div><div class="overlay"></div><div class="content">
    <div class="tag">${post.tag}</div><div class="food-name">${post.food}</div><div class="food-sub">${post.subtitle}</div>
    <div class="cal-row"><div class="cal-big">${post.calories}</div><div class="cal-label">CALORIES</div></div>
    <div class="run-stat"><span class="run-stat-text">🏃‍♀️ ${mins} min running to burn it off</span><span class="run-stat-sub">(~${km}km)</span></div>
    <div class="macros"><div class="macro"><div class="macro-val">${post.protein}g</div><div class="macro-label">PROTEIN</div></div><div class="macro"><div class="macro-val">${post.carbs}g</div><div class="macro-label">CARBS</div></div><div class="macro"><div class="macro-val">${post.fat}g</div><div class="macro-label">FAT</div></div><div class="macro"><div class="macro-val">${post.fibre}g</div><div class="macro-label">FIBRE</div></div></div>
    <div class="verdict">"${post.verdict}"</div>
    <div class="brand"><div class="brand-badge">🏋️ FITSORTED</div><div class="brand-sub">Track on WhatsApp — no app needed 🇿🇦</div></div>
  </div></body></html>`;
}

function drinkHTML(post, imgSrc) {
  const mins = runMin(post.calories), km = (mins/10).toFixed(1);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;}body{width:1080px;height:1080px;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;position:relative;}
    .bg-img{position:absolute;inset:0;background:url('${imgSrc}') center/cover;filter:brightness(0.65);}.overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.2) 0%,rgba(0,0,0,0.15) 25%,rgba(0,0,0,0.8) 65%,rgba(0,0,0,0.95) 100%);}
    .content{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;justify-content:flex-end;padding:55px;}
    .tag{background:rgba(0,0,0,0.6);border:1px solid ${post.accentColor}40;color:${post.accentColor};font-size:22px;font-weight:700;padding:8px 24px;border-radius:50px;letter-spacing:2px;margin-bottom:14px;display:inline-block;align-self:flex-start;}
    .food-name{font-size:56px;font-weight:800;color:#fff;margin-bottom:4px;}.food-sub{font-size:24px;color:#ccc;margin-bottom:20px;}
    .cal-row{display:flex;align-items:baseline;gap:12px;margin-bottom:14px;}.cal-big{font-size:96px;font-weight:900;color:${post.accentColor};}.cal-label{font-size:26px;color:#aaa;font-weight:600;}
    .run-stat{background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:14px 24px;margin-bottom:16px;display:inline-flex;align-items:center;gap:10px;align-self:flex-start;}
    .run-stat-text{font-size:24px;color:#fff;font-weight:700;}.run-stat-sub{font-size:20px;color:#aaa;}
    .macros{display:flex;gap:14px;margin-bottom:16px;}.macro{background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:12px 20px;text-align:center;}
    .macro-val{font-size:26px;font-weight:800;color:#fff;}.macro-label{font-size:13px;color:#888;margin-top:2px;}
    .verdict{font-size:22px;color:#ccc;font-style:italic;margin-bottom:20px;line-height:1.4;}
    .brand{display:flex;align-items:center;gap:12px;}.brand-badge{background:rgba(37,211,102,0.2);border:1px solid rgba(37,211,102,0.3);color:#25D366;font-size:20px;font-weight:700;padding:8px 20px;border-radius:50px;}.brand-sub{color:rgba(255,255,255,0.5);font-size:18px;}
    .drink-icon{font-size:40px;position:absolute;top:40px;right:55px;z-index:3;}
  </style></head><body><div class="bg-img"></div><div class="overlay"></div><div class="drink-icon">🍺</div><div class="content">
    <div class="tag">🍸 ${post.tag}</div><div class="food-name">${post.food}</div><div class="food-sub">${post.subtitle}</div>
    <div class="cal-row"><div class="cal-big">${post.calories}</div><div class="cal-label">CALORIES</div></div>
    <div class="run-stat"><span class="run-stat-text">🏃‍♀️ ${mins} min running to burn it off</span><span class="run-stat-sub">(~${km}km)</span></div>
    <div class="macros"><div class="macro"><div class="macro-val">${post.protein}g</div><div class="macro-label">PROTEIN</div></div><div class="macro"><div class="macro-val">${post.carbs}g</div><div class="macro-label">CARBS</div></div><div class="macro"><div class="macro-val">${post.fat}g</div><div class="macro-label">FAT</div></div></div>
    <div class="verdict">"${post.verdict}"</div>
    <div class="brand"><div class="brand-badge">🏋️ FITSORTED</div><div class="brand-sub">Track drinks on WhatsApp 🇿🇦</div></div>
  </div></body></html>`;
}

// ═══════════════════════════════════════════
// CAPTION GENERATORS
// ═══════════════════════════════════════════
function foodCaption(post) {
  if (post.comparison) {
    return `${post.left.name}: ${post.left.cal} cal. ${post.right.name}: ${post.right.cal} cal. Save ${post.saved} cal with one swap 💡 #fitsorted #calorietracker #southafrica #healthyswaps #nutrition`;
  }
  return `${post.food} = ${post.calories} cal. ${runMin(post.calories)} min running. ${post.verdict} #fitsorted #calorietracker #southafrica #nutrition #healthyeating`;
}

function drinkCaption(post) {
  return `${post.food} = ${post.calories} cal. ${runMin(post.calories)} min running. ${post.verdict} #fitsorted #drinkingcalories #southafrica #calorietracker`;
}

function cheatSheetHTML(post) {
  const rows = post.items.map((item, i) => {
    const barWidth = Math.min(95, Math.round((item.cal / 600) * 95));
    const barColor = item.cal <= 200 ? '#22c55e' : item.cal <= 400 ? '#f59e0b' : '#ef4444';
    return `<div class="row${i === 0 ? ' first' : ''}"><div class="row-left"><span class="row-num">${i+1}</span><span class="row-food">${item.food}</span></div><div class="row-right"><div class="bar-bg"><div class="bar" style="width:${barWidth}%;background:${barColor};"></div></div><span class="row-cal">${item.cal} cal</span><span class="row-hl">${item.highlight}</span></div></div>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{width:1080px;height:1080px;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;background:linear-gradient(180deg,#0a0a0a 0%,#1a1a2e 100%);color:#fff;padding:60px;}
    .tag{background:rgba(0,0,0,0.6);border:1px solid ${post.accentColor}40;color:${post.accentColor};font-size:20px;font-weight:700;padding:8px 24px;border-radius:50px;letter-spacing:2px;display:inline-block;margin-bottom:20px;}
    .title{font-size:46px;font-weight:800;line-height:1.15;margin-bottom:8px;}
    .subtitle{font-size:22px;color:#888;margin-bottom:35px;}
    .rows{display:flex;flex-direction:column;gap:10px;}
    .row{display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px 20px;}
    .row.first{border-color:${post.accentColor}40;background:rgba(255,255,255,0.08);}
    .row-left{display:flex;align-items:center;gap:14px;min-width:320px;}
    .row-num{font-size:20px;font-weight:800;color:${post.accentColor};width:28px;}
    .row-food{font-size:22px;font-weight:600;}
    .row-right{display:flex;align-items:center;gap:14px;flex:1;}
    .bar-bg{flex:1;height:8px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;}
    .bar{height:100%;border-radius:4px;transition:width 0.3s;}
    .row-cal{font-size:20px;font-weight:700;color:#fff;min-width:70px;text-align:right;}
    .row-hl{font-size:16px;color:${post.accentColor};min-width:120px;text-align:right;font-weight:600;}
    .brand{display:flex;align-items:center;gap:12px;position:absolute;bottom:45px;left:60px;}
    .brand-badge{background:rgba(37,211,102,0.2);border:1px solid rgba(37,211,102,0.3);color:#25D366;font-size:20px;font-weight:700;padding:8px 20px;border-radius:50px;}
    .brand-sub{color:rgba(255,255,255,0.5);font-size:18px;}
    .save-tag{position:absolute;bottom:45px;right:60px;color:rgba(255,255,255,0.4);font-size:18px;}
  </style></head><body>
    <div class="tag">${post.tag}</div>
    <div class="title">${post.title}</div>
    <div class="subtitle">${post.subtitle}</div>
    <div class="rows">${rows}</div>
    <div class="brand"><div class="brand-badge">🏋️ FITSORTED</div><div class="brand-sub">Track on WhatsApp 🇿🇦</div></div>
    <div class="save-tag">📌 Save this</div>
  </body></html>`;
}

function cheatSheetCaption(post) {
  const top3 = post.items.slice(0, 3).map(i => `${i.food} (${i.cal} cal)`).join(', ');
  return `${post.title} 📋\n\nTop picks: ${top3}\n\nSave this for later 📌\n\n#fitsorted #calorietracker #southafrica #nutrition #cheatsheet #healthyeating`;
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════
(async () => {
  const used = getUsed();
  
  // Pick 7 foods + 7 drinks + 2 cheat sheets
  const foods = pickItems(allFoods, used.foods, 7);
  const drinks = pickItems(allDrinks, used.drinks, 7);
  const cheatSheets = pickItems(allCheatSheets, used.cheatSheets || [], 2);
  
  console.log('📋 This week\'s food posts:');
  foods.forEach(f => console.log(`  - ${f.food} (${f.calories || f.left?.cal + ' vs ' + f.right?.cal} cal)`));
  console.log('\n🍸 This week\'s drink posts:');
  drinks.forEach(d => console.log(`  - ${d.food} (${d.calories} cal)`));
  console.log('\n📊 This week\'s cheat sheets:');
  cheatSheets.forEach(c => console.log(`  - ${c.title}`));
  
  // Generate images
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ headless: true });
  
  const allItems = [...foods.map(f => ({...f, type:'food'})), ...drinks.map(d => ({...d, type:'drink'})), ...cheatSheets.map(c => ({...c, type:'cheatsheet'}))];
  
  for (const item of allItems) {
    const imgPath = path.join(DIR, `img-${item.name}.png`);
    if (!fs.existsSync(imgPath)) {
      console.log(`\n🎨 Generating image: ${item.name}...`);
      await generateImage(generatePrompt(item), imgPath);
      console.log(`✅ Image saved`);
    }
    
    // Generate HTML
    const imgBase64 = fs.readFileSync(imgPath).toString('base64');
    const imgSrc = `data:image/png;base64,${imgBase64}`;
    const html = item.type === 'cheatsheet' ? cheatSheetHTML(item) : item.type === 'food' ? foodHTML(item, imgSrc) : drinkHTML(item, imgSrc);
    const htmlPath = path.join(DIR, `weekly-${item.name}.html`);
    fs.writeFileSync(htmlPath, html);
    
    // Render PNG
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080 });
    await page.goto('file://' + htmlPath);
    const pngPath = path.join(DIR, `weekly-${item.name}.png`);
    await page.screenshot({ path: pngPath, type: 'png' });
    await page.close();
    console.log(`📸 ${item.name}.png`);
  }
  await browser.close();
  
  // Upload to Postiz
  console.log('\n📤 Uploading to Postiz...');
  const uploads = {};
  for (const item of allItems) {
    const pngPath = path.join(DIR, `weekly-${item.name}.png`);
    try {
      const out = execSync(`postiz upload "${pngPath}" 2>&1`, { env: { ...process.env, POSTIZ_API_KEY: POSTIZ_KEY } }).toString();
      const match = out.match(/"path":\s*"([^"]+)"/);
      if (match) {
        uploads[item.name] = match[1];
        console.log(`✅ ${item.name} → ${match[1]}`);
      }
    } catch(e) { console.error(`❌ Upload failed: ${item.name}`); }
    await new Promise(r => setTimeout(r, 3000));
  }
  
  // Schedule posts
  // Next Monday = start of the week
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const daysToMon = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 7 : (8 - dayOfWeek);
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysToMon);
  
  console.log(`\n📅 Scheduling for week of ${monday.toISOString().slice(0,10)}...`);
  
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const S_POST = '{"post_type":"post"}';
  const S_TT = '{"privacy_level":"PUBLIC_TO_EVERYONE","duet":true,"stitch":true,"comment":true,"autoAddMusic":"no","brand_content_toggle":false,"brand_organic_toggle":false,"content_posting_method":"DIRECT_POST"}';
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateStr = date.toISOString().slice(0,10);
    
    const food = foods[i];
    const drink = drinks[i];
    
    // Food at 10AM SA = 08:00 UTC
    if (uploads[food.name]) {
      const cap = foodCaption(food);
      try {
        execSync(`postiz posts:create -c "${cap.replace(/"/g,'\\"')}" -m "${uploads[food.name]}" -s "${dateStr}T08:00:00Z" --settings '${S_POST}' -i "${IG_ID}" 2>&1`, { env: { ...process.env, POSTIZ_API_KEY: POSTIZ_KEY } });
        console.log(`✅ ${days[i]} 10AM IG: ${food.name}`);
      } catch(e) { console.error(`❌ ${days[i]} IG food: ${e.message.slice(0,100)}`); }
      await new Promise(r => setTimeout(r, 8000));
      
      // TikTok food at 10:30AM SA = 08:30 UTC
      try {
        execSync(`postiz posts:create -c "${cap.replace(/"/g,'\\"')}" -m "${uploads[food.name]}" -s "${dateStr}T08:30:00Z" --settings '${S_TT}' -i "${TT_ID}" 2>&1`, { env: { ...process.env, POSTIZ_API_KEY: POSTIZ_KEY } });
        console.log(`✅ ${days[i]} 10:30AM TT: ${food.name}`);
      } catch(e) { console.error(`❌ ${days[i]} TT food: ${e.message.slice(0,100)}`); }
      await new Promise(r => setTimeout(r, 8000));
    }
    
    // Drink at 6PM SA = 16:00 UTC
    if (uploads[drink.name]) {
      const cap = drinkCaption(drink);
      try {
        execSync(`postiz posts:create -c "${cap.replace(/"/g,'\\"')}" -m "${uploads[drink.name]}" -s "${dateStr}T16:00:00Z" --settings '${S_POST}' -i "${IG_ID}" 2>&1`, { env: { ...process.env, POSTIZ_API_KEY: POSTIZ_KEY } });
        console.log(`✅ ${days[i]} 6PM IG: ${drink.name}`);
      } catch(e) { console.error(`❌ ${days[i]} IG drink: ${e.message.slice(0,100)}`); }
      await new Promise(r => setTimeout(r, 8000));
      
      // TikTok drink at 6:30PM SA = 16:30 UTC
      try {
        execSync(`postiz posts:create -c "${cap.replace(/"/g,'\\"')}" -m "${uploads[drink.name]}" -s "${dateStr}T16:30:00Z" --settings '${S_TT}' -i "${TT_ID}" 2>&1`, { env: { ...process.env, POSTIZ_API_KEY: POSTIZ_KEY } });
        console.log(`✅ ${days[i]} 6:30PM TT: ${drink.name}`);
      } catch(e) { console.error(`❌ ${days[i]} TT drink: ${e.message.slice(0,100)}`); }
      await new Promise(r => setTimeout(r, 8000));
    }
  }
  
  // Schedule cheat sheets (Wed at 1PM and Sat at 1PM SA = 11:00 UTC)
  const cheatDays = [2, 5]; // Wed=2, Sat=5 (Mon=0 based)
  for (let ci = 0; ci < cheatSheets.length && ci < cheatDays.length; ci++) {
    const cs = cheatSheets[ci];
    const date = new Date(monday);
    date.setDate(monday.getDate() + cheatDays[ci]);
    const dateStr = date.toISOString().slice(0,10);
    
    if (uploads[cs.name]) {
      const cap = cheatSheetCaption(cs);
      try {
        execSync(`postiz posts:create -c "${cap.replace(/"/g,'\\"')}" -m "${uploads[cs.name]}" -s "${dateStr}T11:00:00Z" --settings '${S_POST}' -i "${IG_ID}" 2>&1`, { env: { ...process.env, POSTIZ_API_KEY: POSTIZ_KEY } });
        console.log(`✅ ${days[cheatDays[ci]]} 1PM IG cheat sheet: ${cs.title}`);
      } catch(e) { console.error(`❌ Cheat sheet IG: ${e.message.slice(0,100)}`); }
      await new Promise(r => setTimeout(r, 8000));
      
      try {
        execSync(`postiz posts:create -c "${cap.replace(/"/g,'\\"')}" -m "${uploads[cs.name]}" -s "${dateStr}T11:30:00Z" --settings '${S_TT}' -i "${TT_ID}" 2>&1`, { env: { ...process.env, POSTIZ_API_KEY: POSTIZ_KEY } });
        console.log(`✅ ${days[cheatDays[ci]]} 1:30PM TT cheat sheet: ${cs.title}`);
      } catch(e) { console.error(`❌ Cheat sheet TT: ${e.message.slice(0,100)}`); }
      await new Promise(r => setTimeout(r, 8000));
    }
  }

  // Save used items
  used.foods.push(...foods.map(f => f.name));
  used.drinks.push(...drinks.map(d => d.name));
  if (!used.cheatSheets) used.cheatSheets = [];
  used.cheatSheets.push(...cheatSheets.map(c => c.name));
  saveUsed(used);
  
  console.log('\n🎉 Weekly content generation complete!');
  console.log(`Foods used total: ${used.foods.length}/${allFoods.length}`);
  console.log(`Drinks used total: ${used.drinks.length}/${allDrinks.length}`);
})();
