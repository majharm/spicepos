import crypto from "node:crypto";
import { query } from "./db.js";
import { requireMaster } from "./auth.js";

const SETTINGS_ID = "login";

export async function ensureLoginPageSchema() {
  await query(`CREATE TABLE IF NOT EXISTS login_page_settings (
    id VARCHAR(16) PRIMARY KEY,
    draft_json MEDIUMTEXT NULL,
    published_json MEDIUMTEXT NULL,
    published_version INT NOT NULL DEFAULT 0,
    updated_by VARCHAR(180) NULL,
    updated_at TIMESTAMP(3) NULL
  )`);
  await query(`CREATE TABLE IF NOT EXISTS login_page_images (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    kind VARCHAR(32) NOT NULL DEFAULT 'library',
    url MEDIUMTEXT NOT NULL,
    thumb MEDIUMTEXT NULL,
    width INT NOT NULL DEFAULT 0,
    height INT NOT NULL DEFAULT 0,
    bytes INT NOT NULL DEFAULT 0,
    mime VARCHAR(40) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    uploaded_by VARCHAR(180) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (kind), INDEX (status)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS login_page_campaigns (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    image_id VARCHAR(36) NULL,
    start_date DATE NULL,
    end_date DATE NULL,
    start_time VARCHAR(8) NULL,
    end_time VARCHAR(8) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS login_page_versions (
    id VARCHAR(36) PRIMARY KEY,
    version INT NOT NULL,
    config_json MEDIUMTEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'draft',
    actor VARCHAR(180) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (version)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS login_page_audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    actor VARCHAR(180) NULL,
    action VARCHAR(64) NOT NULL,
    ip VARCHAR(64) NULL,
    details_json MEDIUMTEXT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (created_at)
  )`);
}

function parseJson(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function actor(req) {
  return req.auth?.user?.email || req.auth?.admin?.email || "master";
}

function ip(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
}

async function audit(req, action, details) {
  await query(
    `INSERT INTO login_page_audit_logs (id, actor, action, ip, details_json) VALUES (?,?,?,?,?)`,
    [crypto.randomUUID(), actor(req), action, ip(req), JSON.stringify(details || {})],
  );
}

function validateDataUrl(dataUrl, maxKb) {
  const raw = String(dataUrl || "");
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(raw)) {
    throw new Error("Only JPG, PNG, or WebP images are allowed");
  }
  if (/script|php|<?/i.test(raw.slice(0, 80))) throw new Error("Invalid image");
  const b64 = raw.split(",")[1] || "";
  const bytes = Math.ceil((b64.length * 3) / 4);
  const cap = Math.min(2048, Math.max(200, Number(maxKb) || 900));
  if (bytes > cap * 1024) throw new Error(`Image must be under ${cap} KB after compress`);
  return { bytes, mime: (raw.match(/^data:(image\/[a-z]+)/i) || [])[1] || "image/jpeg" };
}

async function getBundle() {
  await ensureLoginPageSchema();
  const [row] = await query("SELECT * FROM login_page_settings WHERE id = ? LIMIT 1", [SETTINGS_ID]);
  const images = await query("SELECT id, name, kind, url, thumb, width, height, bytes, mime, status, uploaded_by, created_at FROM login_page_images WHERE status <> 'deleted' ORDER BY created_at DESC");
  const campaigns = await query("SELECT * FROM login_page_campaigns ORDER BY created_at DESC");
  const versions = await query("SELECT id, version, status, actor, created_at FROM login_page_versions ORDER BY version DESC LIMIT 40");
  const auditRows = await query("SELECT * FROM login_page_audit_logs ORDER BY created_at DESC LIMIT 80");
  return {
    draft: parseJson(row?.draft_json, {}),
    published: parseJson(row?.published_json, null),
    published_version: Number(row?.published_version) || 0,
    updated_by: row?.updated_by || "",
    images,
    campaigns,
    versions,
    audit: auditRows,
  };
}

