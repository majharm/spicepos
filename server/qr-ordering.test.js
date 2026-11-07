import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  normalizeQrOrderPayload,
  qrLineAmount,
  qrQuantityToBase,
  applyQrOffers,
  toQrPackCards,
  expandQrPackLine,
  packMenuId,
  parsePackMenuId,
  qrMobileDigits,
  qrInvoiceTotals,
  qrOrderingBlocked,
  qrCustomerTrack,
} from "./qr-ordering.js";
import "../js/offers.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("QR order payload requires customer, mobile, and item lines", () => {
  assert.throws(() => normalizeQrOrderPayload({}), /Customer name/);
  assert.throws(
    () => normalizeQrOrderPayload({ customer_name: "A", mobile: "123", lines: [{ item_id: "i1", quantity: 1 }] }),
    /Valid mobile/,
  );
  assert.throws(
    () => normalizeQrOrderPayload({ customer_name: "A", mobile: "9876543210", lines: [] }),
    /at least one item/,
  );
});

test("QR order payload normalizes public customer fields and valid lines", () => {
  const row = normalizeQrOrderPayload({
    customerName: "  Ramesh  ",
    mobile: "+91 98765-43210",
    tableNo: " Table 4 ",
    notes: " less spicy ",
    lines: [
      { itemId: "i1", quantity: "1.5", notes: " No onion, extra cheese " },
      { itemId: "", quantity: 2 },
      { itemId: "i2", quantity: 0 },
    ],
  });
  assert.equal(row.customerName, "Ramesh");
  assert.equal(row.mobile, "+919876543210");
  assert.equal(row.tableNo, "Table 4");
  assert.equal(row.lines.length, 1);
  assert.deepEqual(row.lines[0], { item_id: "i1", quantity: 1.5, notes: "No onion, extra cheese" });
  const flagged = normalizeQrOrderPayload({
    customer_name: "A",
    mobile: "9876543210",
    lines: [{ item_id: "soap", quantity: 1, free_gift: "g1", notes: "Free item:g1" }],
  });
  assert.equal(flagged.lines[0].free_gift, "g1");
});

test("QR based orders apply a PHP-shaped combo percent even when offer_price is 0", () => {
  const priced = applyQrOffers(
    [
      {
        item: { id: "dosa", name: "Masala dosa", category: "South Indian", base_unit: "PCS" },
        unit: "PCS",
        quantityBase: 1,
        amount: 80,
        gstRate: 5,
        gstAmount: 4,
      },
      {
        item: { id: "tea", name: "Tea", category: "Beverage", base_unit: "PCS" },
        unit: "PCS",
        quantityBase: 1,
        amount: 20,
        gstRate: 5,
        gstAmount: 1,
      },
    ],
    {
      offers: [
        {
          name: "Dosa + Tea 8%",
          offer_type: "combo",
          status: "active",
          live_status: "active",
          discount_type: "pct",
          discount_value: "8.00",
          offer_price: "0.00",
          conditions: { item_ids: ["dosa", "tea"] },
        },
      ],
    },
  );
  assert.equal(priced.discount, 8);
  assert.equal(priced.subtotal, 92);
});

test("QR based orders apply an offer whose MySQL end date is 0000-00-00", () => {
  const priced = applyQrOffers(
    [
      {
        item: { id: "dosa", name: "Masala dosa", category: "South Indian", base_unit: "PCS" },
        unit: "PCS",
        quantityBase: 1,
        amount: 80,
        gstRate: 5,
        gstAmount: 4,
      },
    ],
    {
      offers: [
        {
          name: "Dosa 10% off",
          offer_type: "product",
          status: "active",
          live_status: "expired",
          discount_type: "pct",
          discount_value: "10.00",
          offer_price: "0.00",
          start_date: "0000-00-00",
          end_date: "0000-00-00",
          start_time: "00:00:00",
          end_time: "00:00:00",
          conditions: { item_ids: ["dosa"] },
        },
      ],
    },
  );
  assert.equal(priced.discount, 8);
  assert.equal(priced.subtotal, 72);
});

