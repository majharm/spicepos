(function (root, factory) {
  const api = factory();
  root.SupportPage = api;
  if (typeof window !== "undefined") window.SupportPage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function phoneDigits(phone) {
    return String(phone || "").replaceAll(/\D/g, "");
  }

  function formatPhone(phone) {
    const raw = String(phone || "").trim();
    let digits = phoneDigits(raw);
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
    if (digits.length === 13 && digits.startsWith("091")) digits = digits.slice(3);
    if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    return raw;
  }

  function telHref(phone) {
    const raw = String(phone || "").trim();
    const href = raw.replaceAll(/[^\d+]/g, "");
    return href ? `tel:${href}` : "";
  }

  function waHref(phone, text) {
    let digits = phoneDigits(phone);
    if (!digits) return "";
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    if (digits.length === 10) digits = `91${digits}`;
    const base = `https://wa.me/${digits}`;
    const msg = String(text || "").trim();
    return msg ? `${base}?text=${encodeURIComponent(msg)}` : base;
  }

  function mailHref(email) {
    const value = String(email || "").trim();
    return value.includes("@") ? `mailto:${value}` : "";
  }

  function contactBits(support, opts = {}) {
    const phone = String(support?.support_phone || "").trim();
    const email = String(support?.support_email || "").trim();
    const shop = String(opts.company?.name || "").trim();
    const waText = shop
      ? `Hello, I need help with ATAV POS for ${shop}.`
      : "Hello, I need help with ATAV POS.";
    return {
      phone,
      email,
      tel: telHref(phone),
      wa: waHref(phone, opts.waMessage === false ? "" : waText),
      mail: mailHref(email),
      displayPhone: formatPhone(phone),
    };
  }

  function actionTiles(support, opts = {}) {
    const { phone, email, tel, wa, mail, displayPhone } = contactBits(support, opts);
    const tiles = [
      tel
        ? `<a class="support-tile support-tile-call" href="${escapeHtml(tel)}"><span class="support-tile-kicker">Phone</span><strong>Call now</strong><span>${escapeHtml(displayPhone)}</span></a>`
        : "",
      wa
        ? `<a class="support-tile support-tile-wa" href="${escapeHtml(wa)}" target="_blank" rel="noopener noreferrer"><span class="support-tile-kicker">Chat</span><strong>WhatsApp</strong><span>Message this number</span></a>`
        : "",
      mail
        ? `<a class="support-tile support-tile-mail" href="${escapeHtml(mail)}"><span class="support-tile-kicker">Email</span><strong>Send email</strong><span>${escapeHtml(email)}</span></a>`
        : "",
      phone && !opts.compact
        ? `<button class="support-tile support-tile-copy" type="button" data-copy-phone="${escapeHtml(phone)}"><span class="support-tile-kicker">Clipboard</span><strong>Copy number</strong><span>${escapeHtml(displayPhone)}</span></button>`
        : "",
    ].filter(Boolean);
    return tiles.length ? `<div class="support-cta" role="group" aria-label="Contact support">${tiles.join("")}</div>` : "";
  }

  function heroHtml(support, opts = {}) {
    const { phone, email, displayPhone } = contactBits(support, opts);
    const manager = String(support?.account_manager_name || "").trim();
    if (!phone && !email) {
      return `<header class="items-hero support-hero is-empty">
        <div class="items-hero-copy">
          <p class="items-kicker support-kicker">${manager ? escapeHtml(manager) : "ATAV POS helpline"}</p>
          <h3>Helpline not set yet</h3>
          <p class="lede support-lead">Master Admin can assign an account manager or add a support mobile under Support helpline.</p>
        </div>
      </header>`;
    }
    const stats = [
      phone
        ? `<div class="items-stat"><span>Phone</span><strong class="support-stat-phone">${escapeHtml(displayPhone)}</strong></div>`
        : "",
      email
        ? `<div class="items-stat"><span>Email</span><strong class="support-stat-email">${escapeHtml(email)}</strong></div>`
        : "",
    ]
      .filter(Boolean)
      .join("");
    return `<header class="items-hero support-hero">
      <div class="items-hero-copy">
        <p class="items-kicker support-kicker">${manager ? "Your account manager" : "ATAV POS helpline"}</p>
        <h3>${manager ? escapeHtml(manager) : "Need help with billing or setup?"}</h3>
        <p class="lede support-lead">${manager ? "Call, WhatsApp, or email your assigned ATAV POS account manager. Have your shop name ready." : "Call, WhatsApp, or email platform support. Have your shop name ready."}</p>
      </div>
      <div class="items-hero-stats">${stats}</div>
    </header>`;
  }

  function shopRows(company) {
    const shop = company || {};
    return [
      ["Shop", shop.name || "—", ""],
      ["Address", shop.address || "—", ""],
      ["Shop phone", shop.phone || "—", shop.phone || ""],
      ["Shop email", shop.email || "—", shop.email || ""],
      ["GSTIN", shop.gstin || "—", shop.gstin || ""],
    ]
      .map(([label, value, copy]) => {
        const copyBtn = copy
          ? `<button class="btn support-copy-mini" type="button" data-copy="${escapeHtml(copy)}">Copy</button>`
          : "";
        return `<div class="support-row"><dt>${escapeHtml(label)}</dt><dd><span>${escapeHtml(value)}</span>${copyBtn}</dd></div>`;
      })
      .join("");
  }

  function pageHtml(support, company, opts = {}) {
    const merged = { ...opts, company };
    const hero = heroHtml(support, merged);
    const actions = actionTiles(support, merged);
    if (opts.compact) return `${hero}${actions}`;
    return `${hero}
      ${actions}
      <div class="items-split support-cols">
        <article class="support-panel">
          <h3>This shop</h3>
          <p class="support-panel-note">Printed on invoices and receipts. Copy a field if support asks for it.</p>
          <dl class="support-dl">${shopRows(company)}</dl>
        </article>
        <article class="support-panel">
          <h3>Before you call</h3>
          <ul class="support-tips">
            <li>Shop name and GSTIN</li>
            <li>What you were doing (billing, stock, login)</li>
            <li>Any error text on the screen</li>
            <li>Staff name signed in now</li>
          </ul>
        </article>
      </div>`;
  }

  const TICKET_CATEGORIES = [
    ["billing", "Billing"],
    ["login", "Login"],
    ["stock", "Stock"],
    ["setup", "Setup"],
    ["other", "Other"],
  ];
  const TICKET_PRIORITIES = [
    ["normal", "Normal"],
    ["high", "High"],
    ["urgent", "Urgent"],
  ];

  function ticketCategory(value) {
    const key = String(value || "").trim().toLowerCase();
    return TICKET_CATEGORIES.some(([id]) => id === key) ? key : "other";
  }

  function ticketPriority(value) {
    const key = String(value || "").trim().toLowerCase();
    return TICKET_PRIORITIES.some(([id]) => id === key) ? key : "normal";
  }

  function ticketStatus(value) {
    const key = String(value || "").trim().toLowerCase();
    return ["open", "pending", "resolved"].includes(key) ? key : "";
  }

  function ticketSubject(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
  }

  function ticketBody(value) {
    return String(value ?? "").replaceAll("\r\n", "\n").trim().slice(0, 2000);
  }

  function ticketStatusLabel(status, audience) {
    const key = ticketStatus(status) || "open";
    if (key === "resolved") return "Resolved";
    if (key === "pending") return audience === "master" ? "Waiting on shop" : "Waiting on you";
    return audience === "master" ? "Open" : "With support";
  }

  function ticketCategoryLabel(key) {
    return TICKET_CATEGORIES.find(([id]) => id === ticketCategory(key))?.[1] || "Other";
  }

  function ticketWhen(value) {
    const text = String(value || "");
    const match = text.match(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/);
    return match ? match[0].replace("T", " ") : text.slice(0, 16);
  }

  function ticketOptions(list, selected) {
    return list
      .map(([key, label]) => `<option value="${escapeHtml(key)}"${key === selected ? " selected" : ""}>${escapeHtml(label)}</option>`)
      .join("");
  }

  function ticketFormHtml() {
    return `<form class="support-ticket-form" id="support-ticket-form">
      <label class="wide">Subject<input name="subject" maxlength="180" required placeholder="What do you need help with?" /></label>
      <label>Category<select name="category">${ticketOptions(TICKET_CATEGORIES, "other")}</select></label>
      <label>Priority<select name="priority">${ticketOptions(TICKET_PRIORITIES, "normal")}</select></label>
      <label class="wide">Message<textarea name="body" rows="4" maxlength="2000" required placeholder="What happened, and what should support do?"></textarea></label>
      <div class="wide"><button class="btn btn-primary" type="submit">Send to support</button> <span class="hint" id="support-ticket-hint"></span></div>
    </form>`;
  }

  function ticketListHtml(tickets, opts) {
    const audience = opts?.audience === "master" ? "master" : "shop";
    const rows = Array.isArray(tickets) ? tickets : [];
    if (!rows.length) {
      return `<p class="support-empty">${audience === "master" ? "No tickets yet." : "No tickets yet. Send one and the support team will see it here."}</p>`;
    }
    return `<div class="support-ticket-list">${rows
      .map((row) => {
        const shop = audience === "master" && row.shop_name ? `<span>${escapeHtml(row.shop_name)}</span>` : "";
        return `<button type="button" class="support-ticket-row" data-ticket-open="${escapeHtml(row.id)}">
          <strong>${escapeHtml(row.subject || "Ticket")}</strong>
          <span>${escapeHtml(ticketCategoryLabel(row.category))}</span>
          <span class="support-pill is-${escapeHtml(ticketStatus(row.status) || "open")}">${escapeHtml(ticketStatusLabel(row.status, audience))}</span>
          ${shop}
          <em>${escapeHtml(ticketWhen(row.updated_at || row.created_at))}</em>
        </button>`;
      })
      .join("")}</div>`;
  }

  function ticketThreadHtml(ticket, replies, opts) {
    const audience = opts?.audience === "master" ? "master" : "shop";
    const messages = (Array.isArray(replies) ? replies : [])
      .map((row) => {
        const who = row.author_role === "master" ? "Support" : "Shop";
        return `<article class="support-reply${row.author_role === "master" ? " is-master" : ""}">
          <header><strong>${escapeHtml(who)} · ${escapeHtml(row.author_name || "")}</strong><time>${escapeHtml(ticketWhen(row.created_at))}</time></header>
          <p>${escapeHtml(row.body || "")}</p>
        </article>`;
      })
      .join("");
    const status = ticketStatus(ticket?.status) || "open";
    const reply =
      audience === "master"
        ? `<form class="support-ticket-form" id="master-ticket-reply">
            <label class="wide">Reply<textarea name="body" rows="3" maxlength="2000" required></textarea></label>
            <label>Status<select name="status">${ticketOptions(
              [
                ["pending", "Waiting on shop"],
                ["resolved", "Resolved"],
                ["open", "Open"],
              ],
              status === "resolved" ? "resolved" : "pending",
            )}</select></label>
            <div class="wide"><button class="btn btn-primary" type="submit">Send reply</button> <span class="hint" id="master-ticket-hint"></span></div>
          </form>`
        : `<form class="support-ticket-form" id="support-ticket-reply">
            <label class="wide">Reply<textarea name="body" rows="3" maxlength="2000" required placeholder="Add what the support team should know"></textarea></label>
            <div class="wide"><button class="btn btn-primary" type="submit">Send reply</button> <span class="hint" id="support-ticket-hint"></span></div>
          </form>`;
    const shop = audience === "master" && ticket?.shop_name ? `<p class="support-panel-note">${escapeHtml(ticket.shop_name)}</p>` : "";
    return `<div class="support-thread">
      <div class="support-thread-head">
        <button type="button" class="btn btn-ghost" data-ticket-back>All tickets</button>
        <h3>${escapeHtml(ticket?.subject || "Ticket")}</h3>
        <span class="support-pill is-${escapeHtml(status)}">${escapeHtml(ticketStatusLabel(status, audience))}</span>
      </div>
      ${shop}
      <div class="support-replies">${messages}</div>
      ${reply}
    </div>`;
  }

  function ticketDeskHtml(tickets, detail) {
    const thread = detail?.ticket
      ? ticketThreadHtml(detail.ticket, detail.replies, { audience: "shop" })
      : `${ticketFormHtml()}${ticketListHtml(tickets, { audience: "shop" })}`;
    return `<section class="support-tickets">
      <h3>Tickets to ATAV support</h3>
      <p class="support-panel-note">This ticket goes to the master admin support team. Use the helpline above if the counter is down.</p>
      ${thread}
    </section>`;
  }

  function loginHtml(support) {
    const { phone, email, tel, wa, mail } = contactBits(support, { waMessage: false });
    if (!phone && !email) return "";
    const parts = [`<span class="login-support-kicker">Need help signing in?</span>`];
    if (tel) parts.push(`<a class="login-support-link" href="${escapeHtml(tel)}">Call ${escapeHtml(phone)}</a>`);
    if (wa) {
      parts.push(
        `<a class="login-support-link wa" href="${escapeHtml(wa)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`,
      );
    }
    if (mail) parts.push(`<a class="login-support-link" href="${escapeHtml(mail)}">Email</a>`);
    return parts.join("");
  }

  return {
    escapeHtml,
    phoneDigits,
    formatPhone,
    telHref,
    waHref,
    mailHref,
    heroHtml,
    pageHtml,
    loginHtml,
    ticketCategory,
    ticketPriority,
    ticketStatus,
    ticketSubject,
    ticketBody,
    ticketStatusLabel,
    ticketDeskHtml,
    ticketListHtml,
    ticketThreadHtml,
  };
});
