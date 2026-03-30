const fs = require('fs');

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const API_KEY = process.env.GEMINI_API_KEY;

async function generateImage(prompt, filename) {
  console.log(`Generating: ${filename}...`);
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: "1:1", outputMimeType: "image/png" }
    })
  });
  const data = await resp.json();
  if (data.predictions?.[0]?.bytesBase64Encoded) {
    fs.writeFileSync(filename, Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64'));
    console.log(`  ✅ Saved ${filename}`);
    return true;
  }
  console.log(`  ❌ Failed: ${JSON.stringify(data).slice(0, 300)}`);
  return false;
}

async function main() {
  const images = [
    {
      prompt: "Professional overhead food photography of flame-grilled half chicken with peri-peri sauce on dark slate plate, moody dark background with warm lighting, restaurant quality photo",
      file: "half-chicken.png"
    },
    {
      prompt: "Professional overhead food photography of a large portion of crispy golden french fries on a dark plate, moody dark background, warm restaurant lighting, food photography",
      file: "chips.png"
    },
    {
      prompt: "Professional overhead food photography of creamy coleslaw in a small dark bowl, moody dark background, warm lighting, food photography",
      file: "coleslaw.png"
    },
    {
      prompt: "Professional food photography of a cola drink in a glass with ice on dark background, moody warm lighting, food photography",
      file: "coke.png"
    },
    {
      prompt: "Professional overhead food photography of a grilled chicken salad wrap on a dark plate, moody dark background, warm restaurant lighting, healthy looking, food photography",
      file: "smart-swap-wrap.png"
    }
  ];

  for (const img of images) {
    await generateImage(img.prompt, img.file);
    await new Promise(r => setTimeout(r, 2000));
  }
}

main();