test("QR based orders apply a PHP-shaped percent offer even when offer_price is 0", () => {
  const priced = applyQrOffers(
    [
      {
        item: { id: "vase", name: "Vase", category: "Decor", base_unit: "PCS" },
        unit: "PCS",
        quantityBase: 1,
        amount: 500,
        gstRate: 18,
        gstAmount: 90,
      },
    ],
    {
      offers: [
        {
          name: "Vase 10% off",
          offer_type: "product",
          status: "active",
          live_status: "active",
          discount_type: "pct",
          discount_value: "10.00",
          offer_price: "0.00",
          conditions_json: JSON.stringify({ item_ids: ["vase"] }),
        },
      ],
    },
  );
  assert.equal(priced.discount, 50);
  assert.equal(priced.subtotal, 450);
  assert.equal(priced.message, "Vase 10% off");
});

test("QR based orders apply an active product offer to the line total", () => {
  const O = globalThis.POSOffers;
  const offer = O.normalize({
    name: "Vase 10% off",
    type: "product",
    status: "active",
    discount_type: "pct",
    discount_value: 10,
    item_ids: ["vase"],
  });
  offer.live_status = "active";
  const priced = applyQrOffers(
    [
      {
        item: { id: "vase", name: "Vase", category: "Decor", base_unit: "PCS" },
        unit: "PCS",
        quantityBase: 1,
        amount: 500,
        gstRate: 18,
        gstAmount: 90,
      },
    ],
    { offers: [offer], stacking: "product_and_bill" },
  );
  assert.equal(priced.discount, 50);
  assert.equal(priced.subtotal, 450);
  assert.equal(priced.gst, 81);
  assert.equal(priced.total, 531);
  assert.match(priced.message, /Vase 10% off/);
});

function giftOffer(extra = {}) {
  return {
    id: "g1",
    name: "Soap free",
    offer_type: "free_gift",
    status: "active",
    discount_type: "pct",
    discount_value: 100,
    conditions: { item_ids: ["rice"], free_item_id: "soap", buy_qty: 1, get_qty: 1, ...extra },
  };
}

const riceLine = {
  item: { id: "rice", name: "Rice", category: "Grocery", base_unit: "PCS", retail_rate: 100, gst_rate: 0, stock_gm: 20 },
  unit: "PCS",
  quantityBase: 2,
  amount: 200,
  gstRate: 0,
  gstAmount: 0,
};
const soapItem = { id: "soap", name: "Soap", category: "Grocery", base_unit: "PCS", retail_rate: 40, gst_rate: 5, stock_gm: 20 };

test("QR orders add the configured free item at ₹0 when an eligible product is ordered", () => {
  const priced = applyQrOffers([riceLine], { offers: [giftOffer()], items: [riceLine.item, soapItem] });
  assert.equal(priced.built.length, 2);
  const rice = priced.built.find((line) => line.item.id === "rice");
  const soap = priced.built.find((line) => line.item.id === "soap");
  assert.equal(rice.amount, 200);
  assert.equal(soap.quantityBase, 2);
  assert.equal(soap.amount, 0);
  assert.equal(soap.gstAmount, 0);
  assert.equal(soap.freeGiftOfferId, "g1");
  assert.equal(soap.lineId, "free:g1");
  assert.equal(priced.subtotal, 200);
  assert.equal(priced.discount, 80);
  assert.equal(priced.gst, 0);
  const again = applyQrOffers(priced.built, { offers: [giftOffer()], items: [riceLine.item, soapItem] });
  assert.equal(again.built.filter((line) => line.freeGiftOfferId === "g1").length, 1);
  assert.equal(again.built.find((line) => line.item.id === "soap").amount, 0);
  assert.equal(again.built.find((line) => line.item.id === "rice").amount, 200);
});

test("QR free item keeps a paid line of the same product at full price", () => {
  const paid = {
    item: { ...soapItem, stock_gm: 20 },
    unit: "PCS",
    quantityBase: 2,
    amount: 80,
    gstRate: 5,
    gstAmount: 4,
  };
  const offer = giftOffer();
  offer.conditions = { item_ids: ["soap"], free_item_id: "soap", buy_qty: 1, get_qty: 1 };
  const priced = applyQrOffers([paid], { offers: [offer], items: [paid.item], stacking: "stack" });
  const rows = priced.built.filter((line) => line.item.id === "soap");
  assert.equal(rows.length, 2);
  const free = rows.find((line) => line.freeGiftOfferId === "g1");
  const bought = rows.find((line) => !line.freeGiftOfferId);
  assert.equal(bought.amount, 80);
  assert.equal(free.quantityBase, 2);
  assert.equal(free.amount, 0);
  assert.equal(priced.subtotal, 80);
  assert.equal(priced.discount, 80);
});

