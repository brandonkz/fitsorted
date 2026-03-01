-- SA Common Foods & Snacks - Verified nutrition data
-- Run in Supabase SQL editor

INSERT INTO foods (name, calories, protein, carbs, fat, kj, serving, category) VALUES

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

-- DAIRY & PROTEIN SUPPLEMENTS
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
