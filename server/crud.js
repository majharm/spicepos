import "../js/units.js";
import { query, withTransaction } from "./db.js";
import { bid } from "./context.js";
import { recordCreditPurchase } from "./accounts.js";
import { postPurchaseJournal } from "./accounting.js";
import { audit } from "./audit.js";

const POSUnits = globalThis.POSUnits;

export function itemUnit(item) {
  if (item == null) return POSUnits.normalize("GM");
  if (typeof item === "string") return POSUnits.normalize(item);
  return POSUnits.normalize(item.base_unit || item.unit);
}

export function lineAmount(quantityGm, ratePerKg, unitOrItem) {
  const code = itemUnit(unitOrItem);
  const t = POSUnits.typeOf(code);
  const known = t.code === code;
  if (!known || t.family === "count") return (Number(quantityGm) || 0) * (Number(ratePerKg) || 0);
  return POSUnits.lineAmount(quantityGm, ratePerKg, code);
}

export function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export async function nextSeq(conn, name, start) {
  const [rows] = await conn.query(
    "SELECT next_value FROM number_sequences WHERE name = ? AND business_id = ? FOR UPDATE",
    [name, bid()],
  );
  const next = rows[0] ? Number(rows[0].next_value) : start;
  if (rows[0]) {
    await conn.query(
      "UPDATE number_sequences SET next_value = ? WHERE name = ? AND business_id = ?",
      [next + 1, name, bid()],
    );
  } else {
    await conn.query(
      "INSERT INTO number_sequences (name, next_value, business_id) VALUES (?,?,?)",
      [name, next + 1, bid()],
    );
  }
  return next;
}

