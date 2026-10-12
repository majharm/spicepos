import crypto from "node:crypto";
import { query, withTransaction } from "./db.js";
import { bid, authUser } from "./context.js";
import { requireStaff, requirePerm, requireMaster } from "./auth.js";
import { audit, platformAudit } from "./audit.js";
import { setPlatformSetting } from "./settings.js";
import "../js/customer-master.js";

const M = globalThis.POSCustomerMaster;

const REMAP = [
  ["sales_orders", "customer_id"],
  ["sales_returns", "customer_id"],
  ["loyalty_ledger", "customer_id"],
  ["promo_offer_redemptions", "customer_id"],
  ["gym_members", "customer_id"],
  ["salon_customer_packages", "customer_id"],
  ["salon_bookings", "customer_id"],
  ["salon_booking_payments", "customer_id"],
  ["salon_sessions", "customer_id"],
  ["salon_waitlist", "customer_id"],
  ["salon_notifications", "customer_id"],
  ["print_orders", "customer_id"],
  ["print_files", "customer_id"],
  ["print_payments", "customer_id"],
  ["print_sessions", "customer_id"],
  ["print_notifications", "customer_id"],
];

export async function ensureCustomerDedupeSchema() {
  await query(`CREATE TABLE IF NOT EXISTS customer_merge_backups (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    primary_id VARCHAR(255) NOT NULL,
    loser_ids TEXT NOT NULL,
    snapshot MEDIUMTEXT NULL,
    created_by VARCHAR(255) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_cmb_biz (business_id)
  )`);
  const cols = {
    email: "VARCHAR(160) NULL",
    merged_into: "VARCHAR(255) NULL",
    status: "VARCHAR(16) NOT NULL DEFAULT 'active'",
    mobile_norm: "VARCHAR(16) NULL",
    email_norm: "VARCHAR(160) NULL",
    gstin_norm: "VARCHAR(32) NULL",
  };
  for (const [name, def] of Object.entries(cols)) {
    try {
      await query(`ALTER TABLE customers ADD COLUMN ${name} ${def}`);
    } catch {
      /* exists */
    }
  }
}

async function exec(conn, sql, params) {
  if (conn?.query) {
    const [rows] = await conn.query(sql, params);
    return rows;
  }
  return query(sql, params);
}

export function stampPayload(body = {}) {
  return {
    mobile_norm: M.normalizeMobile(body.mobile) || null,
    email_norm: M.normalizeEmail(body.email) || null,
    gstin_norm: M.normalizeGstin(body.gstin) || null,
  };
}

export async function stampCustomerNorms(conn, item) {
  if (!item?.id) return;
  const stamp = stampPayload(item);
  try {
    await exec(conn, "UPDATE customers SET mobile_norm=?, email_norm=?, gstin_norm=? WHERE id=?", [
      stamp.mobile_norm,
      stamp.email_norm,
      stamp.gstin_norm,
      item.id,
    ]);
  } catch {
    /* optional */
  }
}

export function isActiveRow(row) {
  return M.isActiveCustomer(row);
}

export async function findExistingCustomer(businessId, body = {}, excludeId = "") {
  await ensureCustomerDedupeSchema();
  const rows = await query("SELECT * FROM customers WHERE business_id=?", [businessId]);
  return M.findMatch(rows || [], body, excludeId);
}

export async function listActiveCustomers(businessId) {
  await ensureCustomerDedupeSchema();
  const rows = await query("SELECT * FROM customers WHERE business_id=? ORDER BY name", [businessId]);
  return M.activeCustomers(rows || []);
}

async function attachBillCounts(businessId, customers) {
  let counts = [];
  try {
    counts = await query(
      "SELECT customer_id, COUNT(*) n FROM sales_orders WHERE business_id=? AND (held IS NULL OR held=0) GROUP BY customer_id",
      [businessId],
    );
  } catch {
    counts = [];
  }
  const map = new Map((counts || []).map((r) => [r.customer_id, Number(r.n) || 0]));
  return (customers || []).map((c) => ({ ...c, bill_count: map.get(c.id) || 0 }));
}

