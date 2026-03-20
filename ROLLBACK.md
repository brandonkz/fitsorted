# FitSorted Rollback Procedure

## If bot crashes or behaves badly after changes:

### 1. Restore users.json from backup
```bash
cd /Users/brandonkatz/.openclaw/workspace/fitsorted
cp backups/users-20260320-124303.json users.json
pm2 restart fitsorted
```

### 2. Revert to last stable commit
```bash
git log --oneline | head -5  # find last good commit
git reset --hard 8a5fbed  # "Pre-launch stable state" commit
pm2 restart fitsorted
```

### 3. Emergency: Stop bot completely
```bash
pm2 stop fitsorted
```

### 4. Emergency: Use old bot.js
```bash
cp bot.js.backup bot.js
pm2 restart fitsorted
```

---

## Current Stable State (2026-03-20 12:43 PM)

**Commit:** `8a5fbed` - Pre-launch stable state  
**Backup:** `backups/users-20260320-124303.json` (229KB, ~150 users)  
**Bot version:** R49/mo pricing, 7-day trial, grandfather date 2026-03-19  
**Status:** Running stable, 84 restarts total

---

## Known Limits (Monday Surge)

**WhatsApp Business API:**
- Tier: TIER_1K
- Limit: 1,000 unique users per 24 hours
- Quality: GREEN
- **Risk:** If >1,000 signups Monday, bot will stop sending to new users

**OpenAI API:**
- Model: gpt-4o-mini
- Limit: ~500 req/min (Tier 1 assumed)
- **Risk:** Should handle 1,000+ signups fine

**Server:**
- Mac mini, 228GB disk (13% used)
- Node.js PM2, 84 restarts historically
- **Risk:** Low - plenty of headroom

---

## Emergency Contact

If bot is down and you can't fix it:
1. Check PM2 logs: `pm2 logs fitsorted --lines 50`
2. Check error logs: `tail -50 /Users/brandonkatz/.openclaw/workspace/fitsorted/debug-ai.log`
3. Restart: `pm2 restart fitsorted`
4. Full reset: Use steps 1-2 above

**Brandon's number:** +27 83 778 7970  
**Bot WhatsApp:** +27 69 068 4940
