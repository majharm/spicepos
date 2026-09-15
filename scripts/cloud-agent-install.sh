#!/usr/bin/env bash
# Cloud Agent install — durable, idempotent, must terminate.
# Recurring environment builds clone GitHub's default branch (main).
# This script no-ops when the ref has no package.json so docs-only main does not fail.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f package.json ]]; then
  echo "No package.json on this ref; skipping npm bootstrap."
  exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but not installed." >&2
  exit 1
fi

if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

if [[ ! -f .env ]]; then
  cat > .env <<'EOF'
NODE_ENV=development
PORT=5173
DB_HOST=localhost
DB_PORT=3306
DB_NAME=spicepos
DB_USER=spicepos
DB_PASSWORD=spicepos_test
BUSINESS_ID=00000000-0000-4000-8000-000000000001
MASTER_ADMIN_EMAIL=master@atavpos.local
MASTER_ADMIN_PASSWORD=Master@12345
DEMO_TENANT_PASSWORD=Demo@12345
CASHIER_PASSWORD=Cashier@12345
COOKIE_SECURE=0
EOF
fi

echo "Install complete."
