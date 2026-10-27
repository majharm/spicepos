/** Per-business mailbox. Passwords stay encrypted on the server and never go back to the browser. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "./db.js";
import { bid } from "./context.js";
import { requirePerm, requireStaff } from "./auth.js";
import { sendMail, safeMailError } from "./mail.js";
import { invoicePdfBuffer } from "./invoice-pdf.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DUPLICATE_MS = 45_000;
let keyCache = "";
let keyBuf = null;

export function cleanEmail(raw) {
  const s = String(raw ?? "").trim().replace(/[\r\n]/g, "");
  if (!s || s.length > 160) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "";
  return s;
}

export function cleanHost(raw) {
  const s = String(raw ?? "").trim().replace(/[\r\n\s]/g, "");
  if (!s || s.length > 180 || !/^[A-Za-z0-9.-]+$/.test(s)) return "";
  return s;
}

export function credentialKey() {
  const env = String(process.env.MAIL_CREDENTIAL_KEY || process.env.APP_SECRET || "").trim();
  if (env) {
    if (keyCache !== `env:${env}`) {
      keyCache = `env:${env}`;
      keyBuf = crypto.createHash("sha256").update(env).digest();
    }
    return keyBuf;
  }
  const file = path.join(root, "data", "mail-credential.key");
  if (keyCache === `file:${file}` && keyBuf) return keyBuf;
  let hex = "";
  try {
    if (fs.existsSync(file)) hex = fs.readFileSync(file, "utf8").trim();
  } catch {
    hex = "";
  }
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    hex = crypto.randomBytes(32).toString("hex");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, hex, { mode: 0o600 });
  }
  keyCache = `file:${file}`;
  keyBuf = Buffer.from(hex, "hex");
  return keyBuf;
}

export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", credentialKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(stored) {
  const parts = String(stored || "").split(":");
  if (parts[0] !== "v1" || parts.length !== 4) throw new Error("Stored email secret could not be read");
  const decipher = crypto.createDecipheriv("aes-256-gcm", credentialKey(), Buffer.from(parts[1], "base64"));
  decipher.setAuthTag(Buffer.from(parts[2], "base64"));
  return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64")), decipher.final()]).toString("utf8");
}

export function publicMailbox(row, companyName = "") {
  if (!row) {
    return {
      configured: false,
      from_email: "",
      from_name: companyName || "",
      reply_to: "",
      smtp_host: "",
      smtp_port: 465,
      smtp_secure: 1,
      smtp_user: "",
      password_set: false,
      auto_invoice_email: 0,
      status: "missing",
      status_detail: "",
      verified_at: null,
    };
  }
  const passwordSet = Number(row.password_set) === 1 || Boolean(row.smtp_pass_enc);
  return {
    configured: Boolean(row.from_email && row.smtp_host && row.smtp_user && passwordSet),
    from_email: row.from_email || "",
    from_name: row.from_name || companyName || "",
    reply_to: row.reply_to || "",
    smtp_host: row.smtp_host || "",
    smtp_port: Number(row.smtp_port) || 465,
    smtp_secure: Number(row.smtp_secure) === 0 ? 0 : 1,
    smtp_user: row.smtp_user || "",
    password_set: passwordSet,
    auto_invoice_email: Number(row.auto_invoice_email) === 1 ? 1 : 0,
    status: row.status || "unverified",
    status_detail: String(row.status_detail || "").slice(0, 180),
    verified_at: row.verified_at || null,
  };
}

export function decideInvoiceEmail({ source, autoOn, verified, scheduleOptIn, hasRecipient }) {
  const wanted =
    source === "manual" ||
    (source === "auto" && autoOn) ||
    (source === "recurring" && (autoOn || scheduleOptIn));
  if (!wanted) return { action: "skip", reason: "not requested" };
  if (!verified) return { action: "fail", reason: "Email connection is not verified" };
  if (!hasRecipient) return { action: "fail", reason: "No customer email address" };
  return { action: "send" };
}

export function recentDuplicate(rows, { recipient, now = Date.now(), windowMs = DUPLICATE_MS, force = false } = {}) {
  if (force) return false;
  const cut = now - windowMs;
  return (rows || []).some((row) => {
    if (String(row.recipient || "").toLowerCase() !== String(recipient || "").toLowerCase()) return false;
    if (!["sent", "pending"].includes(String(row.status || ""))) return false;
    const at = new Date(row.created_at).getTime();
    return Number.isFinite(at) && at >= cut;
  });
}

export function invoiceCopyMessage({ businessName, orderNumber, invoiceDate, total }) {
  const shop = String(businessName || "Your shop").replace(/[\r\n]+/g, " ").trim() || "Your shop";
  const number = String(orderNumber || "Invoice").replace(/[\r\n]+/g, " ").trim() || "Invoice";
  const when = String(invoiceDate || "").replace(/[\r\n]+/g, " ").trim();
  const amount = `Rs ${Number(total || 0).toFixed(2)}`;
  const subject = `Invoice Copy – Invoice ${number} – ${shop}`;
  const text = [
    "Hello,",
    "",
    `Please find your invoice copy from ${shop}.`,
    "",
    `Invoice number: ${number}`,
    `Invoice date: ${when}`,
    `Total amount: ${amount}`,
    "",
    "The invoice PDF is attached.",
    "",
    "Thank you,",
    shop,
  ].join("\n");
  const html = `<p>Hello,</p>
<p>Please find your invoice copy from <strong>${escapeHtml(shop)}</strong>.</p>
<p>Invoice number: ${escapeHtml(number)}<br>Invoice date: ${escapeHtml(when)}<br>Total amount: ${escapeHtml(amount)}</p>
<p>The invoice PDF is attached.</p>
<p>Thank you,<br>${escapeHtml(shop)}</p>`;
  return { subject, text, html, shop, number, amount };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function invoiceDateLabel(value, timeZone) {
  const raw = value ? new Date(value) : new Date();
  if (Number.isNaN(raw.getTime())) return String(value || "").slice(0, 10);
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: timeZone || "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(raw);
  } catch {
    return raw.toISOString().slice(0, 10);
  }
}

let schemaReady = null;

export function ensureMailboxSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS business_mailboxes (
        business_id VARCHAR(36) NOT NULL PRIMARY KEY,
        from_email VARCHAR(160) NOT NULL DEFAULT '',
        from_name VARCHAR(160) NOT NULL DEFAULT '',
        reply_to VARCHAR(160) NULL,
        smtp_host VARCHAR(180) NOT NULL DEFAULT '',
        smtp_port INT NOT NULL DEFAULT 465,
        smtp_secure TINYINT(1) NOT NULL DEFAULT 1,
        smtp_user VARCHAR(180) NOT NULL DEFAULT '',
        smtp_pass_enc TEXT NULL,
        password_set TINYINT(1) NOT NULL DEFAULT 0,
        auto_invoice_email TINYINT(1) NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'missing',
        status_detail VARCHAR(180) NOT NULL DEFAULT '',
        verified_at DATETIME NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`);
      await query(`CREATE TABLE IF NOT EXISTS invoice_emails (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        sales_order_id VARCHAR(36) NULL,
        order_number VARCHAR(40) NULL,
        recipient VARCHAR(160) NOT NULL,
        subject VARCHAR(240) NOT NULL DEFAULT '',
        status VARCHAR(20) NOT NULL,
        error VARCHAR(180) NULL,
        source VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_invoice_emails_bill (business_id, sales_order_id, created_at)
      )`);
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

async function companyName(businessId) {
  try {
    const [company] = await query(
      "SELECT name, address, phone, gstin, email, timezone FROM company_settings WHERE business_id = ? LIMIT 1",
      [businessId],
    );
    if (company?.name) return { timezone: "Asia/Kolkata", ...company };
  } catch {
    /* company profile is optional for the email copy */
  }
  try {
    const [biz] = await query("SELECT name FROM businesses WHERE id = ? LIMIT 1", [businessId]);
    return { name: biz?.name || "Shop", address: "", phone: "", gstin: "", email: "", timezone: "Asia/Kolkata" };
  } catch {
    return { name: "Shop", address: "", phone: "", gstin: "", email: "", timezone: "Asia/Kolkata" };
  }
}

