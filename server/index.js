import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUSINESS_ID, query, withTransaction } from "./db.js";
import { buildPricedLines, insertSalesOrder, registerCrud } from "./crud.js";
import { buildReports, reportsToSheets } from "./reports.js";
import { workbookXml } from "./excel.js";
import { ensureQrOrderSchema, registerQrOrdering } from "./qr-ordering.js";
import { ensurePharmacySchema } from "./pharmacy-schema.js";
import { listAllBatches, upsertBatch } from "./pharmacy-stock.js";
import {
  formatGstin,
  gstinStateCode,
  gstinStateName,
  isValidGstin,
  normalizeStateCode,
  primaryBatch,
  unitsPerPack,
} from "../js/pharmacy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const app = express();
const APP_VERSION = "pharmacy-8";
const APP_VERTICAL = "pharmacy";
app.use(express.json({ limit: "8mb" }));

async function ensureLogoColumn() {
  const cols = await query(
    `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_settings' AND COLUMN_NAME = 'logo_url'`,
  );
  if (!cols.length) {
    await query("ALTER TABLE company_settings ADD COLUMN logo_url MEDIUMTEXT NULL");
    return;
  }
  const type = String(cols[0].DATA_TYPE || "").toLowerCase();
  if (type !== "mediumtext" && type !== "longtext") {
    await query("ALTER TABLE company_settings MODIFY logo_url MEDIUMTEXT");
  }
}