test("QR free item waits until the buy quantity is met and ignores an open gift", () => {
  const one = {
    ...riceLine,
    quantityBase: 1,
    amount: 100,
  };
  const waiting = applyQrOffers([one], {
    offers: [giftOffer({ buy_qty: 2, get_qty: 1 })],
    items: [one.item, soapItem],
  });
  assert.equal(waiting.built.length, 1);
  assert.equal(waiting.built[0].amount, 100);
  const open = giftOffer();
  open.conditions = { free_item_id: "soap", buy_qty: 1, get_qty: 1 };
  const unscoped = applyQrOffers([riceLine], { offers: [open], items: [riceLine.item, soapItem] });
  assert.equal(unscoped.built.length, 1);
  assert.equal(unscoped.discount, 0);
  const missing = applyQrOffers([riceLine], { offers: [giftOffer()], items: [] });
  assert.equal(missing.built.length, 1);
});

test("QR free item quantity follows stock and weight units", () => {
  const tight = applyQrOffers([riceLine], {
    offers: [giftOffer()],
    items: [riceLine.item, { ...soapItem, stock_gm: 1 }],
  });
  const soap = tight.built.find((line) => line.item.id === "soap");
  assert.equal(soap.quantityBase, 1);
  assert.equal(soap.amount, 0);
  assert.equal(tight.discount, 40);
  const oil = { id: "oil", name: "Oil", base_unit: "KG", retail_rate: 200, gst_rate: 0, stock_gm: 5000 };
  const kg = applyQrOffers(
    [{ ...riceLine, quantityBase: 1, amount: 100 }],
    { offers: [{ ...giftOffer(), conditions: { item_ids: ["rice"], free_item_id: "oil", buy_qty: 1, get_qty: 1 } }], items: [riceLine.item, oil] },
  );
  const freeOil = kg.built.find((line) => line.item.id === "oil");
  assert.equal(freeOil.quantityBase, 1000);
  assert.equal(freeOil.amount, 0);
  assert.equal(kg.subtotal, 100);
  assert.equal(kg.discount, 200);
});

test("QR based orders apply Buy 1 Get 1 when two packs are in the cart", () => {
  const priced = applyQrOffers(
    [
      {
        item: { id: "19c93463-8f6f-4c19-9887-bcdf14b2fc72", name: "हळद पावडर 1kg", category: "Ground Spices", base_unit: "PCS" },
        unit: "PCS",
        quantityBase: 2,
        amount: 380,
        gstRate: 0,
        gstAmount: 0,
      },
    ],
    {
      offers: [
        {
          name: "Buy 1 Get 1",
          offer_type: "bogo",
          status: "active",
          live_status: "active",
          discount_type: "pct",
          discount_value: "50.00",
          offer_price: "0.00",
          min_qty: "1.00",
          min_spend: "100.00",
          conditions: {
            item_ids: ["19c93463-8f6f-4c19-9887-bcdf14b2fc72"],
            buy_qty: 1,
            get_qty: 1,
            get_item_id: "19c93463-8f6f-4c19-9887-bcdf14b2fc72",
            get_discount_type: "pct",
            get_discount_value: 100,
          },
        },
      ],
    },
  );
  assert.equal(priced.discount, 190);
  assert.equal(priced.subtotal, 190);
});

test("QR menu pack ids use a pack: prefix", () => {
  assert.equal(packMenuId("p1"), "pack:p1");
  assert.equal(parsePackMenuId("pack:p1"), "p1");
  assert.equal(parsePackMenuId("plain-item"), "");
});

test("QR menu cards include sellable packs as PCS", () => {
  const items = [
    { id: "haldi", name: "Haldi", category: "Ground", base_unit: "KG", retail_rate: 200, gst_rate: 5, stock_gm: 5000, status: "active" },
    { id: "mirchi", name: "Mirchi", category: "Ground", base_unit: "KG", retail_rate: 300, gst_rate: 5, stock_gm: 2000, status: "active" },
  ];
  const cards = toQrPackCards(
    [
      {
        id: "p1",
        name: "Kitchen mix",
        status: "active",
        items: [
          { item_id: "haldi", spice_name: "Haldi", quantity_gm: 500 },
          { item_id: "mirchi", spice_name: "Mirchi", quantity_gm: 250 },
        ],
      },
    ],
    items,
  );
  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, "pack:p1");
  assert.equal(cards[0].kind, "pack");
  assert.equal(cards[0].category, "Packs");
  assert.equal(cards[0].base_unit, "PCS");
  assert.equal(cards[0].stock_gm, 8);
  assert.equal(cards[0].retail_rate, 175);
});

