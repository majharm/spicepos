(function (root, factory) {
  const api = factory();
  root.POSOfferProfit = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PRESETS = ["today", "yesterday", "week", "month", "custom"];
  const ALL_BRANCH_ROLES = new Set(["business_admin", "resort_owner", "accountant", "manager", "property_manager"]);

  function round2(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    return Math.round((v + Number.EPSILON) * 100) / 100;
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function inr(n) {
    const v = round2(n);
    const neg = v < 0;
    const [whole, frac] = Math.abs(v).toFixed(2).split(".");
    let grouped = whole;
    if (whole.length > 3) {
      const tail = whole.slice(-3);
      const lead = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
      grouped = `${lead},${tail}`;
    }
    return `${neg ? "-" : ""}₹${grouped}.${frac}`;
  }

  function pct(n) {
    return `${round2(n).toFixed(2)}%`;
  }

  function qtyText(n) {
    const v = num(n);
    if (Math.abs(v - Math.round(v)) < 0.001) return String(Math.round(v));
    return round2(v).toFixed(2);
  }

  function dayKey(value) {
    const s = String(value ?? "");
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = value instanceof Date ? value : new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  }

  function shiftYmd(ymd, days) {
    const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "";
    const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    dt.setUTCDate(dt.getUTCDate() + days);
    const p = (n) => String(n).padStart(2, "0");
    return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
  }

  function presetRange(preset, today) {
    const day = dayKey(today) || dayKey(new Date());
    const key = String(preset || "custom").toLowerCase().replace(/[\s-]+/g, "_");
    if (key === "today") return { preset: "today", from: day, to: day };
    if (key === "yesterday") {
      const y = shiftYmd(day, -1);
      return { preset: "yesterday", from: y, to: y };
    }
    if (key === "week" || key === "this_week") {
      const m = day.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
      const dow = dt.getUTCDay();
      const delta = dow === 0 ? 6 : dow - 1;
      return { preset: "week", from: shiftYmd(day, -delta), to: day };
    }
    if (key === "month" || key === "this_month") {
      return { preset: "month", from: `${day.slice(0, 8)}01`, to: day };
    }
    return { preset: "custom", from: "", to: "" };
  }

  function offerCode(offer) {
    let cond = offer?.conditions;
    if (!cond && offer?.conditions_json) {
      try {
        cond = JSON.parse(offer.conditions_json);
      } catch {
        cond = null;
      }
    }
    const explicit = String(offer?.code || offer?.offer_code || cond?.code || "").trim();
    if (explicit) return explicit.slice(0, 32).toUpperCase();
    const name = String(offer?.name || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "");
    if (name) return name.slice(0, 12);
    const id = String(offer?.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
    return id ? `OFF${id}` : "OFFER";
  }

  function isVoid(status) {
    const s = String(status || "").toLowerCase();
    return s === "cancelled" || s === "void";
  }

  function allocate(total, weights) {
    const amount = round2(total);
    const out = (weights || []).map(() => 0);
    const sum = out.reduce((s, _w, i) => s + Math.max(0, num(weights[i])), 0);
    if (!(amount > 0) || !(sum > 0) || !out.length) return out;
    let used = 0;
    for (let i = 0; i < out.length; i += 1) {
      const w = Math.max(0, num(weights[i]));
      const share = i === out.length - 1 ? round2(amount - used) : round2((amount * w) / sum);
      out[i] = share;
      used = round2(used + share);
    }
    return out;
  }

  function linePurchaseCost(line) {
    if (line.cost != null && line.cost !== "") return round2(line.cost);
    const rate = num(line.purchaseRate);
    const qty = num(line.qty);
    if (!(rate > 0) || !(qty > 0)) return 0;
    return round2(line.isCount ? qty * rate : (qty / 1000) * rate);
  }

  function lineProfit(input = {}) {
    const sellingPrice = round2(input.sellingPrice ?? input.selling_price ?? 0);
    const purchaseCost = round2(input.purchaseCost ?? input.purchase_cost ?? input.cost ?? 0);
    const discount = round2(input.discount ?? 0);
    const loyalty = round2(input.loyalty ?? input.royalty ?? 0);
    const gst = round2(input.gst ?? 0);
    const expenses = round2(input.expenses ?? 0);
    const grossProfit = round2(sellingPrice - purchaseCost);
    const netSales = round2(sellingPrice - discount - loyalty);
    const netProfit = round2(sellingPrice - purchaseCost - discount - loyalty - expenses);
    const margin = netSales !== 0 ? round2((netProfit / netSales) * 100) : 0;
    return {
      sellingPrice,
      purchaseCost,
      discount,
      loyalty,
      gst,
      expenses,
      grossProfit,
      netSales,
      netProfit,
      totalSales: round2(netSales + gst),
      margin,
    };
  }

  function normalizeOrder(row) {
    return {
      id: String(row?.id || ""),
      number: String(row?.order_number || row?.number || ""),
      businessId: String(row?.business_id || row?.businessId || ""),
      businessName: String(row?.business_name || row?.businessName || ""),
      branchId: String(row?.branch_id || row?.branchId || ""),
      branchName: String(row?.branch_name || row?.branchName || ""),
      status: String(row?.status || ""),
      createdAt: row?.created_at || row?.createdAt || "",
      subtotal: num(row?.subtotal),
      discount: num(row?.discount),
      loyalty: num(row?.loyalty_discount ?? row?.loyalty),
      gst: num(row?.gst),
      total: num(row?.total),
      extra: num(row?.extra_charges ?? row?.extraCharges ?? row?.extra),
    };
  }

  function normalizeLine(row) {
    return {
      orderId: String(row?.order_id || row?.orderId || ""),
      name: String(row?.item_name || row?.name || "Item"),
      category: String(row?.category || "").trim() || "Uncategorised",
      qty: num(row?.quantity_gm ?? row?.qty),
      amount: num(row?.amount),
      discount: num(row?.discount),
      cost: row?.cost == null || row?.cost === "" ? null : num(row.cost),
      gstRate: num(row?.gst_rate ?? row?.gstRate),
      purchaseRate: num(row?.purchase_rate ?? row?.purchaseRate),
      isCount: Boolean(row?.isCount || row?.is_count),
      cancelled: row?.cancelled === true || num(row?.cancelled) === 1,
    };
  }

  function normalizeOffer(row) {
    return {
      id: String(row?.id || ""),
      name: String(row?.name || "Offer").trim() || "Offer",
      code: offerCode(row),
      businessId: String(row?.business_id || row?.businessId || ""),
    };
  }

  function normalizeRedemption(row) {
    return {
      offerId: String(row?.offer_id || row?.offerId || ""),
      orderId: String(row?.order_id || row?.orderId || ""),
      businessId: String(row?.business_id || row?.businessId || ""),
    };
  }

  function expandOrder(order, lines) {
    const active = (lines || []).filter((line) => !line.cancelled);
    const source = active.length
      ? active
      : [{
          orderId: order.id,
          name: "Bill",
          category: "Uncategorised",
          qty: 0,
          amount: order.subtotal,
          discount: 0,
          cost: 0,
          gstRate: 0,
          purchaseRate: 0,
          cancelled: false,
        }];
    const weights = source.map((line) => Math.max(0, line.amount));
    const billShares = allocate(order.discount, weights);
    const loyaltyShares = allocate(order.loyalty, weights);
    const rawGst = source.map((line) => round2((line.amount * line.gstRate) / 100));
    const rawGstSum = round2(rawGst.reduce((s, n) => s + n, 0));
    const gstShares = order.gst > 0 && rawGstSum > 0
      ? allocate(order.gst, rawGst)
      : order.gst > 0
        ? allocate(order.gst, weights)
        : rawGst;
    const rows = source.map((line, index) => {
      const sellingPrice = round2(line.amount + line.discount);
      const econ = lineProfit({
        sellingPrice,
        purchaseCost: linePurchaseCost(line),
        discount: round2(line.discount + billShares[index]),
        loyalty: loyaltyShares[index],
        gst: gstShares[index],
        expenses: 0,
      });
      return {
        orderId: order.id,
        invoice: order.number,
        date: dayKey(order.createdAt),
        businessId: order.businessId,
        businessName: order.businessName,
        branchId: order.branchId,
        branchName: order.branchName,
        product: line.name,
        category: line.category,
        qty: line.qty,
        ...econ,
      };
    });
    const sum = (key) => round2(rows.reduce((s, row) => s + num(row[key]), 0));
    return {
      rows,
      figures: {
        qty: round2(rows.reduce((s, row) => s + num(row.qty), 0)),
        discount: round2(sum("discount") + 0),
        loyalty: sum("loyalty"),
        gst: round2(order.gst || sum("gst")),
        netSales: round2(sum("netSales") + order.extra),
        grossProfit: sum("grossProfit"),
        netProfit: round2(sum("netProfit") + order.extra),
        totalSales: round2(order.total || sum("totalSales") + order.extra),
        sellingPrice: sum("sellingPrice"),
        purchaseCost: sum("purchaseCost"),
      },
    };
  }

  function blankTotals() {
    return {
      bills: 0,
      qty: 0,
      discount: 0,
      loyalty: 0,
      gst: 0,
      netSales: 0,
      grossProfit: 0,
      netProfit: 0,
      totalSales: 0,
      sellingPrice: 0,
      purchaseCost: 0,
      extra: 0,
    };
  }

  function addFigures(totals, figures, extra) {
    totals.bills += 1;
    totals.qty = round2(totals.qty + figures.qty);
    totals.discount = round2(totals.discount + figures.discount);
    totals.loyalty = round2(totals.loyalty + figures.loyalty);
    totals.gst = round2(totals.gst + figures.gst);
    totals.netSales = round2(totals.netSales + figures.netSales);
    totals.grossProfit = round2(totals.grossProfit + figures.grossProfit);
    totals.netProfit = round2(totals.netProfit + figures.netProfit);
    totals.totalSales = round2(totals.totalSales + figures.totalSales);
    totals.sellingPrice = round2(totals.sellingPrice + figures.sellingPrice);
    totals.purchaseCost = round2(totals.purchaseCost + figures.purchaseCost);
    totals.extra = round2(totals.extra + num(extra));
  }

  function marginOf(netProfit, netSales) {
    return netSales !== 0 ? round2((netProfit / netSales) * 100) : 0;
  }

  function matchesText(hay, needle) {
    const q = String(needle || "").trim().toLowerCase();
    if (!q) return true;
    return String(hay || "").toLowerCase().includes(q);
  }

  function resolveReportScope(actor = {}, query = {}) {
    const isMaster = Boolean(actor.master);
    const ownBusiness = String(actor.businessId || "").trim();
    const ownBranch = String(actor.branchId || "").trim();
    const role = String(actor.role || "");
    const askedBusiness = String(query.business || query.businessId || "").trim();
    const askedBranch = String(query.branch || query.branchId || "").trim();
    if (isMaster) {
      return {
        master: true,
        businessId: askedBusiness || null,
        branchId: askedBranch || null,
        locked: false,
        allBusinesses: !askedBusiness,
      };
    }
    if (!ownBusiness) {
      const err = new Error("You can only view your own business");
      err.status = 403;
      throw err;
    }
    if (askedBusiness && askedBusiness !== ownBusiness) {
      const err = new Error("You can only view your own business");
      err.status = 403;
      throw err;
    }
    const canPickBranch = ALL_BRANCH_ROLES.has(role) || !ownBranch;
    return {
      master: false,
      businessId: ownBusiness,
      branchId: canPickBranch ? askedBranch || null : ownBranch,
      locked: !canPickBranch,
      allBusinesses: false,
    };
  }

  function assembleOfferProfit(input = {}) {
    const scope = input.scope || { master: false, businessId: null, branchId: null };
    const filters = input.filters || {};
    const expenses = round2(input.expenses);
    const includeExpenses = !scope.branchId;
    const offers = (input.offers || []).map(normalizeOffer);
    const offerById = new Map(offers.filter((o) => o.id).map((o) => [o.id, o]));
    const redemptions = (input.redemptions || []).map(normalizeRedemption);
    const linesByOrder = new Map();
    for (const raw of input.lines || []) {
      const line = normalizeLine(raw);
      if (!line.orderId || line.cancelled) continue;
      if (!linesByOrder.has(line.orderId)) linesByOrder.set(line.orderId, []);
      linesByOrder.get(line.orderId).push(line);
    }
    const redemptionsByOrder = new Map();
    for (const row of redemptions) {
      if (!row.orderId || !row.offerId) continue;
      if (!redemptionsByOrder.has(row.orderId)) redemptionsByOrder.set(row.orderId, []);
      redemptionsByOrder.get(row.orderId).push(row);
    }

    const orders = [];
    for (const raw of input.orders || []) {
      const order = normalizeOrder(raw);
      if (!order.id || isVoid(order.status)) continue;
      if (scope.businessId && order.businessId !== scope.businessId) continue;
      if (scope.branchId && order.branchId !== scope.branchId) continue;
      const expanded = expandOrder(order, linesByOrder.get(order.id) || []);
      let rows = expanded.rows;
      if (filters.product) rows = rows.filter((r) => matchesText(r.product, filters.product));
      if (filters.category) rows = rows.filter((r) => matchesText(r.category, filters.category));
      if ((filters.product || filters.category) && !rows.length) continue;
      let figures = expanded.figures;
      if ((filters.product || filters.category) && rows.length !== expanded.rows.length) {
        const sum = (key) => round2(rows.reduce((s, row) => s + num(row[key]), 0));
        figures = {
          qty: round2(rows.reduce((s, row) => s + num(row.qty), 0)),
          discount: sum("discount"),
          loyalty: sum("loyalty"),
          gst: sum("gst"),
          netSales: sum("netSales"),
          grossProfit: sum("grossProfit"),
          netProfit: sum("netProfit"),
          totalSales: sum("totalSales"),
          sellingPrice: sum("sellingPrice"),
          purchaseCost: sum("purchaseCost"),
        };
      }
      const links = [];
      const seen = new Set();
      for (const link of redemptionsByOrder.get(order.id) || []) {
        if (seen.has(link.offerId)) continue;
        seen.add(link.offerId);
        const meta = offerById.get(link.offerId) || { id: link.offerId, name: "Offer", code: offerCode({ id: link.offerId, name: "Offer" }) };
        links.push(meta);
      }
      if (!links.length && (figures.discount > 0 || figures.loyalty > 0)) {
        links.push({ id: "manual", name: "Manual discount", code: "MANUAL" });
      }
      orders.push({ order, rows, figures, links });
    }

    const offerWanted = String(filters.offer || "").trim().toLowerCase();
    function offerHit(link) {
      if (!offerWanted) return true;
      const id = String(link.id || "").toLowerCase();
      const code = String(link.code || "").toLowerCase();
      const name = String(link.name || "").toLowerCase();
      return id === offerWanted || code === offerWanted || name.includes(offerWanted);
    }
    const kept = [];
    for (const entry of orders) {
      const links = entry.links.filter(offerHit);
      if (offerWanted && !links.length) continue;
      kept.push({ ...entry, links });
    }

    const offerMap = new Map();
    const dayMap = new Map();
    const monthMap = new Map();
    const businessMap = new Map();
    const offerOrderIds = new Set();
    const totals = blankTotals();

    function bumpPeriod(map, key, meta, figures) {
      const cur = map.get(key) || { ...meta, ...blankTotals(), margin: 0 };
      addFigures(cur, figures, 0);
      cur.margin = marginOf(cur.netProfit, cur.netSales);
      map.set(key, cur);
    }

    for (const entry of kept) {
      addFigures(totals, entry.figures, entry.order.extra);
      const bizKey = entry.order.businessId || "shop";
      bumpPeriod(businessMap, bizKey, {
        id: entry.order.businessId,
        name: entry.order.businessName || "Business",
      }, entry.figures);
      const linked = entry.links.length > 0;
      if (linked) offerOrderIds.add(entry.order.id);
      for (const link of entry.links) {
        const key = link.id || link.code;
        bumpPeriod(offerMap, key, { id: link.id, code: link.code, name: link.name }, entry.figures);
        const day = entry.rows[0]?.date || dayKey(entry.order.createdAt);
        if (day) {
          bumpPeriod(dayMap, `${key}|${day}`, { id: link.id, code: link.code, name: link.name, day }, entry.figures);
          bumpPeriod(monthMap, `${key}|${day.slice(0, 7)}`, { id: link.id, code: link.code, name: link.name, month: day.slice(0, 7) }, entry.figures);
        }
      }
    }

    const offerRows = [...offerMap.values()].sort((a, b) => b.totalSales - a.totalSales || a.name.localeCompare(b.name));
    const byDay = [...dayMap.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)) || b.totalSales - a.totalSales);
    const byMonth = [...monthMap.values()].sort((a, b) => String(a.month).localeCompare(String(b.month)) || b.totalSales - a.totalSales);
    const byBusiness = [...businessMap.values()].sort((a, b) => b.totalSales - a.totalSales || a.name.localeCompare(b.name));
    const profitLines = kept.flatMap((entry) => entry.rows.map((row) => ({
      ...row,
      offerName: entry.links.map((link) => link.name).join(", "),
      offerCode: entry.links.map((link) => link.code).join(", "),
    })));
    const limit = Number.isFinite(Number(input.lineLimit)) ? Number(input.lineLimit) : 400;
    const shownLines = limit > 0 ? profitLines.slice(0, limit) : profitLines;
    const operating = includeExpenses ? expenses : 0;
    const netProfit = round2(totals.netProfit - operating);
    const dashboardOffers = offerRows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      sales: row.totalSales,
      profit: row.netProfit,
    }));
    const offerSales = round2(kept.reduce((s, entry) => s + (entry.links.length ? entry.figures.totalSales : 0), 0));
    const summary = {
      totalSales: totals.totalSales,
      gst: totals.gst,
      netSales: totals.netSales,
      purchaseCost: totals.purchaseCost,
      grossProfit: totals.grossProfit,
      discounts: totals.discount,
      loyalty: totals.loyalty,
      extraCharges: totals.extra,
      expenses: operating,
      expensesOmitted: Boolean(scope.branchId),
      netProfit,
      margin: marginOf(netProfit, totals.netSales),
      bills: totals.bills,
    };
    return {
      from: input.from || "",
      to: input.to || "",
      preset: input.preset || "custom",
      scope: {
        master: Boolean(scope.master),
        businessId: scope.businessId || null,
        branchId: scope.branchId || null,
        locked: Boolean(scope.locked),
        allBusinesses: Boolean(scope.allBusinesses),
      },
      dashboard: {
        totalSales: summary.totalSales,
        totalProfit: summary.netProfit,
        offerSales,
        totalDiscount: summary.discounts,
        grossProfit: summary.grossProfit,
        netSales: summary.netSales,
        gst: summary.gst,
        expenses: summary.expenses,
        margin: summary.margin,
        offers: dashboardOffers,
      },
      offers: offerRows,
      byDay,
      byMonth,
      byBusiness,
      profitLines: shownLines,
      profitTotals: { ...totals, netProfit, margin: summary.margin, expenses: operating },
      profitTruncated: limit > 0 && profitLines.length > shownLines.length,
      profitRowCount: profitLines.length,
      summary,
      catalog: offers.map((o) => ({ id: o.id, code: o.code, name: o.name })),
      branches: input.branches || [],
      businesses: input.businesses || [],
    };
  }

  function sheetsFromReport(report) {
    const offers = report?.offers || [];
    const days = report?.byDay || [];
    const months = report?.byMonth || [];
    const lines = report?.profitLines || [];
    const s = report?.summary || {};
    const moneyRow = (v) => round2(v);
    return [
      {
        name: "Profit summary",
        headers: ["From", "To", "Bills", "Total sales", "GST", "Net sales", "Purchase cost", "Gross profit", "Discounts", "Royalty points", "Expenses", "Net profit", "Margin %", "Offer sales"],
        rows: [[
          report?.from || "",
          report?.to || "",
          num(s.bills),
          moneyRow(s.totalSales),
          moneyRow(s.gst),
          moneyRow(s.netSales),
          moneyRow(s.purchaseCost),
          moneyRow(s.grossProfit),
          moneyRow(s.discounts),
          moneyRow(s.loyalty),
          moneyRow(s.expenses),
          moneyRow(s.netProfit),
          moneyRow(s.margin),
          moneyRow(report?.dashboard?.offerSales),
        ]],
      },
      {
        name: "Offer Wise Sales",
        headers: ["Offer", "Code", "Bills", "Qty", "Discount", "Sales", "GST", "Net sales", "Gross profit", "Net profit", "Margin %"],
        rows: offers.map((r) => [r.name, r.code, r.bills, moneyRow(r.qty), moneyRow(r.discount), moneyRow(r.totalSales), moneyRow(r.gst), moneyRow(r.netSales), moneyRow(r.grossProfit), moneyRow(r.netProfit), moneyRow(r.margin)]),
      },
      {
        name: "Offer by day",
        headers: ["Day", "Offer", "Code", "Bills", "Qty", "Discount", "Sales", "GST", "Net sales", "Net profit"],
        rows: days.map((r) => [r.day, r.name, r.code, r.bills, moneyRow(r.qty), moneyRow(r.discount), moneyRow(r.totalSales), moneyRow(r.gst), moneyRow(r.netSales), moneyRow(r.netProfit)]),
      },
      {
        name: "Offer by month",
        headers: ["Month", "Offer", "Code", "Bills", "Qty", "Discount", "Sales", "GST", "Net sales", "Net profit"],
        rows: months.map((r) => [r.month, r.name, r.code, r.bills, moneyRow(r.qty), moneyRow(r.discount), moneyRow(r.totalSales), moneyRow(r.gst), moneyRow(r.netSales), moneyRow(r.netProfit)]),
      },
      {
        name: "Sales Wise Profit",
        headers: ["Invoice", "Date", "Business", "Branch", "Product", "Category", "Qty", "Purchase price", "Selling price", "Item discount", "Royalty points", "GST", "Total sales", "Gross profit", "Net profit", "Margin %", "Offer"],
        rows: lines.map((r) => [
          r.invoice, r.date, r.businessName, r.branchName, r.product, r.category, moneyRow(r.qty),
          moneyRow(r.purchaseCost), moneyRow(r.sellingPrice), moneyRow(r.discount), moneyRow(r.loyalty),
          moneyRow(r.gst), moneyRow(r.totalSales), moneyRow(r.grossProfit), moneyRow(r.netProfit), moneyRow(r.margin),
          r.offerName || "",
        ]),
      },
      {
        name: "Offer comparison",
        headers: ["Offer", "Sales", "Profit"],
        rows: (report?.dashboard?.offers || []).map((r) => [r.name, moneyRow(r.sales), moneyRow(r.profit)]),
      },
    ];
  }

  function pdfEscape(value) {
    return String(value ?? "")
      .replaceAll("₹", "Rs ")
      .replace(/[^\x20-\x7E]/g, " ")
      .replaceAll("\\", "\\\\")
      .replaceAll("(", "\\(")
      .replaceAll(")", "\\)");
  }

  function reportPdfBuffer(textLines) {
    const perPage = 46;
    const all = (textLines || []).length ? textLines : ["No rows"];
    const pages = [];
    for (let i = 0; i < all.length; i += perPage) pages.push(all.slice(i, i + perPage));
    const fontId = 3 + pages.length * 2;
    const kids = pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    ];
    pages.forEach((lines, pageIndex) => {
      const commands = ["BT", "/F1 10 Tf", "40 800 Td", "14 TL"];
      lines.forEach((line, index) => {
        const text = `(${pdfEscape(line).slice(0, 110)})`;
        commands.push(index === 0 ? `${text} Tj` : `${text} '`);
      });
      commands.push("ET");
      const stream = commands.join("\n");
      const length = typeof Buffer !== "undefined" ? Buffer.byteLength(stream) : stream.length;
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${4 + pageIndex * 2} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
      );
      objects.push(`<< /Length ${length} >>\nstream\n${stream}\nendstream`);
    });
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    let body = "%PDF-1.4\n";
    const offsets = [0];
    const size = (chunk) => (typeof Buffer !== "undefined" ? Buffer.byteLength(chunk) : chunk.length);
    objects.forEach((obj, index) => {
      offsets.push(size(body));
      body += `${index + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xrefAt = size(body);
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i < offsets.length; i += 1) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    body += `${xref}trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
    return typeof Buffer !== "undefined" ? Buffer.from(body, "latin1") : body;
  }

  function pdfLines(report) {
    const s = report?.summary || {};
    const lines = [
      "Offer Wise Sales and Sales Wise Profit",
      `Range ${report?.from || ""} to ${report?.to || ""}`,
      report?.scope?.allBusinesses ? "All businesses" : "This business",
      `Total sales ${inr(s.totalSales)}`,
      `Total profit ${inr(s.netProfit)}`,
      `Offer sales ${inr(report?.dashboard?.offerSales)}`,
      `Total discount ${inr(s.discounts)}`,
      `GST ${inr(s.gst)}  Net sales ${inr(s.netSales)}`,
      `Gross profit ${inr(s.grossProfit)}  Margin ${pct(s.margin)}`,
      "",
      "Offer comparison",
    ];
    for (const row of report?.dashboard?.offers || []) {
      lines.push(`${row.name}  ${row.code || ""}  Sales ${inr(row.sales)}  Profit ${inr(row.profit)}`);
    }
    lines.push("", "Offer wise sales");
    for (const row of report?.offers || []) {
      lines.push(`${row.name} (${row.code})  Bills ${row.bills}  Qty ${qtyText(row.qty)}  Discount ${inr(row.discount)}  Sales ${inr(row.totalSales)}  GST ${inr(row.gst)}  Net ${inr(row.netSales)}`);
    }
    lines.push("", "Sales wise profit");
    for (const row of (report?.profitLines || []).slice(0, 80)) {
      lines.push(`${row.invoice}  ${row.product}  Qty ${qtyText(row.qty)}  Cost ${inr(row.purchaseCost)}  Sell ${inr(row.sellingPrice)}  Disc ${inr(row.discount)}  Royalty ${inr(row.loyalty)}  GST ${inr(row.gst)}  Net ${inr(row.netProfit)}  ${pct(row.margin)}`);
    }
    if ((report?.profitRowCount || 0) > 80) lines.push("Excel has the full bill list.");
    return lines;
  }

  function kpiCard(label, value) {
    return `<div class="report-card"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  }

  function htmlTable(headers, rows) {
    if (!rows.length) return `<p class="report-empty">No rows in this range</p>`;
    return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
      .map((row) => {
        const search = row.join(" ").toLowerCase();
        return `<tr data-report-row="${esc(search)}">${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`;
      })
      .join("")}</tbody></table></div>`;
  }

  function actionBar(links) {
    const excel = links?.excel || "#";
    const pdf = links?.pdf || "#";
    return `<div class="print-actions">
      <button class="btn" type="button" data-print-report>Print</button>
      <a class="btn" href="${esc(excel)}">Excel</a>
      <a class="btn" href="${esc(pdf)}">PDF</a>
    </div>`;
  }

  function reportSectionsHtml(report, links = {}) {
    const d = report?.dashboard || {};
    const s = report?.summary || {};
    const range = `${report?.from || ""} → ${report?.to || ""}`;
    const offerRows = (report?.offers || []).map((r) => [
      r.name, r.code, String(r.bills), qtyText(r.qty), inr(r.discount), inr(r.totalSales), inr(r.gst), inr(r.netSales), inr(r.netProfit), pct(r.margin),
    ]);
    const dayRows = (report?.byDay || []).map((r) => [r.day, r.name, r.code, String(r.bills), inr(r.totalSales), inr(r.netProfit)]);
    const monthRows = (report?.byMonth || []).map((r) => [r.month, r.name, r.code, String(r.bills), inr(r.totalSales), inr(r.netProfit)]);
    const profitRows = (report?.profitLines || []).map((r) => [
      r.invoice || "—",
      r.date || "",
      r.product,
      qtyText(r.qty),
      inr(r.purchaseCost),
      inr(r.sellingPrice),
      inr(r.discount),
      inr(r.loyalty),
      inr(r.gst),
      inr(r.totalSales),
      inr(r.grossProfit),
      inr(r.netProfit),
      pct(r.margin),
    ]);
    const compareRows = (d.offers || []).map((r) => [r.name, inr(r.sales), inr(r.profit)]);
    const more = report?.profitTruncated ? `<p class="hint catalog-more">Showing ${report.profitLines.length} of ${report.profitRowCount} lines. Excel has the full list.</p>` : "";
    const expenseNote = s.expensesOmitted ? " Operating expenses stay off while one branch is selected." : "";
    const offerBlock = `<section class="report-block offer-profit-block" data-report-title="Offer Wise Sales" data-report-group="profit" data-report-sheet="Offer Wise Sales">
      <div class="report-block-head">
        <div>
          <h3>Offer Wise Sales Report</h3>
          <p class="report-block-meta">${esc(range)} · ${offerRows.length} ${offerRows.length === 1 ? "offer" : "offers"} · a bill with two offers is listed under each</p>
        </div>
        ${actionBar(links)}
      </div>
      <div class="report-grid offer-profit-kpis">
        ${kpiCard("Total Sales", inr(d.totalSales))}
        ${kpiCard("Offer Sales", inr(d.offerSales))}
        ${kpiCard("Total Discount", inr(d.totalDiscount))}
        ${kpiCard("Total Profit", inr(d.totalProfit))}
      </div>
      <h4 class="offer-profit-sub">Offer-wise sales comparison</h4>
      ${htmlTable(["Offer", "Sales", "Profit"], compareRows)}
      ${htmlTable(["Offer", "Code", "Bills", "Products", "Discount", "Sales", "GST", "Net sales", "Net profit", "Margin"], offerRows)}
      <h4 class="offer-profit-sub">Date-wise</h4>
      ${htmlTable(["Date", "Offer", "Code", "Bills", "Sales", "Profit"], dayRows)}
      <h4 class="offer-profit-sub">Monthly</h4>
      ${htmlTable(["Month", "Offer", "Code", "Bills", "Sales", "Profit"], monthRows)}
    </section>`;
    const profitBlock = `<section class="report-block offer-profit-block" data-report-title="Sales Wise Profit" data-report-group="profit" data-report-sheet="Sales Wise Profit">
      <div class="report-block-head">
        <div>
          <h3>Sales Wise Profit Report</h3>
          <p class="report-block-meta">${esc(range)} · ${report?.profitRowCount || 0} lines · gross profit is selling price minus purchase cost</p>
        </div>
        ${actionBar(links)}
      </div>
      ${more}
      ${htmlTable(["Invoice", "Date", "Product", "Qty", "Purchase price", "Selling price", "Item discount", "Royalty points", "GST", "Total sales", "Gross profit", "Net profit", "Margin"], profitRows)}
    </section>`;
    const plRows = [
      ["Total sales (incl. GST)", inr(s.totalSales)],
      ["GST", inr(s.gst)],
      ["Net sales (excl. GST)", inr(s.netSales)],
      ["Purchase cost", inr(s.purchaseCost)],
      ["Gross profit", inr(s.grossProfit)],
      ["Discounts", inr(s.discounts)],
      ["Royalty points", inr(s.loyalty)],
      ["Other expenses", inr(s.expenses)],
      ["Net profit", inr(s.netProfit)],
      ["Profit margin", pct(s.margin)],
    ];
    const plBlock = `<section class="report-block offer-profit-block" data-report-title="Profit & Loss Summary" data-report-group="profit" data-report-sheet="Profit & Loss Summary">
      <div class="report-block-head">
        <div>
          <h3>Profit &amp; Loss Summary</h3>
          <p class="report-block-meta">Net profit = sales excl. GST − purchase cost − discounts − royalty points − other expenses.${esc(expenseNote)} Margin = net profit ÷ net sales.</p>
        </div>
        ${actionBar(links)}
      </div>
      ${htmlTable(["", "Amount"], plRows)}
    </section>`;
    return offerBlock + profitBlock + plBlock;
  }

  function dashboardHtml(dashboard) {
    const d = dashboard || {};
    const offers = Array.isArray(d.offers) ? d.offers : [];
    const rows = offers.length
      ? offers.map((row) => `<tr><td>${esc(row.name)}</td><td>${esc(inr(row.sales))}</td><td>${esc(inr(row.profit))}</td></tr>`).join("")
      : `<tr><td colspan="3">No offer sales this month</td></tr>`;
    return `<section class="saas-card saas-wide" data-widget="offer-profit">
      <header class="saas-card-head">
        <h3>Sales &amp; Profit</h3>
        <button type="button" class="saas-link" data-hub-report="offer-wise-sales">Offer Wise Sales Report</button>
      </header>
      <p class="saas-overview-meta">This month · your business only</p>
      <div class="report-grid offer-profit-kpis">
        ${kpiCard("Total Sales", inr(d.totalSales))}
        ${kpiCard("Total Profit", inr(d.totalProfit))}
        ${kpiCard("Offer Sales", inr(d.offerSales))}
        ${kpiCard("Total Discount", inr(d.totalDiscount))}
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Offer</th><th>Sales</th><th>Profit</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>`;
  }

  function masterPageHtml(report, links = {}) {
    const scope = report?.scope || {};
    const banner = scope.allBusinesses ? "Consolidated report of all businesses" : "Filtered to one business";
    const businesses = report?.businesses || [];
    const branches = report?.branches || [];
    const catalog = report?.catalog || [];
    const bizOptions = [`<option value="">All businesses</option>`].concat(businesses.map((b) => `<option value="${esc(b.id)}"${scope.businessId === b.id ? " selected" : ""}>${esc(b.name || b.id)}</option>`));
    const branchOptions = [`<option value="">All branches</option>`].concat(branches.map((b) => `<option value="${esc(b.id)}"${scope.branchId === b.id ? " selected" : ""}>${esc(b.businessName ? `${b.businessName} · ${b.name}` : b.name)}</option>`));
    const offerOptions = [`<option value="">All offers</option>`].concat(catalog.map((o) => `<option value="${esc(o.id)}">${esc(o.name)} · ${esc(o.code)}</option>`));
    const preset = report?.preset || "custom";
    const chip = (id, label) => `<button class="btn${preset === id ? " is-on" : ""}" type="button" data-op-preset="${id}">${label}</button>`;
    const bizRows = (report?.byBusiness || []).map((r) => [r.name, inr(r.totalSales), inr(r.netProfit), inr(r.discount)]);
    return `<div class="items-desk master-desk offer-profit-desk">
      <header class="items-hero">
        <div class="items-hero-copy">
          <p class="items-kicker">Master Admin</p>
          <h3>Offer &amp; profit</h3>
          <p class="lede">${esc(banner)}. Business owners still see only their own shop.</p>
        </div>
      </header>
      <form class="report-toolbar" id="offer-profit-form">
        <div class="reports-range-chips">
          ${chip("today", "Today")}
          ${chip("yesterday", "Yesterday")}
          ${chip("week", "This Week")}
          ${chip("month", "This Month")}
          ${chip("custom", "Custom Date")}
        </div>
        <label>From <input id="op-from" type="date" value="${esc(report?.from || "")}" required /></label>
        <label>To <input id="op-to" type="date" value="${esc(report?.to || "")}" required /></label>
        <label>Business <select id="op-business">${bizOptions.join("")}</select></label>
        <label>Branch <select id="op-branch">${branchOptions.join("")}</select></label>
        <label>Offer <select id="op-offer">${offerOptions.join("")}</select></label>
        <label>Product <input id="op-product" value="${esc(links.product || "")}" placeholder="All" /></label>
        <label>Category <input id="op-category" value="${esc(links.category || "")}" placeholder="All" /></label>
        <button class="btn primary" type="submit">Show</button>
        <button class="btn" type="button" id="op-print">Print</button>
        <a class="btn" href="${esc(links.excel || "#")}">Excel</a>
        <a class="btn" href="${esc(links.pdf || "#")}">PDF</a>
      </form>
      <h4 class="offer-profit-sub">Business comparison</h4>
      ${htmlTable(["Business", "Sales", "Profit", "Discount"], bizRows)}
      <div id="offer-profit-sections">${reportSectionsHtml(report, links)}</div>
    </div>`;
  }

  return {
    PRESETS,
    round2,
    inr,
    pct,
    presetRange,
    offerCode,
    lineProfit,
    allocate,
    resolveReportScope,
    assembleOfferProfit,
    sheetsFromReport,
    pdfLines,
    reportPdfBuffer,
    reportSectionsHtml,
    dashboardHtml,
    masterPageHtml,
  };
});
