import { query } from "./db.js";
import { hashPassword, verifyPassword } from "./password.js";
import { runTenant } from "./context.js";
import { sha256, newToken, audit } from "./audit.js";
import { defaultPerms, displayName, can } from "./roles.js";
import { registerBusiness } from "./onboard.js";
import { sendWelcomeSignup, publicLoginUrl, sendMail } from "./mail.js";
import { notifySignupAdmin, sendWelcomeAlerts } from "./alerts.js";
import { canonApiUrl } from "./http-path.js";
import { normalizeLocale } from "./i18n.js";
import {
  publicStatus,
  subscriptionBlock,
  subscriptionDenial,
  isRenewalApiPath,
  SUBSCRIPTION_EXPIRED_TITLE,
  SUBSCRIPTION_EXPIRED_MESSAGE,
} from "./subscription.js";

export { publicStatus };

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
  const defaults = defaultPerms(user.role);
  let parsed = {};
  if (user.permissions_json) {
    try {
      const p = JSON.parse(user.permissions_json);
      if (p && typeof p === "object") parsed = p;
    } catch {
      /* ignore */
    }
  }
  const out = { ...parsed };
  for (const [key, value] of Object.entries(defaults)) {
    if (out[key] === undefined) out[key] = value;
  }
  return out;
}

async function loadPlan(planId) {
  if (!planId) return null;
  const rows = await query("SELECT id, code, name, fee_monthly FROM subscription_plans WHERE id = ?", [planId]);
  return rows[0] || null;
}

function requestPath(req) {
  return canonApiUrl(req.originalUrl || "", req.headers["x-pos-path"]).split("?")[0];
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
  let impersonator = null;
  if (row.impersonator_admin_id) {
    const [admin] = await query("SELECT id, email, name FROM platform_admins WHERE id = ?", [
      row.impersonator_admin_id,
    ]);
    impersonator = admin || { id: row.impersonator_admin_id };
  }
  return {
    type: "staff",
    tokenHash: hash,
    sessionId: row.id,
    impersonatorAdminId: row.impersonator_admin_id || null,
    impersonator,
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
    `SELECT s.*, a.email, a.name, a.status, a.mobile, a.designation, a.company,
            a.address, a.city, a.district, a.state, a.timezone, a.locale
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
    admin: {
      id: row.admin_id,
      email: row.email,
      name: row.name,
      mobile: row.mobile || "",
      designation: row.designation || "",
      company: row.company || "",
      address: row.address || "",
      city: row.city || "",
      district: row.district || "",
      state: row.state || "",
      timezone: row.timezone || "Asia/Kolkata",
      locale: row.locale || "en",
    },
  };
}

export function attachAuth(req, res, next) {
  const token = cookies(req).pos_sid;
  const masterToken = cookies(req).pos_master;
  const path = canonApiUrl(req.originalUrl || "", req.headers["x-pos-path"]).split("?")[0];
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
  const path = requestPath(req);
  const impersonating = Boolean(req.auth.impersonatorAdminId);
  const allowed =
    impersonating ||
    status === "active" ||
    path.startsWith("/api/auth") ||
    (status === "expired" && isRenewalApiPath(req.method, path)) ||
    !subscriptionBlock(status);
  if (allowed) {
    next();
    return;
  }
  loadPlan(req.auth.business?.plan_id)
    .then((plan) => {
      res.status(403).json(subscriptionDenial(req.auth.business, status, plan));
    })
    .catch(() => {
      res.status(403).json(subscriptionDenial(req.auth.business, status, null));
    });
}

export function requireMaster(req, res, next) {
  if (req.auth?.type !== "master") {
    res.status(401).json({ error: "Master admin sign in required" });
    return;
  }
  next();
}

export function requirePerm(module) {
  return requirePermAny(module);
}

export function requirePermAny(...modules) {
  const list = modules.flat().filter(Boolean);
  return (req, res, next) => {
    if (req.auth?.type !== "staff") {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    const perms = parsePerms(req.auth.user);
    if (req.auth.user.role === "business_admin" || list.some((module) => can(perms, module))) {
      next();
      return;
    }
    res.status(403).json({ error: "You do not have permission for this module" });
  };
}

export function requireBusinessAdmin(req, res, next) {
  if (req.auth?.type !== "staff") {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  if (req.auth.user.role !== "business_admin") {
    res.status(403).json({ error: "Only the business admin can manage tables and floors" });
    return;
  }
  next();
}

function staffEmail(user) {
  const email = String(user?.email || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function sameHash(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
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

export async function issueStaffSession(req, res, { user, business, branchId, impersonatorAdminId }) {
  const oldToken = cookies(req).pos_sid;
  if (oldToken) {
    await query("UPDATE staff_sessions SET revoked_at = NOW() WHERE token_hash = ?", [sha256(oldToken)]);
  }
  const ttl = sessionSecs(false);
  const token = newToken();
  const sid = crypto.randomUUID();
  await query(
    `INSERT INTO staff_sessions (id, staff_user_id, token_hash, expires_at, business_id, ip, user_agent, branch_id, impersonator_admin_id)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      sid,
      user.id,
      sha256(token),
      new Date(Date.now() + ttl * 1000),
      user.business_id,
      clientIp(req),
      String(req.headers["user-agent"] || "").slice(0, 250),
      branchId || user.branch_id,
      impersonatorAdminId || null,
    ],
  );
  await query("UPDATE staff_sessions SET last_seen_at = NOW() WHERE id = ?", [sid]);
  setCookie(res, "pos_sid", token, ttl, req);
  return { token, ttl, sessionId: sid };
}

