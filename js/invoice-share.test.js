import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReceiptText,
  invoicePageUrl,
  shareActions,
  shareMessage,
  uniqueCustomerLines,
  whatsappDigits,
  whatsappShareUrl,
} from "./invoice-share.js";

test("Indian mobiles become WhatsApp country digits without a plus", () => {
  assert.equal(whatsappDigits("9876543210"), "919876543210");
  assert.equal(whatsappDigits("+91 98765 43210"), "919876543210");
  assert.equal(whatsappDigits("09876543210"), "919876543210");
  assert.equal(whatsappDigits(""), "");
});

test("invoice page URL is shareable without a trailing slash on origin", () => {
  assert.equal(
    invoicePageUrl("https://shop.example.com/", "abc-123"),
    "https://shop.example.com/invoice.html?id=abc-123",
  );
});

test("WhatsApp link opens a chat picker when the bill has no mobile", () => {
  const href = whatsappShareUrl("", "Hello");
  assert.equal(href.startsWith("https://wa.me/?text="), true);
  assert.equal(href.includes("Hello"), true);
});

test("share message is short enough for WhatsApp and includes the invoice link", () => {
  const text = shareMessage({
    shopName: "City Medical",
    orderNumber: "SO-10036",
    total: 123.5,
    url: "https://shop.example.com/invoice.html?id=x",
  });
  assert.match(text, /SO-10036/);
  assert.match(text, /invoice\.html\?id=x/);
  assert.equal(text.includes("City Medical"), true);
});

test("customer name is not repeated when business name and mobile match", () => {
  assert.deepEqual(
    uniqueCustomerLines({
      customer_name: "Ravi",
      customer_mobile: "Ravi",
      customer_address: "Ravi",
    }),
    ["Ravi"],
  );
  assert.deepEqual(
    uniqueCustomerLines({
      customer_name: "Ravi",
      customer_mobile: "9876543210",
      customer_address: "Pune",
    }),
    ["Ravi", "9876543210", "Pune"],
  );
});

test("receipt text lists the customer once and includes GST totals", () => {
  const text = buildReceiptText(
    {
      order_number: "SO-1",
      created_at: "2026-09-13",
      customer_name: "Ravi",
      customer_mobile: "9876543210",
      customer_address: "",
      subtotal: 100,
      discount: 0,
      cgst: 6,
      sgst: 6,
      igst: 0,
      round_off: 0,
      total: 112,
      payment_method: "cash",
      amount_paid: 112,
      lines: [{ item_name: "PCM", quantity_gm: 1, gst_rate: 12, mrp: 20, rate_per_kg: 18, amount: 20.16 }],
    },
    { name: "City Medical", phone: "020000" },
  );
  assert.equal(text.split("Ravi").length - 1, 1);
  assert.match(text, /Grand Total/);
  assert.match(text, /City Medical/);
});

test("share actions point WhatsApp at the customer and the public invoice URL", () => {
  const actions = shareActions(
    { id: "order-1", order_number: "SO-9", total: 10, customer_mobile: "9876543210" },
    { name: "Shop" },
    "https://pos.local",
  );
  assert.equal(actions.url, "https://pos.local/invoice.html?id=order-1");
  assert.equal(actions.whatsapp.startsWith("https://wa.me/919876543210?text="), true);
  assert.equal(decodeURIComponent(actions.whatsapp).includes(actions.url), true);
});
