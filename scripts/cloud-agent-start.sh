#!/usr/bin/env bash
# Cloud Agent start — per-boot MariaDB for local POS. Must terminate.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v mariadb >/dev/null 2>&1 && ! command -v mysql >/dev/null 2>&1; then
  echo "No MariaDB/MySQL client; skipping database start."
  exit 0
fi

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
  local sql="
CREATE DATABASE IF NOT EXISTS spicepos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'spicepos'@'localhost' IDENTIFIED BY 'spicepos_test';
GRANT ALL PRIVILEGES ON spicepos.* TO 'spicepos'@'localhost';
FLUSH PRIVILEGES;
"
  if mariadb -e "$sql" 2>/dev/null || mysql -e "$sql" 2>/dev/null; then
    return 0
  fi
  sudo mariadb -e "$sql" 2>/dev/null || sudo mysql -e "$sql"
}

apply_base_schema() {
  local schema_file="$(dirname "$0")/cloud-agent-base-schema.sql"
  if [[ ! -f "$schema_file" ]]; then
    echo "No base schema file; skipping table bootstrap."
    return 0
  fi
  if mariadb spicepos <"$schema_file" 2>/dev/null; then
    return 0
  fi
  sudo mariadb spicepos <"$schema_file"
}

start_mariadb
provision_db
apply_base_schema
echo "MariaDB ready for spicepos."
