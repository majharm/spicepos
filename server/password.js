import { pbkdf2, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const pbkdf2Async = promisify(pbkdf2);
const N = 32768;
const r = 8;
const p = 1;
const keylen = 32;
const PBKDF2_ITERS = 100000;

function decode(part) {
  const url = Buffer.from(part, "base64url");
  if (url.length) return url;
  return Buffer.from(part, "base64");
}

function same(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const scryptOpts = { N, r, p, maxmem: 256 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const buf = await pbkdf2Async(String(password), salt, PBKDF2_ITERS, keylen, "sha256");
  return `pbkdf2$sha256$${PBKDF2_ITERS}$${salt.toString("base64url")}$${buf.toString("base64url")}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !password) return false;
  const raw = String(stored);
  if (raw.startsWith("$2a$") || raw.startsWith("$2b$") || raw.startsWith("$2y$")) {
    return false;
  }
  const parts = raw.split("$");
  if (parts[0] === "pbkdf2" && parts.length >= 5) {
    const iters = Number(parts[2]);
    const salt = decode(parts[3]);
    const expected = decode(parts[4]);
    if (!salt.length || !expected.length || !iters) return false;
    const actual = await pbkdf2Async(String(password), salt, iters, expected.length, parts[1] || "sha256");
    return same(actual, expected);
  }
  if (parts.length < 6 || parts[0] !== "scrypt") return false;
  const cost = Number(parts[1]);
  const block = Number(parts[2]);
  const parallel = Number(parts[3]);
  const salt = decode(parts[4]);
  const expected = decode(parts[5]);
  if (!salt.length || !expected.length) return false;
  const actual = await scryptAsync(String(password), salt, expected.length, {
    N: cost,
    r: block,
    p: parallel,
    maxmem: 256 * 1024 * 1024,
  });
  return same(actual, expected);
}
