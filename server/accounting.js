import crypto from "node:crypto";
import { query } from "./db.js";
import { bid, authUser } from "./context.js";
import { nextSeq, round2 } from "./crud.js";

export const DEFAULT_COA = [
  { code: "1001", name: "Cash in hand", account_group: "asset" },
  { code: "1002", name: "Bank account", account_group: "asset" },
  { code: "1003", name: "UPI clearing", account_group: "asset" },
  { code: "1101", name: "Sundry debtors", account_group: "asset" },
  { code: "1201", name: "Stock in trade", account_group: "asset" },
  { code: "2301", name: "GST input CGST", account_group: "asset" },
  { code: "2302", name: "GST input SGST", account_group: "asset" },
  { code: "2101", name: "Sundry creditors", account_group: "liability" },
  { code: "2201", name: "GST output CGST", account_group: "liability" },
  { code: "2202", name: "GST output SGST", account_group: "liability" },
  { code: "3101", name: "Capital account", account_group: "equity" },
  { code: "4101", name: "Sales", account_group: "income" },
  { code: "5101", name: "Purchase of goods", account_group: "expense" },
];

const CASH_CODES = new Set(["1001", "1002", "1003"]);

function isoDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function assetCodeForMethod(method) {
  const m = String(method || "cash").toLowerCase();
  if (m === "credit") return "1101";
  if (m === "upi") return "1003";
  if (m === "card" || m === "bank") return "1002";
  return "1001";
}

export async function ensureCoa(conn, businessId = bid()) {
  const [rows] = await conn.query(
    "SELECT id FROM chart_of_accounts WHERE business_id = ? LIMIT 1",
    [businessId],
  );
  if (rows.length) return;
  for (const row of DEFAULT_COA) {
    await conn.query(
      `INSERT INTO chart_of_accounts (id, business_id, code, name, account_group, is_system, active)
       VALUES (?,?,?,?,?,1,1)`,
      [crypto.randomUUID(), businessId, row.code, row.name, row.account_group],
    );
  }
}

async function accountMap(conn, businessId = bid()) {
  await ensureCoa(conn, businessId);
  const [rows] = await conn.query(
    "SELECT id, code, name, account_group FROM chart_of_accounts WHERE business_id = ? AND active = 1",
    [businessId],
  );
  return new Map(rows.map((r) => [r.code, r]));
}

async function journalExists(conn, referenceType, referenceId, businessId = bid()) {
  const [rows] = await conn.query(
    `SELECT id FROM journal_entries
     WHERE business_id = ? AND reference_type = ? AND reference_id = ? LIMIT 1`,
    [businessId, referenceType, referenceId],
  );
  return rows.length > 0;
}

