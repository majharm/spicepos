import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clientDevice, growthPct, insightWindow, businessesCsv } from "./master-live.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("growth stays blank when the previous period has no base", () => {
  assert.equal(growthPct(10, 0), null);
  assert.equal(growthPct(0, 0), 0);
  assert.equal(growthPct(15, 10), 50);
  assert.equal(growthPct(5, 10), -50);
});

test("insight ranges stay on a fixed SQL allow-list", () => {
  assert.equal(insightWindow("today").label, "Today");
  assert.equal(insightWindow("nope").label, "Last 30 days");
  assert.match(insightWindow("7").current, /INTERVAL 6 DAY/);
  assert.doesNotMatch(insightWindow("30").current, /\$/);
});

test("device labels come from the user agent", () => {
  assert.deepEqual(clientDevice("Mozilla/5.0 (iPhone) AppleWebKit Chrome/120.0 Mobile"), { device: "Phone", browser: "Chrome" });
  assert.equal(clientDevice("Mozilla/5.0 Macintosh Safari/17").device, "Desktop");
  assert.equal(clientDevice("").browser, "—");
});

test("business export quotes commas and skips secrets", () => {
  const csv = businessesCsv([{ id: "1", name: "Spice, House", owner_name: "A", fee_monthly: 1200, computed_status: "active" }]);
  assert.match(csv, /"Spice, House"/);
  assert.doesNotMatch(csv, /password/);
});

test("live monitoring is wired without marking a quiet tab online", () => {
  const pulse = read("js/session-pulse.js");
  assert.match(pulse, /pointerdown/);
  assert.match(pulse, /keydown/);
  assert.match(pulse, /\/api\/session\/pulse/);
  assert.doesNotMatch(pulse, /setInterval/);
  assert.match(read("index.html"), /session-pulse\.js\?v=20261030live1/);
  assert.match(read("master.html"), /data-tab="live"/);
  assert.match(read("master.html"), /master\.js\?v=20261031auto3/);
  assert.match(read("pos-php-core.php"), /session\/pulse/);
  assert.match(read("pos-php-core.php"), /last_seen_at/);
  assert.match(read("pos-master-live.php"), /function pos_master_live_dispatch/);
  assert.match(read("server/auth.js"), /\/api\/session\/pulse/);
  assert.match(read("server/master-live.js"), /ONLINE_WINDOW_MINUTES = 5/);
  assert.match(read("server/master.js"), /registerMasterLive/);
});
