/* Invoices, payments, and stock are saved on this device first, then synced. */
(function () {
  const DB = "pos-offline";

  function shouldQueue(err) {
    const msg = String(err?.message || err || "");
    return /could not reach|failed to fetch|networkerror|load failed|network error|offline|failed to load/i.test(msg);
  }

  function classifySyncFailure(message) {
    const msg = String(message || "");
    if (shouldQueue({ message: msg })) return "offline";
    if (/only .+ in stock|unknown item|customer not found|item not found|supplier not found|not enough stock/i.test(msg)) return "conflict";
    return "error";
  }

  function operation(path, options) {
    const method = String(options?.method || "GET").toUpperCase();
    const clean = String(path || "").split("?")[0];
    if (method === "POST" && /(^|\/)api\/checkout$/.test(clean)) return "checkout";
    if (method === "POST" && /\/api\/orders\/[^/]+\/payments$/.test(clean)) return "payment";
    if (method === "POST" && /(^|\/)api\/stock\/adjust$/.test(clean)) return "stock";
    if (method === "POST" && /(^|\/)api\/purchases$/.test(clean)) return "purchase";
    return "";
  }

  function stockDeltas(kind, payload, snapshot) {
    if (kind === "checkout") {
      return (payload?.lines || []).map((line) => ({
        itemId: line.itemId,
        qty: -(Number(line.quantity_gm) || 0),
      }));
    }
    if (kind === "stock") {
      const item = (snapshot?.items || []).find((row) => row.id === payload?.item_id);
      const onHand = Number(item?.stock_gm) || 0;
      const name = String(payload?.kind || "adjustment");
      let qty = Number(payload?.quantity_gm);
      if (!Number.isFinite(qty)) qty = 0;
      if (payload?.set_on_hand === 0 || payload?.set_on_hand === "0") qty = -onHand;
      else if (["damaged", "expired", "returned"].includes(name)) qty = -Math.abs(qty);
      return [{ itemId: payload?.item_id, qty }];
    }
    if (kind === "purchase") {
      return (payload?.lines || []).map((line) => ({
        itemId: line.item_id,
        qty: (Number(line.quantity_gm) || 0) + (Number(line.free_qty) || 0),
      }));
    }
    return [];
  }

  function pendingDeltas(row) {
    if (Array.isArray(row?.deltas)) return row.deltas;
    return stockDeltas("checkout", row?.payload, null);
  }

  function applyPendingStock(items, rows) {
    const list = (Array.isArray(items) ? items : []).map((item) => ({ ...item }));
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || row.status === "synced" || row.status === "conflict") continue;
      for (const delta of pendingDeltas(row)) {
        const item = list.find((entry) => entry.id === delta.itemId);
        if (!item) continue;
        item.stock_gm = (Number(item.stock_gm) || 0) + (Number(delta.qty) || 0);
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

  function isBootstrap(path, options) {
    const method = String(options?.method || "GET").toUpperCase();
    const clean = String(path || "").split("?")[0];
    return method === "GET" && /(^|\/)api\/bootstrap$/.test(clean);
  }

  function canQueue(payload) {
    return Boolean(payload && Array.isArray(payload.lines) && payload.lines.length && payload.customerId && payload.idempotencyKey);
  }

  const api = { shouldQueue, classifySyncFailure, applyPendingStock, buildLocalOrder, canQueue, operation, stockDeltas };
  globalThis.POSOffline = api;
  if (typeof document === "undefined" || typeof indexedDB === "undefined") return;

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  let dbPromise = null;
  let memorySnapshot = null;
  let memoryRows = null;
  let shopId = "";

  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("snapshot")) db.createObjectStore("snapshot");
          if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "idempotencyKey" });
          if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
        };
        req.onsuccess = () => {
          req.result.onclose = () => { dbPromise = null; };
          resolve(req.result);
        };
        req.onerror = () => {
          dbPromise = null;
          reject(req.error);
        };
      });
    }
    return dbPromise;
  }

  function rememberShop(data) {
    if (!data || typeof data !== "object") return;
    memorySnapshot = data;
    if (data.business?.id) shopId = String(data.business.id);
  }

  async function readSnapshot() {
    if (memorySnapshot) return memorySnapshot;
    const db = await openDb();
    const data = await new Promise((resolve, reject) => {
      const tx = db.transaction("snapshot", "readonly");
      const req = tx.objectStore("snapshot").get("shop");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (data) rememberShop(data);
    return data;
  }

  function writeSnapshot(data) {
    rememberShop(data);
    openDb().then((db) => {
      const tx = db.transaction("snapshot", "readwrite");
      tx.objectStore("snapshot").put(data, "shop");
    }).catch(() => {});
  }

  async function readOutbox() {
    if (memoryRows) return memoryRows;
    const db = await openDb();
    memoryRows = await new Promise((resolve, reject) => {
      const tx = db.transaction("outbox", "readonly");
      const req = tx.objectStore("outbox").getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return memoryRows;
  }

  async function getOutbox(key) {
    if (memoryRows) return memoryRows.find((row) => row.idempotencyKey === key) || null;
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("outbox", "readonly");
      const req = tx.objectStore("outbox").get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  function rememberRow(row) {
    if (!memoryRows) memoryRows = [];
    const index = memoryRows.findIndex((entry) => entry.idempotencyKey === row.idempotencyKey);
    if (index >= 0) memoryRows[index] = row;
    else memoryRows.push(row);
  }

  async function putOutbox(row) {
    rememberRow(row);
    const db = await openDb();
    const tx = db.transaction("outbox", "readwrite");
    tx.objectStore("outbox").put(row);
    await txDone(tx);
  }

  async function dropOutbox(keys) {
    if (!keys.length) return;
    const gone = new Set(keys);
    if (memoryRows) memoryRows = memoryRows.filter((row) => !gone.has(row.idempotencyKey));
    const db = await openDb();
    const tx = db.transaction("outbox", "readwrite");
    const store = tx.objectStore("outbox");
    for (const key of keys) store.delete(key);
    await txDone(tx);
  }

  function staleSynced(row) {
    if (!row || row.status !== "synced") return false;
    const age = Date.now() - Date.parse(row.syncedAt || "");
    return age > (row.held ? 20000 : 60000);
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
    const mine = rows.filter((row) => row.status !== "synced" && row.status !== "conflict" && (!businessId || !row.businessId || row.businessId === businessId));
    if (!mine.length) return data;
    return { ...data, items: applyPendingStock(data.items, mine) };
  }

  function reply(data) {
    return { res: { ok: true, status: 200, statusText: "OK" }, data, text: "" };
  }

  function parseBody(options) {
    try { return JSON.parse(options?.body || "{}"); } catch { return {}; }
  }

  function makeKey(kind) {
    const device = String(globalThis.POSDevice?.id?.() || "device").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
    return `${kind}-${device}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.slice(0, 80);
  }

  function rowLabel(row) {
    if (row?.kind === "stock") return "stock";
    if (row?.kind === "payment") return "payment";
    if (row?.kind === "purchase") return row.offlineNumber || "purchase";
    return row?.offlineNumber || "bill";
  }

  async function localResult(row) {
    const snapshot = await overlayData(await readSnapshot().catch(() => null));
    if (row.kind === "stock") {
      const item = (snapshot?.items || []).find((entry) => entry.id === row.payload?.item_id);
      const applied = Number(row.deltas?.[0]?.qty) || 0;
      return { ok: true, offline: true, stock_gm: Number(item?.stock_gm) || 0, applied };
    }
    if (row.kind === "purchase") {
      return {
        ok: true,
        offline: true,
        purchase: { id: `local-${row.offlineNumber}`, purchase_number: row.offlineNumber, barcode_count: 0 },
      };
    }
    if (row.kind === "payment") {
      return {
        ok: true,
        offline: true,
        order: {
          id: row.serverOrderId || `local-${row.offlineNumber}`,
          order_number: row.offlineNumber,
          payment_status: "pending_sync",
          status: "pending_sync",
          offline: true,
        },
      };
    }
    return buildLocalOrder(row.payload, row.offlineNumber, snapshot);
  }

  async function ensureRow(kind, path, payload) {
    const key = String(payload.idempotencyKey || "");
    const existing = await getOutbox(key);
    if (existing) return existing;
    const snapshot = memorySnapshot;
    const offlineNumber = await nextOfflineNumber();
    const row = {
      idempotencyKey: key,
      kind,
      path,
      payload,
      deltas: stockDeltas(kind, payload, snapshot),
      offlineNumber: kind === "purchase" ? `PO-${offlineNumber}` : offlineNumber,
      businessId: shopId || String(snapshot?.business?.id || ""),
      deviceId: globalThis.POSDevice?.id?.() || "",
      deviceLabel: globalThis.POSDevice?.label?.() || "",
      status: "pending",
      error: "",
      serverNumber: "",
      serverOrderId: "",
      createdAt: new Date().toISOString(),
    };
    await putOutbox(row);
    paint();
    return row;
  }

  let paintGen = 0;
  function paint() {
    const gen = ++paintGen;
    readOutbox().then((rows) => {
      if (gen !== paintGen) return;
      const stale = rows.filter(staleSynced);
      if (stale.length) dropOutbox(stale.map((row) => row.idempotencyKey)).catch(() => {});
      rows = rows.filter((row) => !staleSynced(row));
      const waiting = rows.filter((row) => row.status !== "synced");
      const recent = rows.filter((row) => row.held && row.status === "synced" && Date.now() - Date.parse(row.syncedAt || "") < 20000 && row.serverNumber);
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
      const labels = pending.map(rowLabel).join(", ");
      const conflictText = conflicts.map((row) => `${rowLabel(row)}: ${row.error || "Needs attention"}`).join(" ");
      const done = recent.map((row) => `${rowLabel(row)} is now ${row.serverNumber}`).join(", ");
      bar.textContent = [
        pending.length ? `${pending.length} saved on this device (${labels}). They upload when this device is online.` : "",
        conflictText ? `Conflict ${conflictText}` : "",
        done ? `Synced ${done}.` : "",
      ].filter(Boolean).join(" ");
    }).catch(() => {});
  }

  const inflight = new Set();

  async function paymentPath(row) {
    const match = String(row.path || "").match(/\/api\/orders\/([^/]+)\/payments$/);
    const id = match ? decodeURIComponent(match[1]) : "";
    if (!id.startsWith("local-")) return row.path;
    const number = id.slice("local-".length);
    const bill = (await readOutbox()).find((entry) => (entry.kind || "checkout") === "checkout" && entry.offlineNumber === number);
    if (!bill || bill.status !== "synced" || !bill.serverOrderId) return "";
    return `/api/orders/${encodeURIComponent(bill.serverOrderId)}/payments`;
  }

  async function sendOne(row) {
    const orig = api._send;
    if (typeof orig !== "function") return { offline: true };
    if (row.status === "synced") return { ok: true, reply: reply(await localResult(row)) };
    if (inflight.has(row.idempotencyKey)) return { waiting: true };
    inflight.add(row.idempotencyKey);
    try {
      const currentBusiness = shopId || String(memorySnapshot?.business?.id || "");
      if (currentBusiness && row.businessId && row.businessId !== currentBusiness) {
        row.status = "conflict";
        row.error = "This bill belongs to another shop on this device.";
        await putOutbox(row);
        return { conflict: true, error: row.error };
      }
      const target = row.kind === "payment" ? await paymentPath(row) : (row.path || "/api/checkout");
      if (!target) return { waiting: true };
      const payload = { ...row.payload, idempotencyKey: row.idempotencyKey };
      if (row.held) payload.offlineSync = true;
      let result;
      try {
        result = await orig(target, { method: "POST", body: JSON.stringify(payload) });
      } catch (err) {
        if (shouldQueue(err)) return { offline: true };
        row.attempts = (Number(row.attempts) || 0) + 1;
        row.error = String(err?.message || "Sync failed");
        row.status = classifySyncFailure(row.error) === "conflict" || row.attempts >= 5 ? "conflict" : "pending";
        await putOutbox(row);
        return { conflict: row.status === "conflict", error: row.error };
      }
      if (!result?.res?.ok) {
        const message = result?.data?.error || "Sync failed";
        const failure = classifySyncFailure(message);
        if (failure === "offline") return { offline: true };
        row.attempts = (Number(row.attempts) || 0) + 1;
        row.error = message;
        row.status = failure === "conflict" || row.attempts >= 5 ? "conflict" : "pending";
        await putOutbox(row);
        return { conflict: row.status === "conflict", error: row.error };
      }
      row.status = "synced";
      row.error = "";
      row.serverNumber = result.data?.order?.order_number || result.data?.purchase?.purchase_number || row.serverNumber || "";
      row.serverOrderId = result.data?.order?.id || result.data?.purchase?.id || row.serverOrderId || "";
      row.syncedAt = new Date().toISOString();
      await putOutbox(row);
      return { ok: true, reply: result };
    } finally {
      inflight.delete(row.idempotencyKey);
    }
  }

  function serverReply(row, local) {
    if (row.kind === "purchase") {
      return { ok: true, purchase: { id: row.serverOrderId, purchase_number: row.serverNumber || row.offlineNumber, barcode_count: 0 } };
    }
    if (row.kind === "stock") return { ok: true, stock_gm: local.stock_gm, applied: local.applied };
    const order = local.order || {};
    return {
      ok: true,
      order: {
        ...order,
        id: row.serverOrderId || order.id,
        order_number: row.serverNumber || order.order_number,
      },
    };
  }

  async function hold(row) {
    const stored = (await getOutbox(row.idempotencyKey)) || row;
    if (stored.status !== "synced") {
      stored.held = true;
      await putOutbox(stored);
    }
    return reply(await localResult(stored));
  }

  async function flush(row) {
    if (navigator.onLine === false) return hold(row);
    const start = Date.now();
    while (inflight.has(row.idempotencyKey) && Date.now() - start < 25000) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    const fresh = (await getOutbox(row.idempotencyKey)) || row;
    if (fresh.status === "synced") return reply(serverReply(fresh, await localResult(fresh)));
    const sent = await sendOne(fresh);
    if (sent?.ok) return sent.reply;
    if (sent?.offline || sent?.waiting) return hold(fresh);
    paint();
    const err = new Error(sent?.error || "Saved on this device. It needs attention before it can sync.");
    err.posKept = true;
    throw err;
  }

  let syncing = false;
  async function syncNow() {
    if (syncing || navigator.onLine === false) return;
    if (typeof api._send !== "function") return;
    syncing = true;
    let syncedAny = false;
    try {
      const rows = (await readOutbox())
        .filter((row) => row.status !== "synced" && row.status !== "conflict")
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      for (const row of rows) {
        const sent = await sendOne(row);
        if (sent?.offline) break;
        if (sent?.ok) syncedAny = true;
      }
    } finally {
      syncing = false;
      paint();
    }
    reportStatus();
    if (syncedAny && typeof globalThis.loadBootstrap === "function") {
      globalThis.loadBootstrap().catch(() => {});
    }
  }

  let lastReport = 0;
  let lastSignature = "";
  async function reportStatus() {
    const orig = api._send;
    if (typeof orig !== "function" || navigator.onLine === false) return;
    const deviceId = globalThis.POSDevice?.id?.() || "";
    if (!deviceId) return;
    const rows = memoryRows || await readOutbox().catch(() => []);
    const pending = rows.filter((row) => row.status !== "synced" && row.status !== "conflict").length;
    const conflicts = rows.filter((row) => row.status === "conflict").length;
    const signature = `${pending}:${conflicts}`;
    if (signature === lastSignature && (signature === "0:0" || Date.now() - lastReport < 180000)) return;
    lastReport = Date.now();
    lastSignature = signature;
    const last = rows.filter((row) => row.syncedAt).sort((a, b) => String(a.syncedAt).localeCompare(String(b.syncedAt))).pop();
    try {
      await orig("/api/sync/status", {
        method: "POST",
        body: JSON.stringify({
          deviceId,
          deviceLabel: globalThis.POSDevice?.label?.() || "",
          pending,
          conflicts,
          lastSyncAt: last?.syncedAt || "",
          lastError: rows.find((row) => row.status === "conflict")?.error || "",
        }),
      });
    } catch {
      lastReport = 0;
      lastSignature = "";
    }
  }

  async function foldPayment(path, payload) {
    const match = String(path || "").match(/\/api\/orders\/([^/]+)\/payments$/);
    const id = match ? decodeURIComponent(match[1]) : "";
    if (id.startsWith("local-")) {
      const number = id.slice("local-".length);
      const bill = (await readOutbox()).find((row) => (row.kind || "checkout") === "checkout" && row.offlineNumber === number);
      if (!bill) throw new Error("This offline bill is not on this device.");
      if (bill.status !== "synced" && !inflight.has(bill.idempotencyKey)) {
        const add = Number(payload.amount ?? payload.amountPaid) || 0;
        bill.payload = { ...bill.payload, amountPaid: (Number(bill.payload.amountPaid) || 0) + add };
        await putOutbox(bill);
        paint();
        return reply(buildLocalOrder(bill.payload, bill.offlineNumber, await readSnapshot()));
      }
      if (bill.serverOrderId) path = `/api/orders/${encodeURIComponent(bill.serverOrderId)}/payments`;
    }
    if (!payload.idempotencyKey) payload.idempotencyKey = makeKey("pay");
    const row = await ensureRow("payment", path, payload);
    return flush(row);
  }

  async function saveFirst(kind, path, payload) {
    if (kind === "checkout" && !canQueue(payload)) return null;
    if (kind === "stock" && !payload?.item_id) return null;
    if (kind === "purchase" && (!payload?.supplier_id || !Array.isArray(payload.lines) || !payload.lines.length)) return null;
    if (!payload.idempotencyKey) payload.idempotencyKey = makeKey(kind === "purchase" ? "po" : kind);
    const row = await ensureRow(kind, path, payload);
    return flush(row);
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
      const kind = operation(path, options);
      if (!kind) return orig(path, options);
      const payload = parseBody(options);
      try {
        if (kind === "payment") return await foldPayment(path, payload);
        const saved = await saveFirst(kind, String(path || "").split("?")[0], payload);
        if (saved) return saved;
      } catch (err) {
        if (err?.posKept || navigator.onLine === false || /not on this device/i.test(err?.message || "")) throw err;
      }
      return orig(path, { ...(options || {}), body: JSON.stringify(payload) });
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
    setInterval(() => { syncNow(); reportStatus(); }, 15000);
    syncNow();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
