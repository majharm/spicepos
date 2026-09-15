#!/usr/bin/env bash
# Cloud Agent start — per-boot MariaDB for local POS. Must terminate.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v mariadb >/dev/null 2>&1 && ! command -v mysql >/dev/null 2>&1; then
  echo "No MariaDB/MySQL client; skipping database start."
  exit 0
fi

run_sql() {
  if mariadb -e "$1" 2>/dev/null; then
    return 0
  fi
  if mysql -e "$1" 2>/dev/null; then
    return 0
  fi
  sudo mariadb -e "$1" 2>/dev/null || sudo mysql -e "$1"
}

run_sql_file() {
  local file="$1"
  if mariadb spicepos <"$file" 2>/dev/null; then
    return 0
  fi
  if mysql spicepos <"$file" 2>/dev/null; then
    return 0
  fi
  sudo mariadb spicepos <"$file"
}

start_mariadb() {
  if command -v service >/dev/null 2>&1; then
    sudo service mariadb start >/dev/null 2>&1 || sudo service mysql start >/dev/null 2>&1 || true
  fi
  for _ in $(seq 1 30); do
    if mariadb -e "SELECT 1" >/dev/null 2>&1 || sudo mariadb -e "SELECT 1" >/dev/null 2>&1; then
      return 0
    fi
    if mysql -e "SELECT 1" >/dev/null 2>&1 || sudo mysql -e "SELECT 1" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "MariaDB did not become ready." >&2
  return 1
}

provision_db() {
  run_sql "
CREATE DATABASE IF NOT EXISTS spicepos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER DATABASE spicepos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'spicepos'@'localhost' IDENTIFIED BY 'spicepos_test';
GRANT ALL PRIVILEGES ON spicepos.* TO 'spicepos'@'localhost';
FLUSH PRIVILEGES;
ALTER USER 'spicepos'@'localhost' IDENTIFIED BY 'spicepos_test';
"
}

bootstrap_schema() {
  local table_count
  table_count="$(run_sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'spicepos';" | tail -1)"
  if [[ "${table_count:-0}" -lt 5 && -f scripts/base-schema.sql ]]; then
    echo "Applying base schema..."
    run_sql_file scripts/base-schema.sql
  fi
  run_sql "
ALTER TABLE sales_order_lines
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
" 2>/dev/null || true
}

bootstrap_pharmacy_schema() {
  if [[ ! -f .env || ! -d node_modules ]]; then
    return 0
  fi
  node --input-type=module -e "
    import 'dotenv/config';
    import { ensurePharmacySchema } from './server/pharmacy-schema.js';
    import db from './server/db.js';
    await ensurePharmacySchema();
    await db.end();
    console.log('Pharmacy schema ready.');
  "
}

seed_demo_data() {
  local item_count
  item_count="$(run_sql "SELECT COUNT(*) FROM spicepos.items;" 2>/dev/null | tail -1 || echo 0)"
  if [[ "${item_count:-0}" -eq 0 && -f scripts/seed-pharmacy.sql ]]; then
    echo "Seeding demo pharmacy data..."
    run_sql_file scripts/seed-pharmacy.sql
  fi
}

start_mariadb
provision_db
bootstrap_schema
bootstrap_pharmacy_schema
seed_demo_data
echo "MariaDB ready for spicepos."
