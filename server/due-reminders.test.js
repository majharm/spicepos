import test from "node:test";
import assert from "node:assert/strict";
import { sendDueReminders } from "./due-reminders.js";
import { DUE_WA_PROFILE, WA_DEFAULT_PROFILE, dueWaCfg } from "./alerts.js";

const today = "2026-10-24";
const settings = {
  wa_enabled: "1",
  wa_api_key: "test-key",
  wa_profile_id: "acc_saved_master",
  wa_country_code: "91",
  wa_api_url: "https://wamaster.example/api/v1/send",
};

function invoice(extra = {}) {
  return {
    id: "ord-1",
    order_number: "INV-11",
    created_at: "2026-10-20 11:00:00",
    total: 1000,
    amount_paid: 400,
    payment_method: "credit",
    payment_status: "partial",
    customer_id: "cus-1",
    business_name: "Riya Stores",
    mobile: "9876543210",
    ...extra,
  };
}

function memoryStore() {
  const rows = [];
  return {
    rows,
    async recent(businessId, dedupeKey) {
      return [...rows].reverse().find((row) => row.business_id === businessId && row.dedupe_key === dedupeKey) || null;
    },
    async insert(row) {
      rows.push({ ...row });
    },
    async update(id, patch) {
      const row = rows.find((item) => item.id === id);
      if (!row || row.status === "sent" || row.status === "delivered") return 0;
      Object.assign(row, patch, { updated_at: new Date().toISOString() });
      return 1;
    },
  };
}

function jsonResponse(status, body) {
  return {
    status,
    headers: { get() { return ""; } },
    async text() { return typeof body === "string" ? body : JSON.stringify(body); },
  };
}

test("one signup-style due reminder is sent once and a repeat is a duplicate", async () => {
  const posts = [];
  const store = memoryStore();
  const fetchImpl = async (url, opts = {}) => {
    if ((opts.method || "GET") === "GET") return jsonResponse(503, { ok: false });
    const body = JSON.parse(opts.body);
    posts.push(body);
    return jsonResponse(200, { ok: true, sent: 1, results: [{ ok: true, message_id: "wamid.DUE1", number: body.numbers }] });
  };
  const first = await sendDueReminders({
    sends: [{ customerId: "cus-1", orderId: "ord-1", scope: "invoice" }],
  }, {
    invoices: [invoice()],
    settings,
    store,
    fetchImpl,
    businessId: "biz-1",
    shopName: "ATAV Fashion",
    today,
    log: false,
  });
  assert.equal(first.results.length, 1);
  assert.equal(first.results[0].ok, true);
  assert.equal(first.results[0].status, "sent");
  assert.equal(first.results[0].providerMessageId, "wamid.DUE1");
  assert.equal(first.results[0].recipient, "9876543210");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].numbers, "919876543210");
  assert.equal(posts[0].profile_id, DUE_WA_PROFILE);
  assert.equal(posts[0].profile_id, "acc_1792638026073");
  assert.notEqual(posts[0].profile_id, "acc_saved_master");
  assert.equal(WA_DEFAULT_PROFILE, "acc_1782484414096");
  assert.equal(dueWaCfg(settings).apiKey, settings.wa_api_key);
  assert.equal(dueWaCfg(settings).wa_api_url, settings.wa_api_url);
  assert.match(posts[0].message, /Riya Stores/);
  assert.match(posts[0].message, /Balance Due: ₹600\.00/);
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].status, "sent");

  const second = await sendDueReminders({
    sends: [{ customerId: "cus-1", orderId: "ord-1", scope: "invoice" }],
  }, {
    invoices: [invoice()],
    settings,
    store,
    fetchImpl,
    businessId: "biz-1",
    shopName: "ATAV Fashion",
    today,
    log: false,
  });
  assert.equal(second.results[0].duplicate, true);
  assert.equal(posts.length, 1);
  assert.equal(store.rows.length, 1);
});

