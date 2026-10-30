import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

process.env.MAIL_CREDENTIAL_KEY = "mail-box-test-key";

const {
  cleanEmail,
  encryptSecret,
  decryptSecret,
  publicMailbox,
  decideInvoiceEmail,
  recentDuplicate,
  invoiceCopyMessage,
} = await import("./mail-box.js");
const { invoicePdfBuffer } = await import("./invoice-pdf.js");
const { mimePayload, safeMailError } = await import("./mail.js");

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (name) => readFileSync(path.join(root, name), "utf8");

test("mailbox secrets round-trip and stay out of the browser payload", () => {
  const secret = "mailbox-secret-value";
  const stored = encryptSecret(secret);
  assert.equal(decryptSecret(stored), secret);
  assert.equal(stored.includes(secret), false);
  const view = publicMailbox(
    {
      from_email: "billing@shop.test",
      from_name: "",
      smtp_host: "smtp.shop.test",
      smtp_port: 465,
      smtp_user: "billing@shop.test",
      smtp_pass_enc: stored,
      password_set: 1,
      auto_invoice_email: 0,
      status: "verified",
    },
    "Asha Stores",
  );
  assert.equal(view.password_set, true);
  assert.equal(view.from_name, "Asha Stores");
  assert.equal(Object.hasOwn(view, "smtp_pass_enc"), false);
  assert.equal(JSON.stringify(view).includes(secret), false);
  assert.equal(JSON.stringify(view).includes(stored), false);
});

test("automatic invoice email waits for a verified mailbox and a customer address", () => {
  assert.equal(cleanEmail(""), "");
  assert.equal(cleanEmail("not-an-email"), "");
  assert.equal(cleanEmail("ada@shop.in"), "ada@shop.in");
  assert.deepEqual(decideInvoiceEmail({ source: "auto", autoOn: false, verified: true, hasRecipient: true }), {
    action: "skip",
    reason: "not requested",
  });
  assert.equal(
    decideInvoiceEmail({ source: "auto", autoOn: true, verified: false, hasRecipient: true }).reason,
    "Email connection is not verified",
  );
  assert.equal(
    decideInvoiceEmail({ source: "auto", autoOn: true, verified: true, hasRecipient: false }).reason,
    "No customer email address",
  );
  assert.equal(decideInvoiceEmail({ source: "manual", autoOn: false, verified: true, hasRecipient: true }).action, "send");
  assert.equal(
    decideInvoiceEmail({ source: "recurring", autoOn: false, verified: true, scheduleOptIn: true, hasRecipient: true }).action,
    "send",
  );
  assert.equal(decideInvoiceEmail({ source: "recurring", autoOn: true, verified: true, hasRecipient: true }).action, "send");
});

test("a recent send is not repeated unless the user confirms", () => {
  const rows = [{ recipient: "ada@shop.in", status: "sent", created_at: new Date().toISOString() }];
  assert.equal(recentDuplicate(rows, { recipient: "ada@shop.in" }), true);
  assert.equal(recentDuplicate(rows, { recipient: "ada@shop.in", force: true }), false);
  assert.equal(recentDuplicate([{ ...rows[0], status: "failed" }], { recipient: "ada@shop.in" }), false);
});

test("invoice copy names the bill and attaches a PDF", () => {
  const msg = invoiceCopyMessage({
    businessName: "Asha Stores",
    orderNumber: "SO-12",
    invoiceDate: "27 Oct 2026",
    total: 118,
  });
  assert.equal(msg.subject, "Invoice Copy – Invoice SO-12 – Asha Stores");
  assert.match(msg.text, /Invoice number: SO-12/);
  assert.match(msg.text, /27 Oct 2026/);
  assert.match(msg.text, /Rs 118.00/);
  assert.match(msg.html, /Asha Stores/);
  const pdf = invoicePdfBuffer(
    { name: "Asha Stores", gstin: "27AAAAA0000A1Z5" },
    { order_number: "SO-12", invoice_date: "27 Oct 2026", customer_name: "Mehta", total: 118, subtotal: 100, gst: 18 },
    [{ item_name: "Monthly service", quantity_gm: 1, rate_per_kg: 100, amount: 100 }],
  );
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const body = pdf.toString("latin1");
  assert.match(body, /SO-12/);
  assert.match(body, /Asha Stores/);
  assert.match(body, /Monthly service/);
  const mime = mimePayload({
    from: "billing@shop.test",
    fromName: "Asha Stores",
    to: "ada@shop.in",
    replyTo: "reply@shop.test",
    subject: msg.subject,
    text: msg.text,
    attachments: [{ filename: "Invoice-SO-12.pdf", mimeType: "application/pdf", content: pdf }],
  });
  assert.match(mime, /Reply-To: reply@shop.test/);
  assert.match(mime, /application\/pdf/);
  assert.equal(safeMailError(new Error("auth failed secret-pass"), "secret-pass").includes("secret-pass"), false);
});

test("each business configures its own mailbox and invoice email does not mark the bill paid", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const server = read("server/mail-box.js");
  const checkout = read("server/index.js");
  const recurring = read("server/recurring.js");
  assert.match(index, /Email Settings/);
  assert.match(index, /id="set-mail-from"/);
  assert.match(index, /id="set-mail-auto"/);
  assert.match(index, /id="business-email-test"/);
  assert.match(index, /id="cust-email"/);
  assert.match(index, /js\/app\.js\?v=20261030sup1/);
  assert.match(app, /data-send-invoice-email/);
  assert.match(app, /Send Email/);
  assert.match(server, /business_id = \?/);
  assert.match(server, /smtp_pass_enc/);
  assert.match(server, /aes-256-gcm/);
  assert.doesNotMatch(server, /smtp_pass_enc: stored/);
  const phpMail = read("pos-business-email.php");
  const core = read("pos-php-core.php");
  assert.match(core, /pos-business-email\.php/);
  assert.match(core, /pos_business_email_dispatch/);
  assert.match(phpMail, /business-email\/test/);
  assert.match(phpMail, /aes-256-gcm/);
  assert.match(phpMail, /Save the mailbox before sending a test email/);
  assert.match(phpMail, /v1:/);
  assert.match(read("pos-mail.php"), /\$cfgOverride = null/);
  assert.match(read("pos-mail.php"), /Reply-To:/);
  assert.doesNotMatch(phpMail, /smtp_pass_enc: stored/);
  assert.match(checkout, /deliverInvoiceCopy\(\{ businessId, order: result, source: "auto" \}\)/);
  assert.match(recurring, /source: "recurring"/);
  assert.match(recurring, /scheduleOptIn/);
  assert.doesNotMatch(read("server/mail-box.js"), /payment_status = 'paid'/);
});

test("PHP mailbox cipher matches the Node AES-GCM secret", { skip: spawnSync("php", ["-v"]).status === 0 ? false : "php CLI not installed" }, () => {
  const plain = "mailbox-pass-99";
  const php = (mode, value) =>
    execFileSync(
      "php",
      ["-r", 'require "pos-business-email.php"; echo $argv[1] === "enc" ? pos_bizmail_encrypt($argv[2]) : pos_bizmail_decrypt($argv[2]);', "--", mode, value],
      { encoding: "utf8", cwd: root },
    ).trim();
  assert.equal(decryptSecret(php("enc", plain)), plain);
  assert.equal(php("dec", encryptSecret(plain)), plain);
  assert.equal(php("dec", php("enc", plain)), plain);
});
