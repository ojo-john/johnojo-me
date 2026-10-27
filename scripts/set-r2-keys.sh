#!/usr/bin/env bash
# Saves an R2 API token's two values into .env.local (git-ignored) without showing them on screen.
# Run in your own terminal:  bash scripts/set-r2-keys.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=.env.local

# R2 shows a 32-character Access Key ID and a 64-character Secret Access Key, both hex.
read -rsp "Paste the Access Key ID (hidden), then Enter: " key_id; echo
read -rsp "Paste the Secret Access Key (hidden), then Enter: " secret; echo

[[ "$key_id" =~ ^[0-9a-f]{32}$ ]] || { echo "That Access Key ID doesn't look right (expected 32 letters/digits). Nothing saved."; exit 1; }
[[ "$secret" =~ ^[0-9a-f]{64}$ ]] || { echo "That Secret Access Key doesn't look right (expected 64 letters/digits). Nothing saved."; exit 1; }

touch "$ENV_FILE"
chmod 600 "$ENV_FILE"
# Replace any earlier values rather than adding duplicates.
tmp=$(mktemp)
grep -vE '^(R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY)=' "$ENV_FILE" > "$tmp" || true
printf 'R2_ACCESS_KEY_ID=%s\nR2_SECRET_ACCESS_KEY=%s\n' "$key_id" "$secret" >> "$tmp"
mv "$tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"

git check-ignore -q "$ENV_FILE" && echo "Saved to $ENV_FILE (git-ignored, readable only by you)." || echo "Warning: $ENV_FILE is NOT git-ignored. Don't commit it."
