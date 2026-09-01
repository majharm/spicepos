import { AsyncLocalStorage } from "node:async_hooks";

export const als = new AsyncLocalStorage();

export function bid() {
  const store = als.getStore();
  if (!store?.businessId) throw new Error("No tenant context");
  return store.businessId;
}

export function branchId() {
  return als.getStore()?.branchId || null;
}

export function authUser() {
  return als.getStore()?.user || null;
}

export function runTenant(store, fn) {
  return als.run(store, fn);
}
