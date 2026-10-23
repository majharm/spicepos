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
  assert.equal(M.emailError(""), "");
  assert.equal(M.emailError("  ada@shop.in "), "");
  assert.equal(M.isValidEmail("ada@shop.in"), true);
  assert.equal(M.emailError("not-an-email"), "Enter a valid email address.");
  assert.equal(M.findMatch(rowsFromEmail(), { email: "Ada@Shop.in" }).id, "e1");
  assert.equal(M.findMatch(rowsFromEmail(), { email: "Ada@Shop.in" }, "e1"), null);
  const reminder = M.dueReminder({ shopName: "ATAV", customerName: "Rahul", outstanding: 120 });
  assert.match(reminder.subject, /payment reminder/);
  assert.match(reminder.body, /Rahul/);
  assert.match(M.mailtoUrl("Ada@Shop.in", reminder.subject, reminder.body), /^mailto:ada@shop.in\?/);
  assert.equal(M.mailtoUrl("", "Hi", "There"), "");
  assert.equal(M.mailtoUrl("bad", "Hi", "There"), "");
});

function rowsFromEmail() {
  return [{ id: "e1", code: "CUS-009", name: "Ada", email: "ada@shop.in", mobile: "9000000001" }];
}

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
  assert.match(index, /id="cust-email"/);
  assert.match(index, /placeholder="Enter customer email address"/);
  assert.match(index, /id="customers-search"/);
  assert.match(index, /id="customer-details"/);
  assert.match(index, /id="qc-email"/);
  assert.match(index, /id="bill-cust-email"/);
  assert.match(index, /id="customer-dupes"/);
  assert.match(index, /js\/customer-master\.js\?v=20261023cemail1/);
  assert.match(app, /const emailRaw = String\(fields\.email \|\| ""\)\.trim\(\)/);
  assert.match(app, /method: id \? "PUT" : "POST"/);
  assert.match(app, /Email reminder/);
  assert.match(app, /WhatsApp reminder/);
  assert.match(crud, /app.put\("\/api\/customers\/:id"/);
  assert.match(crud, /Enter a valid email address/);
  assert.match(read("pos-crud.php"), /customers\/\(\[A-Za-z0-9-\]\+\)/);
  assert.match(read("server/reports.js"), /c\.email \|\| ""/);
  assert.match(read("pos-reports.php"), /\$c\["email"\]/);
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
