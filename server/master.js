import { query, withTransaction } from "./db.js";
import { hashPassword } from "./password.js";
import { requireMaster, issueStaffSession } from "./auth.js";
import { displayName } from "./roles.js";
import { platformAudit } from "./audit.js";
import { registerBusiness, updateBusiness } from "./onboard.js";
import { defaultPerms } from "./roles.js";
import { publicStatus } from "./auth.js";
import { getPlatformSettings, setPlatformSetting } from "./settings.js";
import { registerMasterBackup } from "./backup.js";
import { sendWelcomeSignup, sendWelcomeStaff, publicLoginUrl } from "./mail.js";
import {
  sendUpdateAlerts,
  sendWelcomeAlerts,
  sendCredentialAlerts,
  loadAlertSettings,
  saveAlertSettings,
  publicAlertSettings,
  sanitizeNoticeImage,
  ensureAlertSettings,
} from "./alerts.js";

function send(res, fn) {
  return Promise.resolve()
    .then(fn)
    .then((data) => res.json(data))
    .catch((err) => res.status(500).json({ error: String(err.message) }));
}

export function registerMaster(app) {
  app.use("/api/master", requireMaster);
  registerMasterBackup(app);

  app.get("/api/master/dashboard", (req, res) =>
    send(res, async () => {
      const businesses = await query("SELECT * FROM businesses");
      const statuses = businesses.map((b) => publicStatus(b));
      const [users] = await query("SELECT COUNT(*) AS n FROM staff_users");
      const [branches] = await query("SELECT COUNT(*) AS n FROM branches");
      const [devices] = await query("SELECT COUNT(*) AS n FROM pos_devices");
      const [tx] = await query("SELECT COUNT(*) AS n FROM sales_orders");
      const [sales] = await query(
        `SELECT COALESCE(SUM(total),0) AS takings FROM sales_orders WHERE DATE(created_at)=CURDATE()`,
      );
      const plans = await query("SELECT * FROM subscription_plans");
      const planMap = Object.fromEntries(plans.map((p) => [p.id, p]));
      const monthlyFees = businesses.reduce((sum, b) => {
        if (publicStatus(b) !== "active") return sum;
        return sum + Number(planMap[b.plan_id]?.fee_monthly || 0);
      }, 0);
      const byBiz = await query(
        `SELECT b.id, b.name, b.status, b.subscription_expires_at, b.plan_id,
                p.name AS plan_name, p.fee_monthly,
                (SELECT COUNT(*) FROM staff_users u WHERE u.business_id=b.id) AS users,
                (SELECT COUNT(*) FROM branches br WHERE br.business_id=b.id) AS branches,
                (SELECT COALESCE(SUM(total),0) FROM sales_orders s WHERE s.business_id=b.id AND DATE(s.created_at)=CURDATE()) AS today_sales
         FROM businesses b
         LEFT JOIN subscription_plans p ON p.id = b.plan_id
         ORDER BY b.name`,
      );
      return {
        totals: {
          businesses: businesses.length,
          active: statuses.filter((s) => s === "active").length,
          inactive: statuses.filter((s) => s === "inactive").length,
          expired: statuses.filter((s) => s === "expired").length,
          suspended: statuses.filter((s) => s === "suspended").length,
          trial: businesses.filter((b) => b.plan_id === "trial").length,
          users: users.n,
          branches: branches.n,
          devices: devices.n,
          transactions: tx.n,
          todaySales: sales.takings,
          subscriptionRevenue: monthlyFees,
        },
        businesses: byBiz.map((b) => ({ ...b, computed_status: publicStatus(b) })),
      };
    }),
  );

  app.get("/api/master/plans", (_req, res) =>
    send(res, () => query("SELECT * FROM subscription_plans ORDER BY max_users")),
  );

  app.post("/api/master/plans", (req, res) =>
    send(res, async () => {
      const b = req.body || {};
      const id = String(b.code || b.name || "plan")
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-")
        .slice(0, 32);
      await query(
        `INSERT INTO subscription_plans
           (id, code, name, max_branches, max_users, max_devices, max_products, max_invoices, fee_monthly, active)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), max_branches=VALUES(max_branches),
           max_users=VALUES(max_users), max_devices=VALUES(max_devices),
           max_products=VALUES(max_products), max_invoices=VALUES(max_invoices),
           fee_monthly=VALUES(fee_monthly), active=VALUES(active)`,
        [
          id,
          String(b.code || id).toUpperCase(),
          b.name || id,
          Number(b.max_branches) || 1,
          Number(b.max_users) || 3,
          Number(b.max_devices) || 2,
          Number(b.max_products) || 500,
          Number(b.max_invoices) || 1000,
          Number(b.fee_monthly) || 0,
          b.active === false || b.active === 0 || b.active === "0" ? 0 : 1,
        ],
      );
      await platformAudit(req.auth.admin, "Plan Saved", { module: "plans", target_name: id }, req);
      const [plan] = await query("SELECT * FROM subscription_plans WHERE id = ?", [id]);
      return { ok: true, plan };
    }),
  );

  app.put("/api/master/plans/:id", (req, res) =>
    send(res, async () => {
      const id = req.params.id;
      const [existing] = await query("SELECT * FROM subscription_plans WHERE id = ?", [id]);
      if (!existing) throw new Error("Plan not found");
      const b = req.body || {};
      const code = String(b.code || existing.code)
        .toUpperCase()
        .replaceAll(/[^A-Z0-9]+/g, "")
        .slice(0, 32) || existing.code;
      const n = (v, fallback) => (v === undefined || v === null || v === "" ? fallback : Number(v));
      await query(
        `UPDATE subscription_plans SET
           code=?, name=?, max_branches=?, max_users=?, max_devices=?, max_products=?,
           max_invoices=?, fee_monthly=?, active=?
         WHERE id=?`,
        [
          code,
          b.name || existing.name,
          n(b.max_branches, existing.max_branches),
          n(b.max_users, existing.max_users),
          n(b.max_devices, existing.max_devices),
          n(b.max_products, existing.max_products),
          n(b.max_invoices, existing.max_invoices),
          n(b.fee_monthly, existing.fee_monthly),
          b.active === false || b.active === 0 || b.active === "0" ? 0 : 1,
          id,
        ],
      );
      await platformAudit(req.auth.admin, "Plan Edited", { module: "plans", target_id: id, target_name: code }, req);
      const [plan] = await query("SELECT * FROM subscription_plans WHERE id = ?", [id]);
      return { ok: true, plan };
    }),
  );

  app.get("/api/master/businesses", (_req, res) =>
    send(res, async () => {
      const rows = await query(
        `SELECT b.*, p.name AS plan_name, p.fee_monthly,
                (SELECT u.username FROM staff_users u
                 WHERE u.business_id = b.id AND u.role = 'business_admin' LIMIT 1) AS admin_username
         FROM businesses b
         LEFT JOIN subscription_plans p ON p.id = b.plan_id
         ORDER BY b.name`,
      );
      return rows.map((b) => ({ ...b, computed_status: publicStatus(b) }));
    }),
  );

  app.post("/api/master/businesses", async (req, res) => {
    try {
      const { businessId, user } = await registerBusiness(req.body || {});
      await platformAudit(
        req.auth.admin,
        "Business Created",
        { module: "businesses", target_id: businessId, target_name: req.body?.name || req.body?.businessName },
        req,
      );
      const [row] = await query("SELECT * FROM businesses WHERE id = ?", [businessId]);
      await sendWelcomeSignup(
        {
          shopName: row?.name,
          ownerName: user?.first_name,
          email: user?.email,
          username: user?.username,
        },
        req,
      );
      try {
        await sendWelcomeAlerts({
          businessId,
          shopName: row?.name,
          ownerName: user?.first_name,
          email: user?.email,
          username: user?.username,
          password: req.body?.password,
          role: user?.role || "business_admin",
          mobile: req.body?.mobile,
          signInUrl: publicLoginUrl(req),
        });
      } catch (err) {
        console.error("welcome alerts failed:", err.message);
      }
      res.json({ ok: true, business: row });
    } catch (err) {
      const msg = String(err.message || err);
      const dup = /duplicate|already (registered|taken)/i.test(msg);
      res.status(dup ? 409 : 400).json({ error: dup ? "This business or login is already registered" : msg });
    }
  });

  app.put("/api/master/businesses/:id", async (req, res) => {
    try {
      const { business } = await updateBusiness(req.params.id, req.body || {});
      await platformAudit(
        req.auth.admin,
        "Business Edited",
        { module: "businesses", target_id: req.params.id, target_name: business?.name },
        req,
      );
      res.json({ ok: true, business });
    } catch (err) {
      const msg = String(err.message || err);
      const dup = /duplicate|already (registered|taken)/i.test(msg);
      res.status(dup ? 409 : 400).json({ error: dup ? "This business or login is already registered" : msg });
    }
  });

  app.post("/api/master/businesses/:id/status", (req, res) =>
    send(res, async () => {
      const status = String(req.body?.status || "active");
      if (!["active", "inactive", "suspended"].includes(status)) throw new Error("Invalid status");
      await query("UPDATE businesses SET status = ? WHERE id = ?", [status, req.params.id]);
      await platformAudit(req.auth.admin, "Business Status", { module: "businesses", target_id: req.params.id, status }, req);
      return { ok: true, status };
    }),
  );

  app.delete("/api/master/businesses/:id", (req, res) =>
    send(res, async () => {
      const id = req.params.id;
      const swami = process.env.BUSINESS_ID || "00000000-0000-4000-8000-000000000001";
      if (id === swami) throw new Error("The primary live business cannot be deleted");
      await withTransaction(async (conn) => {
        await conn.query("UPDATE businesses SET status = 'inactive' WHERE id = ?", [id]);
      });
      await platformAudit(req.auth.admin, "Business Deactivated", { module: "businesses", target_id: id }, req);
      return { ok: true, note: "Business set inactive. Data is retained." };
    }),
  );

  app.post("/api/master/businesses/:id/enter", (req, res) =>
    send(res, async () => {
      const [business] = await query("SELECT * FROM businesses WHERE id = ?", [req.params.id]);
      if (!business) throw new Error("Business not found");
      const [user] = await query(
        `SELECT * FROM staff_users
         WHERE business_id = ? AND status = 'active'
         ORDER BY CASE role WHEN 'business_admin' THEN 0 ELSE 1 END, email ASC
         LIMIT 1`,
        [req.params.id],
      );
      if (!user) throw new Error("No active staff user for this business. Create a business admin first.");
      const [branch] = await query("SELECT id FROM branches WHERE business_id = ? LIMIT 1", [business.id]);
      await issueStaffSession(req, res, {
        user,
        business,
        branchId: branch?.id || user.branch_id,
        impersonatorAdminId: req.auth.admin.id,
      });
      await platformAudit(
        req.auth.admin,
        "Entered Business POS",
        { module: "businesses", target_id: business.id, target_name: business.name, staff_user_id: user.id },
        req,
      );
      return {
        ok: true,
        redirect: "/index.html",
        business: { id: business.id, name: business.name },
        user: { id: user.id, email: user.email, name: displayName(user), role: user.role },
      };
    }),
  );

  app.post("/api/master/users/:id/enter", (req, res) =>
    send(res, async () => {
      const [user] = await query("SELECT * FROM staff_users WHERE id = ?", [req.params.id]);
      if (!user || user.status !== "active") throw new Error("User not found or inactive");
      const [business] = await query("SELECT * FROM businesses WHERE id = ?", [user.business_id]);
      if (!business) throw new Error("Business not found");
      const [branch] = await query("SELECT id FROM branches WHERE business_id = ? LIMIT 1", [business.id]);
      await issueStaffSession(req, res, {
        user,
        business,
        branchId: branch?.id || user.branch_id,
        impersonatorAdminId: req.auth.admin.id,
      });
      await platformAudit(
        req.auth.admin,
        "Entered User POS",
        { module: "users", target_id: user.id, target_name: user.email, business_id: business.id },
        req,
      );
      return {
        ok: true,
        redirect: "/index.html",
        business: { id: business.id, name: business.name },
        user: { id: user.id, email: user.email, name: displayName(user), role: user.role },
      };
    }),
  );

  app.post("/api/master/businesses/:id/admin", (req, res) =>
    send(res, async () => {
      const b = req.body || {};
      if (!b.email || !b.password) throw new Error("Admin email and password are required");
      const [biz] = await query("SELECT * FROM businesses WHERE id = ?", [req.params.id]);
      if (!biz) throw new Error("Business not found");
      const [branch] = await query("SELECT id FROM branches WHERE business_id = ? LIMIT 1", [biz.id]);
      const uid = crypto.randomUUID();
      await query(
        `INSERT INTO staff_users (
           id, clerk_user_id, email, first_name, last_name, role, status, password_hash,
           business_id, branch_id, permissions_json, username
         ) VALUES (?,?,?,?,?,?, 'active', ?,?,?,?,?)`,
        [
          uid,
          `local:${uid}`,
          String(b.email).toLowerCase(),
          b.name || "Admin",
          "",
          "business_admin",
          await hashPassword(b.password),
          biz.id,
          branch?.id || null,
          JSON.stringify(defaultPerms("business_admin")),
          b.username || String(b.email).split("@")[0],
        ],
      );
      await platformAudit(req.auth.admin, "Business Admin Created", { module: "users", target_id: uid, target_name: b.email }, req);
      await sendWelcomeStaff(
        {
          shopName: biz.name,
          name: b.name || "Admin",
          email: String(b.email).toLowerCase(),
          username: b.username || String(b.email).split("@")[0],
          role: "business_admin",
        },
        req,
      );
      try {
        await sendCredentialAlerts({
          businessId: biz.id,
          shopName: biz.name,
          ownerName: b.name || "Admin",
          email: String(b.email).toLowerCase(),
          username: b.username || String(b.email).split("@")[0],
          password: b.password,
          role: "business_admin",
          signInUrl: publicLoginUrl(req),
        });
      } catch (err) {
        console.error("credential alerts failed:", err.message);
      }
      return { ok: true, userId: uid };
    }),
  );

  app.post("/api/master/users/:id/reset-password", (req, res) =>
    send(res, async () => {
      const password = req.body?.password;
      if (!password || String(password).length < 8) throw new Error("Password must be 8+ characters");
      await query("UPDATE staff_users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?", [
        await hashPassword(password),
        req.params.id,
      ]);
      await platformAudit(req.auth.admin, "Password Reset", { module: "users", target_id: req.params.id }, req);
      try {
        const [user] = await query(
          "SELECT id, email, first_name, username, role, business_id, mobile FROM staff_users WHERE id = ? LIMIT 1",
          [req.params.id],
        );
        const [biz] = user?.business_id
          ? await query("SELECT name FROM businesses WHERE id = ? LIMIT 1", [user.business_id])
          : [];
        if (user) {
          await sendCredentialAlerts({
            businessId: user.business_id,
            shopName: biz?.name,
            ownerName: user.first_name,
            email: user.email,
            username: user.username,
            password,
            role: user.role,
            mobile: user.mobile,
            signInUrl: publicLoginUrl(req),
          });
        }
      } catch (err) {
        console.error("credential alerts failed:", err.message);
      }
      return { ok: true };
    }),
  );

  app.get("/api/master/users", (_req, res) =>
    send(res, () =>
      query(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.status, u.business_id, u.mobile, u.username,
                b.name AS business_name
         FROM staff_users u LEFT JOIN businesses b ON b.id = u.business_id
         ORDER BY u.email`,
      ),
    ),
  );

  app.get("/api/master/branches", (_req, res) =>
    send(res, () =>
      query(
        `SELECT br.*, b.name AS business_name FROM branches br
         JOIN businesses b ON b.id = br.business_id ORDER BY b.name, br.name`,
      ),
    ),
  );

  app.get("/api/master/devices", (_req, res) =>
    send(res, () =>
      query(
        `SELECT d.*, b.name AS business_name, br.name AS branch_name
         FROM pos_devices d
         JOIN businesses b ON b.id = d.business_id
         LEFT JOIN branches br ON br.id = d.branch_id
         ORDER BY b.name, d.code`,
      ),
    ),
  );

  app.get("/api/master/audit", (_req, res) =>
    send(res, () =>
      query(
        `SELECT l.*, b.name AS business_name
         FROM staff_audit_logs l
         LEFT JOIN businesses b ON b.id = l.business_id AND l.business_id <> 'platform'
         ORDER BY l.created_at DESC
         LIMIT 200`,
      ),
    ),
  );

  app.get("/api/master/settings", (_req, res) =>
    send(res, async () => ({
      platform: "ATAV Multi-Tenant POS",
      lockoutAttempts: 8,
      sessionHours: 12,
      notifications: await query("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20"),
    })),
  );

  app.get("/api/master/support", (_req, res) => send(res, () => getPlatformSettings()));

  app.post("/api/master/support", (req, res) =>
    send(res, async () => {
      const phone = String(req.body?.support_phone || "").trim();
      const email = String(req.body?.support_email || "").trim();
      if (!phone) throw new Error("Support number is required");
      await setPlatformSetting("support_phone", phone);
      await setPlatformSetting("support_email", email);
      await platformAudit(req.auth.admin, "Settings Changed", { module: "support", target_name: phone }, req);
      return { ok: true, ...(await getPlatformSettings()) };
    }),
  );

  app.get("/api/master/alerts", (_req, res) =>
    send(res, async () => {
      await ensureAlertSettings();
      return publicAlertSettings(await loadAlertSettings());
    }),
  );

  app.post("/api/master/alerts", (req, res) =>
    send(res, async () => {
      const saved = await saveAlertSettings(req.body || {});
      await platformAudit(req.auth.admin, "Settings Changed", { module: "alerts", target_name: "WhatsApp alerts" }, req);
      return { ok: true, ...publicAlertSettings(saved) };
    }),
  );

  app.post("/api/master/notifications", (req, res) =>
    send(res, async () => {
      const { title, body, business_id, image_url } = req.body || {};
      if (!title) throw new Error("Title is required");
      const image = sanitizeNoticeImage(image_url);
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO notifications (id, business_id, title, body, image_url) VALUES (?,?,?,?,?)`,
        [id, business_id || null, title, body || null, image || null],
      );
      let delivery = { skipped: true };
      try {
        delivery = await sendUpdateAlerts({
          businessId: business_id || "",
          title,
          body: body || "",
          image,
        });
      } catch (err) {
        console.error("notification alerts failed:", err.message);
        delivery = { ok: false, error: String(err.message || err) };
      }
      return { ok: true, id, delivery };
    }),
  );
}
