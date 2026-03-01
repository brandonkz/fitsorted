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
