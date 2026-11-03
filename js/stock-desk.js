(function (root, factory) {
  const api = factory();
  root.POSStockDesk = api;
  if (typeof window !== "undefined") window.POSStockDesk = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STOCK_COLUMNS = [
    { id: "name", label: "Product Name", locked: true },
    { id: "sku", label: "SKU / Barcode" },
    { id: "category", label: "Category" },
    { id: "batch", label: "Batch Number" },
    { id: "purchase", label: "Purchase Price" },
    { id: "selling", label: "Selling Price" },
    { id: "stock", label: "Available Stock" },
    { id: "minimum", label: "Minimum Stock" },
    { id: "expiry", label: "Expiry Date" },
    { id: "value", label: "Stock Value" },
    { id: "status", label: "Stock Status" },
    { id: "action", label: "Action", locked: true },
  ];

  const PAGE_SIZES = [25, 50, 100];
  const STATUS_RANK = { out: 0, low: 1, ok: 2 };

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function ymdOf(value) {
    const s = String(value || "").trim();
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    return "";
  }

  function unitOf(item) {
    return String(item?.base_unit || item?.unit || "PCS");
  }

  function positiveRate(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function daysUntilExpiry(expiryYmd, todayYmd) {
    const exp = ymdOf(expiryYmd);
    const today = ymdOf(todayYmd);
    if (!exp || !today) return null;
    const expMs = Date.parse(`${exp}T12:00:00`);
    const todayMs = Date.parse(`${today}T12:00:00`);
    if (Number.isNaN(expMs) || Number.isNaN(todayMs)) return null;
    return Math.round((expMs - todayMs) / 86400000);
  }

  function stockExpiryTone(days) {
    if (days == null || days === "") return "none";
    const d = Number(days);
    if (!Number.isFinite(d)) return "none";
    if (d < 0) return "expired";
    if (d <= 30) return "soon";
    if (d <= 60) return "watch";
    return "ok";
  }

  function stockExpiryBucket(tone) {
    if (tone === "expired") return "expired";
    if (tone === "soon" || tone === "watch") return "soon";
    return "safe";
  }

  function worstExpiryBucket(buckets) {
    const rank = { expired: 3, soon: 2, safe: 1 };
    let worst = "safe";
    for (const bucket of buckets || []) {
      if ((rank[bucket] || 1) > rank[worst]) worst = bucket;
    }
    return worst;
  }

  function expiryLabel(days, tone) {
    if (tone === "none" || !Number.isFinite(Number(days))) return "N/A";
    const d = Number(days);
    if (d < 0) {
      const n = Math.abs(d);
      return n === 1 ? "Expired yesterday" : `Expired ${n} days ago`;
    }
    if (d === 0) return "Expires today";
    if (d === 1) return "Expires tomorrow";
    return `Expires in ${d} days`;
  }

  function lineExpiryYmd(batch, item) {
    return ymdOf(
      batch?.expiry_date
      || item?.primary_expiry
      || item?.default_expiry
      || item?.item_default_expiry
      || batch?.item_default_expiry
      || "",
    );
  }

  function stockStatus(available, minimum) {
    if (num(available) <= 0) return "out";
    if (num(available) <= num(minimum)) return "low";
    return "ok";
  }

  function indexBatches(batches) {
    if (!Array.isArray(batches)) return null;
    const map = new Map();
    for (const batch of batches) {
      const itemId = batch?.item_id;
      if (!itemId) continue;
      const list = map.get(itemId) || [];
      list.push(batch);
      map.set(itemId, list);
    }
    return map;
  }

  function onHandBatches(item, batchIndex) {
    const raw = batchIndex ? (batchIndex.get(item.id) || []) : (Array.isArray(item?.batches) ? item.batches : []);
    const out = [];
    const seen = new Set();
    for (const batch of raw) {
      if (!batch || num(batch.remaining_gm) <= 0) continue;
      const id = String(batch.id || "");
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      out.push(batch);
    }
    return out;
  }

  function makeLine(item, batch, deps) {
    const unit = unitOf(item);
    const available = batch ? num(batch.remaining_gm) : num(item.stock_gm);
    const minimum = num(item.reorder_level_gm);
    const expiryYmd = lineExpiryYmd(batch, item);
    const expiryDays = daysUntilExpiry(expiryYmd, deps.today);
    const expiryTone = stockExpiryTone(expiryDays);
    const purchasePrice = positiveRate(batch?.unit_cost) || positiveRate(item.purchase_rate);
    const sellingPrice = positiveRate(item.retail_rate) || positiveRate(batch?.mrp) || positiveRate(item.mrp);
    const batchNo = String((batch ? batch.batch_no : item.batch_no) || "").trim();
    const barcode = String((batch && batch.barcode) || item.barcode || "").trim();
    const sku = String(item.code || "").trim();
    return {
      key: batch?.id ? `${item.id}:${batch.id}` : String(item.id || ""),
      itemId: String(item.id || ""),
      batchId: batch?.id ? String(batch.id) : "",
      name: String(item.name || batch?.item_name || "Item"),
      sku,
      barcode,
      category: String(item.category || ""),
      subcategory: String(item.subcategory || ""),
      batchNo,
      color: String(item.color || ""),
      size: String(item.size || ""),
      purchasePrice,
      sellingPrice,
      availableGm: available,
      minimumGm: minimum,
      unit,
      expiryYmd,
      expiryDays,
      expiryTone,
      expiryBucket: stockExpiryBucket(expiryTone),
      stockValue: deps.lineAmount(available, purchasePrice, unit),
      status: stockStatus(item.stock_gm, minimum),
      search: [
        item.name, sku, barcode, item.category, item.subcategory, batchNo, expiryYmd,
        item.color, item.size, item.supplier_name, item.local_name,
      ].join(" ").toLowerCase(),
    };
  }

  function buildStockLines(items, options = {}) {
    const deps = {
      today: ymdOf(options.today) || new Date().toISOString().slice(0, 10),
      lineAmount: typeof options.lineAmount === "function"
        ? options.lineAmount
        : (qty, rate) => num(qty) * num(rate),
    };
    const batchIndex = indexBatches(options.batches);
    const lines = [];
    for (const item of Array.isArray(items) ? items : []) {
      if (!item || item.id == null || item.id === "") continue;
      const batches = onHandBatches(item, batchIndex);
      if (batches.length) {
        for (const batch of batches) lines.push(makeLine(item, batch, deps));
      } else {
        lines.push(makeLine(item, null, deps));
      }
    }
    return lines;
  }

  function summarizeStock(items, lines, options = {}) {
    const list = Array.isArray(items) ? items : [];
    const lineAmount = typeof options.lineAmount === "function"
      ? options.lineAmount
      : (qty, rate) => num(qty) * num(rate);
    const displayQty = typeof options.displayQty === "function"
      ? options.displayQty
      : (qty) => num(qty);
    const qtySuffix = typeof options.qtySuffix === "function" ? options.qtySuffix : (unit) => String(unit || "");
    let valuation = 0;
    let quantity = 0;
    let low = 0;
    const suffixes = new Set();
    for (const item of list) {
      const unit = unitOf(item);
      valuation += num(lineAmount(item.stock_gm, item.purchase_rate, unit));
      quantity += num(displayQty(item.stock_gm, unit));
      suffixes.add(String(qtySuffix(unit) || unit));
      if (num(item.stock_gm) <= num(item.reorder_level_gm)) low += 1;
    }
    const byItem = new Map();
    for (const line of Array.isArray(lines) ? lines : []) {
      const cur = byItem.get(line.itemId) || { expired: false, soon: false, onHand: false };
      if (num(line.availableGm) > 0) {
        cur.onHand = true;
        if (line.expiryBucket === "expired") cur.expired = true;
        if (line.expiryBucket === "soon") cur.soon = true;
      }
      byItem.set(line.itemId, cur);
    }
    let expired = 0;
    let expiringSoon = 0;
    for (const cur of byItem.values()) {
      if (!cur.onHand) continue;
      if (cur.expired) expired += 1;
      else if (cur.soon) expiringSoon += 1;
    }
    return {
      products: list.length,
      quantity,
      quantityMixed: suffixes.size > 1,
      quantitySuffix: suffixes.size === 1 ? [...suffixes][0] : "",
      valuation,
      low,
      expired,
      expiringSoon,
    };
  }

  function filterStockLines(lines, filters = {}) {
    const q = String(filters.q || "").trim().toLowerCase();
    const expiry = String(filters.expiry || "all");
    const status = String(filters.status || "");
    return (Array.isArray(lines) ? lines : []).filter((line) => {
      if (q && !String(line.search || "").includes(q)) return false;
      if ((expiry === "expired" || expiry === "soon" || expiry === "safe") && line.expiryBucket !== expiry) return false;
      if (status === "out" && line.status !== "out") return false;
      if (status === "ok" && line.status !== "ok") return false;
      if (status === "low" && line.status !== "low" && line.status !== "out") return false;
      return true;
    });
  }

  function compareStockLines(a, b, key, dir) {
    const text = (value) => String(value || "").toLowerCase();
    let cmp = 0;
    let keepDirection = true;
    if (key === "purchase") cmp = num(a.purchasePrice) - num(b.purchasePrice);
    else if (key === "selling") cmp = num(a.sellingPrice) - num(b.sellingPrice);
    else if (key === "stock") cmp = num(a.availableGm) - num(b.availableGm);
    else if (key === "minimum") cmp = num(a.minimumGm) - num(b.minimumGm);
    else if (key === "value") cmp = num(a.stockValue) - num(b.stockValue);
    else if (key === "status") cmp = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
    else if (key === "expiry") {
      if (!a.expiryYmd && !b.expiryYmd) cmp = 0;
      else if (!a.expiryYmd) {
        cmp = 1;
        keepDirection = false;
      } else if (!b.expiryYmd) {
        cmp = -1;
        keepDirection = false;
      } else cmp = a.expiryYmd < b.expiryYmd ? -1 : a.expiryYmd > b.expiryYmd ? 1 : 0;
    } else if (key === "sku") cmp = text(a.sku || a.barcode).localeCompare(text(b.sku || b.barcode));
    else if (key === "batch") cmp = text(a.batchNo).localeCompare(text(b.batchNo), undefined, { numeric: true });
    else if (key === "category") cmp = text(a.category).localeCompare(text(b.category));
    else cmp = text(a.name).localeCompare(text(b.name));
    if (cmp === 0) {
      cmp = text(a.name).localeCompare(text(b.name))
        || text(a.batchNo).localeCompare(text(b.batchNo), undefined, { numeric: true })
        || text(a.key).localeCompare(text(b.key));
      keepDirection = true;
    }
    const sign = !keepDirection ? 1 : (dir === "desc" ? -1 : 1);
    return cmp * sign;
  }

  function sortStockLines(lines, key, dir) {
    const sortKey = STOCK_COLUMNS.some((col) => col.id === key) && key !== "action" ? key : "name";
    const sortDir = dir === "desc" ? "desc" : "asc";
    return (Array.isArray(lines) ? lines : []).slice().sort((a, b) => compareStockLines(a, b, sortKey, sortDir));
  }

  function paginateStockLines(lines, page, pageSize) {
    const rows = Array.isArray(lines) ? lines : [];
    const size = PAGE_SIZES.includes(Number(pageSize)) ? Number(pageSize) : 25;
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / size) || 1);
    const current = Math.min(Math.max(1, Number(page) || 1), pages);
    const start = (current - 1) * size;
    return {
      page: current,
      pages,
      pageSize: size,
      total,
      from: total ? start + 1 : 0,
      to: Math.min(total, start + size),
      rows: rows.slice(start, start + size),
    };
  }

  function pageList(current, pages) {
    const wanted = new Set([1, pages, current - 1, current, current + 1]);
    const nums = [...wanted].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
    const out = [];
    let prev = 0;
    for (const n of nums) {
      if (prev && n - prev > 1) out.push("gap");
      out.push(n);
      prev = n;
    }
    return out;
  }

  function visibleColumnIds(selected) {
    const known = new Set(STOCK_COLUMNS.map((col) => col.id));
    const all = STOCK_COLUMNS.map((col) => col.id);
    const picked = Array.isArray(selected) ? selected.filter((id) => known.has(id)) : all;
    const set = new Set(picked.length ? picked : all);
    set.add("name");
    set.add("action");
    return STOCK_COLUMNS.filter((col) => set.has(col.id)).map((col) => col.id);
  }

  function prepareStockView(items, options = {}) {
    const lines = buildStockLines(items, options);
    const filtered = filterStockLines(lines, options.filters || {});
    const sorted = sortStockLines(filtered, options.sort, options.dir);
    return {
      lines,
      summary: summarizeStock(items, lines, options),
      page: paginateStockLines(sorted, options.page, options.pageSize),
    };
  }

  return {
    STOCK_COLUMNS,
    PAGE_SIZES,
    daysUntilExpiry,
    stockExpiryTone,
    stockExpiryBucket,
    worstExpiryBucket,
    expiryLabel,
    stockStatus,
    buildStockLines,
    summarizeStock,
    filterStockLines,
    sortStockLines,
    paginateStockLines,
    pageList,
    visibleColumnIds,
    prepareStockView,
  };
});
