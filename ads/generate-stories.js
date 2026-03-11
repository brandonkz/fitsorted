const fs = require('fs');
const path = require('path');

const runMin = (cal) => Math.round(cal / 10);

const posts = [
  { name: "nandos-quarter-chicken", food: "Nando's Quarter Chicken", subtitle: "With 2 sides", calories: 650, protein: 45, carbs: 55, fat: 22, fibre: 5, accentColor: "#ef4444", verdict: "Skip the garlic bread — that's another 180 cal", tag: "RESTAURANT" },
  { name: "cappuccino-vs-frappe", food: "Cappuccino vs Frappé", subtitle: "Your morning coffee", comparison: true, left: { name: "Cappuccino", cal: 80 }, right: { name: "Caramel Frappé", cal: 420 }, saved: 340, accentColor: "#f59e0b", tag: "DID YOU KNOW" },
  { name: "girls-night", food: "Girls Night Out", subtitle: "A typical Friday in Cape Town", girlsNight: true, totalCal: 823, drinks: [{ name: "2x Rosé", cal: 242 }, { name: "1x Mojito", cal: 217 }, { name: "1x Margarita", cal: 274 }, { name: "1x Prosecco", cal: 90 }], accentColor: "#ec4899", tag: "GIRLS NIGHT" },
  { name: "boerewors-roll-2-beers", food: "Boerewors Roll + 2 Beers", subtitle: "Classic braai combo", calories: 700, protein: 25, carbs: 55, fat: 35, fibre: 2, accentColor: "#f97316", verdict: "The roll is 400. The beers are 300.", tag: "BRAAI PLATE" },
  { name: "3-wines-vs-3-gin-sodas", food: "3 Wines vs 3 Gin & Sodas", subtitle: "Same buzz. Different bill.", comparison: true, left: { name: "3x Wine", cal: 375 }, right: { name: "3x Gin & Soda", cal: 180 }, saved: 195, accentColor: "#f97316", tag: "DRINK SWAP" },
  { name: "woolworths-wrap", food: "Woolworths Wrap", subtitle: "Grab & go lunch", calories: 380, protein: 22, carbs: 40, fat: 14, fibre: 3, accentColor: "#22c55e", verdict: "Quick lunch under 400 cal. Wins.", tag: "QUICK LUNCH" },
  { name: "biltong-50g", food: "Biltong (50g)", subtitle: "SA's protein king", calories: 125, protein: 25, carbs: 1, fat: 3, fibre: 0, accentColor: "#ef4444", verdict: "25g protein for 125 cal. Best snack in the country.", tag: "SA SUPERFOOD" },
];

