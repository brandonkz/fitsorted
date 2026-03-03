# FitSorted Backup System

## Overview

**Two-tier backup system:**
1. **Local backups** (unencrypted) - `/Users/brandonkatz/.fitsorted-backups/`
2. **Cloud backups** (encrypted) - iCloud Drive → `~/Library/Mobile Documents/com~apple~CloudDocs/FitSorted-Backups/`

**Schedule:** Daily at 3:00 AM (automatic)  
**Retention:** 30 days (both local and cloud)  
**Encryption:** AES-256-CBC (cloud only)

---

## What Gets Backed Up

Each backup contains:
- `users.json` - All user profiles, food logs, exercise logs, weight history
- `referrals.json` - Influencer referral codes and signups
- `.env` - API keys and secrets

**Size:** ~4-10KB per backup (very small)

---

## Backup Locations

### Local Backups (Unencrypted)
**Path:** `~/.fitsorted-backups/`

**Files:**
```
fitsorted-backup-2026-03-03-161048.tar.gz
fitsorted-backup-2026-03-04-030000.tar.gz
... (30 days)
```

**Access:**
```bash
ls -lh ~/.fitsorted-backups/
open ~/.fitsorted-backups/
```

---

### Cloud Backups (Encrypted)
**Path:** `~/Library/Mobile Documents/com~apple~CloudDocs/FitSorted-Backups/`

**Files:**
```
fitsorted-backup-2026-03-03-161630.tar.gz.enc
fitsorted-backup-2026-03-04-030000.tar.gz.enc
... (30 days)
```

**Synced to:** All your iCloud-connected devices (iPhone, iPad, other Macs)

**Access:**
```bash
ls -lh ~/Library/Mobile\ Documents/com~apple~CloudDocs/FitSorted-Backups/
open ~/Library/Mobile\ Documents/com~apple~CloudDocs/FitSorted-Backups/
```

---

## Encryption

**Algorithm:** AES-256-CBC with PBKDF2 (industry standard)  
**Password:** `FitSorted2026SecureBackup!Brandon`

**IMPORTANT:** Store this password securely. Without it, cloud backups cannot be decrypted.

**Recommended:** Save password to 1Password, LastPass, or write it down in a safe place.

---

## Manual Backup (Anytime)

**Run backup manually:**
```bash
/Users/brandonkatz/.openclaw/workspace/fitsorted/backup-data.sh
```

**Output:**
```
✅ Local backup created: ~/.fitsorted-backups/fitsorted-backup-2026-03-03-161630.tar.gz
📊 Backup size: 4.0K
💾 Total local backups: 5

☁️  Uploading to cloud...
✅ Encrypted backup uploaded to iCloud Drive
📦 File: fitsorted-backup-2026-03-03-161630.tar.gz.enc
📊 Size: 4.0K
💾 Total cloud backups: 5
✅ Cloud backup complete
```

---

## Restore from Local Backup

**1. List available backups:**
```bash
ls -lh ~/.fitsorted-backups/
```

**2. Extract backup:**
```bash
cd /tmp
tar -xzf ~/.fitsorted-backups/fitsorted-backup-2026-03-03-161048.tar.gz
```

**3. Restore files:**
```bash
cd /Users/brandonkatz/.openclaw/workspace/fitsorted
cp /tmp/users.json users.json
cp /tmp/referrals.json referrals.json
cp /tmp/.env .env
```

**4. Restart bot:**
```bash
pm2 restart fitsorted
```

---

## Restore from Cloud Backup (Encrypted)

**1. List available cloud backups:**
```bash
/Users/brandonkatz/.openclaw/workspace/fitsorted/restore-from-cloud.sh
```

**Output:**
```
📦 Available cloud backups:
1    fitsorted-backup-2026-03-04-030000.tar.gz.enc
2    fitsorted-backup-2026-03-03-161630.tar.gz.enc
3    fitsorted-backup-2026-03-02-030000.tar.gz.enc
...
```

**2. Restore specific backup:**
```bash
/Users/brandonkatz/.openclaw/workspace/fitsorted/restore-from-cloud.sh fitsorted-backup-2026-03-03-161630.tar.gz.enc
```

**Output:**
```
🔓 Decrypting backup...
📂 Extracting files...

✅ Backup decrypted and extracted to: /tmp/fitsorted-restore

📄 Files:
-rw-r--r--  users.json
-rw-r--r--  referrals.json
-rw-r--r--  .env
```

