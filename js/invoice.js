/** Thermal tax-invoice HTML for 80mm POS printers (sales orders = invoices, purchases = bills). */
(function () {
  function num(v) {
    return Number(v) || 0;
  }

  function companyLicenceBits(co, esc) {
    const e = typeof esc === "function" ? esc : (v) => String(v ?? "");
    const t = (v) => String(v || "").trim();
    return [
      t(co?.drug_licence_no) ? `Drug Lic.: ${e(t(co.drug_licence_no))}` : "",
      t(co?.fssai_licence_no) ? `FSSAI: ${e(t(co.fssai_licence_no))}` : "",
      t(co?.ndps_licence_no) ? `NDPS: ${e(t(co.ndps_licence_no))}` : "",
    ].filter(Boolean);
  }

  function isPlaceholderDate(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return true;
    if (/^0{4}-0{2}-0{2}/.test(s)) return true;
    const y = Number(s.slice(0, 4));
    return /^\d{4}/.test(s) && Number.isFinite(y) && y < 1990;
  }

  function meaningfulField(raw) {
    const s = String(raw ?? "").trim();
    return Boolean(s) && s !== "—" && s !== "-" && !/^n\/?a$/i.test(s);
  }

  function formatExpiryShort(raw) {
    if (isPlaceholderDate(raw)) return "";
    const s = String(raw || "").slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})/);
    if (!m) return s;
    const month = Number(m[2]);
    if (month < 1 || month > 12) return "";
    return `${m[2]}/${m[1].slice(2)}`;
  }

  function medicinePackLabel(item) {
    if (globalThis.POSFootwear?.medicinePackLabel) return globalThis.POSFootwear.medicinePackLabel(item);
    const size = String(item?.pack_size || "").trim();
    const unit = String(item?.pack_unit || "").trim();
    const upp = Number(item?.units_per_pack) || 0;
    if (size && unit) return `${size} ${unit}`.trim();
    if (size) return size;
    if (upp > 0) return `${upp}s`;
    return "";
  }

  function isPrintBill(order, ctx) {
    const biz = ctx?.businessMeta || {};
    if (globalThis.POSPrint?.isPrintShop?.(biz) || globalThis.POSFootwear?.isPrintShop?.(biz) || globalThis.POSFootwear?.shopKind?.(biz) === "printing") {
      return true;
    }
    const t = [biz.category, biz.business_type, biz.name, ctx?.company?.name].filter(Boolean).join(" ").toLowerCase();
    if (/(flex\s*&\s*printing|flex printing|printing business)/.test(t)) return true;
    return (order?.lines || []).some((l) => {
      const unit = String(l.unit || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (["SQFT", "SQM", "SQYD", "SQIN", "SQCM", "SQMM"].includes(unit)) return true;
      return /flex\s*print|hoarding|sunboard|vinyl banner/i.test(String(l.item_name || l.name || ""));
    });
  }

  function isPharmacyBill(order, ctx) {
    if (isPrintBill(order, ctx)) return false;
    const biz = ctx?.businessMeta || {};
    if (globalThis.POSFootwear?.isPharmacyShop?.(biz) || globalThis.POSFootwear?.shopKind?.(biz) === "pharmacy") {
      return true;
    }
    const t = [biz.category, biz.business_type, biz.name, ctx?.company?.name].filter(Boolean).join(" ").toLowerCase();
    if (/(pharmacy|chemist|medical)/.test(t) && !/(spice|kirana|grocery|masala|restaurant|cafe)/.test(t)) return true;
    if (String(order?.doctor_rx || "").trim()) return true;
    return (order?.lines || []).some((l) => {
      const batch = meaningfulField(l.batch_no);
      const exp = meaningfulField(l.expiry_date) && !isPlaceholderDate(l.expiry_date);
      const pack = meaningfulField(l.pack_label) && !/^\d+s$/i.test(String(l.pack_label).trim());
      return batch && (exp || pack);
    });
  }

  function invoicePartyMobile(order, cust) {
    const raw = String(order?.customer_mobile || cust?.mobile || "").trim();
    const digits = raw.replace(/\D/g, "");
    if (!digits || /^0+$/.test(digits) || digits.length < 8) return "";
    return raw;
  }

  function taxCode(ctx) {
    if (ctx?.taxCode) return ctx.taxCode;
    const F = globalThis.POSFootwear;
    if (F?.taxCodeLabel) return F.taxCodeLabel(ctx?.businessMeta || {});
    return "HSN";
  }

  function round2(v) {
    return Math.round(num(v) * 100) / 100;
  }

  function lineGst(l) {
    return round2((num(l.amount) * num(l.gst_rate)) / 100);
  }

  function isVoidBill(order) {
    return String(order?.status || "").toLowerCase() === "cancelled";
  }

  function voidMark(order, cls) {
    if (!isVoidBill(order)) return "";
    return `<p class="${cls}">VOID</p>`;
  }

  function isCancelled(l) {
    return l.cancelled === 1 || l.cancelled === "1" || l.cancelled === true;
  }

  function lineQtyRateAmount(l) {
    const U = unitsApi();
    const qty = num(l.quantity_gm);
    const rate = num(l.rate_per_kg);
    const unit = l.unit || "PCS";
    if (U && typeof U.lineAmount === "function") return round2(U.lineAmount(qty, rate, unit));
    if (U && typeof U.isCount === "function" && U.isCount(unit)) return round2(qty * rate);
    return round2((qty / 1000) * rate);
  }

  function repairCountLineAmount(l) {
    const qty = num(l.quantity_gm);
    const rate = num(l.rate_per_kg);
    const stored = num(l.amount);
    const unit = l.unit || "PCS";
    const U = unitsApi();
    const countLike = U?.isCount?.(unit);
    if (!countLike || !(qty > 0) || !(rate > 0)) return l;
    const kgAmt = round2((qty / 1000) * rate);
    const countAmt = round2(qty * rate);
    if (Math.abs(stored - kgAmt) > 0.051 || Math.abs(countAmt - stored) <= 0.05) return l;
    const gstRate = num(l.gst_rate);
    const amount = countAmt;
    return { ...l, amount, gst_amount: round2((amount * gstRate) / 100) };
  }

  function invoiceFigures(order, lines) {
    const rows = (Array.isArray(lines) ? lines : []).map(repairCountLineAmount);
    const discount = round2(order?.discount);
    const gst = round2(order?.gst);
    const total = round2(order?.total);
    const storedSub = round2(order?.subtotal);
    const netLines = round2(rows.reduce((sum, l) => sum + num(l.amount), 0));
    const grossLines = round2(rows.reduce((sum, l) => sum + lineQtyRateAmount(l), 0));
    const lineGst = round2(rows.reduce((sum, l) => sum + num(l.gst_amount), 0));
    if (Math.abs(netLines - storedSub) > 0.05 && netLines > storedSub) {
      return {
        lines: rows,
        gstLines: rows,
        subtotal: netLines,
        discount,
        gst: lineGst || gst,
        total: round2(Math.max(0, netLines - discount + (lineGst || gst))),
      };
    }
    if (discount > 0 && grossLines > netLines + 0.009) {
      return {
        lines: rows.map((l) => ({ ...l, amount: lineQtyRateAmount(l) })),
        gstLines: rows,
        subtotal: grossLines,
        discount,
        gst,
        total,
      };
    }
    return { lines: rows, gstLines: rows, subtotal: storedSub || netLines, discount, gst, total };
  }

  function enrichLines(order, items) {
    return (order.lines || [])
      .filter((l) => !isCancelled(l))
      .map((l) => {
        const item = (items || []).find((i) => i.id === l.item_id);
        const gstRate = num(l.gst_rate) || num(item?.gst_rate);
        const amount = num(l.amount);
        const qty = num(l.quantity_gm);
        const storedMrp = num(l.mrp);
        const unitMrp = num(item?.mrp) || (storedMrp && qty ? round2(storedMrp / qty) : num(l.rate_per_kg));
        return {
          item_name: l.item_name || item?.name || "Item",
          local_name: l.local_name || item?.local_name || "",
          name: l.item_name || item?.name || "Item",
          hsn: item?.hsn || l.hsn || item?.code || "—",
          quantity_gm: qty,
          rate_per_kg: num(l.rate_per_kg),
          unit: l.unit || lineUnit(item),
          gst_rate: gstRate,
          amount,
          gst_amount: lineGst({ amount, gst_rate: gstRate }),
          batch_no: l.batch_no || item?.batch_no || "",
          expiry_date: l.expiry_date || item?.default_expiry || "",
          pack_label: l.pack_label || medicinePackLabel(item),
          mrp: unitMrp,
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

  function noteHtml(text, escapeHtml) {
    return String(escapeHtml(text) || "").replace(/\r\n|\n|\r/g, "<br>");
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
    if (globalThis.POSPay?.label) return globalThis.POSPay.label(method);
    return String(method || "cash").toUpperCase();
  }

  function payStatusLabel(status, order) {
    const paid = round2(order?.amount_paid ?? order?.amountPaid);
    const method = String(order?.payment_method || "").toLowerCase();
    if (method === "credit" && !(paid > 0)) return "UNPAID";
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
      ...companyLicenceBits(co, escapeHtml),
    ]
      .filter(Boolean)
      .join(" · ");

    const itemRows = lines
      .map(
        (l, i) => `<tr>
        <td class="inv-item" colspan="4">${i + 1}. ${escapeHtml(lineName(l, ctx))}</td>
      </tr>
      <tr class="inv-line">
        <td class="inv-hsn">${taxCode(ctx)} ${escapeHtml(l.hsn)}</td>
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
        <th>${taxCode(ctx)} / Item</th>
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
  <p class="inv-pay">Payment: <strong>${escapeHtml(payLabel(purchase.payment_method))}</strong> · ${escapeHtml(payStatusLabel(purchase.payment_status, purchase))}</p>
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

  function L(ctx, key, fallback) {
    if (ctx && typeof ctx.invoiceLabel === "function") return ctx.invoiceLabel(key);
    if (typeof window !== "undefined" && window.POSI18n) return window.POSI18n.invoiceLabel(key, ctx?.locale, ctx?.invoiceMode);
    return fallback || key;
  }

  function paymentQrHtml(co, ctx, kind) {
    const escapeHtml = (ctx && ctx.escapeHtml) || ((v) => String(v ?? ""));
    const url = String(co?.payment_qr_url || "").trim();
    if (!/^(data:image\/|https?:\/\/)/i.test(url)) return "";
    const upi = String(co?.payment_upi || "").trim();
    const title = L(ctx, "invoice.scan_to_pay", "Scan to pay");
    const prefix = kind === "office" ? "off" : "inv";
    return `<div class="${prefix}-pay-qr">
      <p class="${prefix}-pay-qr-title">${escapeHtml(title)}</p>
      <img class="${prefix}-pay-qr-img" src="${escapeHtml(url)}" alt="${escapeHtml(title)}" />
      ${upi ? `<p class="${prefix}-pay-qr-upi">${escapeHtml(upi)}</p>` : ""}
    </div>`;
  }

  function lineName(l, ctx) {
    if (ctx && typeof ctx.displayItemName === "function") return ctx.displayItemName(l);
    return l.item_name || l.name || "Item";
  }

  function ymdFromValue(raw) {
    if (raw == null || raw === "") return "";
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
      const iso = raw.toISOString();
      if (iso.slice(11, 19) === "00:00:00") return iso.slice(0, 10);
      const y = raw.getFullYear();
      const m = String(raw.getMonth() + 1).padStart(2, "0");
      const d = String(raw.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    const s = String(raw).trim();
    if (isPlaceholderDate(s)) return "";
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      const parsed = new Date(s);
      if (!Number.isNaN(parsed.getTime())) {
        const iso = parsed.toISOString();
        if (iso.slice(11, 19) === "00:00:00") return iso.slice(0, 10);
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(parsed);
        const y = parts.find((p) => p.type === "year")?.value;
        const m = parts.find((p) => p.type === "month")?.value;
        const d = parts.find((p) => p.type === "day")?.value;
        if (y && m && d) return `${y}-${m}-${d}`;
      }
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const ymd = s.slice(0, 10);
      const month = Number(ymd.slice(5, 7));
      const day = Number(ymd.slice(8, 10));
      if (isPlaceholderDate(ymd) || month < 1 || month > 12 || day < 1 || day > 31) return "";
      return ymd;
    }
    const dmy = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
    if (dmy) {
      const first = Number(dmy[1]);
      const second = Number(dmy[2]);
      const year = dmy[3];
      let day = first;
      let month = second;
      if (first <= 12 && second > 12) {
        month = first;
        day = second;
      }
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) return ymdFromValue(parsed);
    return "";
  }

  function formatInvoiceDate(raw, ctx) {
    const ymd = ymdFromValue(raw);
    if (!ymd) return "";
    if (ctx && typeof ctx.formatDate === "function") return ctx.formatDate(ymd);
    if (ctx && typeof ctx.formatDateTime === "function") return ctx.formatDateTime(ymd);
    return ymd;
  }

  function invoicePaidFromOrder(order) {
    const total = round2(order?.total);
    const method = String(order?.payment_method || "").toLowerCase();
    const status = String(order?.payment_status || "").toLowerCase();
    const raw = order?.amount_paid ?? order?.amountPaid;
    const stored = raw == null || raw === "" ? null : round2(raw);
    if (stored != null && stored > 0) return stored;
    if (status === "unpaid" || status === "due") return 0;
    if (status === "partial") return stored || 0;
    if (method === "credit" && status !== "paid") return 0;
    if (status === "paid" || (method && method !== "credit")) return total;
    if (!method && status !== "unpaid") return total;
    return 0;
  }

  function invoicePaymentRows(order) {
    const list = [];
    if (Array.isArray(order?.payments)) list.push(...order.payments);
    if (Array.isArray(order?.receipts)) list.push(...order.receipts);
    const receipt = order?.receipt;
    if (receipt && typeof receipt === "object") {
      list.push({
        entry_no: receipt.entry_no || receipt.entryNo || "",
        entry_type: receipt.entry_type || receipt.entryType || "receipt",
        party_name: receipt.party_name || receipt.partyName || order.customer_name || "",
        amount: receipt.amount,
        payment_method: receipt.payment_method || receipt.paymentMethod || receipt.method || order.payment_method,
        payment_reference: receipt.payment_reference || receipt.paymentReference,
        reference_type: receipt.reference_type || receipt.referenceType,
        notes: receipt.notes || "",
        payment_date: receipt.payment_date || receipt.paymentDate || order.payment_date || "",
        created_at: receipt.created_at || receipt.createdAt || receipt.payment_date || order.payment_date || order.created_at,
      });
    }
    const mapped = list
      .map((r) => ({
        entry_no: r.entry_no || r.entryNo || "",
        entry_type: String(r.entry_type || r.entryType || "receipt"),
        party_name: r.party_name || r.partyName || "",
        amount: round2(r.amount),
        payment_method: r.payment_method || r.paymentMethod || r.method || "",
        reference: r.payment_reference || r.paymentReference || r.reference || r.reference_type || r.referenceType || "",
        notes: r.notes || "",
        payment_date: r.payment_date || r.paymentDate || "",
        created_at: r.created_at || r.createdAt || "",
      }))
      .filter((r) => String(r.entry_type).toLowerCase() === "receipt" && r.amount > 0);
    const unique = [];
    const seen = new Set();
    for (const row of mapped) {
      const key = row.entry_no || `${row.amount}|${row.created_at}|${row.notes}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
    }
    if (!unique.length) {
      const paid = invoicePaidFromOrder(order);
      if (paid > 0) {
        unique.push({
          entry_no: order.receipt?.entryNo || order.receipt?.entry_no || order.order_number || "—",
          entry_type: "receipt",
          party_name: order.customer_name || "",
          amount: paid,
          payment_method: order.payment_method || "cash",
          reference: order.payment_reference || order.paymentReference || "",
          notes: order.notes || "",
          payment_date: order.payment_date || order.paymentDate || "",
          created_at: order.created_at || "",
        });
      }
    }
    return unique;
  }

  function invoiceDueFigures(order) {
    const total = round2(order.total);
    const previous = round2(order.previous_due ?? order.previousDue);
    const rows = invoicePaymentRows(order);
    const paidFromRows = round2(rows.reduce((sum, r) => sum + r.amount, 0));
    const inferred = invoicePaidFromOrder(order);
    const paid = rows.length ? paidFromRows : inferred;
    const storedPaid = round2(order.amount_paid ?? order.amountPaid);
    const storedCurrent = order.current_due != null || order.currentDue != null
      ? round2(order.current_due ?? order.currentDue)
      : null;
    const outstandingRaw = order.customer_outstanding ?? order.customerOutstanding;
    let current;
    if (outstandingRaw != null && outstandingRaw !== "") {
      current = round2(Math.max(0, outstandingRaw));
    } else if (rows.length) {
      current = round2(Math.max(0, previous + total - paid));
    } else if (storedPaid > 0 && storedCurrent != null) {
      current = storedCurrent;
    } else {
      current = round2(Math.max(0, previous + total - paid));
    }
    return {
      previous,
      paid,
      current,
      total,
      payments: rows,
      invoiceAmount: round2(order.subtotal),
      discount: round2(order.discount),
      gst: round2(order.gst),
    };
  }

  function invoiceDueRowsHtml(order, money, escapeHtml, ctx) {
    const due = invoiceDueFigures(order);
    const ref = String(order.payment_reference || order.paymentReference || "").trim();
    let payDate = formatInvoiceDate(
      order.payment_date ||
        order.paymentDate ||
        due.payments?.[0]?.payment_date ||
        due.payments?.[0]?.created_at ||
        "",
      ctx,
    );
    if (!payDate && due.paid > 0) payDate = formatInvoiceDate(order.created_at, ctx);
    return `
      <tr><td colspan="3">Previous due</td><td class="inv-num">${escapeHtml(money(due.previous))}</td></tr>
      <tr><td colspan="3">Current invoice</td><td class="inv-num">${escapeHtml(money(due.total))}</td></tr>
      <tr><td colspan="3">Payment Made</td><td class="inv-num">${escapeHtml(money(due.paid))}</td></tr>
      <tr class="inv-grand"><td colspan="3"><strong>Total due</strong></td><td class="inv-num"><strong>${escapeHtml(money(due.current))}</strong></td></tr>
      ${ref ? `<tr><td colspan="3">Payment reference</td><td class="inv-num">${escapeHtml(ref)}</td></tr>` : ""}
      ${payDate ? `<tr><td colspan="3">Payment date</td><td class="inv-num">${escapeHtml(payDate)}</td></tr>` : ""}`;
  }

  function invoiceBody(order, ctx) {
    const { company, customers, items, formatDateTime, money, escapeHtml } = ctx;
    const co = company || {};
    const rawLines = enrichLines(order, items);
    const figures = invoiceFigures(order, rawLines);
    const lines = figures.lines;
    const cust = findCustomer(customers, order);
    const custGstin = String(cust?.gstin || order.customer_gstin || "").trim();
    const breakdown = gstBreakdown(figures.gstLines);
    const subtotal = figures.subtotal;
    const discount = figures.discount;
    const gst = figures.gst;
    const total = figures.total;
    const invNo = escapeHtml(order.order_number || "—");
    const when = formatDateTime(order.created_at || new Date().toISOString());
    const logo = co.logo_url
      ? `<img class="inv-logo" src="${escapeHtml(co.logo_url)}" alt="">`
      : "";

    const meta = [
      co.phone ? `Ph: ${escapeHtml(co.phone)}` : "",
      co.gstin ? `GSTIN: ${escapeHtml(co.gstin)}` : "",
      co.pan ? `PAN: ${escapeHtml(co.pan)}` : "",
      ...companyLicenceBits(co, escapeHtml),
    ]
      .filter(Boolean)
      .join(" · ");

    const packLine = order.pack_name
      ? `<div class="inv-row"><span>Pack</span><span>${escapeHtml(order.pack_name)} × ${num(order.pack_count) || 1}</span></div>`
      : "";
    const tableNo = String(order.table_no || "").trim();
    const tableLine = tableNo
      ? `<div class="inv-row"><span>Table</span><span>${escapeHtml(/^\d+$/.test(tableNo) ? `Table ${tableNo}` : tableNo)}</span></div>`
      : "";

    const pharmacy = isPharmacyBill(order, ctx);
    const custMobile = invoicePartyMobile(order, cust);
    const custAddr = String(order.customer_address || cust?.address || "").trim();
    const doctorRx = String(order.doctor_rx || "").trim();

    const itemRows = pharmacy
      ? lines
          .map((l, i) => {
            const lineTotal = round2(num(l.amount) + num(l.gst_amount));
            return `<tr>
        <td class="inv-item" colspan="4">${i + 1}. ${escapeHtml(lineName(l, ctx))}</td>
      </tr>
      <tr class="inv-tax"><td colspan="4">Batch ${escapeHtml(l.batch_no || "—")} · Exp ${escapeHtml(formatExpiryShort(l.expiry_date) || "—")} · Pack ${escapeHtml(l.pack_label || "—")}</td></tr>
      <tr class="inv-line">
        <td class="inv-hsn">Qty ${escapeHtml(formatQty(l.quantity_gm, l.unit))}</td>
        <td class="inv-num">MRP ${escapeHtml(money(l.mrp))}</td>
        <td class="inv-num">${escapeHtml(money(l.rate_per_kg))}</td>
        <td class="inv-num">${escapeHtml(money(lineTotal))}</td>
      </tr>
      <tr class="inv-tax"><td colspan="4">GST ${l.gst_rate}% · ${escapeHtml(money(l.gst_amount))}${Number(l.discount) > 0 ? ` · Disc ${escapeHtml(money(l.discount))}` : ""}</td></tr>`;
          })
          .join("")
      : lines
          .map(
            (l, i) => `<tr>
        <td class="inv-item" colspan="4">${i + 1}. ${escapeHtml(lineName(l, ctx))}</td>
      </tr>
      <tr class="inv-line">
        <td class="inv-hsn">${taxCode(ctx)} ${escapeHtml(l.hsn)}</td>
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
    <p class="inv-title">${escapeHtml(L(ctx, "invoice.tax_invoice", "TAX INVOICE"))}</p>
    ${voidMark(order, "inv-void")}
  </header>
  <div class="inv-rule"></div>
  <div class="inv-details">
    <div class="inv-row"><span>${escapeHtml(L(ctx, "invoice.no", "Invoice No."))}</span><strong>${invNo}</strong></div>
    <div class="inv-row"><span>${escapeHtml(L(ctx, "invoice.date", "Date"))}</span><span>${escapeHtml(when)}</span></div>
    <div class="inv-row"><span>${escapeHtml(L(ctx, "invoice.customer", "Customer"))}</span><span>${escapeHtml(order.customer_name || cust?.business_name || cust?.name || "Walk-in")}</span></div>
    ${custMobile ? `<div class="inv-row"><span>Mobile No.</span><span>${escapeHtml(custMobile)}</span></div>` : ""}
    ${custAddr ? `<div class="inv-row"><span>Address</span><span>${escapeHtml(custAddr)}</span></div>` : ""}
    ${doctorRx ? `<div class="inv-row"><span>Doctor / Rx</span><span>${escapeHtml(doctorRx)}</span></div>` : ""}
    ${custGstin ? `<div class="inv-row"><span>GSTIN</span><span>${escapeHtml(custGstin)}</span></div>` : ""}
    ${pharmacy ? "" : `<div class="inv-row"><span>Type</span><span>${escapeHtml(String(order.customer_type || cust?.type || "b2c").toUpperCase())}</span></div>`}
    ${tableLine}
    ${packLine}
  </div>
  <div class="inv-rule"></div>
  <table class="inv-table">
    <thead>
      <tr>
        <th>${pharmacy ? "Medicine" : `${escapeHtml(taxCode(ctx))} / ${escapeHtml(L(ctx, "invoice.item", "Item"))}`}</th>
        <th class="inv-num">${pharmacy ? "Qty" : escapeHtml(L(ctx, "invoice.qty", "Qty"))}</th>
        <th class="inv-num">${pharmacy ? "Rate" : escapeHtml(L(ctx, "invoice.rate", "Rate"))}</th>
        <th class="inv-num">${pharmacy ? "Amount" : escapeHtml(L(ctx, "invoice.amount", "Amt"))}</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || '<tr><td colspan="4" class="inv-empty">No line items</td></tr>'}
    </tbody>
  </table>
  <div class="inv-rule"></div>
  <table class="inv-totals">
    <tbody>
      <tr><td colspan="3">${escapeHtml(L(ctx, "invoice.taxable", "Taxable value"))}</td><td class="inv-num">${escapeHtml(money(subtotal))}</td></tr>
      ${discount > 0 ? `<tr><td colspan="3">${escapeHtml(L(ctx, "invoice.discount", "Discount"))}</td><td class="inv-num">-${escapeHtml(money(discount))}</td></tr>` : ""}
      ${round2(order.loyalty_discount) > 0 ? `<tr><td colspan="3">Royalty</td><td class="inv-num">-${escapeHtml(money(order.loyalty_discount))}</td></tr>` : ""}
      ${gstRows}
      <tr class="inv-gst-total"><td colspan="3">${escapeHtml(L(ctx, "invoice.total_gst", "Total GST"))}</td><td class="inv-num">${escapeHtml(money(gst))}</td></tr>
      <tr class="inv-grand"><td colspan="3"><strong>${escapeHtml(L(ctx, "invoice.grand_total", "Grand total"))}</strong></td><td class="inv-num"><strong>${escapeHtml(money(total))}</strong></td></tr>
      ${invoiceDueRowsHtml({ ...order, total: figures.total, gst: figures.gst, subtotal: figures.subtotal }, money, escapeHtml, ctx)}
    </tbody>
  </table>
  <div class="inv-rule"></div>
  <p class="inv-pay">${escapeHtml(L(ctx, "invoice.payment", "Payment"))}: <strong>${escapeHtml(payLabel(order.payment_method))}</strong> · ${escapeHtml(payStatusLabel(order.payment_status, order))}${String(order.payment_reference || "").trim() ? ` · ${escapeHtml(order.payment_reference)}` : ""}</p>
  ${paymentQrHtml(co, ctx, "pos")}
  ${footer ? `<p class="inv-footer">${noteHtml(footer, escapeHtml)}</p>` : `<p class="inv-footer">${escapeHtml(L(ctx, "invoice.thank_you", "Thank you for your business!"))}</p>`}
  ${terms ? `<p class="inv-terms"><strong>${escapeHtml(L(ctx, "invoice.terms", "Terms & conditions"))}</strong><br>${noteHtml(terms, escapeHtml)}</p>` : ""}
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
.inv-void {
  margin: 6px 0 4px;
  padding: 4px 0;
  border: 2px solid #000;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.28em;
  text-align: center;
}
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
.inv-pay-qr { text-align: center; margin: 8px 0 6px; }
.inv-pay-qr-title { margin: 0 0 4px; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
.inv-pay-qr-img { display: block; width: 28mm; height: 28mm; object-fit: contain; margin: 0 auto; background: #fff; }
.inv-pay-qr-upi { margin: 4px 0 0; font-size: 10px; font-weight: 700; }
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

  function officeTermsLabel(order) {
    const method = String(order?.payment_method || "").toLowerCase();
    const status = String(order?.payment_status || "").toLowerCase();
    if (method === "credit") return "Net due";
    if (status === "unpaid" || status === "due") return "Due on Receipt";
    if (status === "partial") return "Partial payment";
    return "Due on Receipt";
  }

  function officeDateOnly(raw) {
    const ymd = ymdFromValue(raw);
    return ymd || "";
  }

  function officeInvoiceBody(order, ctx, opts) {
    const { company, customers, items, formatDateTime, money, escapeHtml } = ctx;
    const co = company || {};
    const rawLines = enrichLines(order, items);
    const figures = invoiceFigures(order, rawLines);
    const lines = figures.lines;
    const cust = findCustomer(customers, order);
    const custGstin = String(cust?.gstin || order.customer_gstin || "").trim();
    const breakdown = gstBreakdown(figures.gstLines);
    const subtotal = figures.subtotal;
    const discount = figures.discount;
    const gst = figures.gst;
    const total = figures.total;
    const due = invoiceDueFigures({
      ...order,
      total: figures.total,
      gst: figures.gst,
      subtotal: figures.subtotal,
      customer_outstanding: order.customer_outstanding ?? order.customerOutstanding ?? cust?.outstanding,
    });
    const invNo = escapeHtml(order.order_number || "—");
    const when = formatDateTime(order.created_at || new Date().toISOString());
    const dueDate = officeDateOnly(order.due_date || order.dueDate || order.created_at);
    const logo = co.logo_url
      ? `<img class="off-logo" src="${escapeHtml(co.logo_url)}" alt="">`
      : "";
    const place = [co.city, co.state, co.pincode || co.pin_code].filter(Boolean).join(", ");
    const shopLines = [
      co.address,
      place,
      [co.phone ? `Ph: ${co.phone}` : "", co.email ? `Email: ${co.email}` : ""].filter(Boolean).join(" · "),
      [co.gstin ? `GSTIN: ${co.gstin}` : "", co.pan ? `PAN: ${co.pan}` : "", ...companyLicenceBits(co)].filter(Boolean).join(" · "),
    ]
      .filter(Boolean)
      .map((t) => `<div>${escapeHtml(t)}</div>`)
      .join("");
    const buyerName = order.customer_name || cust?.business_name || cust?.name || "Walk-in";
    const pharmacy = isPharmacyBill(order, ctx);
    const custMobile = invoicePartyMobile(order, cust);
    const custAddr = String(order.customer_address || cust?.address || "").trim();
    const doctorRx = String(order.doctor_rx || "").trim();
    const buyerBits = [
      cust?.business_name && cust?.name && cust.business_name !== cust.name ? cust.name : "",
      custMobile,
      custAddr,
      doctorRx ? `Doctor / Rx: ${doctorRx}` : "",
      custGstin ? `GSTIN: ${custGstin}` : "",
      pharmacy ? "" : String(order.customer_type || cust?.type || "b2c").toUpperCase(),
    ]
      .filter(Boolean)
      .map((t) => `<div>${escapeHtml(t)}</div>`)
      .join("");

    const itemRows = lines
      .map((l, i) => {
        const descBits = pharmacy
          ? [
              `Batch No.: ${l.batch_no || "—"}`,
              `Expiry: ${formatExpiryShort(l.expiry_date) || "—"}`,
              `Pack: ${l.pack_label || "—"}`,
              `MRP ${money(l.mrp)}`,
              `GST ${l.gst_rate}%`,
            ]
          : [`${taxCode(ctx)}: ${l.hsn}`, `GST ${l.gst_rate}%`];
        return `<tr>
        <td class="off-c">${i + 1}</td>
        <td>
          <div class="off-item-name">${escapeHtml(l.item_name)}</div>
          <div class="off-item-desc">${escapeHtml(descBits.join(" · "))}</div>
        </td>
        <td class="off-n">${escapeHtml(formatQty(l.quantity_gm, l.unit))}</td>
        <td class="off-n">${escapeHtml(money(l.rate_per_kg))}${escapeHtml(rateSuffix(l.unit))}</td>
        <td class="off-n">${escapeHtml(money(l.amount))}</td>
      </tr>`;
      })
      .join("");

    const interState = saleInterState(order, ctx);
    const gstRows = officeGstSplitRows(breakdown, interState, money, escapeHtml);

    const footer = String(co.invoice_footer || co.footer || "").trim();
    const terms = String(co.invoice_terms || co.terms || "").trim();
    const packLine = order.pack_name
      ? `<tr><td>Pack</td><td>${escapeHtml(order.pack_name)} × ${num(order.pack_count) || 1}</td></tr>`
      : "";
    const tableNo = String(order.table_no || "").trim();
    const tableLine = tableNo
      ? `<tr><td>Table</td><td>${escapeHtml(/^\d+$/.test(tableNo) ? `Table ${tableNo}` : tableNo)}</td></tr>`
      : "";
    const payRows = due.payments || [];
    const payTable = payRows.length
      ? `<section class="off-pays-wrap">
      <h3>Payments till date</h3>
      <table class="off-pays">
        <thead>
          <tr>
            <th>Entry</th><th>Type</th><th>Party</th><th class="off-n">Amount</th>
            <th>Method</th><th>Reference</th><th>Notes</th><th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${payRows
            .map((r) => `<tr>
            <td>${escapeHtml(r.entry_no || "—")}</td>
            <td>${escapeHtml(r.entry_type || "receipt")}</td>
            <td>${escapeHtml(r.party_name || buyerName)}</td>
            <td class="off-n">${escapeHtml(money(r.amount))}</td>
            <td>${escapeHtml(r.payment_method || "—")}</td>
            <td>${escapeHtml(r.reference || "—")}</td>
            <td>${escapeHtml(r.notes || "—")}</td>
            <td>${escapeHtml(formatInvoiceDate(r.payment_date, ctx) || formatInvoiceDate(r.created_at, ctx) || "—")}</td>
          </tr>`)
            .join("")}
        </tbody>
      </table>
    </section>`
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
      ${voidMark(order, "off-void")}
      <p class="off-copy">${escapeHtml(officeCopyLabel(opts?.copy))}</p>
      <table class="off-meta">
        <tbody>
          <tr><td>Invoice#</td><td>${invNo}</td></tr>
          <tr><td>Invoice Date</td><td>${escapeHtml(when)}</td></tr>
          <tr><td>Terms</td><td>${escapeHtml(officeTermsLabel(order))} · ${escapeHtml(payLabel(order.payment_method))}</td></tr>
          <tr><td>Due Date</td><td>${escapeHtml(dueDate)}</td></tr>
          ${tableLine}
          ${packLine}
        </tbody>
      </table>
      <div class="off-balance">
        <span>Balance Due</span>
        <strong>${escapeHtml(money(due.current))}</strong>
      </div>
    </div>
  </header>
  <section class="off-parties">
    <div>
      <h2>Bill To</h2>
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
        <th>Item &amp; Description</th>
        <th class="off-n">Qty</th>
        <th class="off-n">Rate</th>
        <th class="off-n">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || `<tr><td colspan="5" class="off-empty">No line items</td></tr>`}
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
      ${footer ? `<div class="off-notes"><h3>Notes</h3><p class="off-note">${noteHtml(footer, escapeHtml)}</p></div>` : ""}
      ${terms ? `<div class="off-tnc"><h3>${escapeHtml(L(ctx, "invoice.terms", "Terms & conditions"))}</h3><p class="off-note">${noteHtml(terms, escapeHtml)}</p></div>` : ""}
    </div>
    <table class="off-totals">
      <tbody>
        <tr><td>Sub Total</td><td class="off-n">${escapeHtml(money(subtotal))}</td></tr>
        ${discount > 0 ? `<tr><td>Discount</td><td class="off-n">(-) ${escapeHtml(money(discount))}</td></tr>` : ""}
        ${round2(order.loyalty_discount) > 0 ? `<tr><td>Royalty</td><td class="off-n">(-) ${escapeHtml(money(order.loyalty_discount))}</td></tr>` : ""}
        <tr><td>Tax</td><td class="off-n">${escapeHtml(money(gst))}</td></tr>
        <tr class="off-grand"><td>Invoice total</td><td class="off-n">${escapeHtml(money(total))}</td></tr>
        <tr class="off-paid"><td>Payment Made</td><td class="off-n">(-) ${escapeHtml(money(due.paid))}</td></tr>
        <tr class="off-due"><td>Total due</td><td class="off-n">${escapeHtml(money(due.current))}</td></tr>
      </tbody>
    </table>
  </div>
  ${payTable}
  <div class="off-end">
    ${paymentQrHtml(co, ctx, "office")}
    <div class="off-end-copy">
      <p class="off-thanks">Thanks for your business.</p>
      <footer class="off-sign">
        <div>Customer signature</div>
        <div>For ${escapeHtml(co.name || "Shop")}<br><span>Authorised signatory</span></div>
      </footer>
    </div>
  </div>
</article>`;
  }

  const OFFICE_CSS = `
@page { size: A4 portrait; margin: 7mm; }
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  color: #212121;
  background: #fff;
  font-family: "Segoe UI", Calibri, Arial, sans-serif;
  font-size: 10.5px;
  line-height: 1.28;
}
.office-invoice { width: 100%; color: #212121; page-break-inside: avoid; break-inside: avoid-page; }
.off-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding-bottom: 8px; }
.off-logo { max-height: 40px; max-width: 140px; display: block; margin-bottom: 4px; }
.off-shop { margin: 0 0 3px; font-size: 18px; font-weight: 700; color: #1a7a6d; letter-spacing: -0.02em; }
.off-seller-meta { font-size: 10px; color: #555; }
.off-doc { min-width: 230px; max-width: 280px; }
.off-title { margin: 0; font-size: 18px; font-weight: 700; color: #1a7a6d; letter-spacing: 0.04em; text-align: right; }
.off-void {
  margin: 4px 0 6px;
  padding: 4px 6px;
  border: 2px solid #c0392b;
  color: #c0392b;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.28em;
  text-align: center;
}
.off-copy { margin: 1px 0 6px; font-size: 10px; color: #777; text-align: right; }
.off-meta { width: 100%; border-collapse: collapse; font-size: 10.5px; }
.off-meta td { padding: 1px 0; }
.off-meta td:first-child { color: #666; width: 42%; }
.off-meta td:last-child { text-align: right; font-weight: 600; }
.off-balance {
  margin-top: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #edf7f5;
  border-left: 4px solid #1a7a6d;
  font-size: 12px;
}
.off-balance span { color: #1a7a6d; font-weight: 700; }
.off-balance strong { font-size: 15px; color: #1a7a6d; }
.off-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 4px 0 8px; }
.off-parties h2 { margin: 0 0 3px; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: #888; font-weight: 700; }
.off-parties strong { font-size: 12px; }
.off-items, .off-gst, .off-totals { width: 100%; border-collapse: collapse; }
.off-items thead th {
  background: #1a7a6d;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0.02em;
  padding: 5px 7px;
  border: 0;
}
.off-items tbody td {
  border: 0;
  border-bottom: 1px solid #e6e6e6;
  padding: 5px 7px;
  vertical-align: top;
}
.off-item-name { font-weight: 600; }
.off-item-desc { margin-top: 1px; font-size: 9.5px; color: #666; }
.off-gst th, .off-gst td { border: 0; border-bottom: 1px solid #eee; padding: 3px 5px; }
.off-gst thead th { background: #f4f8f7; color: #555; font-size: 9px; text-transform: uppercase; }
.off-totals { margin-left: auto; }
.off-totals td { border: 0; padding: 3px 0 3px 10px; }
.off-totals td:first-child { color: #555; }
.off-c { text-align: center; width: 28px; }
.off-n { text-align: right; white-space: nowrap; }
.off-empty { text-align: center; color: #666; }
.off-bottom { display: grid; grid-template-columns: 1.3fr 0.7fr; gap: 16px; margin-top: 6px; align-items: start; }
.off-words { margin: 8px 0 4px; font-size: 10.5px; }
.off-notes h3, .off-tnc h3 { margin: 6px 0 2px; font-size: 11px; color: #1a7a6d; }
.off-note { margin: 0; font-size: 10px; color: #444; }
.off-grand td { font-weight: 800; font-size: 12px; border-top: 1px solid #ddd; }
.off-paid td { font-weight: 700; }
.off-due td { font-weight: 800; font-size: 12px; color: #1a7a6d; border-top: 2px solid #1a7a6d; }
.off-pays-wrap { margin-top: 8px; }
.off-pays-wrap h3 { margin: 0 0 4px; font-size: 11px; color: #1a7a6d; }
.off-pays { width: 100%; border-collapse: collapse; font-size: 9.5px; }
.off-pays th { background: #1a7a6d; color: #fff; text-align: left; padding: 3px 5px; font-weight: 700; }
.off-pays td { border-bottom: 1px solid #e6e6e6; padding: 3px 5px; vertical-align: top; }
.off-end { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 8px; }
.off-end-copy { flex: 1; }
.off-thanks { margin: 0 0 8px; font-size: 12px; color: #1a7a6d; }
.off-pay-qr { text-align: center; margin: 0; flex: 0 0 auto; }
.off-pay-qr-title { margin: 0 0 3px; font-size: 9px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #333; }
.off-pay-qr-img { display: block; width: 72px; height: 72px; object-fit: contain; margin: 0 auto; background: #fff; }
.off-pay-qr-upi { margin: 3px 0 0; font-size: 10px; font-weight: 700; }
.off-sign { display: flex; justify-content: space-between; gap: 16px; margin-top: 0; }
.off-sign > div { min-width: 140px; border-top: 1px solid #ccc; padding-top: 4px; font-size: 10px; color: #555; }
@media print {
  html, body { width: 210mm; height: auto; }
  body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .office-invoice { page-break-after: avoid; page-break-inside: avoid; break-inside: avoid-page; }
}
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
    const meta = [
      co.phone ? `Ph: ${escapeHtml(co.phone)}` : "",
      co.gstin ? `GSTIN: ${escapeHtml(co.gstin)}` : "",
      ...companyLicenceBits(co, escapeHtml),
    ]
      .filter(Boolean)
      .join(" · ");
    const amount = round2(entry.amount);
    const reference = String(entry.payment_reference || entry.referenceNo || "").trim();
    const invoiceNo = String(entry.invoice_no || entry.invoiceNo || entry.against_invoice || "").trim();
    const invoiceAmt = entry.invoice_amount ?? entry.invoiceAmount;
    const payDate =
      formatInvoiceDate(entry.payment_date || entry.paymentDate, ctx) ||
      formatInvoiceDate(entry.created_at, ctx) ||
      formatDateTime(entry.created_at || new Date().toISOString());
    const previousDue = entry.previous_due ?? entry.previousDue;
    const remaining = entry.remaining_due ?? entry.remainingDue ?? entry.balance_due ?? entry.balanceDue;
    return `<article class="thermal-invoice">
  <header class="inv-head">
    <h1 class="inv-shop">${escapeHtml(co.name || "Shop")}</h1>
    ${co.address ? `<p class="inv-addr">${escapeHtml(co.address)}</p>` : ""}
    ${meta ? `<p class="inv-meta">${meta}</p>` : ""}
    <p class="inv-title">${isPayment ? "PAYMENT VOUCHER" : "PAYMENT RECEIPT"}</p>
  </header>
  <div class="inv-rule"></div>
  <div class="inv-details">
    <div class="inv-row"><span>${isPayment ? "Voucher No." : "Payment Receipt No."}</span><strong>${escapeHtml(entry.entry_no || "—")}</strong></div>
    <div class="inv-row"><span>Payment Date</span><span>${escapeHtml(payDate)}</span></div>
    ${entry.party_mobile ? `<div class="inv-row"><span>Mobile</span><span>${escapeHtml(entry.party_mobile)}</span></div>` : ""}
    <div class="inv-row"><span>${isPayment ? "Paid to" : "Customer"}</span><span>${escapeHtml(entry.party_name || "—")}</span></div>
    ${!isPayment && invoiceNo ? `<div class="inv-row"><span>Against Invoice</span><span>${escapeHtml(invoiceNo)}</span></div>` : ""}
    <div class="inv-row"><span>Payment Mode</span><span>${escapeHtml(String(entry.payment_method || "cash").toUpperCase())}</span></div>
    ${reference ? `<div class="inv-row"><span>Reference No.</span><span>${escapeHtml(reference)}</span></div>` : ""}
    ${entry.notes && entry.notes !== invoiceNo ? `<div class="inv-row"><span>Notes</span><span>${escapeHtml(entry.notes)}</span></div>` : ""}
  </div>
  <div class="inv-rule"></div>
  <table class="inv-totals">
    <tbody>
      ${!isPayment && previousDue != null ? `<tr><td>Previous Due</td><td class="inv-num">${escapeHtml(money(previousDue))}</td></tr>` : ""}
      ${!isPayment && invoiceAmt != null ? `<tr><td>Invoice Amount</td><td class="inv-num">${escapeHtml(money(invoiceAmt))}</td></tr>` : ""}
      <tr class="inv-grand"><td><strong>${isPayment ? "Amount paid" : "Payment Received"}</strong></td><td class="inv-num"><strong>${escapeHtml(money(amount))}</strong></td></tr>
      ${!isPayment && remaining != null ? `<tr><td>Remaining Due</td><td class="inv-num">${escapeHtml(money(remaining))}</td></tr>` : ""}
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
    invoiceDueFigures,
    invoiceDueRowsHtml,
    invoicePaymentRows,
    voucherBody,
    voucherDocument,
    ymdFromValue,
    formatInvoiceDate,
    repairCountLineAmount,
    isPrintBill,
    enrichLines,
    invoiceFigures,
    enrichPurchaseLines,
    gstBreakdown,
    purchaseGstBreakdown,
  };
})();
