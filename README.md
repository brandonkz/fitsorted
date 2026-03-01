# FitSorted WhatsApp Bot MVP

Production-ready MVP for a South African WhatsApp nutrition companion. Logs food, tracks water, weight, workouts, and GLP-1 meds, and provides daily summaries.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create `.env`:

```bash
SUPABASE_URL=https://fuddzrlnbrseofguuikp.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
WHATSAPP_TOKEN=YOUR_WHATSAPP_TOKEN
WHATSAPP_PHONE_ID=YOUR_WHATSAPP_PHONE_ID
WHATSAPP_VERIFY_TOKEN=YOUR_WEBHOOK_VERIFY_TOKEN
PORT=3000
```

3. Set up Supabase tables:

- Run `setup-database.sql` in the Supabase SQL editor.
- Run `seed-foods.sql` to load the SA foods database.

4. Start the server:

```bash
npm start
```

5. Configure Meta WhatsApp Cloud API webhook:

- Callback URL: `https://your-domain.com/webhook`
- Verify token: `WHATSAPP_VERIFY_TOKEN`

## Notes

- The server uses the Supabase anon key by default. For production, use a Supabase service role key with proper server-only storage and adjust RLS as needed.
- `OPENAI_API_KEY` is optional. If omitted, the bot will fall back to a basic food match from the database.
- Food parsing uses GPT-4o-mini to interpret text and log macros.

## Commands

- Log food: `"2 eggs on toast"`
- Summary: `"summary"` or `"today"`
- Water: `"water"` or `"💧"`
- Weight: `"weight 87.4"`
- Workout: `"workout"` or `"trained"`
- GLP-1: `"ozempic"`
- Help: `"help"`

## Files

- `bot.js` — Express webhook server and WhatsApp handler
- `setup-database.sql` — Supabase schema and RLS
- `seed-foods.sql` — SA foods seed data (50+ items)
- `package.json` — dependencies
