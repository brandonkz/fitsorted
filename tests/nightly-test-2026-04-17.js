// Nightly edge case test - 2026-04-17
// 10 NEW test cases that the AI will evaluate

const testCases = [
  // Test 1: Magwinya (fat cakes) x2 - commonly eaten in SA, AI might underestimate
  ["magwinya 2", 550, 750],
  
  // Test 2: Morvite cereal with milk - SA breakfast staple
  ["morvite with milk", 280, 400],
  
  // Test 3: Inkomazi (Zulu beef stew) - traditional SA
  ["inkomazi", 350, 550],
  
  // Test 4: Pick n Pay samoosa 2 - frozen snack
  ["pick n pay samoosa 2", 260, 380],
  
  // Test 5: Steers onion rings - side dish
  ["steers onion rings", 200, 350],
  
  // Test 6: Red Square energy drink - SA brand
  ["red square energy", 100, 180],
  
  // Test 7: Kransky sausage - coiled sausage
  ["kransky", 180, 280],
  
  // Test 8: Spur breakfast - full meal
  ["spur breakfast", 650, 950],
  
  // Test 9: KFC coleslaw - side
  ["kfc coleslaw", 120, 220],
  
  // Test 10: House of Pizza slice - takeaway
  ["house of pizza slice", 200, 350]
];

module.exports = { testCases };