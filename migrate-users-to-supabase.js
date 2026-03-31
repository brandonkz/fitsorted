#!/usr/bin/env node

/**
 * Migrate FitSorted bot users to Supabase
 * 
 * Syncs local bot state (stats.json, user sessions) into Supabase users + subscriptions tables
 * Creates trial subscriptions for all users (14-day trials)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Bot state files
const STATS_FILE = path.join(__dirname, 'stats.json');
const STATE_DIR = path.join(__dirname, 'state');

async function migrateUsers() {
  console.log('\n🔄 FitSorted User Migration to Supabase\n');

  // Load bot stats
  if (!fs.existsSync(STATS_FILE)) {
    console.error('❌ stats.json not found');
    process.exit(1);
  }

  const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  console.log(`📊 Bot stats: ${stats.totalUsers} total users, ${stats.activeUsers} active\n`);

  // Get all user state files
  if (!fs.existsSync(STATE_DIR)) {
    console.error('❌ state/ directory not found');
    process.exit(1);
  }

  const stateFiles = fs.readdirSync(STATE_DIR).filter(f => f.endsWith('.json'));
  console.log(`📁 Found ${stateFiles.length} user state files\n`);

  // Get existing users from Supabase
  const { data: existingUsers, error: fetchError } = await supabase
    .from('users')
    .select('phone');

  if (fetchError) {
    console.error('❌ Error fetching existing users:', fetchError.message);
    process.exit(1);
  }

  const existingPhones = new Set(existingUsers.map(u => u.phone));
  console.log(`✅ Found ${existingPhones.size} existing users in Supabase\n`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of stateFiles) {
    const phone = file.replace('.json', '');
    
    // Skip if already in Supabase
    if (existingPhones.has(phone)) {
      skipped++;
      continue;
    }

    try {
      const statePath = path.join(STATE_DIR, file);
      const userState = JSON.parse(fs.readFileSync(statePath, 'utf8'));

      // Determine trial end date (14 days from sign-up)
      const joinedAt = userState.joinedAt ? new Date(userState.joinedAt) : new Date();
      const trialEndsAt = new Date(joinedAt);
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);

      // Insert user
      const { data: user, error: userError } = await supabase
        .from('users')
        .insert({
          phone: phone,
          created_at: joinedAt.toISOString(),
          goal: userState.goal || 'lose_fat',
          weight_kg: userState.weight,
          height_cm: userState.height,
          age: userState.age,
          sex: userState.sex || null,
          tdee: userState.tdee || null,
          calorie_target: userState.calorieTarget || null,
          protein_target: userState.proteinTarget || null,
          carb_target: userState.carbTarget || null,
          fat_target: userState.fatTarget || null,
          last_active_at: userState.lastActive || new Date().toISOString(),
          onboarding_step: userState.onboardingStep || 'complete'
        })
        .select()
        .single();

      if (userError) {
        console.error(`❌ Failed to insert user ${phone}: ${userError.message}`);
        errors++;
        continue;
      }

      // Create trial subscription
      const { error: subError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: user.id,
          status: 'trial',
          started_at: joinedAt.toISOString(),
          ends_at: trialEndsAt.toISOString(),
          provider: 'yoco'
        });

      if (subError) {
        console.error(`⚠️ User ${phone} migrated but subscription failed: ${subError.message}`);
        errors++;
      } else {
        migrated++;
        if (migrated % 10 === 0) {
          console.log(`✓ Migrated ${migrated} users...`);
        }
      }

    } catch (err) {
      console.error(`❌ Error processing ${phone}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n✅ Migration complete!\n`);
  console.log(`   Migrated: ${migrated}`);
  console.log(`   Skipped (already in DB): ${skipped}`);
  console.log(`   Errors: ${errors}`);
  console.log(`\n📊 Final totals:`);
  
  const { data: finalUsers } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true });
  
  const { data: finalSubs } = await supabase
    .from('subscriptions')
    .select('status', { count: 'exact', head: true });

  console.log(`   Total users in Supabase: ${finalUsers?.length || 0}`);
  console.log(`   Total subscriptions: ${finalSubs?.length || 0}`);
}

migrateUsers().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
