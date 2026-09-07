import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function loadI18n() {
  const catalog = fs.readFileSync(new URL("./i18n-catalog.js", import.meta.url), "utf8");
  const engine = fs.readFileSync(new URL("./i18n.js", import.meta.url), "utf8");
  const context = { window: {}, globalThis: {} };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(catalog, context);
  vm.runInContext(engine, context);
  return context.POSI18n;
}

test("i18n falls back to English and never shows the raw key", () => {
  const I = loadI18n();
  I.setLocale("mr");
  assert.equal(I.t("pos.total", "mr"), "एकूण");
  assert.equal(I.t("pos.total", "hi"), "कुल");
  assert.equal(I.t("pos.total", "en"), "Total");
  assert.doesNotMatch(I.t("dashboard.does_not_exist_key"), /dashboard\.does_not_exist/);
  assert.notEqual(I.t("pos.total", "gu"), "");
  assert.equal(I.t("pos.pay_amount", "hi", { amount: "₹10" }).includes("₹10"), true);
  assert.equal(I.t("settings.customer_notes", "en"), "Customer notes");
  assert.equal(I.t("invoice.terms", "en"), "Terms & conditions");
});

test("locale hierarchy is customer then user then shop then English", () => {
  const I = loadI18n();
  assert.equal(I.resolveLocale({ shop: "mr" }), "mr");
  assert.equal(I.resolveLocale({ user: "hi", shop: "mr" }), "hi");
  assert.equal(I.resolveLocale({ customer: "ta", user: "hi", shop: "mr" }), "ta");
  assert.equal(I.resolveLocale({}), "en");
  assert.equal(I.normalizeLocale("hi-IN"), "hi");
  assert.equal(I.localeInfo("ur").dir, "rtl");
});

test("invoice bilingual mode and item names", () => {
  const I = loadI18n();
  I.setInvoiceMode("bilingual");
  const label = I.invoiceLabel("invoice.total", "hi", "bilingual");
  assert.match(label, /कुल/);
  assert.match(label, /Total/);
  assert.equal(I.invoiceLabel("invoice.total", "hi", "en"), "Total");
  assert.equal(I.displayItemName({ name: "Rice", local_name: "चावल" }, "hi", "shop"), "चावल");
  assert.match(I.displayItemName({ name: "Rice", local_name: "चावल" }, "hi", "bilingual"), /चावल/);
});

test("coverage reports every locale and Urdu is RTL", () => {
  const I = loadI18n();
  const rows = I.coverage();
  assert.equal(rows.length, 13);
  const en = rows.find((r) => r.code === "en");
  const hi = rows.find((r) => r.code === "hi");
  const ur = rows.find((r) => r.code === "ur");
  assert.equal(en.percent, 100);
  assert.ok(hi.percent >= 95);
  assert.equal(ur.dir, "rtl");
  assert.ok(I.optionsHtml("mr").includes("value=\"mr\""));
});

test("regional search matches local names and Latin folds", () => {
  const I = loadI18n();
  const item = { name: "Rice", local_name: "तांदूळ", hsn: "1006" };
  assert.equal(I.matchesQuery(item, "चावल") || I.matchesQuery(item, "तांदूळ"), true);
  assert.equal(I.matchesQuery(item, "tandul"), true);
  assert.equal(I.matchesQuery(item, "rice"), true);
  assert.equal(I.matchesQuery(item, "xyzzy"), false);
});
