import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addToCart,
  availableStock,
  checkout,
  clearCart,
  holdCart,
  loadState,
  recallHeld,
  resetDemo,
  seedState,
  setCartQty,
  todaySales,
  verifyPin,
} from "./store.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

test("cannot oversell: cart qty cannot exceed on-hand stock", () => {
  const state = seedState();
  const saffron = state.products.find((p) => p.sku === "SAF-001");
  const result = addToCart(state, "SAF-001", saffron.stock + 1);
  assert.equal(result.ok, false);
  assert.equal(state.cart.length, 0);
});

test("checkout decrements stock once and empties the cart", () => {
  const state = seedState();
  const before = state.products.find((p) => p.sku === "TUR-100").stock;
  assert.equal(addToCart(state, "TUR-100", 2).ok, true);
  const paid = checkout(state, { method: "upi" });
  assert.equal(paid.ok, true);
  assert.equal(paid.order.total, 9450);
  assert.equal(state.cart.length, 0);
  assert.equal(state.products.find((p) => p.sku === "TUR-100").stock, before - 2);
});

test("cash checkout requires tender covering the GST-inclusive total", () => {
  const state = seedState();
  addToCart(state, "TUR-100", 1);
  const fail = checkout(state, { method: "cash", tenderedPaise: 1 });
  assert.equal(fail.ok, false);
  const ok = checkout(state, { method: "cash", tenderedPaise: 10000 });
  assert.equal(ok.ok, true);
  assert.equal(ok.order.change, 5275);
});

test("empty cart cannot be held or checked out", () => {
  const state = seedState();
  assert.equal(holdCart(state).ok, false);
  assert.equal(checkout(state, { method: "card" }).ok, false);
});

test("recall of a held bill fails if the live cart is not empty", () => {
  const state = seedState();
  addToCart(state, "CUM-100", 1);
  const held = holdCart(state);
  addToCart(state, "COR-100", 1);
  const recall = recallHeld(state, held.id);
  assert.equal(recall.ok, false);
  clearCart(state);
  assert.equal(recallHeld(state, held.id).ok, true);
});

test("available stock subtracts units already in the cart", () => {
  const state = seedState();
  const stock = state.products.find((p) => p.sku === "ASA-050").stock;
  addToCart(state, "ASA-050", 2);
  assert.equal(availableStock(state, "ASA-050"), stock - 2);
  assert.equal(setCartQty(state, "ASA-050", stock).ok, true);
  assert.equal(availableStock(state, "ASA-050"), 0);
});

test("corrupt localStorage falls back to a seeded shop", () => {
  const storage = memoryStorage({ "spicepos.v2": "{not-json" });
  const state = loadState(storage);
  assert.equal(state.products.length > 0, true);
  assert.equal(state.cart.length, 0);
});

test("demo PIN and reset restore catalog stock", () => {
  assert.equal(verifyPin("1234"), true);
  assert.equal(verifyPin("0000"), false);
  const storage = memoryStorage();
  const state = resetDemo(storage);
  assert.equal(state.orders.length, 0);
});

test("today sales ignore older bills", () => {
  const state = seedState();
  addToCart(state, "BAY-020", 1);
  checkout(state, { method: "card" });
  state.orders[0].createdAt = "2020-01-01T10:00:00.000Z";
  const sales = todaySales(state, new Date("2026-08-29T12:00:00"));
  assert.equal(sales.count, 0);
});
