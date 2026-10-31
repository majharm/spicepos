/** Pure rules for ATAV POS scheduled reports. No database and no WhatsApp calls. */

export const AUTOMATION_JOBS = [
  { key: "low_stock", name: "Low Stock Alert", schedule: "Every 30 minutes", kind: "interval", minutes: 30 },
  { key: "overdue", name: "Overdue Reminder", schedule: "11:00", kind: "daily", time: "11:00" },
  { key: "daily_sales", name: "Daily Sales", schedule: "21:00", kind: "daily", time: "21:00" },
  { key: "collections", name: "Payment Summary", schedule: "21:15", kind: "daily", time: "21:15" },
  { key: "eod", name: "Day-End Report", schedule: "Business closing time", kind: "closing", time: "21:00" },
];

export const OVERDUE_STAGES = ["before", "on", "d3", "d7", "d15", "d30"];

const MONEY = new Set(["cash", "upi", "card", "bank-transfer", "neft", "rtgs", "imps", "cheque", "wallet", "other"]);

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function inr(n) {
  const neg = Number(n) < 0;
  const [intRaw, dec] = Math.abs(round2(n)).toFixed(2).split(".");
  let int = intRaw;
  if (int.length > 3) {
    const last3 = int.slice(-3);
    int = `${int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`;
  }
  return `${neg ? "-" : ""}${int}.${dec}`;
}

export function normalizeMobile(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : "";
}

export function moneyMode(raw) {
  let m = String(raw || "").toLowerCase().trim().replace(/[\s_]+/g, "-");
  if (m === "bank" || m === "banktransfer" || m === "net-banking" || m === "netbanking") m = "bank-transfer";
  if (m === "check") m = "cheque";
  if (m === "credit-card" || m === "debit-card") m = "card";
  return MONEY.has(m) ? m : "";
}

export function payBucket(raw) {
  const method = String(raw || "").toLowerCase().trim();
  if (method === "credit") return "credit";
  const m = moneyMode(method);
  if (m === "cash") return "cash";
  if (m === "upi") return "upi";
  if (m === "card") return "card";
  if (m === "cheque") return "cheque";
  if (m === "wallet") return "wallet";
  if (m === "bank-transfer" || m === "neft" || m === "rtgs" || m === "imps") return "bank";
  if (m) return "other";
  return "";
}

export function emptyBuckets() {
  return { cash: 0, upi: 0, card: 0, bank: 0, cheque: 0, wallet: 0, other: 0, credit: 0, refunds: 0, failed: 0 };
}

function addBucket(buckets, key, amount) {
  if (!key || key === "credit" || buckets[key] == null) return;
  buckets[key] = round2(buckets[key] + amount);
}

export function istParts(date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function zoneParts(date, timeZone) {
  const zone = timeZone || "Asia/Kolkata";
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
    return {
      ymd: `${parts.year}-${parts.month}-${parts.day}`,
      minutes: Number(parts.hour) * 60 + Number(parts.minute),
      timeZone: zone,
    };
  } catch {
    return { ...istParts(date), timeZone: "Asia/Kolkata" };
  }
}

