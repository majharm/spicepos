import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GA4_EVENTS, DEFAULT_CONVERSIONS, isMeasurementId, sanitizeEventParams, rangeToSince } from "./analytics.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("GA4 measurement IDs and event params follow the official model", () => {
  assert.equal(isMeasurementId("G-ABCDEF12"), true);
  assert.equal(isMeasurementId("UA-123"), false);
  assert.equal(isMeasurementId(""), false);
  const clean = sanitizeEventParams({
    business_category: "pharmacy",
    phone: "9765040588",
    email: "a@b.c",
    name: "Ada",
    cta_type: "get_started",
  });
  assert.equal(clean.business_category, "pharmacy");
  assert.equal(clean.cta_type, "get_started");
  assert.equal(clean.phone, undefined);
  assert.equal(clean.email, undefined);
  assert.equal(clean.name, undefined);
  assert.ok(GA4_EVENTS.includes("get_started"));
  assert.ok(GA4_EVENTS.includes("book_demo"));
  assert.ok(DEFAULT_CONVERSIONS.includes("contact_submit"));
  const r = rangeToSince("7d");
  assert.ok(r.until.getTime() - r.since.getTime() >= 6 * 86400000);
});

test("analytics APIs are registered without OAuth tokens in the browser", () => {
  const js = read("server/analytics.js");
  const index = read("server/index.js");
  const masterUi = read("js/master-analytics.js");
  const ga = read("js/ga4.js");
  assert.match(js, /registerAnalyticsPublic/);
  assert.match(js, /GA4_CREDENTIALS_JSON/);
  assert.match(index, /url\.startsWith\("\/api\/analytics"\)/);
  assert.match(index, /registerAnalyticsMaster/);
  assert.doesNotMatch(masterUi, /client_secret/);
  assert.doesNotMatch(ga, /access_token/);
  assert.match(js, /source: "website_events"/);
  assert.match(js, /Search Console rankings are not included/);
});
