# Proactive Food Expansion System

**Built:** March 9, 2026  
**Purpose:** Automatically expand simple food lookup to reduce OpenAI API calls and improve response speed

---

## What It Does

### **1. Proactive Additions (117 foods added today)**

Pre-loaded common SA foods, drinks, snacks, and meals:

**SA Staples:**
- pap, boerewors, biltong, vetkoek, bunny chow, kota, gatsby, braai meat, sosatie, etc.

**Breakfast:**
- toast, weetbix, jungle oats, pronutro, bacon, eggs, yogurt, etc.

**Snacks:**
- biscuits, chocolate, chips, rusks, ouma rusks, tennis biscuits, nuts, etc.

**Fast Food:**
- Big Mac, Whopper, Steers burger, KFC, Nando's, fish & chips, pies, etc.

**Drinks:**
- Coffee varieties (cappuccino, latte, flat white, espresso)
- Sodas (Coke, Fanta, Sprite, cream soda, iron brew)
- Sports drinks (Energade, Powerade, Red Bull)
- Juices, milkshakes, smoothies

**Meals:**
- Sandwiches, pasta, curry, stir fry, bobotie, potjie, salads, etc.

**Sides:**
- Fries, mashed potato, sweet potato, onion rings, coleslaw, garlic bread, etc.

**Fruits & Veg:**
- Common fruits (orange, banana, apple, grapes, mango, avo, etc.)
- Common veg (tomato, cucumber, carrot, broccoli, spinach, etc.)

---

## How It Works

### **Daily Automation (3 AM)**

Every day at 3 AM, the system:

1. **Checks failed lookups** for foods requested 3+ times
2. **Adds proactive foods** from curated list (if not already present)
3. **Updates `bot.js`** with new entries
4. **Restarts bot** to apply changes
5. **Logs additions** to `simple-foods-added.log`

### **Immediate Benefits**

- ✅ **Faster responses** (no API call needed)
- ✅ **Lower costs** (fewer OpenAI requests)
- ✅ **Better accuracy** (curated SA-specific calorie values)
- ✅ **Learns from users** (failed lookups become fast lookups)

---

## Files

**Script:**
- `/Users/brandonkatz/.openclaw/workspace/fitsorted/expand-simple-foods.js`

**Log:**
- `/Users/brandonkatz/.openclaw/workspace/fitsorted/simple-foods-added.log`

**Cron:**
- `bot.js` line ~3012: `cron.schedule("0 3 * * *", ...)`

---

## Current Coverage

**Before today:** ~15 simple foods  
**After today:** **132 simple foods**

**Examples now instant:**
- "vetkoek" → 320 cal (was failing before)
- "bunny chow" → 600 cal (was failing before)
- "kota" → 650 cal (was failing before)
- "boerewors roll" → 400 cal (was failing before)
- "cappuccino" → 80 cal
- "Big Mac" → 550 cal
- "Steers burger" → 600 cal
- "weetbix" → 60 cal
- "jungle oats" → 150 cal

---

## Adding More Foods

**To manually add foods:**

1. Edit `expand-simple-foods.js`
2. Add to `PROACTIVE_FOODS` object:
   ```javascript
   "food name": calories,
   ```
3. Run:
   ```bash
   cd /Users/brandonkatz/.openclaw/workspace/fitsorted
   node expand-simple-foods.js
   pm2 restart fitsorted
   ```

**To add from failed lookups:**

Just wait — the system checks `failed-lookups.json` daily and highlights foods requested 3+ times.

---

## Monitoring

**Check what was added:**
```bash
cat /Users/brandonkatz/.openclaw/workspace/fitsorted/simple-foods-added.log
```

**Check failed lookups:**
```bash
cat /Users/brandonkatz/.openclaw/workspace/fitsorted/failed-lookups.json
```

**See current simple foods count:**
```bash
grep -o '"[^"]*":\s*[0-9]*' /Users/brandonkatz/.openclaw/workspace/fitsorted/bot.js | grep -A200 "const simple = {" | wc -l
```

---

## Strategy

**This system is aggressive about adding foods** — the goal is to eventually have 500+ instant lookups covering:

- All SA chain restaurant menus (Nando's, Steers, KFC, Wimpy, etc.)
- All common grocery items (Woolworths, Pick n Pay, Checkers)
- All traditional SA foods (pap, vetkoek, bunny chow, koeksisters, etc.)
- All common international foods (pizza, pasta, burgers, etc.)

**Result:** 90%+ of lookups become instant, OpenAI is only needed for unusual/custom foods.

---

## Future Enhancements

**Potential additions:**

1. **Restaurant menu scraping** — Auto-add Nando's/Steers/KFC full menus
2. **Grocery API integration** — Pull Woolworths/PnP nutritional data
3. **User voting** — Let users vote on accuracy, refine values over time
4. **Smart quantity detection** — "large fries" vs "small fries" vs "fries"
5. **Meal combos** — "Big Mac meal" includes burger + fries + Coke

All of this can be added to `expand-simple-foods.js` over time.

---

**Built to scale.** 🚀
