import { BUSINESS_ID, query, withTransaction } from "./db.js";
import {
  billTotals,
  isInterstate,
  mergeSaleLines,
  purchaseLineTotals,
  remainingReturnQty,
  round2,
  saleLineTotals,
} from "../js/pharmacy.js";
import { deductBatches, restoreBatchQty, syncItemStock, upsertBatch } from "./pharmacy-stock.js";

export function lineAmount(quantity, ratePerUnit) {
  return Number(quantity) * Number(ratePerUnit);
}

function qtyOf(line) {
  const q = Number(line.quantity ?? line.quantity_gm ?? line.qty);
  return Number.isFinite(q) ? q : 0;
}

function sellingRate(item, customer) {
  if (customer?.type === "b2b") return Number(item.b2b_rate || item.selling_price || item.retail_rate) || 0;
  return Number(item.selling_price || item.retail_rate) || 0;
}

export { round2 };

function creditDue(order) {
  if (!order || String(order.payment_method || "").toLowerCase() !== "credit") return 0;
  return round2(Math.max(0, Number(order.total) - Number(order.amount_paid || 0)));
}

async function adjustOutstanding(conn, customerId, delta) {
  const amount = round2(delta);
  if (!customerId || !amount) return;
  await conn.query(
    "UPDATE customers SET outstanding = GREATEST(0, outstanding + ?) WHERE id = ? AND business_id = ?",
    [amount, customerId, BUSINESS_ID],
  );
}

export async function buildPricedLines(conn, customer, lines, { companyGstin = "", interstate } = {}) {
  const useInter =
    interstate ?? isInterstate(companyGstin, customer?.gstin);
  const built = [];
  for (const line of mergeSaleLines(lines)) {
    const [items] = await conn.query("SELECT * FROM items WHERE id = ? AND business_id = ?", [
      line.itemId || line.item_id,
      BUSINESS_ID,
    ]);
    const item = items[0];
    if (!item) throw new Error("Unknown medicine");
    const qty = qtyOf(line);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error("Invalid quantity");
    const [sumRows] = await conn.query(
      `SELECT
         COUNT(*) AS n,
         COALESCE(SUM(CASE WHEN qty > 0 AND (expiry_date IS NULL OR expiry_date >= CURDATE()) THEN qty ELSE 0 END),0) AS live_qty
       FROM item_batches WHERE item_id = ? AND business_id = ?`,
      [item.id, BUSINESS_ID],
    );
    const hasBatches = Number(sumRows[0]?.n) > 0;
    const available = hasBatches ? Number(sumRows[0]?.live_qty) || 0 : Number(item.stock_gm || 0);
    if (qty > available) throw new Error(`${item.name} does not have enough stock`);
    const rate = Number(line.rate ?? line.rate_per_kg) || sellingRate(item, customer);
    const priced = saleLineTotals({
      qty,
      rate,
      mrp: Number(line.mrp ?? item.mrp) || rate,
      gstRate: Number(item.gst_rate) || 0,
      discount: Number(line.discount) || 0,
      interstate: useInter,
    });
    built.push({
      item,
      qty,
      rate: priced.rate,
      amount: priced.taxable,
      gstRate: Number(item.gst_rate) || 0,
      gstAmount: priced.gst,
      cgst: priced.cgst,
      sgst: priced.sgst,
      igst: priced.igst,
      mrp: priced.mrp,
      batchId: line.batchId || line.batch_id || null,
      packType: line.packType || line.pack_type || item.pack_unit || "Strip",
    });
  }
  return built;
}

