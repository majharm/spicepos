import { query } from "./db.js";
import { bid } from "./context.js";
import { createdBetween } from "./sql-time.js";
import {
  aggregateGstByRate,
  round2,
  splitGstAmount,
  splitOrderGst,
  sumSplitGst,
} from "./gst-supply.js";
import { DEFAULT_DSA_CODE, normalizeDsaCode } from "./onboard.js";
import "../js/footwear.js";

const POSFootwear = globalThis.POSFootwear;

function taxCodeLabel(biz) {
  return POSFootwear?.taxCodeLabel(biz || {}) || "HSN";
}

function range(from, to) {
  const end = to || new Date().toISOString().slice(0, 10);
  const start = from || "2000-01-01";
  return { start, end };
}

export function payModeBucket(method) {
  const m = String(method || "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-");
  if (m === "cash") return "cash";
  if (m === "upi") return "upi";
  if (m === "card" || m === "credit-card" || m === "debit-card") return "card";
  if (m === "credit") return "credit";
  return "other";
}

export function payStatusBucket(status) {
  const s = String(status || "paid").toLowerCase().trim();
  if (s === "partial" || s === "partially-paid" || s === "part-paid" || s === "partly-paid") {
    return "partial";
  }
  if (s === "unpaid" || s === "due") return "unpaid";
  return "paid";
}

function invoiceKey(row) {
  const id = String(row?.id || "").trim();
  if (id) return `id:${id}`;
  const num = String(row?.order_number || "").trim();
  if (num) return `no:${num}`;
  return "";
}

function isVoidInvoice(row) {
  const s = String(row?.status || "").toLowerCase();
  return s === "cancelled" || s === "void";
}

export function summarizeDailySales(sales, refundsByOrderId = {}) {
  const seen = new Set();
  const invoices = [];
  const totals = {
    bills: 0,
    subtotal: 0,
    discount: 0,
    gst: 0,
    returned: 0,
    net: 0,
    cash: 0,
    upi: 0,
    card: 0,
    credit: 0,
    other: 0,
    paid: 0,
    unpaid: 0,
    partial: 0,
  };
  const refunds = refundsByOrderId && typeof refundsByOrderId === "object" ? refundsByOrderId : {};
  for (const row of sales || []) {
    if (!row || isVoidInvoice(row)) continue;
    const key = invoiceKey(row);
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const id = String(row.id || "").trim();
    const total = round2(row.total);
    const returned = round2(
      Math.max(
        0,
        Number(row.returned ?? refunds[id] ?? refunds[row.order_number] ?? 0) || 0,
      ),
    );
    const net = round2(Math.max(0, total - returned));
    const mode = payModeBucket(row.payment_method);
    const payStatus = payStatusBucket(row.payment_status);
    const invoice = {
      id,
      order_number: row.order_number || "",
      created_at: row.created_at,
      customer_name: String(row.customer_name || "").trim() || "Walk-in",
      payment_method: row.payment_method || "",
      payment_mode: mode,
      payment_status: payStatus,
      status: row.status || "confirmed",
      subtotal: round2(row.subtotal),
      discount: round2(row.discount),
      gst: round2(row.gst),
      total,
      returned,
      net,
    };
    invoices.push(invoice);
    totals.bills += 1;
    totals.subtotal = round2(totals.subtotal + invoice.subtotal);
    totals.discount = round2(totals.discount + invoice.discount);
    totals.gst = round2(totals.gst + invoice.gst);
    totals.returned = round2(totals.returned + returned);
    totals.net = round2(totals.net + net);
    totals[mode] = round2((Number(totals[mode]) || 0) + net);
    totals[payStatus] = (Number(totals[payStatus]) || 0) + 1;
  }
  return { invoices, totals };
}

export { DEFAULT_DSA_CODE };

