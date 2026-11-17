import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "../js/crm.js";

const CRM = globalThis.POSCRM;
const read = (path) => fs.readFileSync(path, "utf8");

test("CRM pipeline, consent, categories, and customer linking", () => {
  assert.deepEqual(CRM.STAGES.map((stage) => stage.label), ["New Lead", "Contacted", "Interested", "Quotation Sent", "Negotiation", "Converted", "Lost"]);
  assert.equal(CRM.categoryKey("City Footwear"), "footwear");
  assert.equal(CRM.categoryKey("Cafe"), "restaurant");
  assert.equal(CRM.categoryKey("Wholesale distributor"), "wholesale");
  assert.equal(CRM.fieldsFor("pharmacy").some((field) => field.key === "refill_item"), true);
  assert.equal(CRM.fieldsFor("automobile").some((field) => field.key === "vehicle_no"), true);
  assert.equal(CRM.allowsMessage({ whatsapp_consent: 1, whatsapp_opt_out: 0 }, "whatsapp"), true);
  assert.equal(CRM.allowsMessage({ whatsapp_consent: 1, whatsapp_opt_out: 1 }, "whatsapp"), false);
  assert.equal(CRM.allowsMessage({ whatsapp_consent: 0 }, "whatsapp"), false);
  assert.equal(CRM.allowsMessage({ sms_consent: 0 }, "sms"), false);
  assert.equal(CRM.allowsMessage({ email_consent: 1, email: "a@shop.in" }, "email"), true);
  assert.equal(CRM.renderTemplate("Hello {{name}} from {{shop}}", { name: "Asha", shop: "ATAV TELECOM" }), "Hello Asha from ATAV TELECOM");
  const summary = CRM.summarize({
    customers: [{ outstanding: 120.5, lifetime_value: 500 }, { outstanding: 0, lifetime_value: 20 }],
    leads: [{ stage: "new" }, { stage: "quotation" }, { stage: "converted" }, { stage: "lost" }],
    followups: [{ status: "pending", due_on: "2099-01-01" }, { status: "pending", due_on: "2000-01-01" }],
    tasks: [{ status: "open" }, { status: "done" }],
  }, "2026-11-05");
  assert.equal(summary.customers, 2);
  assert.equal(summary.leads, 2);
  assert.equal(summary.followups, 1);
  assert.equal(summary.missed, 1);
  assert.equal(summary.tasks, 1);
  assert.equal(summary.outstanding, 120.5);
  assert.equal(summary.converted, 1);
  assert.equal(summary.conversion, 50);
  const quiet = CRM.crmBrief({});
  assert.equal(quiet.engine, "advanced");
  assert.match(quiet.happened, /No customers or open leads/);
  assert.match(quiet.action, /first lead/);
  const busy = CRM.crmBrief(summary);
  assert.match(busy.happened, /2 customers/);
  assert.match(busy.happened, /2 open leads/);
  assert.match(busy.why, /past the due date/);
  assert.match(busy.why, /₹120\.50/);
  assert.match(busy.why, /50%/);
  assert.match(busy.action, /missed follow-ups/);
  const columns = CRM.pipelineColumns([{ stage: "new", name: "A" }, { stage: "converted", name: "B" }]);
  assert.equal(columns[0].leads.length, 1);
  assert.equal(columns.at(-1).key, "converted");
  const linked = CRM.sameCustomer([{ id: "c1", mobile: "9876543210" }], { mobile: "+91 98765 43210" });
  assert.equal(linked.id, "c1");
  assert.equal(CRM.sameCustomer([{ id: "c2", mobile: "9000000000" }], { mobile: "9876543210" }), null);
  assert.equal(CRM.followupState({ status: "pending", due_on: "2026-11-04" }, "2026-11-05"), "missed");
  assert.deepEqual(CRM.customValues({ shoe_size: "8", secret: "no" }, "footwear"), { shoe_size: "8", brand: "" });
});

