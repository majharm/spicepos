import { query } from "./db.js";
import { bid } from "./context.js";

let ready = false;

function cleanDeviceId(raw) {
  const id = String(raw || "").trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : "";
}

function cleanLabel(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim().slice(0, 40);
}

function countOf(raw) {
  const n = Math.round(Number(raw) || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100000, n);
}

function sqlTime(raw) {
  const parsed = Date.parse(String(raw || ""));
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 19).replace("T", " ");
}

export function foldSyncRows(businesses, devices) {
  const rows = (Array.isArray(businesses) ? businesses : []).map((business) => {
    const mine = (Array.isArray(devices) ? devices : []).filter((row) => row.business_id === business.id);
    const reported = mine
      .map((row) => row.reported_at)
      .filter(Boolean)
      .sort()
      .pop() || null;
    return {
      id: business.id,
      name: business.name || "Shop",
      devices: mine.length,
      pending: mine.reduce((sum, row) => sum + countOf(row.pending_count), 0),
      conflicts: mine.reduce((sum, row) => sum + countOf(row.conflict_count), 0),
      lastError: mine.map((row) => String(row.last_error || "").trim()).find(Boolean) || "",
      reportedAt: reported,
    };
  });
  rows.sort((a, b) => (b.pending + b.conflicts) - (a.pending + a.conflicts) || String(a.name).localeCompare(String(b.name)));
  return rows;
}

async function ensureSyncTable() {
  if (ready) return;
  await query(
    `CREATE TABLE IF NOT EXISTS device_sync_status (
      device_id VARCHAR(64) NOT NULL PRIMARY KEY,
      business_id VARCHAR(255) NOT NULL,
      device_label VARCHAR(40) NULL,
      pending_count INT NOT NULL DEFAULT 0,
      conflict_count INT NOT NULL DEFAULT 0,
      last_sync_at DATETIME NULL,
      last_error VARCHAR(255) NULL,
      reported_at DATETIME NOT NULL,
      KEY idx_sync_business (business_id)
    )`,
  );
  ready = true;
}

export async function reportDeviceSync(body = {}) {
  const deviceId = cleanDeviceId(body.deviceId || body.device_id);
  if (!deviceId) {
    const err = new Error("Device id required");
    err.status = 400;
    throw err;
  }
  await ensureSyncTable();
  const pending = countOf(body.pending);
  const conflicts = countOf(body.conflicts);
  const label = cleanLabel(body.deviceLabel || body.device_label);
  const lastError = String(body.lastError || body.last_error || "").trim().slice(0, 255);
  const lastSync = sqlTime(body.lastSyncAt || body.last_sync_at);
  await query(
    `INSERT INTO device_sync_status
       (device_id, business_id, device_label, pending_count, conflict_count, last_sync_at, last_error, reported_at)
     VALUES (?,?,?,?,?,?,?,NOW())
     ON DUPLICATE KEY UPDATE
       business_id = VALUES(business_id),
       device_label = VALUES(device_label),
       pending_count = VALUES(pending_count),
       conflict_count = VALUES(conflict_count),
       last_sync_at = VALUES(last_sync_at),
       last_error = VALUES(last_error),
       reported_at = NOW()`,
    [deviceId, bid(), label || null, pending, conflicts, lastSync, lastError || null],
  );
  return { ok: true };
}

export async function masterSyncStatus() {
  await ensureSyncTable();
  const businesses = await query("SELECT id, name FROM businesses ORDER BY name");
  const devices = await query("SELECT * FROM device_sync_status");
  return {
    note: "Bills, payments, and stock are saved on each device first. Waiting is the count still on that device. Conflicts need a person to look.",
    businesses: foldSyncRows(businesses, devices),
  };
}