export function registerCrud(app) {
  app.post("/api/customers", async (req, res) => {
    const { name, business_name, mobile, type, gstin, credit_limit } = req.body || {};
    if (!name || !mobile) {
      res.status(400).json({ error: "Name and mobile are required" });
      return;
    }
    const custType = type === "b2b" ? "b2b" : "b2c";
    try {
      const customer = await withTransaction(async (conn) => {
        const n = await nextSeq(conn, "customer", 4);
        const code = `CUS-${String(n).padStart(3, "0")}`;
        const id = crypto.randomUUID();
        await conn.query(
          `INSERT INTO customers (
             id, code, name, business_name, mobile, type, gstin, credit_limit, outstanding, business_id
           ) VALUES (?,?,?,?,?,?,?,?,0,?)`,
          [
            id,
            code,
            String(name).trim(),
            business_name || null,
            String(mobile).trim(),
            custType,
            gstin || null,
            Number(credit_limit) || 0,
            bid(),
          ],
        );
        const [rows] = await conn.query("SELECT * FROM customers WHERE id = ?", [id]);
        return rows[0];
      });
      res.json({ ok: true, customer });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/items", async (req, res) => {
    const b = req.body || {};
    if (!b.name) {
      res.status(400).json({ error: "Item name is required" });
      return;
    }
    try {
      const item = await withTransaction(async (conn) => {
        const n = await nextSeq(conn, "item", 7);
        const code = b.code || `SP-${String(n).padStart(3, "0")}`;
        const id = crypto.randomUUID();
        await conn.query(
          `INSERT INTO items (
             id, code, name, local_name, category, subcategory, base_unit,
             purchase_rate, retail_rate, b2b_rate, gst_rate, hsn, stock_gm,
             reorder_level_gm, status, business_id
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'active', ?)`,
          [
            id,
            code,
            String(b.name).trim(),
            b.local_name || null,
            b.category || "Whole Spices",
            b.subcategory || null,
            itemUnit(b.base_unit || b.unit || "GM"),
            Number(b.purchase_rate) || 0,
            Number(b.retail_rate) || 0,
            Number(b.b2b_rate) || 0,
            Number(b.gst_rate) || 5,
            String(b.hsn || b.local_name || "").trim() || null,
            Number(b.stock_gm) || 0,
            Number(b.reorder_level_gm) || 0,
            bid(),
          ],
        );
        const [rows] = await conn.query("SELECT * FROM items WHERE id = ?", [id]);
        return rows[0];
      });
      res.json({ ok: true, item });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.put("/api/items/:id", async (req, res) => {
    const b = req.body || {};
    try {
      await query(
        `UPDATE items SET
           name=?, local_name=?, category=?, subcategory=?, base_unit=?,
           purchase_rate=?, retail_rate=?, b2b_rate=?, gst_rate=?, hsn=?,
           stock_gm=?, reorder_level_gm=?, status=?
         WHERE id=? AND business_id=?`,
        [
          b.name,
          b.local_name || null,
          b.category || "Whole Spices",
          b.subcategory || null,
          itemUnit(b.base_unit || b.unit || "GM"),
          Number(b.purchase_rate) || 0,
          Number(b.retail_rate) || 0,
          Number(b.b2b_rate) || 0,
          Number(b.gst_rate) || 5,
          String(b.hsn || "").trim() || null,
          Number(b.stock_gm) || 0,
          Number(b.reorder_level_gm) || 0,
          b.status || "active",
          req.params.id,
          bid(),
        ],
      );
      const [item] = await query("SELECT * FROM items WHERE id = ?", [req.params.id]);
      res.json({ ok: true, item });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/packs", async (req, res) => {
    const { name, items } = req.body || {};
    if (!name || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "Pack name and at least one spice are required" });
      return;
    }
    try {
      const pack = await withTransaction(async (conn) => {
        const n = await nextSeq(conn, "pack", 6);
        const id = crypto.randomUUID();
        const total = items.reduce((s, i) => s + Number(i.quantity_gm || 0), 0);
        await conn.query(
          `INSERT INTO packs (id, code, name, total_quantity_gm, status, business_id)
           VALUES (?,?,?,?,'active',?)`,
          [id, `PK-${String(n).padStart(3, "0")}`, String(name).trim(), total, bid()],
        );
        let sort = 1;
        for (const row of items) {
          const [itemRows] = await conn.query(
            "SELECT * FROM items WHERE id = ? AND business_id = ?",
            [row.item_id, bid()],
          );
          const item = itemRows[0];
          if (!item) throw new Error("Unknown item in pack");
          await conn.query(
            `INSERT INTO pack_items (
               id, pack_id, item_id, quantity_gm, retail_rate, b2b_rate, sort_order, business_id
             ) VALUES (?,?,?,?,?,?,?,?)`,
            [
              crypto.randomUUID(),
              id,
              item.id,
              Number(row.quantity_gm),
              Number(item.retail_rate),
              Number(item.b2b_rate),
              sort++,
              bid(),
            ],
          );
        }
        const [rows] = await conn.query("SELECT * FROM packs WHERE id = ?", [id]);
        return rows[0];
      });
      res.json({ ok: true, pack });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/suppliers", async (req, res) => {
    const { name, contact_name, mobile, email, address, gstin } = req.body || {};
    if (!name) {
      res.status(400).json({ error: "Supplier name is required" });
      return;
    }
    try {
      const id = crypto.randomUUID();
      const code = `SUP-${Date.now().toString(36).toUpperCase()}`;
      await query(
        `INSERT INTO suppliers (
           id, code, name, contact_name, mobile, email, address, gstin, opening_balance, business_id
         ) VALUES (?,?,?,?,?,?,?,?,0,?)`,
        [
          id,
          code,
          String(name).trim(),
          String(contact_name || "").trim() || null,
          String(mobile || "").trim() || null,
          String(email || "").trim() || null,
          String(address || "").trim() || null,
          String(gstin || "").trim() || null,
          bid(),
        ],
      );
      const [supplier] = await query("SELECT * FROM suppliers WHERE id = ?", [id]);
      res.json({ ok: true, supplier });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/purchases", async (req, res) => {
    const { supplier_id, supplier_invoice_number, purchase_date, payment_method, lines, notes } =
      req.body || {};
    if (!supplier_id || !Array.isArray(lines) || lines.length === 0) {
      res.status(400).json({ error: "Supplier and purchase lines are required" });
      return;
    }
    try {
      const purchase = await withTransaction(async (conn) => {
        const [supRows] = await conn.query(
          "SELECT * FROM suppliers WHERE id = ? AND business_id = ?",
          [supplier_id, bid()],
        );
        const supplier = supRows[0];
        if (!supplier) throw new Error("Supplier not found");
        const built = [];
        for (const line of lines) {
          const [itemRows] = await conn.query(
            "SELECT * FROM items WHERE id = ? AND business_id = ?",
            [line.item_id, bid()],
          );
          const item = itemRows[0];
          if (!item) throw new Error("Unknown item");
          const qty = Number(line.quantity_gm);
          const rate = Number(line.rate_per_kg ?? item.purchase_rate);
          const amount = round2(lineAmount(qty, rate, item));
          const gstRate = Number(item.gst_rate) || 0;
          const gstAmount = round2((amount * gstRate) / 100);
          built.push({
            item,
            qty,
            rate,
            amount,
            gstRate,
            gstAmount,
            total: round2(amount + gstAmount),
          });
        }
        const subtotal = round2(built.reduce((s, l) => s + l.amount, 0));
        const gst = round2(built.reduce((s, l) => s + l.gstAmount, 0));
        const total = round2(subtotal + gst);
        const n = await nextSeq(conn, "purchase", 10002);
        const id = crypto.randomUUID();
        const purchaseNumber = `PO-${n}`;
        const method = String(payment_method || "cash").toLowerCase();
        const payStatus = method === "credit" ? "unpaid" : "paid";
        await conn.query(
          `INSERT INTO purchases (
             id, purchase_number, supplier_id, supplier_name, supplier_invoice_number,
             purchase_date, notes, subtotal, gst, total, payment_method, payment_status, business_id
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            purchaseNumber,
            supplier.id,
            supplier.name,
            supplier_invoice_number || null,
            purchase_date || new Date().toISOString().slice(0, 10),
            notes || null,
            subtotal,
            gst,
            total,
            method,
            payStatus,
            bid(),
          ],
        );
        for (const line of built) {
          await conn.query(
            `INSERT INTO purchase_lines (
               id, purchase_id, item_id, item_name, quantity_gm, rate_per_kg,
               gst_rate, amount, gst_amount, total_amount, business_id
             ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [
              crypto.randomUUID(),
              id,
              line.item.id,
              line.item.name,
              line.qty,
              line.rate,
              line.gstRate,
              line.amount,
              line.gstAmount,
              line.total,
              bid(),
            ],
          );
          await conn.query(
            "UPDATE items SET stock_gm = stock_gm + ? WHERE id = ? AND business_id = ?",
            [line.qty, line.item.id, bid()],
          );
        }
        const [rows] = await conn.query("SELECT * FROM purchases WHERE id = ?", [id]);
        const purchase = rows[0];
        await recordCreditPurchase(conn, {
          supplier,
          total,
          purchaseId: id,
          purchaseNumber,
          method,
        });
        await postPurchaseJournal(conn, purchase);
        return purchase;
      });
      res.json({ ok: true, purchase });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.put("/api/orders/:id", async (req, res) => {
    const { customerId, paymentMethod, status, packId, packCount, lines } = req.body || {};
    if (!Array.isArray(lines) || lines.length === 0) {
      res.status(400).json({ error: "Order must have lines" });
      return;
    }
    try {
      const order = await withTransaction(async (conn) => {
        const [existRows] = await conn.query(
          "SELECT * FROM sales_orders WHERE id = ? AND business_id = ?",
          [req.params.id, bid()],
        );
        const existing = existRows[0];
        if (!existing) throw new Error("Order not found");
        if (String(existing.status || "").toLowerCase() === "cancelled") {
          throw new Error("Cancelled orders cannot be edited. Change status first.");
        }
        const [oldLines] = await conn.query(
          "SELECT * FROM sales_order_lines WHERE order_id = ? AND cancelled = 0",
          [existing.id],
        );
        for (const line of oldLines) {
          await conn.query(
            "UPDATE items SET stock_gm = stock_gm + ? WHERE id = ? AND business_id = ?",
            [line.quantity_gm, line.item_id, bid()],
          );
        }
        await conn.query("DELETE FROM sales_order_lines WHERE order_id = ?", [existing.id]);

        const [custRows] = await conn.query(
          "SELECT * FROM customers WHERE id = ? AND business_id = ?",
          [customerId || existing.customer_id, bid()],
        );
        const customer = custRows[0];
        if (!customer) throw new Error("Customer not found");

        const built = [];
        for (const line of lines) {
          const [itemRows] = await conn.query(
            "SELECT * FROM items WHERE id = ? AND business_id = ?",
            [line.itemId, bid()],
          );
          const item = itemRows[0];
          if (!item) throw new Error("Unknown item");
          const qty = Number(line.quantity_gm);
          const rate =
            customer.type === "b2b" ? Number(item.b2b_rate) : Number(item.retail_rate);
          const amount = round2(lineAmount(qty, rate, item));
          built.push({ item, qty, rate, amount, gstRate: Number(item.gst_rate) || 0 });
        }
        const subtotal = round2(built.reduce((s, l) => s + l.amount, 0));
        const gst = round2(built.reduce((s, l) => s + (l.amount * l.gstRate) / 100, 0));
        const total = round2(subtotal + gst);
        const totalGm = built.reduce((s, l) => s + l.qty, 0);
        const method = String(paymentMethod || existing.payment_method).toLowerCase();
        const payStatus = method === "credit" ? "partial" : "paid";
        let packName = existing.pack_name;
        let usePackId = packId === undefined ? existing.pack_id : packId;
        if (packId) {
          const [packs] = await conn.query("SELECT * FROM packs WHERE id = ?", [packId]);
          packName = packs[0]?.name || packName;
        }
        if (packId === null) {
          usePackId = null;
          packName = null;
        }
        const newStatus = status || existing.status;
        await conn.query(
          `UPDATE sales_orders SET
             customer_id=?, customer_name=?, customer_type=?,
             pack_id=?, pack_name=?, pack_count=?, status=?,
             total_quantity_gm=?, subtotal=?, gst=?, total=?,
             payment_method=?, payment_status=?
           WHERE id=?`,
          [
            customer.id,
            customer.business_name || customer.name,
            customer.type,
            usePackId,
            packName,
            packCount ?? existing.pack_count,
            newStatus,
            totalGm,
            subtotal,
            gst,
            total,
            method,
            payStatus,
            existing.id,
          ],
        );
        if (newStatus !== "cancelled") {
          for (const line of built) {
            await conn.query(
              `INSERT INTO sales_order_lines (
                 id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
                 discount, amount, gst_rate, cancelled, business_id
               ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
              [
                crypto.randomUUID(),
                existing.id,
                line.item.id,
                line.item.name,
                line.qty,
                line.rate,
                0,
                line.amount,
                line.gstRate,
                0,
                bid(),
              ],
            );
            await conn.query(
              "UPDATE items SET stock_gm = stock_gm - ? WHERE id = ? AND business_id = ?",
              [line.qty, line.item.id, bid()],
            );
          }
        }
        const [orders] = await conn.query("SELECT * FROM sales_orders WHERE id = ?", [existing.id]);
        const [orderLines] = await conn.query(
          "SELECT * FROM sales_order_lines WHERE order_id = ?",
          [existing.id],
        );
        return { ...orders[0], lines: orderLines };
      });
      await audit("Sale Updated", {
        module: "sales",
        target_id: order.id,
        target_name: order.order_number,
        total: order.total,
        payment_method: order.payment_method,
        customer_name: order.customer_name,
      }, req);
      res.json({ ok: true, order });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  const orderStatuses = ["confirmed", "delivered", "cancelled"];
  const paymentStatuses = ["paid", "partial", "unpaid"];

  app.patch("/api/orders/:id", async (req, res) => {
    const { status, payment_status } = req.body || {};
    try {
      const order = await withTransaction(async (conn) => {
        const [existRows] = await conn.query(
          "SELECT * FROM sales_orders WHERE id = ? AND business_id = ?",
          [req.params.id, bid()],
        );
        const existing = existRows[0];
        if (!existing) throw new Error("Order not found");

        const oldStatus = String(existing.status || "confirmed").toLowerCase();
        const newStatus = status ? String(status).toLowerCase() : oldStatus;
        if (!orderStatuses.includes(newStatus)) throw new Error("Invalid order status");

        let payStatus = existing.payment_status || "paid";
        if (payment_status) {
          payStatus = String(payment_status).toLowerCase();
          if (!paymentStatuses.includes(payStatus)) throw new Error("Invalid payment status");
        }

        const [lines] = await conn.query(
          "SELECT * FROM sales_order_lines WHERE order_id = ? AND cancelled = 0",
          [existing.id],
        );

        if (newStatus === "cancelled" && oldStatus !== "cancelled") {
          for (const line of lines) {
            await conn.query(
              "UPDATE items SET stock_gm = stock_gm + ? WHERE id = ? AND business_id = ?",
              [line.quantity_gm, line.item_id, bid()],
            );
            await conn.query("UPDATE sales_order_lines SET cancelled = 1 WHERE id = ?", [line.id]);
          }
        } else if (oldStatus === "cancelled" && newStatus !== "cancelled") {
          const [allLines] = await conn.query(
            "SELECT * FROM sales_order_lines WHERE order_id = ?",
            [existing.id],
          );
          for (const line of allLines) {
            await conn.query(
              "UPDATE items SET stock_gm = stock_gm - ? WHERE id = ? AND business_id = ?",
              [line.quantity_gm, line.item_id, bid()],
            );
            await conn.query("UPDATE sales_order_lines SET cancelled = 0 WHERE id = ?", [line.id]);
          }
        }

        await conn.query(
          "UPDATE sales_orders SET status = ?, payment_status = ? WHERE id = ? AND business_id = ?",
          [newStatus, payStatus, existing.id, bid()],
        );

        const [orders] = await conn.query("SELECT * FROM sales_orders WHERE id = ?", [existing.id]);
        const [orderLines] = await conn.query(
          "SELECT * FROM sales_order_lines WHERE order_id = ?",
          [existing.id],
        );
        return { ...orders[0], lines: orderLines };
      });
      await audit("Sale Status Changed", {
        module: "sales",
        target_id: order.id,
        target_name: order.order_number,
        status: order.status,
        payment_status: order.payment_status,
      }, req);
      res.json({ ok: true, order });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });
}
