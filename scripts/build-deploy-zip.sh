#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="${1:-spicepos-deploy.zip}"

mapfile -t JS_FILES < <(find js -maxdepth 1 -name '*.js' ! -name '*.test.js' | sort)
mapfile -t SERVER_FILES < <(find server -name '*.js' ! -name '*.test.js' | sort)
mapfile -t PHP_FILES < <(find . -maxdepth 1 -name 'pos-*.php' | sort)

rm -f "$OUT"
zip -r "$OUT" \
  DEPLOY-FILES.txt \
  README.md \
  assets \
  css \
  legal \
  api \
  pos-data \
  health.json \
  favicon.svg \
  index.html login.html master.html setup.html app.html \
  privacy.html terms.html data-deletion.html refund.html shipping.html cookies.html \
  server.js package.json package-lock.json Procfile \
  scripts/base-schema.sql \
  "${JS_FILES[@]}" \
  "${SERVER_FILES[@]}" \
  "${PHP_FILES[@]}"
echo "Created $OUT ($(du -h "$OUT" | cut -f1))"
