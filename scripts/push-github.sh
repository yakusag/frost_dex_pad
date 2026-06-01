#!/bin/bash
set -e

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ GITHUB_TOKEN is not set. Add it in Replit Secrets."
  exit 1
fi

REPO="https://oauth2:${GITHUB_TOKEN}@github.com/yakusag/frost_dex_pad.git"

git push "$REPO" main
echo "✅ Pushed to GitHub: yakusag/frost_dex_pad"
