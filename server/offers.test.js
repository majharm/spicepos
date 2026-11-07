import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("shop UI wires the Offers desk and Counter auto-apply", () => {
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const ui = readFileSync(path.join(root, "js/offers-ui.js"), "utf8");
  const engine = readFileSync(path.join(root, "js/offers.js"), "utf8");
  const node = readFileSync(path.join(root, "server/index.js"), "utf8");
  const php = readFileSync(path.join(root, "pos-offers.php"), "utf8");
  const till = readFileSync(path.join(root, "pos-php-till.php"), "utf8");
  assert.match(html, /data-view="offers"/);
  assert.match(html, /Create new offer/);
  assert.match(html, /offers-desk/);
  assert.match(html, /id="offer-search"/);
  assert.match(html, /data-offer-when/);
  assert.match(html, /js\/offers\.js/);
  assert.match(html, /offer-banner/);
  assert.match(html, /id="offer-popup"/);
  assert.match(html, /Best offer/);
  assert.match(app, /applyOffersToCart/);
  assert.match(app, /showBestOfferPopup/);
  assert.match(app, /Offer waiting/);
  assert.match(engine, /pickBest/);
  assert.match(app, /appliedOffers\?\.pending/);
  assert.match(app, /offerIds/);
  assert.match(ui, /\/api\/offers/);
  assert.match(ui, /duplicateOfferById/);
  assert.match(engine, /bogoFreeQty/);
  assert.match(engine, /Add \$\{needQty\} more/);
  assert.match(ui, /deleteOfferById/);
  assert.match(ui, /data-offer-del/);
  assert.match(ui, /syncOfferFormFields/);
  assert.match(ui, /offerSearch/);
  assert.match(ui, /Inactive/);
  assert.match(html, /data-offer-filter="paused"/);
  assert.match(php, /pos_duplicate_offer/);
  assert.match(php, /function pos_apply_qr_offers/);
  assert.match(php, /function pos_evaluate_offers/);
  assert.match(php, /\$type === "free_gift"/);
  assert.match(engine, /type === "free_gift"/);
  assert.match(engine, /if \(!targets\.length\) return null/);
  assert.match(php, /\$type === "repeat"/);
  assert.match(php, /repeat_bills/);
  const qrPhp = readFileSync(path.join(root, "pos-qr-ordering.php"), "utf8");
  assert.match(qrPhp, /function pos_qr_customer_bills/);
  assert.match(qrPhp, /function pos_qr_reprice_open_order/);
  assert.match(php, /pos_delete_offer/);
  assert.match(php, /pos_set_offer_status/);
  assert.match(node, /duplicateOffer/);
  assert.match(node, /deleteOffer/);
  assert.match(node, /createOffer/);
  assert.match(node, /recordOfferRedemptions/);
  assert.match(php, /pos_create_offer/);
  assert.match(php, /function pos_offer_ymd/);
  assert.match(php, /function pos_offer_clock/);
  assert.match(engine, /start === "00:00" && end === "00:00"/);
  assert.match(engine, /Advanced offer/);
  assert.match(php, /"advance"/);
  assert.match(php, /0000-00-00/);
  assert.match(php, /combo_price.*price.*\$special/);
  assert.match(engine, /0000-00-00/);
  assert.match(app, /O\.liveStatus\(o, ctx\.now, ctx\.timeZone\)/);
  assert.match(php, /pos_find_offer/);
  assert.match(till, /pos_offers_dispatch/);
  assert.match(app, /isClassicBillShop\(\) && !line\.offerId && Number\(line\.discountValue\) > 0/);
  assert.match(ui, /!offerList\.length/);
  assert.match(ui, /Set it to Active for the Counter to apply it/);
  const save = ui.slice(ui.indexOf("async function saveOfferForm"), ui.indexOf("function bindOffersUi"));
  assert.match(save, /setOfferFilter\(shown\)/);
  assert.doesNotMatch(save, /Counter will apply it when the cart matches\.`;\s*hint\.className/);
});

test("classic Counter applies offers and keeps a typed line discount", () => {
  const engine = readFileSync(path.join(root, "js/offers.js"), "utf8");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  const fns = app.slice(app.indexOf("function offerCartContext"), app.indexOf("function findLegacyComboOnBill"));
  const state = {
    company: { timezone: "Asia/Kolkata", business_type: "pharmacy" },
    items: [{ id: "rice", name: "Rice" }],
    cart: [{ lineId: "l1", itemId: "rice", qtyGm: 1, discountType: "amt", discountValue: 0, offerId: "" }],
    offers: [
      {
        id: "p1",
        name: "Rice 10%",
        status: "active",
        offer_type: "product",
        discount_type: "pct",
        discount_value: 10,
      },
    ],
    offerSettings: { stacking: "product_and_bill" },
    offerAuto: true,
    offerBillLocked: false,
    offerDroveBill: false,
    billDiscountType: "amt",
    billDiscountValue: 0,
    loyaltyAccount: null,
    session: {},
  };
  const inputs = {};
  const ctx = createContext({
    state,
    console,
    customer: () => null,
    itemUnit: () => "pcs",
    POSUnits: { isCount: () => true },
    lineCalc: () => ({ gross: 100, taxable: 100 }),
    isClassicBillShop: () => true,
    $: (id) => inputs[id] || null,
  });
  runInContext(`${engine}\n${fns}`, ctx);
  runInContext("applyOffersToCart()", ctx);
  assert.equal(state.cart[0].discountValue, 10);
  assert.equal(state.cart[0].offerId, true);
  assert.equal(state.cart[0].discountType, "amt");

  state.cart[0].discountValue = 25;
  state.cart[0].offerId = "";
  runInContext("applyOffersToCart()", ctx);
  assert.equal(state.cart[0].discountValue, 25);
  assert.equal(state.cart[0].offerId, "");

  state.offers = [
    {
      id: "b1",
      name: "Happy hour",
      status: "active",
      offer_type: "time",
      discount_type: "pct",
      discount_value: 10,
    },
  ];
  state.cart[0].discountValue = 0;
  state.offerBillLocked = false;
  inputs["bill-disc-type"] = { value: "amt" };
  inputs["bill-disc-value"] = { value: 0 };
  runInContext("applyOffersToCart()", ctx);
  assert.equal(state.billDiscountValue, 10);
  assert.equal(state.offerDroveBill, true);
  assert.equal(inputs["bill-disc-value"].value, 10);
});

test("Offers page shows an empty shop instead of a failed filter", () => {
  const ui = readFileSync(path.join(root, "js/offers-ui.js"), "utf8");
  const nodes = { "offer-list": { innerHTML: "" } };
  const ctx = createContext({
    state: { items: [] },
    window: {},
    console,
    escapeHtml: (v) => String(v ?? ""),
    money: (n) => `₹${n}`,
    $: (id) => nodes[id] || null,
  });
  ctx.window = ctx;
  runInContext(
    `${ui}
offerList = [];
offerFilter = "active";
offerSearch = "";
paintOfferList();
`,
    ctx,
  );
  assert.match(nodes["offer-list"].innerHTML, /No offers yet/);
  assert.doesNotMatch(nodes["offer-list"].innerHTML, /No offers match/);
});
