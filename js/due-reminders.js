/** Outstanding invoice balances and the customer due WhatsApp reminder. */
(function (root) {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function inr(n) {
    return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(round2(n));
  }

  function moneyLabel(n) {
    return `₹${inr(n)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeMobile(raw) {
    let d = String(raw || "").replace(/\D/g, "");
    if (d.startsWith("00")) d = d.slice(2);
    if (d.startsWith("91") && d.length >= 12) d = d.slice(-10);
    else if (d.startsWith("0") && d.length === 11) d = d.slice(1);
    else if (d.length > 10) d = d.slice(-10);
    return /^\d{10}$/.test(d) ? d : "";
  }

  function whatsappUrl(mobile, text) {
    const local = normalizeMobile(mobile);
    const digits = local ? `91${local}` : "";
    const q = `text=${encodeURIComponent(String(text || ""))}`;
    return digits ? `https://wa.me/${digits}?${q}` : `https://wa.me/?${q}`;
  }

  function openRemainder(order) {
    const total = Number(order?.total) || 0;
    const paid = Number(order?.amount_paid ?? order?.amountPaid) || 0;
    if (paid > 0.004) return round2(Math.max(0, total - paid));
    const status = String(order?.payment_status || order?.paymentStatus || "").toLowerCase();
    const method = String(order?.payment_method || order?.paymentMethod || "").toLowerCase();
    if (status === "paid") return 0;
    if (status === "unpaid" || status === "due" || status === "partial" || method === "credit") return round2(Math.max(0, total - paid));
    if (method && method !== "credit") return 0;
    return round2(Math.max(0, total - paid));
  }

  function paymentStatusOf(order) {
    const left = openRemainder(order);
    if (left <= 0.004) return "paid";
    const paid = Number(order?.amount_paid ?? order?.amountPaid) || 0;
    const status = String(order?.payment_status || order?.paymentStatus || "").toLowerCase();
    if (paid > 0.004 || status === "partial") return "partial";
    return "due";
  }

  function istToday(now = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now instanceof Date ? now : new Date(now));
  }

  function shopYmd(value, timeZone = "Asia/Kolkata") {
    if (value == null || value === "") return "";
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return "";
      return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
    }
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text.slice(0, 10)) && !text.includes("T")) return text.slice(0, 10);
    const d = new Date(text);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }

  function formatDay(value) {
    const ymd = shopYmd(value) || (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "").slice(0, 10)) ? String(value).slice(0, 10) : "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "—";
    const [y, m, d] = ymd.split("-").map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  }

  function dash(value) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    return text || "—";
  }

  function dueReminderMessage(payload = {}) {
    return [
      `Dear *${dash(payload.customerName)}*,`,
      "",
      `Greetings from *${dash(payload.businessName)}*!`,
      "",
      "This is a friendly reminder that your payment is pending.",
      "",
      "📋 *Outstanding Payment Details*",
      `- Invoice No.: ${dash(payload.invoiceNumber)}`,
      `- Invoice Date: ${dash(payload.invoiceDate)}`,
      `- Invoice Amount: ₹${dash(payload.invoiceAmount)}`,
      `- Amount Paid: ₹${dash(payload.amountPaid)}`,
      `- *Balance Due: ₹${dash(payload.outstanding)}*`,
      `- Due Date: ${dash(payload.dueDate)}`,
      "",
      "We kindly request you to clear the outstanding amount at your earliest convenience.",
      "",
      "If you have already paid, please ignore this reminder and share the payment confirmation if needed.",
      "",
      "Thank you for your business and continued support!",
      "",
      "Regards,",
      `*${dash(payload.businessName)}*`,
      "Powered by ATAV POS",
    ].join("\n");
  }

  function shapeInvoice(order, reminder, today) {
    const outstanding = openRemainder(order);
    const invoiceDate = shopYmd(order?.created_at || order?.invoiceDate);
    const dueDate = shopYmd(order?.due_date || order?.dueDate || order?.created_at || order?.invoiceDate);
    const mobile = order?.mobile || order?.customer_mobile || "";
    const day = today || istToday();
    return {
      customerId: String(order?.customer_id || order?.customerId || ""),
      customerName: String(order?.business_name || order?.customer_name || order?.name || order?.customerName || "").trim(),
      mobile: String(mobile || ""),
      mobileOk: Boolean(normalizeMobile(mobile)),
      orderId: String(order?.id || order?.orderId || ""),
      invoiceNumber: String(order?.order_number || order?.invoiceNumber || order?.id || ""),
      invoiceDate,
      invoiceDateLabel: formatDay(invoiceDate),
      dueDate,
      dueDateLabel: formatDay(dueDate),
      total: round2(order?.total),
      amountPaid: round2(order?.amount_paid ?? order?.amountPaid),
      outstanding,
      paymentStatus: paymentStatusOf(order),
      overdue: outstanding > 0.004 && Boolean(dueDate) && dueDate < day,
      whatsappStatus: String(reminder?.status || ""),
      whatsappError: String(reminder?.error || ""),
      providerMessageId: String(reminder?.provider_message_id || reminder?.providerMessageId || ""),
      totalWhatsappStatus: "",
    };
  }

  function filterOutstanding(rows, filters = {}, today) {
    const q = String(filters.customer || "").trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    const from = String(filters.from || "");
    const to = String(filters.to || "");
    const status = String(filters.status || "").toLowerCase();
    const overdueOnly = filters.overdue === true || filters.overdue === "1" || filters.overdue === 1 || status === "overdue";
    const min = filters.min === "" || filters.min == null ? null : Number(filters.min);
    const max = filters.max === "" || filters.max == null ? null : Number(filters.max);
    const day = today || istToday();
    return (rows || []).filter((row) => {
      const outstanding = Number(row.outstanding) || 0;
      if (outstanding <= 0.004 || row.paymentStatus === "paid") return false;
      if (q) {
        const name = `${row.customerName || ""} ${row.mobile || ""}`.toLowerCase();
        const digits = String(row.mobile || "").replace(/\D/g, "");
        if (!name.includes(q) && !(qDigits && digits.includes(qDigits))) return false;
      }
      const invoiceDate = row.invoiceDate || shopYmd(row.created_at);
      if (from && invoiceDate < from) return false;
      if (to && invoiceDate > to) return false;
      const overdue = row.overdue != null ? Boolean(row.overdue) && (row.dueDate || "") < day : (row.dueDate || "") < day;
      if (overdueOnly && !overdue) return false;
      if ((status === "partial" || status === "due") && row.paymentStatus !== status) return false;
      if (min != null && Number.isFinite(min) && outstanding + 0.001 < min) return false;
      if (max != null && Number.isFinite(max) && outstanding - 0.001 > max) return false;
      return true;
    });
  }

  function invoiceMessage(row, businessName) {
    return dueReminderMessage({
      customerName: row.customerName,
      businessName,
      invoiceNumber: row.invoiceNumber,
      invoiceDate: row.invoiceDateLabel,
      invoiceAmount: inr(row.total),
      amountPaid: inr(row.amountPaid),
      outstanding: inr(row.outstanding),
      dueDate: row.dueDateLabel,
    });
  }

  function customerMessage(rows, businessName) {
    const open = (rows || []).filter((row) => Number(row.outstanding) > 0.004);
    if (!open.length) return "";
    const numbers = open.map((row) => row.invoiceNumber).filter(Boolean);
    const invoiceNumber = numbers.length > 4 ? `${numbers.slice(0, 4).join(", ")} +${numbers.length - 4} more` : numbers.join(", ");
    const dates = open.map((row) => row.invoiceDate).filter(Boolean).sort();
    const dues = open.map((row) => row.dueDate).filter(Boolean).sort();
    return dueReminderMessage({
      customerName: open[0].customerName,
      businessName,
      invoiceNumber,
      invoiceDate: formatDay(dates[0]),
      invoiceAmount: inr(open.reduce((sum, row) => sum + Number(row.total || 0), 0)),
      amountPaid: inr(open.reduce((sum, row) => sum + Number(row.amountPaid || 0), 0)),
      outstanding: inr(open.reduce((sum, row) => sum + Number(row.outstanding || 0), 0)),
      dueDate: formatDay(dues[0]),
    });
  }

  function dedupeKey(customerId, orderId, outstanding, day) {
    const scope = orderId ? String(orderId) : "total";
    return `${customerId}|${scope}|${round2(outstanding).toFixed(2)}|${day}`;
  }

  function statusLabel(status) {
    const value = String(status || "").toLowerCase();
    if (value === "sent") return "Sent";
    if (value === "delivered") return "Delivered";
    if (value === "failed") return "Failed";
    if (value === "pending" || value === "queued") return "Pending";
    return "";
  }

  function statusClass(status) {
    const value = String(status || "").toLowerCase();
    if (value === "queued") return "pending";
    if (value === "sent" || value === "delivered" || value === "failed" || value === "pending") return value;
    return "";
  }

  function paymentLabel(row) {
    if (row.paymentStatus === "partial") return "Partial";
    if (row.paymentStatus === "paid") return "Paid";
    return "Due";
  }

  function duesSummary(rows) {
    const customers = new Set((rows || []).map((row) => row.customerId));
    return {
      invoices: (rows || []).length,
      customers: customers.size,
      outstanding: round2((rows || []).reduce((sum, row) => sum + (Number(row.outstanding) || 0), 0)),
    };
  }

  function duesTableHtml(rows) {
    if (!rows?.length) return `<p class="report-empty">No outstanding invoices match these filters.</p>`;
    const body = rows.map((row, index) => {
      const showTotal = index === 0 || rows[index - 1].customerId !== row.customerId;
      const wa = statusLabel(row.whatsappStatus);
      const totalWa = showTotal ? statusLabel(row.totalWhatsappStatus) : "";
      const title = row.whatsappError || row.providerMessageId || "";
      return `<tr>
        <td><input type="checkbox" data-due-check value="${escapeHtml(row.orderId)}" data-customer="${escapeHtml(row.customerId)}" aria-label="Select ${escapeHtml(row.invoiceNumber)}" /></td>
        <td>${escapeHtml(row.customerName || "—")}</td>
        <td>${escapeHtml(row.mobile || "—")}</td>
        <td>${escapeHtml(row.invoiceNumber || "—")}</td>
        <td>${escapeHtml(row.invoiceDateLabel || "—")}</td>
        <td>${escapeHtml(moneyLabel(row.total))}</td>
        <td>${escapeHtml(moneyLabel(row.amountPaid))}</td>
        <td><strong>${escapeHtml(moneyLabel(row.outstanding))}</strong></td>
        <td>${escapeHtml(row.dueDateLabel || "—")}${row.overdue ? ` <span class="dues-overdue">Overdue</span>` : ""}</td>
        <td>${escapeHtml(paymentLabel(row))}</td>
        <td class="dues-actions">
          <button type="button" class="btn" data-due-wa="invoice" data-customer="${escapeHtml(row.customerId)}" data-order="${escapeHtml(row.orderId)}">Send WhatsApp</button>
          ${showTotal ? `<button type="button" class="btn" data-due-wa="customer" data-customer="${escapeHtml(row.customerId)}">Customer total</button>` : ""}
          ${wa ? `<span class="dues-status is-${escapeHtml(statusClass(row.whatsappStatus))}" title="${escapeHtml(title)}">${escapeHtml(wa)}</span>` : ""}
          ${totalWa ? `<span class="dues-status is-${escapeHtml(statusClass(row.totalWhatsappStatus))}">Total ${escapeHtml(totalWa)}</span>` : ""}
        </td>
      </tr>`;
    }).join("");
    return `<table class="dues-table">
      <thead><tr>
        <th><input type="checkbox" data-due-all aria-label="Select all outstanding invoices" /></th>
        <th>Customer Name</th>
        <th>Mobile Number</th>
        <th>Invoice Number</th>
        <th>Invoice Date</th>
        <th>Total Invoice Amount</th>
        <th>Amount Paid</th>
        <th>Outstanding Balance</th>
        <th>Due Date</th>
        <th>Payment Status</th>
        <th>WhatsApp Action</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;
  }

  root.POSDueReminders = {
    round2,
    inr,
    moneyLabel,
    escapeHtml,
    normalizeMobile,
    whatsappUrl,
    openRemainder,
    paymentStatusOf,
    istToday,
    shopYmd,
    formatDay,
    dueReminderMessage,
    shapeInvoice,
    filterOutstanding,
    invoiceMessage,
    customerMessage,
    dedupeKey,
    statusLabel,
    duesSummary,
    duesTableHtml,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
