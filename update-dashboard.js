#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const DIR = __dirname;
const USERS_FILE = path.join(DIR, 'users.json');
const DASHBOARD_FILE = path.join(DIR, 'dashboard.html');

const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
const userData = [];

for (const [phone, u] of Object.entries(users)) {
  if (!u.setup && !u.name) continue;
  if (phone.includes('backup')) continue;
  let totalLogs = 0;
  const foodFreq = {};
  for (const [date, entries] of Object.entries(u.log || {})) {
    if (!Array.isArray(entries)) continue;
    totalLogs += entries.length;
    for (const e of entries) {
      const key = (e.food || '').toLowerCase().slice(0, 40);
      foodFreq[key] = (foodFreq[key] || 0) + 1;
    }
  }
  const topFoods = Object.entries(foodFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([food, count]) => ({ food, count }));
  const logDates = Object.keys(u.log || {}).filter(d => Array.isArray(u.log[d]) && u.log[d].length > 0);
  const daysLogged = logDates.length;
  const lastActive = logDates.sort().pop() || 'never';
  userData.push({
    phone: phone.slice(0, 5) + '***' + phone.slice(-3),
    name: u.name || 'Not set',
    goal: u.goal || '-',
    joined: u.joinedAt ? new Date(u.joinedAt).toLocaleDateString('en-ZA') : 'unknown',
    totalLogs, daysLogged, lastActive, topFoods,
    isPro: u.isPro || false,
    budget: u.profile?.foodBudget || null,
    weight: u.profile?.weight || null,
    target: u.profile?.target || null,
    age: u.profile?.age || null,
    hasLoggedFood: totalLogs > 0,
  });
}
userData.sort((a, b) => b.totalLogs - a.totalLogs);

// Read dashboard.html and replace embedded data
let html = fs.readFileSync(DASHBOARD_FILE, 'utf8');
html = html.replace(/window\.EMBEDDED_DATA = .*?;/, `window.EMBEDDED_DATA = ${JSON.stringify(userData)};`);
fs.writeFileSync(DASHBOARD_FILE, html);

// Git commit and push
try {
  execSync(`cd ${DIR} && git add dashboard.html && git commit -m "Update dashboard data" && git push`, { stdio: 'pipe' });
  console.log(`✅ Dashboard updated: ${userData.length} users`);
} catch (e) {
  console.log('No changes to commit or push failed');
}
