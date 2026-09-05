import "./load-env.js";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { query, withTransaction } from "./db.js";
import { bid, branchId, authUser } from "./context.js";
import { lineAmount, round2, registerCrud, itemBillName } from "./crud.js";
import { fyRangeForToday } from "./fy.js";
import { buildReports, reportsToSheets } from "./reports.js";
import { buildGrowthDashboard, answerGrowthQuestion, growthToSheets } from "./growth.js";
import { listCombos, createCombo } from "./combos.js";
import { listOffers, createOffer, updateOffer, getOffer, setOfferStatus, deleteOffer, duplicateOffer, offerStats, suggestOffers, getPromoSettings, savePromoSettings, recordOfferRedemptions } from "./offers.js";
import { workbookXml } from "./excel.js";
import { ensureSchema, seedPlatform } from "./schema.js";
import { companyTimezone, normalizeTimezone, shopTimezonePayload, tzOffsetFor } from "./timezone.js";
import { attachAuth, registerAuth, requireStaff, requirePerm } from "./auth.js";
import { registerMaster } from "./master.js";
import { registerTenant } from "./tenant.js";
import { registerBackup } from "./backup.js";
import { registerUnits, ensureInventoryUnits } from "./units.js";
import { registerAccounts } from "./accounts.js";
import { postSaleJournal } from "./accounting.js";
import { recordCreditSale } from "./accounts.js";
import { audit } from "./audit.js";
import { getPlatformSettings, shopSupportContact } from "./settings.js";
import { sendLowStockAlerts, tickShopAlerts, startAlertScheduler, scheduleAlertTick } from "./alerts.js";
import { registerAdvanced, computeSaleLine, applySaleStock, applyLoyaltyOnSale } from "./advanced.js";
import { registerQrPublic, registerQrStaff } from "./qr-ordering.js";
import "../js/discount.js";
import { canonApiUrl, isAliasedApi, isApiUrl, rewriteToApi } from "./http-path.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const publicDir = path.join(root);
const app = express();
app.set("trust proxy", true);
app.use((req, _res, next) => {
  const orig = req.originalUrl || req.url || "";
  const mapped = rewriteToApi(orig, req.headers["x-pos-path"]);
  const origPath = orig.split("?")[0];
  const bare =
    origPath.startsWith("/auth/") ||
    origPath === "/health" ||
    origPath.startsWith("/support-contact") ||
    origPath.startsWith("/bootstrap");
  if (mapped.startsWith("/api") && (isAliasedApi(orig) || bare)) {
    req.url = mapped;
  }
  next();
});
app.use(express.json({ limit: "32mb" }));
app.use((req, res, next) => {
  if (req.path === "/pos-bridge.json" || req.path === "/.env" || req.path.startsWith("/.env.")) {
    res.status(404).end();
    return;
  }
  if (
    req.path.startsWith("/server/") ||
    req.path.startsWith("/node_modules/") ||
    req.path.startsWith("/scripts/") ||
    req.path === "/server.js" ||
    req.path === "/app.js" ||
    req.path === "/index.js" ||
    req.path === "/Procfile" ||
    req.path === "/package.json" ||
    req.path === "/package-lock.json"
  ) {
    res.status(404).end();
    return;
  }
  next();
});
app.use(attachAuth);
registerAuth(app);
registerQrPublic(app);
app.use((req, res, next) => {
  const url = canonApiUrl(req.originalUrl || "", req.headers["x-pos-path"]);
  if (!isApiUrl(url)) return next();
  if (
    url.startsWith("/api/auth") ||
    url.startsWith("/api/qr/") ||
    url.startsWith("/api/health") ||
    url.startsWith("/api/master") ||
    url.startsWith("/api/support-contact")
  ) {
    return next();
  }
  return requireStaff(req, res, next);
});
registerMaster(app);
registerTenant(app);
registerAdvanced(app);
registerBackup(app);
registerUnits(app);
registerQrStaff(app);

