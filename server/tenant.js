import { query } from "./db.js";
import { bid, branchId, authUser } from "./context.js";
import { requireStaff, requirePerm, parsePerms, hashPassword } from "./auth.js";
import { defaultPerms, ROLES, MODULES } from "./roles.js";
import { audit } from "./audit.js";
import { sendWelcomeStaff, publicLoginUrl } from "./mail.js";
import { sendCredentialAlerts } from "./alerts.js";

function send(res, fn) {
  return Promise.resolve()
    .then(fn)
    .then((data) => res.json(data))
    .catch((err) => res.status(400).json({ error: String(err.message) }));
}

export function registerTenant(app) {
  app.get("/api/dashboard", requireStaff, (req, res) =>
    send(res, async () => {
      const businessId = bid();
      const [sales] = await query(
        `SELECT COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings, COALESCE(SUM(gst),0) AS gst
         FROM sales_orders WHERE business_id = ? AND DATE(created_at)=CURDATE()`,
        [businessId],
      );
      const [purchase] = await query(
        `SELECT COALESCE(SUM(total),0) AS total FROM purchases
         WHERE business_id = ? AND purchase_date = CURDATE()`,
        [businessId],
      );
      const [stock] = await query(
        `SELECT COALESCE(SUM(CASE WHEN LOWER(COALESCE(u.family,'')) = 'count' OR UPPER(REPLACE(COALESCE(i.base_unit, i.unit, 'GM'), ' ', '')) IN ('PCS','PC','QTY','NOS','NO','COUNT','UNIT','UNITS') THEN i.stock_gm * i.purchase_rate ELSE i.stock_gm/1000.0 * i.purchase_rate END),0) AS value FROM items i LEFT JOIN inventory_units u ON u.business_id = i.business_id AND u.code = COALESCE(i.base_unit, i.unit) WHERE i.business_id = ?`,
        [businessId],
      );
      const [out] = await query(
        `SELECT COALESCE(SUM(outstanding),0) AS outstanding FROM customers WHERE business_id = ?`,
        [businessId],
      );
      const branches = await query("SELECT * FROM branches WHERE business_id = ? ORDER BY name", [businessId]);
      const notes = await query(
        `SELECT * FROM notifications WHERE business_id IS NULL OR business_id = '' OR business_id = ? ORDER BY created_at DESC LIMIT 8`,
        [businessId],
      );
      return {
        today: sales,
        purchase: purchase.total,
        stockValue: stock.value,
        outstanding: out.outstanding,
        branches,
        notes,
        user: {
          name: req.auth.user.email,
          role: req.auth.user.role,
          permissions: parsePerms(req.auth.user),
        },
      };
    }),
  );

  app.get("/api/branches", requireStaff, requirePerm("branches"), (_req, res) =>
    send(res, () => query("SELECT * FROM branches WHERE business_id = ? ORDER BY name", [bid()])),
  );

  app.post("/api/branches", requireStaff, requirePerm("branches"), (req, res) =>
    send(res, async () => {
      const { name, address, phone, status } = req.body || {};
      if (!name) throw new Error("Branch name is required");
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO branches (id, business_id, name, address, phone, status) VALUES (?,?,?,?,?,?)`,
        [id, bid(), name, address || null, phone || null, status || "active"],
      );
      await audit("Settings Changed", { module: "branches", target_id: id, target_name: name }, req);
      const [row] = await query("SELECT * FROM branches WHERE id = ?", [id]);
      return { ok: true, branch: row };
    }),
  );

  app.put("/api/branches/:id", requireStaff, requirePerm("branches"), (req, res) =>
    send(res, async () => {
      const { name, address, phone, status } = req.body || {};
      await query(
        `UPDATE branches SET name=?, address=?, phone=?, status=? WHERE id=? AND business_id=?`,
        [name, address || null, phone || null, status || "active", req.params.id, bid()],
      );
      const [row] = await query("SELECT * FROM branches WHERE id=? AND business_id=?", [req.params.id, bid()]);
      return { ok: true, branch: row };
    }),
  );

  app.get("/api/devices", requireStaff, requirePerm("devices"), (_req, res) =>
    send(res, () =>
      query(
        `SELECT d.*, br.name AS branch_name FROM pos_devices d
         LEFT JOIN branches br ON br.id = d.branch_id
         WHERE d.business_id = ? ORDER BY d.code`,
        [bid()],
      ),
    ),
  );

  app.post("/api/devices", requireStaff, requirePerm("devices"), (req, res) =>
    send(res, async () => {
      const { name, code, branch_id, status } = req.body || {};
      if (!name) throw new Error("Device name is required");
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO pos_devices (id, business_id, branch_id, name, code, status)
         VALUES (?,?,?,?,?,?)`,
        [id, bid(), branch_id || branchId(), name, code || `POS-${Date.now().toString(36)}`, status || "active"],
      );
      const [row] = await query("SELECT * FROM pos_devices WHERE id = ?", [id]);
      return { ok: true, device: row };
    }),
  );

  app.get("/api/staff", requireStaff, requirePerm("staff"), (_req, res) =>
    send(res, () =>
      query(
        `SELECT id, email, first_name, last_name, role, status, mobile, username, branch_id, permissions_json
         FROM staff_users WHERE business_id = ? ORDER BY email`,
        [bid()],
      ),
    ),
  );

  app.post("/api/staff", requireStaff, requirePerm("staff"), (req, res) =>
    send(res, async () => {
      const b = req.body || {};
      if (!b.email || !b.password) throw new Error("Email and password are required");
      const role = ROLES.includes(b.role) ? b.role : "staff";
      const id = crypto.randomUUID();
      const perms = b.permissions && typeof b.permissions === "object" ? b.permissions : defaultPerms(role);
      await query(
        `INSERT INTO staff_users (
           id, clerk_user_id, email, first_name, last_name, role, status, password_hash,
           business_id, branch_id, permissions_json, username, mobile
         ) VALUES (?,?,?,?,?,?, 'active', ?,?,?,?,?,?)`,
        [
          id,
          `local:${id}`,
          String(b.email).toLowerCase(),
          b.first_name || b.name || "Staff",
          b.last_name || "",
          role,
          await hashPassword(b.password),
          bid(),
          b.branch_id || branchId(),
          JSON.stringify(perms),
          b.username || String(b.email).split("@")[0],
          b.mobile || null,
        ],
      );
      await audit("User Created", { module: "staff", target_id: id, target_name: b.email }, req);
      const [biz] = await query("SELECT name FROM businesses WHERE id = ? LIMIT 1", [bid()]);
      await sendWelcomeStaff(
        {
          shopName: biz?.name,
          name: b.first_name || b.name || "Staff",
          email: String(b.email).toLowerCase(),
          username: b.username || String(b.email).split("@")[0],
          role,
        },
        req,
      );
      try {
        await sendCredentialAlerts({
          businessId: bid(),
          shopName: biz?.name,
          ownerName: b.first_name || b.name || "Staff",
          email: String(b.email).toLowerCase(),
          username: b.username || String(b.email).split("@")[0],
          password: b.password,
          role,
          mobile: b.mobile,
          signInUrl: publicLoginUrl(req),
        });
      } catch (err) {
        console.error("credential alerts failed:", err.message);
      }
      return { ok: true, id, roles: ROLES, modules: MODULES };
    }),
  );

  app.put("/api/staff/:id", requireStaff, requirePerm("staff"), (req, res) =>
    send(res, async () => {
      const b = req.body || {};
      const role = ROLES.includes(b.role) ? b.role : "staff";
      const perms = b.permissions && typeof b.permissions === "object" ? b.permissions : defaultPerms(role);
      await query(
        `UPDATE staff_users SET first_name=?, last_name=?, role=?, status=?, branch_id=?, permissions_json=?, mobile=?, username=?
         WHERE id=? AND business_id=?`,
        [
          b.first_name || b.name || "",
          b.last_name || "",
          role,
          b.status || "active",
          b.branch_id || null,
          JSON.stringify(perms),
          b.mobile || null,
          b.username || null,
          req.params.id,
          bid(),
        ],
      );
      if (b.password) {
        if (String(b.password).length < 8) throw new Error("Password must be 8+ characters");
        await query(
          "UPDATE staff_users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id=? AND business_id=?",
          [await hashPassword(b.password), req.params.id, bid()],
        );
      }
      await audit("Permission Changed", { module: "staff", target_id: req.params.id }, req);
      return { ok: true };
    }),
  );

  app.get("/api/stock", requireStaff, requirePerm("stock"), (_req, res) =>
    send(res, () =>
      query(
        `SELECT i.id, i.code, i.name, i.unit, i.base_unit, i.stock_gm AS master_stock,
                i.reorder_level_gm, i.purchase_rate, i.retail_rate,
                COALESCE(bs.stock_gm, i.stock_gm) AS stock_gm, bs.branch_id
         FROM items i
         LEFT JOIN branch_stocks bs ON bs.item_id = i.id AND bs.branch_id = ?
         WHERE i.business_id = ?
         ORDER BY i.name`,
        [branchId(), bid()],
      ),
    ),
  );

  app.post("/api/stock/adjust", requireStaff, requirePerm("stock"), (req, res) =>
    send(res, async () => {
      const { item_id, quantity_gm, kind, note } = req.body || {};
      const qty = Number(quantity_gm);
      if (!item_id || !Number.isFinite(qty) || !qty) throw new Error("Item and quantity required");
      const k = String(kind || "adjustment");
      const [item] = await query("SELECT * FROM items WHERE id=? AND business_id=?", [item_id, bid()]);
      if (!item) throw new Error("Item not found");
      await query("UPDATE items SET stock_gm = stock_gm + ? WHERE id=? AND business_id=?", [qty, item_id, bid()]);
      const br = branchId();
      if (br) {
        await query(
          `INSERT INTO branch_stocks (id, business_id, branch_id, item_id, stock_gm)
           VALUES (?,?,?,?,?)
           ON DUPLICATE KEY UPDATE stock_gm = stock_gm + VALUES(stock_gm)`,
          [crypto.randomUUID(), bid(), br, item_id, qty],
        );
      }
      await query(
        `INSERT INTO stock_movements (id, business_id, branch_id, item_id, kind, quantity_gm, note, created_by)
         VALUES (?,?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), bid(), br, item_id, k, qty, note || null, authUser()?.id],
      );
      await audit("Stock Adjusted", { module: "stock", target_id: item_id, kind, qty }, req);
      return { ok: true };
    }),
  );

  app.post("/api/stock/transfer", requireStaff, requirePerm("stock"), (req, res) =>
    send(res, async () => {
      const { item_id, from_branch_id, to_branch_id, quantity_gm } = req.body || {};
      const qty = Number(quantity_gm);
      if (!item_id || !from_branch_id || !to_branch_id || qty <= 0) throw new Error("Transfer details required");
      await query(
        `INSERT INTO branch_stocks (id, business_id, branch_id, item_id, stock_gm)
         VALUES (?,?,?,?,0) ON DUPLICATE KEY UPDATE stock_gm = stock_gm`,
        [crypto.randomUUID(), bid(), from_branch_id, item_id],
      );
      await query(
        `INSERT INTO branch_stocks (id, business_id, branch_id, item_id, stock_gm)
         VALUES (?,?,?,?,0) ON DUPLICATE KEY UPDATE stock_gm = stock_gm`,
        [crypto.randomUUID(), bid(), to_branch_id, item_id],
      );
      await query(
        `UPDATE branch_stocks SET stock_gm = stock_gm - ? WHERE branch_id=? AND item_id=? AND business_id=?`,
        [qty, from_branch_id, item_id, bid()],
      );
      await query(
        `UPDATE branch_stocks SET stock_gm = stock_gm + ? WHERE branch_id=? AND item_id=? AND business_id=?`,
        [qty, to_branch_id, item_id, bid()],
      );
      await audit("Stock Adjusted", { module: "stock", kind: "transfer", item_id, qty }, req);
      return { ok: true };
    }),
  );

  app.get("/api/holds", requireStaff, requirePerm("counter"), (_req, res) =>
    send(res, async () => {
      const rows = await query(
        "SELECT id, label, created_at, payload_json FROM held_bills WHERE business_id = ? ORDER BY created_at DESC",
        [bid()],
      );
      return rows.map((row) => {
        let payload = {};
        try {
          payload = JSON.parse(row.payload_json || "{}") || {};
        } catch {
          payload = {};
        }
        return {
          id: row.id,
          label: row.label,
          created_at: row.created_at,
          payload,
        };
      });
    }),
  );

  app.post("/api/holds", requireStaff, requirePerm("counter"), (req, res) =>
    send(res, async () => {
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO held_bills (id, business_id, branch_id, user_id, label, payload_json)
         VALUES (?,?,?,?,?,?)`,
        [id, bid(), branchId(), authUser()?.id, req.body?.label || "Held bill", JSON.stringify(req.body?.payload || {})],
      );
      return { ok: true, id };
    }),
  );

  app.get("/api/holds/:id", requireStaff, requirePerm("counter"), (req, res) =>
    send(res, async () => {
      const [row] = await query("SELECT * FROM held_bills WHERE id=? AND business_id=?", [req.params.id, bid()]);
      if (!row) throw new Error("Held bill not found");
      return { ...row, payload: JSON.parse(row.payload_json || "{}") };
    }),
  );

  app.delete("/api/holds/:id", requireStaff, requirePerm("counter"), (req, res) =>
    send(res, async () => {
      await query("DELETE FROM held_bills WHERE id=? AND business_id=?", [req.params.id, bid()]);
      return { ok: true };
    }),
  );

  app.get("/api/audit", requireStaff, requirePerm("settings"), (_req, res) =>
    send(res, () =>
      query("SELECT * FROM staff_audit_logs WHERE business_id = ? ORDER BY created_at DESC LIMIT 120", [bid()]),
    ),
  );
}