export async function insertSalesOrder(
  conn,
  {
    customer,
    built,
    packId,
    packCount,
    paymentMethod,
    status = "confirmed",
    doctorName,
    prescriptionNo,
    discount = 0,
    amountPaid,
    companyGstin = "",
  },
) {
  const method = String(paymentMethod || "cash").toLowerCase();
  const interstate = isInterstate(companyGstin, customer?.gstin);
  const totals = billTotals({
    lines: built.map((l) => ({
      taxable: l.amount,
      cgst: l.cgst,
      sgst: l.sgst,
      igst: l.igst,
    })),
    billDiscount: discount,
    amountPaid: amountPaid == null ? 0 : amountPaid,
  });
  const paid =
    amountPaid == null
      ? method === "credit"
        ? 0
        : totals.grandTotal
      : Number(amountPaid) || 0;
  const withPay = billTotals({
    lines: built.map((l) => ({ taxable: l.amount, cgst: l.cgst, sgst: l.sgst, igst: l.igst })),
    billDiscount: discount,
    amountPaid: paid,
  });
  const totalGm = built.reduce((s, l) => s + l.qty, 0);
  const next = await nextSeq(conn, "order", 10036);
  const orderNumber = `SO-${next}`;
  const orderId = crypto.randomUUID();
  const payStatus = method === "credit" && withPay.due > 0 ? "partial" : "paid";
  let packName = null;
  if (packId) {
    const [packs] = await conn.query("SELECT * FROM packs WHERE id = ?", [packId]);
    packName = packs[0]?.name || null;
  }
  await conn.query(
    `INSERT INTO sales_orders (
       id, order_number, customer_id, customer_name, customer_type,
       pack_id, pack_name, pack_count, status, total_quantity_gm,
       subtotal, discount, gst, total, payment_method, payment_status, business_id,
       doctor_name, prescription_no, customer_mobile, customer_address,
       cgst, sgst, igst, round_off, amount_paid
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      orderId,
      orderNumber,
      customer.id,
      customer.business_name || customer.name,
      customer.type,
      packId || null,
      packName,
      packCount || null,
      status,
      totalGm,
      withPay.subtotal,
      withPay.discount,
      withPay.gst,
      withPay.grandTotal,
      method,
      payStatus,
      BUSINESS_ID,
      doctorName || null,
      prescriptionNo || null,
      customer.mobile || null,
      customer.address || null,
      withPay.cgst,
      withPay.sgst,
      withPay.igst,
      withPay.roundOff,
      withPay.amountPaid,
    ],
  );
  for (const line of built) {
    const taken = await deductBatches(conn, line.item.id, line.qty, line.batchId);
    for (const part of taken) {
      const share = line.qty ? part.take / line.qty : 1;
      await conn.query(
        `INSERT INTO sales_order_lines (
           id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
           discount, amount, gst_rate, cancelled, business_id,
           batch_id, batch_no, expiry_date, pack_type, mrp, cgst, sgst, igst, hsn
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          crypto.randomUUID(),
          orderId,
          line.item.id,
          line.item.name,
          part.take,
          line.rate,
          0,
          round2(line.amount * share),
          line.gstRate,
          0,
          BUSINESS_ID,
          part.id,
          part.batch_no,
          part.expiry_date,
          line.packType,
          part.mrp || line.mrp,
          round2(line.cgst * share),
          round2(line.sgst * share),
          round2(line.igst * share),
          line.item.hsn || null,
        ],
      );
    }
  }
  const [orders] = await conn.query("SELECT * FROM sales_orders WHERE id = ?", [orderId]);
  const [orderLines] = await conn.query("SELECT * FROM sales_order_lines WHERE order_id = ?", [orderId]);
  if (method === "credit" && withPay.due > 0) {
    await adjustOutstanding(conn, customer.id, withPay.due);
  }
  return { ...orders[0], lines: orderLines, interstate };
}

export async function nextSeq(conn, name, start) {
  const [rows] = await conn.query(
    "SELECT next_value FROM number_sequences WHERE name = ? AND business_id = ? FOR UPDATE",
    [name, BUSINESS_ID],
  );
  const next = rows[0] ? Number(rows[0].next_value) : start;
  if (rows[0]) {
    await conn.query(
      "UPDATE number_sequences SET next_value = ? WHERE name = ? AND business_id = ?",
      [next + 1, name, BUSINESS_ID],
    );
  } else {
    await conn.query(
      "INSERT INTO number_sequences (name, next_value, business_id) VALUES (?,?,?)",
      [name, next + 1, BUSINESS_ID],
    );
  }
  return next;
}

