#!/usr/bin/env node

/**
 * Generate FitSorted Promo Video from JSON Data
 * 
 * Usage:
 *   node scripts/generate-video.js --data examples/day1.json --output out/day1.mp4
 */

const { bundle } = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');
const path = require('path');
const fs = require('fs');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    data: null,
    output: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--data' && args[i + 1]) {
      options.data = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      options.output = args[i + 1];
      i++;
    }
  }

  return options;
}

// Validate and load JSON data
function loadData(dataPath) {
  if (!dataPath) {
    console.error('❌ Error: --data argument is required');
    console.log('\nUsage: node scripts/generate-video.js --data examples/day1.json --output out/day1.mp4');
    process.exit(1);
  }

  const absolutePath = path.resolve(process.cwd(), dataPath);
  
  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ Error: Data file not found: ${absolutePath}`);
    process.exit(1);
  }

  try {
    const rawData = fs.readFileSync(absolutePath, 'utf-8');
    const data = JSON.parse(rawData);

    // Validate data structure
    if (!data.meals || !Array.isArray(data.meals)) {
      throw new Error('JSON must contain a "meals" array');
    }

    // Validate each meal
    data.meals.forEach((meal, index) => {
      if (!meal.name || !meal.calories || !meal.time || !meal.img) {
        throw new Error(`Meal at index ${index} is missing required fields (name, calories, time, img)`);
      }
    });

    // Set defaults
    data.title = data.title || "What 2000 calories\nactually looks like";
    data.goalCalories = data.goalCalories || 2000;

    return data;
  } catch (error) {
    console.error(`❌ Error parsing JSON: ${error.message}`);
    process.exit(1);
  }
}

// Main render function
async function generateVideo() {
  const options = parseArgs();
  const data = loadData(options.data);

  const outputPath = options.output 
    ? path.resolve(process.cwd(), options.output)
    : path.resolve(process.cwd(), 'out', 'video.mp4');

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('🎬 FitSorted Video Generator');
  console.log('─────────────────────────────');
  console.log(`📄 Data: ${options.data}`);
  console.log(`📹 Output: ${outputPath}`);
  console.log(`🍽️  Meals: ${data.meals.length}`);
  console.log(`🎯 Goal: ${data.goalCalories} calories`);
  console.log('');

  try {
    // Bundle the Remotion project
    console.log('📦 Bundling project...');
    const bundleLocation = await bundle({
      entryPoint: path.resolve(__dirname, '../src/index.tsx'),
      webpackOverride: (config) => config,
    });

    console.log('✅ Bundle complete');

    // Get composition
    const compositionId = 'FitSortedPromo';
    console.log(`🎨 Loading composition: ${compositionId}`);
    
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: compositionId,
      inputProps: data,
    });

    console.log('✅ Composition loaded');
    console.log(`   Duration: ${composition.durationInFrames} frames (${composition.durationInFrames / composition.fps}s)`);
    console.log(`   FPS: ${composition.fps}`);
    console.log(`   Resolution: ${composition.width}x${composition.height}`);
    console.log('');

    // Render video
    console.log('🎥 Rendering video...');
    console.log('   (This may take a few minutes)');
    console.log('');

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps: data,
      onProgress: ({ progress, renderedFrames, encodedFrames }) => {
        const percentage = (progress * 100).toFixed(1);
        process.stdout.write(`\r   Progress: ${percentage}% (${renderedFrames}/${composition.durationInFrames} frames rendered, ${encodedFrames} encoded)`);
      },
    });

    console.log('\n');
    console.log('✅ Video generated successfully!');
    console.log(`📹 Output: ${outputPath}`);
    
    // Show file size
    const stats = fs.statSync(outputPath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`📊 File size: ${fileSizeMB} MB`);

  } catch (error) {
    console.error('\n❌ Error generating video:', error);
    process.exit(1);
  }
}

// Run the generator
generateVideo().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
