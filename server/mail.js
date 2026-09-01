import net from "node:net";
import tls from "node:tls";

const DEFAULT_HOST = "smtp.hostinger.com";
const DEFAULT_FROM_NAME = "ATAV POS";

export function smtpConfig() {
  const user = String(process.env.SMTP_USER || process.env.MAIL_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || process.env.MAIL_PASS || process.env.SMTP_PASSWORD || "");
  const host = String(process.env.SMTP_HOST || (user ? DEFAULT_HOST : "")).trim();
  const port = Number(process.env.SMTP_PORT || (host ? 465 : 0)) || 0;
  const secureEnv = String(process.env.SMTP_SECURE || "").trim();
  const secure = secureEnv ? !["0", "false", "no"].includes(secureEnv.toLowerCase()) : port === 465;
  const from = String(process.env.MAIL_FROM || process.env.SMTP_FROM || user).trim();
  const fromName = String(process.env.MAIL_FROM_NAME || DEFAULT_FROM_NAME).trim() || DEFAULT_FROM_NAME;
  return { host, port, secure, user, pass, from, fromName };
}

export function smtpConfigured(cfg = smtpConfig()) {
  return Boolean(cfg.host && cfg.port && cfg.user && cfg.pass && cfg.from);
}

export function publicAppUrl(req) {
  const env = String(process.env.APP_PUBLIC_URL || process.env.POS_PUBLIC_URL || "").replace(/\/+$/, "");
  if (env) return env;
  if (!req) return "";
  const protoRaw = req.headers?.["x-forwarded-proto"] || req.protocol || "https";
  const proto = String(protoRaw).split(",")[0].trim() || "https";
  const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "").split(",")[0].trim();
  return host ? `${proto}://${host}` : "";
}

function loginUrl(req) {
  const base = publicAppUrl(req);
  return base ? `${base}/login.html` : "/login.html";
}

function encodeSubject(value) {
  const s = String(value || "");
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

function headerAddress(email, name) {
  const addr = String(email || "").trim();
  const label = String(name || "").replaceAll(/[\r\n]+/g, " ").trim();
  if (!label) return addr;
  if (/^[\x20-\x7E]*$/.test(label) && !/[",<>]/.test(label)) return `${label} <${addr}>`;
  return `=?UTF-8?B?${Buffer.from(label, "utf8").toString("base64")}?= <${addr}>`;
}

export function welcomeSignupMessage({ shopName, ownerName, email, username, signInUrl }) {
  const shop = shopName || "your shop";
  const who = ownerName || "there";
  const user = username || email || "";
  const url = signInUrl || "/login.html";
  const subject = `Welcome to ATAV POS · ${shop}`;
  const text = [
    `Hello ${who},`,
    "",
    `Your ATAV POS shop "${shop}" is ready.`,
    "",
    `Sign in: ${url}`,
    `Email: ${email || ""}`,
    user ? `Username: ${user}` : null,
    "",
    "Use the password you set when you registered. Keep it private.",
    "Need help? Reply to this email.",
    "",
    "— ATAV Telecom POS",
  ]
    .filter((line) => line !== null)
    .join("\n");
  const html = `<p>Hello ${escapeHtml(who)},</p>
<p>Your ATAV POS shop <strong>${escapeHtml(shop)}</strong> is ready.</p>
<p><a href="${escapeHtml(url)}">Sign in to ATAV POS</a></p>
<p>Email: ${escapeHtml(email || "")}${user ? `<br>Username: ${escapeHtml(user)}` : ""}</p>
<p>Use the password you set when you registered. Keep it private.</p>
<p>Need help? Reply to this email.</p>
<p>— ATAV Telecom POS</p>`;
  return { subject, text, html };
}

export function welcomeStaffMessage({ shopName, name, email, username, role, signInUrl }) {
  const shop = shopName || "your shop";
  const who = name || "there";
  const user = username || email || "";
  const url = signInUrl || "/login.html";
  const roleLabel = String(role || "staff").replaceAll("_", " ");
  const subject = `You have been added to ${shop} on ATAV POS`;
  const text = [
    `Hello ${who},`,
    "",
    `You have been added to "${shop}" on ATAV POS as ${roleLabel}.`,
    "",
    `Sign in: ${url}`,
    `Email: ${email || ""}`,
    user ? `Username: ${user}` : null,
    "",
    "Use the password your admin shared with you. Keep it private.",
    "Need help? Reply to this email.",
    "",
    "— ATAV Telecom POS",
  ]
    .filter((line) => line !== null)
    .join("\n");
  const html = `<p>Hello ${escapeHtml(who)},</p>
<p>You have been added to <strong>${escapeHtml(shop)}</strong> on ATAV POS as ${escapeHtml(roleLabel)}.</p>
<p><a href="${escapeHtml(url)}">Sign in to ATAV POS</a></p>
<p>Email: ${escapeHtml(email || "")}${user ? `<br>Username: ${escapeHtml(user)}` : ""}</p>
<p>Use the password your admin shared with you. Keep it private.</p>
<p>Need help? Reply to this email.</p>
<p>— ATAV Telecom POS</p>`;
  return { subject, text, html };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

class SmtpSession {
  constructor(socket, timeoutMs) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    this.buf = "";
    this.waiters = [];
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      this.buf += chunk;
      this.flush();
    });
    socket.on("error", (err) => {
      const w = this.waiters.shift();
      if (w) w.reject(err);
    });
  }
  flush() {
    const parts = this.buf.split(/\r?\n/);
    this.buf = parts.pop() || "";
    for (const line of parts) {
      if (!/^\d{3} /.test(line)) continue;
      const w = this.waiters.shift();
      if (w) w.resolve(line);
    }
  }
  read() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("SMTP timeout")), this.timeoutMs);
      this.waiters.push({
        resolve: (line) => {
          clearTimeout(timer);
          resolve(line);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.flush();
    });
  }
  write(line) {
    return new Promise((resolve, reject) => {
      this.socket.write(`${line}\r\n`, "utf8", (err) => (err ? reject(err) : resolve()));
    });
  }
}

