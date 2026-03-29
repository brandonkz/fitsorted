# FitSorted: Accountability Buddies + Streak Milestones

## Feature 1: Accountability Buddies

### User Commands
- `buddy 27XXXXXXXXX` or `buddy +27XXXXXXXXX` — send buddy request to that number
- `buddy remove` — unpair from current buddy
- `buddy` — show current buddy status

### Data Model
Add to user object in users.json:
```json
{
  "buddy": {
    "phone": "27XXXXXXXXX",
    "paired": true,
    "pairedAt": "2026-03-27T..."
  },
  "buddyRequest": {
    "from": "27XXXXXXXXX",
    "at": "2026-03-27T..."
  }
}
```

### Flow
1. User A sends `buddy 27823456789`
2. If User B exists in users.json and has setup complete:
   - Store `buddyRequest` on User B
   - Send User A: "✅ Buddy request sent to [B's name]! They'll see it next time they message."
3. Next time User B messages anything, check for pending buddyRequest:
   - Send User B: "🤝 [A's name] wants to be accountability buddies! Reply *accept* or *decline*"
   - Set a flag so we wait for their response
4. If accepted: set `buddy` on both users, clear `buddyRequest`
5. If declined: clear `buddyRequest`, notify A
6. Max 1 buddy per person. If already paired, tell them to `buddy remove` first.
7. Both users must exist in the system (registered).

### Evening Summary Integration (NO extra push messages!)
In the 8 PM daily summary cron, after the existing summary line, add buddy stats IF both users logged today:

```
📊 *Daily Summary*
1,650 / 2,000 cal
🥩 P: 120g / 130g | 🍞 C: 180g / 200g | 🥑 F: 55g / 60g
✅ 350 cal under goal

🤝 *Buddy: [Name]*
Their day: 2,100 / 1,800 cal ⚠️
This week: You 4 ✅ — Them 2 ✅
```

Only show buddy section if:
- User has a paired buddy
- Buddy logged at least 1 food item today
- Don't show if buddy didn't log (they might be inactive)

### Weekly Score
Track days "under goal" for each in current week (Mon-Sun). Show in evening summary.

## Feature 2: Streak Milestones & Badges

### How Streaks Work (already exists partially)
A streak = consecutive days with at least 1 food log entry. The streak logic already exists around line 662 of bot.js.

### Milestone Badges
When a user hits a milestone, send a celebration message INSIDE their next evening summary (not as a separate push):

| Streak | Badge | Message |
|--------|-------|---------|
| 3 days | 🌱 | "3-day streak! Habit forming..." |
| 7 days | 🔥 | "1 week streak! You're on fire" |
| 14 days | ⭐ | "2 weeks! This is becoming second nature" |
| 21 days | 💪 | "21 days — they say that's how habits are made" |
| 30 days | 🏅 | "30-DAY STREAK! You're in the top 5% of users" |
| 50 days | 🏆 | "50 days! Absolute machine" |
| 100 days | 👑 | "100 DAYS. Legend status unlocked" |

### Implementation
- Store `lastStreakMilestone` on user to avoid re-sending
- Calculate streak in evening summary
- If streak hits a new milestone > lastStreakMilestone, append badge message to summary
- Also show current streak in the evening summary always: "🔥 12-day streak"

### Data Model Addition
```json
{
  "lastStreakMilestone": 7
}
```

## Important Rules
- NO extra WhatsApp messages — everything goes in the existing 8 PM evening summary
- Don't break any existing functionality
- Keep the same code style as bot.js
- Test the buddy command handler near the other command handlers
- The buddy acceptance flow should be handled via the existing message handling, not buttons (keeps it simple)
