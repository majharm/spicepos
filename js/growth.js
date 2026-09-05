let growthBound = false;
let growthData = null;

function growthPct(n) {
  const v = Number(n) || 0;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(v % 1 ? 1 : 0)}%`;
}

function growthPctClass(n) {
  const v = Number(n) || 0;
  if (v > 0.5) return "is-up";
  if (v < -0.5) return "is-down";
  return "is-flat";
}

function svgBars(rows, key, color = "#0d9488") {
  const list = (rows || []).filter((r) => r && (r.label || r.name));
  if (!list.length) return `<p class="hint">No billed data in this range yet.</p>`;
  const w = 560;
  const h = 188;
  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 36;
  const vals = list.map((r) => Number(r[key]) || 0);
  const max = Math.max(...vals, 1);
  const bw = (w - padL - padR) / list.length;
  const bars = list
    .map((r, i) => {
      const v = Number(r[key]) || 0;
      const bh = ((v / max) * (h - padT - padB)) || 0;
      const x = padL + i * bw + 2;
      const y = h - padB - bh;
      const label = escapeHtml(String(r.label || r.name || "").replace(/^\d{4}-/, ""));
      return `<rect x="${x}" y="${y}" width="${Math.max(bw - 4, 2)}" height="${Math.max(bh, 0)}" fill="${color}" rx="3">
        <title>${label}: ${money(v)}</title></rect>
        <text x="${x + Math.max(bw - 4, 2) / 2}" y="${h - 12}" text-anchor="middle" class="growth-chart-label">${list.length > 16 && i % 2 ? "" : label}</text>`;
    })
    .join("");
  return `<svg class="growth-svg" viewBox="0 0 ${w} ${h}" role="img">${bars}</svg>`;
}

function svgLine(rows, key, color = "#0f766e") {
  const list = (rows || []).filter((r) => r && (r.label || r.name));
  if (!list.length) return `<p class="hint">No billed data in this range yet.</p>`;
  const w = 560;
  const h = 188;
  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 36;
  const vals = list.map((r) => Number(r[key]) || 0);
  const max = Math.max(...vals, 1);
  const step = list.length > 1 ? (w - padL - padR) / (list.length - 1) : 0;
  const pts = list
    .map((r, i) => {
      const v = Number(r[key]) || 0;
      const x = padL + i * step;
      const y = padT + (1 - v / max) * (h - padT - padB);
      return `${x},${y}`;
    })
    .join(" ");
  return `<svg class="growth-svg" viewBox="0 0 ${w} ${h}" role="img">
    <polyline fill="none" stroke="${color}" stroke-width="2.5" points="${pts}" />
  </svg>`;
}

function svgDonut(rows, key) {
  const list = (rows || []).slice(0, 6);
  const total = list.reduce((s, r) => s + (Number(r[key]) || 0), 0) || 1;
  const colors = ["#0d9488", "#134e4a", "#f59e0b", "#8c1d40", "#64748b", "#38bdf8"];
  let angle = -Math.PI / 2;
  const cx = 90;
  const cy = 90;
  const r = 70;
  const parts = list
    .map((row, i) => {
      const v = Number(row[key]) || 0;
      const slice = (v / total) * Math.PI * 2;
      const a2 = angle + slice;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(a2);
      const y2 = cy + r * Math.sin(a2);
      const large = slice > Math.PI ? 1 : 0;
      angle = a2;
      return `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="${colors[i % colors.length]}">
        <title>${escapeHtml(row.name || row.label || "")}: ${money(v)}</title></path>`;
    })
    .join("");
  const legend = list
    .map(
      (row, i) =>
        `<li><i style="background:${colors[i % colors.length]}"></i>${escapeHtml(row.name || row.label || "—")} <b>${money(row[key])}</b></li>`,
    )
    .join("");
  return `<div class="growth-donut"><svg viewBox="0 0 180 180" class="growth-svg growth-svg-round">${parts}</svg><ul>${legend}</ul></div>`;
}

function chartRows(data, range) {
  const days = data.charts?.daywise || [];
  if (range === "day") return days.slice(-14);
  if (range === "week") {
    const buckets = [];
    days.forEach((row, i) => {
      const idx = Math.floor(i / 7);
      if (!buckets[idx]) buckets[idx] = { label: `W${idx + 1}`, takings: 0, bills: 0 };
      buckets[idx].takings += Number(row.takings) || 0;
      buckets[idx].bills += Number(row.bills) || 0;
    });
    return buckets;
  }
  return days;
}

function renderGrowthKpis(data) {
  const k = data.kpis || {};
  const cards = [
    ["Today's sales", money(k.todaySales), growthPct(data.compare?.todayVsYesterday)],
    ["Sales growth", growthPct(k.salesGrowth), "vs last week"],
    ["Today's profit", money(k.todayProfit), ""],
    ["Gross margin", `${Number(k.margin || 0).toFixed(1)}%`, "this month"],
    ["Bills / orders", k.todayBills || 0, `Avg bill ${money(k.avgBill)}`],
    ["New customers", k.newCustomers || 0, "this month"],
    ["Returning customers", k.returningCustomers || 0, "last 90 days"],
    ["Stock value", money(k.stockValue), ""],
    ["Low stock items", k.lowStock || 0, ""],
    ["Damaged / wastage", money(k.damaged), "this month"],
    ["Expenses", money(k.expenses), "this month"],
    ["Outstanding", money(k.outstanding), ""],
    ["Growth score", `${k.score || 0}/100`, ""],
  ];
  $("growth-kpis").innerHTML = cards
    .map(
      ([label, value, note]) =>
        `<div class="report-card"><span>${escapeHtml(label)}</span><strong>${value}</strong>${note ? `<em>${escapeHtml(String(note))}</em>` : ""}</div>`,
    )
    .join("");
}

function renderGrowthScore(data) {
  const s = data.score || {};
  $("growth-hero-stats").innerHTML = `
    <div class="items-stat"><span>Score</span><strong>${s.score || 0}/100</strong></div>
    <div class="items-stat"><span>Week</span><strong class="${growthPctClass(data.compare?.weekVsLast)}">${growthPct(data.compare?.weekVsLast)}</strong></div>
    <div class="items-stat"><span>Margin</span><strong>${Number(data.kpis?.margin || 0).toFixed(1)}%</strong></div>`;
  $("growth-score").innerHTML = `
    <div class="growth-score-card">
      <div class="growth-score-ring" style="--score:${s.score || 0}">
        <strong>${s.score || 0}</strong>
        <span>/100</span>
      </div>
      <div>
        <h3>Business Growth Score: ${s.score || 0}/100</h3>
        <ul class="growth-stars">
          <li>Sales ${escapeHtml(s.stars?.sales || "")}</li>
          <li>Profit ${escapeHtml(s.stars?.profit || "")}</li>
          <li>Customers ${escapeHtml(s.stars?.customers || "")}</li>
          <li>Inventory ${escapeHtml(s.stars?.inventory || "")}</li>
          <li>Retention ${escapeHtml(s.stars?.retention || "")}</li>
        </ul>
        <p class="lede"><b>Main growth opportunity:</b> ${escapeHtml(data.opportunity || "")}</p>
      </div>
    </div>`;
}

function renderGrowthActions(data) {
  const groups = [
    ["urgent", "Urgent"],
    ["attention", "Attention needed"],
    ["growth", "Growth opportunities"],
  ];
  $("growth-actions").innerHTML = groups
    .map(([level, title]) => {
      const rows = (data.actions || []).filter((a) => a.level === level);
      if (!rows.length) return "";
      return `<div class="growth-action-col is-${level}">
        <h4>${title}</h4>
        ${rows
          .map(
            (a) => `<article class="growth-action">
              <div><strong>${escapeHtml(a.title)}</strong><p>${escapeHtml(a.detail || "")}</p></div>
              <button class="btn primary" type="button" ${
                a.kind === "combo" || a.jump === "combo"
                  ? `data-growth-combo="1"`
                  : `data-growth-jump="${escapeHtml(a.jump || "reports")}"`
              }>${escapeHtml(a.action || "Open")}</button>
            </article>`,
          )
          .join("")}
      </div>`;
    })
    .join("") || `<p class="hint">No urgent actions from this shop's latest bills.</p>`;
}

