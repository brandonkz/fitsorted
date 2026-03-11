# Safe Food Expansion System

**Built:** March 9, 2026  
**Purpose:** Prevent crashes like the orphaned comma bug while expanding simple food lookup

---

## What Was Broken

**Old script (broken):**
```javascript
// Used regex injection - fragile and dangerous
simpleFoodsContent += `,\n    "${food}": ${calories}`;
```

**The crash:**
```javascript
"mojito": 200, "pina colada": 250,
,   // ← Orphaned comma crashed the bot
"pap": 100,
```

**Problems:**
- ❌ No parsing, just regex text replacement
- ❌ No duplicate detection (could add same food twice)
- ❌ No syntax validation (crashed in production)
- ❌ No backup before changes

---

## What's Fixed

### **1. Proper Parsing** ✅
Parses the `simple = {...}` object into a real data structure:
```javascript
function extractSimpleFoods(botContent) {
  // Finds const simple = {...};
  // Parses each entry: "food": calories
  // Returns { foodName: { name, calories } }
}
```

### **2. Duplicate Detection** ✅
Only adds foods that don't already exist:
```javascript
for (const [food, calories] of Object.entries(PROACTIVE_FOODS)) {
  const key = food.toLowerCase();
  if (!existingFoods[key]) {  // ← Check before adding
    newFoods[key] = { name: food, calories };
  }
}
```

### **3. Syntax Validation** ✅
Validates JavaScript before writing to file:
```javascript
function validateSyntax(code) {
  try {
    new Function(code);  // Test if it's valid JS
    return true;
  } catch (err) {
    console.error(`❌ Syntax validation failed: ${err.message}`);
    return false;
  }
}
```

### **4. Atomic Updates** ✅
Backup → validate → write → restore if broken:
```javascript
// 1. Backup
backupFile(BOT_FILE);  // Creates bot.js.backup

// 2. Build new object
const mergedFoods = { ...existingFoods, ...newFoods };
const newSimpleObj = buildSimpleObject(mergedFoods);

// 3. Validate
if (!validateSyntax(testCode)) {
  console.error("❌ Generated invalid JavaScript - aborting");
  return;  // ← Never writes bad code
}

// 4. Write
fs.writeFileSync(BOT_FILE, updatedContent);
```

---

## How It Works Now

### **Step-by-Step Process:**

1. **Load & Parse**
   - Reads `bot.js`
   - Parses existing simple foods into structured data
   - Counts: "📊 Current simple foods: 432"

2. **Determine Additions**
   - Checks `PROACTIVE_FOODS` list (445 items)
   - Filters out duplicates
   - Result: "📝 Adding 13 new foods..."

3. **Safety Checks**
   - Creates backup: `bot.js.backup`
   - Merges old + new foods
   - Sorts alphabetically for consistency
   - Validates syntax

4. **Atomic Write**
   - Only writes if validation passes
   - Logs additions to `simple-foods-added.log`
   - Reports: "✅ Added 13 foods to simple lookup"

### **Example Run:**
```bash
$ node expand-simple-foods.js

🍽️  Expanding simple foods (safe mode)...

📊 Current simple foods: 432
📝 Adding 13 new foods...
📋 Created backup: bot.js.backup

[2026-03-09T13:08:23] Added 13 foods:
  - lager: 150 cal
  - ale: 180 cal
  - cider: 180 cal
  ...

✅ Added 13 foods to simple lookup
📊 Total simple foods now: 445
🔄 Restart bot with: pm2 restart fitsorted
```

---

## Safety Features

### **1. Backup Protection**
Every run creates `bot.js.backup` before making changes.

**To restore:**
```bash
cp bot.js.backup bot.js
pm2 restart fitsorted
```

### **2. Syntax Validation**
Catches errors BEFORE writing to file:
```javascript
❌ Syntax validation failed: Unexpected token ','
❌ Generated invalid JavaScript - aborting
```

