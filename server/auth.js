import { query } from "./db.js";
import { hashPassword, verifyPassword } from "./password.js";
import { runTenant } from "./context.js";
import { sha256, newToken, audit } from "./audit.js";
import { defaultPerms, displayName, can } from "./roles.js";
import { registerBusiness } from "./onboard.js";
import { canonApiUrl } from "./http-path.js";

const SESSION_HOURS = 12;
const REMEMBER_DAYS = 30;

function sessionSecs(remember) {
  return remember ? REMEMBER_DAYS * 24 * 3600 : SESSION_HOURS * 3600;
}

function wantsRemember(body) {
  const v = body?.remember;
  return v === true || v === "true" || v === "1" || v === "on";
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function cookieFlags(req) {
  const proto = String(req?.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const secure = process.env.COOKIE_SECURE === "1" || proto === "https";
  return ["HttpOnly", "SameSite=Lax", secure ? "Secure" : ""].filter(Boolean).join("; ");
}

function setCookie(res, name, value, maxAgeSec, req) {
  res.append(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; Path=/; ${cookieFlags(req)}; Max-Age=${maxAgeSec}`,
  );
}

function clearCookie(res, name, req) {
  res.append("Set-Cookie", `${name}=; Path=/; Max-Age=0; ${cookieFlags(req)}`);
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
}

export function parsePerms(user) {
  if (!user) return {};
  if (user.permissions_json) {
    try {
      const parsed = JSON.parse(user.permissions_json);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* ignore */
    }
  }
  return defaultPerms(user.role);
}

export function publicStatus(business) {
  if (!business) return "inactive";
  if (business.status === "suspended" || business.status === "inactive") return business.status;
  if (business.subscription_expires_at) {
    const exp = new Date(business.subscription_expires_at);
    if (!Number.isNaN(exp.getTime()) && exp < new Date()) return "expired";
  }
  return business.status || "active";
}

async function loadStaffSession(token) {
  if (!token) return null;
  const hash = sha256(token);
  const [row] = await query(
    `SELECT s.*, u.email, u.first_name, u.last_name, u.role, u.status AS user_status,
            u.business_id, u.branch_id AS user_branch_id, u.permissions_json, u.clerk_user_id,
            u.locked_until, u.id AS staff_id
     FROM staff_sessions s
     JOIN staff_users u ON u.id = s.staff_user_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
    [hash],
  );
  if (!row) return null;
  if (row.user_status !== "active") return null;
  const [business] = await query("SELECT * FROM businesses WHERE id = ?", [row.business_id]);
  return {
    type: "staff",
    tokenHash: hash,
    sessionId: row.id,
    user: {
      id: row.staff_id,
      clerk_user_id: row.clerk_user_id,
      email: row.email,
      first_name: row.first_name,
      last_name: row.last_name,
      role: row.role,
      business_id: row.business_id,
      branch_id: row.branch_id || row.user_branch_id,
      permissions_json: row.permissions_json,
    },
    business,
    branchId: row.branch_id || row.user_branch_id,
  };
}

async function loadMasterSession(token) {
  if (!token) return null;
  const hash = sha256(token);
  const [row] = await query(
    `SELECT s.*, a.email, a.name, a.status
     FROM platform_sessions s
     JOIN platform_admins a ON a.id = s.admin_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
    [hash],
  );
  if (!row || row.status !== "active") return null;
  return {
    type: "master",
    tokenHash: hash,
    sessionId: row.id,
    admin: { id: row.admin_id, email: row.email, name: row.name },
  };
}

export function attachAuth(req, res, next) {
  const token = cookies(req).pos_sid;
  const masterToken = cookies(req).pos_master;
  const path = canonApiUrl(req.originalUrl || "").split("?")[0];
  const wantMaster = path.startsWith("/api/master");
  Promise.resolve()
    .then(async () => {
      req.auth = null;
      const master = await loadMasterSession(masterToken);
      const staff = await loadStaffSession(token);
      if (wantMaster) req.auth = master || null;
      else if (staff) req.auth = staff;
      else if (master) req.auth = master;
      if (req.auth?.type === "staff") {
        runTenant(
          {
            businessId: req.auth.user.business_id,
            branchId: req.auth.branchId,
            user: req.auth.user,
          },
          () => next(),
        );
        return;
      }
      next();
    })
    .catch(next);
}

export function requireStaff(req, res, next) {
  if (req.auth?.type !== "staff") {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  const status = publicStatus(req.auth.business);
  const open = canonApiUrl(req.originalUrl || "").split("?")[0].startsWith("/api/auth");
  if (!open && status !== "active") {
    res.status(403).json({
      error: "Subscription expired. Ask the platform owner to renew.",
      status,
    });
    return;
  }
  next();
}

export function requireMaster(req, res, next) {
  if (req.auth?.type !== "master") {
    res.status(401).json({ error: "Master admin sign in required" });
    return;
  }
  next();
}

export function requirePerm(module) {
  return (req, res, next) => {
    if (req.auth?.type !== "staff") {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    const perms = parsePerms(req.auth.user);
    if (req.auth.user.role === "business_admin" || can(perms, module)) {
      next();
      return;
    }
    res.status(403).json({ error: "You do not have permission for this module" });
  };
}

async function findStaff(identifier) {
  const id = String(identifier || "").trim();
  if (!id) return null;
  const [row] = await query(
    `SELECT * FROM staff_users
     WHERE LOWER(email) = ? OR username = ? OR mobile = ? OR clerk_user_id = ?
     LIMIT 1`,
    [id.toLowerCase(), id, id, id],
  );
  return row || null;
}

export function registerAuth(app) {
  app.post("/api/auth/login", async (req, res) => {
    const { identifier, password, branchId } = req.body || {};
    try {
      const user = await findStaff(identifier);
      if (!user) {
        res.status(401).json({ error: "Invalid login" });
        return;
      }
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        res.status(423).json({ error: "Account locked. Try later." });
        return;
      }
      if (user.status !== "active") {
        res.status(403).json({ error: "User is inactive" });
        return;
      }
      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) {
        const fails = Number(user.failed_logins || 0) + 1;
        const lock = fails >= 8 ? new Date(Date.now() + 15 * 60 * 1000) : null;
        await query("UPDATE staff_users SET failed_logins = ?, locked_until = ? WHERE id = ?", [
          fails,
          lock,
          user.id,
        ]);
        res.status(401).json({ error: "Invalid login" });
        return;
      }
      const [business] = await query("SELECT * FROM businesses WHERE id = ?", [user.business_id]);
      const status = publicStatus(business);
      if (status === "suspended" || status === "inactive") {
        res.status(403).json({ error: `Business is ${status}` });
        return;
      }
      await query("UPDATE staff_users SET failed_logins = 0, locked_until = NULL WHERE id = ?", [
        user.id,
      ]);
      const ttl = sessionSecs(wantsRemember(req.body));
      const token = newToken();
      const sid = crypto.randomUUID();
      await query(
        `INSERT INTO staff_sessions (id, staff_user_id, token_hash, expires_at, business_id, ip, user_agent, branch_id)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          sid,
          user.id,
          sha256(token),
          new Date(Date.now() + ttl * 1000),
          user.business_id,
          clientIp(req),
          String(req.headers["user-agent"] || "").slice(0, 250),
          branchId || user.branch_id,
        ],
      );
      setCookie(res, "pos_sid", token, ttl, req);
      runTenant({ businessId: user.business_id, branchId: user.branch_id, user }, async () => {
        await audit("User Login", { module: "auth" }, req);
      });
      res.json({
        ok: true,
        expired: status === "expired",
        user: {
          id: user.id,
          email: user.email,
          name: displayName(user),
          role: user.role,
          permissions: parsePerms(user),
        },
        business: {
          id: business?.id,
          name: business?.name,
          status,
          subscription_expires_at: business?.subscription_expires_at,
        },
      });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { user } = await registerBusiness(req.body || {});
      const [business] = await query("SELECT * FROM businesses WHERE id = ?", [user.business_id]);
      const ttl = sessionSecs(wantsRemember(req.body));
      const token = newToken();
      await query(
        `INSERT INTO staff_sessions (id, staff_user_id, token_hash, expires_at, business_id, ip, user_agent, branch_id)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          crypto.randomUUID(),
          user.id,
          sha256(token),
          new Date(Date.now() + ttl * 1000),
          user.business_id,
          clientIp(req),
          String(req.headers["user-agent"] || "").slice(0, 250),
          user.branch_id,
        ],
      );
      setCookie(res, "pos_sid", token, ttl, req);
      res.json({
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          name: displayName(user),
          role: user.role,
        },
        business: { id: business.id, name: business.name, status: "active" },
      });
    } catch (err) {
      const msg = String(err.message || err);
      const dup = /duplicate|already (registered|taken)/i.test(msg);
      res.status(dup ? 409 : 400).json({ error: dup ? "This business or login is already registered" : msg });
    }
  });

  app.post("/api/auth/master-login", async (req, res) => {
    const { email, password } = req.body || {};
    try {
      const [admin] = await query("SELECT * FROM platform_admins WHERE email = ?", [
        String(email || "").toLowerCase().trim(),
      ]);
      if (!admin || admin.status !== "active" || !(await verifyPassword(password, admin.password_hash))) {
        res.status(401).json({ error: "Invalid master login" });
        return;
      }
      const ttl = sessionSecs(wantsRemember(req.body));
      const token = newToken();
      await query(
        `INSERT INTO platform_sessions (id, admin_id, token_hash, expires_at, ip, user_agent)
         VALUES (?,?,?,?,?,?)`,
        [
          crypto.randomUUID(),
          admin.id,
          sha256(token),
          new Date(Date.now() + ttl * 1000),
          clientIp(req),
          String(req.headers["user-agent"] || "").slice(0, 250),
        ],
      );
      setCookie(res, "pos_master", token, ttl, req);
      await query(
        `INSERT INTO staff_audit_logs (
           id, actor_clerk_user_id, actor_name, module, target_name, action, details, business_id, ip
         ) VALUES (?,?,?,?,?,?,?, 'platform', ?)`,
        [
          crypto.randomUUID(),
          admin.id,
          admin.email,
          "master",
          "login",
          "User Login",
          "{}",
          clientIp(req),
        ],
      );
      res.json({ ok: true, admin: { id: admin.id, email: admin.email, name: admin.name } });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    const token = cookies(req).pos_sid;
    const master = cookies(req).pos_master;
    if (token) {
      await query("UPDATE staff_sessions SET revoked_at = NOW() WHERE token_hash = ?", [sha256(token)]);
    }
    if (master) {
      await query("UPDATE platform_sessions SET revoked_at = NOW() WHERE token_hash = ?", [
        sha256(master),
      ]);
    }
    clearCookie(res, "pos_sid", req);
    clearCookie(res, "pos_master", req);
    res.json({ ok: true });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (req.auth?.type === "master") {
      res.json({ ok: true, type: "master", admin: req.auth.admin });
      return;
    }
    if (req.auth?.type === "staff") {
      const status = publicStatus(req.auth.business);
      let plan = null;
      if (req.auth.business?.plan_id) {
        const rows = await query(
          "SELECT id, code, name, fee_monthly FROM subscription_plans WHERE id = ?",
          [req.auth.business.plan_id],
        );
        plan = rows[0] || null;
      }
      res.json({
        ok: true,
        type: "staff",
        user: {
          id: req.auth.user.id,
          email: req.auth.user.email,
          name: displayName(req.auth.user),
          role: req.auth.user.role,
          permissions: parsePerms(req.auth.user),
          branch_id: req.auth.branchId,
        },
        business: {
          id: req.auth.business?.id,
          name: req.auth.business?.name,
          status,
          plan_id: req.auth.business?.plan_id,
          subscription_expires_at: req.auth.business?.subscription_expires_at,
        },
        plan,
      });
      return;
    }
    res.status(401).json({ error: "Not signed in" });
  });

  app.post("/api/auth/reset-password", requireStaff, async (req, res) => {
    const { current, next } = req.body || {};
    if (!next || String(next).length < 8) {
      res.status(400).json({ error: "New password must be at least 8 characters" });
      return;
    }
    try {
      const [user] = await query("SELECT * FROM staff_users WHERE id = ?", [req.auth.user.id]);
      if (!(await verifyPassword(current, user.password_hash))) {
        res.status(400).json({ error: "Current password is wrong" });
        return;
      }
      await query("UPDATE staff_users SET password_hash = ? WHERE id = ?", [
        await hashPassword(next),
        user.id,
      ]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });
}

export { hashPassword };
