-- Nu (NuFood) South Africa menu items
-- Source: nufood.co.za/menu (breakfast section, per-serving values)

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
('Nu Umami Breakfast Wrap', ARRAY['nu umami wrap','nu mushroom wrap'], 'restaurant', 849, 35.8, 45, 58.9, '1 serving', 'Menu', 'Nu', 3552);
-- Woolworths South Africa - popular ready meals, deli items, and grab-and-go
-- Sources: fatsecret.co.za, woolworths.co.za labels, estimated from packaging

INSERT INTO public.foods (name, name_alt, category, calories, protein, carbs, fat, serving, source, brand, kj) VALUES
-- Ready meals
('Woolworths Chicken Tikka Masala', ARRAY['woolies tikka masala','woolworths tikka'], 'restaurant', 380, 28, 35, 14, '1 meal (350g)', 'Label', 'Woolworths', 1590),
('Woolworths Butter Chicken', ARRAY['woolies butter chicken'], 'restaurant', 420, 26, 40, 18, '1 meal (350g)', 'Label', 'Woolworths', 1757),
('Woolworths Cottage Pie', ARRAY['woolies cottage pie'], 'restaurant', 360, 20, 30, 18, '1 meal (350g)', 'Label', 'Woolworths', 1506),
('Woolworths Beef Lasagne', ARRAY['woolies lasagne'], 'restaurant', 440, 22, 38, 22, '1 meal (400g)', 'Label', 'Woolworths', 1841),
('Woolworths Mac & Cheese', ARRAY['woolies mac and cheese','woolworths mac cheese'], 'restaurant', 480, 18, 45, 24, '1 meal (350g)', 'Label', 'Woolworths', 2008),
('Woolworths Chicken Schnitzel', ARRAY['woolies schnitzel','woolworths crumbed chicken'], 'retail', 207, 18, 12, 10, '1 piece (105g)', 'Label', 'Woolworths', 866),
('Woolworths Chicken Strips', ARRAY['woolies chicken strips'], 'retail', 250, 22, 16, 12, '100g', 'Label', 'Woolworths', 1046),

-- Deli & sandwiches
('Woolworths Roast Chicken (quarter)', ARRAY['woolies roast chicken'], 'retail', 280, 32, 0, 16, '1 quarter', 'Label', 'Woolworths', 1172),
('Woolworths Chicken Caesar Wrap', ARRAY['woolies caesar wrap'], 'retail', 450, 28, 40, 18, '1 wrap', 'Label', 'Woolworths', 1883),
('Woolworths Egg Mayo Sandwich', ARRAY['woolies egg mayo','woolworths egg sandwich'], 'retail', 360, 14, 38, 16, '1 sandwich', 'Label', 'Woolworths', 1506),
('Woolworths Club Sandwich', ARRAY['woolies club sandwich'], 'retail', 480, 24, 44, 22, '1 sandwich', 'Label', 'Woolworths', 2008),
('Woolworths Sushi Box (10 piece)', ARRAY['woolies sushi'], 'retail', 380, 14, 60, 8, '1 box (10pc)', 'Label', 'Woolworths', 1590),
('Woolworths Chicken Pie', ARRAY['woolies chicken pie'], 'retail', 420, 16, 34, 24, '1 pie', 'Label', 'Woolworths', 1757),
('Woolworths Steak Pie', ARRAY['woolies steak pie'], 'retail', 450, 18, 36, 26, '1 pie', 'Label', 'Woolworths', 1883),

-- Salads
('Woolworths Superfood Salad', ARRAY['woolies superfood salad'], 'retail', 220, 8, 22, 12, '1 bowl', 'Label', 'Woolworths', 920),
('Woolworths Chicken Noodle Salad', ARRAY['woolies noodle salad'], 'retail', 340, 22, 32, 14, '1 bowl', 'Label', 'Woolworths', 1423),
('Woolworths Biltong Salad', ARRAY['woolies biltong salad'], 'retail', 280, 24, 16, 14, '1 bowl', 'Label', 'Woolworths', 1172),

-- Snacks & convenience
('Woolworths Biltong (50g)', ARRAY['woolies biltong'], 'snack', 103, 20, 1, 2, '50g pack', 'Label', 'Woolworths', 431),
('Woolworths Protein Ball (1)', ARRAY['woolies protein ball','woolworths energy ball'], 'snack', 120, 5, 14, 5, '1 ball (30g)', 'Label', 'Woolworths', 502),
('Woolworths Trail Mix (50g)', ARRAY['woolies trail mix'], 'snack', 240, 6, 20, 16, '50g pack', 'Label', 'Woolworths', 1004),
('Woolworths Ayrshire Low Fat Milk (250ml)', ARRAY['woolies milk','woolworths milk'], 'brand', 120, 8, 12, 5, '250ml', 'Label', 'Woolworths', 502),
('Woolworths Double Cream Yoghurt', ARRAY['woolies yoghurt','woolworths yoghurt'], 'dairy', 85, 4, 6, 5, '100g', 'Label', 'Woolworths', 356),
('Woolworths Sourdough Bread (2 slices)', ARRAY['woolies sourdough','woolworths bread'], 'carb', 200, 7, 38, 2, '2 slices (90g)', 'Label', 'Woolworths', 837),

-- Smoothies & drinks
('Woolworths Green Juice', ARRAY['woolies green juice'], 'drink', 90, 2, 18, 0, '1 bottle (250ml)', 'Label', 'Woolworths', 377),
('Woolworths Berry Smoothie', ARRAY['woolies smoothie','woolworths smoothie'], 'drink', 150, 4, 30, 1, '1 bottle (250ml)', 'Label', 'Woolworths', 628);

-- Referral system tables
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referred_by text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;

CREATE TABLE IF NOT EXISTS public.referrers (
  id bigserial PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  commission_pct numeric(5,2) NOT NULL DEFAULT 20,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referrers DISABLE ROW LEVEL SECURITY;
