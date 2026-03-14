const fs = require('fs');
const path = require('path');
const https = require('https');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const runMin = (cal) => Math.round(cal / 10);

const meals = [
  {
    name: "steers-wacky-wednesday",
    food: "Steers Wacky Wednesday",
    subtitle: "Burger + chips combo",
    calories: 1240,
    protein: 42, carbs: 110, fat: 68, fibre: 5,
    accentColor: "#ef4444",
    verdict: "Half your daily calories in one meal deal.",
    tag: "FAST FOOD",
    imagePrompt: "Professional food photography of a large beef burger with sesame bun, melted cheese, lettuce, tomato, and a side of thick-cut golden fries on a red tray, dark moody restaurant background, overhead angle, soft warm lighting, photorealistic"
  },
  {
    name: "woolworths-chicken-wrap-v2",
    food: "Woolworths Chicken Wrap",
    subtitle: "The 'healthy' grab & go",
    calories: 620,
    protein: 28, carbs: 52, fat: 32, fibre: 4,
    accentColor: "#22c55e",
    verdict: "Not as light as you think. Check the sauce.",
    tag: "THINK AGAIN",
    imagePrompt: "Professional food photography of a grilled chicken wrap with lettuce, tomato, and creamy sauce in a flour tortilla, on a clean white plate, minimalist background, bright natural lighting, shot from 45 degree angle, photorealistic"
  },
  {
    name: "kfc-streetwise-2",
    food: "KFC Streetwise 2",
    subtitle: "2 pieces + small chips + roll",
    calories: 785,
    protein: 35, carbs: 65, fat: 40, fibre: 3,
    accentColor: "#ef4444",
    verdict: "The roll alone is 180 cal. Skip it.",
    tag: "FAST FOOD",
    imagePrompt: "Professional food photography of two pieces of crispy fried chicken with golden batter, small portion of fries and a bread roll on a red paper-lined tray, dark background, dramatic side lighting, photorealistic"
  },
  {
    name: "spur-ribs-chips",
    food: "Spur Ribs & Chips",
    subtitle: "Full rack + onion rings",
    calories: 1450,
    protein: 55, carbs: 95, fat: 85, fibre: 6,
    accentColor: "#f97316",
    verdict: "Three-quarters of your daily calories. Worth it though.",
    tag: "RESTAURANT",
    imagePrompt: "Professional food photography of a full rack of BBQ glazed pork ribs with thick-cut fries and crispy onion rings on a wooden board, dark rustic restaurant setting, warm lighting, slight smoke, photorealistic"
  },
  {
    name: "ocean-basket-fish-chips",
    food: "Ocean Basket Fish & Chips",
    subtitle: "Hake + chips + tartare",
    calories: 980,
    protein: 38, carbs: 78, fat: 55, fibre: 4,
    accentColor: "#3b82f6",
    verdict: "Grilled saves you 300 cal. Ask for it.",
    tag: "RESTAURANT",
    imagePrompt: "Professional food photography of golden battered fish fillets with thick-cut chips and a small pot of tartare sauce on a white plate, coastal restaurant setting, bright natural light, photorealistic"
  },
  {
    name: "wimpy-breakfast",
    food: "Wimpy Breakfast",
    subtitle: "The full English",
    calories: 1100,
    protein: 45, carbs: 75, fat: 65, fibre: 5,
    accentColor: "#f59e0b",
    verdict: "Half your daily intake before 9 AM.",
    tag: "BREAKFAST",
    imagePrompt: "Professional food photography of a full English breakfast on a white plate - two fried eggs, bacon rashers, grilled tomato, baked beans, toast, and a sausage, bright diner setting, top-down angle, warm morning light, photorealistic"
  },
  {
    name: "kauai-smoothie-bowl",
    food: "Kauai Smoothie Bowl",
    subtitle: "Acai + granola + honey",
    calories: 540,
    protein: 12, carbs: 82, fat: 18, fibre: 8,
    accentColor: "#a855f7",
    verdict: "Looks healthy. 82g of carbs says otherwise.",
    tag: "HEALTH TRAP",
    imagePrompt: "Professional food photography of a purple acai smoothie bowl topped with granola, sliced banana, blueberries, coconut flakes and a drizzle of honey, on a light wooden table, bright natural lighting, top-down angle, photorealistic"
  },
  {
    name: "mcdonalds-big-mac-meal",
    food: "McDonald's Big Mac Meal",
    subtitle: "Big Mac + large fries + Coke",
    calories: 1080,
    protein: 30, carbs: 135, fat: 48, fibre: 6,
    accentColor: "#ef4444",
    verdict: "The Coke is 200 cal. Water is free.",
    tag: "FAST FOOD",
    imagePrompt: "Professional food photography of a Big Mac hamburger with two beef patties, special sauce, lettuce, cheese, pickles on a sesame bun, alongside large golden french fries and a large Coca-Cola cup, on a red tray, dark background, dramatic lighting, photorealistic"
  },
  {
    name: "vida-latte-muffin",
    food: "Vida Caramel Latte + Muffin",
    subtitle: "Your morning 'treat'",
    calories: 720,
    protein: 12, carbs: 95, fat: 32, fibre: 2,
    accentColor: "#f59e0b",
    verdict: "Your coffee break has more calories than lunch should.",
    tag: "COFFEE SHOCK",
    imagePrompt: "Professional food photography of a large caramel latte in a clear glass with whipped cream and caramel drizzle, next to a chocolate chip muffin on a small plate, trendy coffee shop background, warm cozy lighting, 45 degree angle, photorealistic"
  },
  {
    name: "gatsby-cape-town",
    food: "Gatsby",
    subtitle: "Cape Town's legendary sub",
    calories: 1800,
    protein: 55, carbs: 160, fat: 95, fibre: 8,
    accentColor: "#ef4444",
    verdict: "One sandwich. An entire day's calories. Respect.",
    tag: "LEGEND",
    imagePrompt: "Professional food photography of a massive Cape Town gatsby sandwich - a long sub roll stuffed with steak, chips, lettuce, tomato, and sauce, wrapped in paper, cut in half showing the filling, on a counter, dramatic lighting, photorealistic"
  }
];

