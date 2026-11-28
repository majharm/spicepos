import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { API_V1_ROUTES } from "./api-v1.js";

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("v1 API lists every master module once", () => {
  const paths = API_V1_ROUTES.map((route) => route.path);
  assert.deepEqual(paths, [
    "/dashboard/overview",
    "/users/live",
    "/analytics/traffic-map",
    "/businesses/map",
    "/sync/status",
    "/businesses",
    "/users",
    "/subscriptions",
    "/plans",
    "/payments",
    "/analytics/revenue",
    "/offers",
    "/analytics/profit",
    "/reports",
    "/system/health",
    "/logs/activity",
  ]);
  assert.equal(new Set(paths).size, paths.length);
});

test("Node and PHP publish the same v1 paths behind master auth", () => {
  const node = read("server/api-v1.js");
  const php = read("pos-api-v1.php");
  const index = read("server/index.js");
  const auth = read("server/auth.js");
  const core = read("pos-php-core.php");
  for (const route of API_V1_ROUTES) {
    assert.match(node, new RegExp(route.path.replaceAll("/", "\\/")));
    assert.match(php, new RegExp(route.path.replaceAll("/", "\\/")));
  }
  assert.match(index, /registerApiV1\(app\)/);
  assert.match(index, /url\.startsWith\("\/api\/v1"\)/);
  assert.match(auth, /path\.startsWith\("\/api\/v1"\)/);
  assert.match(core, /pos_api_v1_dispatch\(\$path, \$method\)/);
  assert.match(php, /Master admin sign in required/);
  assert.match(node, /requireMaster/);
});
