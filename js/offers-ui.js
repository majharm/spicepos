let offersBound = false;
let offerDraft = null;
let offerList = [];
let offerStats = null;
let offerFilter = "active";

function offerEngine() {
  return globalThis.POSOffers;
}

function fillOfferSelects() {
  const items = (state.items || []).slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  const cats = [...new Set(items.map((i) => i.category).filter(Boolean))];
  const itemOpts = items.map((i) => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.name)}</option>`).join("");
  const catOpts = `<option value="">Any category</option>${cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}`;
  const multi = $("off-items");
  const getItem = $("off-get-item");
  const gift = $("off-free-item");
  const cat = $("off-category");
  const branch = $("off-branch");
  if (multi) multi.innerHTML = itemOpts;
  if (getItem) getItem.innerHTML = `<option value="">Same as buy item</option>${itemOpts}`;
  if (gift) gift.innerHTML = `<option value="">None</option>${itemOpts}`;
  if (cat) cat.innerHTML = catOpts;
  if (branch && state.branches) {
    branch.innerHTML = `<option value="">All branches</option>${(state.branches || [])
      .map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`)
      .join("")}`;
  }
}

function selectedOfferItems() {
  return [...($("off-items")?.selectedOptions || [])].map((o) => o.value).filter(Boolean);
}

function readOfferForm() {
  const O = offerEngine();
  const qtyTiers = ($("off-qty-tiers")?.value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [qty, type, value] = line.split(/[,\s]+/);
      return { qty: Number(qty), type: type === "amt" ? "amt" : "pct", value: Number(value) };
    });
  const spendTiers = ($("off-spend-tiers")?.value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [spend, type, value] = line.split(/[,\s]+/);
      return { spend: Number(spend), type: type === "amt" ? "amt" : "pct", value: Number(value) };
    });
  return O?.normalize({
    name: $("off-name")?.value,
    description: $("off-desc")?.value,
    type: $("off-type")?.value,
    status: $("off-status")?.value || "draft",
    start_date: $("off-start")?.value,
    end_date: $("off-end")?.value,
    start_time: $("off-start-time")?.value,
    end_time: $("off-end-time")?.value,
    days_of_week: $("off-days")?.value,
    min_qty: $("off-min-qty")?.value,
    max_qty: $("off-max-qty")?.value,
    min_spend: $("off-min-spend")?.value,
    discount_type: $("off-disc-type")?.value,
    discount_value: $("off-disc-value")?.value,
    offer_price: $("off-price")?.value,
    usage_limit: $("off-limit")?.value,
    customer_eligibility: $("off-elig")?.value,
    branch_id: $("off-branch")?.value,
    stacking: $("off-stack")?.value,
    priority: $("off-priority")?.value,
    loyalty_multiplier: $("off-loyalty")?.value,
    item_ids: selectedOfferItems(),
    category: $("off-category")?.value,
    buy_qty: $("off-buy-qty")?.value,
    get_qty: $("off-get-qty")?.value,
    get_item_id: $("off-get-item")?.value,
    pick_count: $("off-pick")?.value,
    bundle_price: $("off-bundle")?.value,
    free_item_id: $("off-free-item")?.value,
    qty_tiers: qtyTiers,
    spend_tiers: spendTiers,
  });
}

function paintOfferProfit() {
  const O = offerEngine();
  const el = $("off-profit");
  if (!O || !el) return;
  const draft = readOfferForm();
  if (!draft) {
    el.innerHTML = `<p class="hint">Name the offer to see profit protection.</p>`;
    return;
  }
  const p = O.profitPreview(draft, state.items || []);
  el.innerHTML = `
    <ul class="offer-profit-list">
      <li>Original revenue <b>${money(p.originalRevenue)}</b></li>
      <li>Discount <b>${money(p.discount)}</b></li>
      <li>Product cost <b>${money(p.cost)}</b></li>
      <li>Expected revenue <b>${money(p.expectedRevenue)}</b></li>
      <li>Expected profit <b>${money(p.expectedProfit)}</b></li>
      <li>Margin ${p.marginBefore}% → <b>${p.marginAfter}%</b></li>
      <li>Break-even qty <b>${p.breakEvenQty || "—"}</b></li>
    </ul>
    ${p.warning ? `<p class="hint error">${escapeHtml(p.warning)}</p>` : `<p class="hint ok">Margin stays healthy on this basket.</p>`}`;
}

