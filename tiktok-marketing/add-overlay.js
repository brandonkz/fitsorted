const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'logo-512.png');

async function addOverlay(imagePath, text, outputPath) {
  const img = await loadImage(imagePath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // Semi-transparent dark gradient overlay for text readability
  const gradient = ctx.createLinearGradient(0, 0, 0, img.height * 0.55);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
  gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.25)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, img.width, img.height * 0.55);

  // Adjust font size based on text length
  const wordCount = text.split(/\s+/).length;
  let fontSizePercent;
  if (wordCount <= 5) fontSizePercent = 0.075;
  else if (wordCount <= 12) fontSizePercent = 0.065;
  else fontSizePercent = 0.050;

  const fontSize = Math.round(img.width * fontSizePercent);
  const outlineWidth = Math.round(fontSize * 0.12);
  const maxWidth = img.width * 0.80;
  const lineHeight = fontSize * 1.35;

  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Word wrap with manual line breaks
  const lines = [];
  const manualLines = text.split('\n');
  for (const ml of manualLines) {
    const words = ml.trim().split(/\s+/);
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  // Position: centered at ~25% from top
  const totalHeight = lines.length * lineHeight;
  const startY = (img.height * 0.25) - (totalHeight / 2);
  const x = img.width / 2;

  // Draw each line
  for (let i = 0; i < lines.length; i++) {
    const y = startY + (i * lineHeight);

    // Drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // Black outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = outlineWidth;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeText(lines[i], x, y);

    // White fill
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(lines[i], x, y);

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  // Add logo (bottom-right corner)
  if (fs.existsSync(LOGO_PATH)) {
    const logo = await loadImage(LOGO_PATH);
    const logoSize = Math.round(img.width * 0.12); // 12% of image width
    const margin = Math.round(img.width * 0.04);
    // Bottom-right, above the TikTok safe zone (bottom 20%)
    const logoX = img.width - logoSize - margin;
    const logoY = img.height * 0.75 - logoSize;
    
    // Slight shadow behind logo
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
  console.log(`Saved: ${outputPath}`);
}

// Main
const dir = process.argv[2] || '.';
const textsFile = path.join(dir, 'texts.json');
const texts = JSON.parse(fs.readFileSync(textsFile, 'utf8'));

(async () => {
  for (let i = 0; i < texts.length; i++) {
    const slideNum = i + 1;
    let rawPath = path.join(dir, `slide${slideNum}_raw.png`);
    if (!fs.existsSync(rawPath)) {
      rawPath = path.join(dir, `slide${slideNum}_raw.jpg`);
    }
    if (!fs.existsSync(rawPath)) {
      console.log(`Skipping slide ${slideNum} - no raw image found`);
      continue;
    }
    const outPath = path.join(dir, `slide${slideNum}.png`);
    await addOverlay(rawPath, texts[i], outPath);
  }
  console.log('Done!');
})();
