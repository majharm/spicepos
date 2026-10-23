(function (root, factory) {
  const api = factory();
  root.POSGarmentPurchase = api;
  if (typeof window !== "undefined") window.POSGarmentPurchase = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const LETTER_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
  const NUMERIC_SIZES = ["28", "30", "32", "34", "36", "38"];
  const DEFAULT_SIZES = LETTER_SIZES.concat(NUMERIC_SIZES);
  const SIZE_ALIASES = {
    "3XL": "XXXL",
    XXXL: "XXXL",
    "2XL": "XXL",
    XXL: "XXL",
  };

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function round8(n) {
    const U = globalThis.POSUnits;
    if (U?.roundRate8) return U.roundRate8(n);
    return Math.round((Number(n) || 0) * 1e8) / 1e8;
  }

  function normalizeSize(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    const compact = s.replace(/\s+/g, "").toUpperCase();
    if (SIZE_ALIASES[compact]) return SIZE_ALIASES[compact];
    const xl = compact.match(/^(\d+)X[L]?$/);
    if (xl) {
      const n = Number(xl[1]);
      if (n === 2) return "XXL";
      if (n >= 3) return "XXXL";
    }
    return compact;
  }

  function sizesEqual(a, b) {
    const left = normalizeSize(a);
    const right = normalizeSize(b);
    return Boolean(left) && left === right;
  }

  function sizeLabel(raw) {
    return normalizeSize(raw) || String(raw || "").trim();
  }

  function productKey(item) {
    return [
      String(item?.name || "").trim().toLowerCase(),
      String(item?.color || "").trim().toLowerCase(),
      String(item?.wearer_type || "").trim().toLowerCase(),
    ].join("|");
  }

  function productLabel(item) {
    const name = String(item?.name || "Item").trim() || "Item";
    const bits = [];
    const wear = globalThis.POSFootwear?.wearerLabel?.(item?.wearer_type) || String(item?.wearer_type || "").trim();
    const color = String(item?.color || "").trim();
    if (wear) bits.push(wear);
    if (color) bits.push(color);
    return bits.length ? `${name} · ${bits.join(" · ")}` : name;
  }

  function uniqueSizes(list) {
    const out = [];
    const seen = new Set();
    for (const raw of list || []) {
      const size = normalizeSize(raw);
      if (!size || seen.has(size)) continue;
      seen.add(size);
      out.push(size);
    }
    return out;
  }

  function sizeColumns(group, extra = []) {
    const existing = (group?.variants || group?.items || []).map((i) => i.size);
    return uniqueSizes(DEFAULT_SIZES.concat(existing, extra || [], group?.sizes || []));
  }

  function groupItems(items) {
    const map = new Map();
    for (const item of items || []) {
      if (!item) continue;
      const key = productKey(item);
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: String(item.name || "Item").trim() || "Item",
          color: String(item.color || "").trim(),
          wearer_type: String(item.wearer_type || "").trim(),
          hsn: item.hsn || "",
          category: item.category || "",
          subcategory: item.subcategory || "",
          purchase_rate: Number(item.purchase_rate) || 0,
          retail_rate: Number(item.retail_rate) || 0,
          unit: item.base_unit || item.unit || "PCS",
          anchor: item,
          variants: [],
          sizes: [],
        });
      }
      const g = map.get(key);
      g.variants.push(item);
      const size = normalizeSize(item.size);
      if (size && !g.sizes.includes(size)) g.sizes.push(size);
      if (!g.anchor?.id) g.anchor = item;
    }
    return [...map.values()];
  }

  function totalQty(sizeQtys) {
    return Object.values(sizeQtys || {}).reduce((sum, n) => sum + Math.max(0, Math.round(Number(n) || 0)), 0);
  }

  function lineAmount(qty, rate) {
    const U = globalThis.POSUnits;
    if (U?.lineAmount) return U.lineAmount(qty, rate, "PCS");
    return round8((Number(qty) || 0) * (Number(rate) || 0));
  }

  function formatSizeQtySummary(sizeQtys) {
    const parts = [];
    const entries = Object.entries(sizeQtys || {});
    const order = uniqueSizes(DEFAULT_SIZES.concat(entries.map(([k]) => k)));
    for (const size of order) {
      const qty = Math.max(0, Math.round(Number(sizeQtys[size] ?? sizeQtys[size.toLowerCase()]) || 0));
      if (!qty) continue;
      parts.push(`${size}: ${qty}`);
    }
    return parts.join(", ");
  }

  function parseCodes(raw) {
    if (globalThis.POSBarcode?.parseManualCodes) return POSBarcode.parseManualCodes(raw);
    const parts = Array.isArray(raw) ? raw : String(raw ?? "").split(/[\s,;]+/);
    const out = [];
    const seen = new Set();
    for (const part of parts) {
      const code = String(part || "").trim();
      if (!code) continue;
      if (seen.has(code)) throw new Error(`Duplicate barcode ${code}`);
      seen.add(code);
      out.push(code);
    }
    return out;
  }

  function barcodesForSize(barcodesBySize, size) {
    if (!barcodesBySize || typeof barcodesBySize !== "object") return [];
    const want = normalizeSize(size);
    for (const [key, val] of Object.entries(barcodesBySize)) {
      if (sizesEqual(key, want)) return parseCodes(val);
    }
    return [];
  }

  function planSizeLines(sizeQtys, opts = {}) {
    const out = [];
    const merged = {};
    for (const [raw, qtyRaw] of Object.entries(sizeQtys || {})) {
      const size = normalizeSize(raw);
      const qty = Math.max(0, Math.round(Number(qtyRaw) || 0));
      if (!size || qty <= 0) continue;
      merged[size] = (merged[size] || 0) + qty;
    }
    for (const [size, qty] of Object.entries(merged)) {
      const barcodes = barcodesForSize(opts.barcodes_by_size || opts.barcodesBySize, size);
      if (opts.generate_barcodes || opts.generateBarcodes) {
        if (barcodes.length > qty) throw new Error(`${size}: too many barcodes for ${qty} pcs`);
      } else if (barcodes.length && barcodes.length !== qty) {
        throw new Error(`${size}: enter ${qty} barcodes for ${qty} pcs (entered ${barcodes.length})`);
      }
      out.push({
        size,
        qty,
        rate: opts.rate,
        barcodes,
        generate_barcodes: Boolean(opts.generate_barcodes || opts.generateBarcodes),
        allow_empty_barcodes: Boolean(opts.allow_empty_barcodes || opts.allowEmptyBarcodes),
      });
    }
    return out;
  }

  function collectDuplicateBarcodes(groups) {
    const seen = new Set();
    for (const codes of groups || []) {
      for (const code of parseCodes(codes)) {
        if (seen.has(code)) throw new Error(`Duplicate barcode ${code}`);
        seen.add(code);
      }
    }
    return [...seen];
  }

  function stripVariantSuffix(name) {
    return String(name || "")
      .replace(/\s*\((?:female|male|kids|unisex|girls|boys)[^)]*sz\s*[^)]+\)\s*$/i, "")
      .trim();
  }

  function groupInvoiceLines(lines) {
    const groups = [];
    const idx = new Map();
    for (const line of lines || []) {
      const size = normalizeSize(line.size);
      if (!size) {
        groups.push({
          kind: "plain",
          name: line.item_name || line.name || "Item",
          lines: [line],
          totalQty: Number(line.quantity_gm) || 0,
          rate: Number(line.rate_per_kg) || 0,
          amount: Number(line.amount) || 0,
          gst_amount: Number(line.gst_amount) || 0,
          gst_rate: Number(line.gst_rate) || 0,
          hsn: line.hsn || "—",
          unit: line.unit || "GM",
          sizeQtys: {},
        });
        continue;
      }
      const name = String(line.product_name || line.name || stripVariantSuffix(line.item_name) || "Item").trim() || "Item";
      const key = productKey({
        name,
        color: line.color,
        wearer_type: line.wearer_type,
      });
      if (!idx.has(key)) {
        const g = {
          kind: "garment",
          key,
          name,
          color: String(line.color || "").trim(),
          wearer_type: String(line.wearer_type || "").trim(),
          sizeQtys: {},
          totalQty: 0,
          rate: Number(line.rate_per_kg) || 0,
          amount: 0,
          gst_amount: 0,
          gst_rate: Number(line.gst_rate) || 0,
          hsn: line.hsn || "—",
          unit: line.unit || "PCS",
          lines: [],
        };
        idx.set(key, g);
        groups.push(g);
      }
      const g = idx.get(key);
      g.sizeQtys[size] = (g.sizeQtys[size] || 0) + Math.round(Number(line.quantity_gm) || 0);
      g.totalQty += Number(line.quantity_gm) || 0;
      g.amount += Number(line.amount) || 0;
      g.gst_amount += Number(line.gst_amount) || 0;
      g.lines.push(line);
    }
    for (const g of groups) {
      if (g.kind === "garment") g.summary = formatSizeQtySummary(g.sizeQtys);
    }
    return groups;
  }

  function stockGroups(items) {
    return groupItems(items).map((g) => {
      const sizeStock = {};
      let total = 0;
      let value = 0;
      for (const item of g.variants) {
        const size = normalizeSize(item.size) || "—";
        const stock = Number(item.stock_gm) || 0;
        sizeStock[size] = (sizeStock[size] || 0) + stock;
        total += stock;
        value += lineAmount(stock, item.purchase_rate);
      }
      return {
        ...g,
        sizeStock,
        totalStock: total,
        value: round2(value),
        summary: formatSizeQtySummary(sizeStock),
      };
    });
  }

  return {
    LETTER_SIZES,
    NUMERIC_SIZES,
    DEFAULT_SIZES,
    normalizeSize,
    sizesEqual,
    sizeLabel,
    productKey,
    productLabel,
    uniqueSizes,
    sizeColumns,
    groupItems,
    totalQty,
    lineAmount,
    formatSizeQtySummary,
    planSizeLines,
    collectDuplicateBarcodes,
    stripVariantSuffix,
    groupInvoiceLines,
    stockGroups,
  };
});
