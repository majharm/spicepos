(function (root, factory) {
  const api = factory();
  root.POSDiscount = api;
  if (typeof window !== "undefined") window.POSDiscount = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function round2(n) {
    return Math.round((Number(n) || 0) * 1e8) / 1e8;
  }

  function paise(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    return Math.round(v * 100) / 100;
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

  function isInclusive(input) {
    return Boolean(input?.gstInclusive ?? input?.gst_inclusive ?? input?.priceIncludesGst ?? input?.price_includes_gst);
  }

  function priceFromNet(net, gstRate, inclusive) {
    const base = paise(Math.max(0, num(net)));
    const rate = num(gstRate);
    if (inclusive && rate > 0) {
      const taxable = paise(base / (1 + rate / 100));
      const gst = paise(base - taxable);
      return { taxable, gst, total: paise(base) };
    }
    const gst = paise((base * rate) / 100);
    return { taxable: base, gst, total: paise(base + gst) };
  }

  function computeLine(input) {
    const qty = num(input.qty ?? input.quantity_gm);
    const rate = num(input.rate ?? input.rate_per_kg);
    const gstRate = num(input.gstRate ?? input.gst_rate);
    const mrpRate = num(input.mrp ?? input.mrp_rate, rate);
    const costRate = num(input.costRate ?? input.purchase_rate);
    const isCount = Boolean(input.isCount);
    const inclusive = isInclusive(input);
    const gross = lineGross(qty, rate, isCount);
    const mrp = lineGross(qty, mrpRate, isCount);
    const cost = lineGross(qty, costRate, isCount);
    const discountType = input.discountType || input.discount_type || "amt";
    const discountValue = num(input.discountValue ?? input.discount_value);
    const discount = discountAmount(gross, discountType, discountValue);
    const net = round2(Math.max(0, gross - discount));
    const priced = priceFromNet(net, gstRate, inclusive);
    const profit = round2(priced.taxable - cost);
    return {
      qty,
      rate,
      mrpRate,
      costRate,
      gstRate,
      isCount,
      gstInclusive: inclusive,
      discountType: isPct(discountType) ? "pct" : "amt",
      discountValue,
      mrp: round2(mrp),
      gross,
      discount,
      taxable: inclusive ? priced.taxable : net,
      gst: priced.gst,
      total: priced.total,
      cost: round2(cost),
      profit,
    };
  }

  function billLine(input) {
    const gstRate = num(input?.gstRate ?? input?.gst_rate);
    const inclusive = isInclusive(input);
    const lineDiscount = round2(Math.max(0, num(input?.discount)));
    const gross = round2(Math.max(0, num(input?.gross != null ? input.gross : num(input?.taxable ?? input?.amount) + lineDiscount)));
    const face = round2(Math.max(0, gross - lineDiscount));
    const net = inclusive ? face : round2(Math.max(0, num(input?.taxable != null ? input.taxable : input?.amount != null ? input.amount : face)));
    return {
      gross,
      lineDiscount,
      net: round2(Math.max(0, net)),
      gstRate,
      inclusive,
      profit: round2(num(input?.profit)),
    };
  }

  function reprice(row) {
    const priced = priceFromNet(row.net - row.share, row.gstRate, row.inclusive);
    return { ...row, ...priced };
  }

  function computeBill(lines, bill) {
    const rows = (Array.isArray(lines) ? lines : []).map(billLine);
    const subtotal = paise(rows.reduce((sum, row) => sum + row.net, 0));
    const gross = paise(rows.reduce((sum, row) => sum + row.gross, 0));
    const lineDiscount = paise(rows.reduce((sum, row) => sum + row.lineDiscount, 0));
    const lineProfit = round2(rows.reduce((sum, row) => sum + row.profit, 0));
    const type = bill?.discountType || bill?.discount_type || "amt";
    const value = num(bill?.discountValue ?? bill?.discount_value ?? bill?.discount);
    const billDiscount = paise(discountAmount(subtotal, type, value));
    const afterDiscount = paise(Math.max(0, subtotal - billDiscount));
    let loyaltyDiscount = paise(Math.max(0, num(bill?.loyaltyDiscount ?? bill?.loyalty_discount)));
    if (loyaltyDiscount > afterDiscount) loyaltyDiscount = afterDiscount;
    const reduction = paise(billDiscount + loyaltyDiscount);
    let used = 0;
    const priced = rows.map((row, index) => {
      let share = 0;
      if (reduction > 0 && subtotal > 0) {
        share = index === rows.length - 1 ? paise(reduction - used) : paise((reduction * row.net) / subtotal);
        share = paise(Math.min(Math.max(0, share), row.net));
        used = paise(used + share);
      }
      return { ...row, share };
    });
    let leftover = paise(reduction - used);
    for (let i = priced.length - 1; i >= 0 && leftover > 0; i -= 1) {
      const room = paise(priced[i].net - priced[i].share);
      const add = paise(Math.min(room, leftover));
      if (add <= 0) continue;
      priced[i].share = paise(priced[i].share + add);
      leftover = paise(leftover - add);
    }
    const settled = priced.map(reprice);
    const taxable = paise(settled.reduce((sum, row) => sum + row.taxable, 0));
    const gst = paise(settled.reduce((sum, row) => sum + row.gst, 0));
    const total = paise(settled.reduce((sum, row) => sum + row.total, 0));
    return {
      gross,
      subtotal,
      lineDiscount,
      billDiscount,
      loyaltyDiscount,
      taxable,
      gst,
      total,
      profit: round2(lineProfit - billDiscount - loyaltyDiscount),
      discountType: isPct(type) ? "pct" : "amt",
      discountValue: value,
      lines: settled,
    };
  }

  function orderUsesNetGst(order, lineGst) {
    const gst = num(order?.gst);
    const discount = num(order?.discount);
    const loyalty = num(order?.loyalty_discount ?? order?.loyaltyDiscount);
    return (discount > 0.009 || loyalty > 0.009) && num(lineGst) > gst + 0.05;
  }

  function gstTaxableBase(order, lineGst) {
    const subtotal = num(order?.subtotal);
    if (!orderUsesNetGst(order, lineGst)) return paise(subtotal);
    return paise(Math.max(0, subtotal - num(order?.discount) - num(order?.loyalty_discount ?? order?.loyaltyDiscount)));
  }

  return {
    round2,
    paise,
    isPct,
    discountAmount,
    lineGross,
    computeLine,
    computeBill,
    orderUsesNetGst,
    gstTaxableBase,
  };
});
