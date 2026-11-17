import crypto from "node:crypto";

export const OTP_TTL_MIN = 5;
export const CHALLENGE_TTL_MIN = 10;
export const RESEND_SEC = 45;
export const MAX_OTP_FAILS = 5;
export const MAX_PIN_FAILS = 5;
export const LOCK_MIN = 15;
export const SEND_WINDOW_MIN = 15;
export const SEND_LIMIT_ACCOUNT = 5;
export const SEND_LIMIT_IP = 20;
export const SEND_LIMIT_DEVICE = 8;
export const LOG_KEEP_DAYS = 180;
export const OTP_KEEP_DAYS = 2;

export const FAIL_MESSAGE = "Verification failed.";
export const LIMIT_MESSAGE = "Too many attempts. Wait and try again.";

const PURPOSES = new Set(["login", "verify_number", "pin_setup", "pin_reset"]);

export function isBusinessAdmin(role) {
  return String(role || "") === "business_admin";
}

export function secondStepRequired({ role, otpEnabled, whatsappVerified, pinSet }) {
  if (!isBusinessAdmin(role)) return false;
  const whatsapp = Boolean(otpEnabled) && Boolean(whatsappVerified);
  return whatsapp || Boolean(pinSet);
}

export function availableMethods({ otpEnabled, whatsappVerified, pinSet }) {
  const methods = [];
  if (otpEnabled && whatsappVerified) methods.push("whatsapp");
  if (pinSet) methods.push("pin");
  return methods;
}

export function cleanDeviceId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : "";
}

export function cleanPurpose(value) {
  const purpose = String(value || "").trim();
  return PURPOSES.has(purpose) ? purpose : "";
}

export function pinFormatOk(pin) {
  return /^\d{6}$/.test(String(pin || ""));
}

export function otpCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

export function hashOtp(code, challengeId) {
  return crypto.createHmac("sha256", String(challengeId)).update(String(code)).digest("hex");
}

export function otpMatches(code, challengeId, expectedHash) {
  if (!/^\d{6}$/.test(String(code || ""))) return false;
  const got = hashOtp(code, challengeId);
  const left = Buffer.from(got, "hex");
  const right = Buffer.from(String(expectedHash || ""), "hex");
  if (left.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function maskWhatsapp(raw) {
  const n = String(raw || "").replace(/\D/g, "");
  if (n.length < 4) return "";
  const last = n.slice(-4);
  const head = n.slice(0, Math.min(2, n.length - 4));
  return `+${head}••••${last}`;
}

export function sendAllowed({ account, ip, device }) {
  return Number(account) < SEND_LIMIT_ACCOUNT
    && Number(ip) < SEND_LIMIT_IP
    && Number(device) < SEND_LIMIT_DEVICE;
}

export function resendWaitSec(sentAtMs, nowMs) {
  if (!sentAtMs) return 0;
  const wait = RESEND_SEC * 1000 - (nowMs - sentAtMs);
  return wait > 0 ? Math.ceil(wait / 1000) : 0;
}

export function verifyOtpDecision({ code, challengeId, expectedHash, expiresAtMs, usedAt, attempts, nowMs }) {
  const used = Boolean(usedAt);
  const tries = Number(attempts) || 0;
  if (used || tries >= MAX_OTP_FAILS) return { ok: false, locked: tries >= MAX_OTP_FAILS || used };
  if (!expiresAtMs || nowMs > expiresAtMs) return { ok: false, expired: true };
  if (!otpMatches(code, challengeId, expectedHash)) {
    const next = tries + 1;
    return { ok: false, attempts: next, locked: next >= MAX_OTP_FAILS };
  }
  return { ok: true };
}

export function pinFailure(attempts) {
  const next = (Number(attempts) || 0) + 1;
  return { attempts: next, locked: next >= MAX_PIN_FAILS };
}

export function safeDetail(text) {
  return String(text || "").replace(/\d{4,}/g, "######").slice(0, 160);
}

export function publicChallenge({ challengeId, methods, whatsappMasked, resendAfter = RESEND_SEC }) {
  return {
    ok: true,
    challenge: true,
    challengeId: String(challengeId || ""),
    methods: Array.isArray(methods) ? methods.filter((m) => m === "whatsapp" || m === "pin") : [],
    whatsappMasked: String(whatsappMasked || ""),
    resendAfter,
  };
}

export function otpSendResponse({ challengeId, resendAfter = RESEND_SEC } = {}) {
  const out = { ok: true, sent: true, resendAfter };
  if (challengeId) out.challengeId = String(challengeId);
  return out;
}

export function originAllowed(req) {
  const origin = String(req?.headers?.origin || "").trim();
  if (!origin) return true;
  let host = "";
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const expected = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "")
    .split(",")[0]
    .trim();
  return Boolean(host) && host === expected;
}
