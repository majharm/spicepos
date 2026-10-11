(function (root, factory) {
  const api = factory();
  root.POSBar = api;
  if (typeof window !== "undefined") window.POSBar = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CATEGORIES = ["Whisky", "Rum", "Vodka", "Beer", "Wine", "Cocktails", "Soft Drinks"];

  const PACK_TYPES = [
    { id: "bottle", label: "Bottle" },
    { id: "can", label: "Can" },
    { id: "keg", label: "Keg" },
    { id: "mixer", label: "Mixer / glass" },
  ];

  const SERVINGS = [
    { id: "peg30", label: "Peg 30 ml", ml: 30, kind: "peg" },
    { id: "peg60", label: "Peg 60 ml", ml: 60, kind: "peg" },
    { id: "quarter", label: "Quarter", fraction: 0.25, kind: "bottle" },
    { id: "half", label: "Half", fraction: 0.5, kind: "bottle" },
    { id: "bottle", label: "Bottle", fraction: 1, kind: "bottle" },
  ];

  const PAY_MODES = ["cash", "upi", "card", "online", "bank-transfer", "wallet"];

  const MOVEMENT_KINDS = [
    { id: "opening", label: "Opening stock", sign: 1 },
    { id: "purchase", label: "Purchase", sign: 1 },
    { id: "sale", label: "Sale", sign: -1 },
    { id: "transfer_in", label: "Transfer in", sign: 1 },
    { id: "transfer_out", label: "Transfer out", sign: -1 },
    { id: "wastage", label: "Wastage", sign: -1 },
    { id: "breakage", label: "Breakage", sign: -1 },
    { id: "adjust", label: "Adjustment", sign: 0 },
    { id: "return", label: "Return / refund", sign: 1 },
  ];

  const SERVICE_TYPES = [
    { id: "dine-in", label: "Dine-in" },
    { id: "takeaway", label: "Takeaway" },
    { id: "delivery", label: "Delivery" },
  ];

  const ROLES = [
    { id: "business_admin", label: "Owner" },
    { id: "manager", label: "Manager" },
    { id: "cashier", label: "Cashier" },
    { id: "bartender", label: "Bartender" },
  ];

  const REPORTS = [
    { id: "bar-sales-daily", title: "Daily sales" },
    { id: "bar-sales-weekly", title: "Weekly sales" },
    { id: "bar-sales-monthly", title: "Monthly sales" },
    { id: "bar-sales-product", title: "Product-wise sales" },
    { id: "bar-sales-brand", title: "Brand-wise sales" },
    { id: "bar-sales-category", title: "Category-wise sales" },
    { id: "bar-consumption", title: "Bottle / peg consumption" },
    { id: "bar-stock", title: "Opening vs closing stock" },
    { id: "bar-variance", title: "Purchase, wastage, breakage, variance" },
    { id: "bar-collection", title: "Cashier / payment collection" },
    { id: "bar-profit", title: "Gross sales, tax, COGS, profit" },
    { id: "bar-tables", title: "Table-wise sales" },
    { id: "bar-top", title: "Top-selling products" },
  ];

  const DEFAULT_SETTINGS = {
    license_no: "",
    license_state: "",
    license_expires: "",
    open_hour: "11:00",
    close_hour: "23:30",
    peg30_ml: 30,
    peg60_ml: 60,
    allow_peg: true,
    allow_quarter: true,
    allow_half: true,
    allow_bottle: true,
    tax_rate: 18,
    invoice_title: "Bar Invoice",
    min_age: 21,
    regulated: true,
    allow_after_hours: false,
  };

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function flagOn(v) {
    return v === true || v === 1 || v === "1" || v === "on" || v === "true" || v === "yes";
  }

  function looksLikeLiquorBar(text) {
    const t = String(text || "").toLowerCase();
    if (/(juice\s*bar|coffee\s*bar|snack\s*bar|salad\s*bar|milk\s*bar)/.test(t)) return false;
    return /(\bbar\b|\bpub\b|\blounge\b|\bbrewery\b|\btaproom\b|\bnightclub\b|\bliquor\b)/.test(t);
  }

  function isStandaloneBarType(biz) {
    const type = String(biz?.business_type || "").toLowerCase().trim();
    return type === "bar" || type === "pub" || type === "bar & lounge";
  }

  function isFoodShopType(biz) {
    const type = String(biz?.business_type || "").toLowerCase().trim();
    return type === "restaurant" || type === "cafe" || type === "bakery";
  }

  function isBarShop(biz) {
    if (flagOn(biz?.bar_enabled)) return true;
    if (isStandaloneBarType(biz)) return true;
    if (isFoodShopType(biz)) return false;
    if (globalThis.POSFootwear?.shopKind?.(biz) === "bar") return true;
    const cat = String(biz?.category || "").toLowerCase().trim();
    return cat === "bar & lounge" || cat === "bar" || cat === "liquor";
  }

  function bottleMl(product, settings) {
    const ml = Number(product?.bottle_ml);
    if (Number.isFinite(ml) && ml > 0) return ml;
    return 750;
  }

  function serving(id, settings) {
    const found = SERVINGS.find((s) => s.id === String(id || "").toLowerCase()) || SERVINGS[SERVINGS.length - 1];
    if (found.id === "peg30") return { ...found, ml: Number(settings?.peg30_ml) > 0 ? Number(settings.peg30_ml) : 30 };
    if (found.id === "peg60") return { ...found, ml: Number(settings?.peg60_ml) > 0 ? Number(settings.peg60_ml) : 60 };
    return found;
  }

  function serveMl(product, serveId, settings) {
    const serve = serving(serveId, settings);
    if (serve.ml) return serve.ml;
    return round2(bottleMl(product, settings) * (Number(serve.fraction) || 1));
  }

  function bottlePrice(product) {
    const p = Number(product?.price_bottle);
    if (Number.isFinite(p) && p > 0) return round2(p);
    return 0;
  }

  function servePrice(product, serveId, settings) {
    const key = {
      peg30: "price_peg30",
      peg60: "price_peg60",
      quarter: "price_quarter",
      half: "price_half",
      bottle: "price_bottle",
    }[String(serveId || "").toLowerCase()] || "price_bottle";
    const explicit = Number(product?.[key]);
    if (Number.isFinite(explicit) && explicit > 0) return round2(explicit);
    const full = bottlePrice(product);
    const ml = serveMl(product, serveId, settings);
    const total = bottleMl(product, settings);
    if (full <= 0 || total <= 0) return 0;
    return round2(full * (ml / total));
  }

  function remainingBottles(product, settings) {
    const total = bottleMl(product, settings);
    const onHand = Number(product?.on_hand_ml) || 0;
    if (total <= 0) return 0;
    return round2(onHand / total);
  }

  function remainingLabel(product, settings) {
    const bottles = remainingBottles(product, settings);
    const ml = Number(product?.on_hand_ml) || 0;
    return `${ml} ml · ${bottles} btl`;
  }

  function applySale(product, serveId, qty, settings) {
    const units = Math.max(0, Number(qty) || 0);
    const used = round2(serveMl(product, serveId, settings) * units);
    const onHand = round2(Math.max(0, (Number(product?.on_hand_ml) || 0) - used));
    return { ...product, on_hand_ml: onHand, used_ml: used };
  }

  function movementSign(kind, qtyMl) {
    const row = MOVEMENT_KINDS.find((m) => m.id === String(kind || "").toLowerCase());
    const qty = Number(qtyMl) || 0;
    if (!row) return qty;
    if (row.sign === 0) return qty;
    return row.sign * Math.abs(qty);
  }

  function applyMovement(product, kind, qtyMl) {
    const delta = movementSign(kind, qtyMl);
    const onHand = round2(Math.max(0, (Number(product?.on_hand_ml) || 0) + delta));
    return { ...product, on_hand_ml: onHand, delta_ml: delta };
  }

  function lineTotals(product, serveId, qty, discount, settings) {
    const units = Math.max(0, Number(qty) || 0);
    const unit = servePrice(product, serveId, settings);
    const gross = round2(unit * units);
    const disc = round2(Math.min(gross, Math.max(0, Number(discount) || 0)));
    const taxable = round2(Math.max(0, gross - disc));
    const taxRate = Number(product?.gst_rate);
    const rate = Number.isFinite(taxRate) ? taxRate : Number(settings?.tax_rate) || 0;
    const tax = round2(taxable * (rate / 100));
    const total = round2(taxable + tax);
    const used = round2(serveMl(product, serveId, settings) * units);
    const costBottle = Number(product?.cost_bottle) || 0;
    const cogs = bottleMl(product, settings) > 0 ? round2(costBottle * (used / bottleMl(product, settings))) : 0;
    return {
      serve: serving(serveId, settings).id,
      serve_label: serving(serveId, settings).label,
      qty: units,
      unit_price: unit,
      gross,
      discount: disc,
      taxable,
      tax_rate: rate,
      tax,
      total,
      serve_ml: used,
      cogs,
      profit: round2(taxable - cogs),
    };
  }

  function billTotals(lines, billDiscount, settings) {
    const rows = Array.isArray(lines) ? lines : [];
    const itemGross = round2(rows.reduce((s, l) => s + (Number(l.gross) || 0), 0));
    const itemDisc = round2(rows.reduce((s, l) => s + (Number(l.discount) || 0), 0));
    const extra = round2(Math.max(0, Number(billDiscount) || 0));
    const preTaxable = round2(Math.max(0, itemGross - itemDisc));
    const taxable = round2(Math.max(0, preTaxable - extra));
    const taxRaw = round2(rows.reduce((s, l) => s + (Number(l.tax) || 0), 0));
    const tax = preTaxable > 0 ? round2(taxRaw * (taxable / preTaxable)) : 0;
    const cogs = round2(rows.reduce((s, l) => s + (Number(l.cogs) || 0), 0));
    const total = round2(taxable + tax);
    return {
      item_gross: itemGross,
      item_discount: itemDisc,
      bill_discount: extra,
      taxable,
      tax,
      total,
      cogs,
      profit: round2(taxable - cogs),
    };
  }

  function priceCart(productsById, rawLines, billDiscount, settings) {
    const remaining = {};
    const priced = [];
    const lines = Array.isArray(rawLines) ? rawLines : [];
    if (!lines.length) {
      return { ok: false, reason: "Add at least one serve", priced, totals: billTotals([], billDiscount, settings), remaining };
    }
    for (const l of lines) {
      const id = String(l?.product_id || l?.product?.id || "");
      const product = productsById?.[id];
      if (!product) return { ok: false, reason: "Unknown product", priced, totals: billTotals(priced.map((p) => p.row), billDiscount, settings), remaining };
      if (remaining[id] == null) remaining[id] = Number(product.on_hand_ml) || 0;
      const live = { ...product, on_hand_ml: remaining[id] };
      const check = canSellQty(live, l.serve, l.qty, settings);
      if (!check.ok) return { ok: false, reason: `${product.name}: ${check.reason}`, priced, totals: billTotals(priced.map((p) => p.row), billDiscount, settings), remaining };
      const row = lineTotals(live, l.serve, l.qty, l.discount, settings);
      remaining[id] = round2(Math.max(0, remaining[id] - row.serve_ml));
      priced.push({ product: live, raw: l, row, remaining_ml: remaining[id] });
    }
    return { ok: true, priced, totals: billTotals(priced.map((p) => p.row), billDiscount, settings), remaining };
  }

  function allowedServings(product, settings) {
    const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    const pack = String(product?.pack_type || "bottle").toLowerCase();
    return SERVINGS.filter((row) => {
      if (row.id === "peg30" || row.id === "peg60") return flagOn(s.allow_peg) && pack === "bottle";
      if (row.id === "quarter") return flagOn(s.allow_quarter) && pack === "bottle";
      if (row.id === "half") return flagOn(s.allow_half) && pack === "bottle";
      return flagOn(s.allow_bottle);
    });
  }

  function canSellQty(product, serveId, qty, settings) {
    const need = serveMl(product, serveId, settings) * Math.max(0, Number(qty) || 0);
    const onHand = Number(product?.on_hand_ml) || 0;
    if (need <= 0) return { ok: false, reason: "Enter a quantity" };
    if (onHand + 0.001 < need) return { ok: false, reason: `Only ${onHand} ml left` };
    return { ok: true, need_ml: round2(need) };
  }

  function parseHour(hhmm) {
    const m = String(hhmm || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  function minutesNow(date) {
    const d = date instanceof Date ? date : new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function inOperatingHours(settings, date) {
    const open = parseHour(settings?.open_hour);
    const close = parseHour(settings?.close_hour);
    if (open == null || close == null) return true;
    const now = minutesNow(date);
    if (open === close) return true;
    if (close > open) return now >= open && now < close;
    return now >= open || now < close;
  }

  function licenseStatus(settings, today) {
    const exp = String(settings?.license_expires || "").slice(0, 10);
    const day = String(today || "").slice(0, 10);
    if (!exp) return { ok: true, expired: false };
    if (day && exp < day) return { ok: false, expired: true, reason: `License expired on ${exp}` };
    return { ok: true, expired: false };
  }

  function canOperate(settings, date, today) {
    const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    const lic = licenseStatus(s, today);
    if (!lic.ok && s.regulated) return lic;
    if (s.regulated && !s.allow_after_hours && !inOperatingHours(s, date)) {
      return { ok: false, reason: `Sales allowed ${s.open_hour}–${s.close_hour}` };
    }
    return { ok: true };
  }

  function isLowStock(product) {
    const onHand = Number(product?.on_hand_ml) || 0;
    const low = Number(product?.low_stock_ml);
    if (!Number.isFinite(low) || low <= 0) return onHand <= 0;
    return onHand <= low;
  }

  function isExpiring(product, today, days) {
    const exp = String(product?.expiry_date || "").slice(0, 10);
    if (!exp) return false;
    const day = String(today || "").slice(0, 10);
    if (!day) return false;
    const horizon = Number(days);
    if (!Number.isFinite(horizon) || horizon <= 0) return exp <= day;
    const d = new Date(`${day}T00:00:00`);
    d.setDate(d.getDate() + horizon);
    const until = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return exp <= until;
  }

  function splitLines(lines, indexes) {
    const all = Array.isArray(lines) ? lines : [];
    const pick = new Set((indexes || []).map((n) => Number(n)));
    const a = [];
    const b = [];
    all.forEach((line, i) => (pick.has(i) ? a : b).push(line));
    return { a, b };
  }

  function combineHolds(first, second) {
    const a = first && typeof first === "object" ? first : {};
    const b = second && typeof second === "object" ? second : {};
    return {
      ...a,
      lines: [...(a.lines || []), ...(b.lines || [])],
      notes: [a.notes, b.notes].filter(Boolean).join(" · "),
    };
  }

  function defaultSettings() {
    return { ...DEFAULT_SETTINGS };
  }

  function defaultProducts() {
    return [
      { name: "Johnnie Walker Black Label", brand: "Johnnie Walker", category: "Whisky", pack_type: "bottle", bottle_ml: 750, price_peg30: 220, price_peg60: 400, price_quarter: 950, price_half: 1800, price_bottle: 3400, cost_bottle: 2200, on_hand_ml: 1500, low_stock_ml: 375, barcode: "BAR-WHISKY-JWB" },
      { name: "Old Monk", brand: "Old Monk", category: "Rum", pack_type: "bottle", bottle_ml: 750, price_peg30: 90, price_peg60: 160, price_quarter: 380, price_half: 720, price_bottle: 1350, cost_bottle: 750, on_hand_ml: 2250, low_stock_ml: 375, barcode: "BAR-RUM-OM" },
      { name: "Smirnoff", brand: "Smirnoff", category: "Vodka", pack_type: "bottle", bottle_ml: 750, price_peg30: 120, price_peg60: 220, price_quarter: 520, price_half: 980, price_bottle: 1850, cost_bottle: 1100, on_hand_ml: 1500, low_stock_ml: 375, barcode: "BAR-VODKA-SM" },
      { name: "Kingfisher Strong", brand: "Kingfisher", category: "Beer", pack_type: "bottle", bottle_ml: 650, price_bottle: 180, cost_bottle: 95, on_hand_ml: 6500, low_stock_ml: 1300, barcode: "BAR-BEER-KF" },
      { name: "Sula Red", brand: "Sula", category: "Wine", pack_type: "bottle", bottle_ml: 750, price_quarter: 280, price_half: 520, price_bottle: 980, cost_bottle: 520, on_hand_ml: 1500, low_stock_ml: 375, barcode: "BAR-WINE-SULA" },
      { name: "Classic Mojito", brand: "House", category: "Cocktails", pack_type: "mixer", bottle_ml: 300, price_bottle: 320, cost_bottle: 90, on_hand_ml: 3000, low_stock_ml: 300, barcode: "BAR-CKTL-MOJ" },
      { name: "Coca-Cola", brand: "Coca-Cola", category: "Soft Drinks", pack_type: "can", bottle_ml: 330, price_bottle: 60, cost_bottle: 28, on_hand_ml: 6600, low_stock_ml: 990, barcode: "BAR-SOFT-COKE" },
    ];
  }

  function defaultTables() {
    return [
      { name: "Bar 1", seats: 4, floor: "Bar" },
      { name: "Bar 2", seats: 4, floor: "Bar" },
      { name: "Bar 3", seats: 6, floor: "Bar" },
      { name: "High Top 1", seats: 2, floor: "Bar" },
      { name: "High Top 2", seats: 2, floor: "Bar" },
      { name: "Lounge A", seats: 8, floor: "Lounge" },
      { name: "Lounge B", seats: 8, floor: "Lounge" },
      { name: "Takeaway", seats: 0, floor: "Counter", service_type: "takeaway" },
    ];
  }

  function dashboardCards(stats) {
    const s = stats || {};
    return [
      { id: "today", label: "Today's bar sales", value: s.todaySales || 0, money: true },
      { id: "bills", label: "Bills today", value: s.todayBills || 0 },
      { id: "pegs", label: "Pegs served", value: s.todayPegs || 0 },
      { id: "bottles", label: "Bottles sold", value: s.todayBottles || 0 },
      { id: "open", label: "Open tables", value: s.openTables || 0 },
      { id: "pending", label: "Pending payments", value: s.pendingPay || 0, money: true },
      { id: "low", label: "Low stock", value: s.lowStock || 0 },
      { id: "expiry", label: "Expiry alerts", value: s.expiryAlerts || 0 },
      { id: "profit", label: "Est. gross profit", value: s.todayProfit || 0, money: true },
    ];
  }

  function ymdLocal(d) {
    const x = d instanceof Date ? d : new Date();
    if (Number.isNaN(x.getTime())) return "";
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  }

  function ymdIst(d) {
    const x = d instanceof Date ? d : new Date();
    if (Number.isNaN(x.getTime())) return "";
    try {
      return x.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    } catch {
      return ymdLocal(x);
    }
  }

  function canDiscount(role, perms) {
    if (flagOn(perms?.discount)) return true;
    return ["business_admin", "branch_manager", "manager"].includes(String(role || ""));
  }

  function canVoid(role, perms) {
    if (["business_admin", "branch_manager", "manager"].includes(String(role || ""))) return true;
    return flagOn(perms?.orders) && String(role || "") !== "bartender" && String(role || "") !== "cashier";
  }

  function canAdjustStock(role, perms) {
    if (flagOn(perms?.stock) && String(role || "") !== "bartender" && String(role || "") !== "cashier") return true;
    return ["business_admin", "branch_manager", "manager", "stock_manager"].includes(String(role || ""));
  }

  return {
    CATEGORIES,
    PACK_TYPES,
    SERVINGS,
    PAY_MODES,
    MOVEMENT_KINDS,
    SERVICE_TYPES,
    ROLES,
    REPORTS,
    DEFAULT_SETTINGS,
    round2,
    flagOn,
    looksLikeLiquorBar,
    isStandaloneBarType,
    isBarShop,
    bottleMl,
    serving,
    serveMl,
    servePrice,
    remainingBottles,
    remainingLabel,
    applySale,
    applyMovement,
    movementSign,
    lineTotals,
    billTotals,
    priceCart,
    allowedServings,
    canSellQty,
    inOperatingHours,
    licenseStatus,
    canOperate,
    isLowStock,
    isExpiring,
    splitLines,
    combineHolds,
    defaultSettings,
    defaultProducts,
    defaultTables,
    dashboardCards,
    ymdLocal,
    ymdIst,
    canDiscount,
    canVoid,
    canAdjustStock,
  };
});
