#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v mariadb >/dev/null 2>&1; then
  echo "MariaDB client is required but not installed." >&2
  exit 1
fi

npm ci

if [[ ! -f .env ]]; then
  cp .env.example .env
  cat >> .env <<'EOF'

# Cloud Agent local defaults (override in dashboard secrets for production-like runs)
NODE_ENV=development
PORT=5173
DB_HOST=localhost
DB_PORT=3306
DB_NAME=spicepos
DB_USER=spicepos
DB_PASSWORD=spicepos_dev
MASTER_ADMIN_EMAIL=master@atavpos.local
MASTER_ADMIN_PASSWORD=Master@12345
DEMO_TENANT_PASSWORD=Demo@12345
CASHIER_PASSWORD=Cashier@12345
COOKIE_SECURE=0
EOF
fi

# Install script must not start long-running services; DB provisioning runs in start.
echo "Install complete."
