import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

globalThis.document = { readyState: "complete", getElementById: () => null, querySelectorAll: () => [], addEventListener() {} };
globalThis.window = globalThis;
vm.runInThisContext(read("js/customer-master.js"), { filename: "js/customer-master.js" });
const M = globalThis.POSCustomerMaster;

test("customer keys normalize mobile, email, and GSTIN for every shop kind", () => {
  assert.equal(M.normalizeMobile("+91 98765 43210"), "9876543210");
  assert.equal(M.normalizeEmail("  A@Shop.IN "), "a@shop.in");
  assert.equal(M.normalizeGstin("27abcde1234f1z5"), "27ABCDE1234F1Z5");
  assert.equal(M.isWalkIn({ code: "CUS-001", name: "Walk-in" }), true);
  assert.equal(M.isWalkIn({ name: "Rahul", mobile: "9876543210" }), false);
  assert.equal(M.isMerged({ merged_into: "x" }), true);
  assert.equal(M.sameCustomer({ mobile: "9876543210" }, { mobile: "+91-98765-43210" }), true);
  assert.equal(M.sameCustomer({ gstin: "27ABCDE1234F1Z5" }, { gstin: "27abcde1234f1z5" }), true);
  assert.equal(M.sameCustomer({ mobile: "9876543210" }, { mobile: "9123456780" }), false);
});

test("duplicate groups stay inside one shop and skip walk-in", () => {
  const rows = [
    { id: "a", code: "CUS-002", name: "Rahul", mobile: "9876543210", outstanding: 100, bill_count: 2 },
    { id: "b", code: "CUS-003", name: "R. Sharma", mobile: "+91 98765 43210", outstanding: 40, bill_count: 1 },
    { id: "c", code: "CUS-001", name: "Walk-in", mobile: "0000000002" },
    { id: "d", code: "CUS-004", name: "Other", mobile: "9123456780" },
    { id: "e", code: "CUS-005", name: "Merged", mobile: "9876543210", merged_into: "a" },
  ];
  const groups = M.groupDuplicates(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].primary_id, "a");
  assert.equal(M.findMatch(rows, { mobile: "9876543210" }).id, "a");
  assert.equal(M.findMatch(rows, { mobile: "9123456780" }).name, "Other");
  assert.equal(M.activeCustomers(rows).length, 4);
  const warn = M.warningCopy(groups[0].members[0], { mobile: "9876543210" });
  assert.match(warn, /already exists/);
});

test("Customer Master duplicate wiring covers shop, PHP, and Master Admin", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const masterHtml = read("master.html");
  const masterJs = read("js/master.js");
  const crud = read("server/crud.js");
  const php = read("pos-customers-dedupe.php");
  const core = read("pos-php-core.php");
  const till = read("pos-php-till.php");
  const node = read("server/customers-dedupe.js");

  assert.match(index, /id="cust-match-hint"/);
  assert.match(index, /id="customer-dupes"/);
  assert.match(index, /js\/customer-master\.js\?v=20261012cust1/);
  assert.match(app, /customers\/match|POSCustomerMaster|duplicate/);
  assert.match(app, /reuseExisting: false/);
  assert.match(app, /_duplicate/);
  assert.match(read("pos-gym.php"), /pos_find_existing_customer/);
  assert.match(read("server/gym.js"), /findExistingCustomer/);
  assert.match(crud, /findExistingCustomer/);
  assert.match(node, /registerCustomerDedupeStaff/);
  assert.match(node, /registerCustomerDedupeMaster/);
  assert.match(node, /customer_merge_backups/);
  assert.match(node, /deleted: false/);
  assert.match(php, /function pos_find_existing_customer/);
  assert.match(php, /function pos_merge_customers/);
  assert.match(php, /salon_sessions/);
  assert.match(php, /loyalty_accounts/);
  assert.match(php, /function pos_customers_dedupe_dispatch/);
  assert.match(core, /pos_customers_dedupe_dispatch|master\/customer-duplicates/);
  assert.match(till, /pos_customers_dedupe_dispatch|customers\/duplicates/);
  assert.match(masterHtml, /data-tab="customers"/);
  assert.match(masterJs, /customer-duplicates/);
  assert.doesNotMatch(php, /password_hash/);
});
