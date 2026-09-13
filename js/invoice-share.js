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

  function shareMessage({ shopName, orderNumber, total, url, money = moneyINR }) {
    return [shopName, `Invoice ${orderNumber}`, `Amount ${money(total)}`, url].filter(Boolean).join("\n");
  }

  function whatsappShareUrl(mobile, text) {
    const digits = whatsappDigits(mobile);
    const q = `text=${encodeURIComponent(text)}`;
    return digits ? `https://wa.me/${digits}?${q}` : `https://wa.me/?${q}`;
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
    const text = shareMessage({
      shopName: company?.name,
      orderNumber: order.order_number,
      total: order.total,
      url,
    });
    return {
      url,
      text,
      whatsapp: whatsappShareUrl(order.customer_mobile, text),
    };
  }

  const api = {
    moneyINR,
    whatsappDigits,
    invoicePageUrl,
    shareMessage,
    whatsappShareUrl,
    uniqueCustomerLines,
    shareActions,
  };
  root.POSInvoiceShare = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
