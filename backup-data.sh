#!/bin/bash
# FitSorted Data Backup Script
# Backs up user data locally AND to cloud (encrypted)

BACKUP_DIR="$HOME/.fitsorted-backups"
DATE=$(date +%Y-%m-%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/fitsorted-backup-$DATE.tar.gz"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create local backup
cd /Users/brandonkatz/.openclaw/workspace/fitsorted
tar -czf "$BACKUP_FILE" \
  users.json \
  referrals.json \
  .env 2>/dev/null

# Keep only last 30 local backups
cd "$BACKUP_DIR"
ls -t | tail -n +31 | xargs rm -f 2>/dev/null

echo "✅ Local backup created: $BACKUP_FILE"
echo "📊 Backup size: $(du -h "$BACKUP_FILE" | cut -f1)"
echo "💾 Total local backups: $(ls -1 | wc -l)"

# Run cloud backup (encrypted to iCloud Drive)
echo ""
echo "☁️  Uploading to cloud..."
/Users/brandonkatz/.openclaw/workspace/fitsorted/backup-to-cloud.sh
