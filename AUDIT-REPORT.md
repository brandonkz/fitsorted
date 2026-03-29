**FitSorted bot.js Audit Report**

Scope: `bot.js` (6,089 lines)

**BUGS**
- [MEDIUM] Trial length inconsistency (7-day vs 30-day) causes wrong days-left messaging and mismatched logic. `TRIAL_DAYS` is 7, but `getTrialEndDate()` uses 30 days and `status` calculates remaining days using 30. Users will be told the wrong remaining trial time. Lines 26-28, 176-181, 4277-4288.
```js
26 const PRO_PRICE = process.env.PRO_PRICE || "36";
27 const GRANDFATHER_DATE = new Date("2026-03-19T23:59:59Z");
28 const TRIAL_DAYS = 7;
176 // Get billing date 30 days from now (YYYY-MM-DD)
177 function getTrialEndDate() {
178   const d = new Date();
179   d.setDate(d.getDate() + 30);
180   return d.toISOString().split("T")[0];
181 }
4277 if (msgLower === "status" || msgLower === "subscription" || msgLower === "my plan") {
4287   const daysLeft = Math.ceil(30 - ((Date.now() - new Date(user.joinedAt).getTime()) / (1000 * 60 * 60 * 24)));
```
- [MEDIUM] `maybeFirstLogMenu` and `maybePromptPro` discard in-memory changes by calling `saveUsers(loadUsers())`, so flags like `sentMenuCard`, `sentPwaNudge`, `proPrompted` are not persisted. Leads to repeated prompts. Lines 2317-2361.
```js
2321 user.sentMenuCard = true;
2322 saveUsers(loadUsers());
...
2338 if (!user.sentPwaNudge && totalEntries === 3) {
2339   user.sentPwaNudge = true;
2340   saveUsers(loadUsers());
...
2358 if (loggedDays >= 3) {
2359   user.proPrompted = true;
2360   saveUsers(loadUsers());
```
- [MEDIUM] Admin “pro-on/pro-off” sets `isPro`, but access checks use `isPremium`/`subscription` only. Pro toggles do not actually grant premium features. Lines 114-129, 4388-4404.
```js
115 async function hasAccess(phone, userObj) {
118   if (userObj.isPremium || userObj.subscription) return true;
128   return await isPremium(phone);
}
4388 if (from === ADMIN_NUMBER && msgLower.startsWith("pro-on ")) {
4392   users[target].isPro = true;
```
- [MEDIUM] Pricing mismatch: PayFast links are calculated from base R36/R399, but user-facing promo/upgrade strings use 49/280 for discounts. Users may see prices that don’t match checkout. Lines 189-215, 4346-4379.
```js
191 const monthly = parseFloat(applyDiscount(36, discountPct));
215 const annual = parseFloat(applyDiscount(399, discountPct));
...
4346 const monthlyPrice = applyDiscount(49, discount);
4347 const annualPrice = applyDiscount(280, discount);
```
- [LOW] `menu:suggest` uses `user.todayCals`, which is never set anywhere, leading to wrong remaining-calorie suggestions. Line 3304.
```js
3304 const remaining = user.goal - (user.todayCals || 0);
```

**SECURITY**
- [CRITICAL] Hardcoded secrets and fallback tokens in source (PayFast merchant ID/key, Resend API key, verify token). If this file is ever shared, these can be abused. Lines 13, 29-32.
```js
13 const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "fitsorted123";
29 const PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID || "10803069";
30 const PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY || "heptrxgjismzp";
32 const RESEND_API_KEY = process.env.RESEND_API_KEY || "re_bDTutSXR_G4Q84ays1Noi7JqwuEGoS2tM";
```
- [CRITICAL] Admin HTTP endpoints are unauthenticated and expose PII plus write access to the food DB with the Supabase service key. Anyone hitting these endpoints can read user data or insert foods. Lines 5660-5898.
```js
5660 app.get('/admin', (req, res) => { res.sendFile(__dirname + '/admin.html'); });
5668 app.get('/api/dashboard', (req, res) => { const users = loadUsers(); ... res.json(userData); });
5707 app.get('/api/stats', (req, res) => { ... res.json({ ... }); });
5845 app.post('/admin/add-food', async (req, res) => {
5854   const { error } = await supabaseAdmin.from('foods').insert([...]);
```
- [HIGH] Webhook POST does not validate WhatsApp signatures (`X-Hub-Signature-256`) and accepts any JSON body. An attacker can trigger bot actions by posting to `/webhook`. Lines 5038-5062.
```js
5038 app.post("/webhook", async (req, res) => {
5039   res.sendStatus(200);
5041   const entry = req.body?.entry?.[0];
```
- [HIGH] Command injection risk in Google Sheets logging. `execSync` is called with user-controlled `food` inside double quotes. Shell expands `$()` and backticks even inside double quotes. Lines 426-446.
```js
444 const escapedFood = food.replace(/"/g, '\\"');
445 execSync(`gog sheets append ... "...|${escapedFood}|..." --account alphaxasset@gmail.com`, { ... });
```