export async function listDuplicateGroups(businessId) {
  const rows = await attachBillCounts(businessId, await listActiveCustomers(businessId));
  return M.groupDuplicates(rows);
}

export async function shareEnabled() {
  try {
    const rows = await query("SELECT setting_value FROM platform_settings WHERE setting_key='customer_share' LIMIT 1");
    return String(rows?.[0]?.setting_value || "") === "1";
  } catch {
    return false;
  }
}

export async function listPlatformDuplicateReport() {
  await ensureCustomerDedupeSchema();
  const shops = await query("SELECT id, name, category, business_type FROM businesses ORDER BY name");
  const report = [];
  const identity = new Map();
  const sharing = await shareEnabled();
  for (const shop of shops || []) {
    const groups = await listDuplicateGroups(shop.id);
    const customers = await attachBillCounts(shop.id, await listActiveCustomers(shop.id));
    report.push({
      business_id: shop.id,
      business_name: shop.name,
      business_type: shop.business_type || shop.category || "",
      groups,
      summary: M.summarizeDuplicates(groups, customers),
    });
    if (sharing) {
      for (const row of customers) {
        const keys = M.customerKeys(row);
        for (const field of ["mobile", "email", "gstin"]) {
          if (!keys[field]) continue;
          const k = `${field}:${keys[field]}`;
          if (!identity.has(k)) identity.set(k, []);
          identity.get(k).push({ ...row, business_id: shop.id, business_name: shop.name, match_field: field });
        }
      }
    }
  }
  const cross = [...identity.values()]
    .map((members) => {
      const shopsSeen = new Set(members.map((m) => m.business_id));
      return { members, shops: shopsSeen.size };
    })
    .filter((g) => g.shops > 1);
  return {
    shops: report,
    summary: {
      shops: report.length,
      groups: report.reduce((s, r) => s + (r.summary.groups || 0), 0),
      extra: report.reduce((s, r) => s + (r.summary.extra || 0), 0),
    },
    share_enabled: sharing,
    cross_shop: cross,
  };
}

async function remapId(conn, table, column, fromId, toId, businessId) {
  try {
    if (table === "account_ledger") {
      await exec(
        conn,
        "UPDATE account_ledger SET party_id=? WHERE business_id=? AND party_type='customer' AND party_id=?",
        [toId, businessId, fromId],
      );
      return;
    }
    await exec(conn, `UPDATE ${table} SET ${column}=? WHERE ${column}=? AND business_id=?`, [toId, fromId, businessId]);
  } catch {
    try {
      await exec(conn, `UPDATE ${table} SET ${column}=? WHERE ${column}=?`, [toId, fromId]);
    } catch {
      /* table optional */
    }
  }
}

async function mergeLoyalty(conn, businessId, primaryId, loserId) {
  try {
    const [primary] = await exec(conn, "SELECT * FROM loyalty_accounts WHERE customer_id=? LIMIT 1", [primaryId]);
    const [loser] = await exec(conn, "SELECT * FROM loyalty_accounts WHERE customer_id=? LIMIT 1", [loserId]);
    if (loser && primary) {
      await exec(
        conn,
        "UPDATE loyalty_accounts SET points_balance=?, lifetime_earned=?, lifetime_redeemed=? WHERE customer_id=?",
        [
          (Number(primary.points_balance) || 0) + (Number(loser.points_balance) || 0),
          (Number(primary.lifetime_earned) || 0) + (Number(loser.lifetime_earned) || 0),
          (Number(primary.lifetime_redeemed) || 0) + (Number(loser.lifetime_redeemed) || 0),
          primaryId,
        ],
      );
      await exec(conn, "UPDATE loyalty_accounts SET points_balance=0 WHERE customer_id=?", [loserId]);
    } else if (loser && !primary) {
      await exec(
        conn,
        "INSERT INTO loyalty_accounts (customer_id, business_id, points_balance, lifetime_earned, lifetime_redeemed, tier) VALUES (?,?,?,?,?,?)",
        [
          primaryId,
          businessId,
          Number(loser.points_balance) || 0,
          Number(loser.lifetime_earned) || 0,
          Number(loser.lifetime_redeemed) || 0,
          loser.tier || "bronze",
        ],
      );
    }
  } catch {
    /* loyalty optional */
  }
}