app.get("/api/health", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    await query("SELECT 1");
    const cols = await query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'items' AND COLUMN_NAME = 'generic_name'`,
    );
    res.json({
      ok: true,
      vertical: APP_VERTICAL,
      version: APP_VERSION,
      pharmacy: true,
      medicineFields: cols.length > 0,
      businessId: BUSINESS_ID,
    });
  } catch (err) {
    res.status(500).json({ ok: false, vertical: APP_VERTICAL, version: APP_VERSION, error: String(err.message) });
  }
});

app.get("/api/bootstrap", async (_req, res) => {
  try {
    const [company] = await query(
      "SELECT * FROM company_settings WHERE business_id = ? LIMIT 1",
      [BUSINESS_ID],
    );
    const items = await query(
      "SELECT * FROM items WHERE business_id = ? ORDER BY category, subcategory, name",
      [BUSINESS_ID],
    );
    const customers = await query(
      "SELECT * FROM customers WHERE business_id = ? ORDER BY name",
      [BUSINESS_ID],
    );
    const packs = await query(
      "SELECT * FROM packs WHERE business_id = ? ORDER BY name",
      [BUSINESS_ID],
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
    const batches = await query(
      `SELECT * FROM item_batches WHERE business_id = ? AND qty > 0
       ORDER BY expiry_date IS NULL, expiry_date`,
      [BUSINESS_ID],
    ).catch(() => []);
    const enrichedItems = items.map((item) => {
      const primary = primaryBatch(batches, item.id);
      return {
        ...item,
        effective_units_per_pack: unitsPerPack(item),
        primary_batch_no: primary?.batch_no || null,
        primary_expiry: primary?.expiry_date || item.default_expiry || null,
      };
    });
    res.json({
      vertical: APP_VERTICAL,
      version: APP_VERSION,
      pharmacy: true,
      company: company || { name: "Pharmacy Medical POS" },
      items: enrichedItems,
      customers,
      batches,
      packs: packs.map((p) => ({
        ...p,
        items: packItems.filter((row) => row.pack_id === p.id),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.get("/api/invoices/:id", async (req, res) => {
  const id = String(req.params.id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    res.status(400).json({ error: "Invalid invoice id" });
    return;
  }
  try {
    const [order] = await query(
      "SELECT * FROM sales_orders WHERE id = ? AND business_id = ?",
      [id, BUSINESS_ID],
    );
    if (!order) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    const lines = await query("SELECT * FROM sales_order_lines WHERE order_id = ? ORDER BY created_at", [id]);
    const [company] = await query(
      "SELECT * FROM company_settings WHERE business_id = ? LIMIT 1",
      [BUSINESS_ID],
    );
    res.setHeader("Cache-Control", "no-store");
    res.json({ order: { ...order, lines }, company: company || { name: "Pharmacy Medical POS" } });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.get("/api/orders", async (_req, res) => {
  try {
    const orders = await query(
      "SELECT * FROM sales_orders WHERE business_id = ? ORDER BY created_at DESC LIMIT 80",
      [BUSINESS_ID],
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

app.get("/api/purchases", async (_req, res) => {
  try {
    const purchases = await query(
      "SELECT * FROM purchases WHERE business_id = ? ORDER BY created_at DESC LIMIT 80",
      [BUSINESS_ID],
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

app.get("/api/suppliers", async (_req, res) => {
  try {
    res.json(
      await query(
        "SELECT * FROM suppliers WHERE business_id = ? ORDER BY name",
        [BUSINESS_ID],
      ),
    );
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.get("/api/batches", async (_req, res) => {
  try {
    res.json(await listAllBatches());
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.get("/api/returns", async (_req, res) => {
  try {
    const returns = await query(
      "SELECT * FROM sales_returns WHERE business_id = ? ORDER BY created_at DESC LIMIT 80",
      [BUSINESS_ID],
    );
    const ids = returns.map((r) => r.id);
    const lines = ids.length
      ? await query(
          `SELECT * FROM sales_return_lines WHERE return_id IN (${ids.map(() => "?").join(",")})`,
          ids,
        )
      : [];
    res.json(returns.map((r) => ({ ...r, lines: lines.filter((l) => l.return_id === r.id) })));
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.get("/api/today", async (_req, res) => {
  try {
    const [today] = await query(
      `SELECT COUNT(*) AS bills,
              COALESCE(SUM(total),0) AS takings,
              COALESCE(SUM(gst),0) AS gst
       FROM sales_orders
       WHERE business_id = ? AND DATE(created_at) = CURDATE()`,
      [BUSINESS_ID],
    );
    res.json({ today: today || { bills: 0, takings: 0, gst: 0 } });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.get("/api/reports", async (req, res) => {
  const from = String(req.query.from || new Date().toISOString().slice(0, 10));
  const to = String(req.query.to || from);
  try {
    res.json(await buildReports(from, to));
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.get("/api/reports/excel", async (req, res) => {
  const from = String(req.query.from || new Date().toISOString().slice(0, 10));
  const to = String(req.query.to || from);
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
      `attachment; filename="pharmacy-reports-${slug}-${from}-to-${to}.xls"`,
    );
    res.send(xml);
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.post("/api/items/:id/receive", async (req, res) => {
  const qty = Number(req.body?.quantity_gm ?? req.body?.quantity ?? req.body?.qty);
  const batchNo = String(req.body?.batch_no || "").trim();
  const expiryDate = req.body?.expiry_date;
  if (!Number.isFinite(qty) || qty <= 0) {
    res.status(400).json({ error: "Quantity must be positive" });
    return;
  }
  if (!batchNo || !expiryDate) {
    res.status(400).json({ error: "Batch No. and Expiry Date are required to receive stock" });
    return;
  }
  try {
    const item = await withTransaction(async (conn) => {
      const [rows] = await conn.query("SELECT * FROM items WHERE id = ? AND business_id = ?", [
        req.params.id,
        BUSINESS_ID,
      ]);
      if (!rows[0]) throw new Error("Medicine not found");
      await upsertBatch(conn, {
        itemId: req.params.id,
        batchNo,
        expiryDate,
        qty,
        mrp: req.body?.mrp ?? rows[0].mrp,
        purchaseRate: req.body?.purchase_rate ?? rows[0].purchase_rate,
      });
      const [item] = await conn.query("SELECT * FROM items WHERE id = ?", [req.params.id]);
      return item[0];
    });
    res.json({ ok: true, item });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

function blank(value) {
  const text = value == null ? "" : String(value).trim();
  return text || null;
}

async function upsertCompanySettings(fields) {
  const cols = await query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_settings'`,
  );
  const allowed = new Set(cols.map((row) => row.COLUMN_NAME));
  const payload = Object.fromEntries(
    Object.entries(fields).filter(([key, value]) => allowed.has(key) && value !== undefined),
  );
  const [existing] = await query("SELECT business_id FROM company_settings WHERE business_id = ? LIMIT 1", [
    BUSINESS_ID,
  ]);
  if (existing) {
    const keys = Object.keys(payload);
    if (!keys.length) return;
    await query(
      `UPDATE company_settings SET ${keys.map((key) => `\`${key}\` = ?`).join(", ")} WHERE business_id = ?`,
      [...keys.map((key) => payload[key]), BUSINESS_ID],
    );
    return;
  }
  payload.business_id = BUSINESS_ID;
  if (allowed.has("id") && !payload.id) payload.id = crypto.randomUUID();
  const keys = Object.keys(payload);
  await query(
    `INSERT INTO company_settings (${keys.map((key) => `\`${key}\``).join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
    keys.map((key) => payload[key]),
  );
}

