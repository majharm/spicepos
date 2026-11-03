/** WhatsApp and public-link helpers for invoices across shop types. */
(function (root) {
  const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

  function moneyINR(n) {
    return INR.format(Number(n) || 0);
  }

  function whatsappDigits(mobile) {
    const digits = String(mobile || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
    if (digits.startsWith("91") && digits.length >= 12) return digits;
    return digits;
  }

  function invoicePageUrl(origin, orderId) {
    const base = String(origin || "").replace(/\/$/, "");
    return `${base}/invoice.html?id=${encodeURIComponent(orderId)}`;
  }

  function shareMessage({ shopName, orderNumber, total, url, subtotal, discount, loyalty, taxable, gst, money = moneyINR }) {
    const lines = [shopName, orderNumber ? `Invoice ${orderNumber}` : ""];
    if (Number(subtotal)) lines.push(`Subtotal ${money(subtotal)}`);
    if (Number(discount)) lines.push(`Discount ${money(discount)}`);
    if (Number(loyalty)) lines.push(`Royalty points redeemed ${money(loyalty)}`);
    if (Number(taxable)) lines.push(`Taxable ${money(taxable)}`);
    if (Number(gst)) lines.push(`GST ${money(gst)}`);
    lines.push(`Amount ${money(total)}`, url);
    return lines.filter(Boolean).join("\n");
  }

  function whatsappShareUrl(mobile, text) {
    const digits = whatsappDigits(mobile);
    const q = `text=${encodeURIComponent(text)}`;
    return digits ? `https://wa.me/${digits}?${q}` : `https://wa.me/?${q}`;
  }

  function mailtoShareUrl(email, subject, body) {
    const addr = String(email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return "";
    return `mailto:${addr}?subject=${encodeURIComponent(subject || "Invoice")}&body=${encodeURIComponent(body || "")}`;
  }

  function uniqueCustomerLines(order) {
    const name = String(order?.customer_name || "").trim();
    const mobile = String(order?.customer_mobile || "").trim();
    const address = String(order?.customer_address || "").trim();
    const lines = [];
    if (name) lines.push(name);
    if (mobile && mobile !== name) lines.push(mobile);
    if (address && address !== name && address !== mobile) lines.push(address);
    return lines;
  }

  function shareActions(order, company, origin) {
    const url = invoicePageUrl(origin, order.id);
    const subtotal = Number(order.subtotal) || 0;
    const discount = Number(order.discount) || 0;
    const loyalty = Number(order.loyalty_discount) || 0;
    const taxable = Math.max(0, Math.round((subtotal - discount - loyalty) * 100) / 100);
    const text = shareMessage({
      shopName: company?.name,
      orderNumber: order.order_number,
      total: order.total,
      subtotal,
      discount,
      loyalty,
      taxable: discount || loyalty ? taxable : 0,
      gst: order.gst,
      url,
    });
    const subject = [company?.name, order.order_number ? `Invoice ${order.order_number}` : "Invoice"].filter(Boolean).join(" · ");
    return {
      url,
      text,
      whatsapp: whatsappShareUrl(order.customer_mobile, text),
      email: mailtoShareUrl(order.customer_email, subject, text),
    };
  }

  const api = {
    moneyINR,
    whatsappDigits,
    invoicePageUrl,
    shareMessage,
    whatsappShareUrl,
    mailtoShareUrl,
    uniqueCustomerLines,
    shareActions,
  };
  root.POSInvoiceShare = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
