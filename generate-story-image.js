#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || require('dotenv').config() && process.env.OPENAI_API_KEY;
const CONTENT_CALENDAR = require('./content-calendar.json');
const OUTPUT_DIR = path.join(__dirname, 'story-images');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function generateImage(prompt, dayNumber) {
  try {
    console.log(`\n🎨 Generating image for Day ${dayNumber}...`);
    console.log(`📝 Prompt: ${prompt.substring(0, 100)}...`);
    
    const response = await axios.post(
      'https://api.openai.com/v1/images/generations',
      {
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: "1024x1792", // 9:16 aspect ratio for Instagram Stories
        quality: "standard"
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );
    
    const imageUrl = response.data.data[0].url;
    console.log(`✅ Image generated: ${imageUrl}`);
    
    // Download image
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const filename = `day-${dayNumber.toString().padStart(2, '0')}.png`;
    const filepath = path.join(OUTPUT_DIR, filename);
    
    fs.writeFileSync(filepath, imageResponse.data);
    console.log(`💾 Saved to: ${filepath}`);
    
    return filepath;
    
  } catch (error) {
    console.error(`❌ Error generating Day ${dayNumber}: ${error.message}`);
    if (error.response?.data) {
      console.error('API Error:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

function buildPrompt(day) {
  const baseStyle = `Modern mobile app screenshot, WhatsApp interface style, 
clean minimalist design, dark background (#0b0f0c), bright green accent (#2eea7a), 
professional typography, 9:16 vertical format for Instagram Story`;
  
  // Different prompt styles based on theme
  const themePrompts = {
    'motivation': `${baseStyle}. Motivational fitness quote overlay, bold text: "${day.story_copy}"`,
    'feature': `${baseStyle}. WhatsApp chat showing: "${day.story_copy}", message bubble with calorie count`,
    'demo': `${baseStyle}. Screen capture of food logging, user typing "${day.story_copy}", instant calorie response`,
    'social': `${baseStyle}. App interface with: "${day.story_copy}", friendly conversational tone`,
    'results': `${baseStyle}. Progress stats screen, "${day.story_copy}", weight loss visualization`
  };
  
  // Determine theme from story copy
  const lower = day.story_copy.toLowerCase();
  let theme = 'feature'; // default
  
  if (lower.includes('free') || lower.includes('forever')) theme = 'motivation';
  if (lower.includes('log') || lower.includes('example')) theme = 'demo';
  if (lower.includes('nando') || lower.includes('woolies') || lower.includes('database')) theme = 'feature';
  if (lower.includes('yesterday') || lower.includes('recap')) theme = 'results';
  
  return themePrompts[theme] || baseStyle + `. ${day.story_copy}`;
}

async function generateAllImages() {
  console.log('🎨 FitSorted Story Image Generator');
  console.log('===================================\n');
  console.log(`📅 Generating ${CONTENT_CALENDAR.length} images...\n`);
  
  const results = [];
  
  for (let i = 0; i < CONTENT_CALENDAR.length; i++) {
    const day = CONTENT_CALENDAR[i];
    const prompt = buildPrompt(day);
    
    try {
      const filepath = await generateImage(prompt, day.day);
      results.push({
        day: day.day,
        success: true,
        filepath,
        theme: day.theme
      });
      
      // Rate limit: wait 3 seconds between requests
      if (i < CONTENT_CALENDAR.length - 1) {
        console.log('⏳ Waiting 3s (rate limit)...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
    } catch (error) {
      results.push({
        day: day.day,
        success: false,
        error: error.message
      });
    }
  }
  
  // Summary
  console.log('\n\n📊 Summary');
  console.log('==========');
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`✅ Successful: ${successful}/${CONTENT_CALENDAR.length}`);
  console.log(`❌ Failed: ${failed}/${CONTENT_CALENDAR.length}`);
  
  if (failed > 0) {
    console.log('\nFailed days:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  Day ${r.day}: ${r.error}`);
    });
  }
  
  console.log(`\n📁 Images saved to: ${OUTPUT_DIR}`);
  console.log('\nNext steps:');
  console.log('1. Review images in story-images/ folder');
  console.log('2. Transfer to phone (AirDrop, iCloud, etc.)');
  console.log('3. Post to Instagram Stories');
  console.log('4. Or set up auto-posting with Postiz');
}

// CLI interface
const args = process.argv.slice(2);

if (args.includes('--all')) {
  generateAllImages();
} else if (args.includes('--day')) {
  const dayNum = parseInt(args[args.indexOf('--day') + 1]);
  if (isNaN(dayNum) || dayNum < 1 || dayNum > CONTENT_CALENDAR.length) {
    console.error(`❌ Invalid day number. Must be 1-${CONTENT_CALENDAR.length}`);
    process.exit(1);
  }
  
  const day = CONTENT_CALENDAR[dayNum - 1];
  const prompt = buildPrompt(day);
  generateImage(prompt, day.day);
  
} else {
  console.log('FitSorted Story Image Generator\n');
  console.log('Usage:');
  console.log('  node generate-story-image.js --all          Generate all 28 images');
  console.log('  node generate-story-image.js --day 1        Generate specific day');
  console.log('\nExamples:');
  console.log('  node generate-story-image.js --all');
  console.log('  node generate-story-image.js --day 5');
}
