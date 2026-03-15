const fs = require('fs');
const path = require('path');

const botPath = path.join(__dirname, '..', 'bot.js');
const foodsPath = path.join(__dirname, '..', 'foods-database.json');
const extraFoodsPath = path.join(__dirname, '..', 'extra-foods.json');
const outputPath = path.join(__dirname, 'data', 'food-db.json');

function loadOverrides() {
  const src = fs.readFileSync(botPath, 'utf8');
  const match = src.match(/const\s+overrides\s*=\s*{[\s\S]*?};/);
  if (!match) throw new Error('Could not למצוא overrides object in bot.js');
  const code = `${match[0]}\nreturn overrides;`;
  const overrides = new Function(code)();
  return overrides || {};
}

function buildFoodArray() {
  const overrides = loadOverrides();
  const foods = JSON.parse(fs.readFileSync(foodsPath, 'utf8'));
  const extraFoods = JSON.parse(fs.readFileSync(extraFoodsPath, 'utf8'));

  const byName = new Map();

  // Overrides first (priority)
  Object.entries(overrides).forEach(([key, value]) => {
    const item = typeof value === 'number'
      ? { name: key, calories: value, protein: null, carbs: null, fat: null }
      : {
          name: value.food || key,
          calories: value.calories ?? null,
          protein: value.protein ?? null,
          carbs: value.carbs ?? null,
          fat: value.fat ?? null,
        };
    const norm = item.name.trim().toLowerCase();
    byName.set(norm, item);
  });

  Object.entries(foods).forEach(([name, calories]) => {
    const norm = name.trim().toLowerCase();
    if (byName.has(norm)) return;
    byName.set(norm, { name, calories, protein: null, carbs: null, fat: null });
  });

  Object.entries(extraFoods).forEach(([name, calories]) => {
    if (name.startsWith('_meta')) return;
    const norm = name.trim().toLowerCase();
    if (byName.has(norm)) return;
    byName.set(norm, { name, calories, protein: null, carbs: null, fat: null });
  });

  const list = Array.from(byName.values());
  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

const list = buildFoodArray();
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(list, null, 2));
console.log(`✅ Wrote ${list.length} foods to ${outputPath}`);
