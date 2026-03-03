const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkStructure() {
  // Try different possible table names
  const possibleNames = ['sa_foods', 'foods', 'south_african_foods', 'food_items'];
  
  for (const tableName of possibleNames) {
    console.log(`\nTrying table: ${tableName}...`);
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(3);
    
    if (!error && data) {
      console.log(`✅ Found table: ${tableName}`);
      console.log(`Rows in sample: ${data.length}`);
      console.log('\nSample data:');
      console.log(JSON.stringify(data, null, 2));
      
      // Get total count
      const { count } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });
      console.log(`\n📊 Total rows: ${count}`);
      return;
    } else {
      console.log(`❌ ${error?.message || 'Not found'}`);
    }
  }
  
  console.log('\n💡 None of the common table names found. Need to check Supabase Table Editor.');
}

checkStructure().then(() => process.exit(0));
