const fs = require('fs');
const { execSync } = require('child_process');

const users = JSON.parse(fs.readFileSync('/Users/brandonkatz/.openclaw/workspace/fitsorted/users.json', 'utf8'));
const SHEET_ID = '1RIOOA4F425JPJXq5MiQ_qoqfh1NiEQAifT0zGYE0yfk';
const today = '2026-03-17';

let entries = [];

Object.entries(users).forEach(([phone, user]) => {
  if (user.log && user.log[today]) {
    user.log[today].forEach(entry => {
      entries.push({
        timestamp: entry.time || new Date().toISOString(),
        phone: user.phone || phone,
        userId: user.id || phone,
        food: entry.food,
        calories: entry.calories,
        protein: entry.protein || 0,
        carbs: entry.carbs || 0,
        fat: entry.fat || 0,
        fibre: entry.fibre || 0,
        source: entry.isAlcohol ? 'Alcohol' : (entry.food.includes('(manual)') ? 'Manual' : 'AI')
      });
    });
  }
});

// Sort by timestamp
entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

console.log(`Found ${entries.length} entries for ${today}`);

let succeeded = 0;
let failed = 0;

entries.forEach((entry, i) => {
  try {
    const escapedFood = entry.food.replace(/"/g, '\\"').replace(/'/g, "\\'");
    const row = `${entry.timestamp}|${entry.phone}|${entry.userId}|${escapedFood}|${entry.calories}|${entry.protein}|${entry.carbs}|${entry.fat}|${entry.fibre}|${entry.source}`;
    
    execSync(`gog sheets append ${SHEET_ID} "Sheet1!A:J" "${row}" --account alphaxasset@gmail.com`, {
      timeout: 10000,
      stdio: 'ignore'
    });
    succeeded++;
    if ((i + 1) % 10 === 0) {
      console.log(`Progress: ${i + 1}/${entries.length}`);
    }
  } catch (e) {
    console.error(`Failed entry ${i + 1}:`, entry.food.slice(0, 50), e.message);
    failed++;
  }
});

console.log(`\nBackfill complete!`);
console.log(`✅ Succeeded: ${succeeded}`);
console.log(`❌ Failed: ${failed}`);
