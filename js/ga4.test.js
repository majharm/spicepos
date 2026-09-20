import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("public pages load GA4 tagging and consent, Master Admin has Analytics", () => {
  const ga = read("js/ga4.js");
  const home = read("home.html");
  const about = read("about.html");
  const login = read("login.html");
  const master = read("master.html");
  const masterJs = read("js/master.js");
  const ui = read("js/master-analytics.js");
  const php = read("pos-analytics.php");
  const core = read("pos-php-core.php");
  const deploy = read("DEPLOY-FILES.txt");

  assert.match(ga, /atav_ga_consent/);
  assert.match(ga, /googletagmanager\.com\/gtag\/js/);
  assert.match(ga, /get_started/);
  assert.match(ga, /book_demo/);
  assert.match(ga, /contact_submit/);
  assert.doesNotMatch(ga, /body\.params\.phone/);
  assert.match(home, /js\/ga4\.js\?v=20260920ga4a/);
  assert.match(about, /js\/ga4\.js\?v=20260920ga4a/);
  assert.match(login, /js\/ga4\.js\?v=20260920ga4a/);
  assert.match(master, /data-analytics-pane="settings"/);
  assert.match(master, /Google Analytics/);
  assert.match(master, /js\/master-analytics\.js/);
  assert.match(masterJs, /tab === "analytics"/);
  assert.match(ui, /POSMasterAnalytics/);
  assert.doesNotMatch(ui, /Organic Users: 2,450/);
  assert.match(php, /function pos_analytics_public_dispatch/);
  assert.match(core, /pos_analytics_public_dispatch/);
  assert.match(core, /pos_analytics_master_dispatch/);
  assert.match(deploy, /pos-analytics.php/);
  assert.match(deploy, /server\/analytics.js/);
});
