import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import "./aggregator.js";

const A = globalThis.POSAggregator;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("Zomato and Swiggy webhooks normalize to one order shape", () => {
  const zomato = A.parseInbound({
    order_id: 1965530160,
    restaurant_id: 18555376,
    order_type: "delivery",
    customer: { name: "Rahul", phone: "9876543210" },
    dishes: [
      { name: "Paneer Tikka", quantity: 2, unit_cost: 249, instructions: "Less spicy" },
      { name: "Butter Naan", quantity: 3, unit_cost: 40 },
    ],
    discount: 50,
    tax: 48,
    net_total: 646,
  });
  assert.equal(zomato.ok, true);
  assert.equal(zomato.source, "zomato");
  assert.equal(zomato.external_id, "1965530160");
  assert.equal(zomato.lines.length, 2);
  assert.equal(zomato.lines[0].notes, "Less spicy");
  assert.equal(zomato.total, 646);
  assert.equal(zomato.fulfillment, "delivery");

  const swiggy = A.parseInbound(
    {
      order: {
        details: { id: "SWG-8891" },
        items: [{ name: "Masala Dosa", quantity: 1, unit_price: 120 }],
        customer: { name: "Anita" },
        order_total: 140,
        delivery_mode: "pickup",
      },
    },
    "swiggy",
  );
  assert.equal(swiggy.source, "swiggy");
  assert.equal(swiggy.external_id, "SWG-8891");
  assert.equal(swiggy.fulfillment, "pickup");
  assert.equal(A.orderNumber("swiggy", "SWG-8891"), "SWG-SWG8891");
  assert.equal(A.kotTable("swiggy", "pickup"), "Parcel");
  assert.equal(A.kotTable("zomato", "delivery"), "Zomato");
});

test("duplicate status callbacks do not require items", () => {
  const status = A.parseInbound({
    order_id: "1965530160",
    status: "cancelled",
    platform: "zomato",
  });
  assert.equal(status.kind, "status");
  assert.equal(status.status, "cancelled");
  assert.deepEqual(A.nextActions("pending"), ["accepted", "rejected"]);
  assert.equal(A.actionLabel("accepted"), "Accept order");
  assert.equal(A.laneCounts([{ status: "pending" }, { status: "accepted" }, { status: "ready" }]).kitchen, 1);
});

test("outbound calls hit official Zomato and Swiggy POS endpoints", () => {
  const confirm = A.outboundFor("zomato", "accepted", { api_base: "https://api.zomato.com", restaurant_id: "18" }, { external_id: "99" });
  assert.match(confirm.url, /\/online-ordering\/v1\/order\/confirm$/);
  assert.equal(confirm.body.order_id, "99");
  const reject = A.outboundFor("zomato", "rejected", { restaurant_id: "18" }, { external_id: "99", reason: "Out of stock" });
  assert.match(reject.url, /\/order\/reject$/);
  const swiggy = A.outboundFor("swiggy", "ready", { api_base: "https://partner.swiggy.com" }, { external_id: "SW1" });
  assert.match(swiggy.url, /\/pos\/v1\/orders\/SW1\/ready$/);
});

test("Cafe, restaurant, and bar share Zomato and Swiggy wiring", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const server = read("server/aggregator.js");
  const php = read("pos-aggregator.php");
  const core = read("pos-php-core.php");
  assert.match(index, /js\/aggregator\.js\?v=20261012agg2/);
  assert.match(index, /id="agg-desk"|class="qr-orders-page agg-desk"/);
  assert.match(index, /id="agg-lane-stats"/);
  assert.match(index, /id="agg-setup-card"/);
  assert.match(index, /id="agg-order-toast"/);
  assert.match(index, /id="agg-order-search"/);
  assert.match(app, /function renderAggregatorOrders/);
  assert.match(app, /agg-ticket/);
  assert.match(app, /showAggregatorToast/);
  assert.match(app, /sending kitchen KOT/);
  assert.match(read("css/pos.css"), /\.agg-ticket\.is-zomato/);
  assert.match(index, /data-view="online-orders"/);
  assert.match(index, /id="view-online-orders"/);
  assert.match(index, /id="set-zomato-enabled"/);
  assert.match(index, /id="set-swiggy-enabled"/);
  assert.match(app, /loadAggregatorOrders/);
  assert.match(app, /\/api\/aggregator\/orders/);
  assert.match(app, /\/api\/aggregator\/sandbox/);
  assert.match(server, /registerAggregatorPublic/);
  assert.match(server, /\/api\/webhooks\/zomato/);
  assert.match(server, /\/api\/webhooks\/swiggy/);
  assert.match(read("js/aggregator.js"), /online-ordering\/v1\/order\/confirm/);
  assert.match(php, /function pos_agg_public_dispatch/);
  assert.match(php, /function pos_agg_staff_dispatch/);
  assert.match(core, /webhooks\/zomato/);
  assert.match(read("server/index.js"), /registerAggregatorPublic/);
  assert.match(read("pos-php-till.php"), /aggregator/);
});
