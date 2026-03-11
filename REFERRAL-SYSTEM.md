# FitSorted Referral System

Built and deployed March 9, 2026.

## How It Works

### For Users

**Get Your Referral Link:**
- Text the bot: `invite`, `share`, `referral`, or `refer`
- Bot replies with unique referral link

**Rewards:**
- **R10 off** for each friend who signs up via your link
- **R10 off** for the friend too (both parties win)
- Credits accumulate and can be used toward subscription

**Leaderboard Tiers:**
- 🌱 Getting Started: 1-2 referrals
- 💪 Rising Star: 3-4 referrals
- 🔥 Referral Champion: 5-9 referrals
- ⭐ Top Referrer: 10+ referrals

### For You (Admin)

**Track Referrals:**
- All referrals logged in `/Users/brandonkatz/.openclaw/workspace/fitsorted/referrals.json`
- User referral stats stored in `users.json` under each user:
  - `referrals` array (who they referred + date + credits)
  - `referralCredits` number (total R10 credits earned)
  - `referredBy` phone (who referred them)

**View Stats:**
```bash
cd /Users/brandonkatz/.openclaw/workspace/fitsorted
node -e "const u = require('./users.json'); const refs = Object.values(u).filter(u => u.referrals?.length > 0); console.log('Top referrers:'); refs.sort((a,b) => (b.referrals?.length || 0) - (a.referrals?.length || 0)).slice(0,10).forEach(u => console.log(u.phone.slice(-4), 'referred', u.referrals.length, 'users'));"
```

---

## User Flow Example

### Scenario: Alice invites Bob

**1. Alice shares her link:**
```
Alice texts bot: "invite"
Bot replies: "Your referral link: https://wa.me/27690684940?text=REF_FS3K7M2A"
Alice shares link with Bob
```

**2. Bob signs up via Alice's link:**
```
Bob clicks link → WhatsApp opens with "REF_FS3K7M2A" pre-filled
Bob sends message
Bot tracks referral code
```

**3. Both get rewarded:**
```
Bot → Bob: "Welcome! You were referred by a friend — you both just earned R10 off!"
Bot → Alice: "Someone joined using your link! +R10 credit earned. Total referrals: 1"
```

**4. Credits tracked:**
```
Alice's user object:
{
  "referrals": [{ "phone": "27...", "date": "2026-03-09...", "credited": 10 }],
  "referralCredits": 10
}

Bob's user object:
{
  "referredBy": "27...",
  "referralCredits": 10
}
```

---

## Referral Link Format

`https://wa.me/27690684940?text=REF_FSXXXXXX`

**Code generation:**
- Takes last 6 digits of phone number
- Converts to base36
- Prefix: `FS`
- Example: `+27837787970` → `FS3K7M2A`

**Why this works:**
- Unique per phone number
- Short and shareable
- Deterministic (same phone = same code)

---

## Testing the System

**Test referral flow:**

1. **Get your referral link:**
   ```
   Text FitSorted: "invite"
   ```

2. **Share with a test number:**
   - Use a different phone/WhatsApp account
   - Click your referral link
   - Sign up

3. **Verify both parties got credited:**
   ```bash
   cd /Users/brandonkatz/.openclaw/workspace/fitsorted
   cat users.json | jq '.[].referralCredits' | grep -v null
   ```

---

## Tracking Growth

**Daily referral stats:**

```bash
# Total users with referral credits
node -e "const u = require('./fitsorted/users.json'); console.log('Users with credits:', Object.values(u).filter(u => u.referralCredits > 0).length);"

# Total credits given out
node -e "const u = require('./fitsorted/users.json'); const total = Object.values(u).reduce((sum, u) => sum + (u.referralCredits || 0), 0); console.log('Total R credits:', total);"

# Referral conversion rate
node -e "const u = require('./fitsorted/users.json'); const referred = Object.values(u).filter(u => u.referredBy).length; const total = Object.keys(u).length; console.log('Referred %:', ((referred/total)*100).toFixed(1));"
```

---

## Integration with Payment

When users subscribe, apply their `referralCredits`:

**Current:**
- R59/month (or R280/year)

**With R10 credit:**
- First month: R49
- Or R10 off annual

**To implement:**
- Check `user.referralCredits` before generating PayFast link
- Apply discount to first payment
- Deduct credits from `user.referralCredits`
- Track in subscription record

---

## Marketing Messages

**Instagram Story CTA:**
```
"Invite 3 friends → Free month
Already tracking? Text 'invite' to get your link"
```

**Email to existing users:**
```
Subject: Earn R10 for each friend you invite

You're already using FitSorted. Now earn rewards!

Share your link, get R10 off for each friend who joins.
Text "invite" to get started.
```

**Reddit post addition:**
```
P.S. Built a referral system today — invite friends, both get R10 off.
Text "invite" after you sign up.
```

---

## Next Steps

**Week 1:**
- Monitor referral adoption (what % of users type "invite"?)
- Track conversion (what % of referral links lead to signups?)
- Identify top referrers, reach out personally

**Week 2:**
- Add referral incentive to onboarding ("Invite 3 friends, get free month")
- Send "invite friends" message to all existing users
- Post referral CTA on Instagram Stories

**Week 3:**
- Reward top referrer with free year
- Share success story ("User X referred 15 friends!")
- Add referral leaderboard to website

---

Built and ready to drive viral growth 🚀
