(function (root) {
  const DEFAULT_DESKTOP = "./assets/login-atav-smart-pos.jpg?v=20260919loginp1";
  const DEFAULT_LOGO = "./assets/atav-telecom-logo.png";
  const BIZ_TYPES = [
    "Retail",
    "Pharmacy",
    "Restaurant",
    "Cafe",
    "Salon",
    "Spa",
    "Garment",
    "Grocery",
    "Supermarket",
    "Dairy",
    "Electronics",
    "Hardware",
    "Bakery",
    "Wholesale",
    "Service Business",
  ];
  const LAYOUTS = [
    { id: "image-left", label: "Layout 1 — Image left, login right" },
    { id: "login-left", label: "Layout 2 — Login left, image right" },
    { id: "full-bg", label: "Layout 3 — Full background, centered card" },
    { id: "split", label: "Layout 4 — Split screen" },
    { id: "minimal", label: "Layout 5 — Minimal login" },
  ];
  const TRANSITIONS = ["fade", "slide", "zoom", "none"];

  function defaults() {
    return {
      layout: "image-left",
      sliderOn: false,
      autoRotate: true,
      rotateMs: 5000,
      transition: "fade",
      imageSource: "default",
      maxUploadKb: 900,
      heading: "Sign in",
      subheading: "to access ATAV POS",
      loginButton: "Sign In",
      forgotText: "Forgot Password?",
      signupText: "Don't have an account? Get Started",
      companyName: "ATAV POS",
      tagline: "For every business",
      brandDescription: "Run Your Business. Sell More. Grow Smarter.",
      footerText: "ATAV Telecom",
      kicker: "ATAV POS",
      sceneTitle: "All types of businesses use ATAV POS",
      sceneLead: "One login for billing, stock, and GST invoices.",
      logoUrl: DEFAULT_LOGO,
      faviconUrl: "./favicon.svg",
      desktopUrl: DEFAULT_DESKTOP,
      mobileUrl: DEFAULT_DESKTOP,
      tabletUrl: DEFAULT_DESKTOP,
      backgroundUrl: "",
      bannerUrl: "",
      sideUrl: "",
      adUrl: "",
      slides: [
        { url: DEFAULT_DESKTOP, caption: "Run Your Business Smarter", order: 1 },
        { url: DEFAULT_DESKTOP, caption: "Manage Billing & Inventory", order: 2 },
        { url: DEFAULT_DESKTOP, caption: "Grow With AI Insights", order: 3 },
        { url: DEFAULT_DESKTOP, caption: "Manage Multiple Branches", order: 4 },
      ],
      promo: {
        on: true,
        title: "Grow Your Business With ATAV POS",
        points: [
          "Fast Billing",
          "Smart Inventory",
          "Customer Management",
          "Multi-Branch",
          "AI Growth Insights",
          "Reports & Analytics",
        ],
        cta: "Explore ATAV POS",
        ctaUrl: "./home.html",
        ctaNewTab: false,
        visible: true,
      },
      ctas: {
        login: { text: "Sign In", visible: true, url: "", newTab: false },
        register: { text: "Sign Up Now", visible: true, url: "", newTab: false },
        forgot: { text: "Forgot Password?", visible: true, url: "#login-support", newTab: false },
        support: { text: "Contact Support", visible: true, url: "#login-support", newTab: false },
        demo: { text: "Book Demo", visible: false, url: "./home.html#contact", newTab: false },
      },
      colors: {
        useGlobal: true,
        primary: "#0d9488",
        secondary: "#0f172a",
        button: "#0d9488",
        text: "#0f172a",
        background: "#f1f5f9",
        card: "#ffffff",
      },
      card: {
        width: 420,
        radius: 16,
        shadow: 1,
        opacity: 1,
        logoSize: 160,
        inputStyle: "outline",
        buttonStyle: "solid",
        spacing: 16,
      },
      businessTypes: {},
      publishedAt: "",
      version: 0,
    };
  }

  function clampCard(card) {
    const c = { ...defaults().card, ...(card || {}) };
    c.width = Math.min(560, Math.max(320, Number(c.width) || 420));
    c.radius = Math.min(28, Math.max(4, Number(c.radius) || 16));
    c.shadow = Math.min(3, Math.max(0, Number(c.shadow) || 0));
    c.opacity = Math.min(1, Math.max(0.72, Number(c.opacity) || 1));
    c.logoSize = Math.min(220, Math.max(96, Number(c.logoSize) || 160));
    c.spacing = Math.min(28, Math.max(8, Number(c.spacing) || 16));
    return c;
  }

  function campaignActive(campaign, now) {
    if (!campaign || campaign.status !== "active") return false;
    const start = `${campaign.start_date || ""}T${campaign.start_time || "00:00"}`;
    const end = `${campaign.end_date || ""}T${campaign.end_time || "23:59"}`;
    const t = now.getTime();
    const a = Date.parse(start);
    const b = Date.parse(end);
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    return t >= a && t <= b;
  }

  function pickImage(images, id) {
    if (!id || !Array.isArray(images)) return "";
    const row = images.find((i) => i.id === id && i.status !== "deleted");
    return row?.url || "";
  }

  function resolveAppearance(input, now = new Date(), bizType = "") {
    const base = defaults();
    const cfg = { ...base, ...(input?.settings || input || {}) };
    cfg.card = clampCard(cfg.card);
    cfg.colors = { ...base.colors, ...(cfg.colors || {}) };
    cfg.promo = { ...base.promo, ...(cfg.promo || {}) };
    cfg.ctas = { ...base.ctas, ...(cfg.ctas || {}) };
    const images = input?.images || cfg.images || [];
    const campaigns = input?.campaigns || [];
    const typeKey = String(bizType || cfg.previewBizType || "").trim();
    const typeCfg = (cfg.businessTypes || {})[typeKey] || {};
    const live = campaigns.find((c) => campaignActive(c, now));
    let hero = cfg.desktopUrl || base.desktopUrl;
    let source = "default";
    if (cfg.desktopUrl && cfg.desktopUrl !== DEFAULT_DESKTOP) {
      hero = cfg.desktopUrl;
      source = "custom";
    }
    const customId = pickImage(images, cfg.desktopImageId);
    if (customId) {
      hero = customId;
      source = "custom";
    }
    const typeImg = pickImage(images, typeCfg.imageId) || typeCfg.imageUrl || "";
    if (typeImg) {
      hero = typeImg;
      source = "business";
    }
    const campImg = pickImage(images, live?.image_id) || live?.imageUrl || "";
    if (campImg) {
      hero = campImg;
      source = "campaign";
    }
    const mobile = pickImage(images, cfg.mobileImageId) || cfg.mobileUrl || hero;
    const tablet = pickImage(images, cfg.tabletImageId) || cfg.tabletUrl || hero;
    const slides = (cfg.slides || [])
      .map((s, i) => ({
        url: pickImage(images, s.imageId) || s.url || hero,
        caption: s.caption || "",
        order: Number(s.order) || i + 1,
      }))
      .sort((a, b) => a.order - b.order);
    return {
      ...cfg,
      heading: typeCfg.heading || cfg.heading,
      subheading: typeCfg.subheading || cfg.subheading,
      resolvedHero: hero,
      resolvedMobile: mobile,
      resolvedTablet: tablet,
      resolvedLogo: pickImage(images, cfg.logoImageId) || cfg.logoUrl || DEFAULT_LOGO,
      resolvedSource: source,
      resolvedCampaign: live?.name || "",
      slides,
      card: clampCard(cfg.card),
    };
  }

  function versioned(url, v) {
    if (!url || String(url).startsWith("data:")) return url;
    const u = String(url);
    if (/[?&]v=/.test(u)) return u;
    return `${u}${u.includes("?") ? "&" : "?"}v=${v || 0}`;
  }

  function setText(sel, value) {
    const el = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (el && value != null && String(value) !== "") el.textContent = value;
  }

  function applyColors(cfg) {
    const rootEl = document.documentElement;
    if (cfg.colors?.useGlobal) return;
    const c = cfg.colors || {};
    if (c.primary) rootEl.style.setProperty("--accent", c.primary);
    if (c.secondary) rootEl.style.setProperty("--accent-2", c.secondary);
    if (c.button) rootEl.style.setProperty("--brand", c.button);
    if (c.text) rootEl.style.setProperty("--text", c.text);
    if (c.background) rootEl.style.setProperty("--bg", c.background);
  }

  function applyLayout(shell, layout) {
    ["image-left", "login-left", "full-bg", "split", "minimal"].forEach((id) => {
      shell.classList.toggle(`login-layout-${id}`, layout === id);
    });
  }

  let sliderTimer = 0;

  function paintSlides(cfg) {
    const shots = document.querySelector(".auth-scene-shots");
    if (!shots) return;
    const v = cfg.version || cfg.published_version || 0;
    const slides = cfg.sliderOn && cfg.slides?.length ? cfg.slides : [{ url: cfg.resolvedHero, caption: cfg.sceneTitle }];
    const trans = TRANSITIONS.includes(cfg.transition) ? cfg.transition : "fade";
    shots.dataset.transition = trans;
    shots.innerHTML = slides
      .map((s, i) => {
        const desk = versioned(s.url || cfg.resolvedHero, v);
        const tab = versioned(cfg.resolvedTablet || desk, v);
        const mob = versioned(cfg.resolvedMobile || desk, v);
        const alt = (s.caption || "ATAV POS login").replace(/"/g, "");
        return `<figure class="${i === 0 ? "is-hero is-on" : "is-hero"}" data-slide="${i}">
        <picture>
          <source media="(max-width: 760px)" srcset="${mob}" />
          <source media="(max-width: 1100px)" srcset="${tab}" />
          <img src="${desk}" alt="${alt}" loading="${i ? "lazy" : "eager"}" width="1536" height="1024" />
        </picture>
        ${s.caption ? `<figcaption>${s.caption}</figcaption>` : ""}
      </figure>`;
      })
      .join("");
    clearInterval(sliderTimer);
    if (!cfg.sliderOn || !cfg.autoRotate || slides.length < 2) return;
    let n = 0;
    const ms = Math.min(20000, Math.max(2500, Number(cfg.rotateMs) || 5000));
    sliderTimer = setInterval(() => {
      const figs = shots.querySelectorAll("figure");
      if (!figs.length) return;
      figs[n].classList.remove("is-on");
      n = (n + 1) % figs.length;
      figs[n].classList.add("is-on");
    }, ms);
  }

  function applyToLogin(cfg) {
    const shell = document.querySelector(".auth-shell");
    if (!shell || shell.id === "master-gate") return;
    applyLayout(shell, cfg.layout || "image-left");
    applyColors(cfg);
    const card = document.getElementById("auth-card");
    if (card) {
      card.style.maxWidth = `${cfg.card.width}px`;
      card.style.borderRadius = `${cfg.card.radius}px`;
      card.style.background = `rgba(255,255,255,${cfg.card.opacity})`;
    }
    const logo = document.querySelector(".auth-logo");
    if (logo && cfg.resolvedLogo) {
      logo.src = cfg.resolvedLogo;
      logo.style.width = `${cfg.card.logoSize}px`;
    }
    if (cfg.faviconUrl) {
      const icon = document.querySelector('link[rel="icon"]');
      if (icon) icon.href = cfg.faviconUrl;
    }
    setText(".auth-scene-kicker", cfg.kicker || cfg.companyName);
    setText(".auth-scene-title", cfg.sceneTitle);
    setText(".auth-scene-lead", cfg.sceneLead);
    setText("#auth-heading", cfg.heading);
    setText("#auth-lead", cfg.subheading);
    setText(".auth-tagline", cfg.tagline);
    const trial = document.querySelector(".auth-trial-invite");
    if (trial && cfg.signupText) trial.innerHTML = cfg.signupText.replace(/Get Started/i, "<strong>Get Started</strong>");
    const foot = document.getElementById("login-footer-brand");
    if (foot) foot.textContent = cfg.footerText || "";
    const submit = document.getElementById("login-submit");
    if (submit && cfg.ctas?.login?.visible !== false) submit.textContent = cfg.ctas.login.text || cfg.loginButton;
    const forgot = document.querySelector(".auth-forgot");
    if (forgot && cfg.ctas?.forgot) {
      forgot.hidden = cfg.ctas.forgot.visible === false;
      forgot.textContent = cfg.ctas.forgot.text || cfg.forgotText;
      if (cfg.ctas.forgot.url) forgot.href = cfg.ctas.forgot.url;
    }
    const signupTab = document.querySelector('[data-panel="signup"]');
    if (signupTab && cfg.ctas?.register) {
      signupTab.hidden = cfg.ctas.register.visible === false;
      signupTab.textContent = cfg.ctas.register.text || "Sign Up Now";
    }
    paintSlides(cfg);
    const scene = document.querySelector(".auth-scene");
    if (cfg.backgroundUrl && scene) scene.style.backgroundImage = `url(${cfg.backgroundUrl})`;
    let promo = document.getElementById("login-promo-panel");
    if (cfg.promo?.on && cfg.promo?.visible !== false) {
      if (!promo) {
        promo = document.createElement("aside");
        promo.id = "login-promo-panel";
        promo.className = "login-promo-panel";
        document.querySelector(".auth-scene")?.appendChild(promo);
      }
      const pts = (cfg.promo.points || []).map((p) => `<li>${p}</li>`).join("");
      const target = cfg.promo.ctaNewTab ? ` target="_blank" rel="noopener noreferrer"` : "";
      promo.innerHTML = `<h3>${cfg.promo.title || ""}</h3><ul>${pts}</ul>${
        cfg.promo.cta ? `<a class="btn" href="${cfg.promo.ctaUrl || "./home.html"}"${target}>${cfg.promo.cta}</a>` : ""
      }`;
      promo.hidden = false;
    } else if (promo) promo.hidden = true;
    const demo = document.getElementById("login-demo-cta");
    if (cfg.ctas?.demo?.visible) {
      let a = demo;
      if (!a) {
        a = document.createElement("a");
        a.id = "login-demo-cta";
        a.className = "auth-note";
        document.querySelector(".auth-card")?.appendChild(a);
      }
      a.textContent = cfg.ctas.demo.text;
      a.href = cfg.ctas.demo.url || "./home.html";
      a.target = cfg.ctas.demo.newTab ? "_blank" : "_self";
    } else if (demo) demo.hidden = true;
  }

  function previewHtml(cfg) {
    const hero = cfg.resolvedHero || DEFAULT_DESKTOP;
    return `<div class="login-live-preview login-layout-${cfg.layout || "image-left"}">
      <aside class="login-prev-scene">
        <p class="items-kicker">${cfg.kicker || cfg.companyName || ""}</p>
        <img src="${hero}" alt="" />
        <p>${cfg.sceneTitle || ""}</p>
      </aside>
      <div class="login-prev-card" style="max-width:${cfg.card.width}px;border-radius:${cfg.card.radius}px">
        <strong>${cfg.companyName || "ATAV POS"}</strong>
        <h3>${cfg.heading || "Welcome Back"}</h3>
        <p>${cfg.subheading || ""}</p>
        <span class="login-prev-field">Email / Mobile</span>
        <span class="login-prev-field">Password</span>
        <span class="login-prev-btn">${cfg.loginButton || "LOGIN"}</span>
        <small>${cfg.forgotText || ""}</small>
      </div>
    </div>`;
  }

  async function loadPublished() {
    const params = new URLSearchParams(location.search);
    const biz = params.get("biz") || params.get("type") || "";
    try {
      if (params.get("preview") === "1") {
        const draftRes = await fetch("/api/master/login-page", { credentials: "same-origin", cache: "no-store" });
        if (draftRes.ok) {
          const data = await draftRes.json();
          return resolveAppearance(
            { settings: { ...(data.draft || {}), version: data.published_version }, images: data.images, campaigns: data.campaigns },
            new Date(),
            biz || data.draft?.previewBizType || "",
          );
        }
      }
      const res = await fetch("/api/login-page", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) return resolveAppearance({ settings: defaults() });
      const data = await res.json();
      return resolveAppearance(
        { ...data, settings: { ...(data.settings || {}), version: data.published_version || data.v } },
        new Date(),
        biz,
      );
    } catch {
      return resolveAppearance({ settings: defaults() });
    }
  }

  async function bootLogin() {
    if (!document.getElementById("login-form")) return;
    const cfg = await loadPublished();
    applyToLogin(cfg);
  }

  root.POSLoginPage = {
    DEFAULT_DESKTOP,
    DEFAULT_LOGO,
    BIZ_TYPES,
    LAYOUTS,
    TRANSITIONS,
    defaults,
    clampCard,
    campaignActive,
    resolveAppearance,
    applyToLogin,
    previewHtml,
    loadPublished,
    bootLogin,
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootLogin);
  else bootLogin();
})(typeof window !== "undefined" ? window : globalThis);
