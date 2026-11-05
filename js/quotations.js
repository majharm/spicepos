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
    if (row?.order_id || row?.order_number) return false;
    const status = effectiveStatus(row, today);
    return status === "draft" || status === "sent" || status === "accepted" || status === "rejected" || status === "expired";
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

  function isoDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    return ymd(value);
  }

  function displayDate(value) {
    const iso = isoDate(value);
    if (!iso) return "—";
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const [year, month, day] = iso.split("-");
    return `${day} ${months[Number(month) - 1] || ""} ${year}`.trim();
  }

  function httpUrl(value) {
    const url = String(value || "").trim();
    if (!/^https?:\/\//i.test(url)) return "";
    return url.replace(/[\s"'<>]/g, "");
  }

  function emailLogo(value) {
    const src = String(value || "").trim();
    if (/^https?:\/\//i.test(src)) return httpUrl(src);
    if (/^data:image\/(png|jpe?g|webp);base64,/i.test(src) && src.length <= 120000) return src;
    return "";
  }

  function qtyText(line) {
    const unit = String(line?.unit || "").toUpperCase();
    const measured = line?.isCount === false || unit === "GM" || unit === "G" || unit === "KG";
    const qtyNum = num(line?.quantity);
    if (measured && (unit === "GM" || unit === "G" || unit === "") && qtyNum >= 1000) return `${(qtyNum / 1000).toFixed(2)} kg`;
    if (measured && unit === "KG") return `${qtyNum.toFixed(2)} kg`;
    return `${line?.quantity ?? ""} ${line?.unit || ""}`.trim();
  }

  function customerView(quote) {
    const lines = (Array.isArray(quote?.lines) ? quote.lines : []).map((line) => ({
      name: line.name || line.item_name || "Item",
      description: line.description || "",
      sku: line.sku || "",
      size: line.size || "",
      color: line.color || "",
      hsn: line.hsn || "",
      quantity: line.quantity,
      unit: line.unit || "",
      isCount: line.isCount !== false,
      rate: line.rate,
      gstRate: line.gstRate ?? line.gst_rate ?? 0,
      taxable: line.taxable,
      gst: line.gst,
      total: line.total,
    }));
    return {
      id: quote?.id || "",
      quotation_number: quote?.quotation_number || "",
      status: quote?.status || "",
      quotation_date: isoDate(quote?.quotation_date),
      valid_until: isoDate(quote?.valid_until),
      reference_no: quote?.reference_no || "",
      customer_name: quote?.customer_name || "",
      customer_phone: quote?.customer_phone || "",
      customer_email: quote?.customer_email || "",
      billing_address: quote?.billing_address || "",
      shipping_address: quote?.shipping_address || "",
      notes: quote?.notes || "",
      terms: quote?.terms || "",
      subtotal: num(quote?.subtotal),
      discount: num(quote?.discount),
      extra_charges: num(quote?.extra_charges ?? quote?.extraCharges),
      taxable: num(quote?.taxable ?? Math.max(0, num(quote?.subtotal) - num(quote?.discount))),
      gst: num(quote?.gst),
      cgst: num(quote?.cgst),
      sgst: num(quote?.sgst),
      igst: num(quote?.igst),
      round_off: num(quote?.round_off ?? quote?.roundOff),
      total: num(quote?.total),
      lines,
    };
  }

  function emailText(quote, company = {}, links = {}) {
    const shop = company.name || "Shop";
    const number = quote?.quotation_number || "Quotation";
    const lines = Array.isArray(quote?.lines) ? quote.lines : [];
    const shown = lines.slice(0, 8);
    const taxable = num(quote?.taxable ?? Math.max(0, num(quote?.subtotal) - num(quote?.discount)));
    const itemLines = shown.map((line) => {
      const name = line.name || line.item_name || "Item";
      return `- ${name} | ${qtyText(line)} | ${moneyLabel(line.rate)} | ${moneyLabel(line.taxable ?? line.total)}`;
    });
    if (lines.length > shown.length) itemLines.push(`- ${lines.length - shown.length} more item(s) are in the attached PDF.`);
    const blocks = [
      `Quotation ${number} from ${shop}`,
      "This quotation is not a tax invoice.",
      "",
      `Customer: ${quote?.customer_name || "Customer"}`,
      [quote?.customer_phone, quote?.customer_email].filter(Boolean).join(" · "),
      quote?.billing_address || "",
      `Quotation date: ${displayDate(quote?.quotation_date)}`,
      `Valid until: ${displayDate(quote?.valid_until)}`,
      "",
      "Items",
      ...itemLines,
      "",
      `Subtotal: ${moneyLabel(quote?.subtotal)}`,
      num(quote?.discount) > 0.009 ? `Discount: ${moneyLabel(quote.discount)}` : "",
      `Taxable amount: ${moneyLabel(taxable)}`,
      num(quote?.extra_charges ?? quote?.extraCharges) > 0.009 ? `Additional charges: ${moneyLabel(quote.extra_charges ?? quote.extraCharges)}` : "",
      `GST: ${moneyLabel(quote?.gst)}`,
      `Grand total: ${moneyLabel(quote?.total)}`,
      "",
      `Payment terms: ${String(quote?.terms || "").trim() || "As agreed with the customer."}`,
      quote?.notes ? `Notes: ${quote.notes}` : "",
      "",
      links.viewUrl ? `View quotation: ${links.viewUrl}` : "",
      links.pdfUrl ? `Download PDF: ${links.pdfUrl}` : "",
      "The quotation PDF is attached.",
      "",
      [shop, company.address, [company.city, company.state].filter(Boolean).join(", "), company.phone ? `Ph: ${company.phone}` : "", company.email || "", company.gstin ? `GSTIN: ${company.gstin}` : ""].filter(Boolean).join("\n"),
    ];
    return blocks.filter((line) => line !== null && line !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function emailHtml(quote, company = {}, links = {}) {
    const shop = company.name || "Shop";
    const number = quote?.quotation_number || "Quotation";
    const lines = Array.isArray(quote?.lines) ? quote.lines : [];
    const shown = lines.slice(0, 8);
    const logo = emailLogo(company.logo_url || company.logoUrl);
    const viewUrl = httpUrl(links.viewUrl);
    const pdfUrl = httpUrl(links.pdfUrl);
    const taxable = num(quote?.taxable ?? Math.max(0, num(quote?.subtotal) - num(quote?.discount)));
    const discount = num(quote?.discount);
    const charges = num(quote?.extra_charges ?? quote?.extraCharges);
    const roundOff = num(quote?.round_off ?? quote?.roundOff);
    const gst = num(quote?.gst);
    const cgst = num(quote?.cgst);
    const sgst = num(quote?.sgst);
    const igst = num(quote?.igst);
    const terms = String(quote?.terms || "").trim() || "As agreed with the customer.";
    const customerBits = [quote?.customer_phone, quote?.customer_email, quote?.billing_address].filter(Boolean);
    const font = "Arial, Helvetica, sans-serif";
    const itemRows = shown.map((line) => {
      const name = line.name || line.item_name || "Item";
      const extra = [line.sku, line.description, line.gstRate ? `GST ${line.gstRate}%` : ""].filter(Boolean).join(" · ");
      return `<tr>
        <td style="padding:10px 8px;border-bottom:1px solid #e6eeec;font-family:${font};font-size:13px;color:#212121;line-height:1.4;">
          <strong>${escapeHtml(name)}</strong>${extra ? `<br><span style="color:#66716f;font-size:12px;">${escapeHtml(extra)}</span>` : ""}
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #e6eeec;font-family:${font};font-size:13px;color:#212121;text-align:right;white-space:nowrap;">${escapeHtml(qtyText(line))}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e6eeec;font-family:${font};font-size:13px;color:#212121;text-align:right;white-space:nowrap;">${escapeHtml(moneyLabel(line.rate))}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e6eeec;font-family:${font};font-size:13px;color:#212121;text-align:right;white-space:nowrap;">${escapeHtml(moneyLabel(line.taxable ?? line.total))}</td>
      </tr>`;
    }).join("");
    const more = lines.length > shown.length
      ? `<tr><td colspan="4" style="padding:10px 8px;font-family:${font};font-size:12px;color:#66716f;">${lines.length - shown.length} more item(s) are listed in the attached PDF.</td></tr>`
      : "";
    const taxNote = [
      cgst > 0.009 ? `CGST ${moneyLabel(quote.cgst)}` : "",
      sgst > 0.009 ? `SGST ${moneyLabel(quote.sgst)}` : "",
      igst > 0.009 ? `IGST ${moneyLabel(quote.igst)}` : "",
    ].filter(Boolean).join(" · ");
    const totalRow = (label, value, extra) => `<tr>
      <td style="padding:4px 0;font-family:${font};font-size:13px;color:#3d4a48;">${label}</td>
      <td style="padding:4px 0;font-family:${font};font-size:13px;color:#212121;text-align:right;">${escapeHtml(value)}</td>
    </tr>${extra || ""}`;
    const buttons = viewUrl || pdfUrl ? `<tr><td style="padding:8px 28px 22px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          ${viewUrl ? `<td bgcolor="#1a7a6d" style="background:#1a7a6d;border-radius:4px;"><a href="${escapeHtml(viewUrl)}" style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-family:${font};font-size:14px;font-weight:bold;">View Quotation</a></td>` : ""}
          ${viewUrl && pdfUrl ? `<td width="10" style="width:10px;font-size:0;line-height:0;">&nbsp;</td>` : ""}
          ${pdfUrl ? `<td style="border:1px solid #1a7a6d;border-radius:4px;"><a href="${escapeHtml(pdfUrl)}" style="display:inline-block;padding:11px 18px;color:#1a7a6d;text-decoration:none;font-family:${font};font-size:14px;font-weight:bold;">Download PDF</a></td>` : ""}
        </tr>
      </table>
    </td></tr>` : "";
    const contact = [company.address, [company.city, company.state].filter(Boolean).join(", "), company.phone ? `Ph: ${company.phone}` : "", company.email || "", company.gstin ? `GSTIN: ${company.gstin}` : ""].filter(Boolean);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(number)}</title>
</head>
<body style="margin:0;padding:0;background:#eef3f2;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Quotation ${escapeHtml(number)} for ${escapeHtml(quote?.customer_name || "Customer")}. Total ${escapeHtml(moneyLabel(quote?.total))}. Valid until ${escapeHtml(displayDate(quote?.valid_until))}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef3f2;margin:0;padding:0;">
<tr><td align="center" style="padding:24px 8px;">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #d7e6e3;">
<tr><td style="background:#1a7a6d;padding:22px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td valign="middle" style="font-family:${font};color:#ffffff;">
${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(shop)}" width="150" style="display:block;border:0;outline:none;text-decoration:none;max-width:150px;height:auto;margin:0 0 8px;">` : ""}
<div style="font-size:20px;font-weight:bold;line-height:1.2;">${escapeHtml(shop)}</div>
<div style="font-size:12px;line-height:1.4;color:#d7f3ee;padding-top:4px;">Quotation notification</div>
</td>
<td valign="middle" align="right" style="font-family:${font};color:#ffffff;text-align:right;">
<div style="font-size:12px;letter-spacing:1px;">QUOTATION</div>
<div style="font-size:18px;font-weight:bold;padding-top:4px;">${escapeHtml(number)}</div>
</td>
</tr>
</table>
</td></tr>
<tr><td style="padding:22px 28px 8px;font-family:${font};font-size:14px;line-height:1.5;color:#212121;">
A quotation is ready for <strong>${escapeHtml(quote?.customer_name || "Customer")}</strong>. This document is a quotation, not a tax invoice. The PDF copy is attached.
</td></tr>
<tr><td style="padding:8px 28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4faf8;border:1px solid #d7e6e3;">
<tr>
<td width="50%" valign="top" style="padding:12px 14px;font-family:${font};font-size:13px;line-height:1.45;color:#212121;">
<div style="font-size:11px;letter-spacing:0.5px;color:#1a7a6d;font-weight:bold;">CUSTOMER</div>
<strong>${escapeHtml(quote?.customer_name || "Customer")}</strong>
${customerBits.map((bit) => `<div style="color:#3d4a48;">${escapeHtml(bit)}</div>`).join("")}
</td>
<td width="50%" valign="top" style="padding:12px 14px;font-family:${font};font-size:13px;line-height:1.45;color:#212121;">
<div style="font-size:11px;letter-spacing:0.5px;color:#1a7a6d;font-weight:bold;">QUOTATION</div>
<div>Date: ${escapeHtml(displayDate(quote?.quotation_date))}</div>
<div>Valid until: ${escapeHtml(displayDate(quote?.valid_until))}</div>
${quote?.reference_no ? `<div>Reference: ${escapeHtml(quote.reference_no)}</div>` : ""}
</td>
</tr>
</table>
</td></tr>
<tr><td style="padding:0 28px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="padding:8px;background:#1a7a6d;color:#ffffff;font-family:${font};font-size:12px;font-weight:bold;">Item</td>
<td align="right" style="padding:8px;background:#1a7a6d;color:#ffffff;font-family:${font};font-size:12px;font-weight:bold;">Qty</td>
<td align="right" style="padding:8px;background:#1a7a6d;color:#ffffff;font-family:${font};font-size:12px;font-weight:bold;">Rate</td>
<td align="right" style="padding:8px;background:#1a7a6d;color:#ffffff;font-family:${font};font-size:12px;font-weight:bold;">Amount</td>
</tr>
${itemRows || `<tr><td colspan="4" style="padding:10px 8px;font-family:${font};font-size:13px;color:#66716f;">No line items</td></tr>`}
${more}
</table>
</td></tr>
<tr><td align="right" style="padding:8px 28px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="280" style="width:280px;max-width:100%;">
${totalRow("Subtotal", moneyLabel(quote?.subtotal))}
${discount > 0.009 ? totalRow("Discount", moneyLabel(discount)) : ""}
${totalRow("Taxable amount", moneyLabel(taxable))}
${charges > 0.009 ? totalRow("Additional charges", moneyLabel(charges)) : ""}
${totalRow(igst > 0.009 && !(cgst > 0.009) ? "IGST" : "GST", moneyLabel(gst))}
${Math.abs(roundOff) > 0.009 ? totalRow("Round off", moneyLabel(roundOff)) : ""}
</table>
</td></tr>
<tr><td style="padding:0 28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td bgcolor="#1a7a6d" style="background:#1a7a6d;padding:14px 16px;font-family:${font};color:#ffffff;">
<div style="font-size:12px;letter-spacing:0.4px;">GRAND TOTAL</div>
<div style="font-size:22px;font-weight:bold;line-height:1.2;padding-top:2px;">${escapeHtml(moneyLabel(quote?.total))}</div>
${taxNote ? `<div style="font-size:12px;color:#d7f3ee;padding-top:4px;">${escapeHtml(taxNote)}</div>` : ""}
</td>
</tr>
</table>
</td></tr>
${buttons}
<tr><td style="padding:0 28px 18px;font-family:${font};font-size:13px;line-height:1.5;color:#212121;">
<div style="font-size:11px;letter-spacing:0.5px;color:#1a7a6d;font-weight:bold;padding-bottom:4px;">VALIDITY AND PAYMENT TERMS</div>
<div>This quotation is valid until ${escapeHtml(displayDate(quote?.valid_until))}.</div>
<div style="padding-top:4px;">${escapeHtml(terms)}</div>
${quote?.notes ? `<div style="padding-top:8px;color:#3d4a48;">${escapeHtml(quote.notes)}</div>` : ""}
</td></tr>
<tr><td style="padding:16px 28px 22px;background:#f7fbfa;border-top:1px solid #d7e6e3;font-family:${font};font-size:12px;line-height:1.5;color:#3d4a48;">
<strong style="color:#1a7a6d;font-size:13px;">${escapeHtml(shop)}</strong>
${contact.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
<div style="padding-top:8px;">This is a computer-generated quotation, not a tax invoice. Stock and payment stay unchanged until a sales invoice is posted.</div>
</td></tr>
</table>
</td></tr>
</table>
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
    emailHtml,
    emailText,
    customerView,
    whatsAppText,
    summarize,
    printHtml,
    amountWords,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
