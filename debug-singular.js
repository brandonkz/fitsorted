const food = "Scrambled egg";
const inputLower = food.toLowerCase().trim();

const result = {
  food: "Scrambled eggs (2 eggs) (2 eggs)",
  calories: 180,
  protein: 13,
  carbs: 2,
  fat: 13
};

console.log("Input:", food);
console.log("inputLower:", inputLower);
console.log("AI returned:", result.food, result.calories, "cal");

// Test cleanup
const before = result.food;
result.food = result.food.replace(/(\([^)]+\))\s*\1+/g, '$1');
console.log("\nCleanup test:");
console.log("  Before:", before);
console.log("  After:", result.food);
console.log("  Changed?", before !== result.food);

// Test singular detection
const rule = { singular: 'egg', plural: 'eggs', singleCal: 70 };

const hasSingular = inputLower === rule.singular || 
                    inputLower.includes(` ${rule.singular} `) || 
                    inputLower.endsWith(` ${rule.singular}`) ||
                    inputLower === `scrambled ${rule.singular}` ||
                    inputLower === `fried ${rule.singular}` ||
                    inputLower === `boiled ${rule.singular}`;

const hasPlural = inputLower.includes(rule.plural);

console.log("\nSingular/Plural detection:");
console.log("  hasSingular?", hasSingular);
console.log("  hasPlural?", hasPlural);
console.log("  Calories:", result.calories);
console.log("  Threshold (70 * 1.5):", rule.singleCal * 1.5);
console.log("  Should halve?", hasSingular && !hasPlural && result.calories > rule.singleCal * 1.5);

if (hasSingular && !hasPlural && result.calories > rule.singleCal * 1.5) {
  console.log("\n✅ WOULD FIX: Halving to", Math.round(result.calories / 2), "cal");
} else {
  console.log("\n❌ WOULD NOT FIX");
}