function productTable(rows, cols) {
  if (!rows?.length) return `<p class="hint">No products in this list yet.</p>`;
  return `<div class="table-wrap"><table><thead><tr>${cols.map((c) => `<th>${c[0]}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${cols.map((c) => `<td>${c[1](r)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}

function renderGrowthProducts(data) {
  $("growth-top-products").innerHTML = productTable(data.products?.top || [], [
    ["Product", (r) => escapeHtml(r.name)],
    ["Revenue", (r) => money(r.amount)],
    ["Profit", (r) => money(r.profit)],
    ["Margin", (r) => `${Number(r.margin || 0).toFixed(1)}%`],
    ["Growth", (r) => `<span class="${growthPctClass(r.growth)}">${growthPct(r.growth)}</span>`],
  ]);
  const weak = [...(data.products?.slow || []), ...(data.products?.dead || []), ...(data.products?.weakMargin || [])]
    .filter((p, i, all) => all.findIndex((x) => x.name === p.name) === i)
    .slice(0, 8);
  $("growth-slow-products").innerHTML = productTable(weak, [
    ["Product", (r) => escapeHtml(r.name)],
    ["Revenue", (r) => money(r.amount)],
    ["Margin", (r) => `${Number(r.margin || 0).toFixed(1)}%`],
    ["Note", (r) => (Number(r.amount) <= 0 ? "No sales / dead stock" : Number(r.margin) < 8 ? "Low margin" : "Slow moving")],
  ]);
}

function renderGrowthInventory(data) {
  const reorders = data.inventory?.reorders || [];
  $("growth-inventory").innerHTML = `
    <div class="report-grid growth-mini-grid">
      <div class="report-card"><span>Out of stock</span><strong>${(data.inventory?.out || []).length}</strong></div>
      <div class="report-card"><span>Low stock</span><strong>${(data.inventory?.low || []).length}</strong></div>
      <div class="report-card"><span>Overstock</span><strong>${(data.inventory?.over || []).length}</strong></div>
    </div>
    ${
      reorders.length
        ? `<ul class="growth-list">${reorders
            .map(
              (r) =>
                `<li><div><strong>${escapeHtml(r.name)}</strong><p>${escapeHtml(r.text)}</p></div>
                <button class="btn" type="button" data-growth-jump="purchases">Reorder</button></li>`,
            )
            .join("")}</ul>`
        : `<p class="hint">No reorder pressure on tracked items.</p>`
    }`;
}

function renderGrowthCustomers(data) {
  const c = data.customers || {};
  $("growth-customers").innerHTML = `
    <div class="report-grid growth-mini-grid">
      <div class="report-card"><span>Total</span><strong>${c.total || 0}</strong></div>
      <div class="report-card"><span>New</span><strong>${c.new || 0}</strong></div>
      <div class="report-card"><span>Returning</span><strong>${c.returning || 0}</strong></div>
      <div class="report-card"><span>VIP / high value</span><strong>${c.vip || 0}</strong></div>
      <div class="report-card"><span>Inactive 45d</span><strong>${c.inactive || 0}</strong></div>
    </div>
    <div class="growth-chips">${(c.segments || [])
      .map((s) => `<span class="growth-chip">${escapeHtml(s.name)} <b>${s.count || 0}</b></span>`)
      .join("")}</div>
    ${productTable(c.top || [], [
      ["Customer", (r) => escapeHtml(r.name)],
      ["Bills", (r) => r.bills || 0],
      ["Spend", (r) => money(r.takings)],
      ["Segment", (r) => escapeHtml(r.segment || "")],
    ])}`;
}

function renderGrowthRecs(data) {
  const recs = data.recommendations || [];
  const promos = data.promotions || [];
  $("growth-recs").innerHTML = `
    <div class="growth-rec-grid">
      ${recs
        .map((r) => `<article class="growth-rec is-${escapeHtml(r.kind || "sales")}"><h4>${escapeHtml(r.title)}</h4><p>${escapeHtml(r.text)}</p></article>`)
        .join("")}
    </div>
    <h4 class="growth-subhead">Suggested campaigns</h4>
    <div class="growth-rec-grid">
      ${promos
        .map(
          (p) => `<article class="growth-rec"><h4>${escapeHtml(p.name)}</h4><p>${escapeHtml(p.text)}</p><em>${escapeHtml(p.expected || "")}</em>${
            /combo/i.test(p.name || "") ? `<button class="btn" type="button" data-growth-combo="1">Create offer</button>` : ""
          }</article>`,
        )
        .join("") || `<p class="hint">More campaign ideas appear after a few weeks of bills.</p>`}
    </div>
    <p class="hint">${escapeHtml(data.discount?.note || "")}</p>`;
}

function renderGrowthForecast(data) {
  const f = data.forecast || {};
  const compare = data.compare || {};
  $("growth-forecast").innerHTML = `
    <div class="report-grid growth-mini-grid">
      <div class="report-card"><span>Tomorrow (estimate)</span><strong>${money(f.tomorrow)}</strong></div>
      <div class="report-card"><span>Next 7 days</span><strong>${money(f.next7)}</strong></div>
      <div class="report-card"><span>Next 30 days</span><strong>${money(f.next30)}</strong></div>
      <div class="report-card"><span>Trend</span><strong class="${growthPctClass(f.trend)}">${growthPct(f.trend)}</strong></div>
    </div>
    <div class="report-grid growth-mini-grid">
      <div class="report-card"><span>Today vs yesterday</span><strong class="${growthPctClass(compare.todayVsYesterday)}">${growthPct(compare.todayVsYesterday)}</strong></div>
      <div class="report-card"><span>This week vs last</span><strong class="${growthPctClass(compare.weekVsLast)}">${growthPct(compare.weekVsLast)}</strong></div>
      <div class="report-card"><span>This month vs last</span><strong class="${growthPctClass(compare.monthVsLast)}">${growthPct(compare.monthVsLast)}</strong></div>
      <div class="report-card"><span>This year vs last</span><strong class="${growthPctClass(compare.yearVsLast)}">${growthPct(compare.yearVsLast)}</strong></div>
    </div>
    <p class="hint">Actual sales → AI forecast uses this shop's recent daily bills. It is a shop-data estimate, not an external market forecast. Target vs actual uses week-on-week growth as the short target.</p>
    ${
      data.branches?.length > 1
        ? `<h4 class="growth-subhead">Branches</h4>${productTable(data.branches, [
            ["Branch", (r) => escapeHtml(r.name)],
            ["Bills", (r) => r.bills || 0],
            ["Sales", (r) => money(r.takings)],
          ])}`
        : ""
    }`;
}

function renderGrowthExpand(data) {
  const shop = data.expansion || [];
  const market = data.market || [];
  $("growth-expand").innerHTML = `
    <ul class="growth-list">${shop.map((x) => `<li><div><strong>From your shop data</strong><p>${escapeHtml(x.text)}</p></div></li>`).join("")}</ul>
    <ul class="growth-list is-market">${market.map((x) => `<li><div><strong>Market estimate</strong><p>${escapeHtml(x.text)}</p></div></li>`).join("")}</ul>`;
}

function renderGrowthCharts(data) {
  const range = $("growth-chart-range")?.value || "month";
  const sales = chartRows(data, range);
  $("growth-charts").innerHTML = `
    <figure class="growth-chart"><figcaption>Sales trend</figcaption>${svgLine(sales, "takings")}</figure>
    <figure class="growth-chart"><figcaption>Number of bills</figcaption>${svgBars(sales, "bills", "#134e4a")}</figure>
    <figure class="growth-chart"><figcaption>Sales by hour</figcaption>${svgBars(data.charts?.hourwise || [], "takings", "#0ea5e9")}</figure>
    <figure class="growth-chart"><figcaption>Sales by weekday</figcaption>${svgBars(data.charts?.weekday || [], "takings", "#f59e0b")}</figure>
    <figure class="growth-chart growth-chart-wide"><figcaption>Revenue by category</figcaption>${svgDonut(data.charts?.categories || [], "amount")}</figure>`;
}

function renderGrowthAsk(data) {
  // Ask Business AI — keyword answers from this shop's billed snapshot.
  const chips = data.askExamples || [];
  $("growth-ask-chips").innerHTML = chips
    .map((q) => `<button class="btn" type="button" data-growth-ask="${escapeHtml(q)}">${escapeHtml(q)}</button>`)
    .join("");
}

function renderGrowthAll(data) {
  growthData = data;
  $("growth-summary").textContent = data.summary || "Open this page after you have sales on this shop.";
  $("growth-opportunity").textContent = data.opportunity || "";
  $("growth-alerts").innerHTML = (data.alerts || [])
    .map((t) => `<p class="growth-alert">⚠ ${escapeHtml(t)}</p>`)
    .join("");
  renderGrowthKpis(data);
  renderGrowthScore(data);
  renderGrowthActions(data);
  renderGrowthCharts(data);
  renderGrowthProducts(data);
  renderGrowthInventory(data);
  renderGrowthCustomers(data);
  renderGrowthRecs(data);
  renderGrowthForecast(data);
  renderGrowthExpand(data);
  renderGrowthAsk(data);
  if ($("growth-excel") && typeof posUrl === "function") $("growth-excel").href = posUrl("/api/growth/excel");
}

function bindGrowthUi() {
  if (growthBound) return;
  growthBound = true;
  const root = $("view-growth");
  root?.addEventListener("click", (e) => {
    if (e.target.closest("[data-growth-combo]")) {
      openComboDraft();
      return;
    }
    const jump = e.target.closest("[data-growth-jump]");
    if (jump) {
      showView(jump.dataset.growthJump);
      return;
    }
    const ask = e.target.closest("[data-growth-ask]");
    if (ask) {
      $("growth-ask-q").value = ask.dataset.growthAsk;
      void askGrowthQuestion(ask.dataset.growthAsk);
    }
  });
  $("growth-ask-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await askGrowthQuestion($("growth-ask-q")?.value || "");
  });
  $("growth-chart-range")?.addEventListener("change", () => {
    if (growthData) renderGrowthCharts(growthData);
  });
  $("growth-combo-form")?.addEventListener("submit", (e) => void saveComboOffer(e));
  $("combo-item-a")?.addEventListener("change", syncComboNameFromItems);
  $("combo-item-b")?.addEventListener("change", syncComboNameFromItems);
  $("combo-open-counter")?.addEventListener("click", () => showView("counter"));
  $("growth-refresh")?.addEventListener("click", () => loadGrowthDashboard(true));
  $("growth-print")?.addEventListener("click", () => {
    printFinance({
      title: "AI Growth report",
      html: ($("growth-kpis")?.outerHTML || "") + ($("growth-summary")?.outerHTML || "") + ($("growth-actions")?.outerHTML || "") + ($("growth-recs")?.outerHTML || ""),
      asOf: growthData?.range?.today,
    });
  });
}

function findShopItem(ref) {
  if (!ref) return null;
  const items = typeof state !== "undefined" ? state.items || [] : [];
  const id = String(ref.id || ref.itemId || "").trim();
  if (id) return items.find((i) => i.id === id) || { id, name: ref.name || "" };
  const name = String(ref.name || "").trim().toLowerCase();
  return items.find((i) => String(i.name || "").trim().toLowerCase() === name) || null;
}

function fillComboItemSelects(selectedA, selectedB) {
  const items = ((typeof state !== "undefined" ? state.items : []) || [])
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  const opts = `<option value="">Select item</option>${items
    .map((i) => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.name)}</option>`)
    .join("")}`;
  ["combo-item-a", "combo-item-b"].forEach((id, idx) => {
    const el = $(id);
    if (!el) return;
    el.innerHTML = opts;
    el.value = idx === 0 ? selectedA || "" : selectedB || "";
  });
}

function paintSavedCombos() {
  const el = $("combo-saved");
  if (!el) return;
  const rows = ((typeof state !== "undefined" ? state.combos : []) || []).filter((c) => String(c.status || "active") === "active");
  el.textContent = rows.length ? `Saved: ${rows.map((c) => c.name).join(" · ")}` : "";
}

function comboDraftFromAnalysis() {
  const action = (growthData?.actions || []).find((a) => a.kind === "combo") || {};
  const top = growthData?.products?.top || [];
  const a = findShopItem(action.itemA) || findShopItem(top[0]);
  const b = findShopItem(action.itemB) || findShopItem(top[1]);
  return {
    name: a && b ? `${a.name} + ${b.name}` : "Combo offer",
    itemA: a,
    itemB: b,
    discountValue: Number(action.discountValue || 8),
  };
}

function syncComboNameFromItems() {
  const items = (typeof state !== "undefined" ? state.items : []) || [];
  const a = items.find((i) => i.id === $("combo-item-a")?.value);
  const b = items.find((i) => i.id === $("combo-item-b")?.value);
  if (a && b && $("combo-name")) $("combo-name").value = `${a.name} + ${b.name}`;
}

function openComboDraft() {
  // Create combo offer from the two top-selling catalog items.
  const draft = comboDraftFromAnalysis();
  const form = $("growth-combo-form");
  if (!form) return;
  form.hidden = false;
  fillComboItemSelects(draft.itemA?.id || "", draft.itemB?.id || "");
  paintSavedCombos();
  if ($("combo-name")) $("combo-name").value = draft.name;
  if ($("combo-pct")) $("combo-pct").value = draft.discountValue;
  if ($("combo-hint")) {
    $("combo-hint").textContent = draft.itemA && draft.itemB
      ? `Bundle ${draft.itemA.name} with ${draft.itemB.name}. Counter can add both and apply the discount.`
      : "Pick two catalog items to save a combo for the Counter.";
    $("combo-hint").className = draft.itemA && draft.itemB ? "hint" : "hint";
  }
  form.scrollIntoView({ block: "nearest" });
  $("combo-name")?.focus();
}

async function saveComboOffer(e) {
  e?.preventDefault?.();
  const draft = comboDraftFromAnalysis();
  const name = ($("combo-name")?.value || draft.name || "").trim();
  const pct = Number($("combo-pct")?.value || draft.discountValue || 8);
  const a = $("combo-item-a")?.value || draft.itemA?.id || "";
  const b = $("combo-item-b")?.value || draft.itemB?.id || "";
  if (!name || !a || !b) {
    $("combo-hint").textContent = "Pick two different items from this shop's catalog.";
    $("combo-hint").className = "hint error";
    return;
  }
  try {
    $("combo-hint").textContent = "Saving combo…";
    $("combo-hint").className = "hint";
    const data = await api("/api/combos", {
      method: "POST",
      body: JSON.stringify({ name, item_a_id: a, item_b_id: b, discount_type: "pct", discount_value: pct }),
    });
    if (typeof state !== "undefined") {
      state.combos = [...(state.combos || []).filter((c) => c.id !== data.combo?.id), data.combo].filter(Boolean);
      if (typeof paintComboBar === "function") paintComboBar();
    }
    paintSavedCombos();
    $("combo-hint").textContent = `${data.combo?.name || name} saved. Open Counter and tap the combo to add both items with ${pct}% off.`;
    $("combo-hint").className = "hint ok";
    $("growth-hint").textContent = "Combo offer saved — use it on the next bill.";
    $("growth-hint").className = "hint ok";
  } catch (err) {
    $("combo-hint").textContent = err.message;
    $("combo-hint").className = "hint error";
  }
}

async function askGrowthQuestion(question) {
  const q = String(question || "").trim();
  if (!q) return;
  $("growth-ask-answer").textContent = "Reading this shop's latest bills…";
  try {
    const data = await api("/api/growth/ask", { method: "POST", body: JSON.stringify({ question: q }) });
    $("growth-ask-answer").textContent = data.answer || "No answer from this shop's data yet.";
    $("growth-hint").textContent = "Answer uses this shop's billed sales, stock, and customers — not an external model.";
    $("growth-hint").className = "hint ok";
  } catch (err) {
    $("growth-ask-answer").textContent = err.message;
    $("growth-hint").textContent = err.message;
    $("growth-hint").className = "hint error";
  }
}

async function loadGrowthDashboard() {
  bindGrowthUi();
  $("growth-hint").textContent = "Reading sales, stock, and customers…";
  $("growth-hint").className = "hint";
  try {
    const data = await api("/api/growth");
    renderGrowthAll(data);
    $("growth-hint").textContent = "Shop-data estimate · what happened → why → what to do.";
    $("growth-hint").className = "hint ok";
  } catch (err) {
    $("growth-hint").textContent = err.message;
    $("growth-hint").className = "hint error";
    $("growth-summary").textContent = err.message;
  }
}
