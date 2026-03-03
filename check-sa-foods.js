const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkFoods() {
  // Get total count
  const { count, error: countError } = await supabase
    .from('sa_foods')
    .select('*', { count: 'exact', head: true });
  
  if (countError) {
    console.log('Error counting:', countError.message);
    return;
  }
  
  console.log(`\n📊 Total SA Foods: ${count}\n`);
  
  // Get breakdown by chain
  const { data: chains, error: chainError } = await supabase
    .from('sa_foods')
    .select('chain')
    .order('chain');
  
  if (!chainError && chains) {
    const chainCounts = {};
    chains.forEach(row => {
      const chain = row.chain || 'Other';
      chainCounts[chain] = (chainCounts[chain] || 0) + 1;
    });
    
    console.log('🏪 Breakdown by Chain:');
    Object.entries(chainCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([chain, count]) => console.log(`  • ${chain}: ${count} items`));
  }
  
  // Sample 5 random foods
  const { data: samples, error: sampleError } = await supabase
    .from('sa_foods')
    .select('food_name, chain, calories, protein, carbs, fat')
    .limit(5);
  
  if (!sampleError && samples) {
    console.log('\n🍔 Sample Foods:');
    samples.forEach(food => {
      console.log(`  • ${food.chain ? `[${food.chain}] ` : ''}${food.food_name}`);
      console.log(`    ${food.calories} cal | P: ${food.protein || '?'}g | C: ${food.carbs || '?'}g | F: ${food.fat || '?'}g`);
    });
  }
}

checkFoods().then(() => process.exit(0));
