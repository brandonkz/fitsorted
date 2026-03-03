-- Create SA Foods table for FitSorted
CREATE TABLE IF NOT EXISTS sa_foods (
  id SERIAL PRIMARY KEY,
  food_name TEXT NOT NULL,
  keywords TEXT[] NOT NULL,
  calories INTEGER NOT NULL,
  protein DECIMAL,
  carbs DECIMAL,
  fat DECIMAL,
  chain TEXT,
  verified BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE sa_foods ENABLE ROW LEVEL SECURITY;

-- Allow public read access
DROP POLICY IF EXISTS "Public read access" ON sa_foods;
CREATE POLICY "Public read access" ON sa_foods FOR SELECT USING (true);

-- Create index on keywords for fast searching
CREATE INDEX IF NOT EXISTS idx_sa_foods_keywords ON sa_foods USING GIN(keywords);