function applyOfferDraft(draft, id) {
  offerDraft = { ...(draft || {}), id: id || draft?.id || "" };
  fillOfferSelects();
  const set = (key, val) => {
    if ($(key) && val != null) $(key).value = val;
  };
  set("off-id", offerDraft.id || "");
  set("off-name", offerDraft.name || "");
  set("off-desc", offerDraft.description || "");
  set("off-type", offerDraft.offer_type || "product");
  set("off-status", offerDraft.status || "draft");
  set("off-start", (offerDraft.start_date || "").slice(0, 10));
  set("off-end", (offerDraft.end_date || "").slice(0, 10));
  set("off-start-time", offerDraft.start_time || "");
  set("off-end-time", offerDraft.end_time || "");
  set("off-days", offerDraft.days_of_week || "");
  set("off-min-qty", offerDraft.min_qty ?? "");
  set("off-max-qty", offerDraft.max_qty ?? "");
  set("off-min-spend", offerDraft.min_spend ?? "");
  set("off-disc-type", offerDraft.discount_type || "pct");
  set("off-disc-value", offerDraft.discount_value ?? "");
  set("off-price", offerDraft.offer_price ?? "");
  set("off-limit", offerDraft.usage_limit ?? "");
  set("off-elig", offerDraft.customer_eligibility || "all");
  set("off-branch", offerDraft.branch_id || "");
  set("off-stack", offerDraft.stacking || "stack");
  set("off-priority", offerDraft.priority ?? 50);
  set("off-loyalty", offerDraft.loyalty_multiplier ?? 1);
  const cond = offerDraft.conditions || offerEngine()?.parseConditions(offerDraft) || {};
  set("off-category", cond.category || "");
  set("off-buy-qty", cond.buy_qty ?? 1);
  set("off-get-qty", cond.get_qty ?? 1);
  set("off-get-item", cond.get_item_id || "");
  set("off-pick", cond.pick_count ?? 3);
  set("off-bundle", cond.bundle_price ?? "");
  set("off-free-item", cond.free_item_id || "");
  if ($("off-qty-tiers")) $("off-qty-tiers").value = (cond.qty_tiers || []).map((t) => `${t.qty} ${t.type || "pct"} ${t.value}`).join("\n");
  if ($("off-spend-tiers")) $("off-spend-tiers").value = (cond.spend_tiers || []).map((t) => `${t.spend} ${t.type || "pct"} ${t.value}`).join("\n");
  if ($("off-items")) {
    [...$("off-items").options].forEach((o) => {
      o.selected = (cond.item_ids || []).includes(o.value);
    });
  }
  $("offer-form-wrap").hidden = false;
  $("off-form-title").textContent = offerDraft.id ? "Edit offer" : "Create new offer";
  paintOfferProfit();
  $("off-name")?.focus();
}

function resetOfferForm() {
  applyOfferDraft(offerEngine()?.normalize({ name: "New offer", type: "product", status: "draft", discount_type: "pct", discount_value: 10 }) || { name: "New offer" });
  if ($("off-id")) $("off-id").value = "";
  offerDraft = { ...offerDraft, id: "" };
}

function paintOfferDash(stats) {
  const c = stats?.counts || {};
  $("offer-dash").innerHTML = `
    <article class="offer-kpi"><strong>${c.active || 0}</strong><span>Active</span></article>
    <article class="offer-kpi"><strong>${c.scheduled || 0}</strong><span>Scheduled</span></article>
    <article class="offer-kpi"><strong>${(stats?.expiring || []).length}</strong><span>Expiring soon</span></article>
    <article class="offer-kpi"><strong>${money(stats?.totals?.revenue || 0)}</strong><span>Offer sales</span></article>
    <article class="offer-kpi"><strong>${money(stats?.totals?.discount || 0)}</strong><span>Discount given</span></article>
    <article class="offer-kpi"><strong>${stats?.totals?.customers || 0}</strong><span>Customers</span></article>`;
}

function paintOfferIdeas(ideas) {
  const root = $("offer-ai");
  if (!root) return;
  root.innerHTML = (ideas || [])
    .map(
      (idea, idx) => `<article class="offer-idea">
        <h4>${escapeHtml(idea.name)}</h4>
        <p>${escapeHtml(idea.text)}</p>
        <button class="btn primary" type="button" data-offer-idea="${idx}">Create offer</button>
      </article>`,
    )
    .join("") || `<p class="hint">AI ideas appear after a few billed days.</p>`;
  root._ideas = ideas || [];
}

