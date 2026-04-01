const https = require('https');
const fs = require('fs');

const text = `A Nando's quarter chicken with peri chips... 680 calories. A single slice of Woolworths carrot cake... 720 calories. The chicken meal has more protein, fewer carbs, and costs less. Track everything you eat on WhatsApp. No app needed. FitSorted.`;

const data = JSON.stringify({
  model: "tts-1",
  input: text,
  voice: "onyx",
  response_format: "mp3"
});

const options = {
  hostname: 'api.openai.com',
  path: '/v1/audio/speech',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  const chunks = [];
  res.on('data', chunk => chunks.push(chunk));
  res.on('end', () => {
    const buffer = Buffer.concat(chunks);
    if (res.statusCode === 200) {
      fs.writeFileSync('voiceover2.mp3', buffer);
      console.log(`✅ Voiceover saved (${buffer.length} bytes)`);
    } else {
      console.log(`❌ Error ${res.statusCode}: ${buffer.toString()}`);
    }
  });
});
req.write(data);
req.end();
