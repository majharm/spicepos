(function (root, factory) {
  const api = factory();
  root.POSOffers = api;
  if (typeof window !== "undefined") window.POSOffers = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }
  function num(n, fallback = 0) {
    const v = Number(n);
    return Number.isFinite(v) ? v : fallback;
  }
  function asList(v) {
    if (Array.isArray(v)) return v.map((x) => String(x || "").trim()).filter(Boolean);
    if (v == null || v === "") return [];
    return String(v)
      .split(/[,|]/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  function parseJson(raw, fallback) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
    if (typeof raw !== "string" || !raw.trim()) return fallback || {};
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" ? v : fallback || {};
    } catch {
      return fallback || {};
    }
  }
  function ymd(d) {
    if (!d) return "";
    if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  }
  function hm(d) {
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return "00:00";
    return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  }

  const TYPES = [
    { id: "combo", label: "Combo / bundle", scope: "lines" },
    { id: "product", label: "Product discount", scope: "lines" },
    { id: "category", label: "Category offer", scope: "lines" },
    { id: "bogo", label: "Buy X Get Y", scope: "lines" },
    { id: "mix_match", label: "Mix & Match", scope: "lines" },
    { id: "qty", label: "Quantity offer", scope: "lines" },
    { id: "spend", label: "Buy more, save more", scope: "bill" },
    { id: "min_purchase", label: "Minimum purchase", scope: "bill" },
    { id: "free_gift", label: "Free product", scope: "lines" },
    { id: "customer", label: "Customer group", scope: "bill" },
    { id: "first_purchase", label: "First purchase", scope: "bill" },
    { id: "repeat", label: "Repeat customer", scope: "bill" },
    { id: "time", label: "Happy hours / time", scope: "bill" },
    { id: "day", label: "Day-wise", scope: "bill" },
    { id: "festival", label: "Festival / seasonal", scope: "bill" },
    { id: "clearance", label: "Clearance", scope: "lines" },
  ];

  const STATUSES = ["draft", "scheduled", "active", "paused", "expired", "completed"];

  const ELIGIBILITY = [
    { id: "all", label: "All customers" },
    { id: "vip", label: "VIP" },
    { id: "new", label: "New customers" },
    { id: "regular", label: "Regular" },
    { id: "inactive", label: "Inactive" },
    { id: "high_value", label: "High-spending" },
    { id: "wholesale", label: "Wholesale" },
    { id: "b2b", label: "B2B" },
  ];

  const STACKING = [
    { id: "product_and_bill", label: "Product offer + bill offer" },
    { id: "one", label: "Only one offer per bill" },
    { id: "highest", label: "Highest discount only" },
    { id: "priority", label: "Highest priority offer" },
    { id: "stack", label: "Allow multiple offers" },
  ];

  const TEMPLATES = [
    { id: "bogo", name: "Buy 1 Get 1", type: "bogo", discount_type: "pct", discount_value: 100, conditions: { buy_qty: 1, get_qty: 1, get_discount_type: "pct", get_discount_value: 100 } },
    { id: "b2g1", name: "Buy 2 Get 1", type: "bogo", discount_type: "pct", discount_value: 100, conditions: { buy_qty: 2, get_qty: 1, get_discount_type: "pct", get_discount_value: 100 } },
    { id: "flat_amt", name: "Flat ₹ OFF", type: "product", discount_type: "amt", discount_value: 50 },
    { id: "flat_pct", name: "Flat % OFF", type: "product", discount_type: "pct", discount_value: 10 },
    { id: "combo_price", name: "Combo price", type: "combo", discount_type: "combo_price", discount_value: 0, conditions: {} },
    { id: "mix", name: "Mix & Match", type: "mix_match", discount_type: "combo_price", discount_value: 299, conditions: { pick_count: 3, bundle_price: 299 } },
    { id: "spend", name: "Spend & Save", type: "min_purchase", discount_type: "amt", discount_value: 100, min_spend: 999 },
    { id: "gift", name: "Free gift", type: "free_gift", discount_type: "pct", discount_value: 100 },
    { id: "clearance", name: "Clearance sale", type: "clearance", discount_type: "pct", discount_value: 20 },
    { id: "happy", name: "Happy hours", type: "time", discount_type: "pct", discount_value: 15, start_time: "16:00", end_time: "19:00" },
    { id: "first", name: "First purchase", type: "first_purchase", discount_type: "amt", discount_value: 100, min_spend: 999, customer_eligibility: "new" },
    { id: "birthday", name: "Customer birthday", type: "customer", discount_type: "pct", discount_value: 10, customer_eligibility: "all", conditions: { birthday: true } },
    { id: "loyalty", name: "Loyalty bonus", type: "customer", discount_type: "pct", discount_value: 5, loyalty_multiplier: 2 },
    { id: "festival", name: "Festival sale", type: "festival", discount_type: "pct", discount_value: 15 },
    { id: "weekend", name: "Weekend sale", type: "day", discount_type: "pct", discount_value: 10, days_of_week: "0,6" },
    { id: "flash", name: "Flash sale", type: "time", discount_type: "pct", discount_value: 20, start_time: "14:00", end_time: "16:00" },
  ];

  function typeMeta(id) {
    return TYPES.find((t) => t.id === id) || TYPES[0];
  }

  function parseConditions(offer) {
    const c = parseJson(offer?.conditions_json || offer?.conditions, {});
    return {
      item_ids: asList(c.item_ids || c.items || [offer?.item_a_id, offer?.item_b_id]),
      category: String(c.category || offer?.category || "").trim(),
      exclude_item_ids: asList(c.exclude_item_ids || c.exclusions),
      buy_qty: num(c.buy_qty, 1),
      get_qty: num(c.get_qty, 1),
      get_item_id: String(c.get_item_id || "").trim(),
      get_discount_type: c.get_discount_type || "pct",
      get_discount_value: num(c.get_discount_value, 100),
      pick_count: num(c.pick_count, 3),
      bundle_price: num(c.bundle_price ?? offer?.offer_price, 0),
      qty_tiers: Array.isArray(c.qty_tiers) ? c.qty_tiers : [],
      spend_tiers: Array.isArray(c.spend_tiers) ? c.spend_tiers : [],
      repeat_bills: num(c.repeat_bills, 5),
      free_item_id: String(c.free_item_id || "").trim(),
      birthday: Boolean(c.birthday),
      goal: String(c.goal || ""),
    };
  }

  function normalize(input = {}) {
    const type = TYPES.some((t) => t.id === input.offer_type || t.id === input.type)
      ? String(input.offer_type || input.type)
      : "product";
    const status = STATUSES.includes(input.status) ? input.status : "draft";
    const discountType = String(input.discount_type || input.discountType || "pct").toLowerCase();
    const allowed = ["pct", "amt", "price", "combo_price"];
    const cond = parseConditions(input);
    if (input.item_ids) cond.item_ids = asList(input.item_ids);
    if (input.item_a_id && input.item_b_id) cond.item_ids = [input.item_a_id, input.item_b_id];
    if (input.category) cond.category = String(input.category).trim();
    if (input.pick_count) cond.pick_count = num(input.pick_count);
    if (input.bundle_price != null) cond.bundle_price = num(input.bundle_price);
    if (input.buy_qty != null) cond.buy_qty = num(input.buy_qty);
    if (input.get_qty != null) cond.get_qty = num(input.get_qty);
    if (input.get_item_id) cond.get_item_id = String(input.get_item_id);
    if (input.free_item_id) cond.free_item_id = String(input.free_item_id);
    if (input.qty_tiers) cond.qty_tiers = input.qty_tiers;
    if (input.spend_tiers) cond.spend_tiers = input.spend_tiers;
    const name = String(input.name || "").trim();
    if (!name) return null;
    return {
      name,
      description: String(input.description || "").trim(),
      offer_type: type,
      status,
      start_date: ymd(input.start_date || input.startDate) || null,
      end_date: ymd(input.end_date || input.endDate) || null,
      start_time: String(input.start_time || input.startTime || "").slice(0, 5) || null,
      end_time: String(input.end_time || input.endTime || "").slice(0, 5) || null,
      days_of_week: String(input.days_of_week || input.daysOfWeek || "").trim() || null,
      min_qty: input.min_qty != null && input.min_qty !== "" ? num(input.min_qty) : null,
      max_qty: input.max_qty != null && input.max_qty !== "" ? num(input.max_qty) : null,
      min_spend: input.min_spend != null && input.min_spend !== "" ? num(input.min_spend) : null,
      discount_type: allowed.includes(discountType) ? discountType : "pct",
      discount_value: num(input.discount_value ?? input.discountValue),
      offer_price: input.offer_price != null && input.offer_price !== "" ? num(input.offer_price) : null,
      usage_limit: input.usage_limit != null && input.usage_limit !== "" ? Math.max(0, Math.floor(num(input.usage_limit))) : null,
      used_count: Math.max(0, Math.floor(num(input.used_count))),
      customer_eligibility: ELIGIBILITY.some((e) => e.id === input.customer_eligibility) ? input.customer_eligibility : "all",
      branch_id: String(input.branch_id || input.branchId || "").trim() || null,
      stacking: STACKING.some((s) => s.id === input.stacking) ? input.stacking : "stack",
      priority: Math.max(1, Math.min(100, Math.floor(num(input.priority, 50)))),
      loyalty_multiplier: Math.max(1, num(input.loyalty_multiplier ?? input.loyaltyMultiplier, 1)),
      conditions: cond,
      conditions_json: JSON.stringify(cond),
    };
  }

  function copyName(name) {
    const base = String(name || "Offer").replace(/\s+copy(?:\s+\d+)?$/i, "").trim() || "Offer";
    return `${base} copy`.slice(0, 180);
  }

  function cloneOfferInput(row = {}) {
    const cond = parseConditions(row);
    const srcStatus = String(row.status || row.live_status || "draft");
    const status = srcStatus === "scheduled" ? "scheduled" : srcStatus === "active" ? "active" : "draft";
    const n = normalize({
      ...row,
      name: copyName(row.name),
      status,
      used_count: 0,
      item_ids: cond.item_ids,
      category: cond.category,
      buy_qty: cond.buy_qty,
      get_qty: cond.get_qty,
      get_item_id: cond.get_item_id,
      pick_count: cond.pick_count,
      bundle_price: cond.bundle_price,
      free_item_id: cond.free_item_id,
      qty_tiers: cond.qty_tiers,
      spend_tiers: cond.spend_tiers,
    });
    if (n) n.used_count = 0;
    return n;
  }

  function liveStatus(offer, now = new Date()) {
    const st = String(offer?.status || "draft");
    if (st === "paused" || st === "completed" || st === "draft") return st;
    const day = ymd(now);
    if (offer?.end_date && day > String(offer.end_date).slice(0, 10)) return "expired";
    if (offer?.start_date && day < String(offer.start_date).slice(0, 10)) return "scheduled";
    if (st === "scheduled") return "active";
    if (st === "expired") return "expired";
    return "active";
  }

  function dayMatches(offer, now) {
    const raw = String(offer?.days_of_week || "").trim();
    if (!raw) return true;
    const map = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const want = raw
      .toLowerCase()
      .split(/[,|]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => (map[x.slice(0, 3)] != null ? map[x.slice(0, 3)] : Number(x)));
    return want.includes(now.getDay());
  }

  function timeMatches(offer, now) {
    const start = String(offer?.start_time || "").slice(0, 5);
    const end = String(offer?.end_time || "").slice(0, 5);
    if (!start && !end) return true;
    const cur = hm(now);
    if (start && end && start > end) return cur >= start || cur <= end;
    if (start && cur < start) return false;
    if (end && cur > end) return false;
    return true;
  }

  function inWindow(offer, now = new Date()) {
    if (liveStatus(offer, now) !== "active") return false;
    if (!dayMatches(offer, now)) return false;
    if (!timeMatches(offer, now)) return false;
    const limit = offer?.usage_limit;
    if (limit != null && Number(limit) > 0 && num(offer.used_count) >= Number(limit)) return false;
    return true;
  }

  function customerGroup(customer = {}) {
    const spend = num(customer.lifetime_spend ?? customer.takings);
    const bills = num(customer.bills ?? customer.lifetime_bills);
    const days = customer.daysSince != null ? num(customer.daysSince, 999) : bills > 0 ? num(customer.daysSince, 0) : 999;
    const type = String(customer.type || "").toLowerCase();
    if (type === "b2b") return "b2b";
    if (type === "wholesale") return "wholesale";
    if (bills <= 0 && spend <= 0) return "new";
    if (days >= 45 && bills > 0) return "inactive";
    if (spend >= 25000 || bills >= 12) return "vip";
    if (spend >= 8000 || bills >= 6) return "high_value";
    if (bills >= 3) return "regular";
    return "occasional";
  }

  function eligibleCustomer(offer, customer = {}) {
    const need = String(offer?.customer_eligibility || "all");
    if (need === "all") {
      const cond = parseConditions(offer);
      if (cond.birthday && !customer.isBirthday) return false;
      return true;
    }
    const group = customer.segment || customerGroup(customer);
    if (need === "wholesale") return group === "wholesale" || group === "b2b" || String(customer.type).toLowerCase() === "b2b";
    if (need === "new") return group === "new" || num(customer.bills) <= 0;
    return group === need;
  }

  function pieceQty(line) {
    if (line.isCount || line.item?.unit_kind === "count") return Math.max(0, num(line.qty ?? line.qtyGm ?? line.quantity_gm));
    const q = num(line.qty ?? line.qtyGm ?? line.quantity_gm);
    return q > 200 ? round2(q / 1000) : q;
  }

  function lineGrossOf(line) {
    return num(line.gross ?? line.taxable ?? line.amount ?? line.total);
  }

  function qualifyingLines(offer, cart) {
    const cond = parseConditions(offer);
    const type = offer.offer_type || offer.type;
    return (cart || []).filter((line) => {
      const id = String(line.itemId || line.item_id || line.item?.id || "");
      if (cond.exclude_item_ids.includes(id)) return false;
      if (cond.item_ids.length && ["combo", "product", "bogo", "mix_match", "qty", "clearance", "free_gift"].includes(type)) {
        if (type === "bogo" && cond.get_item_id && id === cond.get_item_id) return true;
        if (type === "free_gift" && cond.free_item_id && id === cond.free_item_id) return true;
        return cond.item_ids.includes(id);
      }
      if ((type === "category" || cond.category) && cond.category) {
        const cat = String(line.category || line.item?.category || "");
        return cat.toLowerCase() === cond.category.toLowerCase();
      }
      return !cond.item_ids.length && !cond.category;
    });
  }

  function discountOn(base, type, value) {
    const b = Math.max(0, num(base));
    const v = Math.max(0, num(value));
    if (b <= 0 || v <= 0) return 0;
    if (type === "pct") return round2(Math.min(b, (b * v) / 100));
    return round2(Math.min(b, v));
  }

  function comboFromLegacy(combo) {
    if (!combo) return null;
    return {
      id: combo.id,
      name: combo.name,
      offer_type: "combo",
      status: combo.status || "active",
      discount_type: combo.discount_type || "pct",
      discount_value: num(combo.discount_value, 8),
      customer_eligibility: "all",
      priority: 40,
      stacking: "stack",
      loyalty_multiplier: 1,
      conditions_json: JSON.stringify({ item_ids: [combo.item_a_id, combo.item_b_id].filter(Boolean) }),
      item_a_id: combo.item_a_id,
      item_b_id: combo.item_b_id,
      legacy_combo: true,
    };
  }

  function evaluateOffer(offer, ctx = {}) {
    const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
    if (!inWindow(offer, now)) return null;
    if (ctx.branchId && offer.branch_id && String(offer.branch_id) !== String(ctx.branchId)) return null;
    if (!eligibleCustomer(offer, ctx.customer || {})) return null;
    const cond = parseConditions(offer);
    const type = offer.offer_type || offer.type || "product";
    const cart = ctx.cart || [];
    const lines = qualifyingLines(offer, cart);
    const qty = lines.reduce((s, l) => s + pieceQty(l), 0);
    const spend = round2(lines.reduce((s, l) => s + lineGrossOf(l), 0));
    const billSpend = round2(cart.reduce((s, l) => s + lineGrossOf(l), 0));
    if (offer.min_qty != null && qty < num(offer.min_qty)) return null;
    if (offer.max_qty != null && qty > num(offer.max_qty)) return null;
    const minSpend = num(offer.min_spend);
    const scopeSpend = ["spend", "min_purchase", "customer", "first_purchase", "repeat", "time", "day", "festival"].includes(type)
      ? (cond.item_ids.length || cond.category ? spend : billSpend)
      : spend;
    if (minSpend > 0 && scopeSpend < minSpend) return null;

    let discount = 0;
    let message = offer.name || "Offer";
    let scope = typeMeta(type).scope;
    const lineDiscounts = {};

    if (type === "combo") {
      const ids = cond.item_ids;
      if (ids.length < 2) return null;
      const have = new Set(cart.map((l) => String(l.itemId || l.item_id)));
      if (!ids.every((id) => have.has(String(id)))) return null;
      const comboLines = cart.filter((l) => ids.includes(String(l.itemId || l.item_id)));
      const total = round2(comboLines.reduce((s, l) => s + lineGrossOf(l), 0));
      if (offer.discount_type === "combo_price" || offer.offer_price != null) {
        const price = num(offer.offer_price ?? cond.bundle_price ?? offer.discount_value);
        discount = round2(Math.max(0, total - price));
      } else {
        discount = discountOn(total, offer.discount_type, offer.discount_value);
      }
      message = `${offer.name}: combo save ${discount}`;
      scope = "bill";
    } else if (type === "mix_match") {
      const n = Math.max(1, cond.pick_count);
      const price = num(cond.bundle_price || offer.offer_price || offer.discount_value);
      if (lines.length < n || price <= 0) return null;
      const priced = lines
        .map((l) => ({ id: String(l.itemId || l.lineId || ""), gross: lineGrossOf(l), qty: pieceQty(l) }))
        .sort((a, b) => b.gross - a.gross);
      const sets = Math.floor(priced.length / n);
      if (!sets) return null;
      let regular = 0;
      for (let i = 0; i < sets * n; i += 1) regular += priced[i].gross;
      discount = round2(Math.max(0, regular - price * sets));
      message = `${offer.name}: pick ${n} for ₹${price}`;
      scope = "bill";
    } else if (type === "bogo") {
      const buyIds = cond.item_ids;
      const getId = cond.get_item_id || buyIds[0];
      const buyLines = cart.filter((l) => buyIds.includes(String(l.itemId || l.item_id)));
      const getLines = cart.filter((l) => String(l.itemId || l.item_id) === String(getId));
      const buyQ = buyLines.reduce((s, l) => s + pieceQty(l), 0);
      const sets = Math.floor(buyQ / Math.max(1, cond.buy_qty));
      const freeQ = sets * Math.max(0, cond.get_qty);
      if (freeQ <= 0 || !getLines.length) return null;
      const getGross = getLines.reduce((s, l) => s + lineGrossOf(l), 0);
      const getQ = getLines.reduce((s, l) => s + pieceQty(l), 0);
      const unit = getQ > 0 ? getGross / getQ : 0;
      const applyQ = Math.min(freeQ, getQ);
      discount = discountOn(round2(unit * applyQ), cond.get_discount_type, cond.get_discount_value);
      getLines.forEach((l) => {
        const key = l.lineId || l.itemId;
        lineDiscounts[key] = round2((lineDiscounts[key] || 0) + discount / getLines.length);
      });
      message = `${offer.name}: Buy ${cond.buy_qty} Get ${cond.get_qty}`;
      scope = "lines";
    } else if (type === "qty") {
      const tiers = (cond.qty_tiers || []).slice().sort((a, b) => num(b.qty) - num(a.qty));
      lines.forEach((l) => {
        const q = pieceQty(l);
        const tier = tiers.find((t) => q >= num(t.qty));
        if (!tier) return;
        const d = discountOn(lineGrossOf(l), tier.type || offer.discount_type, tier.value);
        if (d > 0) {
          lineDiscounts[l.lineId || l.itemId] = d;
          discount = round2(discount + d);
        }
      });
      if (discount <= 0) return null;
      message = `${offer.name}: quantity price`;
      scope = "lines";
    } else if (type === "spend") {
      const tiers = (cond.spend_tiers || []).slice().sort((a, b) => num(b.spend) - num(a.spend));
      const base = cond.item_ids.length || cond.category ? spend : billSpend;
      const tier = tiers.find((t) => base >= num(t.spend));
      if (!tier) return null;
      discount = discountOn(base, tier.type || offer.discount_type, tier.value);
      message = `${offer.name}: spend ₹${tier.spend}+`;
      scope = "bill";
    } else if (type === "free_gift") {
      const needQty = num(offer.min_qty, cond.buy_qty || 1);
      const needSpend = num(offer.min_spend);
      if (needSpend > 0 && billSpend < needSpend && qty < needQty) return null;
      if (needSpend <= 0 && qty < needQty && !cond.free_item_id) return null;
      const giftId = cond.free_item_id || cond.item_ids[0];
      const gift = cart.find((l) => String(l.itemId || l.item_id) === String(giftId));
      if (gift) {
        discount = discountOn(lineGrossOf(gift), offer.discount_type || "pct", offer.discount_value || 100);
        lineDiscounts[gift.lineId || gift.itemId] = discount;
      } else {
        const catalog = (ctx.items || []).find((i) => i.id === giftId);
        discount = catalog ? num(catalog.retail_rate || catalog.rate_per_kg) : 0;
      }
      if (discount <= 0 && !giftId) return null;
      message = `${offer.name}: free gift`;
      scope = "lines";
    } else if (["product", "category", "clearance"].includes(type)) {
      if (!lines.length) return null;
      lines.forEach((l) => {
        let d = 0;
        if (offer.discount_type === "price" || offer.offer_price != null) {
          const special = num(offer.offer_price);
          d = round2(Math.max(0, lineGrossOf(l) - special * (l.isCount ? pieceQty(l) : 1)));
        } else {
          d = discountOn(lineGrossOf(l), offer.discount_type, offer.discount_value);
        }
        if (d > 0) {
          lineDiscounts[l.lineId || l.itemId] = d;
          discount = round2(discount + d);
        }
      });
      if (discount <= 0) return null;
      message = offer.name;
      scope = "lines";
    } else {
      const base = cond.item_ids.length || cond.category ? spend : billSpend;
      if (type === "first_purchase" && num((ctx.customer || {}).bills) > 0) return null;
      if (type === "repeat" && num((ctx.customer || {}).bills) < cond.repeat_bills) return null;
      if (base <= 0) return null;
      discount = discountOn(base, offer.discount_type, offer.discount_value);
      if (discount <= 0) return null;
      message = offer.name;
      scope = "bill";
    }

    if (discount <= 0 && type !== "free_gift") return null;
    return {
      id: offer.id,
      name: offer.name,
      offer_type: type,
      scope,
      discount: round2(discount),
      savings: round2(discount),
      message,
      lineDiscounts,
      priority: num(offer.priority, 50),
      stacking: offer.stacking || "stack",
      loyalty_multiplier: num(offer.loyalty_multiplier, 1),
      exclusive: offer.stacking === "exclusive" || offer.stacking === "one",
    };
  }

  function evaluateAll(offers, ctx = {}) {
    const rule = ctx.stacking || ctx.settings?.stacking || "product_and_bill";
    const matches = (offers || []).map((o) => evaluateOffer(o, ctx)).filter(Boolean);
    matches.sort((a, b) => b.discount - a.discount || a.priority - b.priority);
    if (!matches.length) return { applied: [], available: [], discount: 0, billDiscount: 0, lineDiscounts: {}, loyaltyMultiplier: 1, message: "" };
    let chosen = matches;
    if (rule === "one" || rule === "highest") chosen = [matches[0]];
    else if (rule === "priority") chosen = [matches.slice().sort((a, b) => a.priority - b.priority)[0]];
    else if (rule === "product_and_bill") {
      const line = matches.filter((m) => m.scope === "lines").slice(0, 1);
      const bill = matches.filter((m) => m.scope === "bill").slice(0, 1);
      chosen = [...line, ...bill];
      if (!chosen.length) chosen = [matches[0]];
    }
    const exclusive = matches.find((m) => m.exclusive);
    if (exclusive && rule !== "stack") chosen = [exclusive];
    const lineDiscounts = {};
    let billDiscount = 0;
    chosen.forEach((m) => {
      if (m.scope === "bill") billDiscount = round2(billDiscount + m.discount);
      Object.entries(m.lineDiscounts || {}).forEach(([k, v]) => {
        lineDiscounts[k] = round2((lineDiscounts[k] || 0) + num(v));
      });
    });
    const discount = round2(billDiscount + Object.values(lineDiscounts).reduce((s, v) => s + num(v), 0));
    const loyaltyMultiplier = Math.max(1, ...chosen.map((m) => num(m.loyalty_multiplier, 1)));
    return {
      applied: chosen,
      available: matches,
      discount,
      billDiscount,
      lineDiscounts,
      loyaltyMultiplier,
      message: chosen.map((m) => m.message || m.name).join(" · "),
    };
  }

  function profitPreview(offer, items = []) {
    const cond = parseConditions(offer);
    const ids = cond.item_ids;
    const rows = (items || []).filter((i) => !ids.length || ids.includes(i.id));
    const scoped = cond.category ? rows.filter((i) => String(i.category || "").toLowerCase() === cond.category.toLowerCase()) : rows;
    const pick = (ids.length ? scoped.filter((i) => ids.includes(i.id)) : scoped).slice(0, 8);
    const original = round2(pick.reduce((s, i) => s + num(i.retail_rate || i.rate_per_kg || i.mrp), 0));
    const cost = round2(pick.reduce((s, i) => s + num(i.purchase_rate || i.cost), 0));
    let discount = 0;
    if (offer.discount_type === "combo_price" || offer.offer_price != null) {
      discount = round2(Math.max(0, original - num(offer.offer_price ?? cond.bundle_price ?? offer.discount_value)));
    } else {
      discount = discountOn(original, offer.discount_type, offer.discount_value);
    }
    const expected = round2(Math.max(0, original - discount));
    const profit = round2(expected - cost);
    const marginBefore = original > 0 ? round2(((original - cost) / original) * 100) : 0;
    const marginAfter = expected > 0 ? round2((profit / expected) * 100) : 0;
    const breakEven = profit > 0 ? 1 : discount > 0 && original - cost > 0 ? Math.ceil(discount / Math.max(0.01, original - cost)) : 0;
    return {
      originalRevenue: original,
      discount,
      cost,
      expectedRevenue: expected,
      expectedProfit: profit,
      marginBefore,
      marginAfter,
      breakEvenQty: breakEven,
      warning: marginAfter < 10 && original > 0 ? `This discount reduces your margin from ${marginBefore}% to ${marginAfter}%.` : "",
    };
  }

  function suggestFromGrowth(growth = {}, items = []) {
    const top = growth.products?.top || [];
    const slow = growth.products?.slow || growth.inventory?.slow || [];
    const hour = growth.bestHour || growth.hours?.[0];
    const out = [];
    if (top[0] && top[1]) {
      const a = items.find((i) => i.id === (top[0].itemId || top[0].id)) || top[0];
      const b = items.find((i) => i.id === (top[1].itemId || top[1].id)) || top[1];
      const regular = num(a.retail_rate || a.amount) + num(b.retail_rate || b.amount);
      const combo = regular > 0 ? round2(regular * 0.92) : 0;
      out.push({
        goal: "sales",
        type: "combo",
        name: `${a.name || top[0].name} + ${b.name || top[1].name} combo`,
        text: `Customers who buy ${top[0].name} also add other fast movers. Try a combo at ₹${combo || "a small discount"}.`,
        draft: normalize({
          name: `${top[0].name} + ${top[1].name}`,
          type: "combo",
          status: "draft",
          discount_type: regular ? "combo_price" : "pct",
          discount_value: regular ? 0 : 8,
          offer_price: combo || null,
          item_ids: [top[0].itemId || top[0].id, top[1].itemId || top[1].id].filter(Boolean),
        }),
      });
    }
    if (slow.length) {
      out.push({
        goal: "stock",
        type: "clearance",
        name: "Clearance opportunity",
        text: `${slow.length} products are slow or dead. A 15–30% clearance offer can free shelf space.`,
        draft: normalize({
          name: "Clearance 20% off",
          type: "clearance",
          status: "draft",
          discount_type: "pct",
          discount_value: 20,
          item_ids: slow.slice(0, 12).map((p) => p.itemId || p.id).filter(Boolean),
        }),
      });
    }
    out.push({
      goal: "customers",
      type: "first_purchase",
      name: "Welcome offer",
      text: "₹100 OFF on the first purchase above ₹999 brings new walk-ins back as billed customers.",
      draft: normalize({
        name: "Welcome ₹100 off",
        type: "first_purchase",
        status: "draft",
        discount_type: "amt",
        discount_value: 100,
        min_spend: 999,
        customer_eligibility: "new",
      }),
    });
    out.push({
      goal: "retention",
      type: "customer",
      name: "Bring back inactive customers",
      text: "Inactive buyers (45+ days) respond to a small extra discount on the next bill.",
      draft: normalize({
        name: "We miss you — 10% off",
        type: "customer",
        status: "draft",
        discount_type: "pct",
        discount_value: 10,
        customer_eligibility: "inactive",
      }),
    });
    if (hour?.hour != null || hour?.label) {
      const h = num(hour.hour, 16);
      const start = `${String(h).padStart(2, "0")}:00`;
      const end = `${String((h + 3) % 24).padStart(2, "0")}:00`;
      out.push({
        goal: "sales",
        type: "time",
        name: "Happy hours",
        text: `${hour.label || start} is a strong window. A 15% happy-hour offer can lift the average bill.`,
        draft: normalize({
          name: "Happy hours 15% off",
          type: "time",
          status: "draft",
          discount_type: "pct",
          discount_value: 15,
          start_time: start,
          end_time: end,
        }),
      });
    }
    return out;
  }

  function resultNarrative(stats = {}) {
    const lift = num(stats.salesLiftPct);
    const extra = num(stats.extraRevenue);
    const margin = num(stats.margin);
    const name = stats.name || "This offer";
    if (!stats.bills) return `${name} has no billed redemptions yet.`;
    const liftBit = lift ? ` increased sales by ${Math.abs(lift)}%` : " is live";
    const extraBit = extra ? ` and generated ₹${extra.toLocaleString("en-IN")} additional revenue` : "";
    const marginBit = margin ? ` while maintaining a ${margin}% profit margin` : "";
    return `${name}${liftBit}${extraBit}${marginBit}.`;
  }

  return {
    TYPES,
    TEMPLATES,
    STATUSES,
    ELIGIBILITY,
    STACKING,
    typeMeta,
    parseConditions,
    normalize,
    copyName,
    cloneOfferInput,
    liveStatus,
    inWindow,
    customerGroup,
    eligibleCustomer,
    qualifyingLines,
    comboFromLegacy,
    evaluateOffer,
    evaluateAll,
    profitPreview,
    suggestFromGrowth,
    resultNarrative,
    round2,
  };
});