app.get("/api/support-contact", async (_req, res) => {
  try {
    res.json(await getPlatformSettings());
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    await query("SELECT 1");
    scheduleAlertTick();
    res.json({ ok: true, multiTenant: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message) });
  }
});

app.get("/api/bootstrap", requireStaff, async (_req, res) => {
  try {
    const businessId = bid();
    const [company] = await query(
      "SELECT * FROM company_settings WHERE business_id = ? LIMIT 1",
      [businessId],
    );
    const [business] = await query("SELECT * FROM businesses WHERE id = ?", [businessId]);
    const items = await query(
      "SELECT * FROM items WHERE business_id = ? ORDER BY category, subcategory, name",
      [businessId],
    );
    const customers = await query(
      "SELECT * FROM customers WHERE business_id = ? ORDER BY name",
      [businessId],
    );
    const packs = await query(
      "SELECT * FROM packs WHERE business_id = ? ORDER BY name",
      [businessId],
    );
    const packItems = packs.length
      ? await query(
          `SELECT pi.*, i.name AS spice_name, i.local_name, i.code AS item_code
           FROM pack_items pi
           JOIN items i ON i.id = pi.item_id
           WHERE pi.pack_id IN (${packs.map(() => "?").join(",")})
           ORDER BY pi.sort_order`,
          packs.map((p) => p.id),
        )
      : [];
    const notes = await query(
      `SELECT id, title, body, image_url, created_at FROM notifications
       WHERE business_id IS NULL OR business_id = '' OR business_id = ? ORDER BY created_at DESC LIMIT 8`,
      [businessId],
    );
    let units = [];
    try {
      units = await ensureInventoryUnits(businessId);
    } catch {
      units = [];
    }
    res.json({
      company: {
        ...(company || { name: business?.name || "POS" }),
        ...companyTimezone(company || {}),
      },
      business,
      plan: business?.plan_id
        ? (
            await query(
              "SELECT id, code, name, fee_monthly, max_branches, max_users, max_devices FROM subscription_plans WHERE id = ?",
              [business.plan_id],
            )
          )[0] || null
        : null,
      support: await shopSupportContact(businessId),
      notes,
      items,
      units,
      customers,
      packs: packs.map((p) => ({
        ...p,
        items: packItems.filter((row) => row.pack_id === p.id),
      })),
      combos: await listCombos(businessId).catch(() => []),
      offers: await listOffers(businessId).catch(() => []),
      offerSettings: await getPromoSettings(businessId).catch(() => ({ stacking: "product_and_bill" })),
    });
    void tickShopAlerts(businessId).catch((err) => console.error("shop alert tick failed:", err.message));
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.get("/api/orders", requireStaff, requirePerm("orders"), async (_req, res) => {
  try {
    const orders = await query(
      `SELECT o.*, COALESCE(
         NULLIF(TRIM(o.customer_name), ''),
         NULLIF(TRIM(c.business_name), ''),
         NULLIF(TRIM(c.name), ''),
         'Walk-in'
       ) AS customer_name
       FROM sales_orders o
       LEFT JOIN customers c ON c.id = o.customer_id AND c.business_id = o.business_id
       WHERE o.business_id = ?
       ORDER BY CAST(SUBSTRING(o.order_number, 4) AS UNSIGNED) DESC, o.created_at DESC
       LIMIT 80`,
      [bid()],
    );
    const ids = orders.map((o) => o.id);
    const lines = ids.length
      ? await query(
          `SELECT * FROM sales_order_lines WHERE order_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at`,
          ids,
        )
      : [];
    res.json(
      orders.map((o) => ({
        ...o,
        lines: lines.filter((l) => l.order_id === o.id),
      })),
    );
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.get("/api/purchases", requireStaff, requirePerm("purchases"), async (_req, res) => {
  try {
    const purchases = await query(
      "SELECT * FROM purchases WHERE business_id = ? ORDER BY created_at DESC LIMIT 80",
      [bid()],
    );
    const ids = purchases.map((p) => p.id);
    const lines = ids.length
      ? await query(
          `SELECT * FROM purchase_lines WHERE purchase_id IN (${ids.map(() => "?").join(",")})`,
          ids,
        )
      : [];
    res.json(
      purchases.map((p) => ({
        ...p,
        lines: lines.filter((l) => l.purchase_id === p.id),
      })),
    );
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.get("/api/suppliers", requireStaff, requirePerm("suppliers"), async (_req, res) => {
  try {
    res.json(await query("SELECT * FROM suppliers WHERE business_id = ? ORDER BY name", [bid()]));
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.get("/api/today", requireStaff, async (_req, res) => {
  try {
    const [today] = await query(
      `SELECT COUNT(*) AS bills,
              COALESCE(SUM(total),0) AS takings,
              COALESCE(SUM(gst),0) AS gst
       FROM sales_orders
       WHERE business_id = ? AND DATE(created_at) = CURDATE()`,
      [bid()],
    );
    res.json({ today: today || { bills: 0, takings: 0, gst: 0 } });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.get("/api/reports", requireStaff, requirePerm("reports"), async (req, res) => {
  const fy = fyRangeForToday();
  const from = String(req.query.from || fy.from);
  const to = String(req.query.to || fy.to);
  try {
    res.json(await buildReports(from, to));
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.get("/api/combos", requireStaff, async (_req, res) => {
  try {
    res.json(await listCombos());
  } catch (err) {
    res.status(500).json({ error: String(err.message || "Combos failed") });
  }
});

app.post("/api/combos", requireStaff, async (req, res) => {
  try {
    const combo = await createCombo(req.body || {});
    res.json({ ok: true, combo });
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || "Could not create combo") });
  }
});

app.get("/api/offers", requireStaff, async (_req, res) => {
  try {
    res.json(await listOffers());
  } catch (err) {
    res.status(500).json({ error: String(err.message || "Offers failed") });
  }
});
app.get("/api/offers/stats", requireStaff, async (_req, res) => {
  try {
    res.json(await offerStats());
  } catch (err) {
    res.status(500).json({ error: String(err.message || "Offer stats failed") });
  }
});
app.get("/api/offers/settings", requireStaff, async (_req, res) => {
  try {
    res.json(await getPromoSettings());
  } catch (err) {
    res.status(500).json({ error: String(err.message || "Offer settings failed") });
  }
});
app.put("/api/offers/settings", requireStaff, async (req, res) => {
  try {
    res.json({ ok: true, settings: await savePromoSettings(req.body || {}) });
  } catch (err) {
    res.status(500).json({ error: String(err.message || "Could not save offer settings") });
  }
});
app.get("/api/offers/suggest", requireStaff, async (_req, res) => {
  try {
    let growth = {};
    try { growth = await buildGrowthDashboard(); } catch { /* optional */ }
    const items = await query("SELECT * FROM items WHERE business_id = ?", [bid()]).catch(() => []);
    res.json({ ok: true, ideas: await suggestOffers(growth, items) });
  } catch (err) {
    res.status(500).json({ error: String(err.message || "Offer suggestions failed") });
  }
});
app.post("/api/offers", requireStaff, async (req, res) => {
  try {
    const offer = await createOffer(req.body || {});
    res.json({ ok: true, offer });
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || "Could not create offer") });
  }
});
app.get("/api/offers/:id", requireStaff, async (req, res) => {
  try {
    res.json(await getOffer(req.params.id));
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || "Offer not found") });
  }
});
app.put("/api/offers/:id", requireStaff, async (req, res) => {
  try {
    res.json({ ok: true, offer: await updateOffer(req.params.id, req.body || {}) });
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || "Could not update offer") });
  }
});
app.post("/api/offers/:id/status", requireStaff, async (req, res) => {
  try {
    res.json({ ok: true, offer: await setOfferStatus(req.params.id, String(req.body?.status || "paused")) });
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || "Could not update offer status") });
  }
});
app.delete("/api/offers/:id", requireStaff, async (req, res) => {
  try {
    res.json(await deleteOffer(req.params.id));
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || "Could not delete offer") });
  }
});
app.post("/api/offers/:id/duplicate", requireStaff, async (req, res) => {
  try {
    res.json({ ok: true, offer: await duplicateOffer(req.params.id) });
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || "Could not duplicate offer") });
  }
});

