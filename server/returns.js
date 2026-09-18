import crypto from "node:crypto";
import "../js/discount.js";
import "../js/footwear.js";
import { query, withTransaction } from "./db.js";
import { bid, branchId, authUser } from "./context.js";
import { requireStaff, requirePerm } from "./auth.js";
import { saleStockQty, writeMovement, restorePieceBarcode } from "./advanced.js";

const POSDiscount = globalThis.POSDiscount;
const POSFootwear = globalThis.POSFootwear;

function round2(n) {
  return POSDiscount?.round2 ? POSDiscount.round2(n) : Math.round(Number(n) * 100) / 100;
}

function shopKindOf(biz) {
  if (POSFootwear?.isPharmacyShop?.(biz)) return "pharmacy";
  if (POSFootwear?.isApparelShop?.(biz)) return "apparel";
  return POSFootwear?.shopKind?.(biz) || "general";
}

async function loadBusiness(businessId) {
  const rows = await query("SELECT category, business_type FROM businesses WHERE id=? LIMIT 1", [businessId]);
  return rows[0] || {};
}

async function nextReturnNo(conn, businessId) {
  const [rows] = await conn.query(
    "SELECT next_value FROM number_sequences WHERE name='sale_return' AND business_id=? FOR UPDATE",
    [businessId],
  );
  const next = rows[0] ? Number(rows[0].next_value) : 10001;
  if (rows[0]) {
    await conn.query(
      "UPDATE number_sequences SET next_value=? WHERE name='sale_return' AND business_id=?",
      [next + 1, businessId],
    );
  } else {
    await conn.query(
      "INSERT INTO number_sequences (name, next_value, business_id) VALUES ('sale_return', ?, ?)",
      [next + 1, businessId],
    );
  }
  return `SR-${next}`;
}

function lineRefund(line, returnQty) {
  const sold = Number(line.quantity_gm) || 0;
  if (sold <= 0 || returnQty <= 0) return 0;
  const gstRate = Number(line.gst_rate) || 0;
  const taxable = Number(line.amount) || 0;
  const total = taxable * (1 + gstRate / 100);
  return round2((returnQty / sold) * total);
}

async function returnedQtyMap(orderId) {
  const rows = await query(
    `SELECT rl.order_line_id, SUM(rl.quantity_gm) AS returned_qty
     FROM sales_return_lines rl
     JOIN sales_returns r ON r.id = rl.return_id
     WHERE r.order_id=? AND r.status <> 'cancelled'
     GROUP BY rl.order_line_id`,
    [orderId],
  );
  const map = new Map();
  for (const row of rows) map.set(row.order_line_id, Number(row.returned_qty) || 0);
  return map;
}

function decorateInvoice(order, lines, itemsById, returned) {
  return {
    ...order,
    lines: (lines || []).map((line) => {
      const item = itemsById.get(line.item_id) || {};
      const sold = Number(line.quantity_gm) || 0;
      const already = Number(returned.get(line.id) || 0);
      return {
        ...line,
        item_code: item.code || line.item_code || "",
        size: item.size || "",
        color: item.color || "",
        sku: item.code || item.barcode || "",
        sold_qty: sold,
        returned_qty: already,
        returnable_qty: Math.max(0, sold - already),
        unit_refund: lineRefund(line, Math.min(1, sold) || 1),
      };
    }),
  };
}

async function loadInvoice(businessId, q) {
  const needle = String(q || "").trim();
  if (!needle) throw Object.assign(new Error("Enter an invoice or order number"), { status: 400 });
  const like = `%${needle}%`;
  const orders = await query(
    `SELECT o.*, COALESCE(NULLIF(TRIM(o.customer_name),''), NULLIF(TRIM(c.business_name),''), NULLIF(TRIM(c.name),''), 'Walk-in') AS customer_name,
            COALESCE(NULLIF(TRIM(o.customer_mobile),''), c.mobile) AS customer_mobile,
            COALESCE(NULLIF(TRIM(o.customer_address),''), c.address) AS customer_address
     FROM sales_orders o
     LEFT JOIN customers c ON c.id=o.customer_id AND c.business_id=o.business_id
     WHERE o.business_id=? AND o.held=0
       AND (o.order_number LIKE ? OR o.customer_name LIKE ? OR c.name LIKE ? OR c.mobile LIKE ? OR o.customer_mobile LIKE ?)
     ORDER BY o.created_at DESC
     LIMIT 20`,
    [businessId, like, like, like, like, like],
  );
  if (!orders.length) {
    const err = new Error("No invoice matches that search");
    err.status = 404;
    throw err;
  }
  const ids = orders.map((o) => o.id);
  const lines = await query(
    `SELECT * FROM sales_order_lines WHERE order_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at`,
    ids,
  );
  const itemIds = [...new Set(lines.map((l) => l.item_id).filter(Boolean))];
  const items = itemIds.length
    ? await query(
        `SELECT id, name, code, barcode, size, color, unit, base_unit, gst_rate FROM items WHERE id IN (${itemIds.map(() => "?").join(",")})`,
        itemIds,
      )
    : [];
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const out = [];
  for (const order of orders) {
    const returned = await returnedQtyMap(order.id);
    out.push(decorateInvoice(order, lines.filter((l) => l.order_id === order.id), itemsById, returned));
  }
  return out;
}

