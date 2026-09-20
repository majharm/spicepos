(function (g) {
  const PANES = [
    ["overview", "Overview"],
    ["keywords", "Keywords"],
    ["groups", "Keyword Groups"],
    ["generator", "Keyword Generator"],
    ["pages", "SEO Pages"],
    ["editor", "Meta Manager"],
    ["business", "Business SEO"],
    ["locations", "Location SEO"],
    ["links", "Internal Links"],
    ["faq", "FAQ"],
    ["redirects", "Redirects"],
    ["broken", "Broken URLs"],
    ["conflicts", "Keyword Conflicts"],
    ["usage", "Keyword Usage"],
    ["sitemap", "Sitemap"],
    ["robots", "Robots.txt"],
    ["activity", "SEO Activity"],
    ["settings", "Global SEO Settings"],
  ];
  const TYPES = ["Primary", "Secondary", "Long Tail", "Local", "Branded", "Commercial", "Informational", "Transactional"];
  const INTENTS = ["Informational", "Commercial Investigation", "Transactional", "Navigational", "Local"];
  const CATS = ["Retail", "Pharmacy", "Restaurant", "Cafe", "Salon", "Spa", "Garment", "Grocery", "Supermarket", "Dairy", "Electronics", "Hardware", "Bakery", "Wholesale", "Service Business"];

  function tabs(active) {
    return `<div class="settings-tabs seo-tabs" role="tablist">${PANES.map(
      ([id, label]) => `<button class="btn${active === id ? " active" : ""}" type="button" data-seo-pane="${id}">${label}</button>`,
    ).join("")}</div>`;
  }
  function sel(name, opts, val) {
    return `<select name="${name}">${opts.map((o) => `<option${o === val ? " selected" : ""}>${o}</option>`).join("")}</select>`;
  }
  function table(headers, rows, rowAttrs) {
    if (!rows?.length) return `<p class="hint">No records yet. Add items in Master Admin — nothing is hard-coded.</p>`;
    return `<div class="table-wrap"><table class="data"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
      .map((r, i) => `<tr ${rowAttrs?.[i] || ""}>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></div>`;
  }
  function badge(s) {
    const v = String(s || "draft");
    return `<span class="seo-badge seo-${v}">${v}</span>`;
  }
  function bindPanes(body, opts) {
    body.querySelectorAll("[data-seo-pane]").forEach((b) => {
      b.onclick = () => opts?.setPane?.(b.dataset.seoPane);
    });
  }
  function fd(form) {
    const o = Object.fromEntries(new FormData(form).entries());
    form.querySelectorAll("input[type=checkbox]").forEach((c) => {
      o[c.name] = c.checked;
    });
    return o;
  }

  async function render(body, pane, api, opts = {}) {
    opts.api = api;
    const head = tabs(pane);

    if (pane === "overview") {
      const d = await api("/api/master/seo/overview");
      const k = d.kpis || {};
      const cards = [
        ["Total Keywords", k.total_keywords, "keywords"],
        ["Active Keywords", k.active_keywords, "keywords"],
        ["Primary Keywords", k.primary_keywords, "keywords"],
        ["Secondary Keywords", k.secondary_keywords, "keywords"],
        ["Long-Tail Keywords", k.long_tail_keywords, "keywords"],
        ["Keywords Used", k.keywords_used, "usage"],
        ["Keywords Not Used", k.keywords_not_used, "keywords"],
        ["Pages Optimized", k.pages_optimized, "pages"],
        ["Average Position", k.average_position == null ? "—" : k.average_position, "usage"],
        ["Estimated Traffic", k.estimated_traffic, "keywords"],
        ["Keyword Opportunities", k.keyword_opportunities, "generator"],
      ];
      body.innerHTML = `${head}<p class="hint">${d.note || ""}</p>
        <div class="kpi-grid">${cards
          .map(([l, v, p]) => `<button type="button" class="report-card seo-kpi" data-seo-pane="${p}"><span>${l}</span><strong>${v ?? 0}</strong></button>`)
          .join("")}</div>`;
      bindPanes(body, opts);
      return;
    }

    if (pane === "keywords") {
      const rows = await api("/api/master/seo/keywords");
      body.innerHTML = `${head}
        <div class="seo-toolbar">
          <input id="seo-q" placeholder="Search keywords" />
          <button class="btn primary" type="button" id="seo-add">+ Add Keyword</button>
          <button class="btn" type="button" id="seo-export">Export CSV</button>
          <button class="btn" type="button" data-bulk="activate">Activate</button>
          <button class="btn" type="button" data-bulk="deactivate">Deactivate</button>
          <button class="btn" type="button" data-bulk="delete">Delete</button>
        </div>
        ${table(
          ["", "Keyword", "Type", "Business Category", "Location", "Search Intent", "Target Page", "Priority", "Status", "Actions"],
          rows.map((r) => [
            `<input type="checkbox" data-id="${r.id}" />`,
            r.keyword,
            r.keyword_type,
            r.business_category || "—",
            [r.city, r.state, r.country].filter(Boolean).join(", ") || "—",
            r.search_intent,
            r.target_url || r.target_page || "—",
            r.priority,
            badge(r.status),
            `<button class="btn" type="button" data-edit="${r.id}">Edit</button>`,
          ]),
        )}
        <form id="seo-kw" class="settings" hidden>
          <h3>Keyword</h3>
          <label>Keyword * <input name="keyword" required /></label>
          <label>Keyword variations <input name="variations" placeholder="comma separated" /></label>
          <label>Keyword type ${sel("keyword_type", TYPES)}</label>
          <label>Search intent ${sel("search_intent", INTENTS)}</label>
          <label>Business type <input name="business_type" /></label>
          <label>Business category ${sel("business_category", CATS)}</label>
          <label>Target page <input name="target_page" /></label>
          <label>Target URL <input name="target_url" placeholder="/pharmacy-pos" /></label>
          <label>Country <input name="country" value="India" /></label>
          <label>State <input name="state" /></label>
          <label>City <input name="city" /></label>
          <label>Area <input name="area" /></label>
          <label>Language <input name="language" value="en" /></label>
          <label>Priority ${sel("priority", ["High", "Medium", "Low"])}</label>
          <label>Status ${sel("status", ["draft", "active", "inactive", "opportunity"])}</label>
          <label>Notes <textarea name="notes"></textarea></label>
          <input type="hidden" name="id" />
          <button class="btn primary" type="submit">Save keyword</button>
        </form>`;
      const form = body.querySelector("#seo-kw");
      body.querySelector("#seo-add").onclick = () => {
        form.hidden = false;
        form.reset();
        form.id.value = "";
      };
      body.querySelectorAll("[data-edit]").forEach((b) => {
        b.onclick = () => {
          const r = rows.find((x) => x.id === b.dataset.edit);
          if (!r) return;
          form.hidden = false;
          Object.entries(r).forEach(([k, v]) => {
            if (form[k]) form[k].value = v ?? "";
          });
        };
      });
      form.onsubmit = async (e) => {
        e.preventDefault();
        const o = fd(form);
        o.variations = String(o.variations || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        await api("/api/master/seo/keywords", { method: "POST", body: JSON.stringify(o) });
        opts.setPane("keywords");
      };
      body.querySelector("#seo-export").onclick = async () => {
        const r = await api("/api/master/seo/export");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([r.csv || ""], { type: "text/csv" }));
        a.download = "seo-keywords.csv";
        a.click();
      };
      body.querySelectorAll("[data-bulk]").forEach((b) => {
        b.onclick = async () => {
          const ids = [...body.querySelectorAll("[data-id]:checked")].map((i) => i.dataset.id);
          if (!ids.length || !confirm("Apply this bulk action?")) return;
          await api("/api/master/seo/keywords/bulk", { method: "POST", body: JSON.stringify({ ids, action: b.dataset.bulk }) });
          opts.setPane("keywords");
        };
      });
      const box = body.querySelector("#seo-q");
      box.oninput = () => {
        const q = box.value.toLowerCase();
        body.querySelectorAll("tbody tr").forEach((tr) => {
          tr.hidden = q && !tr.textContent.toLowerCase().includes(q);
        });
      };
      bindPanes(body, opts);
      return;
    }

    if (pane === "groups") {
      const rows = await api("/api/master/seo/groups");
      body.innerHTML = `${head}
        <form id="seo-g" class="settings">
          <label>Group name <input name="name" required placeholder="Pharmacy POS" /></label>
          <label>Business category ${sel("business_category", CATS)}</label>
          <label>Notes <textarea name="notes" placeholder="Primary / secondary / long-tail clusters"></textarea></label>
          <button class="btn primary" type="submit">Save group</button>
        </form>
        ${table(["Name", "Category", "Notes"], rows.map((r) => [r.name, r.business_category || "", r.notes || ""]))}`;
      body.querySelector("#seo-g").onsubmit = async (e) => {
        e.preventDefault();
        await api("/api/master/seo/groups", { method: "POST", body: JSON.stringify(fd(e.target)) });
        opts.setPane("groups");
      };
      bindPanes(body, opts);
      return;
    }

    if (pane === "generator") {
      body.innerHTML = `${head}
        <p class="hint">Suggestions stay in this screen until you add them. Nothing is published automatically.</p>
        <form id="seo-gen" class="settings">
          <label>Business type ${sel("businessType", CATS, "Pharmacy")}</label>
          <label>Service <input name="service" value="POS software" /></label>
          <label>Location <input name="location" placeholder="Pune" /></label>
          <button class="btn primary" type="submit">Generate suggestions</button>
        </form>
        <div id="seo-sug"></div>`;
      body.querySelector("#seo-gen").onsubmit = async (e) => {
        e.preventDefault();
        const o = fd(e.target);
        const r = await api("/api/master/seo/generate", { method: "POST", body: JSON.stringify(o) });
        const list = r.suggestions || [];
        body.querySelector("#seo-sug").innerHTML = `${list
          .map((s, i) => `<label><input type="checkbox" data-sug="${i}" checked /> ${s}</label>`)
          .join("")}
          <p><button class="btn primary" type="button" id="seo-add-all">Add selected as drafts</button></p>`;
        body.querySelector("#seo-add-all").onclick = async () => {
          const picked = list.filter((_, i) => body.querySelector(`[data-sug="${i}"]`)?.checked);
          for (const keyword of picked) {
            await api("/api/master/seo/keywords", {
              method: "POST",
              body: JSON.stringify({
                keyword,
                keyword_type: "Long Tail",
                business_category: o.businessType,
                city: o.location,
                status: "draft",
              }),
            });
          }
          opts.setPane("keywords");
        };
      };
      bindPanes(body, opts);
      return;
    }

    if (pane === "pages" || pane === "editor" || pane === "business") {
      const pages = await api("/api/master/seo/pages");
      const editing = pane === "editor";
      body.innerHTML = `${head}
        <p class="hint">SEO Score is an on-page checklist, not a Google ranking. Pages stay draft until approved and published.</p>
        <button class="btn primary" type="button" id="seo-new-page">+ SEO page</button>
        ${table(
          ["Page", "URL", "Primary Keyword", "Meta Title", "Index", "SEO Score", "Status", "Actions"],
          pages.map((p) => [
            p.title,
            p.url,
            p.primary_keyword || "—",
            p.seo_title || "—",
            p.index_status,
            `${p.seo_score || 0}/100`,
            badge(p.publish_status),
            `<button class="btn" type="button" data-pedit="${p.id}">Edit</button>
             <button class="btn" type="button" data-pub="${p.id}">Publish</button>`,
          ]),
        )}
        <form id="seo-page" class="settings seo-editor" hidden>
          <h3>SEO editor</h3>
          <label>Page title <input name="title" required /></label>
          <label>URL / slug <input name="url" placeholder="/pharmacy-pos" required /></label>
          <label>Primary keyword <input name="primary_keyword" /></label>
          <label>Secondary keywords <input name="secondary_keywords" /></label>
          <label>SEO title <input name="seo_title" maxlength="70" id="seo-title" /></label>
          <p class="hint" id="seo-title-n">0 / 60</p>
          <label>Meta description <textarea name="meta_description" id="seo-desc" maxlength="200"></textarea></label>
          <p class="hint" id="seo-desc-n">0 / 160</p>
          <div class="seo-preview" id="seo-preview"><strong>Google Search Preview</strong><p class="seo-g-url">pos.atavtelecom.in</p><p class="seo-g-title"></p><p class="seo-g-desc"></p></div>
          <label>H1 <input name="h1" /></label>
          <label>H2 suggestions <input name="h2_suggestions" /></label>
          <label>Canonical URL <input name="canonical" /></label>
          <label>OG title <input name="og_title" /></label>
          <label>OG description <textarea name="og_description"></textarea></label>
          <label>OG image <input name="og_image" /></label>
          <label>Twitter title <input name="twitter_title" /></label>
          <label>Twitter description <textarea name="twitter_description"></textarea></label>
          <label>Schema type ${sel("schema_type", ["SoftwareApplication", "FAQPage", "WebPage", "Organization"])}</label>
          <label>Index ${sel("index_status", ["index", "noindex"])}</label>
          <label>Follow ${sel("follow_status", ["follow", "nofollow"])}</label>
          <label>Business category ${sel("business_category", CATS)}</label>
          <label>Hero heading <input name="hero_heading" /></label>
          <label>Introduction <textarea name="intro"></textarea></label>
          <label>Features <textarea name="features"></textarea></label>
          <label>Benefits <textarea name="benefits"></textarea></label>
          <label>Business use cases <textarea name="use_cases"></textarea></label>
          <label>CTA <input name="cta" value="Get Started" /></label>
          <label>AI content suggestion <textarea name="ai_hint" placeholder="Editable draft only. Not published until you save and approve."></textarea></label>
          <label><input type="checkbox" name="approved" /> Approve unique content</label>
          <input type="hidden" name="id" />
          <button class="btn primary" type="submit">Save page</button>
        </form>`;
      const form = body.querySelector("#seo-page");
      const paint = () => {
        body.querySelector("#seo-title-n").textContent = `${(form.seo_title.value || "").length} / 60`;
        body.querySelector("#seo-desc-n").textContent = `${(form.meta_description.value || "").length} / 160`;
        body.querySelector(".seo-g-title").textContent = form.seo_title.value || "ATAV POS";
        body.querySelector(".seo-g-desc").textContent = (form.meta_description.value || "").slice(0, 160);
        body.querySelector(".seo-g-url").textContent = `pos.atavtelecom.in${form.url.value || ""}`;
      };
      form.seo_title.oninput = paint;
      form.meta_description.oninput = paint;
      form.url.oninput = paint;
      body.querySelector("#seo-new-page").onclick = () => {
        form.hidden = false;
        form.reset();
        form.id.value = "";
        paint();
      };
      if (editing) {
        form.hidden = false;
        paint();
      }
      body.querySelectorAll("[data-pedit]").forEach((b) => {
        b.onclick = () => {
          const p = pages.find((x) => x.id === b.dataset.pedit);
          if (!p) return;
          form.hidden = false;
          Object.entries(p).forEach(([k, v]) => {
            if (form[k] && form[k].type !== "checkbox") form[k].value = v ?? "";
          });
          form.approved.checked = Boolean(Number(p.approved));
          paint();
        };
      });
      body.querySelectorAll("[data-pub]").forEach((b) => {
        b.onclick = async () => {
          if (!confirm("Publish this approved page? Thin duplicates are blocked.")) return;
          await api(`/api/master/seo/pages/${b.dataset.pub}/publish`, { method: "POST", body: "{}" });
          opts.setPane("pages");
        };
      });
      form.onsubmit = async (e) => {
        e.preventDefault();
        const o = fd(form);
        o.secondary_keywords = String(o.secondary_keywords || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        await api("/api/master/seo/pages", { method: "POST", body: JSON.stringify(o) });
        opts.setPane("pages");
      };
      bindPanes(body, opts);
      return;
    }

    if (pane === "locations") {
      const rows = await api("/api/master/seo/locations");
      body.innerHTML = `${head}
        <p class="hint">Builds phrases such as “POS software in Pune”. Location landing pages still need unique approved content before publish.</p>
        <form id="seo-loc" class="settings">
          <label>Base phrase <input name="base" value="POS software" /></label>
          <label>Country <input name="country" value="India" /></label>
          <label>State <input name="state" placeholder="Maharashtra" /></label>
          <label>City <input name="city" placeholder="Pune" /></label>
          <label>Area <input name="area" /></label>
          <button class="btn primary" type="submit">Add location</button>
        </form>
        <p id="seo-loc-out" class="hint"></p>
        ${table(["Country", "State", "City", "Area"], rows.map((r) => [r.country, r.state, r.city, r.area]))}`;
      body.querySelector("#seo-loc").onsubmit = async (e) => {
        e.preventDefault();
        const r = await api("/api/master/seo/locations", { method: "POST", body: JSON.stringify(fd(e.target)) });
        body.querySelector("#seo-loc-out").textContent = r.phrase || "Saved";
        opts.setPane("locations");
      };
      bindPanes(body, opts);
      return;
    }

    if (pane === "links") {
      const rows = await api("/api/master/seo/links");
      body.innerHTML = `${head}
        <form id="seo-link" class="settings">
          <label>Source page <input name="source_url" placeholder="/pharmacy-pos" required /></label>
          <label>Target page <input name="target_url" placeholder="/pharmacy-inventory" required /></label>
          <label>Anchor text <input name="anchor_text" required /></label>
          <label>Priority ${sel("priority", ["High", "Medium", "Low"])}</label>
          <button class="btn primary" type="submit">Save link</button>
        </form>
        ${table(["Source", "Anchor", "Target", "Priority"], rows.map((r) => [r.source_url, r.anchor_text, r.target_url, r.priority]))}`;
      body.querySelector("#seo-link").onsubmit = async (e) => {
        e.preventDefault();
        await api("/api/master/seo/links", { method: "POST", body: JSON.stringify(fd(e.target)) });
        opts.setPane("links");
      };
      bindPanes(body, opts);
      return;
    }

    if (pane === "faq") {
      const rows = await api("/api/master/seo/faq");
      body.innerHTML = `${head}
        <form id="seo-faq" class="settings">
          <label>Question <input name="question" required /></label>
          <label>Answer <textarea name="answer" required></textarea></label>
          <label>Business type ${sel("business_type", CATS)}</label>
          <label>Category ${sel("category", CATS)}</label>
          <label>Target page <input name="target_page" /></label>
          <label>Priority ${sel("priority", ["High", "Medium", "Low"])}</label>
          <label>Status ${sel("status", ["draft", "active"])}</label>
          <button class="btn primary" type="submit">Save FAQ</button>
        </form>
        ${table(["Question", "Category", "Page", "Status"], rows.map((r) => [r.question, r.category, r.target_page, badge(r.status)]))}`;
      body.querySelector("#seo-faq").onsubmit = async (e) => {
        e.preventDefault();
        await api("/api/master/seo/faq", { method: "POST", body: JSON.stringify(fd(e.target)) });
        opts.setPane("faq");
      };
      bindPanes(body, opts);
      return;
    }

    if (pane === "redirects") {
      const rows = await api("/api/master/seo/redirects");
      body.innerHTML = `${head}
        <form id="seo-red" class="settings">
          <label>Old URL <input name="old_url" required /></label>
          <label>New URL <input name="new_url" required /></label>
          <label>Type ${sel("redirect_type", ["301", "302"])}</label>
          <button class="btn primary" type="submit">Save redirect</button>
        </form>
        ${table(["Old", "New", "Type", "Hits", "Status"], rows.map((r) => [r.old_url, r.new_url, r.redirect_type, r.hit_count, badge(r.status)]))}`;
      body.querySelector("#seo-red").onsubmit = async (e) => {
        e.preventDefault();
        await api("/api/master/seo/redirects", { method: "POST", body: JSON.stringify(fd(e.target)) });
        opts.setPane("redirects");
      };
      bindPanes(body, opts);
      return;
    }

    if (pane === "broken") {
      const rows = await api("/api/master/seo/broken");
      body.innerHTML = `${head}${table(["URL", "Status", "Source", "Action"], rows.map((r) => [r.url, r.status_code, r.source || "", r.suggested_action || ""]))}`;
      bindPanes(body, opts);
      return;
    }

    if (pane === "conflicts") {
      const d = await api("/api/master/seo/conflicts");
      body.innerHTML = `${head}<p class="hint">${d.note || ""}</p>
        ${table(
          ["Keyword", "Pages", "Decision"],
          (d.conflicts || []).map((c) => [
            c.keyword,
            c.pages,
            `<button class="btn" data-dec="keep" data-kw="${c.keyword}">Keep separate</button>
             <button class="btn" data-dec="ignore" data-kw="${c.keyword}">Ignore</button>`,
          ]),
        )}`;
      body.querySelectorAll("[data-dec]").forEach((b) => {
        b.onclick = async () => {
          await api("/api/master/seo/conflicts", { method: "POST", body: JSON.stringify({ keyword: b.dataset.kw, decision: b.dataset.dec }) });
        };
      });
      bindPanes(body, opts);
      return;
    }

    if (pane === "usage") {
      const rows = await api("/api/master/seo/usage");
      body.innerHTML = `${head}${table(
        ["Keyword", "Intent", "Pages", "Title", "H1", "Meta", "Content", "URL", "Status"],
        (rows || []).map((r) => [r.keyword, r.search_intent, (r.pages || []).join(", "), r.title ? "✓" : "—", r.h1 ? "✓" : "—", r.meta ? "✓" : "—", r.content ? "✓" : "—", r.url ? "✓" : "—", r.status]),
      )}`;
      bindPanes(body, opts);
      return;
    }

    if (pane === "sitemap") {
      body.innerHTML = `${head}
        <p class="hint">Sitemap includes published, indexable public pages only. Admin, login and POS paths stay out.</p>
        <button class="btn primary" type="button" id="seo-sm">Generate Sitemap</button>
        <a class="btn" href="/sitemap.xml" target="_blank" rel="noopener">View Sitemap</a>
        <pre id="seo-sm-out" class="seo-pre"></pre>`;
      body.querySelector("#seo-sm").onclick = async () => {
        const r = await api("/api/master/seo/sitemap/generate", { method: "POST", body: "{}" });
        body.querySelector("#seo-sm-out").textContent = r.xml || "";
      };
      bindPanes(body, opts);
      return;
    }

    if (pane === "robots") {
      const s = await api("/api/master/seo/settings");
      body.innerHTML = `${head}
        <form id="seo-rb" class="settings">
          <label>robots.txt <textarea name="robots_txt" rows="12">${s.robots_txt || ""}</textarea></label>
          <button class="btn" type="button" id="seo-val">Validate</button>
          <button class="btn primary" type="submit">Save / Publish</button>
          <p class="hint" id="seo-rb-h"></p>
        </form>`;
      const hint = body.querySelector("#seo-rb-h");
      const check = () => {
        const t = body.querySelector("[name=robots_txt]").value;
        hint.textContent = /disallow:\s*\/api/i.test(t) ? "Looks valid: /api/ is disallowed." : "Must Disallow /api/";
      };
      body.querySelector("#seo-val").onclick = check;
      body.querySelector("#seo-rb").onsubmit = async (e) => {
        e.preventDefault();
        const r = await api("/api/master/seo/robots", { method: "POST", body: JSON.stringify(fd(e.target)) });
        hint.textContent = "Published robots.txt";
        if (r.robots_txt) e.target.robots_txt.value = r.robots_txt;
      };
      bindPanes(body, opts);
      return;
    }

    if (pane === "activity") {
      const rows = await api("/api/master/seo/activity");
      body.innerHTML = `${head}${table(
        ["When", "Actor", "Action", "Page", "Keyword"],
        rows.map((r) => [r.created_at || "", r.actor || "", r.action, r.page_url || "", r.keyword || ""]),
      )}`;
      bindPanes(body, opts);
      return;
    }

    const s = await api("/api/master/seo/settings");
    const tpls = await api("/api/master/seo/templates");
    body.innerHTML = `${head}
      <p>Only Master Admin can change global SEO settings. Shop staff cannot.</p>
      <form id="seo-set" class="settings">
        <label>Default site title <input name="site_title" value="${s.site_title || ""}" /></label>
        <label>Default meta description <textarea name="default_description">${s.default_description || ""}</textarea></label>
        <label>Default keywords <input name="default_keywords" value="${s.default_keywords || ""}" /></label>
        <label>Default OG image <input name="default_og_image" value="${s.default_og_image || ""}" /></label>
        <label>Default canonical <input name="default_canonical" value="${s.default_canonical || ""}" /></label>
        <label>Default schema <input name="default_schema" value="${s.default_schema || ""}" /></label>
        <label>Google site verification <input name="google_site_verification" value="${s.google_site_verification || ""}" /></label>
        <label>Bing verification <input name="bing_verification" value="${s.bing_verification || ""}" /></label>
        <button class="btn primary" type="submit">Save settings</button>
      </form>
      <h3>Title / description templates</h3>
      <form id="seo-tpl" class="settings">
        <label>Name <input name="name" required /></label>
        <label>Title template <input name="title_tpl" value="{category} POS Software | Billing & Inventory | ATAV POS" /></label>
        <label>Description template <textarea name="description_tpl">Manage {category} billing, inventory, customers, payments and reports with ATAV POS.</textarea></label>
        <button class="btn" type="submit">Save template</button>
      </form>
      ${table(["Name", "Title template"], (tpls || []).map((t) => [t.name, t.title_tpl]))}`;
    body.querySelector("#seo-set").onsubmit = async (e) => {
      e.preventDefault();
      await api("/api/master/seo/settings", { method: "POST", body: JSON.stringify(fd(e.target)) });
    };
    body.querySelector("#seo-tpl").onsubmit = async (e) => {
      e.preventDefault();
      await api("/api/master/seo/templates", { method: "POST", body: JSON.stringify(fd(e.target)) });
      opts.setPane("settings");
    };
    bindPanes(body, opts);
  }

  g.POSMasterSeo = { render, PANES };
})(window);