test("temporary WhatsApp failure retries the same reminder and a bad number does not send", async () => {
  let posts = 0;
  const store = memoryStore();
  const fetchImpl = async (_url, opts = {}) => {
    if ((opts.method || "GET") === "GET") return jsonResponse(503, { ok: false, error: "down" });
    posts += 1;
    if (posts === 1) return jsonResponse(503, { ok: false, error: "down" });
    return jsonResponse(200, { ok: true, sent: 1, results: [{ ok: true, message_id: "wamid.RETRY" }] });
  };
  const sent = await sendDueReminders({
    sends: [{ customerId: "cus-1", orderId: "ord-1" }],
  }, {
    invoices: [invoice()],
    settings,
    store,
    fetchImpl,
    businessId: "biz-1",
    shopName: "ATAV Fashion",
    today,
    log: false,
  });
  assert.equal(sent.results[0].status, "sent");
  assert.equal(sent.results[0].attempts, 2);
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].provider_message_id, "wamid.RETRY");

  const blocked = await sendDueReminders({
    sends: [{ customerId: "cus-2", orderId: "ord-9", scope: "invoice" }],
  }, {
    invoices: [invoice({ id: "ord-9", customer_id: "cus-2", mobile: "12345", order_number: "INV-9", amount_paid: 0, payment_status: "unpaid" })],
    settings,
    store,
    fetchImpl,
    businessId: "biz-1",
    shopName: "ATAV Fashion",
    today,
    log: false,
  });
  assert.equal(blocked.results[0].reason, "bad-mobile");
  assert.equal(posts, 2);
});

test("a saved Dear dash is replaced with the customer on the bill", async () => {
  const posts = [];
  const store = memoryStore();
  const fetchImpl = async (_url, opts = {}) => {
    if ((opts.method || "GET") === "GET") return jsonResponse(503, { ok: false });
    posts.push(JSON.parse(opts.body));
    return jsonResponse(200, { ok: true, sent: 1, results: [{ ok: true, message_id: "wamid.NAME" }] });
  };
  const sent = await sendDueReminders({
    sends: [{ customerId: "cus-1", orderId: "ord-1", scope: "invoice", message: "Dear *—*,\n\nBalance is still open." }],
  }, {
    invoices: [invoice({ business_name: "", name: "", customer_name: "Asha Patel" })],
    settings,
    store,
    fetchImpl,
    businessId: "biz-1",
    shopName: "ATAV Fashion",
    today,
    log: false,
  });
  assert.equal(sent.results[0].ok, true);
  assert.match(posts[0].message, /Dear \*Asha Patel\*,/);
  assert.doesNotMatch(posts[0].message, /Dear \*—\*,/);
});

test("WhatsApp off opens a prefilled chat and a paid invoice is not reminded", async () => {
  let called = 0;
  const store = memoryStore();
  const fetchImpl = async () => {
    called += 1;
    return jsonResponse(200, { ok: true, sent: 1 });
  };
  const off = await sendDueReminders({
    preview: true,
    sends: [{ customerId: "cus-1", orderId: "ord-1", scope: "invoice", message: "Edited reminder for Riya" }],
  }, {
    invoices: [invoice()],
    settings: { ...settings, wa_enabled: "0" },
    store,
    fetchImpl,
    businessId: "biz-1",
    shopName: "ATAV Fashion",
    today,
    log: false,
  });
  assert.equal(off.preview, true);
  assert.equal(off.waOff, true);
  assert.equal(off.messages[0].message, "Edited reminder for Riya");
  assert.match(off.messages[0].fallbackUrl, /^https:\/\/wa\.me\/919876543210\?text=/);
  assert.equal(called, 0);
  assert.equal(store.rows.length, 0);

  const paid = await sendDueReminders({
    sends: [{ customerId: "cus-1", orderId: "ord-1", scope: "invoice" }],
  }, {
    invoices: [invoice({ amount_paid: 1000, payment_status: "paid" })],
    settings,
    store,
    fetchImpl,
    businessId: "biz-1",
    shopName: "ATAV Fashion",
    today,
    log: false,
  });
  assert.equal(paid.results[0].reason, "nothing-due");
  assert.equal(called, 0);
  assert.equal(store.rows.length, 0);
});