test("QR pack cards hide packs without enough stock", () => {
  const cards = toQrPackCards(
    [{ id: "p1", name: "Empty", status: "active", items: [{ item_id: "haldi", quantity_gm: 500 }] }],
    [{ id: "haldi", stock_gm: 100, status: "active", retail_rate: 200, base_unit: "KG" }],
  );
  assert.equal(cards.length, 0);
});

test("QR pack order expands two packs into component stock lines", () => {
  const itemById = new Map([
    ["haldi", { id: "haldi", name: "Haldi", base_unit: "KG", retail_rate: 200, gst_rate: 0, stock_gm: 5000, status: "active" }],
    ["mirchi", { id: "mirchi", name: "Mirchi", base_unit: "KG", retail_rate: 300, gst_rate: 0, stock_gm: 2000, status: "active" }],
  ]);
  const pack = {
    id: "p1",
    name: "Kitchen mix",
    status: "active",
    items: [
      { item_id: "haldi", quantity_gm: 500 },
      { item_id: "mirchi", quantity_gm: 250 },
    ],
  };
  const built = expandQrPackLine({ quantity: 2 }, pack, itemById);
  assert.equal(built.length, 2);
  assert.equal(built[0].quantityBase, 1000);
  assert.equal(built[1].quantityBase, 500);
  assert.equal(built[0].amount, 200);
  assert.equal(built[1].amount, 150);
});

test("QR menu quantities convert kg/litre and piece orders to base stock", () => {
  assert.equal(qrQuantityToBase(1.5, "GM"), 1500);
  assert.equal(qrQuantityToBase(2, "KG"), 2000);
  assert.equal(qrQuantityToBase(1.25, "ML"), 1250);
  assert.equal(qrQuantityToBase(3, "PCS"), 3);
  assert.equal(qrLineAmount(1500, 200, "GM"), 300);
  assert.equal(qrLineAmount(3, 25, "PCS"), 75);
});

test("QR mobile digits match customers on the last ten numbers", () => {
  assert.equal(qrMobileDigits("+91 98765-43210"), "9876543210");
  assert.equal(qrMobileDigits("09876543210"), "9876543210");
  assert.equal(qrMobileDigits("9876543210"), "9876543210");
});

test("QR offers skip a repeat Welcome 10% until the customer has enough bills", () => {
  const dosa = { id: "dosa", name: "Masala Dosa", category: "South Indian", retail_rate: 100, gst_rate: 0, base_unit: "PCS" };
  const welcome = {
    name: "Welcome ₹100 off",
    offer_type: "repeat",
    status: "active",
    live_status: "active",
    discount_type: "pct",
    discount_value: 10,
    min_spend: 199,
    stacking: "stack",
    conditions: { item_ids: [], repeat_bills: 5 },
  };
  const bogo = {
    name: "buy1 get 1 free",
    offer_type: "bogo",
    status: "active",
    live_status: "active",
    discount_type: "pct",
    discount_value: 50,
    conditions: {
      item_ids: ["dosa"],
      buy_qty: 1,
      get_qty: 1,
      get_discount_type: "pct",
      get_discount_value: 100,
    },
  };
  const built = [{ item: dosa, unit: "PCS", quantityBase: 3, amount: 300, gstRate: 0, gstAmount: 0 }];
  const first = applyQrOffers(built, { offers: [welcome, bogo], stacking: "stack", now: new Date("2026-09-10T06:17:00"), customer: { bills: 0 } });
  assert.equal(first.discount, 100);
  assert.equal(first.subtotal, 200);
  assert.equal(first.total, 200);
  assert.match(first.message, /buy1 get 1 free/);
  assert.doesNotMatch(first.message || "", /Welcome/);
  const fifth = applyQrOffers(built, { offers: [welcome, bogo], stacking: "stack", now: new Date("2026-09-10T06:17:00"), customer: { bills: 5 } });
  assert.equal(fifth.discount, 130);
  assert.equal(fifth.subtotal, 170);
});

