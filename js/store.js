import { CATALOG } from "./catalog.js";
import { lineAmounts, sumCart, changeDue } from "./money.js";

export const STORAGE_KEY = "spicepos.v2";
export const DEMO_PIN = "1234";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function seedState() {
  return {
    version: 1,
    shop: {
      name: "Spice POS",
      gstin: "27AABCU9603R1ZX",
      place: "Pune",
    },
    products: clone(CATALOG),
    cart: [],
    held: [],
    orders: [],
    locked: false,
  };
}

export function loadState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !Array.isArray(parsed.products)) {
      return seedState();
    }
    return {
      ...seedState(),
      ...parsed,
      cart: Array.isArray(parsed.cart) ? parsed.cart : [],
      held: Array.isArray(parsed.held) ? parsed.held : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      locked: parsed.locked === true,
    };
  } catch {
    return seedState();
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function productBySku(state, sku) {
  return state.products.find((p) => p.sku === sku) || null;
}

export function cartQtyForSku(state, sku) {
  const line = state.cart.find((l) => l.sku === sku);
  return line ? line.qty : 0;
}

export function availableStock(state, sku) {
  const product = productBySku(state, sku);
  if (!product) return 0;
  return Math.max(0, product.stock - cartQtyForSku(state, sku));
}

export function addToCart(state, sku, qty = 1) {
  if (!Number.isInteger(qty) || qty <= 0) {
    return { ok: false, error: "Quantity must be a positive whole number" };
  }
  const product = productBySku(state, sku);
  if (!product) return { ok: false, error: "Unknown SKU" };
  const line = state.cart.find((l) => l.sku === sku);
  const nextQty = (line?.qty || 0) + qty;
  if (nextQty > product.stock) {
    return {
      ok: false,
      error: `Only ${product.stock} in stock for ${product.name}`,
    };
  }
  if (line) {
    line.qty = nextQty;
  } else {
    state.cart.push({
      sku: product.sku,
      name: product.name,
      pack: product.pack,
      unitPaise: product.unitPaise,
      gstBps: product.gstBps,
      qty: nextQty,
    });
  }
  return { ok: true };
}

export function setCartQty(state, sku, qty) {
  if (!Number.isInteger(qty) || qty < 0) {
    return { ok: false, error: "Quantity must be a whole number" };
  }
  const product = productBySku(state, sku);
  if (!product) return { ok: false, error: "Unknown SKU" };
  if (qty === 0) {
    state.cart = state.cart.filter((l) => l.sku !== sku);
    return { ok: true };
  }
  if (qty > product.stock) {
    return {
      ok: false,
      error: `Only ${product.stock} in stock for ${product.name}`,
    };
  }
  const line = state.cart.find((l) => l.sku === sku);
  if (line) line.qty = qty;
  else {
    state.cart.push({
      sku: product.sku,
      name: product.name,
      pack: product.pack,
      unitPaise: product.unitPaise,
      gstBps: product.gstBps,
      qty,
    });
  }
  return { ok: true };
}

export function clearCart(state) {
  state.cart = [];
}

export function cartTotals(state) {
  return sumCart(state.cart);
}

export function holdCart(state) {
  if (state.cart.length === 0) return { ok: false, error: "Cart is empty" };
  const id = `H-${Date.now().toString(36).toUpperCase()}`;
  state.held.unshift({
    id,
    createdAt: new Date().toISOString(),
    items: clone(state.cart),
  });
  state.cart = [];
  return { ok: true, id };
}

export function recallHeld(state, id) {
  const ticket = state.held.find((h) => h.id === id);
  if (!ticket) return { ok: false, error: "Held bill not found" };
  if (state.cart.length > 0) {
    return { ok: false, error: "Clear or hold the current cart first" };
  }
  for (const item of ticket.items) {
    const product = productBySku(state, item.sku);
    if (!product || item.qty > product.stock) {
      return {
        ok: false,
        error: `Cannot recall ${id}: ${item.name} is short on stock`,
      };
    }
  }
  state.cart = clone(ticket.items);
  state.held = state.held.filter((h) => h.id !== id);
  return { ok: true };
}

function nextBillNo(state) {
  const n = state.orders.length + 1;
  return `SP-${String(n).padStart(4, "0")}`;
}

export function checkout(state, { method, tenderedPaise = 0 }) {
  if (state.cart.length === 0) {
    return { ok: false, error: "Cart is empty" };
  }
  if (!["cash", "upi", "card"].includes(method)) {
    return { ok: false, error: "Choose cash, UPI, or card" };
  }
  for (const line of state.cart) {
    const product = productBySku(state, line.sku);
    if (!product || line.qty > product.stock) {
      return {
        ok: false,
        error: `Insufficient stock for ${line.name}`,
      };
    }
    if (line.qty <= 0) {
      return { ok: false, error: "Cart has an invalid quantity" };
    }
  }

  const totals = cartTotals(state);
  let tendered = tenderedPaise;
  let change = 0;

  if (method === "cash") {
    const due = changeDue(totals.total, tenderedPaise);
    if (!due.ok) {
      return {
        ok: false,
        error: `Cash short by ${due.shortfall} paise`,
        shortfall: due.shortfall,
      };
    }
    change = due.change;
    tendered = tenderedPaise;
  } else {
    tendered = totals.total;
    change = 0;
  }

  const items = state.cart.map((line) => {
    const amounts = lineAmounts(line.unitPaise, line.qty, line.gstBps);
    return { ...line, taxable: amounts.taxable, tax: amounts.tax, total: amounts.total };
  });

  for (const line of items) {
    const product = productBySku(state, line.sku);
    product.stock -= line.qty;
  }

  const order = {
    id: nextBillNo(state),
    createdAt: new Date().toISOString(),
    method,
    items,
    taxable: totals.taxable,
    tax: totals.tax,
    total: totals.total,
    tendered,
    change,
    status: "paid",
  };
  state.orders.unshift(order);
  state.cart = [];
  return { ok: true, order };
}

export function receiveStock(state, sku, qty) {
  if (!Number.isInteger(qty) || qty <= 0) {
    return { ok: false, error: "Quantity must be a positive whole number" };
  }
  const product = productBySku(state, sku);
  if (!product) return { ok: false, error: "Unknown SKU" };
  product.stock += qty;
  return { ok: true, stock: product.stock };
}

export function updateShop(state, patch) {
  const name = String(patch.name ?? state.shop.name).trim();
  const gstin = String(patch.gstin ?? state.shop.gstin).trim();
  const place = String(patch.place ?? state.shop.place).trim();
  if (!name || !place || !gstin) {
    return { ok: false, error: "Shop name, place, and GSTIN are required" };
  }
  state.shop = { name, gstin, place };
  return { ok: true };
}

export function salesByMethod(state, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const methods = { cash: 0, upi: 0, card: 0 };
  let count = 0;
  let total = 0;
  let tax = 0;
  for (const order of state.orders) {
    const t = Date.parse(order.createdAt);
    if (t < startMs || t >= endMs || order.status !== "paid") continue;
    count += 1;
    total += order.total;
    tax += order.tax;
    if (methods[order.method] != null) methods[order.method] += order.total;
  }
  return { count, total, tax, methods };
}

export function todaySales(state, now = new Date()) {
  const sales = salesByMethod(state, now);
  return { count: sales.count, total: sales.total, tax: sales.tax };
}

export function verifyPin(pin) {
  return String(pin) === DEMO_PIN;
}

export function resetDemo(storage = globalThis.localStorage) {
  const state = seedState();
  saveState(state, storage);
  return state;
}
