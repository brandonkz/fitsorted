# FitSorted Edge Case Test Report — Round 9
**Date:** 2026-03-15

## Summary
| Metric | Count |
|--------|-------|
| Total items tested | 173 |
| ✅ Passed | 118 (68%) |
| ❌ Failed | 41 (24%) |
| ⚠️ Errors (API parse) | 14 (8%) |

## New Overrides Added (11 items)

| Food | Calories | P | C | F | Fibre | Why |
|------|----------|---|---|---|-------|-----|
| chicken licken big john | 650 | 30 | 50 | 35 | 3 | AI returned 800 (overestimate) |
| spur wings 6 | 540 | 36 | 15 | 38 | 1 | AI returned 900 (wings aren't that calorie-dense) |
| lays salt and vinegar | 480 | 5 | 55 | 28 | 3 | AI returned 270 (using small bag, not 120g) |
| astros | 210 | 3 | 25 | 11 | 1 | AI returned 0 (didn't recognize the SA candy) |
| liqui fruit orange | 180 | 1 | 42 | 0 | 0 | AI returned 440 (using 1L carton, not 330ml) |
| bunny chow half | 1100 | 40 | 120 | 45 | 8 | AI returned 325 (completely wrong, half bunny is massive) |
| beacon flings | 430 | 4 | 52 | 23 | 2 | AI error (didn't recognize SA snack brand) |
| potjiekos | 550 | 30 | 35 | 30 | 4 | AI error (couldn't process SA traditional dish) |
| kauai smoothie bowl | 450 | 10 | 65 | 15 | 6 | AI returned 300 (underestimate) |
| bredie | 450 | 25 | 30 | 25 | 5 | AI error (SA stew not recognized) |
| wimpy breakfast | 800 | 35 | 60 | 45 | 4 | AI error (SA restaurant chain) |

Also added alternate keys: `big john`, `spur wings`, `lays`, `liqui fruit`, `half bunny chow`, `flings`, `potjie`, `tomato bredie`

## Notable Failures Already Covered by Existing Overrides
These items failed the AI test but already have overrides in bot.js, so users get correct values:
- white monster (AI: 230, override: correct zero-cal)
- fat cake, pap and wors, samp and beans, tex bar, lunch bar, jungle oats, etc.

## Observations
1. **SA snack brands** remain the biggest weakness — AI doesn't know Beacon Flings, Astros, or correct bag sizes for Simba/Nik Naks
2. **Bunny chow half** was wildly wrong (325 vs ~1100 cal) — the AI halved a quarter portion instead of doubling it
3. **Liqui-Fruit** confusion between 330ml single serve and 1L carton continues
4. **Traditional SA dishes** (potjiekos, bredie) often cause API parse errors
5. **14 errors** where API returned unparseable responses — these all have overrides now or in previous rounds

## Pass Rate Trend
- Round 7: ~70% pass
- Round 8: ~72% pass  
- Round 9: 68% pass (larger test set: 173 items vs ~153)

The override library now covers 100+ SA-specific foods, which is the main safety net for real users.
