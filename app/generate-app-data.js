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

const firstNameCounts = Object.values(users).reduce((acc, user) => {
  const name = (user?.name || 'Member').trim();
  const first = name.split(' ')[0] || 'Member';
  acc[first] = (acc[first] || 0) + 1;
  return acc;
}, {});

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

function calcStreak(dates = []) {
  const set = new Set(dates);
  let streak = 0;
  let day = new Date(dates[dates.length - 1]);
  while (set.has(day.toISOString().slice(0, 10))) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

function anonymizeName(name = 'Member') {
  const parts = name.trim().split(' ');
  const first = parts[0] || 'Member';
  const lastInitial = parts[1] ? parts[1][0] : '';
  if ((firstNameCounts[first] || 0) > 1 && lastInitial) return `${first} ${lastInitial}.`;
  return first;
}

let count = 0;
const leaderboard = [];
for (const [phone, user] of Object.entries(users)) {
  if (!user || user.setup !== true) continue;

  const token = tokenFromPhone(phone);
  const profile = user.profile || {};
  const logSummary = buildLogSummary(user.log || {});

  const out = {
    name: user.name || 'FitSorted Member',
    goal: user.goal || null,
    joinedAt: user.joinedAt || user.joinedDate || null,
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
    logSummary
  };

  if (logSummary.length) {
    const dates = logSummary.map((d) => d.date).sort();
    const totalDaysLogged = logSummary.length;
    const totalLogs = logSummary.reduce((a, d) => a + d.entries.length, 0);
    const last7 = logSummary.slice(-7);
    const avgCalories = Math.round(last7.reduce((a, d) => a + d.totals.calories, 0) / (last7.length || 1));
    const goal = user.goal || 2000;
    const goalAccuracy = totalDaysLogged
      ? logSummary.filter((d) => Math.abs(d.totals.calories - goal) <= goal * 0.1).length / totalDaysLogged
      : 0;

    leaderboard.push({
      token,
      name: anonymizeName(user.name || 'Member'),
      streak: calcStreak(dates),
      totalDaysLogged,
      avgCalories,
      goalAccuracy,
      totalLogs,
      joinedDate: user.joinedAt || user.joinedDate || null,
      target: profile.target || 'maintain'
    });
  }

  fs.writeFileSync(path.join(outDir, `${token}.json`), JSON.stringify(out, null, 2));
  count++;
}

fs.writeFileSync(path.join(outDir, 'leaderboard.json'), JSON.stringify(leaderboard, null, 2));
console.log(`Generated ${count} user data files in ${outDir}`);

try {
  execSync('git add app/data', { cwd: root, stdio: 'inherit' });
  execSync('git commit -m "Update FitSorted app data"', { cwd: root, stdio: 'inherit' });
  execSync('git push', { cwd: root, stdio: 'inherit' });
} catch (err) {
  console.warn('Git commit/push skipped or failed:', err.message);
}
