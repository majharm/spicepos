(function (root, factory) {
  const api = factory();
  root.POSGarmentPurchase = api;
  if (typeof window !== "undefined") window.POSGarmentPurchase = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const LETTER_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
  const NUMERIC_SIZES = ["28", "30", "32", "34", "36", "38"];
  const DEFAULT_SIZES = LETTER_SIZES.concat(NUMERIC_SIZES);
  const STANDARD_COLORS = [
    { name: "Black", hex: "#111827" },
    { name: "White", hex: "#f8fafc" },
    { name: "Red", hex: "#dc2626" },
    { name: "Blue", hex: "#2563eb" },
    { name: "Green", hex: "#16a34a" },
    { name: "Pink", hex: "#ec4899" },
    { name: "Yellow", hex: "#eab308" },
    { name: "Maroon", hex: "#7f1d1d" },
    { name: "Grey", hex: "#6b7280" },
    { name: "Beige", hex: "#d6c4a8" },
    { name: "Brown", hex: "#92400e" },
    { name: "Navy", hex: "#1e3a8a" },
    { name: "Orange", hex: "#ea580c" },
    { name: "Purple", hex: "#7c3aed" },
    { name: "Gold", hex: "#d4a017" },
    { name: "Silver", hex: "#cbd5e1" },
    { name: "Cream", hex: "#f5f0e6" },
    { name: "Tan", hex: "#c4a484" },
    { name: "Multi", hex: "linear-gradient(135deg,#ef4444,#eab308,#22c55e,#2563eb)" },
  ];
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

  function colorKey(raw) {
    return String(raw || "").trim().toLowerCase();
  }

  function normalizeColor(raw) {
    const text = String(raw || "").trim().replace(/\s+/g, " ");
    if (!text) return "";
    const known = STANDARD_COLORS.find((row) => row.name.toLowerCase() === text.toLowerCase());
    if (known) return known.name;
    return text.replace(/\b\p{L}/gu, (ch) => ch.toUpperCase());
  }

  function colorsEqual(a, b) {
    const left = colorKey(normalizeColor(a));
    const right = colorKey(normalizeColor(b));
    return Boolean(left) && left === right;
  }

  function swatchOf(name, image) {
    const img = String(image || "").trim();
    if (/^data:image\//i.test(img) || /^https?:\/\//i.test(img)) return { kind: "image", value: img };
    if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(img)) return { kind: "hex", value: img };
    const known = STANDARD_COLORS.find((row) => colorsEqual(row.name, name));
    if (known) return { kind: known.hex.startsWith("linear") ? "gradient" : "hex", value: known.hex };
    const label = normalizeColor(name) || "Colour";
    let hue = 0;
    for (const ch of label) hue = (hue * 33 + ch.charCodeAt(0)) % 360;
    return { kind: "hex", value: `hsl(${hue} 52% 46%)` };
  }

  function swatchCss(name, image) {
    const swatch = swatchOf(name, image);
    if (swatch.kind === "image") {
      const safe = swatch.value.replace(/["\\]/g, "");
      return `background-image:url("${safe}");background-size:cover;background-position:center`;
    }
    if (swatch.kind === "gradient") return `background:${swatch.value}`;
    return `background:${swatch.value}`;
  }

  function variantKey(color, size) {
    return `${colorKey(normalizeColor(color))}|${normalizeSize(size)}`;
  }

  function barcodesForColor(map, color) {
    const prefix = `${colorKey(normalizeColor(color))}|`;
    const out = {};
    for (const [key, val] of Object.entries(map || {})) {
      const raw = String(key || "");
      if (!raw.toLowerCase().startsWith(prefix)) continue;
      const size = normalizeSize(raw.slice(prefix.length));
      if (size) out[size] = val;
    }
    return out;
  }

  function productKey(item) {
    return [
      String(item?.name || "").trim().toLowerCase(),
      colorKey(item?.color),
      String(item?.wearer_type || "").trim().toLowerCase(),
    ].join("|");
  }

  function styleKey(item) {
    return [
      String(item?.name || "").trim().toLowerCase(),
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

  function styleGroups(items) {
    const map = new Map();
    for (const item of items || []) {
      if (!item) continue;
      const key = styleKey(item);
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: String(item.name || "Item").trim() || "Item",
          wearer_type: String(item.wearer_type || "").trim(),
          hsn: item.hsn || "",
          category: item.category || "",
          subcategory: item.subcategory || "",
          purchase_rate: Number(item.purchase_rate) || 0,
          unit: item.base_unit || item.unit || "PCS",
          anchor: item,
          variants: [],
          colors: [],
          sizes: [],
        });
      }
      const g = map.get(key);
      g.variants.push(item);
      const color = normalizeColor(item.color);
      if (color && !g.colors.some((row) => colorsEqual(row, color))) g.colors.push(color);
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

  function stockStatus(item) {
    const stock = Number(item?.stock_gm) || 0;
    const reorder = Number(item?.reorder_level_gm) || 0;
    if (stock <= 0) return "out";
    if (reorder > 0 && stock <= reorder) return "low";
    return "ok";
  }

  function worseStatus(a, b) {
    const rank = { ok: 0, low: 1, out: 2 };
    return (rank[b] || 0) > (rank[a] || 0) ? b : a;
  }

  function withBarcodes(items, codes) {
    const byItem = new Map();
    for (const row of codes || []) {
      const id = row?.item_id || row?.itemId;
      if (!id) continue;
      if (!byItem.has(id)) byItem.set(id, []);
      byItem.get(id).push(row);
    }
    return (items || []).map((item) => ({
      ...item,
      barcodes: byItem.get(item?.id) || item?.barcodes || [],
    }));
  }

  function variantPieces(item) {
    const B = globalThis.POSBarcode;
    const seen = new Set();
    const pieces = [];
    const skuCodes = [];
    for (const row of item?.barcodes || []) {
      const code = B?.extraBarcodeValue?.(row) || String(row?.barcode || "").trim();
      if (!code) continue;
      const key = code.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const kind = String(row?.kind || "");
      const status = String(row?.status || "active").toLowerCase() || "active";
      const piece = B?.shouldConsumePieceBarcode ? B.shouldConsumePieceBarcode({ kind: kind || "unit" }) : kind.toLowerCase() === "unit";
      if (!piece) {
        skuCodes.push({ barcode: code, kind: kind || "own", status: "sku", onHand: Number(item.stock_gm) || 0, piece: false });
        continue;
      }
      const onHand = status === "sold" || status === "damaged" || status === "inactive" ? 0 : 1;
      pieces.push({ barcode: code, kind: kind || "unit", status, onHand, piece: true });
    }
    if (pieces.length) return pieces;
    if (skuCodes.length) return skuCodes.slice(0, 1).map((row) => ({ ...row, onHand: Number(item.stock_gm) || 0 }));
    const sku = String(item?.barcode || "").trim();
    if (sku) return [{ barcode: sku, kind: "sku", status: "sku", onHand: Number(item.stock_gm) || 0, piece: false }];
    return [{ barcode: "", kind: "", status: "sku", onHand: Number(item.stock_gm) || 0, piece: false }];
  }

  function stockBoard(items) {
    const styles = styleGroups(items).map((g) => {
      const byColor = new Map();
      for (const item of g.variants) {
        const color = normalizeColor(item.color) || "";
        const key = colorKey(color);
        if (!byColor.has(key)) byColor.set(key, { color, sizes: [], stock: 0, value: 0, status: "ok" });
        const bucket = byColor.get(key);
        const size = normalizeSize(item.size) || "—";
        const stock = Number(item.stock_gm) || 0;
        const status = stockStatus(item);
        const value = lineAmount(stock, item.purchase_rate);
        bucket.sizes.push({
          size,
          item,
          stock,
          reorder: Number(item.reorder_level_gm) || 0,
          status,
          code: String(item.code || ""),
          barcodes: variantPieces(item),
          value: round2(value),
          supplier: String(item.supplier_name || "").trim(),
        });
        bucket.stock += stock;
        bucket.value += value;
        bucket.status = worseStatus(bucket.status, status);
      }
      const colors = [...byColor.values()].map((bucket) => ({ ...bucket, value: round2(bucket.value) }));
      const total = colors.reduce((sum, color) => sum + color.stock, 0);
      const status = colors.reduce((cur, color) => worseStatus(cur, color.status), "ok");
      const suppliers = [];
      for (const color of colors) {
        for (const size of color.sizes) {
          if (size.supplier && !suppliers.includes(size.supplier)) suppliers.push(size.supplier);
        }
      }
      return {
        ...g,
        colors,
        totalStock: total,
        value: round2(colors.reduce((sum, color) => sum + color.value, 0)),
        status,
        suppliers,
        category: String(g.category || ""),
      };
    });
    const barcodeRows = [];
    for (const style of styles) {
      for (const color of style.colors) {
        for (const size of color.sizes) {
          for (const code of size.barcodes) {
            const onHand = code.piece ? code.onHand : size.stock;
            barcodeRows.push({
              barcode: code.barcode,
              kind: code.kind,
              piece: code.piece,
              onHand,
              name: style.name,
              color: color.color,
              size: size.size,
              code: size.code,
              itemId: size.item?.id || "",
              category: style.category,
              supplier: size.supplier,
              wearer: style.wearer_type,
              status: code.piece ? (onHand > 0 ? "ok" : "out") : size.status,
              variantStatus: size.status,
            });
          }
        }
      }
    }
    return { styles, barcodeRows };
  }

  return {
    LETTER_SIZES,
    NUMERIC_SIZES,
    DEFAULT_SIZES,
    STANDARD_COLORS,
    normalizeSize,
    sizesEqual,
    sizeLabel,
    normalizeColor,
    colorsEqual,
    colorKey,
    swatchOf,
    swatchCss,
    variantKey,
    barcodesForColor,
    productKey,
    styleKey,
    productLabel,
    uniqueSizes,
    sizeColumns,
    groupItems,
    styleGroups,
    totalQty,
    lineAmount,
    formatSizeQtySummary,
    planSizeLines,
    collectDuplicateBarcodes,
    stripVariantSuffix,
    groupInvoiceLines,
    stockGroups,
    stockStatus,
    withBarcodes,
    variantPieces,
    stockBoard,
  };
});
