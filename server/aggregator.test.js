import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import "../js/aggregator.js";

const A = globalThis.POSAggregator;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("Node and PHP expose the same Zomato and Swiggy POS API surface", () => {
  const server = read("server/aggregator.js");
  const php = read("pos-aggregator.php");
  const index = read("server/index.js");
  assert.match(index, /url\.startsWith\("\/api\/webhooks\/"\)/);
  assert.match(index, /registerAggregatorPublic/);
  assert.match(index, /registerAggregatorStaff/);
  assert.match(server, /\/api\/webhooks\/zomato/);
  assert.match(server, /\/api\/webhooks\/swiggy/);
  assert.match(server, /\/api\/aggregator\/sandbox/);
  assert.match(read("js/aggregator.js"), /online-ordering\/v1\/order\/confirm/);
  assert.match(php, /function pos_agg_parse/);
  assert.match(php, /function pos_agg_ingest/);
  assert.match(php, /online-ordering\/v1\/order\/confirm/);
  assert.match(php, /\/pos\/v1\/orders\//);
  assert.match(read("pos-php-core.php"), /webhooks\/zomato/);
  assert.match(read("pos-php-till.php"), /aggregator/);
  assert.equal(A.normalizeSource("Zomato POS"), "zomato");
  assert.equal(A.normalizeStatus("food_ready"), "ready");
});
