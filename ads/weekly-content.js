const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const runMin = (cal) => Math.round(cal / 10);
const DIR = __dirname;
const POSTIZ_KEY = process.env.POSTIZ_API_KEY || 'f106e11ea7991bcee68bb6e60e54e6bcf041b8a3a332ab8b88b70c43bc4c7edf';
const IG_ID = "cmmkap1k000chqn0ygg2aihz1";
const TT_ID = "cmmlw6wkv04yyqn0yt0mxv928";

// ═══════════════════════════════════════════
// TIKTOK ALCOHOL BRAND FILTER
// Strips brand names to avoid TikTok alcohol strikes.
// Instagram keeps full brand names (no issue there).
// ═══════════════════════════════════════════
const ALCOHOL_BRAND_MAP = {
  "Windhoek Lager (440ml)": "SA Lager (440ml)",
  "Hunter's Gold (330ml)": "Apple Cider (330ml)",
  "Carling Black Label (440ml)": "SA Lager (440ml)",
  "Gin & Tonic": "Gin & Tonic",  // generic enough
  "Mojito": "Mojito",
  "Pinotage (175ml)": "Red Wine (175ml)",
  "Espresso Martini": "Espresso Martini",
  "Jack & Coke": "Whiskey & Coke",
  "Prosecco (125ml)": "Sparkling Wine (125ml)",
  "Brandy & Coke": "Brandy & Coke",
  "Savanna Light (330ml)": "Light Cider (330ml)",
  "Cosmopolitan": "Cosmopolitan",
  "Craft IPA (340ml)": "Craft IPA (340ml)",
  "Strawberry Daiquiri": "Strawberry Daiquiri",
  "Jägerbomb": "Energy Bomb Shot",
  "White Wine Spritzer": "Wine Spritzer",
  "KWV": "SA Brandy",
  "Devil's Peak": "Craft Brewery",
  "CBC": "Craft Brewery",
  "Jack Black": "Craft Brewery",
};

function tiktokSafeName(foodName) {
  if (ALCOHOL_BRAND_MAP[foodName]) return ALCOHOL_BRAND_MAP[foodName];
  // Also catch partial brand mentions in captions
  let safe = foodName;
  for (const [brand, generic] of Object.entries(ALCOHOL_BRAND_MAP)) {
    safe = safe.replace(brand, generic);
  }
  return safe;
}

