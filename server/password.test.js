import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./password.js";

test("pbkdf2 hash verifies and rejects a wrong password", async () => {
  const stored = await hashPassword("Swami@12345");
  assert.match(stored, /^pbkdf2\$sha256\$100000\$/);
  assert.equal(await verifyPassword("Swami@12345", stored), true);
  assert.equal(await verifyPassword("wrong", stored), false);
});
