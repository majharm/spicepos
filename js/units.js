(function (root, factory) {
  const api = factory();
  root.POSUnits = api;
  if (typeof window !== "undefined") window.POSUnits = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TYPES = [
    { code: "GM", label: "Grams (g)", family: "weight", rateSuffix: "/kg", stockSuffix: "g", step: 100, receive: 1000 },
    { code: "KG", label: "Kilogram (kg)", family: "weight", rateSuffix: "/kg", stockSuffix: "kg", step: 100, receive: 1000, displayDiv: 1000 },
    { code: "ML", label: "Millilitre (ml)", family: "volume", rateSuffix: "/ltr", stockSuffix: "ml", step: 100, receive: 1000 },
    { code: "LTR", label: "Litre (L)", family: "volume", rateSuffix: "/ltr", stockSuffix: "L", step: 100, receive: 1000, displayDiv: 1000 },
    { code: "PCS", label: "Quantity (pcs)", family: "count", rateSuffix: "/pc", stockSuffix: "pcs", step: 1, receive: 1 },
  ];

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
    return TYPES.find((t) => t.code === c) || TYPES[0];
  }

  function normalize(raw) {
    const key = String(raw || "GM").trim().toUpperCase().replace(/[^A-Z]/g, "");
    return ALIAS[key] || "GM";
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
    if (t.family === "count") return "+1 pc";
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
    if (t.family === "count") return `${n} pcs`;
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
