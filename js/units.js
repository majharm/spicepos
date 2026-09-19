(function (root, factory) {
  const api = factory();
  root.POSUnits = api;
  if (typeof window !== "undefined") window.POSUnits = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FAMILIES = [
    { id: "count", label: "Quantity / general", rateSuffix: "/pc", stockSuffix: "pcs", receive: 1 },
    { id: "weight", label: "Weight", rateSuffix: "/kg", stockSuffix: "g", receive: 1000 },
    { id: "length", label: "Length", rateSuffix: "/m", stockSuffix: "m", receive: 1 },
    { id: "area", label: "Area", rateSuffix: "/sqm", stockSuffix: "sqm", receive: 1 },
    { id: "volume", label: "Volume / liquid", rateSuffix: "/ltr", stockSuffix: "ml", receive: 1000 },
    { id: "time", label: "Time / service", rateSuffix: "/hr", stockSuffix: "hrs", receive: 1 },
  ];

  function u(group, code, name, family, extra = {}) {
    const fam = FAMILIES.find((f) => f.id === family) || FAMILIES[0];
    const countLike = family !== "weight" && family !== "volume";
    return {
      group,
      code,
      name,
      label: name,
      family,
      rate_suffix: extra.rate || fam.rateSuffix,
      stock_suffix: extra.stock || fam.stockSuffix,
      rateSuffix: extra.rate || fam.rateSuffix,
      stockSuffix: extra.stock || fam.stockSuffix,
      step: 1,
      receive: extra.receive != null ? extra.receive : countLike ? 1 : fam.receive,
      receive_qty: extra.receive != null ? extra.receive : countLike ? 1 : fam.receive,
      displayDiv: extra.div || 1,
      display_div: extra.div || 1,
      sort_order: extra.sort || 0,
    };
  }

  let n = 0;
  const next = () => {
    n += 1;
    return n;
  };

  const CATALOG = [
    u("Quantity / General", "PCS", "Piece", "count", { rate: "/pc", stock: "pcs", sort: next() }),
    u("Quantity / General", "NOS", "Number", "count", { rate: "/no", stock: "nos", sort: next() }),
    u("Quantity / General", "UNT", "Unit", "count", { rate: "/unit", stock: "units", sort: next() }),
    u("Quantity / General", "PR", "Pair", "count", { rate: "/pr", stock: "pr", sort: next() }),
    u("Quantity / General", "SET", "Set", "count", { rate: "/set", stock: "set", sort: next() }),
    u("Quantity / General", "DOZ", "Dozen", "count", { rate: "/doz", stock: "doz", sort: next() }),
    u("Quantity / General", "GRS", "Gross", "count", { rate: "/grs", stock: "grs", sort: next() }),
    u("Quantity / General", "HDOZ", "Half Dozen", "count", { rate: "/hdoz", stock: "hdoz", sort: next() }),

    u("Weight", "MG", "Milligram", "count", { rate: "/mg", stock: "mg", sort: next() }),
    u("Weight", "G", "Gram", "weight", { rate: "/kg", stock: "g", receive: 1000, sort: next() }),
    u("Weight", "GM", "Grams (g)", "weight", { rate: "/kg", stock: "g", receive: 1000, sort: next() }),
    u("Weight", "KG", "Kilogram", "weight", { rate: "/kg", stock: "kg", receive: 1000, div: 1000, sort: next() }),
    u("Weight", "QTL", "Quintal", "count", { rate: "/qtl", stock: "qtl", sort: next() }),
    u("Weight", "TON", "Metric Ton", "count", { rate: "/ton", stock: "ton", sort: next() }),
    u("Weight", "LB", "Pound", "count", { rate: "/lb", stock: "lb", sort: next() }),
    u("Weight", "OZ", "Ounce", "count", { rate: "/oz", stock: "oz", sort: next() }),

    u("Length", "MM", "Millimeter", "length", { rate: "/mm", stock: "mm", sort: next() }),
    u("Length", "CM", "Centimeter", "length", { rate: "/cm", stock: "cm", sort: next() }),
    u("Length", "M", "Meter", "length", { rate: "/m", stock: "m", sort: next() }),
    u("Length", "KM", "Kilometer", "length", { rate: "/km", stock: "km", sort: next() }),
    u("Length", "IN", "Inch", "length", { rate: "/in", stock: "in", sort: next() }),
    u("Length", "FT", "Foot", "length", { rate: "/ft", stock: "ft", sort: next() }),
    u("Length", "YD", "Yard", "length", { rate: "/yd", stock: "yd", sort: next() }),
    u("Length", "MI", "Mile", "length", { rate: "/mi", stock: "mi", sort: next() }),

    u("Area", "SQMM", "Square Millimeter", "area", { rate: "/sqmm", stock: "sqmm", sort: next() }),
    u("Area", "SQCM", "Square Centimeter", "area", { rate: "/sqcm", stock: "sqcm", sort: next() }),
    u("Area", "SQM", "Square Meter", "area", { rate: "/sqm", stock: "sqm", sort: next() }),
    u("Area", "SQIN", "Square Inch", "area", { rate: "/sqin", stock: "sqin", sort: next() }),
    u("Area", "SQFT", "Square Foot", "area", { rate: "/sqft", stock: "sqft", sort: next() }),
    u("Area", "SQYD", "Square Yard", "area", { rate: "/sqyd", stock: "sqyd", sort: next() }),
    u("Area", "ACRE", "Acre", "area", { rate: "/acre", stock: "acre", sort: next() }),
    u("Area", "HA", "Hectare", "area", { rate: "/ha", stock: "ha", sort: next() }),

    u("Volume / Liquid", "ML", "Millilitre", "volume", { rate: "/ltr", stock: "ml", receive: 1000, sort: next() }),
    u("Volume / Liquid", "L", "Litre", "volume", { rate: "/ltr", stock: "L", receive: 1000, div: 1000, sort: next() }),
    u("Volume / Liquid", "LTR", "Litre (L)", "volume", { rate: "/ltr", stock: "L", receive: 1000, div: 1000, sort: next() }),
    u("Volume / Liquid", "KL", "Kilolitre", "count", { rate: "/kl", stock: "kl", sort: next() }),
    u("Volume / Liquid", "CC", "Cubic Centimeter", "count", { rate: "/cc", stock: "cc", sort: next() }),
    u("Volume / Liquid", "CBM", "Cubic Meter", "count", { rate: "/cbm", stock: "cbm", sort: next() }),
    u("Volume / Liquid", "CFT", "Cubic Foot", "count", { rate: "/cft", stock: "cft", sort: next() }),
    u("Volume / Liquid", "GAL", "Gallon", "count", { rate: "/gal", stock: "gal", sort: next() }),

    u("Packaging", "BOX", "Box", "count", { rate: "/box", stock: "box", sort: next() }),
    u("Packaging", "CTN", "Carton", "count", { rate: "/ctn", stock: "ctn", sort: next() }),
    u("Packaging", "PKT", "Packet", "count", { rate: "/pkt", stock: "pkt", sort: next() }),
    u("Packaging", "PACK", "Pack", "count", { rate: "/pack", stock: "pack", sort: next() }),
    u("Packaging", "BAG", "Bag", "count", { rate: "/bag", stock: "bag", sort: next() }),
    u("Packaging", "BTL", "Bottle", "count", { rate: "/btl", stock: "btl", sort: next() }),
    u("Packaging", "JAR", "Jar", "count", { rate: "/jar", stock: "jar", sort: next() }),
    u("Packaging", "CAN", "Can", "count", { rate: "/can", stock: "can", sort: next() }),
    u("Packaging", "TIN", "Tin", "count", { rate: "/tin", stock: "tin", sort: next() }),
    u("Packaging", "TUBE", "Tube", "count", { rate: "/tube", stock: "tube", sort: next() }),
    u("Packaging", "PCH", "Pouch", "count", { rate: "/pch", stock: "pch", sort: next() }),
    u("Packaging", "BDL", "Bundle", "count", { rate: "/bdl", stock: "bdl", sort: next() }),
    u("Packaging", "ROLL", "Roll", "count", { rate: "/roll", stock: "roll", sort: next() }),
    u("Packaging", "CASE", "Case", "count", { rate: "/case", stock: "case", sort: next() }),
    u("Packaging", "CRT", "Crate", "count", { rate: "/crt", stock: "crt", sort: next() }),
    u("Packaging", "DRM", "Drum", "count", { rate: "/drm", stock: "drm", sort: next() }),
    u("Packaging", "BKT", "Bucket", "count", { rate: "/bkt", stock: "bkt", sort: next() }),
    u("Packaging", "SACK", "Sack", "count", { rate: "/sack", stock: "sack", sort: next() }),

    u("Pharmacy", "TAB", "Tablet", "count", { rate: "/tab", stock: "tab", sort: next() }),
    u("Pharmacy", "CAP", "Capsule", "count", { rate: "/cap", stock: "cap", sort: next() }),
    u("Pharmacy", "STRIP", "Strip", "count", { rate: "/strip", stock: "strip", sort: next() }),
    u("Pharmacy", "VIAL", "Vial", "count", { rate: "/vial", stock: "vial", sort: next() }),
    u("Pharmacy", "AMP", "Ampoule", "count", { rate: "/amp", stock: "amp", sort: next() }),
    u("Pharmacy", "INJ", "Injection", "count", { rate: "/inj", stock: "inj", sort: next() }),
    u("Pharmacy", "SACHET", "Sachet", "count", { rate: "/sachet", stock: "sachet", sort: next() }),
    u("Pharmacy", "DROP", "Dropper", "count", { rate: "/drop", stock: "drop", sort: next() }),
    u("Pharmacy", "INH", "Inhaler", "count", { rate: "/inh", stock: "inh", sort: next() }),
    u("Pharmacy", "SPRAY", "Spray", "count", { rate: "/spray", stock: "spray", sort: next() }),
    u("Pharmacy", "KIT", "Kit", "count", { rate: "/kit", stock: "kit", sort: next() }),

    u("Restaurant / Food", "PLT", "Plate", "count", { rate: "/plt", stock: "plt", sort: next() }),
    u("Restaurant / Food", "PORT", "Portion", "count", { rate: "/port", stock: "port", sort: next() }),
    u("Restaurant / Food", "SRV", "Serving", "count", { rate: "/srv", stock: "srv", sort: next() }),
    u("Restaurant / Food", "BOWL", "Bowl", "count", { rate: "/bowl", stock: "bowl", sort: next() }),
    u("Restaurant / Food", "CUP", "Cup", "count", { rate: "/cup", stock: "cup", sort: next() }),
    u("Restaurant / Food", "GLS", "Glass", "count", { rate: "/gls", stock: "gls", sort: next() }),

    u("Service", "HR", "Hour", "time", { rate: "/hr", stock: "hrs", sort: next() }),
    u("Service", "DAY", "Day", "time", { rate: "/day", stock: "days", sort: next() }),
    u("Service", "WEEK", "Week", "time", { rate: "/week", stock: "weeks", sort: next() }),
    u("Service", "MONTH", "Month", "time", { rate: "/month", stock: "months", sort: next() }),
    u("Service", "YEAR", "Year", "time", { rate: "/year", stock: "years", sort: next() }),
    u("Service", "VISIT", "Visit", "time", { rate: "/visit", stock: "visits", sort: next() }),
    u("Service", "JOB", "Job", "time", { rate: "/job", stock: "jobs", sort: next() }),
    u("Service", "SERVICE", "Service", "time", { rate: "/svc", stock: "svc", sort: next() }),
    u("Service", "SESSION", "Session", "time", { rate: "/session", stock: "sessions", sort: next() }),
    u("Service", "PROJECT", "Project", "time", { rate: "/project", stock: "projects", sort: next() }),
    u("Service", "CONSULT", "Consultation", "time", { rate: "/consult", stock: "consults", sort: next() }),
    u("Service", "APPT", "Appointment", "time", { rate: "/appt", stock: "appts", sort: next() }),
  ];

  const DEFAULT_TYPES = CATALOG.map((t) => ({
    code: t.code,
    label: t.label,
    family: t.family,
    rateSuffix: t.rateSuffix,
    stockSuffix: t.stockSuffix,
    step: 1,
    receive: t.receive,
    displayDiv: t.displayDiv > 1 ? t.displayDiv : undefined,
    group: t.group,
  }));
  const TYPES = DEFAULT_TYPES.map((t) => ({ ...t }));

  const ALIAS = {
    GRAM: "G",
    GRAMS: "G",
    KILO: "KG",
    KILOGRAM: "KG",
    MILLILITRE: "ML",
    MILLILITER: "ML",
    LITRE: "L",
    LITER: "L",
    PC: "PCS",
    QTY: "PCS",
    PAIR: "PR",
    PIECE: "PCS",
    PIECES: "PCS",
    TABLET: "TAB",
    CAPSULE: "CAP",
    HOUR: "HR",
    HOURS: "HR",
  };

  function typeOf(code) {
    const c = normalize(code);
    const found = TYPES.find((t) => t.code === c);
    if (found) return found;
    const d = familyDefaults("count");
    return { code: c || "PCS", label: c || "PCS", family: "count", rateSuffix: d.rateSuffix, stockSuffix: d.stockSuffix, step: d.step, receive: d.receive };
  }

  function normalize(raw) {
    const key = String(raw || "PCS").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (ALIAS[key]) return ALIAS[key];
    if (TYPES.some((t) => t.code === key)) return key;
    return key || "PCS";
  }

  function familyDefaults(family) {
    const fam = FAMILIES.find((f) => f.id === family);
    if (fam) return { rateSuffix: fam.rateSuffix, stockSuffix: fam.stockSuffix, step: 1, receive: fam.receive };
    return { rateSuffix: "/pc", stockSuffix: "pcs", step: 1, receive: 1 };
  }

  const ALLOWED_FAMILIES = FAMILIES.map((f) => f.id);

  function hydrate(rows) {
    TYPES.splice(0, TYPES.length, ...DEFAULT_TYPES.map((t) => ({ ...t })));
    if (!Array.isArray(rows)) return TYPES.slice();
    for (const r of rows) {
      const code = String(r.code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!code) continue;
      const famRaw = String(r.family || "").toLowerCase();
      const family = ALLOWED_FAMILIES.includes(famRaw) ? famRaw : "count";
      const d = familyDefaults(family);
      const rec = {
        code,
        label: String(r.name || r.label || code),
        family,
        group: r.group || CATALOG.find((c) => c.code === code)?.group || (family === "count" ? "Quantity / General" : famRaw),
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
    const f = typeOf(code).family;
    return f !== "weight" && f !== "volume";
  }

  const QTY_MIN = 1;
  const QTY_MAX = 1000000000;

  function qtyMin() {
    return QTY_MIN;
  }

  function qtyMax() {
    return QTY_MAX;
  }

  function clampQty(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v < QTY_MIN) return 0;
    return Math.min(QTY_MAX, Math.round(v));
  }

  function counterStep(code) {
    const t = typeOf(code);
    if (t.displayDiv > 1) return t.displayDiv;
    return 1;
  }

  function qtySuffix(code) {
    return typeOf(code).stockSuffix || "pcs";
  }

  function displayQty(qty, code) {
    const n = fromBase(qty, code);
    if (!Number.isFinite(n)) return 0;
    if (Math.abs(n - Math.round(n)) < 1e-9) return Math.round(n);
    return parseFloat(n.toFixed(3));
  }

  function step(code) {
    return typeOf(code).step;
  }

  function receiveQty(code) {
    return typeOf(code).receive;
  }

  function receiveLabel(code) {
    const t = typeOf(code);
    if (t.family === "volume") return "+1 L";
    if (t.family === "weight") return "+1 kg";
    const s = t.stockSuffix || "pc";
    return `+1 ${s === "pcs" ? "pc" : s}`;
  }

  function itemUnit(item) {
    if (item == null) return normalize("PCS");
    if (typeof item === "string") return normalize(item);
    return normalize(item.base_unit || item.unit);
  }

  function rateSuffix(code) {
    return typeOf(code).rateSuffix;
  }

  function formatQty(qty, code) {
    const n = Number(qty) || 0;
    const t = typeOf(code);
    if (t.family !== "weight" && t.family !== "volume") return `${displayQty(n, t.code)} ${t.stockSuffix || "pcs"}`;
    if (t.displayDiv > 1) return `${displayQty(n, t.code)} ${t.stockSuffix}`;
    if (t.family === "volume") return `${n} ml`;
    if ((t.code === "GM" || t.code === "G") && n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 2)} kg`;
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
    const groups = [];
    const seen = new Set();
    for (const t of TYPES) {
      const g = t.group || "Other";
      if (!seen.has(g)) {
        seen.add(g);
        groups.push(g);
      }
    }
    return groups
      .map((g) => {
        const opts = TYPES.filter((t) => (t.group || "Other") === g)
          .map((t) => `<option value="${t.code}"${t.code === cur ? " selected" : ""}>${t.label} (${t.code})</option>`)
          .join("");
        return `<optgroup label="${g}">${opts}</optgroup>`;
      })
      .join("");
  }

  function groupOf(code) {
    return typeOf(code).group || CATALOG.find((c) => c.code === normalize(code))?.group || "";
  }

  return {
    TYPES,
    CATALOG,
    FAMILIES,
    hydrate,
    familyDefaults,
    normalize,
    typeOf,
    isCount,
    qtyMin,
    qtyMax,
    clampQty,
    counterStep,
    qtySuffix,
    displayQty,
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
    groupOf,
  };
});