async function applyReturnStock(conn, ctx) {
  const qty = saleStockQty(ctx.item, ctx.qty);
  if (qty <= 0) return;
  const disposition = ctx.disposition;
  if (disposition === "sellable") {
    await conn.query("UPDATE items SET stock_gm = stock_gm + ? WHERE id=? AND business_id=?", [qty, ctx.item.id, ctx.businessId]);
    if (ctx.batchId) {
      await conn.query(
        "UPDATE stock_batches SET remaining_gm = remaining_gm + ? WHERE id=? AND business_id=?",
        [qty, ctx.batchId, ctx.businessId],
      );
    }
    if (ctx.barcode) await restorePieceBarcode(conn, ctx.businessId, ctx.barcode);
  } else {
    if (ctx.batchId) {
      await conn.query(
        "UPDATE stock_batches SET quarantine_gm = COALESCE(quarantine_gm,0) + ? WHERE id=? AND business_id=?",
        [qty, ctx.batchId, ctx.businessId],
      );
    } else {
      const id = crypto.randomUUID();
      await conn.query(
        `INSERT INTO stock_batches (
           id, business_id, branch_id, item_id, batch_no, qty_gm, remaining_gm, quarantine_gm, expiry_date
         ) VALUES (?,?,?,?,?,?,0,?,?)`,
        [id, ctx.businessId, ctx.branchId || null, ctx.item.id, ctx.batchNo || "RETURN", qty, qty, ctx.expiry || null],
      );
    }
  }
  await writeMovement(conn, {
    businessId: ctx.businessId,
    branchId: ctx.branchId,
    userId: ctx.userId,
    itemId: ctx.item.id,
    kind: "sale_return",
    qty,
    note: ctx.returnNumber,
    barcode: ctx.barcode,
    batchId: ctx.batchId,
    reason: disposition,
    refType: "sale_return",
    refId: ctx.returnId,
  });
}

function send(res, fn) {
  Promise.resolve()
    .then(fn)
    .then((data) => res.json(data))
    .catch((err) => res.status(err.status || 400).json({ error: String(err.message || err) }));
}

