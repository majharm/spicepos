import crypto from "node:crypto";
import { query } from "./db.js";
import { bid } from "./context.js";
import { requireStaff, requirePerm } from "./auth.js";
import { hashPassword, verifyPassword } from "./password.js";
import { sendWhatsApp } from "./alerts.js";
import { getPlatformSettings } from "./settings.js";
import "../js/gym.js";
import "../js/footwear.js";

const POSGym = globalThis.POSGym;

function uuid() {
  return crypto.randomUUID();
}

function clip(v, n) {
  return String(v || "").trim().slice(0, n);
}

function digits(v) {
  return String(v || "").replace(/\D/g, "");
}

function todayYmd() {
  return POSGym?.ymdIst?.(new Date()) || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export async function ensureGymSchema() {
  await query(`CREATE TABLE IF NOT EXISTS gym_plans (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    kind VARCHAR(32) NOT NULL DEFAULT 'monthly',
    duration_days INT NOT NULL DEFAULT 30,
    price DECIMAL(12,2) NOT NULL DEFAULT 0,
    admission_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst_rate DECIMAL(8,2) NOT NULL DEFAULT 0,
    sessions INT NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    description TEXT NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS gym_trainers (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    mobile VARCHAR(32) NULL,
    email VARCHAR(160) NULL,
    specialty VARCHAR(80) NULL,
    commission_pct DECIMAL(8,2) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    photo_url TEXT NULL,
    notes TEXT NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS gym_members (
    id VARCHAR(255) PRIMARY KEY,
    member_no VARCHAR(32) NOT NULL,
    customer_id VARCHAR(255) NULL,
    name VARCHAR(180) NOT NULL,
    mobile VARCHAR(32) NULL,
    email VARCHAR(160) NULL,
    photo_url TEXT NULL,
    gender VARCHAR(16) NULL,
    dob DATE NULL,
    emergency_name VARCHAR(180) NULL,
    emergency_mobile VARCHAR(32) NULL,
    trainer_id VARCHAR(255) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    password_hash VARCHAR(255) NULL,
    notes TEXT NULL,
    branch_id VARCHAR(255) NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id), INDEX (member_no), INDEX (mobile)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS gym_memberships (
    id VARCHAR(255) PRIMARY KEY,
    member_id VARCHAR(255) NOT NULL,
    plan_id VARCHAR(255) NULL,
    plan_name VARCHAR(180) NOT NULL,
    kind VARCHAR(32) NOT NULL DEFAULT 'monthly',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    admission_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    paid DECIMAL(12,2) NOT NULL DEFAULT 0,
    due DECIMAL(12,2) NOT NULL DEFAULT 0,
    method VARCHAR(32) NOT NULL DEFAULT 'upi',
    coupon VARCHAR(40) NULL,
    receipt_no VARCHAR(32) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    notes TEXT NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (member_id), INDEX (business_id), INDEX (end_date)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS gym_attendance (
    id VARCHAR(255) PRIMARY KEY,
    member_id VARCHAR(255) NOT NULL,
    check_in TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    check_out TIMESTAMP(3) NULL,
    source VARCHAR(16) NOT NULL DEFAULT 'manual',
    business_id VARCHAR(255) NOT NULL,
    INDEX (member_id), INDEX (business_id), INDEX (check_in)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS gym_trainer_attendance (
    id VARCHAR(255) PRIMARY KEY,
    trainer_id VARCHAR(255) NOT NULL,
    check_in TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    check_out TIMESTAMP(3) NULL,
    business_id VARCHAR(255) NOT NULL,
    INDEX (trainer_id), INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS gym_measurements (
    id VARCHAR(255) PRIMARY KEY,
    member_id VARCHAR(255) NOT NULL,
    measured_at DATE NOT NULL,
    weight_kg DECIMAL(8,2) NOT NULL DEFAULT 0,
    height_cm DECIMAL(8,2) NOT NULL DEFAULT 0,
    bmi DECIMAL(8,2) NOT NULL DEFAULT 0,
    chest DECIMAL(8,2) NULL,
    waist DECIMAL(8,2) NULL,
    hip DECIMAL(8,2) NULL,
    arms DECIMAL(8,2) NULL,
    photo_before TEXT NULL,
    photo_after TEXT NULL,
    notes TEXT NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (member_id), INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS gym_programs (
    id VARCHAR(255) PRIMARY KEY,
    member_id VARCHAR(255) NOT NULL,
    kind VARCHAR(16) NOT NULL DEFAULT 'workout',
    title VARCHAR(180) NOT NULL,
    body TEXT NULL,
    trainer_id VARCHAR(255) NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (member_id), INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS gym_sessions (
    id VARCHAR(255) PRIMARY KEY,
    token_hash VARCHAR(64) NOT NULL,
    member_id VARCHAR(255) NOT NULL,
    business_id VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    INDEX (token_hash)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS gym_settings (
    business_id VARCHAR(255) PRIMARY KEY,
    settings_json MEDIUMTEXT NULL,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  )`);
  try {
    await query("ALTER TABLE gym_settings MODIFY settings_json MEDIUMTEXT NULL");
  } catch {
    /* already MEDIUMTEXT */
  }
}

async function seedPlans(shopId) {
  const n = await query("SELECT id FROM gym_plans WHERE business_id=? LIMIT 1", [shopId]);
  if (n[0]) return;
  for (const p of POSGym.defaultPlans()) {
    await query(
      `INSERT INTO gym_plans (id, name, kind, duration_days, price, admission_fee, sessions, status, business_id)
       VALUES (?,?,?,?,?,?,?, 'active', ?)`,
      [uuid(), p.name, p.kind, p.duration_days, p.price, p.admission_fee, p.sessions || 0, shopId],
    );
  }
}

async function nextNo(shopId, name, prefix, start) {
  const rows = await query("SELECT next_value FROM number_sequences WHERE name=? AND business_id=? LIMIT 1", [name, shopId]);
  const next = rows[0] ? Number(rows[0].next_value) : start;
  if (rows[0]) {
    await query("UPDATE number_sequences SET next_value=? WHERE name=? AND business_id=?", [next + 1, name, shopId]);
  } else {
    try {
      await query("INSERT INTO number_sequences (name, next_value, business_id) VALUES (?,?,?)", [name, next + 1, shopId]);
    } catch {
      /* ignore */
    }
  }
  return `${prefix}${next}`;
}

function clipPortalImage(raw, existing) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(s) && s.length <= 1_200_000) return s;
  if (/^(\.\/assets\/|https?:\/\/)/i.test(s)) return s.slice(0, 500);
  if (/\/api\/gym\/public\/[^/]+\/login-image/i.test(s)) return String(existing || "");
  throw new Error("Use a JPG, PNG or WebP under 900 KB for the member portal image");
}