function connectSmtp(cfg, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("SMTP connect timeout")), timeoutMs);
    const opts = { host: cfg.host, port: cfg.port, timeout: timeoutMs, servername: cfg.host };
    const socket = cfg.secure ? tls.connect(opts) : net.connect(opts);
    const session = new SmtpSession(socket, timeoutMs);
    const ok = () => {
      clearTimeout(timer);
      resolve({ socket, session });
    };
    if (cfg.secure) socket.once("secureConnect", ok);
    else socket.once("connect", ok);
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function upgradeTls(socket, host, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("SMTP STARTTLS timeout")), timeoutMs);
    const secure = tls.connect({ socket, servername: host });
    const session = new SmtpSession(secure, timeoutMs);
    secure.once("secureConnect", () => {
      clearTimeout(timer);
      resolve({ socket: secure, session });
    });
    secure.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function dotStuff(body) {
  return String(body || "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

export async function sendMail({ to, subject, text, html }) {
  const cfg = smtpConfig();
  if (!smtpConfigured(cfg)) return { ok: false, skipped: true };
  const recipient = String(to || "").trim();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return { ok: false, error: "Invalid recipient" };
  }
  const timeoutMs = Number(process.env.SMTP_TIMEOUT_MS || 12000) || 12000;
  let socket;
  let io;
  try {
    ({ socket, session: io } = await connectSmtp(cfg, timeoutMs));
    const greet = await io.read();
    if (!greet.startsWith("2")) throw new Error(greet || "SMTP handshake failed");
    await io.write("EHLO spicepos");
    let ehlo = await io.read();
    if (!ehlo.startsWith("2")) throw new Error(ehlo || "EHLO failed");
    if (!cfg.secure && cfg.port === 587) {
      await io.write("STARTTLS");
      const tlsReply = await io.read();
      if (!tlsReply.startsWith("2")) throw new Error(tlsReply || "STARTTLS failed");
      ({ socket, session: io } = await upgradeTls(socket, cfg.host, timeoutMs));
      await io.write("EHLO spicepos");
      ehlo = await io.read();
      if (!ehlo.startsWith("2")) throw new Error(ehlo || "EHLO after STARTTLS failed");
    }
    await io.write("AUTH LOGIN");
    const authReady = await io.read();
    if (!authReady.startsWith("3")) throw new Error(authReady || "AUTH LOGIN not accepted");
    await io.write(Buffer.from(cfg.user, "utf8").toString("base64"));
    const userOk = await io.read();
    if (!userOk.startsWith("3")) throw new Error(userOk || "SMTP username rejected");
    await io.write(Buffer.from(cfg.pass, "utf8").toString("base64"));
    const passOk = await io.read();
    if (!passOk.startsWith("2")) throw new Error("SMTP authentication failed");
    await io.write(`MAIL FROM:<${cfg.from}>`);
    const fromOk = await io.read();
    if (!fromOk.startsWith("2")) throw new Error(fromOk || "MAIL FROM rejected");
    await io.write(`RCPT TO:<${recipient}>`);
    const rcptOk = await io.read();
    if (!rcptOk.startsWith("2")) throw new Error(rcptOk || "RCPT TO rejected");
    await io.write("DATA");
    const dataOk = await io.read();
    if (!dataOk.startsWith("3")) throw new Error(dataOk || "DATA rejected");
    const boundary = `pos${Date.now().toString(36)}`;
    const payload = [
      `From: ${headerAddress(cfg.from, cfg.fromName)}`,
      `To: ${recipient}`,
      `Subject: ${encodeSubject(subject)}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      dotStuff(text),
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      dotStuff(html || `<pre>${escapeHtml(text)}</pre>`),
      "",
      `--${boundary}--`,
      ".",
    ].join("\r\n");
    await new Promise((resolve, reject) => {
      socket.write(`${payload}\r\n`, "utf8", (err) => (err ? reject(err) : resolve()));
    });
    const queued = await io.read();
    if (!queued.startsWith("2")) throw new Error(queued || "Message not accepted");
    await io.write("QUIT").catch(() => {});
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  } finally {
    try {
      socket?.end();
    } catch {
      /* ignore */
    }
    try {
      socket?.destroy();
    } catch {
      /* ignore */
    }
  }
}

export async function sendWelcomeSignup(payload, req) {
  try {
    if (!smtpConfigured()) return { ok: false, skipped: true };
    const msg = welcomeSignupMessage({ ...payload, signInUrl: loginUrl(req) });
    const result = await sendMail({ to: payload.email, ...msg });
    if (!result.ok && !result.skipped) console.error("welcome signup email failed:", result.error);
    return result;
  } catch (err) {
    console.error("welcome signup email failed:", err.message);
    return { ok: false, error: String(err.message || err) };
  }
}

export async function sendWelcomeStaff(payload, req) {
  try {
    if (!smtpConfigured()) return { ok: false, skipped: true };
    const msg = welcomeStaffMessage({ ...payload, signInUrl: loginUrl(req) });
    const result = await sendMail({ to: payload.email, ...msg });
    if (!result.ok && !result.skipped) console.error("welcome staff email failed:", result.error);
    return result;
  } catch (err) {
    console.error("welcome staff email failed:", err.message);
    return { ok: false, error: String(err.message || err) };
  }
}
