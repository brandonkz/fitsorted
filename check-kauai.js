const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkKauai() {
  console.log('\n🔍 Checking for Kauai foods...\n');
  
  // Search by brand
  const { data, error } = await supabase
    .from('foods')
    .select('*')
    .eq('brand', 'Kauai');
  
  if (error) {
    console.log('❌ Error:', error.message);
    return;
  }
  
  if (!data || data.length === 0) {
    console.log('❌ No Kauai foods found by brand column');
    
    // Try searching by name
    const { data: nameSearch } = await supabase
      .from('foods')
      .select('*')
      .ilike('name', '%kauai%')
      .limit(5);
    
    if (nameSearch && nameSearch.length > 0) {
      console.log(`\n✅ Found ${nameSearch.length} Kauai foods by name:`);
      nameSearch.forEach(food => {
        console.log(`  • ${food.name}`);
        console.log(`    Brand: ${food.brand || 'NULL'}`);
        console.log(`    Keywords: ${food.name_alt?.join(', ') || 'none'}`);
      });
    } else {
      console.log('❌ No Kauai foods found at all - need to add them!');
    }
    return;
  }
  
  console.log(`✅ Found ${data.length} Kauai foods:\n`);
  data.forEach(food => {
    console.log(`  • ${food.name} (${food.serving || 'N/A'})`);
    console.log(`    ${food.calories} cal | P: ${food.protein}g | C: ${food.carbs}g | F: ${food.fat}g`);
    console.log(`    Keywords: ${food.name_alt?.join(', ')}`);
    console.log('');
  });
}

checkKauai().then(() => process.exit(0));
