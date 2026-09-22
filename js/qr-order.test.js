import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("QR food order collects a special instruction on each cart line", () => {
  const html = read("order.html");
  const js = read("js/qr-order.js");
  assert.doesNotMatch(html, /textarea name="notes"/);
  assert.match(js, /Add Special Instruction/);
  assert.match(js, /data-note-open/);
  assert.match(js, /notes: clipNote\(cartNote\(item_id\)\)/);
});

test("Table QR prefill locks the table on the public menu", () => {
  const html = read("order.html");
  const js = read("js/qr-order.js");
  const poster = read("qr.html");
  assert.match(html, /id="table-badge"/);
  assert.match(html, /id="table-locked"/);
  assert.match(js, /location\.search\)\.get\("table"\)/);
  assert.match(js, /function lockTableField/);
  assert.match(js, /table_no: tablePrefill \|\| form\.get\("table_no"\)/);
  assert.match(poster, /searchParams\.set\("table"/);
  assert.match(poster, /Scan to order from this table/);
});

test("Customer QR page tracks live kitchen status without a refresh", () => {
  const html = read("order.html");
  const js = read("js/qr-order.js");
  const app = read("js/app.js");
  const php = read("pos-qr-ordering.php");
  const node = read("server/qr-ordering.js");
  assert.match(html, /id="active-orders"/);
  assert.match(html, /id="order-list-title"/);
  assert.match(html, /class="order-list"/);
  assert.match(js, /\/api\/qr\/order\?/);
  assert.match(js, /\/api\/qr\/table\?/);
  assert.match(js, /function startTrack/);
  assert.match(app, /async function sendQrKitchenKot/);
  assert.match(app, /qr_order_id: order\.id/);
  assert.match(php, /function pos_qr_send_kitchen_ticket/);
  assert.match(php, /qr\/order/);
  assert.match(php, /qr\/table/);
  assert.match(node, /app.get\("\/api\/qr\/order"/);
  assert.match(node, /app.get\("\/api\/qr\/table"/);
  assert.match(node, /kot_sent/);
  assert.doesNotMatch(node, /result.status = "kot_sent"/);
});

test("Counter restaurant cart and QR desk show item-wise instructions", () => {
  const app = read("js/app.js");
  assert.match(app, /function restaurantLineNoteHtml/);
  assert.match(app, /Add Special Instruction/);
  assert.match(app, /qr-line-si/);
  assert.match(app, /notes: scaleLineNote\(l\)/);
  assert.match(app, /function scaleLineNote/);
});
