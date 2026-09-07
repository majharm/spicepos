import assert from "node:assert/strict";
import test from "node:test";
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
