# FitSorted: Group Challenges

## Concept
Users create challenges, share a join code with friends. Everyone logs food via DM as normal. The bot adds a leaderboard to each participant's evening summary.

## User Commands

### Create a challenge
`challenge create [name]`
- Creates a 30-day challenge (default)
- Generates a 6-char join code (e.g. FIT-A3K)
- Creator is auto-joined
- Response: "🏆 Challenge *[name]* created!\n\nShare this code with your mates:\n*FIT-A3K*\n\nThey just send: *join FIT-A3K*\n\n30 days starts when you say *challenge start* (or auto-starts when 3+ people join)"

### Join a challenge
`join [CODE]` or `challenge join [CODE]`
- Joins the challenge
- Response: "✅ You've joined *[name]*! [X] people so far.\n\nMembers: [list of first names]"
- Notify all existing members: "[Name] just joined the challenge! 💪"

### Start (creator only)
`challenge start`
- Locks the challenge, starts the 30-day countdown
- If not enough people (min 2), warn but allow

### Leaderboard
`leaderboard` or `challenge`
- Shows current standings

### Leave
`challenge leave`
- Removes from active challenge

## Data Model
New file: `challenges.json`
```json
{
  "FIT-A3K": {
    "name": "Office Shred",
    "code": "FIT-A3K",
    "creator": "27XXXXXXXXX",
    "createdAt": "2026-03-27T...",
    "startedAt": null,
    "endsAt": null,
    "duration": 30,
    "members": ["27XXXXXXXXX", "27YYYYYYYYY"],
    "active": true
  }
}
```

On user object, add:
```json
{
  "challenge": "FIT-A3K"
}
```
One challenge at a time per user.

## Scoring
- 1 point for each day under calorie goal
- Bonus 0.5 points for logging 3+ meals (consistency)
- Streak bonus: +1 point for every 7-day streak maintained during challenge

## Evening Summary Integration
Add after buddy section in 8 PM summary:

```
🏆 *Office Shred — Day 12/30*
1. Jan — 15.5 pts 🥇
2. You — 14 pts 🥈
3. Vicky — 12 pts 🥉
4. Herman — 10 pts
```

Only show top 5 if more than 5 members. Show user's position if not in top 5.

## Weekly Recap (Fridays)
In Friday evening summary for challenge members:

```
🏆 *Weekly Standings — Office Shred*
Week 2 of 4

1. Jan — 15.5 pts (+4.5 this week) 🔥
2. You — 14 pts (+3 this week)
3. Vicky — 12 pts (+5 this week) 📈

💬 Jan is pulling ahead! Time to step it up.
```

## Challenge End
When challenge ends (30 days), send final results to all members:

```
🏆 *Office Shred — COMPLETE!*

🥇 Jan — 42 pts (28/30 days under goal!)
🥈 Brandon — 38 pts
🥉 Vicky — 35 pts

What a month! Create a new challenge: *challenge create [name]*
```

## Important Rules
- Max 1 active challenge per user
- Min 2 members to start
- Max 20 members per challenge
- Challenge codes: "FIT-" + 3 random uppercase alphanumeric chars
- Everything in evening summary — NO extra push messages except join notifications (those are within 24h window since they just messaged)
- Leaderboard command works anytime (not just evening)
- Store challenges in separate challenges.json file (not users.json)
