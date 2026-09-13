/** WhatsApp / link helpers for pharmacy invoices. */

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

export function moneyINR(n) {
  return INR.format(Number(n) || 0);
}

export function whatsappDigits(mobile) {
  const digits = String(mobile || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.startsWith("91") && digits.length >= 12) return digits;
  return digits;
}

export function invoicePageUrl(origin, orderId) {
  const base = String(origin || "").replace(/\/$/, "");
  return `${base}/invoice.html?id=${encodeURIComponent(orderId)}`;
}

export function shareMessage({ shopName, orderNumber, total, url, money = moneyINR }) {
  return [shopName, `Invoice ${orderNumber}`, `Amount ${money(total)}`, url].filter(Boolean).join("\n");
}

export function whatsappShareUrl(mobile, text) {
  const digits = whatsappDigits(mobile);
  const q = `text=${encodeURIComponent(text)}`;
  return digits ? `https://wa.me/${digits}?${q}` : `https://wa.me/?${q}`;
}

export function uniqueCustomerLines(order) {
  const name = String(order?.customer_name || "").trim();
  const mobile = String(order?.customer_mobile || "").trim();
  const address = String(order?.customer_address || "").trim();
  const lines = [];
  if (name) lines.push(name);
  if (mobile && mobile !== name) lines.push(mobile);
  if (address && address !== name && address !== mobile) lines.push(address);
  return lines;
}

export function licenceLines(company = {}) {
  return [
    "Licence & Registration Details",
    company.drug_licence_no
      ? `Drug Licence No. ${company.drug_licence_no}${company.drug_licence_type ? ` (${company.drug_licence_type})` : ""}`
      : "",
    company.gstin ? `GSTIN ${company.gstin}` : "",
    company.fssai_licence_no ? `FSSAI ${company.fssai_licence_no}` : "",
    company.pharmacy_registration_no ? `Pharmacy Registration ${company.pharmacy_registration_no}` : "",
    company.other_licence_no ? `Other licence ${company.other_licence_no}` : "",
    company.licence_expiry ? `Licence valid until ${String(company.licence_expiry).slice(0, 10)}` : "",
  ].filter(Boolean);
}

export function buildReceiptText(order, company = {}, money = moneyINR) {
  const due = Math.max(0, Number(order.total) - Number(order.amount_paid || 0));
  return [
    company.name,
    company.address,
    company.phone ? `Mobile ${company.phone}` : "",
    order.order_number,
    String(order.created_at || new Date().toISOString()),
    ...uniqueCustomerLines(order),
    order.doctor_name || order.prescription_no
      ? `Doctor / Rx ${order.doctor_name || ""} ${order.prescription_no || ""}`.trim()
      : "",
    "Medicine | Batch | Exp | Pack | Qty | MRP | Rate | GST | Amt",
    "------------------------------",
    ...(order.lines || []).map((l) => {
      const gst = Number(l.gst_rate) || 0;
      return `${l.item_name} | ${l.batch_no || "—"} | ${l.expiry_date ? String(l.expiry_date).slice(0, 10) : "—"} | ${l.pack_type || "—"} | ${l.quantity_gm} | ${money(l.mrp)} | ${money(l.rate_per_kg)} | ${gst}% | ${money(l.amount)}`;
    }),
    "------------------------------",
    `Subtotal ${money(order.subtotal)}`,
    `Discount ${money(order.discount)}`,
    `CGST ${money(order.cgst)}`,
    `SGST ${money(order.sgst)} / IGST ${money(order.igst)}`,
    `Round off ${money(order.round_off)}`,
    `Grand Total ${money(order.total)}`,
    `${order.payment_method} paid ${money(order.amount_paid)} due ${money(due)}`,
    ...licenceLines(company),
  ]
    .filter((line) => line !== undefined && line !== "")
    .join("\n");
}

export function shareActions(order, company, origin) {
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
