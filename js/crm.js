/** Shared CRM rules. One engine for every business category. A CRM profile links a customer; it does not copy the customer master. */
(function (root) {
  const STAGES = [
    { key: "new", label: "New Lead", sort: 1, won: false, lost: false },
    { key: "contacted", label: "Contacted", sort: 2, won: false, lost: false },
    { key: "interested", label: "Interested", sort: 3, won: false, lost: false },
    { key: "quotation", label: "Quotation Sent", sort: 4, won: false, lost: false },
    { key: "negotiation", label: "Negotiation", sort: 5, won: false, lost: false },
    { key: "converted", label: "Converted", sort: 6, won: true, lost: false },
    { key: "lost", label: "Lost", sort: 7, won: false, lost: true },
  ];

  const PRIORITIES = ["low", "normal", "high", "urgent"];

  const SOURCES = ["Walk-in", "Phone", "WhatsApp", "Website", "Referral", "Campaign"];

  const AUTOMATIONS = [
    { key: "welcome", label: "Welcome message", trigger: "New customer created", channel: "whatsapp", days: 0, template: "Hello {{name}}, welcome to {{shop}}. Reply STOP to opt out of WhatsApp messages." },
    { key: "birthday", label: "Birthday wishes", trigger: "Customer birthday", channel: "whatsapp", days: 0, template: "Happy birthday {{name}}. {{shop}} wishes you a wonderful day." },
    { key: "payment", label: "Payment reminder", trigger: "Outstanding due", channel: "whatsapp", days: 1, template: "{{name}}, this is {{shop}}. ₹{{due}} is still outstanding. Please clear it when you can." },
    { key: "quotation", label: "Quotation follow-up", trigger: "Quotation sent", channel: "whatsapp", days: 2, template: "{{name}}, quotation {{number}} from {{shop}} is ready. It is valid until {{valid}}." },
    { key: "order", label: "Order confirmation", trigger: "New order", channel: "whatsapp", days: 0, template: "{{name}}, {{shop}} confirmed {{number}} for ₹{{total}}." },
    { key: "invoice", label: "Invoice sharing", trigger: "Invoice generated", channel: "whatsapp", days: 0, template: "{{name}}, invoice {{number}} from {{shop}} is ₹{{total}}. {{url}}" },
    { key: "feedback", label: "Customer feedback", trigger: "Bill completed", channel: "whatsapp", days: 1, template: "{{name}}, thank you for visiting {{shop}}. Tell us how the visit went." },
    { key: "revisit", label: "Revisit reminder", trigger: "No purchase for a period", channel: "whatsapp", days: 30, template: "{{name}}, we miss you at {{shop}}. It has been a while since your last purchase." },
    { key: "daily", label: "Daily sales summary", trigger: "Business owner", channel: "whatsapp", days: 0, template: "{{shop}} today: ₹{{total}} across {{count}} bills." },
  ];

  const CATEGORY_FIELDS = {
    retail: [
      { key: "size", label: "Size preference" },
      { key: "color", label: "Colour preference" },
    ],
    garments: [
      { key: "size", label: "Size preference" },
      { key: "color", label: "Colour preference" },
      { key: "fabric", label: "Fabric preference" },
    ],
    restaurant: [
      { key: "food", label: "Food preferences" },
      { key: "table", label: "Usual table" },
    ],
    pharmacy: [
      { key: "refill_item", label: "Refill item" },
      { key: "refill_days", label: "Refill every (days)" },
    ],
    footwear: [
      { key: "shoe_size", label: "Shoe size" },
      { key: "brand", label: "Brand preference" },
    ],
    salon: [
      { key: "service", label: "Preferred service" },
      { key: "stylist", label: "Preferred stylist" },
      { key: "package", label: "Package" },
    ],
    electronics: [
      { key: "warranty_until", label: "Warranty until" },
      { key: "serial", label: "Serial / installation" },
    ],
    grocery: [
      { key: "repeat_items", label: "Repeat items" },
      { key: "monthly_pattern", label: "Monthly pattern" },
    ],
    printing: [
      { key: "artwork", label: "Artwork note" },
      { key: "job_status", label: "Job status" },
      { key: "delivery", label: "Delivery follow-up" },
    ],
    automobile: [
      { key: "vehicle_no", label: "Vehicle number" },
      { key: "model", label: "Vehicle model" },
      { key: "next_service", label: "Next service" },
    ],
    wholesale: [
      { key: "credit_days", label: "Credit days" },
      { key: "payment_terms", label: "Payment terms" },
    ],
  };

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function ymd(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    const s = String(value || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  function todayYmd(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
    const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${bag.year}-${bag.month}-${bag.day}`;
  }

  function stageOf(key) {
    return STAGES.find((stage) => stage.key === String(key || "")) || STAGES[0];
  }

  function priorityOf(value) {
    const key = String(value || "normal").toLowerCase();
    return PRIORITIES.includes(key) ? key : "normal";
  }

  function categoryKey(raw) {
    const text = String(raw || "").toLowerCase();
    if (/garment|apparel|cloth/.test(text)) return "garments";
    if (/foot|shoe/.test(text)) return "footwear";
    if (/cafe|restaurant|food|dine|bakery/.test(text)) return "restaurant";
    if (/pharm|medical|drug/.test(text)) return "pharmacy";
    if (/salon|spa|beauty/.test(text)) return "salon";
    if (/electron|\bmobile\b|appliance/.test(text)) return "electronics";
    if (/groc|kirana|supermarket/.test(text)) return "grocery";
    if (/print|flex|sign/.test(text)) return "printing";
    if (/\bauto|garage|vehicle|\bcar\b/.test(text)) return "automobile";
    if (/whole|distribut|b2b/.test(text)) return "wholesale";
    if (/retail|general/.test(text)) return "retail";
    return "retail";
  }

  function fieldsFor(category) {
    return CATEGORY_FIELDS[categoryKey(category)] || CATEGORY_FIELDS.retail;
  }

  function flagOn(raw) {
    return raw === true || raw === 1 || raw === "1";
  }

  function allowsMessage(person, channel) {
    const kind = String(channel || "whatsapp").toLowerCase();
    if (flagOn(person?.whatsapp_opt_out) && kind === "whatsapp") return false;
    if (kind === "whatsapp") return flagOn(person?.whatsapp_consent);
    if (kind === "sms") return flagOn(person?.sms_consent);
    if (kind === "email") return flagOn(person?.email_consent) && String(person?.email || "").includes("@");
    return false;
  }

  function renderTemplate(template, vars = {}) {
    return String(template || "").replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key) => {
      const value = vars[key];
      return value == null ? "" : String(value);
    }).replace(/[ \t]+\n/g, "\n").trim();
  }

  function openLead(lead) {
    const stage = stageOf(lead?.stage || lead?.status);
    return !stage.won && !stage.lost;
  }

  function followupState(row, today = todayYmd()) {
    const status = String(row?.status || "pending");
    if (status === "done" || status === "cancelled") return status;
    const due = ymd(row?.due_on || row?.due_at);
    if (due && due < today) return "missed";
    return "pending";
  }

  function summarize(input = {}, today = todayYmd()) {
    const customers = Array.isArray(input.customers) ? input.customers : [];
    const leads = Array.isArray(input.leads) ? input.leads : [];
    const followups = Array.isArray(input.followups) ? input.followups : [];
    const tasks = Array.isArray(input.tasks) ? input.tasks : [];
    const openLeads = leads.filter(openLead);
    const pendingFollowups = followups.filter((row) => followupState(row, today) === "pending");
    const missedFollowups = followups.filter((row) => followupState(row, today) === "missed");
    const openTasks = tasks.filter((row) => !["done", "cancelled"].includes(String(row.status || "")));
    const outstanding = customers.reduce((sum, row) => sum + Math.max(0, num(row.outstanding)), 0);
    const lifetime = customers.reduce((sum, row) => sum + Math.max(0, num(row.lifetime_value ?? row.lifetime)), 0);
    const converted = leads.filter((row) => stageOf(row.stage).won).length;
    const closed = leads.filter((row) => stageOf(row.stage).won || stageOf(row.stage).lost).length;
    return {
      customers: customers.length,
      leads: openLeads.length,
      followups: pendingFollowups.length,
      missed: missedFollowups.length,
      tasks: openTasks.length,
      outstanding: Math.round(outstanding * 100) / 100,
      lifetime: Math.round(lifetime * 100) / 100,
      converted,
      conversion: closed ? Math.round((converted / closed) * 1000) / 10 : 0,
    };
  }

  function crmBrief(kpis = {}) {
    const count = (value) => Math.max(0, Math.round(num(value)));
    const customers = count(kpis.customers);
    const leads = count(kpis.leads);
    const followups = count(kpis.followups);
    const missed = count(kpis.missed);
    const tasks = count(kpis.tasks);
    const converted = count(kpis.converted);
    const outstanding = Math.max(0, num(kpis.outstanding));
    const conversion = num(kpis.conversion);
    const money = `₹${inr(outstanding)}`;
    const happened = customers || leads
      ? `${customers} customer${customers === 1 ? "" : "s"} on file, ${leads} open lead${leads === 1 ? "" : "s"}, and ${followups} follow-up${followups === 1 ? "" : "s"} still due.`
      : "No customers or open leads yet. Add a lead to start the pipeline.";
    const why = [];
    if (missed) why.push(`${missed} follow-up${missed === 1 ? " is" : "s are"} past the due date.`);
    if (tasks) why.push(`${tasks} task${tasks === 1 ? " is" : "s are"} still open.`);
    if (outstanding > 0.5) why.push(`${money} is still outstanding.`);
    if (converted) why.push(`Closed leads convert at ${conversion}%.`);
    else if (leads) why.push("No lead has been marked converted or lost yet, so the conversion rate is still open.");
    const next = missed
      ? "Missed follow-ups stay on the dashboard until someone marks them done or moves the lead."
      : leads
        ? "Open leads stay in the pipeline until they are contacted, converted, or marked lost."
        : "The next lead you save will show up in the pipeline and in this briefing.";
    const action = missed
      ? "Clear the missed follow-ups first, then convert any lead whose mobile already matches a customer."
      : outstanding > 0.5
        ? "Collect the outstanding, then move the open leads that are closest to a quotation."
        : leads
          ? "Move each open lead one stage forward, or convert it when the mobile already matches a customer."
          : "Save the first lead with a mobile number so it can link to a customer later.";
    return {
      engine: "advanced",
      happened,
      why: why.join(" ") || "The pipeline does not show a single blockage yet.",
      next,
      action,
    };
  }

  function pipelineColumns(leads) {
    const rows = Array.isArray(leads) ? leads : [];
    return STAGES.filter((stage) => !stage.lost).map((stage) => ({
      ...stage,
      leads: rows.filter((lead) => stageOf(lead.stage).key === stage.key),
    }));
  }

  function sameCustomer(existing, incoming) {
    const mobile = String(incoming?.mobile || "").replace(/\D/g, "").slice(-10);
    const gstin = String(incoming?.gstin || "").trim().toUpperCase();
    const email = String(incoming?.email || "").trim().toLowerCase();
    return (existing || []).find((row) => {
      const rowMobile = String(row.mobile || row.mobile_norm || "").replace(/\D/g, "").slice(-10);
      if (mobile && rowMobile && mobile === rowMobile) return true;
      if (gstin && String(row.gstin || row.gstin_norm || "").toUpperCase() === gstin) return true;
      if (email && String(row.email || row.email_norm || "").toLowerCase() === email) return true;
      return false;
    }) || null;
  }

  function customValues(raw, category) {
    const source = raw && typeof raw === "object" ? raw : {};
    const out = {};
    fieldsFor(category).forEach((field) => {
      out[field.key] = String(source[field.key] ?? "").trim().slice(0, 180);
    });
    return out;
  }

  function groupFollowups(followups, leads = []) {
    const names = new Map((Array.isArray(leads) ? leads : []).map((lead) => [String(lead.id || ""), lead]));
    const groups = new Map();
    (Array.isArray(followups) ? followups : []).forEach((row) => {
      const id = String(row?.lead_id || "");
      if (!groups.has(id)) {
        const lead = names.get(id);
        groups.set(id, {
          id,
          name: row?.lead_name || lead?.name || (id ? "Lead" : "No lead"),
          mobile: row?.lead_mobile || lead?.mobile || "",
          followups: [],
        });
      }
      groups.get(id).followups.push(row);
    });
    const list = [...groups.values()];
    list.forEach((group) => {
      group.followups.sort((a, b) => String(a?.due_on || "").localeCompare(String(b?.due_on || "")));
    });
    list.sort((a, b) => {
      if (!a.id) return 1;
      if (!b.id) return -1;
      return String(a.followups[0]?.due_on || "").localeCompare(String(b.followups[0]?.due_on || "")) || a.name.localeCompare(b.name);
    });
    return list;
  }

  function inr(value) {
    const n = Math.round(num(value) * 100) / 100;
    return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  root.POSCRM = {
    STAGES,
    PRIORITIES,
    SOURCES,
    AUTOMATIONS,
    CATEGORY_FIELDS,
    ymd,
    todayYmd,
    stageOf,
    priorityOf,
    categoryKey,
    fieldsFor,
    allowsMessage,
    renderTemplate,
    openLead,
    followupState,
    groupFollowups,
    summarize,
    crmBrief,
    pipelineColumns,
    sameCustomer,
    customValues,
    inr,
    flagOn,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
