import crypto from "node:crypto";
import { query, withTransaction } from "./db.js";
import { bid, branchId, authUser } from "./context.js";
import { nextSeq, round2 } from "./crud.js";
import { requirePerm } from "./auth.js";
import { audit } from "./audit.js";

async function insertLedger(conn, row) {
  const id = crypto.randomUUID();
  await conn.query(
    `INSERT INTO account_ledger (
       id, business_id, entry_no, entry_type, party_type, party_id, party_name,
       amount, payment_method, reference_type, reference_id, notes, created_by
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      bid(),
      row.entry_no,
      row.entry_type,
      row.party_type,
      row.party_id,
      row.party_name || null,
      row.amount,
      row.payment_method || null,
      row.reference_type || null,
      row.reference_id || null,
      row.notes || null,
      authUser()?.id || null,
    ],
  );
  return id;
}

export async function recordCreditSale(conn, { customer, total, orderId, orderNumber, method }) {
  if (method !== "credit") return;
  const amt = round2(total);
  const current = round2(Number(customer.outstanding || 0));
  const next = round2(current + amt);
  const limit = Number(customer.credit_limit || 0);
  if (limit > 0 && next > limit) {
    throw new Error(`Credit limit exceeded (limit ₹${limit.toFixed(2)}, outstanding would be ₹${next.toFixed(2)})`);
  }
  await conn.query("UPDATE customers SET outstanding = ? WHERE id = ? AND business_id = ?", [
    next,
    customer.id,
    bid(),
  ]);
  const n = await nextSeq(conn, "account", 1001);
  await insertLedger(conn, {
    entry_no: `JV-${n}`,
    entry_type: "sale_credit",
    party_type: "customer",
    party_id: customer.id,
    party_name: customer.business_name || customer.name,
    amount: amt,
    payment_method: "credit",
    reference_type: "sales_order",
    reference_id: orderId,
    notes: orderNumber,
  });
}

export async function recordCreditPurchase(conn, { supplier, total, purchaseId, purchaseNumber, method }) {
  if (method !== "credit") return;
  const amt = round2(total);
  await conn.query(
    "UPDATE suppliers SET payable_balance = COALESCE(payable_balance, 0) + ? WHERE id = ? AND business_id = ?",
    [amt, supplier.id, bid()],
  );
  const n = await nextSeq(conn, "account", 1001);
  await insertLedger(conn, {
    entry_no: `JV-${n}`,
    entry_type: "purchase_credit",
    party_type: "supplier",
    party_id: supplier.id,
    party_name: supplier.name,
    amount: amt,
    payment_method: "credit",
    reference_type: "purchase",
    reference_id: purchaseId,
    notes: purchaseNumber,
  });
}

export function registerAccounts(app) {
  app.get("/api/accounts/summary", requirePerm("accounts"), async (_req, res) => {
    try {
      const businessId = bid();
      const [[recv], [pay], [custs], [sups]] = await Promise.all([
        query(
          "SELECT COALESCE(SUM(outstanding),0) AS total FROM customers WHERE business_id = ?",
          [businessId],
        ),
        query(
          "SELECT COALESCE(SUM(payable_balance),0) AS total FROM suppliers WHERE business_id = ?",
          [businessId],
        ),
        query(
          "SELECT COUNT(*) AS n FROM customers WHERE business_id = ? AND outstanding > 0",
          [businessId],
        ),
        query(
          "SELECT COUNT(*) AS n FROM suppliers WHERE business_id = ? AND COALESCE(payable_balance,0) > 0",
          [businessId],
        ),
      ]);
      res.json({
        receivables: recv?.total || 0,
        payables: pay?.total || 0,
        customersDue: custs?.n || 0,
        suppliersDue: sups?.n || 0,
      });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.get("/api/accounts/receivables", requirePerm("accounts"), async (_req, res) => {
    try {
      const rows = await query(
        `SELECT id, code, name, business_name, mobile, type, credit_limit, outstanding
         FROM customers WHERE business_id = ? AND outstanding > 0
         ORDER BY outstanding DESC, name`,
        [bid()],
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.get("/api/accounts/payables", requirePerm("accounts"), async (_req, res) => {
    try {
      const rows = await query(
        `SELECT id, code, name, contact_name, mobile, gstin, COALESCE(payable_balance,0) AS payable_balance
         FROM suppliers WHERE business_id = ? AND COALESCE(payable_balance,0) > 0
         ORDER BY payable_balance DESC, name`,
        [bid()],
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.get("/api/accounts/ledger", requirePerm("accounts"), async (req, res) => {
    try {
      const from = req.query.from || new Date().toISOString().slice(0, 10);
      const to = req.query.to || from;
      const rows = await query(
        `SELECT * FROM account_ledger
         WHERE business_id = ? AND DATE(created_at) BETWEEN ? AND ?
         ORDER BY created_at DESC, entry_no DESC
         LIMIT 500`,
        [bid(), from, to],
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/accounts/receipts", requirePerm("accounts"), async (req, res) => {
    const { customer_id, amount, payment_method, notes, order_id } = req.body || {};
    const amt = round2(amount);
    if (!customer_id || amt <= 0) {
      res.status(400).json({ error: "Customer and amount are required" });
      return;
    }
    const method = String(payment_method || "cash").toLowerCase();
    if (!["cash", "upi", "card", "bank"].includes(method)) {
      res.status(400).json({ error: "Invalid payment method" });
      return;
    }
    try {
      const result = await withTransaction(async (conn) => {
        const [rows] = await conn.query(
          "SELECT * FROM customers WHERE id = ? AND business_id = ? FOR UPDATE",
          [customer_id, bid()],
        );
        const customer = rows[0];
        if (!customer) throw new Error("Customer not found");
        const outstanding = round2(Number(customer.outstanding || 0));
        if (outstanding <= 0) throw new Error("No outstanding balance for this customer");
        if (amt > outstanding) throw new Error(`Amount exceeds outstanding (₹${outstanding.toFixed(2)})`);
        const next = round2(outstanding - amt);
        await conn.query("UPDATE customers SET outstanding = ? WHERE id = ? AND business_id = ?", [
          next,
          customer.id,
          bid(),
        ]);
        const n = await nextSeq(conn, "receipt", 1001);
        const entryNo = `RCP-${n}`;
        const ledgerId = await insertLedger(conn, {
          entry_no: entryNo,
          entry_type: "receipt",
          party_type: "customer",
          party_id: customer.id,
          party_name: customer.business_name || customer.name,
          amount: amt,
          payment_method: method,
          reference_type: order_id ? "sales_order" : "manual",
          reference_id: order_id || null,
          notes: notes || null,
        });
        return { entryNo, ledgerId, customer: { ...customer, outstanding: next }, amount: amt };
      });
      await audit("Customer Receipt", {
        module: "accounts",
        target_id: result.ledgerId,
        target_name: result.entryNo,
        total: result.amount,
        customer_name: result.customer.business_name || result.customer.name,
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  app.post("/api/accounts/payments", requirePerm("accounts"), async (req, res) => {
    const { supplier_id, amount, payment_method, notes, purchase_id } = req.body || {};
    const amt = round2(amount);
    if (!supplier_id || amt <= 0) {
      res.status(400).json({ error: "Supplier and amount are required" });
      return;
    }
    const method = String(payment_method || "cash").toLowerCase();
    if (!["cash", "upi", "card", "bank"].includes(method)) {
      res.status(400).json({ error: "Invalid payment method" });
      return;
    }
    try {
      const result = await withTransaction(async (conn) => {
        const [rows] = await conn.query(
          "SELECT * FROM suppliers WHERE id = ? AND business_id = ? FOR UPDATE",
          [supplier_id, bid()],
        );
        const supplier = rows[0];
        if (!supplier) throw new Error("Supplier not found");
        const payable = round2(Number(supplier.payable_balance || 0));
        if (payable <= 0) throw new Error("No payable balance for this supplier");
        if (amt > payable) throw new Error(`Amount exceeds payable (₹${payable.toFixed(2)})`);
        const next = round2(payable - amt);
        await conn.query(
          "UPDATE suppliers SET payable_balance = ? WHERE id = ? AND business_id = ?",
          [next, supplier.id, bid()],
        );
        const n = await nextSeq(conn, "payment", 1001);
        const entryNo = `PAY-${n}`;
        const ledgerId = await insertLedger(conn, {
          entry_no: entryNo,
          entry_type: "payment",
          party_type: "supplier",
          party_id: supplier.id,
          party_name: supplier.name,
          amount: amt,
          payment_method: method,
          reference_type: purchase_id ? "purchase" : "manual",
          reference_id: purchase_id || null,
          notes: notes || null,
        });
        return { entryNo, ledgerId, supplier: { ...supplier, payable_balance: next }, amount: amt };
      });
      await audit("Supplier Payment", {
        module: "accounts",
        target_id: result.ledgerId,
        target_name: result.entryNo,
        total: result.amount,
        supplier_name: result.supplier.name,
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });
}