export function assembleDsaSales(shops = [], sales = [], refundsByOrderId = {}, opts = {}) {
  const { start, end } = range(opts.from, opts.to);
  const wanted = normalizeDsaCode(opts.code || "");
  const shopList = (shops || []).filter((s) => String(s?.dsa_code || "").trim());
  const salesByShop = new Map();
  for (const row of sales || []) {
    const bid = String(row.business_id || "");
    if (!salesByShop.has(bid)) salesByShop.set(bid, []);
    salesByShop.get(bid).push(row);
  }
  const codeMap = new Map();
  const bumpCode = (code, bills, net) => {
    const cur = codeMap.get(code) || { code, shops: 0, bills: 0, net: 0 };
    cur.shops += 1;
    cur.bills += bills;
    cur.net = round2(cur.net + net);
    codeMap.set(code, cur);
  };
  for (const shop of shopList) {
    const code = normalizeDsaCode(shop.dsa_code);
    if (!code) continue;
    const ds = summarizeDailySales(salesByShop.get(String(shop.id)) || [], refundsByOrderId);
    bumpCode(code, ds.totals.bills, ds.totals.net);
  }
  if (!codeMap.has(DEFAULT_DSA_CODE)) {
    codeMap.set(DEFAULT_DSA_CODE, { code: DEFAULT_DSA_CODE, shops: 0, bills: 0, net: 0 });
  }
  const filtered = wanted
    ? shopList.filter((s) => normalizeDsaCode(s.dsa_code) === wanted)
    : shopList;
  const shopRows = filtered.map((shop) => {
    const ds = summarizeDailySales(salesByShop.get(String(shop.id)) || [], refundsByOrderId);
    return {
      id: shop.id,
      name: shop.name || "—",
      city: shop.city || "",
      status: shop.status || "",
      dsa_code: normalizeDsaCode(shop.dsa_code),
      bills: ds.totals.bills,
      net: ds.totals.net,
      cash: ds.totals.cash,
      upi: ds.totals.upi,
      card: ds.totals.card,
      credit: ds.totals.credit,
      paid: ds.totals.paid,
      unpaid: ds.totals.unpaid,
      partial: ds.totals.partial,
      invoices: ds.invoices,
    };
  });
  const invoices = [];
  for (const shop of shopRows) {
    for (const inv of shop.invoices) {
      invoices.push({
        ...inv,
        business_id: shop.id,
        shop_name: shop.name,
        dsa_code: shop.dsa_code,
      });
    }
  }
  const totals = summarizeDailySales(
    (sales || []).filter((row) => filtered.some((s) => String(s.id) === String(row.business_id))),
    refundsByOrderId,
  ).totals;
  totals.shops = shopRows.length;
  return {
    from: start,
    to: end,
    code: wanted || "",
    codes: [...codeMap.values()].sort((a, b) => a.code.localeCompare(b.code)),
    shops: shopRows.map(({ invoices: _inv, ...rest }) => rest),
    invoices,
    totals,
  };
}

export function dsaSalesToSheets(data) {
  const num = (v) => Number(v) || 0;
  const t = data?.totals || {};
  return [
    {
      name: "DSA summary",
      headers: ["DSA", "From", "To", "Shops", "Invoices", "Cash", "UPI", "Card", "Credit", "Total"],
      rows: [[
        data.code || "All",
        data.from,
        data.to,
        num(t.shops),
        num(t.bills),
        num(t.cash),
        num(t.upi),
        num(t.card),
        num(t.credit),
        num(t.net),
      ]],
    },
    {
      name: "DSA shops",
      headers: ["Shop", "City", "DSA", "Invoices", "Cash", "UPI", "Card", "Credit", "Total"],
      rows: (data.shops || []).map((s) => [
        s.name,
        s.city,
        s.dsa_code,
        num(s.bills),
        num(s.cash),
        num(s.upi),
        num(s.card),
        num(s.credit),
        num(s.net),
      ]),
    },
    {
      name: "DSA invoices",
      headers: [
        "Shop",
        "Invoice",
        "Date & Time",
        "Customer",
        "Payment Mode",
        "Status",
        "Subtotal",
        "Discount",
        "GST",
        "Returned",
        "Amount",
      ],
      rows: (data.invoices || []).map((o) => [
        o.shop_name,
        o.order_number,
        String(o.created_at || ""),
        o.customer_name,
        o.payment_method || o.payment_mode,
        o.payment_status,
        num(o.subtotal),
        num(o.discount),
        num(o.gst),
        num(o.returned),
        num(o.net),
      ]),
    },
  ];
}