app.get("/api/growth", requireStaff, requirePerm("reports"), async (req, res) => {
  try {
    res.json(await buildGrowthDashboard());
  } catch (err) {
    res.status(500).json({ error: String(err.message || "Growth failed") });
  }
});

app.post("/api/growth/ask", requireStaff, requirePerm("reports"), async (req, res) => {
  try {
    const data = await buildGrowthDashboard();
    const question = String(req.body?.question || "");
    res.json({ ok: true, answer: answerGrowthQuestion(question, data), question });
  } catch (err) {
    res.status(500).json({ error: String(err.message || "Ask failed") });
  }
});

app.get("/api/growth/excel", requireStaff, requirePerm("reports"), async (req, res) => {
  try {
    const data = await buildGrowthDashboard();
    const xml = workbookXml(growthToSheets(data));
    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ai-growth-${data.range?.today || "today"}.xls"`);
    res.send(xml);
  } catch (err) {
    res.status(500).json({ error: String(err.message || "Growth Excel failed") });
  }
});

app.get("/api/reports/excel", requireStaff, requirePerm("reports"), async (req, res) => {
  const fy = fyRangeForToday();
  const from = String(req.query.from || fy.from);
  const to = String(req.query.to || fy.to);
  const sheet = req.query.sheet ? String(req.query.sheet) : "";
  try {
    const data = await buildReports(from, to);
    let sheets = reportsToSheets(data);
    if (sheet) {
      sheets = sheets.filter((s) => s.name === sheet);
      if (!sheets.length) {
        res.status(400).json({ error: "Unknown report type" });
        return;
      }
    }
    const xml = workbookXml(sheets);
    const slug = sheet ? sheet.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-") : "all";
    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="reports-${slug}-${from}-to-${to}.xls"`,
    );
    res.send(xml);
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.post("/api/items/:id/receive", requireStaff, requirePerm("stock"), async (req, res) => {
  const qty = Number(req.body?.quantity_gm);
  if (!Number.isFinite(qty) || qty <= 0) {
    res.status(400).json({ error: "quantity_gm must be positive" });
    return;
  }
  try {
    await query("UPDATE items SET stock_gm = stock_gm + ? WHERE id = ? AND business_id = ?", [
      qty,
      req.params.id,
      bid(),
    ]);
    const [item] = await query("SELECT * FROM items WHERE id = ? AND business_id = ?", [
      req.params.id,
      bid(),
    ]);
    res.json({ ok: true, item });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.post("/api/settings", requireStaff, requirePerm("settings"), async (req, res) => {
  const body = req.body || {};
  const { name, address, phone, email, gstin, city, state, pincode, timezone } = body;
  if (!name || !String(name).trim()) {
    res.status(400).json({ error: "Shop name is required" });
    return;
  }
  const tz = normalizeTimezone(timezone);
  const tzOffset = tzOffsetFor(tz);
  let logoSql = "";
  const params = [
    String(name).trim(),
    address || null,
    phone || null,
    email || null,
    gstin || null,
    city || null,
    state || null,
    pincode || null,
    tz,
    tzOffset,
  ];
  if (Object.prototype.hasOwnProperty.call(body, "logo_url")) {
    const logo = body.logo_url ? String(body.logo_url) : "";
    if (logo && !logo.startsWith("data:image/")) {
      res.status(400).json({ error: "Logo must be an uploaded image" });
      return;
    }
    if (logo && logo.length > 6_000_000) {
      res.status(400).json({ error: "Logo is too large" });
      return;
    }
    logoSql = ", logo_url = ?";
    params.push(logo || null);
  }
  params.push(bid());
  try {
    await query(
      `UPDATE company_settings
       SET name = ?, address = ?, phone = ?, email = ?, gstin = ?, city = ?, state = ?, pincode = ?, timezone = ?, tz_offset = ?${logoSql}
       WHERE business_id = ?`,
      params,
    );
    await query(
      `UPDATE businesses SET name = ?, address = COALESCE(?, address), mobile = COALESCE(?, mobile),
         email = COALESCE(?, email), gstin = COALESCE(?, gstin),
         city = COALESCE(?, city), state = COALESCE(?, state), pin_code = COALESCE(?, pin_code)
       WHERE id = ?`,
      [
        String(name).trim(),
        address || null,
        phone || null,
        email || null,
        gstin || null,
        city || null,
        state || null,
        pincode || null,
        bid(),
      ],
    );
    const [company] = await query("SELECT * FROM company_settings WHERE business_id = ?", [bid()]);
    await audit("Settings Changed", { module: "settings" }, req);
    res.json({ ok: true, company });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

registerCrud(app);
registerAccounts(app);

app.post("/api/checkout", requireStaff, requirePerm("counter"), async (req, res) => {
  const { customerId, paymentMethod, lines, packId, packCount, discount, discountType, discountValue, loyaltyPoints, offerIds } = req.body || {};
  if (!Array.isArray(lines) || lines.length === 0) {
    res.status(400).json({ error: "Cart is empty" });
    return;
  }
  const method = String(paymentMethod || "cash").toLowerCase();
  if (!["cash", "upi", "card", "credit"].includes(method)) {
    res.status(400).json({ error: "Invalid payment method" });
    return;
  }
  try {
    const businessId = bid();
    try {
      await ensureInventoryUnits(businessId);
    } catch {
      /* unit master optional */
    }
    const result = await withTransaction(async (conn) => {
      const [customers] = await conn.query(
        "SELECT * FROM customers WHERE id = ? AND business_id = ?",
        [customerId, businessId],
      );
      const customer = customers[0];
      if (!customer) throw new Error("Customer not found");

      const built = [];
      for (const line of lines) {
        const [items] = await conn.query(
          "SELECT * FROM items WHERE id = ? AND business_id = ?",
          [line.itemId, businessId],
        );
        const item = items[0];
        if (!item) throw new Error("Unknown item");
        const qty = Number(line.quantity_gm);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error("Invalid quantity");
        built.push(computeSaleLine(item, customer, line));
      }

      const D = globalThis.POSDiscount;
      const bill = D.computeBill(built, {
        discountType: discountType || (Number(discount) ? "amt" : "amt"),
        discountValue: discountValue ?? discount ?? 0,
      });
      const subtotal = bill.subtotal;
      const gst = bill.gst;
      let billDiscount = bill.billDiscount;
      let loyaltyDiscount = 0;
      let loyaltyEarn = 0;
      let loyaltyRedeem = 0;
      let total = bill.total;
      const totalGm = built.reduce((s, l) => s + l.qty, 0);

      const [[seq]] = await conn.query(
        "SELECT next_value FROM number_sequences WHERE name = 'order' AND business_id = ? FOR UPDATE",
        [businessId],
      );
      const next = seq ? Number(seq.next_value) : 10001;
      if (seq) {
        await conn.query(
          "UPDATE number_sequences SET next_value = ? WHERE name = 'order' AND business_id = ?",
          [next + 1, businessId],
        );
      } else {
        await conn.query(
          "INSERT INTO number_sequences (name, next_value, business_id) VALUES ('order', ?, ?)",
          [next + 1, businessId],
        );
      }
      const orderNumber = `SO-${next}`;
      const orderId = crypto.randomUUID();
      const payStatus = method === "credit" ? "partial" : "paid";

      let packName = null;
      if (packId) {
        const [packs] = await conn.query(
          "SELECT * FROM packs WHERE id = ? AND business_id = ?",
          [packId, businessId],
        );
        packName = packs[0]?.name || null;
      }

      const afterBill = round2(Math.max(0, subtotal + gst - billDiscount));
      total = afterBill;
      await conn.query(
        `INSERT INTO sales_orders (
           id, order_number, customer_id, customer_name, customer_type,
           pack_id, pack_name, pack_count, status, total_quantity_gm,
           subtotal, discount, gst, total, payment_method, payment_status, business_id,
           branch_id, cashier_id
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          orderId,
          orderNumber,
          customer.id,
          customer.business_name || customer.name,
          customer.type,
          packId || null,
          packName,
          packCount || null,
          "confirmed",
          totalGm,
          subtotal,
          billDiscount,
          gst,
          total,
          method,
          payStatus,
          businessId,
          branchId(),
          authUser()?.id || null,
        ],
      );
      try {
        await conn.query(
          `UPDATE sales_orders SET discount_type=?, discount_value=? WHERE id=? AND business_id=?`,
          [bill.discountType, bill.discountValue, orderId, businessId],
        );
      } catch {
        /* optional columns */
      }

      for (const line of built) {
        const lineId = crypto.randomUUID();
        try {
          await conn.query(
            `INSERT INTO sales_order_lines (
               id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
               discount, amount, gst_rate, cancelled, business_id,
               mrp, discount_type, discount_value, barcode, batch_id, cost, profit
             ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              lineId, orderId, line.item.id, itemBillName(line.item), line.qty, line.rate,
              line.discount, line.amount, line.gstRate, 0, businessId,
              line.mrp, line.discountType, line.discountValue, line.barcode || null, null, line.cost, line.profit,
            ],
          );
        } catch {
          await conn.query(
            `INSERT INTO sales_order_lines (
               id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
               discount, amount, gst_rate, cancelled, business_id
             ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [lineId, orderId, line.item.id, itemBillName(line.item), line.qty, line.rate, line.discount, line.amount, line.gstRate, 0, businessId],
          );
        }
        const alloc = await applySaleStock(conn, {
          businessId,
          branchId: branchId(),
          userId: authUser()?.id,
          item: line.item,
          qty: line.qty,
          barcode: line.barcode,
          batchId: line.batchId,
          orderId,
          orderNumber,
          costRate: line.item.purchase_rate,
        });
        if (alloc?.batch?.id) {
          try {
            await conn.query("UPDATE sales_order_lines SET batch_id=?, barcode=COALESCE(NULLIF(barcode,''), ?) WHERE id=?", [alloc.batch.id, alloc.batch.barcode, lineId]);
          } catch {
            /* optional */
          }
        }
      }

      try {
        const loyalty = await applyLoyaltyOnSale(conn, {
          businessId,
          customer,
          orderId,
          total: afterBill,
          wantRedeem: loyaltyPoints,
          userId: authUser()?.id,
        });
        loyaltyDiscount = loyalty.rupees;
        loyaltyEarn = loyalty.earned;
        loyaltyRedeem = loyalty.points;
        total = round2(Math.max(0, afterBill - loyaltyDiscount));
        await conn.query(
          `UPDATE sales_orders SET total=?, loyalty_points_redeemed=?, loyalty_points_earned=?, loyalty_discount=? WHERE id=?`,
          [total, loyaltyRedeem, loyaltyEarn, loyaltyDiscount, orderId],
        );
      } catch {
        /* loyalty optional */
      }

      try {
        await recordOfferRedemptions({
          offerIds,
          orderId,
          customerId: customer.id,
          discount: billDiscount,
          total,
        }, businessId);
      } catch {
        /* offers optional */
      }

      const [orders] = await conn.query(
        "SELECT * FROM sales_orders WHERE id = ? AND business_id = ?",
        [orderId, businessId],
      );
      const [orderLines] = await conn.query("SELECT * FROM sales_order_lines WHERE order_id = ?", [
        orderId,
      ]);
      const orderRow = orders[0] || {
        id: orderId,
        order_number: orderNumber,
        customer_id: customer.id,
        customer_name: customer.business_name || customer.name,
        customer_type: customer.type,
        pack_id: packId || null,
        pack_name: packName,
        pack_count: packCount || null,
        status: "confirmed",
        total_quantity_gm: totalGm,
        subtotal,
        discount: billDiscount,
        gst,
        total,
        payment_method: method,
        payment_status: payStatus,
        business_id: businessId,
        branch_id: branchId(),
        cashier_id: authUser()?.id || null,
        created_at: new Date().toISOString(),
        lines: orderLines,
      };
      if (!orders[0]) orderRow.lines = orderLines;
      else orderRow.lines = orderLines;
      await recordCreditSale(conn, {
        customer,
        total,
        orderId: orderRow.id,
        orderNumber: orderRow.order_number,
        method,
      });
      await postSaleJournal(conn, orderRow);
      return orderRow;
    });
    await audit("Sale Created", {
      module: "sales",
      target_id: result.id,
      target_name: result.order_number,
      total: result.total,
      payment_method: result.payment_method,
      customer_name: result.customer_name,
    }, req);
    const soldIds = (result.lines || []).map((line) => line.item_id).filter(Boolean);
    void sendLowStockAlerts(businessId, soldIds).catch((err) => console.error("low stock alert failed:", err.message));
    void tickShopAlerts(businessId).catch((err) => console.error("closing alert failed:", err.message));
    res.json({ ok: true, order: result });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: `Unknown API ${req.method} ${req.originalUrl}` });
});

