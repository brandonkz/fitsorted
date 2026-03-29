const fs = require('fs');
const { execSync } = require('child_process');

const users = JSON.parse(fs.readFileSync('/Users/brandonkatz/.openclaw/workspace/fitsorted/users.json', 'utf8'));
const SHEET_ID = '1RIOOA4F425JPJXq5MiQ_qoqfh1NiEQAifT0zGYE0yfk';
const today = '2026-03-17';

let rows = [];

Object.entries(users).forEach(([phone, user]) => {
  if (user.log && user.log[today]) {
    user.log[today].forEach(entry => {
      const escapedFood = (entry.food || '').replace(/"/g, '').replace(/'/g, '').replace(/\|/g, '');
      const source = entry.isAlcohol ? 'Alcohol' : (entry.food.includes('(manual)') ? 'Manual' : 'AI');
      rows.push(`${entry.time}|${user.phone || phone}|${user.id || phone}|${escapedFood}|${entry.calories}|${entry.protein||0}|${entry.carbs||0}|${entry.fat||0}|${entry.fibre||0}|${source}`);
    });
  }
});

console.log(`Found ${rows.length} entries for ${today}`);

// Batch append all at once
try {
  const allRows = rows.join(',');
  execSync(`gog sheets append ${SHEET_ID} "Sheet1!A:J" "${allRows}" --account alphaxasset@gmail.com`, {
    timeout: 60000,
    stdio: 'pipe'
  });
  console.log(`✅ Successfully appended ${rows.length} rows to Google Sheet`);
} catch (e) {
  console.error('❌ Batch append failed:', e.message);
  console.log('Trying row-by-row with shorter timeout...');
  
  let succeeded = 0;
  rows.forEach((row, i) => {
    try {
      execSync(`gog sheets append ${SHEET_ID} "Sheet1!A:J" "${row}" --account alphaxasset@gmail.com`, {
        timeout: 3000,
        stdio: 'ignore'
      });
      succeeded++;
    } catch (e) {
      // Silent fail
    }
  });
  console.log(`✅ ${succeeded}/${rows.length} rows appended`);
}