async function saveDraft(body, req) {
  await ensureLoginPageSchema();
  const bundle = await getBundle();
  const draft = { ...bundle.draft, ...(body || {}) };
  delete draft.images;
  delete draft.campaigns;
  const [row] = await query("SELECT id FROM login_page_settings WHERE id = ? LIMIT 1", [SETTINGS_ID]);
  if (!row) {
    await query(
      `INSERT INTO login_page_settings (id, draft_json, published_json, published_version, updated_by, updated_at)
       VALUES (?, ?, NULL, 0, ?, CURRENT_TIMESTAMP(3))`,
      [SETTINGS_ID, JSON.stringify(draft), actor(req)],
    );
  } else {
    await query(
      `UPDATE login_page_settings SET draft_json = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [JSON.stringify(draft), actor(req), SETTINGS_ID],
    );
  }
  await query(
    `INSERT INTO login_page_versions (id, version, config_json, status, actor) VALUES (?,?,?,?,?)`,
    [crypto.randomUUID(), (bundle.published_version || 0) + 1, JSON.stringify(draft), "draft", actor(req)],
  );
  await audit(req, "Login Text Changed", { keys: Object.keys(body || {}) });
  return getBundle();
}

async function publish(req) {
  const bundle = await getBundle();
  const next = (bundle.published_version || 0) + 1;
  const json = JSON.stringify(bundle.draft || {});
  await query(
    `UPDATE login_page_settings SET published_json = ?, published_version = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [json, next, actor(req), SETTINGS_ID],
  );
  await query(`INSERT INTO login_page_versions (id, version, config_json, status, actor) VALUES (?,?,?,?,?)`, [
    crypto.randomUUID(),
    next,
    json,
    "published",
    actor(req),
  ]);
  await audit(req, "Campaign Published", { version: next });
  return getBundle();
}

async function unpublish(req) {
  await query(
    `UPDATE login_page_settings SET published_json = NULL, updated_by = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [actor(req), SETTINGS_ID],
  );
  await audit(req, "Login Layout Changed", { unpublished: true });
  return getBundle();
}

async function saveImage(body, req) {
  const maxKb = Number(body.maxUploadKb) || 900;
  const { bytes, mime } = validateDataUrl(body.dataUrl, maxKb);
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO login_page_images (id, name, kind, url, thumb, width, height, bytes, mime, status, uploaded_by)
     VALUES (?,?,?,?,?,?,?,?,?,'active',?)`,
    [
      id,
      String(body.name || "Login image").slice(0, 180),
      String(body.kind || "library").slice(0, 32),
      body.dataUrl,
      body.thumb || body.dataUrl,
      Number(body.width) || 0,
      Number(body.height) || 0,
      bytes,
      mime,
      actor(req),
    ],
  );
  await audit(req, "Image Uploaded", { id, name: body.name, kind: body.kind });
  return getBundle();
}

async function patchImage(id, body, req) {
  const [row] = await query("SELECT * FROM login_page_images WHERE id = ? LIMIT 1", [id]);
  if (!row) throw new Error("Image not found");
  if (body.status === "deleted") {
    await query("UPDATE login_page_images SET status = 'deleted' WHERE id = ?", [id]);
    await audit(req, "Image Deleted", { id });
    return getBundle();
  }
  const name = body.name != null ? String(body.name).slice(0, 180) : row.name;
  const kind = body.kind != null ? String(body.kind).slice(0, 32) : row.kind;
  let url = row.url;
  if (body.dataUrl) {
    validateDataUrl(body.dataUrl, body.maxUploadKb);
    url = body.dataUrl;
    await audit(req, "Image Replaced", { id });
  }
  await query("UPDATE login_page_images SET name = ?, kind = ?, url = ? WHERE id = ?", [name, kind, url, id]);
  return getBundle();
}

async function saveCampaign(body, req) {
  const id = body.id || crypto.randomUUID();
  const [row] = await query("SELECT id FROM login_page_campaigns WHERE id = ? LIMIT 1", [id]);
  const fields = [
    String(body.name || "Campaign").slice(0, 180),
    body.image_id || null,
    body.start_date || null,
    body.end_date || null,
    body.start_time || "00:00",
    body.end_time || "23:59",
    body.status === "active" ? "active" : "draft",
  ];
  if (row) {
    await query(
      `UPDATE login_page_campaigns SET name=?, image_id=?, start_date=?, end_date=?, start_time=?, end_time=?, status=? WHERE id=?`,
      [...fields, id],
    );
  } else {
    await query(
      `INSERT INTO login_page_campaigns (id, name, image_id, start_date, end_date, start_time, end_time, status) VALUES (?,?,?,?,?,?,?,?)`,
      [id, ...fields],
    );
  }
  await audit(req, "Campaign Published", { id, name: body.name, status: fields[6] });
  return getBundle();
}

async function restoreVersion(id, req) {
  const [row] = await query("SELECT * FROM login_page_versions WHERE id = ? LIMIT 1", [id]);
  if (!row) throw new Error("Version not found");
  await query(
    `UPDATE login_page_settings SET draft_json = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [row.config_json, actor(req), SETTINGS_ID],
  );
  await audit(req, "Login Layout Changed", { restore: row.version });
  return getBundle();
}

export function publicPayload() {
  return (async () => {
    const bundle = await getBundle();
    const images = (bundle.images || []).map((i) => ({
      id: i.id,
      name: i.name,
      kind: i.kind,
      url: i.url,
      status: i.status,
    }));
    return {
      settings: bundle.published || {},
      images,
      campaigns: bundle.campaigns || [],
      published_version: bundle.published_version,
      v: bundle.published_version,
    };
  })();
}

function send(res, fn) {
  Promise.resolve()
    .then(fn)
    .then((data) => res.json(data))
    .catch((err) => res.status(400).json({ error: String(err.message || err) }));
}

export function registerLoginPagePublic(app) {
  app.get("/api/login-page", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    send(res, publicPayload);
  });
}

export function registerLoginPageMaster(app) {
  app.get("/api/master/login-page", requireMaster, (_req, res) => send(res, getBundle));
  app.post("/api/master/login-page", requireMaster, (req, res) => send(res, () => saveDraft(req.body || {}, req)));
  app.post("/api/master/login-page/publish", requireMaster, (req, res) => send(res, () => publish(req)));
  app.post("/api/master/login-page/unpublish", requireMaster, (req, res) => send(res, () => unpublish(req)));
  app.post("/api/master/login-page/images", requireMaster, (req, res) => send(res, () => saveImage(req.body || {}, req)));
  app.post("/api/master/login-page/images/:id", requireMaster, (req, res) =>
    send(res, () => patchImage(req.params.id, req.body || {}, req)),
  );
  app.post("/api/master/login-page/campaigns", requireMaster, (req, res) =>
    send(res, () => saveCampaign(req.body || {}, req)),
  );
  app.post("/api/master/login-page/versions/:id/restore", requireMaster, (req, res) =>
    send(res, () => restoreVersion(req.params.id, req)),
  );
}
