const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const posts = [
  {
    name: "barebells-protein-bar",
    food: "Barebells Protein Bar",
    subtitle: "Caramel Choco",
    calories: 200,
    protein: 20, carbs: 20, fat: 8, fibre: 6,
    emoji: "💪",
    bgGradient: "linear-gradient(135deg, #1a0a2e, #0a0a1a, #0a1a0a)",
    accentColor: "#a855f7",
    verdict: "20g protein for just 200 cal. That's a solid snack.",
    tag: "SMART SNACK"
  },
  {
    name: "nandos-quarter-chicken",
    food: "Nando's Quarter Chicken",
    subtitle: "with 2 sides",
    calories: 650,
    protein: 45, carbs: 55, fat: 22, fibre: 5,
    emoji: "🍗",
    bgGradient: "linear-gradient(135deg, #2e1a0a, #0a0a0a, #1a0a0a)",
    accentColor: "#ef4444",
    verdict: "Not bad if you skip the garlic bread. That's another 180 cal.",
    tag: "RESTAURANT"
  },
  {
    name: "woolworths-wrap",
    food: "Woolworths Chicken Wrap",
    subtitle: "Grab & go",
    calories: 380,
    protein: 22, carbs: 40, fat: 14, fibre: 3,
    emoji: "🌯",
    bgGradient: "linear-gradient(135deg, #0a1a0a, #0a0a0a, #0a0a1a)",
    accentColor: "#22c55e",
    verdict: "Quick lunch under 400 cal. Wins.",
    tag: "QUICK LUNCH"
  },
  {
    name: "kota",
    food: "Quarter Kota",
    subtitle: "Polony, chips, atchar",
    calories: 850,
    protein: 18, carbs: 95, fat: 42, fibre: 3,
    emoji: "🍞",
    bgGradient: "linear-gradient(135deg, #2e2a0a, #0a0a0a, #1a0a0a)",
    accentColor: "#f59e0b",
    verdict: "Half your daily calories in one meal. Worth it though.",
    tag: "SA CLASSIC"
  },
  {
    name: "3-wines-vs-3-gin-sodas",
    food: "3 Wines vs 3 Gin & Sodas",
    subtitle: "Same buzz. Different bill.",
    calories: null,
    comparison: true,
    left: { name: "3x Wine", cal: 375, emoji: "🍷" },
    right: { name: "3x Gin & Soda", cal: 180, emoji: "🍸" },
    saved: 195,
    emoji: "🍷🍸",
    bgGradient: "linear-gradient(135deg, #1a0a1a, #0a0a0a, #0a1a1a)",
    accentColor: "#f97316",
    tag: "DRINK SWAP"
  },
  {
    name: "cappuccino-vs-frappe",
    food: "Cappuccino vs Caramel Frappé",
    subtitle: "Your morning coffee",
    calories: null,
    comparison: true,
    left: { name: "Cappuccino", cal: 80, emoji: "☕" },
    right: { name: "Caramel Frappé", cal: 420, emoji: "🥤" },
    saved: 340,
    emoji: "☕",
    bgGradient: "linear-gradient(135deg, #1a0f0a, #0a0a0a, #0a0a1a)",
    accentColor: "#f59e0b",
    tag: "DID YOU KNOW"
  },
  {
    name: "boerewors-roll-2-beers",
    food: "Boerewors Roll + 2 Beers",
    subtitle: "Classic braai combo",
    calories: 700,
    protein: 25, carbs: 55, fat: 35, fibre: 2,
    emoji: "🔥",
    bgGradient: "linear-gradient(135deg, #1a1a0a, #0a0a0a, #0a0a0a)",
    accentColor: "#f97316",
    verdict: "The roll is 400. The beers are 300. Now you know.",
    tag: "BRAAI PLATE"
  },
  {
    name: "biltong-50g",
    food: "Biltong (50g)",
    subtitle: "South Africa's protein king",
    calories: 125,
    protein: 25, carbs: 1, fat: 3, fibre: 0,
    emoji: "🥩",
    bgGradient: "linear-gradient(135deg, #1a0a0a, #0a0a0a, #0a1a0a)",
    accentColor: "#ef4444",
    verdict: "25g protein for 125 cal. Best snack in the country.",
    tag: "SA SUPERFOOD"
  }
];