export async function loadMailbox(businessId) {
  await ensureMailboxSchema();
  const [row] = await query("SELECT * FROM business_mailboxes WHERE business_id = ? LIMIT 1", [businessId]);
  return row || null;
}

function smtpFromRow(row, company) {
  let pass = "";
  try {
    pass = decryptSecret(row.smtp_pass_enc);
  } catch {
    pass = "";
  }
  const fromName = String(row.from_name || company?.name || "").trim();
  return {
    host: row.smtp_host,
    port: Number(row.smtp_port) || 465,
    secure: Number(row.smtp_secure) !== 0 && Number(row.smtp_port || 465) !== 587,
    user: row.smtp_user,
    pass,
    from: row.from_email,
    fromName: fromName || company?.name || "Shop",
    replyTo: row.reply_to || "",
  };
}

export async function saveMailbox(businessId, body = {}) {
  await ensureMailboxSchema();
  const current = await loadMailbox(businessId);
  const company = await companyName(businessId);
  const from = cleanEmail(body.from_email ?? body.fromEmail ?? current?.from_email);
  if (!from) {
    const err = new Error("Enter a valid business email address");
    err.status = 400;
    throw err;
  }
  const reply = String(body.reply_to ?? body.replyTo ?? current?.reply_to ?? "").trim();
  if (reply && !cleanEmail(reply)) {
    const err = new Error("Reply-To must be a valid email address");
    err.status = 400;
    throw err;
  }
  const host = cleanHost(body.smtp_host ?? body.smtpHost ?? current?.smtp_host);
  const user = cleanEmail(body.smtp_user ?? body.smtpUser ?? current?.smtp_user) || String(body.smtp_user ?? body.smtpUser ?? current?.smtp_user ?? "").trim();
  if (!host || !user || user.length > 180 || /[\r\n]/.test(user)) {
    const err = new Error("Enter the SMTP host and username for this business");
    err.status = 400;
    throw err;
  }
  const port = Number(body.smtp_port ?? body.smtpPort ?? current?.smtp_port ?? 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const err = new Error("SMTP port is not valid");
    err.status = 400;
    throw err;
  }
  const secure = port === 587 ? 0 : Number(body.smtp_secure ?? body.smtpSecure ?? 1) === 0 ? 0 : 1;
  const typedPass = String(body.smtp_pass ?? body.smtpPass ?? "");
  const keepPass = !typedPass || typedPass === "********";
  if (keepPass && !current?.smtp_pass_enc) {
    const err = new Error("Enter the mailbox password. It is stored encrypted on the server.");
    err.status = 400;
    throw err;
  }
  const passEnc = keepPass ? current.smtp_pass_enc : encryptSecret(typedPass);
  const fromName = String(body.from_name ?? body.fromName ?? current?.from_name ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 160);
  const changed =
    !current ||
    current.from_email !== from ||
    current.smtp_host !== host ||
    Number(current.smtp_port) !== port ||
    current.smtp_user !== user ||
    Number(current.smtp_secure) !== secure ||
    !keepPass;
  let status = changed ? "unverified" : current.status || "unverified";
  let detail = changed ? "Send a test email before automatic invoices." : current.status_detail || "";
  let verifiedAt = changed ? null : current.verified_at || null;
  let auto = Number(body.auto_invoice_email ?? body.autoInvoiceEmail ?? current?.auto_invoice_email) === 1 ? 1 : 0;
  if (changed) auto = 0;
  if (auto && status !== "verified") {
    const err = new Error("Send a test email before turning on automatic invoice emails");
    err.status = 400;
    throw err;
  }
  await query(
    `INSERT INTO business_mailboxes (
       business_id, from_email, from_name, reply_to, smtp_host, smtp_port, smtp_secure, smtp_user,
       smtp_pass_enc, password_set, auto_invoice_email, status, status_detail, verified_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       from_email=VALUES(from_email), from_name=VALUES(from_name), reply_to=VALUES(reply_to),
       smtp_host=VALUES(smtp_host), smtp_port=VALUES(smtp_port), smtp_secure=VALUES(smtp_secure),
       smtp_user=VALUES(smtp_user), smtp_pass_enc=VALUES(smtp_pass_enc), password_set=VALUES(password_set),
       auto_invoice_email=VALUES(auto_invoice_email), status=VALUES(status), status_detail=VALUES(status_detail),
       verified_at=VALUES(verified_at)`,
    [
      businessId,
      from,
      fromName,
      reply ? cleanEmail(reply) : null,
      host,
      port,
      secure,
      user.slice(0, 180),
      passEnc,
      1,
      auto,
      status,
      String(detail || "").slice(0, 180),
      verifiedAt,
    ],
  );
  const saved = await loadMailbox(businessId);
  return publicMailbox(saved, company.name);
}

