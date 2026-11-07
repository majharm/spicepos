import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { workbookXml } from "./excel.js";
import "../js/offer-profit.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const P = globalThis.POSOfferProfit;

test("offer profit PDF is a real document and excel sheets stay named", () => {
  const report = P.assembleOfferProfit({
    scope: { businessId: "shop-1" },
    from: "2026-11-01",
    to: "2026-11-07",
    orders: [],
    lines: [],
  });
  const pdf = P.reportPdfBuffer(P.pdfLines(report));
  assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
  assert.match(pdf.toString("latin1"), /Offer Wise Sales/);
  const sheets = P.sheetsFromReport(report);
  assert.equal(sheets[1].name, "Offer Wise Sales");
  const xml = workbookXml(sheets);
  assert.match(xml, /Worksheet ss:Name="Offer Wise Sales"/);
  assert.match(xml, /Worksheet ss:Name="Sales Wise Profit"/);
  assert.match(xml, /Worksheet ss:Name="Profit summary"/);
});

test("shop and master routes stay tenant-safe and skip voided bills", () => {
  const server = read("server/offer-profit.js");
  const index = read("server/index.js");
  const master = read("server/master.js");
  assert.match(server, /saleNotVoidSql\("o"\)/);
  assert.match(server, /createdBetween\("o"\)/);
  assert.match(server, /resolveReportScope\(staffActor\(\), req\.query\)/);
  assert.match(server, /requirePerm\("reports"\)/);
  assert.match(server, /\/api\/reports\/offer-profit/);
  assert.match(server, /\/api\/master\/offer-profit/);
  assert.doesNotMatch(server, /DATE\(\s*o\.created_at\s*\)\s*(=|BETWEEN|>=|<=)/);
  assert.match(index, /registerOfferProfit\(app\)/);
  assert.match(master, /registerMasterOfferProfit\(app\)/);
  const till = read("pos-php-till.php");
  const php = read("pos-offer-profit.php");
  const app = read("js/app.js");
  assert.match(till, /pos_offer_profit_shop/);
  assert.match(php, /pos_build_offer_profit/);
  assert.match(app, /profitBlock/);
  assert.match(app, /timeoutMs: 25000/);
});
