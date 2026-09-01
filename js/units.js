(function (root, factory) {
  const api = factory();
  root.POSUnits = api;
  if (typeof window !== "undefined") window.POSUnits = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_TYPES = [
    { code: "GM", label: "Grams (g)", family: "weight", rateSuffix: "/kg", stockSuffix: "g", step: 100, receive: 1000 },
    { code: "KG", label: "Kilogram (kg)", family: "weight", rateSuffix: "/kg", stockSuffix: "kg", step: 100, receive: 1000, displayDiv: 1000 },
    { code: "ML", label: "Millilitre (ml)", family: "volume", rateSuffix: "/ltr", stockSuffix: "ml", step: 100, receive: 1000 },
    { code: "LTR", label: "Litre (L)", family: "volume", rateSuffix: "/ltr", stockSuffix: "L", step: 100, receive: 1000, displayDiv: 1000 },
    { code: "PCS", label: "Quantity (pcs)", family: "count", rateSuffix: "/pc", stockSuffix: "pcs", step: 1, receive: 1 },
  ];
  const TYPES = DEFAULT_TYPES.map((t) => ({ ...t }));

  const ALIAS = {
    G: "GM",
    GRAM: "GM",
    GRAMS: "GM",
    GM: "GM",
    KG: "KG",
    KILO: "KG",
    KILOGRAM: "KG",
    ML: "ML",
    MILLILITRE: "ML",
    MILLILITER: "ML",
    L: "LTR",
    LTR: "LTR",
    LITRE: "LTR",
    LITER: "LTR",
    PCS: "PCS",
    PC: "PCS",
    QTY: "PCS",
    NOS: "PCS",
    NO: "PCS",
    COUNT: "PCS",
    UNIT: "PCS",
    UNITS: "PCS",
  };

  function typeOf(code) {
    const c = normalize(code);
    const found = TYPES.find((t) => t.code === c);
    if (found) return found;
    const d = familyDefaults("count");
    return { code: c || "GM", label: c || "GM", family: "count", rateSuffix: d.rateSuffix, stockSuffix: d.stockSuffix, step: d.step, receive: d.receive };
  }

  function normalize(raw) {
    const key = String(raw || "GM").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (ALIAS[key]) return ALIAS[key];
    if (TYPES.some((t) => t.code === key)) return key;
    return key || "GM";
  }

  function familyDefaults(family) {
    if (family === "volume") return { rateSuffix: "/ltr", stockSuffix: "ml", step: 100, receive: 1000 };
    if (family === "count") return { rateSuffix: "/pc", stockSuffix: "pcs", step: 1, receive: 1 };
    return { rateSuffix: "/kg", stockSuffix: "g", step: 100, receive: 1000 };
  }

  function hydrate(rows) {
    TYPES.splice(0, TYPES.length, ...DEFAULT_TYPES.map((t) => ({ ...t })));
    if (!Array.isArray(rows)) return TYPES.slice();
    for (const r of rows) {
      const code = String(r.code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!code) continue;
      const family = ["weight", "volume", "count"].includes(String(r.family || "").toLowerCase())
        ? String(r.family).toLowerCase()
        : "count";
      const d = familyDefaults(family);
      const rec = {
        code,
        label: String(r.name || r.label || code),
        family,
        rateSuffix: r.rate_suffix || r.rateSuffix || d.rateSuffix,
        stockSuffix: r.stock_suffix || r.stockSuffix || d.stockSuffix,
        step: Number(r.step) > 0 ? Number(r.step) : d.step,
        receive: Number(r.receive_qty || r.receive) > 0 ? Number(r.receive_qty || r.receive) : d.receive,
      };
      const div = Number(r.display_div || r.displayDiv);
      if (div > 1) rec.displayDiv = div;
      const idx = TYPES.findIndex((t) => t.code === code);
      if (idx >= 0) TYPES[idx] = { ...TYPES[idx], ...rec };
      else TYPES.push(rec);
    }
    return TYPES.slice();
  }

  function isCount(code) {
    return typeOf(code).family === "count";
  }

  function step(code) {
    return typeOf(code).step;
  }

  function receiveQty(code) {
    return typeOf(code).receive;
  }

  function receiveLabel(code) {
    const t = typeOf(code);
    if (t.family === "count") {
      const s = t.stockSuffix || "pc";
      return `+1 ${s === "pcs" ? "pc" : s}`;
    }
    if (t.family === "volume") return "+1 L";
    return "+1 kg";
  }

  function itemUnit(item) {
    if (item == null) return normalize("GM");
    if (typeof item === "string") return normalize(item);
    return normalize(item.base_unit || item.unit);
  }

  function rateSuffix(code) {
    return typeOf(code).rateSuffix;
  }

  function formatQty(qty, code) {
    const n = Number(qty) || 0;
    const t = typeOf(code);
    if (t.family === "count") return `${n} ${t.stockSuffix || "pcs"}`;
    if (t.code === "KG" || (t.family === "weight" && n >= 1000 && t.code !== "GM")) {
      return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 2)} kg`;
    }
    if (t.code === "LTR" || (t.family === "volume" && n >= 1000 && t.code !== "ML")) {
      return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 2)} L`;
    }
    if (t.family === "volume") return `${n} ml`;
    if (t.code === "GM" && n >= 1000) return `${(n / 1000).toFixed(2)} kg`;
    return `${n} g`;
  }

  function fromBase(qty, code) {
    const t = typeOf(code);
    const n = Number(qty) || 0;
    if (t.displayDiv) return n / t.displayDiv;
    return n;
  }

  function toBase(qty, code) {
    const t = typeOf(code);
    const n = Number(qty) || 0;
    if (t.displayDiv) return n * t.displayDiv;
    return n;
  }

  function stockLabel(code) {
    return `Stock (${typeOf(code).stockSuffix})`;
  }

  function rateLabel(prefix, code) {
    return `${prefix} ₹${typeOf(code).rateSuffix}`;
  }

  function lineAmount(qty, rate, code) {
    const q = Number(qty) || 0;
    const r = Number(rate) || 0;
    if (isCount(code)) return q * r;
    return (q / 1000) * r;
  }

  function optionsHtml(selected) {
    const cur = normalize(selected);
    return TYPES.map((t) => `<option value="${t.code}"${t.code === cur ? " selected" : ""}>${t.label}</option>`).join("");
  }

  return {
    TYPES,
    hydrate,
    familyDefaults,
    normalize,
    typeOf,
    isCount,
    step,
    receiveQty,
    receiveLabel,
    itemUnit,
    rateSuffix,
    formatQty,
    fromBase,
    toBase,
    stockLabel,
    rateLabel,
    lineAmount,
    optionsHtml,
  };
});
