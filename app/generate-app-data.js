#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const usersPath = path.join(root, 'users.json');
const outDir = path.join(__dirname, 'data');

if (!fs.existsSync(usersPath)) {
  console.error('users.json not found at', usersPath);
  process.exit(1);
}

const users = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function tokenFromPhone(phone) {
  return crypto.createHash('sha256').update(String(phone)).digest('hex').slice(0, 8);
}

function safeNum(v) {
  return typeof v === 'number' && !Number.isNaN(v) ? v : 0;
}

function buildLogSummary(log = {}) {
  const dates = Object.keys(log || {}).sort();
  const summary = dates.map((date) => {
    const entries = (log[date] || []).map((e) => ({
      food: e.food || e.name || 'Food',
      calories: safeNum(e.calories),
      protein: safeNum(e.protein),
      carbs: safeNum(e.carbs),
      fat: safeNum(e.fat),
      fibre: safeNum(e.fibre),
      priceZAR: safeNum(e.priceZAR),
      time: e.time || null
    }));

    const totals = entries.reduce(
      (acc, e) => {
        acc.calories += e.calories;
        acc.protein += e.protein;
        acc.carbs += e.carbs;
        acc.fat += e.fat;
        acc.fibre += e.fibre;
        acc.priceZAR += e.priceZAR;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, priceZAR: 0 }
    );

    return { date, totals, entries };
  });

  return summary;
}

let count = 0;
for (const [phone, user] of Object.entries(users)) {
  if (!user || user.setup !== true) continue;

  const token = tokenFromPhone(phone);
  const profile = user.profile || {};

  const out = {
    name: user.name || 'FitSorted Member',
    goal: user.goal || null,
    profile: {
      age: profile.age ?? null,
      weight: profile.weight ?? null,
      height: profile.height ?? null,
      gender: profile.gender ?? null,
      target: profile.target ?? null,
      foodBudget: profile.foodBudget ?? null
    },
    weights: Array.isArray(user.weights) ? user.weights : [],
    exercise: user.exercise || {},
    logSummary: buildLogSummary(user.log || {})
  };

  fs.writeFileSync(path.join(outDir, `${token}.json`), JSON.stringify(out, null, 2));
  count++;
}

console.log(`Generated ${count} user data files in ${outDir}`);

try {
  execSync('git add app/data', { cwd: root, stdio: 'inherit' });
  execSync('git commit -m "Update FitSorted app data"', { cwd: root, stdio: 'inherit' });
  execSync('git push', { cwd: root, stdio: 'inherit' });
} catch (err) {
  console.warn('Git commit/push skipped or failed:', err.message);
}