export async function sendTestEmail(businessId, toRaw) {
  await ensureMailboxSchema();
  const row = await loadMailbox(businessId);
  const company = await companyName(businessId);
  if (!row?.smtp_pass_enc || !row.from_email) {
    const err = new Error("Save the mailbox before sending a test email");
    err.status = 400;
    throw err;
  }
  const to = cleanEmail(toRaw) || cleanEmail(row.from_email);
  if (!to) {
    const err = new Error("Enter a valid address for the test email");
    err.status = 400;
    throw err;
  }
  const shop = company.name || "your shop";
  const sent = await sendMail({
    to,
    subject: `ATAV POS email test – ${shop}`,
    text: `This is a test from ${shop}. Invoice copies can be sent from ${row.from_email}.`,
    html: `<p>This is a test from <strong>${escapeHtml(shop)}</strong>.</p><p>Invoice copies can be sent from ${escapeHtml(row.from_email)}.</p>`,
    smtp: smtpFromRow(row, company),
    replyTo: row.reply_to || "",
    timeoutMs: 15000,
  });
  const detail = sent.ok ? "Connected. Automatic invoice emails can be turned on." : safeMailError(sent.error);
  await query(
    "UPDATE business_mailboxes SET status = ?, status_detail = ?, verified_at = ?, auto_invoice_email = IF(? = 'verified', auto_invoice_email, 0) WHERE business_id = ?",
    [sent.ok ? "verified" : "failed", detail, sent.ok ? new Date() : null, sent.ok ? "verified" : "failed", businessId],
  );
  const saved = await loadMailbox(businessId);
  return { ok: Boolean(sent.ok), error: sent.ok ? "" : detail, to, mailbox: publicMailbox(saved, company.name) };
}

