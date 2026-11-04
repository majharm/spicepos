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
      ? D.computeBill(lines, {
          discountType: input.discountType || input.discount_type,
          discountValue: input.discountValue ?? input.discount_value,
          loyaltyDiscount: input.loyaltyDiscount ?? input.loyalty_discount ?? 0,
        })
      : { subtotal: 0, gst: 0, billDiscount: 0, taxable: 0, total: 0, discountType: "amt", discountValue: 0 };
    const charges = roundMoney(Math.max(0, num(input.extraCharges ?? input.extra_charges)));
    const roundOff = roundMoney(num(input.roundOff ?? input.round_off));
    const tax = splitTax(bill.gst, Boolean(input.interState));
    const total = roundMoney(Math.max(0, num(bill.total) + charges + roundOff));
    return {
      lines,
      subtotal: bill.subtotal,
      taxable: bill.taxable,
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
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    const two = (n) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`.trim());
    const three = (n) => (n < 100 ? two(n) : `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${two(n % 100)}` : ""}`.trim());
    const rounded = Math.round(num(value) * 100) / 100;
    const rupees = Math.floor(Math.abs(rounded));
    const paise = Math.round((Math.abs(rounded) - rupees) * 100);
    if (!rupees && !paise) return "Rupees Zero Only";
    let rest = rupees;
    const crore = Math.floor(rest / 10000000);
    rest %= 10000000;
    const lakh = Math.floor(rest / 100000);
    rest %= 100000;
    const thousand = Math.floor(rest / 1000);
    rest %= 1000;
    const parts = [];
    if (crore) parts.push(`${two(crore)} Crore`);
    if (lakh) parts.push(`${two(lakh)} Lakh`);
    if (thousand) parts.push(`${two(thousand)} Thousand`);
    if (rest) parts.push(three(rest));
    let out = `Rupees ${parts.join(" ") || "Zero"}`;
    if (paise) out += ` and ${two(paise)} Paise`;
    return `${out} Only`;
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
      .map((line, index) => {
        const extra = [line.sku, line.size, line.color, line.description, `GST ${line.gstRate || 0}%`].filter(Boolean).join(" · ");
        const unit = String(line.unit || "").toUpperCase();
        const measured = line.isCount === false || unit === "GM" || unit === "G" || unit === "KG";
        const qtyNum = num(line.quantity);
        const qtyText = measured && (unit === "GM" || unit === "G" || unit === "") && qtyNum >= 1000
          ? `${(qtyNum / 1000).toFixed(2)} kg`
          : measured && unit === "KG"
            ? `${qtyNum.toFixed(2)} kg`
            : `${line.quantity} ${line.unit || ""}`.trim();
        return `<tr>
          <td class="off-c">${index + 1}</td>
          <td><div class="off-item-name">${escapeHtml(line.name || "Item")}</div>${extra ? `<div class="off-item-desc">${escapeHtml(extra)}</div>` : ""}</td>
          <td class="off-n">${escapeHtml(qtyText)}</td>
          <td class="off-n">${escapeHtml(moneyLabel(line.rate))}${measured ? "/kg" : ""}</td>
          <td class="off-n">${escapeHtml(moneyLabel(line.taxable ?? line.total))}</td>
        </tr>`;
      })
      .join("");
    const taxBits = [
      num(quote?.cgst) ? `CGST ${moneyLabel(quote.cgst)}` : "",
      num(quote?.sgst) ? `SGST ${moneyLabel(quote.sgst)}` : "",
      num(quote?.igst) ? `IGST ${moneyLabel(quote.igst)}` : "",
    ].filter(Boolean);
    const gstMap = new Map();
    lines.forEach((line) => {
      const rate = num(line.gstRate);
      const row = gstMap.get(rate) || { rate, taxable: 0, gst: 0 };
      row.taxable += num(line.taxable);
      row.gst += num(line.gst);
      gstMap.set(rate, row);
    });
    const gstRows = [...gstMap.values()];
    const rawGst = gstRows.reduce((sum, row) => sum + row.gst, 0);
    const rawTaxable = gstRows.reduce((sum, row) => sum + row.taxable, 0);
    const billGst = num(quote?.gst);
    const billTaxable = num(quote?.taxable ?? Math.max(0, num(quote?.subtotal) - num(quote?.discount)));
    const gstScale = rawGst > 0.009 ? billGst / rawGst : 1;
    const taxScale = rawTaxable > 0.009 ? billTaxable / rawTaxable : 1;
    const inter = num(quote?.igst) > 0.009 && !(num(quote?.cgst) > 0.009);
    const gstTable = gstRows.map((row) => {
      const taxable = row.taxable * taxScale;
      const gst = row.gst * gstScale;
      const half = inter ? 0 : gst / 2;
      return `<tr>
        <td class="off-n">${escapeHtml(row.rate)}%</td>
        <td class="off-n">${escapeHtml(moneyLabel(taxable))}</td>
        <td class="off-n">${escapeHtml(moneyLabel(inter ? 0 : half))}</td>
        <td class="off-n">${escapeHtml(moneyLabel(inter ? 0 : gst - half))}</td>
        <td class="off-n">${escapeHtml(moneyLabel(inter ? gst : 0))}</td>
        <td class="off-n">${escapeHtml(moneyLabel(gst))}</td>
      </tr>`;
    }).join("");
    const discount = num(quote?.discount);
    const charges = num(quote?.extra_charges ?? quote?.extraCharges);
    const roundOff = num(quote?.round_off ?? quote?.roundOff);
    const taxable = num(quote?.taxable ?? Math.max(0, num(quote?.subtotal) - discount));
    return `<!DOCTYPE html>
<html lang="en-IN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(quote?.quotation_number || "Quotation")}</title>
    <style>
    @page { size: A4 portrait; margin: 12mm 12mm 14mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; color: #212121; background: #fff; font-family: "Segoe UI", Calibri, Arial, sans-serif; font-size: 11px; line-height: 1.4; }
    .office-invoice { width: 100%; color: #212121; }
    .off-head { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; padding-bottom: 10px; }
    .off-seller { flex: 1 1 auto; min-width: 0; }
    .off-logo { max-height: 48px; max-width: 42mm; display: block; margin-bottom: 6px; object-fit: contain; }
    .off-shop { margin: 0 0 4px; font-size: 18px; font-weight: 700; color: #1a7a6d; letter-spacing: -0.02em; }
    .off-seller-meta { font-size: 10.5px; color: #555; overflow-wrap: anywhere; }
    .off-doc { flex: 0 0 72mm; max-width: 78mm; }
    .off-title { margin: 0; font-size: 18px; font-weight: 700; color: #1a7a6d; letter-spacing: 0.04em; text-align: right; }
    .off-copy { margin: 1px 0 6px; font-size: 10px; color: #777; text-align: right; }
    .off-meta { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    .off-meta td { padding: 1px 0; }
    .off-meta td:first-child { color: #666; width: 42%; }
    .off-meta td:last-child { text-align: right; font-weight: 600; }
    .off-balance { margin-top: 6px; display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 8px; background: #edf7f5; border-left: 4px solid #1a7a6d; font-size: 12px; }
    .off-balance span, .off-balance strong { color: #1a7a6d; font-weight: 700; }
    .off-balance strong { font-size: 15px; }
    .off-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 4px 0 8px; }
    .off-parties h2 { margin: 0 0 3px; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: #888; font-weight: 700; }
    .off-parties strong { font-size: 12px; }
    .off-items, .off-gst, .off-totals { width: 100%; border-collapse: collapse; }
    .off-items { table-layout: fixed; }
    .off-items thead th { background: #1a7a6d; color: #fff; font-size: 10px; font-weight: 700; padding: 6px 8px; border: 0; text-align: left; }
    .off-items tbody td { border: 0; border-bottom: 1px solid #e6e6e6; padding: 6px 8px; vertical-align: top; }
    .off-items th:nth-child(1), .off-items td:nth-child(1) { width: 8%; }
    .off-items th:nth-child(3), .off-items td:nth-child(3) { width: 14%; }
    .off-items th:nth-child(4), .off-items td:nth-child(4) { width: 18%; }
    .off-items th:nth-child(5), .off-items td:nth-child(5) { width: 18%; }
    .off-item-name { font-weight: 600; overflow-wrap: anywhere; }
    .off-item-desc { margin-top: 2px; font-size: 10px; color: #666; overflow-wrap: anywhere; }
    .off-gst { table-layout: fixed; }
    .off-gst th, .off-gst td { border: 0; border-bottom: 1px solid #eee; padding: 4px 4px; font-size: 10px; }
    .off-gst thead th { background: #f4f8f7; color: #555; font-size: 9px; text-transform: uppercase; text-align: right; }
    .off-c { text-align: center; }
    .off-n { text-align: right; white-space: nowrap; }
    .off-bottom { display: grid; grid-template-columns: 1.3fr 0.7fr; gap: 16px; margin-top: 6px; align-items: start; }
    .off-words { margin: 8px 0 4px; font-size: 10.5px; }
    .off-notes h3, .off-tnc h3 { margin: 6px 0 2px; font-size: 11px; color: #1a7a6d; }
    .off-note { margin: 0; font-size: 10px; color: #444; }
    .off-totals td { border: 0; padding: 3px 0 3px 10px; }
    .off-totals td:first-child { color: #555; }
    .off-grand td { font-weight: 800; font-size: 12px; color: #1a7a6d; border-top: 2px solid #1a7a6d; background: #edf7f5; }
    .off-thanks { margin: 14px 0 10px; font-size: 12px; color: #1a7a6d; }
    .off-sign { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; margin-top: 16px; }
    .off-auth { text-align: right; }
    .off-sign-line { display: inline-block; min-width: 42mm; border-top: 1px solid #ccc; padding-top: 4px; font-size: 10px; color: #555; }
    .off-generated { margin: 16px 0 0; padding-top: 8px; border-top: 1px solid #e6e6e6; text-align: center; font-size: 10.5px; color: #555; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
<article class="office-invoice">
  <header class="off-head">
    <div class="off-seller">
      ${logo ? `<img class="off-logo" src="${escapeHtml(logo)}" alt="" />` : ""}
      <h1 class="off-shop">${escapeHtml(shop)}</h1>
      <div class="off-seller-meta">
        ${[company.address, [company.city, company.state].filter(Boolean).join(", ")].filter(Boolean).map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
        <div>${escapeHtml([company.phone ? `Ph: ${company.phone}` : "", company.email ? `Email: ${company.email}` : "", company.gstin ? `GSTIN: ${company.gstin}` : ""].filter(Boolean).join(" · "))}</div>
      </div>
    </div>
    <div class="off-doc">
      <p class="off-title">QUOTATION</p>
      <p class="off-copy">QUOTATION — NOT A TAX INVOICE</p>
      <table class="off-meta">
        <tr><td>Quotation#</td><td>${escapeHtml(quote?.quotation_number || "")}</td></tr>
        <tr><td>Quotation Date</td><td>${escapeHtml(ymd(quote?.quotation_date))}</td></tr>
        <tr><td>Valid until</td><td>${escapeHtml(ymd(quote?.valid_until) || "—")}</td></tr>
        ${quote?.reference_no ? `<tr><td>Reference</td><td>${escapeHtml(quote.reference_no)}</td></tr>` : ""}
      </table>
      <div class="off-balance"><span>Quoted total</span><strong>${escapeHtml(moneyLabel(quote?.total))}</strong></div>
    </div>
  </header>
  <section class="off-parties">
    <div>
      <h2>Bill To</h2>
      <strong>${escapeHtml(quote?.customer_name || "Customer")}</strong>
      <div class="muted">${escapeHtml([quote?.customer_phone, quote?.customer_email].filter(Boolean).join(" · "))}</div>
      <div>${escapeHtml(quote?.billing_address || "")}</div>
    </div>
    <div>
      <h2>${quote?.shipping_address ? "Ship to" : "Place of supply"}</h2>
      <div>${escapeHtml(quote?.shipping_address || company.address || "—")}</div>
    </div>
  </section>
  <table class="off-items">
    <thead><tr><th class="off-c">#</th><th>Item &amp; Description</th><th class="off-n">Qty</th><th class="off-n">Rate</th><th class="off-n">Amount</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5">No line items</td></tr>`}</tbody>
  </table>
  <div class="off-bottom">
    <div>
      ${gstTable ? `<table class="off-gst"><thead><tr><th>Rate</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Tax</th></tr></thead><tbody>${gstTable}</tbody></table>` : ""}
      <p class="off-words"><strong>Amount in words:</strong> ${escapeHtml(amountWords(quote?.total))}</p>
      ${taxBits.length ? `<p class="off-note">${escapeHtml(taxBits.join(" · "))}</p>` : ""}
      ${quote?.notes ? `<div class="off-notes"><h3>Notes</h3><p class="off-note">${escapeHtml(quote.notes)}</p></div>` : ""}
      ${quote?.terms ? `<div class="off-tnc"><h3>Terms &amp; conditions</h3><p class="off-note">${escapeHtml(quote.terms)}</p></div>` : ""}
    </div>
    <table class="off-totals">
      <tr><td>Subtotal</td><td class="off-n">${escapeHtml(moneyLabel(quote?.subtotal))}</td></tr>
      ${discount ? `<tr><td>Discount</td><td class="off-n">(-) ${escapeHtml(moneyLabel(discount))}</td></tr>` : ""}
      <tr><td>Taxable amount</td><td class="off-n">${escapeHtml(moneyLabel(taxable))}</td></tr>
      ${charges ? `<tr><td>Additional charges</td><td class="off-n">${escapeHtml(moneyLabel(charges))}</td></tr>` : ""}
      <tr><td>Tax</td><td class="off-n">${escapeHtml(moneyLabel(quote?.gst))}</td></tr>
      ${roundOff ? `<tr><td>Round off</td><td class="off-n">${escapeHtml(moneyLabel(roundOff))}</td></tr>` : ""}
      <tr class="off-grand"><td>Quotation total</td><td class="off-n">${escapeHtml(moneyLabel(quote?.total))}</td></tr>
    </table>
  </div>
  <p class="off-thanks">Thanks for your business.</p>
  <footer class="off-sign"><div><span class="off-sign-line">Customer acceptance</span></div><div class="off-auth"><span class="off-sign-line">For ${escapeHtml(shop)}</span></div></footer>
  <p class="off-generated">Page 1. This is a computer-generated quotation. No signature is required. Stock and payment are unchanged until a sales invoice is posted.</p>
</article>
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
