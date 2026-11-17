import crypto from "node:crypto";
import { argon2id, argon2Verify } from "hash-wasm";

const ARGON = {
  parallelism: 1,
  iterations: 2,
  memorySize: 19456,
  hashLength: 32,
};

export async function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  return argon2id({
    password: String(pin),
    salt,
    ...ARGON,
    outputType: "encoded",
  });
}

export async function verifyPin(pin, encoded) {
  const hash = String(encoded || "");
  if (!hash.startsWith("$argon2id$")) return false;
  try {
    return await argon2Verify({ password: String(pin), hash });
  } catch {
    return false;
  }
}
