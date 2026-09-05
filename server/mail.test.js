import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  smtpConfigured,
  smtpConfig,
  smtpEnabled,
  applySmtpSettings,
  publicAppUrl,
  welcomeSignupMessage,
  welcomeStaffMessage,
  sendMail,
  DEFAULT_SMTP_HOST,
  DEFAULT_SMTP_USER,
  DEFAULT_SMTP_FROM,
} from "./mail.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("welcome signup email names the shop and sign-in URL, not the password", () => {
  const msg = welcomeSignupMessage({
    shopName: "SWAMI MASALE",
    ownerName: "Ramesh",
    email: "ramesh@shop.example",
    username: "ramesh",
    signInUrl: "https://pos.atavtelecom.in/login.html",
  });
  assert.match(msg.subject, /SWAMI MASALE/);
  assert.match(msg.text, /Ramesh/);
  assert.match(msg.text, /https:\/\/pos\.atavtelecom\.in\/login\.html/);
  assert.match(msg.text, /ramesh@shop\.example/);
  assert.match(msg.text, /Username: ramesh/);
  assert.doesNotMatch(msg.text, /J:0TL0h/);
  assert.doesNotMatch(msg.html, /type="password"/);
});

test("welcome staff email includes shop and role", () => {
  const msg = welcomeStaffMessage({
    shopName: "ABC Mart",
    name: "Neha",
    email: "neha@abc.example",
    username: "neha",
    role: "cashier",
    signInUrl: "https://pos.atavtelecom.in/login.html",
  });
  assert.match(msg.subject, /ABC Mart/);
  assert.match(msg.text, /cashier/);
  assert.match(msg.html, /Sign in to ATAV POS/);
});

