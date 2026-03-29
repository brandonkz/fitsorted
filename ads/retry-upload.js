const { execSync } = require('child_process');
const path = require('path');
const DIR = __dirname;
const POSTIZ_KEY = 'f106e11ea7991bcee68bb6e60e54e6bcf041b8a3a332ab8b88b70c43bc4c7edf';
const IG_ID = "cmmkap1k000chqn0ygg2aihz1";
const TT_ID = "cmmlw6wkv04yyqn0yt0mxv928";

const foods = [
  { name: 'coke-vs-coke-zero', title: 'Coke vs Coke Zero', cal: '140 vs 0', emoji: '🥤', fact: 'Same taste, zero guilt' },
  { name: 'steers-wacky-wednesday', title: 'Steers Wacky Wednesday', cal: '680', emoji: '🍔', fact: 'A SA classic deal' },
  { name: 'white-bread-vs-whole-wheat', title: 'White Bread vs Whole Wheat', cal: '160 vs 140', emoji: '🍞', fact: 'Whole wheat wins on fibre' },
  { name: 'braai-plate-full', title: 'Full Braai Plate', cal: '1200', emoji: '🔥', fact: 'Worth every calorie' },
  { name: 'kfc-streetwise-2', title: 'KFC Streetwise 2', cal: '740', emoji: '🍗', fact: 'Budget-friendly protein' },
  { name: 'pasta-bolognese', title: 'Pasta Bolognese', cal: '550', emoji: '🍝', fact: 'Comfort food classic' },
  { name: 'mcflurry-vs-frozen-yoghurt', title: 'McFlurry vs Frozen Yoghurt', cal: '510 vs 180', emoji: '🍦', fact: 'The swap that saves 330 cal' },
];

const drinks = [
  { name: 'windhoek-lager', title: 'Windhoek Lager (440ml)', cal: '160', emoji: '🍺', fact: 'Brewed to Reinheitsgebot' },
  { name: 'jagerbomb', title: 'Jägerbomb', cal: '210', emoji: '💣', fact: 'Energy + alcohol = sneaky calories' },
  { name: 'craft-ipa', title: 'Craft IPA (340ml)', cal: '210', emoji: '🍻', fact: 'Hops come at a cost' },
  { name: 'savanna-light', title: 'Savanna Light (330ml)', cal: '105', emoji: '🍏', fact: 'Lightest cider option' },
  { name: 'cosmopolitan', title: 'Cosmopolitan', cal: '146', emoji: '🍸', fact: 'Not as light as it looks' },
  { name: 'gin-and-tonic', title: 'Gin & Tonic', cal: '120', emoji: '🫧', fact: 'Classic low-cal mixer' },
  { name: 'brandy-and-coke', title: 'Brandy & Coke', cal: '210', emoji: '🥃', fact: 'SA favourite, not so light' },
];

const cheatSheets = [
  { name: 'high-protein-snacks', title: 'High Protein Snacks Under 200 Cal' },
  { name: 'high-fibre-foods', title: 'High Fibre Foods SA' },
];

function foodCaption(f) {
  return `${f.emoji} ${f.title} — ${f.cal} calories\\n\\nDid you know? ${f.fact}\\n\\nTag someone who needs to see this! 👇\\n\\n#FitSorted #CalorieCounting #SouthAfrica #HealthyEating #Nutrition`;
}
function drinkCaption(d) {
  return `${d.emoji} ${d.title} — ${d.cal} calories\\n\\nDid you know? ${d.fact}\\n\\nTag your drinking buddy! 🍻\\n\\n#FitSorted #CalorieCounting #Drinks #SouthAfrica #HealthyChoices`;
}
function cheatSheetCaption(cs) {
  return `📋 ${cs.title}\\n\\nSave this for later! 🔖\\n\\n#FitSorted #CheatSheet #Nutrition #SouthAfrica #HealthyEating`;
}

