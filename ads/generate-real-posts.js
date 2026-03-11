const https = require('https');
const fs = require('fs');
const path = require('path');

const OPENAI_KEY = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8').match(/OPENAI_API_KEY=(.+)/)[1].trim();

const posts = [
  {
    name: "barebells-protein-bar",
    food: "Barebells Protein Bar",
    subtitle: "Caramel Choco",
    calories: 200,
    protein: 20, carbs: 20, fat: 8, fibre: 6,
    accentColor: "#a855f7",
    verdict: "20g protein for just 200 cal. Solid snack.",
    tag: "SMART SNACK",
    imagePrompt: "Professional food photography of an unwrapped caramel chocolate protein bar on a dark slate surface, dramatic moody side lighting, shallow depth of field, dark background, editorial food magazine style, overhead angle"
  },
  {
    name: "nandos-quarter-chicken",
    food: "Nando's Quarter Chicken",
    subtitle: "With 2 sides",
    calories: 650,
    protein: 45, carbs: 55, fat: 22, fibre: 5,
    accentColor: "#ef4444",
    verdict: "Not bad if you skip the garlic bread. That's another 180 cal.",
    tag: "RESTAURANT",
    imagePrompt: "Professional food photography of grilled peri-peri quarter chicken with coleslaw and rice on a dark plate, charred grill marks, dramatic warm lighting, dark restaurant table background, editorial style, appetizing"
  },
  {
    name: "woolworths-wrap",
    food: "Woolworths Chicken Wrap",
    subtitle: "Grab & go lunch",
    calories: 380,
    protein: 22, carbs: 40, fat: 14, fibre: 3,
    accentColor: "#22c55e",
    verdict: "Quick lunch under 400 cal. Wins.",
    tag: "QUICK LUNCH",
    imagePrompt: "Professional food photography of a fresh chicken wrap cut in half showing filling, lettuce tomato chicken, on dark slate surface, dramatic moody lighting, shallow depth of field, dark background, editorial style"
  },
  {
    name: "3-wines-vs-3-gin-sodas",
    food: "3 Wines vs 3 Gin & Sodas",
    subtitle: "Same buzz. Different bill.",
    comparison: true,
    left: { name: "3x Wine", cal: 375 },
    right: { name: "3x Gin & Soda", cal: 180 },
    saved: 195,
    accentColor: "#f97316",
    tag: "DRINK SWAP",
    imagePrompt: "Professional beverage photography split image, left side three glasses of red wine, right side three gin and soda cocktails with lime, dark bar counter, dramatic moody lighting, editorial style, dark background"
  },
  {
    name: "cappuccino-vs-frappe",
    food: "Cappuccino vs Caramel Frappé",
    subtitle: "Your morning coffee",
    comparison: true,
    left: { name: "Cappuccino", cal: 80 },
    right: { name: "Caramel Frappé", cal: 420 },
    saved: 340,
    accentColor: "#f59e0b",
    tag: "DID YOU KNOW",
    imagePrompt: "Professional beverage photography, a simple cappuccino in white cup next to a large caramel frappuccino with whipped cream and caramel drizzle, dark cafe table, dramatic moody lighting, editorial style, dark background"
  },
  {
    name: "boerewors-roll-2-beers",
    food: "Boerewors Roll + 2 Beers",
    subtitle: "Classic braai combo",
    calories: 700,
    protein: 25, carbs: 55, fat: 35, fibre: 2,
    accentColor: "#f97316",
    verdict: "The roll is 400. The beers are 300. Now you know.",
    tag: "BRAAI PLATE",
    imagePrompt: "Professional food photography of a South African boerewors roll sausage in a bun with two beer bottles, on a rustic wooden braai table, dramatic warm firelight, dark background, editorial style, appetizing"
  },
  {
    name: "biltong-50g",
    food: "Biltong (50g)",
    subtitle: "South Africa's protein king",
    calories: 125,
    protein: 25, carbs: 1, fat: 3, fibre: 0,
    accentColor: "#ef4444",
    verdict: "25g protein for 125 cal. Best snack in the country.",
    tag: "SA SUPERFOOD",
    imagePrompt: "Professional food photography of sliced South African biltong beef jerky on a dark wooden board, dramatic moody side lighting, shallow depth of field, dark background, editorial style, rustic"
  },
  {
    name: "girls-night",
    food: "Girls Night Out",
    subtitle: "A typical Friday in Cape Town",
    girlsNight: true,
    totalCal: 823,
    drinks: [
      { name: "2x Rosé", cal: 242 },
      { name: "1x Mojito", cal: 217 },
      { name: "1x Margarita", cal: 274 },
      { name: "1x Prosecco", cal: 90 }
    ],
    accentColor: "#ec4899",
    tag: "GIRLS NIGHT",
    imagePrompt: "Professional beverage photography of cocktails and wine glasses on a dark bar counter, rose wine, mojito, margarita, prosecco, colorful drinks, girls night out vibes, dramatic moody lighting, dark background, editorial style, glamorous"
  }
];

