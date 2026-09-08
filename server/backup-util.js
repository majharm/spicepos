import zlib from "node:zlib";

export const BACKUP_KIND = "spicepos-shop-backup";
export const PLATFORM_BACKUP_KIND = "spicepos-platform-backup";
export const BACKUP_EMAIL_HOURS = [6, 10, 14, 18, 22];
export const BACKUP_EMAIL_MAX_BYTES = 12 * 1024 * 1024;
export const BACKUP_EMAIL_TZ = "Asia/Kolkata";

export const BACKUP_SKIP_TABLES = new Set([
  "staff_sessions",
  "platform_admins",
  "platform_sessions",
  "platform_settings",
  "subscription_plans",
]);

export const PLATFORM_SKIP_TABLES = new Set(["staff_sessions", "platform_sessions"]);

/** Shop identity kept when Master Admin cleans operational data. */
export const SHOP_CLEAN_KEEP_TABLES = new Set([
  "businesses",
  "staff_users",
  "branches",
  "pos_devices",
  "company_settings",
  "inventory_units",
  "units",
  "loyalty_settings",
]);

export function isSafeTableName(name) {
  return typeof name === "string" && /^[A-Za-z0-9_]+$/.test(name);
}

export function backupTableRank(name) {
  if (/_lines$/.test(name) || ["pack_items", "branch_stocks", "journal_lines", "stock_movements", "item_barcodes", "stock_batches", "damage_records", "loyalty_ledger", "loyalty_accounts"].includes(name)) {
    return 0;
  }
  if (name === "staff_users") return 2;
  if (name === "branches" || name === "pos_devices") return 3;
  if (name === "businesses") return 4;
  if (["subscription_plans", "platform_admins", "platform_settings"].includes(name)) return 5;
  return 1;
}

export function sortBackupTables(names, forInsert) {
  return [...names].sort((a, b) => {
    let d = backupTableRank(a) - backupTableRank(b);
    if (forInsert) d = -d;
    if (d !== 0) return d;
    return a.localeCompare(b);
  });
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

export function backupFilename(business) {
  const name =
    String(business?.name || "shop")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "shop";
  return `spicepos-backup-${name}-${stamp()}.json`;
}

export function platformBackupFilename() {
  return `spicepos-platform-backup-${stamp()}.json`;
}

export function backupEmailParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: BACKUP_EMAIL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour);
  const day = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  const hh = String(hour).padStart(2, "0");
  return {
    day,
    hour,
    hh,
    slot: BACKUP_EMAIL_HOURS.includes(hour) ? `${day}T${hh}` : null,
  };
}

export function backupEmailSlot(now = new Date()) {
  return backupEmailParts(now).slot;
}

export function backupEmailFilename(now = new Date()) {
  const { day, hh } = backupEmailParts(now);
  return `spicepos-platform-backup-${day.replaceAll("-", "")}-${hh}.json.gz`;
}

export function stripBackupDataImages(json) {
  return String(json || "").replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/g, "");
}

export function gzipBackupJson(json) {
  return zlib.gzipSync(Buffer.from(String(json || ""), "utf8"));
}

export function formatBackupBytes(n) {
  const bytes = Number(n) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function prepareBackupEmailAttachment(payload) {
  let json = JSON.stringify(payload);
  let content = gzipBackupJson(json);
  let stripped = false;
  if (content.length > BACKUP_EMAIL_MAX_BYTES) {
    json = stripBackupDataImages(json);
    content = gzipBackupJson(json);
    stripped = true;
  }
  const tooLarge = content.length > BACKUP_EMAIL_MAX_BYTES;
  return {
    tooLarge,
    stripped,
    bytes: content.length,
    filename: backupEmailFilename(),
    content,
    mimeType: "application/gzip",
  };
}

export function assertShopBackup(payload, businessId) {
  if (!payload || payload.kind !== BACKUP_KIND) {
    throw new Error("Not a SpicePOS shop backup file");
  }
  if (payload.business_id !== businessId) {
    throw new Error("This backup belongs to another shop");
  }
  if (!payload.tables || typeof payload.tables !== "object") {
    throw new Error("Backup has no tables");
  }
}

export function toSqlValue(value) {
  if (value == null) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 23).replace("T", " ");
  }
  if (typeof value === "string") {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/);
    if (m) return `${m[1]} ${m[2]}${m[3] || ""}`;
  }
  return value;
}

export function normalizeBackupRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) out[key] = toSqlValue(value);
  return out;
}

export function assertPlatformBackup(payload) {
  if (!payload || payload.kind !== PLATFORM_BACKUP_KIND) {
    throw new Error("Not a SpicePOS platform backup file");
  }
  if (!payload.tables || typeof payload.tables !== "object") {
    throw new Error("Backup has no tables");
  }
}
