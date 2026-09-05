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

  function telHref(phone) {
    const raw = String(phone || "").trim();
    const href = raw.replaceAll(/[^\d+]/g, "");
    return href ? `tel:${href}` : "";
  }

  function waHref(phone) {
    let digits = phoneDigits(phone);
    if (!digits) return "";
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    if (digits.length === 10) digits = `91${digits}`;
    return `https://wa.me/${digits}`;
  }

  function mailHref(email) {
    const value = String(email || "").trim();
    return value.includes("@") ? `mailto:${value}` : "";
  }

  function contactBits(support) {
    const phone = String(support?.support_phone || "").trim();
    const email = String(support?.support_email || "").trim();
    return {
      phone,
      email,
      tel: telHref(phone),
      wa: waHref(phone),
      mail: mailHref(email),
    };
  }

  function heroHtml(support, opts = {}) {
    const { phone, email, tel, wa, mail } = contactBits(support);
    const manager = String(support?.account_manager_name || "").trim();
    if (!phone && !email) {
      return `<article class="support-hero is-empty">
        <p class="support-kicker">${manager ? escapeHtml(manager) : "ATAV POS helpline"}</p>
        <h3>Helpline not set yet</h3>
        <p class="support-lead">Master Admin can assign an account manager or add a support mobile under Support helpline.</p>
      </article>`;
    }
    const headline = phone ? escapeHtml(phone) : escapeHtml(email);
    const actions = [
      tel ? `<a class="btn primary support-call" href="${escapeHtml(tel)}">Call now</a>` : "",
      wa ? `<a class="btn support-wa" href="${escapeHtml(wa)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : "",
      mail ? `<a class="btn support-mail" href="${escapeHtml(mail)}">Email</a>` : "",
      phone && !opts.compact ? `<button class="btn" type="button" data-copy-phone="${escapeHtml(phone)}">Copy number</button>` : "",
    ]
      .filter(Boolean)
      .join("");
    return `<article class="support-hero">
      <p class="support-kicker">${manager ? "Your account manager" : "ATAV POS helpline"}</p>
      <h3>${manager ? escapeHtml(manager) : "Need help with billing or setup?"}</h3>
      <p class="support-number">${headline}</p>
      <p class="support-lead">${manager ? "Call, WhatsApp, or email your assigned ATAV POS account manager. Have your shop name ready." : "Call, WhatsApp, or email platform support. Have your shop name ready."}</p>
      <div class="support-actions">${actions}</div>
      ${email && phone ? `<p class="support-email">Or email <a href="${escapeHtml(mail)}">${escapeHtml(email)}</a></p>` : ""}
    </article>`;
  }

  function shopRows(company) {
    const shop = company || {};
    return [
      ["Shop", shop.name || "—"],
      ["Address", shop.address || "—"],
      ["Shop phone", shop.phone || "—"],
      ["Shop email", shop.email || "—"],
      ["GSTIN", shop.gstin || "—"],
    ]
      .map(
        ([label, value]) =>
          `<div class="support-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
      )
      .join("");
  }

  function pageHtml(support, company, opts = {}) {
    const hero = heroHtml(support, opts);
    if (opts.compact) return hero;
    return `${hero}
      <div class="support-cols">
        <article class="support-panel">
          <h3>This shop</h3>
          <p class="support-panel-note">Printed on invoices and receipts.</p>
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

  function loginHtml(support) {
    const { phone, email, tel, wa, mail } = contactBits(support);
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

  return { escapeHtml, phoneDigits, telHref, waHref, mailHref, heroHtml, pageHtml, loginHtml };
});
