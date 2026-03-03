# FitSorted One-Pager — Everything You Need

**WhatsApp Number:** +27690684940  
**Website:** https://fitsorted.co.za  
**Status:** ✅ Live (free beta for 1-2 weeks)

---

## 🚀 QUICK START

### User Journey (How People Use It)

1. **WhatsApp +27690684940**
2. Bot asks: gender, weight, height, age, activity level, goal, pace
   - **Pace options:**
     - **Lose weight:** Aggressive (0.75kg/week), Standard (0.5kg/week), Chill (0.25kg/week)
     - **Build muscle:** Aggressive (+500 cal), Standard (+300 cal), Lean bulk (+200 cal)
     - **Maintain:** No pace options (TDEE = goal)
3. Bot calculates daily calorie goal
4. User logs food: "2 eggs" or "Nando's quarter chicken"
5. Bot responds with calories + macros (protein/carbs/fat)
6. Morning check-in (6:30 AM): Shows goal + yesterday's recap
7. Evening summary (8 PM): Total calories, macros, deficit/surplus in grams
8. **First 3 days:** Daily helpful tips sent at 8 PM (exercise logging, undo command, asking questions)

**Example:**
- User sends: "Kauai Peanut Butter Bomb"
- Bot replies: "📝 Logged: Kauai Peanut Butter Bomb (Large 500ml) = 764 cal | 🥩 P: 22g | 🍞 C: 98g | 🥑 F: 32g"

---

## 📱 BOT COMMANDS

**Food logging:**
- Just send food name: "chicken breast", "2 slices toast", "Big Mac"
- SA foods built-in: Nando's, Kauai, Steers, Woolworths

**Commands:**
- `log` — Show today's total (calories + macros)
- `goal` — Show your daily calorie goal
- `help` — List all commands
- `reset` — Start setup again
- `feedback [message]` — Send feedback to you

**Exercise (optional):**
- `burn gym 400` — Log 400 cal burned

**Referral stats:**
- `STATS` — Show all referral codes
- `STATS SARAH` — Show specific code stats

---

## 🔗 REFERRAL CODES (For Influencers)

**How it works:**
1. Create custom link: `https://wa.me/27690684940?text=JOIN-SARAH`
2. Influencer shares link
3. User clicks → WhatsApp opens with "JOIN-SARAH" pre-filled
4. Bot tracks signup under code "SARAH"
5. Influencer checks stats: WhatsApp "STATS SARAH"

**Commission (when payments launch):**
- User pays R36/mo
- Influencer earns R7.20/mo per user (20%)
- 50 users = R360/mo passive income
- 200 users = R1,440/mo passive income

**Example codes:**
- Sarah (fitness coach): `https://wa.me/27690684940?text=JOIN-SARAH`
- John (gym owner): `https://wa.me/27690684940?text=JOIN-JOHN`
- FitGirl (influencer): `https://wa.me/27690684940?text=JOIN-FITGIRL`

---

## 💻 TECHNICAL SETUP

### Bot Status
**Check if running:**
```bash
pm2 status
```

**View live logs:**
```bash
pm2 logs fitsorted
```

**Restart bot:**
```bash
pm2 restart fitsorted
```

**Stop bot:**
```bash
pm2 stop fitsorted
```

**Start bot:**
```bash
pm2 start fitsorted
```

### User Database
**Location:** `/Users/brandonkatz/.openclaw/workspace/fitsorted/users.json`

**View all users:**
```bash
cat /Users/brandonkatz/.openclaw/workspace/fitsorted/users.json | jq 'keys'
```

**Count users:**
```bash
cat /Users/brandonkatz/.openclaw/workspace/fitsorted/users.json | jq 'keys | length'
```

**See latest activity:**
```bash
cat /Users/brandonkatz/.openclaw/workspace/fitsorted/users.json | jq '.[].log["2026-03-03"]' -c
```

### Referral Database
**Location:** `/Users/brandonkatz/.openclaw/workspace/fitsorted/referrals.json`

**View all referrals:**
```bash
cat /Users/brandonkatz/.openclaw/workspace/fitsorted/referrals.json | jq '.'
```

---

## 🎨 SOCIAL MEDIA LAUNCH

### Accounts to Create
- **TikTok:** @fitsorted_za
- **Instagram:** @fitsorted.za

### Content Ready
- **BRAND.md** — Voice, tone, messaging
- **TIKTOK-CONTENT.md** — 4 weeks of scripts
- **INSTAGRAM-CONTENT.md** — 4 weeks of posts + Stories
- **QUICK-START.md** — Week 1 checklist

**All files:** `/Users/brandonkatz/.openclaw/workspace/fitsorted/`

### Week 1 Posting Schedule
**TikTok:** 4 videos (Mon, Wed, Fri, Sun)
**Instagram:** 4 feed posts + 1 Reel + 7 Stories

**First TikTok script:** "Nando's quarter chicken = 429 cal" (see TIKTOK-CONTENT.md)

---

## 💰 PAYMENTS (Launch in Week 2-3)

### Current Status
- **PayFast account:** Pending verification
- **Free beta:** 1-2 weeks (no payments)
- **Collect feedback:** Polish UX before charging

### When Ready
**PayFast Sandbox Integration:**
1. Get PayFast Merchant ID + Key
2. Build webhook endpoint
3. Test in sandbox mode
4. Switch to live when account verifies

