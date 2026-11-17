import "../js/sync-engine.js";
import { query } from "./db.js";
import { bid } from "./context.js";

const engine = globalThis.POSSyncEngine;
let auditReady = false;

function sqlSince(raw) {
  const parsed = Date.parse(String(raw || ""));
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 19).replace("T", " ");
}

async function ensureAudit() {
  if (auditReady) return;
  await query(
    `CREATE TABLE IF NOT EXISTS sync_audit (
      business_id VARCHAR(255) NOT NULL,
      transaction_id VARCHAR(80) NOT NULL,
      device_id VARCHAR(64) NOT NULL,
      kind VARCHAR(32) NOT NULL,
      status VARCHAR(16) NOT NULL,
      ref_id VARCHAR(64) NULL,
      ref_number VARCHAR(40) NULL,
      error VARCHAR(255) NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (business_id, transaction_id),
      KEY idx_sync_audit_device (device_id)
    )`,
  );
  auditReady = true;
}

async function findAudit(businessId, transactionId) {
  const rows = await query(
    "SELECT * FROM sync_audit WHERE business_id = ? AND transaction_id = ? LIMIT 1",
    [businessId, transactionId],
  );
  return rows[0] || null;
}

async function writeAudit(row) {
  await query(
    `INSERT INTO sync_audit
       (business_id, transaction_id, device_id, kind, status, ref_id, ref_number, error, created_at)
     VALUES (?,?,?,?,?,?,?,?,NOW())
     ON DUPLICATE KEY UPDATE
       status = IF(status = 'accepted', status, VALUES(status)),
       ref_id = COALESCE(VALUES(ref_id), ref_id),
       ref_number = COALESCE(VALUES(ref_number), ref_number),
       error = IF(status = 'accepted', error, VALUES(error))`,
    [
      row.businessId,
      row.transactionId,
      row.deviceId,
      String(row.kind || "").slice(0, 32),
      row.status,
      row.refId || null,
      row.refNumber || null,
      row.error ? String(row.error).slice(0, 255) : null,
    ],
  );
}

export async function loadSyncChanges(businessId, since) {
  const cursor = sqlSince(since);
  const itemWhere = cursor ? "business_id = ? AND updated_at > ?" : "business_id = ? AND updated_at > DATE_SUB(NOW(), INTERVAL 1 DAY)";
  const params = cursor ? [businessId, cursor] : [businessId];
  const items = await query(
    `SELECT id, name, retail_rate, purchase_rate, b2b_rate, gst_rate, stock_gm, barcode, status, hsn
     FROM items WHERE ${itemWhere} ORDER BY updated_at ASC LIMIT 200`,
    params,
  ).catch(() => []);
  const customers = await query(
    `SELECT id, name, business_name, mobile, outstanding, status, gstin
     FROM customers WHERE ${itemWhere} ORDER BY updated_at ASC LIMIT 200`,
    params,
  ).catch(() => []);
  const taxes = await query(
    "SELECT id, code, name, rate, cgst_rate, sgst_rate, igst_rate, status FROM tax_rates WHERE business_id = ? ORDER BY sort_order, name",
    [businessId],
  ).catch(() => []);
  const companyRows = await query(
    "SELECT name, gstin, timezone, invoice_footer FROM company_settings WHERE business_id = ? LIMIT 1",
    [businessId],
  ).catch(() => []);
  const businessRows = await query("SELECT id, name FROM businesses WHERE id = ? LIMIT 1", [businessId]).catch(() => []);
  return {
    since: since || null,
    nextSince: new Date().toISOString(),
    items,
    customers,
    taxes,
    settings: {
      company: companyRows[0] || null,
      business: businessRows[0] || null,
    },
  };
}

function applyPath(txn) {
  const kind = String(txn?.kind || "");
  if (kind === "checkout") return "/api/checkout";
  if (kind === "stock") return "/api/stock/adjust";
  if (kind === "purchase") return "/api/purchases";
  if (kind === "payment") {
    const path = String(txn.path || "");
    if (!/^\/api\/orders\/[^/]+\/payments$/.test(path) || path.includes("/local-")) return "";
    return path;
  }
  return "";
}

