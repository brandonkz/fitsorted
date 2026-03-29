const { execSync } = require('child_process');
const path = require('path');

// Use Playwright to render slides at exact 1080x1350
const slides = [1, 2, 3, 4, 5, 6];
const baseUrl = 'http://localhost:8765/slideshows/woolies-ready-meals';
const outDir = path.join(__dirname, 'slideshows', 'woolies-ready-meals');

async function render() {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  
  for (const num of slides) {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
    await page.goto(`${baseUrl}/slide-${num}.html`, { waitUntil: 'networkidle' });
    await page.screenshot({ 
      path: path.join(outDir, `slide-${num}.png`),
      fullPage: false,
      clip: { x: 0, y: 0, width: 1080, height: 1350 }
    });
    await page.close();
    console.log(`Rendered slide-${num}.png`);
  }
  
  await browser.close();
}

render().catch(console.error);