app.post("/api/settings", async (req, res) => {
  const body = req.body || {};
  const name = blank(body.name);
  if (!name) {
    res.status(400).json({ error: "Shop name is required" });
    return;
  }
  const gstin = formatGstin(body.gstin);
  if (!isValidGstin(gstin)) {
    res.status(400).json({ error: "Enter a valid 15-character GSTIN" });
    return;
  }
  const stateCode = normalizeStateCode(body.state_code) || gstinStateCode(gstin) || null;
  const state = blank(body.state) || gstinStateName(stateCode) || null;
  const email = blank(body.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Enter a valid email address" });
    return;
  }
  const fields = {
    name,
    address: blank(body.address),
    phone: blank(body.phone),
    email,
    gstin: gstin || null,
    drug_licence_no: blank(body.drug_licence_no),
    drug_licence_type: blank(body.drug_licence_type),
    fssai_licence_no: blank(body.fssai_licence_no),
    pharmacy_registration_no: blank(body.pharmacy_registration_no),
    other_licence_no: blank(body.other_licence_no),
    licence_expiry: blank(body.licence_expiry),
    state,
    state_code: stateCode,
  };
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
    fields.logo_url = logo || null;
  }
  try {
    await ensureLogoColumn();
    await ensurePharmacySchema();
    await upsertCompanySettings(fields);
    const [company] = await query("SELECT * FROM company_settings WHERE business_id = ?", [BUSINESS_ID]);
    res.json({ ok: true, company: company || { ...fields, business_id: BUSINESS_ID } });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

registerCrud(app);
registerQrOrdering(app);

app.post("/api/checkout", async (req, res) => {
  const { customerId, paymentMethod, lines, packId, packCount, doctorName, prescriptionNo, discount, amountPaid } =
    req.body || {};
  if (!Array.isArray(lines) || lines.length === 0) {
    res.status(400).json({ error: "Cart is empty" });
    return;
  }
  const method = String(paymentMethod || "cash").toLowerCase();
  if (!["cash", "upi", "card", "credit", "bank"].includes(method)) {
    res.status(400).json({ error: "Invalid payment method" });
    return;
  }
  try {
    const result = await withTransaction(async (conn) => {
      const [customers] = await conn.query(
        "SELECT * FROM customers WHERE id = ? AND business_id = ?",
        [customerId, BUSINESS_ID],
      );
      const customer = customers[0];
      if (!customer) throw new Error("Customer not found");
      const [companyRows] = await conn.query(
        "SELECT gstin, state_code FROM company_settings WHERE business_id = ? LIMIT 1",
        [BUSINESS_ID],
      );
      const built = await buildPricedLines(conn, customer, lines, { company: companyRows[0] });
      return insertSalesOrder(conn, {
        customer,
        built,
        packId,
        packCount,
        paymentMethod: method,
        doctorName,
        prescriptionNo,
        discount,
        amountPaid,
        company: companyRows[0],
      });
    });
    res.json({ ok: true, order: result });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.get(["/app.html", "/app", "/app/"], (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, "/");
});

app.use((req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
  }
  next();
});

app.use(express.static(root, { etag: false, lastModified: false, maxAge: 0 }));
app.get(["/qr", "/qr/"], (_req, res) => {
  res.redirect("/qr.html");
});
app.get(["/invoice", "/invoice/"], (req, res) => {
  const id = String(req.query.id || "");
  res.redirect(id ? `/invoice.html?id=${encodeURIComponent(id)}` : "/invoice.html");
});

const port = Number(process.env.PORT || 5173);
Promise.all([ensureLogoColumn(), ensureQrOrderSchema(), ensurePharmacySchema()])
  .catch((err) => console.error("schema", err.message))
  .finally(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`Pharmacy Medical POS ${APP_VERSION} http://0.0.0.0:${port}`);
    });
  });
