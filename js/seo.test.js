import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("Master Admin SEO module is wired without hard-coded keyword stats", () => {
  const master = read("master.html");
  const js = read("js/master-seo.js");
  const core = read("pos-php-core.php");
  const php = read("pos-seo.php");
  const index = read("server/index.js");
  const robots = read("robots.txt");
  assert.match(master, /SEO Management/);
  assert.match(master, /data-seo-pane="keywords"/);
  assert.match(master, /js\/master-seo\.js/);
  assert.match(js, /POSMasterSeo/);
  assert.match(js, /Keyword Generator/);
  assert.doesNotMatch(js, /pharmacy POS software Pune/);
  assert.match(core, /pos_seo_master_dispatch/);
  assert.match(core, /pos_seo_public_dispatch/);
  assert.match(php, /function pos_seo_master_dispatch/);
  assert.match(php, /function pos_seo_public_dispatch/);
  assert.match(php, /seo\/public/);
  assert.match(index, /registerSeoMaster/);
  assert.match(index, /registerSeoPublic/);
  assert.match(index, /url\.startsWith\("\/api\/seo"\)/);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Disallow: \/master\.html/);
  assert.match(robots, /Disallow: \/home\.html/);
  assert.match(robots, /Sitemap: https:\/\/pos\.atavtelecom\.in\/sitemap\.xml/);
  const sitemap = read("sitemap.xml");
  assert.match(sitemap, /https:\/\/pos\.atavtelecom\.in\/</);
  assert.match(sitemap, /about\.html/);
  assert.match(sitemap, /lastmod/);
});
