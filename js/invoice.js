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

    const gstRows = breakdown
      .map(
        (b) => `<tr class="inv-gst">
        <td colspan="3">Taxable @ ${b.rate}%</td>
        <td class="inv-num">${escapeHtml(money(b.taxable))}</td>
      </tr>
      <tr class="inv-gst">
        <td colspan="3">Input CGST @ ${b.rate / 2}%</td>
        <td class="inv-num">${escapeHtml(money(b.gst / 2))}</td>
      </tr>
      <tr class="inv-gst">
        <td colspan="3">Input SGST @ ${b.rate / 2}%</td>
        <td class="inv-num">${escapeHtml(money(b.gst / 2))}</td>
      </tr>`,
      )
      .join("");

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
      <tr class="inv-tax"><td colspan="4">GST ${l.gst_rate}% · ${escapeHtml(money(l.gst_amount))}</td></tr>`,
      )
      .join("");

    const gstRows = breakdown
      .map(
        (b) => `<tr class="inv-gst">
        <td colspan="3">Taxable @ ${b.rate}%</td>
        <td class="inv-num">${escapeHtml(money(b.taxable))}</td>
      </tr>
      <tr class="inv-gst">
        <td colspan="3">CGST @ ${b.rate / 2}%</td>
        <td class="inv-num">${escapeHtml(money(b.gst / 2))}</td>
      </tr>
      <tr class="inv-gst">
        <td colspan="3">SGST @ ${b.rate / 2}%</td>
        <td class="inv-num">${escapeHtml(money(b.gst / 2))}</td>
      </tr>`,
      )
      .join("");

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
    <div class="inv-row"><span>Customer</span><span>${escapeHtml(order.customer_name || cust?.name || "Walk-in")}</span></div>
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

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  window.InvoicePrint = {
    invoiceBody,
    thermalInvoiceDocument,
    purchaseBody,
    thermalPurchaseDocument,
    enrichLines,
    enrichPurchaseLines,
    gstBreakdown,
    purchaseGstBreakdown,
  };
})();
