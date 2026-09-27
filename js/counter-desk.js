(function (root, factory) {
  const api = factory();
  root.POSCounterDesk = api;
  if (typeof window !== "undefined") window.POSCounterDesk = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const LAYOUT_KEY = "spicepos-counter-layout";
  const ACTIVE_KEY = "spicepos-active-counter";
  const SESSIONS_KEY = "spicepos-counter-sessions";
  const MOBILE_MQ = "(max-width: 980px)";
  const MAX_COUNTERS = 16;
  const MIN_COUNTERS = 1;

  function shopKindHint(biz) {
    if (typeof globalThis !== "undefined") {
      if (globalThis.POSRestaurant?.isRestaurantShop?.(biz)) return "restaurant";
      if (globalThis.POSFootwear?.isRestaurantShop?.(biz)) return "restaurant";
      if (globalThis.POSFootwear?.shopKind?.(biz) === "restaurant") return "restaurant";
    }
    const type = String(biz?.business_type || "").toLowerCase().trim();
    if (type === "restaurant" || type === "cafe" || type === "bakery") return "restaurant";
    const text = [biz?.category, biz?.business_type].filter(Boolean).join(" ").toLowerCase();
    if (/(restaurant|cafe|bakery|food)/.test(text)) return "restaurant";
    return "";
  }

  function isRestaurantShop(biz) {
    return shopKindHint(biz) === "restaurant";
  }

  function isSharedCounterShop(biz) {
    return !isRestaurantShop(biz);
  }

  function detectDeviceLayout(matchMedia) {
    const mq = typeof matchMedia === "function" ? matchMedia : typeof window !== "undefined" ? window.matchMedia?.bind(window) : null;
    if (!mq) return "desktop";
    try {
      return mq(MOBILE_MQ)?.matches ? "mobile" : "desktop";
    } catch {
      return "desktop";
    }
  }

  function clipLayout(raw) {
    return raw === "mobile" || raw === "desktop" ? raw : "";
  }

  function readStorage(store, key) {
    try {
      return store?.getItem?.(key) || "";
    } catch {
      return "";
    }
  }

  function writeStorage(store, key, value) {
    try {
      if (!store) return;
      if (value == null || value === "") store.removeItem?.(key);
      else store.setItem?.(key, value);
    } catch {
      /* private mode */
    }
  }

  function savedLayoutPref(storage) {
    return clipLayout(readStorage(storage || (typeof localStorage !== "undefined" ? localStorage : null), LAYOUT_KEY));
  }

  function saveLayoutPref(layout, storage) {
    const next = clipLayout(layout);
    writeStorage(storage || (typeof localStorage !== "undefined" ? localStorage : null), LAYOUT_KEY, next);
    return next;
  }

  function resolveLayout(pref, matchMedia) {
    const saved = clipLayout(pref === undefined ? savedLayoutPref() : pref);
    if (saved) return saved;
    return detectDeviceLayout(matchMedia);
  }

  function clipCounterId(raw) {
    const id = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32);
    return id;
  }

  function clipCounterName(raw, fallback) {
    const name = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 48);
    return name || fallback || "Counter";
  }

  function clipOperatorId(raw) {
    return String(raw || "").trim().slice(0, 64);
  }

  function clipStatus(raw) {
    return String(raw || "").toLowerCase() === "inactive" ? "inactive" : "active";
  }

  function defaultCounters() {
    return [1, 2, 3].map((n) => ({
      id: `c${n}`,
      name: `Counter ${n}`,
      status: "active",
      operator_id: "",
    }));
  }

  function parseCountersRaw(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object" && Array.isArray(raw.counters)) return raw.counters;
    if (typeof raw === "string") {
      const text = raw.trim();
      if (!text) return null;
      try {
        return parseCountersRaw(JSON.parse(text));
      } catch {
        return null;
      }
    }
    return null;
  }

  function normalizeCounters(raw) {
    const rows = parseCountersRaw(raw);
    if (!rows || !rows.length) return defaultCounters();
    const out = [];
    const seen = new Set();
    for (const row of rows.slice(0, MAX_COUNTERS)) {
      const name = clipCounterName(row?.name ?? row?.id ?? (typeof row === "string" || typeof row === "number" ? row : ""), "");
      let id = clipCounterId(typeof row === "object" && row ? row.id || name : name);
      if (!id) continue;
      if (seen.has(id)) {
        let n = 2;
        while (seen.has(`${id}-${n}`)) n += 1;
        id = `${id}-${n}`.slice(0, 32);
      }
      seen.add(id);
      out.push({
        id,
        name: clipCounterName(name, id.replace(/^c/, "Counter ").replace(/-/g, " ")),
        status: clipStatus(typeof row === "object" && row ? row.status : "active"),
        operator_id: clipOperatorId(typeof row === "object" && row ? row.operator_id || row.operatorId : ""),
      });
    }
    return out.length ? out : defaultCounters();
  }

  function serializeCounters(list) {
    return JSON.stringify({ counters: normalizeCounters(list) });
  }

  function activeCounters(list) {
    return normalizeCounters(list).filter((row) => row.status === "active");
  }

  function readActiveId(storage) {
    return clipCounterId(readStorage(storage || (typeof localStorage !== "undefined" ? localStorage : null), ACTIVE_KEY));
  }

  function saveActiveId(id, storage) {
    const next = clipCounterId(id);
    writeStorage(storage || (typeof localStorage !== "undefined" ? localStorage : null), ACTIVE_KEY, next);
    return next;
  }

  function pickActiveId(list, stored) {
    const rows = normalizeCounters(list);
    const live = rows.filter((row) => row.status === "active");
    const want = clipCounterId(stored);
    if (want && live.some((row) => row.id === want)) return want;
    if (want && rows.some((row) => row.id === want)) return live[0]?.id || rows[0].id;
    return live[0]?.id || rows[0].id;
  }

  function nextCounter(list) {
    const rows = normalizeCounters(list);
    const ids = new Set(rows.map((row) => row.id));
    let n = rows.length + 1;
    while (ids.has(`c${n}`)) n += 1;
    return {
      id: `c${n}`,
      name: `Counter ${n}`,
      status: "active",
      operator_id: "",
    };
  }

  function addCounter(list) {
    const rows = normalizeCounters(list);
    if (rows.length >= MAX_COUNTERS) return rows;
    return [...rows, nextCounter(rows)];
  }

  function removeCounter(list, id) {
    const rows = normalizeCounters(list).filter((row) => row.id !== clipCounterId(id));
    return rows.length >= MIN_COUNTERS ? rows : normalizeCounters(list);
  }

  function updateCounter(list, id, patch) {
    const want = clipCounterId(id);
    return normalizeCounters(list).map((row) => {
      if (row.id !== want) return row;
      return {
        ...row,
        name: patch?.name != null ? clipCounterName(patch.name, row.name) : row.name,
        status: patch?.status != null ? clipStatus(patch.status) : row.status,
        operator_id: patch?.operator_id != null || patch?.operatorId != null
          ? clipOperatorId(patch.operator_id ?? patch.operatorId)
          : row.operator_id,
      };
    });
  }

  function emptySession() {
    return {
      cart: [],
      customerId: "",
      billDiscountType: "amt",
      billDiscountValue: 0,
      loyaltyRedeem: 0,
      lastPack: null,
      query: "",
      wearerFilter: "",
      sizeFilter: "",
      colorFilter: "",
      categoryFilter: "",
      extras: {},
    };
  }

  function copyCart(cart) {
    return (Array.isArray(cart) ? cart : []).map((line) => (line && typeof line === "object" ? { ...line } : line));
  }

  function snapshotSession(state, extras) {
    const src = state && typeof state === "object" ? state : {};
    return {
      cart: copyCart(src.cart),
      customerId: String(src.customerId || ""),
      billDiscountType: src.billDiscountType === "pct" ? "pct" : "amt",
      billDiscountValue: Number(src.billDiscountValue) || 0,
      loyaltyRedeem: Number(src.loyaltyRedeem) || 0,
      lastPack: src.lastPack && typeof src.lastPack === "object" ? { ...src.lastPack } : null,
      query: String(src.query || ""),
      wearerFilter: String(src.wearerFilter || ""),
      sizeFilter: String(src.sizeFilter || ""),
      colorFilter: String(src.colorFilter || ""),
      categoryFilter: String(src.categoryFilter || ""),
      extras: extras && typeof extras === "object" ? { ...extras } : {},
    };
  }

  function applySession(state, session) {
    const next = session && typeof session === "object" ? session : emptySession();
    if (!state || typeof state !== "object") return next;
    state.cart = copyCart(next.cart);
    state.customerId = String(next.customerId || "");
    state.billDiscountType = next.billDiscountType === "pct" ? "pct" : "amt";
    state.billDiscountValue = Number(next.billDiscountValue) || 0;
    state.loyaltyRedeem = Number(next.loyaltyRedeem) || 0;
    state.lastPack = next.lastPack && typeof next.lastPack === "object" ? { ...next.lastPack } : null;
    state.query = String(next.query || "");
    state.wearerFilter = String(next.wearerFilter || "");
    state.sizeFilter = String(next.sizeFilter || "");
    state.colorFilter = String(next.colorFilter || "");
    state.categoryFilter = String(next.categoryFilter || "");
    return next;
  }

  function readSessions(storage) {
    const raw = readStorage(storage || (typeof sessionStorage !== "undefined" ? sessionStorage : null), SESSIONS_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeSessions(map, storage) {
    writeStorage(
      storage || (typeof sessionStorage !== "undefined" ? sessionStorage : null),
      SESSIONS_KEY,
      JSON.stringify(map && typeof map === "object" ? map : {}),
    );
  }

  function sessionOf(id, storage) {
    const map = readSessions(storage);
    const row = map[clipCounterId(id)];
    return row && typeof row === "object" ? snapshotSession(row, row.extras) : emptySession();
  }

  function saveSession(id, session, storage) {
    const key = clipCounterId(id);
    if (!key) return emptySession();
    const map = readSessions(storage);
    map[key] = snapshotSession(session, session?.extras);
    writeSessions(map, storage);
    return map[key];
  }

  function clearSession(id, storage) {
    return saveSession(id, emptySession(), storage);
  }

  function switchCounter(fromId, toId, state, extras, storage) {
    const from = clipCounterId(fromId);
    const to = clipCounterId(toId);
    if (from) saveSession(from, snapshotSession(state, extras), storage);
    const next = sessionOf(to, storage);
    applySession(state, next);
    return next;
  }

  function bodyLayoutClasses(biz, layout) {
    if (!isSharedCounterShop(biz)) return { desktop: false, mobile: false };
    const view = resolveLayout(layout);
    return { desktop: view === "desktop", mobile: view === "mobile" };
  }

  return {
    LAYOUT_KEY,
    ACTIVE_KEY,
    SESSIONS_KEY,
    MOBILE_MQ,
    MAX_COUNTERS,
    isRestaurantShop,
    isSharedCounterShop,
    detectDeviceLayout,
    savedLayoutPref,
    saveLayoutPref,
    resolveLayout,
    clipCounterId,
    clipCounterName,
    normalizeCounters,
    serializeCounters,
    defaultCounters,
    activeCounters,
    readActiveId,
    saveActiveId,
    pickActiveId,
    nextCounter,
    addCounter,
    removeCounter,
    updateCounter,
    emptySession,
    snapshotSession,
    applySession,
    readSessions,
    writeSessions,
    sessionOf,
    saveSession,
    clearSession,
    switchCounter,
    bodyLayoutClasses,
  };
});
