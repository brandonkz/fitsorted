const fs = require('fs');
const path = require('path');

// ~100 cal per 10 min running (average person) = 10 cal/min
const runMin = (cal) => Math.round(cal / 10);

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
    runIcon: "🏃‍♀️"
  },
  {
    name: "nandos-quarter-chicken",
    food: "Nando's Quarter Chicken",
    subtitle: "With 2 sides",
    calories: 650,
    protein: 45, carbs: 55, fat: 22, fibre: 5,
    accentColor: "#ef4444",
    verdict: "Skip the garlic bread. That's another 180 cal.",
    tag: "RESTAURANT",
    runIcon: "🏃‍♀️"
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
    runIcon: "🏃‍♀️"
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
    tag: "DRINK SWAP"
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
    tag: "DID YOU KNOW"
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
    runIcon: "🏃‍♀️"
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
    runIcon: "🏃‍♀️"
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
    tag: "GIRLS NIGHT"
  }
];

function generateHTML(post) {
  const dir = __dirname;
  const imgPath = path.join(dir, `img-${post.name}.png`);
  const imgBase64 = fs.readFileSync(imgPath).toString('base64');
  const imgSrc = `data:image/png;base64,${imgBase64}`;
  
  if (post.comparison) {
    const leftRun = runMin(post.left.cal);
    const rightRun = runMin(post.right.cal);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{width:1080px;height:1080px;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;position:relative;}
      .bg-img{position:absolute;inset:0;background:url('${imgSrc}') center/cover;filter:brightness(0.55) blur(2px);}
      .overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.7) 0%,rgba(0,0,0,0.5) 50%,rgba(0,0,0,0.8) 100%);}
      .content{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;align-items:center;padding:60px;justify-content:center;}
      .tag{background:rgba(0,0,0,0.6);border:1px solid ${post.accentColor}40;color:${post.accentColor};font-size:24px;font-weight:700;padding:10px 28px;border-radius:50px;letter-spacing:2px;margin-bottom:30px;backdrop-filter:blur(10px);}
      .title{font-size:52px;font-weight:800;color:#fff;text-align:center;margin-bottom:8px;text-shadow:0 2px 20px rgba(0,0,0,0.8);}
      .subtitle{font-size:26px;color:#ccc;margin-bottom:45px;text-shadow:0 2px 10px rgba(0,0,0,0.8);}
      .vs-container{display:flex;align-items:center;gap:30px;margin-bottom:40px;}
      .vs-card{background:rgba(0,0,0,0.7);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:36px;text-align:center;width:360px;}
      .vs-name{font-size:28px;color:#fff;font-weight:700;margin-bottom:12px;}
      .vs-cal{font-size:72px;font-weight:900;}
      .vs-unit{font-size:20px;color:#aaa;margin-bottom:10px;}
      .vs-run{font-size:22px;color:#aaa;margin-top:8px;}
      .vs-run span{color:#fff;font-weight:700;}
      .vs-text{font-size:64px;font-weight:900;color:rgba(255,255,255,0.3);}
      .saved{font-size:34px;font-weight:700;color:#25D366;margin-bottom:30px;text-shadow:0 2px 10px rgba(0,0,0,0.5);}
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
        <div class="vs-card">
          <div class="vs-name">${post.left.name}</div>
          <div class="vs-cal" style="color:#ef4444;">${post.left.cal}</div>
          <div class="vs-unit">calories</div>
          <div class="vs-run">🏃‍♀️ <span>${leftRun} min</span> running</div>
        </div>
        <div class="vs-text">VS</div>
        <div class="vs-card">
          <div class="vs-name">${post.right.name}</div>
          <div class="vs-cal" style="color:#25D366;">${post.right.cal}</div>
          <div class="vs-unit">calories</div>
          <div class="vs-run">🏃‍♀️ <span>${rightRun} min</span> running</div>
        </div>
      </div>
      <div class="saved">Save ${post.saved} cal — that's ${runMin(post.saved)} fewer minutes running 💡</div>
      <div class="brand"><div class="brand-badge">🏋️ FITSORTED</div><div class="brand-sub">Track on WhatsApp 🇿🇦</div></div>
    </div></body></html>`;
  }
  
  if (post.girlsNight) {
    const totalRun = runMin(post.totalCal);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{width:1080px;height:1080px;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;position:relative;}
      .bg-img{position:absolute;inset:0;background:url('${imgSrc}') center/cover;filter:brightness(0.5) blur(3px);}
      .overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.6) 0%,rgba(0,0,0,0.4) 40%,rgba(0,0,0,0.85) 100%);}
      .content{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;align-items:center;padding:50px 60px;}
      .tag{background:rgba(0,0,0,0.6);border:1px solid ${post.accentColor}40;color:${post.accentColor};font-size:24px;font-weight:700;padding:10px 28px;border-radius:50px;letter-spacing:2px;margin-bottom:25px;backdrop-filter:blur(10px);}
      .title{font-size:54px;font-weight:800;color:#fff;text-align:center;margin-bottom:6px;text-shadow:0 2px 20px rgba(0,0,0,0.8);}
      .subtitle{font-size:24px;color:#ccc;margin-bottom:30px;}
      .drinks-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;width:100%;margin-bottom:24px;}
      .drink{background:rgba(0,0,0,0.6);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center;}
      .drink-name{font-size:24px;color:#fff;font-weight:600;}
      .drink-cal{font-size:22px;color:${post.accentColor};font-weight:700;}
      .total-bar{width:100%;background:rgba(0,0,0,0.7);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:24px;text-align:center;margin-bottom:20px;}
      .total-label{font-size:20px;color:#aaa;margin-bottom:6px;}
      .total-num{font-size:80px;font-weight:900;color:${post.accentColor};}
      .total-sub{font-size:22px;color:#aaa;margin-top:4px;}
      .run-bar{background:rgba(0,0,0,0.6);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px 40px;text-align:center;margin-bottom:20px;}
      .run-text{font-size:32px;color:#fff;font-weight:700;}
      .run-sub{font-size:18px;color:#888;margin-top:4px;}
      .verdict{font-size:22px;color:#ccc;text-align:center;font-style:italic;}
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
      <div class="run-bar">
        <div class="run-text">🏃‍♀️ ${totalRun} minutes of running to burn it off</div>
        <div class="run-sub">That's about ${(totalRun/10).toFixed(1)}km at average pace</div>
      </div>
      <div class="verdict">"Swap the mojito for a vodka soda — save 160 cal instantly 💡"</div>
      <div class="brand"><div class="brand-badge">🏋️ FITSORTED</div><div class="brand-sub">Track on WhatsApp 🇿🇦</div></div>
    </div></body></html>`;
  }

  // Standard food post with run stat
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

const outDir = __dirname;
for (const post of posts) {
  const html = generateHTML(post);
  const htmlPath = path.join(outDir, `real-${post.name}.html`);
  fs.writeFileSync(htmlPath, html);
  console.log(`📄 ${post.name}`);
}
console.log('\n✅ All HTML updated with run stats. Screenshot next.');