export function parseHm(value) {
  const m = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function shopClockReached(now, timeZone, hm) {
  const target = parseHm(hm);
  if (target == null) return false;
  const clock = zoneParts(now, timeZone);
  return clock.minutes >= target;
}

export function lowStockDue(lastRunAt, now, minutes = 30) {
  if (!lastRunAt) return true;
  const last = new Date(lastRunAt).getTime();
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= minutes * 60 * 1000;
}

export function lowStockSignature(items) {
  return (items || [])
    .map((item) => `${item.id}:${round2(item.stock)}`)
    .sort()
    .join("|");
}

export function shouldSendLowStock({ items, previousSignature, lastSentAt, now, reminderHours = 24 }) {
  const signature = lowStockSignature(items);
  if (!signature) return { send: false, signature, reason: "none" };
  if (signature !== String(previousSignature || "")) return { send: true, signature, reason: "changed" };
  const last = lastSentAt ? new Date(lastSentAt).getTime() : 0;
  const wait = Math.max(1, Number(reminderHours) || 24) * 3600 * 1000;
  if (!last || now.getTime() - last >= wait) return { send: true, signature, reason: "interval" };
  return { send: false, signature, reason: "unchanged" };
}

export function dayDiff(todayYmd, dueYmd) {
  const a = String(todayYmd || "").slice(0, 10);
  const b = String(dueYmd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
}

export function overdueStage(dueYmd, todayYmd, enabled = OVERDUE_STAGES) {
  const days = dayDiff(todayYmd, dueYmd);
  if (days == null) return "";
  const map = { [-1]: "before", 0: "on", 3: "d3", 7: "d7", 15: "d15", 30: "d30" };
  const stage = map[days] || "";
  if (!stage) return "";
  const allow = Array.isArray(enabled) && enabled.length ? enabled : OVERDUE_STAGES;
  return allow.includes(stage) ? stage : "";
}

export function idempotencyKey(job, businessId, scope, channel) {
  return `${job}|${businessId}|${scope}|${channel}`.slice(0, 180);
}

export function nextRetryAt(attempts, nowMs) {
  const n = Math.max(1, Number(attempts) || 1);
  if (n >= 4) return null;
  const minutes = 2 ** n;
  return new Date(nowMs + minutes * 60 * 1000).toISOString();
}

function voided(order) {
  const status = String(order?.status || "").toLowerCase();
  return status === "cancelled" || status === "void";
}

export function salesSummary(orders, extras = {}) {
  const rows = (orders || []).filter((order) => !voided(order));
  const cancelled = (orders || []).filter(voided).length;
  const buckets = emptyBuckets();
  let gross = 0;
  let discount = 0;
  let net = 0;
  let items = Number(extras.itemsSold) || 0;
  for (const order of rows) {
    const total = Number(order.total) || 0;
    const disc = Number(order.discount) || 0;
    gross = round2(gross + total + disc);
    discount = round2(discount + disc);
    net = round2(net + total);
    const bucket = payBucket(order.payment_method);
    if (bucket && buckets[bucket] != null) buckets[bucket] = round2(buckets[bucket] + total);
    else buckets.other = round2(buckets.other + total);
  }
  const returns = round2(Number(extras.returns) || 0);
  return {
    bills: rows.length,
    cancelled,
    orders: rows.length,
    items,
    gross,
    discount,
    returns,
    net: round2(net - returns),
    cash: buckets.cash,
    upi: buckets.upi,
    card: buckets.card,
    credit: buckets.credit,
    other: round2(buckets.bank + buckets.cheque + buckets.wallet + buckets.other),
  };
}

export function collectionSummary({ receipts = [], orders = [], refunds = [] } = {}) {
  const buckets = emptyBuckets();
  const covered = new Set();
  for (const row of receipts) {
    const type = String(row.entry_type || "").toLowerCase();
    const party = String(row.party_type || "customer").toLowerCase();
    if (type !== "receipt" || party !== "customer") continue;
    const amount = Number(row.amount) || 0;
    if (amount <= 0) continue;
    addBucket(buckets, payBucket(row.payment_method), amount);
    if (row.reference_id) covered.add(String(row.reference_id));
    if (row.order_id) covered.add(String(row.order_id));
  }
  for (const order of orders) {
    if (voided(order)) continue;
    const id = String(order.id || "");
    if (id && covered.has(id)) continue;
    if (order.customer_id) continue;
    const parts = Array.isArray(order.payments) ? order.payments : [];
    if (parts.length) {
      for (const part of parts) {
        if (String(part.entry_type || "").toLowerCase() === "sale_credit") continue;
        addBucket(buckets, payBucket(part.method || part.payment_method), Number(part.amount) || 0);
      }
      continue;
    }
    const status = String(order.payment_status || "").toLowerCase();
    const bucket = payBucket(order.payment_method);
    if (!bucket || bucket === "credit") continue;
    const paid = Number(order.amount_paid) > 0.004 ? Number(order.amount_paid) : status === "paid" ? Number(order.total) || 0 : 0;
    if (paid <= 0.004) continue;
    addBucket(buckets, bucket, paid);
  }
  for (const row of refunds) {
    const amount = Number(row.refund_amount ?? row.amount ?? row.total) || 0;
    if (amount <= 0) continue;
    buckets.refunds = round2(buckets.refunds + amount);
    const bucket = payBucket(row.refund_mode || row.payment_method);
    if (bucket && bucket !== "credit" && buckets[bucket] != null) buckets[bucket] = round2(buckets[bucket] - amount);
  }
  const collected = round2(["cash", "upi", "card", "bank", "cheque", "wallet", "other"].reduce((sum, key) => sum + buckets[key], 0));
  return { ...buckets, collected, pending: 0, supplierDue: 0 };
}

export function withPending(summary, pending, supplierDue) {
  return { ...summary, pending: round2(pending), supplierDue: round2(supplierDue) };
}

export function deliverMobile({ mobile, optOut, testMode, testNumber, consent }) {
  if (optOut) return { skip: true, reason: "opt-out" };
  if (consent === 0 || consent === false) return { skip: true, reason: "no-consent" };
  if (testMode) {
    const test = normalizeMobile(testNumber);
    if (!test) return { skip: true, reason: "test-number-missing" };
    return { mobile: test, test: true };
  }
  const owner = normalizeMobile(mobile);
  if (!owner) return { skip: true, reason: "invalid-mobile" };
  return { mobile: owner, test: false };
}

function line(label, value) {
  return `${label}: ₹${inr(value)}`;
}

export function lowStockMessage({ owner, items, outOfStock }) {
  const list = (items || []).slice(0, 20).map((item) => {
    const unit = item.unit ? ` ${item.unit}` : "";
    return `Product: ${item.name}\nAvailable Stock: ${item.stock}${unit}\nMinimum Stock: ${item.minimum}${unit}`;
  });
  const more = (items || []).length > 20 ? `\n+${items.length - 20} more` : "";
  return [
    "LOW STOCK ALERT – ATAV POS",
    "",
    `Hello ${owner || "there"},`,
    "",
    "The following products have low stock:",
    "",
    list.join("\n\n") + more,
    "",
    outOfStock ? `Out of stock: ${outOfStock}` : "",
    "Please arrange replenishment.",
    "",
    "Team ATAV POS",
  ].filter((row) => row !== "").join("\n");
}

export function salesMessage(shop, day, sales, collected) {
  return [
    "DAILY SALES REPORT",
    "",
    `Business: ${shop}`,
    `Date: ${day}`,
    "",
    line("Total Sales", sales.gross),
    `Total Invoices: ${sales.bills}`,
    `Total Orders: ${sales.orders}`,
    `Total Items Sold: ${sales.items}`,
    "",
    "Sales by tender (credit is not money received):",
    line("Cash", sales.cash),
    line("UPI", sales.upi),
    line("Card", sales.card),
    line("Credit", sales.credit),
    line("Other", sales.other),
    "",
    line("Collected", collected),
    line("Returns", sales.returns),
    line("Discount", sales.discount),
    line("Net Sales", sales.net),
    "",
    "Thank you for using ATAV POS.",
  ].join("\n");
}

export function collectionMessage(shop, day, col) {
  return [
    "PAYMENT COLLECTION SUMMARY",
    "",
    `Business: ${shop}`,
    `Date: ${day}`,
    "",
    line("Total collection", col.collected),
    line("Cash", col.cash),
    line("UPI", col.upi),
    line("Card", col.card),
    line("Bank Transfer", col.bank),
    line("Cheque", col.cheque),
    line("Wallet", col.wallet),
    line("Other", col.other),
    "",
    line("Refunds", col.refunds),
    line("Customer outstanding", col.pending),
    line("Supplier outstanding", col.supplierDue),
    `Failed transactions: ${col.failed || 0}`,
    "",
    "Credit sales and unpaid invoices are not included as collected money.",
    "",
    "Team ATAV POS",
  ].join("\n");
}

export function overdueMessage(row) {
  return [
    "PAYMENT REMINDER",
    "",
    `Dear ${row.customerName},`,
    "",
    `This is a friendly reminder from ${row.businessName}.`,
    "",
    `Your invoice ${row.invoiceNumber} has an outstanding balance.`,
    "",
    line("Invoice Amount", row.total),
    line("Paid Amount", row.paid),
    line("Pending Amount", row.pending),
    `Due Date: ${row.dueDate}`,
    row.daysOverdue > 0 ? `Days overdue: ${row.daysOverdue}` : "",
    "",
    "Kindly clear the outstanding amount.",
    "",
    "Thank you.",
  ].filter((line) => line !== "").join("\n");
}

export function eodMessage(shop, day, report) {
  const lines = [
    "DAY-END REPORT",
    "",
    `Business: ${shop}`,
    `Date: ${day}`,
    "",
    "SALES",
    line("Total Gross Sales", report.sales.gross),
    line("Net Sales", report.sales.net),
    `Total Bills: ${report.sales.bills}`,
    `Cancelled Bills: ${report.sales.cancelled}`,
    line("Sales Returns", report.sales.returns),
    line("Discounts", report.sales.discount),
    "",
    "PAYMENT COLLECTION",
    line("Opening Cash", report.openingCash),
    line("Cash collected", report.collections.cash),
    line("UPI Collections", report.collections.upi),
    line("Card Collections", report.collections.card),
    line("Credit Sales", report.sales.credit),
    line("Other Collections", round2(report.collections.bank + report.collections.cheque + report.collections.wallet + report.collections.other)),
    line("Cash Expenses", report.cashExpenses),
    line("Cash Refunds", report.cashRefunds),
    line("Expected Closing Cash", report.expectedCash),
    "",
    "INVENTORY",
    `Total Products Sold: ${report.productsSold}`,
    `Low Stock Items: ${report.lowStock}`,
    `Out-of-Stock Items: ${report.outOfStock}`,
    `Stock Adjustments: ${report.adjustments}`,
    "",
    "CUSTOMERS",
    `New Customers: ${report.newCustomers}`,
    line("Credit Sales", report.sales.credit),
    line("Outstanding Amount", report.outstanding),
    line("Payments Received", report.collections.collected),
    "",
    "EXPENSES",
    line("Total Expenses", report.expenses),
    line("Cash Expenses", report.cashExpenses),
    line("Other Expenses", report.otherExpenses),
    "",
    "SUMMARY",
    line("Total Revenue", report.sales.net),
    line("Total Collections", report.collections.collected),
    line("Total Outstanding", report.outstanding),
    line("Total Expenses", report.expenses),
  ];
  if (report.profitSupported) lines.push(line("Net Profit", report.profit));
  else lines.push("Net Profit: not calculated (item cost is missing)");
  if (!report.openingKnown) lines.push("Opening cash is 0 because this shop has no recorded cash drawer.");
  lines.push("", "Team ATAV POS");
  return lines.join("\n");
}

export function expectedCash({ opening = 0, cashCollected = 0, cashExpenses = 0, cashRefunds = 0 }) {
  return round2(Number(opening) + Number(cashCollected) - Number(cashExpenses) - Number(cashRefunds));
}
