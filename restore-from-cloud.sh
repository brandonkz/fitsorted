#!/bin/bash
# FitSorted Cloud Backup Restore Script
# Decrypts and restores from iCloud Drive backup

ICLOUD_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/FitSorted-Backups"
RESTORE_DIR="/tmp/fitsorted-restore"
PASSWORD="FitSorted2026SecureBackup!Brandon"

# List available backups
echo "📦 Available cloud backups:"
ls -lt "$ICLOUD_DIR"/*.enc 2>/dev/null | head -10 | nl

# Check if backup file specified
if [ -z "$1" ]; then
  echo ""
  echo "Usage: ./restore-from-cloud.sh <backup-file>"
  echo "Example: ./restore-from-cloud.sh fitsorted-backup-2026-03-03-161630.tar.gz.enc"
  exit 1
fi

BACKUP_FILE="$ICLOUD_DIR/$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Backup file not found: $1"
  exit 1
fi

# Create restore directory
mkdir -p "$RESTORE_DIR"

# Decrypt backup
echo "🔓 Decrypting backup..."
DECRYPTED_FILE="$RESTORE_DIR/$(basename "$1" .enc)"
openssl enc -aes-256-cbc -d -pbkdf2 -in "$BACKUP_FILE" -out "$DECRYPTED_FILE" -k "$PASSWORD" 2>/dev/null

if [ $? -ne 0 ]; then
  echo "❌ Failed to decrypt backup (wrong password?)"
  exit 1
fi

# Extract backup
echo "📂 Extracting files..."
cd "$RESTORE_DIR"
tar -xzf "$DECRYPTED_FILE"

if [ $? -ne 0 ]; then
  echo "❌ Failed to extract backup"
  exit 1
fi

# Show contents
echo ""
echo "✅ Backup decrypted and extracted to: $RESTORE_DIR"
echo ""
echo "📄 Files:"
ls -lh "$RESTORE_DIR"

echo ""
echo "⚠️  To restore to FitSorted:"
echo "cd /Users/brandonkatz/.openclaw/workspace/fitsorted"
echo "cp $RESTORE_DIR/users.json users.json"
echo "cp $RESTORE_DIR/referrals.json referrals.json"
echo "cp $RESTORE_DIR/.env .env"
echo "pm2 restart fitsorted"
echo ""
echo "Or manually inspect files first: open $RESTORE_DIR"
