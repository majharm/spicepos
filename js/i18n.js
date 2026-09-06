/** Central Indian i18n. Missing locale text falls back to English, never to the raw key. */
(function (global) {
  const FALLBACK = "en";
  const LOCALES = [
    { code: "en", name: "English", native: "English", dir: "ltr" },
    { code: "hi", name: "Hindi", native: "\u0939\u093f\u0928\u094d\u0926\u0940", dir: "ltr" },
    { code: "mr", name: "Marathi", native: "\u092e\u0930\u093e\u0920\u0940", dir: "ltr" },
    { code: "gu", name: "Gujarati", native: "\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0", dir: "ltr" },
    { code: "bn", name: "Bengali", native: "\u09ac\u09be\u0982\u09b2\u09be", dir: "ltr" },
    { code: "ta", name: "Tamil", native: "\u0ba4\u0bae\u0bbf\u0bb4\u0bcd", dir: "ltr" },
    { code: "te", name: "Telugu", native: "\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41", dir: "ltr" },
    { code: "kn", name: "Kannada", native: "\u0c95\u0ca8\u0ccd\u0ca8\u0ca1", dir: "ltr" },
    { code: "ml", name: "Malayalam", native: "\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02", dir: "ltr" },
    { code: "pa", name: "Punjabi", native: "\u0a2a\u0a70\u0a1c\u0a3e\u0a2c\u0a40", dir: "ltr" },
    { code: "or", name: "Odia", native: "\u0b13\u0b21\u0b3c\u0b3f\u0b06", dir: "ltr" },
    { code: "as", name: "Assamese", native: "\u0985\u09b8\u09ae\u09c0\u09af\u09bc\u09be", dir: "ltr" },
    { code: "ur", name: "Urdu", native: "\u0627\u0631\u062f\u0648", dir: "rtl" },
  ];
  const codes = LOCALES.map((l) => l.code);
  const STRINGS = global.__POS_I18N_STRINGS || {};

  let current = FALLBACK;
  let invoiceMode = "shop";
  let overrides = {};

  function normalizeLocale(raw) {
    const s = String(raw || "").trim().toLowerCase().replace(/_/g, "-");
    if (!s || s === "shop" || s === "default") return "";
    const base = s.split("-")[0];
    if (codes.includes(base)) return base;
    if (s.startsWith("en")) return "en";
    return "";
  }

  function localeInfo(code) {
    return LOCALES.find((l) => l.code === code) || LOCALES[0];
  }

  function resolveLocale(opts) {
    const o = opts || {};
    return (
      normalizeLocale(o.customer) ||
      normalizeLocale(o.user) ||
      normalizeLocale(o.shop) ||
      normalizeLocale(o.platform) ||
      FALLBACK
    );
  }

  function interpolate(text, vars) {
    if (!vars || typeof vars !== "object") return text;
    return String(text).replace(/\{(\w+)\}/g, (_, name) => (vars[name] == null ? "" : String(vars[name])));
  }

  function t(key, locale, vars) {
    if (locale && typeof locale === "object") {
      vars = locale;
      locale = "";
    }
    const loc = normalizeLocale(locale) || current || FALLBACK;
    const over = overrides[loc] && overrides[loc][key];
    let out = over;
    if (!out) {
      const pack = STRINGS[key];
      if (pack) out = pack[loc] || pack[FALLBACK];
    }
    if (!out) {
      const tail = String(key).includes(".") ? String(key).split(".").slice(1).join(" ") : String(key);
      out = tail.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
    }
    return interpolate(out, vars);
  }

  function invoiceLabel(key, locale, mode) {
    const m = mode || invoiceMode;
    const loc = normalizeLocale(locale) || current;
    if (m === "en") return t(key, "en");
    if (m === "bilingual" && loc !== "en") {
      const regional = t(key, loc);
      const english = t(key, "en");
      return regional === english ? english : regional + " / " + english;
    }
    return t(key, loc);
  }

  function setLocale(code) {
    current = normalizeLocale(code) || FALLBACK;
    return current;
  }

  function setInvoiceMode(mode) {
    const m = String(mode || "shop");
    invoiceMode = m === "en" || m === "bilingual" || m === "shop" ? m : "shop";
    return invoiceMode;
  }

  function setOverrides(map) {
    overrides = map && typeof map === "object" ? map : {};
  }

  function applyDocument(doc) {
    const root = doc || document;
    const info = localeInfo(current);
    if (root.documentElement) {
      root.documentElement.lang = current === "en" ? "en-IN" : current + "-IN";
      root.documentElement.dir = info.dir;
    }
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const attr = el.getAttribute("data-i18n-attr");
      const text = t(key);
      if (attr) el.setAttribute(attr, text);
      else el.textContent = text;
    });
  }

  function coverage() {
    const keys = Object.keys(STRINGS);
    return LOCALES.map((loc) => {
      let filled = 0;
      const missing = [];
      for (const key of keys) {
        const v = (overrides[loc.code] && overrides[loc.code][key]) || (STRINGS[key] && STRINGS[key][loc.code]);
        if (v) filled += 1;
        else missing.push(key);
      }
      return Object.assign({}, loc, {
        total: keys.length,
        filled,
        missing,
        percent: keys.length ? Math.round((filled / keys.length) * 100) : 100,
      });
    });
  }

  function optionsHtml(selected) {
    return LOCALES.map((l) => {
      const sel = l.code === selected ? " selected" : "";
      return '<option value="' + l.code + '"' + sel + ">" + l.native + " " + l.name + "</option>";
    }).join("");
  }

  const INDIC_FOLD = {
    "\u0905": "a", "\u0906": "aa", "\u0907": "i", "\u0908": "ii", "\u0909": "u", "\u090a": "uu",
    "\u090f": "e", "\u0910": "ai", "\u0913": "o", "\u0914": "au",
    "\u0915": "k", "\u0916": "kh", "\u0917": "g", "\u0918": "gh", "\u0919": "n",
    "\u091a": "ch", "\u091b": "chh", "\u091c": "j", "\u091d": "jh", "\u091e": "n",
    "\u091f": "t", "\u0920": "th", "\u0921": "d", "\u0922": "dh", "\u0923": "n",
    "\u0924": "t", "\u0925": "th", "\u0926": "d", "\u0927": "dh", "\u0928": "n",
    "\u092a": "p", "\u092b": "ph", "\u092c": "b", "\u092d": "bh", "\u092e": "m",
    "\u092f": "y", "\u0930": "r", "\u0932": "l", "\u0933": "l", "\u0935": "v",
    "\u0936": "sh", "\u0937": "sh", "\u0938": "s", "\u0939": "h",
    "\u093e": "aa", "\u093f": "i", "\u0940": "ii", "\u0941": "u", "\u0942": "uu",
    "\u0947": "e", "\u0948": "ai", "\u094b": "o", "\u094c": "au",
    "\u0902": "n", "\u0901": "n", "\u0903": "h",
  };

  function foldIndic(raw) {
    return Array.from(String(raw || "").toLowerCase())
      .map((ch) => INDIC_FOLD[ch] || (/[\u093c\u094d\u200c\u200d]/.test(ch) ? "" : ch))
      .join("")
      .replace(/aa/g, "a")
      .replace(/ii/g, "i")
      .replace(/uu/g, "u")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function searchBlob(item) {
    const parts = [
      item && item.name,
      item && item.local_name,
      item && item.hsn,
      item && item.code,
      item && item.barcode,
      item && item.category,
      foldIndic(item && item.name),
      foldIndic(item && item.local_name),
    ];
    return parts.filter(Boolean).join(" ").toLowerCase();
  }

  function matchesQuery(item, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    const blob = searchBlob(item);
    if (blob.includes(q)) return true;
    const folded = foldIndic(q);
    return Boolean(folded) && blob.includes(folded);
  }

  function displayItemName(item, locale, mode) {
    const name = String((item && (item.name || item.item_name)) || "").trim();
    const local = String((item && item.local_name) || "").trim();
    const m = mode || invoiceMode;
    const loc = normalizeLocale(locale) || current;
    if (!local) return name;
    if (m === "en" || loc === "en") return name || local;
    if (m === "bilingual") return name && local && name !== local ? local + " / " + name : local || name;
    return local || name;
  }

  const api = {
    FALLBACK: FALLBACK,
    LOCALES: LOCALES,
    get STRINGS() { return STRINGS; },
    t: t,
    invoiceLabel: invoiceLabel,
    normalizeLocale: normalizeLocale,
    localeInfo: localeInfo,
    resolveLocale: resolveLocale,
    setLocale: setLocale,
    setInvoiceMode: setInvoiceMode,
    setOverrides: setOverrides,
    applyDocument: applyDocument,
    coverage: coverage,
    optionsHtml: optionsHtml,
    displayItemName: displayItemName,
    foldIndic: foldIndic,
    searchBlob: searchBlob,
    matchesQuery: matchesQuery,
    interpolate: interpolate,
    locale: function () { return current; },
    dir: function () { return localeInfo(current).dir; },
    invoiceMode: function () { return invoiceMode; },
  };
  global.POSI18n = api;
})(typeof window !== "undefined" ? window : globalThis);
