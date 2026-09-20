(function (g) {
  const PANES = [
    ["overview", "Overview"],
    ["realtime", "Realtime"],
    ["acquisition", "Acquisition"],
    ["engagement", "Engagement"],
    ["landing", "Landing Pages"],
    ["conversions", "Conversions"],
    ["events", "Events"],
    ["devices", "Devices"],
    ["geo", "Geography"],
    ["campaigns", "Campaigns"],
    ["seo", "SEO Traffic"],
    ["reports", "Reports"],
    ["journey", "User Journey"],
    ["alerts", "Alerts"],
    ["settings", "Settings"],
  ];
  const EVENT_NAMES = [
    "page_view", "scroll", "click", "login_click", "signup_click", "get_started", "book_demo",
    "contact_submit", "phone_click", "email_click", "whatsapp_click", "pricing_view", "pricing_click",
    "feature_view", "business_category_view", "business_category_select", "ai_growth_view",
    "hardware_view", "weighing_scale_view", "qr_order_view", "demo_video_play", "faq_open", "download_brochure",
  ];

  function tabs(active) {
    return `<div class="settings-tabs ga-tabs" role="tablist">${PANES.map(
      ([id, label]) =>
        `<button class="btn${active === id ? " active" : ""}" type="button" data-ga-pane="${id}">${label}</button>`,
    ).join("")}</div>`;
  }

  function kpi(label, cell) {
    const v = cell?.value ?? 0;
    const ch = Number(cell?.change || 0);
    const cls = ch > 0 ? "up" : ch < 0 ? "down" : "";
    const sign = ch > 0 ? "+" : "";
    return `<div class="report-card ga-kpi"><span>${label}</span><strong>${v}</strong><em class="${cls}">${sign}${ch}% vs prior period</em></div>`;
  }

  function table(headers, rows) {
    if (!rows?.length) return `<p class="hint">No recorded website events for this view.</p>`;
    return `<div class="table-wrap"><table class="data"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
      .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></div>`;
  }

  function note(d) {
    return `<p class="hint ga-note">${d.note || ""} Website analytics are separate from POS sales, profit and inventory.</p>
      <div class="ga-ai"><h3>AI Analytics Summary</h3><ul>${(d.ai_summary || []).map((l) => `<li>${l}</li>`).join("")}</ul></div>`;
  }

  function rangeBar(range) {
    return `<div class="ga-range-row">
      <label class="ga-range">Period
        <select id="ga-range">
          <option value="today"${range === "today" ? " selected" : ""}>Today</option>
          <option value="yesterday"${range === "yesterday" ? " selected" : ""}>Yesterday</option>
          <option value="7d"${range === "7d" ? " selected" : ""}>7 Days</option>
          <option value="30d"${range === "30d" || !range ? " selected" : ""}>30 Days</option>
          <option value="90d"${range === "90d" ? " selected" : ""}>90 Days</option>
          <option value="custom"${range === "custom" ? " selected" : ""}>Custom Range</option>
        </select>
      </label>
      <label class="ga-range">From <input id="ga-from" type="date" /></label>
      <label class="ga-range">To <input id="ga-to" type="date" /></label>
    </div>`;
  }

  function qs(range, from, to) {
    if (range === "custom" && from && to) return `range=custom&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    return `range=${encodeURIComponent(range || "30d")}`;
  }

  async function download(api, range, from, to, filename) {
    const r = await api(`/api/master/analytics/export?${qs(range, from, to)}`);
    const blob = new Blob([r.csv || ""], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }

  function bindChrome(body, pane, opts, range) {
    body.querySelectorAll("[data-ga-pane]").forEach((b) => {
      b.onclick = () => opts?.setPane?.(b.dataset.gaPane);
    });
    body.querySelector("#ga-range")?.addEventListener("change", (e) => {
      render(body, pane, opts.api, opts, e.target.value);
    });
    body.querySelector("#ga-from")?.addEventListener("change", () => {
      const from = body.querySelector("#ga-from")?.value;
      const to = body.querySelector("#ga-to")?.value;
      if (from && to) render(body, pane, opts.api, opts, "custom", from, to);
    });
    body.querySelector("#ga-to")?.addEventListener("change", () => {
      const from = body.querySelector("#ga-from")?.value;
      const to = body.querySelector("#ga-to")?.value;
      if (from && to) render(body, pane, opts.api, opts, "custom", from, to);
    });
    body.querySelector("#ga-csv")?.addEventListener("click", () => download(opts.api, range, body.querySelector("#ga-from")?.value, body.querySelector("#ga-to")?.value, "atav-website-analytics.csv"));
    body.querySelector("#ga-xls")?.addEventListener("click", () => download(opts.api, range, body.querySelector("#ga-from")?.value, body.querySelector("#ga-to")?.value, "atav-website-analytics.xls"));
    body.querySelector("#ga-pdf")?.addEventListener("click", () => window.print());
  }

  async function render(body, pane, api, opts = {}, range = "30d", from, to) {
    opts.api = api;
    if (pane === "settings") {
      const s = await api("/api/master/analytics/settings");
      body.innerHTML = `${tabs(pane)}
        <p class="section-note">Measurement ID is not a secret. Do not paste OAuth refresh tokens here. Optional GA4 Data API credentials belong in the server environment as GA4_CREDENTIALS_JSON.</p>
        <p>Google Analytics Status: <strong>${s.connected ? "Connected" : "Not Connected"}</strong></p>
        <form id="ga-form" class="settings">
          <label>GA4 Measurement ID <input name="measurement_id" value="${s.measurement_id || ""}" placeholder="G-XXXXXXXXXX" autocomplete="off" /></label>
          <label>Google Tag ID <input name="google_tag_id" value="${s.google_tag_id || ""}" placeholder="G-XXXXXXXXXX" autocomplete="off" /></label>
          <label>GA4 Property ID (Data API, optional) <input name="property_id" value="${s.property_id || ""}" autocomplete="off" /></label>
          <label><input type="checkbox" name="connected" ${s.connected ? "checked" : ""} /> Connect Google Analytics tagging</label>
          <label><input type="checkbox" name="consent_required" ${s.consent_required ? "checked" : ""} /> Require cookie / analytics consent on the public site</label>
          <p>Default conversion events (change them on Conversions): ${(s.conversion_events || []).join(", ")}</p>
          <div class="settings-actions">
            <button class="btn primary" type="button" data-act="on">Connect Google Analytics</button>
            <button class="btn" type="button" data-act="test">Test Connection</button>
            <button class="btn primary" type="submit" data-act="save">Save</button>
            <button class="btn" type="button" data-act="off">Disconnect</button>
          </div>
          <p class="hint" id="ga-hint"></p>
        </form>
        <h3>Permissions</h3>
        <p>Master Admin can view analytics, realtime, acquisition, engagement, conversions, manage GA4 settings, events, conversion events, alerts, and export reports. Shop staff cannot.</p>`;
      const form = body.querySelector("#ga-form");
      const hint = body.querySelector("#ga-hint");
      const payload = () => {
        const fd = Object.fromEntries(new FormData(form).entries());
        fd.connected = form.connected.checked;
        fd.consent_required = form.consent_required.checked;
        fd.conversion_events = s.conversion_events;
        return fd;
      };
      form.onsubmit = async (e) => {
        e.preventDefault();
        await api("/api/master/analytics/settings", { method: "POST", body: JSON.stringify(payload()) });
        hint.textContent = "Saved. Public pages load gtag.js only when Connected and the visitor accepts analytics.";
        hint.className = "hint ok";
      };
      form.querySelector("[data-act=on]").onclick = async () => {
        form.connected.checked = true;
        await api("/api/master/analytics/settings", { method: "POST", body: JSON.stringify(payload()) });
        hint.textContent = "Connected. gtag.js will load on the public site after consent.";
        hint.className = "hint ok";
      };
      form.querySelector("[data-act=test]").onclick = async () => {
        const r = await api("/api/master/analytics/test", { method: "POST", body: JSON.stringify(payload()) });
        hint.textContent = r.message;
        hint.className = "hint ok";
      };
      form.querySelector("[data-act=off]").onclick = async () => {
        await api("/api/master/analytics/settings", {
          method: "POST",
          body: JSON.stringify({ measurement_id: "", connected: false, consent_required: true, conversion_events: s.conversion_events }),
        });
        hint.textContent = "Disconnected. gtag.js will not load.";
        hint.className = "hint ok";
      };
      bindChrome(body, pane, opts, range);
      return;
    }

    if (pane === "alerts") {
      const list = await api("/api/master/analytics/alerts");
      const rows = Array.isArray(list) ? list : [];
      body.innerHTML = `${tabs(pane)}
        <p class="section-note">Alerts watch first-party website event counts. They do not invent GA4 traffic.</p>
        <form id="ga-alert" class="settings">
          <label>Alert name <input name="name" required /></label>
          <label>Metric <select name="metric"><option>page_views</option><option>conversions</option><option>events</option></select></label>
          <label>Condition <select name="condition_op"><option value="lt">drops below</option><option value="gt">rises above</option></select></label>
          <label>Threshold <input name="threshold" type="number" value="10" /></label>
          <label>Frequency <select name="frequency"><option>daily</option><option>hourly</option></select></label>
          <label><input type="checkbox" name="email_on" checked /> Email notification</label>
          <label><input type="checkbox" name="dashboard_on" checked /> Dashboard notification</label>
          <label>Status <select name="status"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <button class="btn primary" type="submit">Save alert</button>
        </form>
        ${table(["Name", "Metric", "Condition", "Threshold", "Frequency", "Status"], rows.map((a) => [a.name, a.metric, a.condition_op, a.threshold, a.frequency, a.status]))}`;
      body.querySelector("#ga-alert").onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target).entries());
        fd.email_on = e.target.email_on.checked;
        fd.dashboard_on = e.target.dashboard_on.checked;
        await api("/api/master/analytics/alerts", { method: "POST", body: JSON.stringify(fd) });
        opts?.setPane?.("alerts");
      };
      bindChrome(body, pane, opts, range);
      return;
    }

    if (pane === "conversions") {
      const s = await api("/api/master/analytics/settings");
      const d = await api(`/api/master/analytics/overview?${qs(range, from, to)}`);
      body.innerHTML = `${tabs(pane)}${rangeBar(range)}
        <p>Mark selected events as conversions. Clicks are not conversions unless listed here.</p>
        <form id="ga-conv">${EVENT_NAMES.map(
          (n) =>
            `<label><input type="checkbox" name="ev" value="${n}" ${s.conversion_events?.includes(n) ? "checked" : ""} /> ${n}</label>`,
        ).join("")}<button class="btn primary" type="submit">Save conversion events</button></form>
        <div class="kpi-grid">${kpi("Conversions", d.kpis?.conversions)}${kpi("Leads", d.kpis?.leads)}</div>
        ${table(
          ["Lead ID", "Date", "Source", "Campaign", "Landing page", "Business type", "Conversion event"],
          (d.leads || []).map((r) => [r.id, r.occurred_at || "", r.source || "", r.utm_campaign || "", r.page_path || "/", r.business_category || "", r.event_name]),
        )}
        ${note(d)}`;
      body.querySelector("#ga-conv").onsubmit = async (e) => {
        e.preventDefault();
        const conversion_events = formQuery(e.target, "ev");
        await api("/api/master/analytics/settings", {
          method: "POST",
          body: JSON.stringify({ ...s, conversion_events, connected: s.connected, consent_required: s.consent_required }),
        });
        opts?.setPane?.("conversions");
      };
      bindChrome(body, pane, { ...opts, api }, range);
      return;
    }

    const d = await api(`/api/master/analytics/overview?${qs(range, from, to)}`);
    const k = d.kpis || {};
    let extra = "";
    if (pane === "overview") {
      extra = `<div class="kpi-grid">
        ${kpi("Users", k.users)}${kpi("New Users", k.new_users)}${kpi("Sessions", k.sessions)}
        ${kpi("Engaged Sessions", k.engaged_sessions)}${kpi("Engagement Rate", k.engagement_rate)}
        ${kpi("Avg engagement time", k.avg_engagement_time)}${kpi("Page Views", k.page_views)}
        ${kpi("Events", k.events)}${kpi("Conversions", k.conversions)}${kpi("Leads", k.leads)}
      </div>${note(d)}`;
    } else if (pane === "realtime") {
      extra = `<p><strong>${d.realtime?.active_users || 0}</strong> active sessions (last 5 minutes, first-party events)</p>
        ${table(["Time", "Event", "Page", "Device"], (d.realtime?.events || []).map((e) => [e.occurred_at || "", e.event_name, e.page_path || "/", e.device || ""]))}`;
    } else if (pane === "acquisition") {
      extra = `<p class="hint">Sources below come from UTM parameters and referrer on first-party events (organic, direct, referral, social, paid, email, other when present).</p>
        ${table(["Source", "Events"], (d.acquisition || []).map((r) => [r.source, r.n]))}`;
    } else if (pane === "engagement") {
      extra = `${table(["Event", "Count"], (d.events_by_name || []).map((r) => [r.event_name, r.n]))}${note(d)}`;
    } else if (pane === "devices") {
      extra = `<p class="hint">First-party tagging stores desktop / mobile / tablet from the user-agent. Browser, OS and screen size belong in the GA4 interface when the Data API is connected.</p>
        ${table(["Device", "Events"], (d.devices || []).map((r) => [r.device, r.n]))}`;
    } else if (pane === "landing") {
      extra = table(
        ["Page", "Users", "Sessions", "Conversions"],
        (d.landing_pages || []).map((r) => [r.page, r.users, r.sessions, r.conversions]),
      );
    } else if (pane === "campaigns") {
      extra = `<p class="hint">Campaigns use utm_campaign. Support utm_source, utm_medium, utm_term and utm_content on public URLs.</p>
        ${table(["Campaign", "Sessions", "Conversions"], (d.campaigns || []).map((r) => [r.campaign, r.sessions, r.conversions]))}`;
    } else if (pane === "seo") {
      extra = `<div class="ga-arch">
        <p><strong>SEO keywords</strong> → landing pages → organic traffic → engagement → conversions</p>
        <p><strong>GA4 / first-party events:</strong> website users, sessions, behaviour, conversions.</p>
        <p><strong>Google Search Console (not mixed here):</strong> search queries, impressions, clicks, CTR, average position. Connect Search Console separately; this screen does not claim keyword rankings from GA4.</p>
      </div>
        ${table(["Source", "Events"], (d.acquisition || []).map((r) => [r.source, r.n]))}
        ${table(["Business category", "Visitors", "Get Started", "Demo", "Leads"], (d.categories || []).map((r) => [r.category, r.visitors, r.get_started, r.demo_requests, r.leads]))}`;
    } else if (pane === "geo") {
      extra = `<p class="hint">This platform does not store visitor city or GPS. Aggregated country / region / city reports belong in the GA4 UI or Data API. Individual location is not collected.</p>`;
    } else if (pane === "journey") {
      extra = `<ol class="ga-flow"><li>Campaign / Google / Direct</li><li>Landing page</li><li>Features or business type</li><li>Get Started / Demo / Contact</li></ol>
        ${table(["Event", "Count"], (d.events_by_name || []).map((r) => [r.event_name, r.n]))}
        <p class="hint">Drop-off is inferred only from recorded first-party events, not invented funnels.</p>`;
    } else if (pane === "events") {
      extra = table(["Event", "Count"], (d.events_by_name || []).map((r) => [r.event_name, r.n]));
    } else if (pane === "reports") {
      extra = `<p>
        <button class="btn" type="button" id="ga-csv">Export CSV</button>
        <button class="btn" type="button" id="ga-xls">Export Excel</button>
        <button class="btn" type="button" onclick="window.print()">Print</button>
        <button class="btn" type="button" id="ga-pdf">Download PDF</button>
      </p>
        <p class="hint">Excel and PDF use the same first-party figures (CSV / print). Numbers are website events, not POS sales.</p>
        <h3>Traffic Report</h3>${table(["Source", "Events"], (d.acquisition || []).map((r) => [r.source, r.n]))}
        <h3>Landing Page Report</h3>${table(["Page", "Users", "Sessions", "Conversions"], (d.landing_pages || []).map((r) => [r.page, r.users, r.sessions, r.conversions]))}
        <h3>Business Category Report</h3>${table(["Category", "Visitors", "Leads"], (d.categories || []).map((r) => [r.category, r.visitors, r.leads]))}
        <h3>Campaign Report</h3>${table(["Campaign", "Sessions", "Conversions"], (d.campaigns || []).map((r) => [r.campaign, r.sessions, r.conversions]))}
        <h3>Device Report</h3>${table(["Device", "Events"], (d.devices || []).map((r) => [r.device, r.n]))}
        ${note(d)}`;
    } else {
      extra = `${table(["Business category", "Visitors", "Get Started", "Demo", "Leads"], (d.categories || []).map((r) => [r.category, r.visitors, r.get_started, r.demo_requests, r.leads]))}${note(d)}`;
    }

    body.innerHTML = `${tabs(pane)}${rangeBar(range)}${extra}`;
    bindChrome(body, pane, { ...opts, api }, range);
  }

  function formQuery(form, name) {
    return [...form.querySelectorAll(`[name="${name}"]:checked`)].map((i) => i.value);
  }

  g.POSMasterAnalytics = { render, PANES };
})(window);