async function customerEmail(businessId, order) {
  const onOrder = cleanEmail(order?.customer_email);
  if (onOrder) return onOrder;
  if (!order?.customer_id) return "";
  const [row] = await query("SELECT email FROM customers WHERE id = ? AND business_id = ? LIMIT 1", [
    order.customer_id,
    businessId,
  ]);
  return cleanEmail(row?.email);
}

async function orderLines(businessId, order) {
  if (Array.isArray(order?.lines) && order.lines.length) return order.lines;
  try {
    return await query("SELECT * FROM sales_order_lines WHERE order_id = ? AND business_id = ?", [order.id, businessId]);
  } catch {
    return query("SELECT * FROM sales_order_lines WHERE order_id = ?", [order.id]);
  }
}

async function writeEmailLog({ businessId, order, recipient, subject, status, error, source }) {
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO invoice_emails (id, business_id, sales_order_id, order_number, recipient, subject, status, error, source)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      id,
      businessId,
      order?.id || null,
      order?.order_number || null,
      recipient || "",
      String(subject || "").slice(0, 240),
      status,
      error ? String(error).slice(0, 180) : null,
      source,
    ],
  );
  return id;
}

export async function listInvoiceEmails(businessId, orderId) {
  await ensureMailboxSchema();
  return query(
    `SELECT id, recipient, subject, status, error, source, created_at
     FROM invoice_emails WHERE business_id = ? AND sales_order_id = ? ORDER BY created_at DESC LIMIT 20`,
    [businessId, orderId],
  );
}