**Manual Banking (Week 1 backup):**
- User sends EFT to AlphaX Asset Capital (Absa 4121303961)
- User sends proof of payment
- You manually activate: `jq '.["27824724778"].paid = true'`

**Pricing:**
- R36/month recurring
- 7-day free trial
- Cancel anytime

---

## 📊 METRICS TO TRACK

### Daily
- New signups (check users.json)
- Active users (check logs for today's date)
- Referral signups (check referrals.json)

### Weekly
- Total users
- Retention (% logging food 3+ days/week)
- Top referral codes
- Social media followers (TikTok + Instagram)

### Monthly
- Monthly Active Users (MAU)
- Conversion rate (beta → paid when launched)
- Churn rate

---

## 🐛 TROUBLESHOOTING

### Bot Not Responding
1. Check if running: `pm2 status`
2. If stopped: `pm2 restart fitsorted`
3. View errors: `pm2 logs fitsorted --err`

### Port 3001 Already In Use
```bash
ps aux | grep "3001" | grep -v grep
kill [PID]
pm2 restart fitsorted
```

### Cloudflare Tunnel Not Working
```bash
ps aux | grep cloudflared
# Should show: cloudflared tunnel --url http://localhost:3001
```

If not running, restart:
```bash
cloudflared tunnel --url http://localhost:3001
```

### Website Not Updating
```bash
cd /Users/brandonkatz/.openclaw/workspace/fitsorted
git add .
git commit -m "Update"
git push origin main
```
Wait 1-2 minutes for GitHub Pages to rebuild.

---

## 📞 SHARING FITSORTED

### For Friends (Beta Testing)
```
Yo, I built a calorie tracker that works on WhatsApp (no app needed). Can you test it for me?

Just WhatsApp this number: +27690684940

It'll ask you a few questions (age, weight, goal), then you can log food by just sending messages like "2 eggs" or "Nando's quarter chicken" and it tracks everything.

Let me know if it's broken or confusing 😅
```

### For Reddit (r/southafrica, r/loseit)
```
[Free Beta] I built a WhatsApp calorie tracker for South Africans

No app needed. Just WhatsApp +27690684940 and it tracks your food.

- Knows SA food (Nando's, Kauai, Steers, Woolworths)
- Tracks macros (protein, carbs, fat)
- Morning + evening check-ins
- 100% free (beta testing for 2 weeks)

Looking for feedback before launching paid version (R36/mo). Let me know what you think!

Site: https://fitsorted.co.za
```

### For Instagram Bio
```
🇿🇦 Track calories on WhatsApp
💪 Macro tracking • SA food database
💰 Free beta (R36/mo later)
👇 Test it now
```

---

## ✅ NEXT STEPS (This Week)

**Monday-Tuesday:**
- [ ] Create TikTok account (@fitsorted_za)
- [ ] Create Instagram account (@fitsorted.za)
- [ ] Film 4 TikToks (see TIKTOK-CONTENT.md)
- [ ] Design 2 Instagram carousels in Canva

**Wednesday-Thursday:**
- [ ] Schedule Week 1 content in Meta Business Suite
- [ ] Share with 5-10 friends for beta testing
- [ ] Post in 2-3 SA Facebook groups (fitness/weight loss)

**Friday-Sunday:**
- [ ] Post daily content
- [ ] Reply to every comment
- [ ] Post Instagram Stories daily
- [ ] Monitor feedback via WhatsApp

**Goal for Week 1:** 20 active beta users, collect feedback, fix bugs

---

## 🎯 MONTH 1 GOALS

**Users:** 50-100 beta signups  
**Social:** 500 TikTok followers, 500 Instagram followers  
**Content:** 20 TikToks, 16 Instagram posts, 28 Stories  
**Feedback:** Identify 3-5 critical improvements before launch  

**Revenue Goal (Month 2-3):** 100 paying users × R36 = R3,600/mo

---

## 📂 KEY FILES

**Bot code:** `/Users/brandonkatz/.openclaw/workspace/fitsorted/bot.js`  
**User data:** `/Users/brandonkatz/.openclaw/workspace/fitsorted/users.json`  
**Referral data:** `/Users/brandonkatz/.openclaw/workspace/fitsorted/referrals.json`  
**Website:** `/Users/brandonkatz/.openclaw/workspace/fitsorted/index.html`  
**GitHub repo:** https://github.com/brandonkz/fitsorted

**Content strategy:**
- BRAND.md — Brand voice + messaging
- TIKTOK-CONTENT.md — 4 weeks TikTok scripts
- INSTAGRAM-CONTENT.md — 4 weeks Instagram posts
- QUICK-START.md — Week 1 launch checklist

---

## 🔥 COMPETITIVE EDGE

**vs MyFitnessPal:**
- We: WhatsApp (no app)
- They: Complicated UI, expensive ($20/mo)

**vs CaloriChat ($100/yr, 62 users):**
- We: R36/mo (4x cheaper), SA food database, macro tracking
- They: Generic, no local food

**vs Noom ($60/mo):**
- We: Just calorie tracking
- They: Psychology lessons, expensive, overwhelming

**Our edge:** Simplicity + affordability + local = unbeatable for SA market

---

**Last updated:** March 3, 2026
