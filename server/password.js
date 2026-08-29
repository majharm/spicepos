import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const N = 32768;
const r = 8;
const p = 1;
const keylen = 32;

function decode(part) {
  const url = Buffer.from(part, "base64url");
  if (url.length) return url;
  return Buffer.from(part, "base64");
}

const scryptOpts = { N, r, p, maxmem: 256 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const buf = await scryptAsync(String(password), salt, keylen, scryptOpts);
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${buf.toString("base64url")}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !password) return false;
  const parts = String(stored).split("$");
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
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