function tiktokSafeText(text) {
  let safe = text;
  // Replace known brand names in free text (verdicts, captions)
  const BRAND_WORDS = {
    "Windhoek": "This lager",
    "Hunter's Gold": "This cider",
    "Hunter's": "This cider",
    "Black Label": "This lager",
    "Carling": "This beer",
    "Savanna": "This cider",
    "KWV": "This brandy",
    "Jack Daniel": "This whiskey",
    "Jack &": "Whiskey &",
    "Jäger": "Herbal liqueur",
    "Jägerbomb": "Energy bomb shot",
    "Pinotage": "SA red wine",
    "Prosecco": "Sparkling wine",
    "Devil's Peak": "Craft brewery",
    "Namibia's": "Africa's",
  };
  for (const [brand, replacement] of Object.entries(BRAND_WORDS)) {
    safe = safe.replace(new RegExp(brand, 'gi'), replacement);
  }
  // Remove alcohol-specific hashtags that TikTok flags
  safe = safe.replace(/#(drinking|beer|wine|alcohol|booze|drunk|shots|pub|bar)\b/gi, '');
  // Replace drink-specific hashtags with safer ones
  safe = safe.replace(/#drinkingcalories/gi, '#drinkscalories');
  return safe;
}

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
// DID YOU KNOW FACTS
// ═══════════════════════════════════════════
const didYouKnow = [
  { name:"thermic-effect", title:"Thermic Effect", fact:"Your body burns about 10% of daily calories just digesting food.", source:"Thermic Effect of Food", accentColor:"#f59e0b", icon:"🔥" },
  { name:"muscle-vs-fat", title:"Muscle vs Fat", fact:"Muscle burns roughly 3x more calories at rest than fat tissue.", source:"Body composition research", accentColor:"#22c55e", icon:"💪" },
  { name:"sleep-vs-tv", title:"Sleep Calories", fact:"You burn more calories sleeping than watching TV.", source:"Metabolic rate studies", accentColor:"#6366f1", icon:"😴" },
  { name:"sa-average-intake", title:"SA Average Intake", fact:"The average South African eats ~2,800 calories per day — about 800 more than most women need.", source:"Local nutrition surveys", accentColor:"#ef4444", icon:"🇿🇦" },
  { name:"3-weeks-tracking", title:"3 Weeks to Change", fact:"Tracking calories for just 3 weeks can permanently improve portion instincts.", source:"Behavioural nutrition studies", accentColor:"#14b8a6", icon:"🧠" },
  { name:"olive-oil-tbsp", title:"Olive Oil Reality", fact:"One tablespoon of olive oil has ~119 calories.", source:"USDA food data", accentColor:"#f97316", icon:"🫒" },
  { name:"gum-burn", title:"Gum Calories", fact:"Chewing gum burns about 11 calories per hour.", source:"Mayo Clinic", accentColor:"#a855f7", icon:"🍬" },
  { name:"standing-burn", title:"Stand Up", fact:"Standing instead of sitting burns ~50 extra calories per hour.", source:"Activity expenditure research", accentColor:"#0ea5e9", icon:"🧍" },
  { name:"bigmac-run", title:"Big Mac Run", fact:"It takes roughly a 5km run to burn off a Big Mac.", source:"Calorie burn estimates", accentColor:"#ef4444", icon:"🏃" },
  { name:"cold-water", title:"Cold Water Boost", fact:"Drinking cold water burns slightly more calories as your body heats it up.", source:"Hydration metabolism studies", accentColor:"#3b82f6", icon:"💧" },
  { name:"starvation-mode", title:"Starvation Mode Myth", fact:"Your metabolism only drops ~5–10% even with extreme dieting.", source:"Metabolic adaptation research", accentColor:"#f59e0b", icon:"⚖️" },
  { name:"protein-tef", title:"Protein Bonus", fact:"Protein uses 20–30% of its calories just to digest — it keeps you fuller longer.", source:"Thermic Effect of Food", accentColor:"#22c55e", icon:"🥩" },
  { name:"portion-growth", title:"Portion Creep", fact:"Restaurant portions in SA have grown by ~138% since 1980.", source:"Portion size trend studies", accentColor:"#eab308", icon:"📈" },
  { name:"woolies-salad", title:"Healthy Salad Trap", fact:"A Woolworths 'healthy' salad can beat a Big Mac if you add the dressing.", source:"Menu nutrition labels", accentColor:"#84cc16", icon:"🥗" },
  { name:"cooking-oil", title:"Oil Adds Up", fact:"One tablespoon of oil per meal = ~360 extra calories per day.", source:"USDA food data", accentColor:"#f97316", icon:"🫗" },
  { name:"cake-burn", title:"Cake Reality", fact:"You'd need to run ~40 minutes to burn off one slice of cake.", source:"Calorie burn estimates", accentColor:"#ec4899", icon:"🍰" },
  { name:"brown-vs-white", title:"Brown vs White", fact:"Brown bread has almost the same calories as white — the difference is fibre.", source:"Local bread labels", accentColor:"#a16207", icon:"🍞" },
  { name:"biltong-win", title:"Biltong Wins", fact:"Biltong is one of SA’s best snacks — ~120 cal per 30g with 20g protein.", source:"Local nutrition labels", accentColor:"#ef4444", icon:"🥩" },
  { name:"alcohol-7", title:"Alcohol Calories", fact:"Alcohol has 7 calories per gram — almost as much as fat (9 cal/g).", source:"Nutrition science", accentColor:"#f59e0b", icon:"🍷" },
  { name:"tracking-2x", title:"Tracking Works", fact:"Tracking what you eat makes you 2x more likely to lose weight.", source:"Journal of the Academy of Nutrition (2019)", accentColor:"#22c55e", icon:"📒" },
  { name:"liquid-calories", title:"Liquid Calories", fact:"Calories you drink are less filling than calories you chew — easy to overdo.", source:"Appetite research", accentColor:"#3b82f6", icon:"🥤" },
  { name:"weekend-creep", title:"Weekend Creep", fact:"Most people eat 30–50% more calories on weekends.", source:"Dietary pattern studies", accentColor:"#fb7185", icon:"📅" },
  { name:"nut-handful", title:"Nuts Are Dense", fact:"A small handful of nuts can be 180–220 calories.", source:"Nutrition labels", accentColor:"#a855f7", icon:"🥜" },
];

// ═══════════════════════════════════════════
// MYTH BUSTERS
// ═══════════════════════════════════════════
const mythBusters = [
  { name:"after-8pm", myth:"Eating after 8pm makes you fat", truth:"Calories don’t have a clock. Total daily intake matters most.", accentColor:"#ef4444", icon:"⏰" },
  { name:"fruit-fat", myth:"Fruit makes you fat", truth:"An apple is ~95 cal. A muffin is 450. Fruit is never the problem.", accentColor:"#22c55e", icon:"🍎" },
  { name:"six-meals", myth:"You need 6 small meals a day", truth:"Meal frequency doesn’t matter. Total calories do.", accentColor:"#3b82f6", icon:"🥣" },
  { name:"carbs-bad", myth:"Carbs are bad", truth:"Rice, potatoes and bread are fine. It’s butter, oil and sauces that add calories.", accentColor:"#f59e0b", icon:"🍚" },
  { name:"salads-healthy", myth:"Salads are always healthy", truth:"A Caesar with dressing can be 700+ calories. More than a burger.", accentColor:"#84cc16", icon:"🥗" },
  { name:"spot-reduce", myth:"You can spot-reduce belly fat", truth:"Crunches build muscle. A calorie deficit loses fat — you can’t choose where.", accentColor:"#8b5cf6", icon:"🎯" },
  { name:"organic-calories", myth:"Organic food has fewer calories", truth:"Organic is how it’s grown. Calories are identical.", accentColor:"#14b8a6", icon:"🌱" },
  { name:"skip-breakfast", myth:"Skipping breakfast slows your metabolism", truth:"Intermittent fasting works fine. Eat when it suits you.", accentColor:"#0ea5e9", icon:"🌅" },
  { name:"diet-drinks", myth:"Diet drinks make you gain weight", truth:"Zero calories = zero calories. Studies are about behaviour.", accentColor:"#60a5fa", icon:"🥤" },
  { name:"gluten-free", myth:"Gluten-free means healthier", truth:"Unless you’re coeliac, gluten-free often has MORE calories.", accentColor:"#f97316", icon:"🚫" },
  { name:"protein-shakes", myth:"You need protein shakes to build muscle", truth:"Two chicken breasts = 60g protein. Most people don’t need supplements.", accentColor:"#22c55e", icon:"🥩" },
  { name:"fat-free", myth:"Fat-free food is better", truth:"Fat-free often replaces fat with sugar. Check the calories, not the label.", accentColor:"#eab308", icon:"🧾" },
  { name:"detox-tea", myth:"Detox teas help you lose weight", truth:"They’re laxatives with marketing. Save your money.", accentColor:"#f472b6", icon:"🫖" },
  { name:"starvation-stop", myth:"Starvation mode stops weight loss", truth:"Metabolic adaptation is real but small (5–10%). Deficit = loss.", accentColor:"#ef4444", icon:"⚖️" },
  { name:"brown-bread", myth:"Brown bread is much healthier than white", truth:"More fibre (good) but almost the same calories. Both are fine.", accentColor:"#a16207", icon:"🍞" },
  { name:"sweat-fat", myth:"Sweating means you’re burning more fat", truth:"Sweat is just water loss. Fat loss comes from a calorie deficit.", accentColor:"#38bdf8", icon:"💦" },
  { name:"supplements", myth:"Supplements melt fat", truth:"There’s no magic pill. Food + movement wins.", accentColor:"#f59e0b", icon:"💊" },
];

// ═══════════════════════════════════════════
// FITSORTED PRODUCT FEATURES
// ═══════════════════════════════════════════
const productFeatures = [
  { name:"macro-tracking", headline:"Track protein, carbs and fat — not just calories", description:"Every food you log shows full macros automatically.", example:"You: ‘2 eggs and toast’ → FitSorted: 310 cal | 22g protein | 18g carbs | 19g fat", accentColor:"#22c55e", icon:"🥚" },
  { name:"morning-checkin", headline:"Morning check-in at 6:30 AM", description:"Start every day knowing where you stand. Yesterday’s recap + today’s targets.", example:"☀️ Morning! Yesterday: 1,850 cal (under budget ✅). Protein: 112g. Today’s target: 1,900 cal", accentColor:"#f59e0b", icon:"🌅" },
  { name:"evening-summary", headline:"Evening summary at 8 PM", description:"Know exactly how your day went without checking anything.", example:"📊 Today: 1,720 cal | Protein: 98g | Under budget by 180 cal 🎯", accentColor:"#3b82f6", icon:"🌙" },
  { name:"sa-foods", headline:"400+ SA foods built in", description:"Nando’s, KFC, Woolworths, Steers, Spur — we know them all.", example:"You: ‘nandos quarter chicken and chips’ → 680 cal | 45g protein", accentColor:"#ef4444", icon:"🇿🇦" },
  { name:"no-app", headline:"No app download needed", description:"Works inside WhatsApp. Zero storage. Zero data. Already on your phone.", example:"Just message +27 69 068 4940 on WhatsApp", accentColor:"#22c55e", icon:"📱" },
  { name:"nutrition-coach", headline:"Ask anything about nutrition", description:"Coaching mode — ask questions, get personalised answers.", example:"You: ‘how much protein do I need?’ → Based on your weight (82kg), aim for 130–160g/day", accentColor:"#8b5cf6", icon:"🧠" },
  { name:"weight-tracking", headline:"Track your weight over time", description:"Log your weight and see the trend — not just daily fluctuations.", example:"You: ‘weight 84.2’ → Logged! 7-day trend: ↓0.4kg. You’re on track 💪", accentColor:"#f97316", icon:"⚖️" },
  { name:"exercise-logging", headline:"Exercise logging", description:"Log workouts and see calories burned.", example:"You: ‘30 min run’ → Logged! ~300 cal burned. Nice work 🏃", accentColor:"#14b8a6", icon:"🏃" },
  { name:"offline-queue", headline:"Works offline (sort of)", description:"WhatsApp queues your messages. Send whenever, we process when you’re online.", example:"Send your meals on the train — we’ll catch them later.", accentColor:"#6366f1", icon:"📶" },
  { name:"price-value", headline:"R49/month — that’s R1.63/day", description:"Less than a Coke. For a personal nutritionist in your pocket.", example:"Save more than you spend by avoiding one snack a day.", accentColor:"#eab308", icon:"💸" },
  { name:"photo-recognition", headline:"Photo food recognition", description:"Send a photo of your meal and we’ll estimate the calories.", example:"📸 → Looks like grilled chicken with rice and salad. Estimated: 520 cal", accentColor:"#ec4899", icon:"📸" },
  { name:"free-trial", headline:"7-day free trial", description:"Try everything free for a week. No card needed. Just WhatsApp.", example:"Start today, cancel any time — no stress.", accentColor:"#22c55e", icon:"🎁" },
  { name:"smart-swaps", headline:"Smart swaps suggestions", description:"FitSorted suggests lower-cal swaps for your favourites.", example:"You: ‘Big Mac’ → Try: McChicken + side salad (save 350 cal)", accentColor:"#0ea5e9", icon:"🔁" },
];

// ═══════════════════════════════════════════
// TRACKING - used items
// ═══════════════════════════════════════════
const USED_FILE = path.join(DIR, 'weekly-used.json');

function getUsed() {
  try { return JSON.parse(fs.readFileSync(USED_FILE, 'utf8')); }
  catch { return { foods: [], drinks: [], cheatSheets: [], didYouKnow: [], mythBusters: [], productFeatures: [] }; }
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

// TikTok-safe versions (no alcohol brand names)
function tiktokFoodCaption(post) {
  if (post.comparison) {
    return tiktokSafeText(`${post.left.name}: ${post.left.cal} cal. ${post.right.name}: ${post.right.cal} cal. Save ${post.saved} cal with one swap 💡 #fitsorted #calorietracker #southafrica #healthyswaps #nutrition`);
  }
  return tiktokSafeText(`${post.food} = ${post.calories} cal. ${runMin(post.calories)} min running. ${post.verdict} #fitsorted #calorietracker #southafrica #nutrition #healthyeating`);
}

function tiktokDrinkCaption(post) {
  const safeName = tiktokSafeName(post.food);
  const safeVerdict = tiktokSafeText(post.verdict);
  return `${safeName} = ${post.calories} cal. ${runMin(post.calories)} min running. ${safeVerdict} #fitsorted #drinkscalories #southafrica #calorietracker #healthylifestyle`;
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

function didYouKnowCaption(post) {
  return `💡 Did you know? ${post.fact} Source: ${post.source}.\n\nTrack smarter with FitSorted on WhatsApp.\n\n#fitsorted #nutrition #southafrica #caloriefacts #healthyeating`;
}

function mythBusterCaption(post) {
  return `❌ Myth: ${post.myth}\n✅ Truth: ${post.truth}\n\nKeep it simple — track your calories with FitSorted.\n\n#fitsorted #nutrition #southafrica #mythbuster #healthyeating`;
}

function productFeatureCaption(post) {
  return `${post.headline}\n\n${post.description}\n${post.example}\n\nTry FitSorted free on WhatsApp 🇿🇦\n\n#fitsorted #whatsapp #nutrition #southafrica`;
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════
(async () => {
  const used = getUsed();
  
  // Pick weekly content
  const foods = pickItems(allFoods, used.foods, 7);
  const drinks = pickItems(allDrinks, used.drinks, 7);
  const cheatSheets = pickItems(allCheatSheets, used.cheatSheets || [], 1);
  const didYouKnowItems = pickItems(didYouKnow, used.didYouKnow || [], 3);
  const mythBusterItems = pickItems(mythBusters, used.mythBusters || [], 2);
  const productFeatureItems = pickItems(productFeatures, used.productFeatures || [], 2);
  
  console.log('📋 This week\'s food posts:');
  foods.forEach(f => console.log(`  - ${f.food} (${f.calories || f.left?.cal + ' vs ' + f.right?.cal} cal)`));
  console.log('\n🍸 This week\'s drink posts:');
  drinks.forEach(d => console.log(`  - ${d.food} (${d.calories} cal)`));
  console.log('\n📊 This week\'s cheat sheets:');
  cheatSheets.forEach(c => console.log(`  - ${c.title}`));
  console.log('\n💡 This week\'s Did You Know:');
  didYouKnowItems.forEach(d => console.log(`  - ${d.title}`));
  console.log('\n❌ This week\'s Myth Busters:');
  mythBusterItems.forEach(m => console.log(`  - ${m.myth}`));
  console.log('\n🧩 This week\'s Product Features:');
  productFeatureItems.forEach(p => console.log(`  - ${p.headline}`));
  
  // Generate images
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ headless: true });
  
  const allItems = [
    ...foods.map(f => ({...f, type:'food'})),
    ...drinks.map(d => ({...d, type:'drink'})),
    ...cheatSheets.map(c => ({...c, type:'cheatsheet'})),
    ...didYouKnowItems.map(d => ({...d, type:'didyouknow'})),
    ...mythBusterItems.map(m => ({...m, type:'mythbuster'})),
    ...productFeatureItems.map(p => ({...p, type:'productfeature'})),
  ];
  
  for (const item of allItems) {
    if (item.type === 'food' || item.type === 'drink') {
      const imgPath = path.join(DIR, `img-${item.name}.png`);
      if (!fs.existsSync(imgPath)) {
        console.log(`\n🎨 Generating image: ${item.name}...`);
        await generateImage(generatePrompt(item), imgPath);
        console.log(`✅ Image saved`);
      }
      
      // Generate HTML
      const imgBase64 = fs.readFileSync(imgPath).toString('base64');
      const imgSrc = `data:image/png;base64,${imgBase64}`;
      const html = item.type === 'food' ? foodHTML(item, imgSrc) : drinkHTML(item, imgSrc);
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
    } else if (item.type === 'cheatsheet') {
      const html = cheatSheetHTML(item);
      const htmlPath = path.join(DIR, `weekly-${item.name}.html`);
      fs.writeFileSync(htmlPath, html);
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1080 });
      await page.goto('file://' + htmlPath);
      const pngPath = path.join(DIR, `weekly-${item.name}.png`);
      await page.screenshot({ path: pngPath, type: 'png' });
      await page.close();
      console.log(`📸 ${item.name}.png`);
    }
  }
  await browser.close();
  
  // Upload to Postiz
  console.log('\n📤 Uploading to Postiz...');
  const uploads = {};      // IG: comma-separated URLs for carousel
  const ttUploads = {};    // TikTok: single mp4 video URL

  // Helper: build 4-slide carousel HTML files for an item, render PNGs, stitch into mp4
  const buildCarousel = (item) => {
    let slides;
    if (item.type === 'didyouknow') slides = buildDidYouKnowSlides(item);
    else if (item.type === 'mythbuster') slides = buildMythBusterSlides(item);
    else if (item.type === 'productfeature') slides = buildProductFeatureSlides(item);
    else slides = buildSlides(item);
    const pngPaths = [];
    for (let si = 0; si < slides.length; si++) {
      const htmlPath = path.join(DIR, `carousel-${item.name}-s${si+1}.html`);
      const pngPath  = path.join(DIR, `carousel-${item.name}-s${si+1}.png`);
      fs.writeFileSync(htmlPath, slides[si]);
      execSync(`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot="${pngPath}" --window-size=1080,1080 --default-background-color=000000 --no-sandbox "file://${htmlPath}" 2>/dev/null`);
      pngPaths.push(pngPath);
    }
    return pngPaths;
  };

  // Helper: stitch PNGs into a slideshow mp4 (3s per slide, fade transitions)
  const buildVideo = (name, pngPaths) => {
    const mp4Path = path.join(DIR, `carousel-${name}.mp4`);
    const inputs = pngPaths.map(p => `-loop 1 -t 3 -i "${p}"`).join(' ');
    const n = pngPaths.length;
    let filterParts = pngPaths.map((_, i) => {
      const fadeOut = i < n - 1 ? `,fade=t=out:st=2.5:d=0.5` : '';
      const fadeIn  = i > 0     ? `fade=t=in:st=0:d=0.5,` : '';
      return `[${i}:v]scale=1080:1080,setsar=1,${fadeIn}setpts=PTS-STARTPTS${fadeOut}[v${i}]`;
    });
    const concatInputs = pngPaths.map((_, i) => `[v${i}]`).join('');
    const filter = filterParts.join(';') + `;${concatInputs}concat=n=${n}:v=1:a=0[outv]`;
    execSync(`ffmpeg -y ${inputs} -filter_complex "${filter}" -map "[outv]" -c:v libx264 -pix_fmt yuv420p -r 30 "${mp4Path}" 2>/dev/null`);
    return mp4Path;
  };

  // Helper: generate 4 slides for a food/drink item
  const buildSlides = (item) => {
    const isComp = item.comparison;
    const accent = item.accentColor || '#ff8c00';
    const bg = `radial-gradient(ellipse at 60% 30%, ${accent}22 0%, #0d0700 50%, #000 100%)`;
    const base = `*{margin:0;padding:0;box-sizing:border-box;}body{width:1080px;height:1080px;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;position:relative;background:#0a0a0a;}.bg{position:absolute;inset:0;background:${bg};}.ov{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.2) 0%,rgba(0,0,0,0.65) 100%);}.c{position:relative;z-index:10;display:flex;flex-direction:column;align-items:center;height:100%;padding:60px 80px;}.dots{display:flex;gap:10px;margin-top:auto;padding-top:20px;}.dot{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,0.2);}.dot.a{background:${accent};width:28px;border-radius:6px;}`;
    const wrap = (style, body, dotActive) => {
      const dotHtml = [0,1,2,3].map(i => `<div class="dot${i===dotActive?' a':''}"></div>`).join('');
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${base}${style}</style></head><body><div class="bg"></div><div class="ov"></div><div class="c">${body}<div class="dots">${dotHtml}</div></div></body></html>`;
    };

    const cal = item.calories || (isComp ? item.left.cal : 0);
    const runMin = Math.round(cal / 10);
    const tag = item.tag || 'FITSORTED';

    // Slide 1: Hook
    const s1style = `.tag{background:${accent}22;border:1.5px solid ${accent}88;color:${accent};font-size:26px;font-weight:700;letter-spacing:3px;padding:10px 28px;border-radius:40px;text-transform:uppercase;margin-bottom:auto;margin-top:0;}.icon{font-size:100px;margin:20px 0 10px;}.q{font-size:48px;font-weight:900;color:rgba(255,255,255,0.5);text-align:center;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;}.name{font-size:90px;font-weight:900;color:#fff;text-align:center;line-height:1;letter-spacing:-2px;margin-bottom:6px;}.sub{font-size:28px;color:rgba(255,255,255,0.4);text-align:center;margin-bottom:30px;}.calrow{display:flex;align-items:baseline;gap:12px;}.calbig{font-size:150px;font-weight:900;color:${accent};line-height:1;letter-spacing:-5px;}.callabel{font-size:38px;font-weight:700;color:rgba(255,255,255,0.6);letter-spacing:4px;}.swipe{font-size:24px;color:rgba(255,255,255,0.3);margin-top:20px;}`;
    const s1body = `<div class="tag">🇿🇦 ${tag}</div><div class="icon">🥘</div><div class="q">DO YOU KNOW HOW MANY CALORIES ARE IN</div><div class="name">${item.food}</div><div class="sub">${item.subtitle}</div><div class="calrow"><div class="calbig">${cal}</div><div class="callabel">CAL</div></div><div class="swipe">SWIPE FOR THE BREAKDOWN →</div>`;

    // Slide 2: Breakdown
    const s2style = `.lbl{font-size:26px;font-weight:700;color:rgba(255,255,255,0.4);letter-spacing:4px;text-transform:uppercase;margin-bottom:16px;margin-top:0;}.ttl{font-size:52px;font-weight:900;color:#fff;margin-bottom:40px;text-align:center;}.bars{display:flex;flex-direction:column;gap:24px;width:100%;}.br{display:flex;flex-direction:column;gap:10px;}.bm{display:flex;justify-content:space-between;align-items:baseline;}.bn{font-size:28px;font-weight:700;color:rgba(255,255,255,0.8);}.bv{font-size:36px;font-weight:900;color:#fff;}.bt{height:20px;background:rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;}.bf1{height:100%;border-radius:12px;background:linear-gradient(90deg,${accent},${accent}99);width:58%;}.bf2{height:100%;border-radius:12px;background:linear-gradient(90deg,#ff5555,#cc2200);width:42%;}.tot{display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,0.15);padding-top:24px;margin-top:8px;}.tl{font-size:30px;font-weight:700;color:rgba(255,255,255,0.5);letter-spacing:2px;}.tv{font-size:68px;font-weight:900;color:${accent};}.run{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:16px 32px;margin-top:24px;font-size:26px;color:rgba(255,255,255,0.6);text-align:center;}`;
    const s2body = `<div class="lbl">THE BREAKDOWN</div><div class="ttl">Where do the calories come from?</div><div class="bars"><div class="br"><div class="bm"><span class="bn">🥐 Dough / carbs</span><span class="bv">${Math.round(cal*0.58)} cal</span></div><div class="bt"><div class="bf1"></div></div></div><div class="br"><div class="bm"><span class="bn">🥩 Protein / filling</span><span class="bv">${Math.round(cal*0.42)} cal</span></div><div class="bt"><div class="bf2"></div></div></div></div><div class="tot"><span class="tl">TOTAL</span><span class="tv">${cal} cal</span></div><div class="run">🏃 ${runMin} min running to burn this off (~${(runMin*0.1).toFixed(1)}km)</div>`;

    // Slide 3: Macros + hacks
    const p = item.protein || 0; const carbs = item.carbs || 0; const fat = item.fat || 0;
    const verdict = item.verdict || 'Track it. Know it. Own it.';
    const s3style = `.lbl{font-size:26px;font-weight:700;color:rgba(255,255,255,0.4);letter-spacing:4px;text-transform:uppercase;margin-bottom:16px;margin-top:0;}.ttl{font-size:52px;font-weight:900;color:#fff;margin-bottom:36px;text-align:center;}.macros{display:flex;gap:20px;margin-bottom:36px;width:100%;}.mac{flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:26px 20px;text-align:center;}.mv{font-size:50px;font-weight:900;color:#fff;}.ml{font-size:19px;color:rgba(255,255,255,0.4);letter-spacing:2px;font-weight:600;margin-top:6px;}.verdict{background:${accent}18;border:1px solid ${accent}44;border-radius:20px;padding:28px 36px;margin-bottom:16px;font-size:30px;color:rgba(255,255,255,0.85);line-height:1.5;text-align:center;font-style:italic;}`;
    const s3body = `<div class="lbl">THE MACROS</div><div class="ttl">Full nutritional breakdown</div><div class="macros"><div class="mac"><div class="mv">${p}g</div><div class="ml">PROTEIN</div></div><div class="mac"><div class="mv">${carbs}g</div><div class="ml">CARBS</div></div><div class="mac"><div class="mv">${fat}g</div><div class="ml">FAT</div></div></div><div class="verdict">"${verdict}"</div>`;

    // Slide 4: CTA
    const s4style = `.icon{font-size:80px;margin-bottom:20px;}.hl{font-size:60px;font-weight:900;color:#fff;text-align:center;line-height:1.1;letter-spacing:-1px;margin-bottom:16px;}.sub{font-size:28px;color:rgba(255,255,255,0.5);text-align:center;max-width:700px;line-height:1.5;margin-bottom:30px;}.cta{background:linear-gradient(135deg,${accent},${accent}99);border-radius:24px;padding:28px 56px;margin-bottom:16px;}.ct{font-size:34px;font-weight:900;color:#fff;text-align:center;letter-spacing:1px;}.cs{font-size:22px;color:rgba(255,255,255,0.8);text-align:center;margin-top:6px;}.num{font-size:26px;color:${accent}cc;margin-top:6px;}.badge{background:rgba(255,255,255,0.08);border:1.5px solid rgba(255,255,255,0.15);color:#fff;font-size:22px;font-weight:800;letter-spacing:2px;padding:10px 28px;border-radius:40px;margin-top:16px;}`;
    const s4body = `<div class="icon">🏋️</div><div class="hl">Track everything you eat on WhatsApp</div><div class="sub">No app. Just message FitSorted — SA foods, local restaurants, macros.</div><div class="cta"><div class="ct">Try FitSorted FREE for 7 days</div><div class="cs">Then just R49/month 🇿🇦</div></div><div class="num">WhatsApp +27 69 068 4940</div><div class="badge">🏋️ FITSORTED</div>`;

    return [
      wrap(s1style, s1body, 0),
      wrap(s2style, s2body, 1),
      wrap(s3style, s3body, 2),
      wrap(s4style, s4body, 3),
    ];
  };

  const buildDidYouKnowSlides = (item) => {
    const accent = item.accentColor || '#22c55e';
    const icon = item.icon || '💡';
    const bg = `radial-gradient(ellipse at 60% 30%, ${accent}22 0%, #0b0b0f 55%, #000 100%)`;
    const base = `*{margin:0;padding:0;box-sizing:border-box;}body{width:1080px;height:1080px;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;background:#0a0a0a;}.bg{position:absolute;inset:0;background:${bg};}.ov{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.2) 0%,rgba(0,0,0,0.75) 100%);}.c{position:relative;z-index:10;display:flex;flex-direction:column;align-items:center;height:100%;padding:70px 90px;text-align:center;}.dots{display:flex;gap:10px;margin-top:auto;padding-top:20px;}.dot{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,0.2);}.dot.a{background:${accent};width:28px;border-radius:6px;}`;
    const wrap = (style, body, dotActive) => {
      const dotHtml = [0,1,2,3].map(i => `<div class=\"dot${i===dotActive?' a':''}\"></div>`).join('');
      return `<!DOCTYPE html><html><head><meta charset=\"utf-8\"><style>${base}${style}</style></head><body><div class=\"bg\"></div><div class=\"ov\"></div><div class=\"c\">${body}<div class=\"dots\">${dotHtml}</div></div></body></html>`;
    };

    const s1style = `.tag{background:${accent}22;border:1.5px solid ${accent}88;color:${accent};font-size:26px;font-weight:800;letter-spacing:3px;padding:12px 30px;border-radius:40px;margin-bottom:28px;}.icon{font-size:100px;margin-bottom:10px;}.ttl{font-size:62px;font-weight:900;color:#fff;line-height:1.1;margin-bottom:14px;}.sub{font-size:30px;color:rgba(255,255,255,0.55);}`;
    const s1body = `<div class=\"tag\">DID YOU KNOW?</div><div class=\"icon\">${icon}</div><div class=\"ttl\">${item.title}</div><div class=\"sub\">Swipe for the fact →</div>`;

    const s2style = `.lbl{font-size:26px;letter-spacing:3px;color:${accent};font-weight:800;margin-bottom:14px;}.fact{font-size:42px;font-weight:800;color:#fff;line-height:1.2;margin-bottom:26px;}.src{font-size:22px;color:rgba(255,255,255,0.45);}`;
    const s2body = `<div class=\"lbl\">THE FACT</div><div class=\"fact\">${item.fact}</div><div class=\"src\">Source: ${item.source}</div>`;

    const s3style = `.lbl{font-size:26px;letter-spacing:3px;color:${accent};font-weight:800;margin-bottom:18px;}.tip{font-size:44px;font-weight:800;color:#fff;line-height:1.2;margin-bottom:20px;}.sub{font-size:26px;color:rgba(255,255,255,0.55);line-height:1.5;}`;
    const s3body = `<div class=\"lbl\">WHAT THIS MEANS FOR YOU</div><div class=\"tip\">Awareness beats guesswork.</div><div class=\"sub\">Small habits add up fast. Track it for a week and your portions change for life.</div>`;

    const s4style = `.icon{font-size:80px;margin-bottom:20px;}.hl{font-size:58px;font-weight:900;color:#fff;line-height:1.1;margin-bottom:14px;}.sub{font-size:28px;color:rgba(255,255,255,0.55);line-height:1.5;margin-bottom:26px;}.cta{background:linear-gradient(135deg,${accent},${accent}99);border-radius:24px;padding:26px 52px;margin-bottom:14px;}.ct{font-size:32px;font-weight:900;color:#fff;}.cs{font-size:22px;color:rgba(255,255,255,0.85);margin-top:6px;}.num{font-size:26px;color:${accent}cc;margin-top:6px;}.badge{background:rgba(255,255,255,0.08);border:1.5px solid rgba(255,255,255,0.15);color:#fff;font-size:22px;font-weight:800;letter-spacing:2px;padding:10px 28px;border-radius:40px;margin-top:16px;}`;
    const s4body = `<div class=\"icon\">🏋️</div><div class=\"hl\">Track smarter on WhatsApp</div><div class=\"sub\">No app. Local SA foods. Full macros.</div><div class=\"cta\"><div class=\"ct\">Try FitSorted FREE for 7 days</div><div class=\"cs\">Then just R49/month 🇿🇦</div></div><div class=\"num\">WhatsApp +27 69 068 4940</div><div class=\"badge\">🏋️ FITSORTED</div>`;

    return [
      wrap(s1style, s1body, 0),
      wrap(s2style, s2body, 1),
      wrap(s3style, s3body, 2),
      wrap(s4style, s4body, 3),
    ];
  };

  const buildMythBusterSlides = (item) => {
    const accent = item.accentColor || '#ef4444';
    const icon = item.icon || '❌';
    const bg = `radial-gradient(ellipse at 60% 30%, ${accent}22 0%, #0b0b0f 55%, #000 100%)`;
    const base = `*{margin:0;padding:0;box-sizing:border-box;}body{width:1080px;height:1080px;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;background:#0a0a0a;}.bg{position:absolute;inset:0;background:${bg};}.ov{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.2) 0%,rgba(0,0,0,0.75) 100%);}.c{position:relative;z-index:10;display:flex;flex-direction:column;align-items:center;height:100%;padding:70px 90px;text-align:center;}.dots{display:flex;gap:10px;margin-top:auto;padding-top:20px;}.dot{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,0.2);}.dot.a{background:${accent};width:28px;border-radius:6px;}`;
    const wrap = (style, body, dotActive) => {
      const dotHtml = [0,1,2,3].map(i => `<div class=\"dot${i===dotActive?' a':''}\"></div>`).join('');
      return `<!DOCTYPE html><html><head><meta charset=\"utf-8\"><style>${base}${style}</style></head><body><div class=\"bg\"></div><div class=\"ov\"></div><div class=\"c\">${body}<div class=\"dots\">${dotHtml}</div></div></body></html>`;
    };

    const s1style = `.tag{background:${accent}22;border:1.5px solid ${accent}88;color:${accent};font-size:26px;font-weight:800;letter-spacing:3px;padding:12px 30px;border-radius:40px;margin-bottom:28px;}.icon{font-size:100px;margin-bottom:10px;}.ttl{font-size:58px;font-weight:900;color:#fff;line-height:1.15;margin-bottom:10px;}.myth{font-size:36px;color:rgba(255,255,255,0.55);}`;
    const s1body = `<div class=\"tag\">MYTH</div><div class=\"icon\">${icon}</div><div class=\"ttl\">${item.myth}</div><div class=\"myth\">Sounds right... but it isn’t.</div>`;

    const s2style = `.tag{background:#22c55e22;border:1.5px solid #22c55e88;color:#22c55e;font-size:26px;font-weight:800;letter-spacing:3px;padding:12px 30px;border-radius:40px;margin-bottom:24px;}.truth{font-size:44px;font-weight:900;color:#fff;line-height:1.2;}`;
    const s2body = `<div class=\"tag\">TRUTH</div><div class=\"truth\">${item.truth}</div>`;

    const s3style = `.lbl{font-size:26px;letter-spacing:3px;color:${accent};font-weight:800;margin-bottom:18px;}.tip{font-size:44px;font-weight:800;color:#fff;line-height:1.2;margin-bottom:14px;}.sub{font-size:26px;color:rgba(255,255,255,0.55);line-height:1.5;}`;
    const s3body = `<div class=\"lbl\">PRACTICAL TIP</div><div class=\"tip\">Focus on total calories.</div><div class=\"sub\">One solid target beats random rules. Keep it simple and consistent.</div>`;

    const s4style = `.icon{font-size:80px;margin-bottom:20px;}.hl{font-size:58px;font-weight:900;color:#fff;line-height:1.1;margin-bottom:14px;}.sub{font-size:28px;color:rgba(255,255,255,0.55);line-height:1.5;margin-bottom:26px;}.cta{background:linear-gradient(135deg,${accent},${accent}99);border-radius:24px;padding:26px 52px;margin-bottom:14px;}.ct{font-size:32px;font-weight:900;color:#fff;}.cs{font-size:22px;color:rgba(255,255,255,0.85);margin-top:6px;}.num{font-size:26px;color:${accent}cc;margin-top:6px;}.badge{background:rgba(255,255,255,0.08);border:1.5px solid rgba(255,255,255,0.15);color:#fff;font-size:22px;font-weight:800;letter-spacing:2px;padding:10px 28px;border-radius:40px;margin-top:16px;}`;
    const s4body = `<div class=\"icon\">🏋️</div><div class=\"hl\">Cut through the noise</div><div class=\"sub\">Track what matters with FitSorted on WhatsApp.</div><div class=\"cta\"><div class=\"ct\">Try FitSorted FREE for 7 days</div><div class=\"cs\">Then just R49/month 🇿🇦</div></div><div class=\"num\">WhatsApp +27 69 068 4940</div><div class=\"badge\">🏋️ FITSORTED</div>`;

    return [
      wrap(s1style, s1body, 0),
      wrap(s2style, s2body, 1),
      wrap(s3style, s3body, 2),
      wrap(s4style, s4body, 3),
    ];
  };

  const buildProductFeatureSlides = (item) => {
    const accent = item.accentColor || '#22c55e';
    const icon = item.icon || '🧩';
    const bg = `radial-gradient(ellipse at 60% 30%, ${accent}22 0%, #0b0b0f 55%, #000 100%)`;
    const base = `*{margin:0;padding:0;box-sizing:border-box;}body{width:1080px;height:1080px;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;background:#0a0a0a;}.bg{position:absolute;inset:0;background:${bg};}.ov{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.2) 0%,rgba(0,0,0,0.75) 100%);}.c{position:relative;z-index:10;display:flex;flex-direction:column;align-items:center;height:100%;padding:70px 90px;text-align:center;}.dots{display:flex;gap:10px;margin-top:auto;padding-top:20px;}.dot{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,0.2);}.dot.a{background:${accent};width:28px;border-radius:6px;}`;
    const wrap = (style, body, dotActive) => {
      const dotHtml = [0,1,2,3].map(i => `<div class=\"dot${i===dotActive?' a':''}\"></div>`).join('');
      return `<!DOCTYPE html><html><head><meta charset=\"utf-8\"><style>${base}${style}</style></head><body><div class=\"bg\"></div><div class=\"ov\"></div><div class=\"c\">${body}<div class=\"dots\">${dotHtml}</div></div></body></html>`;
    };

    const s1style = `.tag{background:${accent}22;border:1.5px solid ${accent}88;color:${accent};font-size:26px;font-weight:800;letter-spacing:3px;padding:12px 30px;border-radius:40px;margin-bottom:28px;}.icon{font-size:100px;margin-bottom:10px;}.ttl{font-size:58px;font-weight:900;color:#fff;line-height:1.15;margin-bottom:12px;}.sub{font-size:28px;color:rgba(255,255,255,0.55);}`;
    const s1body = `<div class=\"tag\">FEATURE</div><div class=\"icon\">${icon}</div><div class=\"ttl\">${item.headline}</div><div class=\"sub\">Built for SA lifestyles</div>`;

    const s2style = `.lbl{font-size:26px;letter-spacing:3px;color:${accent};font-weight:800;margin-bottom:14px;}.desc{font-size:36px;font-weight:700;color:#fff;line-height:1.25;margin-bottom:22px;}.chat{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:18px;padding:22px 26px;font-size:26px;color:rgba(255,255,255,0.85);line-height:1.35;text-align:left;width:100%;}`;
    const s2body = `<div class=\"lbl\">HOW IT WORKS</div><div class=\"desc\">${item.description}</div><div class=\"chat\">${item.example}</div>`;

    const s3style = `.lbl{font-size:26px;letter-spacing:3px;color:${accent};font-weight:800;margin-bottom:18px;}.why{font-size:44px;font-weight:900;color:#fff;line-height:1.2;margin-bottom:14px;}.sub{font-size:26px;color:rgba(255,255,255,0.55);line-height:1.5;}`;
    const s3body = `<div class=\"lbl\">WHY IT MATTERS</div><div class=\"why\">Less effort. More consistency.</div><div class=\"sub\">When tracking is easy, you actually stick to it — and results follow.</div>`;

    const s4style = `.icon{font-size:80px;margin-bottom:20px;}.hl{font-size:58px;font-weight:900;color:#fff;line-height:1.1;margin-bottom:14px;}.sub{font-size:28px;color:rgba(255,255,255,0.55);line-height:1.5;margin-bottom:26px;}.cta{background:linear-gradient(135deg,${accent},${accent}99);border-radius:24px;padding:26px 52px;margin-bottom:14px;}.ct{font-size:32px;font-weight:900;color:#fff;}.cs{font-size:22px;color:rgba(255,255,255,0.85);margin-top:6px;}.num{font-size:26px;color:${accent}cc;margin-top:6px;}.badge{background:rgba(255,255,255,0.08);border:1.5px solid rgba(255,255,255,0.15);color:#fff;font-size:22px;font-weight:800;letter-spacing:2px;padding:10px 28px;border-radius:40px;margin-top:16px;}`;
    const s4body = `<div class=\"icon\">🏋️</div><div class=\"hl\">Try FitSorted free</div><div class=\"sub\">WhatsApp-based calorie tracking made for SA.</div><div class=\"cta\"><div class=\"ct\">7-day FREE trial</div><div class=\"cs\">Then just R49/month 🇿🇦</div></div><div class=\"num\">WhatsApp +27 69 068 4940</div><div class=\"badge\">🏋️ FITSORTED</div>`;

    return [
      wrap(s1style, s1body, 0),
      wrap(s2style, s2body, 1),
      wrap(s3style, s3body, 2),
      wrap(s4style, s4body, 3),
    ];
  };

  for (const item of allItems) {
    const pngPath = path.join(DIR, `weekly-${item.name}.png`);
    try {
      // Build carousel slides
      const slidePngs = buildCarousel(item);

      // Upload all slide PNGs for Instagram carousel (comma-separated)
      const igUrls = [];
      for (const sp of slidePngs) {
        const out = execSync(`postiz upload "${sp}" 2>&1`, { env: { ...process.env, POSTIZ_API_KEY: POSTIZ_KEY } }).toString();
        const match = out.match(/"path":\s*"([^"]+)"/);
        if (match) igUrls.push(match[1]);
        await new Promise(r => setTimeout(r, 2000));
      }
      if (igUrls.length) {
        uploads[item.name] = igUrls.join(',');
        console.log(`✅ IG carousel ${item.name} → ${igUrls.length} slides`);
      }

      // Build mp4 slideshow for TikTok
      const mp4Path = buildVideo(item.name, slidePngs);
      const ttOut = execSync(`postiz upload "${mp4Path}" 2>&1`, { env: { ...process.env, POSTIZ_API_KEY: POSTIZ_KEY } }).toString();
      const ttMatch = ttOut.match(/"path":\s*"([^"]+)"/);
      if (ttMatch) {
        ttUploads[item.name] = ttMatch[1];
        console.log(`✅ TT video ${item.name} → ${ttMatch[1]}`);
      }
    } catch(e) { console.error(`❌ Upload failed: ${item.name} — ${e.message.slice(0,100)}`); }
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
      
      // TikTok food at 10:30AM SA = 08:30 UTC (video slideshow)
      // Uses tiktokSafe caption to avoid alcohol brand strikes
      if (ttUploads[food.name]) try {
        const ttCap = tiktokFoodCaption(food);
        execSync(`postiz posts:create -c "${ttCap.replace(/"/g,'\\"')}" -m "${ttUploads[food.name]}" -s "${dateStr}T08:30:00Z" --settings '${S_TT}' -i "${TT_ID}" 2>&1`, { env: { ...process.env, POSTIZ_API_KEY: POSTIZ_KEY } });
        console.log(`✅ ${days[i]} 10:30AM TT: ${food.name}`);
      } catch(e) { console.error(`❌ ${days[i]} TT food: ${e.message.slice(0,100)}`); }
      await new Promise(r => setTimeout(r, 8000));
    }
    
    // Drink at 6PM SA = 16:00 UTC
    if (uploads[drink.name]) {
      // TikTok drink at 6:30PM SA = 16:30 UTC (video slideshow)
      // Uses tiktokSafe caption to avoid alcohol brand strikes
      if (ttUploads[drink.name]) try {
        const ttDrinkCap = tiktokDrinkCaption(drink);
        execSync(`postiz posts:create -c "${ttDrinkCap.replace(/"/g,'\\"')}" -m "${ttUploads[drink.name]}" -s "${dateStr}T16:30:00Z" --settings '${S_TT}' -i "${TT_ID}" 2>&1`, { env: { ...process.env, POSTIZ_API_KEY: POSTIZ_KEY } });
        console.log(`✅ ${days[i]} 6:30PM TT: ${drink.name}`);
      } catch(e) { console.error(`❌ ${days[i]} TT drink: ${e.message.slice(0,100)}`); }
      await new Promise(r => setTimeout(r, 8000));
    }

    // Midday content at 1PM SA = 11:00 UTC (staggered if two posts)
    const middayItems = [];
    if (i === 0 && didYouKnowItems[0]) middayItems.push({ item: didYouKnowItems[0], type: 'didyouknow' });
    if (i === 1 && mythBusterItems[0]) middayItems.push({ item: mythBusterItems[0], type: 'mythbuster' });
    if (i === 2 && cheatSheets[0]) middayItems.push({ item: cheatSheets[0], type: 'cheatsheet' });
    if (i === 2 && productFeatureItems[0]) middayItems.push({ item: productFeatureItems[0], type: 'productfeature' });
    if (i === 3 && didYouKnowItems[1]) middayItems.push({ item: didYouKnowItems[1], type: 'didyouknow' });
    if (i === 4 && mythBusterItems[1]) middayItems.push({ item: mythBusterItems[1], type: 'mythbuster' });
    if (i === 5 && productFeatureItems[1]) middayItems.push({ item: productFeatureItems[1], type: 'productfeature' });
    if (i === 6 && didYouKnowItems[2]) middayItems.push({ item: didYouKnowItems[2], type: 'didyouknow' });

    const timeStr = (h, m) => `${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00Z`;

    for (let mi = 0; mi < middayItems.length; mi++) {
      const { item: midItem, type } = middayItems[mi];
      const offset = mi * 20; // stagger by 20 minutes if two posts
      const igTime = timeStr(11, 0 + offset);
      const ttTime = timeStr(11, 30 + offset);
      const cap = type === 'cheatsheet' ? cheatSheetCaption(midItem)
        : type === 'didyouknow' ? didYouKnowCaption(midItem)
        : type === 'mythbuster' ? mythBusterCaption(midItem)
        : productFeatureCaption(midItem);

      if (uploads[midItem.name]) {
        // Instagram: only ONE midday post per day (avoid 3-post bursts)
        if (mi === 0) {
          try {
            execSync(`postiz posts:create -c "${cap.replace(/"/g,'\\"')}" -m "${uploads[midItem.name]}" -s "${igTime}" --settings '${S_POST}' -i "${IG_ID}" 2>&1`, { env: { ...process.env, POSTIZ_API_KEY: POSTIZ_KEY } });
            console.log(`✅ ${days[i]} 1PM IG: ${midItem.name}`);
          } catch(e) { console.error(`❌ ${days[i]} IG midday: ${e.message.slice(0,100)}`); }
          await new Promise(r => setTimeout(r, 8000));
        }

        // TikTok gets all midday items
        if (ttUploads[midItem.name]) try {
          execSync(`postiz posts:create -c "${cap.replace(/"/g,'\\"')}" -m "${ttUploads[midItem.name]}" -s "${ttTime}" --settings '${S_TT}' -i "${TT_ID}" 2>&1`, { env: { ...process.env, POSTIZ_API_KEY: POSTIZ_KEY } });
          console.log(`✅ ${days[i]} 1:30PM TT: ${midItem.name}`);
        } catch(e) { console.error(`❌ ${days[i]} TT midday: ${e.message.slice(0,100)}`); }
        await new Promise(r => setTimeout(r, 8000));
      }
    }
  }

  // Save used items
  used.foods.push(...foods.map(f => f.name));
  used.drinks.push(...drinks.map(d => d.name));
  if (!used.cheatSheets) used.cheatSheets = [];
  if (!used.didYouKnow) used.didYouKnow = [];
  if (!used.mythBusters) used.mythBusters = [];
  if (!used.productFeatures) used.productFeatures = [];
  used.cheatSheets.push(...cheatSheets.map(c => c.name));
  used.didYouKnow.push(...didYouKnowItems.map(d => d.name));
  used.mythBusters.push(...mythBusterItems.map(m => m.name));
  used.productFeatures.push(...productFeatureItems.map(p => p.name));
  saveUsed(used);
  
  console.log('\n🎉 Weekly content generation complete!');
  console.log(`Foods used total: ${used.foods.length}/${allFoods.length}`);
  console.log(`Drinks used total: ${used.drinks.length}/${allDrinks.length}`);
})();
