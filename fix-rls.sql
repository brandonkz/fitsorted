-- FitSorted: Enable RLS on ALL tables + read-only policies for food tables
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run

-- 1. Enable RLS on every table (blocks all access by default)
ALTER TABLE IF EXISTS public."foods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."food_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."weight_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."water_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."exercise_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."workouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."glp1_tracker" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."referrers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."listings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."sa_foods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."branded_foods" ENABLE ROW LEVEL SECURITY;

-- 2. Allow anonymous READ on food reference tables (bot needs this)
DROP POLICY IF EXISTS "anon_read" ON public."foods";
CREATE POLICY "anon_read" ON public."foods" FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon_read" ON public."sa_foods";
CREATE POLICY "anon_read" ON public."sa_foods" FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon_read" ON public."branded_foods";
CREATE POLICY "anon_read" ON public."branded_foods" FOR SELECT TO anon USING (true);

-- 3. Everything else (users, food_log, weight_log, etc.) has NO anon access
-- The bot uses local JSON for user data, so these tables don't need anon policies
-- Service role key can still access everything (for admin/migration use)
