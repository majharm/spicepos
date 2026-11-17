import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPin, verifyPin } from "./admin-pin.js";
import {
  FAIL_MESSAGE,
  availableMethods,
  hashOtp,
  maskWhatsapp,
  originAllowed,
  otpCode,
  otpMatches,
  otpSendResponse,
  pinFailure,
  pinFormatOk,
  publicChallenge,
  resendWaitSec,
  safeDetail,
  secondStepRequired,
  sendAllowed,
  verifyOtpDecision,
} from "./admin-security-rules.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("second step stays off until a business admin enables OTP or a PIN", () => {
  assert.equal(secondStepRequired({ role: "cashier", otpEnabled: true, whatsappVerified: true, pinSet: true }), false);
  assert.equal(secondStepRequired({ role: "master", otpEnabled: true, whatsappVerified: true, pinSet: true }), false);
  assert.equal(secondStepRequired({ role: "business_admin", otpEnabled: false, whatsappVerified: false, pinSet: false }), false);
  assert.equal(secondStepRequired({ role: "business_admin", otpEnabled: true, whatsappVerified: false, pinSet: false }), false);
  assert.equal(secondStepRequired({ role: "business_admin", otpEnabled: true, whatsappVerified: true, pinSet: false }), true);
  assert.equal(secondStepRequired({ role: "business_admin", otpEnabled: false, whatsappVerified: false, pinSet: true }), true);
  assert.deepEqual(availableMethods({ otpEnabled: true, whatsappVerified: true, pinSet: true }), ["whatsapp", "pin"]);
  assert.deepEqual(availableMethods({ otpEnabled: true, whatsappVerified: false, pinSet: false }), []);
});

test("WhatsApp mask and public responses never carry the code", () => {
  const masked = maskWhatsapp("919876543210");
  assert.equal(masked, "+91••••3210");
  assert.equal(masked.includes("98765"), false);
  const code = otpCode();
  assert.match(code, /^\d{6}$/);
  const body = publicChallenge({
    challengeId: "a".repeat(64),
    methods: ["whatsapp", "pin", "password"],
    whatsappMasked: masked,
  });
  assert.deepEqual(body.methods, ["whatsapp", "pin"]);
  assert.equal(JSON.stringify(body).includes(code), false);
  assert.equal(Object.hasOwn(body, "code"), false);
  const sent = otpSendResponse();
  assert.deepEqual(Object.keys(sent).sort(), ["ok", "resendAfter", "sent"]);
  assert.equal(safeDetail(`code ${code}`).includes(code), false);
  assert.equal(FAIL_MESSAGE.includes("exist"), false);
});

test("OTP is single-use, expires, and locks after five failures", () => {
  const challengeId = "b".repeat(64);
  const code = "042013";
  const expected = hashOtp(code, challengeId);
  assert.notEqual(expected, code);
  assert.equal(otpMatches(code, challengeId, expected), true);
  assert.equal(otpMatches("042014", challengeId, expected), false);
  const now = 1_000_000;
  assert.equal(verifyOtpDecision({
    code, challengeId, expectedHash: expected, expiresAtMs: now + 1000, usedAt: null, attempts: 0, nowMs: now,
  }).ok, true);
  assert.equal(verifyOtpDecision({
    code, challengeId, expectedHash: expected, expiresAtMs: now + 1000, usedAt: now, attempts: 0, nowMs: now,
  }).ok, false);
  assert.equal(verifyOtpDecision({
    code, challengeId, expectedHash: expected, expiresAtMs: now - 1, usedAt: null, attempts: 0, nowMs: now,
  }).expired, true);
  const fifth = verifyOtpDecision({
    code: "000000", challengeId, expectedHash: expected, expiresAtMs: now + 1000, usedAt: null, attempts: 4, nowMs: now,
  });
  assert.equal(fifth.ok, false);
  assert.equal(fifth.locked, true);
  assert.equal(resendWaitSec(now - 10_000, now), 35);
  assert.equal(resendWaitSec(now - 50_000, now), 0);
  assert.equal(sendAllowed({ account: 4, ip: 19, device: 7 }), true);
  assert.equal(sendAllowed({ account: 5, ip: 0, device: 0 }), false);
  assert.equal(sendAllowed({ account: 0, ip: 20, device: 0 }), false);
  assert.equal(sendAllowed({ account: 0, ip: 0, device: 8 }), false);
});

