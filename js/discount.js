(function (root, factory) {
  const api = factory();
  root.POSDiscount = api;
  if (typeof window !== "undefined") window.POSDiscount = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function num(n, fallback = 0) {
    const v = Number(n);
    return Number.isFinite(v) ? v : fallback;
  }

  function isPct(type) {
    const t = String(type || "amt").toLowerCase();
    return t === "pct" || t === "percent" || t === "%" || t === "percentage";
  }

  function discountAmount(base, type, value) {
    const amount = round2(Math.max(0, num(base)));
    const v = Math.max(0, num(value));
    if (amount <= 0 || v <= 0) return 0;
    if (isPct(type)) return round2(Math.min(amount, (amount * v) / 100));
    return round2(Math.min(amount, v));
  }

  function lineGross(qty, rate, isCount) {
    const q = num(qty);
    const r = num(rate);
    if (q <= 0) return 0;
    return round2(isCount ? q * r : (q / 1000) * r);
  }

  function computeLine(input) {
    const qty = num(input.qty ?? input.quantity_gm);
    const rate = num(input.rate ?? input.rate_per_kg);
    const gstRate = num(input.gstRate ?? input.gst_rate);
    const mrpRate = num(input.mrp ?? input.mrp_rate, rate);
    const costRate = num(input.costRate ?? input.purchase_rate);
    const isCount = Boolean(input.isCount);
    const gross = lineGross(qty, rate, isCount);
    const mrp = lineGross(qty, mrpRate, isCount);
    const cost = lineGross(qty, costRate, isCount);
    const discountType = input.discountType || input.discount_type || "amt";
    const discountValue = num(input.discountValue ?? input.discount_value);
    const discount = discountAmount(gross, discountType, discountValue);
    const taxable = round2(Math.max(0, gross - discount));
    const gst = round2((taxable * gstRate) / 100);
    const total = round2(taxable + gst);
    const profit = round2(taxable - cost);
    return {
      qty,
      rate,
      mrpRate,
      costRate,
      gstRate,
      isCount,
      discountType: isPct(discountType) ? "pct" : "amt",
      discountValue,
      mrp: round2(mrp),
      gross,
      discount,
      taxable,
      gst,
      total,
      cost: round2(cost),
      profit,
    };
  }

  function computeBill(lines, bill) {
    const rows = Array.isArray(lines) ? lines : [];
    const subtotal = round2(rows.reduce((s, l) => s + num(l.taxable ?? l.amount), 0));
    const gst = round2(rows.reduce((s, l) => s + num(l.gst ?? l.gst_amount), 0));
    const lineProfit = round2(rows.reduce((s, l) => s + num(l.profit), 0));
    const type = bill?.discountType || bill?.discount_type || "amt";
    const value = num(bill?.discountValue ?? bill?.discount_value ?? bill?.discount);
    const afterTax = round2(subtotal + gst);
    const billDiscount = discountAmount(afterTax, type, value);
    const loyaltyDiscount = round2(Math.max(0, num(bill?.loyaltyDiscount ?? bill?.loyalty_discount)));
    const total = round2(Math.max(0, afterTax - billDiscount - loyaltyDiscount));
    const profit = round2(lineProfit - billDiscount - loyaltyDiscount);
    return {
      subtotal,
      gst,
      billDiscount,
      loyaltyDiscount,
      total,
      profit,
      discountType: isPct(type) ? "pct" : "amt",
      discountValue: value,
    };
  }

  return {
    round2,
    isPct,
    discountAmount,
    lineGross,
    computeLine,
    computeBill,
  };
});