function fillPrimary(primary, loser) {
  const pick = (a, b) => (a && String(a).trim()) || b || null;
  return {
    name: pick(primary.name, loser.name),
    business_name: pick(primary.business_name, loser.business_name),
    mobile: pick(primary.mobile, loser.mobile),
    email: pick(primary.email, loser.email),
    gstin: pick(primary.gstin, loser.gstin),
    state: pick(primary.state, loser.state),
    address: pick(primary.address, loser.address),
    doctor_rx: pick(primary.doctor_rx, loser.doctor_rx),
    credit_limit: Math.max(Number(primary.credit_limit) || 0, Number(loser.credit_limit) || 0),
  };
}

export async function mergeCustomers(businessId, primaryId, loserIds, actor = {}) {
  await ensureCustomerDedupeSchema();
  const ids = [...new Set((loserIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!primaryId || !ids.length) throw new Error("Pick a primary customer and at least one duplicate");
  if (ids.includes(primaryId)) throw new Error("Primary customer cannot be merged into itself");

  return withTransaction(async (conn) => {
    const [primary] = await exec(conn, "SELECT * FROM customers WHERE id=? AND business_id=? LIMIT 1", [primaryId, businessId]);
    if (!primary) throw new Error("Primary customer not found in this shop");
    if (M.isWalkIn(primary)) throw new Error("Walk-in cannot be the merge target");
    const losers = [];
    for (const id of ids) {
      const [row] = await exec(conn, "SELECT * FROM customers WHERE id=? AND business_id=? LIMIT 1", [id, businessId]);
      if (!row) throw new Error("Duplicate customer not found in this shop");
      if (M.isWalkIn(row)) throw new Error("Walk-in records are not merged");
      if (M.isMerged(row)) throw new Error("That customer was already merged");
      losers.push(row);
    }

    const backupId = crypto.randomUUID();
    await exec(
      conn,
      "INSERT INTO customer_merge_backups (id, business_id, primary_id, loser_ids, snapshot, created_by) VALUES (?,?,?,?,?,?)",
      [
        backupId,
        businessId,
        primaryId,
        JSON.stringify(ids),
        JSON.stringify({ primary, losers }),
        actor.id || actor.email || "staff",
      ],
    );

    let next = { ...primary };
    for (const loser of losers) {
      await remapId(conn, "account_ledger", "party_id", loser.id, primaryId, businessId);
      for (const [table, column] of REMAP) {
        await remapId(conn, table, column, loser.id, primaryId, businessId);
      }
      try {
        await exec(conn, "UPDATE customers SET referred_by=? WHERE business_id=? AND referred_by=?", [
          primaryId,
          businessId,
          loser.id,
        ]);
      } catch {
        /* optional */
      }
      try {
        const holds = await exec(conn, "SELECT id, payload_json FROM held_bills WHERE business_id=?", [businessId]);
        for (const hold of holds || []) {
          const raw = String(hold.payload_json || "");
          if (!raw.includes(loser.id)) continue;
          await exec(conn, "UPDATE held_bills SET payload_json=? WHERE id=?", [raw.split(loser.id).join(primaryId), hold.id]);
        }
      } catch {
        /* optional */
      }
      await mergeLoyalty(conn, businessId, primaryId, loser.id);
      next = fillPrimary(next, loser);
      await exec(
        conn,
        "UPDATE customers SET merged_into=?, status='merged' WHERE id=? AND business_id=?",
        [primaryId, loser.id, businessId],
      );
    }

    await exec(
      conn,
      "UPDATE customers SET name=?, business_name=?, mobile=?, email=COALESCE(?, email), gstin=COALESCE(?, gstin), state=COALESCE(?, state), address=COALESCE(?, address), doctor_rx=COALESCE(?, doctor_rx), credit_limit=? WHERE id=? AND business_id=?",
      [
        next.name,
        next.business_name,
        next.mobile,
        next.email,
        next.gstin,
        next.state,
        next.address,
        next.doctor_rx,
        next.credit_limit,
        primaryId,
        businessId,
      ],
    );
    await stampCustomerNorms(conn, { ...next, id: primaryId });

    return {
      ok: true,
      backup_id: backupId,
      primary_id: primaryId,
      merged_ids: ids,
      deleted: false,
    };
  });
}

export function registerCustomerDedupeStaff(app) {
  app.get("/api/customers/duplicates", requireStaff, requirePerm("customers"), async (_req, res) => {
    try {
      const groups = await listDuplicateGroups(bid());
      res.json({ groups, summary: M.summarizeDuplicates(groups) });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.get("/api/customers/match", requireStaff, requirePerm("customers"), async (req, res) => {
    try {
      const match = await findExistingCustomer(bid(), {
        mobile: req.query.mobile,
        email: req.query.email,
        gstin: req.query.gstin,
      });
      res.json({ match, warning: match ? M.warningCopy(match, req.query) : "" });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/customers/merge", requireStaff, requirePerm("customers"), async (req, res) => {
    try {
      const role = authUser()?.role;
      if (role && role !== "business_admin" && role !== "manager") {
        res.status(403).json({ error: "Only a shop admin can merge customers" });
        return;
      }
      const result = await mergeCustomers(bid(), req.body?.primary_id, req.body?.loser_ids || [], authUser() || {});
      await audit("Customer merge", {
        module: "customers",
        target_id: result.primary_id,
        target_name: "Customer merge",
        backup_id: result.backup_id,
        merged_ids: result.merged_ids,
        deleted: false,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });
}

export function registerCustomerDedupeMaster(app) {
  app.get("/api/master/customer-duplicates", requireMaster, async (req, res) => {
    try {
      const shopId = String(req.query.business_id || "").trim();
      if (shopId) {
        const groups = await listDuplicateGroups(shopId);
        const [shop] = await query("SELECT id, name, category, business_type FROM businesses WHERE id=? LIMIT 1", [shopId]);
        res.json({
          shops: [
            {
              business_id: shopId,
              business_name: shop?.name || shopId,
              business_type: shop?.business_type || shop?.category || "",
              groups,
              summary: M.summarizeDuplicates(groups),
            },
          ],
          summary: M.summarizeDuplicates(groups),
          share_enabled: await shareEnabled(),
          cross_shop: [],
        });
        return;
      }
      res.json(await listPlatformDuplicateReport());
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/master/customer-duplicates/merge", requireMaster, async (req, res) => {
    try {
      const businessId = String(req.body?.business_id || "").trim();
      if (!businessId) {
        res.status(400).json({ error: "Shop is required" });
        return;
      }
      const result = await mergeCustomers(businessId, req.body?.primary_id, req.body?.loser_ids || [], {
        id: "master",
        email: "master",
      });
      await platformAudit({ email: "master" }, "Customer merge", {
        module: "customers",
        target_id: result.primary_id,
        business_id: businessId,
        backup_id: result.backup_id,
        merged_ids: result.merged_ids,
        deleted: false,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  app.get("/api/master/customer-share", requireMaster, async (_req, res) => {
    try {
      res.json({ enabled: await shareEnabled() });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/master/customer-share", requireMaster, async (req, res) => {
    try {
      const enabled = req.body?.enabled === true || req.body?.enabled === "1" || req.body?.enabled === 1;
      await setPlatformSetting("customer_share", enabled ? "1" : "0");
      await platformAudit({ email: "master" }, "Customer share setting", {
        module: "customers",
        enabled,
      });
      res.json({ ok: true, enabled });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });
}
