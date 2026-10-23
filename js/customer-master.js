(function (root) {
  const PLACEHOLDER_MOBILES = new Set(["0000000000", "0000000002"]);

  function clip(value, max) {
    const s = String(value ?? "").trim();
    return s ? (max ? s.slice(0, max) : s) : "";
  }

  function normalizeMobile(raw) {
    const d = String(raw ?? "").replace(/\D+/g, "");
    if (d.length >= 10) return d.slice(-10);
    return d;
  }

  function normalizeEmail(raw) {
    return clip(raw, 160).toLowerCase();
  }

  function isValidEmail(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return true;
    return s.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  function emailError(raw) {
    return isValidEmail(raw) ? "" : "Enter a valid email address.";
  }

  function mailtoUrl(email, subject, body) {
    const addr = normalizeEmail(email);
    if (!addr || emailError(addr)) return "";
    return `mailto:${addr}?subject=${encodeURIComponent(subject || "")}&body=${encodeURIComponent(body || "")}`;
  }

  function dueReminder({ shopName, customerName, outstanding } = {}) {
    const shop = String(shopName || "Shop").trim() || "Shop";
    const name = String(customerName || "Customer").trim() || "Customer";
    const amount = Number(outstanding);
    const due = Number.isFinite(amount)
      ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount)
      : "";
    return {
      subject: `${shop} · payment reminder`,
      body: [shop, name, due ? `Outstanding ${due}` : "Outstanding balance", "Please clear the pending amount."].join("\n"),
    };
  }

  function normalizeGstin(raw) {
    return clip(raw, 32).toUpperCase().replace(/\s+/g, "");
  }

  function isWalkIn(customer) {
    if (!customer) return true;
    return customer.code === "CUS-001" || /^walk-?in$/i.test(String(customer.name || "").trim());
  }

  function isMerged(customer) {
    return Boolean(customer?.merged_into) || String(customer?.status || "").toLowerCase() === "merged";
  }

  function isPlaceholderMobile(raw) {
    const m = normalizeMobile(raw);
    return PLACEHOLDER_MOBILES.has(m);
  }

  function isActiveCustomer(customer) {
    return Boolean(customer?.id) && !isWalkIn(customer) && !isMerged(customer);
  }

  function customerKeys(customer) {
    const mobile = normalizeMobile(customer?.mobile);
    const email = normalizeEmail(customer?.email);
    const gstin = normalizeGstin(customer?.gstin);
    return {
      mobile: mobile.length === 10 && !PLACEHOLDER_MOBILES.has(mobile) ? mobile : "",
      email,
      gstin: gstin.length >= 10 ? gstin : "",
    };
  }

  function matchReasons(left, right) {
    const a = customerKeys(left);
    const b = customerKeys(right);
    const reasons = [];
    if (a.mobile && a.mobile === b.mobile) reasons.push("mobile");
    if (a.email && a.email === b.email) reasons.push("email");
    if (a.gstin && a.gstin === b.gstin) reasons.push("gstin");
    return reasons;
  }

  function sameCustomer(left, right) {
    return matchReasons(left, right).length > 0;
  }

  function findMatch(customers, input, excludeId) {
    const want = {
      mobile: normalizeMobile(input?.mobile),
      email: normalizeEmail(input?.email),
      gstin: normalizeGstin(input?.gstin),
    };
    const rows = (customers || []).filter((c) => isActiveCustomer(c) && c.id !== excludeId);
    return (
      rows.find((c) => {
        const keys = customerKeys(c);
        if (want.mobile.length === 10 && keys.mobile === want.mobile) return true;
        if (want.email && keys.email === want.email) return true;
        if (want.gstin.length >= 10 && keys.gstin === want.gstin) return true;
        return false;
      }) || null
    );
  }

  function groupDuplicates(customers) {
    const rows = (customers || []).filter(isActiveCustomer);
    const parent = new Map();
    const find = (id) => {
      const p = parent.get(id);
      if (!p || p === id) return id;
      const root = find(p);
      parent.set(id, root);
      return root;
    };
    const union = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(rb, ra);
    };
    const byKey = { mobile: new Map(), email: new Map(), gstin: new Map() };
    for (const row of rows) {
      parent.set(row.id, row.id);
      const keys = customerKeys(row);
      for (const field of ["mobile", "email", "gstin"]) {
        const value = keys[field];
        if (!value) continue;
        const prev = byKey[field].get(value);
        if (prev) union(prev, row.id);
        else byKey[field].set(value, row.id);
      }
    }
    const buckets = new Map();
    for (const row of rows) {
      const root = find(row.id);
      if (!buckets.has(root)) buckets.set(root, []);
      buckets.get(root).push(row);
    }
    return [...buckets.values()]
      .filter((members) => members.length > 1)
      .map((members) => {
        const reasons = new Set();
        for (let i = 0; i < members.length; i++) {
          for (let j = i + 1; j < members.length; j++) {
            matchReasons(members[i], members[j]).forEach((r) => reasons.add(r));
          }
        }
        const primary = pickPrimary(members);
        return {
          key: primary.id,
          reasons: [...reasons],
          primary_id: primary.id,
          members: members.sort((a, b) => String(a.code || "").localeCompare(String(b.code || ""))),
          count: members.length,
          outstanding: members.reduce((s, c) => s + (Number(c.outstanding) || 0), 0),
        };
      })
      .sort((a, b) => b.count - a.count || b.outstanding - a.outstanding);
  }

  function pickPrimary(members) {
    return [...(members || [])].sort((a, b) => {
      const bills = (Number(b.bill_count) || 0) - (Number(a.bill_count) || 0);
      if (bills) return bills;
      const due = (Number(b.outstanding) || 0) - (Number(a.outstanding) || 0);
      if (due) return due;
      const created = String(a.created_at || "").localeCompare(String(b.created_at || ""));
      if (created) return created;
      return String(a.code || "").localeCompare(String(b.code || ""));
    })[0] || null;
  }

  function summarizeDuplicates(groups, customers) {
    const rows = groupDuplicates(customers || groups?.flatMap((g) => g.members) || []);
    const list = Array.isArray(groups) && groups.length && groups[0]?.members ? groups : rows;
    return {
      groups: list.length,
      extra: list.reduce((s, g) => s + Math.max(0, (g.count || g.members?.length || 0) - 1), 0),
      outstanding: list.reduce((s, g) => s + (Number(g.outstanding) || 0), 0),
    };
  }

  function activeCustomers(customers) {
    return (customers || []).filter((c) => !isMerged(c));
  }

  function warningCopy(match, input) {
    if (!match) return "";
    const reasons = matchReasons(match, input).join(", ") || "details";
    return `A customer already exists with the same ${reasons}: ${match.business_name || match.name || "Customer"} (${match.mobile || match.code || match.id}). Use that record instead of creating another.`;
  }

  root.POSCustomerMaster = {
    PLACEHOLDER_MOBILES,
    clip,
    normalizeMobile,
    normalizeEmail,
    isValidEmail,
    emailError,
    mailtoUrl,
    dueReminder,
    normalizeGstin,
    isWalkIn,
    isMerged,
    isPlaceholderMobile,
    isActiveCustomer,
    customerKeys,
    matchReasons,
    sameCustomer,
    findMatch,
    groupDuplicates,
    pickPrimary,
    summarizeDuplicates,
    activeCustomers,
    warningCopy,
  };
})(typeof window !== "undefined" ? window : globalThis);
