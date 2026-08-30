import assert from "node:assert/strict";
import test from "node:test";
import { canonApiUrl, isApiUrl, rewriteToApi } from "./http-path.js";

test("maps pos-data, atav-data, rpc, and health.json onto /api", () => {
  assert.equal(canonApiUrl("/pos-data/health"), "/api/health");
  assert.equal(canonApiUrl("/pos-data/auth/login"), "/api/auth/login");
  assert.equal(canonApiUrl("/atav-data/auth/master-login"), "/api/auth/master-login");
  assert.equal(canonApiUrl("/health.json"), "/api/health");
  assert.equal(canonApiUrl("/atavpos-rpc.json?p=auth/login"), "/api/auth/login");
  assert.equal(
    canonApiUrl("/atavpos-rpc.json?p=reports/excel&from=2026-01-01"),
    "/api/reports/excel?from=2026-01-01",
  );
  assert.equal(rewriteToApi("/atavpos-rpc.json", "auth/master-login"), "/api/auth/master-login");
  assert.equal(canonApiUrl("http://shop.example/pos-data/auth/login"), "/api/auth/login");
  assert.ok(isApiUrl("/pos-data/auth/login"));
  assert.ok(isApiUrl("/atavpos-rpc.json?p=items"));
  assert.equal(isApiUrl("/login.html"), false);
});
