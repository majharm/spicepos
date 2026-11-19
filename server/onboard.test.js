import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { DEFAULT_DSA_CODE, normalizeDsaCode, normalizeQrModule, validateSignup } from "./onboard.js";

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

test("QR module stays off unless Master Admin enables it", () => {
  assert.equal(normalizeQrModule(undefined), 0);
  assert.equal(normalizeQrModule(0), 0);
  assert.equal(normalizeQrModule("0"), 0);
  assert.equal(normalizeQrModule(false), 0);
  assert.equal(normalizeQrModule(1), 1);
  assert.equal(normalizeQrModule(true), 1);
  assert.equal(normalizeQrModule("on"), 1);
  assert.equal(validateSignup(sample()).qr_module, 0);
  assert.equal(validateSignup(sample({ businessType: "Restaurant", businessCategory: "Food & beverage" })).qr_module, 0);
  assert.equal(validateSignup(sample({ qrModule: 1 })).qr_module, 1);
  assert.equal(validateSignup(sample({ qr_module: "yes" })).qr_module, 1);
  const master = read("js/master.js");
  const schema = read("server/schema.js");
  const php = read("pos-php-core.php");
  const auth = read("server/auth.js");
  assert.match(master, /legend>Module Settings/);
  assert.match(master, /name="qrModule"/);
  assert.match(master, /payload\.qrModule = qrModuleTypeAllowed/);
  assert.match(master, /form\.qrModule\.checked = Number\(b\?\.qr_module\) === 1/);
  assert.match(schema, /qr_module", "TINYINT\(1\) NOT NULL DEFAULT 0/);
  assert.match(schema, /UPDATE businesses SET qr_module = 1/);
  assert.match(php, /function pos_normalize_qr_module/);
  assert.match(php, /"qr_module" => "TINYINT\(1\) NOT NULL DEFAULT 0"/);
  assert.match(php, /UPDATE businesses SET qr_module = 1/);
  assert.match(auth, /qr_module: Number\(business\?\.qr_module\) === 1 \? 1 : 0/);
  assert.match(auth, /qr_module: Number\(req\.auth\.business\?\.qr_module\) === 1 \? 1 : 0/);
  assert.match(read("js/app.js"), /function startQrModuleWatch/);
  assert.match(read("master.html"), /master\.js\?v=20261119sup1/);
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