async function loadInvoiceRefunds(tenant, start, end) {
  try {
    const rows = await query(
      `SELECT r.order_id, COALESCE(SUM(r.refund_amount),0) AS refunded
       FROM sales_returns r
       JOIN sales_orders o ON o.id = r.order_id AND o.business_id = r.business_id
       WHERE o.business_id = ? AND ${createdBetween("o")}
         AND LOWER(COALESCE(r.status,'')) <> 'cancelled'
       GROUP BY r.order_id`,
      [tenant, start, end],
    );
    return Object.fromEntries(
      (rows || []).map((r) => [String(r.order_id), Number(r.refunded) || 0]),
    );
  } catch {
    return {};
  }
}

export async function buildReports(from, to) {
  const { start, end } = range(from, to);
  const tenant = bid();
  const salesWhere = `business_id = ? AND ${createdBetween()}`;
  const poWhere = "business_id = ? AND purchase_date BETWEEN ? AND ?";

  const hsnExpr = "COALESCE(NULLIF(TRIM(i.hsn), ''), NULLIF(TRIM(i.code), ''), '-')";
  const rangeParams = [tenant, start, end];
  const [
    summary,
    sales,
    byItem,
    byCustomer,
    byPack,
    byPay,
    payDaywise,
    gst,
    stock,
    purchases,
    expenses,
    expenseSum,
    customers,
    companyRows,
    gstOutputLines,
    gstInputLines,
    gstHsn,
    gstB2B,
    gstB2C,
    purchaseGst,
  ] = await Promise.all([
    query(
      `SELECT COUNT(*) AS bills,
              COALESCE(SUM(subtotal),0) AS taxable,
              COALESCE(SUM(gst),0) AS gst,
              COALESCE(SUM(total),0) AS takings
       FROM sales_orders WHERE ${salesWhere}`,
      rangeParams,
    ),
    query(
      `SELECT id, order_number, customer_name, customer_type, pack_name, pack_count,
              status, total_quantity_gm, subtotal, discount, gst, total, payment_method,
              payment_status, created_at
       FROM sales_orders WHERE ${salesWhere} ORDER BY created_at`,
      rangeParams,
    ),
    query(
      `SELECT l.item_name, SUM(l.quantity_gm) AS quantity_gm, SUM(l.amount) AS amount,
              SUM(l.amount * l.gst_rate / 100) AS gst
       FROM sales_order_lines l
       JOIN sales_orders o ON o.id = l.order_id
       WHERE o.business_id = ? AND ${createdBetween("o")} AND l.cancelled = 0
       GROUP BY l.item_name ORDER BY amount DESC`,
      rangeParams,
    ),
    query(
      `SELECT customer_name, customer_type, COUNT(*) AS bills,
              COALESCE(SUM(total),0) AS takings, COALESCE(SUM(gst),0) AS gst
       FROM sales_orders WHERE ${salesWhere}
       GROUP BY customer_name, customer_type ORDER BY takings DESC`,
      rangeParams,
    ),
    query(
      `SELECT COALESCE(pack_name, 'Loose items') AS pack_type,
              COALESCE(SUM(pack_count),0) AS pack_count,
              COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings
       FROM sales_orders WHERE ${salesWhere}
       GROUP BY COALESCE(pack_name, 'Loose items') ORDER BY takings DESC`,
      rangeParams,
    ),
    query(
      `SELECT payment_method, COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings
       FROM sales_orders WHERE ${salesWhere}
       GROUP BY payment_method`,
      rangeParams,
    ),
    query(
      `SELECT DATE(created_at) AS day,
              COUNT(*) AS bills,
              COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'cash' THEN total ELSE 0 END),0) AS cash,
              COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'upi' THEN total ELSE 0 END),0) AS upi,
              COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'card' THEN total ELSE 0 END),0) AS card,
              COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'credit' THEN total ELSE 0 END),0) AS credit,
              COALESCE(SUM(CASE WHEN LOWER(COALESCE(payment_method,'')) NOT IN ('cash','upi','card','credit') THEN total ELSE 0 END),0) AS other,
              COALESCE(SUM(total),0) AS total
       FROM sales_orders WHERE ${salesWhere}
       GROUP BY DATE(created_at) ORDER BY day`,
      rangeParams,
    ),
    query(
      `SELECT DATE(created_at) AS day, COALESCE(SUM(subtotal),0) AS taxable,
              COALESCE(SUM(gst),0) AS gst, COALESCE(SUM(total),0) AS total
       FROM sales_orders WHERE ${salesWhere}
       GROUP BY DATE(created_at) ORDER BY day`,
      rangeParams,
    ),
    query(
      `SELECT code, name, hsn, local_name, category, subcategory, stock_gm, reorder_level_gm,
              retail_rate, b2b_rate, purchase_rate, gst_rate
       FROM items WHERE business_id = ? ORDER BY name`,
      [tenant],
    ),
    query(
      `SELECT purchase_number, supplier_name, supplier_invoice_number, purchase_date,
              subtotal, gst, total, payment_method, payment_status
       FROM purchases WHERE ${poWhere} ORDER BY purchase_date`,
      rangeParams,
    ),
    query(
      `SELECT expense_number, expense_date, category, account_code, amount, gst, payment_method, notes,
              (amount + gst) AS total
       FROM expenses WHERE business_id = ? AND expense_date BETWEEN ? AND ?
       ORDER BY expense_date`,
      rangeParams,
    ),
    query(
      `SELECT COALESCE(SUM(amount),0) AS amount, COALESCE(SUM(gst),0) AS gst, COUNT(*) AS bills
       FROM expenses WHERE business_id = ? AND expense_date BETWEEN ? AND ?`,
      rangeParams,
    ),
    query(
      `SELECT code, name, business_name, mobile, type, gstin, state, credit_limit, outstanding
       FROM customers WHERE business_id = ? ORDER BY name`,
      [tenant],
    ),
    query("SELECT gstin, state FROM company_settings WHERE business_id = ? LIMIT 1", [tenant]),
    query(
      `SELECT l.gst_rate, l.amount, o.id AS order_id,
              c.gstin AS party_gstin, c.state AS party_state
       FROM sales_order_lines l
       JOIN sales_orders o ON o.id = l.order_id
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.business_id = ? AND ${createdBetween("o")} AND l.cancelled = 0`,
      rangeParams,
    ),
    query(
      `SELECT l.gst_rate, l.amount,
              COALESCE(l.gst_amount, l.amount * l.gst_rate / 100) AS gst,
              p.id AS purchase_id, s.gstin AS party_gstin
       FROM purchase_lines l
       JOIN purchases p ON p.id = l.purchase_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.business_id = ? AND p.purchase_date BETWEEN ? AND ?`,
      rangeParams,
    ),
    query(
      `SELECT ${hsnExpr} AS hsn, l.item_name, l.gst_rate,
              SUM(l.quantity_gm) AS quantity_gm,
              SUM(l.amount) AS taxable,
              SUM(l.amount * l.gst_rate / 100) AS gst
       FROM sales_order_lines l
       JOIN sales_orders o ON o.id = l.order_id
       LEFT JOIN items i ON i.id = l.item_id
       WHERE o.business_id = ? AND ${createdBetween("o")} AND l.cancelled = 0
       GROUP BY i.hsn, i.code, l.item_name, l.gst_rate
       ORDER BY hsn, l.item_name`,
      rangeParams,
    ),
    query(
      `SELECT o.order_number, DATE(o.created_at) AS bill_date, o.customer_name, c.gstin,
              c.state AS customer_state, o.subtotal AS taxable, o.gst, o.total
       FROM sales_orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.business_id = ? AND ${createdBetween("o")}
         AND c.gstin IS NOT NULL AND TRIM(c.gstin) <> ''
       ORDER BY o.created_at`,
      rangeParams,
    ),
    query(
      `SELECT o.order_number, DATE(o.created_at) AS bill_date, o.customer_name,
              c.state AS customer_state, o.subtotal AS taxable, o.gst, o.total
       FROM sales_orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.business_id = ? AND ${createdBetween("o")}
         AND (c.gstin IS NULL OR TRIM(c.gstin) = '')
       ORDER BY o.created_at`,
      rangeParams,
    ),
    query(
      `SELECT COALESCE(SUM(subtotal),0) AS taxable, COALESCE(SUM(gst),0) AS gst, COALESCE(SUM(total),0) AS total
       FROM purchases WHERE ${poWhere}`,
      rangeParams,
    ),
  ]);
  const low = stock.filter((i) => Number(i.stock_gm) <= Number(i.reorder_level_gm));
  const shop = {
    gstin: companyRows[0]?.gstin,
    state: companyRows[0]?.state,
  };
  const gstByRate = aggregateGstByRate(gstOutputLines, shop);
  const gstInputByRate = aggregateGstByRate(
    gstInputLines.map((r) => ({ ...r, order_id: r.purchase_id })),
    shop,
  );
  const outputGst = Number(summary[0]?.gst || 0);
  const inputGst = Number(purchaseGst[0]?.gst || 0) + Number(expenseSum[0]?.gst || 0);
  const outputSplit = sumSplitGst(
    gstOutputLines.map((r) => ({
      gst_rate: r.gst_rate,
      amount: r.amount,
      party_gstin: r.party_gstin,
      party_state: r.party_state,
    })),
    shop,
  );
  const purchaseInputSplit = sumSplitGst(gstInputLines, shop);
  const expenseInputSplit = splitGstAmount(Number(expenseSum[0]?.gst || 0), false);
  const inputSplit = {
    cgst: purchaseInputSplit.cgst + expenseInputSplit.cgst,
    sgst: purchaseInputSplit.sgst + expenseInputSplit.sgst,
    igst: purchaseInputSplit.igst + expenseInputSplit.igst,
    total: round2(
      purchaseInputSplit.total +
        expenseInputSplit.cgst +
        expenseInputSplit.sgst +
        expenseInputSplit.igst,
    ),
  };
  const gstSummary = {
    output: outputSplit,
    input: inputSplit,
    net: {
      cgst: round2(outputSplit.cgst - inputSplit.cgst),
      sgst: round2(outputSplit.sgst - inputSplit.sgst),
      igst: round2(outputSplit.igst - inputSplit.igst),
      total: round2(outputSplit.total - inputSplit.total),
    },
  };
  const gstB2BRows = gstB2B.map((row) => {
    const split = splitOrderGst({ ...row, customer_gstin: row.gstin }, shop);
    return { ...row, ...split };
  });
  const gstB2CRows = gstB2C.map((row) => {
    const split = splitOrderGst(row, shop);
    return { ...row, ...split };
  });
  const refunds = await loadInvoiceRefunds(tenant, start, end);
  const dailySales = summarizeDailySales(sales, refunds);

  return {
    from: start,
    to: end,
    shop,
    summary: {
      ...(summary[0] || { bills: 0, taxable: 0, gst: 0, takings: 0 }),
      inputGst,
      netGst: outputGst - inputGst,
      expenses: Number(expenseSum[0]?.amount || 0) + Number(expenseSum[0]?.gst || 0),
      expenseBills: Number(expenseSum[0]?.bills || 0),
      gstSummary,
    },
    sales,
    dailySales,
    byItem,
    byCustomer,
    byPack,
    byPay,
    payDaywise,
    gst,
    gstByRate,
    gstInputByRate,
    gstHsn,
    gstB2B: gstB2BRows,
    gstB2C: gstB2CRows,
    stock,
    low,
    purchases,
    expenses,
    customers,
  };
}