test("SMTP is skipped when sending is turned off", async (t) => {
  const keys = ["SMTP_ENABLED", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM", "MAIL_USER", "MAIL_PASS", "SMTP_PASSWORD"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  t.after(() => {
    applySmtpSettings({});
    for (const k of keys) {
      if (saved[k] == null) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
  for (const k of keys) delete process.env[k];
  process.env.SMTP_ENABLED = "0";
  applySmtpSettings({});
  assert.equal(smtpEnabled(), false);
  assert.equal(smtpConfigured(), false);
  const result = await sendMail({ to: "a@b.co", subject: "x", text: "y" });
  assert.equal(result.skipped, true);
  assert.equal(result.ok, false);
  assert.equal(result.error, "SMTP not configured");
});

test("Hostinger mailbox is the default outgoing SMTP", (t) => {
  const keys = ["SMTP_ENABLED", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM", "MAIL_USER", "MAIL_PASS", "SMTP_PASSWORD"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  t.after(() => {
    applySmtpSettings({});
    for (const k of keys) {
      if (saved[k] == null) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
  for (const k of keys) delete process.env[k];
  applySmtpSettings({});
  const cfg = smtpConfig();
  assert.equal(cfg.host, DEFAULT_SMTP_HOST);
  assert.equal(cfg.port, 465);
  assert.equal(cfg.secure, true);
  assert.equal(cfg.user, DEFAULT_SMTP_USER);
  assert.equal(cfg.from, DEFAULT_SMTP_FROM);
  assert.equal(smtpConfigured(cfg), true);
});

test("public app URL prefers APP_PUBLIC_URL then forwarded host", (t) => {
  const prev = process.env.APP_PUBLIC_URL;
  t.after(() => {
    if (prev == null) delete process.env.APP_PUBLIC_URL;
    else process.env.APP_PUBLIC_URL = prev;
  });
  process.env.APP_PUBLIC_URL = "https://pos.atavtelecom.in/";
  assert.equal(publicAppUrl(), "https://pos.atavtelecom.in");
  delete process.env.APP_PUBLIC_URL;
  assert.equal(
    publicAppUrl({ headers: { "x-forwarded-proto": "https", host: "pos.example" }, protocol: "http" }),
    "https://pos.example",
  );
});

test("default SMTP host is Hostinger when a mailbox user is set", (t) => {
  const keys = ["SMTP_USER", "SMTP_HOST", "SMTP_PASS"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  t.after(() => {
    for (const k of keys) {
      if (saved[k] == null) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
  process.env.SMTP_USER = "pos@atavtelecom.in";
  process.env.SMTP_PASS = "secret";
  delete process.env.SMTP_HOST;
  const cfg = smtpConfig();
  assert.equal(cfg.host, "smtp.hostinger.com");
  assert.equal(cfg.port, 465);
  assert.equal(cfg.from, "pos@atavtelecom.in");
});

test("platform settings overlay SMTP without env", (t) => {
  const keys = ["SMTP_ENABLED", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  t.after(() => {
    applySmtpSettings({});
    for (const k of keys) {
      if (saved[k] == null) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
  for (const k of keys) delete process.env[k];
  applySmtpSettings({
    smtp_host: "smtp.example.com",
    smtp_port: "587",
    smtp_secure: "0",
    smtp_user: "alerts@example.com",
    smtp_pass: "overlay-secret",
    mail_from: "alerts@example.com",
    mail_from_name: "Example POS",
  });
  const cfg = smtpConfig();
  assert.equal(cfg.host, "smtp.example.com");
  assert.equal(cfg.port, 587);
  assert.equal(cfg.secure, false);
  assert.equal(cfg.user, "alerts@example.com");
  assert.equal(cfg.pass, "overlay-secret");
  assert.equal(cfg.fromName, "Example POS");
});

test("PHP and Node wire welcome mail after signup", () => {
  const phpCore = readFileSync(path.join(root, "pos-php-core.php"), "utf8");
  const phpMail = readFileSync(path.join(root, "pos-mail.php"), "utf8");
  const auth = readFileSync(path.join(root, "server/auth.js"), "utf8");
  const master = readFileSync(path.join(root, "server/master.js"), "utf8");
  const tenant = readFileSync(path.join(root, "server/tenant.js"), "utf8");
  const crud = readFileSync(path.join(root, "pos-crud.php"), "utf8");
  const loadEnv = readFileSync(path.join(root, "server/load-env.js"), "utf8");
  assert.match(phpCore, /pos-mail\.php/);
  assert.match(phpCore, /pos_send_welcome_signup/);
  assert.match(phpCore, /businessEmail/);
  assert.match(phpMail, /smtp\.hostinger\.com/);
  assert.match(phpMail, /pos@atavtelecom\.in/);
  assert.match(phpMail, /pos_smtp_defaults/);
  assert.match(phpMail, /pos_welcome_recipients/);
  assert.match(phpMail, /pos_load_dotenv/);
  assert.match(loadEnv, /pos-db\.php/);
  assert.match(auth, /sendWelcomeSignup/);
  assert.match(auth, /businessEmail/);
  assert.match(master, /sendWelcomeSignup/);
  assert.match(master, /businessEmail/);
  assert.match(tenant, /sendWelcomeStaff/);
  assert.match(crud, /pos_send_welcome_staff/);
});

test("signup trial is 2 days", () => {
  assert.match(readFileSync(path.join(root, "login.html"), "utf8"), /2-day trial/);
  assert.doesNotMatch(readFileSync(path.join(root, "login.html"), "utf8"), /30-day trial/);
  assert.match(readFileSync(path.join(root, "server/onboard.js"), "utf8"), /INTERVAL 2 DAY/);
  assert.doesNotMatch(readFileSync(path.join(root, "server/onboard.js"), "utf8"), /INTERVAL 30 DAY/);
  assert.match(readFileSync(path.join(root, "pos-php-core.php"), "utf8"), /strtotime\("\+2 days"\)/);
  assert.doesNotMatch(readFileSync(path.join(root, "pos-php-core.php"), "utf8"), /strtotime\("\+30 days"\)/);
});