function itemPayload(b) {
  const generic = String(b.generic_name || b.local_name || "").trim() || null;
  const selling = Number(b.selling_price ?? b.retail_rate) || 0;
  return {
    name: String(b.name || "").trim(),
    local_name: generic,
    generic_name: generic,
    medicine_type: b.medicine_type || "Tablet",
    category: b.category || "Medical",
    subcategory: b.subcategory || b.medicine_type || null,
    manufacturer: b.manufacturer || b.company || null,
    base_unit: b.base_unit || b.pack_unit || "Strip",
    purchase_rate: Number(b.purchase_rate) || 0,
    retail_rate: selling,
    selling_price: selling,
    b2b_rate: Number(b.b2b_rate ?? selling) || 0,
    gst_rate: Number(b.gst_rate) || 0,
    hsn: b.hsn || b.hsn_code || null,
    stock_gm: Number(b.stock_gm ?? b.stock_qty) || 0,
    reorder_level_gm: Number(b.reorder_level_gm ?? b.reorder_level) || 0,
    pack_size: b.pack_size || null,
    pack_unit: b.pack_unit || b.unit || "Strip",
    units_per_pack: Number(b.units_per_pack) || 1,
    mrp: Number(b.mrp) || selling,
    barcode: b.barcode || null,
    default_expiry: b.default_expiry || b.expiry_date || null,
    status: b.status || "active",
  };
}

