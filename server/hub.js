import { query } from "./db.js";
import { bid } from "./context.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(v) {
  return Math.round(num(v) * 100) / 100;
}

async function one(sql, params) {
  try {
    const [row] = await query(sql, params);
    return row || {};
  } catch {
    return {};
  }
}

async function many(sql, params) {
  try {
    return await query(sql, params);
  } catch {
    return [];
  }
}

export async function buildHubDashboard() {
  const businessId = bid();
  const receipts = await one(
    `SELECT COALESCE(SUM(amount),0) AS total FROM account_ledger
     WHERE business_id = ? AND LOWER(entry_type) = 'receipt' AND DATE(COALESCE(payment_date, created_at)) = CURDATE()`,
    [businessId],
  );
  const payments = await one(
    `SELECT COALESCE(SUM(amount),0) AS total FROM account_ledger
     WHERE business_id = ? AND LOWER(entry_type) = 'payment' AND DATE(COALESCE(payment_date, created_at)) = CURDATE()`,
    [businessId],
  );
  const payable = await one(
    `SELECT COALESCE(SUM(payable_balance),0) AS total FROM suppliers WHERE business_id = ?`,
    [businessId],
  );
  const expenses = await one(
    `SELECT COALESCE(SUM(amount + gst),0) AS total FROM expenses
     WHERE business_id = ? AND expense_date = CURDATE()`,
    [businessId],
  );
  const monthExp = await one(
    `SELECT COALESCE(SUM(amount + gst),0) AS total FROM expenses
     WHERE business_id = ? AND expense_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
    [businessId],
  );
  const cashIn = await one(
    `SELECT COALESCE(SUM(amount),0) AS total FROM account_ledger
     WHERE business_id = ? AND LOWER(entry_type) = 'receipt'
       AND LOWER(COALESCE(payment_method,'')) IN ('cash')`,
    [businessId],
  );
  const cashOut = await one(
    `SELECT COALESCE(SUM(amount),0) AS total FROM account_ledger
     WHERE business_id = ? AND LOWER(entry_type) = 'payment'
       AND LOWER(COALESCE(payment_method,'')) IN ('cash')`,
    [businessId],
  );
  const cashExp = await one(
    `SELECT COALESCE(SUM(amount + gst),0) AS total FROM expenses
     WHERE business_id = ? AND LOWER(COALESCE(payment_method,'')) = 'cash'`,
    [businessId],
  );
  const bankIn = await one(
    `SELECT COALESCE(SUM(amount),0) AS total FROM account_ledger
     WHERE business_id = ? AND LOWER(entry_type) = 'receipt'
       AND LOWER(COALESCE(payment_method,'')) IN ('upi','card','bank-transfer','neft','rtgs','imps','cheque','wallet')`,
    [businessId],
  );
  const bankOut = await one(
    `SELECT COALESCE(SUM(amount),0) AS total FROM account_ledger
     WHERE business_id = ? AND LOWER(entry_type) = 'payment'
       AND LOWER(COALESCE(payment_method,'')) IN ('upi','card','bank-transfer','neft','rtgs','imps','cheque','wallet')`,
    [businessId],
  );
  const low = await one(
    `SELECT COUNT(*) AS n FROM items
     WHERE business_id = ? AND stock_gm <= reorder_level_gm`,
    [businessId],
  );
  const outCust = await one(
    `SELECT COUNT(*) AS n FROM customers WHERE business_id = ? AND outstanding > 0.009`,
    [businessId],
  );
  const outSup = await one(
    `SELECT COUNT(*) AS n FROM suppliers WHERE business_id = ? AND payable_balance > 0.009`,
    [businessId],
  );
  const profit = await one(
    `SELECT COALESCE(SUM(l.amount - (l.quantity_gm * COALESCE(i.purchase_rate,0) /
            CASE WHEN LOWER(COALESCE(u.family,'')) = 'count'
              OR UPPER(REPLACE(COALESCE(i.base_unit, i.unit, 'GM'), ' ', '')) IN ('PCS','PC','QTY','NOS','NO','COUNT','UNIT','UNITS')
              THEN 1 ELSE 1000 END)),0) AS gross
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id
     LEFT JOIN items i ON i.id = l.item_id
     LEFT JOIN inventory_units u ON u.business_id = o.business_id AND u.code = COALESCE(i.base_unit, i.unit)
     WHERE o.business_id = ? AND DATE(o.created_at) = CURDATE() AND COALESCE(l.cancelled,0) = 0
       AND LOWER(COALESCE(o.status,'')) <> 'cancelled'`,
    [businessId],
  );
  const salesGraph = await many(
    `SELECT DATE(created_at) AS day, COALESCE(SUM(total),0) AS sales, COUNT(*) AS bills
     FROM sales_orders WHERE business_id = ? AND DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
       AND LOWER(COALESCE(status,'')) <> 'cancelled'
     GROUP BY DATE(created_at) ORDER BY day`,
    [businessId],
  );
  const payGraph = await many(
    `SELECT DATE(COALESCE(payment_date, created_at)) AS day, COALESCE(SUM(amount),0) AS collected
     FROM account_ledger
     WHERE business_id = ? AND LOWER(entry_type) = 'receipt'
       AND DATE(COALESCE(payment_date, created_at)) >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
     GROUP BY DATE(COALESCE(payment_date, created_at)) ORDER BY day`,
    [businessId],
  );
  const topItems = await many(
    `SELECT l.item_name AS name, SUM(l.quantity_gm) AS qty, SUM(l.amount) AS amount
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id
     WHERE o.business_id = ? AND DATE(o.created_at) = CURDATE() AND COALESCE(l.cancelled,0) = 0
     GROUP BY l.item_name ORDER BY amount DESC LIMIT 8`,
    [businessId],
  );
  const recent = await many(
    `SELECT order_number, customer_name, total, payment_method, payment_status, status, created_at
     FROM sales_orders WHERE business_id = ? ORDER BY created_at DESC LIMIT 10`,
    [businessId],
  );
  const yesterday = await one(
    `SELECT COALESCE(SUM(total),0) AS takings FROM sales_orders
     WHERE business_id = ? AND DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
       AND LOWER(COALESCE(status,'')) <> 'cancelled'`,
    [businessId],
  );
  const monthSales = await one(
    `SELECT COALESCE(SUM(total),0) AS takings FROM sales_orders
     WHERE business_id = ? AND DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
       AND LOWER(COALESCE(status,'')) <> 'cancelled'`,
    [businessId],
  );
  const prevMonthSales = await one(
    `SELECT COALESCE(SUM(total),0) AS takings FROM sales_orders
     WHERE business_id = ? AND DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m')
       AND LOWER(COALESCE(status,'')) <> 'cancelled'`,
    [businessId],
  );
  const monthPurchase = await one(
    `SELECT COALESCE(SUM(total),0) AS total FROM purchases
     WHERE business_id = ? AND DATE_FORMAT(purchase_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')`,
    [businessId],
  );
  const todayCash = await one(
    `SELECT COALESCE(SUM(total),0) AS takings FROM sales_orders
     WHERE business_id = ? AND DATE(created_at) = CURDATE()
       AND LOWER(COALESCE(status,'')) <> 'cancelled' AND LOWER(COALESCE(payment_method,'')) = 'cash'`,
    [businessId],
  );
  const monthCash = await one(
    `SELECT COALESCE(SUM(total),0) AS takings FROM sales_orders
     WHERE business_id = ? AND DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
       AND LOWER(COALESCE(status,'')) <> 'cancelled' AND LOWER(COALESCE(payment_method,'')) = 'cash'`,
    [businessId],
  );
  const payModes = await many(
    `SELECT LOWER(COALESCE(NULLIF(payment_method,''),'other')) AS method, COALESCE(SUM(total),0) AS amount
     FROM sales_orders WHERE business_id = ? AND DATE(created_at) = CURDATE()
       AND LOWER(COALESCE(status,'')) <> 'cancelled'
     GROUP BY LOWER(COALESCE(NULLIF(payment_method,''),'other')) ORDER BY amount DESC`,
    [businessId],
  );
  const categories = await many(
    `SELECT COALESCE(NULLIF(i.category,''),'Other') AS name, SUM(l.amount) AS amount
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id
     LEFT JOIN items i ON i.id = l.item_id
     WHERE o.business_id = ? AND DATE(o.created_at) = CURDATE() AND COALESCE(l.cancelled,0) = 0
       AND LOWER(COALESCE(o.status,'')) <> 'cancelled'
     GROUP BY COALESCE(NULLIF(i.category,''),'Other') ORDER BY amount DESC LIMIT 8`,
    [businessId],
  );
  const monthGraph = await many(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COALESCE(SUM(total),0) AS sales
     FROM sales_orders WHERE business_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)
       AND LOWER(COALESCE(status,'')) <> 'cancelled'
     GROUP BY DATE_FORMAT(created_at, '%Y-%m') ORDER BY month`,
    [businessId],
  );
  const gross = round2(profit.gross);
  const net = round2(gross - num(monthExp.total));
  return {
    todayReceipts: round2(receipts.total),
    todayPayments: round2(payments.total),
    payable: round2(payable.total),
    expenses: round2(expenses.total),
    monthExpenses: round2(monthExp.total),
    cashBalance: round2(num(cashIn.total) - num(cashOut.total) - num(cashExp.total)),
    bankBalance: round2(num(bankIn.total) - num(bankOut.total)),
    grossProfit: gross,
    netProfit: net,
    lowStock: num(low.n),
    outstandingCustomers: num(outCust.n),
    outstandingSuppliers: num(outSup.n),
    salesGraph,
    payGraph,
    topItems,
    recent,
    yesterdaySales: round2(yesterday.takings),
    monthSales: round2(monthSales.takings),
    prevMonthSales: round2(prevMonthSales.takings),
    monthPurchase: round2(monthPurchase.total),
    todayCash: round2(todayCash.takings),
    monthCash: round2(monthCash.takings),
    payModes,
    categories,
    monthGraph,
  };
}

export function registerHub(app) {
  /* dashboard extras are merged in tenant.js */
}
