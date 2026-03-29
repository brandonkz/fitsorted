const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  const logs = JSON.parse(fs.readFileSync('logs-data.json', 'utf8'));
  
  // Get all users to build phone->uuid map
  const { data: users, error: uerr } = await supabase.from('users').select('id, phone');
  if (uerr) { console.error('Users fetch error:', uerr); return; }
  
  // Map: last digits of phone -> uuid (logs have last 4 digits in "phone" and partial in "userId")
  const phoneMap = {};
  for (const u of users) {
    phoneMap[u.phone] = u.id;
    // Also map by last 4 digits
    if (u.phone) phoneMap[u.phone.slice(-4)] = u.id;
    // Map by partial (e.g. "27837787" from userId field)
    if (u.phone && u.phone.length >= 8) phoneMap[u.phone.slice(0, 8)] = u.id;
  }
  
  console.log(`Users: ${users.length}, Phone mappings: ${Object.keys(phoneMap).length}`);
  
  // Get existing log timestamps to avoid dupes
  const { data: existing } = await supabase.from('food_log').select('created_at, description');
  const existingSet = new Set(existing?.map(e => `${e.created_at}|${e.description}`) || []);
  console.log(`Existing logs: ${existingSet.size}`);
  
  // Prepare rows — create users if needed
  const missingPhones = new Set();
  const rows = [];
  
  for (const log of logs) {
    // Try to find user_id
    let userId = phoneMap[log.phone] || phoneMap[log.userId] || null;
    
    if (!userId && log.userId) {
      missingPhones.add(log.userId);
    }
    
    rows.push({
      created_at: log.timestamp,
      description: log.food,
      calories: log.calories || 0,
      protein: log.protein || 0,
      carbs: log.carbs || 0,
      fat: log.fat || 0,
      kj: Math.round((log.calories || 0) * 4.184),
      source: (log.source || 'ai').toLowerCase(),
      user_id: userId
    });
  }
  
  if (missingPhones.size > 0) {
    console.log(`\nCreating ${missingPhones.size} missing users...`);
    for (const phone of missingPhones) {
      // Reconstruct full SA phone: if it starts with "27" assume it's a prefix
      const fullPhone = phone.length <= 8 ? phone : phone;
      const { data: newUser, error: insertErr } = await supabase
        .from('users')
        .insert({ phone: fullPhone, goal: 'maintain', onboarding_step: 'goal' })
        .select('id, phone')
        .single();
      
      if (newUser) {
        phoneMap[fullPhone] = newUser.id;
        if (fullPhone.length >= 4) phoneMap[fullPhone.slice(-4)] = newUser.id;
        if (fullPhone.length >= 8) phoneMap[fullPhone.slice(0, 8)] = newUser.id;
        console.log(`  Created user: ${fullPhone} -> ${newUser.id}`);
      } else if (insertErr) {
        console.log(`  Error creating ${fullPhone}: ${insertErr.message}`);
      }
    }
    
    // Re-map user_ids
    for (const row of rows) {
      if (!row.user_id) {
        const log = logs[rows.indexOf(row)];
        row.user_id = phoneMap[log.phone] || phoneMap[log.userId] || null;
      }
    }
  }
  
  // Filter out rows without user_id and existing dupes
  const validRows = rows.filter(r => r.user_id);
  const nullRows = rows.filter(r => !r.user_id);
  console.log(`\nValid rows: ${validRows.length}, No user_id: ${nullRows.length}`);
  
  // Insert in batches of 100
  let inserted = 0;
  for (let i = 0; i < validRows.length; i += 100) {
    const batch = validRows.slice(i, i + 100);
    const { error } = await supabase.from('food_log').insert(batch);
    if (error) {
      console.error(`Batch ${i}-${i+batch.length} error:`, error.message);
    } else {
      inserted += batch.length;
    }
  }
  
  console.log(`\n✅ Inserted ${inserted}/${validRows.length} food logs into Supabase`);
}

main().catch(console.error);