export function registerCrud(app) {
  app.post("/api/customers", async (req, res) => {
    const { name, business_name, mobile, type, gstin, credit_limit, address } = req.body || {};
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
             id, code, name, business_name, mobile, type, gstin, credit_limit, outstanding, business_id, address
           ) VALUES (?,?,?,?,?,?,?,?,0,?,?)`,
          [
            id,
            code,
            String(name).trim(),
            business_name || null,
            String(mobile).trim(),
            custType,
            gstin || null,
            Number(credit_limit) || 0,
            BUSINESS_ID,
            address || null,
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
    const p = itemPayload(b);
    if (!p.name) {
      res.status(400).json({ error: "Item name is required" });
      return;
    }
    try {
      const item = await withTransaction(async (conn) => {
        const n = await nextSeq(conn, "item", 7);
        const code = b.code || `MED-${String(n).padStart(3, "0")}`;
        const id = crypto.randomUUID();
        await conn.query(
          `INSERT INTO items (
             id, code, name, local_name, category, subcategory, base_unit,
             purchase_rate, retail_rate, b2b_rate, gst_rate, hsn, stock_gm,
             reorder_level_gm, status, business_id,
             generic_name, medicine_type, manufacturer, pack_size, pack_unit,
             units_per_pack, mrp, selling_price, barcode, default_expiry
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'active', ?,?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            code,
            p.name,
            p.local_name,
            p.category,
            p.subcategory,
            p.base_unit,
            p.purchase_rate,
            p.retail_rate,
            p.b2b_rate,
            p.gst_rate,
            p.hsn,
            p.stock_gm,
            p.reorder_level_gm,
            BUSINESS_ID,
            p.generic_name,
            p.medicine_type,
            p.manufacturer,
            p.pack_size,
            p.pack_unit,
            p.units_per_pack,
            p.mrp,
            p.selling_price,
            p.barcode,
            p.default_expiry,
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
    const p = itemPayload(req.body || {});
    try {
      await query(
        `UPDATE items SET
           name=?, local_name=?, category=?, subcategory=?, base_unit=?,
           purchase_rate=?, retail_rate=?, b2b_rate=?, gst_rate=?, hsn=?,
           reorder_level_gm=?, status=?,
           generic_name=?, medicine_type=?, manufacturer=?, pack_size=?, pack_unit=?,
           units_per_pack=?, mrp=?, selling_price=?, barcode=?, default_expiry=?
         WHERE id=? AND business_id=?`,
        [
          p.name,
          p.local_name,
          p.category,
          p.subcategory,
          p.base_unit,
          p.purchase_rate,
          p.retail_rate,
          p.b2b_rate,
          p.gst_rate,
          p.hsn,
          p.reorder_level_gm,
          p.status,
          p.generic_name,
          p.medicine_type,
          p.manufacturer,
          p.pack_size,
          p.pack_unit,
          p.units_per_pack,
          p.mrp,
          p.selling_price,
          p.barcode,
          p.default_expiry,
          req.params.id,
          BUSINESS_ID,
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
      res.status(400).json({ error: "Pack name and at least one medicine are required" });
      return;
    }
    try {
      const pack = await withTransaction(async (conn) => {
        const n = await nextSeq(conn, "pack", 6);
        const id = crypto.randomUUID();
        const total = items.reduce((s, i) => s + Number(i.quantity_gm || i.quantity || 0), 0);
        await conn.query(
          `INSERT INTO packs (id, code, name, total_quantity_gm, status, business_id)
           VALUES (?,?,?,?,'active',?)`,
          [id, `PK-${String(n).padStart(3, "0")}`, String(name).trim(), total, BUSINESS_ID],
        );
        let sort = 1;
        for (const row of items) {
          const [itemRows] = await conn.query("SELECT * FROM items WHERE id = ? AND business_id = ?", [
            row.item_id,
            BUSINESS_ID,
          ]);
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
              Number(row.quantity_gm || row.quantity),
              Number(item.retail_rate),
              Number(item.b2b_rate),
              sort++,
              BUSINESS_ID,
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
    const b = req.body || {};
    if (!b.name) {
      res.status(400).json({ error: "Supplier name is required" });
      return;
    }
    try {
      const id = crypto.randomUUID();
      const code = `SUP-${Date.now().toString(36).toUpperCase()}`;
      await query(
        `INSERT INTO suppliers (
           id, code, name, contact_name, mobile, email, address, gstin, opening_balance, business_id,
           firm_name, drug_licence_no, pan, fssai_licence_no, licence_expiry, state, state_code, city, pincode
         ) VALUES (?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          code,
          String(b.name).trim(),
          b.contact_name || b.name,
          b.mobile || null,
          b.email || null,
          b.address || null,
          b.gstin || null,
          BUSINESS_ID,
          b.firm_name || b.company_name || null,
          b.drug_licence_no || null,
          b.pan || b.pan_no || null,
          b.fssai_licence_no || null,
          b.licence_expiry || null,
          b.state || null,
          b.state_code || null,
          b.city || null,
          b.pincode || null,
        ],
      );
      const [supplier] = await query("SELECT * FROM suppliers WHERE id = ?", [id]);
      res.json({ ok: true, supplier });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/purchases", async (req, res) => {
    const b = req.body || {};
    const { supplier_id, supplier_invoice_number, purchase_date, payment_method, lines } = b;
    if (!supplier_id || !supplier_invoice_number || !Array.isArray(lines) || lines.length === 0) {
      res.status(400).json({ error: "Supplier, invoice number, and purchase lines are required" });
      return;
    }
    try {
      const purchase = await withTransaction(async (conn) => {
        const [supRows] = await conn.query("SELECT * FROM suppliers WHERE id = ? AND business_id = ?", [
          supplier_id,
          BUSINESS_ID,
        ]);
        const supplier = supRows[0];
        if (!supplier) throw new Error("Supplier not found");
        const [companyRows] = await conn.query(
          "SELECT gstin FROM company_settings WHERE business_id = ? LIMIT 1",
          [BUSINESS_ID],
        );
        const interstate = isInterstate(companyRows[0]?.gstin, supplier.gstin);
        const built = [];
        for (const line of lines) {
          const [itemRows] = await conn.query("SELECT * FROM items WHERE id = ? AND business_id = ?", [
            line.item_id,
            BUSINESS_ID,
          ]);
          const item = itemRows[0];
          if (!item) throw new Error("Unknown medicine");
          if (!line.batch_no) throw new Error(`Batch No. is required for ${item.name}`);
          if (!line.expiry_date) throw new Error(`Expiry Date is required for ${item.name}`);
          const calc = purchaseLineTotals({
            packQty: line.pack_qty ?? line.quantity_gm ?? line.quantity,
            unitsPerPack: line.units_per_pack ?? item.units_per_pack,
            totalQty: line.total_qty,
            freeQty: line.free_qty,
            purchaseRate: line.purchase_rate ?? line.rate_per_kg ?? item.purchase_rate,
            discount: line.discount,
            gstRate: line.gst_rate ?? item.gst_rate,
            interstate,
          });
          if (calc.stockQty <= 0) throw new Error(`Quantity required for ${item.name}`);
          built.push({
            item,
            calc,
            batch_no: String(line.batch_no).trim(),
            expiry_date: line.expiry_date,
            pack_type: line.pack_type || item.pack_unit || "Strip",
            mrp: Number(line.mrp ?? item.mrp) || 0,
            generic_name: line.generic_name || item.generic_name || item.local_name,
            manufacturer: line.manufacturer || item.manufacturer,
            hsn: line.hsn || item.hsn,
          });
        }
        const subtotal = round2(built.reduce((s, l) => s + l.calc.taxable, 0));
        const gst = round2(built.reduce((s, l) => s + l.calc.gst, 0));
        const cgst = round2(built.reduce((s, l) => s + l.calc.cgst, 0));
        const sgst = round2(built.reduce((s, l) => s + l.calc.sgst, 0));
        const igst = round2(built.reduce((s, l) => s + l.calc.igst, 0));
        const discount = round2(built.reduce((s, l) => s + l.calc.discount, 0));
        const total = round2(built.reduce((s, l) => s + l.calc.total, 0));
        const n = await nextSeq(conn, "purchase", 10002);
        const id = crypto.randomUUID();
        const purchaseNumber = `PO-${n}`;
        const method = payment_method || "cash";
        await conn.query(
          `INSERT INTO purchases (
             id, purchase_number, supplier_id, supplier_name, supplier_invoice_number,
             purchase_date, notes, subtotal, gst, total, payment_method, payment_status, business_id,
             due_date, purchase_order_no, eway_bill_no, cgst, sgst, igst, discount
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?)`,
          [
            id,
            purchaseNumber,
            supplier.id,
            supplier.name,
            supplier_invoice_number,
            purchase_date || new Date().toISOString().slice(0, 10),
            b.notes || null,
            subtotal,
            gst,
            total,
            method,
            method === "credit" ? "partial" : "paid",
            BUSINESS_ID,
            b.due_date || null,
            b.purchase_order_no || null,
            b.eway_bill_no || null,
            cgst,
            sgst,
            igst,
            discount,
          ],
        );
        for (const line of built) {
          await conn.query(
            `INSERT INTO purchase_lines (
               id, purchase_id, item_id, item_name, quantity_gm, rate_per_kg,
               gst_rate, amount, gst_amount, total_amount, business_id,
               generic_name, manufacturer, hsn, batch_no, expiry_date, pack_type,
               pack_qty, units_per_pack, total_qty, free_qty, mrp, discount, cgst, sgst, igst
             ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              crypto.randomUUID(),
              id,
              line.item.id,
              line.item.name,
              line.calc.stockQty,
              line.calc.purchaseRate,
              line.calc.gstRate,
              line.calc.taxable,
              line.calc.gst,
              line.calc.total,
              BUSINESS_ID,
              line.generic_name,
              line.manufacturer,
              line.hsn,
              line.batch_no,
              line.expiry_date,
              line.pack_type,
              line.calc.packQty,
              line.calc.unitsPerPack,
              line.calc.totalQty,
              line.calc.freeQty,
              line.mrp,
              line.calc.discount,
              line.calc.cgst,
              line.calc.sgst,
              line.calc.igst,
            ],
          );
          await upsertBatch(conn, {
            itemId: line.item.id,
            batchNo: line.batch_no,
            expiryDate: line.expiry_date,
            qty: line.calc.stockQty,
            mrp: line.mrp,
            purchaseRate: line.calc.purchaseRate,
            purchaseId: id,
          });
          await conn.query(
            "UPDATE items SET purchase_rate = ?, mrp = COALESCE(NULLIF(?,0), mrp) WHERE id = ? AND business_id = ?",
            [line.calc.purchaseRate, line.mrp, line.item.id, BUSINESS_ID],
          );
          await syncItemStock(conn, line.item.id);
        }
        const [rows] = await conn.query("SELECT * FROM purchases WHERE id = ?", [id]);
        return rows[0];
      });
      res.json({ ok: true, purchase });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.put("/api/orders/:id", async (req, res) => {
    const { customerId, paymentMethod, status, packId, packCount, lines, doctorName, prescriptionNo, discount, amountPaid } =
      req.body || {};
    if (!Array.isArray(lines) || lines.length === 0) {
      res.status(400).json({ error: "Order must have lines" });
      return;
    }
    try {
      const order = await withTransaction(async (conn) => {
        const [existRows] = await conn.query(
          "SELECT * FROM sales_orders WHERE id = ? AND business_id = ?",
          [req.params.id, BUSINESS_ID],
        );
        const existing = existRows[0];
        if (!existing) throw new Error("Order not found");
        const oldDue = creditDue(existing);
        const [oldLines] = await conn.query(
          "SELECT * FROM sales_order_lines WHERE order_id = ? AND cancelled = 0",
          [existing.id],
        );
        for (const line of oldLines) {
          await restoreBatchQty(conn, {
            batchId: line.batch_id,
            itemId: line.item_id,
            qty: line.quantity_gm,
            batchNo: line.batch_no,
            expiryDate: line.expiry_date,
            mrp: line.mrp,
          });
        }
        await conn.query("DELETE FROM sales_order_lines WHERE order_id = ?", [existing.id]);

        const [custRows] = await conn.query("SELECT * FROM customers WHERE id = ? AND business_id = ?", [
          customerId || existing.customer_id,
          BUSINESS_ID,
        ]);
        const customer = custRows[0];
        if (!customer) throw new Error("Customer not found");
        const [companyRows] = await conn.query(
          "SELECT gstin FROM company_settings WHERE business_id = ? LIMIT 1",
          [BUSINESS_ID],
        );
        const built = await buildPricedLines(conn, customer, lines, { companyGstin: companyRows[0]?.gstin });
        const method = String(paymentMethod || existing.payment_method).toLowerCase();
        const totals = billTotals({
          lines: built.map((l) => ({ taxable: l.amount, cgst: l.cgst, sgst: l.sgst, igst: l.igst })),
          billDiscount: discount ?? existing.discount,
          amountPaid: amountPaid == null ? (method === "credit" ? 0 : 0) : amountPaid,
        });
        const paid = amountPaid == null ? (method === "credit" ? 0 : totals.grandTotal) : Number(amountPaid) || 0;
        const withPay = billTotals({
          lines: built.map((l) => ({ taxable: l.amount, cgst: l.cgst, sgst: l.sgst, igst: l.igst })),
          billDiscount: discount ?? existing.discount,
          amountPaid: paid,
        });
        const totalGm = built.reduce((s, l) => s + l.qty, 0);
        const payStatus = method === "credit" && withPay.due > 0 ? "partial" : "paid";
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
             total_quantity_gm=?, subtotal=?, discount=?, gst=?, total=?,
             payment_method=?, payment_status=?,
             doctor_name=?, prescription_no=?, customer_mobile=?, customer_address=?,
             cgst=?, sgst=?, igst=?, round_off=?, amount_paid=?
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
            withPay.subtotal,
            withPay.discount,
            withPay.gst,
            withPay.grandTotal,
            method,
            payStatus,
            doctorName ?? existing.doctor_name,
            prescriptionNo ?? existing.prescription_no,
            customer.mobile,
            customer.address,
            withPay.cgst,
            withPay.sgst,
            withPay.igst,
            withPay.roundOff,
            withPay.amountPaid,
            existing.id,
          ],
        );
        if (newStatus !== "cancelled") {
          for (const line of built) {
            const taken = await deductBatches(conn, line.item.id, line.qty, line.batchId);
            for (const part of taken) {
              const share = line.qty ? part.take / line.qty : 1;
              await conn.query(
                `INSERT INTO sales_order_lines (
                   id, order_id, item_id, item_name, quantity_gm, rate_per_kg,
                   discount, amount, gst_rate, cancelled, business_id,
                   batch_id, batch_no, expiry_date, pack_type, mrp, cgst, sgst, igst, hsn
                 ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [
                  crypto.randomUUID(),
                  existing.id,
                  line.item.id,
                  line.item.name,
                  part.take,
                  line.rate,
                  0,
                  round2(line.amount * share),
                  line.gstRate,
                  0,
                  BUSINESS_ID,
                  part.id,
                  part.batch_no,
                  part.expiry_date,
                  line.packType,
                  part.mrp || line.mrp,
                  round2(line.cgst * share),
                  round2(line.sgst * share),
                  round2(line.igst * share),
                  line.item.hsn || null,
                ],
              );
            }
          }
        }
        const [orders] = await conn.query("SELECT * FROM sales_orders WHERE id = ?", [existing.id]);
        const [orderLines] = await conn.query("SELECT * FROM sales_order_lines WHERE order_id = ?", [existing.id]);
        await adjustOutstanding(conn, existing.customer_id, -oldDue);
        const newDue = newStatus === "cancelled" ? 0 : creditDue({ ...orders[0], payment_method: method });
        await adjustOutstanding(conn, customer.id, newDue);
        return { ...orders[0], lines: orderLines };
      });
      res.json({ ok: true, order });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/returns", async (req, res) => {
    const { order_id, reason, lines } = req.body || {};
    if (!order_id || !Array.isArray(lines) || !lines.length) {
      res.status(400).json({ error: "Bill and return lines are required" });
      return;
    }
    try {
      const result = await withTransaction(async (conn) => {
        const [orders] = await conn.query("SELECT * FROM sales_orders WHERE id = ? AND business_id = ?", [
          order_id,
          BUSINESS_ID,
        ]);
        const order = orders[0];
        if (!order) throw new Error("Bill not found");
        const [orderLines] = await conn.query(
          "SELECT * FROM sales_order_lines WHERE order_id = ? AND cancelled = 0",
          [order.id],
        );
        const built = [];
        for (const row of lines) {
          const source = orderLines.find((l) => l.id === row.line_id) || orderLines.find((l) => l.item_id === row.item_id);
          if (!source) throw new Error("Return line is not on this bill");
          const qty = Number(row.quantity ?? row.quantity_gm);
          if (!Number.isFinite(qty) || qty <= 0) throw new Error("Return quantity must be positive");
          const [prev] = await conn.query(
            "SELECT COALESCE(SUM(quantity),0) AS qty FROM sales_return_lines WHERE order_line_id = ?",
            [source.id],
          );
          const remaining = remainingReturnQty(source.quantity_gm, prev[0]?.qty);
          if (qty > remaining) throw new Error(`Cannot return more than billed for ${source.item_name}`);
          const share = Number(source.quantity_gm) ? qty / Number(source.quantity_gm) : 1;
          built.push({
            source,
            qty,
            amount: round2(Number(source.amount) * share),
            gst: round2((Number(source.amount) * Number(source.gst_rate) * share) / 100),
          });
        }
        const subtotal = round2(built.reduce((s, l) => s + l.amount, 0));
        const gst = round2(built.reduce((s, l) => s + l.gst, 0));
        const total = round2(subtotal + gst);
        const n = await nextSeq(conn, "sale_return", 1);
        const id = crypto.randomUUID();
        const returnNumber = `SR-${String(n).padStart(4, "0")}`;
        await conn.query(
          `INSERT INTO sales_returns (
             id, return_number, order_id, order_number, customer_name, reason,
             subtotal, gst, total, business_id
           ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            returnNumber,
            order.id,
            order.order_number,
            order.customer_name,
            reason || null,
            subtotal,
            gst,
            total,
            BUSINESS_ID,
          ],
        );
        for (const line of built) {
          await conn.query(
            `INSERT INTO sales_return_lines (
               id, return_id, order_line_id, item_id, item_name, batch_id, batch_no,
               quantity, amount, gst_amount, business_id
             ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [
              crypto.randomUUID(),
              id,
              line.source.id,
              line.source.item_id,
              line.source.item_name,
              line.source.batch_id,
              line.source.batch_no,
              line.qty,
              line.amount,
              line.gst,
              BUSINESS_ID,
            ],
          );
          await restoreBatchQty(conn, {
            batchId: line.source.batch_id,
            itemId: line.source.item_id,
            qty: line.qty,
            batchNo: line.source.batch_no,
            expiryDate: line.source.expiry_date,
            mrp: line.source.mrp,
          });
        }
        const [rows] = await conn.query("SELECT * FROM sales_returns WHERE id = ?", [id]);
        const [rLines] = await conn.query("SELECT * FROM sales_return_lines WHERE return_id = ?", [id]);
        if (creditDue(order) > 0) await adjustOutstanding(conn, order.customer_id, -total);
        return { ...rows[0], lines: rLines };
      });
      res.json({ ok: true, return: result });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });
}