export async function postJournal(conn, opts) {
  const businessId = bid();
  await ensureCoa(conn, businessId);
  const accounts = await accountMap(conn, businessId);
  const lines = (opts.lines || [])
    .map((l) => ({
      accountCode: l.accountCode,
      debit: round2(l.debit || 0),
      credit: round2(l.credit || 0),
    }))
    .filter((l) => l.debit > 0 || l.credit > 0);
  if (!lines.length) return null;

  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (totalDebit !== totalCredit) {
    throw new Error(`Journal not balanced (Dr ${totalDebit} ≠ Cr ${totalCredit})`);
  }

  const journalId = crypto.randomUUID();
  const n = await nextSeq(conn, "journal", 1001);
  const voucherNo = opts.voucherNo || `JNL-${n}`;
  await conn.query(
    `INSERT INTO journal_entries (
       id, business_id, voucher_no, voucher_date, voucher_type, narration,
       reference_type, reference_id, created_by
     ) VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      journalId,
      businessId,
      voucherNo,
      opts.voucherDate ? isoDate(opts.voucherDate) : new Date().toISOString().slice(0, 10),
      opts.voucherType || "journal",
      opts.narration || null,
      opts.referenceType || null,
      opts.referenceId || null,
      authUser()?.id || null,
    ],
  );

  for (const line of lines) {
    const account = accounts.get(line.accountCode);
    if (!account) throw new Error(`Unknown account code ${line.accountCode}`);
    await conn.query(
      `INSERT INTO journal_lines (id, journal_id, account_id, debit, credit, business_id)
       VALUES (?,?,?,?,?,?)`,
      [crypto.randomUUID(), journalId, account.id, line.debit, line.credit, businessId],
    );
  }
  return journalId;
}

function splitGst(gst) {
  const total = round2(gst);
  const cgst = round2(total / 2);
  return { cgst, sgst: round2(total - cgst) };
}

export async function postSaleJournal(conn, order) {
  if (await journalExists(conn, "sales_order", order.id)) return null;
  const subtotal = round2(order.subtotal);
  const { cgst, sgst } = splitGst(order.gst);
  const total = round2(order.total);
  const lines = [
    { accountCode: assetCodeForMethod(order.payment_method), debit: total, credit: 0 },
    { accountCode: "4101", debit: 0, credit: subtotal },
  ];
  if (cgst > 0) lines.push({ accountCode: "2201", debit: 0, credit: cgst });
  if (sgst > 0) lines.push({ accountCode: "2202", debit: 0, credit: sgst });
  return postJournal(conn, {
    voucherType: "sale",
    voucherDate: isoDate(order.created_at),
    narration: `Sale ${order.order_number}`,
    referenceType: "sales_order",
    referenceId: order.id,
    lines,
  });
}

export async function postPurchaseJournal(conn, purchase) {
  if (await journalExists(conn, "purchase", purchase.id)) return null;
  const subtotal = round2(purchase.subtotal);
  const { cgst, sgst } = splitGst(purchase.gst);
  const total = round2(purchase.total);
  const lines = [
    { accountCode: "5101", debit: subtotal, credit: 0 },
  ];
  if (cgst > 0) lines.push({ accountCode: "2301", debit: cgst, credit: 0 });
  if (sgst > 0) lines.push({ accountCode: "2302", debit: sgst, credit: 0 });
  lines.push({
    accountCode: purchase.payment_method === "credit" ? "2101" : assetCodeForMethod(purchase.payment_method),
    debit: 0,
    credit: total,
  });
  return postJournal(conn, {
    voucherType: "purchase",
    voucherDate: isoDate(purchase.purchase_date),
    narration: `Purchase ${purchase.purchase_number}`,
    referenceType: "purchase",
    referenceId: purchase.id,
    lines,
  });
}

export async function postReceiptJournal(conn, { amount, payment_method, entryNo, ledgerId }) {
  return postJournal(conn, {
    voucherType: "receipt",
    narration: `Customer receipt ${entryNo}`,
    referenceType: "account_ledger",
    referenceId: ledgerId,
    lines: [
      { accountCode: assetCodeForMethod(payment_method), debit: round2(amount), credit: 0 },
      { accountCode: "1101", debit: 0, credit: round2(amount) },
    ],
  });
}

export async function postPaymentJournal(conn, { amount, payment_method, entryNo, ledgerId }) {
  return postJournal(conn, {
    voucherType: "payment",
    narration: `Supplier payment ${entryNo}`,
    referenceType: "account_ledger",
    referenceId: ledgerId,
    lines: [
      { accountCode: "2101", debit: round2(amount), credit: 0 },
      { accountCode: assetCodeForMethod(payment_method), debit: 0, credit: round2(amount) },
    ],
  });
}

async function linesForPeriod(from, to, businessId = bid()) {
  return query(
    `SELECT a.code, a.name, a.account_group,
            COALESCE(SUM(l.debit),0) AS debit,
            COALESCE(SUM(l.credit),0) AS credit
     FROM chart_of_accounts a
     LEFT JOIN journal_lines l ON l.account_id = a.id AND l.business_id = a.business_id
     LEFT JOIN journal_entries j ON j.id = l.journal_id
       AND j.business_id = a.business_id
       AND j.voucher_date BETWEEN ? AND ?
     WHERE a.business_id = ? AND a.active = 1
     GROUP BY a.id, a.code, a.name, a.account_group
     ORDER BY a.code`,
    [from, to, businessId],
  );
}

export async function getCoa(businessId = bid()) {
  const { withTransaction } = await import("./db.js");
  await withTransaction((conn) => ensureCoa(conn, businessId));
  return query(
    "SELECT id, code, name, account_group, is_system, active FROM chart_of_accounts WHERE business_id = ? ORDER BY code",
    [businessId],
  );
}

export async function trialBalance(from, to, businessId = bid()) {
  const rows = await linesForPeriod(from, to, businessId);
  const mapped = rows.map((r) => {
    const debit = round2(r.debit);
    const credit = round2(r.credit);
    const balance = round2(debit - credit);
    return { ...r, debit, credit, balance };
  });
  const totalDebit = round2(mapped.reduce((s, r) => s + r.debit, 0));
  const totalCredit = round2(mapped.reduce((s, r) => s + r.credit, 0));
  return { from, to, rows: mapped, totalDebit, totalCredit };
}

export async function profitAndLoss(from, to, businessId = bid()) {
  const rows = await linesForPeriod(from, to, businessId);
  let income = 0;
  let expense = 0;
  const incomeRows = [];
  const expenseRows = [];
  for (const r of rows) {
    const net = round2(Number(r.credit) - Number(r.debit));
    if (r.account_group === "income" && net !== 0) {
      income += net;
      incomeRows.push({ code: r.code, name: r.name, amount: net });
    }
    if (r.account_group === "expense" && net !== 0) {
      const amt = round2(Number(r.debit) - Number(r.credit));
      expense += amt;
      expenseRows.push({ code: r.code, name: r.name, amount: amt });
    }
  }
  return {
    from,
    to,
    income: round2(income),
    expense: round2(expense),
    netProfit: round2(income - expense),
    incomeRows,
    expenseRows,
  };
}

export async function balanceSheet(asOf, businessId = bid()) {
  const from = "2000-01-01";
  const rows = await linesForPeriod(from, asOf, businessId);
  const groups = { asset: [], liability: [], equity: [] };
  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  for (const r of rows) {
    const debit = round2(r.debit);
    const credit = round2(r.credit);
    const bal = round2(debit - credit);
    if (!bal) continue;
    if (r.account_group === "asset") {
      assets += bal;
      groups.asset.push({ code: r.code, name: r.name, balance: bal });
    } else if (r.account_group === "liability") {
      const lb = round2(credit - debit);
      liabilities += lb;
      groups.liability.push({ code: r.code, name: r.name, balance: lb });
    } else if (r.account_group === "equity") {
      const eb = round2(credit - debit);
      equity += eb;
      groups.equity.push({ code: r.code, name: r.name, balance: eb });
    }
  }
  const pl = await profitAndLoss(from, asOf, businessId);
  equity = round2(equity + pl.netProfit);
  return {
    asOf,
    assets: round2(assets),
    liabilities: round2(liabilities),
    equity: round2(equity),
    netProfit: pl.netProfit,
    groups,
  };
}

export async function cashBook(from, to, businessId = bid()) {
  const rows = await query(
    `SELECT j.voucher_no, j.voucher_date, j.voucher_type, j.narration,
            a.code, a.name, l.debit, l.credit
     FROM journal_lines l
     JOIN journal_entries j ON j.id = l.journal_id
     JOIN chart_of_accounts a ON a.id = l.account_id
     WHERE l.business_id = ? AND j.voucher_date BETWEEN ? AND ?
       AND a.code IN ('1001','1002','1003')
     ORDER BY j.voucher_date, j.voucher_no, a.code`,
    [businessId, from, to],
  );
  let balance = 0;
  const entries = rows.map((r) => {
    const debit = round2(r.debit);
    const credit = round2(r.credit);
    balance = round2(balance + debit - credit);
    return { ...r, debit, credit, balance };
  });
  return { from, to, entries, closingBalance: balance };
}

export function isCashAccount(code) {
  return CASH_CODES.has(code);
}
