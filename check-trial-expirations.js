#!/usr/bin/env node

/**
 * Check FitSorted trial expirations
 * Shows users whose trials ended today
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkTrialExpirations() {
  const today = new Date().toISOString().split('T')[0];
  
  console.log(`\n🔍 Checking trial expirations for ${today}\n`);

  // Query subscriptions where status is 'trial' and ends_at is today
  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select(`
      *,
      users (
        id,
        phone,
        created_at,
        last_active_at,
        goal
      )
    `)
    .eq('status', 'trial')
    .gte('ends_at', `${today}T00:00:00`)
    .lt('ends_at', `${today}T23:59:59`)
    .order('ends_at', { ascending: true });

  if (error) {
    console.error('❌ Error querying Supabase:', error.message);
    process.exit(1);
  }

  if (!subs || subs.length === 0) {
    console.log('✅ No trial expirations today.');
    return;
  }

  console.log(`⚠️ ${subs.length} trial(s) expiring today:\n`);

  subs.forEach((sub, i) => {
    const user = sub.users;
    console.log(`${i + 1}. ${user?.phone || sub.user_id}`);
    console.log(`   Signed up: ${user?.created_at?.split('T')[0] || 'Unknown'}`);
    console.log(`   Trial ends: ${sub.ends_at?.split('T')[0]}`);
    console.log(`   Goal: ${user?.goal || 'Unknown'}`);
    console.log(`   Last active: ${user?.last_active_at?.split('T')[0] || 'Never'}`);
    console.log(`   Provider: ${sub.provider || 'Unknown'}`);
    console.log('');
  });

  console.log(`\n📊 Summary:`);
  console.log(`   Total expirations: ${subs.length}`);
  
  const activeRecently = subs.filter(s => {
    if (!s.users?.last_active_at) return false;
    const lastActive = new Date(s.users.last_active_at);
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    return lastActive >= threeDaysAgo;
  });
  
  console.log(`   Active in last 3 days: ${activeRecently.length}`);
  console.log(`   Inactive/Churned: ${subs.length - activeRecently.length}`);
}

checkTrialExpirations().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
