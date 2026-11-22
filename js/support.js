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

  function chatFileName(value) {
    const base = String(value || "file").split(/[/\\]/).pop() || "file";
    const clean = base.replace(/[^\w.\- ()]+/g, "").trim().slice(0, 120);
    return clean || "file";
  }

  function chatAttachment(raw) {
    if (!raw) return null;
    const data = String(raw.data || raw.attachment_data || raw.attachment || "").trim();
    if (!data) return null;
    const match = data.match(/^data:(image\/(?:jpeg|jpg|png|webp|gif)|application\/pdf);base64,([A-Za-z0-9+/=\s]+)$/i);
    if (!match) return { error: "Attach a photo or PDF" };
    const b64 = match[2].replace(/\s/g, "");
    if (b64.length < 16) return { error: "That file is empty" };
    if (b64.length > 1_400_000) return { error: "Attachment must be under 1 MB" };
    const mime = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
    return { name: chatFileName(raw.name || raw.file_name || raw.attachment_name), mime, data: `data:${mime};base64,${b64}` };
  }

  function readChatFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve(null);
        return;
      }
      if (!/^(image\/(jpeg|jpg|png|webp|gif)|application\/pdf)$/i.test(file.type || "")) {
        reject(new Error("Attach a photo or PDF"));
        return;
      }
      if (file.size > 900_000) {
        reject(new Error("Attachment must be under 1 MB"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const parsed = chatAttachment({ name: file.name, data: reader.result });
        if (!parsed || parsed.error) reject(new Error(parsed?.error || "Could not read the file"));
        else resolve(parsed);
      };
      reader.onerror = () => reject(new Error("Could not read the file"));
      reader.readAsDataURL(file);
    });
  }

  async function chatFormPayload(form) {
    const body = ticketBody(form?.querySelector("[name=body]")?.value);
    const file = form?.querySelector('input[type="file"]')?.files?.[0] || null;
    const attachment = await readChatFile(file);
    if (!body && !attachment) throw new Error("Write a message or attach a photo");
    return { body, attachment };
  }

  let chatAudio = null;
  function playChatSound() {
    const Ctx = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
    if (!Ctx) return;
    try {
      if (!chatAudio) chatAudio = new Ctx();
      const play = () => {
        const now = chatAudio.currentTime;
        const osc = chatAudio.createOscillator();
        const gain = chatAudio.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(620, now + 0.14);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
        osc.connect(gain);
        gain.connect(chatAudio.destination);
        osc.start(now);
        osc.stop(now + 0.28);
      };
      if (chatAudio.state === "suspended") chatAudio.resume().then(play).catch(() => {});
      else play();
    } catch {
      /* sound is optional */
    }
  }

  function primeChatSound() {
    const Ctx = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
    if (!Ctx) return;
    try {
      if (!chatAudio) chatAudio = new Ctx();
      if (chatAudio.state === "suspended") chatAudio.resume().catch(() => {});
    } catch {
      /* sound is optional */
    }
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

  function ticketPriorityLabel(key) {
    return TICKET_PRIORITIES.find(([id]) => id === ticketPriority(key))?.[1] || "Normal";
  }

  function ticketMetaHtml(row, audience) {
    const bits = [
      `<span>${escapeHtml(ticketCategoryLabel(row.category))}</span>`,
      `<span class="is-pri is-${escapeHtml(ticketPriority(row.priority))}">${escapeHtml(ticketPriorityLabel(row.priority))}</span>`,
    ];
    if (audience === "master" && row.shop_name) bits.push(`<span>${escapeHtml(row.shop_name)}</span>`);
    const when = ticketWhen(row.updated_at || row.created_at);
    if (when) bits.push(`<span>${escapeHtml(when)}</span>`);
    return bits.join("");
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
      <label class="wide">Subject<input name="subject" maxlength="180" required placeholder="Short summary" /></label>
      <label>Category<select name="category">${ticketOptions(TICKET_CATEGORIES, "other")}</select></label>
      <label>Priority<select name="priority">${ticketOptions(TICKET_PRIORITIES, "normal")}</select></label>
      <label class="wide">What happened<textarea name="body" rows="4" maxlength="2000" required placeholder="What you were doing, and the message on screen"></textarea></label>
      <div class="support-ticket-actions wide"><button class="btn primary" type="submit">Send to support</button><span class="hint" id="support-ticket-hint"></span></div>
    </form>`;
  }

  function ticketListHtml(tickets, opts) {
    const audience = opts?.audience === "master" ? "master" : "shop";
    const rows = Array.isArray(tickets) ? tickets : [];
    if (!rows.length) {
      return `<p class="support-empty">${audience === "master" ? "No tickets in this list." : "No tickets yet. Send one and the support team will see it here."}</p>`;
    }
    return `<div class="support-ticket-list">${rows
      .map((row) => {
        const status = ticketStatus(row.status) || "open";
        return `<button type="button" class="support-ticket-row is-${escapeHtml(ticketPriority(row.priority))}" data-ticket-open="${escapeHtml(row.id)}">
          <span class="support-ticket-copy">
            <strong>${escapeHtml(row.subject || "Ticket")}</strong>
            <span class="support-ticket-meta">${ticketMetaHtml(row, audience)}</span>
          </span>
          <span class="support-pill is-${escapeHtml(status)}">${escapeHtml(ticketStatusLabel(row.status, audience))}</span>
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
            <div class="support-ticket-actions wide">
              <label>Status<select name="status">${ticketOptions(
                [
                  ["pending", "Waiting on shop"],
                  ["resolved", "Resolved"],
                  ["open", "Open"],
                ],
                status === "resolved" ? "resolved" : "pending",
              )}</select></label>
              <button class="btn primary" type="submit">Send reply</button>
              <span class="hint" id="master-ticket-hint"></span>
            </div>
          </form>`
        : `<form class="support-ticket-form" id="support-ticket-reply">
            <label class="wide">Reply<textarea name="body" rows="3" maxlength="2000" required placeholder="Add what the support team should know"></textarea></label>
            <div class="support-ticket-actions wide"><button class="btn primary" type="submit">Send reply</button><span class="hint" id="support-ticket-hint"></span></div>
          </form>`;
    return `<div class="support-thread">
      <div class="support-thread-head">
        <button type="button" class="btn ghost" data-ticket-back>All tickets</button>
        <div class="support-thread-title">
          <h3>${escapeHtml(ticket?.subject || "Ticket")}</h3>
          <p class="support-ticket-meta">${ticketMetaHtml(ticket || {}, audience)}</p>
        </div>
        <span class="support-pill is-${escapeHtml(status)}">${escapeHtml(ticketStatusLabel(status, audience))}</span>
      </div>
      <div class="support-replies">${messages || `<p class="support-empty">No messages yet.</p>`}</div>
      ${reply}
    </div>`;
  }

  function ticketDeskHtml(tickets, detail, error) {
    const problem = error ? `<p class="hint error">${escapeHtml(error)}</p>` : "";
    const body = detail?.ticket
      ? ticketThreadHtml(detail.ticket, detail.replies, { audience: "shop" })
      : `<div class="support-ticket-split">
          <article class="support-panel">
            <h3>New ticket</h3>
            <p class="support-panel-note">This goes to the ATAV support team. Use the helpline above if the counter is down.</p>
            ${ticketFormHtml()}
          </article>
          <article class="support-panel">
            <h3>Your tickets</h3>
            <p class="support-panel-note">Open a ticket to read the reply and add more.</p>
            ${problem}
            ${ticketListHtml(tickets, { audience: "shop" })}
          </article>
        </div>`;
    return `<section class="support-tickets">
      <h3>Tickets to ATAV support</h3>
      ${detail?.ticket ? problem : ""}
      ${body}
    </section>`;
  }

  function chatFileHtml(row) {
    const data = String(row?.attachment_data || "");
    const name = chatFileName(row?.attachment_name || "Attachment");
    const mime = String(row?.attachment_mime || "");
    if (!data && !row?.attachment_name) return "";
    if (mime.startsWith("image/") && data.startsWith("data:image/")) {
      return `<a class="support-chat-file" href="${escapeHtml(data)}" target="_blank" rel="noopener noreferrer"><img alt="${escapeHtml(name)}" src="${escapeHtml(data)}" /></a>`;
    }
    if (data.startsWith("data:")) {
      return `<a class="support-chat-file is-doc" href="${escapeHtml(data)}" download="${escapeHtml(name)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a>`;
    }
    return `<span class="support-chat-file is-doc">${escapeHtml(name)}</span>`;
  }

  function chatLogHtml(messages) {
    const rows = Array.isArray(messages) ? messages : [];
    if (!rows.length) return `<p class="support-empty">No messages yet. Send one and the support team will see it here.</p>`;
    return rows
      .map((row) => {
        const supportSide = row.author_role === "master";
        const who = supportSide ? "Support" : "Shop";
        const name = String(row.author_name || "").trim();
        const named = name && name.toLowerCase() !== who.toLowerCase() ? ` · ${escapeHtml(name)}` : "";
        const text = row.body ? `<p>${escapeHtml(row.body)}</p>` : "";
        return `<article class="support-chat-bubble${supportSide ? " is-master" : ""}" data-chat-id="${escapeHtml(row.id || "")}">
          <header><strong>${escapeHtml(who)}${named}</strong><time>${escapeHtml(ticketWhen(row.created_at))}</time></header>
          ${text}
          ${chatFileHtml(row)}
        </article>`;
      })
      .join("");
  }

  function chatComposeHtml(formId, hintId, placeholder) {
    return `<form class="support-chat-form" id="${formId}">
      <div class="support-chat-compose">
        <label class="support-chat-clip">Attach
          <input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" aria-label="Attach a photo or PDF" />
        </label>
        <textarea name="body" rows="2" maxlength="2000" placeholder="${escapeHtml(placeholder)}" aria-label="Message"></textarea>
        <button class="btn primary" type="submit">Send</button>
      </div>
      <p class="support-chat-pending" data-chat-file hidden></p>
      <p class="hint" id="${hintId}"></p>
    </form>`;
  }

  function chatPanelHtml(messages, opts) {
    const audience = opts?.audience === "master" ? "master" : "shop";
    const rows = Array.isArray(messages) ? messages : [];
    const last = rows.length ? rows[rows.length - 1].id || "" : "";
    const shop = opts?.shopName ? `<p class="support-panel-note">${escapeHtml(opts.shopName)}</p>` : "";
    const formId = audience === "master" ? "master-chat-form" : "support-chat-form";
    const logId = audience === "master" ? "master-chat-log" : "support-chat-log";
    const hintId = audience === "master" ? "master-chat-hint" : "support-chat-hint";
    const placeholder = audience === "master" ? "Reply to this shop" : "Message the support team";
    const title = audience === "master" && opts?.shopName ? opts.shopName : "Live chat";
    const note = audience === "master"
      ? "This shop sees your reply, photos, and PDFs in the chat box at the bottom of their console."
      : "The ATAV support team sees this in their live chat.";
    return `<section class="support-chat" data-chat-last="${escapeHtml(last)}">
      <div class="support-chat-head">
        <div>
          <h3>${escapeHtml(title)}</h3>
          ${audience === "master" ? "" : shop}
        </div>
        <span class="support-pill">Live</span>
      </div>
      <p class="support-panel-note">${note}</p>
      <div class="support-chat-log" id="${logId}" data-last="${escapeHtml(last)}">${chatLogHtml(rows)}</div>
      ${chatComposeHtml(formId, hintId, placeholder)}
    </section>`;
  }

  function footerChatHtml() {
    return `<aside class="support-dock" id="support-dock">
      <section class="support-dock-panel" id="support-dock-panel" hidden>
        <header class="support-dock-head">
          <div>
            <strong>Support chat</strong>
            <span>ATAV support team</span>
          </div>
          <button type="button" class="support-dock-close" id="support-dock-close" aria-label="Close chat">×</button>
        </header>
        <div class="support-chat-log" id="support-chat-log" data-last="">${chatLogHtml([])}</div>
        <form class="support-dock-compose" id="support-chat-form">
          <label class="support-chat-clip">Attach
            <input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" aria-label="Attach a photo or PDF" />
          </label>
          <textarea name="body" rows="1" maxlength="2000" placeholder="Message the support team" aria-label="Message"></textarea>
          <button class="btn primary" type="submit">Send</button>
          <p class="support-chat-pending" data-chat-file hidden></p>
          <span class="hint" id="support-chat-hint"></span>
        </form>
      </section>
      <button type="button" class="support-dock-launcher" id="support-dock-open" aria-expanded="false" aria-controls="support-dock-panel">
        <span class="support-dock-launcher-copy"><strong>Chat</strong><span>Support team</span></span>
        <span class="support-dock-badge" id="support-dock-badge" hidden>New</span>
      </button>
    </aside>`;
  }

  function chatPreview(row) {
    const text = String(row?.body || "").trim();
    if (text) return text;
    if (row?.attachment_name) return `Attachment · ${row.attachment_name}`;
    return "";
  }

  function chatInboxHtml(rows, openId) {
    const list = Array.isArray(rows) ? rows : [];
    const open = String(openId || "");
    if (!list.length) return `<p class="support-empty">No live chats yet. A shop message shows up here.</p>`;
    return `<div class="support-ticket-list">${list
      .map((row) => {
        const waiting = row.author_role !== "master";
        const current = open && row.business_id === open ? " is-open" : "";
        return `<button type="button" class="support-ticket-row master-chat-row${current}${waiting ? " is-waiting" : ""}" data-chat-open="${escapeHtml(row.business_id || "")}">
          <span class="support-ticket-copy">
            <strong>${escapeHtml(row.shop_name || "Shop")}</strong>
            <span class="support-ticket-meta"><span>${escapeHtml(waiting ? "Shop" : "Support")}</span><span>${escapeHtml(ticketWhen(row.created_at))}</span></span>
            <span class="support-chat-preview">${escapeHtml(chatPreview(row))}</span>
          </span>
          <span class="support-pill${waiting ? "" : " is-resolved"}">${waiting ? "New" : "Replied"}</span>
        </button>`;
      })
      .join("")}</div>`;
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
    chatLogHtml,
    chatPanelHtml,
    footerChatHtml,
    chatInboxHtml,
    chatAttachment,
    chatFormPayload,
    playChatSound,
    primeChatSound,
    chatPreview,
  };
});
