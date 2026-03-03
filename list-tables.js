const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function listTables() {
  // Try to query the table
  const { data, error } = await supabase
    .from('sa_foods')
    .select('*')
    .limit(1);
  
  if (error) {
    console.log('❌ Error:', error.message);
    console.log('Code:', error.code);
    console.log('Details:', error.details);
    console.log('\n💡 Table might not exist or RLS is blocking access');
  } else {
    console.log('✅ Table exists!');
    console.log('Data:', data);
  }
}

listTables().then(() => process.exit(0));
