const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:18800' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
  await page.goto('http://localhost:8765/slideshows/nandos-calories.html', { waitUntil: 'load' });

  const slides = await page.$$('.slide');
  const outDir = path.join(__dirname, 'rendered');

  for (let i = 0; i < slides.length; i++) {
    const clip = await slides[i].boundingBox();
    await page.screenshot({
      path: path.join(outDir, `nandos-slide-${i + 1}.png`),
      clip: { x: clip.x, y: clip.y, width: 1080, height: 1350 }
    });
    console.log(`Rendered slide ${i + 1}`);
  }

  await page.close();
  console.log('Done!');
})();