test("CRM stays off until enabled and links the customer master", () => {
  const index = read("index.html");
  const app = read("js/app.js");
  const node = read("server/crm.js");
  const php = read("pos-crm.php");
  const core = read("pos-php-core.php");
  assert.match(index, /id="nav-crm-group"/);
  assert.match(index, /data-view="crm" hidden/);
  assert.match(read("css/crm.css"), /#nav-crm-group:not\(:has\(\.nav-btn:not\(\[hidden\]\)\)\)/);
  assert.match(index, /id="view-crm"/);
  assert.match(index, /id="set-crm"/);
  assert.doesNotMatch(index, /id="set-crm" checked/);
  assert.match(index, /Enable CRM/);
  assert.match(index, /js\/crm\.js\?v=20261117crm3/);
  assert.match(index, /js\/crm-ui\.js\?v=20261117crm5/);
  assert.match(index, /css\/crm\.css\?v=20261117crm5/);
  assert.match(read("js/crm-ui.js"), /crmBrief/);
  assert.match(read("js/crm-ui.js"), /Advanced AI/);
  assert.match(read("js/crm-ui.js"), /crm-pill/);
  assert.match(read("js/crm-ui.js"), /crm-search/);
  assert.match(read("css/crm.css"), /#crm-body/);
  assert.match(read("css/crm.css"), /repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(read("js/crm-ui.js"), /Update lead/);
  assert.match(read("js/crm-ui.js"), /name="gstin"/);
  assert.match(read("js/crm-ui.js"), /name="next_followup"/);
  assert.match(read("js/crm-ui.js"), /data-crm-edit/);
  assert.match(node, /CRM Lead Updated/);
  assert.match(node, /function leadInput/);
  assert.match(php, /function pos_crm_lead_input/);
  assert.match(php, /NULLIF\(\?, ''\)/);
  assert.match(php, /function pos_crm_kpis/);
  assert.match(app, /function crmOn/);
  assert.match(app, /view === "crm"\) btn\.hidden = !can\("customers"\) \|\| !crmOn\(\)/);
  assert.match(app, /payload\.crm_enabled = \$\("set-crm"\)\.checked \? 1 : 0/);
  assert.match(read("server/schema.js"), /crm_enabled.*DEFAULT 0/);
  assert.match(read("server/index.js"), /crm_enabled/);
  assert.match(read("server/index.js"), /registerCrm\(app\)/);
  assert.match(read("pos-php-till.php"), /crm_enabled/);
  assert.match(core, /crm_enabled" => "TINYINT\(1\) NOT NULL DEFAULT 0"/);
  assert.match(core, /pos-crm\.php/);
  for (const table of ["crm_leads", "crm_customers", "crm_contacts", "crm_lead_sources", "crm_pipeline_stages", "crm_followups", "crm_tasks", "crm_activities", "crm_notes", "crm_quotations", "crm_communication_logs", "crm_support_tickets", "crm_customer_segments", "crm_reminders"]) {
    assert.match(node, new RegExp(table));
    assert.match(php, new RegExp(table));
  }
  assert.match(node, /UNIQUE KEY uq_crm_customer/);
  assert.match(node, /Turn on Enable CRM/);
  assert.match(node, /allowsMessage/);
  assert.match(node, /first_name/);
  assert.match(php, /first_name/);
  assert.doesNotMatch(node, /SELECT id, name, role FROM staff_users/);
  assert.doesNotMatch(php, /SELECT id, name, role FROM staff_users/);
  assert.match(node, /ensureColumn\("customers", name, def\)/);
  assert.match(node, /merged_into: "VARCHAR\(255\) NULL"/);
  assert.match(node, /activeCustomerSql/);
  assert.doesNotMatch(node, /AND merged_into IS NULL/);
  assert.match(php, /"merged_into" => "VARCHAR\(255\) NULL"/);
  assert.match(php, /pos_crm_active_customer_sql/);
  assert.doesNotMatch(php, /AND merged_into IS NULL/);
  assert.match(read("server/crud.js"), /noteCrmCustomer/);
  assert.match(read("api/cron/index.php"), /pos_cron_run/);
  assert.match(read("pos-automation.php"), /pos_crm_automation_tick/);
  assert.doesNotMatch(read("api/cron/index.php"), /lastError/);
  assert.doesNotMatch(node, /applySaleStock/);
  assert.match(read("css/crm.css"), /crm-desk: crm 2026/);
});
