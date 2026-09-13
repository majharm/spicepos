import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

function loadShare() {
  const code = fs.readFileSync(new URL("./invoice-share.js", import.meta.url), "utf8");
  const context = { window: {}, globalThis: {} };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.POSInvoiceShare;
}

test("Indian mobiles become WhatsApp country digits without a plus", () => {
  const S = loadShare();
  assert.equal(S.whatsappDigits("9876543210"), "919876543210");
  assert.equal(S.whatsappDigits("+91 98765 43210"), "919876543210");
  assert.equal(S.whatsappDigits("09876543210"), "919876543210");
  assert.equal(S.whatsappDigits(""), "");
});

test("invoice page URL is shareable without a trailing slash on origin", () => {
  const S = loadShare();
  assert.equal(
    S.invoicePageUrl("https://shop.example.com/", "abc-123"),
    "https://shop.example.com/invoice.html?id=abc-123",
  );
});

test("WhatsApp link opens a chat picker when the bill has no mobile", () => {
  const S = loadShare();
  const href = S.whatsappShareUrl("", "Hello");
  assert.equal(href.startsWith("https://wa.me/?text="), true);
  assert.equal(href.includes("Hello"), true);
});

test("share message is short enough for WhatsApp and includes the invoice link", () => {
  const S = loadShare();
  const text = S.shareMessage({
    shopName: "SWAMI MASALE",
    orderNumber: "SO-10036",
    total: 123.5,
    url: "https://pos.atavtelecom.in/invoice.html?id=x",
  });
  assert.match(text, /SO-10036/);
  assert.match(text, /invoice\.html\?id=x/);
  assert.equal(text.includes("SWAMI MASALE"), true);
});

test("customer name is not repeated when business name and mobile match", () => {
  const S = loadShare();
  assert.equal(
    JSON.stringify(
      S.uniqueCustomerLines({
        customer_name: "Ravi",
        customer_mobile: "Ravi",
        customer_address: "Ravi",
      }),
    ),
    JSON.stringify(["Ravi"]),
  );
  assert.equal(
    JSON.stringify(
      S.uniqueCustomerLines({
        customer_name: "Ravi",
        customer_mobile: "9876543210",
        customer_address: "Pune",
      }),
    ),
    JSON.stringify(["Ravi", "9876543210", "Pune"]),
  );
});

test("share actions point WhatsApp at the customer and the public invoice URL", () => {
  const S = loadShare();
  const actions = S.shareActions(
    { id: "order-1", order_number: "SO-9", total: 10, customer_mobile: "9876543210" },
    { name: "Shop" },
    "https://pos.local",
  );
  assert.equal(actions.url, "https://pos.local/invoice.html?id=order-1");
  assert.equal(actions.whatsapp.startsWith("https://wa.me/919876543210?text="), true);
  assert.equal(decodeURIComponent(actions.whatsapp).includes(actions.url), true);
});
