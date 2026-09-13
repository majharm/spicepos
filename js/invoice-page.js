(function () {
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function money(n) {
    return (globalThis.POSInvoiceShare?.moneyINR || ((v) => String(v)))(n);
  }

  function formatDateTime(raw) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw || "");
    return d.toLocaleString("en-IN");
  }

  function invoiceCtx(order, company, business, items) {
    const I = globalThis.POSI18n;
    const locale = company?.locale || "en";
    const mode = company?.invoice_language || "shop";
    return {
      company,
      businessMeta: business || {},
      customers: [
        {
          id: order.customer_id,
          name: order.customer_name,
          gstin: order.customer_gstin,
          state: order.customer_state,
          mobile: order.customer_mobile,
        },
      ],
      items: items || [],
      formatDateTime,
      formatDate: (v) => String(v || "").slice(0, 10),
      money,
      escapeHtml,
      locale,
      invoiceMode: mode,
      invoiceLabel: (key) => (I ? I.invoiceLabel(key, locale, mode) : key),
      taxCode: globalThis.POSFootwear?.taxCodeLabel?.(business || {}) || "HSN",
      displayItemName: (item) => (I ? I.displayItemName(item, locale, mode) : item?.name || item?.item_name || ""),
    };
  }

  async function fetchInvoice(id) {
    const paths = [`/api/invoices/${encodeURIComponent(id)}`, `/pos-api.php?p=invoices/${encodeURIComponent(id)}`];
    let last = "Invoice not found.";
    for (const path of paths) {
      try {
        const res = await fetch(path, { credentials: "omit" });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.order) return data;
        last = data.error || res.statusText || last;
      } catch (err) {
        last = err.message || last;
      }
    }
    throw new Error(last);
  }

  const params = new URLSearchParams(location.search);
  const id = params.get("id") || "";
  const status = document.getElementById("status");
  const bill = document.getElementById("bill");
  const actions = document.getElementById("actions");

  async function run() {
    if (!id) {
      status.textContent = "Missing invoice id.";
      return;
    }
    try {
      const data = await fetchInvoice(id);
      const { order, company, business, items } = data;
      document.title = order.order_number || "Invoice";
      status.hidden = true;
      bill.hidden = false;
      const ctx = invoiceCtx(order, company || {}, business || {}, items || []);
      const html = globalThis.InvoicePrint?.invoiceBody
        ? InvoicePrint.invoiceBody(order, ctx)
        : `<pre class="receipt">${escapeHtml(JSON.stringify(order, null, 2))}</pre>`;
      bill.innerHTML = `<div class="thermal-preview">${html}</div>`;
      const share = globalThis.POSInvoiceShare?.shareActions(order, company || {}, location.origin);
      if (share) {
        actions.hidden = false;
        actions.innerHTML = `
          <a class="btn primary" href="${escapeHtml(share.whatsapp)}" target="_blank" rel="noopener">Share on WhatsApp</a>
          <button class="btn" type="button" id="copy-link">Copy link</button>
          <button class="btn" type="button" id="print-btn">Print</button>
        `;
        document.getElementById("copy-link").onclick = async () => {
          try {
            await navigator.clipboard.writeText(share.url);
            status.hidden = false;
            status.textContent = "Invoice link copied.";
            status.className = "hint ok";
          } catch {
            status.hidden = false;
            status.textContent = share.url;
          }
        };
        document.getElementById("print-btn").onclick = () => window.print();
      }
    } catch (err) {
      status.hidden = false;
      status.textContent = err.message || "Invoice not found.";
      status.className = "hint error";
    }
  }

  run();
})();
