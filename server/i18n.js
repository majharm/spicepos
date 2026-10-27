export const POS_LOCALES = ["en", "hi", "mr", "gu", "bn", "ta", "te", "kn", "ml", "pa", "or", "as", "ur"];

export function normalizeLocale(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (!s || s === "shop" || s === "default") return "";
  const base = s.split("-")[0];
  if (POS_LOCALES.includes(base)) return base;
  if (s.startsWith("en")) return "en";
  return "";
}

export function normalizeInvoiceLanguage(raw) {
  const s = String(raw || "shop").trim().toLowerCase();
  return s === "en" || s === "bilingual" || s === "shop" ? s : "shop";
}

export function normalizeWhatsappLanguage(raw) {
  const s = String(raw || "customer").trim().toLowerCase();
  return s === "customer" || s === "shop" || s === "en" ? s : "customer";
}

export function resolveLocale({ customer, user, shop, platform } = {}) {
  return normalizeLocale(customer) || normalizeLocale(user) || normalizeLocale(shop) || normalizeLocale(platform) || "en";
}

export function clipInvoiceText(raw, max = 4000) {
  const s = raw == null ? "" : String(raw);
  return s.length > max ? s.slice(0, max) : s;
}

export function invoiceMarkUrl(raw, label) {
  const url = raw ? String(raw) : "";
  if (!url) return null;
  if (!/^data:image\/(?:png|jpeg);/i.test(url)) {
    const err = new Error(`${label} must be a PNG or JPEG image`);
    err.status = 400;
    return err;
  }
  if (url.length > 2_000_000) {
    const err = new Error(`${label} is too large`);
    err.status = 400;
    return err;
  }
  return url;
}

export function attachInvoiceText(company, business) {
  const row = { ...(company || { name: business?.name || "POS" }) };
  if (row.invoice_footer == null) row.invoice_footer = business?.invoice_footer || "";
  if (row.invoice_terms == null) row.invoice_terms = business?.invoice_terms || "";
  if (row.payment_qr_url == null) row.payment_qr_url = business?.payment_qr_url || "";
  if (row.payment_upi == null) row.payment_upi = business?.payment_upi || "";
  return row;
}