(async () => {
  const env = { ...process.env, POSTIZ_API_KEY: POSTIZ_KEY };
  const allItems = [...foods, ...drinks, ...cheatSheets];
  
  console.log('📤 Uploading to Postiz...');
  const uploads = {};
  for (const item of allItems) {
    const pngPath = path.join(DIR, `weekly-${item.name}.png`);
    try {
      const out = execSync(`postiz upload "${pngPath}" 2>&1`, { env }).toString();
      const match = out.match(/"path":\s*"([^"]+)"/);
      if (match) {
        uploads[item.name] = match[1];
        console.log(`✅ ${item.name} → ${match[1]}`);
      }
    } catch(e) { console.error(`❌ Upload failed: ${item.name} — ${e.message.slice(0,100)}`); }
    await new Promise(r => setTimeout(r, 3000));
  }

  // Schedule for next Monday (Mar 16 is Monday, so schedule for Mar 23)
  const monday = new Date('2026-03-23');
  console.log(`\n📅 Scheduling for week of ${monday.toISOString().slice(0,10)}...`);

  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const S_POST = '{"post_type":"post"}';
  const S_TT = '{"privacy_level":"PUBLIC_TO_EVERYONE","duet":true,"stitch":true,"comment":true,"autoAddMusic":"no","brand_content_toggle":false,"brand_organic_toggle":false,"content_posting_method":"DIRECT_POST"}';

  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateStr = date.toISOString().slice(0,10);
    const food = foods[i];
    const drink = drinks[i];

    if (uploads[food.name]) {
      const cap = foodCaption(food);
      try {
        execSync(`postiz posts:create -c "${cap}" -m "${uploads[food.name]}" -s "${dateStr}T08:00:00Z" --settings '${S_POST}' -i "${IG_ID}" 2>&1`, { env });
        console.log(`✅ ${days[i]} 10AM IG: ${food.name}`);
      } catch(e) { console.error(`❌ ${days[i]} IG food: ${e.message.slice(0,100)}`); }
      await new Promise(r => setTimeout(r, 8000));

      try {
        execSync(`postiz posts:create -c "${cap}" -m "${uploads[food.name]}" -s "${dateStr}T08:30:00Z" --settings '${S_TT}' -i "${TT_ID}" 2>&1`, { env });
        console.log(`✅ ${days[i]} 10:30AM TT: ${food.name}`);
      } catch(e) { console.error(`❌ ${days[i]} TT food: ${e.message.slice(0,100)}`); }
      await new Promise(r => setTimeout(r, 8000));
    }

    if (uploads[drink.name]) {
      const cap = drinkCaption(drink);
      try {
        execSync(`postiz posts:create -c "${cap}" -m "${uploads[drink.name]}" -s "${dateStr}T16:00:00Z" --settings '${S_POST}' -i "${IG_ID}" 2>&1`, { env });
        console.log(`✅ ${days[i]} 6PM IG: ${drink.name}`);
      } catch(e) { console.error(`❌ ${days[i]} IG drink: ${e.message.slice(0,100)}`); }
      await new Promise(r => setTimeout(r, 8000));

      try {
        execSync(`postiz posts:create -c "${cap}" -m "${uploads[drink.name]}" -s "${dateStr}T16:30:00Z" --settings '${S_TT}' -i "${TT_ID}" 2>&1`, { env });
        console.log(`✅ ${days[i]} 6:30PM TT: ${drink.name}`);
      } catch(e) { console.error(`❌ ${days[i]} TT drink: ${e.message.slice(0,100)}`); }
      await new Promise(r => setTimeout(r, 8000));
    }
  }

  // Cheat sheets: Wed + Sat
  const cheatDays = [2, 5];
  for (let ci = 0; ci < cheatSheets.length; ci++) {
    const cs = cheatSheets[ci];
    const date = new Date(monday);
    date.setDate(monday.getDate() + cheatDays[ci]);
    const dateStr = date.toISOString().slice(0,10);

    if (uploads[cs.name]) {
      const cap = cheatSheetCaption(cs);
      try {
        execSync(`postiz posts:create -c "${cap}" -m "${uploads[cs.name]}" -s "${dateStr}T11:00:00Z" --settings '${S_POST}' -i "${IG_ID}" 2>&1`, { env });
        console.log(`✅ ${days[cheatDays[ci]]} 1PM IG cheat sheet: ${cs.title}`);
      } catch(e) { console.error(`❌ Cheat sheet IG: ${e.message.slice(0,100)}`); }
      await new Promise(r => setTimeout(r, 8000));

      try {
        execSync(`postiz posts:create -c "${cap}" -m "${uploads[cs.name]}" -s "${dateStr}T11:30:00Z" --settings '${S_TT}' -i "${TT_ID}" 2>&1`, { env });
        console.log(`✅ ${days[cheatDays[ci]]} 1:30PM TT cheat sheet: ${cs.title}`);
      } catch(e) { console.error(`❌ Cheat sheet TT: ${e.message.slice(0,100)}`); }
      await new Promise(r => setTimeout(r, 8000));
    }
  }

  console.log('\n🎉 Upload & scheduling complete!');
})();
