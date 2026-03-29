const fs = require('fs');
const path = require('path');

const CHAR_DIR = __dirname;
const OUTPUT_DIR = path.join(__dirname, '..', 'slideshows');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Slide template - data/comparison style
function dataSlide({ title, items, footnote, accent = '#2ecc71' }) {
  const itemsHTML = items.map(item => {
    const icon = item.good ? '✅' : item.bad ? '❌' : item.warn ? '⚠️' : item.icon || '';
    const highlight = item.highlight ? `style="color: ${accent}; font-size: 56px;"` : '';
    return `
      <div class="item" ${highlight}>
        <span class="icon">${icon}</span>
        <div class="item-content">
          <div class="item-name">${item.name}</div>
          ${item.detail ? `<div class="item-detail">${item.detail}</div>` : ''}
        </div>
        ${item.value ? `<div class="item-value">${item.value}</div>` : ''}
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1080px; height: 1920px; background: #1a1a1a; font-family: 'Inter', sans-serif; overflow: hidden; padding: 60px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 15px; margin-bottom: 40px; }
  .brand-dot { width: 16px; height: 16px; background: ${accent}; border-radius: 50%; }
  .brand-text { color: ${accent}; font-family: 'Anton', sans-serif; font-size: 32px; letter-spacing: 4px; }
  .title { color: #ffffff; font-family: 'Anton', sans-serif; font-size: 72px; line-height: 1.1; margin-bottom: 50px; letter-spacing: -1px; }
  .items { flex: 1; display: flex; flex-direction: column; gap: 24px; }
  .item { background: #242424; border-radius: 16px; padding: 32px 36px; display: flex; align-items: center; gap: 24px; }
  .icon { font-size: 40px; min-width: 50px; text-align: center; }
  .item-content { flex: 1; }
  .item-name { color: #ffffff; font-size: 42px; font-weight: 700; line-height: 1.3; }
  .item-detail { color: #999; font-size: 32px; margin-top: 4px; }
  .item-value { color: ${accent}; font-size: 48px; font-weight: 800; white-space: nowrap; }
  .footnote { color: #666; font-size: 30px; margin-top: 40px; text-align: center; font-style: italic; }
  .highlight-box { background: ${accent}; border-radius: 16px; padding: 32px 36px; display: flex; align-items: center; gap: 24px; }
  .highlight-box .item-name { color: #1a1a1a; }
  .highlight-box .item-value { color: #1a1a1a; }
  .highlight-box .item-detail { color: rgba(0,0,0,0.6); }
</style></head><body>
  <div class="brand"><div class="brand-dot"></div><span class="brand-text">FITSORTED</span></div>
  <div class="title">${title}</div>
  <div class="items">${itemsHTML}</div>
  ${footnote ? `<div class="footnote">${footnote}</div>` : ''}
</body></html>`;
}

// VS comparison slide
function vsSlide({ leftTitle, leftItems, rightTitle, rightItems, verdict, accent = '#2ecc71' }) {
  function col(title, items, side) {
    const bg = side === 'left' ? '#242424' : '#2a2a2a';
    return `<div class="col" style="background:${bg}">
      <div class="col-title">${title}</div>
      ${items.map(i => `<div class="stat"><span class="stat-label">${i.label}</span><span class="stat-value">${i.value}</span></div>`).join('')}
    </div>`;
  }
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1080px; height: 1920px; background: #1a1a1a; font-family: 'Inter', sans-serif; overflow: hidden; padding: 60px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 15px; margin-bottom: 40px; }
  .brand-dot { width: 16px; height: 16px; background: ${accent}; border-radius: 50%; }
  .brand-text { color: ${accent}; font-family: 'Anton', sans-serif; font-size: 32px; letter-spacing: 4px; }
  .vs-container { flex: 1; display: flex; gap: 24px; margin-bottom: 30px; }
  .col { flex: 1; border-radius: 20px; padding: 40px 30px; display: flex; flex-direction: column; gap: 28px; }
  .col-title { color: #fff; font-family: 'Anton', sans-serif; font-size: 52px; text-align: center; padding-bottom: 20px; border-bottom: 3px solid rgba(255,255,255,0.1); }
  .stat { display: flex; justify-content: space-between; align-items: center; }
  .stat-label { color: #999; font-size: 34px; }
  .stat-value { color: #fff; font-size: 38px; font-weight: 800; }
  .vs-badge { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: ${accent}; color: #1a1a1a; width: 90px; height: 90px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'Anton', sans-serif; font-size: 36px; z-index: 2; }
  .vs-wrapper { position: relative; flex: 1; }
  .verdict { background: ${accent}; border-radius: 16px; padding: 30px; text-align: center; }
  .verdict-text { color: #1a1a1a; font-family: 'Anton', sans-serif; font-size: 44px; }
  .verdict-sub { color: rgba(0,0,0,0.6); font-size: 30px; margin-top: 8px; }
</style></head><body>
  <div class="brand"><div class="brand-dot"></div><span class="brand-text">FITSORTED</span></div>
  <div class="vs-wrapper">
    <div class="vs-badge">VS</div>
    <div class="vs-container">
      ${col(leftTitle, leftItems, 'left')}
      ${col(rightTitle, rightItems, 'right')}
    </div>
  </div>
  <div class="verdict">
    <div class="verdict-text">${verdict.title}</div>
    ${verdict.sub ? `<div class="verdict-sub">${verdict.sub}</div>` : ''}
  </div>
</body></html>`;
}

// CTA slide
function ctaSlide({ headline, sub, charFile, accent = '#2ecc71' }) {
  const charPath = path.join(CHAR_DIR, charFile);
  const charBase64 = fs.readFileSync(charPath).toString('base64');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1080px; height: 1920px; background: #1a1a1a; font-family: 'Inter', sans-serif; overflow: hidden; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 60px; }
  .headline { color: #fff; font-family: 'Anton', sans-serif; font-size: 80px; line-height: 1.1; margin-bottom: 30px; z-index: 2; }
  .sub { color: #ccc; font-size: 40px; margin-bottom: 50px; z-index: 2; }
  .cta-btn { background: ${accent}; color: #1a1a1a; font-family: 'Anton', sans-serif; font-size: 48px; padding: 28px 60px; border-radius: 16px; letter-spacing: 2px; z-index: 2; }
  .cta-sub { color: #666; font-size: 32px; margin-top: 20px; z-index: 2; }
  .char { position: absolute; bottom: 0; right: -30px; height: 55%; opacity: 0.3; z-index: 1; }
</style></head><body>
  <div class="headline">${headline}</div>
  <div class="sub">${sub}</div>
  <div class="cta-btn">FITSORTED.CO.ZA</div>
  <div class="cta-sub">Free calorie tracker on WhatsApp</div>
  <img class="char" src="data:image/png;base64,${charBase64}" />
</body></html>`;
}

// ==========================================
// POST 9: YOUR NANDO'S ORDER IS 1,200 CALORIES
// ==========================================
const post9 = {
  name: 'nandos-1200',
  slides: [
    // Slide 2: The typical order
    { type: 'data', data: {
      title: "THE TYPICAL\nNANDO'S ORDER",
      items: [
        { name: "Half Chicken", detail: "flame-grilled", value: "620 cal", icon: "🍗" },
        { name: "Regular Chips", detail: "deep fried", value: "420 cal", icon: "🍟" },
        { name: "Coleslaw", detail: "creamy", value: "180 cal", icon: "🥗" },
        { name: "Regular Coke", detail: "330ml", value: "140 cal", icon: "🥤" },
      ],
      footnote: "That's 68% of your daily budget in one meal"
    }},
    // Slide 3: Total damage
    { type: 'data', data: {
      title: "TOTAL DAMAGE",
      items: [
        { name: "Total Calories", value: "1,360", icon: "🔥", highlight: true },
        { name: "More than 2 Big Macs", detail: "2 Big Macs = 1,100 cal", icon: "🍔" },
        { name: "68% of your daily budget", detail: "In a single meal", icon: "😬" },
        { name: "The chicken is fine", detail: "It's the SIDES killing you", icon: "👆" },
      ]
    }},
    // Slide 4: The fix
    { type: 'data', data: {
      title: "THE FIX\nSAME RESTAURANT",
      items: [
        { name: "Quarter Chicken + Rice", detail: "instead of half + chips", value: "510 cal", good: true },
        { name: "Side Salad", detail: "instead of coleslaw", value: "35 cal", good: true },
        { name: "Water or Coke Zero", detail: "instead of Coke", value: "0 cal", good: true },
      ],
      footnote: "New total: 545 cal. Same vibe. Half the damage."
    }},
    // Slide 5: CTA
    { type: 'cta', data: {
      headline: "KNOW YOUR\nCALORIES\nBEFORE YOU\nORDER",
      sub: "Track every meal in 5 seconds on WhatsApp",
      charFile: "fitsorted-female-thumbsup.png"
    }}
  ]
};

// ==========================================
// POST 4: WOOLWORTHS MEAL KITS
// ==========================================
const post4 = {
  name: 'woolies-meal-kits',
  slides: [
    { type: 'data', data: {
      title: "WE CHECKED\n5 POPULAR KITS",
      items: [
        { name: "Chicken Stir Fry Kit", value: "420 cal", good: true },
        { name: "Chicken & Veg Bake", value: "380 cal", good: true },
        { name: "Thai Green Curry Kit", value: "580 cal", warn: true },
        { name: "Butter Chicken Kit", value: "680 cal", bad: true },
        { name: "Beef Lasagne Kit", value: "720 cal", bad: true },
      ]
    }},
    { type: 'data', data: {
      title: "THE PROBLEM",
      items: [
        { name: '"Kit" does NOT mean healthy', icon: "⚠️" },
        { name: "Serving sizes are tiny", detail: "Most people eat 1.5x the listed serving", icon: "📏" },
        { name: "Creamy = calorie bomb", detail: "Butter chicken, lasagne, curry — all 600+", icon: "💣" },
        { name: "Check cal per 100g", detail: "Not per serving — that's where they hide it", icon: "🔍" },
      ]
    }},
    { type: 'data', data: {
      title: "SAFE PICKS",
      items: [
        { name: "Stir Fry Kits", detail: "Low cal, high protein, add extra veg", good: true },
        { name: "Bake/Roast Kits", detail: "Simple ingredients, no hidden cream", good: true },
        { name: "Add frozen veg", detail: "Stretches portion, adds volume for ~30 cal", good: true },
      ],
      footnote: "Skip anything with 'creamy', 'butter', or 'cheese' in the name"
    }},
    { type: 'cta', data: {
      headline: "STOP GUESSING\nSTART TRACKING",
      sub: "Scan any Woolworths meal — get instant calories",
      charFile: "fitsorted-hero-cooking.png"
    }}
  ]
};

// ==========================================
// POST 7: NANDO'S RICE VS CHIPS
// ==========================================
const post7 = {
  name: 'nandos-rice-vs-chips',
  slides: [
    { type: 'vs', data: {
      leftTitle: "PERI RICE",
      leftItems: [
        { label: "Calories", value: "200" },
        { label: "Protein", value: "4g" },
        { label: "Carbs", value: "38g" },
        { label: "Fat", value: "3g" },
      ],
      rightTitle: "CHIPS",
      rightItems: [
        { label: "Calories", value: "420" },
        { label: "Protein", value: "5g" },
        { label: "Carbs", value: "52g" },
        { label: "Fat", value: "22g" },
      ],
      verdict: { title: "RICE SAVES 220 CALORIES", sub: "Same price. Same fullness. Way less fat." }
    }},
    { type: 'data', data: {
      title: "ONE SWAP.\nBIG IMPACT.",
      items: [
        { name: "Per week", detail: "220 cal saved every Nando's visit", value: "220 cal", icon: "📅" },
        { name: "Per year", detail: "52 visits × 220 cal", value: "11,440 cal", icon: "📆" },
        { name: "Fat equivalent", detail: "That's roughly...", value: "~1.5 kg", icon: "⚖️" },
      ],
      footnote: "1.5kg of body fat — gone. From changing ONE side."
    }},
    { type: 'cta', data: {
      headline: "SMALL SWAPS\nBIG RESULTS",
      sub: "Track every meal. See the difference.",
      charFile: "fitsorted-female-standing.png"
    }}
  ]
};

// ==========================================
// POST: NANDO'S QUARTER CHICKEN & CHIPS
// ==========================================
const postNandosQuarterChicken = {
  name: 'nandos-quarter-chicken',
  slides: [
    { type: 'data', data: {
      title: "QUARTER CHICKEN\n+ CHIPS\nBREAKDOWN",
      items: [
        { name: "Quarter Chicken", detail: "flame-grilled", value: "310 cal", icon: "🍗" },
        { name: "Regular Chips", detail: "deep fried", value: "420 cal", bad: true },
        { name: "Peri Peri Sauce", detail: "2 tbsp", value: "15 cal", icon: "🌶️" },
      ],
      footnote: "Total: ~745 cal. And chips have almost ZERO protein."
    }},
    { type: 'data', data: {
      title: "THE SMART\nSWAP",
      items: [
        { name: "Quarter Chicken", detail: "keep it — great protein", value: "310 cal", good: true },
        { name: "Swap Chips → Peri Rice", detail: "saves 220 calories", value: "200 cal", good: true },
        { name: "Side Salad vs Coleslaw", detail: "saves 120 calories", value: "35 cal", good: true },
      ],
      footnote: "New total: ~525 cal. Same protein. Same restaurant. Same satisfaction."
    }},
    { type: 'cta', data: {
      headline: "TRACK EVERY\nNANDO'S ORDER\nIN 5 SECONDS",
      sub: "See exactly what you're eating before it becomes a problem",
      charFile: "fitsorted-hero-thumbsup.png"
    }}
  ]
};

// ==========================================
// POST: WOOLWORTHS ROTISSERIE CHICKEN
// ==========================================
const postWooliesRotisserie = {
  name: 'woolies-rotisserie',
  slides: [
    { type: 'data', data: {
      title: "WOOLIES\nROTISSERIE\nBREAKDOWN",
      items: [
        { name: "Per Quarter (Breast)", detail: "skin on", value: "400 cal", icon: "🍗" },
        { name: "Per Quarter (Thigh/Leg)", detail: "skin on", value: "450 cal", icon: "🦵" },
        { name: "Remove the Skin", detail: "saves per portion", value: "-100 cal", good: true },
        { name: "Protein per Portion", detail: "breast, no skin", value: "45g", icon: "💪" },
      ],
      footnote: "Whole chicken = ~1,600 cal total. That's 4 portions."
    }},
    { type: 'data', data: {
      title: "R100 =\n4 MEALS",
      items: [
        { name: "1 Rotisserie Chicken", detail: "~R100 at Woolies", value: "4 meals", icon: "🛒" },
        { name: "Add Microwave Rice", detail: "Woolies steam rice pack", value: "200 cal", icon: "🍚" },
        { name: "Add Frozen Veg", detail: "peas, corn, broccoli", value: "50 cal", icon: "🥦" },
        { name: "Per Meal (no skin)", detail: "chicken + rice + veg", value: "~450 cal", good: true, highlight: true },
      ],
      footnote: "Under R30 per meal. 40g+ protein. Takes 5 minutes to plate up."
    }},
    { type: 'cta', data: {
      headline: "BEST LAZY\nMEAL PREP\nIN SA",
      sub: "Track every meal on WhatsApp — free on FitSorted",
      charFile: "fitsorted-female-cooking.png"
    }}
  ]
};

// ==========================================
// POST: NANDO'S WRAP VS BURGER
// ==========================================
const postNandosWrapVsBurger = {
  name: 'nandos-wrap-vs-burger',
  slides: [
    { type: 'vs', data: {
      leftTitle: "WRAP",
      leftItems: [
        { label: "Calories", value: "480" },
        { label: "Protein", value: "32g" },
        { label: "Carbs", value: "42g" },
        { label: "Fat", value: "18g" },
      ],
      rightTitle: "BURGER",
      rightItems: [
        { label: "Calories", value: "550" },
        { label: "Protein", value: "30g" },
        { label: "Carbs", value: "48g" },
        { label: "Fat", value: "22g" },
      ],
      verdict: { title: "WRAP WINS BY 70 CALORIES", sub: "More protein too. Not even close." }
    }},
    { type: 'data', data: {
      title: "WHAT THIS\nMEANS FOR YOU",
      items: [
        { name: "Wrap has more protein", detail: "32g vs 30g — fuel that matters", icon: "💪" },
        { name: "Less fat", detail: "18g vs 22g — 4g difference adds up", icon: "📉" },
        { name: "Pro move", detail: "Wrap + extra chicken strips", good: true },
        { name: "Stack it smart", detail: "~570 cal, 45g+ protein total", good: true, highlight: true },
      ],
      footnote: "The wrap is always the right call. Unless you're bulking — then eat both."
    }},
    { type: 'cta', data: {
      headline: "ORDER SMARTER.\nEAT THE SAME\nFOOD YOU LOVE.",
      sub: "Track your Nando's order on FitSorted — free",
      charFile: "fitsorted-hero-standing.png"
    }}
  ]
};

// ==========================================
// POST: NANDO'S CUTTING ORDER (UNDER 500 CAL)
// ==========================================
const postNandosCuttingOrder = {
  name: 'nandos-cutting-order',
  slides: [
    { type: 'data', data: {
      title: "THE UNDER\n500-CAL\nNANDO'S ORDER",
      items: [
        { name: "Quarter Breast", detail: "flame-grilled, no skin", value: "310 cal", good: true },
        { name: "Peri Peri Rice", detail: "regular side", value: "200 cal", good: true },
        { name: "Side Salad", detail: "no dressing", value: "35 cal", good: true },
        { name: "Water / Coke Zero", detail: "your choice", value: "0 cal", good: true },
      ],
      footnote: "Total: 545 cal • 42g protein • Filling • No guilt"
    }},
    { type: 'data', data: {
      title: "WHAT TO\nAVOID",
      items: [
        { name: "Regular Chips", detail: "adds 420 calories", bad: true },
        { name: "Coleslaw", detail: "adds 180 calories", bad: true },
        { name: "Garlic Bread", detail: "adds 280 calories", bad: true },
        { name: "Bottomless Drinks", detail: "500+ cal if you refill", bad: true },
      ],
      footnote: "One wrong side and you've doubled your meal. Choose wisely."
    }},
    { type: 'cta', data: {
      headline: "EAT OUT\nWITHOUT\nBLOWING YOUR\nCALORIES",
      sub: "Track your order on WhatsApp — free on FitSorted",
      charFile: "fitsorted-female-thumbsup.png"
    }}
  ]
};

// ==========================================
// POST: WOOLWORTHS PROTEIN WRAPS VS NORMAL
// ==========================================
const postWooliesProteinWraps = {
  name: 'woolies-protein-wraps',
  slides: [
    { type: 'vs', data: {
      leftTitle: "NORMAL WRAP",
      leftItems: [
        { label: "Calories", value: "260" },
        { label: "Protein", value: "8g" },
        { label: "Carbs", value: "38g" },
        { label: "Price", value: "~R22" },
      ],
      rightTitle: "PROTEIN WRAP",
      rightItems: [
        { label: "Calories", value: "240" },
        { label: "Protein", value: "18g" },
        { label: "Carbs", value: "28g" },
        { label: "Price", value: "~R42" },
      ],
      verdict: { title: "IS THE R20 EXTRA WORTH IT?", sub: "10g more protein. 10g fewer carbs." }
    }},
    { type: 'data', data: {
      title: "WHAT R20\nEXTRA BUYS\nYOU",
      items: [
        { name: "Protein Wrap upgrade", detail: "+10g protein for R20", icon: "🌯" },
        { name: "2 free-range eggs", detail: "+12g protein for R8", good: true },
        { name: "100g chicken breast", detail: "+31g protein for R20", good: true, highlight: true },
        { name: "VERDICT", detail: "Nice wrap. But spend R20 on real protein instead.", warn: true },
      ],
      footnote: "The protein wrap is a smart choice — just not the BEST value for protein."
    }},
    { type: 'cta', data: {
      headline: "MAKE SMARTER\nFOOD CHOICES",
      sub: "Track every meal — free calorie tracker on WhatsApp",
      charFile: "fitsorted-hero-cooking.png"
    }}
  ]
};

// ==========================================
// POST: WOOLWORTHS VS PNP GREEK YOGHURT
// ==========================================
const postWooliesVsPnpYoghurt = {
  name: 'woolies-vs-pnp-yoghurt',
  slides: [
    { type: 'vs', data: {
      leftTitle: "WOOLIES GREEK",
      leftItems: [
        { label: "Calories/100g", value: "130" },
        { label: "Protein/100g", value: "5g" },
        { label: "500g tub", value: "R55" },
        { label: "Protein/R", value: "0.45g" },
      ],
      rightTitle: "PNP GREEK",
      rightItems: [
        { label: "Calories/100g", value: "97" },
        { label: "Protein/100g", value: "9g" },
        { label: "1kg tub", value: "R60" },
        { label: "Protein/R", value: "1.5g" },
      ],
      verdict: { title: "PNP: 3X MORE PROTEIN PER RAND", sub: "And 30% fewer calories per 100g" }
    }},
    { type: 'data', data: {
      title: "THE HONEST\nBREAKDOWN",
      items: [
        { name: "For Protein Goals", detail: "PnP wins easily — 3x better value", good: true },
        { name: "For Taste/Texture", detail: "Woolies is creamier (more fat)", icon: "😋" },
        { name: "For Fat Loss", detail: "PnP: fewer cal + more protein = clear choice", good: true, highlight: true },
        { name: "Woolies = a treat", detail: "Not your daily driver if macros matter", warn: true },
      ],
      footnote: "If you want protein, PnP. If you want dessert, Woolies. Simple."
    }},
    { type: 'cta', data: {
      headline: "TRACK YOUR\nMACROS ON\nWHATSAPP",
      sub: "FitSorted — free calorie tracker. No app needed.",
      charFile: "fitsorted-female-standing.png"
    }}
  ]
};

// ==========================================
// POST: WOOLWORTHS PROTEIN SNACKS TOP 5
// ==========================================
const postWooliesProteinSnacks = {
  name: 'woolies-protein-snacks',
  slides: [
    { type: 'data', data: {
      title: "TOP 5 HIGH\nPROTEIN SNACKS\nAT WOOLIES",
      items: [
        { name: "Biltong (80g pack)", detail: "~R28", value: "35g protein", good: true },
        { name: "Chicken Strips (ready to eat)", detail: "~R30", value: "28g protein", good: true },
        { name: "Cottage Cheese Tub", detail: "~R28", value: "22g protein", good: true },
        { name: "Boiled Eggs 2-pack", detail: "~R15", value: "12g protein", good: true },
        { name: "Yoghurt & Granola Cup", detail: "~R25", value: "12g protein", icon: "🥣" },
      ],
      footnote: "All under R30. All available in store today."
    }},
    { type: 'data', data: {
      title: "BEST VALUE\nFOR PROTEIN",
      items: [
        { name: "🥇 Biltong", detail: "1.25g protein per Rand", value: "R28", good: true, highlight: true },
        { name: "🥈 Boiled Eggs", detail: "0.8g protein per Rand", value: "R15", good: true },
        { name: "🥉 Cottage Cheese", detail: "0.79g protein per Rand", value: "R28", good: true },
        { name: "❌ Skip: Protein Bars", detail: "High sugar, low actual protein per Rand", bad: true },
      ],
      footnote: "Biltong is the GOAT. Grab it every time you're at Woolies."
    }},
    { type: 'cta', data: {
      headline: "GRAB, EAT,\nTRACK.",
      sub: "FitSorted — free calorie tracker on WhatsApp",
      charFile: "fitsorted-hero-standing.png"
    }}
  ]
};

// Generate all posts
const posts = [post9, post4, post7, postNandosQuarterChicken, postWooliesRotisserie, postNandosWrapVsBurger, postNandosCuttingOrder, postWooliesProteinWraps, postWooliesVsPnpYoghurt, postWooliesProteinSnacks];

for (const post of posts) {
  const postDir = path.join(OUTPUT_DIR, post.name);
  if (!fs.existsSync(postDir)) fs.mkdirSync(postDir, { recursive: true });
  
  post.slides.forEach((slide, i) => {
    let html;
    if (slide.type === 'data') html = dataSlide(slide.data);
    else if (slide.type === 'vs') html = vsSlide(slide.data);
    else if (slide.type === 'cta') html = ctaSlide(slide.data);
    
    const filename = `slide-${i + 2}.html`; // +2 because slide 1 is the hook thumbnail
    fs.writeFileSync(path.join(postDir, filename), html);
    console.log(`✅ ${post.name}/${filename}`);
  });
}

console.log(`\n📁 Generated ${posts.length} slideshow posts in ${OUTPUT_DIR}`);