app.use((req, res, next) => {
  if (isApiUrl(req.originalUrl || req.url, req.headers["x-pos-path"])) {
    res.status(404).json({ error: `Unknown API ${req.method} ${req.originalUrl}` });
    return;
  }
  next();
});

app.use(express.static(publicDir));

const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "0.0.0.0";

function writeBridge(info) {
  const json = JSON.stringify(info);
  const text = String(info.port);
  for (const dir of new Set([root, process.cwd()])) {
    try {
      fs.writeFileSync(path.join(dir, "pos-bridge.json"), json, "utf8");
    } catch (err) {
      console.error("Could not write pos-bridge.json", err);
    }
    try {
      fs.writeFileSync(path.join(dir, "pos-port.txt"), text, "utf8");
    } catch {
      /* ignore */
    }
  }
}

function listenTcp(bindHost, bindPort) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    const onErr = (err) => {
      server.close();
      reject(err);
    };
    server.once("error", onErr);
    server.listen(bindPort, bindHost, () => {
      server.off("error", onErr);
      resolve(server);
    });
  });
}

async function startHttp() {
  const passenger = globalThis.PhusionPassenger;
  if (passenger) {
    passenger.configure({ autoInstall: false });
    app.listen("passenger");
    console.log("Multi-tenant POS listening via Passenger");
    const candidates = [...new Set([Number(process.env.POS_BRIDGE_PORT) || 0, port, 5173, 38473].filter((p) => p > 0)), 0];
    for (const p of candidates) {
      try {
        const server = await listenTcp("127.0.0.1", p);
        const addr = server.address();
        const bound = typeof addr === "object" && addr ? addr.port : p;
        writeBridge({ host: "127.0.0.1", port: bound });
        console.log(`POS PHP bridge on 127.0.0.1:${bound}`);
        return;
      } catch (err) {
        if (err.code !== "EADDRINUSE") console.error(err);
      }
    }
    if (port) writeBridge({ host: "127.0.0.1", port });
    console.error("POS PHP bridge could not bind a local TCP port");
    return;
  }
  await listenTcp(host, port);
  writeBridge({ host: "127.0.0.1", port });
  console.log(`Multi-tenant POS listening on ${host}:${port}`);
}

startHttp()
  .then(() => {
    startAlertScheduler();
  })
  .catch((err) => {
    console.error("HTTP listen failed", err);
    process.exit(1);
  });
ensureSchema()
  .then(() => seedPlatform())
  .catch((err) => {
    console.error("Schema/seed error (API is still up; check DB env vars)", err);
  });
