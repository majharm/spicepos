import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { DEFAULT_DSA_CODE, normalizeDsaCode, validateSignup } from "./onboard.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

function sample(extra = {}) {
  return {
    businessName: "Demo Kirana",
    businessType: "Grocery",
    businessCategory: "Kirana / FMCG",
    ownerName: "Ravi",
    mobile: "9876543210",
    email: "ravi@example.com",
    address: "Main Road",
    city: "Pune",
    state: "Maharashtra",
    pinCode: "411001",
    adminUsername: "ravi.shop",
    password: "secret123",
    confirmPassword: "secret123",
    ...extra,
  };
}

test("signup keeps an optional DSA code", () => {
  const blank = validateSignup(sample());
  assert.equal(blank.dsa_code, null);
  const coded = validateSignup(sample({ dsaCode: " atav-dsa 12 " }));
  assert.equal(coded.dsa_code, "ATAV-DSA12");
  const junk = validateSignup(sample({ dsa_code: "@@@" }));
  assert.equal(junk.dsa_code, null);
  assert.equal(DEFAULT_DSA_CODE, "0001");
  assert.equal(normalizeDsaCode("0001"), "0001");
  assert.equal(normalizeDsaCode(" 0001 "), "0001");
  const numbered = validateSignup(sample({ dsaCode: "0001" }));
  assert.equal(numbered.dsa_code, "0001");
});

test("Sign Up Now and Master Admin collect DSA Code", () => {
  assert.match(read("login.html"), /name="dsaCode"/);
  assert.match(read("login.html"), /DSA Code/);
  assert.match(read("js/master.js"), /name="dsaCode"/);
  assert.match(read("js/master.js"), /DSA \$\{attr\(b\.dsa_code\)\}/);
  assert.match(read("server/onboard.js"), /dsa_code: normalizeDsaCode/);
  assert.match(read("server/schema.js"), /addColumn\("businesses", "dsa_code"/);
  assert.match(read("pos-php-core.php"), /function pos_normalize_dsa_code/);
  assert.match(read("pos-php-core.php"), /dsa_code/);
});