**3. Inspect files (optional):**
```bash
open /tmp/fitsorted-restore
cat /tmp/fitsorted-restore/users.json | jq '.'
```

**4. Restore to FitSorted:**
```bash
cd /Users/brandonkatz/.openclaw/workspace/fitsorted
cp /tmp/fitsorted-restore/users.json users.json
cp /tmp/fitsorted-restore/referrals.json referrals.json
cp /tmp/fitsorted-restore/.env .env
pm2 restart fitsorted
```

---

## Disaster Recovery Scenarios

### Scenario 1: Mac Crashes, Won't Boot
**Recovery:**
1. Get new Mac or repair old one
2. Sign in to iCloud
3. Wait for iCloud Drive to sync
4. Install FitSorted
5. Run restore script
6. Bot back online with all user data ✅

---

### Scenario 2: Accidental Data Corruption
**Recovery:**
1. Check local backups: `ls -lh ~/.fitsorted-backups/`
2. Restore from yesterday's backup
3. Users lose <24 hours of data (acceptable)

---

### Scenario 3: Mac Stolen/Lost
**Recovery:**
1. Get new Mac
2. Sign in to iCloud (cloud backups sync automatically)
3. Install FitSorted
4. Restore from cloud backup
5. All user data recovered ✅

---

### Scenario 4: iCloud Account Compromised
**Recovery:**
- Local backups still exist on Mac (unencrypted)
- Restore from local backup
- Change iCloud password
- Re-upload encrypted backups

---

## Testing Backups

**Test local backup (safe):**
```bash
tar -tzf ~/.fitsorted-backups/fitsorted-backup-$(date +%Y-%m-%d)-*.tar.gz
```

Shows files inside backup without extracting.

**Test cloud backup (safe):**
```bash
/Users/brandonkatz/.openclaw/workspace/fitsorted/restore-from-cloud.sh [filename]
```

Decrypts to /tmp (doesn't touch production files).

---

## Monitoring Backups

**Check last backup time:**
```bash
ls -lt ~/.fitsorted-backups/ | head -2
```

**Check cloud sync status:**
```bash
ls -lt ~/Library/Mobile\ Documents/com~apple~CloudDocs/FitSorted-Backups/ | head -2
```

**If backups stopped:**
1. Check launchd job: `launchctl list | grep fitsorted`
2. Check logs: `cat /tmp/fitsorted-backup.log`
3. Run manual backup: `/Users/brandonkatz/.openclaw/workspace/fitsorted/backup-data.sh`

---

## Security Best Practices

✅ **Local backups:** Unencrypted (Mac is trusted device)  
✅ **Cloud backups:** AES-256 encrypted (protects against iCloud breach)  
✅ **Password:** Store securely (1Password, written down in safe)  
✅ **Retention:** 30 days (balances storage vs. recovery window)  
✅ **Automatic:** Daily at 3 AM (no manual intervention)

---

## Upgrading to Backblaze B2 (Optional)

**Why upgrade:**
- iCloud Drive: R50/mo for 50GB (expensive at scale)
- Backblaze B2: R15/mo for 100GB (cheaper, dedicated backup storage)
- Better reliability (designed for backups, not file sync)

**When to upgrade:** 1,000+ users (data size >100MB)

**Setup:** 30 minutes with rclone

---

## Backup Scripts

**backup-data.sh** - Main backup script (local + cloud)  
**backup-to-cloud.sh** - Cloud upload (encrypted)  
**restore-from-cloud.sh** - Cloud restore (decrypts)

**Location:** `/Users/brandonkatz/.openclaw/workspace/fitsorted/`

---

## Quick Reference

| Task | Command |
|------|---------|
| **Manual backup** | `./backup-data.sh` |
| **List local backups** | `ls -lh ~/.fitsorted-backups/` |
| **List cloud backups** | `./restore-from-cloud.sh` |
| **Restore from cloud** | `./restore-from-cloud.sh [filename]` |
| **Check backup job** | `launchctl list \| grep fitsorted` |
| **View backup logs** | `cat /tmp/fitsorted-backup.log` |

---

## Encryption Password (SECURE THIS)

**Password:** `FitSorted2026SecureBackup!Brandon`

**Store this in:**
- [ ] 1Password / LastPass
- [ ] Written down in safe place
- [ ] Shared with trusted person (optional)

**Without this password, cloud backups cannot be restored.**

---

**Last updated:** March 3, 2026