async function applyOne(req, txn) {
  const path = applyPath(txn);
  if (!path) return { pending: true };
  const port = req.socket?.localPort || Number(process.env.PORT || 5173);
  const payload = {
    ...(txn.payload || {}),
    idempotencyKey: txn.transactionId,
    offlineSync: txn.held === true || txn.payload?.offlineSync === true,
  };
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        cookie: req.headers.cookie || "",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return { fallback: true };
  }
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: String(text || "").slice(0, 180) }; }
  if (res.status >= 200 && res.status < 300 && data?.ok !== false) {
    return {
      accepted: !data.replay,
      duplicate: Boolean(data.replay),
      orderNumber: data.order?.order_number || "",
      orderId: data.order?.id || "",
      purchaseNumber: data.purchase?.purchase_number || "",
      purchaseId: data.purchase?.id || "",
      stock_gm: data.stock_gm,
    };
  }
  if (res.status >= 400 && res.status < 500) return { rejected: data.error || "Rejected" };
  return { pending: true };
}

export async function runSyncBatch(req) {
  const businessId = bid();
  const deviceId = String(req.body?.deviceId || req.body?.device_id || "").trim();
  const list = Array.isArray(req.body?.transactions) ? req.body.transactions.slice(0, engine.BATCH_SIZE) : [];
  await ensureAudit();
  const accepted = [];
  const duplicate = [];
  const rejected = [];
  const pending = [];
  const applied = {};
  let fallback = false;
  for (const txn of list) {
    const review = engine.reviewTransaction(txn, { businessId, deviceId });
    const id = review.transactionId;
    if (review.reject) {
      rejected.push({ transactionId: id, error: review.reject });
      if (id) {
        await writeAudit({
          businessId,
          transactionId: id,
          deviceId: deviceId || "unknown",
          kind: txn?.kind || "",
          status: "rejected",
          error: review.reject,
        }).catch(() => {});
      }
      continue;
    }
    const prior = await findAudit(businessId, id);
    if (prior?.status === "accepted") {
      duplicate.push(id);
      if (prior.ref_number || prior.ref_id) {
        applied[id] = { orderNumber: prior.ref_number || "", orderId: prior.ref_id || "", purchaseNumber: prior.ref_number || "", purchaseId: prior.ref_id || "" };
      }
      continue;
    }
    if (prior?.status === "rejected") {
      rejected.push({ transactionId: id, error: prior.error || "Rejected" });
      continue;
    }
    const result = await applyOne(req, { ...txn, transactionId: id });
    if (result.fallback) {
      fallback = true;
      pending.push(id);
      continue;
    }
    if (result.pending) {
      pending.push(id);
      continue;
    }
    if (result.duplicate) {
      duplicate.push(id);
      applied[id] = result;
      await writeAudit({
        businessId,
        transactionId: id,
        deviceId,
        kind: txn.kind,
        status: "accepted",
        refId: result.orderId || result.purchaseId || "",
        refNumber: result.orderNumber || result.purchaseNumber || "",
      });
      continue;
    }
    if (result.rejected) {
      rejected.push({ transactionId: id, error: result.rejected });
      await writeAudit({
        businessId,
        transactionId: id,
        deviceId,
        kind: txn.kind,
        status: "rejected",
        error: result.rejected,
      });
      continue;
    }
    accepted.push(id);
    applied[id] = {
      orderNumber: result.orderNumber || "",
      orderId: result.orderId || "",
      purchaseNumber: result.purchaseNumber || "",
      purchaseId: result.purchaseId || "",
      stock_gm: result.stock_gm,
    };
    await writeAudit({
      businessId,
      transactionId: id,
      deviceId,
      kind: txn.kind,
      status: "accepted",
      refId: result.orderId || result.purchaseId || "",
      refNumber: result.orderNumber || result.purchaseNumber || "",
    });
  }
  const changes = await loadSyncChanges(businessId, req.body?.since);
  return { accepted, duplicate, rejected, pending, applied, changes, fallback };
}

export function registerSyncEngine(app) {
  app.post("/api/sync/batch", async (req, res) => {
    if (req.auth?.type !== "staff") {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    try {
      res.json(await runSyncBatch(req));
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });
}
