import { query } from "./db.js";

export function clipIdempotencyKey(raw) {
  return String(raw || "")
    .trim()
    .slice(0, 80);
}

export async function ensureIdempotencyTable(run = query) {
  await run(`CREATE TABLE IF NOT EXISTS pos_idempotency (
    business_id VARCHAR(36) NOT NULL,
    idempotency_key VARCHAR(80) NOT NULL,
    kind VARCHAR(32) NOT NULL,
    ref_id VARCHAR(64) NOT NULL,
    payload_json MEDIUMTEXT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (business_id, idempotency_key)
  )`);
}

export async function findIdempotent(runner, businessId, key) {
  const k = clipIdempotencyKey(key);
  if (!k) return null;
  const sql = "SELECT * FROM pos_idempotency WHERE business_id = ? AND idempotency_key = ? LIMIT 1";
  if (typeof runner.query === "function") {
    const [rows] = await runner.query(sql, [businessId, k]);
    return rows[0] || null;
  }
  const rows = await runner(sql, [businessId, k]);
  return rows[0] || null;
}

export async function saveIdempotent(runner, businessId, key, kind, refId, payload) {
  const k = clipIdempotencyKey(key);
  if (!k) return null;
  const sql =
    "INSERT INTO pos_idempotency (business_id, idempotency_key, kind, ref_id, payload_json) VALUES (?,?,?,?,?)";
  const params = [businessId, k, String(kind || "checkout").slice(0, 32), String(refId || "").slice(0, 64), payload ? JSON.stringify(payload) : null];
  try {
    if (typeof runner.query === "function") await runner.query(sql, params);
    else await runner(sql, params);
    return { key: k, refId };
  } catch (err) {
    const msg = String(err?.message || err);
    if (/duplicate|unique/i.test(msg)) return findIdempotent(runner, businessId, k);
    throw err;
  }
}

export function parseIdempotentPayload(row) {
  if (!row?.payload_json) return null;
  try {
    return JSON.parse(row.payload_json);
  } catch {
    return null;
  }
}
