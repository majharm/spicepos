import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createdBeforeDay,
  createdBetween,
  createdPrevMonth,
  createdSinceDays,
  createdThisMonth,
  createdToday,
  createdYesterday,
} from "./sql-time.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("calendar filters keep created_at sargable", () => {
  assert.match(createdToday(), /created_at >= CURDATE\(\)/);
  assert.match(createdToday("o"), /o\.created_at >= CURDATE\(\)/);
  assert.match(createdYesterday(), /DATE_SUB\(CURDATE\(\), INTERVAL 1 DAY\)/);
  assert.match(createdSinceDays(13), /INTERVAL 13 DAY/);
  assert.equal(createdBetween(), "created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)");
  assert.equal(createdBetween("o"), "o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)");
  assert.equal(createdBeforeDay(), "created_at < ?");
  assert.match(createdThisMonth(), /%Y-%m-01/);
  assert.match(createdPrevMonth(), /INTERVAL 1 MONTH/);
  assert.throws(() => createdSinceDays(-1));
  assert.throws(() => createdSinceDays(1.5));
});

test("hot sales queries no longer wrap created_at in DATE()", () => {
  const files = [
    "server/reports.js",
    "server/hub.js",
    "server/index.js",
    "server/tenant.js",
    "server/growth.js",
    "server/accounts.js",
    "server/alerts.js",
    "server/master.js",
    "pos-php-till.php",
    "pos-reports.php",
    "pos-growth.php",
    "pos-php-core.php",
  ];
  for (const rel of files) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /DATE\((?:o\.)?created_at\)\s*(=|BETWEEN|>=|<=|<|>)/,
      `${rel} still compares DATE(created_at) in a filter`,
    );
  }
});

test("dashboard outstanding rebuild is set-based", () => {
  const accounts = read("server/accounts.js");
  const core = read("pos-php-core.php");
  const app = read("js/app.js");
  assert.match(accounts, /async function recomputeBusinessOutstandingSetBased/);
  assert.doesNotMatch(accounts, /for \(const row of rows\) await recomputeCustomerOutstanding/);
  assert.match(core, /function pos_recompute_business_outstanding_set/);
  assert.doesNotMatch(core, /foreach \(\$custs as \$row\) pos_recompute_customer_outstanding/);
  assert.match(app, /const CATALOG_RENDER_LIMIT = 96/);
  assert.match(app, /function listRenderHint/);
});