test("QR invoice totals lift offer discount onto the header so Invoices print gross minus discount", () => {
  const plain = qrInvoiceTotals({ subtotal: 100, discount: 0, gst: 5, total: 105 });
  assert.equal(plain.subtotal, 100);
  assert.equal(plain.discount, 0);
  assert.equal(plain.gst, 5);
  assert.equal(plain.total, 105);
  const offered = qrInvoiceTotals({ subtotal: 90, discount: 10, gst: 4.5, total: 94.5 });
  assert.equal(offered.subtotal, 100);
  assert.equal(offered.discount, 10);
  assert.equal(offered.gst, 4.5);
  assert.equal(offered.total, 94.5);
});

test("QR ordering is blocked for pharmacy shops", () => {
  assert.equal(qrOrderingBlocked({ category: "Medical" }), true);
  assert.equal(qrOrderingBlocked({ name: "ABC MEDICAL" }), true);
  assert.equal(qrOrderingBlocked({ category: "Spices & masala" }), false);
  const php = readFileSync(path.join(root, "pos-qr-ordering.php"), "utf8");
  const app = readFileSync(path.join(root, "js/app.js"), "utf8");
  assert.match(php, /function pos_qr_ordering_blocked/);
  assert.match(php, /QR ordering is not available for pharmacy shops/);
  assert.match(app, /isPharmacyShop\(\)\) return/);
});

test("QR menu page paints a visible offer board from live offers", () => {
  const html = readFileSync(path.join(root, "order.html"), "utf8");
  const js = readFileSync(path.join(root, "js/qr-order.js"), "utf8");
  const css = readFileSync(path.join(root, "css/qr-order.css"), "utf8");
  assert.match(html, /id="offer-board"/);
  assert.match(html, /qr-order\.js\?v=20261107qrfree1/);
  assert.doesNotMatch(html, /qr-order\.js\?v=20260905deploy175/);
  assert.doesNotMatch(html, /offers\.js\?v=20260905deploy168/);
  assert.equal([...html.matchAll(/qr-order\.js\?v=/g)].length, 1);
  assert.equal([...html.matchAll(/offers\.js\?v=/g)].length, 1);
  assert.match(js, /let sending = false/);
  assert.match(js, /function renderOffers/);
  assert.match(js, /function offerAppliesToItem/);
  assert.match(js, /function freeGiftRows/);
  assert.match(js, /function orderLines/);
  assert.match(js, /free_gift: gift.offerId/);
  assert.match(js, /type === "free_gift"/);
  const offersPhp = readFileSync(path.join(root, "pos-offers.php"), "utf8");
  const qrPhp = readFileSync(path.join(root, "pos-qr-ordering.php"), "utf8");
  assert.match(offersPhp, /function pos_qr_attach_free_gifts/);
  assert.match(offersPhp, /freeGiftOfferId/);
  assert.match(qrPhp, /if \(!empty\(\$line\["free_gift"\]\)\) continue;/);
  assert.doesNotMatch(js, /"free_gift", "category"/);
  assert.match(js, /pickBest/);
  assert.match(css, /\.offer-board/);
  assert.match(css, /\.offer-card/);
});

test("QR customer track maps kitchen statuses to friendly steps", () => {
  const placed = qrCustomerTrack({ id: "1", order_number: "QRO-1", status: "pending", total: 120, created_at: "2026-09-21" }, []);
  assert.equal(placed.message, "Your order has been successfully placed.");
  assert.equal(placed.steps[0].current, true);
  const accepted = qrCustomerTrack({ id: "1", order_number: "QRO-1", status: "accepted", total: 120 }, []);
  assert.equal(accepted.message, "Your order has been accepted.");
  const kot = qrCustomerTrack({ id: "1", order_number: "QRO-1", status: "kot_sent", total: 120 }, []);
  assert.equal(kot.message, "Your order has been sent to the kitchen.");
  assert.equal(kot.steps[1].done, true);
  assert.equal(kot.steps[2].current, true);
  const ready = qrCustomerTrack({ id: "1", order_number: "QRO-1", status: "ready", total: 120 }, [{ item_name: "Tea", quantity_gm: 1, unit: "PCS", amount: 20 }]);
  assert.equal(ready.message, "Your order is ready!");
  assert.equal(ready.items[0].name, "Tea");
  const served = qrCustomerTrack({ id: "1", order_number: "QRO-1", status: "completed", total: 120 }, []);
  assert.match(served.stage, /Served/);
  assert.equal(served.message, "Enjoy your meal!");
});
