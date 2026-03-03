#!/bin/bash
# FitSorted Cloud Backup Script (Encrypted)
# Backs up user data to iCloud Drive with AES-256 encryption

BACKUP_DIR="$HOME/.fitsorted-backups"
ICLOUD_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/FitSorted-Backups"
DATE=$(date +%Y-%m-%d-%H%M%S)
LOCAL_BACKUP="$BACKUP_DIR/fitsorted-backup-$DATE.tar.gz"
ENCRYPTED_FILE="fitsorted-backup-$DATE.tar.gz.enc"
PASSWORD="FitSorted2026SecureBackup!Brandon"

# Create backup directories
mkdir -p "$BACKUP_DIR"
mkdir -p "$ICLOUD_DIR"

# Create local backup
cd /Users/brandonkatz/.openclaw/workspace/fitsorted
tar -czf "$LOCAL_BACKUP" \
  users.json \
  referrals.json \
  .env 2>/dev/null

if [ ! -f "$LOCAL_BACKUP" ]; then
  echo "❌ Failed to create local backup"
  exit 1
fi

# Encrypt backup (AES-256)
openssl enc -aes-256-cbc -salt -pbkdf2 -in "$LOCAL_BACKUP" -out "$ICLOUD_DIR/$ENCRYPTED_FILE" -k "$PASSWORD" 2>/dev/null

if [ $? -eq 0 ]; then
  echo "✅ Encrypted backup uploaded to iCloud Drive"
  echo "📦 File: $ENCRYPTED_FILE"
  echo "📊 Size: $(du -h "$ICLOUD_DIR/$ENCRYPTED_FILE" | cut -f1)"
  
  # Keep only last 30 cloud backups
  cd "$ICLOUD_DIR"
  ls -t *.enc 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null
  
  echo "💾 Total cloud backups: $(ls -1 *.enc 2>/dev/null | wc -l | tr -d ' ')"
else
  echo "❌ Failed to encrypt/upload backup"
  exit 1
fi

# Keep only last 30 local backups
cd "$BACKUP_DIR"
ls -t | tail -n +31 | xargs rm -f 2>/dev/null

echo "✅ Cloud backup complete"