function decodeDataImage(raw) {
  const m = String(raw || "").match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) return null;
  try {
    return { mime: m[1], buf: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}

async function settingsOf(shopId) {
  const rows = await query("SELECT settings_json FROM gym_settings WHERE business_id=?", [shopId]);
  let extra = {};
  try {
    extra = JSON.parse(rows[0]?.settings_json || "{}");
  } catch {
    extra = {};
  }
  return { ...(POSGym.DEFAULT_SETTINGS || { portal_login_image: "" }), ...extra };
}

async function saveSettings(shopId, incoming) {
  const cur = await settingsOf(shopId);
  const next = { ...cur, ...(incoming || {}) };
  if (Object.prototype.hasOwnProperty.call(incoming || {}, "portal_login_image")) {
    next.portal_login_image = clipPortalImage(incoming.portal_login_image, cur.portal_login_image);
  }
  await query(
    `INSERT INTO gym_settings (business_id, settings_json) VALUES (?,?)
     ON DUPLICATE KEY UPDATE settings_json=VALUES(settings_json)`,
    [shopId, JSON.stringify(next)],
  );
  return settingsOf(shopId);
}

function publicSettings(shopId, settings) {
  const custom = String(settings?.portal_login_image || "").trim();
  return {
    portal_login_image: custom ? `/api/gym/public/${encodeURIComponent(shopId)}/login-image` : "",
  };
}

function publicMember(row) {
  if (!row) return null;
  return {
    id: row.id,
    member_no: row.member_no,
    name: row.name,
    mobile: row.mobile,
    email: row.email,
    status: row.status,
    trainer_id: row.trainer_id,
    photo_url: row.photo_url,
  };
}

async function latestMembership(memberId, shopId) {
  const rows = await query(
    "SELECT * FROM gym_memberships WHERE member_id=? AND business_id=? ORDER BY end_date DESC, created_at DESC LIMIT 1",
    [memberId, shopId],
  );
  return rows[0] || null;
}

function withStatus(member, membership, day) {
  const frozen = member.status === "frozen";
  const status = frozen ? "frozen" : POSGym.memberStatus({ ...member, end_date: membership?.end_date }, day);
  const { password_hash: _hash, ...safe } = member || {};
  return { ...safe, status, membership, qr: POSGym.qrPayload(member.business_id, member.id) };
}

async function bumpOutstanding(customerId, shopId, delta) {
  if (!customerId || !delta) return;
  await query("UPDATE customers SET outstanding = GREATEST(0, COALESCE(outstanding,0) + ?) WHERE id=? AND business_id=?", [
    delta,
    customerId,
    shopId,
  ]);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function bearer(req) {
  const h = String(req.headers.authorization || "");
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return String(req.headers["x-gym-token"] || "").trim();
}

async function issueSession(memberId, shopId) {
  const token = crypto.randomBytes(24).toString("hex");
  await query(
    `INSERT INTO gym_sessions (id, token_hash, member_id, business_id, expires_at)
     VALUES (?,?,?,?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
    [uuid(), hashToken(token), memberId, shopId],
  );
  return token;
}

async function memberFromToken(req, shopId) {
  const token = bearer(req);
  if (!token) return null;
  const rows = await query(
    `SELECT m.* FROM gym_sessions s JOIN gym_members m ON m.id=s.member_id
     WHERE s.token_hash=? AND s.business_id=? AND s.expires_at > NOW() LIMIT 1`,
    [hashToken(token), shopId],
  );
  return rows[0] || null;
}

async function shopRow(id) {
  const rows = await query("SELECT id, name, category, business_type, address, mobile FROM businesses WHERE id=? LIMIT 1", [id]);
  return rows[0] || null;
}

async function boardStats(shopId) {
  const day = todayYmd();
  const count = async (sql, args) => Number((await query(sql, args))[0]?.n || 0);
  const members = await query("SELECT id, status FROM gym_members WHERE business_id=?", [shopId]);
  let active = 0;
  let expired = 0;
  for (const m of members) {
    const mem = await latestMembership(m.id, shopId);
    const st = m.status === "frozen" ? "frozen" : POSGym.memberStatus({ end_date: mem?.end_date, status: m.status }, day);
    if (st === "active") active += 1;
    if (st === "expired") expired += 1;
  }
  return {
    totalMembers: members.length,
    activeMembers: active,
    expiredMembers: expired,
    todayCheckins: await count(
      `SELECT COUNT(*) n FROM gym_attendance WHERE business_id=? AND DATE(check_in)=CURDATE()`,
      [shopId],
    ),
    todayCollection: await count(
      `SELECT COALESCE(SUM(paid),0) n FROM gym_memberships WHERE business_id=? AND DATE(created_at)=CURDATE()`,
      [shopId],
    ),
    monthlyRevenue: await count(
      `SELECT COALESCE(SUM(paid),0) n FROM gym_memberships WHERE business_id=? AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
      [shopId],
    ),
    pendingDues: await count(`SELECT COALESCE(SUM(due),0) n FROM gym_memberships WHERE business_id=? AND due>0`, [shopId]),
    renewals: await count(
      `SELECT COUNT(*) n FROM gym_memberships WHERE business_id=? AND DATE(created_at)=CURDATE() AND notes LIKE 'renew%'`,
      [shopId],
    ),
    newRegistrations: await count(`SELECT COUNT(*) n FROM gym_members WHERE business_id=? AND DATE(created_at)=CURDATE()`, [shopId]),
  };
}

export function registerGymPublic(app) {
  app.get("/api/gym/public/:shopId", async (req, res) => {
    try {
      await ensureGymSchema();
      const shop = await shopRow(req.params.shopId);
      if (!shop || !POSGym.isGymShop(shop)) return res.status(404).json({ error: "Gym not found" });
      await seedPlans(shop.id);
      const plans = await query("SELECT id, name, kind, duration_days, price, admission_fee, sessions FROM gym_plans WHERE business_id=? AND status='active'", [shop.id]);
      const trainers = await query("SELECT id, name, specialty FROM gym_trainers WHERE business_id=? AND status='active'", [shop.id]);
      const settings = publicSettings(shop.id, await settingsOf(shop.id));
      res.json({ shop, plans, trainers, services: POSGym.SERVICES, pay: POSGym.PAY_MODES, settings });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/gym/public/:shopId/login-image", async (req, res) => {
    try {
      await ensureGymSchema();
      const shop = await shopRow(req.params.shopId);
      if (!shop || !POSGym.isGymShop(shop)) return res.status(404).json({ error: "Gym not found" });
      const settings = await settingsOf(shop.id);
      const raw = String(settings.portal_login_image || "").trim();
      const decoded = decodeDataImage(raw);
      if (decoded) {
        res.setHeader("Cache-Control", "public, max-age=3600");
        return res.type(decoded.mime).send(decoded.buf);
      }
      if (/^https?:\/\//i.test(raw) || /^\.\/assets\//i.test(raw)) return res.redirect(raw);
      return res.status(404).json({ error: "Image not found" });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/gym/public/:shopId/register", async (req, res) => {
    try {
      await ensureGymSchema();
      const shopId = req.params.shopId;
      const shop = await shopRow(shopId);
      if (!shop) throw new Error("Gym not found");
      const name = clip(req.body.name, 180);
      const mobile = digits(req.body.mobile).slice(-10);
      const email = clip(req.body.email, 160).toLowerCase();
      const password = String(req.body.password || "");
      if (!name || mobile.length < 10 || password.length < 6) throw new Error("Name, 10-digit mobile, and a 6+ character password are required");
      const exists = await query("SELECT * FROM gym_members WHERE business_id=? AND mobile=? LIMIT 1", [shopId, mobile]);
      if (exists[0]) {
        if (exists[0].password_hash) throw new Error("This mobile is already registered");
        const hash = await hashPassword(password);
        await query(
          `UPDATE gym_members SET password_hash=?, name=?, email=?, gender=?, emergency_name=?, emergency_mobile=? WHERE id=? AND business_id=?`,
          [
            hash,
            name,
            email,
            clip(req.body.gender, 16),
            clip(req.body.emergency_name, 180),
            digits(req.body.emergency_mobile).slice(-10),
            exists[0].id,
            shopId,
          ],
        );
        const token = await issueSession(exists[0].id, shopId);
        return res.json({
          token,
          member: {
            id: exists[0].id,
            member_no: exists[0].member_no,
            name,
            mobile,
            email,
            status: exists[0].status,
            qr: POSGym.qrPayload(shopId, exists[0].id),
          },
        });
      }
      const id = uuid();
      const memberNo = await nextNo(shopId, "gym_member", "GY-", 1001);
      const hash = await hashPassword(password);
      let customerId = null;
      try {
        customerId = uuid();
        await query(
          `INSERT INTO customers (id, code, name, mobile, email, password_hash, type, outstanding, business_id)
           VALUES (?,?,?,?,?,?,'b2c',0,?)`,
          [customerId, memberNo, name, mobile, email, hash, shopId],
        );
      } catch {
        customerId = null;
      }
      await query(
        `INSERT INTO gym_members (id, member_no, customer_id, name, mobile, email, gender, emergency_name, emergency_mobile, trainer_id, status, password_hash, business_id)
         VALUES (?,?,?,?,?,?,?,?,?,?, 'active', ?, ?)`,
        [
          id,
          memberNo,
          customerId,
          name,
          mobile,
          email,
          clip(req.body.gender, 16),
          clip(req.body.emergency_name, 180),
          digits(req.body.emergency_mobile).slice(-10),
          clip(req.body.trainer_id, 64) || null,
          hash,
          shopId,
        ],
      );
      const token = await issueSession(id, shopId);
      res.json({ token, member: { id, member_no: memberNo, name, mobile, email, status: "active", qr: POSGym.qrPayload(shopId, id) } });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/gym/public/:shopId/login", async (req, res) => {
    try {
      await ensureGymSchema();
      const idn = clip(req.body.mobile || req.body.email, 160);
      const password = String(req.body.password || "");
      const rows = await query(
        `SELECT * FROM gym_members WHERE business_id=? AND (mobile=? OR email=?) LIMIT 1`,
        [req.params.shopId, digits(idn).slice(-10), idn.toLowerCase()],
      );
      const m = rows[0];
      if (!m?.password_hash || !(await verifyPassword(password, m.password_hash))) throw new Error("Mobile/email or password is wrong");
      const token = await issueSession(m.id, req.params.shopId);
      const membership = await latestMembership(m.id, req.params.shopId);
      res.json({ token, member: withStatus(publicMember(m), membership, todayYmd()) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/gym/public/:shopId/me", async (req, res) => {
    try {
      await ensureGymSchema();
      const m = await memberFromToken(req, req.params.shopId);
      if (!m) return res.status(401).json({ error: "Sign in required" });
      const membership = await latestMembership(m.id, req.params.shopId);
      const programs = await query("SELECT * FROM gym_programs WHERE member_id=? ORDER BY created_at DESC LIMIT 20", [m.id]);
      const measures = await query("SELECT * FROM gym_measurements WHERE member_id=? ORDER BY measured_at DESC LIMIT 20", [m.id]);
      res.json({ member: withStatus(publicMember(m), membership, todayYmd()), membership, programs, measurements: measures, plans: await query("SELECT id, name, kind, duration_days, price, admission_fee FROM gym_plans WHERE business_id=? AND status='active'", [req.params.shopId]) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/gym/public/:shopId/renew", async (req, res) => {
    try {
      await ensureGymSchema();
      const m = await memberFromToken(req, req.params.shopId);
      if (!m) return res.status(401).json({ error: "Sign in required" });
      const billed = await billMembership(req.params.shopId, m, req.body || {}, "renew");
      res.json(billed);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/gym/public/:shopId/checkin", async (req, res) => {
    try {
      await ensureGymSchema();
      const parsed = POSGym.parseQr(req.body.qr || req.body.code);
      const memberId = parsed?.memberId || clip(req.body.member_id, 64) || clip(req.body.qr || req.body.code, 64);
      if (!memberId) throw new Error("Scan a member QR code");
      const m = (
        await query(
          "SELECT * FROM gym_members WHERE business_id=? AND (id=? OR member_no=?) LIMIT 1",
          [req.params.shopId, memberId, memberId],
        )
      )[0];
      if (!m) throw new Error("Member not found");
      const membership = await latestMembership(m.id, req.params.shopId);
      const st = withStatus(m, membership, todayYmd()).status;
      if (st === "frozen") throw new Error("Membership is frozen");
      if (st === "expired") throw new Error("Membership expired — renew before check-in");
      const open = await query(
        "SELECT id FROM gym_attendance WHERE member_id=? AND check_out IS NULL ORDER BY check_in DESC LIMIT 1",
        [m.id],
      );
      if (open[0]) {
        await query("UPDATE gym_attendance SET check_out=CURRENT_TIMESTAMP(3) WHERE id=?", [open[0].id]);
        return res.json({ ok: true, action: "checkout", member: publicMember(m) });
      }
      await query(
        `INSERT INTO gym_attendance (id, member_id, source, business_id) VALUES (?,?, 'qr', ?)`,
        [uuid(), m.id, req.params.shopId],
      );
      res.json({ ok: true, action: "checkin", member: publicMember(m) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
}

async function billMembership(shopId, member, body, note) {
  const plan = (await query("SELECT * FROM gym_plans WHERE id=? AND business_id=?", [clip(body.plan_id, 64), shopId]))[0];
  if (!plan) throw new Error("Select a membership plan");
  const start = clip(body.start_date, 10) || todayYmd();
  const win = POSGym.membershipWindow(start, plan.kind, plan.duration_days);
  const totals = POSGym.billTotals({
    planPrice: plan.price,
    admissionFee: note === "renew" ? 0 : Number(body.admission_fee != null ? body.admission_fee : plan.admission_fee),
    discount: body.discount,
    paid: body.paid,
  });
  const id = uuid();
  const receipt = await nextNo(shopId, "gym_receipt", "GYR-", 1001);
  await query(
    `INSERT INTO gym_memberships (id, member_id, plan_id, plan_name, kind, start_date, end_date, amount, admission_fee, discount, total, paid, due, method, coupon, receipt_no, status, notes, business_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'active', ?, ?)`,
    [
      id,
      member.id,
      plan.id,
      plan.name,
      plan.kind,
      win.start_date,
      win.end_date,
      totals.plan,
      totals.admission,
      totals.discount,
      totals.total,
      totals.paid,
      totals.due,
      clip(body.method, 32) || "upi",
      clip(body.coupon, 40),
      receipt,
      note || "new",
      shopId,
    ],
  );
  await query("UPDATE gym_members SET status='active' WHERE id=?", [member.id]);
  await bumpOutstanding(member.customer_id, shopId, totals.due);
  return { id, receipt_no: receipt, ...win, ...totals, plan_name: plan.name };
}

export function registerGymStaff(app) {
  app.use("/api/gym", (req, res, next) => {
    if (String(req.originalUrl || req.path || "").includes("/gym/public")) return next();
    return requireStaff(req, res, next);
  });

  app.get("/api/gym/board", requirePerm("dashboard"), async (_req, res) => {
    try {
      await ensureGymSchema();
      await seedPlans(bid());
      const stats = await boardStats(bid());
      const expiring = await query(
        `SELECT m.id, m.member_no, m.name, m.mobile, x.end_date, x.due
         FROM gym_members m
         JOIN gym_memberships x ON x.member_id=m.id
         WHERE m.business_id=? AND x.end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
         ORDER BY x.end_date LIMIT 40`,
        [bid()],
      );
      res.json({ stats, cards: POSGym.dashboardCards(stats), expiring, reports: POSGym.REPORTS, services: POSGym.SERVICES });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/gym/settings", requirePerm("items"), async (_req, res) => {
    try {
      await ensureGymSchema();
      const shopId = bid();
      const settings = await settingsOf(shopId);
      res.json({ ...settings, ...publicSettings(shopId, settings) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/gym/settings", requirePerm("items"), async (req, res) => {
    try {
      await ensureGymSchema();
      const shopId = bid();
      const settings = await saveSettings(shopId, req.body || {});
      res.json({ ok: true, ...settings, ...publicSettings(shopId, settings) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/gym/plans", requirePerm("items"), async (_req, res) => {
    try {
      await ensureGymSchema();
      await seedPlans(bid());
      res.json(await query("SELECT * FROM gym_plans WHERE business_id=? ORDER BY duration_days, name", [bid()]));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/gym/plans", requirePerm("items"), async (req, res) => {
    try {
      await ensureGymSchema();
      const b = req.body || {};
      const id = b.id || uuid();
      const kind = clip(b.kind, 32) || "custom";
      const days = POSGym.planDurationDays(kind, b.duration_days);
      const fields = [clip(b.name, 180) || "Plan", kind, days, Number(b.price) || 0, Number(b.admission_fee) || 0, Number(b.gst_rate) || 0, Number(b.sessions) || 0, clip(b.status, 16) || "active", clip(b.description, 2000)];
      const exists = (await query("SELECT id FROM gym_plans WHERE id=? AND business_id=?", [id, bid()]))[0];
      if (exists) {
        await query(
          `UPDATE gym_plans SET name=?, kind=?, duration_days=?, price=?, admission_fee=?, gst_rate=?, sessions=?, status=?, description=? WHERE id=? AND business_id=?`,
          [...fields, id, bid()],
        );
      } else {
        await query(
          `INSERT INTO gym_plans (id, name, kind, duration_days, price, admission_fee, gst_rate, sessions, status, description, business_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [id, ...fields, bid()],
        );
      }
      res.json({ ok: true, id });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/gym/trainers", requirePerm("staff"), async (_req, res) => {
    try {
      await ensureGymSchema();
      const rows = await query("SELECT * FROM gym_trainers WHERE business_id=? ORDER BY name", [bid()]);
      const counts = await query("SELECT trainer_id, COUNT(*) n FROM gym_members WHERE business_id=? AND trainer_id IS NOT NULL GROUP BY trainer_id", [bid()]);
      const map = Object.fromEntries(counts.map((c) => [c.trainer_id, Number(c.n)]));
      res.json(rows.map((t) => ({ ...t, members: map[t.id] || 0 })));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/gym/trainers", requirePerm("staff"), async (req, res) => {
    try {
      await ensureGymSchema();
      const b = req.body || {};
      const id = b.id || uuid();
      const fields = [clip(b.name, 180), digits(b.mobile).slice(-10), clip(b.email, 160), clip(b.specialty, 80), Number(b.commission_pct) || 0, clip(b.status, 16) || "active", clip(b.photo_url, 4000), clip(b.notes, 2000)];
      const exists = (await query("SELECT id FROM gym_trainers WHERE id=? AND business_id=?", [id, bid()]))[0];
      if (exists) {
        await query(
          `UPDATE gym_trainers SET name=?, mobile=?, email=?, specialty=?, commission_pct=?, status=?, photo_url=?, notes=? WHERE id=? AND business_id=?`,
          [...fields, id, bid()],
        );
      } else {
        await query(
          `INSERT INTO gym_trainers (id, name, mobile, email, specialty, commission_pct, status, photo_url, notes, business_id)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [id, ...fields, bid()],
        );
      }
      res.json({ ok: true, id });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/gym/members", requirePerm("customers"), async (req, res) => {
    try {
      await ensureGymSchema();
      const q = clip(req.query.q, 80).toLowerCase();
      const status = clip(req.query.status, 16);
      let rows = await query("SELECT * FROM gym_members WHERE business_id=? ORDER BY created_at DESC LIMIT 400", [bid()]);
      const day = todayYmd();
      const out = [];
      for (const m of rows) {
        const membership = await latestMembership(m.id, bid());
        const row = withStatus(m, membership, day);
        if (status && row.status !== status) continue;
        if (q && !`${row.name} ${row.mobile} ${row.member_no}`.toLowerCase().includes(q)) continue;
        out.push(row);
      }
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/gym/members", requirePerm("customers"), async (req, res) => {
    try {
      await ensureGymSchema();
      const b = req.body || {};
      const name = clip(b.name, 180);
      const mobile = digits(b.mobile).slice(-10);
      if (!name || mobile.length < 10) throw new Error("Name and 10-digit mobile are required");
      const id = b.id || uuid();
      const dup = (await query("SELECT id FROM gym_members WHERE business_id=? AND mobile=? AND id<>? LIMIT 1", [bid(), mobile, id]))[0];
      if (dup) throw new Error("This mobile is already registered");
      const exists = (await query("SELECT * FROM gym_members WHERE id=? AND business_id=?", [id, bid()]))[0];
      if (exists) {
        await query(
          `UPDATE gym_members SET name=?, mobile=?, email=?, photo_url=?, gender=?, dob=?, emergency_name=?, emergency_mobile=?, trainer_id=?, notes=? WHERE id=? AND business_id=?`,
          [
            name,
            mobile,
            clip(b.email, 160),
            clip(b.photo_url, 4000),
            clip(b.gender, 16),
            clip(b.dob, 10) || null,
            clip(b.emergency_name, 180),
            digits(b.emergency_mobile).slice(-10),
            clip(b.trainer_id, 64) || null,
            clip(b.notes, 2000),
            id,
            bid(),
          ],
        );
        return res.json({ ok: true, id, member_no: exists.member_no });
      }
      const memberNo = await nextNo(bid(), "gym_member", "GY-", 1001);
      let customerId = uuid();
      try {
        await query(
          `INSERT INTO customers (id, code, name, mobile, email, type, outstanding, business_id) VALUES (?,?,?,?,?,'b2c',0,?)`,
          [customerId, memberNo, name, mobile, clip(b.email, 160), bid()],
        );
      } catch {
        customerId = null;
      }
      await query(
        `INSERT INTO gym_members (id, member_no, customer_id, name, mobile, email, photo_url, gender, dob, emergency_name, emergency_mobile, trainer_id, status, notes, business_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'active', ?, ?)`,
        [
          id,
          memberNo,
          customerId,
          name,
          mobile,
          clip(b.email, 160),
          clip(b.photo_url, 4000),
          clip(b.gender, 16),
          clip(b.dob, 10) || null,
          clip(b.emergency_name, 180),
          digits(b.emergency_mobile).slice(-10),
          clip(b.trainer_id, 64) || null,
          clip(b.notes, 2000),
          bid(),
        ],
      );
      res.json({ ok: true, id, member_no: memberNo, qr: POSGym.qrPayload(bid(), id) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/gym/members/:id/status", requirePerm("customers"), async (req, res) => {
    try {
      const status = clip(req.body.status, 16);
      if (!["active", "expired", "frozen"].includes(status)) throw new Error("Status must be Active, Expired, or Frozen");
      await query("UPDATE gym_members SET status=? WHERE id=? AND business_id=?", [status, req.params.id, bid()]);
      res.json({ ok: true, status });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/gym/members/:id/bill", requirePerm("orders"), async (req, res) => {
    try {
      await ensureGymSchema();
      const m = (await query("SELECT * FROM gym_members WHERE id=? AND business_id=?", [req.params.id, bid()]))[0];
      if (!m) throw new Error("Member not found");
      const billed = await billMembership(bid(), m, req.body || {}, clip(req.body.kind, 16) || "new");
      res.json(billed);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/gym/attendance", requirePerm("orders"), async (req, res) => {
    try {
      await ensureGymSchema();
      const day = clip(req.query.date, 10) || todayYmd();
      const rows = await query(
        `SELECT a.*, m.name, m.member_no FROM gym_attendance a
         JOIN gym_members m ON m.id=a.member_id
         WHERE a.business_id=? AND DATE(a.check_in)=? ORDER BY a.check_in DESC LIMIT 400`,
        [bid(), day],
      );
      if (clip(req.query.report, 16) === "absent") {
        const present = new Set(rows.map((r) => r.member_id));
        const members = await query("SELECT id, member_no, name, status FROM gym_members WHERE business_id=?", [bid()]);
        const absent = [];
        for (const m of members) {
          if (present.has(m.id)) continue;
          const membership = await latestMembership(m.id, bid());
          const st = withStatus(m, membership, day).status;
          if (st === "active") absent.push({ ...m, status: st, date: day });
        }
        return res.json(absent);
      }
      res.json(rows);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/gym/attendance/checkin", requirePerm("orders"), async (req, res) => {
    try {
      await ensureGymSchema();
      const parsed = POSGym.parseQr(req.body.qr || req.body.code);
      const memberId = parsed?.memberId || clip(req.body.member_id, 64) || clip(req.body.qr || req.body.code, 64);
      if (!memberId) throw new Error("Scan a member QR code");
      const m = (
        await query("SELECT * FROM gym_members WHERE business_id=? AND (id=? OR member_no=?) LIMIT 1", [bid(), memberId, memberId])
      )[0];
      if (!m) throw new Error("Member not found");
      const membership = await latestMembership(m.id, bid());
      const st = withStatus(m, membership, todayYmd()).status;
      if (st === "frozen") throw new Error("Membership is frozen");
      if (st === "expired") throw new Error("Membership expired — renew before check-in");
      const open = await query("SELECT id FROM gym_attendance WHERE member_id=? AND check_out IS NULL ORDER BY check_in DESC LIMIT 1", [m.id]);
      if (open[0]) {
        await query("UPDATE gym_attendance SET check_out=CURRENT_TIMESTAMP(3) WHERE id=?", [open[0].id]);
        return res.json({ ok: true, action: "checkout", member: publicMember(m) });
      }
      await query(`INSERT INTO gym_attendance (id, member_id, source, business_id) VALUES (?,?,?,?)`, [
        uuid(),
        m.id,
        clip(req.body.source, 16) || "manual",
        bid(),
      ]);
      res.json({ ok: true, action: "checkin", member: publicMember(m) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/gym/expiry", requirePerm("dashboard"), async (_req, res) => {
    try {
      await ensureGymSchema();
      const rows = await query(
        `SELECT m.id, m.member_no, m.name, m.mobile, m.status, x.plan_name, x.end_date, x.due
         FROM gym_members m
         LEFT JOIN gym_memberships x ON x.id=(
           SELECT y.id FROM gym_memberships y WHERE y.member_id=m.id ORDER BY y.end_date DESC LIMIT 1
         )
         WHERE m.business_id=? ORDER BY x.end_date IS NULL, x.end_date LIMIT 400`,
        [bid()],
      );
      const day = todayYmd();
      res.json(
        rows.map((r) => ({
          ...r,
          status: r.status === "frozen" ? "frozen" : POSGym.memberStatus(r, day),
        })),
      );
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/gym/reminders", requirePerm("dashboard"), async (_req, res) => {
    try {
      await ensureGymSchema();
      const rows = await query(
        `SELECT m.name, m.mobile, m.member_no, x.end_date
         FROM gym_members m
         JOIN gym_memberships x ON x.member_id=m.id
         WHERE m.business_id=? AND x.end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)`,
        [bid()],
      );
      const cfg = await getPlatformSettings();
      let sent = 0;
      for (const r of rows) {
        if (!r.mobile) continue;
        const msg = POSGym.noticeCopy("reminder", r);
        try {
          await sendWhatsApp(cfg, [r.mobile], msg);
          sent += 1;
        } catch {
          /* skip */
        }
      }
      res.json({ ok: true, sent, queued: rows.length });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/gym/measurements", requirePerm("customers"), async (req, res) => {
    try {
      await ensureGymSchema();
      const memberId = clip(req.query.member_id, 64);
      const rows = memberId
        ? await query("SELECT * FROM gym_measurements WHERE member_id=? AND business_id=? ORDER BY measured_at DESC LIMIT 80", [memberId, bid()])
        : await query("SELECT * FROM gym_measurements WHERE business_id=? ORDER BY measured_at DESC LIMIT 80", [bid()]);
      res.json(rows);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/gym/measurements", requirePerm("customers"), async (req, res) => {
    try {
      await ensureGymSchema();
      const b = req.body || {};
      const memberId = clip(b.member_id, 64);
      if (!memberId) throw new Error("Member is required");
      const weight = Number(b.weight_kg) || 0;
      const height = Number(b.height_cm) || 0;
      await query(
        `INSERT INTO gym_measurements (id, member_id, measured_at, weight_kg, height_cm, bmi, chest, waist, hip, arms, photo_before, photo_after, notes, business_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          uuid(),
          memberId,
          clip(b.measured_at, 10) || todayYmd(),
          weight,
          height,
          POSGym.bmi(weight, height),
          Number(b.chest) || null,
          Number(b.waist) || null,
          Number(b.hip) || null,
          Number(b.arms) || null,
          clip(b.photo_before, 4000),
          clip(b.photo_after, 4000),
          clip(b.notes, 2000),
          bid(),
        ],
      );
      res.json({ ok: true, bmi: POSGym.bmi(weight, height) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/gym/programs", requirePerm("customers"), async (req, res) => {
    try {
      await ensureGymSchema();
      const memberId = clip(req.query.member_id, 64);
      const rows = memberId
        ? await query("SELECT * FROM gym_programs WHERE member_id=? AND business_id=? ORDER BY created_at DESC", [memberId, bid()])
        : await query("SELECT * FROM gym_programs WHERE business_id=? ORDER BY created_at DESC LIMIT 80", [bid()]);
      res.json(rows);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/gym/programs", requirePerm("customers"), async (req, res) => {
    try {
      await ensureGymSchema();
      const b = req.body || {};
      const memberId = clip(b.member_id, 64);
      const title = clip(b.title, 180);
      if (!memberId || !title) throw new Error("Member and plan title are required");
      await query(
        `INSERT INTO gym_programs (id, member_id, kind, title, body, trainer_id, business_id) VALUES (?,?,?,?,?,?,?)`,
        [uuid(), memberId, clip(b.kind, 16) || "workout", title, clip(b.body, 8000), clip(b.trainer_id, 64) || null, bid()],
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/gym/trainers/:id/members", requirePerm("staff"), async (req, res) => {
    try {
      await ensureGymSchema();
      const rows = await query(
        "SELECT id, member_no, name, mobile, status FROM gym_members WHERE trainer_id=? AND business_id=? ORDER BY name",
        [clip(req.params.id, 64), bid()],
      );
      res.json(rows);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/gym/trainers/attendance", requirePerm("staff"), async (req, res) => {
    try {
      await ensureGymSchema();
      const day = clip(req.query.date, 10) || todayYmd();
      res.json(
        await query(
          `SELECT a.*, t.name FROM gym_trainer_attendance a
           JOIN gym_trainers t ON t.id=a.trainer_id
           WHERE a.business_id=? AND DATE(a.check_in)=? ORDER BY a.check_in DESC`,
          [bid(), day],
        ),
      );
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/gym/trainers/:id/attendance", requirePerm("staff"), async (req, res) => {
    try {
      await ensureGymSchema();
      const trainerId = clip(req.params.id, 64);
      const t = (await query("SELECT * FROM gym_trainers WHERE id=? AND business_id=?", [trainerId, bid()]))[0];
      if (!t) throw new Error("Trainer not found");
      const open = await query(
        "SELECT id FROM gym_trainer_attendance WHERE trainer_id=? AND check_out IS NULL ORDER BY check_in DESC LIMIT 1",
        [trainerId],
      );
      if (open[0]) {
        await query("UPDATE gym_trainer_attendance SET check_out=CURRENT_TIMESTAMP(3) WHERE id=?", [open[0].id]);
        return res.json({ ok: true, action: "checkout", trainer: t });
      }
      await query("INSERT INTO gym_trainer_attendance (id, trainer_id, business_id) VALUES (?,?,?)", [uuid(), trainerId, bid()]);
      res.json({ ok: true, action: "checkin", trainer: t });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/gym/reports/:id", requirePerm("reports"), async (req, res) => {
    try {
      await ensureGymSchema();
      const id = clip(req.params.id, 40);
      let rows = [];
      if (id === "gym-members") rows = await query("SELECT member_no, name, mobile, status, created_at FROM gym_members WHERE business_id=? ORDER BY created_at DESC LIMIT 400", [bid()]);
      else if (id === "gym-attendance") rows = await query("SELECT m.member_no, m.name, a.check_in, a.check_out, a.source FROM gym_attendance a JOIN gym_members m ON m.id=a.member_id WHERE a.business_id=? ORDER BY a.check_in DESC LIMIT 400", [bid()]);
      else if (id === "gym-collection" || id === "gym-sales-daily") rows = await query("SELECT receipt_no, plan_name, paid, method, created_at FROM gym_memberships WHERE business_id=? AND DATE(created_at)=CURDATE() ORDER BY created_at DESC", [bid()]);
      else if (id === "gym-sales-monthly") rows = await query("SELECT receipt_no, plan_name, paid, method, created_at FROM gym_memberships WHERE business_id=? AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') ORDER BY created_at DESC", [bid()]);
      else if (id === "gym-sales-yearly") rows = await query("SELECT receipt_no, plan_name, paid, method, created_at FROM gym_memberships WHERE business_id=? AND YEAR(created_at)=YEAR(CURDATE()) ORDER BY created_at DESC", [bid()]);
      else if (id === "gym-dues") rows = await query("SELECT m.member_no, m.name, x.plan_name, x.due, x.end_date FROM gym_memberships x JOIN gym_members m ON m.id=x.member_id WHERE x.business_id=? AND x.due>0 ORDER BY x.due DESC", [bid()]);
      else if (id === "gym-expiry") rows = await query("SELECT m.member_no, m.name, x.plan_name, x.end_date FROM gym_memberships x JOIN gym_members m ON m.id=x.member_id WHERE x.business_id=? ORDER BY x.end_date LIMIT 400", [bid()]);
      else if (id === "gym-trainers") rows = await query("SELECT name, specialty, commission_pct, status FROM gym_trainers WHERE business_id=?", [bid()]);
      else if (id === "gym-expense" || id === "gym-pl") {
        try {
          rows = await query("SELECT expense_date AS date, category, amount, notes FROM expenses WHERE business_id=? ORDER BY expense_date DESC LIMIT 200", [bid()]);
        } catch {
          rows = [];
        }
      }
      res.json({ id, rows });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
}
