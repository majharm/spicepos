import test from "node:test";
import assert from "node:assert/strict";
import { suggestKeywords, applyTemplate, scoreSeoPage, RESERVED_SLUGS, DEFAULT_ROBOTS } from "./seo.js";

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

test("templates expand variables and reserved slugs protect the POS", () => {
  assert.equal(applyTemplate("{category} POS Software in {city}", { category: "Pharmacy", city: "Pune" }), "Pharmacy POS Software in Pune");
  assert.ok(RESERVED_SLUGS.has("login"));
  assert.ok(RESERVED_SLUGS.has("api"));
  assert.match(DEFAULT_ROBOTS, /Disallow: \/api\//);
});
