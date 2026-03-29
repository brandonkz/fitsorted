/**
 * FitSorted Daily Stories Generator
 * 
 * Generates 2 Instagram/TikTok Stories per day:
 * 1. "Guess the Calories" poll (morning) - 9:16 format
 * 2. "WhatsApp Bot Demo" screen recording style (afternoon) - 9:16 format
 * 
 * Posts via Postiz to Instagram Stories + TikTok
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const POSTIZ_KEY = process.env.POSTIZ_API_KEY || 'f106e11ea7991bcee68bb6e60e54e6bcf041b8a3a332ab8b88b70c43bc4c7edf';
const IG_ID = "cmmkap1k000chqn0ygg2aihz1";
const DIR = __dirname;

// ══════════════════════════════════════
// SA FOOD QUIZ BANK
// ══════════════════════════════════════
const QUIZ_ITEMS = [
  { food: "KFC Streetwise 2", cal: 540, options: ["340 cal", "540 cal", "780 cal", "920 cal"], answer: 1, emoji: "🍗" },
  { food: "Woolworths Chicken Mayo Sandwich", cal: 420, options: ["280 cal", "420 cal", "560 cal", "650 cal"], answer: 1, emoji: "🥪" },
  { food: "Nando's Quarter Chicken & Chips", cal: 780, options: ["480 cal", "620 cal", "780 cal", "950 cal"], answer: 2, emoji: "🔥" },
  { food: "Steers Wacky Wednesday Burger", cal: 650, options: ["450 cal", "650 cal", "820 cal", "1050 cal"], answer: 1, emoji: "🍔" },
  { food: "Two Boerewors Rolls (braai)", cal: 820, options: ["520 cal", "680 cal", "820 cal", "1100 cal"], answer: 2, emoji: "🥖" },
  { food: "Spur Burger & Chips", cal: 1050, options: ["650 cal", "850 cal", "1050 cal", "1350 cal"], answer: 2, emoji: "🍔" },
  { food: "Wimpy Cheese Burger", cal: 580, options: ["380 cal", "580 cal", "740 cal", "900 cal"], answer: 1, emoji: "🧀" },
  { food: "McDonald's Big Mac SA", cal: 560, options: ["360 cal", "560 cal", "720 cal", "890 cal"], answer: 1, emoji: "🍔" },
  { food: "Bunny Chow (quarter)", cal: 680, options: ["420 cal", "680 cal", "890 cal", "1100 cal"], answer: 1, emoji: "🍛" },
  { food: "Gatsby (half)", cal: 1200, options: ["600 cal", "900 cal", "1200 cal", "1600 cal"], answer: 2, emoji: "🥖" },
  { food: "Vetkoek with Mince", cal: 650, options: ["350 cal", "500 cal", "650 cal", "850 cal"], answer: 2, emoji: "🫓" },
  { food: "Fishaways 2-Piece & Chips", cal: 720, options: ["480 cal", "720 cal", "920 cal", "1150 cal"], answer: 1, emoji: "🐟" },
  { food: "Pap & Wors", cal: 580, options: ["380 cal", "580 cal", "750 cal", "920 cal"], answer: 1, emoji: "🌽" },
  { food: "Roman's Pizza Slice (pepperoni)", cal: 340, options: ["220 cal", "340 cal", "460 cal", "580 cal"], answer: 1, emoji: "🍕" },
  { food: "Woolworths Ready Meal (butter chicken)", cal: 520, options: ["320 cal", "520 cal", "680 cal", "850 cal"], answer: 1, emoji: "🍲" },
  { food: "Kauai Superfoods Bowl", cal: 450, options: ["250 cal", "450 cal", "620 cal", "780 cal"], answer: 1, emoji: "🥗" },
  { food: "Vida e Caffè Large Latte", cal: 220, options: ["80 cal", "150 cal", "220 cal", "310 cal"], answer: 2, emoji: "☕" },
  { food: "Carling Black Label 440ml", cal: 175, options: ["95 cal", "175 cal", "250 cal", "340 cal"], answer: 1, emoji: "🍺" },
  { food: "Savanna Dry 330ml", cal: 180, options: ["110 cal", "180 cal", "260 cal", "350 cal"], answer: 1, emoji: "🍏" },
  { food: "Ouma Rusks (2 slices)", cal: 200, options: ["100 cal", "200 cal", "300 cal", "420 cal"], answer: 1, emoji: "🍪" },
  { food: "Biltong 50g", cal: 140, options: ["80 cal", "140 cal", "220 cal", "300 cal"], answer: 1, emoji: "🥩" },
  { food: "Droëwors 50g", cal: 230, options: ["130 cal", "230 cal", "340 cal", "450 cal"], answer: 1, emoji: "🥩" },
];

// Track used items
const USED_FILE = path.join(DIR, 'stories-used.json');
function getUsed() {
  try { return JSON.parse(fs.readFileSync(USED_FILE, 'utf8')); } catch { return []; }
}
function saveUsed(used) {
  fs.writeFileSync(USED_FILE, JSON.stringify(used, null, 2));
}

// Pick random unused item
function pickQuiz() {
  const used = getUsed();
  const available = QUIZ_ITEMS.filter((_, i) => !used.includes(i));
  if (available.length === 0) {
    // Reset if all used
    saveUsed([]);
    return { item: QUIZ_ITEMS[Math.floor(Math.random() * QUIZ_ITEMS.length)], index: 0 };
  }
  const pick = available[Math.floor(Math.random() * available.length)];
  const index = QUIZ_ITEMS.indexOf(pick);
  used.push(index);
  saveUsed(used);
  return { item: pick, index };
}

// ══════════════════════════════════════
// STORY SLIDE GENERATORS (HTML → PNG)
// ══════════════════════════════════════

function generateQuizStoryHTML(quiz) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1080px; height: 1920px; font-family: 'Inter', sans-serif; overflow: hidden; }
  .story {
    width: 1080px; height: 1920px; background: linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    display: flex; flex-direction: column; justify-content: center; align-items: center;
    padding: 60px; text-align: center; position: relative;
  }
  .emoji { font-size: 120px; margin-bottom: 30px; }
  .question-tag {
    background: #e94560; color: #fff; font-size: 24px; font-weight: 800;
    padding: 12px 32px; border-radius: 30px; text-transform: uppercase;
    letter-spacing: 3px; margin-bottom: 40px;
  }
  .food-name {
    color: #fff; font-size: 56px; font-weight: 900; line-height: 1.2;
    margin-bottom: 50px; max-width: 900px;
  }
  .options { display: flex; flex-direction: column; gap: 20px; width: 100%; max-width: 800px; }
  .option {
    background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.2);
    border-radius: 16px; padding: 24px 36px; color: #fff;
    font-size: 32px; font-weight: 700; text-align: center;
    transition: all 0.3s;
  }
  .option.correct {
    background: rgba(0, 200, 83, 0.3); border-color: #00c853;
  }
  .brand {
    position: absolute; bottom: 60px; color: rgba(255,255,255,0.4);
    font-size: 22px; font-weight: 600;
  }
  .cta {
    position: absolute; bottom: 120px; color: #e94560;
    font-size: 26px; font-weight: 700;
  }
</style>
</head>
<body>
<div class="story">
  <div class="question-tag">🤔 Guess the Calories</div>
  <div class="emoji">${quiz.emoji}</div>
  <div class="food-name">${quiz.food}</div>
  <div class="options">
    ${quiz.options.map((opt, i) => `<div class="option${i === quiz.answer ? ' correct' : ''}">${String.fromCharCode(65+i)}. ${opt}</div>`).join('\n    ')}
  </div>
  <div class="cta">WhatsApp us to track your calories →</div>
  <div class="brand">@fitsorted.co.za</div>
</div>
</body>
</html>`;
}

function generateBotDemoStoryHTML(food, result) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1080px; height: 1920px; font-family: 'Inter', sans-serif; overflow: hidden; }
  .story {
    width: 1080px; height: 1920px;
    background: linear-gradient(180deg, #075E54 0%, #128C7E 30%, #25D366 100%);
    display: flex; flex-direction: column; align-items: center;
    padding: 60px; position: relative;
  }
  .header-tag {
    background: rgba(0,0,0,0.3); color: #fff; font-size: 22px; font-weight: 800;
    padding: 12px 28px; border-radius: 30px; text-transform: uppercase;
    letter-spacing: 2px; margin-top: 40px; margin-bottom: 50px;
  }
  .phone-frame {
    background: #ECE5DD; border-radius: 30px; width: 860px;
    padding: 30px; flex: 1; max-height: 1200px;
    display: flex; flex-direction: column; justify-content: center; gap: 20px;
  }
  .msg-out {
    background: #DCF8C6; border-radius: 16px; padding: 20px 28px;
    max-width: 70%; align-self: flex-end;
    font-size: 30px; color: #000; font-weight: 500;
  }
  .msg-in {
    background: #fff; border-radius: 16px; padding: 24px 28px;
    max-width: 85%; align-self: flex-start;
    font-size: 26px; color: #000; line-height: 1.5;
  }
  .msg-in .food-title { font-weight: 800; font-size: 30px; margin-bottom: 8px; }
  .msg-in .macro-row { display: flex; justify-content: space-between; margin-top: 6px; }
  .msg-in .macro { font-weight: 600; }
  .msg-in .cal-big { font-size: 48px; font-weight: 900; color: #075E54; margin: 12px 0; }
  .msg-in .remaining { color: #666; font-size: 22px; margin-top: 8px; }
  .bottom-cta {
    color: #fff; font-size: 28px; font-weight: 800; margin-top: 40px;
    text-align: center;
  }
  .bottom-cta .number { font-size: 34px; color: #DCF8C6; margin-top: 8px; }
  .brand {
    position: absolute; bottom: 50px; color: rgba(255,255,255,0.5);
    font-size: 20px; font-weight: 600;
  }
</style>
</head>
<body>
<div class="story">
  <div class="header-tag">📱 WhatsApp Calorie Tracker</div>
  <div class="phone-frame">
    <div class="msg-out">${food}</div>
    <div class="msg-in">
      <div class="food-title">${result.title}</div>
      <div class="cal-big">${result.calories} cal</div>
      <div class="macro-row">
        <span class="macro">🥩 ${result.protein}g protein</span>
        <span class="macro">🍞 ${result.carbs}g carbs</span>
        <span class="macro">🧈 ${result.fat}g fat</span>
      </div>
      <div class="remaining">📊 ${result.remaining} cal remaining today</div>
    </div>
  </div>
  <div class="bottom-cta">
    Try it free →
    <div class="number">fitsorted.co.za</div>
  </div>
  <div class="brand">@fitsorted.co.za</div>
</div>
</body>
</html>`;
}

// ══════════════════════════════════════
// DEMO SCENARIOS
// ══════════════════════════════════════
const DEMO_SCENARIOS = [
  { input: "2 eggs on toast", result: { title: "2 Eggs on Toast", calories: 340, protein: 18, carbs: 28, fat: 16, remaining: 1660 }},
  { input: "nandos quarter chicken", result: { title: "Nando's Quarter Chicken & Chips", calories: 780, protein: 42, carbs: 65, fat: 28, remaining: 1220 }},
  { input: "woolies chicken mayo sandwich", result: { title: "Woolworths Chicken Mayo Sandwich", calories: 420, protein: 22, carbs: 38, fat: 18, remaining: 1580 }},
  { input: "kfc streetwise 2", result: { title: "KFC Streetwise 2", calories: 540, protein: 28, carbs: 45, fat: 22, remaining: 1460 }},
  { input: "biltong 50g", result: { title: "Biltong (50g)", calories: 140, protein: 28, carbs: 1, fat: 3, remaining: 1860 }},
  { input: "steers wacky wednesday", result: { title: "Steers Wacky Wednesday Burger", calories: 650, protein: 32, carbs: 48, fat: 30, remaining: 1350 }},
  { input: "protein shake with banana", result: { title: "Protein Shake + Banana", calories: 320, protein: 35, carbs: 38, fat: 4, remaining: 1680 }},
  { input: "large cappuccino woolworths", result: { title: "Woolworths Large Cappuccino", calories: 180, protein: 8, carbs: 14, fat: 9, remaining: 1820 }},
  { input: "braai boerewors roll", result: { title: "Boerewors Roll (Braai)", calories: 410, protein: 18, carbs: 32, fat: 24, remaining: 1590 }},
  { input: "gatsby half", result: { title: "Gatsby (Half)", calories: 1200, protein: 35, carbs: 120, fat: 55, remaining: 800 }},
];

// ══════════════════════════════════════
// MAIN
// ══════════════════════════════════════

async function main() {
  const today = new Date().toISOString().split('T')[0];
  
  // 1. Pick quiz item
  const { item: quiz } = pickQuiz();
  console.log(`📝 Quiz: ${quiz.food} (${quiz.cal} cal)`);
  
  // 2. Pick demo scenario
  const demo = DEMO_SCENARIOS[Math.floor(Math.random() * DEMO_SCENARIOS.length)];
  console.log(`📱 Demo: "${demo.input}"`);
  
  // 3. Generate HTML
  const quizHTML = generateQuizStoryHTML(quiz);
  const demoHTML = generateBotDemoStoryHTML(demo.input, demo.result);
  
  const quizFile = path.join(DIR, `story-quiz-${today}.html`);
  const demoFile = path.join(DIR, `story-demo-${today}.html`);
  
  fs.writeFileSync(quizFile, quizHTML);
  fs.writeFileSync(demoFile, demoHTML);
  
  // 4. Render to PNG using Playwright
  const quizPNG = path.join(DIR, `story-quiz-${today}.png`);
  const demoPNG = path.join(DIR, `story-demo-${today}.png`);
  
  try {
    execSync(`node -e "
      const { chromium } = require('playwright');
      (async () => {
        const b = await chromium.launch();
        const ctx = await b.newContext({ viewport: { width: 1080, height: 1920 } });
        
        let p = await ctx.newPage();
        await p.goto('file://${quizFile}', { waitUntil: 'networkidle' });
        await p.waitForTimeout(1000);
        await p.screenshot({ path: '${quizPNG}' });
        await p.close();
        
        p = await ctx.newPage();
        await p.goto('file://${demoFile}', { waitUntil: 'networkidle' });
        await p.waitForTimeout(1000);
        await p.screenshot({ path: '${demoPNG}' });
        await p.close();
        
        await b.close();
      })();
    "`, { stdio: 'pipe', timeout: 30000 });
    
    console.log(`✅ Quiz story: ${quizPNG}`);
    console.log(`✅ Demo story: ${demoPNG}`);
  } catch (e) {
    console.error(`❌ Render failed: ${e.message}`);
    process.exit(1);
  }
  
  // Output paths for the cron job to pick up
  console.log(JSON.stringify({
    date: today,
    quiz: { food: quiz.food, calories: quiz.cal, image: quizPNG },
    demo: { input: demo.input, image: demoPNG },
    caption_quiz: `🤔 Guess the calories in ${quiz.food}!\n\nDrop your answer below 👇\n\nTrack calories instantly via WhatsApp → fitsorted.co.za\n\n#fitsorted #caloriecounting #southafrica #fitness #nutrition`,
    caption_demo: `Just text "${demo.input}" and get instant macros 📱\n\n${demo.result.calories} cal | ${demo.result.protein}g protein | ${demo.result.carbs}g carbs\n\nTry it → fitsorted.co.za\n\n#fitsorted #calorietracker #whatsapp #mealtracking #southafrica`,
  }));
}

main().catch(console.error);