function paintOfferList() {
  const rows = offerList.filter((o) => {
    const st = o.live_status || o.status;
    if (offerFilter === "all") return true;
    if (offerFilter === "expiring") return (offerStats?.expiring || []).some((x) => x.id === o.id);
    return st === offerFilter;
  });
  $("offer-list").innerHTML = rows
    .map((o) => {
      const st = o.live_status || o.status;
      const cond = o.conditions || {};
      const items = (cond.item_ids || []).map((id) => state.items.find((i) => i.id === id)?.name || id).filter(Boolean);
      return `<article class="offer-card is-${escapeHtml(st)}">
        <header>
          <strong>${escapeHtml(o.name)}</strong>
          <span class="offer-status">${escapeHtml(st)}</span>
        </header>
        <p>${escapeHtml(o.description || o.offer_type)} ${items.length ? `· ${escapeHtml(items.slice(0, 3).join(" + "))}` : ""}</p>
        <p class="hint">${escapeHtml(o.offer_type)} · ${o.discount_type === "pct" ? `${o.discount_value}%` : money(o.offer_price || o.discount_value)} off · used ${o.used_count || 0}${o.usage_limit ? `/${o.usage_limit}` : ""}</p>
        <div class="dash-actions">
          <button class="btn" type="button" data-offer-edit="${escapeHtml(o.id)}">Edit</button>
          <button class="btn" type="button" data-offer-status="${escapeHtml(o.id)}" data-status="${st === "active" ? "paused" : "active"}">${st === "active" ? "Pause" : "Activate"}</button>
          <button class="btn" type="button" data-offer-dup="${escapeHtml(o.id)}">Duplicate</button>
          <button class="btn" type="button" data-offer-status="${escapeHtml(o.id)}" data-status="completed">End</button>
        </div>
      </article>`;
    })
    .join("") || `<p class="hint">No offers in this list yet. Use Create new offer or an AI suggestion.</p>`;
}

async function loadOffersDesk(force) {
  if (!force && offerList.length && $("view-offers")?.hidden) return;
  fillOfferSelects();
  try {
    const [list, stats, ideas, settings] = await Promise.all([
      api("/api/offers"),
      api("/api/offers/stats").catch(() => null),
      api("/api/offers/suggest").catch(() => ({ ideas: [] })),
      api("/api/offers/settings").catch(() => null),
    ]);
    offerList = Array.isArray(list) ? list : list?.offers || [];
    state.offers = offerList;
    offerStats = stats;
    paintOfferDash(stats);
    paintOfferList();
    paintOfferIdeas(ideas?.ideas || offerEngine()?.suggestFromGrowth({}, state.items) || []);
    if (settings && $("off-shop-stack")) $("off-shop-stack").value = settings.stacking || "product_and_bill";
    if (typeof paintOfferBar === "function") paintOfferBar();
    $("offers-hint").textContent = "Offers use this shop's catalog, bills, and stock — not an external model.";
    $("offers-hint").className = "hint ok";
  } catch (err) {
    $("offers-hint").textContent = err.message;
    $("offers-hint").className = "hint error";
  }
}

async function duplicateOfferById(id) {
  if (!id) return;
  try {
    $("offers-hint").textContent = "Copying offer…";
    $("offers-hint").className = "hint";
    const data = await api(`/api/offers/${encodeURIComponent(id)}/duplicate`, { method: "POST" });
    const offer = data.offer || data;
    offerFilter = "all";
    document.querySelectorAll("[data-offer-filter]").forEach((b) => b.classList.toggle("primary", b.dataset.offerFilter === "all"));
    await loadOffersDesk(true);
    if (offer) applyOfferDraft(offer, offer.id);
    $("offers-hint").textContent = `${offer?.name || "Copy"} created as a draft. Activate it when you want it on the Counter.`;
    $("offers-hint").className = "hint ok";
  } catch (err) {
    $("offers-hint").textContent = err.message || "Could not duplicate this offer";
    $("offers-hint").className = "hint error";
  }
}

