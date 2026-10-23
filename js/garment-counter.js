(function (root, factory) {
  const api = factory();
  root.POSGarmentCounter = api;
  if (typeof window !== "undefined") window.POSGarmentCounter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function G() {
    return globalThis.POSGarmentPurchase || null;
  }

  function normalizeSize(raw) {
    return G()?.normalizeSize?.(raw) || String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function sizesEqual(a, b) {
    if (G()?.sizesEqual) return G().sizesEqual(a, b);
    const left = normalizeSize(a);
    const right = normalizeSize(b);
    return Boolean(left) && left === right;
  }

  function sizeLabel(raw) {
    return G()?.sizeLabel?.(raw) || normalizeSize(raw);
  }

  function wearerKey(item) {
    const F = globalThis.POSFootwear;
    return F?.normalizeWearer?.(item?.wearer_type) || String(item?.wearer_type || "").trim().toLowerCase();
  }

  function familyKey(item) {
    return [
      String(item?.name || "").trim().toLowerCase(),
      wearerKey(item),
    ].join("|");
  }

  function colorKey(raw) {
    return String(raw || "").trim().toLowerCase();
  }

  function colorsEqual(a, b) {
    return colorKey(a) === colorKey(b);
  }

  function cellKey(color, size) {
    return `${colorKey(color)}|${normalizeSize(size)}`;
  }

  function isActive(item) {
    return item && String(item.status || "active").toLowerCase() !== "inactive";
  }

  function activeFamily(item, items) {
    const key = familyKey(item);
    return (items || []).filter((row) => isActive(row) && familyKey(row) === key);
  }

  function configuredSizes(items) {
    const out = [];
    for (const item of items || []) {
      const size = normalizeSize(item?.size);
      if (!size || out.some((s) => sizesEqual(s, size))) continue;
      out.push(size);
    }
    return out;
  }

  function configuredColors(items) {
    const out = [];
    let blank = false;
    for (const item of items || []) {
      const color = String(item?.color || "").trim();
      if (!color) {
        blank = true;
        continue;
      }
      if (out.some((c) => colorsEqual(c, color))) continue;
      out.push(color);
    }
    if (!out.length && blank) return [""];
    return out;
  }

  function needsSizePopup(item, family) {
    const rows = (family && family.length ? family : [item]).filter(isActive);
    const sizes = configuredSizes(rows);
    const colors = configuredColors(rows).filter(Boolean);
    if (sizes.length > 1) return true;
    if (colors.length > 1) return true;
    if (!normalizeSize(item?.size) && sizes.length > 0) return true;
    return false;
  }

  function cleanQuery(raw) {
    const B = globalThis.POSBarcode;
    const text = B?.cleanCode ? B.cleanCode(raw) : String(raw || "").trim();
    return String(text || "").trim();
  }

  function codesEqual(a, b) {
    const B = globalThis.POSBarcode;
    if (B?.barcodesEqual) return B.barcodesEqual(a, b);
    const left = String(a || "").trim().toLowerCase();
    const right = String(b || "").trim().toLowerCase();
    return Boolean(left) && left === right;
  }

  function identityMatch(item, query) {
    const q = cleanQuery(query);
    if (!q || !item) return false;
    if (codesEqual(item.barcode, q) || codesEqual(item.code, q) || codesEqual(item.item_barcode, q)) return true;
    return (item.barcodes || []).some((row) => codesEqual(row?.barcode || row, q));
  }

  function scanAction(item, items, opts = {}) {
    if (!item) return { action: "miss" };
    const family = activeFamily(item, items || [item]);
    const mapped = Boolean(opts.barcodeMapped) || identityMatch(item, opts.query);
    if (mapped && normalizeSize(item.size)) return { action: "add", itemId: item.id };
    if (needsSizePopup(item, family)) {
      return {
        action: "popup",
        itemId: item.id,
        color: String(item.color || ""),
        size: mapped ? "" : String(item.size || ""),
      };
    }
    return { action: "add", itemId: item.id };
  }

  function priceOf(item) {
    const n = Number(item?.retail_rate);
    return Number.isFinite(n) ? n : 0;
  }

  function stockOf(item) {
    return Math.max(0, Number(item?.stock_gm) || 0);
  }

  function collapseCatalog(visible, allItems, query) {
    const list = visible || [];
    const universe = allItems && allItems.length ? allItems : list;
    const seen = new Set();
    const out = [];
    for (const item of list) {
      if (!item) continue;
      const key = familyKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      const family = activeFamily(item, universe);
      const inView = list.filter((row) => familyKey(row) === key);
      const matched = inView.filter((row) => identityMatch(row, query));
      if (matched.length === 1) {
        out.push({ kind: "item", item: matched[0] });
        continue;
      }
      if (needsSizePopup(item, family)) {
        const preferred = inView.length === 1 ? inView[0] : null;
        const prices = family.map(priceOf);
        out.push({
          kind: "picker",
          item: preferred || family[0] || item,
          preferredId: preferred?.id || "",
          sizes: configuredSizes(family),
          colors: configuredColors(family).filter(Boolean),
          stock: family.reduce((sum, row) => sum + stockOf(row), 0),
          priceMin: prices.length ? Math.min(...prices) : 0,
          priceMax: prices.length ? Math.max(...prices) : 0,
        });
        continue;
      }
      for (const row of inView) out.push({ kind: "item", item: row });
    }
    return out;
  }

  function searchDecision(hits, allItems, query) {
    const rows = collapseCatalog(hits, allItems, query);
    if (rows.length === 1 && rows[0].kind === "picker") {
      const row = rows[0];
      return {
        action: "popup",
        itemId: row.item.id,
        color: row.preferredId ? String(row.item.color || "") : "",
        size: row.preferredId ? String(row.item.size || "") : "",
      };
    }
    if (rows.length === 1 && rows[0].kind === "item") return { action: "add", itemId: rows[0].item.id };
    return { action: "list", rows };
  }

  function sizesForColor(family, color) {
    return (family || [])
      .filter((item) => isActive(item) && colorsEqual(item.color, color) && normalizeSize(item.size))
      .map((item) => ({
        id: item.id,
        size: normalizeSize(item.size),
        color: String(item.color || "").trim(),
        stock: stockOf(item),
        price: priceOf(item),
        barcode: String(item.barcode || "").trim(),
        code: String(item.code || "").trim(),
        out: stockOf(item) <= 0,
        item,
      }));
  }

  function createPicker(family, opts = {}) {
    const rows = (family || []).filter(isActive);
    const colors = configuredColors(rows);
    const colorList = colors.length ? colors : [""];
    let color = colorList.find((c) => colorsEqual(c, opts.color)) || colorList[0] || "";
    const sizes = sizesForColor(rows, color);
    const wanted = normalizeSize(opts.size);
    const inStock = sizes.find((row) => sizesEqual(row.size, wanted) && !row.out)
      || sizes.find((row) => !row.out)
      || sizes.find((row) => sizesEqual(row.size, wanted))
      || sizes[0]
      || null;
    return {
      family: rows,
      name: String(rows[0]?.name || "Item").trim() || "Item",
      image: String(rows[0]?.image_url || ""),
      wearer: wearerKey(rows[0]),
      colors: colorList,
      color,
      size: inStock?.size || "",
    };
  }

  function pickerSizes(picker) {
    return sizesForColor(picker?.family || [], picker?.color || "");
  }

  function selectedVariant(picker) {
    return pickerSizes(picker).find((row) => sizesEqual(row.size, picker?.size)) || null;
  }

  function selectColor(picker, color) {
    if (!picker) return picker;
    const colors = picker.colors || [];
    picker.color = colors.find((c) => colorsEqual(c, color)) || picker.color;
    const sizes = pickerSizes(picker);
    const keep = sizes.find((row) => sizesEqual(row.size, picker.size) && !row.out);
    picker.size = (keep || sizes.find((row) => !row.out) || sizes[0] || {}).size || "";
    return picker;
  }

  function selectSize(picker, size) {
    if (!picker) return picker;
    const row = pickerSizes(picker).find((entry) => sizesEqual(entry.size, size));
    if (row && !row.out) picker.size = row.size;
    return picker;
  }

  function moveSelection(picker, dir) {
    if (!picker) return picker;
    if (dir === "color-next" || dir === "color-prev") {
      const colors = picker.colors || [];
      if (colors.length > 1) {
        const idx = colors.findIndex((c) => colorsEqual(c, picker.color));
        const step = dir === "color-next" ? 1 : -1;
        const next = colors[(idx + step + colors.length) % colors.length];
        selectColor(picker, next);
      }
      return picker;
    }
    const sizes = pickerSizes(picker).filter((row) => !row.out);
    const list = sizes.length ? sizes : pickerSizes(picker);
    if (!list.length) return picker;
    const idx = list.findIndex((row) => sizesEqual(row.size, picker.size));
    const step = dir === "size-prev" ? -1 : 1;
    const next = list[(idx + step + list.length) % list.length];
    if (next && !next.out) picker.size = next.size;
    return picker;
  }

  function clampSaleQty(stock, cartQty, want) {
    const max = Math.max(0, Math.round(Number(stock) || 0) - Math.max(0, Math.round(Number(cartQty) || 0)));
    const qty = Math.max(0, Math.round(Number(want) || 0));
    return Math.min(qty, max);
  }

  function cartCaption(item) {
    const name = String(item?.name || "Item").trim() || "Item";
    const bits = [name];
    const color = String(item?.color || "").trim();
    const size = sizeLabel(item?.size);
    if (color) bits.push(color);
    if (size) bits.push(`Size ${size}`);
    return bits.join(" – ");
  }

  function invoiceNote(line) {
    const color = String(line?.color || "").trim();
    const size = sizeLabel(line?.size);
    if (!color && !size) return "";
    const name = String(line?.item_name || line?.name || "");
    const folded = name.toLowerCase();
    const bits = [];
    if (color && !folded.includes(color.toLowerCase())) bits.push(color);
    const sizeFold = String(size || "").toLowerCase();
    if (sizeFold && !folded.includes(sizeFold) && !folded.includes(`sz ${sizeFold}`)) bits.push(`Size ${size}`);
    return bits.join(" · ");
  }

  function parseColors(raw) {
    if (Array.isArray(raw)) {
      return [...new Set(raw.map((c) => String(c || "").trim()).filter(Boolean))];
    }
    return [...new Set(String(raw || "").split(/[,/|]+/).map((c) => c.trim()).filter(Boolean))];
  }

  function draftFromItems(items, anchor) {
    const family = activeFamily(anchor, items || []);
    const sizes = configuredSizes(family.length ? family : [anchor].filter(Boolean));
    const colors = configuredColors(family.length ? family : [anchor].filter(Boolean)).filter(Boolean);
    const cells = {};
    for (const item of family) {
      const size = normalizeSize(item.size);
      if (!size) continue;
      cells[cellKey(item.color, size)] = {
        id: item.id,
        barcode: String(item.barcode || "").trim(),
        code: String(item.code || "").trim(),
        stock_gm: stockOf(item),
        retail_rate: item.retail_rate == null || item.retail_rate === "" ? "" : Number(item.retail_rate),
      };
    }
    return {
      colorsText: colors.join(", "),
      sizes,
      cells,
    };
  }

  function rowsFromDraft(draft) {
    const colors = parseColors(draft?.colorsText);
    const colorList = colors.length ? colors : [""];
    const rows = [];
    for (const color of colorList) {
      for (const size of draft?.sizes || []) {
        const norm = normalizeSize(size);
        if (!norm) continue;
        const cell = draft?.cells?.[cellKey(color, norm)] || {};
        const price = cell.retail_rate;
        rows.push({
          id: String(cell.id || ""),
          size: norm,
          color: String(color || "").trim(),
          barcode: String(cell.barcode || "").trim(),
          code: String(cell.code || "").trim(),
          stock_gm: Math.max(0, Math.round(Number(cell.stock_gm) || 0)),
          retail_rate: price === "" || price == null ? null : Number(price),
        });
      }
    }
    return rows;
  }

  function normalizeVariants(rows) {
    const out = [];
    const seen = new Set();
    const barcodes = new Set();
    for (const raw of rows || []) {
      const size = normalizeSize(raw?.size);
      if (!size) continue;
      const color = String(raw?.color || "").trim();
      const key = cellKey(color, size);
      if (seen.has(key)) throw new Error(`Duplicate variant ${color ? `${color} ` : ""}${size}`);
      seen.add(key);
      const barcode = String(raw?.barcode || "").trim();
      if (barcode) {
        const bk = barcode.toLowerCase();
        if (barcodes.has(bk)) throw new Error(`Duplicate barcode ${barcode}`);
        barcodes.add(bk);
      }
      let retail = raw?.retail_rate;
      if (retail === "" || retail == null) retail = null;
      else {
        retail = Number(retail);
        if (!Number.isFinite(retail) || retail < 0) throw new Error(`Invalid price for ${size}`);
      }
      const stock = Math.max(0, Math.round(Number(raw?.stock_gm ?? raw?.stock) || 0));
      out.push({
        id: String(raw?.id || "").trim(),
        size,
        color,
        barcode,
        code: String(raw?.code || "").trim().slice(0, 64),
        stock_gm: stock,
        retail_rate: retail,
      });
    }
    if (!out.length) throw new Error("Choose at least one size");
    return out;
  }

  return {
    familyKey,
    activeFamily,
    configuredSizes,
    configuredColors,
    needsSizePopup,
    identityMatch,
    scanAction,
    collapseCatalog,
    searchDecision,
    createPicker,
    pickerSizes,
    selectedVariant,
    selectColor,
    selectSize,
    moveSelection,
    clampSaleQty,
    cartCaption,
    invoiceNote,
    parseColors,
    draftFromItems,
    rowsFromDraft,
    normalizeVariants,
    cellKey,
  };
});
