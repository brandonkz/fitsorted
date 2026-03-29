#!/usr/bin/env node
/**
 * Schedule all FitSorted posts to Instagram and TikTok via Postiz
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = 'f106e11ea7991bcee68bb6e60e54e6bcf041b8a3a332ab8b88b70c43bc4c7edf';
const INSTAGRAM_ID = 'cmmkap1k000chqn0ygg2aihz1';
const TIKTOK_ID = 'cmmlw6wkv04yyqn0yt0mxv928';

const SCHEDULE_FILE = '/Users/brandonkatz/.openclaw/workspace/fitsorted/ads/weekly-content/schedule-manifest.json';

// Upload media via multipart
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
          if (json.id) {
            resolve({ id: json.id, path: json.path });
          } else {
            reject(new Error('Upload failed: ' + data));
          }
        } catch {
          reject(new Error('Upload parse error: ' + data));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Schedule post to multiple platforms
function schedulePost(content, mediaObj, isoTime, integrationIds) {
  return new Promise((resolve, reject) => {
    const posts = integrationIds.map(integrationId => ({
      integration: { id: integrationId },
      value: [{
        content,
        image: [{ id: mediaObj.id, path: mediaObj.path }]
      }],
      settings: {}
    }));

    const payload = JSON.stringify({
      type: 'schedule',
      date: isoTime,
      shortLink: false,
      tags: [],
      posts
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
        } catch {
          reject(new Error('Schedule parse error: ' + data));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Main execution
(async () => {
  console.log('📅 Scheduling FitSorted Posts to Instagram & TikTok\n');

  const schedule = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
  const results = [];

  for (const post of schedule) {
    console.log(`📝 ${post.type.toUpperCase()} ${post.index}: ${post.title}`);
    console.log(`   📆 ${post.date} at ${post.time}`);

    try {
      // Upload image
      const media = await uploadMedia(post.imagePath);
      console.log(`   ✅ Image uploaded: ${media.id}`);

      // Schedule to both platforms
      const result = await schedulePost(
        post.text,
        media,
        post.timestamp,
        [INSTAGRAM_ID, TIKTOK_ID]
      );

      console.log(`   ✅ Scheduled to Instagram & TikTok`);
      
      results.push({
        ...post,
        scheduled: true,
        mediaId: media.id,
        result
      });

      // Rate limit delay
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`   ❌ Failed: ${err.message}`);
      results.push({
        ...post,
        scheduled: false,
        error: err.message
      });
    }
  }

  // Save results
  fs.writeFileSync(
    path.join(path.dirname(SCHEDULE_FILE), 'schedule-results.json'),
    JSON.stringify(results, null, 2)
  );

  const successful = results.filter(r => r.scheduled).length;
  const failed = results.filter(r => !r.scheduled).length;

  console.log(`\n✅ Scheduling complete!`);
  console.log(`   Successful: ${successful}`);
  console.log(`   Failed: ${failed}`);
  console.log(`\n📁 Results saved to schedule-results.json`);
})();
