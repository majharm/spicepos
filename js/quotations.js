/** Quotation pricing, status, and print copy. A quotation is not a tax invoice and does not post stock. */
(function (root) {
  const STATUSES = ["draft", "sent", "accepted", "rejected", "expired", "converted", "cancelled"];
  const LABELS = {
    draft: "Draft",
    sent: "Sent",
    accepted: "Accepted",
    rejected: "Rejected",
    expired: "Expired",
    converted: "Converted to Invoice",
    cancelled: "Cancelled",
  };

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function roundMoney(value) {
    const D = root.POSDiscount;
    if (D?.round2) return D.round2(value);
    return Math.round((num(value) + Number.EPSILON) * 1e8) / 1e8;
  }

  function ymd(value) {
    const s = String(value || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  function todayYmd(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function addDays(ymdValue, days) {
    const base = ymd(ymdValue);
    if (!base) return "";
    const d = new Date(`${base}T00:00:00`);
    d.setDate(d.getDate() + Math.max(0, Math.floor(num(days))));
    return todayYmd(d);
  }

  function formatNumber(n) {
    return `QT-${String(Math.max(0, Math.floor(num(n)))).padStart(5, "0")}`;
  }

  function statusOf(raw) {
    const s = String(raw || "draft").trim().toLowerCase().replace(/\s+/g, "_");
    if (s === "converted_to_invoice") return "converted";
    return STATUSES.includes(s) ? s : "draft";
  }

  function statusLabel(raw) {
    return LABELS[statusOf(raw)] || "Draft";
  }

  function isCountLine(line) {
    if (line?.isCount === true || line?.isCount === false) return Boolean(line.isCount);
    const U = root.POSUnits;
    const unit = line?.unit || line?.base_unit || "PCS";
    if (U?.isCount) return Boolean(U.isCount(unit));
    const code = String(unit || "PCS").trim().toUpperCase();
    return code !== "GM" && code !== "KG" && code !== "G";
  }

  function lineOf(raw) {
    const D = root.POSDiscount;
    const qty = num(raw?.quantity ?? raw?.qty ?? raw?.quantity_gm);
    const rate = num(raw?.rate);
    const gstRate = num(raw?.gstRate ?? raw?.gst_rate);
    const discountType = raw?.discountType || raw?.discount_type || "amt";
    const discountValue = num(raw?.discountValue ?? raw?.discount_value);
    const calc = D?.computeLine
      ? D.computeLine({ qty, rate, gstRate, discountType, discountValue, isCount: isCountLine(raw) })
      : { qty, rate, gstRate, discount: 0, taxable: qty * rate, gst: 0, total: qty * rate, discountType: "amt", discountValue: 0 };
    if (!(calc.qty > 0)) return null;
    return {
      itemId: String(raw?.itemId || raw?.item_id || "").trim(),
      sku: String(raw?.sku || raw?.code || "").trim().slice(0, 64),
      name: String(raw?.name || raw?.item_name || "Item").trim().slice(0, 180),
      description: String(raw?.description || "").trim().slice(0, 500),
      quantity: calc.qty,
      unit: String(raw?.unit || raw?.base_unit || "PCS").trim().slice(0, 16) || "PCS",
      isCount: isCountLine(raw),
      rate: calc.rate,
      discountType: calc.discountType,
      discountValue: calc.discountValue,
      discount: calc.discount,
      gstRate: calc.gstRate,
      gst: calc.gst,
      taxable: calc.taxable,
      total: calc.total,
      size: String(raw?.size || "").trim().slice(0, 32),
      color: String(raw?.color || "").trim().slice(0, 32),
    };
  }

  function splitTax(gst, interState) {
    const total = roundMoney(gst);
    if (interState) return { cgst: 0, sgst: 0, igst: total };
    const cgst = roundMoney(total / 2);
    return { cgst, sgst: roundMoney(total - cgst), igst: 0 };
  }

  function priceQuote(input = {}) {
    const lines = (Array.isArray(input.lines) ? input.lines : []).map(lineOf).filter(Boolean);
    const D = root.POSDiscount;
    const bill = D?.computeBill
      ? D.computeBill(lines, { discountType: input.discountType || input.discount_type, discountValue: input.discountValue ?? input.discount_value })
      : { subtotal: 0, gst: 0, billDiscount: 0, total: 0, discountType: "amt", discountValue: 0 };
    const charges = roundMoney(Math.max(0, num(input.extraCharges ?? input.extra_charges)));
    const roundOff = roundMoney(num(input.roundOff ?? input.round_off));
    const tax = splitTax(bill.gst, Boolean(input.interState));
    const total = roundMoney(Math.max(0, num(bill.total) + charges + roundOff));
    return {
      lines,
      subtotal: bill.subtotal,
      discount: bill.billDiscount,
      discountType: bill.discountType,
      discountValue: bill.discountValue,
      extraCharges: charges,
      gst: bill.gst,
      ...tax,
      roundOff,
      total,
    };
  }

  function effectiveStatus(row, today) {
    const status = statusOf(row?.status);
    if (status === "converted" || status === "cancelled" || status === "rejected" || status === "expired") return status;
    const until = ymd(row?.valid_until || row?.validUntil);
    const day = ymd(today);
    if (until && day && until < day) return "expired";
    return status;
  }

  function canEdit(row, today) {
    return effectiveStatus(row, today) === "draft" && !row?.order_id;
  }

  function canConvert(row, today) {
    return effectiveStatus(row, today) === "accepted" && !row?.order_id && !row?.order_number;
  }

  function emailSubject(number, businessName) {
    const shop = String(businessName || "Shop").trim() || "Shop";
    return `Quotation ${String(number || "").trim()} – ${shop}`;
  }

  function whatsAppText(quote, businessName) {
    const shop = String(businessName || "Shop").trim() || "Shop";
    const total = roundMoney(quote?.total);
    return `${shop}: Quotation ${quote?.quotation_number || ""} for ${quote?.customer_name || "you"} is Rs ${total.toFixed(2)}. Valid until ${ymd(quote?.valid_until) || "the date on the quotation"}. This is a quotation, not a tax invoice.`;
  }

  function summarize(rows, today) {
    const stats = {
      total: 0,
      draft: 0,
      sent: 0,
      accepted: 0,
      rejected: 0,
      expired: 0,
      converted: 0,
      cancelled: 0,
      quotedValue: 0,
      acceptedValue: 0,
    };
    for (const row of Array.isArray(rows) ? rows : []) {
      const status = effectiveStatus(row, today);
      stats.total += 1;
      if (stats[status] != null) stats[status] += 1;
      const total = roundMoney(row?.total);
      stats.quotedValue = roundMoney(stats.quotedValue + total);
      if (status === "accepted" || status === "converted") stats.acceptedValue = roundMoney(stats.acceptedValue + total);
    }
    return stats;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function moneyLabel(value) {
    const n = num(value);
    return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
  }

  function amountWords(value) {
    const fn = root.POSInvoice?.amountInWords;
    if (typeof fn === "function") return fn(value);
    return `Rupees ${num(value).toFixed(2)} Only`;
  }

  function safeLogo(value) {
    const src = String(value || "").trim();
    if (/^https?:\/\//i.test(src) || src.startsWith("/") || /^data:image\/(png|jpe?g|webp);/i.test(src)) return src;
    return "";
  }

  function printHtml(quote, company = {}) {
    const lines = Array.isArray(quote?.lines) ? quote.lines : [];
    const shop = company.name || "Shop";
    const logo = safeLogo(company.logo_url || company.logoUrl);
    const rows = lines
      .map((line) => {
        const extra = [line.sku, line.size, line.color].filter(Boolean).join(" · ");
        return `<tr>
          <td>${escapeHtml(line.name || "Item")}${line.description ? `<div class="muted">${escapeHtml(line.description)}</div>` : ""}${extra ? `<div class="muted">${escapeHtml(extra)}</div>` : ""}</td>
          <td class="num">${escapeHtml(line.quantity)} ${escapeHtml(line.unit || "")}</td>
          <td class="num">${escapeHtml(moneyLabel(line.rate))}</td>
          <td class="num">${escapeHtml(moneyLabel(line.discount))}</td>
          <td class="num">${escapeHtml(line.gstRate || 0)}%</td>
          <td class="num">${escapeHtml(moneyLabel(line.total))}</td>
        </tr>`;
      })
      .join("");
    const taxBits = [
      num(quote?.cgst) ? `CGST ${moneyLabel(quote.cgst)}` : "",
      num(quote?.sgst) ? `SGST ${moneyLabel(quote.sgst)}` : "",
      num(quote?.igst) ? `IGST ${moneyLabel(quote.igst)}` : "",
    ].filter(Boolean);
    return `<!DOCTYPE html>
<html lang="en-IN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(quote?.quotation_number || "Quotation")}</title>
  <style>
    body { font: 13px/1.4 "Segoe UI", sans-serif; color: #0f172a; margin: 24px; }
    h1 { margin: 0; font-size: 22px; letter-spacing: 0.04em; }
    .banner { margin: 8px 0 16px; padding: 8px 10px; border: 1px solid #b45309; color: #9a3412; font-weight: 800; }
    .top { display: flex; justify-content: space-between; gap: 16px; }
    .muted { color: #64748b; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 6px 4px; text-align: left; vertical-align: top; }
    th { font-size: 11px; text-transform: uppercase; color: #64748b; }
    .num { text-align: right; white-space: nowrap; }
    .totals { margin-left: auto; width: min(280px, 100%); }
    .sign { display: flex; justify-content: space-between; gap: 24px; margin-top: 28px; }
    .sign div { min-width: 180px; border-top: 1px solid #94a3b8; padding-top: 6px; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <div class="top">
    <div>
      ${logo ? `<img src="${escapeHtml(logo)}" alt="" style="max-height:64px;max-width:180px" />` : ""}
      <strong>${escapeHtml(shop)}</strong>
      <div class="muted">${escapeHtml(company.address || "")}</div>
      <div class="muted">${escapeHtml([company.phone, company.email, company.gstin ? `GSTIN ${company.gstin}` : ""].filter(Boolean).join(" · "))}</div>
    </div>
    <div>
      <h1>QUOTATION</h1>
      <div>${escapeHtml(quote?.quotation_number || "")}</div>
      <div class="muted">Date ${escapeHtml(ymd(quote?.quotation_date))}</div>
      <div class="muted">Valid until ${escapeHtml(ymd(quote?.valid_until) || "—")}</div>
    </div>
  </div>
  <p class="banner">QUOTATION — NOT A TAX INVOICE</p>
  <p><strong>${escapeHtml(quote?.customer_name || "Customer")}</strong><br />
    <span class="muted">${escapeHtml([quote?.customer_phone, quote?.customer_email].filter(Boolean).join(" · "))}</span><br />
    ${escapeHtml(quote?.billing_address || "")}
    ${quote?.shipping_address ? `<br /><span class="muted">Ship to ${escapeHtml(quote.shipping_address)}</span>` : ""}
  </p>
  <table>
    <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Discount</th><th class="num">Tax</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6">No items</td></tr>`}</tbody>
  </table>
  <table class="totals">
    <tr><td>Subtotal</td><td class="num">${escapeHtml(moneyLabel(quote?.subtotal))}</td></tr>
    <tr><td>Discount</td><td class="num">${escapeHtml(moneyLabel(quote?.discount))}</td></tr>
    <tr><td>Charges</td><td class="num">${escapeHtml(moneyLabel(quote?.extra_charges ?? quote?.extraCharges))}</td></tr>
    <tr><td>Tax ${taxBits.length ? `<span class="muted">${escapeHtml(taxBits.join(" · "))}</span>` : ""}</td><td class="num">${escapeHtml(moneyLabel(quote?.gst))}</td></tr>
    <tr><td>Round off</td><td class="num">${escapeHtml(moneyLabel(quote?.round_off ?? quote?.roundOff))}</td></tr>
    <tr><td><strong>Grand total</strong></td><td class="num"><strong>${escapeHtml(moneyLabel(quote?.total))}</strong></td></tr>
  </table>
  <p class="muted">Amount in words: ${escapeHtml(amountWords(quote?.total))}</p>
  ${quote?.notes ? `<p><strong>Notes</strong><br />${escapeHtml(quote.notes)}</p>` : ""}
  ${quote?.terms ? `<p><strong>Terms and conditions</strong><br />${escapeHtml(quote.terms)}</p>` : ""}
  <div class="sign"><div>Customer acceptance</div><div>For ${escapeHtml(shop)}</div></div>
  <p class="muted">Page 1</p>
</body>
</html>`;
  }

  root.POSQuotations = {
    STATUSES,
    LABELS,
    ymd,
    todayYmd,
    addDays,
    formatNumber,
    statusOf,
    statusLabel,
    lineOf,
    priceQuote,
    splitTax,
    effectiveStatus,
    canEdit,
    canConvert,
    emailSubject,
    whatsAppText,
    summarize,
    printHtml,
    amountWords,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
