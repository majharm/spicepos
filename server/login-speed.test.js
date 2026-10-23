import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("PHP login and auth skip the Node port scan and start delay", () => {
  const api = read("pos-api.php");
  assert.match(api, /function pos_is_login_fast_path/);
  assert.match(api, /function pos_node_down_fresh/);
  assert.match(api, /function pos_mark_node_down/);
  assert.match(api, /pos-api-node-down\.cache/);
  assert.match(api, /skipped login fast-path/);
  assert.match(api, /auth\/login/);
  assert.match(api, /auth\/master-login/);
  assert.match(api, /\$timeoutSec = 5/);
  assert.match(api, /pos_curl\("http:\/\/127\.0\.0\.1:" \. \$cached/);
  assert.match(api, /pos_mark_node_down\(\)/);
  assert.doesNotMatch(
    api.slice(api.indexOf("$fastLogin = pos_is_login_fast_path"), api.indexOf("} elseif (!pos_node_down_fresh())")),
    /pos_try_start_node/,
  );
  assert.doesNotMatch(
    api.slice(api.indexOf("$fastLogin = pos_is_login_fast_path"), api.indexOf("} elseif (!pos_node_down_fresh())")),
    /pos_try_proxy/,
  );
  assert.doesNotMatch(
    api.slice(api.indexOf("$fastLogin = pos_is_login_fast_path"), api.indexOf("} elseif (!pos_node_down_fresh())")),
    /usleep/,
  );
});

test("staff login does not rehash passwords on the request path", () => {
  const core = read("pos-php-core.php");
  const login = core.slice(core.indexOf('if ($path === "auth/login"'), core.indexOf('if ($path === "auth/signup"'));
  assert.doesNotMatch(login, /pos_password_needs_rehash/);
  assert.match(login, /pos_verify_password/);
});

test("bootstrap schema ensures use a core-mtime stamp", () => {
  const core = read("pos-php-core.php");
  const till = read("pos-php-till.php");
  assert.match(core, /function pos_schema_stamp_fresh/);
  assert.match(core, /function pos_schema_stamp_mark/);
  assert.match(core, /pos-schema\.stamp/);
  assert.match(core, /if \(pos_schema_stamp_fresh\(\)\) return;/);
  assert.match(till, /pos_schema_stamp_mark\(\)/);
  const boot = till.slice(till.indexOf('if ($path === "bootstrap"'), till.indexOf("require_once __DIR__ . \"/pos-combos.php\""));
  assert.match(boot, /pos_ensure_i18n_columns/);
  assert.match(boot, /pos_schema_stamp_mark/);
});

test("public login-page payload skips versions and audit queries", () => {
  const php = read("pos-login-page.php");
  const publicFn = php.slice(php.indexOf("function pos_login_page_public()"), php.indexOf("function pos_login_page_public_dispatch"));
  assert.match(publicFn, /SELECT published_json, published_version FROM login_page_settings/);
  assert.doesNotMatch(publicFn, /pos_login_page_bundle\(\)/);
  assert.doesNotMatch(publicFn, /login_page_versions/);
  assert.doesNotMatch(publicFn, /login_page_audit_logs/);
  assert.match(php, /Cache-Control: private, max-age=30/);
  assert.match(read("server/login-page.js"), /Cache-Control", "private, max-age=30/);
});

test("login page HTML and fetch do not block on no-store or sequential API specs", () => {
  const login = read("login.html");
  const js = read("js/login-page.js");
  const xpos = read("js/x-pos-20260830e.js");
  const apiJs = read("js/pos-api.js");
  assert.doesNotMatch(login, /no-store, no-cache, must-revalidate/);
  assert.match(login, /private, max-age=300/);
  assert.match(login, /rel="preload" as="image"/);
  assert.match(login, /fetchpriority="high"/);
  assert.match(js, /function loginPageUrls/);
  assert.match(js, /setTimeout\(\(\) => ctrl\.abort\(\), 2500\)/);
  assert.match(js, /\/pos-api\.php\?p=/);
  const readFn = js.slice(js.indexOf("async function readLoginPage"), js.indexOf("async function loadPublished"));
  assert.match(readFn, /isMaster/);
  assert.match(readFn, /window\.posRequest/);
  assert.match(xpos, /setTimeout\(\(\) => ctrl\.abort\(\), 8000\)/);
  assert.match(apiJs, /mutating \? 20000 : 8000/);
});