async function saveOfferForm(e) {
  e?.preventDefault?.();
  const draft = readOfferForm();
  if (!draft) {
    $("off-form-hint").textContent = "Give the offer a name.";
    $("off-form-hint").className = "hint error";
    return;
  }
  const id = $("off-id")?.value;
  try {
    $("off-form-hint").textContent = "Saving…";
    $("off-form-hint").className = "hint";
    const data = id
      ? await api(`/api/offers/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(draft) })
      : await api("/api/offers", { method: "POST", body: JSON.stringify(draft) });
    const offer = data.offer || data;
    $("off-form-hint").textContent = `${offer.name} saved. Counter will apply it when the cart matches.`;
    $("off-form-hint").className = "hint ok";
    await loadOffersDesk(true);
  } catch (err) {
    $("off-form-hint").textContent = err.message;
    $("off-form-hint").className = "hint error";
  }
}

function bindOffersUi() {
  if (offersBound) return;
  offersBound = true;
  const O = offerEngine();
  if ($("off-type") && O) {
    $("off-type").innerHTML = O.TYPES.map((t) => `<option value="${t.id}">${t.label}</option>`).join("");
  }
  if ($("off-elig") && O) $("off-elig").innerHTML = O.ELIGIBILITY.map((t) => `<option value="${t.id}">${t.label}</option>`).join("");
  if ($("off-stack") && O) $("off-stack").innerHTML = O.STACKING.map((t) => `<option value="${t.id}">${t.label}</option>`).join("");
  if ($("off-shop-stack") && O) $("off-shop-stack").innerHTML = O.STACKING.map((t) => `<option value="${t.id}">${t.label}</option>`).join("");
  $("offer-templates").innerHTML = (O?.TEMPLATES || [])
    .map((t) => `<button class="btn" type="button" data-offer-tpl="${escapeHtml(t.id)}">${escapeHtml(t.name)}</button>`)
    .join("");
  $("view-offers")?.addEventListener("click", (e) => {
    const tpl = e.target.closest("[data-offer-tpl]");
    if (tpl) {
      const t = O.TEMPLATES.find((x) => x.id === tpl.dataset.offerTpl);
      if (t) applyOfferDraft(O.normalize({ ...t, status: "draft" }));
      return;
    }
    const idea = e.target.closest("[data-offer-idea]");
    if (idea) {
      const row = $("offer-ai")?._ideas?.[Number(idea.dataset.offerIdea)];
      if (row?.draft) applyOfferDraft(row.draft);
      return;
    }
    const edit = e.target.closest("[data-offer-edit]");
    if (edit) {
      const row = offerList.find((o) => o.id === edit.dataset.offerEdit);
      if (row) applyOfferDraft(row, row.id);
      return;
    }
    const dup = e.target.closest("[data-offer-dup]");
    if (dup) {
      void duplicateOfferById(dup.dataset.offerDup);
      return;
    }
    const st = e.target.closest("[data-offer-status]");
    if (st) {
      void api(`/api/offers/${encodeURIComponent(st.dataset.offerStatus)}/status`, {
        method: "POST",
        body: JSON.stringify({ status: st.dataset.status }),
      }).then(() => loadOffersDesk(true));
    }
  });
  $("offer-create")?.addEventListener("click", () => resetOfferForm());
  $("offer-ai-btn")?.addEventListener("click", async () => {
    const data = await api("/api/offers/suggest");
    paintOfferIdeas(data.ideas || []);
    $("offer-ai")?.scrollIntoView({ block: "nearest" });
  });
  $("offer-form")?.addEventListener("submit", (e) => void saveOfferForm(e));
  $("offer-form")?.addEventListener("input", () => paintOfferProfit());
  $("off-cancel")?.addEventListener("click", () => {
    $("offer-form-wrap").hidden = true;
  });
  document.querySelectorAll("[data-offer-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      offerFilter = btn.dataset.offerFilter;
      document.querySelectorAll("[data-offer-filter]").forEach((b) => b.classList.toggle("primary", b === btn));
      paintOfferList();
    });
  });
  $("off-shop-stack")?.addEventListener("change", async () => {
    await api("/api/offers/settings", { method: "PUT", body: JSON.stringify({ stacking: $("off-shop-stack").value, allow_loyalty: true }) });
  });
}

function openOffersCreate(draft) {
  showView("offers");
  bindOffersUi();
  if (draft) applyOfferDraft(offerEngine()?.normalize({ ...draft, status: "draft" }) || draft);
  else resetOfferForm();
}

window.openOffersCreate = openOffersCreate;
window.loadOffersDesk = loadOffersDesk;
window.bindOffersUi = bindOffersUi;
