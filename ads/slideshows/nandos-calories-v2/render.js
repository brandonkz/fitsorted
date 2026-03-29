const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const slides = [
  'slide-1-hook.html',
  'slide-2-chicken.html', 
  'slide-3-sides.html',
  'slide-4-total.html',
  'slide-5-swap.html',
  'slide-6-cta.html'
];

const dir = __dirname || '.';

for (const slide of slides) {
  const htmlPath = path.join(dir, slide);
  const pngName = slide.replace('.html', '.png');
  const pngPath = path.join(dir, pngName);
  const fileUrl = `file://${path.resolve(htmlPath)}`;
  
  console.log(`Rendering ${slide}...`);
  try {
    execSync(`/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --headless --disable-gpu --screenshot="${pngPath}" --window-size=1080,1080 --hide-scrollbars "${fileUrl}" 2>/dev/null`);
    if (fs.existsSync(pngPath)) {
      console.log(`  ✅ ${pngName}`);
    } else {
      console.log(`  ❌ File not created`);
    }
  } catch(e) {
    console.log(`  ❌ ${e.message.slice(0, 100)}`);
  }
}
