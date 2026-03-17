const fs = require('fs');

const users = JSON.parse(fs.readFileSync('/Users/brandonkatz/.openclaw/workspace/fitsorted/users.json', 'utf8'));

let logs = [];

Object.entries(users).forEach(([phone, user]) => {
  if (user.log) {
    Object.entries(user.log).forEach(([date, entries]) => {
      entries.forEach(entry => {
        const source = entry.food?.includes('(manual)') ? 'Manual' : (entry.food?.includes('(DB)') ? 'DB' : 'AI');
        logs.push({
          timestamp: entry.time || `${date}T12:00:00Z`,
          date: date,
          phone: user.phone?.slice(-4) || phone.slice(-4), // Only last 4 digits for privacy
          userId: user.id?.slice(0, 8) || phone.slice(0, 8), // Truncated for privacy
          food: entry.food || '',
          calories: entry.calories || 0,
          protein: entry.protein || 0,
          carbs: entry.carbs || 0,
          fat: entry.fat || 0,
          fibre: entry.fibre || 0,
          source: source
        });
      });
    });
  }
});

// Sort by timestamp descending
logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

fs.writeFileSync('/Users/brandonkatz/.openclaw/workspace/fitsorted/logs-data.json', JSON.stringify(logs, null, 2));
console.log(`✅ Exported ${logs.length} food log entries to logs-data.json`);