function generateHTML(post) {
  if (post.comparison) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{width:1080px;height:1080px;background:#0a0a0a;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;position:relative;}
      .bg{position:absolute;inset:0;background:${post.bgGradient};}
      .content{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;align-items:center;padding:60px;}
      .tag{background:rgba(${post.accentColor === '#f97316' ? '249,115,22' : '245,158,11'},0.15);border:1px solid rgba(${post.accentColor === '#f97316' ? '249,115,22' : '245,158,11'},0.3);color:${post.accentColor};font-size:24px;font-weight:700;padding:10px 28px;border-radius:50px;letter-spacing:2px;margin-bottom:40px;}
      .title{font-size:52px;font-weight:800;color:#fff;text-align:center;margin-bottom:8px;}
      .subtitle{font-size:28px;color:#888;margin-bottom:50px;}
      .vs-container{display:flex;align-items:center;gap:40px;margin-bottom:50px;}
      .vs-card{background:#111;border:1px solid #222;border-radius:24px;padding:40px;text-align:center;width:380px;}
      .vs-emoji{font-size:80px;margin-bottom:16px;}
      .vs-name{font-size:28px;color:#ccc;font-weight:600;margin-bottom:12px;}
      .vs-cal{font-size:72px;font-weight:800;}
      .vs-unit{font-size:24px;color:#888;}
      .vs-text{font-size:64px;font-weight:800;color:#555;}
      .saved{font-size:36px;font-weight:700;color:#25D366;margin-bottom:40px;}
      .brand{display:flex;align-items:center;gap:12px;position:absolute;bottom:50px;}
      .brand-badge{background:rgba(37,211,102,0.15);border:1px solid rgba(37,211,102,0.3);color:#25D366;font-size:22px;font-weight:700;padding:10px 24px;border-radius:50px;}
      .brand-sub{color:#555;font-size:20px;}
    </style></head><body><div class="bg"></div><div class="content">
      <div class="tag">${post.tag}</div>
      <div class="title">${post.food}</div>
      <div class="subtitle">${post.subtitle}</div>
      <div class="vs-container">
        <div class="vs-card">
          <div class="vs-emoji">${post.left.emoji}</div>
          <div class="vs-name">${post.left.name}</div>
          <div class="vs-cal" style="color:#ef4444;">${post.left.cal}</div>
          <div class="vs-unit">calories</div>
        </div>
        <div class="vs-text">VS</div>
        <div class="vs-card">
          <div class="vs-emoji">${post.right.emoji}</div>
          <div class="vs-name">${post.right.name}</div>
          <div class="vs-cal" style="color:#25D366;">${post.right.cal}</div>
          <div class="vs-unit">calories</div>
        </div>
      </div>
      <div class="saved">Save ${post.saved} calories by switching 💡</div>
      <div class="brand">
        <div class="brand-badge">🏋️ FITSORTED</div>
        <div class="brand-sub">Track on WhatsApp — no app needed 🇿🇦</div>
      </div>
    </div></body></html>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{width:1080px;height:1080px;background:#0a0a0a;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;position:relative;}
    .bg{position:absolute;inset:0;background:${post.bgGradient};}
    .content{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;align-items:center;padding:60px;}
    .tag{background:rgba(37,211,102,0.15);border:1px solid rgba(37,211,102,0.3);color:${post.accentColor};font-size:24px;font-weight:700;padding:10px 28px;border-radius:50px;letter-spacing:2px;margin-bottom:30px;}
    .emoji-hero{font-size:100px;margin-bottom:20px;}
    .food-name{font-size:56px;font-weight:800;color:#fff;text-align:center;margin-bottom:6px;}
    .food-sub{font-size:28px;color:#888;margin-bottom:30px;}
    .cal-big{font-size:120px;font-weight:900;color:${post.accentColor};margin-bottom:4px;}
    .cal-label{font-size:28px;color:#888;margin-bottom:30px;letter-spacing:2px;}
    .macros{display:flex;gap:24px;margin-bottom:30px;}
    .macro{background:#111;border:1px solid #222;border-radius:16px;padding:20px 28px;text-align:center;}
    .macro-icon{font-size:28px;margin-bottom:4px;}
    .macro-val{font-size:32px;font-weight:800;color:#fff;}
    .macro-label{font-size:16px;color:#666;margin-top:2px;}
    .verdict{font-size:26px;color:#ccc;text-align:center;max-width:800px;line-height:1.5;font-style:italic;margin-bottom:30px;}
    .brand{display:flex;align-items:center;gap:12px;position:absolute;bottom:50px;}
    .brand-badge{background:rgba(37,211,102,0.15);border:1px solid rgba(37,211,102,0.3);color:#25D366;font-size:22px;font-weight:700;padding:10px 24px;border-radius:50px;}
    .brand-sub{color:#555;font-size:20px;}
  </style></head><body><div class="bg"></div><div class="content">
    <div class="tag">${post.tag}</div>
    <div class="emoji-hero">${post.emoji}</div>
    <div class="food-name">${post.food}</div>
    <div class="food-sub">${post.subtitle}</div>
    <div class="cal-big">${post.calories}</div>
    <div class="cal-label">CALORIES</div>
    <div class="macros">
      <div class="macro"><div class="macro-icon">🥩</div><div class="macro-val">${post.protein}g</div><div class="macro-label">Protein</div></div>
      <div class="macro"><div class="macro-icon">🍞</div><div class="macro-val">${post.carbs}g</div><div class="macro-label">Carbs</div></div>
      <div class="macro"><div class="macro-icon">🥑</div><div class="macro-val">${post.fat}g</div><div class="macro-label">Fat</div></div>
      <div class="macro"><div class="macro-icon">🌾</div><div class="macro-val">${post.fibre}g</div><div class="macro-label">Fibre</div></div>
    </div>
    <div class="verdict">"${post.verdict}"</div>
    <div class="brand">
      <div class="brand-badge">🏋️ FITSORTED</div>
      <div class="brand-sub">Track on WhatsApp — no app needed 🇿🇦</div>
    </div>
  </div></body></html>`;
}

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const outDir = path.join(__dirname);
  
  for (const post of posts) {
    const html = generateHTML(post);
    const htmlPath = path.join(outDir, `post-${post.name}.html`);
    fs.writeFileSync(htmlPath, html);
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080 });
    await page.goto('file://' + htmlPath);
    await page.screenshot({ path: path.join(outDir, `post-${post.name}.png`), type: 'png' });
    await page.close();
    console.log(`✅ post-${post.name}.png`);
  }
  
  await browser.close();
  console.log(`\\n🎉 Generated ${posts.length} posts!`);
})();
