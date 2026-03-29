const fs = require('fs');
const path = require('path');

const CHAR_DIR = __dirname;
const OUTPUT_DIR = path.join(__dirname, '..', 'thumbnails');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// SA food/calorie content hooks
const thumbnails = [
  {
    hook: "NANDO'S\nQUARTER CHICKEN\n& CHIPS\nCALORIE COUNT",
    subtitle: "IT'S MORE THAN YOU THINK",
    character: "fitsorted-female-cooking.png",
    filename: "nandos-quarter-chicken"
  },
  {
    hook: "WOOLWORTHS\nROTISSERIE\nCHICKEN\nFULL BREAKDOWN",
    subtitle: "THE BEST LAZY DINNER OPTION?",
    character: "fitsorted-hero-thumbsup.png",
    filename: "woolies-rotisserie"
  },
  {
    hook: "NANDO'S\nWRAP VS\nBURGER\nWHICH IS\nBETTER?",
    subtitle: "CALORIES + PROTEIN COMPARED",
    character: "fitsorted-female-standing.png",
    filename: "nandos-wrap-vs-burger"
  },
  {
    hook: "WOOLWORTHS\nMEAL KITS\nARE THEY\nACTUALLY\nHEALTHY?",
    subtitle: "WE CHECKED THE LABELS",
    character: "fitsorted-hero-cooking.png",
    filename: "woolies-meal-kits"
  },
  {
    hook: "WHAT I ORDER\nAT NANDO'S\nWHEN CUTTING\nCALORIES",
    subtitle: "UNDER 500 CALORIES",
    character: "fitsorted-female-thumbsup.png",
    filename: "nandos-cutting-order"
  },
  {
    hook: "WOOLWORTHS\nPROTEIN WRAPS\nVS NORMAL WRAPS\nTHE TRUTH",
    subtitle: "IS THE EXTRA R20 WORTH IT?",
    character: "fitsorted-hero-standing.png",
    filename: "woolies-protein-wraps"
  },
  {
    hook: "NANDO'S\nPERI PERI RICE\nVS CHIPS\nWHICH SIDE\nWINS?",
    subtitle: "ONE SAVES YOU 200 CALORIES",
    character: "fitsorted-female-cooking.png",
    filename: "nandos-rice-vs-chips"
  },
  {
    hook: "WOOLWORTHS\nGREEK YOGHURT\nVS PICK N PAY\nBRAND",
    subtitle: "PROTEIN PER RAND COMPARED",
    character: "fitsorted-hero-thumbsup.png",
    filename: "woolies-vs-pnp-yoghurt"
  },
  {
    hook: "YOUR NANDO'S\nORDER IS\n1,200 CALORIES\nHERE'S WHY",
    subtitle: "THE SIDES ARE THE PROBLEM",
    character: "fitsorted-female-standing.png",
    filename: "nandos-1200-calories"
  },
  {
    hook: "BEST\nHIGH PROTEIN\nSNACKS AT\nWOOLWORTHS\nUNDER R30",
    subtitle: "GRAB AND GO",
    character: "fitsorted-hero-cooking.png",
    filename: "woolies-protein-snacks"
  }
];

function generateHTML(thumb) {
  const charPath = path.join(CHAR_DIR, thumb.character);
  const charBase64 = fs.readFileSync(charPath).toString('base64');
  
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Anton&display=swap');
  
  * { margin: 0; padding: 0; box-sizing: border-box; }
  
  body {
    width: 1080px;
    height: 1920px;
    background: #1a1a1a;
    font-family: 'Anton', sans-serif;
    overflow: hidden;
    position: relative;
  }
  
  .gradient-overlay {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.5) 100%);
    z-index: 1;
  }
  
  .brand {
    position: absolute;
    top: 40px;
    left: 50px;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 15px;
  }
  
  .brand-dot {
    width: 20px;
    height: 20px;
    background: #2ecc71;
    border-radius: 50%;
  }
  
  .brand-text {
    color: #2ecc71;
    font-size: 36px;
    letter-spacing: 4px;
    text-transform: uppercase;
  }
  
  .hook {
    position: absolute;
    top: 120px;
    left: 50px;
    right: 50px;
    z-index: 3;
    color: #ffffff;
    font-size: 120px;
    line-height: 1.05;
    letter-spacing: -2px;
    text-transform: uppercase;
    text-shadow: 0 4px 20px rgba(0,0,0,0.8);
  }
  
  .subtitle {
    position: absolute;
    bottom: 120px;
    left: 50px;
    right: 50px;
    z-index: 3;
    color: #2ecc71;
    font-size: 48px;
    letter-spacing: 3px;
    text-transform: uppercase;
  }
  
  .character {
    position: absolute;
    bottom: 0;
    right: -50px;
    z-index: 2;
    height: 75%;
    object-fit: contain;
  }
  
  .cta {
    position: absolute;
    bottom: 50px;
    left: 50px;
    z-index: 3;
    background: #2ecc71;
    color: #1a1a1a;
    padding: 15px 40px;
    font-size: 32px;
    letter-spacing: 2px;
    border-radius: 8px;
    font-weight: bold;
  }
</style>
</head>
<body>
  <div class="gradient-overlay"></div>
  
  <div class="brand">
    <div class="brand-dot"></div>
    <span class="brand-text">FitSorted</span>
  </div>
  
  <div class="hook">${thumb.hook}</div>
  
  <img class="character" src="data:image/png;base64,${charBase64}" />
  
  <div class="subtitle">${thumb.subtitle}</div>
  
  <div class="cta">TRACK FREE ON WHATSAPP</div>
</body>
</html>`;
}

// Generate all thumbnails
for (const thumb of thumbnails) {
  const html = generateHTML(thumb);
  const htmlPath = path.join(OUTPUT_DIR, `${thumb.filename}.html`);
  fs.writeFileSync(htmlPath, html);
  console.log(`✅ ${thumb.filename}.html`);
}

console.log(`\n📁 Generated ${thumbnails.length} thumbnail templates in ${OUTPUT_DIR}`);
console.log('To render as PNG, open each HTML in a browser at 1080x1920 and screenshot, or use Puppeteer.');
