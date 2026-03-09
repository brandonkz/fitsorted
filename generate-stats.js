#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, 'users.json');
const STATS_FILE = path.join(__dirname, 'stats.json');

function generateStats() {
  try {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    
    const totalUsers = Object.keys(users).length;
    
    // Active users (logged food in last 7 days)
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    const activeUsers = Object.values(users).filter(user => {
      if (!user.log) return false;
      
      for (const [date, entries] of Object.entries(user.log)) {
        if (entries.length > 0) {
          const lastEntry = entries[entries.length - 1];
          if (lastEntry.time && new Date(lastEntry.time).getTime() > sevenDaysAgo) {
            return true;
          }
        }
      }
      return false;
    }).length;
    
    // Total food logs
    const totalLogs = Object.values(users).reduce((sum, user) => {
      if (!user.log) return sum;
      return sum + Object.values(user.log).reduce((s, entries) => s + entries.length, 0);
    }, 0);
    
    // Users with referrals
    const usersWithReferrals = Object.values(users).filter(u => u.referrals?.length > 0);
    const totalReferrals = usersWithReferrals.reduce((sum, u) => sum + u.referrals.length, 0);
    
    // Top referrers (anonymized)
    const topReferrers = usersWithReferrals
      .map(u => ({
        id: u.phone ? `***${u.phone.slice(-4)}` : 'Unknown',
        referrals: u.referrals.length,
        credits: u.referralCredits || 0
      }))
      .sort((a, b) => b.referrals - a.referrals)
      .slice(0, 5);
    
    // Recent signups (last 7 days, anonymized)
    const recentSignups = Object.entries(users)
      .filter(([phone, user]) => {
        if (!user.joinedAt) return false;
        return new Date(user.joinedAt).getTime() > sevenDaysAgo;
      })
      .map(([phone, user]) => ({
        id: `***${phone.slice(-4)}`,
        joinedAt: user.joinedAt,
        logs: user.log ? Object.values(user.log).reduce((s, entries) => s + entries.length, 0) : 0,
        isPro: user.isPro || false
      }))
      .sort((a, b) => new Date(b.joinedAt) - new Date(a.joinedAt));
    
    // Premium users
    const premiumUsers = Object.values(users).filter(u => u.isPro).length;
    
    const stats = {
      totalUsers,
      activeUsers,
      totalLogs,
      premiumUsers,
      totalReferrals,
      topReferrers,
      recentSignups,
      lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    console.log(`✅ Stats generated: ${totalUsers} users, ${activeUsers} active (7d), ${totalLogs} logs`);
    
  } catch (err) {
    console.error('❌ Failed to generate stats:', err.message);
    process.exit(1);
  }
}

generateStats();
