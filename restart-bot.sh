#!/bin/bash
set -e
cd /Users/brandonkatz/.openclaw/workspace/fitsorted

# Syntax check before restart
node --check bot.js

# Restart bot
pm2 restart fitsorted
