const fs = require('fs');
const { google } = require('googleapis');

const users = JSON.parse(fs.readFileSync('/Users/brandonkatz/.openclaw/workspace/fitsorted/users.json', 'utf8'));
const SHEET_ID = '1RIOOA4F425JPJXq5MiQ_qoqfh1NiEQAifT0zGYE0yfk';
const today = '2026-03-17';

let rows = [];

Object.entries(users).forEach(([phone, user]) => {
  if (user.log && user.log[today]) {
    user.log[today].forEach(entry => {
      const source = entry.isAlcohol ? 'Alcohol' : (entry.food.includes('(manual)') ? 'Manual' : 'AI');
      rows.push([
        entry.time || new Date().toISOString(),
        user.phone || phone,
        user.id || phone,
        entry.food || '',
        entry.calories || 0,
        entry.protein || 0,
        entry.carbs || 0,
        entry.fat || 0,
        entry.fibre || 0,
        source
      ]);
    });
  }
});

// Sort by timestamp
rows.sort((a, b) => new Date(a[0]) - new Date(b[0]));

console.log(`Found ${rows.length} entries for ${today}`);

(async () => {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  
  const sheets = google.sheets({ version: 'v4', auth });
  
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Sheet1!A:J',
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: rows,
    },
  });
  
  console.log(`✅ Successfully appended ${rows.length} rows to Google Sheet`);
  console.log(`Updated range: ${response.data.updates.updatedRange}`);
})().catch(err => {
  console.error('❌ Failed:', err.message);
});
