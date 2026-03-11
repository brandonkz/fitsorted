const fs = require('fs');
const path = require('path');
const https = require('https');

const runMin = (cal) => Math.round(cal / 10);

const drinks = [
  {
    name: "castle-lager",
    food: "Castle Lager (440ml)",
    subtitle: "SA's most popular beer",
    calories: 155,
    protein: 1, carbs: 12, fat: 0, fibre: 0,
    accentColor: "#f59e0b",
    verdict: "One is fine. Three is 465 cal. That's a whole meal.",
    tag: "PUB NIGHT",
    prompt: "Professional food photography of a single cold Castle Lager beer in a frosty glass on a dark bar counter, condensation dripping, warm amber lighting, moody bar atmosphere, top-down dramatic lighting, 4k, photorealistic"
  },
  {
    name: "savanna-dry",
    food: "Savanna Dry Cider (330ml)",
    subtitle: "SA's favourite cider",
    calories: 170,
    protein: 0, carbs: 18, fat: 0, fibre: 0,
    accentColor: "#84cc16",
    verdict: "Refreshing but sneaky. Two Savannas = a Big Mac worth of calories.",
    tag: "SUNDOWNER",
    prompt: "Professional food photography of a cold Savanna Dry cider bottle with a lime wedge in the neck, ice bucket nearby, golden hour sunset lighting on a wooden deck, condensation on bottle, photorealistic, 4k"
  },
  {
    name: "vodka-redbull",
    food: "Vodka & Red Bull",
    subtitle: "The club classic",
    calories: 177,
    protein: 0, carbs: 28, fat: 0, fibre: 0,
    accentColor: "#3b82f6",
    verdict: "Half those calories are pure sugar from the Red Bull.",
    tag: "CLUB NIGHT",
    prompt: "Professional food photography of a vodka Red Bull cocktail in a tall glass with ice, neon blue and red club lighting reflections, dark nightclub bar setting, dramatic lighting, photorealistic, 4k"
  },
  {
    name: "margarita",
    food: "Margarita",
    subtitle: "Frozen or on the rocks",
    calories: 274,
    protein: 0, carbs: 18, fat: 0, fibre: 0,
    accentColor: "#22d3ee",
    verdict: "27 min running. The salt rim won't make you faster.",
    tag: "COCKTAIL HOUR",
    prompt: "Professional food photography of a classic margarita cocktail in a salt-rimmed glass with lime wedge, ice, dark elegant bar background, dramatic top-down lighting, photorealistic, 4k"
  },
  {
    name: "glass-of-red-wine",
    food: "Glass of Red Wine (175ml)",
    subtitle: "Shiraz, Cab, Merlot — doesn't matter",
    calories: 125,
    protein: 0, carbs: 4, fat: 0, fibre: 0,
    accentColor: "#dc2626",
    verdict: "One glass is fine. The bottle (750ml) is 535 cal.",
    tag: "WINE O'CLOCK",
    prompt: "Professional food photography of a glass of red wine being poured from a bottle, dark moody restaurant setting, candlelight reflections in the glass, deep red wine color, dramatic lighting, photorealistic, 4k"
  },
  {
    name: "long-island-iced-tea",
    food: "Long Island Iced Tea",
    subtitle: "Tastes like iced tea. Hits like a truck.",
    calories: 292,
    protein: 0, carbs: 24, fat: 0, fibre: 0,
    accentColor: "#f97316",
    verdict: "5 spirits in one glass. 292 cal. 29 min running. Worth it?",
    tag: "DANGER ZONE",
    prompt: "Professional food photography of a Long Island iced tea cocktail in a tall glass with ice and lemon slice, dark sophisticated bar setting, amber warm lighting, photorealistic, 4k"
  },
  {
    name: "aperol-spritz",
    food: "Aperol Spritz",
    subtitle: "The brunch favourite",
    calories: 125,
    protein: 0, carbs: 12, fat: 0, fibre: 0,
    accentColor: "#fb923c",
    verdict: "Light on calories, heavy on vibes. Good pick.",
    tag: "BRUNCH",
    prompt: "Professional food photography of an Aperol Spritz cocktail in a large wine glass with ice and orange slice, bright sunny outdoor cafe setting, warm golden light, photorealistic, 4k"
  }
];

// Generate images using OpenAI DALL-E 3
async function generateImage(prompt, filename) {
  const apiKey = process.env.OPENAI_API_KEY;
  const body = JSON.stringify({
    model: "dall-e-3",
    prompt,
    n: 1,
    size: "1024x1024",
    quality: "standard"
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/images/generations',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.data && json.data[0]) {
            const imgUrl = json.data[0].url;
            // Download image
            https.get(imgUrl, (imgRes) => {
              const chunks = [];
              imgRes.on('data', c => chunks.push(c));
              imgRes.on('end', () => {
                fs.writeFileSync(filename, Buffer.concat(chunks));
                resolve();
              });
            });
          } else {
            console.error('API error:', data);
            reject(new Error('No image'));
          }
        } catch(e) { reject(e); }
      });
    });
    req.write(body);
    req.end();
  });
}

function generateHTML(post) {
  const dir = __dirname;
  const imgPath = path.join(dir, `img-${post.name}.png`);
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
    .drink-icon{font-size:40px;position:absolute;top:40px;right:55px;z-index:3;}
  </style></head><body>
  <div class="bg-img"></div><div class="overlay"></div>
  <div class="drink-icon">🍺</div>
  <div class="content">
    <div class="tag">🍸 ${post.tag}</div>
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
    </div>
    <div class="verdict">"${post.verdict}"</div>
    <div class="brand"><div class="brand-badge">🏋️ FITSORTED</div><div class="brand-sub">Track drinks on WhatsApp 🇿🇦</div></div>
  </div></body></html>`;
}

(async () => {
  const dir = __dirname;
  
  // Step 1: Generate all images
  for (const drink of drinks) {
    const imgPath = path.join(dir, `img-${drink.name}.png`);
    if (fs.existsSync(imgPath)) {
      console.log(`⏭️  ${drink.name} image exists`);
      continue;
    }
    console.log(`🎨 Generating ${drink.name}...`);
    await generateImage(drink.prompt, imgPath);
    console.log(`✅ ${drink.name} image saved`);
  }

  // Step 2: Generate HTML + render with puppeteer
  console.log('\n📄 Generating HTML...');
  for (const drink of drinks) {
    const html = generateHTML(drink);
    const htmlPath = path.join(dir, `real-${drink.name}.html`);
    fs.writeFileSync(htmlPath, html);
    console.log(`📄 ${drink.name}`);
  }

  // Step 3: Render to PNG
  console.log('\n📸 Rendering PNGs...');
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ headless: true });
  for (const drink of drinks) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080 });
    const htmlPath = path.join(dir, `real-${drink.name}.html`);
    await page.goto('file://' + htmlPath);
    const outPath = path.join(dir, `real-${drink.name}.png`);
    await page.screenshot({ path: outPath, type: 'png' });
    await page.close();
    console.log(`✅ ${drink.name}.png`);
  }
  await browser.close();
  
  console.log('\n🎉 All 7 drink posts ready!');
})();
