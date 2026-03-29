import puppeteer from 'puppeteer';
import { join } from 'path';

const outputDir = '/Users/brandonkatz/.openclaw/workspace/fitsorted/ads/rendered/woolies-protein-hacks';
const baseUrl = 'http://localhost:8770/woolies-protein-hacks/index.html';
const slideNames = ['slide-1-hook', 'slide-2-gains', 'slide-3-traps', 'slide-4-swaps', 'slide-5-cta'];

(async () => {
  const { mkdirSync } = await import('fs');
  mkdirSync(outputDir, { recursive: true });

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });

  for (let i = 0; i < slideNames.length; i++) {
    const url = `${baseUrl}?slide=${i + 1}`;
    await page.goto(url, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 500));
    const path = join(outputDir, `${slideNames[i]}.png`);
    await page.screenshot({ path, fullPage: false });
    console.log(`Saved: ${path}`);
  }

  await browser.close();
  console.log('Done!');
})();