**EDGE CASES**
- [MEDIUM] Food text containing `|`, newlines, or shell metacharacters can corrupt Sheets row format or break the `gog` command. Line 445.
```js
445 execSync(`gog sheets append ... "...|${escapedFood}|..." ...`);
```
- [LOW] Trial countdown uses `joinedAt` even if `trialStartDate` exists, so re-trial or backfilled users can see incorrect days-left. Lines 100-103, 4287-4288.
```js
100 if (userObj.trialStartDate) {
101   return (Date.now() - new Date(userObj.trialStartDate).getTime()) < TRIAL_DAYS * 86400000;
102 }
4287 const daysLeft = Math.ceil(30 - ((Date.now() - new Date(user.joinedAt).getTime()) / ...));
```

**PERFORMANCE**
- [MEDIUM] Hot paths do synchronous disk I/O per message (`loadUsers`/`saveUsers`, debug logs). This blocks the event loop and scales poorly. Lines 419-424, 1053-1054, 2749.
```js
419 function loadUsers() { try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8") || "{}"); } catch { return {}; } }
424 function saveUsers(u) { fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2)); }
1053 const aiDebugLog = `/Users/brandonkatz/.openclaw/workspace/fitsorted/debug-ai.log`;
1054 fs.appendFileSync(aiDebugLog, `\n[${new Date().toISOString()}] estimateCalories() CALLED ...`);
2749 const users = loadUsers();
```
- [LOW] Large `overrides` and `simple` maps are re-created on every `estimateCalories` call. This is avoidable CPU/GC overhead. Lines 1093-1320.
```js
1093 const overrides = { ... many entries ... };
1320 const simple = { ... many entries ... };
```

**DEAD CODE**
- [LOW] Unused helpers: `getTrialDaysLeft`, `getDaysSinceLastActivity`, `getCheckInType`, `getTrialEndDate` are defined but never called. Lines 107-181.
```js
107 function getTrialDaysLeft(userObj) { ... }
142 function getDaysSinceLastActivity(userObj) { ... }
153 function getCheckInType(userObj, cronType) { ... }
177 function getTrialEndDate() { ... }
```
- [LOW] `row` is built but never used in `appendToFoodLogSheet`. Lines 430-441.
```js
430 const row = [ ... ].join('\t');
```

**ERROR HANDLING**
- [MEDIUM] `sendList` has no try/catch; any WhatsApp API failure throws and bubbles to the webhook catch, resulting in a generic error to the user rather than a fallback. Lines 2404-2432.
```js
2404 async function sendList(to, body, buttonText, sections) {
2415   await axios.post(`https://graph.facebook.com/v18.0/${PHONE_ID}/messages`, { ... });
}
```
- [LOW] `sendImage` errors propagate without a fallback; in broadcast loop they are caught, but elsewhere failures will bubble to global handler. Lines 2197-2203, 3151-3163.
```js
2197 async function sendImage(to, imageId, caption) { await axios.post(...); }
```

**DATA INTEGRITY**
- [HIGH] `users.json` and related JSON files are written with no locking/atomic writes. Concurrent webhook + cron writes can clobber data (lost updates) or leave partial JSON if the process crashes mid-write. Lines 419-424, 5084-5099.
```js
419 function loadUsers() { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8") || "{}"); }
424 function saveUsers(u) { fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2)); }
5084 const CRON_STATE_FILE = './cron-state.json';
5098 fs.writeFileSync(CRON_STATE_FILE, JSON.stringify(state, null, 2));
```
- [MEDIUM] `saveUsers(loadUsers())` pattern overwrites in-memory changes made earlier in the same handler (see BUGS) which can silently drop flags and state updates. Lines 2321-2361.

**QUICK WINS**
- [HIGH] Add auth to all admin endpoints (`/admin`, `/dashboard`, `/api/*`, `/admin/*`) and lock down write endpoints; remove or rotate hardcoded secrets. Lines 13, 29-32, 5660-5898.
- [HIGH] Replace `execSync` with a safe API or pass args as an array (no shell) to prevent injection in `appendToFoodLogSheet`. Lines 426-446.
- [MEDIUM] Fix trial duration consistency by using `TRIAL_DAYS` everywhere and basing days-left on `trialStartDate`. Lines 26-28, 176-181, 4277-4288.
- [MEDIUM] Persist user flags correctly by saving the already-loaded `users` object instead of `saveUsers(loadUsers())`. Lines 2317-2361.
- [MEDIUM] Update access checks to honor `isPro` or remove the admin `pro-on/off` commands if not used. Lines 114-129, 4388-4404.
- [LOW] Cache large `overrides/simple` maps outside `estimateCalories` and reduce sync I/O in hot paths. Lines 1053-1054, 1093-1320, 419-424.

