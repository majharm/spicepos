(function () {
  const ALLOWED = [
    "page_view", "scroll", "click", "login_click", "signup_click", "get_started", "book_demo",
    "contact_submit", "phone_click", "email_click", "whatsapp_click", "pricing_view", "pricing_click",
    "feature_view", "business_category_view", "business_category_select", "ai_growth_view",
    "hardware_view", "weighing_scale_view", "qr_order_view", "demo_video_play", "faq_open", "download_brochure",
  ];
  const CONSENT = "atav_ga_consent";
  const SID = "atav_ga_sid";
  function sid() {
    let s = localStorage.getItem(SID);
    if (!s) {
      s = "s" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(SID, s);
    }
    return s;
  }
  function utm() {
    const q = new URLSearchParams(location.search);
    const o = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((k) => {
      if (q.get(k)) o[k] = q.get(k);
    });
    return o;
  }
  function consent() {
    return localStorage.getItem(CONSENT) === "granted";
  }
  function denied() {
    return localStorage.getItem(CONSENT) === "denied";
  }
  function applyMeta(name, content) {
    const value = String(content || "").trim();
    if (!name || !value) return;
    if (document.querySelector(`meta[name="${name}"]`)) return;
    const m = document.createElement("meta");
    m.setAttribute("name", name);
    m.setAttribute("content", value);
    document.head.appendChild(m);
  }
  function safeRedirect(url) {
    const next = String(url || "").trim();
    if (!next) return false;
    try {
      if (next.startsWith("/") && !next.startsWith("//")) {
        if (next.split("?")[0] === location.pathname) return false;
        location.replace(next);
        return true;
      }
      const u = new URL(next, location.origin);
      if (u.origin !== location.origin) return false;
      if (u.pathname === location.pathname && u.search === location.search) return false;
      location.replace(u.pathname + u.search + u.hash);
      return true;
    } catch {
      return false;
    }
  }
  function postEvent(name, params) {
    if (!ALLOWED.includes(name)) return;
    if (denied()) return;
    const body = {
      event_name: name,
      page_path: location.pathname,
      page_title: document.title.slice(0, 120),
      referrer: document.referrer.slice(0, 200),
      session_id: sid(),
      params: { page_type: "landing_page", ...utm(), ...(params || {}) },
    };
    const url = "/api/analytics/event";
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([JSON.stringify(body)], { type: "application/json" }));
      } else {
        fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
      }
    } catch {
      /* ignore */
    }
    if (window.gtag && consent()) {
      const safe = { ...body.params };
      delete safe.phone;
      delete safe.email;
      delete safe.name;
      window.gtag("event", name, safe);
    }
  }
  function loadGtag(id, granted) {
    if (!id) return;
    window.dataLayer = window.dataLayer || [];
    if (!window.gtag) {
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag("consent", "default", {
        analytics_storage: granted ? "granted" : "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        wait_for_update: 500,
      });
      window.gtag("js", new Date());
      window.gtag("config", id, { anonymize_ip: true, send_page_view: true });
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
      document.head.appendChild(s);
      return;
    }
    if (granted) {
      window.gtag("consent", "update", { analytics_storage: "granted" });
    }
  }
  function banner(cfg) {
    const id = cfg.measurement_id;
    if (id) loadGtag(id, !cfg.consent_required || consent());
    if (!cfg.consent_required) {
      localStorage.setItem(CONSENT, "granted");
      return;
    }
    if (consent() || denied()) return;
    if (document.getElementById("ga-consent")) return;
    const el = document.createElement("div");
    el.id = "ga-consent";
    el.innerHTML = `<p>We use cookies and Google Analytics to understand visits to this website. We do not send names, emails or phone numbers to Google.</p>
      <button type="button" data-ga="yes">Accept analytics</button>
      <button type="button" data-ga="no">Reject</button>`;
    el.style.cssText = "position:fixed;bottom:12px;left:12px;right:12px;z-index:80;background:#062a5c;color:#fff;padding:14px 16px;border-radius:14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;font:13px/1.4 Poppins,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.25)";
    el.querySelectorAll("button").forEach((b) => {
      b.style.cssText = "border:0;border-radius:999px;padding:8px 14px;font-weight:700;cursor:pointer";
    });
    document.body.appendChild(el);
    el.onclick = (e) => {
      const a = e.target.dataset?.ga;
      if (!a) return;
      localStorage.setItem(CONSENT, a === "yes" ? "granted" : "denied");
      el.remove();
      if (a === "yes") {
        if (id) loadGtag(id, true);
        postEvent("page_view", { page_type: "landing_page" });
      }
    };
  }
  function bindCtas() {
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a,button");
      if (!a) return;
      const named = a.getAttribute("data-ga-event");
      if (named) {
        postEvent(named, { cta_type: named, business_category: a.getAttribute("data-ga-category") || undefined });
        return;
      }
      const href = String(a.getAttribute("href") || "");
      const text = (a.textContent || "").toLowerCase();
      if (href.includes("login.html") && (href.includes("signup") || href.includes("tab=signup"))) postEvent("signup_click", { cta_type: "get_started" });
      else if (href.includes("login.html")) postEvent("login_click", { cta_type: "login" });
      if (text.includes("get started") || text.includes("get free demo")) postEvent("get_started", { cta_type: "get_started" });
      if ((text.includes("book") && text.includes("demo")) || text.includes("request demo")) postEvent("book_demo", { cta_type: "book_demo" });
      if (href.startsWith("tel:")) postEvent("phone_click", { cta_type: "phone" });
      if (href.startsWith("mailto:")) postEvent("email_click", { cta_type: "email" });
      if (href.includes("wa.me") || text.includes("whatsapp")) postEvent("whatsapp_click", { cta_type: "whatsapp" });
      if (href.includes("about.html")) postEvent("feature_view", { page_type: "about" });
      if (a.closest("#types") || text.includes("pharmacy") || href.includes("#types")) {
        const cat = (a.textContent || "").trim().slice(0, 40);
        if (cat) postEvent("business_category_select", { business_category: cat.toLowerCase() });
      }
    });
    document.getElementById("contact-form")?.addEventListener("submit", () => {
      postEvent("contact_submit", { cta_type: "contact_submit" });
    });
    document.getElementById("signup-form")?.addEventListener("submit", () => {
      postEvent("signup_click", { cta_type: "signup" });
    });
    document.getElementById("login-form")?.addEventListener("submit", () => {
      postEvent("login_click", { cta_type: "login" });
    });
    let scrolled = false;
    window.addEventListener("scroll", () => {
      if (scrolled) return;
      if (window.scrollY > 400) {
        scrolled = true;
        postEvent("scroll", { cta_type: "scroll" });
      }
    }, { passive: true });
  }
  async function applySeo() {
    try {
      const res = await fetch("/api/seo/public");
      if (res.ok) {
        const seo = await res.json();
        applyMeta("google-site-verification", seo.google_site_verification);
        applyMeta("msvalidate.01", seo.bing_verification);
      }
    } catch {
      /* offline */
    }
    try {
      const res = await fetch("/api/seo/redirects?url=" + encodeURIComponent(location.pathname + location.search));
      if (res.ok) {
        const row = await res.json();
        if (row && safeRedirect(row.new_url)) return true;
      }
    } catch {
      /* offline */
    }
    return false;
  }
  async function boot() {
    let cfg = { measurement_id: "", consent_required: true, connected: false };
    try {
      const res = await fetch("/api/analytics/config");
      if (res.ok) cfg = await res.json();
    } catch {
      /* offline */
    }
    banner(cfg);
    window.ATAVGa4.cfg = cfg;
    if (await applySeo()) return;
    bindCtas();
    if (!denied()) {
      postEvent("page_view", { page_type: "landing_page" });
      if (location.hash === "#pricing" || location.pathname.includes("pricing")) postEvent("pricing_view", {});
      if (location.hash === "#features") postEvent("feature_view", {});
      if (location.hash === "#ai") postEvent("ai_growth_view", {});
      if (location.hash === "#hardware") postEvent("hardware_view", {});
    }
  }
  window.ATAVGa4 = { postEvent, ALLOWED, cfg: { consent_required: true } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