function generateImageURL(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
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
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.data && result.data[0]) {
            resolve(result.data[0].url);
          } else {
            reject(new Error('No image URL: ' + body.slice(0, 200)));
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        https.get(response.headers.location, (r2) => {
          r2.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        });
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (e) => { fs.unlink(filepath, () => {}); reject(e); });
  });
}

function generateHTML(post, imgPath) {
  const imgBase64 = fs.readFileSync(imgPath).toString('base64');
  const imgSrc = `data:image/png;base64,${imgBase64}`;
  
  if (post.comparison) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{width:1080px;height:1080px;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;position:relative;}
      .bg-img{position:absolute;inset:0;background:url('${imgSrc}') center/cover;filter:brightness(0.3) blur(2px);}
      .overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.7) 0%,rgba(0,0,0,0.5) 50%,rgba(0,0,0,0.8) 100%);}
      .content{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;align-items:center;padding:60px;justify-content:center;}
      .tag{background:rgba(0,0,0,0.6);border:1px solid ${post.accentColor}40;color:${post.accentColor};font-size:24px;font-weight:700;padding:10px 28px;border-radius:50px;letter-spacing:2px;margin-bottom:30px;backdrop-filter:blur(10px);}
      .title{font-size:52px;font-weight:800;color:#fff;text-align:center;margin-bottom:8px;text-shadow:0 2px 20px rgba(0,0,0,0.8);}
      .subtitle{font-size:26px;color:#ccc;margin-bottom:50px;text-shadow:0 2px 10px rgba(0,0,0,0.8);}
      .vs-container{display:flex;align-items:center;gap:30px;margin-bottom:50px;}
      .vs-card{background:rgba(0,0,0,0.7);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:40px;text-align:center;width:360px;}
      .vs-name{font-size:30px;color:#fff;font-weight:700;margin-bottom:16px;text-shadow:0 2px 10px rgba(0,0,0,0.5);}
      .vs-cal{font-size:80px;font-weight:900;text-shadow:0 2px 20px rgba(0,0,0,0.5);}
      .vs-unit{font-size:22px;color:#aaa;}
      .vs-text{font-size:64px;font-weight:900;color:rgba(255,255,255,0.3);text-shadow:0 2px 20px rgba(0,0,0,0.5);}
      .saved{font-size:34px;font-weight:700;color:#25D366;text-shadow:0 2px 10px rgba(0,0,0,0.5);margin-bottom:30px;}
      .brand{display:flex;align-items:center;gap:12px;position:absolute;bottom:40px;}
      .brand-badge{background:rgba(37,211,102,0.2);backdrop-filter:blur(10px);border:1px solid rgba(37,211,102,0.3);color:#25D366;font-size:22px;font-weight:700;padding:10px 24px;border-radius:50px;}
      .brand-sub{color:rgba(255,255,255,0.5);font-size:20px;}
    </style></head><body>
    <div class="bg-img"></div><div class="overlay"></div>
    <div class="content">
      <div class="tag">${post.tag}</div>
      <div class="title">${post.food}</div>
      <div class="subtitle">${post.subtitle}</div>
      <div class="vs-container">
        <div class="vs-card"><div class="vs-name">${post.left.name}</div><div class="vs-cal" style="color:#ef4444;">${post.left.cal}</div><div class="vs-unit">calories</div></div>
        <div class="vs-text">VS</div>
        <div class="vs-card"><div class="vs-name">${post.right.name}</div><div class="vs-cal" style="color:#25D366;">${post.right.cal}</div><div class="vs-unit">calories</div></div>
      </div>
      <div class="saved">Save ${post.saved} calories by switching 💡</div>
      <div class="brand"><div class="brand-badge">🏋️ FITSORTED</div><div class="brand-sub">Track on WhatsApp 🇿🇦</div></div>
    </div></body></html>`;
  }
  
  if (post.girlsNight) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{width:1080px;height:1080px;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;position:relative;}
      .bg-img{position:absolute;inset:0;background:url('${imgSrc}') center/cover;filter:brightness(0.25) blur(3px);}
      .overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.6) 0%,rgba(0,0,0,0.4) 40%,rgba(0,0,0,0.8) 100%);}
      .content{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;align-items:center;padding:50px 60px;}
      .tag{background:rgba(0,0,0,0.6);border:1px solid ${post.accentColor}40;color:${post.accentColor};font-size:24px;font-weight:700;padding:10px 28px;border-radius:50px;letter-spacing:2px;margin-bottom:25px;backdrop-filter:blur(10px);}
      .title{font-size:54px;font-weight:800;color:#fff;text-align:center;margin-bottom:6px;text-shadow:0 2px 20px rgba(0,0,0,0.8);}
      .subtitle{font-size:24px;color:#ccc;margin-bottom:30px;text-shadow:0 2px 10px rgba(0,0,0,0.8);}
      .drinks-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;width:100%;margin-bottom:24px;}
      .drink{background:rgba(0,0,0,0.6);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;}
      .drink-name{font-size:24px;color:#fff;font-weight:600;}
      .drink-cal{font-size:22px;color:${post.accentColor};font-weight:700;}
      .total-bar{width:100%;background:rgba(0,0,0,0.7);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:24px;text-align:center;margin-bottom:24px;}
      .total-label{font-size:20px;color:#aaa;margin-bottom:6px;}
      .total-num{font-size:80px;font-weight:900;color:${post.accentColor};text-shadow:0 2px 20px rgba(0,0,0,0.5);}
      .total-sub{font-size:22px;color:#aaa;margin-top:4px;}
      .equivalents{display:flex;gap:16px;justify-content:center;margin-bottom:24px;}
      .equiv{background:rgba(0,0,0,0.6);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px 20px;text-align:center;}
      .equiv-text{font-size:20px;color:#fff;font-weight:700;}
      .equiv-sub{font-size:14px;color:#888;}
      .verdict{font-size:22px;color:#ccc;text-align:center;font-style:italic;text-shadow:0 2px 10px rgba(0,0,0,0.8);}
      .brand{display:flex;align-items:center;gap:12px;position:absolute;bottom:40px;}
      .brand-badge{background:rgba(37,211,102,0.2);backdrop-filter:blur(10px);border:1px solid rgba(37,211,102,0.3);color:#25D366;font-size:20px;font-weight:700;padding:8px 20px;border-radius:50px;}
      .brand-sub{color:rgba(255,255,255,0.5);font-size:18px;}
    </style></head><body>
    <div class="bg-img"></div><div class="overlay"></div>
    <div class="content">
      <div class="tag">💅 ${post.tag}</div>
      <div class="title">What your night actually costs</div>
      <div class="subtitle">${post.subtitle}</div>
      <div class="drinks-grid">
        ${post.drinks.map(d => `<div class="drink"><div class="drink-name">${d.name}</div><div class="drink-cal">${d.cal} cal</div></div>`).join('')}
      </div>
      <div class="total-bar">
        <div class="total-label">TOTAL LIQUID CALORIES</div>
        <div class="total-num">${post.totalCal}</div>
        <div class="total-sub">Almost half your daily goal</div>
      </div>
      <div class="equivalents">
        <div class="equiv"><div class="equiv-text">1.5 Big Macs</div><div class="equiv-sub">Same calories</div></div>
        <div class="equiv"><div class="equiv-text">82 min run</div><div class="equiv-sub">To burn it off</div></div>
        <div class="equiv"><div class="equiv-text">10 slices bread</div><div class="equiv-sub">Equivalent</div></div>
        <div class="equiv"><div class="equiv-text">~R380</div><div class="equiv-sub">Estimated spend</div></div>
      </div>
      <div class="verdict">"Swap the mojito for a vodka soda — save 160 cal instantly 💡"</div>
      <div class="brand"><div class="brand-badge">🏋️ FITSORTED</div><div class="brand-sub">Track on WhatsApp 🇿🇦</div></div>
    </div></body></html>`;
  }

  // Standard food post
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{width:1080px;height:1080px;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;position:relative;}
    .bg-img{position:absolute;inset:0;background:url('${imgSrc}') center/cover;filter:brightness(0.35);}
    .overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.3) 0%,rgba(0,0,0,0.2) 30%,rgba(0,0,0,0.85) 70%,rgba(0,0,0,0.95) 100%);}
    .content{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;justify-content:flex-end;padding:60px;}
    .tag{background:rgba(0,0,0,0.6);border:1px solid ${post.accentColor}40;color:${post.accentColor};font-size:22px;font-weight:700;padding:8px 24px;border-radius:50px;letter-spacing:2px;margin-bottom:16px;display:inline-block;align-self:flex-start;backdrop-filter:blur(10px);}
    .food-name{font-size:60px;font-weight:800;color:#fff;margin-bottom:4px;text-shadow:0 2px 20px rgba(0,0,0,0.8);}
    .food-sub{font-size:26px;color:#ccc;margin-bottom:24px;text-shadow:0 2px 10px rgba(0,0,0,0.8);}
    .cal-row{display:flex;align-items:baseline;gap:12px;margin-bottom:20px;}
    .cal-big{font-size:100px;font-weight:900;color:${post.accentColor};text-shadow:0 2px 20px rgba(0,0,0,0.5);}
    .cal-label{font-size:28px;color:#aaa;font-weight:600;}
    .macros{display:flex;gap:16px;margin-bottom:20px;}
    .macro{background:rgba(0,0,0,0.6);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:14px 22px;text-align:center;}
    .macro-val{font-size:28px;font-weight:800;color:#fff;}
    .macro-label{font-size:14px;color:#888;margin-top:2px;}
    .verdict{font-size:24px;color:#ccc;font-style:italic;margin-bottom:24px;text-shadow:0 2px 10px rgba(0,0,0,0.8);line-height:1.4;}
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

(async () => {
  const outDir = __dirname;
  
  for (const post of posts) {
    const imgPath = path.join(outDir, `img-${post.name}.png`);
    
    // Generate image if not already cached
    if (!fs.existsSync(imgPath)) {
      console.log(`🎨 Generating image for ${post.name}...`);
      try {
        const url = await generateImageURL(post.imagePrompt);
        await downloadImage(url, imgPath);
        console.log(`   ✅ Downloaded`);
      } catch (e) {
        console.error(`   ❌ Failed: ${e.message}`);
        continue;
      }
      // Rate limit
      await new Promise(r => setTimeout(r, 2000));
    } else {
      console.log(`📦 Using cached image for ${post.name}`);
    }
    
    // Generate HTML
    const html = generateHTML(post, imgPath);
    const htmlPath = path.join(outDir, `real-${post.name}.html`);
    fs.writeFileSync(htmlPath, html);
    console.log(`   📄 HTML written`);
  }
  
  console.log('\n✅ All images generated. Now run puppeteer to screenshot.');
  console.log('Images cached — rerun won\'t re-generate them.');
})();
