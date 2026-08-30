#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

start_mariadb() {
  if command -v service >/dev/null 2>&1; then
    sudo service mariadb start >/dev/null 2>&1 || true
  fi
  for _ in $(seq 1 30); do
    if mariadb -e "SELECT 1" >/dev/null 2>&1 || sudo mariadb -e "SELECT 1" >/dev/null 2>&1; then
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
CREATE USER IF NOT EXISTS 'spicepos'@'localhost' IDENTIFIED BY 'spicepos_dev';
GRANT ALL PRIVILEGES ON spicepos.* TO 'spicepos'@'localhost';
FLUSH PRIVILEGES;
"
  if mariadb -e "$sql" 2>/dev/null; then
    return 0
  fi
  sudo mariadb -e "$sql"
}

start_mariadb
provision_db
echo "MariaDB ready for spicepos."