export async function deliverInvoiceCopy({
  businessId,
  order,
  to,
  source = "manual",
  force = false,
  scheduleOptIn = false,
} = {}) {
  await ensureMailboxSchema();
  const row = await loadMailbox(businessId);
  const company = await companyName(businessId);
  const view = publicMailbox(row, company.name);
  const typed = to == null || String(to).trim() === "" ? "" : cleanEmail(to);
  if (String(to || "").trim() && !typed) return { ok: false, error: "Enter a valid email address" };
  const recipient = typed || (await customerEmail(businessId, order));
  const decision = decideInvoiceEmail({
    source,
    autoOn: view.auto_invoice_email === 1,
    verified: view.status === "verified" && view.password_set,
    scheduleOptIn: Boolean(scheduleOptIn),
    hasRecipient: Boolean(recipient),
  });
  if (decision.action === "skip") return { ok: false, skipped: true, reason: decision.reason };
  if (decision.action === "fail") {
    if (order?.id && (source === "auto" || source === "recurring" || source === "manual")) {
      await writeEmailLog({
        businessId,
        order,
        recipient: recipient || "",
        subject: "",
        status: source === "auto" && !recipient ? "skipped" : "failed",
        error: decision.reason,
        source,
      });
    }
    return { ok: false, error: decision.reason, to: recipient || "" };
  }
  const recent = await query(
    `SELECT recipient, status, created_at FROM invoice_emails
     WHERE business_id = ? AND sales_order_id = ? AND created_at >= (NOW() - INTERVAL 45 SECOND)`,
    [businessId, order.id],
  );
  if (recentDuplicate(recent, { recipient, force })) {
    return { ok: false, duplicate: true, error: "This invoice was just emailed to that address.", to: recipient };
  }
  const lines = await orderLines(businessId, order);
  const when = invoiceDateLabel(order.created_at, company.timezone);
  const message = invoiceCopyMessage({
    businessName: view.from_name || company.name,
    orderNumber: order.order_number,
    invoiceDate: when,
    total: order.total,
  });
  const pdf = invoicePdfBuffer(
    company,
    { ...order, invoice_date: when, customer_email: recipient },
    lines,
  );
  const fileName = `Invoice-${String(order.order_number || "invoice").replace(/[^\w.-]+/g, "_").slice(0, 40)}.pdf`;
  const logId = await writeEmailLog({
    businessId,
    order,
    recipient,
    subject: message.subject,
    status: "pending",
    error: "",
    source,
  });
  const smtp = smtpFromRow(row, company);
  if (!smtp.pass) {
    await query("UPDATE invoice_emails SET status = 'failed', error = ? WHERE id = ? AND business_id = ?", [
      "Email password could not be read. Enter it again in Email Settings.",
      logId,
      businessId,
    ]);
    return { ok: false, error: "Email password could not be read. Enter it again in Email Settings.", to: recipient };
  }
  const sent = await sendMail({
    to: recipient,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: view.reply_to,
    smtp,
    timeoutMs: source === "auto" ? 12000 : 20000,
    attachments: [{ filename: fileName, mimeType: "application/pdf", content: pdf }],
  });
  const error = sent.ok ? "" : safeMailError(sent.error, smtp.pass);
  await query("UPDATE invoice_emails SET status = ?, error = ? WHERE id = ? AND business_id = ?", [
    sent.ok ? "sent" : "failed",
    error || null,
    logId,
    businessId,
  ]);
  return { ok: Boolean(sent.ok), error, to: recipient, subject: message.subject };
}

export function registerMailbox(app) {
  app.get("/api/business-email", requireStaff, requirePerm("settings"), async (req, res) => {
    try {
      const businessId = bid();
      const company = await companyName(businessId);
      const row = await loadMailbox(businessId);
      res.json({ mailbox: publicMailbox(row, company.name) });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) });
    }
  });

  app.post("/api/business-email", requireStaff, requirePerm("settings"), async (req, res) => {
    try {
      const mailbox = await saveMailbox(bid(), req.body || {});
      res.json({ ok: true, mailbox });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) });
    }
  });

  app.post("/api/business-email/test", requireStaff, requirePerm("settings"), async (req, res) => {
    try {
      const result = await sendTestEmail(bid(), req.body?.to);
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) });
    }
  });

  app.get("/api/orders/:id/emails", requireStaff, requirePerm("orders"), async (req, res) => {
    try {
      const [order] = await query("SELECT id FROM sales_orders WHERE id = ? AND business_id = ? LIMIT 1", [req.params.id, bid()]);
      if (!order) {
        res.status(404).json({ error: "Invoice not found" });
        return;
      }
      res.json({ emails: await listInvoiceEmails(bid(), order.id) });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) });
    }
  });

  app.post("/api/orders/:id/email", requireStaff, requirePerm("orders"), async (req, res) => {
    try {
      const businessId = bid();
      const [order] = await query("SELECT * FROM sales_orders WHERE id = ? AND business_id = ? LIMIT 1", [
        req.params.id,
        businessId,
      ]);
      if (!order) {
        res.status(404).json({ error: "Invoice not found" });
        return;
      }
      const result = await deliverInvoiceCopy({
        businessId,
        order,
        to: req.body?.to,
        source: "manual",
        force: Number(req.body?.force) === 1,
      });
      const emails = await listInvoiceEmails(businessId, order.id);
      res.json({ ...result, emails });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message || err) });
    }
  });
}
