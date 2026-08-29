import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUSINESS_ID, query, withTransaction } from "./db.js";
import { lineAmount, round2, registerCrud } from "./crud.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const app = express();
app.use(express.json({ limit: "1mb" }));

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

app.get("/api/reports", async (_req, res) => {
  try {
    const [today] = await query(
      `SELECT COUNT(*) AS bills,
              COALESCE(SUM(total),0) AS takings,
              COALESCE(SUM(gst),0) AS gst
       FROM sales_orders
       WHERE business_id = ? AND DATE(created_at) = CURDATE()`,
      [BUSINESS_ID],
    );
    const methods = await query(
      `SELECT payment_method, COALESCE(SUM(total),0) AS total
       FROM sales_orders
       WHERE business_id = ? AND DATE(created_at) = CURDATE()
       GROUP BY payment_method`,
      [BUSINESS_ID],
    );
    const low = await query(
      `SELECT name, local_name, stock_gm, reorder_level_gm
       FROM items WHERE business_id = ? AND stock_gm <= reorder_level_gm
       ORDER BY stock_gm`,
      [BUSINESS_ID],
    );
    res.json({ today, methods, low });
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
  const { name, address, phone, email, gstin } = req.body || {};
  if (!name || !String(name).trim()) {
    res.status(400).json({ error: "Shop name is required" });
    return;
  }
  try {
    await query(
      `UPDATE company_settings
       SET name = ?, address = ?, phone = ?, email = ?, gstin = ?
       WHERE business_id = ?`,
      [
        String(name).trim(),
        address || null,
        phone || null,
        email || null,
        gstin || null,
        BUSINESS_ID,
      ],
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

      const built = [];
      for (const line of lines) {
        const [items] = await conn.query(
          "SELECT * FROM items WHERE id = ? AND business_id = ?",
          [line.itemId, BUSINESS_ID],
        );
        const item = items[0];
        if (!item) throw new Error("Unknown item");
        const qty = Number(line.quantity_gm);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error("Invalid quantity");
        const rate =
          customer.type === "b2b" ? Number(item.b2b_rate) : Number(item.retail_rate);
        const amount = round2(lineAmount(qty, rate));
        built.push({ item, qty, rate, amount, gstRate: Number(item.gst_rate) || 0 });
      }

      const subtotal = round2(built.reduce((s, l) => s + l.amount, 0));
      const gst = round2(built.reduce((s, l) => s + (l.amount * l.gstRate) / 100, 0));
      const total = round2(subtotal + gst);
      const totalGm = built.reduce((s, l) => s + l.qty, 0);

      const [[seq]] = await conn.query(
        "SELECT next_value FROM number_sequences WHERE name = 'order' AND business_id = ? FOR UPDATE",
        [BUSINESS_ID],
      );
      const next = seq ? Number(seq.next_value) : 10036;
      if (seq) {
        await conn.query(
          "UPDATE number_sequences SET next_value = ? WHERE name = 'order' AND business_id = ?",
          [next + 1, BUSINESS_ID],
        );
      } else {
        await conn.query(
          "INSERT INTO number_sequences (name, next_value, business_id) VALUES ('order', ?, ?)",
          [next + 1, BUSINESS_ID],
        );
      }
      const orderNumber = `SO-${next}`;
      const orderId = crypto.randomUUID();
      const nowStatus = "confirmed";
      const payStatus = method === "credit" ? "partial" : "paid";

      let packName = null;
      if (packId) {
        const [packs] = await conn.query("SELECT * FROM packs WHERE id = ?", [packId]);
        packName = packs[0]?.name || null;
      }

      await conn.query(
        `INSERT INTO sales_orders (
           id, order_number, customer_id, customer_name, customer_type,
           pack_id, pack_name, pack_count, status, total_quantity_gm,
           subtotal, discount, gst, total, payment_method, payment_status, business_id
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          orderId,
          orderNumber,
          customer.id,
          customer.business_name || customer.name,
          customer.type,
          packId || null,
          packName,
          packCount || null,
          nowStatus,
          totalGm,
          subtotal,
          0,
          gst,
          total,
          method,
          payStatus,
          BUSINESS_ID,
        ],
      );

      for (const line of built) {
        await conn.query(
          `INSERT INTO sales_order_lines (
             id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
             discount, amount, gst_rate, cancelled, business_id
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [
            crypto.randomUUID(),
            orderId,
            line.item.id,
            line.item.name,
            line.qty,
            line.rate,
            0,
            line.amount,
            line.gstRate,
            0,
            BUSINESS_ID,
          ],
        );
        await conn.query(
          "UPDATE items SET stock_gm = stock_gm - ? WHERE id = ? AND business_id = ?",
          [line.qty, line.item.id, BUSINESS_ID],
        );
      }

      const [orders] = await conn.query("SELECT * FROM sales_orders WHERE id = ?", [orderId]);
      const [orderLines] = await conn.query(
        "SELECT * FROM sales_order_lines WHERE order_id = ?",
        [orderId],
      );
      return { ...orders[0], lines: orderLines };
    });
    res.json({ ok: true, order: result });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

app.use(express.static(root));

const port = Number(process.env.PORT || 5173);
app.listen(port, "0.0.0.0", () => {
  console.log(`SWAMI MASALE POS http://0.0.0.0:${port}`);
});