test("PIN format and Argon2id round trip", async () => {
  assert.equal(pinFormatOk("123456"), true);
  assert.equal(pinFormatOk("12345"), false);
  assert.equal(pinFormatOk("1234567"), false);
  assert.equal(pinFormatOk("12ab56"), false);
  assert.deepEqual(pinFailure(4), { attempts: 5, locked: true });
  const encoded = await hashPin("654321");
  assert.match(encoded, /^\$argon2id\$/);
  assert.equal(encoded.includes("654321"), false);
  assert.equal(await verifyPin("654321", encoded), true);
  assert.equal(await verifyPin("654320", encoded), false);
  assert.equal(await verifyPin("654321", "plain-654321"), false);
});

test("origin check and login routes do not issue a session before the challenge", () => {
  assert.equal(originAllowed({ headers: { origin: "https://pos.example", host: "pos.example" } }), true);
  assert.equal(originAllowed({ headers: { origin: "https://evil.example", host: "pos.example" } }), false);
  assert.equal(originAllowed({ headers: { host: "pos.example" } }), true);

  const auth = read("server/auth.js");
  const login = auth.slice(auth.indexOf('app.post("/api/auth/login"'), auth.indexOf('app.post("/api/auth/forgot-password"'));
  const gate = login.indexOf("prepareLoginChallenge");
  const finish = login.indexOf("finishStaffLogin");
  assert.ok(gate > 0 && gate < finish);
  assert.doesNotMatch(login, /setCookie\(res, "pos_sid"/);
  assert.match(auth, /revokeOtherStaffSessions/);

  const core = read("pos-php-core.php");
  const phpLogin = core.slice(core.indexOf('if ($path === "auth/login"'), core.indexOf('if ($path === "auth/signup"'));
  const phpGate = phpLogin.indexOf("pos_admin_login_challenge");
  const phpFinish = phpLogin.indexOf("pos_admin_finish_login");
  assert.ok(phpGate > 0 && phpGate < phpFinish);
  assert.doesNotMatch(phpLogin.slice(0, phpFinish), /pos_set_cookie/);

  const api = read("server/admin-security.js");
  for (const route of [
    "/api/auth/otp/send",
    "/api/auth/otp/verify",
    "/api/auth/pin/verify",
    "/api/auth/pin/setup",
    "/api/auth/pin/reset",
    "/api/auth/security/settings",
    "/api/auth/login/history",
    "/api/auth/session/revoke",
  ]) {
    assert.match(api, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.doesNotMatch(api, /console\.(log|info|debug|warn|error)/);
  const php = read("pos-admin-security.php");
  assert.match(php, /function pos_admin_security_dispatch/);
  assert.match(php, /PASSWORD_ARGON2ID/);
  assert.doesNotMatch(php, /error_log\(/);
  assert.match(read("docs/business-admin-login.md"), /Argon2id/);
  assert.match(read("scripts/base-schema.sql"), /business_admin_otp/);

  const page = read("login.html");
  assert.match(page, /id="login-verify"/);
  assert.match(page, /id="verify-otp"/);
  assert.match(page, /id="verify-pin"/);
  assert.match(page, /id="verify-otp-resend"/);
  assert.match(page, /js\/login-verify\.js\?v=20261118sec1/);
  assert.match(page, /x-pos-20260830e\.js\?v=20261118sec1/);
  const settings = read("index.html");
  assert.match(settings, /Security &amp; Login/);
  assert.match(settings, /id="login-security"/);
  assert.match(settings, /js\/security-login\.js\?v=20261118sec1/);
  assert.match(read("js/x-pos-20260830e.js"), /result\.data\?\.challenge/);
});
