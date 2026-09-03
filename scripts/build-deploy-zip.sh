#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="${1:-spicepos-deploy65.zip}"
rm -f "$OUT"
zip -r "$OUT" \
  DEPLOY-FILES.txt \
  assets/atav-telecom-logo.png \
  index.html login.html master.html setup.html \
  css/pos.css css/saas.css \
  js/app.js js/units.js js/footwear.js js/invoice.js js/support.js js/dev-mode.js js/master.js js/pos-api.js js/x-pos-20260830e.js \
  pos-php-core.php pos-php-scrypt.php pos-php-till.php pos-checkout.php pos-holds.php \
  pos-crud.php pos-backup.php pos-units.php pos-orders.php pos-reports.php pos-accounting.php pos-api.php pos-mail.php pos-alerts.php \
  api/.htaccess api/health/index.php api/checkout/index.php api/holds/index.php \
  api/backup/index.php api/backup/restore/index.php api/units/index.php \
  api/master/notifications/index.php api/master/alerts/index.php \
  api/master/backup/index.php api/master/backup/restore/index.php \
  api/master/backup/platform/index.php api/master/backup/platform/restore/index.php \
  pos-data/.htaccess \
  health.json \
  server.js server/auth.js server/master.js server/onboard.js \
  server/index.js server/crud.js server/tenant.js server/reports.js server/accounting.js \
  server/accounts.js server/roles.js server/schema.js server/backup.js server/backup-util.js \
  server/units.js \
  server/mail.js \
  server/alerts.js \
  server/fy.js \
  package.json
echo "Created $OUT ($(du -h "$OUT" | cut -f1))"