export function registerReturns(app) {
  app.get("/api/returns/invoice", requireStaff, requirePerm("orders"), (req, res) =>
    send(res, async () => {
      const rows = await loadInvoice(bid(), req.query.q || req.query.order || req.query.invoice);
      return { ok: true, orders: rows };
    }),
  );

  app.get("/api/returns", requireStaff, requirePerm("orders"), (req, res) =>
    send(res, async () => {
      const rows = await query(
        `SELECT r.*, COALESCE(s.name, s.username, '') AS staff_name
         FROM sales_returns r
         LEFT JOIN staff_users s ON s.id = r.created_by
         WHERE r.business_id=?
         ORDER BY r.created_at DESC
         LIMIT 80`,
        [bid()],
      );
      const ids = rows.map((r) => r.id);
      const lines = ids.length
        ? await query(
            `SELECT * FROM sales_return_lines WHERE return_id IN (${ids.map(() => "?").join(",")}) ORDER BY item_name`,
            ids,
          )
        : [];
      return rows.map((r) => ({ ...r, lines: lines.filter((l) => l.return_id === r.id) }));
    }),
  );

  app.post("/api/returns", requireStaff, requirePerm("orders"), (req, res) =>
    send(res, async () => {
      const body = req.body || {};
      const orderId = String(body.orderId || body.order_id || "");
      const wanted = Array.isArray(body.lines) ? body.lines : [];
      if (!orderId || !wanted.length) throw Object.assign(new Error("Choose an invoice and return quantity"), { status: 400 });
      const businessId = bid();
      const biz = await loadBusiness(businessId);
      const kind = shopKindOf(biz);
      const result = await withTransaction(async (conn) => {
        const [orders] = await conn.query(
          "SELECT * FROM sales_orders WHERE id=? AND business_id=? LIMIT 1",
          [orderId, businessId],
        );
        const order = orders[0];
        if (!order) throw Object.assign(new Error("Invoice not found"), { status: 404 });
        if (String(order.status || "").toLowerCase() === "cancelled") {
          throw Object.assign(new Error("Voided invoices cannot be returned"), { status: 400 });
        }
        const [orderLines] = await conn.query("SELECT * FROM sales_order_lines WHERE order_id=? AND business_id=?", [orderId, businessId]);
        const byId = new Map(orderLines.map((l) => [l.id, l]));
        const [prior] = await conn.query(
          `SELECT rl.order_line_id, SUM(rl.quantity_gm) AS returned_qty
           FROM sales_return_lines rl JOIN sales_returns r ON r.id=rl.return_id
           WHERE r.order_id=? AND r.status<>'cancelled' GROUP BY rl.order_line_id`,
          [orderId],
        );
        const already = new Map((prior || []).map((r) => [r.order_line_id, Number(r.returned_qty) || 0]));
        const built = [];
        for (const row of wanted) {
          const line = byId.get(String(row.orderLineId || row.order_line_id || row.id || ""));
          if (!line || Number(line.cancelled) === 1) continue;
          const qty = Math.abs(Number(row.qty ?? row.quantity_gm) || 0);
          if (qty <= 0) continue;
          const left = Math.max(0, Number(line.quantity_gm) - (already.get(line.id) || 0));
          if (qty - left > 0.0005) throw Object.assign(new Error(`Return qty exceeds sold qty for ${line.item_name}`), { status: 400 });
          const [items] = await conn.query("SELECT * FROM items WHERE id=? AND business_id=? LIMIT 1", [line.item_id, businessId]);
          const item = items[0] || { id: line.item_id, name: line.item_name };
          const condition = String(row.condition || row.condition_label || "").toLowerCase();
          let disposition = String(row.disposition || row.stock_disposition || "").toLowerCase();
          const canRelease = ["business_admin", "branch_manager", "manager", "stock_manager"].includes(String(authUser()?.role || ""));
          if (kind === "pharmacy") {
            disposition = body.sellableStock && canRelease ? "sellable" : "quarantine";
          } else if (kind === "apparel") {
            disposition = condition === "damaged" || condition === "used" ? "quarantine" : "sellable";
          } else if (!disposition) {
            disposition = "sellable";
          }
          built.push({
            line,
            item,
            qty,
            amount: lineRefund(line, qty),
            condition: condition || null,
            disposition,
          });
        }
        if (!built.length) throw Object.assign(new Error("Enter a return quantity on at least one item"), { status: 400 });
        const refund = round2(built.reduce((s, r) => s + r.amount, 0));
        const remainingAfter = orderLines
          .filter((l) => Number(l.cancelled) !== 1)
          .every((l) => {
            const take = built.find((b) => b.line.id === l.id)?.qty || 0;
            return Number(l.quantity_gm) - (already.get(l.id) || 0) - take <= 0.0005;
          });
        const returnType = remainingAfter ? "full" : "partial";
        const returnId = crypto.randomUUID();
        const returnNumber = await nextReturnNo(conn, businessId);
        const staffId = authUser()?.id || null;
        const [custRows] = await conn.query("SELECT * FROM customers WHERE id=? LIMIT 1", [order.customer_id]);
        const cust = custRows[0] || {};
        await conn.query(
          `INSERT INTO sales_returns (
             id, business_id, branch_id, return_number, order_id, order_number, customer_id, customer_name, customer_mobile,
             shop_kind, return_type, reason, notes, refund_amount, refund_mode, status, created_by
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            returnId, businessId, branchId() || null, returnNumber, order.id, order.order_number,
            order.customer_id, order.customer_name || cust.business_name || cust.name || "Walk-in",
            order.customer_mobile || cust.mobile || "",
            kind, returnType, String(body.reason || "other").slice(0, 64),
            String(body.notes || "").slice(0, 255) || null,
            refund, String(body.refundMode || body.refund_mode || "cash").slice(0, 32),
            "completed", staffId,
          ],
        );
        for (const row of built) {
          const lineId = crypto.randomUUID();
          await conn.query(
            `INSERT INTO sales_return_lines (
               id, return_id, business_id, order_line_id, item_id, item_name, item_code, size, color,
               quantity_gm, sold_qty_gm, rate_per_kg, amount, gst_rate, batch_id, batch_no, expiry_date,
               barcode, condition_label, stock_disposition
             ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              lineId, returnId, businessId, row.line.id, row.item.id, row.line.item_name, row.item.code || "",
              row.item.size || "", row.item.color || "", row.qty, row.line.quantity_gm, row.line.rate_per_kg,
              row.amount, row.line.gst_rate, row.line.batch_id || null, row.line.batch_no || null,
              row.line.expiry_date || null, row.line.barcode || "", row.condition, row.disposition,
            ],
          );
          await applyReturnStock(conn, {
            businessId,
            branchId: branchId(),
            userId: staffId,
            item: row.item,
            qty: row.qty,
            batchId: row.line.batch_id,
            batchNo: row.line.batch_no,
            expiry: row.line.expiry_date,
            barcode: row.line.barcode,
            disposition: row.disposition,
            returnId,
            returnNumber,
          });
        }
        const [saved] = await conn.query("SELECT * FROM sales_returns WHERE id=?", [returnId]);
        const [savedLines] = await conn.query("SELECT * FROM sales_return_lines WHERE return_id=?", [returnId]);
        return { ok: true, return: { ...saved[0], lines: savedLines } };
      });
      return result;
    }),
  );
}