export function registerAuth(app) {
  app.post("/api/session/pulse", async (req, res) => {
    const token = cookies(req).pos_sid;
    if (!token) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    const staff = await loadStaffSession(token);
    if (!staff) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    await query(
      `UPDATE staff_sessions SET last_seen_at = NOW()
       WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()
         AND (last_seen_at IS NULL OR last_seen_at < DATE_SUB(NOW(), INTERVAL 45 SECOND))`,
      [sha256(token)],
    );
    res.json({ ok: true, onlineWindowSeconds: 300 });
  });

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
      if (subscriptionBlock(status)) {
        await query("UPDATE staff_users SET failed_logins = 0, locked_until = NULL WHERE id = ?", [
          user.id,
        ]);
        const plan = await loadPlan(business?.plan_id);
        res.status(403).json(subscriptionDenial(business, status, plan));
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
      await query("UPDATE staff_sessions SET last_seen_at = NOW() WHERE id = ?", [sid]);
      setCookie(res, "pos_sid", token, ttl, req);
      runTenant({ businessId: user.business_id, branchId: user.branch_id, user }, async () => {
        await audit("User Login", { module: "auth" }, req);
      });
      res.json({
        ok: true,
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
          category: business?.category,
          business_type: business?.business_type,
          bar_enabled: Number(business?.bar_enabled) === 1 ? 1 : 0,
          resort_enabled: Number(business?.resort_enabled) === 1 ? 1 : 0,
          zomato_allowed: Number(business?.zomato_allowed) === 1 ? 1 : 0,
          swiggy_allowed: Number(business?.swiggy_allowed) === 1 ? 1 : 0,
          subscription_expires_at: business?.subscription_expires_at,
        },
      });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    const generic = {
      ok: true,
      message:
        "If that account has an email, a sign-in code is on the way. Enter it below with a new password.",
    };
    try {
      const user = await findStaff(req.body?.identifier);
      if (!user || user.status !== "active") {
        res.json(generic);
        return;
      }
      const email = staffEmail(user);
      if (!email) {
        res.json({
          ok: true,
          needsSupport: true,
          message: "This account has no email. Use the support links below to reset the password.",
        });
        return;
      }
      const expiresAt = user.password_reset_expires ? new Date(user.password_reset_expires).getTime() : 0;
      if (expiresAt > Date.now() + 14 * 60 * 1000) {
        res.json({
          ok: true,
          message: "A code was just sent. Check your email, then enter it with a new password.",
        });
        return;
      }
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
      const until = new Date(Date.now() + 15 * 60 * 1000);
      await query(
        "UPDATE staff_users SET password_reset_hash = ?, password_reset_expires = ? WHERE id = ?",
        [sha256(`${user.id}:${code}`), until, user.id],
      );
      const text = `Your ATAV POS sign-in code is ${code}. It expires in 15 minutes. If you did not ask for this, ignore this email.`;
      const html = `<p>Your ATAV POS sign-in code is <strong>${code}</strong>.</p><p>It expires in 15 minutes. If you did not ask for this, ignore this email.</p>`;
      const sent = await sendMail({ to: email, subject: "ATAV POS sign-in code", text, html });
      if (!sent?.ok) {
        await query(
          "UPDATE staff_users SET password_reset_hash = NULL, password_reset_expires = NULL WHERE id = ?",
          [user.id],
        );
        res.status(400).json({
          error: "Could not email a sign-in code. Use Contact Support if you still cannot sign in.",
        });
        return;
      }
      res.json(generic);
    } catch (err) {
      res.status(400).json({ error: String(err.message || "Could not send a sign-in code") });
    }
  });

  app.post("/api/auth/forgot-password/confirm", async (req, res) => {
    try {
      const user = await findStaff(req.body?.identifier);
      const code = String(req.body?.code || "").replace(/\D/g, "");
      const password = String(req.body?.password || "");
      const expiresAt = user?.password_reset_expires ? new Date(user.password_reset_expires).getTime() : 0;
      const expect = user ? sha256(`${user.id}:${code}`) : "";
      const hash = String(user?.password_reset_hash || "");
      const match = hash && expect && hash.length === expect.length && sameHash(hash, expect);
      if (!user || user.status !== "active" || code.length !== 6 || !match || !expiresAt || expiresAt < Date.now()) {
        res.status(400).json({ error: "That code does not match. Request a new one." });
        return;
      }
      if (password.length < 8) {
        res.status(400).json({ error: "Password must be 8+ characters" });
        return;
      }
      await query(
        "UPDATE staff_users SET password_hash = ?, failed_logins = 0, locked_until = NULL, password_reset_hash = NULL, password_reset_expires = NULL WHERE id = ?",
        [await hashPassword(password), user.id],
      );
      res.json({ ok: true, message: "Password saved. Sign in with the new password." });
    } catch (err) {
      res.status(400).json({ error: String(err.message || "Could not save the password") });
    }
  });

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { user } = await registerBusiness(req.body || {});
      const [business] = await query("SELECT * FROM businesses WHERE id = ?", [user.business_id]);
      await sendWelcomeSignup(
        {
          shopName: business?.name,
          ownerName: user.first_name,
          email: user.email,
          businessEmail: business?.email,
          username: user.username,
        },
        req,
      );
      try {
        await sendWelcomeAlerts({
          businessId: user.business_id,
          shopName: business?.name,
          ownerName: user.first_name,
          email: user.email,
          username: user.username,
          password: req.body?.password,
          role: user.role || "business_admin",
          mobile: req.body?.mobile,
          signInUrl: publicLoginUrl(req),
        });
      } catch (err) {
        console.error("welcome alerts failed:", err.message);
      }
      await notifySignupAdmin({
        businessId: business?.id || user.business_id,
        userId: user.id,
        name: displayName(user) || user.first_name,
        mobile: business?.mobile || req.body?.mobile,
        email: user.email || business?.email,
        businessName: business?.name,
        category: business?.category || business?.business_type,
        registrationId: business?.code || business?.id,
        registeredAt: business?.created_at,
      });
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
      await query("UPDATE staff_sessions SET last_seen_at = NOW() WHERE token_hash = ?", [sha256(token)]);
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
      void query(
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
      ).catch((err) => console.error("master login audit:", err.message));
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

  app.post("/api/auth/exit-impersonate", async (req, res) => {
    const token = cookies(req).pos_sid;
    if (token) {
      const session = await loadStaffSession(token);
      if (session?.impersonatorAdminId) {
        await query("UPDATE staff_sessions SET revoked_at = NOW() WHERE token_hash = ?", [
          sha256(token),
        ]);
        clearCookie(res, "pos_sid", req);
      }
    }
    res.json({ ok: true });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (req.auth?.type === "master") {
      res.json({ ok: true, type: "master", admin: req.auth.admin });
      return;
    }
    if (req.auth?.type === "staff") {
      const status = publicStatus(req.auth.business);
      const plan = await loadPlan(req.auth.business?.plan_id);
      if (!req.auth.impersonatorAdminId && subscriptionBlock(status)) {
        res.status(403).json(subscriptionDenial(req.auth.business, status, plan));
        return;
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
          locale: normalizeLocale(req.auth.user.locale) || "",
        },
        business: {
          id: req.auth.business?.id,
          name: req.auth.business?.name,
          status,
          category: req.auth.business?.category,
          business_type: req.auth.business?.business_type,
          bar_enabled: Number(req.auth.business?.bar_enabled) === 1 ? 1 : 0,
          resort_enabled: Number(req.auth.business?.resort_enabled) === 1 ? 1 : 0,
          zomato_allowed: Number(req.auth.business?.zomato_allowed) === 1 ? 1 : 0,
          swiggy_allowed: Number(req.auth.business?.swiggy_allowed) === 1 ? 1 : 0,
          plan_id: req.auth.business?.plan_id,
          subscription_expires_at: req.auth.business?.subscription_expires_at,
        },
        plan,
        devToolsAllowed: process.env.POS_DEV_TOOLS !== "0",
        impersonating: Boolean(req.auth.impersonatorAdminId),
        impersonator: req.auth.impersonator || null,
      });
      return;
    }
    res.status(401).json({ error: "Not signed in" });
  });

  app.get("/api/billing/renewal", async (req, res) => {
    if (req.auth?.type !== "staff") {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    const status = publicStatus(req.auth.business);
    const plan = await loadPlan(req.auth.business?.plan_id);
    if (!req.auth.impersonatorAdminId && status !== "active" && status !== "expired") {
      res.status(403).json(subscriptionDenial(req.auth.business, status, plan));
      return;
    }
    res.json({
      ok: true,
      status,
      title: SUBSCRIPTION_EXPIRED_TITLE,
      error: status === "expired" ? SUBSCRIPTION_EXPIRED_MESSAGE : "",
      business: {
        id: req.auth.business?.id || null,
        name: req.auth.business?.name || null,
        subscription_expires_at: req.auth.business?.subscription_expires_at || null,
      },
      plan: plan
        ? { id: plan.id, code: plan.code, name: plan.name, fee_monthly: plan.fee_monthly }
        : null,
    });
  });

  app.post("/api/me/locale", requireStaff, async (req, res) => {
    const locale = normalizeLocale(req.body?.locale);
    try {
      await query("UPDATE staff_users SET locale = ? WHERE id = ?", [locale || null, req.auth.user.id]);
      req.auth.user.locale = locale || null;
      res.json({ ok: true, locale: locale || "" });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
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
      await query("UPDATE staff_users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?", [
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
