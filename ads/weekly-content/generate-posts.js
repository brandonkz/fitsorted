#!/usr/bin/env node
/**
 * FitSorted Weekly Content Generator
 * Generates 14 posts (7 calorie + 7 protein) with AI images and schedules via Postiz
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const POSTIZ_API_KEY = 'f106e11ea7991bcee68bb6e60e54e6bcf041b8a3a332ab8b88b70c43bc4c7edf';

// We'll need to find the FitSorted integration ID - for now using a placeholder
const FITSORTED_INTEGRATION_ID = 'PLACEHOLDER'; // Will be replaced after checking integrations

const OUTPUT_DIR = '/Users/brandonkatz/.openclaw/workspace/fitsorted/ads/weekly-content';

// Content definitions
const caloriePosts = [
  {
    title: 'STAT POST',
    text: "People who track calories are 2x more likely to reach their weight goals (Journal of the Academy of Nutrition, 2019). Most people overestimate what they burn and underestimate what they eat.\n\nTrack yours free for 7 days on WhatsApp → +27690684940",
    imagePrompt: "Fitness infographic with bold typography on dark gradient background. Large prominent text '2X MORE LIKELY' with smaller text 'to reach weight goals'. Modern minimalist design with green accent color. Include 'fitsorted.co.za' watermark. Clean Instagram carousel style.",
  },
  {
    title: 'MYTH BUSTER',
    text: "That 'healthy' Woolworths salad? Could be 600+ calories with dressing. The chicken wrap? 480 cal. Tracking isn't about eating less — it's about knowing what you're actually eating.\n\nFitSorted knows every Woolworths meal → fitsorted.co.za",
    imagePrompt: "Fitness infographic showing calorie numbers in large bold text: '600+ CAL' and '480 CAL' on dark background with green accents. Modern clean design, no stock photos. Include 'fitsorted.co.za' watermark. Instagram carousel first slide style.",
  },
  {
    title: 'SA FOOD REALITY',
    text: "A Gatsby is 1,200+ calories. A bunny chow is 800+. A Steers Wacky Wednesday burger is 650. None of these are 'bad' — but you need to know the numbers to make them fit your goals.\n\nWe track 400+ SA foods → fitsorted.co.za",
    imagePrompt: "Fitness infographic with South African food calorie breakdown. Large numbers: '1,200+ CAL' '800+ CAL' '650 CAL' in bold typography on gradient dark background with green highlights. Modern clean design. Include 'fitsorted.co.za' watermark.",
  },
  {
    title: '3 WEEK HABIT',
    text: "It takes 21 days of tracking before it clicks. Week 1 is eye-opening. Week 2 you start making swaps. Week 3 you do it without thinking.\n\nStart your 21 days → +27690684940",
    imagePrompt: "Fitness infographic showing '21 DAYS' in large bold text with progression graphic showing Weeks 1-2-3. Dark gradient background with green accent color. Clean modern design, Instagram carousel style. Include 'fitsorted.co.za' watermark.",
  },
  {
    title: 'PORTION SHOCK',
    text: "What 2,000 calories actually looks like vs what most people think. Spoiler: it's way less food than you expect (and way more protein than you're eating).\n\nFitSorted shows you exactly where you stand → fitsorted.co.za",
    imagePrompt: "Fitness infographic with '2,000 CALORIES' in massive bold text on dark background. Green accent highlights. Modern minimalist style, no stock photos. Include 'fitsorted.co.za' watermark. Instagram carousel aesthetic.",
  },
  {
    title: 'WEEKEND TRAP',
    text: "Monday to Friday: 1,800 cal/day. Saturday braai + beers: 4,000 calories. Sunday guilt eating: 2,500. Your 'good week' is actually maintenance. Track weekends too.\n\nFitSorted sends you a morning check-in every day → fitsorted.co.za",
    imagePrompt: "Fitness infographic showing calorie comparison: '1,800 CAL' vs '4,000 CAL' in contrasting bold typography. Dark gradient background with green accents. Clean modern design. Include 'fitsorted.co.za' watermark.",
  },
  {
    title: 'SUCCESS METRIC',
    text: "FitSorted users who track for 30+ days report feeling more in control of their eating — not restricted. Tracking = awareness, not punishment.\n\nR36/mo on WhatsApp → fitsorted.co.za",
    imagePrompt: "Fitness infographic with '30+ DAYS' in large bold text and concept of control vs restriction. Dark background with green accent color. Modern clean minimalist design. Include 'fitsorted.co.za' watermark. Instagram carousel style.",
  },
];

const proteinPosts = [
  {
    title: 'THE NUMBER',
    text: "You need 1.6-2.2g protein per kg bodyweight to build/maintain muscle. If you weigh 80kg, that's 128-176g per day. Most South Africans get about 60g. You're probably undereating protein.\n\nFitSorted tracks your protein automatically → fitsorted.co.za",
    imagePrompt: "Fitness infographic showing protein calculation '1.6-2.2g/kg' and '128-176g PER DAY' in large bold text. Dark gradient background with green highlights. Modern clean design. Include 'fitsorted.co.za' watermark.",
  },
  {
    title: 'CHEAPEST PROTEIN SA',
    text: "Best protein per Rand at Woolworths:\n1. Eggs (R3.50/20g protein)\n2. Chicken breast (R5/25g)\n3. Biltong (R8/25g)\n4. Double cream yoghurt (R2/5g)\n5. Cottage cheese (R4/15g)\n\nStop overpaying for protein. We show protein for every food you log → fitsorted.co.za",
    imagePrompt: "Fitness infographic showing protein price list with Rand symbols and protein amounts in bold typography. Dark background with green accent color. Clean modern design, no stock photos. Include 'fitsorted.co.za' watermark.",
  },
  {
    title: '3PM CRASH',
    text: "Tired every afternoon? Before you blame sleep, check your lunch protein. A sandwich with 12g protein won't hold you. Aim for 30-40g per meal. Your energy follows your protein.\n\nCheck if you're hitting your targets → fitsorted.co.za",
    imagePrompt: "Fitness infographic contrasting '12g' vs '30-40g PROTEIN' in large bold text. Dark gradient background with green highlights. Modern minimalist design. Include 'fitsorted.co.za' watermark. Instagram carousel style.",
  },
  {
    title: 'BRAAI PROTEIN',
    text: "Good news: a braai is actually a solid protein meal. 200g steak = 50g protein. 2 boerewors = 38g. Chicken drumstick = 28g. The problem isn't the meat — it's the 6 beers and 3 rolls alongside it.\n\nLog your braai on FitSorted → fitsorted.co.za",
    imagePrompt: "Fitness infographic showing braai protein breakdown: '50g' '38g' '28g' in bold typography on dark background with green accents. South African theme. Modern clean design. Include 'fitsorted.co.za' watermark.",
  },
  {
    title: 'MUSCLE LOSS',
    text: "After 30, you lose 3-8% muscle mass per decade if you don't actively fight it. The two weapons: resistance training + adequate protein. You can't out-train a low-protein diet.\n\nTrack your daily protein intake → fitsorted.co.za",
    imagePrompt: "Fitness infographic showing '3-8% MUSCLE LOSS PER DECADE' in large bold text on dark gradient background with green accent. Modern minimalist design, no stock photos. Include 'fitsorted.co.za' watermark.",
  },
  {
    title: 'PROTEIN TIMING',
    text: "You don't need protein every 2 hours (bro science). But spreading it across 3-4 meals (30-40g each) beats having 10g at breakfast and 80g at dinner. Your body can only use so much at once.\n\nFitSorted breaks down your macros per meal → fitsorted.co.za",
    imagePrompt: "Fitness infographic showing meal distribution '3-4 MEALS' and '30-40g EACH' in bold typography. Dark background with green highlights. Clean modern design. Include 'fitsorted.co.za' watermark. Instagram style.",
  },
  {
    title: 'SA PROTEIN CHALLENGE',
    text: "7-day protein challenge: hit your target (bodyweight in kg × 2 = grams of protein) every day for a week. Track it on FitSorted. Notice how much better you feel, sleep, and recover.\n\nStart tracking on WhatsApp → +27690684940",
    imagePrompt: "Fitness infographic showing '7-DAY CHALLENGE' and protein formula 'kg × 2 = g PROTEIN' in large bold text. Dark gradient background with green accent color. Modern clean design. Include 'fitsorted.co.za' watermark.",
  },
];

// Generate image using Imagen API
async function generateImage(prompt, filename) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      instances: [{
        prompt: prompt
      }]
    });

    const opts = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/imagen-4.0-generate-001:predict?key=${GEMINI_API_KEY}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          
          // Extract image data from predictions
          let imageData = null;
          if (json.predictions && json.predictions[0] && json.predictions[0].bytesBase64Encoded) {
            imageData = json.predictions[0].bytesBase64Encoded;
          }

          if (imageData) {
            const buffer = Buffer.from(imageData, 'base64');
            const filepath = path.join(OUTPUT_DIR, filename);
            fs.writeFileSync(filepath, buffer);
            console.log(`  ✅ Generated: ${filename}`);
            resolve(filepath);
          } else {
            reject(new Error('No image data in response: ' + JSON.stringify(json).slice(0, 200)));
          }
        } catch (err) {
          reject(new Error('Parse error: ' + err.message + ' | ' + data.slice(0, 200)));
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
  console.log('🚀 FitSorted Weekly Content Generator\n');

  // First, let's generate all images
  console.log('📸 Generating images...\n');

  const schedule = [];

  // Generate calorie posts (Mon-Sun at 10:00 AM SAST)
  for (let i = 0; i < 7; i++) {
    const post = caloriePosts[i];
    const day = 17 + i; // March 17-23
    const date = `2026-03-${day.toString().padStart(2, '0')}`;
    const time = '10:00:00+02:00';
    const timestamp = `${date}T${time}`;
    const filename = `calorie-${i + 1}-${post.title.toLowerCase().replace(/\s+/g, '-')}.png`;

    console.log(`📝 Calorie Post ${i + 1}: ${post.title}`);
    
    try {
      const imagePath = await generateImage(post.imagePrompt, filename);
      schedule.push({
        type: 'calorie',
        index: i + 1,
        title: post.title,
        text: post.text,
        imagePath,
        timestamp,
        date,
        time: '10:00 AM SAST',
      });
    } catch (err) {
      console.error(`  ❌ Failed: ${err.message}`);
    }

    // Rate limit delay
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Generate protein posts (Mon-Sun at 6:00 PM SAST)
  for (let i = 0; i < 7; i++) {
    const post = proteinPosts[i];
    const day = 17 + i; // March 17-23
    const date = `2026-03-${day.toString().padStart(2, '0')}`;
    const time = '18:00:00+02:00';
    const timestamp = `${date}T${time}`;
    const filename = `protein-${i + 1}-${post.title.toLowerCase().replace(/\s+/g, '-')}.png`;

    console.log(`📝 Protein Post ${i + 1}: ${post.title}`);
    
    try {
      const imagePath = await generateImage(post.imagePrompt, filename);
      schedule.push({
        type: 'protein',
        index: i + 1,
        title: post.title,
        text: post.text,
        imagePath,
        timestamp,
        date,
        time: '6:00 PM SAST',
      });
    } catch (err) {
      console.error(`  ❌ Failed: ${err.message}`);
    }

    // Rate limit delay
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Save schedule manifest
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'schedule-manifest.json'),
    JSON.stringify(schedule, null, 2)
  );

  console.log('\n✅ Image generation complete!');
  console.log(`\n📋 Generated ${schedule.length} posts`);
  console.log(`📁 Output: ${OUTPUT_DIR}`);
  console.log('\n⏭️  Next: Schedule posts via Postiz (once integration ID is found)');
})();
