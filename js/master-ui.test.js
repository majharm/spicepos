import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("Master Admin desk collapses nested nav and uses a shop board", () => {
  const html = read("master.html");
  const js = read("js/master.js");
  const css = read("css/saas.css");
  assert.match(html, /class="master-topbar"/);
  assert.match(html, /id="master-nav-toggle"/);
  assert.match(html, /id="master-nav-scrim"/);
  assert.match(html, /data-nav-family="analytics"/);
  assert.match(html, /data-nav-family="seo"/);
  assert.match(html, /nav-group-label">Advanced</);
  assert.match(html, /master\.js\?v=20260922deploy221/);
  assert.match(html, /saas\.css\?v=20260922deploy221/);
  assert.match(js, /function setMasterNavOpen/);
  assert.match(js, /NAV_FAMILIES/);
  assert.match(js, /master-shop-card/);
  assert.match(js, /id="master-shop-q"/);
  assert.match(js, /master-top-title/);
  assert.doesNotMatch(js, /Yearly subscription fees/);
  assert.match(css, /master-nav-group:not\(\.is-open\) \.nav-sub/);
  assert.match(css, /body\.master-nav-open \.master-nav/);
  assert.match(css, /\.master-shop-board/);
});
