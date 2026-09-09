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
} from "./qr-ordering.js";
import "../js/offers.js";

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
      { itemId: "i1", quantity: "1.5" },
      { itemId: "", quantity: 2 },
      { itemId: "i2", quantity: 0 },
    ],
  });
  assert.equal(row.customerName, "Ramesh");
  assert.equal(row.mobile, "+919876543210");
  assert.equal(row.tableNo, "Table 4");
  assert.equal(row.lines.length, 1);
  assert.deepEqual(row.lines[0], { item_id: "i1", quantity: 1.5 });
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

test("QR menu page paints a visible offer board from live offers", () => {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const html = readFileSync(path.join(root, "order.html"), "utf8");
  const js = readFileSync(path.join(root, "js/qr-order.js"), "utf8");
  const css = readFileSync(path.join(root, "css/qr-order.css"), "utf8");
  assert.match(html, /id="offer-board"/);
  assert.match(html, /qr-order\.js\?v=20260905deploy170/);
  assert.match(js, /function renderOffers/);
  assert.match(js, /function offerAppliesToItem/);
  assert.match(css, /\.offer-board/);
  assert.match(css, /\.offer-card/);
});
