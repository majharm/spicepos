import test from "node:test";
import assert from "node:assert/strict";
import {
  suggestKeywords,
  applyTemplate,
  scoreSeoPage,
  RESERVED_SLUGS,
  DEFAULT_ROBOTS,
  withSitemapLine,
  INDIA_SEO_BANK,
  indiaTrendingKeywords,
  indiaTrendingPack,
  indiaTrendKeywordId,
  indiaTrendCategory,
} from "./seo.js";

test("keyword generator does not persist and uses inputs only", () => {
  const rows = suggestKeywords({ businessType: "Pharmacy", service: "POS software", location: "Pune" });
  assert.ok(rows.some((s) => /pharmacy/i.test(s) && /pune/i.test(s)));
  assert.equal(suggestKeywords({ businessType: "" }).length, 0);
});

test("SEO score is a checklist and not a Google rank", () => {
  const poor = scoreSeoPage({});
  assert.equal(poor.grade, "Critical");
  assert.match(poor.note, /not a Google ranking/);
  const rich = scoreSeoPage({
    seo_title: "Pharmacy POS Software | ATAV POS",
    meta_description: "Manage pharmacy billing, medicine inventory, batches, expiry, customers and reports with ATAV POS today.",
    h1: "Pharmacy POS software",
    url: "/pharmacy-pos",
    primary_keyword: "pharmacy POS software",
    intro: "x".repeat(300),
    canonical: "https://pos.atavtelecom.in/pharmacy-pos",
    og_title: "Pharmacy POS",
    schema_type: "SoftwareApplication",
  });
  assert.ok(rich.score >= 55);
});

test("India trending keywords stay stable for one Kolkata day and change the next day", () => {
  const day = indiaTrendingKeywords("2026-10-31");
  assert.deepEqual(day, indiaTrendingKeywords("2026-10-31"));
  assert.deepEqual(day, indiaTrendingKeywords(new Date("2026-10-31T18:29:00Z")));
  const next = indiaTrendingKeywords("2026-11-01");
  assert.deepEqual(next, indiaTrendingKeywords(new Date("2026-10-31T18:30:00Z")));
  assert.notDeepEqual(day, next);
  assert.equal(day.length, 8);
  assert.equal(new Set(day).size, 8);
  for (const keyword of day) assert.ok(INDIA_SEO_BANK.includes(keyword));
  const pack = indiaTrendingPack("2026-01-01");
  assert.equal(pack.country, "India");
  assert.equal(pack.date, "2026-01-01");
  assert.deepEqual(pack.keywords.slice(0, 2), [INDIA_SEO_BANK[0], INDIA_SEO_BANK[1]]);
  assert.match(pack.note, /not a live Google rank/i);
  assert.equal(indiaTrendKeywordId("GST billing software India"), indiaTrendKeywordId("GST billing software India"));
  assert.equal(indiaTrendKeywordId("GST billing software India").length, 32);
  assert.equal(indiaTrendCategory("pharmacy billing software India"), "Pharmacy");
  assert.equal(indiaTrendCategory("kirana store billing software"), "Grocery");
  assert.notDeepEqual(indiaTrendingKeywords("2024-02-29"), indiaTrendingKeywords("2024-03-01"));
});

test("templates expand variables and reserved slugs protect the POS", () => {
  assert.equal(applyTemplate("{category} POS Software in {city}", { category: "Pharmacy", city: "Pune" }), "Pharmacy POS Software in Pune");
  assert.ok(RESERVED_SLUGS.has("login"));
  assert.ok(RESERVED_SLUGS.has("api"));
  assert.match(DEFAULT_ROBOTS, /Disallow: \/api\//);
  assert.match(DEFAULT_ROBOTS, /Sitemap: https:\/\/pos\.atavtelecom\.in\/sitemap\.xml/);
  assert.match(withSitemapLine("User-agent: *\nDisallow: /api/\n"), /Sitemap:/);
});
