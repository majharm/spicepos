(function (root, factory) {
  const api = factory();
  root.POSUnitConvert = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PACK_CODES = new Set([
    "BOX", "CTN", "CARTON", "PKT", "PACKET", "PACK", "BAG", "CASE", "DOZ", "TIN", "JAR", "ROLL", "SET",
  ]);
  const MEASURE_CODES = new Set(["GM", "KG", "MG", "LTR", "ML", "M", "CM", "MM", "FT", "IN", "SQM", "SQFT"]);
  const PIECE_CODES = new Set(["PCS", "PC", "PIECE", "PIECES", "NOS", "UNT", "UNIT", "QTY"]);

  function norm(code) {
    return String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function round3(n) {
    return Math.round((Number(n) || 0) * 1000) / 1000;
  }

  function baseCode(item) {
    const code = norm(item?.base_unit || item?.unit || "PCS");
    if (!code || PIECE_CODES.has(code)) return "PCS";
    return code;
  }

  function isMeasure(item) {
    return MEASURE_CODES.has(norm(item?.base_unit || item?.unit || ""));
  }

  function factor(item, unit) {
    const base = baseCode(item);
    const u = norm(unit || base);
    if (!u || u === base || PIECE_CODES.has(u)) return 1;
    const pack = norm(item?.pack_unit);
    const upp = Math.floor(Number(item?.units_per_pack) || 0);
    if (upp > 1 && pack && u === pack) return upp;
    return 1;
  }

  function storesBasePieces(item) {
    if (globalThis.POSFootwear?.isStripLooseItem?.(item)) return false;
    if (isMeasure(item)) return false;
    const pack = norm(item?.pack_unit);
    const upp = Math.floor(Number(item?.units_per_pack) || 0);
    if (upp <= 1 || !PACK_CODES.has(pack)) return false;
    if (norm(item?.pack_unit) === "STRIP") return false;
    return true;
  }

  function toBase(qty, conversion) {
    const q = Number(qty) || 0;
    const f = Number(conversion);
    const factorN = Number.isFinite(f) && f > 0 ? f : 1;
    return round3(q * factorN);
  }

  function saleDeduction(qty, unit, item) {
    return toBase(qty, factor(item, unit));
  }

  function purchaseUnits(item) {
    const base = baseCode(item);
    const list = [{ code: base, name: base === "PCS" ? "Piece" : base, factor: 1 }];
    const seen = new Set([base]);
    const add = (code, name, fallback) => {
      const u = norm(code);
      if (!u || seen.has(u) || PIECE_CODES.has(u)) return;
      seen.add(u);
      const known = factor(item, u);
      list.push({ code: u, name: name || u, factor: known > 1 ? known : (Number(fallback) > 1 ? Number(fallback) : 1) });
    };
    if (item?.pack_unit) add(item.pack_unit, item.pack_unit, item.units_per_pack);
    add("BOX", "Box", item?.units_per_pack);
    add("PKT", "Packet", 1);
    add("CTN", "Carton", 1);
    return list;
  }

  function saleUnits(item) {
    const base = baseCode(item);
    const units = [{ code: base, name: base === "PCS" ? "Piece" : base, factor: 1 }];
    if (!storesBasePieces(item)) return units;
    const pack = norm(item.pack_unit);
    const f = factor(item, pack);
    if (f > 1) units.unshift({ code: pack, name: String(item.pack_unit || pack), factor: f });
    return units;
  }

  function resolvePurchase(line) {
    const rawQty = line?.purchase_qty;
    const hasPurchase = rawQty != null && rawQty !== "" && Number.isFinite(Number(rawQty));
    const convRaw = Number(line?.conversion);
    const conv = Number.isFinite(convRaw) && convRaw > 0 ? convRaw : 1;
    if (hasPurchase) {
      const bill = Number(rawQty) || 0;
      const freeBill = Math.max(0, Number(line?.free_qty) || 0);
      return {
        billQty: bill,
        stockQty: toBase(bill, conv),
        freeStock: toBase(freeBill, conv),
        conversion: conv,
        purchaseUnit: String(line?.purchase_unit || "").trim().slice(0, 32),
        purchaseQty: bill,
      };
    }
    const stock = Number(line?.quantity_gm) || 0;
    return {
      billQty: stock,
      stockQty: stock,
      freeStock: Math.max(0, Number(line?.free_qty) || 0),
      conversion: 1,
      purchaseUnit: "",
      purchaseQty: stock,
    };
  }

  function shouldRememberPack(item, unit, conversion) {
    const conv = Number(conversion) || 0;
    const code = norm(unit);
    if (conv <= 1 || !PACK_CODES.has(code)) return false;
    if (isMeasure(item)) return false;
    if (norm(item?.pack_unit) === "STRIP") return false;
    if (globalThis.POSFootwear?.isStripLooseItem?.(item)) return false;
    if (storesBasePieces(item)) return false;
    return true;
  }

  function isSharedProductBarcode(item, code) {
    const left = String(code || "").trim();
    const right = String(item?.barcode || "").trim();
    if (!left || !right) return false;
    return left === right;
  }

  return {
    PACK_CODES,
    norm,
    round3,
    baseCode,
    factor,
    storesBasePieces,
    toBase,
    saleDeduction,
    purchaseUnits,
    saleUnits,
    resolvePurchase,
    shouldRememberPack,
    isSharedProductBarcode,
  };
});
