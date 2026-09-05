import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUSINESS_ID, query, withTransaction } from "./db.js";
import { buildPricedLines, insertSalesOrder, registerCrud } from "./crud.js";
import { buildReports, reportsToSheets } from "./reports.js";
import { workbookXml } from "./excel.js";
import { ensureQrOrderSchema, registerQrOrdering } from "./qr-ordering.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const app = express();
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
  try {
    await query("SELECT 1");
    res.json({ ok: true, businessId: BUSINESS_ID });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message) });
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
    res.json({
      company: company || { name: "SWAMI MASALE SASWAD" },
      items,
      customers,
      packs: packs.map((p) => ({
        ...p,
        items: packItems.filter((row) => row.pack_id === p.id),
      })),
    });
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
      `attachment; filename="swami-reports-${slug}-${from}-to-${to}.xls"`,
    );
    res.send(xml);
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.post("/api/items/:id/receive", async (req, res) => {
  const qty = Number(req.body?.quantity_gm);
  if (!Number.isFinite(qty) || qty <= 0) {
    res.status(400).json({ error: "quantity_gm must be positive" });
    return;
  }
  try {
    await query(
      "UPDATE items SET stock_gm = stock_gm + ? WHERE id = ? AND business_id = ?",
      [qty, req.params.id, BUSINESS_ID],
    );
    const [item] = await query("SELECT * FROM items WHERE id = ?", [req.params.id]);
    res.json({ ok: true, item });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.post("/api/settings", async (req, res) => {
  const body = req.body || {};
  const { name, address, phone, email, gstin } = body;
  if (!name || !String(name).trim()) {
    res.status(400).json({ error: "Shop name is required" });
    return;
  }
  let logoSql = "";
  const params = [
    String(name).trim(),
    address || null,
    phone || null,
    email || null,
    gstin || null,
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
  params.push(BUSINESS_ID);
  try {
    await ensureLogoColumn();
    await query(
      `UPDATE company_settings
       SET name = ?, address = ?, phone = ?, email = ?, gstin = ?${logoSql}
       WHERE business_id = ?`,
      params,
    );
    const [company] = await query(
      "SELECT * FROM company_settings WHERE business_id = ?",
      [BUSINESS_ID],
    );
    res.json({ ok: true, company });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

registerCrud(app);
registerQrOrdering(app);

app.post("/api/checkout", async (req, res) => {
  const { customerId, paymentMethod, lines, packId, packCount } = req.body || {};
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
    const result = await withTransaction(async (conn) => {
      const [customers] = await conn.query(
        "SELECT * FROM customers WHERE id = ? AND business_id = ?",
        [customerId, BUSINESS_ID],
      );
      const customer = customers[0];
      if (!customer) throw new Error("Customer not found");
      const built = await buildPricedLines(conn, customer, lines);
      return insertSalesOrder(conn, {
        customer,
        built,
        packId,
        packCount,
        paymentMethod: method,
      });
    });
    res.json({ ok: true, order: result });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.use(express.static(root));
app.get(["/qr", "/qr/"], (_req, res) => {
  res.redirect("/qr.html");
});

const port = Number(process.env.PORT || 5173);
Promise.all([ensureLogoColumn(), ensureQrOrderSchema()])
  .catch((err) => console.error("schema", err.message))
  .finally(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`SWAMI MASALE POS http://0.0.0.0:${port}`);
    });
  });
