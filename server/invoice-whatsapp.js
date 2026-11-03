import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { query } from "./db.js";
import { normalizeInMobile, sendWhatsApp, waCfg } from "./alerts.js";
import { getPlatformSettings } from "./settings.js";
import { publicAppUrl } from "./mail.js";

let shareApi = null;

function share() {
  if (shareApi) return shareApi;
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../js/invoice-share.js");
  const context = { window: {}, globalThis: {} };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context);
  shareApi = context.POSInvoiceShare;
  if (!shareApi) throw new Error("Invoice share helper did not load");
  return shareApi;
}

export function invoicePublicOrigin() {
  return publicAppUrl() || "https://pos.atavtelecom.in";
}

export function isWalkInCustomer(customer) {
  if (!customer) return false;
  return String(customer.code || "") === "CUS-001" || /^walk-?in$/i.test(String(customer.name || "").trim());
}

export function invoiceCustomerMobile(order, customer) {
  const onBill = normalizeInMobile(order?.customer_mobile || order?.customerMobile || "");
  if (onBill) return onBill;
  if (!customer || isWalkInCustomer(customer)) return "";
  return normalizeInMobile(customer.mobile || customer.phone || "");
}

export function invoiceWhatsAppText({ shopName, order, url, extra = "" } = {}) {
  const subtotal = Number(order?.subtotal) || 0;
  const discount = Number(order?.discount) || 0;
  const loyalty = Number(order?.loyalty_discount) || 0;
  const taxable = Math.max(0, Math.round((subtotal - discount - loyalty) * 100) / 100);
  const text = share().shareMessage({
    shopName,
    orderNumber: order?.order_number,
    total: order?.total,
    subtotal,
    discount,
    loyalty,
    taxable: discount || loyalty ? taxable : 0,
    gst: order?.gst,
    url,
  });
  const note = String(extra || "").replace(/[\r\n]+/g, " ").trim();
  return note ? `${text}\n${note}` : text;
}

let schemaReady = null;

function ensureInvoiceWhatsAppSchema() {
  if (!schemaReady) {
    schemaReady = query(`CREATE TABLE IF NOT EXISTS invoice_whatsapp (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      business_id VARCHAR(36) NOT NULL,
      sales_order_id VARCHAR(36) NOT NULL,
      order_number VARCHAR(40) NULL,
      recipient VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL,
      error VARCHAR(180) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_invoice_wa (business_id, sales_order_id)
    )`).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

async function savedOrder(businessId, order) {
  const id = String(order?.id || "");
  if (!id) return order || null;
  try {
    const rows = await query("SELECT * FROM sales_orders WHERE id = ? AND business_id = ? LIMIT 1", [id, businessId]);
    if (!rows[0]) return order;
    const row = rows[0];
    if (!normalizeInMobile(row.customer_mobile) && normalizeInMobile(order?.customer_mobile || order?.customerMobile)) {
      row.customer_mobile = order.customer_mobile || order.customerMobile;
    }
    return row;
  } catch {
    return order;
  }
}

async function customerRow(businessId, order) {
  const id = String(order?.customer_id || "");
  if (!id) return null;
  try {
    const rows = await query(
      "SELECT id, code, name, mobile, phone FROM customers WHERE id = ? AND business_id = ? LIMIT 1",
      [id, businessId],
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function shopName(businessId) {
  try {
    const [company] = await query("SELECT name FROM company_settings WHERE business_id = ? LIMIT 1", [businessId]);
    if (String(company?.name || "").trim()) return String(company.name).trim();
  } catch {
    /* company profile is optional */
  }
  try {
    const [biz] = await query("SELECT name FROM businesses WHERE id = ? LIMIT 1", [businessId]);
    if (String(biz?.name || "").trim()) return String(biz.name).trim();
  } catch {
    /* business name is optional */
  }
  return "Shop";
}

async function claimSend(businessId, order, mobile) {
  const id = crypto.randomUUID();
  try {
    await query(
      `INSERT INTO invoice_whatsapp (id, business_id, sales_order_id, order_number, recipient, status)
       VALUES (?,?,?,?,?, 'pending')`,
      [id, businessId, order.id, String(order.order_number || "").slice(0, 40), mobile],
    );
    return id;
  } catch (err) {
    if (err?.code !== "ER_DUP_ENTRY" && !/duplicate/i.test(String(err?.message || err))) throw err;
    const updated = await query(
      `UPDATE invoice_whatsapp SET status = 'pending', recipient = ?, error = NULL
       WHERE business_id = ? AND sales_order_id = ? AND status = 'failed'`,
      [mobile, businessId, order.id],
    );
    if (!updated?.affectedRows) return "";
    const rows = await query(
      "SELECT id FROM invoice_whatsapp WHERE business_id = ? AND sales_order_id = ? LIMIT 1",
      [businessId, order.id],
    );
    return rows[0]?.id || "";
  }
}

export async function deliverInvoiceWhatsApp({ businessId, order, extra = "" } = {}) {
  let logId = "";
  try {
    if (!businessId || !order?.id) return { ok: false, skipped: true, reason: "no-order" };
    await ensureInvoiceWhatsAppSchema();
    const saved = await savedOrder(businessId, order);
    const customer = await customerRow(businessId, saved);
    const mobile = invoiceCustomerMobile(saved, customer);
    if (!mobile) return { ok: false, skipped: true, reason: "no-number" };
    const message = invoiceWhatsAppText({
      shopName: await shopName(businessId),
      order: saved,
      url: share().invoicePageUrl(invoicePublicOrigin(), saved.id),
      extra,
    });
    logId = await claimSend(businessId, saved, mobile);
    if (!logId) return { ok: false, skipped: true, reason: "already-sent", to: mobile };
    const settings = await getPlatformSettings();
    const wa = await sendWhatsApp(waCfg(settings), [mobile], message);
    const error = wa?.ok ? "" : String(wa?.reason || wa?.error || "not sent").slice(0, 180);
    await query("UPDATE invoice_whatsapp SET status = ?, error = ? WHERE id = ? AND business_id = ?", [
      wa?.ok ? "sent" : "failed",
      error || null,
      logId,
      businessId,
    ]);
    return { ok: Boolean(wa?.ok), skipped: Boolean(wa?.skipped), to: mobile, error, reason: wa?.reason || "" };
  } catch (err) {
    const error = String(err?.message || err).slice(0, 180);
    if (logId && businessId) {
      try {
        await query("UPDATE invoice_whatsapp SET status = 'failed', error = ? WHERE id = ? AND business_id = ?", [
          error,
          logId,
          businessId,
        ]);
      } catch {
        /* the sale is already saved */
      }
    }
    return { ok: false, error };
  }
}