function generateStoryHTML(post) {
  const imgPath = path.join(__dirname, `img-${post.name}.png`);
  const imgBase64 = fs.readFileSync(imgPath).toString('base64');
  const imgSrc = `data:image/png;base64,${imgBase64}`;

  if (post.comparison) {
    const leftRun = runMin(post.left.cal);
    const rightRun = runMin(post.right.cal);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{width:1080px;height:1920px;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;position:relative;}
      .bg-img{position:absolute;inset:0;background:url('${imgSrc}') center/cover;filter:brightness(0.5) blur(4px);}
      .overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.6) 0%,rgba(0,0,0,0.4) 50%,rgba(0,0,0,0.7) 100%);}
      .content{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 60px;}
      .tag{background:rgba(0,0,0,0.6);border:1px solid ${post.accentColor}40;color:${post.accentColor};font-size:32px;font-weight:700;padding:14px 36px;border-radius:50px;letter-spacing:2px;margin-bottom:50px;}
      .title{font-size:58px;font-weight:800;color:#fff;text-align:center;margin-bottom:10px;}
      .subtitle{font-size:30px;color:#ccc;margin-bottom:60px;}
      .vs-container{display:flex;align-items:center;gap:30px;margin-bottom:50px;}
      .vs-card{background:rgba(0,0,0,0.7);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);border-radius:28px;padding:50px 40px;text-align:center;width:380px;}
      .vs-name{font-size:32px;color:#fff;font-weight:700;margin-bottom:16px;}
      .vs-cal{font-size:90px;font-weight:900;}
      .vs-unit{font-size:24px;color:#aaa;margin-bottom:12px;}
      .vs-run{font-size:26px;color:#ccc;} .vs-run span{color:#fff;font-weight:700;}
      .vs-text{font-size:72px;font-weight:900;color:rgba(255,255,255,0.3);}
      .saved{font-size:40px;font-weight:700;color:#25D366;margin-bottom:60px;}
      .brand{display:flex;align-items:center;gap:16px;margin-top:auto;padding-bottom:40px;}
      .brand-badge{background:rgba(37,211,102,0.2);border:1px solid rgba(37,211,102,0.3);color:#25D366;font-size:28px;font-weight:700;padding:14px 32px;border-radius:50px;}
      .brand-sub{color:rgba(255,255,255,0.5);font-size:24px;}
    </style></head><body>
    <div class="bg-img"></div><div class="overlay"></div>
    <div class="content">
      <div class="tag">${post.tag}</div>
      <div class="title">${post.food}</div>
      <div class="subtitle">${post.subtitle}</div>
      <div class="vs-container">
        <div class="vs-card"><div class="vs-name">${post.left.name}</div><div class="vs-cal" style="color:#ef4444;">${post.left.cal}</div><div class="vs-unit">calories</div><div class="vs-run">🏃‍♀️ <span>${leftRun} min</span></div></div>
        <div class="vs-text">VS</div>
        <div class="vs-card"><div class="vs-name">${post.right.name}</div><div class="vs-cal" style="color:#25D366;">${post.right.cal}</div><div class="vs-unit">calories</div><div class="vs-run">🏃‍♀️ <span>${rightRun} min</span></div></div>
      </div>
      <div class="saved">Save ${post.saved} cal 💡</div>
      <div class="brand"><div class="brand-badge">🏋️ FITSORTED</div><div class="brand-sub">WhatsApp 🇿🇦</div></div>
    </div></body></html>`;
  }

  if (post.girlsNight) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{width:1080px;height:1920px;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;position:relative;}
      .bg-img{position:absolute;inset:0;background:url('${imgSrc}') center/cover;filter:brightness(0.4) blur(4px);}
      .overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.5) 0%,rgba(0,0,0,0.3) 40%,rgba(0,0,0,0.7) 100%);}
      .content{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 60px;}
      .tag{background:rgba(0,0,0,0.6);border:1px solid ${post.accentColor}40;color:${post.accentColor};font-size:32px;font-weight:700;padding:14px 36px;border-radius:50px;letter-spacing:2px;margin-bottom:40px;}
      .title{font-size:56px;font-weight:800;color:#fff;text-align:center;margin-bottom:10px;}
      .subtitle{font-size:28px;color:#ccc;margin-bottom:40px;}
      .drinks{width:100%;margin-bottom:30px;}
      .drink{background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px 30px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;}
      .drink-name{font-size:30px;color:#fff;font-weight:600;}
      .drink-cal{font-size:28px;color:${post.accentColor};font-weight:700;}
      .total{background:rgba(0,0,0,0.7);border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:30px;text-align:center;margin-bottom:30px;width:100%;}
      .total-label{font-size:24px;color:#aaa;margin-bottom:8px;}
      .total-num{font-size:100px;font-weight:900;color:${post.accentColor};}
      .total-sub{font-size:26px;color:#aaa;margin-top:6px;}
      .run{font-size:36px;color:#fff;font-weight:700;margin-bottom:30px;}
      .tip{font-size:26px;color:#ccc;font-style:italic;margin-bottom:40px;}
      .brand{display:flex;align-items:center;gap:16px;margin-top:auto;padding-bottom:40px;}
      .brand-badge{background:rgba(37,211,102,0.2);border:1px solid rgba(37,211,102,0.3);color:#25D366;font-size:28px;font-weight:700;padding:14px 32px;border-radius:50px;}
      .brand-sub{color:rgba(255,255,255,0.5);font-size:24px;}
    </style></head><body>
    <div class="bg-img"></div><div class="overlay"></div>
    <div class="content">
      <div class="tag">💅 ${post.tag}</div>
      <div class="title">What your night costs</div>
      <div class="subtitle">${post.subtitle}</div>
      <div class="drinks">${post.drinks.map(d => `<div class="drink"><div class="drink-name">${d.name}</div><div class="drink-cal">${d.cal} cal</div></div>`).join('')}</div>
      <div class="total"><div class="total-label">TOTAL</div><div class="total-num">${post.totalCal}</div><div class="total-sub">calories</div></div>
      <div class="run">🏃‍♀️ ${runMin(post.totalCal)} min running to burn off</div>
      <div class="tip">Swap the mojito for vodka soda — save 160 cal 💡</div>
      <div class="brand"><div class="brand-badge">🏋️ FITSORTED</div><div class="brand-sub">WhatsApp 🇿🇦</div></div>
    </div></body></html>`;
  }

  // Standard food story
  const mins = runMin(post.calories);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{width:1080px;height:1920px;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;position:relative;}
    .bg-img{position:absolute;inset:0;background:url('${imgSrc}') center/cover;filter:brightness(0.6);}
    .overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.3) 0%,rgba(0,0,0,0.1) 30%,rgba(0,0,0,0.7) 60%,rgba(0,0,0,0.95) 100%);}
    .content{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;justify-content:flex-end;padding:80px 60px;}
    .tag{background:rgba(0,0,0,0.6);border:1px solid ${post.accentColor}40;color:${post.accentColor};font-size:28px;font-weight:700;padding:12px 30px;border-radius:50px;letter-spacing:2px;margin-bottom:20px;display:inline-block;align-self:flex-start;}
    .food-name{font-size:72px;font-weight:800;color:#fff;margin-bottom:6px;}
    .food-sub{font-size:30px;color:#ccc;margin-bottom:30px;}
    .cal-row{display:flex;align-items:baseline;gap:16px;margin-bottom:20px;}
    .cal-big{font-size:130px;font-weight:900;color:${post.accentColor};}
    .cal-label{font-size:32px;color:#aaa;font-weight:600;}
    .run-stat{background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:20px 32px;margin-bottom:24px;display:inline-flex;align-items:center;gap:12px;align-self:flex-start;}
    .run-text{font-size:32px;color:#fff;font-weight:700;}
    .macros{display:flex;gap:16px;margin-bottom:24px;}
    .macro{background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:16px 24px;text-align:center;}
    .macro-val{font-size:32px;font-weight:800;color:#fff;}
    .macro-label{font-size:16px;color:#888;margin-top:4px;}
    .verdict{font-size:28px;color:#ccc;font-style:italic;margin-bottom:30px;line-height:1.4;}
    .brand{display:flex;align-items:center;gap:16px;}
    .brand-badge{background:rgba(37,211,102,0.2);border:1px solid rgba(37,211,102,0.3);color:#25D366;font-size:26px;font-weight:700;padding:12px 28px;border-radius:50px;}
    .brand-sub{color:rgba(255,255,255,0.5);font-size:22px;}
  </style></head><body>
  <div class="bg-img"></div><div class="overlay"></div>
  <div class="content">
    <div class="tag">${post.tag}</div>
    <div class="food-name">${post.food}</div>
    <div class="food-sub">${post.subtitle}</div>
    <div class="cal-row"><div class="cal-big">${post.calories}</div><div class="cal-label">CALORIES</div></div>
    <div class="run-stat"><span class="run-text">🏃‍♀️ ${mins} min running</span></div>
    <div class="macros">
      <div class="macro"><div class="macro-val">${post.protein}g</div><div class="macro-label">PROTEIN</div></div>
      <div class="macro"><div class="macro-val">${post.carbs}g</div><div class="macro-label">CARBS</div></div>
      <div class="macro"><div class="macro-val">${post.fat}g</div><div class="macro-label">FAT</div></div>
      <div class="macro"><div class="macro-val">${post.fibre}g</div><div class="macro-label">FIBRE</div></div>
    </div>
    <div class="verdict">"${post.verdict}"</div>
    <div class="brand"><div class="brand-badge">🏋️ FITSORTED</div><div class="brand-sub">Install on WhatsApp 🇿🇦</div></div>
  </div></body></html>`;
}

for (const post of posts) {
  const html = generateStoryHTML(post);
  fs.writeFileSync(path.join(__dirname, `story-${post.name}.html`), html);
  console.log(`📄 story-${post.name}`);
}
console.log('\n✅ Done');
