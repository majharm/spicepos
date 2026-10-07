import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("master login does not wait on alerts, backup, or all-shop due rebuild", () => {
  const core = read("pos-php-core.php");
  const dash = core.slice(core.indexOf('if ($path === "master/dashboard"'), core.indexOf('if ($path === "master/plans"'));
  assert.doesNotMatch(dash, /pos_tick_shop_alerts/);
  assert.doesNotMatch(dash, /pos_tick_backup_email/);
  assert.doesNotMatch(dash, /SELECT COUNT\(\*\) AS n FROM sales_orders/);
  assert.match(dash, /GROUP BY business_id/);
  assert.match(dash, /today_bills/);

  const schema = core.slice(
    core.indexOf("function pos_ensure_accounts_schema"),
    core.indexOf("function pos_next_seq"),
  );
  assert.doesNotMatch(schema, /pos_recompute_all_businesses_outstanding/);

  const login = core.slice(core.indexOf('if ($path === "auth/master-login"'), core.indexOf('if ($path === "auth/login"'));
  assert.doesNotMatch(login, /pos_password_needs_rehash/);
  assert.doesNotMatch(login, /pos_hash_password\(\$pass\)/);

  const nodeDash = read("server/master.js");
  const nodeDashFn = nodeDash.slice(nodeDash.indexOf('app.get("/api/master/dashboard"'), nodeDash.indexOf('app.get("/api/master/plans"'));
  assert.doesNotMatch(nodeDashFn, /SELECT COUNT\(\*\) AS n FROM sales_orders/);
  assert.match(nodeDashFn, /GROUP BY business_id/);
  assert.match(nodeDashFn, /today_bills/);
  assert.match(nodeDashFn, /void tickBackupEmail/);

  const boot = read("server/index.js");
  assert.match(boot, /setTimeout\(/);
  assert.match(boot, /recomputeAllBusinessesOutstanding\(\)/);

  const auth = read("server/auth.js");
  const masterLogin = auth.slice(auth.indexOf('app.post("/api/auth/master-login"'), auth.indexOf('app.post("/api/auth/logout"'));
  assert.match(masterLogin, /void query\(/);
  assert.match(masterLogin, /master login audit/);
});

test("PHP proxy remembers the live Node port and fails closed ports quickly", () => {
  const api = read("pos-api.php");
  assert.match(api, /function pos_cached_port/);
  assert.match(api, /function pos_remember_port/);
  assert.match(api, /pos-api-port\.cache/);
  assert.match(api, /CURLOPT_CONNECTTIMEOUT_MS/);
  assert.match(api, /CURLOPT_TIMEOUT => 5/);
  assert.doesNotMatch(api, /CURLOPT_TIMEOUT => 3/);
  assert.match(api, /pos_curl\("http:\/\/127\.0\.0\.1:38473\/api\/"/);
});

test("browser login tries the last working \/api first", () => {
  const apiJs = read("js/pos-api.js");
  assert.match(apiJs, /if \(preferred\) out\.push\(preferred\)/);
  assert.doesNotMatch(apiJs, /if \(preferred && !mutating\)/);
  assert.doesNotMatch(apiJs, /if \(preferred && mutating\) out\.push\(preferred\)/);
  assert.match(read("master.html"), /pos-api\.js\?v=20261006login1/);
  assert.match(read("master.html"), /master\.js\?v=20261007masterux1/);
  assert.match(read("index.html"), /pos-api\.js\?v=20261006login1/);
});
