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
