/** Thermal tax-invoice HTML for 80mm POS printers (sales orders = invoices, purchases = bills). */
(function () {
  function num(v) {
    return Number(v) || 0;
  }

  function round2(v) {
    return Math.round(num(v) * 100) / 100;
  }

  function lineGst(l) {
    return round2((num(l.amount) * num(l.gst_rate)) / 100);
  }

  function isCancelled(l) {
    return l.cancelled === 1 || l.cancelled === "1" || l.cancelled === true;
  }

  function enrichLines(order, items) {
    return (order.lines || [])
      .filter((l) => !isCancelled(l))
      .map((l) => {
        const item = (items || []).find((i) => i.id === l.item_id);
        const gstRate = num(l.gst_rate) || num(item?.gst_rate);
        const amount = num(l.amount);
        return {
          item_name: l.item_name || item?.name || "Item",
          hsn: item?.hsn || l.hsn || item?.code || "—",
          quantity_gm: num(l.quantity_gm),
          rate_per_kg: num(l.rate_per_kg),
          unit: lineUnit(item),
          gst_rate: gstRate,
          amount,
          gst_amount: lineGst({ amount, gst_rate: gstRate }),
        };
      });
  }

  function gstApi() {
    if (typeof window !== "undefined" && window.GstSupply) return window.GstSupply;
    if (typeof globalThis !== "undefined" && globalThis.GstSupply) return globalThis.GstSupply;
    return null;
  }

  function gstBreakdown(lines) {
    const map = new Map();
    for (const l of lines) {
      const rate = num(l.gst_rate);
      const cur = map.get(rate) || { rate, taxable: 0, gst: 0 };
      cur.taxable = round2(cur.taxable + num(l.amount));
      cur.gst = round2(cur.gst + num(l.gst_amount));
      map.set(rate, cur);
    }
    return [...map.values()].sort((a, b) => a.rate - b.rate);
  }

  function shopProfile(company) {
    const co = company || {};
    return { gstin: co.gstin, state: co.state };
  }

  function saleInterState(order, ctx) {
    const G = gstApi();
    const cust = findCustomer(ctx.customers, order);
    const party = {
      gstin: cust?.gstin || order.customer_gstin,
      state: cust?.state || order.customer_state,
    };
    return G ? G.isInterStateSupply(shopProfile(ctx.company), party) : false;
  }

  function purchaseInterState(purchase, ctx) {
    const G = gstApi();
    const supplier = findSupplier(ctx.suppliers, purchase);
    const party = {
      gstin: supplier?.gstin || purchase.supplier_gstin,
      state: supplier?.state || purchase.supplier_state,
    };
    return G ? G.isInterStateSupply(shopProfile(ctx.company), party) : false;
  }

  function splitGstTotal(totalGst, interState) {
    const G = gstApi();
    if (G) return G.splitGstAmount(totalGst, interState);
    const half = round2(totalGst / 2);
    return { cgst: half, sgst: round2(totalGst - half), igst: 0 };
  }

  function gstSplitRows(breakdown, interState, money, escapeHtml, labels) {
    const L = labels || { cgst: "CGST", sgst: "SGST", igst: "IGST" };
    return breakdown
      .map((b) => {
        const split = splitGstTotal(b.gst, interState);
        const rows = [`<tr class="inv-gst">
        <td colspan="3">Taxable @ ${b.rate}%</td>
        <td class="inv-num">${escapeHtml(money(b.taxable))}</td>
      </tr>`];
        if (interState) {
          rows.push(`<tr class="inv-gst">
        <td colspan="3">${L.igst} @ ${b.rate}%</td>
        <td class="inv-num">${escapeHtml(money(split.igst))}</td>
      </tr>`);
        } else {
          rows.push(`<tr class="inv-gst">
        <td colspan="3">${L.cgst} @ ${b.rate / 2}%</td>
        <td class="inv-num">${escapeHtml(money(split.cgst))}</td>
      </tr>
      <tr class="inv-gst">
        <td colspan="3">${L.sgst} @ ${b.rate / 2}%</td>
        <td class="inv-num">${escapeHtml(money(split.sgst))}</td>
      </tr>`);
        }
        return rows.join("");
      })
      .join("");
  }

  function officeGstSplitRows(breakdown, interState, money, escapeHtml) {
    return breakdown
      .map((b) => {
        const split = splitGstTotal(b.gst, interState);
        if (interState) {
          return `<tr>
        <td class="off-n">${escapeHtml(String(b.rate))}%</td>
        <td class="off-n">${escapeHtml(money(b.taxable))}</td>
        <td class="off-n">—</td>
        <td class="off-n">—</td>
        <td class="off-n">${escapeHtml(money(split.igst))}</td>
        <td class="off-n">${escapeHtml(money(b.gst))}</td>
      </tr>`;
        }
        return `<tr>
        <td class="off-n">${escapeHtml(String(b.rate))}%</td>
        <td class="off-n">${escapeHtml(money(b.taxable))}</td>
        <td class="off-n">${escapeHtml(money(split.cgst))}</td>
        <td class="off-n">${escapeHtml(money(split.sgst))}</td>
        <td class="off-n">—</td>
        <td class="off-n">${escapeHtml(money(b.gst))}</td>
      </tr>`;
      })
      .join("");
  }

  function findCustomer(customers, order) {
    if (!customers?.length) return null;
    return customers.find((c) => c.id === order.customer_id) || null;
  }

  function unitsApi() {
    if (typeof window !== "undefined" && window.POSUnits) return window.POSUnits;
    if (typeof globalThis !== "undefined" && globalThis.POSUnits) return globalThis.POSUnits;
    return null;
  }

  function formatQty(gm, unit) {
    const U = unitsApi();
    if (U) return U.formatQty(gm, unit);
    const g = num(gm);
    if (g >= 1000) return `${(g / 1000).toFixed(2)} kg`;
    return `${g} g`;
  }

  function rateSuffix(unit) {
    const U = unitsApi();
    if (U) return U.rateSuffix(unit);
    return "/kg";
  }

  function lineUnit(item) {
    const U = unitsApi();
    if (U && item) return U.itemUnit(item);
    return "GM";
  }

  function payLabel(method) {
    return String(method || "cash").toUpperCase();
  }

  function payStatusLabel(status) {
    const s = String(status || "paid").toLowerCase();
    if (s === "partial") return "PARTIAL";
    if (s === "unpaid") return "UNPAID";
    return "PAID";
  }

  function findSupplier(suppliers, purchase) {
    if (!suppliers?.length) return null;
    return suppliers.find((s) => s.id === purchase.supplier_id) || null;
  }

  function enrichPurchaseLines(purchase, items) {
    return (purchase.lines || []).map((l) => {
      const item = (items || []).find((i) => i.id === l.item_id);
      const gstRate = num(l.gst_rate) || num(item?.gst_rate);
      const amount = num(l.amount);
      const gstAmount = num(l.gst_amount) || lineGst({ amount, gst_rate: gstRate });
      return {
        item_name: l.item_name || item?.name || "Item",
        hsn: item?.hsn || item?.code || l.hsn || "—",
        quantity_gm: num(l.quantity_gm),
        rate_per_kg: num(l.rate_per_kg),
        unit: lineUnit(item),
        gst_rate: gstRate,
        amount,
        gst_amount: gstAmount,
      };
    });
  }

  function purchaseGstBreakdown(lines) {
    return gstBreakdown(
      lines.map((l) => ({
        amount: l.amount,
        gst_rate: l.gst_rate,
        gst_amount: l.gst_amount,
      })),
    );
  }

  function purchaseBody(purchase, ctx) {
    const { company, suppliers, items, formatDate, formatDateTime, money, escapeHtml } = ctx;
    const formatWhen = formatDate || formatDateTime;
    const co = company || {};
    const lines = enrichPurchaseLines(purchase, items);
    const supplier = findSupplier(suppliers, purchase);
    const supGstin = String(supplier?.gstin || purchase.supplier_gstin || "").trim();
    const breakdown = purchaseGstBreakdown(lines);
    const subtotal = round2(purchase.subtotal);
    const gst = round2(purchase.gst);
    const total = round2(purchase.total);
    const poNo = escapeHtml(purchase.purchase_number || "—");
    const supInv = escapeHtml(purchase.supplier_invoice_number || "—");
    const when = formatWhen(purchase.purchase_date || purchase.created_at || new Date().toISOString());
    const logo = co.logo_url
      ? `<img class="inv-logo" src="${escapeHtml(co.logo_url)}" alt="">`
      : "";

    const meta = [
      co.phone ? `Ph: ${escapeHtml(co.phone)}` : "",
      co.gstin ? `GSTIN: ${escapeHtml(co.gstin)}` : "",
      co.pan ? `PAN: ${escapeHtml(co.pan)}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    const itemRows = lines
      .map(
        (l, i) => `<tr>
        <td class="inv-item" colspan="4">${i + 1}. ${escapeHtml(l.item_name)}</td>
      </tr>
      <tr class="inv-line">
        <td class="inv-hsn">HSN ${escapeHtml(l.hsn)}</td>
        <td class="inv-num">${escapeHtml(formatQty(l.quantity_gm, l.unit))}</td>
        <td class="inv-num">${escapeHtml(money(l.rate_per_kg))}${escapeHtml(rateSuffix(l.unit))}</td>
        <td class="inv-num">${escapeHtml(money(l.amount))}</td>
      </tr>
      <tr class="inv-tax"><td colspan="4">Input GST ${l.gst_rate}% · ${escapeHtml(money(l.gst_amount))}</td></tr>`,
      )
      .join("");

    const interState = purchaseInterState(purchase, ctx);
    const gstRows = gstSplitRows(breakdown, interState, money, escapeHtml, {
      cgst: "Input CGST",
      sgst: "Input SGST",
      igst: "Input IGST",
    });

    const notes = String(purchase.notes || "").trim();

    return `<article class="thermal-invoice purchase-invoice">
  ${logo}
  <header class="inv-head">
    <h1 class="inv-shop">${escapeHtml(co.name || "Shop")}</h1>
    ${co.address ? `<p class="inv-addr">${escapeHtml(co.address)}</p>` : ""}
    ${meta ? `<p class="inv-meta">${meta}</p>` : ""}
    <p class="inv-title">PURCHASE BILL</p>
  </header>
  <div class="inv-rule"></div>
  <div class="inv-details">
    <div class="inv-row"><span>PO No.</span><strong>${poNo}</strong></div>
    <div class="inv-row"><span>Supplier bill</span><strong>${supInv}</strong></div>
    <div class="inv-row"><span>Date</span><span>${escapeHtml(when)}</span></div>
    <div class="inv-row"><span>Supplier</span><span>${escapeHtml(purchase.supplier_name || supplier?.name || "—")}</span></div>
    ${supplier?.contact_name ? `<div class="inv-row"><span>Contact</span><span>${escapeHtml(supplier.contact_name)}</span></div>` : ""}
    ${supplier?.mobile ? `<div class="inv-row"><span>Mobile</span><span>${escapeHtml(supplier.mobile)}</span></div>` : ""}
    ${supplier?.email ? `<div class="inv-row"><span>Email</span><span>${escapeHtml(supplier.email)}</span></div>` : ""}
    ${supplier?.address ? `<div class="inv-row"><span>Address</span><span>${escapeHtml(supplier.address)}</span></div>` : ""}
    ${supGstin ? `<div class="inv-row"><span>Supplier GSTIN</span><span>${escapeHtml(supGstin)}</span></div>` : ""}
  </div>
  <div class="inv-rule"></div>
  <table class="inv-table">
    <thead>
      <tr>
        <th>HSN / Item</th>
        <th class="inv-num">Qty</th>
        <th class="inv-num">Rate</th>
        <th class="inv-num">Amt</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || '<tr><td colspan="4" class="inv-empty">No line items</td></tr>'}
    </tbody>
  </table>
  <div class="inv-rule"></div>
  <table class="inv-totals">
    <tbody>
      <tr><td colspan="3">Taxable value</td><td class="inv-num">${escapeHtml(money(subtotal))}</td></tr>
      ${gstRows}
      <tr class="inv-gst-total"><td colspan="3">Total input GST</td><td class="inv-num">${escapeHtml(money(gst))}</td></tr>
      <tr class="inv-grand"><td colspan="3"><strong>Grand total</strong></td><td class="inv-num"><strong>${escapeHtml(money(total))}</strong></td></tr>
    </tbody>
  </table>
  <div class="inv-rule"></div>
  <p class="inv-pay">Payment: <strong>${escapeHtml(payLabel(purchase.payment_method))}</strong> · ${escapeHtml(payStatusLabel(purchase.payment_status))}</p>
  ${notes ? `<p class="inv-terms">${escapeHtml(notes)}</p>` : ""}
  <p class="inv-footer">Goods received — stock updated</p>
  <p class="inv-powered">ATAV POS</p>
</article>`;
  }

  function thermalPurchaseDocument(purchase, ctx) {
    const title = escapeHtml(purchase.purchase_number || "Purchase");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>${THERMAL_CSS}
.purchase-invoice .inv-title { letter-spacing: 0.06em; }
</style>
</head>
<body>
${purchaseBody(purchase, ctx)}
<script>window.onload=function(){window.focus();window.print();};<\/script>
</body>
</html>`;
  }

  function invoiceBody(order, ctx) {
    const { company, customers, items, formatDateTime, money, escapeHtml } = ctx;
    const co = company || {};
    const lines = enrichLines(order, items);
    const cust = findCustomer(customers, order);
    const custGstin = String(cust?.gstin || order.customer_gstin || "").trim();
    const breakdown = gstBreakdown(lines);
    const subtotal = round2(order.subtotal);
    const discount = round2(order.discount);
    const gst = round2(order.gst);
    const total = round2(order.total);
    const invNo = escapeHtml(order.order_number || "—");
    const when = formatDateTime(order.created_at || new Date().toISOString());
    const logo = co.logo_url
      ? `<img class="inv-logo" src="${escapeHtml(co.logo_url)}" alt="">`
      : "";

    const meta = [
      co.phone ? `Ph: ${escapeHtml(co.phone)}` : "",
      co.gstin ? `GSTIN: ${escapeHtml(co.gstin)}` : "",
      co.pan ? `PAN: ${escapeHtml(co.pan)}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    const packLine = order.pack_name
      ? `<div class="inv-row"><span>Pack</span><span>${escapeHtml(order.pack_name)} × ${num(order.pack_count) || 1}</span></div>`
      : "";

    const itemRows = lines
      .map(
        (l, i) => `<tr>
        <td class="inv-item" colspan="4">${i + 1}. ${escapeHtml(l.item_name)}</td>
      </tr>
      <tr class="inv-line">
        <td class="inv-hsn">HSN ${escapeHtml(l.hsn)}</td>
        <td class="inv-num">${escapeHtml(formatQty(l.quantity_gm, l.unit))}</td>
        <td class="inv-num">${escapeHtml(money(l.rate_per_kg))}${escapeHtml(rateSuffix(l.unit))}</td>
        <td class="inv-num">${escapeHtml(money(l.amount))}</td>
      </tr>
      <tr class="inv-tax"><td colspan="4">GST ${l.gst_rate}% · ${escapeHtml(money(l.gst_amount))}${Number(l.discount) > 0 ? ` · Disc ${escapeHtml(money(l.discount))}` : ""}</td></tr>`,
      )
      .join("");

    const interState = saleInterState(order, ctx);
    const gstRows = gstSplitRows(breakdown, interState, money, escapeHtml);

    const footer = String(co.invoice_footer || co.footer || "").trim();
    const terms = String(co.invoice_terms || co.terms || "").trim();

    return `<article class="thermal-invoice">
  ${logo}
  <header class="inv-head">
    <h1 class="inv-shop">${escapeHtml(co.name || "Shop")}</h1>
    ${co.address ? `<p class="inv-addr">${escapeHtml(co.address)}</p>` : ""}
    ${meta ? `<p class="inv-meta">${meta}</p>` : ""}
    <p class="inv-title">TAX INVOICE</p>
  </header>
  <div class="inv-rule"></div>
  <div class="inv-details">
    <div class="inv-row"><span>Invoice No.</span><strong>${invNo}</strong></div>
    <div class="inv-row"><span>Date</span><span>${escapeHtml(when)}</span></div>
    <div class="inv-row"><span>Customer</span><span>${escapeHtml(order.customer_name || cust?.business_name || cust?.name || "Walk-in")}</span></div>
    ${custGstin ? `<div class="inv-row"><span>GSTIN</span><span>${escapeHtml(custGstin)}</span></div>` : ""}
    <div class="inv-row"><span>Type</span><span>${escapeHtml(String(order.customer_type || cust?.type || "b2c").toUpperCase())}</span></div>
    ${packLine}
  </div>
  <div class="inv-rule"></div>
  <table class="inv-table">
    <thead>
      <tr>
        <th>HSN / Item</th>
        <th class="inv-num">Qty</th>
        <th class="inv-num">Rate</th>
        <th class="inv-num">Amt</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || '<tr><td colspan="4" class="inv-empty">No line items</td></tr>'}
    </tbody>
  </table>
  <div class="inv-rule"></div>
  <table class="inv-totals">
    <tbody>
      <tr><td colspan="3">Taxable value</td><td class="inv-num">${escapeHtml(money(subtotal))}</td></tr>
      ${discount > 0 ? `<tr><td colspan="3">Discount</td><td class="inv-num">-${escapeHtml(money(discount))}</td></tr>` : ""}
      ${round2(order.loyalty_discount) > 0 ? `<tr><td colspan="3">Royalty</td><td class="inv-num">-${escapeHtml(money(order.loyalty_discount))}</td></tr>` : ""}
      ${gstRows}
      <tr class="inv-gst-total"><td colspan="3">Total GST</td><td class="inv-num">${escapeHtml(money(gst))}</td></tr>
      <tr class="inv-grand"><td colspan="3"><strong>Grand total</strong></td><td class="inv-num"><strong>${escapeHtml(money(total))}</strong></td></tr>
    </tbody>
  </table>
  <div class="inv-rule"></div>
  <p class="inv-pay">Payment: <strong>${escapeHtml(payLabel(order.payment_method))}</strong> · ${escapeHtml(payStatusLabel(order.payment_status))}</p>
  ${footer ? `<p class="inv-footer">${escapeHtml(footer)}</p>` : '<p class="inv-footer">Thank you for your business!</p>'}
  ${terms ? `<p class="inv-terms">${escapeHtml(terms)}</p>` : ""}
  <p class="inv-powered">ATAV POS</p>
</article>`;
  }

  const THERMAL_CSS = `
@page { size: 80mm auto; margin: 2mm; }
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 2mm;
  width: 76mm;
  font-family: "Courier New", Courier, ui-monospace, monospace;
  font-size: 11px;
  line-height: 1.35;
  color: #000;
  background: #fff;
}
.thermal-invoice { width: 100%; }
.inv-logo { display: block; max-height: 52px; max-width: 64mm; margin: 0 auto 6px; }
.inv-head { text-align: center; }
.inv-shop { font-size: 14px; margin: 0 0 4px; font-weight: 700; }
.inv-addr, .inv-meta { margin: 2px 0; font-size: 10px; }
.inv-title { margin: 8px 0 2px; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; }
.inv-rule { border-top: 1px dashed #000; margin: 6px 0; }
.inv-details .inv-row {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  margin: 2px 0;
  font-size: 10px;
}
.inv-table, .inv-totals { width: 100%; border-collapse: collapse; font-size: 10px; }
.inv-table th, .inv-table td, .inv-totals td { padding: 2px 0; vertical-align: top; }
.inv-table th { border-bottom: 1px solid #000; text-align: left; font-size: 9px; }
.inv-num { text-align: right; white-space: nowrap; }
.inv-item { font-weight: 700; padding-top: 4px; }
.inv-line td { padding-bottom: 0; }
.inv-hsn { font-size: 9px; }
.inv-tax td { font-size: 9px; color: #333; padding-bottom: 3px; }
.inv-gst td { font-size: 9px; }
.inv-gst-total td { border-top: 1px dashed #000; padding-top: 4px; }
.inv-grand td { font-size: 12px; padding-top: 4px; }
.inv-pay { text-align: center; margin: 6px 0; font-size: 11px; }
.inv-footer, .inv-terms { text-align: center; font-size: 9px; margin: 4px 0; }
.inv-powered { text-align: center; font-size: 8px; margin-top: 8px; color: #444; }
.inv-empty { text-align: center; padding: 8px 0; }
@media screen {
  body { width: 320px; margin: 12px auto; border: 1px dashed #999; }
}
`;

  function thermalInvoiceDocument(order, ctx) {
    const title = escapeHtml(order.order_number || "Invoice");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>${THERMAL_CSS}</style>
</head>
<body>
${invoiceBody(order, ctx)}
<script>window.onload=function(){window.focus();window.print();};<\/script>
</body>
</html>`;
  }

  function amountInWords(value) {
    const ones = [
      "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
      "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
    ];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    function two(n) {
      n = Math.floor(Math.abs(n));
      if (n < 20) return ones[n];
      const t = Math.floor(n / 10);
      const o = n % 10;
      return (tens[t] + (o ? " " + ones[o] : "")).trim();
    }
    function three(n) {
      n = Math.floor(Math.abs(n));
      if (n < 100) return two(n);
      const h = Math.floor(n / 100);
      const r = n % 100;
      return (ones[h] + " Hundred" + (r ? " " + two(r) : "")).trim();
    }
    const num = round2(value);
    const rupees = Math.floor(num);
    const paise = Math.round((num - rupees) * 100);
    if (rupees === 0 && paise === 0) return "Rupees Zero Only";
    let n = rupees;
    const crore = Math.floor(n / 10000000);
    n %= 10000000;
    const lakh = Math.floor(n / 100000);
    n %= 100000;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    const parts = [];
    if (crore) parts.push(two(crore) + " Crore");
    if (lakh) parts.push(two(lakh) + " Lakh");
    if (thousand) parts.push(two(thousand) + " Thousand");
    if (n) parts.push(three(n));
    let out = "Rupees " + (parts.join(" ") || "Zero");
    if (paise) out += " and " + two(paise) + " Paise";
    return out + " Only";
  }

  function officeCopyLabel(copy) {
    return copy === "duplicate" ? "Duplicate for Supplier" : "Original for Recipient";
  }

  function officeInvoiceBody(order, ctx, opts) {
    const { company, customers, items, formatDateTime, money, escapeHtml } = ctx;
    const co = company || {};
    const lines = enrichLines(order, items);
    const cust = findCustomer(customers, order);
    const custGstin = String(cust?.gstin || order.customer_gstin || "").trim();
    const breakdown = gstBreakdown(lines);
    const subtotal = round2(order.subtotal);
    const discount = round2(order.discount);
    const gst = round2(order.gst);
    const total = round2(order.total);
    const invNo = escapeHtml(order.order_number || "—");
    const when = formatDateTime(order.created_at || new Date().toISOString());
    const logo = co.logo_url
      ? `<img class="off-logo" src="${escapeHtml(co.logo_url)}" alt="">`
      : "";
    const place = [co.city, co.state, co.pincode || co.pin_code].filter(Boolean).join(", ");
    const shopLines = [
      co.address,
      place,
      [co.phone ? `Ph: ${co.phone}` : "", co.email ? `Email: ${co.email}` : ""].filter(Boolean).join(" · "),
      [co.gstin ? `GSTIN: ${co.gstin}` : "", co.pan ? `PAN: ${co.pan}` : ""].filter(Boolean).join(" · "),
    ]
      .filter(Boolean)
      .map((t) => `<div>${escapeHtml(t)}</div>`)
      .join("");
    const buyerName = order.customer_name || cust?.business_name || cust?.name || "Walk-in";
    const buyerBits = [
      cust?.business_name && cust?.name && cust.business_name !== cust.name ? cust.name : "",
      cust?.mobile || order.customer_mobile || "",
      custGstin ? `GSTIN: ${custGstin}` : "",
      String(order.customer_type || cust?.type || "b2c").toUpperCase(),
    ]
      .filter(Boolean)
      .map((t) => `<div>${escapeHtml(t)}</div>`)
      .join("");

    const itemRows = lines
      .map((l, i) => {
        const lineTotal = round2(num(l.amount) + num(l.gst_amount));
        return `<tr>
        <td class="off-c">${i + 1}</td>
        <td>${escapeHtml(l.item_name)}</td>
        <td>${escapeHtml(l.hsn)}</td>
        <td class="off-n">${escapeHtml(formatQty(l.quantity_gm, l.unit))}</td>
        <td class="off-n">${escapeHtml(money(l.rate_per_kg))}${escapeHtml(rateSuffix(l.unit))}</td>
        <td class="off-n">${escapeHtml(money(l.amount))}</td>
        <td class="off-n">${escapeHtml(String(l.gst_rate))}%</td>
        <td class="off-n">${escapeHtml(money(l.gst_amount))}</td>
        <td class="off-n">${escapeHtml(money(lineTotal))}</td>
      </tr>`;
      })
      .join("");

    const interState = saleInterState(order, ctx);
    const gstRows = officeGstSplitRows(breakdown, interState, money, escapeHtml);

    const footer = String(co.invoice_footer || co.footer || "").trim();
    const terms = String(co.invoice_terms || co.terms || "").trim();
    const packLine = order.pack_name
      ? `<div class="off-kv"><span>Pack</span><strong>${escapeHtml(order.pack_name)} × ${num(order.pack_count) || 1}</strong></div>`
      : "";

    return `<article class="office-invoice">
  <header class="off-head">
    <div class="off-seller">
      ${logo}
      <h1 class="off-shop">${escapeHtml(co.name || "Shop")}</h1>
      <div class="off-seller-meta">${shopLines}</div>
    </div>
    <div class="off-doc">
      <p class="off-title">TAX INVOICE</p>
      <p class="off-copy">${escapeHtml(officeCopyLabel(opts?.copy))}</p>
      <div class="off-kv"><span>Invoice No.</span><strong>${invNo}</strong></div>
      <div class="off-kv"><span>Date</span><span>${escapeHtml(when)}</span></div>
      <div class="off-kv"><span>Payment</span><span>${escapeHtml(payLabel(order.payment_method))} · ${escapeHtml(payStatusLabel(order.payment_status))}</span></div>
      ${packLine}
    </div>
  </header>
  <section class="off-parties">
    <div>
      <h2>Bill to</h2>
      <strong>${escapeHtml(buyerName)}</strong>
      ${buyerBits}
    </div>
    <div>
      <h2>Place of supply</h2>
      <div>${escapeHtml(place || co.address || "—")}</div>
    </div>
  </section>
  <table class="off-items">
    <thead>
      <tr>
        <th class="off-c">#</th>
        <th>Item</th>
        <th>HSN</th>
        <th class="off-n">Qty</th>
        <th class="off-n">Rate</th>
        <th class="off-n">Taxable</th>
        <th class="off-n">GST %</th>
        <th class="off-n">GST</th>
        <th class="off-n">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || '<tr><td colspan="9" class="off-empty">No line items</td></tr>'}
    </tbody>
  </table>
  <div class="off-bottom">
    <div class="off-gst-wrap">
      <table class="off-gst">
        <thead>
          <tr>
            <th class="off-n">Rate</th>
            <th class="off-n">Taxable</th>
            <th class="off-n">CGST</th>
            <th class="off-n">SGST</th>
            <th class="off-n">IGST</th>
            <th class="off-n">Tax</th>
          </tr>
        </thead>
        <tbody>
          ${gstRows || '<tr><td colspan="6" class="off-empty">—</td></tr>'}
        </tbody>
      </table>
      <p class="off-words"><strong>Amount in words:</strong> ${escapeHtml(amountInWords(total))}</p>
      ${footer ? `<p class="off-note">${escapeHtml(footer)}</p>` : ""}
      ${terms ? `<p class="off-note"><strong>Terms:</strong> ${escapeHtml(terms)}</p>` : ""}
    </div>
    <table class="off-totals">
      <tbody>
        <tr><td>Taxable value</td><td class="off-n">${escapeHtml(money(subtotal))}</td></tr>
        ${discount > 0 ? `<tr><td>Discount</td><td class="off-n">-${escapeHtml(money(discount))}</td></tr>` : ""}
        ${round2(order.loyalty_discount) > 0 ? `<tr><td>Royalty</td><td class="off-n">-${escapeHtml(money(order.loyalty_discount))}</td></tr>` : ""}
        <tr><td>Total GST</td><td class="off-n">${escapeHtml(money(gst))}</td></tr>
        <tr class="off-grand"><td>Grand total</td><td class="off-n">${escapeHtml(money(total))}</td></tr>
      </tbody>
    </table>
  </div>
  <footer class="off-sign">
    <div>Customer signature</div>
    <div>For ${escapeHtml(co.name || "Shop")}<br><span>Authorised signatory</span></div>
  </footer>
</article>`;
  }

  const OFFICE_CSS = `
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 0;
  color: #111;
  background: #fff;
  font-family: "Segoe UI", Calibri, Arial, sans-serif;
  font-size: 12px;
  line-height: 1.4;
}
.office-invoice { width: 100%; color: #111; }
.off-head { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111; padding-bottom: 12px; }
.off-logo { max-height: 56px; max-width: 180px; display: block; margin-bottom: 8px; }
.off-shop { margin: 0 0 6px; font-size: 20px; letter-spacing: -0.02em; }
.off-seller-meta { font-size: 11px; color: #333; }
.off-doc { min-width: 220px; text-align: right; }
.off-title { margin: 0; font-size: 18px; font-weight: 800; letter-spacing: 0.08em; }
.off-copy { margin: 2px 0 10px; font-size: 11px; color: #555; }
.off-kv { display: flex; justify-content: flex-end; gap: 12px; font-size: 12px; }
.off-kv span:first-child { color: #555; }
.off-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 12px 0; border-bottom: 1px solid #bbb; }
.off-parties h2 { margin: 0 0 4px; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #555; }
.off-items, .off-gst, .off-totals { width: 100%; border-collapse: collapse; }
.off-items th, .off-items td, .off-gst th, .off-gst td, .off-totals td {
  border: 1px solid #222;
  padding: 6px 7px;
  vertical-align: top;
}
.off-items thead th, .off-gst thead th { background: #f3f3f3; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; }
.off-c { text-align: center; width: 28px; }
.off-n { text-align: right; white-space: nowrap; }
.off-empty { text-align: center; color: #666; }
.off-bottom { display: grid; grid-template-columns: 1.4fr 0.8fr; gap: 16px; margin-top: 12px; align-items: start; }
.off-words { margin: 12px 0 6px; font-size: 12px; }
.off-note { margin: 4px 0; font-size: 11px; color: #333; }
.off-grand td { font-weight: 800; font-size: 14px; background: #f3f3f3; }
.off-sign { display: flex; justify-content: space-between; gap: 24px; margin-top: 28px; }
.off-sign > div { min-width: 180px; border-top: 1px solid #111; padding-top: 6px; font-size: 11px; }
@media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
`;

  function officeInvoiceDocument(order, ctx, opts) {
    const title = escapeHtml(order.order_number || "Invoice");
    const copy = opts?.copy === "duplicate" ? "duplicate" : "original";
    const copyTitle = copy === "duplicate" ? "Duplicate" : "Original";
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Tax invoice ${title} (${copyTitle})</title>
  <style>${OFFICE_CSS}</style>
</head>
<body>
${officeInvoiceBody(order, ctx, { copy })}
<script>window.onload=function(){window.focus();window.print();};<\/script>
</body>
</html>`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function voucherTitle(entryType) {
    return String(entryType).toLowerCase() === "payment" ? "PAYMENT VOUCHER" : "RECEIPT VOUCHER";
  }

  function voucherBody(entry, ctx) {
    const { company, formatDateTime, money, escapeHtml } = ctx;
    const co = company || {};
    const isPayment = String(entry.entry_type).toLowerCase() === "payment";
    const when = formatDateTime(entry.created_at || new Date().toISOString());
    const meta = [co.phone ? `Ph: ${escapeHtml(co.phone)}` : "", co.gstin ? `GSTIN: ${escapeHtml(co.gstin)}` : ""]
      .filter(Boolean)
      .join(" · ");
    const amount = round2(entry.amount);
    const reference = String(entry.reference_type || "").trim();
    return `<article class="thermal-invoice">
  <header class="inv-head">
    <h1 class="inv-shop">${escapeHtml(co.name || "Shop")}</h1>
    ${co.address ? `<p class="inv-addr">${escapeHtml(co.address)}</p>` : ""}
    ${meta ? `<p class="inv-meta">${meta}</p>` : ""}
    <p class="inv-title">${voucherTitle(entry.entry_type)}</p>
  </header>
  <div class="inv-rule"></div>
  <div class="inv-details">
    <div class="inv-row"><span>Voucher No.</span><strong>${escapeHtml(entry.entry_no || "—")}</strong></div>
    <div class="inv-row"><span>Date</span><span>${escapeHtml(when)}</span></div>
    <div class="inv-row"><span>${isPayment ? "Paid to" : "Received from"}</span><span>${escapeHtml(entry.party_name || "—")}</span></div>
    <div class="inv-row"><span>Mode</span><span>${escapeHtml(String(entry.payment_method || "cash").toUpperCase())}</span></div>
    ${reference && reference !== "manual" ? `<div class="inv-row"><span>Reference</span><span>${escapeHtml(reference.replace(/_/g, " "))}</span></div>` : ""}
    ${entry.notes ? `<div class="inv-row"><span>Notes</span><span>${escapeHtml(entry.notes)}</span></div>` : ""}
  </div>
  <div class="inv-rule"></div>
  <table class="inv-totals">
    <tbody>
      <tr class="inv-grand"><td><strong>Amount</strong></td><td class="inv-num"><strong>${escapeHtml(money(amount))}</strong></td></tr>
    </tbody>
  </table>
  <p class="inv-pay">In words: ${escapeHtml(amountInWords(amount))}</p>
  <div class="inv-rule"></div>
  <p class="inv-footer">${isPayment ? "Payment recorded. Thank you." : "Received with thanks."}</p>
  <p class="inv-powered">ATAV POS</p>
</article>`;
  }

  function voucherDocument(entry, ctx) {
    const title = escapeHtml(entry.entry_no || (String(entry.entry_type).toLowerCase() === "payment" ? "Payment" : "Receipt"));
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>${THERMAL_CSS}</style>
</head>
<body>
${voucherBody(entry, ctx)}
<script>window.onload=function(){window.focus();window.print();};<\/script>
</body>
</html>`;
  }

  window.InvoicePrint = {
    invoiceBody,
    thermalInvoiceDocument,
    officeCopyLabel,
    officeInvoiceBody,
    officeInvoiceDocument,
    amountInWords,
    purchaseBody,
    thermalPurchaseDocument,
    voucherBody,
    voucherDocument,
    enrichLines,
    enrichPurchaseLines,
    gstBreakdown,
    purchaseGstBreakdown,
  };
})();
