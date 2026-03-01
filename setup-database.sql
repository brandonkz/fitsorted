-- FitSorted MVP database schema for Supabase
-- Tables: users, foods, food_log, workouts, weight_log, water_log, glp1_tracker, subscriptions

-- Extensions
create extension if not exists "uuid-ossp";

-- USERS
create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  phone text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  goal text not null check (goal in ('build_muscle','lose_fat','maintain','glp1')),
  weight_kg numeric(6,2),
  height_cm numeric(5,1),
  age int,
  sex text check (sex in ('male','female','other')),

  tdee int,
  calorie_target int,
  protein_target int,
  carb_target int,
  fat_target int,

  onboarding_step text default 'goal',
  timezone text default 'Africa/Johannesburg',
  last_active_at timestamptz,

  glp1_enabled boolean default false
);

create index if not exists idx_users_phone on public.users(phone);

-- FOODS
create table if not exists public.foods (
  id bigserial primary key,
  name text not null,
  name_alt text[] default '{}',
  category text,
  calories int not null,
  protein numeric(6,2) not null,
  carbs numeric(6,2) not null,
  fat numeric(6,2) not null,
  serving text not null,
  source text,
  brand text,
  kj int
);

create index if not exists idx_foods_name on public.foods using gin (to_tsvector('simple', name));
create index if not exists idx_foods_name_alt on public.foods using gin (name_alt);

-- FOOD LOG
create table if not exists public.food_log (
  id bigserial primary key,
  user_id uuid references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  description text not null,
  calories int not null,
  protein numeric(6,2) not null,
  carbs numeric(6,2) not null,
  fat numeric(6,2) not null,
  kj int,
  source text default 'ai'
);

create index if not exists idx_food_log_user_time on public.food_log(user_id, created_at desc);

-- WORKOUTS
create table if not exists public.workouts (
  id bigserial primary key,
  user_id uuid references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  description text not null,
  type text,
  volume_kg numeric(10,2)
);

create index if not exists idx_workouts_user_time on public.workouts(user_id, created_at desc);

-- WEIGHT LOG
create table if not exists public.weight_log (
  id bigserial primary key,
  user_id uuid references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  weight_kg numeric(6,2) not null
);

create index if not exists idx_weight_log_user_time on public.weight_log(user_id, created_at desc);

-- WATER LOG (daily totals)
create table if not exists public.water_log (
  id bigserial primary key,
  user_id uuid references public.users(id) on delete cascade,
  date date not null,
  glasses int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, date)
);

create index if not exists idx_water_log_user_date on public.water_log(user_id, date);

-- GLP-1 TRACKER
create table if not exists public.glp1_tracker (
  id bigserial primary key,
  user_id uuid references public.users(id) on delete cascade,
  medication text not null,
  dose text not null,
  injection_day text not null,
  start_date date,
  last_injection_date date,
  last_injection_site text,
  side_effects text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_glp1_user on public.glp1_tracker(user_id);

-- SUBSCRIPTIONS
create table if not exists public.subscriptions (
  id bigserial primary key,
  user_id uuid references public.users(id) on delete cascade,
  status text not null check (status in ('trial','active','past_due','canceled')),
  started_at timestamptz not null default now(),
  ends_at timestamptz,
  provider text default 'yoco',
  external_id text
);

create index if not exists idx_subscriptions_user on public.subscriptions(user_id);

-- RLS
alter table public.users enable row level security;
alter table public.foods enable row level security;
alter table public.food_log enable row level security;
alter table public.workouts enable row level security;
alter table public.weight_log enable row level security;
alter table public.water_log enable row level security;
alter table public.glp1_tracker enable row level security;
alter table public.subscriptions enable row level security;

-- Policies: allow service role/full access; anon read foods
-- Note: For production, use service role on server. Anon key should only read foods.

do $$ begin
  create policy "Foods are readable by anon" on public.foods for select to anon using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Users are readable by authenticated" on public.users for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Users are writable by authenticated" on public.users for insert to authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Food log readable" on public.food_log for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Food log writable" on public.food_log for insert to authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Workouts readable" on public.workouts for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Workouts writable" on public.workouts for insert to authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Weight log readable" on public.weight_log for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Weight log writable" on public.weight_log for insert to authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Water log readable" on public.water_log for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Water log writable" on public.water_log for insert, update to authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "GLP1 readable" on public.glp1_tracker for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "GLP1 writable" on public.glp1_tracker for insert, update to authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Subscriptions readable" on public.subscriptions for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Subscriptions writable" on public.subscriptions for insert, update to authenticated with check (true);
exception when duplicate_object then null;
end $$;
