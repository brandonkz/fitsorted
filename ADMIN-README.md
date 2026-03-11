# FitSorted Admin Dashboard

Web dashboard for managing failed food lookups and adding foods to the database.

## Access

**Local:** http://localhost:3001/admin

**Production:** Set up ngrok or deploy to server

## Features

### 1. Failed Lookups Leaderboard

Shows all foods that users tried to log but failed:
- **Food name** - What users typed
- **Request count** - How many times it was tried
- **Affected users** - How many unique users requested it
- **Last seen** - Most recent failure timestamp

Sorted by request count (most requested at top).

### 2. Add to Database

Click "Add to DB" on any failed lookup:
1. Enter calories (required)
2. Enter macros (optional): protein, carbs, fat
3. Click "Add to Database"

**What happens:**
- Food is added to Supabase `foods` table
- Removed from failed lookups list
- All future users get instant recognition

### 3. Dismiss Lookups

Click "Dismiss" to remove a food from the list without adding it:
- Use for typos or non-food entries
- Use for region-specific foods you don't want to support yet

### 4. Auto-Refresh

Dashboard auto-refreshes every 30 seconds.

Manual refresh: Click "🔄 Refresh" button (bottom-right).

## Stats Dashboard

Top section shows:
- **Total Failed Lookups** - Sum of all requests
- **Unique Foods** - How many different foods failed
- **Affected Users** - How many unique users hit failures
- **Most Requested** - Top food by request count

## Workflow

**Daily routine:**
1. Open admin dashboard
2. Check top 5-10 failed lookups
3. Google search calories (use MyFitnessPal, Woolworths, etc.)
4. Add to database via dashboard
5. Users immediately benefit

**Example:**
1. See "vetkoek" with 7 requests from 3 users
2. Google: "vetkoek calories" → ~300 cal
3. Click "Add to DB" → enter 300 → Submit
4. Next user who logs "vetkoek" gets instant 300 cal

## Alert System

Bot automatically sends you a Telegram alert when a food hits 5 requests:

```
🚨 Failed Lookup Alert

"vetkoek" has been requested 5 times by 3 users.

Consider adding to database.
```

This prompts you to check the dashboard and add it.

## Data Storage

**Failed lookups:** `./failed-lookups.json` (local file)

**Food database:** Supabase `foods` table (persistent)

When you add a food via dashboard:
1. Inserted into Supabase
2. Removed from failed-lookups.json
3. Available immediately to all users

## Security

**Current:** No authentication (local only)

**Production TODO:**
- Add basic auth (username/password)
- Or restrict to localhost + SSH tunnel
- Or use Supabase RLS rules

## Extending

Want to add batch imports?

```javascript
// POST /admin/batch-import
// Body: [{ name, calories, protein, carbs, fat }, ...]
```

Want to edit existing foods?

```javascript
// POST /admin/edit-food/:id
// Body: { calories, protein, carbs, fat }
```

---

Built for Brandon | FitSorted Admin
