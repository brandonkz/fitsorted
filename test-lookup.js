const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function testLookup(searchTerm) {
  console.log(`\n🔍 Searching for: "${searchTerm}"`);
  const lower = searchTerm.toLowerCase();
  
  const { data, error } = await supabase
    .from('foods')
    .select('*')
    .or(`name.ilike.%${lower}%,name_alt.cs.{${lower}}`);
  
  if (error) {
    console.log('❌ Error:', error.message);
    return;
  }
  
  if (!data || data.length === 0) {
    console.log('❌ No matches found');
    return;
  }
  
  console.log(`✅ Found ${data.length} matches:`);
  data.forEach(item => {
    console.log(`  • ${item.name} (${item.serving || 'N/A'})`);
    console.log(`    ${item.calories} cal | P: ${item.protein}g | C: ${item.carbs}g | F: ${item.fat}g`);
    console.log(`    Keywords: ${item.name_alt?.join(', ')}`);
  });
}

async function runTests() {
  await testLookup('pap');
  await testLookup('nandos quarter chicken');
  await testLookup('boerewors');
  await testLookup('kauai');
}

runTests().then(() => process.exit(0));
