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

# load-env.js keeps the first assignment of each key, so appending after
# .env.example placeholders never reaches the process. Rewrite those keys.
apply_local_env() {
  local tmp
  tmp="$(mktemp)"
  awk '
    BEGIN {
      repl["NODE_ENV"] = "development"
      repl["DB_HOST"] = "localhost"
      repl["DB_PORT"] = "3306"
      repl["DB_NAME"] = "spicepos"
      repl["DB_USER"] = "spicepos"
      repl["DB_PASSWORD"] = "spicepos_test"
      repl["MASTER_ADMIN_EMAIL"] = "master@atavpos.local"
      repl["MASTER_ADMIN_PASSWORD"] = "Master@12345"
      repl["DEMO_TENANT_PASSWORD"] = "Demo@12345"
      repl["CASHIER_PASSWORD"] = "Cashier@12345"
      repl["BUSINESS_ID"] = "00000000-0000-4000-8000-000000000001"
    }
    {
      line = $0
      if (line ~ /^[[:space:]]*#/ || line ~ /^[[:space:]]*$/) { print line; next }
      key = line
      sub(/^export[[:space:]]+/, "", key)
      sub(/=.*/, "", key)
      if (key in repl && !(key in seen)) {
        print key "=" repl[key]
        seen[key] = 1
        next
      }
      print line
    }
    END {
      if (!("PORT" in seen)) print "PORT=5173"
      if (!("COOKIE_SECURE" in seen)) print "COOKIE_SECURE=0"
    }
  ' .env > "$tmp"
  mv "$tmp" .env
}

if [[ ! -f .env && -f .env.example ]]; then
  cp .env.example .env
fi

if [[ -f .env ]] && grep -q '^DB_NAME=your-db-name$' .env; then
  apply_local_env
fi

echo "Install complete."
