#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = 'f106e11ea7991bcee68bb6e60e54e6bcf041b8a3a332ab8b88b70c43bc4c7edf';
const INSTAGRAM_ID = 'cmmkap1k000chqn0ygg2aihz1';
const TIKTOK_ID = 'cmmlw6wkv04yyqn0yt0mxv928';

const SLIDES = [
  'slide-1-hook.png',
  'slide-2-old-way.png',
  'slide-3-new-way.png',
  'slide-4-demo.png',
  'slide-5-features.png',
  'slide-6-cta.png'
];

const CAPTION = `Stop downloading apps to count calories.

Just text what you ate on WhatsApp. Our AI agent does the rest.

"2 eggs on toast" → 420 cal, macros tracked, daily budget updated. Done in 5 seconds.

Built for South Africa. Nando's, Steers, Woolworths, biltong, bunny chow — all in the database.

Try it 👉 link in bio

#fitsorted #caloriecounting #southafrica #fitness #whatsapp #healthyeating #capetown #joburg #durban #macros #gymlife #mealtracking`;

function uploadMedia(filePath) {
  return new Promise((resolve, reject) => {
    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const boundary = '----PostizBoundary' + Date.now();

    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`),
      fileData,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const opts = {
      hostname: 'api.postiz.com',
      path: '/public/v1/upload',
      method: 'POST',
      headers: {
        'Authorization': API_KEY,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      timeout: 60000,
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.id) resolve({ id: json.id, path: json.path });
          else reject(new Error('Upload failed: ' + data));
        } catch { reject(new Error('Upload parse error: ' + data)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function createPost(content, mediaObjects, integrationIds) {
  return new Promise((resolve, reject) => {
    const images = mediaObjects.map(m => ({ id: m.id, path: m.path }));
    
    const igPost = {
      integration: { id: integrationIds[0] },
      value: [{ content, image: images }],
      settings: { post_type: 'post' }
    };

    const tkPost = {
      integration: { id: integrationIds[1] },
      value: [{ content, image: images }],
      settings: {
        privacy_level: 'PUBLIC_TO_EVERYONE',
        duet: true,
        stitch: true,
        comment: true,
        autoAddMusic: 'no',
        brand_content_toggle: false,
        brand_organic_toggle: false,
        content_posting_method: 'DIRECT_POST'
      }
    };

    const now = new Date();
    now.setMinutes(now.getMinutes() + 2);

    const payload = JSON.stringify({
      type: 'schedule',
      date: now.toISOString(),
      shortLink: false,
      tags: [],
      posts: [igPost, tkPost]
    });

    const opts = {
      hostname: 'api.postiz.com',
      path: '/public/v1/posts',
      method: 'POST',
      headers: {
        'Authorization': API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch { reject(new Error('Post parse error: ' + data)); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

(async () => {
  console.log('📤 Uploading all 6 slides...\n');
  
  const dir = __dirname || '.';
  const mediaObjects = [];
  
  for (const slide of SLIDES) {
    const filePath = path.join(dir, slide);
    console.log(`  Uploading ${slide}...`);
    try {
      const media = await uploadMedia(filePath);
      console.log(`  ✅ ${slide} -> ${media.id}`);
      mediaObjects.push(media);
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`  ❌ ${slide}: ${err.message}`);
    }
  }

  if (mediaObjects.length === 0) {
    console.error('\n❌ No images uploaded. Aborting.');
    process.exit(1);
  }

  console.log(`\n📱 Posting carousel (${mediaObjects.length} images) to Instagram & TikTok...`);
  
  try {
    const result = await createPost(CAPTION, mediaObjects, [INSTAGRAM_ID, TIKTOK_ID]);
    console.log('\n✅ Posted!');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('\n❌ Post failed:', err.message);
  }
})();
