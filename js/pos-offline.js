/* Counter bills stay on this device when the network drops, then sync in order. */
(function () {
  const DB = "pos-offline";

  function shouldQueue(err) {
    const msg = String(err?.message || err || "");
    return /could not reach|failed to fetch|networkerror|load failed|network error|offline|failed to load/i.test(msg);
  }

  function classifySyncFailure(message) {
    const msg = String(message || "");
    if (shouldQueue({ message: msg })) return "offline";
    if (/only .+ in stock|unknown item|customer not found/i.test(msg)) return "conflict";
    return "error";
  }

  function applyPendingStock(items, rows) {
    const list = (Array.isArray(items) ? items : []).map((item) => ({ ...item }));
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || row.status === "synced") continue;
      for (const line of row.payload?.lines || []) {
        const item = list.find((entry) => entry.id === line.itemId);
        if (!item) continue;
        item.stock_gm = (Number(item.stock_gm) || 0) - (Number(line.quantity_gm) || 0);
      }
    }
    return list;
  }

  function buildLocalOrder(payload, offlineNumber, snapshot) {
    const items = snapshot?.items || [];
    const customers = snapshot?.customers || [];
    const customer = customers.find((row) => row.id === payload?.customerId);
    const lines = (payload?.lines || []).map((line) => {
      const item = items.find((entry) => entry.id === line.itemId);
      const qty = Number(line.quantity_gm) || 0;
      const rate = Number(line.rate) || Number(item?.retail_rate) || Number(item?.sale_rate) || 0;
      const amount = Math.round(rate * qty * 100) / 100;
      return {
        item_id: line.itemId,
        item_name: item?.name || "Item",
        quantity_gm: qty,
        rate_per_kg: rate,
        amount,
        gst_rate: Number(item?.gst_rate) || 0,
      };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
    const discount = Number(payload?.discount) || 0;
    return {
      ok: true,
      offline: true,
      order: {
        id: `local-${offlineNumber}`,
        order_number: offlineNumber,
        customer_id: payload?.customerId || "",
        customer_name: payload?.customer_name || customer?.business_name || customer?.name || "Customer",
        payment_method: payload?.paymentMethod || "cash",
        payment_status: payload?.paymentMethod === "credit" ? "unpaid" : "paid",
        status: "pending_sync",
        subtotal,
        discount,
        gst: 0,
        total: Math.max(0, Math.round((subtotal - discount) * 100) / 100),
        lines,
        created_at: new Date().toISOString(),
        offline: true,
      },
    };
  }

  function isCheckout(path, options) {
    const method = String(options?.method || "GET").toUpperCase();
    const clean = String(path || "").split("?")[0];
    return method === "POST" && /(^|\/)api\/checkout$/.test(clean);
  }

  function isBootstrap(path, options) {
    const method = String(options?.method || "GET").toUpperCase();
    const clean = String(path || "").split("?")[0];
    return method === "GET" && /(^|\/)api\/bootstrap$/.test(clean);
  }

  function canQueue(payload) {
    return Boolean(payload && Array.isArray(payload.lines) && payload.lines.length && payload.customerId && payload.idempotencyKey);
  }

  const api = { shouldQueue, classifySyncFailure, applyPendingStock, buildLocalOrder, canQueue };
  globalThis.POSOffline = api;
  if (typeof document === "undefined" || typeof indexedDB === "undefined") return;

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("snapshot")) db.createObjectStore("snapshot");
        if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "idempotencyKey" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function readSnapshot() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("snapshot", "readonly");
      const req = tx.objectStore("snapshot").get("shop");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function writeSnapshot(data) {
    const db = await openDb();
    const tx = db.transaction("snapshot", "readwrite");
    tx.objectStore("snapshot").put(data, "shop");
    await txDone(tx);
  }

  async function readOutbox() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("outbox", "readonly");
      const req = tx.objectStore("outbox").getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function putOutbox(row) {
    const db = await openDb();
    const tx = db.transaction("outbox", "readwrite");
    tx.objectStore("outbox").put(row);
    await txDone(tx);
  }

  async function nextOfflineNumber() {
    const db = await openDb();
    const current = await new Promise((resolve, reject) => {
      const tx = db.transaction("meta", "readonly");
      const req = tx.objectStore("meta").get("offlineSeq");
      req.onsuccess = () => resolve(Number(req.result) || 0);
      req.onerror = () => reject(req.error);
    });
    const next = current + 1;
    const tx = db.transaction("meta", "readwrite");
    tx.objectStore("meta").put(next, "offlineSeq");
    await txDone(tx);
    return `OFF-${next}`;
  }

  async function overlayData(data) {
    if (!data || typeof data !== "object") return data;
    const rows = await readOutbox().catch(() => []);
    const businessId = String(data.business?.id || "");
    const mine = rows.filter((row) => !businessId || row.businessId === businessId);
    return { ...data, items: applyPendingStock(data.items, mine) };
  }

  async function enqueue(payload) {
    const snapshot = await readSnapshot();
    const existing = (await readOutbox()).find((row) => row.idempotencyKey === payload.idempotencyKey);
    if (existing) return buildLocalOrder(existing.payload, existing.offlineNumber, snapshot);
    const offlineNumber = await nextOfflineNumber();
    const row = {
      idempotencyKey: String(payload.idempotencyKey),
      payload,
      offlineNumber,
      businessId: String(snapshot?.business?.id || ""),
      deviceId: globalThis.POSDevice?.id?.() || "",
      deviceLabel: globalThis.POSDevice?.label?.() || "",
      status: "pending",
      error: "",
      serverNumber: "",
      createdAt: new Date().toISOString(),
    };
    await putOutbox(row);
    paint();
    return buildLocalOrder(payload, offlineNumber, snapshot);
  }

  function reply(data) {
    return { res: { ok: true, status: 200, statusText: "OK" }, data, text: "" };
  }

  function paint() {
    readOutbox().then((rows) => {
      const waiting = rows.filter((row) => row.status !== "synced");
      const recent = rows.filter((row) => row.status === "synced" && Date.now() - Date.parse(row.syncedAt || "") < 20000 && row.serverNumber);
      let bar = document.getElementById("pos-sync-note");
      if (!waiting.length && !recent.length) {
        bar?.remove();
        return;
      }
      if (!bar) {
        bar = document.createElement("aside");
        bar.id = "pos-sync-note";
        bar.className = "pos-sync-note";
        bar.setAttribute("role", "status");
        document.body.appendChild(bar);
      }
      const conflicts = waiting.filter((row) => row.status === "conflict");
      const pending = waiting.filter((row) => row.status !== "conflict");
      const numbers = pending.map((row) => row.offlineNumber).join(", ");
      const conflictText = conflicts.map((row) => `${row.offlineNumber}: ${row.error || "Needs attention"}`).join(" ");
      const done = recent.map((row) => `${row.offlineNumber} is now ${row.serverNumber}`).join(", ");
      bar.textContent = [
        pending.length ? `${pending.length} bill${pending.length === 1 ? "" : "s"} waiting to sync (${numbers}). They upload when this device is online.` : "",
        conflictText ? `Conflict ${conflictText}` : "",
        done ? `Synced ${done}.` : "",
      ].filter(Boolean).join(" ");
    }).catch(() => {});
  }

  let syncing = false;
  async function syncNow() {
    if (syncing || navigator.onLine === false) return;
    const orig = api._send;
    if (typeof orig !== "function") return;
    syncing = true;
    let syncedAny = false;
    try {
      const snapshot = await readSnapshot();
      const currentBusiness = String(snapshot?.business?.id || "");
      const rows = (await readOutbox()).filter((row) => row.status !== "synced").sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      for (const row of rows) {
        if (currentBusiness && row.businessId && row.businessId !== currentBusiness) {
          row.status = "conflict";
          row.error = "This bill belongs to another shop on this device.";
          await putOutbox(row);
          continue;
        }
        const payload = { ...row.payload, offlineSync: true, idempotencyKey: row.idempotencyKey };
        let result;
        try {
          result = await orig("/api/checkout", { method: "POST", body: JSON.stringify(payload) });
        } catch (err) {
          if (shouldQueue(err)) break;
          row.status = classifySyncFailure(err?.message) === "conflict" ? "conflict" : "error";
          row.error = String(err?.message || "Sync failed");
          await putOutbox(row);
          continue;
        }
        if (!result?.res?.ok) {
          const message = result?.data?.error || "Sync failed";
          const kind = classifySyncFailure(message);
          if (kind === "offline") break;
          row.status = kind === "conflict" ? "conflict" : "error";
          row.error = message;
          await putOutbox(row);
          continue;
        }
        row.status = "synced";
        row.error = "";
        row.serverNumber = result.data?.order?.order_number || "";
        row.syncedAt = new Date().toISOString();
        await putOutbox(row);
        syncedAny = true;
      }
    } finally {
      syncing = false;
      paint();
    }
    if (syncedAny && typeof globalThis.loadBootstrap === "function") {
      globalThis.loadBootstrap().catch(() => {});
    }
  }

  function wrap() {
    const orig = window.posRequest;
    if (typeof orig !== "function" || orig.__posOffline) return;
    api._send = orig;
    async function wrapped(path, options) {
      if (isBootstrap(path, options)) {
        try {
          const result = await orig(path, options);
          if (result?.res?.ok && result.data) await writeSnapshot(result.data);
          if (result?.data) result.data = await overlayData(result.data);
          return result;
        } catch (err) {
          const snap = await readSnapshot().catch(() => null);
          if (!snap || !shouldQueue(err)) throw err;
          return reply(await overlayData(snap));
        }
      }
      if (!isCheckout(path, options)) return orig(path, options);
      let payload = {};
      try { payload = JSON.parse(options?.body || "{}"); } catch { payload = {}; }
      if (navigator.onLine === false && canQueue(payload)) return reply(await enqueue(payload));
      try {
        return await orig(path, options);
      } catch (err) {
        if (shouldQueue(err) && canQueue(payload)) return reply(await enqueue(payload));
        throw err;
      }
    }
    wrapped.__posOffline = true;
    window.posRequest = wrapped;
  }

  function boot() {
    wrap();
    const style = document.createElement("style");
    style.textContent = ".pos-sync-note{position:fixed;z-index:79;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));max-width:520px;margin:0 auto;padding:10px 14px;border-radius:14px;background:#7c2d12;color:#fff;font:600 13px/1.4 Segoe UI,sans-serif;box-shadow:0 12px 28px rgba(124,45,18,.3)}";
    document.head.appendChild(style);
    paint();
    window.addEventListener("online", () => { syncNow(); });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") syncNow();
    });
    setInterval(syncNow, 15000);
    syncNow();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