async function generateImage(prompt, outputPath) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard"
    });

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/images/generations',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) { reject(new Error(json.error.message)); return; }
          const imageUrl = json.data[0].url;
          
          // Download the image
          https.get(imageUrl, (imgRes) => {
            const chunks = [];
            imgRes.on('data', chunk => chunks.push(chunk));
            imgRes.on('end', () => {
              fs.writeFileSync(outputPath, Buffer.concat(chunks));
              console.log(`  ✅ Saved: ${outputPath}`);
              resolve();
            });
          });
        } catch(e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function generateHTML(post) {
  const imgPath = path.join(__dirname, `img-${post.name}.png`);
  const imgBase64 = fs.readFileSync(imgPath).toString('base64');
  const imgSrc = `data:image/png;base64,${imgBase64}`;
  const mins = runMin(post.calories);
  const km = (mins / 10).toFixed(1);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{width:1080px;height:1080px;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;position:relative;}
    .bg-img{position:absolute;inset:0;background:url('${imgSrc}') center/cover;filter:brightness(0.65);}
    .overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.2) 0%,rgba(0,0,0,0.15) 25%,rgba(0,0,0,0.8) 65%,rgba(0,0,0,0.95) 100%);}
    .content{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;justify-content:flex-end;padding:55px;}
    .tag{background:rgba(0,0,0,0.6);border:1px solid ${post.accentColor}40;color:${post.accentColor};font-size:22px;font-weight:700;padding:8px 24px;border-radius:50px;letter-spacing:2px;margin-bottom:14px;display:inline-block;align-self:flex-start;backdrop-filter:blur(10px);}
    .food-name{font-size:56px;font-weight:800;color:#fff;margin-bottom:4px;text-shadow:0 2px 20px rgba(0,0,0,0.8);}
    .food-sub{font-size:24px;color:#ccc;margin-bottom:20px;}
    .cal-row{display:flex;align-items:baseline;gap:12px;margin-bottom:14px;}
    .cal-big{font-size:96px;font-weight:900;color:${post.accentColor};text-shadow:0 2px 20px rgba(0,0,0,0.5);}
    .cal-label{font-size:26px;color:#aaa;font-weight:600;}
    .run-stat{background:rgba(0,0,0,0.5);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:14px 24px;margin-bottom:16px;display:inline-flex;align-items:center;gap:10px;align-self:flex-start;}
    .run-stat-text{font-size:24px;color:#fff;font-weight:700;}
    .run-stat-sub{font-size:20px;color:#aaa;}
    .macros{display:flex;gap:14px;margin-bottom:16px;}
    .macro{background:rgba(0,0,0,0.6);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:12px 20px;text-align:center;}
    .macro-val{font-size:26px;font-weight:800;color:#fff;}
    .macro-label{font-size:13px;color:#888;margin-top:2px;}
    .verdict{font-size:22px;color:#ccc;font-style:italic;margin-bottom:20px;line-height:1.4;}
    .brand{display:flex;align-items:center;gap:12px;}
    .brand-badge{background:rgba(37,211,102,0.2);backdrop-filter:blur(10px);border:1px solid rgba(37,211,102,0.3);color:#25D366;font-size:20px;font-weight:700;padding:8px 20px;border-radius:50px;}
    .brand-sub{color:rgba(255,255,255,0.5);font-size:18px;}
  </style></head><body>
  <div class="bg-img"></div><div class="overlay"></div>
  <div class="content">
    <div class="tag">${post.tag}</div>
    <div class="food-name">${post.food}</div>
    <div class="food-sub">${post.subtitle}</div>
    <div class="cal-row"><div class="cal-big">${post.calories}</div><div class="cal-label">CALORIES</div></div>
    <div class="run-stat">
      <span class="run-stat-text">🏃‍♀️ ${mins} min running to burn it off</span>
      <span class="run-stat-sub">(~${km}km)</span>
    </div>
    <div class="macros">
      <div class="macro"><div class="macro-val">${post.protein}g</div><div class="macro-label">PROTEIN</div></div>
      <div class="macro"><div class="macro-val">${post.carbs}g</div><div class="macro-label">CARBS</div></div>
      <div class="macro"><div class="macro-val">${post.fat}g</div><div class="macro-label">FAT</div></div>
      <div class="macro"><div class="macro-val">${post.fibre}g</div><div class="macro-label">FIBRE</div></div>
    </div>
    <div class="verdict">"${post.verdict}"</div>
    <div class="brand"><div class="brand-badge">🏋️ FITSORTED</div><div class="brand-sub">Track on WhatsApp — no app needed 🇿🇦</div></div>
  </div></body></html>`;
}

async function main() {
  console.log('🍔 Generating SA meal calorie posts...\n');
  
  for (const meal of meals) {
    const imgPath = path.join(__dirname, `img-${meal.name}.png`);
    
    // Only generate image if it doesn't exist
    if (!fs.existsSync(imgPath)) {
      console.log(`🎨 Generating image: ${meal.food}...`);
      try {
        await generateImage(meal.imagePrompt, imgPath);
        // Rate limit
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.error(`  ❌ Failed: ${e.message}`);
        continue;
      }
    } else {
      console.log(`✅ Image exists: ${meal.food}`);
    }
    
    // Generate HTML
    const html = generateHTML(meal);
    const htmlPath = path.join(__dirname, `real-${meal.name}.html`);
    fs.writeFileSync(htmlPath, html);
    console.log(`  📄 HTML: real-${meal.name}.html`);
  }
  
  console.log('\n✅ All done! Now screenshot the HTML files to get final PNGs.');
  console.log('Run: for f in real-*.html; do echo $f; done');
}

main();