export function formatReportDay(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value ?? "");
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

export function reportsToSheets(data, biz = {}) {
  const tax = taxCodeLabel(biz);
  const num = (v) => Number(v) || 0;
  const gstRateRows = (rows, withBills = true) =>
    (rows || []).map((r) => {
      const row = [
        num(r.gst_rate),
        num(r.taxable),
        num(r.cgst),
        num(r.sgst),
        num(r.igst),
        num(r.gst),
      ];
      if (withBills) row.push(num(r.bills));
      return row;
    });
  const gstInputRows = gstRateRows(data.gstInputByRate, false);
  const gstSummary = data.summary?.gstSummary || {};
  const out = gstSummary.output || {};
  const inp = gstSummary.input || {};
  const net = gstSummary.net || {};
  return [
    {
      name: "GST summary",
      headers: ["Type", "CGST", "SGST", "IGST", "Total GST"],
      rows: [
        ["Output", num(out.cgst), num(out.sgst), num(out.igst), num(out.total)],
        ["Input", num(inp.cgst), num(inp.sgst), num(inp.igst), num(inp.total)],
        ["Net payable", num(net.cgst), num(net.sgst), num(net.igst), num(net.total)],
      ],
    },
    {
      name: "Summary",
      headers: ["From", "To", "Bills", "Taxable", "Output GST", "Input GST", "Net GST", "Takings"],
      rows: [[
        data.from,
        data.to,
        num(data.summary.bills),
        num(data.summary.taxable),
        num(data.summary.gst),
        num(data.summary.inputGst),
        num(data.summary.netGst),
        num(data.summary.takings),
      ]],
    },
    {
      name: "Daily Sales",
      headers: [
        "Invoice",
        "Date & Time",
        "Customer",
        "Payment Mode",
        "Status",
        "Subtotal",
        "Discount",
        "GST",
        "Returned",
        "Amount",
      ],
      rows: (data.dailySales?.invoices || summarizeDailySales(data.sales || []).invoices).map((o) => [
        o.order_number,
        String(o.created_at || ""),
        o.customer_name,
        o.payment_method || o.payment_mode,
        o.payment_status,
        num(o.subtotal),
        num(o.discount),
        num(o.gst),
        num(o.returned),
        num(o.net),
      ]),
    },
    {
      name: "Sales bills",
      headers: ["Order", "Customer", "Type", "Pack", "Pack count", "Status", "Qty g", "Taxable", "GST", "Total", "Pay", "Pay status", "Date"],
      rows: data.sales.map((o) => [
        o.order_number,
        o.customer_name,
        o.customer_type,
        o.pack_name || "Loose items",
        num(o.pack_count),
        String(o.status || "").toLowerCase() === "cancelled" ? "Void" : o.status,
        num(o.total_quantity_gm),
        num(o.subtotal),
        num(o.gst),
        num(o.total),
        o.payment_method,
        o.payment_status,
        String(o.created_at),
      ]),
    },
    {
      name: "Item sales",
      headers: ["Item", "Qty g", "Amount", "GST"],
      rows: data.byItem.map((r) => [r.item_name, num(r.quantity_gm), num(r.amount), num(r.gst)]),
    },
    {
      name: "Customer sales",
      headers: ["Customer", "Type", "Bills", "Takings", "GST"],
      rows: data.byCustomer.map((r) => [r.customer_name, r.customer_type, num(r.bills), num(r.takings), num(r.gst)]),
    },
    {
      name: "Pack sales",
      headers: ["Pack type", "Pack count", "Bills", "Takings"],
      rows: data.byPack.map((r) => [r.pack_type, num(r.pack_count), num(r.bills), num(r.takings)]),
    },
    {
      name: "Payment",
      headers: ["Method", "Bills", "Takings"],
      rows: data.byPay.map((r) => [r.payment_method, num(r.bills), num(r.takings)]),
    },
    {
      name: "Payment daywise",
      headers: ["Day", "Cash", "UPI", "Card", "Credit", "Other", "Bills", "Total"],
      rows: (data.payDaywise || []).map((r) => [
        formatReportDay(r.day),
        num(r.cash),
        num(r.upi),
        num(r.card),
        num(r.credit),
        num(r.other),
        num(r.bills),
        num(r.total),
      ]),
    },
    {
      name: "GST daywise",
      headers: ["Day", "Taxable", "GST", "Total"],
      rows: data.gst.map((r) => [formatReportDay(r.day), num(r.taxable), num(r.gst), num(r.total)]),
    },
    {
      name: "GST output by rate",
      headers: ["GST %", "Taxable", "CGST", "SGST", "IGST", "Total GST", "Bills"],
      rows: gstRateRows(data.gstByRate),
    },
    {
      name: "GST input by rate",
      headers: ["GST %", "Taxable", "CGST", "SGST", "IGST", "Total GST"],
      rows: gstInputRows,
    },
    {
      name: `GST ${tax} itemwise`,
      headers: [`${tax}/SKU`, "Item", "GST %", "Qty g", "Taxable", "GST"],
      rows: (data.gstHsn || []).map((r) => [
        r.hsn, r.item_name, num(r.gst_rate), num(r.quantity_gm), num(r.taxable), num(r.gst),
      ]),
    },
    {
      name: "GST B2B sales",
      headers: ["Bill", "Date", "Customer", "GSTIN", "Taxable", "CGST", "SGST", "IGST", "Total", "Supply"],
      rows: (data.gstB2B || []).map((r) => [
        r.order_number,
        formatReportDay(r.bill_date),
        r.customer_name,
        r.gstin,
        num(r.taxable),
        num(r.cgst),
        num(r.sgst),
        num(r.igst),
        num(r.total),
        r.interState ? "Inter-state" : "Intra-state",
      ]),
    },
    {
      name: "GST B2C sales",
      headers: ["Bill", "Date", "Customer", "Taxable", "CGST", "SGST", "IGST", "Total", "Supply"],
      rows: (data.gstB2C || []).map((r) => [
        r.order_number,
        formatReportDay(r.bill_date),
        r.customer_name,
        num(r.taxable),
        num(r.cgst),
        num(r.sgst),
        num(r.igst),
        num(r.total),
        r.interState ? "Inter-state" : "Intra-state",
      ]),
    },
    {
      name: "Stock",
      headers: ["Code", "Name", tax, "Category", "Subcategory", "Stock g", "Reorder g", "Retail", "B2B", "Purchase", "GST %"],
      rows: data.stock.map((i) => [
        i.code, i.name, i.hsn, i.category, i.subcategory,
        num(i.stock_gm), num(i.reorder_level_gm), num(i.retail_rate), num(i.b2b_rate),
        num(i.purchase_rate), num(i.gst_rate),
      ]),
    },
    {
      name: "Low stock",
      headers: ["Code", "Name", "Stock g", "Reorder g"],
      rows: data.low.map((i) => [i.code, i.name, num(i.stock_gm), num(i.reorder_level_gm)]),
    },
    {
      name: "Purchases",
      headers: ["PO", "Supplier", "Invoice", "Date", "Taxable", "GST", "Total", "Pay", "Status"],
      rows: data.purchases.map((p) => [
        p.purchase_number, p.supplier_name, p.supplier_invoice_number, p.purchase_date,
        num(p.subtotal), num(p.gst), num(p.total), p.payment_method, p.payment_status,
      ]),
    },
    {
      name: "Expenses",
      headers: ["No.", "Date", "Category", "Amount", "GST", "Total", "Pay", "Notes"],
      rows: (data.expenses || []).map((e) => [
        e.expense_number, e.expense_date, e.category, num(e.amount), num(e.gst),
        num(e.total || Number(e.amount) + Number(e.gst)), e.payment_method, e.notes,
      ]),
    },
    {
      name: "Customers",
      headers: ["Code", "Name", "Business", "Mobile", "Type", "State", "GSTIN", "Credit limit", "Outstanding"],
      rows: data.customers.map((c) => [
        c.code, c.name, c.business_name, c.mobile, c.type, c.state, c.gstin,
        num(c.credit_limit), num(c.outstanding),
      ]),
    },
  ];
}
