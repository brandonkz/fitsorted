# FitSorted Companion App - Scope

## Concept

WhatsApp = input layer (log food, chat, get advice)
App = output layer (graphs, trends, insights, shareable stats)

The app does NOT replace WhatsApp. It's the visual dashboard you can't get in a chat.

## Why This Works

1. **App Store discoverability** - "calorie tracker South Africa" search = new users
2. **Retention** - Pretty graphs keep people engaged between meals
3. **Shareability** - Screenshot your weekly stats for Instagram/TikTok
4. **Perceived value** - An app feels more "real" than a bot. Justifies subscription.
5. **Apple/Google won't reject** - The app provides genuine value (dashboard), WhatsApp is just the input method

## App Screens

### 1. Home / Today Dashboard
- Circular calorie progress ring (eaten / goal)
- Macro bars (protein, carbs, fat) with targets
- Today's food log (scrollable list)
- Daily spend tracker (if budget feature enabled)
- "Log Food" button → deep-links to WhatsApp chat

### 2. Trends / Progress
- Weight graph (last 30/90 days)
- Calorie trend line (daily average, 7-day rolling)
- Deficit/surplus streak calendar (green = under goal, red = over)
- Best/worst days
- Weekly averages

### 3. Insights
- "You eat 40% of your calories after 6 PM"
- "Your most logged food: Nando's Quarter Chicken (12x this month)"
- "Mondays are your lowest calorie day (avg 1,450)"
- "You've been in deficit 18 of the last 30 days"
- AI-generated weekly summary

### 4. Food History
- Searchable log of everything tracked
- Filter by date, meal type, restaurant
- Calorie and macro breakdown per item
- Price history (beta)

### 5. Budget (beta users)
- Daily/weekly/monthly spend pie chart by category
- Budget vs actual bar chart
- "Takeaways vs Home Cooking" split
- Cost per calorie trends
- Monthly food spend total

### 6. Profile & Settings
- Current goal, weight, macros
- "Recalculate Goal" → links to WhatsApp
- Subscription status
- Export data (CSV)
- Share referral link

### 7. Onboarding (first open)
- "FitSorted tracks your food on WhatsApp. This app shows your progress."
- Connect account: enter WhatsApp number → verify via OTP sent on WhatsApp
- "Start Tracking" → opens WhatsApp

## Tech Stack

### Option A: React Native (Expo) - RECOMMENDED
- **Pros:** Single codebase, both App Store + Google Play, fast dev with Expo
- **Cons:** Need Apple Developer Account ($99/year), Google Play ($25 one-time)
- **Build time:** 5-7 days to MVP
- **Why Expo:** No native modules needed, just charts + API calls + deep links

### Option B: PWA (Progressive Web App)
- **Pros:** No app store approval, instant updates, free
- **Cons:** No App Store discoverability (defeats the purpose), limited iOS support
- **Build time:** 3-4 days
- **Use case:** Quick win while native app is in review

### Option C: Flutter
- **Pros:** Beautiful UI, fast, both platforms
- **Cons:** Brandon's team doesn't use Dart, learning curve
- **Build time:** 7-10 days

**Recommendation:** Build PWA first (3-4 days), then React Native for App Store (5-7 days). PWA gives instant value while native app goes through review.

## Data Architecture

### Current: users.json (local file)
- Problem: App can't read a file on your Mac mini
- Need: API endpoint that serves user data

### Solution: Supabase API Layer
- Already have Supabase set up (PayFast ITN endpoint)
- Sync user data to Supabase on every save (or every 5 min)
- App reads from Supabase via REST API
- Auth: WhatsApp number + OTP (send verification code via WhatsApp bot)

### API Endpoints Needed
```
GET  /api/user/:phone          → profile, goal, setup status
GET  /api/user/:phone/today    → today's food log + totals
GET  /api/user/:phone/history  → last N days of food logs
GET  /api/user/:phone/weight   → weight history
GET  /api/user/:phone/trends   → weekly/monthly aggregates
GET  /api/user/:phone/insights → AI-generated insights
POST /api/auth/verify           → send OTP to WhatsApp
POST /api/auth/confirm          → verify OTP, return JWT
```

## Chart Library
- **Victory Native** (React Native) - clean, animated charts
- **Chart.js** (PWA) - lightweight, well-documented
- Both can do: line graphs, bar charts, pie charts, progress rings

## Deep Linking
- "Log Food" button → `whatsapp://send?phone=27690684940&text=`
- "Get Meal Ideas" → `whatsapp://send?phone=27690684940&text=meal%20suggestions`
- "Update Weight" → `whatsapp://send?phone=27690684940&text=weight%20`
- Works on both iOS and Android

## App Store Listing

### FitSorted - SA Calorie Tracker
**Subtitle:** Track calories on WhatsApp. See progress here.
**Category:** Health & Fitness
**Keywords:** calorie tracker, south africa, nutrition, macro tracker, whatsapp, diet, weight loss, nandos calories, sa food

**Description:**
FitSorted is the easiest calorie tracker in South Africa. Log your food on WhatsApp (yes, really), and see your progress, trends, and insights in this companion app.

No complicated interfaces. No barcode scanning. Just tell WhatsApp what you ate and we handle the rest.

Features:
- Track calories and macros via WhatsApp
- SA food database (Nando's, Kauai, Steers, Woolworths)
- Weight tracking with trend graphs
- Daily, weekly, and monthly insights
- Exercise logging
- AI-powered nutrition coaching

**Screenshots needed:**
1. Today dashboard with calorie ring
2. Weight trend graph
3. Food log with SA foods
4. Weekly insights card
5. WhatsApp chat showing food logging

## Revenue Impact

- App Store presence = new discovery channel (SEO for apps)
- Higher perceived value = easier to justify R59/month
- Dashboard screenshots on social media = free marketing
- Push notifications = retention boost ("You haven't logged today")

## Build Plan

### Phase 1: PWA (3-4 days)
- [ ] Supabase data sync from bot
- [ ] Auth (WhatsApp OTP)
- [ ] Today dashboard (calorie ring, food log, macros)
- [ ] Weight trend graph
- [ ] Deploy to fitsorted.co.za/app
- [ ] "Add to Home Screen" prompt

### Phase 2: React Native (5-7 days)
- [ ] Port PWA screens to React Native (Expo)
- [ ] Native charts (Victory Native)
- [ ] Deep linking to WhatsApp
- [ ] Push notifications
- [ ] Apple Developer Account signup ($99)
- [ ] Google Play Console signup ($25)
- [ ] App Store submission + review (1-2 weeks)

### Phase 3: Post-Launch
- [ ] Push notifications ("You haven't logged today")
- [ ] Widget (iOS) showing today's calories
- [ ] Apple Health integration (sync weight data)
- [ ] Share cards (Instagram-ready weekly summary images)
- [ ] Budget dashboard (when BudgetSorted launches)

## Cost

| Item | Cost |
|------|------|
| Apple Developer Account | $99/year (~R1,800) |
| Google Play Console | $25 one-time (~R450) |
| Supabase (existing) | Free tier |
| Expo (build service) | Free tier for personal |
| **Total to launch** | **~R2,250** |

## Timeline

- **Week 1:** PWA live at fitsorted.co.za/app
- **Week 2-3:** React Native build + testing
- **Week 3-4:** App Store submission + review
- **Week 4-5:** Live on App Store + Google Play

---

**Created:** 10 March 2026
