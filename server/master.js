import { query, withTransaction } from "./db.js";
import { hashPassword } from "./password.js";
import { requireMaster } from "./auth.js";
import { platformAudit } from "./audit.js";
import { defaultPerms } from "./roles.js";
import { publicStatus } from "./auth.js";
import { getPlatformSettings, setPlatformSetting } from "./settings.js";

function send(res, fn) {
  return Promise.resolve()
    .then(fn)
    .then((data) => res.json(data))
    .catch((err) => res.status(500).json({ error: String(err.message) }));
}

export function registerMaster(app) {
  app.use("/api/master", requireMaster);

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
          b.active === false ? 0 : 1,
        ],
      );
      await platformAudit(req.auth.admin, "Plan Saved", { module: "plans", target_name: id }, req);
      const [plan] = await query("SELECT * FROM subscription_plans WHERE id = ?", [id]);
      return { ok: true, plan };
    }),
  );

  app.get("/api/master/businesses", (_req, res) =>
    send(res, async () => {
      const rows = await query(
        `SELECT b.*, p.name AS plan_name, p.fee_monthly
         FROM businesses b
         LEFT JOIN subscription_plans p ON p.id = b.plan_id
         ORDER BY b.name`,
      );
      return rows.map((b) => ({ ...b, computed_status: publicStatus(b) }));
    }),
  );

  app.post("/api/master/businesses", (req, res) =>
    send(res, async () => {
      const b = req.body || {};
      if (!b.name) throw new Error("Business name is required");
      const id = crypto.randomUUID();
      const code = String(b.code || b.name)
        .toUpperCase()
        .replaceAll(/[^A-Z0-9]+/g, "")
        .slice(0, 12) || `B${Date.now()}`;
      await query(
        `INSERT INTO businesses (
           id, code, name, status, owner_name, mobile, email, address, gstin,
           business_type, plan_id, subscription_expires_at, invoice_footer, invoice_terms
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          code,
          String(b.name).trim(),
          b.status || "active",
          b.owner_name || null,
          b.mobile || null,
          b.email || null,
          b.address || null,
          b.gstin || null,
          b.business_type || "retail",
          b.plan_id || "trial",
          b.subscription_expires_at || null,
          b.invoice_footer || null,
          b.invoice_terms || null,
        ],
      );
      await query(
        `INSERT INTO company_settings (id, name, address, phone, email, gstin, business_id)
         VALUES (?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), b.name, b.address || null, b.mobile || null, b.email || null, b.gstin || null, id],
      );
      const branchId = crypto.randomUUID();
      await query(`INSERT INTO branches (id, business_id, name, status) VALUES (?,?, 'Main Branch', 'active')`, [
        branchId,
        id,
      ]);
      await query(
        `INSERT INTO pos_devices (id, business_id, branch_id, name, code, status)
         VALUES (?,?, 'POS 01', 'POS-01', 'active')`,
        [crypto.randomUUID(), id, branchId],
      );
      await query(
        `INSERT INTO number_sequences (name, next_value, business_id) VALUES
         ('order', 10001, ?), ('customer', 1, ?), ('item', 1, ?), ('purchase', 10001, ?)`,
        [id, id, id, id],
      );
      await query(
        `INSERT INTO customers (id, code, name, mobile, type, outstanding, business_id)
         VALUES (?, 'CUS-001', 'Walk-in', '0000000000', 'b2c', 0, ?)`,
        [crypto.randomUUID(), id],
      );
      if (b.admin_email && b.admin_password) {
        const uid = crypto.randomUUID();
        await query(
          `INSERT INTO staff_users (
             id, clerk_user_id, email, first_name, last_name, role, status, password_hash,
             business_id, branch_id, permissions_json, username, mobile
           ) VALUES (?,?,?,?,?,?, 'active', ?,?,?,?,?,?)`,
          [
            uid,
            `local:${uid}`,
            String(b.admin_email).toLowerCase(),
            b.admin_name || "Admin",
            "",
            "business_admin",
            await hashPassword(b.admin_password),
            id,
            branchId,
            JSON.stringify(defaultPerms("business_admin")),
            b.admin_username || String(b.admin_email).split("@")[0],
            b.mobile || null,
          ],
        );
      }
      await platformAudit(req.auth.admin, "Business Created", { module: "businesses", target_id: id, target_name: b.name }, req);
      const [row] = await query("SELECT * FROM businesses WHERE id = ?", [id]);
      return { ok: true, business: row };
    }),
  );

  app.put("/api/master/businesses/:id", (req, res) =>
    send(res, async () => {
      const b = req.body || {};
      await query(
        `UPDATE businesses SET
           name=?, owner_name=?, mobile=?, email=?, address=?, gstin=?, business_type=?,
           status=?, plan_id=?, subscription_expires_at=?, invoice_footer=?, invoice_terms=?
         WHERE id=?`,
        [
          b.name,
          b.owner_name || null,
          b.mobile || null,
          b.email || null,
          b.address || null,
          b.gstin || null,
          b.business_type || null,
          b.status || "active",
          b.plan_id || null,
          b.subscription_expires_at || null,
          b.invoice_footer || null,
          b.invoice_terms || null,
          req.params.id,
        ],
      );
      await platformAudit(req.auth.admin, "Business Edited", { module: "businesses", target_id: req.params.id, target_name: b.name }, req);
      const [row] = await query("SELECT * FROM businesses WHERE id = ?", [req.params.id]);
      return { ok: true, business: row };
    }),
  );

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
      query("SELECT * FROM staff_audit_logs ORDER BY created_at DESC LIMIT 200"),
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

  app.post("/api/master/notifications", (req, res) =>
    send(res, async () => {
      const { title, body, business_id } = req.body || {};
      if (!title) throw new Error("Title is required");
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO notifications (id, business_id, title, body) VALUES (?,?,?,?)`,
        [id, business_id || null, title, body || null],
      );
      return { ok: true, id };
    }),
  );
}