### **3. Duplicate Prevention**
Checks lowercase keys to avoid:
- "chicken": 165
- "Chicken": 165  // ← Won't be added

### **4. Idempotency**
Running multiple times is safe:
- First run: adds 445 foods
- Second run: "✅ No new foods to add"
- No corruption, no duplicates

---

## Automated Daily Runs

**Cron schedule:** 3 AM every day

**Location:** `bot.js` line ~3030:
```javascript
cron.schedule("0 3 * * *", async () => {
  exec('node expand-simple-foods.js && pm2 restart fitsorted');
});
```

**What it does:**
1. Checks for new high-demand foods (3+ failed lookups)
2. Adds proactive foods not yet in simple lookup
3. Updates bot.js
4. Restarts bot
5. Logs to `simple-foods-added.log`

**Safety:** If script fails, bot continues running with old food list (no downtime).

---

## Monitoring

**Check additions:**
```bash
tail -20 /Users/brandonkatz/.openclaw/workspace/fitsorted/simple-foods-added.log
```

**Check failed lookups:**
```bash
cat /Users/brandonkatz/.openclaw/workspace/fitsorted/failed-lookups.json
```

**Count current foods:**
```bash
node -e "const fs = require('fs'); const bot = fs.readFileSync('./bot.js', 'utf8'); const match = bot.match(/const simple = \{([^}]+)\}/s); console.log('Foods:', match[1].split(',').length);"
```

---

## Adding More Foods

**Method 1: Edit PROACTIVE_FOODS (recommended)**

Edit `expand-simple-foods.js`:
```javascript
const PROACTIVE_FOODS = {
  // ... existing foods ...
  "new food": 250,
  "another food": 180,
};
```

Run:
```bash
node expand-simple-foods.js
pm2 restart fitsorted
```

**Method 2: Let failed lookups drive additions**

Users request unknown foods → tracked in `failed-lookups.json` → automatically added when count ≥ 3.

---

## Recovery Procedures

### **Scenario 1: Script fails mid-run**

**Symptoms:** Bot crashes, won't restart

**Fix:**
```bash
cd /Users/brandonkatz/.openclaw/workspace/fitsorted
cp bot.js.backup bot.js
pm2 restart fitsorted
```

### **Scenario 2: Bad syntax got through**

**Symptoms:** Bot logs show `SyntaxError: Unexpected token`

**Fix:**
```bash
# Check syntax
node -c bot.js

# If bad, restore backup
cp bot.js.backup bot.js

# Fix expand-simple-foods.js validation
# Then re-run
node expand-simple-foods.js
pm2 restart fitsorted
```

### **Scenario 3: Lost all backups**

**Fix:**
```bash
# Pull from git (if committed)
git checkout bot.js

# Or manually rebuild simple object from scratch
# (400+ foods, painful but possible)
```

---

## Testing

**Test without writing:**
```javascript
// Add to expand-simple-foods.js for dry-run mode
const DRY_RUN = true;

if (DRY_RUN) {
  console.log("🧪 DRY RUN - not writing to file");
  console.log(newSimpleObj);
  return;
}
```

**Validate existing bot.js:**
```bash
node -c bot.js && echo "✅ Syntax OK" || echo "❌ Syntax error"
```

---

## Why This Matters

**Before (fragile):**
- One bad regex = bot crashes
- No validation = production downtime
- No backups = manual recovery
- Ran twice = corruption

**Now (robust):**
- Proper parsing = no regex accidents
- Validation = catches errors before deploy
- Backups = instant rollback
- Idempotent = safe to re-run

**Result:** Bot survives script failures, no more 3 AM crashes! 🚀

---

## Stats

**Coverage growth:**
- March 9, 07:00: 15 foods (manual)
- March 9, 11:00: 132 foods (first auto-run)
- March 9, 13:00: 390 foods (Woolworths expansion)
- March 9, 15:00: 445 foods (safe script deployed)

**Target:** 500+ foods by end of week

**Instant lookup rate:** ~95% (estimated)

---

Built to never crash again. 💪
