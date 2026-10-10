(function (g) {
  const L = () => g.POSLoginPage;
  const PANES = [
    ["images", "Login Page Images"],
    ["logo", "Logo"],
    ["background", "Background"],
    ["banner", "Promotional Banner"],
    ["text", "Login Text"],
    ["branding", "Business Branding"],
    ["layout", "Layout"],
    ["mobile", "Mobile Image"],
    ["settings", "Login Page Settings"],
    ["preview", "Preview"],
    ["history", "Publish History"],
    ["media", "Media Library"],
    ["campaigns", "Campaigns"],
  ];
  const KINDS = ["desktop", "mobile", "tablet", "background", "banner", "side", "ad", "logo", "favicon", "library"];
  const PUBLIC_PANES = {
    homepage: "Homepage",
    register: "Registration Page",
    contact: "Contact Page",
  };
  const PANE_COPY = {
    images: ["Login Page", "Desktop and tablet hero for shop and Master Admin sign-in."],
    logo: ["Logo", "Brand mark on the sign-in card."],
    background: ["Background", "Image behind the scene panel."],
    banner: ["Promotional Banner", "Side banner, advert, or offer art."],
    text: ["Login Text", "Headings, button labels, and scene copy."],
    branding: ["Branding", "Company name, tagline, and logo."],
    layout: ["Layout", "Card size, radius, and input style."],
    mobile: ["Mobile Image", "Hero used under 760px."],
    settings: ["Login Settings", "Colors, slider, image source, and CTAs."],
    preview: ["Preview", "Business-type headings and images."],
    history: ["Publish History", "Restore a draft, then Publish to go live."],
    media: ["Media Library", "Every uploaded login image."],
    campaigns: ["Campaigns", "Schedule a login image. After expiry the next priority image returns."],
  };
  let bundle = { draft: {}, images: [], campaigns: [], versions: [], audit: [], published_version: 0, published: null };
  let previewMode = "desktop";

  function resolvePane(pane) {
    const on = String(pane || "images");
    if (PUBLIC_PANES[on]) return on;
    return PANES.some(([id]) => id === on) ? on : "images";
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function tabs(active) {
    return `<div class="settings-tabs seo-tabs" role="tablist">${PANES.map(
      ([id, label]) => `<button class="btn${active === id ? " active" : ""}" type="button" data-website-pane="${id}">${esc(label)}</button>`,
    ).join("")}</div>`;
  }
  function mergeDraft() {
    const base = L()?.defaults ? L().defaults() : { promo: { on: false, title: "", points: [], cta: "", ctaUrl: "" }, card: {}, colors: {}, ctas: { register: {}, demo: {}, support: {} } };
    return { ...base, ...(bundle.draft || {}) };
  }
  function resolved() {
    return L().resolveAppearance({ settings: mergeDraft(), images: bundle.images, campaigns: bundle.campaigns }, new Date(), mergeDraft().previewBizType || "");
  }

  function compressFile(file, maxEdge, quality) {
    return new Promise((resolve, reject) => {
      const ok = /image\/(jpeg|jpg|png|webp)/i.test(file.type);
      if (!ok) return reject(new Error("Only JPG, PNG, or WebP"));
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        let out = canvas.toDataURL("image/webp", quality);
        if (!out.startsWith("data:image/webp")) out = canvas.toDataURL("image/jpeg", quality);
        const thumbCanvas = document.createElement("canvas");
        const ts = Math.min(1, 480 / Math.max(canvas.width, canvas.height));
        thumbCanvas.width = Math.max(1, Math.round(canvas.width * ts));
        thumbCanvas.height = Math.max(1, Math.round(canvas.height * ts));
        thumbCanvas.getContext("2d").drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        resolve({
          dataUrl: out,
          thumb: thumbCanvas.toDataURL("image/jpeg", 0.7),
          width: canvas.width,
          height: canvas.height,
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read image"));
      };
      img.src = url;
    });
  }

  function dataUrlBytes(dataUrl) {
    const b64 = String(dataUrl || "").split(",")[1] || "";
    return Math.ceil((b64.length * 3) / 4);
  }

  async function compressUnder(file, maxEdge, maxKb) {
    const cap = Math.min(2048, Math.max(200, Number(maxKb) || 900));
    let edge = maxEdge;
    let quality = 0.78;
    let last = null;
    for (let i = 0; i < 8; i += 1) {
      last = await compressFile(file, edge, quality);
      if (dataUrlBytes(last.dataUrl) <= cap * 1024) return last;
      quality = Math.max(0.32, quality - 0.08);
      edge = Math.max(640, Math.round(edge * 0.82));
    }
    throw new Error(`Image must be under ${cap} KB after compress. Use JPG or raise Max upload KB in Login Settings.`);
  }

  function fileUrlFor(id) {
    return L()?.imageFileUrl ? L().imageFileUrl(id) : `/api/login-page/file/${encodeURIComponent(id)}`;
  }

  function assignUpload(patch, field, uploadedId) {
    const fileUrl = fileUrlFor(uploadedId);
    patch[field] = uploadedId;
    if (field === "desktopImageId") patch.desktopUrl = fileUrl;
    if (field === "mobileImageId") patch.mobileUrl = fileUrl;
    if (field === "tabletImageId") patch.tabletUrl = fileUrl;
    if (field === "logoImageId") patch.logoUrl = fileUrl;
    if (field === "backgroundImageId") patch.backgroundUrl = fileUrl;
    if (field === "bannerImageId") patch.bannerUrl = fileUrl;
    if (field === "sideImageId") patch.sideUrl = fileUrl;
    if (field === "adImageId") patch.adUrl = fileUrl;
    return patch;
  }

  function fieldForUpload(pane, kind) {
    const byPane = {
      images: "desktopImageId",
      mobile: "mobileImageId",
      logo: "logoImageId",
      background: "backgroundImageId",
      banner: "bannerImageId",
    };
    const byKind = {
      desktop: "desktopImageId",
      mobile: "mobileImageId",
      tablet: "tabletImageId",
      background: "backgroundImageId",
      banner: "bannerImageId",
      side: "sideImageId",
      ad: "adImageId",
      logo: "logoImageId",
    };
    return byPane[pane] || byKind[kind] || "desktopImageId";
  }

  function imgSelect(name, val, kinds) {
    const rows = (bundle.images || []).filter((i) => !kinds || kinds.includes(i.kind) || i.kind === "library");
    return `<select name="${name}"><option value="">Default / none</option>${rows
      .map((i) => `<option value="${esc(i.id)}"${i.id === val ? " selected" : ""}>${esc(i.name)} (${esc(i.kind)})</option>`)
      .join("")}</select>`;
  }

  function livePreview() {
    const cfg = resolved();
    return `<div class="login-prev-wrap is-${previewMode}">${L().previewHtml(cfg)}
      <p class="hint">Source: ${esc(cfg.resolvedSource)}${cfg.resolvedCampaign ? ` · ${esc(cfg.resolvedCampaign)}` : ""} · v${bundle.published_version || 0}</p></div>`;
  }

  function shell(pane, inner) {
    const copy = PANE_COPY[pane] || ["Login Page Management", "Change images, text, layout, and campaigns. Draft → Preview → Publish."];
    return `<div class="items-desk master-desk login-page-desk">
      <header class="items-hero">
        <div class="items-hero-copy">
          <p class="items-kicker">Website</p>
          <h3>${esc(copy[0])}</h3>
          <p class="lede">${esc(copy[1])} Sign-in security stays unchanged.</p>
        </div>
        <div class="items-hero-stats">
          <div class="items-stat"><span>Published</span><strong>v${bundle.published_version || 0}</strong></div>
          <div class="items-stat"><span>Images</span><strong>${(bundle.images || []).length}</strong></div>
        </div>
      </header>
      ${tabs(pane)}
      <div class="login-page-split">
        <div class="login-page-form">${inner}</div>
        <aside class="login-page-aside">
          <p class="support-preview-label">Live preview</p>
          <div class="login-prev-modes">
            <button type="button" class="btn${previewMode === "desktop" ? " primary" : ""}" data-prev-mode="desktop">Desktop</button>
            <button type="button" class="btn${previewMode === "tablet" ? " primary" : ""}" data-prev-mode="tablet">Tablet</button>
            <button type="button" class="btn${previewMode === "mobile" ? " primary" : ""}" data-prev-mode="mobile">Mobile</button>
          </div>
          ${livePreview()}
        </aside>
      </div>
      <div class="purchase-doc-actions">
        <button class="btn" type="button" data-login-act="draft">Save Draft</button>
        <button class="btn" type="button" data-login-act="preview">Preview</button>
        <button class="btn primary" type="button" data-login-act="publish">Publish</button>
        <button class="btn" type="button" data-login-act="unpublish">Unpublish</button>
        <p class="hint" id="login-page-hint">Draft edits do not change the live login until Publish. Current published v${bundle.published_version || 0}.</p>
      </div>
    </div>`;
  }

  function uploadBlock(kind, rec) {
    return `<div class="login-upload">
      <p class="hint">${esc(rec)}</p>
      <label>Name <input name="upload_name" maxlength="180" placeholder="${esc(kind)} image" /></label>
      <label>Type <select name="upload_kind">${KINDS.map((k) => `<option${k === kind ? " selected" : ""}>${k}</option>`).join("")}</select></label>
      <label class="full">File <input type="file" accept="image/jpeg,image/png,image/webp" data-login-file /></label>
    </div>`;
  }

  function paneHtml(pane) {
    const d = mergeDraft();
    if (pane === "text") {
      return `<form id="login-page-form" class="settings item-composer">
        <p class="item-mode">Login text</p>
        <label class="full">Main heading <input name="heading" value="${esc(d.heading)}" /></label>
        <label class="full">Subheading <input name="subheading" value="${esc(d.subheading)}" /></label>
        <label class="full">Login button <input name="loginButton" value="${esc(d.loginButton)}" /></label>
        <label class="full">Forgot password <input name="forgotText" value="${esc(d.forgotText)}" /></label>
        <label class="full">Signup <input name="signupText" value="${esc(d.signupText)}" /></label>
        <label class="full">Scene kicker <input name="kicker" value="${esc(d.kicker)}" /></label>
        <label class="full">Scene title <input name="sceneTitle" value="${esc(d.sceneTitle)}" /></label>
        <label class="full">Scene lead <input name="sceneLead" value="${esc(d.sceneLead)}" /></label>
      </form>`;
    }
    if (pane === "branding") {
      return `<form id="login-page-form" class="settings item-composer">
        <p class="item-mode">Branding</p>
        <label class="full">Company name <input name="companyName" value="${esc(d.companyName)}" /></label>
        <label class="full">Tagline <input name="tagline" value="${esc(d.tagline)}" /></label>
        <label class="full">Brand description <input name="brandDescription" value="${esc(d.brandDescription)}" /></label>
        <label class="full">Footer text <input name="footerText" value="${esc(d.footerText)}" /></label>
        <label class="full">Logo image ${imgSelect("logoImageId", d.logoImageId || "", ["logo", "library"])}</label>
        <label class="full">Favicon URL <input name="faviconUrl" value="${esc(d.faviconUrl || "")}" /></label>
        ${uploadBlock("logo", "PNG or WebP. Compressed on upload.")}
      </form>`;
    }
    if (pane === "layout") {
      return `<form id="login-page-form" class="settings item-composer">
        <p class="item-mode">Layout & card</p>
        <label class="full">Layout <select name="layout">${L().LAYOUTS.map((x) => `<option value="${x.id}"${d.layout === x.id ? " selected" : ""}>${esc(x.label)}</option>`).join("")}</select></label>
        <label>Card width <input name="card_width" type="number" min="320" max="560" value="${esc(d.card.width)}" /></label>
        <label>Card radius <input name="card_radius" type="number" min="4" max="28" value="${esc(d.card.radius)}" /></label>
        <label>Shadow 0–3 <input name="card_shadow" type="number" min="0" max="3" value="${esc(d.card.shadow)}" /></label>
        <label>Opacity <input name="card_opacity" type="number" min="0.72" max="1" step="0.01" value="${esc(d.card.opacity)}" /></label>
        <label>Logo size <input name="card_logoSize" type="number" min="96" max="220" value="${esc(d.card.logoSize)}" /></label>
        <label>Spacing <input name="card_spacing" type="number" min="8" max="28" value="${esc(d.card.spacing)}" /></label>
        <label>Input style <select name="card_inputStyle"><option${d.card.inputStyle === "outline" ? " selected" : ""}>outline</option><option${d.card.inputStyle === "filled" ? " selected" : ""}>filled</option></select></label>
        <label>Button style <select name="card_buttonStyle"><option${d.card.buttonStyle === "solid" ? " selected" : ""}>solid</option><option${d.card.buttonStyle === "soft" ? " selected" : ""}>soft</option></select></label>
      </form>`;
    }
    if (pane === "settings") {
      const c = d.colors || {};
      return `<form id="login-page-form" class="settings item-composer">
        <p class="item-mode">Colors, slider, CTA</p>
        <label class="full"><input type="checkbox" name="colors_useGlobal"${c.useGlobal ? " checked" : ""} /> Use global brand colors</label>
        <label>Primary <input name="colors_primary" type="color" value="${esc(c.primary || "#0d9488")}" /></label>
        <label>Primary HEX/RGB <input name="colors_primaryHex" value="${esc(c.primary || "#0d9488")}" placeholder="#0d9488 or rgb(13,148,136)" /></label>
        <label>Secondary <input name="colors_secondary" type="color" value="${esc(c.secondary || "#0f172a")}" /></label>
        <label>Button <input name="colors_button" type="color" value="${esc(c.button || "#0d9488")}" /></label>
        <label>Text HEX <input name="colors_text" value="${esc(c.text || "#0f172a")}" /></label>
        <label>Background <input name="colors_background" value="${esc(c.background || "#f1f5f9")}" /></label>
        <label>Card <input name="colors_card" value="${esc(c.card || "#ffffff")}" /></label>
        <p class="hint">Color picker, HEX, or RGB. Extreme card sizes are clamped so the form stays usable.</p>
        <label class="full"><input type="checkbox" name="sliderOn"${d.sliderOn ? " checked" : ""} /> Slider on</label>
        <label class="full"><input type="checkbox" name="autoRotate"${d.autoRotate ? " checked" : ""} /> Auto rotate</label>
        <label>Rotation ms <input name="rotateMs" type="number" min="2500" max="20000" value="${esc(d.rotateMs)}" /></label>
        <label>Transition <select name="transition">${L().TRANSITIONS.map((t) => `<option${d.transition === t ? " selected" : ""}>${t}</option>`).join("")}</select></label>
        <label>Max upload KB <input name="maxUploadKb" type="number" min="200" max="2048" value="${esc(d.maxUploadKb)}" /></label>
        <label class="full">Image source <select name="imageSource"><option value="default"${d.imageSource === "default" ? " selected" : ""}>Default ATAV Image</option><option value="custom"${d.imageSource === "custom" ? " selected" : ""}>Custom Master Admin Image</option><option value="business"${d.imageSource === "business" ? " selected" : ""}>Business-Type Image</option><option value="campaign"${d.imageSource === "campaign" ? " selected" : ""}>Campaign Image</option></select></label>
        <p class="hint">Live priority is always Campaign → Business type → Custom → Default, independent of this label.</p>
        <label>Register CTA visible <select name="cta_register_vis"><option value="1"${d.ctas.register.visible !== false ? " selected" : ""}>Yes</option><option value="0"${d.ctas.register.visible === false ? " selected" : ""}>No</option></select></label>
        <label>Demo CTA visible <select name="cta_demo_vis"><option value="1"${d.ctas.demo.visible ? " selected" : ""}>Yes</option><option value="0"${!d.ctas.demo.visible ? " selected" : ""}>No</option></select></label>
        <label class="full">Demo URL <input name="cta_demo_url" value="${esc(d.ctas.demo.url || "")}" /></label>
        <label class="full">Support URL <input name="cta_support_url" value="${esc(d.ctas.support.url || "")}" /></label>
      </form>`;
    }
    if (pane === "images" || pane === "background" || pane === "banner" || pane === "logo" || pane === "mobile") {
      const kind = pane === "images" ? "desktop" : pane === "logo" ? "logo" : pane === "mobile" ? "mobile" : pane;
      const rec =
        kind === "desktop"
          ? "Desktop or square festive poster. JPG, PNG or WebP — large files are compressed under 900 KB and published to shop login."
          : kind === "mobile"
            ? "Mobile 1080×1920. Used under 760px."
            : kind === "background"
              ? "Background behind the scene panel."
              : "Promotional banner / side / ad — pick type on upload.";
      const field =
        kind === "desktop"
          ? "desktopImageId"
          : kind === "mobile"
            ? "mobileImageId"
            : kind === "background"
              ? "backgroundImageId"
              : kind === "banner"
                ? "bannerImageId"
                : "logoImageId";
      return `<form id="login-page-form" class="settings item-composer">
        <p class="item-mode">${esc(kind)} image</p>
        <label class="full">Assigned image ${imgSelect(field, d[field] || "", [kind, "library"])}</label>
        ${kind === "desktop" ? `<label class="full">Tablet ${imgSelect("tabletImageId", d.tabletImageId || "", ["tablet", "desktop", "library"])}</label>` : ""}
        ${kind === "desktop" ? `<label class="full">Side panel ${imgSelect("sideImageId", d.sideImageId || "", ["side", "library"])}</label><label class="full">Advert / offer ${imgSelect("adImageId", d.adImageId || "", ["ad", "library"])}</label>` : ""}
        ${uploadBlock(kind, rec)}
      </form>`;
    }
    if (pane === "media") {
      const q = "";
      const rows = bundle.images || [];
      return `<div>
        <form id="login-page-form" class="settings item-composer">${uploadBlock("library", "Media library. Set as login / mobile / banner from Actions.")}</form>
        <label class="full">Search <input id="login-media-q" placeholder="Name or type" /></label>
        ${(rows.length
          ? `<div class="table-wrap"><table class="data"><thead><tr><th>Image</th><th>Name</th><th>Type</th><th>Size</th><th>By</th><th>Date</th><th></th></tr></thead><tbody>${rows
              .map(
                (i) => `<tr>
                <td><img class="login-lib-thumb" src="${esc(i.thumb || i.url)}" alt="" /></td>
                <td>${esc(i.name)}</td><td>${esc(i.kind)}</td><td>${Math.round((i.bytes || 0) / 1024)} KB</td>
                <td>${esc(i.uploaded_by || "")}</td><td>${esc(String(i.created_at || "").slice(0, 16))}</td>
                <td>
                  <button class="btn" type="button" data-set-kind="desktop" data-img="${esc(i.id)}">Login</button>
                  <button class="btn" type="button" data-set-kind="mobile" data-img="${esc(i.id)}">Mobile</button>
                  <button class="btn" type="button" data-set-kind="banner" data-img="${esc(i.id)}">Banner</button>
                  <button class="btn" type="button" data-img-rename="${esc(i.id)}">Rename</button>
                  <button class="btn" type="button" data-img-del="${esc(i.id)}">Delete</button>
                </td></tr>`,
              )
              .join("")}</tbody></table></div>`
          : `<p class="hint">No images yet. Upload on the left.</p>`)}
      </div>`;
    }
    if (pane === "campaigns") {
      return `<form id="login-campaign-form" class="settings item-composer">
        <p class="item-mode">Schedule</p>
        <label class="full">Campaign name <input name="name" required placeholder="Diwali POS Offer" /></label>
        <label class="full">Image ${imgSelect("image_id", "", null)}</label>
        <label>Start date <input name="start_date" type="date" /></label>
        <label>End date <input name="end_date" type="date" /></label>
        <label>Start time <input name="start_time" type="time" value="00:00" /></label>
        <label>End time <input name="end_time" type="time" value="23:59" /></label>
        <label>Status <select name="status"><option value="draft">Draft</option><option value="active">Active</option></select></label>
        <button class="btn primary" type="submit">Save campaign</button>
      </form>
      ${(bundle.campaigns || []).length
        ? `<div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Start</th><th>End</th><th>Status</th></tr></thead><tbody>${(bundle.campaigns || [])
            .map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.start_date)} ${esc(c.start_time || "")}</td><td>${esc(c.end_date)} ${esc(c.end_time || "")}</td><td>${esc(c.status)}</td></tr>`)
            .join("")}</tbody></table></div>`
        : `<p class="hint">No campaigns. After expiry the login returns to the next priority image.</p>`}`;
    }
    if (pane === "history") {
      return `<p class="hint">Versions and audit. Restore loads a draft; Publish to go live.</p>
        <div class="table-wrap"><table class="data"><thead><tr><th>Version</th><th>Status</th><th>By</th><th>When</th><th></th></tr></thead><tbody>${(bundle.versions || [])
          .map(
            (v) => `<tr><td>${esc(v.version)}</td><td>${esc(v.status)}</td><td>${esc(v.actor)}</td><td>${esc(String(v.created_at || "").slice(0, 19))}</td>
            <td><button class="btn" type="button" data-restore="${esc(v.id)}">Restore</button></td></tr>`,
          )
          .join("")}</tbody></table></div>
        <h4>Audit</h4>
        <div class="table-wrap"><table class="data"><thead><tr><th>When</th><th>Admin</th><th>Action</th><th>IP</th></tr></thead><tbody>${(bundle.audit || [])
          .map((a) => `<tr><td>${esc(String(a.created_at || "").slice(0, 19))}</td><td>${esc(a.actor)}</td><td>${esc(a.action)}</td><td>${esc(a.ip)}</td></tr>`)
          .join("") || "<tr><td colspan=4>No audit yet.</td></tr>"}</tbody></table></div>`;
    }
    if (pane === "preview") {
      const types = ["", ...L().BIZ_TYPES];
      return `<form id="login-page-form" class="settings item-composer">
        <p class="item-mode">Business-type experience</p>
        <label class="full">Preview as <select name="previewBizType">${types.map((t) => `<option${d.previewBizType === t ? " selected" : ""}>${esc(t) || "Default"}</option>`).join("")}</select></label>
        ${L().BIZ_TYPES.map((t) => {
          const bt = (d.businessTypes || {})[t] || {};
          return `<fieldset class="item-block"><legend>${esc(t)}</legend>
            <label class="full">Heading <input name="bt_${t}_heading" value="${esc(bt.heading || "")}" placeholder="Manage Your ${esc(t)} Smarter" /></label>
            <label class="full">Image ${imgSelect(`bt_${t}_imageId`, bt.imageId || "", ["desktop", "library"])}</label>
          </fieldset>`;
        }).join("")}
      </form>`;
    }
    return `<form id="login-page-form" class="settings item-composer">
      <p class="item-mode">Promotional side panel</p>
      <label class="full"><input type="checkbox" name="promo_on"${d.promo.on ? " checked" : ""} /> Show side panel</label>
      <label class="full">Title <input name="promo_title" value="${esc(d.promo.title)}" /></label>
      <label class="full">Points (one per line) <textarea name="promo_points" rows="6">${esc((d.promo.points || []).join("\n"))}</textarea></label>
      <label>CTA text <input name="promo_cta" value="${esc(d.promo.cta)}" /></label>
      <label>CTA URL <input name="promo_ctaUrl" value="${esc(d.promo.ctaUrl)}" /></label>
      <label class="full"><input type="checkbox" name="promo_ctaNewTab"${d.promo.ctaNewTab ? " checked" : ""} /> Open CTA in new tab</label>
    </form>`;
  }

  function collectForm(form) {
    if (!form) return {};
    const fd = new FormData(form);
    const d = mergeDraft();
    const patch = { ...d };
    const set = (k, v) => {
      if (v !== null && v !== undefined) patch[k] = v;
    };
    for (const [k, v] of fd.entries()) {
      if (k.startsWith("upload_") || k.startsWith("bt_") || k === "cta_register_url") continue;
      if (k === "colors_useGlobal" || k === "sliderOn" || k === "autoRotate" || k === "promo_on" || k === "promo_ctaNewTab") continue;
      if (k.startsWith("card_")) {
        patch.card = patch.card || {};
        const ck = k.slice(5);
        patch.card[ck] = /width|radius|shadow|opacity|logoSize|spacing/.test(ck) ? Number(v) : v;
      } else if (k.startsWith("colors_")) {
        patch.colors = patch.colors || {};
        const ck = k.slice(7);
        if (ck === "primaryHex") {
          const raw = String(v).trim();
          const rgb = raw.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
          patch.colors.primary = rgb
            ? `#${[rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`
            : raw || patch.colors.primary;
        } else patch.colors[ck] = v;
      } else if (k.startsWith("promo_")) {
        patch.promo = patch.promo || {};
        patch.promo[k.slice(6)] = v;
      } else if (k.startsWith("cta_")) {
        /* handled below */
      } else set(k, v);
    }
    patch.colors = patch.colors || d.colors;
    patch.colors.useGlobal = form.querySelector('[name="colors_useGlobal"]')?.checked ?? d.colors.useGlobal;
    patch.sliderOn = form.querySelector('[name="sliderOn"]')?.checked ?? d.sliderOn;
    patch.autoRotate = form.querySelector('[name="autoRotate"]')?.checked ?? d.autoRotate;
    if (form.querySelector('[name="promo_on"]')) patch.promo.on = form.querySelector('[name="promo_on"]').checked;
    if (form.querySelector('[name="promo_ctaNewTab"]')) patch.promo.ctaNewTab = form.querySelector('[name="promo_ctaNewTab"]').checked;
    const pts = form.querySelector('[name="promo_points"]');
    if (pts) patch.promo.points = String(pts.value || "").split("\n").map((s) => s.trim()).filter(Boolean);
    const demoVis = fd.get("cta_demo_vis");
    if (demoVis != null) patch.ctas.demo.visible = demoVis === "1";
    const regVis = fd.get("cta_register_vis");
    if (regVis != null) patch.ctas.register.visible = regVis === "1";
    if (fd.get("cta_demo_url") != null) patch.ctas.demo.url = String(fd.get("cta_demo_url"));
    if (fd.get("cta_support_url") != null) patch.ctas.support.url = String(fd.get("cta_support_url"));
    patch.businessTypes = { ...(d.businessTypes || {}) };
    L().BIZ_TYPES.forEach((t) => {
      const heading = fd.get(`bt_${t}_heading`);
      const imageId = fd.get(`bt_${t}_imageId`);
      if (heading != null || imageId != null) {
        patch.businessTypes[t] = { ...(patch.businessTypes[t] || {}), heading: heading || "", imageId: imageId || "" };
      }
    });
    patch.card = L().clampCard(patch.card);
    return patch;
  }

  function publicPageHtml(pane) {
    const d = mergeDraft();
    if (pane === "homepage") {
      return `<div class="items-desk master-desk login-page-desk website-page-desk">
        <header class="items-hero">
          <div class="items-hero-copy">
            <p class="items-kicker">Website</p>
            <h3>Homepage</h3>
            <p class="lede">The public marketing site at home.html. SEO titles live in SEO Management. Shop login images live under Login Page.</p>
          </div>
        </header>
        <div class="website-hub-actions">
          <a class="btn primary" href="./home.html" target="_blank" rel="noopener">Open homepage</a>
          <button class="btn" type="button" data-website-pane="images">Login page images</button>
          <button class="btn" type="button" data-website-pane="branding">Branding</button>
        </div>
        <iframe class="website-live-frame" src="./home.html" title="Homepage preview"></iframe>
      </div>`;
    }
    if (pane === "register") {
      return `<div class="items-desk master-desk login-page-desk website-page-desk">
        <header class="items-hero">
          <div class="items-hero-copy">
            <p class="items-kicker">Website</p>
            <h3>Registration Page</h3>
            <p class="lede">Shop owners sign up from the login screen. Toggle the Sign Up tab, then Publish.</p>
          </div>
        </header>
        <div class="login-page-split">
          <form id="login-page-form" class="settings item-composer">
            <p class="item-mode">Sign-up tab</p>
            <label>Show Sign Up <select name="cta_register_vis"><option value="1"${d.ctas.register.visible !== false ? " selected" : ""}>Yes</option><option value="0"${d.ctas.register.visible === false ? " selected" : ""}>No</option></select></label>
            <label class="full">Sign Up label <input name="signupText" value="${esc(d.signupText)}" /></label>
            <label class="full">Sign Up URL <input name="cta_register_url" value="${esc(d.ctas.register.url || "")}" placeholder="Leave blank for the built-in form" /></label>
            <p class="hint">Draft → Publish. This does not change passwords or shop login security.</p>
          </form>
          <aside class="login-page-aside">
            <p class="support-preview-label">Live signup</p>
            <a class="btn" href="./login.html?tab=signup" target="_blank" rel="noopener">Open sign-up</a>
            <iframe class="website-live-frame is-login" src="./login.html?tab=signup" title="Registration preview"></iframe>
          </aside>
        </div>
        <div class="purchase-doc-actions">
          <button class="btn" type="button" data-login-act="draft">Save Draft</button>
          <button class="btn primary" type="button" data-login-act="publish">Publish</button>
          <p class="hint" id="login-page-hint">Draft edits do not change the live login until Publish.</p>
        </div>
      </div>`;
    }
    return `<div class="items-desk master-desk login-page-desk website-page-desk">
      <header class="items-hero">
        <div class="items-hero-copy">
          <p class="items-kicker">Website</p>
          <h3>Contact Page</h3>
          <p class="lede">The public demo and support block on the homepage. Assigned shops also see their account manager on Support.</p>
        </div>
      </header>
      <div class="website-hub-actions">
        <a class="btn primary" href="./home.html#contact" target="_blank" rel="noopener">Open contact</a>
        <a class="btn" href="https://wa.me/919765040588" target="_blank" rel="noopener">WhatsApp</a>
      </div>
      <iframe class="website-live-frame" src="./home.html#contact" title="Contact preview"></iframe>
    </div>`;
  }

  function bindPublicPage(body, api, opts, on) {
    body.querySelectorAll("[data-website-pane]").forEach((b) => {
      b.onclick = () => opts.setPane(b.dataset.websitePane);
    });
    if (on !== "register") return;
    const hint = () => document.getElementById("login-page-hint");
    const saveDraft = async () => {
      const patch = collectForm(document.getElementById("login-page-form"));
      const form = document.getElementById("login-page-form");
      const url = form?.querySelector('[name="cta_register_url"]')?.value;
      if (url != null) {
        patch.ctas = patch.ctas || {};
        patch.ctas.register = { ...(patch.ctas.register || {}), url: String(url) };
      }
      bundle = await api("/api/master/login-page", { method: "POST", body: JSON.stringify(patch) });
      if (hint()) {
        hint().textContent = "Draft saved. Click Publish to show this on shop login.";
        hint().className = "hint ok";
      }
    };
    body.querySelector("[data-login-act=draft]")?.addEventListener("click", () => saveDraft().catch((e) => hint() && (hint().textContent = e.message)));
    body.querySelector("[data-login-act=publish]")?.addEventListener("click", async () => {
      try {
        await saveDraft();
        bundle = await api("/api/master/login-page/publish", { method: "POST", body: "{}" });
        if (hint()) {
          hint().textContent = `Published v${bundle.published_version}. Hard-refresh login to see Sign Up.`;
          hint().className = "hint ok";
        }
      } catch (e) {
        if (hint()) hint().textContent = e.message;
      }
    });
  }

  async function render(body, pane, api, opts) {
    const on = resolvePane(pane);
    if (!L()?.defaults) {
      body.innerHTML = `<p class="hint error">Login Page UI did not load. Upload js/login-page.js.</p>`;
      return;
    }
    try {
      bundle = await api("/api/master/login-page");
    } catch (err) {
      body.innerHTML = `<p class="hint error">${esc(err.message)}</p>`;
      return;
    }
    if (PUBLIC_PANES[on]) {
      body.innerHTML = publicPageHtml(on);
      bindPublicPage(body, api, opts, on);
      return;
    }
    try {
      body.innerHTML = shell(on, paneHtml(on));
    } catch (err) {
      body.innerHTML = `<p class="hint error">${esc(err.message || err)}</p>`;
      return;
    }
    const hint = () => document.getElementById("login-page-hint");
    const refresh = () => opts.setPane(on);
    body.querySelectorAll("[data-website-pane]").forEach((b) => (b.onclick = () => opts.setPane(b.dataset.websitePane)));
    body.querySelectorAll("[data-prev-mode]").forEach((b) => {
      b.onclick = () => {
        previewMode = b.dataset.prevMode;
        refresh();
      };
    });
    const form = document.getElementById("login-page-form");
    form?.addEventListener("input", () => {
      bundle.draft = collectForm(form);
      const aside = body.querySelector(".login-page-aside");
      if (aside) {
        const modes = aside.querySelector(".login-prev-modes")?.outerHTML || "";
        aside.innerHTML = `<p class="support-preview-label">Live preview</p>${modes}${livePreview()}`;
        aside.querySelectorAll("[data-prev-mode]").forEach((b) => {
          b.onclick = () => {
            previewMode = b.dataset.prevMode;
            refresh();
          };
        });
      }
    });
    const saveDraft = async () => {
      const patch = collectForm(document.getElementById("login-page-form"));
      bundle = await api("/api/master/login-page", { method: "POST", body: JSON.stringify(patch) });
      if (hint()) {
        hint().textContent = "Draft saved. Click Publish to show this on shop and Master Admin login.";
        hint().className = "hint ok";
      }
    };
    body.querySelector("[data-login-act=draft]")?.addEventListener("click", () => saveDraft().catch((e) => (hint().textContent = e.message)));
    body.querySelector("[data-login-act=preview]")?.addEventListener("click", () => window.open("./login.html?preview=1", "_blank"));
    body.querySelector("[data-login-act=publish]")?.addEventListener("click", async () => {
      try {
        await saveDraft();
        bundle = await api("/api/master/login-page/publish", { method: "POST", body: "{}" });
        if (hint()) {
        hint().textContent = `Published v${bundle.published_version}. Hard-refresh login pages to see the new image.`;
          hint().className = "hint ok";
        }
      } catch (e) {
        if (hint()) hint().textContent = e.message;
      }
    });
    body.querySelector("[data-login-act=unpublish]")?.addEventListener("click", async () => {
      bundle = await api("/api/master/login-page/unpublish", { method: "POST", body: "{}" });
      if (hint()) hint().textContent = "Unpublished. Shop login uses built-in defaults.";
    });
    body.querySelector("[data-login-file]")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const kind = form?.querySelector('[name="upload_kind"]')?.value || "library";
        const name = form?.querySelector('[name="upload_name"]')?.value || file.name;
        const packed = await compressUnder(file, kind === "mobile" ? 1080 : 1920, mergeDraft().maxUploadKb);
        bundle = await api("/api/master/login-page/images", {
          method: "POST",
          body: JSON.stringify({ ...packed, name, kind, maxUploadKb: mergeDraft().maxUploadKb }),
        });
        const uploadedId = bundle.uploaded?.id || bundle.images?.[0]?.id;
        const field = fieldForUpload(on, kind);
        if (uploadedId && field) {
          const patch = assignUpload({ ...mergeDraft(), ...collectForm(form) }, field, uploadedId);
          bundle = await api("/api/master/login-page", { method: "POST", body: JSON.stringify(patch) });
          bundle = await api("/api/master/login-page/publish", { method: "POST", body: "{}" });
        }
        if (hint()) {
          hint().textContent = `Image published v${bundle.published_version || 0}. Hard-refresh shop login to see it.`;
          hint().className = "hint ok";
        }
        opts.setPane(on);
      } catch (err) {
        if (hint()) {
          hint().textContent = err.message;
          hint().className = "hint error";
        }
      }
    });
    body.querySelectorAll("[data-set-kind]").forEach((b) => {
      b.onclick = async () => {
        const field = b.dataset.setKind === "desktop" ? "desktopImageId" : b.dataset.setKind === "mobile" ? "mobileImageId" : "bannerImageId";
        bundle.draft = assignUpload({ ...mergeDraft() }, field, b.dataset.img);
        await api("/api/master/login-page", { method: "POST", body: JSON.stringify(bundle.draft) });
        bundle = await api("/api/master/login-page/publish", { method: "POST", body: "{}" });
        if (hint()) {
          hint().textContent = `Image published v${bundle.published_version || 0}. Hard-refresh shop login to see it.`;
          hint().className = "hint ok";
        }
        opts.setPane(on);
      };
    });
    body.querySelector("#login-media-q")?.addEventListener("input", (e) => {
      const q = String(e.target.value || "").toLowerCase();
      body.querySelectorAll("table.data tbody tr").forEach((tr) => {
        tr.hidden = q !== "" && !tr.textContent.toLowerCase().includes(q);
      });
    });
    body.querySelectorAll("[data-img-rename]").forEach((b) => {
      b.onclick = async () => {
        const name = window.prompt("Image name");
        if (!name) return;
        await api(`/api/master/login-page/images/${b.dataset.imgRename}`, { method: "POST", body: JSON.stringify({ name }) });
        opts.setPane(on);
      };
    });
    body.querySelectorAll("[data-img-del]").forEach((b) => {
      b.onclick = async () => {
        await api(`/api/master/login-page/images/${b.dataset.imgDel}`, { method: "POST", body: JSON.stringify({ status: "deleted" }) });
        opts.setPane(on);
      };
    });
    body.querySelectorAll("[data-restore]").forEach((b) => {
      b.onclick = async () => {
        await api(`/api/master/login-page/versions/${b.dataset.restore}/restore`, { method: "POST", body: "{}" });
        opts.setPane(on);
      };
    });
    document.getElementById("login-campaign-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      bundle = await api("/api/master/login-page/campaigns", { method: "POST", body: JSON.stringify(fd) });
      opts.setPane("campaigns");
    });
  }

  g.POSMasterLoginPage = { render, PANES, resolvePane, fieldForUpload, assignUpload };
})(typeof window !== "undefined" ? window : globalThis);
