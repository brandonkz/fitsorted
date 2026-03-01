-- Exercise logs table for FitSorted
CREATE TABLE IF NOT EXISTS exercise_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  activity text NOT NULL,
  type text DEFAULT 'other' CHECK (type IN ('cardio', 'weights', 'sport', 'other')),
  duration_min integer,
  calories_burned integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Index for fast daily lookups
CREATE INDEX IF NOT EXISTS idx_exercise_logs_user_date ON exercise_logs(user_id, date);
