-- FitSorted: Combined seed file (run in Supabase SQL editor)
-- 1. Exercise logs table
-- 2. Unique constraint on foods.name
-- 3. All SA foods (~310 items)
-- 4. Referral system tables

-- ============================================
-- EXERCISE LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.exercise_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  date text NOT NULL,
  activity text NOT NULL,
  type text DEFAULT 'other',
  duration_min integer,
  calories_burned integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- UNIQUE CONSTRAINT ON FOODS NAME
-- ============================================
DO $$ BEGIN
  ALTER TABLE public.foods ADD CONSTRAINT foods_name_unique UNIQUE (name);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- ============================================
-- REFERRAL SYSTEM
-- ============================================
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referred_by text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_code text;
DO $$ BEGIN
  ALTER TABLE public.users ADD CONSTRAINT users_referral_code_unique UNIQUE (referral_code);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.referrers (
  id bigserial PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  commission_pct numeric(5,2) NOT NULL DEFAULT 20,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referrers DISABLE ROW LEVEL SECURITY;

-- ============================================
-- SA FOODS v1 (151 items)
-- ============================================
INSERT INTO public.foods (name, calories, protein, carbs, fat, kj, serving, category) VALUES

-- CRACKERS & CRISPBREADS
('Finn Crisp thin rye crispbread', 20, 1, 4, 0.2, 84, '1 slice (6g)', 'snacks'),
('Finn Crisp round crispbread', 40, 1, 8, 0.4, 168, '1 round (12g)', 'snacks'),
('Provita wholewheat crispbread', 30, 1, 5, 0.7, 126, '1 crispbread (7.5g)', 'snacks'),
('Salticrax crackers', 30, 1, 5, 1, 126, '1 cracker (7g)', 'snacks'),
('Bakers Mini Cheddars', 170, 3, 19, 9, 714, '1 packet (33g)', 'snacks'),
('Bakers Eet-Sum-Mor shortbread', 80, 1, 10, 4, 336, '2 biscuits (16g)', 'snacks'),
('Bakers Blue Label Marie biscuits', 50, 1, 8, 1.5, 210, '2 biscuits (12g)', 'snacks'),
('Bakers Tennis biscuits', 70, 1, 10, 3, 294, '2 biscuits (15g)', 'snacks'),
('Ryvita crispbread', 35, 1, 7, 0.3, 147, '1 slice (10g)', 'snacks'),
('Rice cake plain', 35, 1, 7, 0.3, 147, '1 cake (9g)', 'snacks'),
('Rice cake with chocolate', 60, 1, 10, 2, 252, '1 cake (12g)', 'snacks'),

-- CHIPS & CRISPS
('Simba chips original (small)', 200, 2, 22, 11, 840, '1 packet (36g)', 'snacks'),
('Simba chips (large)', 530, 6, 55, 30, 2226, '1 packet (120g)', 'snacks'),
('Lay''s chips original (small)', 190, 2, 21, 11, 798, '1 packet (36g)', 'snacks'),
('Doritos nacho cheese (small)', 180, 2, 22, 9, 756, '1 packet (35g)', 'snacks'),
('NikNaks (small)', 195, 2, 22, 11, 819, '1 packet (35g)', 'snacks'),
('Willards Flings (small)', 160, 2, 19, 8, 672, '1 packet (30g)', 'snacks'),
('Kelp chips', 45, 2, 5, 2, 189, '1 serving (15g)', 'snacks'),
('Biltong sliced', 250, 50, 1, 5, 1050, '100g', 'snacks'),
('Biltong snap sticks', 80, 14, 1, 2.5, 336, '1 stick (25g)', 'snacks'),
('Droëwors', 280, 45, 2, 10, 1176, '100g', 'snacks'),

-- DRINKS - ALCOHOLIC
('Margarita cocktail', 275, 0, 20, 0, 1155, '1 glass (250ml)', 'drinks'),
('Castle Lager beer', 150, 1, 12, 0, 630, '1 can (340ml)', 'drinks'),
('Castle Lite beer', 110, 1, 7, 0, 462, '1 can (340ml)', 'drinks'),
('Windhoek Lager beer', 145, 1, 11, 0, 609, '1 can (340ml)', 'drinks'),
('Savanna Dry cider', 190, 0, 17, 0, 798, '1 bottle (330ml)', 'drinks'),
('Hunters Dry cider', 180, 0, 15, 0, 756, '1 bottle (330ml)', 'drinks'),
('Hunters Gold cider', 200, 0, 20, 0, 840, '1 bottle (330ml)', 'drinks'),
('Glass of red wine', 125, 0, 4, 0, 525, '1 glass (150ml)', 'drinks'),
('Glass of white wine', 120, 0, 4, 0, 504, '1 glass (150ml)', 'drinks'),
('Gin and tonic', 170, 0, 14, 0, 714, '1 glass (250ml)', 'drinks'),
('Vodka and soda', 97, 0, 0, 0, 407, '1 glass (250ml)', 'drinks'),
('Whisky neat', 70, 0, 0, 0, 294, '1 shot (30ml)', 'drinks'),
('Amarula cream liqueur', 155, 1, 19, 5, 651, '1 shot (50ml)', 'drinks'),
('Jagermeister', 105, 0, 12, 0, 441, '1 shot (30ml)', 'drinks'),
('Smirnoff Spin', 200, 0, 25, 0, 840, '1 bottle (300ml)', 'drinks'),
('Brutal Fruit Spritzer', 160, 0, 18, 0, 672, '1 bottle (275ml)', 'drinks'),

-- DRINKS - NON-ALCOHOLIC
('Coca-Cola', 140, 0, 39, 0, 588, '1 can (330ml)', 'drinks'),
('Coca-Cola Zero', 0, 0, 0, 0, 0, '1 can (330ml)', 'drinks'),
('Sprite', 130, 0, 33, 0, 546, '1 can (330ml)', 'drinks'),
('Fanta Orange', 160, 0, 42, 0, 672, '1 can (330ml)', 'drinks'),
('Appletiser', 150, 0, 37, 0, 630, '1 bottle (330ml)', 'drinks'),
('Stoney ginger beer', 145, 0, 38, 0, 609, '1 can (330ml)', 'drinks'),
('Rooibos tea no sugar', 2, 0, 0, 0, 8, '1 cup (250ml)', 'drinks'),
('Five Roses tea with milk', 15, 1, 2, 0.5, 63, '1 cup (250ml)', 'drinks'),
('Coffee black no sugar', 5, 0, 0, 0, 21, '1 cup (250ml)', 'drinks'),
('Coffee with milk and sugar', 50, 1, 8, 1.5, 210, '1 cup (250ml)', 'drinks'),
('Cappuccino', 80, 4, 8, 3, 336, '1 cup (250ml)', 'drinks'),
('Latte', 120, 6, 10, 5, 504, '1 cup (350ml)', 'drinks'),
('BOS Iced Tea lemon', 90, 0, 22, 0, 378, '1 can (330ml)', 'drinks'),
('Powerade sports drink', 130, 0, 33, 0, 546, '1 bottle (500ml)', 'drinks'),

-- FAST FOOD - NANDO'S
('Nandos quarter chicken', 290, 37, 0, 15, 1218, '1 quarter', 'fast food'),
('Nandos half chicken', 580, 74, 0, 30, 2436, '1 half', 'fast food'),
('Nandos peri-peri chips regular', 380, 5, 48, 18, 1596, '1 regular', 'fast food'),
('Nandos corn on the cob', 120, 4, 20, 3, 504, '1 cob', 'fast food'),
('Nandos coleslaw', 110, 1, 8, 8, 462, '1 regular', 'fast food'),
('Nandos garlic bread', 270, 6, 30, 14, 1134, '1 portion', 'fast food'),
('Nandos prego roll', 550, 40, 45, 20, 2310, '1 roll', 'fast food'),

-- FAST FOOD - KFC
('KFC original recipe piece (breast)', 320, 29, 11, 18, 1344, '1 piece', 'fast food'),
('KFC original recipe piece (thigh)', 250, 18, 8, 16, 1050, '1 piece', 'fast food'),
('KFC Streetwise Two', 470, 27, 30, 26, 1974, '1 meal', 'fast food'),
('KFC Zinger burger', 480, 25, 40, 24, 2016, '1 burger', 'fast food'),
('KFC chips regular', 320, 4, 40, 16, 1344, '1 regular', 'fast food'),
('KFC coleslaw', 150, 1, 12, 11, 630, '1 regular', 'fast food'),

-- FAST FOOD - MCDONALDS
('Big Mac', 540, 25, 45, 28, 2268, '1 burger', 'fast food'),
('McChicken', 400, 15, 40, 20, 1680, '1 burger', 'fast food'),
('McDonalds medium fries', 340, 4, 42, 16, 1428, '1 medium', 'fast food'),
('McDonalds McFlurry Oreo', 340, 8, 50, 12, 1428, '1 regular', 'fast food'),

-- FAST FOOD - STEERS
('Steers King Steer burger', 650, 35, 45, 35, 2730, '1 burger', 'fast food'),
('Steers Wacky Wednesday burger', 450, 22, 38, 22, 1890, '1 burger', 'fast food'),
('Steers chips regular', 350, 5, 44, 17, 1470, '1 regular', 'fast food'),
('Steers onion rings', 280, 4, 30, 16, 1176, '1 regular', 'fast food'),

-- FAST FOOD - OTHER
('Debonairs medium Margherita pizza', 200, 9, 24, 7, 840, '1 slice', 'fast food'),
('Debonairs medium Something Meaty pizza', 250, 12, 24, 12, 1050, '1 slice', 'fast food'),
('Romans medium pizza slice', 220, 10, 25, 9, 924, '1 slice', 'fast food'),
('Fishaways 2 piece fish and chips', 650, 30, 55, 32, 2730, '1 meal', 'fast food'),
('Spur burger classic', 580, 30, 42, 30, 2436, '1 burger', 'fast food'),
('Ocean Basket grilled fish', 250, 35, 5, 10, 1050, '1 portion', 'fast food'),
('Vida e Caffe cappuccino', 90, 4, 9, 4, 378, '1 regular', 'drinks'),
('Vida e Caffe croissant', 280, 5, 28, 17, 1176, '1 croissant', 'bakery'),

-- BREAD & BAKERY
('White bread slice', 75, 3, 14, 1, 315, '1 slice (30g)', 'bread'),
('Brown bread slice', 70, 3, 13, 1, 294, '1 slice (30g)', 'bread'),
('Wholewheat bread slice', 70, 4, 12, 1, 294, '1 slice (30g)', 'bread'),
('Plain bagel', 245, 9, 48, 1.5, 1029, '1 bagel (100g)', 'bread'),
('Half a plain bagel', 123, 5, 24, 0.8, 517, '1/2 bagel (50g)', 'bread'),
('Woolworths croissant', 230, 5, 24, 13, 966, '1 croissant (55g)', 'bakery'),
('Woolworths muffin blueberry', 350, 5, 45, 17, 1470, '1 muffin (100g)', 'bakery'),
('Vetkoek plain', 250, 5, 30, 12, 1050, '1 vetkoek', 'bread'),
('Vetkoek with mince', 400, 18, 32, 20, 1680, '1 vetkoek', 'bread'),
('Roti plain', 200, 5, 30, 7, 840, '1 roti', 'bread'),
('Samoosa chicken', 150, 6, 15, 7, 630, '1 samoosa', 'snacks'),
('Samoosa mince', 160, 7, 14, 8, 672, '1 samoosa', 'snacks'),

-- BREAKFAST
('Jungle Oats porridge', 150, 5, 27, 3, 630, '1 cup cooked (250ml)', 'breakfast'),
('Weet-Bix', 65, 2, 13, 0.5, 273, '1 biscuit (17g)', 'breakfast'),
('ProNutro original', 170, 5, 30, 3, 714, '1 serving (50g) dry', 'breakfast'),
('Muesli with milk', 250, 8, 40, 6, 1050, '1 cup (250ml)', 'breakfast'),
('Yoghurt fruit (Woolworths)', 130, 5, 20, 3, 546, '1 tub (150g)', 'breakfast'),
('Yoghurt plain Greek', 100, 10, 6, 4, 420, '1 tub (150g)', 'breakfast'),
('Boiled egg', 78, 6, 0.6, 5, 328, '1 large egg', 'breakfast'),
('Scrambled eggs (2 eggs)', 180, 13, 2, 13, 756, '2 eggs', 'breakfast'),
('Fried egg', 90, 6, 0.4, 7, 378, '1 egg', 'breakfast'),
('Avocado half', 120, 1.5, 6, 11, 504, '1/2 avocado (68g)', 'breakfast'),
('Rusk buttermilk', 130, 3, 20, 4.5, 546, '1 rusk (35g)', 'breakfast'),
('Ouma rusk buttermilk', 130, 3, 20, 4.5, 546, '1 rusk (35g)', 'breakfast'),
('Ouma rusk condensed milk', 140, 3, 22, 5, 588, '1 rusk (35g)', 'breakfast'),
('Bacon rasher fried', 45, 3, 0, 3.5, 189, '1 rasher (8g)', 'breakfast'),
('Toast with butter', 110, 3, 14, 5, 462, '1 slice', 'breakfast'),
('Toast with peanut butter', 160, 6, 15, 9, 672, '1 slice', 'breakfast'),

-- COMMON MEALS
('Chicken breast grilled', 165, 31, 0, 3.6, 693, '100g', 'protein'),
('Chicken thigh grilled', 210, 26, 0, 11, 882, '100g', 'protein'),
('Steak rump grilled', 200, 30, 0, 8, 840, '100g', 'protein'),
('Boerewors grilled', 280, 15, 5, 22, 1176, '1 piece (100g)', 'protein'),
('Pork chop grilled', 230, 26, 0, 13, 966, '1 chop (100g)', 'protein'),
('Lamb chop grilled', 250, 25, 0, 16, 1050, '1 chop (100g)', 'protein'),
('Hake grilled', 90, 20, 0, 1, 378, '100g', 'protein'),
('Tuna canned in brine', 110, 25, 0, 1, 462, '1 can (170g drained)', 'protein'),
('Pilchards in tomato sauce', 190, 17, 4, 12, 798, '1 can (215g)', 'protein'),
('Rice white cooked', 200, 4, 44, 0.4, 840, '1 cup (185g)', 'carbs'),
('Rice brown cooked', 215, 5, 45, 1.8, 903, '1 cup (195g)', 'carbs'),
('Pap (maize porridge)', 120, 3, 26, 0.5, 504, '1 cup (250ml)', 'carbs'),
('Samp and beans', 180, 8, 32, 1.5, 756, '1 cup (250ml)', 'carbs'),
('Mashed potatoes', 180, 3, 30, 6, 756, '1 cup (250ml)', 'carbs'),
('Baked potato', 160, 4, 36, 0.2, 672, '1 medium (150g)', 'carbs'),
('Sweet potato baked', 115, 2, 27, 0.1, 483, '1 medium (130g)', 'carbs'),
('Chakalaka', 60, 2, 10, 1.5, 252, '1/2 cup (125ml)', 'sides'),
('Creamed spinach', 100, 3, 5, 8, 420, '1/2 cup (125ml)', 'sides'),
('Butternut soup', 80, 2, 15, 2, 336, '1 cup (250ml)', 'soups'),
('Tomato bredie', 250, 18, 15, 12, 1050, '1 serving (300ml)', 'meals'),
('Bobotie', 300, 20, 15, 18, 1260, '1 serving (250g)', 'meals'),
('Bunny chow chicken', 600, 25, 65, 25, 2520, '1 quarter loaf', 'meals'),
('Bunny chow beans', 500, 18, 70, 15, 2100, '1 quarter loaf', 'meals'),
('Gatsby steak', 800, 30, 80, 38, 3360, '1/2 gatsby', 'meals'),
('Braai sosatie', 180, 18, 5, 10, 756, '1 stick', 'protein'),

-- FRUIT
('Banana', 105, 1.3, 27, 0.4, 441, '1 medium (120g)', 'fruit'),
('Apple', 72, 0.4, 19, 0.2, 302, '1 medium (150g)', 'fruit'),
('Orange', 62, 1.2, 15, 0.2, 260, '1 medium (130g)', 'fruit'),
('Grapes', 70, 0.7, 18, 0.2, 294, '1 cup (150g)', 'fruit'),
('Watermelon', 45, 0.9, 11, 0.2, 189, '1 cup diced (150g)', 'fruit'),
('Mango', 100, 1.4, 25, 0.6, 420, '1 cup (165g)', 'fruit'),
('Naartjie', 45, 0.7, 11, 0.2, 189, '1 medium (80g)', 'fruit'),

-- DAIRY & SUPPLEMENTS
('Full cream milk', 150, 8, 12, 8, 630, '1 glass (250ml)', 'dairy'),
('Low fat milk', 100, 8, 12, 2.5, 420, '1 glass (250ml)', 'dairy'),
('Cheddar cheese slice', 80, 5, 0.4, 6.5, 336, '1 slice (20g)', 'dairy'),
('USN whey protein shake', 120, 24, 3, 1.5, 504, '1 scoop (30g) with water', 'supplements'),
('NPL whey protein shake', 115, 22, 4, 1.5, 483, '1 scoop (30g) with water', 'supplements'),
('Protein bar (average)', 200, 20, 22, 7, 840, '1 bar (60g)', 'supplements'),

-- WOOLWORTHS READY MEALS
('Woolworths chicken wrap', 350, 20, 35, 14, 1470, '1 wrap', 'meals'),
('Woolworths butter chicken', 380, 22, 35, 16, 1596, '1 meal (350g)', 'meals'),
('Woolworths lasagne', 420, 18, 40, 20, 1764, '1 meal (350g)', 'meals'),
('Woolworths chicken pie', 380, 14, 30, 23, 1596, '1 pie (200g)', 'meals'),
('Woolworths sushi 9 piece', 350, 12, 55, 8, 1470, '1 pack (9pc)', 'meals')

ON CONFLICT (name) DO UPDATE SET
  calories = EXCLUDED.calories,
  protein = EXCLUDED.protein,
  carbs = EXCLUDED.carbs,
  fat = EXCLUDED.fat,
  kj = EXCLUDED.kj,
  serving = EXCLUDED.serving,
  category = EXCLUDED.category;

-- ============================================
-- SA FOODS v2 (160 items)
-- ============================================
INSERT INTO public.foods (name, calories, protein, carbs, fat, kj, serving, category) VALUES

-- SA DESSERTS & SWEET TREATS
('Koeksister', 200, 2, 35, 7, 840, '1 koeksister (60g)', 'desserts'),
('Cape Malay koeksister', 180, 3, 28, 6, 756, '1 piece (55g)', 'desserts'),
('Melktert (milk tart)', 149, 5, 18, 7, 626, '1 slice (90g)', 'desserts'),
('Malva pudding', 280, 4, 38, 13, 1176, '1 serving (120g)', 'desserts'),
('Peppermint crisp tart', 320, 4, 32, 20, 1344, '1 slice (100g)', 'desserts'),
('Hertzoggies', 150, 2, 20, 7, 630, '1 piece (45g)', 'desserts'),
('Pannekoek (SA pancake)', 120, 3, 18, 4, 504, '1 pancake plain', 'desserts'),
('Pannekoek with cinnamon sugar', 160, 3, 28, 5, 672, '1 pancake', 'desserts'),
('Lemon meringue pie', 280, 4, 40, 12, 1176, '1 slice (120g)', 'desserts'),
('Chocolate mousse', 200, 4, 22, 11, 840, '1 serving (100g)', 'desserts'),
('Magnum ice cream classic', 260, 4, 26, 16, 1092, '1 bar', 'desserts'),
('Cornetto ice cream', 220, 3, 28, 11, 924, '1 cone', 'desserts'),
('Ola ice cream tub vanilla', 140, 2, 16, 7, 588, '1/2 cup (70g)', 'desserts'),
('Woolworths chocolate brownie', 280, 4, 34, 15, 1176, '1 brownie (70g)', 'desserts'),
('Doughnut glazed', 250, 4, 31, 12, 1050, '1 doughnut', 'desserts'),
('Bakers Good Morning biscuit', 70, 1, 11, 2.5, 294, '1 biscuit (18g)', 'snacks'),
('Romany Creams chocolate', 65, 1, 8, 3.5, 273, '1 biscuit (14g)', 'snacks'),
('Oreo biscuit', 53, 0.5, 8, 2.3, 223, '1 biscuit (11g)', 'snacks'),
('Bar One chocolate bar', 230, 3, 30, 11, 966, '1 bar (55g)', 'snacks'),
('Lunch Bar', 250, 4, 30, 13, 1050, '1 bar (52g)', 'snacks'),
('PS chocolate bar', 200, 3, 25, 10, 840, '1 bar (48g)', 'snacks'),
('Cadbury Dairy Milk slab', 240, 3, 26, 14, 1008, '1 row (45g)', 'snacks'),
('Astros chocolate', 200, 3, 25, 10, 840, '1 packet (40g)', 'snacks'),
('Jelly Babies', 170, 3, 39, 0, 714, '1 packet (50g)', 'snacks'),
('Wine Gums', 170, 3, 39, 0, 714, '1 packet (50g)', 'snacks'),

-- TRADITIONAL SA MEALS
('Umngqusho (samp and beans)', 180, 8, 32, 1.5, 756, '1 cup (250ml)', 'meals'),
('Morogo (wild spinach)', 35, 3, 4, 0.5, 147, '1 cup cooked (150g)', 'meals'),
('Mogodu (tripe)', 150, 18, 2, 8, 630, '1 serving (200g)', 'meals'),
('Potjiekos beef', 350, 25, 20, 18, 1470, '1 serving (300ml)', 'meals'),
('Potjiekos chicken', 280, 22, 18, 13, 1176, '1 serving (300ml)', 'meals'),
('Curry lamb Cape Malay', 320, 22, 12, 20, 1344, '1 serving (250g)', 'meals'),
('Curry chicken SA', 250, 22, 10, 14, 1050, '1 serving (250g)', 'meals'),
('Durban curry mutton', 350, 24, 12, 22, 1470, '1 serving (250g)', 'meals'),
('Breyani chicken', 400, 20, 50, 14, 1680, '1 serving (350g)', 'meals'),
('Breyani lamb', 450, 22, 48, 18, 1890, '1 serving (350g)', 'meals'),
('Waterblommetjiebredie', 230, 16, 12, 13, 966, '1 serving (300ml)', 'meals'),
('Denningvleis', 280, 24, 8, 17, 1176, '1 serving (250g)', 'meals'),
('Frikkadel (SA meatball)', 120, 10, 6, 7, 504, '1 meatball (60g)', 'meals'),
('Sosatie chicken', 160, 20, 4, 7, 672, '1 stick', 'meals'),
('Mieliepap and wors', 400, 18, 45, 16, 1680, '1 plate', 'meals'),
('Braaibroodjie (braai sandwich)', 300, 10, 28, 16, 1260, '1 sandwich', 'meals'),
('Vetkoek with polony', 350, 10, 30, 20, 1470, '1 vetkoek', 'meals'),
('Achar pickle', 30, 0.5, 6, 0.5, 126, '1 tbsp (15g)', 'condiments'),

-- MORE FAST FOOD & TAKEAWAY
('Rocomamas Smash burger', 550, 28, 38, 30, 2310, '1 burger', 'fast food'),
('Barcelos flame grilled chicken quarter', 300, 35, 2, 17, 1260, '1 quarter', 'fast food'),
('Chicken Licken hot wings (6)', 420, 28, 18, 26, 1764, '6 wings', 'fast food'),
('Chicken Licken Big John burger', 520, 24, 42, 28, 2184, '1 burger', 'fast food'),
('Wimpy hamburger', 450, 22, 38, 22, 1890, '1 burger', 'fast food'),
('Wimpy breakfast standard', 650, 28, 45, 38, 2730, '1 plate', 'fast food'),
('Galito''s quarter chicken', 280, 33, 2, 15, 1176, '1 quarter', 'fast food'),
('King Pie steak and kidney', 380, 12, 32, 22, 1596, '1 pie (150g)', 'fast food'),
('King Pie chicken', 350, 11, 30, 20, 1470, '1 pie (150g)', 'fast food'),
('Shoprite deli rotisserie chicken quarter', 260, 30, 0, 15, 1092, '1 quarter', 'fast food'),
('Woolworths roast chicken quarter', 270, 32, 0, 15, 1134, '1 quarter', 'fast food'),
('Pie City steak pie', 400, 12, 34, 24, 1680, '1 pie', 'fast food'),
('Sausage roll (Checkers bakery)', 280, 8, 24, 17, 1176, '1 roll', 'fast food'),

-- GROCERY STAPLES
('Peanut butter (Black Cat)', 95, 4, 3, 8, 399, '1 tbsp (16g)', 'spreads'),
('Marmite', 10, 2, 0.5, 0, 42, '1 tsp (5g)', 'spreads'),
('Bovril', 10, 2, 0.5, 0, 42, '1 tsp (5g)', 'spreads'),
('Apricot jam', 50, 0, 13, 0, 210, '1 tbsp (20g)', 'spreads'),
('Nutella', 100, 1, 11, 6, 420, '1 tbsp (18g)', 'spreads'),
('Butter', 72, 0, 0, 8, 302, '1 pat (10g)', 'spreads'),
('Margarine (Rama)', 55, 0, 0, 6, 231, '1 tsp (7g)', 'spreads'),
('Mayonnaise (Hellmanns)', 95, 0, 0.5, 10, 399, '1 tbsp (15g)', 'condiments'),
('Tomato sauce (All Gold)', 15, 0, 4, 0, 63, '1 tbsp (15g)', 'condiments'),
('Mrs Balls chutney', 35, 0, 9, 0, 147, '1 tbsp (15g)', 'condiments'),
('Nandos peri-peri sauce', 5, 0, 1, 0, 21, '1 tbsp (15g)', 'condiments'),
('Hummus', 25, 1, 2, 1.5, 105, '1 tbsp (15g)', 'condiments'),
('Cottage cheese low fat', 80, 12, 3, 2, 336, '100g', 'dairy'),
('Cream cheese Philadelphia', 50, 1, 0.5, 5, 210, '1 tbsp (15g)', 'dairy'),
('Feta cheese', 75, 4, 1, 6, 315, '30g', 'dairy'),
('Amasi (sour milk)', 60, 3, 5, 3, 252, '1 glass (200ml)', 'dairy'),
('Maas (buttermilk)', 55, 3, 5, 2.5, 231, '1 glass (200ml)', 'dairy'),
('Danone Activia yoghurt', 90, 4, 14, 2, 378, '1 tub (125g)', 'dairy'),
('YogiBear drinking yoghurt', 130, 3, 22, 3, 546, '1 bottle (250ml)', 'dairy'),

-- NUTS & SEEDS
('Peanuts roasted salted', 170, 7, 5, 14, 714, '30g handful', 'snacks'),
('Almonds raw', 170, 6, 6, 15, 714, '30g (23 nuts)', 'snacks'),
('Cashews roasted', 160, 5, 9, 13, 672, '30g handful', 'snacks'),
('Macadamia nuts', 200, 2, 4, 21, 840, '30g (10 nuts)', 'snacks'),
('Mixed nuts and raisins', 150, 4, 14, 10, 630, '30g handful', 'snacks'),
('Sunflower seeds', 170, 6, 6, 14, 714, '30g', 'snacks'),
('Pecan nuts', 200, 3, 4, 20, 840, '30g (10 halves)', 'snacks'),

-- SALADS & HEALTHY
('Garden salad no dressing', 25, 1.5, 4, 0.3, 105, '1 bowl (150g)', 'salads'),
('Caesar salad with dressing', 200, 8, 10, 14, 840, '1 bowl (200g)', 'salads'),
('Woolworths Thai chicken salad', 280, 18, 20, 14, 1176, '1 pack (250g)', 'salads'),
('Woolworths Greek salad', 180, 6, 8, 14, 756, '1 pack (200g)', 'salads'),
('Tabbouleh salad', 120, 3, 16, 5, 504, '1 cup (150g)', 'salads'),
('Couscous salad', 180, 6, 28, 5, 756, '1 cup (200g)', 'salads'),
('Quinoa cooked', 120, 4, 21, 2, 504, '1/2 cup (90g)', 'carbs'),
('Chickpeas cooked', 135, 7, 23, 2, 567, '1/2 cup (80g)', 'carbs'),
('Lentils cooked', 115, 9, 20, 0.4, 483, '1/2 cup (100g)', 'carbs'),
('Edamame beans', 120, 11, 9, 5, 504, '1/2 cup (80g)', 'protein'),

-- PASTA & NOODLES
('Spaghetti cooked', 200, 7, 40, 1, 840, '1 cup (140g)', 'carbs'),
('Spaghetti bolognese', 380, 18, 45, 14, 1596, '1 plate (350g)', 'meals'),
('Macaroni and cheese', 350, 12, 38, 16, 1470, '1 cup (250ml)', 'meals'),
('Pasta alfredo chicken', 450, 22, 42, 20, 1890, '1 plate (350g)', 'meals'),
('2 Minute Noodles chicken', 380, 8, 50, 16, 1596, '1 packet (70g)', 'meals'),
('Cup Noodles', 290, 6, 38, 12, 1218, '1 cup (65g)', 'meals'),
('Maggi 2 Minute Noodles', 370, 8, 48, 16, 1554, '1 packet (68g)', 'meals'),

-- SANDWICHES & WRAPS
('Polony sandwich white bread', 250, 8, 28, 12, 1050, '2 slices + polony', 'meals'),
('Cheese and tomato sandwich', 280, 10, 30, 13, 1176, '2 slices + filling', 'meals'),
('Ham and cheese sandwich', 300, 14, 28, 14, 1260, '2 slices + filling', 'meals'),
('Tuna mayo sandwich', 320, 16, 28, 15, 1344, '2 slices + filling', 'meals'),
('Egg mayo sandwich', 280, 10, 28, 14, 1176, '2 slices + filling', 'meals'),
('BLT sandwich', 350, 14, 28, 20, 1470, '2 slices + filling', 'meals'),
('Chicken mayo wrap', 380, 18, 35, 18, 1596, '1 wrap', 'meals'),
('Falafel wrap', 350, 12, 40, 16, 1470, '1 wrap', 'meals'),

-- SOUP
('Tomato soup', 90, 2, 16, 2, 378, '1 cup (250ml)', 'soups'),
('Chicken noodle soup', 100, 6, 12, 3, 420, '1 cup (250ml)', 'soups'),
('Minestrone soup', 110, 5, 18, 2, 462, '1 cup (250ml)', 'soups'),
('Oxtail soup', 120, 6, 14, 4, 504, '1 cup (250ml)', 'soups'),
('Knorr Cup-a-Soup', 60, 1, 10, 1.5, 252, '1 sachet', 'soups'),

-- VEGETABLES
('Broccoli steamed', 35, 3, 6, 0.4, 147, '1 cup (150g)', 'vegetables'),
('Carrots cooked', 55, 1, 13, 0.2, 231, '1 cup (150g)', 'vegetables'),
('Green beans steamed', 35, 2, 7, 0.2, 147, '1 cup (125g)', 'vegetables'),
('Peas cooked', 65, 4, 11, 0.3, 273, '1/2 cup (80g)', 'vegetables'),
('Corn on the cob plain', 90, 3, 19, 1.5, 378, '1 cob (100g)', 'vegetables'),
('Gem squash with butter', 80, 2, 10, 4, 336, '1 half', 'vegetables'),
('Beetroot cooked', 45, 2, 10, 0.2, 189, '1/2 cup (85g)', 'vegetables'),
('Mushrooms fried', 60, 3, 3, 4, 252, '1 cup (70g)', 'vegetables'),
('Onion rings fried', 175, 2, 20, 10, 735, '6 rings', 'vegetables'),
('Spinach cooked', 40, 5, 4, 0.5, 168, '1 cup (180g)', 'vegetables'),

-- MORE FRUIT
('Pineapple', 80, 1, 21, 0.2, 336, '1 cup (165g)', 'fruit'),
('Strawberries', 50, 1, 12, 0.5, 210, '1 cup (150g)', 'fruit'),
('Blueberries', 85, 1, 21, 0.5, 357, '1 cup (150g)', 'fruit'),
('Pear', 100, 0.6, 27, 0.2, 420, '1 medium (175g)', 'fruit'),
('Peach', 60, 1.4, 14, 0.4, 252, '1 medium (150g)', 'fruit'),
('Granadilla (passion fruit)', 17, 0.4, 4, 0.1, 71, '1 fruit (18g)', 'fruit'),
('Litchi', 65, 0.8, 17, 0.4, 273, '10 litchis (100g)', 'fruit'),
('Guava', 38, 1.4, 8, 0.5, 160, '1 medium (55g)', 'fruit'),
('Dried mango', 130, 1, 31, 0.5, 546, '40g', 'fruit'),
('Dates medjool', 65, 0.4, 18, 0, 273, '1 date (24g)', 'fruit'),
('Fruit salad fresh', 80, 1, 20, 0.3, 336, '1 cup (175g)', 'fruit'),

-- ENERGY DRINKS
('Red Bull', 110, 0, 27, 0, 462, '1 can (250ml)', 'drinks'),
('Red Bull Sugar Free', 5, 0, 0, 0, 21, '1 can (250ml)', 'drinks'),
('Monster Energy', 110, 0, 28, 0, 462, '1 can (250ml)', 'drinks'),
('Play energy drink', 100, 0, 25, 0, 420, '1 can (250ml)', 'drinks'),
('Switch energy drink', 50, 0, 12, 0, 210, '1 can (250ml)', 'drinks'),
('USN Amino Stim', 10, 0, 2, 0, 42, '1 serving (250ml)', 'drinks'),
('Protein water', 70, 15, 2, 0, 294, '1 bottle (500ml)', 'drinks'),
('Smoothie fruit (Woolworths)', 180, 2, 40, 1, 756, '1 bottle (350ml)', 'drinks'),
('Chocolate milkshake', 350, 10, 50, 12, 1470, '1 large (400ml)', 'drinks'),
('Steri Stumpie chocolate', 200, 7, 28, 6, 840, '1 carton (350ml)', 'drinks'),
('Tropika juice', 150, 0, 38, 0, 630, '1 glass (250ml)', 'drinks'),
('Ceres fruit juice', 130, 0, 32, 0, 546, '1 box (200ml)', 'drinks'),
('Liqui-Fruit', 120, 0, 30, 0, 504, '1 box (200ml)', 'drinks'),

-- TOAST COMBOS
('Toast with Marmite', 90, 4, 14, 2, 378, '1 slice', 'breakfast'),
('Toast with cheese', 140, 7, 14, 7, 588, '1 slice', 'breakfast'),
('Toast with avocado', 155, 3, 16, 9, 651, '1 slice', 'breakfast'),
('Toast with Nutella', 165, 3, 22, 7, 693, '1 slice', 'breakfast'),
('Toast with jam', 120, 3, 26, 1, 504, '1 slice', 'breakfast'),
('Toast with honey', 115, 3, 24, 1, 483, '1 slice', 'breakfast'),

-- COMMON PORTIONS
('Handful of biltong', 80, 16, 0.3, 1.5, 336, '1 handful (30g)', 'snacks'),
('Handful of chips', 80, 1, 9, 4.5, 336, '1 handful (15g)', 'snacks'),
('Tablespoon of olive oil', 120, 0, 0, 14, 504, '1 tbsp (15ml)', 'condiments'),
('Tablespoon of sugar', 50, 0, 13, 0, 210, '1 tbsp (12g)', 'condiments'),
('Teaspoon of honey', 20, 0, 6, 0, 84, '1 tsp (7g)', 'condiments'),
('Teaspoon of sugar', 16, 0, 4, 0, 67, '1 tsp (4g)', 'condiments'),
('Splash of milk in coffee', 10, 0.5, 0.7, 0.5, 42, '30ml', 'dairy')

ON CONFLICT (name) DO UPDATE SET
  calories = EXCLUDED.calories,
  protein = EXCLUDED.protein,
  carbs = EXCLUDED.carbs,
  fat = EXCLUDED.fat,
  kj = EXCLUDED.kj,
  serving = EXCLUDED.serving,
  category = EXCLUDED.category;

-- ============================================
-- NU & WOOLWORTHS BRANDED FOODS (38 items)
-- ============================================
INSERT INTO public.foods (name, name_alt, category, calories, protein, carbs, fat, serving, source, brand, kj) VALUES
('Nu Avo Feta & Trout Omelette', ARRAY['nu omelette','nu trout omelette'], 'restaurant', 553, 43.3, 9, 38.6, '1 serving (337g)', 'Menu', 'Nu', 2313),
('Nu Breakfast Burrito', ARRAY['nu burrito'], 'restaurant', 838, 40, 65, 46, '1 serving', 'Menu', 'Nu', 3504),
('Nu Breakfast Steak Wrap', ARRAY['nu steak wrap'], 'restaurant', 951, 58.1, 43, 61.2, '1 serving (408g)', 'Menu', 'Nu', 3979),
('Nu Breakfast Wrap', ARRAY['nu wrap'], 'restaurant', 770, 36.3, 48, 48.1, '1 wrap', 'Menu', 'Nu', 3221),
('Nu Eggs on Toast (sourdough)', ARRAY['nu eggs on toast'], 'restaurant', 391, 25.2, 33, 17.4, '1 serving', 'Menu', 'Nu', 1635),
('Nu Poached Eggs & Smashed Avo on Toast', ARRAY['nu avo toast','nu smashed avo'], 'restaurant', 533, 19.6, 36, 36.8, '1 serving (sourdough)', 'Menu', 'Nu', 2230),
('Nu Poached Eggs on Greens', ARRAY['nu eggs on greens','nu green breakfast'], 'restaurant', 438, 18.7, 16, 33.4, '1 serving', 'Menu', 'Nu', 1832),
('Nu Protein Breakfast Burrito', ARRAY['nu protein burrito'], 'restaurant', 889, 44, 56, 55, '1 serving (440g)', 'Menu', 'Nu', 3717),
('Nu Pulled Beef Breakfast Wrap', ARRAY['nu pulled beef wrap','nu beef wrap'], 'restaurant', 637, 34.8, 44, 36.1, '1 serving', 'Menu', 'Nu', 2669),
('Nu Scrambled Eggs Avo & Chipotle', ARRAY['nu chipotle eggs','nu chipotle wrap'], 'restaurant', 676, 29.7, 27, 50.5, '1 serving', 'Menu', 'Nu', 2832),
('Nu Scrambled Eggs Avo & Feta on Toast', ARRAY['nu avo feta toast'], 'restaurant', 497, 25.6, 23, 33.8, '1 serving (sourdough)', 'Menu', 'Nu', 2080),
('Nu Spicy Mushroom Egg White Omelette', ARRAY['nu mushroom omelette','nu egg white omelette'], 'restaurant', 171, 19, 8, 6, '1 serving (307g)', 'Menu', 'Nu', 716),
('Nu Umami Breakfast Wrap', ARRAY['nu umami wrap','nu mushroom wrap'], 'restaurant', 849, 35.8, 45, 58.9, '1 serving', 'Menu', 'Nu', 3552),
('Woolworths Chicken Tikka Masala', ARRAY['woolies tikka masala','woolworths tikka'], 'restaurant', 380, 28, 35, 14, '1 meal (350g)', 'Label', 'Woolworths', 1590),
('Woolworths Butter Chicken', ARRAY['woolies butter chicken'], 'restaurant', 420, 26, 40, 18, '1 meal (350g)', 'Label', 'Woolworths', 1757),
('Woolworths Cottage Pie', ARRAY['woolies cottage pie'], 'restaurant', 360, 20, 30, 18, '1 meal (350g)', 'Label', 'Woolworths', 1506),
('Woolworths Beef Lasagne', ARRAY['woolies lasagne'], 'restaurant', 440, 22, 38, 22, '1 meal (400g)', 'Label', 'Woolworths', 1841),
('Woolworths Mac & Cheese', ARRAY['woolies mac and cheese','woolworths mac cheese'], 'restaurant', 480, 18, 45, 24, '1 meal (350g)', 'Label', 'Woolworths', 2008),
('Woolworths Chicken Schnitzel', ARRAY['woolies schnitzel','woolworths crumbed chicken'], 'retail', 207, 18, 12, 10, '1 piece (105g)', 'Label', 'Woolworths', 866),
('Woolworths Chicken Strips', ARRAY['woolies chicken strips'], 'retail', 250, 22, 16, 12, '100g', 'Label', 'Woolworths', 1046),
('Woolworths Roast Chicken (quarter)', ARRAY['woolies roast chicken'], 'retail', 280, 32, 0, 16, '1 quarter', 'Label', 'Woolworths', 1172),
('Woolworths Chicken Caesar Wrap', ARRAY['woolies caesar wrap'], 'retail', 450, 28, 40, 18, '1 wrap', 'Label', 'Woolworths', 1883),
('Woolworths Egg Mayo Sandwich', ARRAY['woolies egg mayo','woolworths egg sandwich'], 'retail', 360, 14, 38, 16, '1 sandwich', 'Label', 'Woolworths', 1506),
('Woolworths Club Sandwich', ARRAY['woolies club sandwich'], 'retail', 480, 24, 44, 22, '1 sandwich', 'Label', 'Woolworths', 2008),
('Woolworths Sushi Box (10 piece)', ARRAY['woolies sushi'], 'retail', 380, 14, 60, 8, '1 box (10pc)', 'Label', 'Woolworths', 1590),
('Woolworths Chicken Pie', ARRAY['woolies chicken pie'], 'retail', 420, 16, 34, 24, '1 pie', 'Label', 'Woolworths', 1757),
('Woolworths Steak Pie', ARRAY['woolies steak pie'], 'retail', 450, 18, 36, 26, '1 pie', 'Label', 'Woolworths', 1883),
('Woolworths Superfood Salad', ARRAY['woolies superfood salad'], 'retail', 220, 8, 22, 12, '1 bowl', 'Label', 'Woolworths', 920),
('Woolworths Chicken Noodle Salad', ARRAY['woolies noodle salad'], 'retail', 340, 22, 32, 14, '1 bowl', 'Label', 'Woolworths', 1423),
('Woolworths Biltong Salad', ARRAY['woolies biltong salad'], 'retail', 280, 24, 16, 14, '1 bowl', 'Label', 'Woolworths', 1172),
('Woolworths Biltong (50g)', ARRAY['woolies biltong'], 'snack', 103, 20, 1, 2, '50g pack', 'Label', 'Woolworths', 431),
('Woolworths Protein Ball (1)', ARRAY['woolies protein ball','woolworths energy ball'], 'snack', 120, 5, 14, 5, '1 ball (30g)', 'Label', 'Woolworths', 502),
('Woolworths Trail Mix (50g)', ARRAY['woolies trail mix'], 'snack', 240, 6, 20, 16, '50g pack', 'Label', 'Woolworths', 1004),
('Woolworths Ayrshire Low Fat Milk (250ml)', ARRAY['woolies milk','woolworths milk'], 'brand', 120, 8, 12, 5, '250ml', 'Label', 'Woolworths', 502),
('Woolworths Double Cream Yoghurt', ARRAY['woolies yoghurt','woolworths yoghurt'], 'dairy', 85, 4, 6, 5, '100g', 'Label', 'Woolworths', 356),
('Woolworths Sourdough Bread (2 slices)', ARRAY['woolies sourdough','woolworths bread'], 'carb', 200, 7, 38, 2, '2 slices (90g)', 'Label', 'Woolworths', 837),
('Woolworths Green Juice', ARRAY['woolies green juice'], 'drink', 90, 2, 18, 0, '1 bottle (250ml)', 'Label', 'Woolworths', 377),
('Woolworths Berry Smoothie', ARRAY['woolies smoothie','woolworths smoothie'], 'drink', 150, 4, 30, 1, '1 bottle (250ml)', 'Label', 'Woolworths', 628)

ON CONFLICT (name) DO UPDATE SET
  calories = EXCLUDED.calories,
  protein = EXCLUDED.protein,
  carbs = EXCLUDED.carbs,
  fat = EXCLUDED.fat,
  kj = EXCLUDED.kj,
  serving = EXCLUDED.serving,
  category = EXCLUDED.category;

-- Done! You should now have 310+ SA foods in the database.
