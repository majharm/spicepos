const $ = (id) => document.getElementById(id);
let tab = "dash";
let backupPane = "backup";
let panelFlash = "";

async function api(path, options) {
  const { res, data } = await posRequest(path, options);
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function money(n) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(n) || 0);
}

const BIZ_TYPES = ["Retail", "Wholesale", "Distributor", "Restaurant", "Cafe", "Bakery", "Grocery", "Pharmacy", "Electronics", "Fashion", "Footwear", "Services", "Other"];
const BIZ_CATEGORIES = [
  "Spices & masala",
  "Kirana / FMCG",
  "Supermarket",
  "Apparel",
  "Footwear",
  "Mobile & electronics",
  "Food & beverage",
  "Hardware",
  "Jewellery",
  "Medical",
  "General trade",
  "Other",
];
const IN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Puducherry",
  "Chandigarh",
  "Andaman and Nicobar Islands",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Lakshadweep",
];

function options(list, placeholder) {
  return `<option value="">${placeholder}</option>${list.map((v) => `<option>${v}</option>`).join("")}`;
}

function readLogo(file, max = 280) {
  if (!file || !file.size) return Promise.resolve("");
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = max;
      const scale = Math.min(1, size / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read logo"));
    };
    img.src = url;
  });
}

function ymd(v) {
  if (!v) return "";
  return String(v).slice(0, 10);
}

function streetAddress(b) {
  let a = String(b.address || "");
  const tail = b.city && b.state && b.pin_code ? `, ${b.city}, ${b.state} ${b.pin_code}` : "";
  if (tail && a.endsWith(tail)) return a.slice(0, -tail.length);
  return a;
}

function setSelect(sel, value) {
  if (!value) {
    sel.value = "";
    return;
  }
  if (![...sel.options].some((o) => o.value === value)) sel.add(new Option(value, value));
  sel.value = value;
}

function showLogin(on) {
  $("master-login").hidden = !on;
  $("panel").hidden = on;
  document.body.classList.toggle("master-locked", on);
}

(() => {
  const saved = localStorage.getItem("pos_remember_master");
  if (!saved) return;
  const form = $("master-login");
  const email = form.querySelector('[name="email"]');
  const box = form.querySelector('[name="remember"]');
  if (email) email.value = saved;
  if (box) box.checked = true;
})();

async function boot() {
  try {
    let me = await api("/api/auth/me");
    if (me.type === "staff" && me.impersonating) {
      await api("/api/auth/exit-impersonate", { method: "POST" });
      me = await api("/api/auth/me");
    }
    if (me.type !== "master") throw new Error("not master");
    showLogin(false);
    await render();
  } catch {
    showLogin(true);
  }
}

$("master-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api("/api/auth/master-login", {
      method: "POST",
      body: JSON.stringify({
        email: fd.get("email"),
        password: fd.get("password"),
        remember: Boolean(fd.get("remember")),
      }),
    });
    if (fd.get("remember")) localStorage.setItem("pos_remember_master", String(fd.get("email") || ""));
    else localStorage.removeItem("pos_remember_master");
    showLogin(false);
    await render();
  } catch (err) {
    $("login-hint").textContent = err.message;
    $("login-hint").className = "hint error";
  }
});

$("logout").onclick = async () => {
  await api("/api/auth/logout", { method: "POST" });
  location.href = "/login.html";
};

function syncMasterNav() {
  document.querySelectorAll(".master-nav [data-tab]").forEach((b) => {
    const pane = b.dataset.backupPane;
    const on = b.dataset.tab === tab && (pane == null || pane === backupPane);
    b.classList.toggle("active", on);
  });
}

function backupFamilyTabs(active) {
  const tabBtn = (id, label) =>
    `<button class="btn${active === id ? " active" : ""}" type="button" role="tab" aria-selected="${active === id}" data-master-pane="${id}">${label}</button>`;
  return `<div class="settings-tabs" role="tablist" aria-label="Settings, backup, and messages">
    ${tabBtn("settings", "Settings")}
    ${tabBtn("backup", "Backup")}
    ${tabBtn("notes", "Messages")}
  </div>`;
}

function bindBackupFamilyTabs(root) {
  root?.querySelectorAll("[data-master-pane]").forEach((btn) => {
    btn.onclick = () => {
      const pane = btn.dataset.masterPane;
      if (pane === "notes") setMasterTab("notes");
      else setMasterTab("backup", pane);
    };
  });
}

function setMasterTab(next, pane) {
  tab = next;
  if (next === "backup") backupPane = pane || "settings";
  syncMasterNav();
  document.querySelector(".master-main")?.scrollTo({ top: 0 });
  render();
}

document.querySelectorAll(".master-nav [data-tab]").forEach((btn) => {
  btn.onclick = () => setMasterTab(btn.dataset.tab, btn.dataset.backupPane);
});

function formatPlatformTime(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function auditDetails(row) {
  const target = row.target_name || "";
  let extra = "";
  if (row.details) {
    try {
      const d = typeof row.details === "string" ? JSON.parse(row.details) : row.details;
      const bits = [];
      if (d.customer_name) bits.push(d.customer_name);
      if (d.total != null) bits.push(`₹${Number(d.total).toFixed(2)}`);
      if (d.payment_method) bits.push(String(d.payment_method).toUpperCase());
      extra = bits.join(" · ");
    } catch {
      extra = String(row.details).slice(0, 80);
    }
  }
  return [target, extra].filter(Boolean).join(" — ");
}

function businessLabel(row) {
  if (row.business_name) return row.business_name;
  if (row.business_id === "platform") return "Platform";
  return row.business_id || "—";
}

async function enterBusinessPos(businessId) {
  await api(`/api/master/businesses/${businessId}/enter`, { method: "POST" });
  location.replace("/index.html");
}

async function enterUserPos(userId) {
  await api(`/api/master/users/${userId}/enter`, { method: "POST" });
  location.replace("/index.html");
}

function bindEnterPosButtons(root) {
  root.querySelectorAll("[data-enter]").forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await enterBusinessPos(btn.dataset.enter);
      } catch (err) {
        alert(err.message || "Could not open POS");
        btn.disabled = false;
      }
    };
  });
  root.querySelectorAll("[data-enter-user]").forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await enterUserPos(btn.dataset.enterUser);
      } catch (err) {
        alert(err.message || "Could not open POS");
        btn.disabled = false;
      }
    };
  });
}

function accountLocked(u) {
  if (!u?.locked_until) return false;
  const until = new Date(u.locked_until);
  return !Number.isNaN(until.getTime()) && until.getTime() > Date.now();
}

function accountStatusLabel(u) {
  if (u.status && u.status !== "active") return u.status;
  if (accountLocked(u)) return "Locked";
  const fails = Number(u.failed_logins) || 0;
  if (fails > 0) return `Active · ${fails} failed`;
  return "Active";
}

function bindPasswordForm(form, hint, whoEl, cancelBtn, saveFn) {
  if (!form) return {
    open() {},
  };
  cancelBtn.onclick = () => {
    form.hidden = true;
    form.reset();
    hint.textContent = "";
    hint.className = "hint";
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirm") || "");
    if (password !== confirm) {
      hint.textContent = "Password and confirm password do not match";
      hint.className = "hint error";
      return;
    }
    try {
      hint.className = "hint";
      hint.textContent = "Saving password…";
      await saveFn(fd, password);
      panelFlash = "Password saved. The new login is ready.";
      render();
    } catch (err) {
      hint.textContent = err.message;
      hint.className = "hint error";
    }
  };
  return {
    open(id, label) {
      form.hidden = false;
      if (form.user_id) form.user_id.value = id;
      if (form.business_id) form.business_id.value = id;
      if (whoEl) whoEl.textContent = label;
      form.password.value = "";
      form.confirm.value = "";
      hint.textContent = "";
      hint.className = "hint";
      form.scrollIntoView({ block: "start" });
      form.password.focus();
    },
  };
}

async function readBackupFile(input) {
  const file = input?.files?.[0];
  if (!file) throw new Error("Choose a backup JSON file first");
  const text = await file.text();
  const payload = JSON.parse(text);
  if (!payload || typeof payload !== "object") throw new Error("Backup file is not valid JSON");
  return payload;
}

function bindMasterBackup(root, shops) {
  const shopSel = root.querySelector("#master-backup-shop");
  const shopDl = root.querySelector("#btn-master-shop-download");
  const shopHint = root.querySelector("#master-shop-backup-hint");
  const platformDl = root.querySelector("#btn-master-platform-download");
  function selectedShop() {
    return shops.find((s) => s.id === shopSel.value) || null;
  }
  function syncShopLink() {
    const shop = selectedShop();
    shopDl.href = shop ? posUrl(`/api/master/backup?business_id=${encodeURIComponent(shop.id)}`) : "#";
  }
  if (platformDl) platformDl.href = posUrl("/api/master/backup/platform");
  shopSel.onchange = syncShopLink;
  syncShopLink();
  shopDl.addEventListener("click", (e) => {
    syncShopLink();
    if (!selectedShop()) {
      e.preventDefault();
      shopHint.textContent = "Select a shop first";
      shopHint.className = "hint error";
    }
  });
  root.querySelector("#btn-master-shop-restore").onclick = async () => {
    shopHint.className = "hint";
    shopHint.textContent = "";
    const shop = selectedShop();
    if (!shop) {
      shopHint.textContent = "Select a shop first";
      shopHint.className = "hint error";
      return;
    }
    let payload;
    try {
      payload = await readBackupFile(root.querySelector("#master-shop-backup-file"));
    } catch (err) {
      shopHint.textContent = err.message;
      shopHint.className = "hint error";
      return;
    }
    if (payload.business_id && payload.business_id !== shop.id) {
      shopHint.textContent = "This file belongs to another shop. Select that shop first.";
      shopHint.className = "hint error";
      return;
    }
    if (!confirm(`Restore this backup into ${shop.name}? It replaces items, stock, customers, invoices, and purchases for that shop.`)) {
      return;
    }
    shopHint.textContent = "Restoring…";
    try {
      const data = await api(
        `/api/master/backup/restore?business_id=${encodeURIComponent(shop.id)}`,
        { method: "POST", body: JSON.stringify(payload) },
      );
      shopHint.textContent = `Restored ${data.tables || 0} tables into ${shop.name}.`;
      shopHint.className = "hint ok";
    } catch (err) {
      shopHint.textContent = err.message;
      shopHint.className = "hint error";
    }
  };
  const platformHint = root.querySelector("#master-platform-backup-hint");
  root.querySelector("#btn-master-platform-download").addEventListener("click", () => {
    root.querySelector("#btn-master-platform-download").href = posUrl("/api/master/backup/platform");
  });
  root.querySelector("#btn-master-platform-restore").onclick = async () => {
    platformHint.className = "hint";
    platformHint.textContent = "";
    let payload;
    try {
      payload = await readBackupFile(root.querySelector("#master-platform-backup-file"));
    } catch (err) {
      platformHint.textContent = err.message;
      platformHint.className = "hint error";
      return;
    }
    if (
      !confirm(
        "Restore the full platform backup? This replaces every shop, plan, and master-admin record. Sign-in sessions stay as they are.",
      )
    ) {
      return;
    }
    const typed = prompt("Type RESTORE PLATFORM to confirm.");
    if (typed !== "RESTORE PLATFORM") {
      platformHint.textContent = "Platform restore cancelled.";
      return;
    }
    platformHint.textContent = "Restoring platform…";
    try {
      const data = await api("/api/master/backup/platform/restore", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      platformHint.textContent = `Restored ${data.tables || 0} platform tables.`;
      platformHint.className = "hint ok";
    } catch (err) {
      platformHint.textContent = err.message;
      platformHint.className = "hint error";
    }
  };
}

function masterHero(kicker, title, lede, stats = []) {
  const statHtml = stats
    .map(
      (s) =>
        `<div class="items-stat${s.warn ? " is-warn" : ""}"><span>${s.label}</span><strong>${s.value}</strong></div>`,
    )
    .join("");
  return `<header class="items-hero">
    <div class="items-hero-copy">
      <p class="items-kicker">${kicker}</p>
      <h3>${title}</h3>
      <p class="lede">${lede}</p>
    </div>
    ${statHtml ? `<div class="items-hero-stats">${statHtml}</div>` : ""}
  </header>`;
}

function statusChip(status) {
  const s = String(status || "—");
  const low = s.toLowerCase();
  const kind = /expir/.test(low) ? "is-warn" : /suspend|inactiv|lock/.test(low) ? "is-bad" : "is-ok";
  return `<span class="item-chip ${kind}">${attr(s)}</span>`;
}

function letterMark(name) {
  const t = String(name || "?").trim();
  return (t[0] || "?").toUpperCase();
}

const ALERT_DEFS = [
  {
    key: "welcome",
    flag: "alert_welcome",
    title: "Welcome",
    blurb: "Sent when a shop is created or an owner signs up. The standard welcome email (no password) is still sent separately.",
    channels: "WhatsApp",
    placeholders: "{{shop}} {{name}} {{signInUrl}}",
  },
  {
    key: "credentials",
    flag: "alert_credentials",
    title: "User ID & password",
    blurb: "Login details when a shop, staff user, or password reset is created.",
    channels: "WhatsApp · Email",
    placeholders: "{{shop}} {{name}} {{username}} {{email}} {{password}} {{role}} {{signInUrl}}",
  },
  {
    key: "updates",
    flag: "alert_updates",
    title: "New update",
    blurb: "When you send a shop update from Settings → Messages.",
    channels: "WhatsApp · Email",
    placeholders: "{{shop}} {{title}} {{body}}",
  },
  {
    key: "closing",
    flag: "alert_closing",
    title: "Closing sales summary",
    blurb: "Once per shop per day after the closing hour (shop timezone).",
    channels: "WhatsApp · Email",
    placeholders: "{{shop}} {{day}} {{bills}} {{takings}} {{cash}} {{upi}} {{card}} {{credit}} {{gst}} {{lowStock}}",
  },
  {
    key: "low_stock",
    flag: "alert_low_stock",
    title: "Low stock alert",
    blurb: "After a sale when an item falls to or below reorder level. Once per item per day.",
    channels: "WhatsApp · Email",
    placeholders: "{{shop}} {{lowStock}}",
  },
];

function placeholderChips(raw) {
  return String(raw || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `<button class="msg-chip" type="button" data-insert="${attr(token)}">${attr(token)}</button>`)
    .join("");
}

function alertsFormHtml(alerts) {
  const vars = alerts.sample_vars || {};
  const fill = (tpl) =>
    String(tpl || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => (vars[key] == null ? "" : String(vars[key])));
  const waOn = alerts.wa_enabled === "1";
  return `<form class="msg-settings" id="alert-form">
    <section class="settings item-composer msg-wa">
      <div class="item-composer-top">
        <p class="item-mode">WhatsApp connection</p>
        <p class="item-composer-note">API key is stored on the platform and never shown in full. Shops are messaged on their mobile number.</p>
        <label class="alert-switch">
          <input type="checkbox" name="wa_enabled" ${waOn ? "checked" : ""} />
          <span class="alert-switch-ui" aria-hidden="true"></span>
          <span class="alert-switch-label">${waOn ? "Active" : "Inactive"}</span>
        </label>
      </div>
      <fieldset class="item-block">
        <legend>API</legend>
        <label class="full">API URL <input name="wa_api_url" value="${attr(alerts.wa_api_url || "")}" placeholder="https://…" autocomplete="off" /></label>
        <label>API key <input name="wa_api_key" type="password" autocomplete="off" value="${attr(alerts.wa_api_key || "")}" /></label>
        <label>Profile ID <input name="wa_profile_id" value="${attr(alerts.wa_profile_id || "")}" autocomplete="off" /></label>
        <label>Country code <input name="wa_country_code" value="${attr(alerts.wa_country_code || "91")}" maxlength="3" inputmode="numeric" /></label>
      </fieldset>
    </section>
    <div class="items-split msg-split">
      <aside class="items-library msg-nav">
        <div class="items-library-head">
          <h4>Auto-messages</h4>
          <p class="item-composer-note">Turn a message Active, then edit its template on the right.</p>
        </div>
        <div class="msg-nav-list" role="tablist" aria-label="Auto-messages">
          ${ALERT_DEFS.map((d, i) => {
            const on = alerts[d.flag] === "1";
            return `<button class="msg-nav-item${i === 0 ? " is-active" : ""}" type="button" role="tab" aria-selected="${i === 0}" data-msg-kind="${d.key}">
              <span class="msg-nav-copy">
                <strong>${d.title}</strong>
                <span>${d.channels}</span>
              </span>
              <span class="item-chip ${on ? "is-ok" : "is-bad"}" data-msg-flag="${d.key}">${on ? "Active" : "Off"}</span>
            </button>`;
          }).join("")}
        </div>
      </aside>
      <div class="msg-editors">
        ${ALERT_DEFS.map((d, i) => {
          const on = alerts[d.flag] === "1";
          const tpl = alerts[`tpl_${d.key}`] || (alerts.defaults && alerts.defaults[d.key]) || "";
          return `<article class="settings item-composer alert-card${on ? "" : " is-inactive"}" data-kind="${d.key}" ${i ? "hidden" : ""}>
            <div class="item-composer-top">
              <p class="item-mode">${d.title}</p>
              <p class="item-composer-note">${d.blurb}</p>
              <label class="alert-switch">
                <input type="checkbox" name="${d.flag}" ${on ? "checked" : ""} />
                <span class="alert-switch-ui" aria-hidden="true"></span>
                <span class="alert-switch-label">${on ? "Active" : "Inactive"}</span>
              </label>
            </div>
            ${
              d.key === "closing"
                ? `<fieldset class="item-block">
                    <legend>Schedule</legend>
                    <label>Closing hour (0–23)
                      <input name="alert_closing_hour" type="number" min="0" max="23" value="${attr(alerts.alert_closing_hour || "22")}" />
                    </label>
                  </fieldset>`
                : ""
            }
            <fieldset class="item-block">
              <legend>Template</legend>
              <label class="full">Message
                <textarea name="tpl_${d.key}" rows="8">${attr(tpl)}</textarea>
              </label>
              <div class="msg-chips full" data-chips-for="${d.key}">${placeholderChips(d.placeholders)}</div>
            </fieldset>
            <div class="msg-preview-block">
              <div class="msg-preview-head">
                <span>Live preview</span>
                <button class="btn" type="button" data-reset-tpl="${d.key}">Reset template</button>
              </div>
              <pre class="alert-preview">${attr(fill(tpl))}</pre>
            </div>
          </article>`;
        }).join("")}
      </div>
    </div>
    <div class="msg-savebar">
      <button class="btn primary" type="submit">Save message settings</button>
      <p class="hint" id="alert-hint"></p>
    </div>
  </form>`;
}

function bindAlertsForm(alerts) {
  const form = $("alert-form");
  if (!form) return;
  const vars = alerts.sample_vars || {};
  const fill = (tpl) =>
    String(tpl || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => (vars[key] == null ? "" : String(vars[key])));
  const showKind = (kind) => {
    form.querySelectorAll("[data-kind]").forEach((el) => {
      el.hidden = el.dataset.kind !== kind;
    });
    form.querySelectorAll("[data-msg-kind]").forEach((btn) => {
      const on = btn.dataset.msgKind === kind;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  };
  const paintSwitch = (input) => {
    const label = input.closest(".alert-switch")?.querySelector(".alert-switch-label");
    if (label) label.textContent = input.checked ? "Active" : "Inactive";
    const card = input.closest("[data-kind]");
    if (card && input.name?.startsWith("alert_")) {
      card.classList.toggle("is-inactive", !input.checked);
      const chip = form.querySelector(`[data-msg-flag="${card.dataset.kind}"]`);
      if (chip) {
        chip.textContent = input.checked ? "Active" : "Off";
        chip.classList.toggle("is-ok", input.checked);
        chip.classList.toggle("is-bad", !input.checked);
      }
    }
  };
  form.querySelectorAll(".alert-switch input[type=checkbox]").forEach((input) => {
    input.addEventListener("change", () => paintSwitch(input));
    paintSwitch(input);
  });
  form.querySelectorAll("[data-msg-kind]").forEach((btn) => {
    btn.addEventListener("click", () => showKind(btn.dataset.msgKind));
  });
  const paintPreview = (kind) => {
    const card = form.querySelector(`[data-kind="${kind}"]`);
    const ta = card?.querySelector(`textarea[name="tpl_${kind}"]`);
    const pre = card?.querySelector(".alert-preview");
    if (ta && pre) pre.textContent = fill(ta.value);
  };
  form.querySelectorAll("textarea[name^='tpl_']").forEach((ta) => {
    const kind = ta.name.replace("tpl_", "");
    ta.addEventListener("input", () => paintPreview(kind));
  });
  form.querySelectorAll("[data-insert]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.closest("[data-kind]")?.dataset.kind;
      const ta = form.querySelector(`textarea[name="tpl_${kind}"]`);
      if (!ta) return;
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const token = btn.dataset.insert || "";
      ta.value = `${ta.value.slice(0, start)}${token}${ta.value.slice(end)}`;
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
      paintPreview(kind);
    });
  });
  form.querySelectorAll("[data-reset-tpl]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.resetTpl;
      const ta = form.querySelector(`textarea[name="tpl_${kind}"]`);
      if (ta) {
        ta.value = (alerts.defaults && alerts.defaults[kind]) || "";
        paintPreview(kind);
      }
    });
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const hint = $("alert-hint");
    const fd = Object.fromEntries(new FormData(form).entries());
    fd.wa_enabled = form.wa_enabled?.checked ? "1" : "0";
    for (const d of ALERT_DEFS) fd[d.flag] = form[d.flag]?.checked ? "1" : "0";
    hint.className = "hint";
    hint.textContent = "Saving…";
    try {
      await api("/api/master/alerts", { method: "POST", body: JSON.stringify(fd) });
      hint.textContent = "Saved. Active templates will auto-send.";
      hint.className = "hint ok";
    } catch (err) {
      hint.textContent = err.message;
      hint.className = "hint error";
    }
  };
}

async function render() {
  const titles = {
    dash: "Platform dashboard",
    biz: "Businesses",
    managers: "Account managers",
    users: "Users",
    plans: "Subscription plans",
    branches: "Branches",
    devices: "POS devices",
    audit: "Audit log",
    backup: backupPane === "settings" ? "Settings" : "Backup",
    notes: "Messages",
    alerts: "Settings",
    support: "Support helpline",
  };
  $("panel-title").textContent = titles[tab] || "Dashboard";
  $("panel")?.classList.toggle("has-desk", ["biz", "managers", "backup", "alerts", "notes"].includes(tab));
  const body = $("panel-body");
  body.innerHTML = "<p class='hint'>Loading…</p>";
  try {
    if (tab === "dash") {
      const d = await api("/api/master/dashboard");
      const t = d.totals;
      body.innerHTML = `<div class="kpi-grid">
        ${[
          ["Total businesses", t.businesses],
          ["Active", t.active],
          ["Expired", t.expired],
          ["Trial", t.trial],
          ["Users", t.users],
          ["Branches", t.branches],
          ["POS devices", t.devices],
          ["Transactions", t.transactions],
          ["Monthly subscription fees", money(t.subscriptionRevenue)],
        ]
          .map(([k, v]) => `<div class="report-card"><span>${k}</span><strong>${v}</strong></div>`)
          .join("")}
      </div>
      <div class="table-wrap" style="padding:20px 0">${table(
        ["Business", "Status", "Plan", "Fee / month", "Users", "Branches", "POS"],
        d.businesses.map((b) => [
          b.name,
          b.computed_status,
          b.plan_name || b.plan_id || "—",
          money(b.fee_monthly),
          b.users,
          b.branches,
          `<button class="btn primary" type="button" data-enter="${b.id}">Open POS</button>`,
        ]),
      )}</div>`;
      bindEnterPosButtons(body);
    } else if (tab === "biz") {
      const [rows, plans, managers] = await Promise.all([
        api("/api/master/businesses"),
        api("/api/master/plans"),
        api("/api/master/account-managers").catch(() => []),
      ]);
      const planOptions = plans
        .map((p) => `<option value="${p.id}">${p.name} · ${money(p.fee_monthly)} / month</option>`)
        .join("");
      const managerOptions = (Array.isArray(managers) ? managers : [])
        .filter((m) => m.status !== "inactive" || rows.some((b) => b.account_manager_id === m.id))
        .map((m) => `<option value="${attr(m.id)}">${attr(m.name)} · ${attr(m.mobile || "")}${m.status === "inactive" ? " (inactive)" : ""}</option>`)
        .join("");
      const activeN = rows.filter((b) => String(b.computed_status || b.status).toLowerCase() === "active").length;
      const expiredN = rows.filter((b) => /expir/.test(String(b.computed_status || "").toLowerCase())).length;
      const trialN = rows.filter((b) => /trial/.test(String(b.computed_status || b.plan_name || "").toLowerCase())).length;
      body.innerHTML = `<div class="items-desk master-desk">
        ${masterHero("Platform", "Businesses", "Add or edit a shop, set login, and open POS. Status and plan sit on each shop card.", [
          { label: "Shops", value: rows.length },
          { label: "Active", value: activeN },
          { label: "Expired", value: expiredN, warn: expiredN > 0 },
          { label: "Trial", value: trialN },
        ])}
        <div class="items-split">
          <div class="master-compose">
            <form class="settings item-composer" id="biz-pw-form" hidden>
              <div class="item-composer-top">
                <p class="item-mode">Set login password</p>
                <p class="item-composer-note" id="biz-pw-who"></p>
              </div>
              <input type="hidden" name="business_id" />
              <fieldset class="item-block">
                <legend>Password</legend>
                <label>New password <input name="password" type="password" required minlength="8" autocomplete="new-password" /></label>
                <label>Confirm password <input name="confirm" type="password" required minlength="8" autocomplete="new-password" /></label>
              </fieldset>
              <div class="item-composer-actions">
                <button class="btn primary" type="submit">Save password</button>
                <button class="btn" type="button" id="biz-pw-cancel">Cancel</button>
                <p class="hint" id="biz-pw-hint"></p>
              </div>
            </form>
            <form class="settings item-composer" id="biz-clean-form" hidden>
              <div class="item-composer-top">
                <p class="item-mode">Clean all shop data</p>
                <p class="item-composer-note" id="biz-clean-who"></p>
              </div>
              <input type="hidden" name="business_id" />
              <fieldset class="item-block">
                <legend>Master Admin password</legend>
                <p class="item-composer-note">Enter your Master Admin password to confirm. This cannot be undone. Login, branches, devices, and shop settings stay.</p>
                <label>Password <input name="password" type="password" required autocomplete="current-password" /></label>
                <label>Confirm password <input name="confirm" type="password" required autocomplete="current-password" /></label>
              </fieldset>
              <div class="item-composer-actions">
                <button class="btn danger" type="submit">Clean all data</button>
                <button class="btn" type="button" id="biz-clean-cancel">Cancel</button>
                <p class="hint" id="biz-clean-hint"></p>
              </div>
            </form>
            <form class="settings item-composer biz-create" id="biz-form">
              <div class="item-composer-top">
                <p class="item-mode" id="biz-title">Add business</p>
                <p class="item-composer-note">Shop profile, owner contact, login, and subscription plan.</p>
              </div>
              <input type="hidden" name="business_id" />
              <fieldset class="item-block">
                <legend>Shop</legend>
                <label class="full">Business name *
                  <input name="businessName" required maxlength="180" />
                </label>
                <label>Type *
                  <select name="businessType" required>${options(BIZ_TYPES, "Select type")}</select>
                </label>
                <label>Category *
                  <select name="businessCategory" required>${options(BIZ_CATEGORIES, "Select category")}</select>
                </label>
                <label>Logo
                  <input name="logo" type="file" accept="image/*" />
                </label>
                <label>Status
                  <select name="status">
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
              </fieldset>
              <fieldset class="item-block">
                <legend>Owner</legend>
                <label>Owner name *
                  <input name="ownerName" required maxlength="120" />
                </label>
                <label>Mobile *
                  <input name="mobile" type="tel" required inputmode="numeric" maxlength="15" placeholder="10-digit mobile" />
                </label>
                <label class="full">Email *
                  <input name="email" type="email" required maxlength="160" />
                </label>
                <label>GSTIN
                  <input name="gstNumber" maxlength="20" placeholder="Optional" />
                </label>
                <label>PAN
                  <input name="panNumber" maxlength="12" placeholder="Optional" />
                </label>
              </fieldset>
              <fieldset class="item-block">
                <legend>Address</legend>
                <label class="full">Street *
                  <textarea name="address" required rows="2" maxlength="500"></textarea>
                </label>
                <label>City *
                  <input name="city" required maxlength="80" />
                </label>
                <label>State *
                  <select name="state" required>${options(IN_STATES, "Select state")}</select>
                </label>
                <label>PIN code *
                  <input name="pinCode" required inputmode="numeric" maxlength="6" placeholder="6-digit PIN" />
                </label>
              </fieldset>
              <fieldset class="item-block">
                <legend>Login</legend>
                <label>Admin username *
                  <input name="adminUsername" required maxlength="32" autocomplete="off" />
                </label>
                <label>Password *
                  <input name="password" type="password" required minlength="8" autocomplete="new-password" />
                </label>
                <label class="full">Confirm password *
                  <input name="confirmPassword" type="password" required minlength="8" autocomplete="new-password" />
                </label>
              </fieldset>
              <fieldset class="item-block">
                <legend>Plan</legend>
                <label>Plan
                  <select name="plan_id">${planOptions}</select>
                </label>
                <label>Expiry
                  <input name="subscription_expires_at" type="date" />
                </label>
                <label class="full">Account manager
                  <select name="account_manager_id">
                    <option value="">None — platform helpline</option>
                    ${managerOptions}
                  </select>
                </label>
              </fieldset>
              <div class="item-composer-actions">
                <button class="btn primary" type="submit" id="biz-save">Create business</button>
                <button class="btn" type="button" id="biz-cancel" hidden>Cancel edit</button>
                <p class="hint" id="biz-hint"></p>
              </div>
            </form>
          </div>
          <aside class="items-library">
            <div class="items-library-head">
              <h4>Shops</h4>
              <input id="biz-search" type="search" placeholder="Search name, city, owner…" autocomplete="off" />
            </div>
            <div class="items-library-list" id="biz-library">${rows
              .map((b) => {
                const hay = `${b.name || ""} ${b.owner_name || ""} ${b.city || ""} ${b.category || ""} ${b.plan_name || ""} ${b.account_manager_name || ""}`.toLowerCase();
                const src = String(b.logo_url || "").trim();
                const thumb = src
                  ? `<img class="item-thumb" src="${attr(src)}" alt="">`
                  : `<span class="item-thumb-empty" aria-hidden="true">${attr(letterMark(b.name))}</span>`;
                return `<article class="report-card item-card" data-biz-card data-biz-search="${attr(hay)}">
                  <div class="item-card-head">
                    ${thumb}
                    <div class="item-card-copy">
                      <strong>${attr(b.name)}</strong>
                      <span>${attr(b.owner_name || "—")} · ${attr(b.city || "—")}</span>
                    </div>
                    ${statusChip(b.computed_status || b.status)}
                  </div>
                  <div class="item-card-meta">
                    <span class="item-chip">${attr(b.category || b.business_type || "—")}</span>
                    <span class="item-chip">${attr(b.plan_name || b.plan_id || "—")}</span>
                    <span class="item-chip">${money(b.fee_monthly)}</span>
                    <span class="item-chip">Exp ${attr(ymd(b.subscription_expires_at) || "—")}</span>
                    <span class="item-chip">${attr(b.account_manager_name || "No account manager")}</span>
                  </div>
                  <div class="item-card-foot">
                    <div class="item-card-actions">
                      <button class="btn primary" type="button" data-enter="${attr(b.id)}">Open POS</button>
                      <button class="btn" type="button" data-edit="${attr(b.id)}">Edit</button>
                      <button class="btn" type="button" data-reset-biz="${attr(b.id)}">Password</button>
                      <button class="btn danger" type="button" data-clean-biz="${attr(b.id)}">Clean data</button>
                      <button class="btn" type="button" data-act="suspend" data-id="${attr(b.id)}">Suspend</button>
                      <button class="btn" type="button" data-act="activate" data-id="${attr(b.id)}">Activate</button>
                    </div>
                  </div>
                </article>`;
              })
              .join("") || `<div class="item-empty-card"><strong>No shops yet</strong><p>Create the first business on the left.</p></div>`}
            </div>
          </aside>
        </div>
      </div>`;
      bindEnterPosButtons(body);
      $("biz-search")?.addEventListener("input", () => {
        const q = String($("biz-search").value || "").trim().toLowerCase();
        body.querySelectorAll("[data-biz-card]").forEach((el) => {
          el.hidden = Boolean(q) && !String(el.dataset.bizSearch || "").includes(q);
        });
      });
      const form = $("biz-form");
      const hint = $("biz-hint");
      function setAdminRequired(on) {
        form.adminUsername.required = on;
        form.password.required = on;
        form.confirmPassword.required = on;
        form.password.minLength = on ? 8 : 0;
        form.confirmPassword.minLength = on ? 8 : 0;
      }
      function fillBusiness(b) {
        form.business_id.value = b?.id || "";
        form.businessName.value = b?.name || "";
        setSelect(form.businessType, b?.business_type || "");
        setSelect(form.businessCategory, b?.category || "");
        form.ownerName.value = b?.owner_name || "";
        form.mobile.value = b?.mobile || "";
        form.email.value = b?.email || "";
        form.gstNumber.value = b?.gstin || "";
        form.panNumber.value = b?.pan || "";
        form.address.value = b ? streetAddress(b) : "";
        form.city.value = b?.city || "";
        setSelect(form.state, b?.state || "");
        form.pinCode.value = b?.pin_code || "";
        form.logo.value = "";
        form.status.value = b?.status === "suspended" || b?.status === "inactive" ? b.status : "active";
        form.adminUsername.value = b?.admin_username || "";
        form.password.value = "";
        form.confirmPassword.value = "";
        setSelect(form.plan_id, b?.plan_id || "");
        form.subscription_expires_at.value = b ? ymd(b.subscription_expires_at) : "";
        setSelect(form.account_manager_id, b?.account_manager_id || "");
        const editing = Boolean(b);
        setAdminRequired(!editing);
        $("biz-title").textContent = editing ? "Edit business" : "Add business";
        $("biz-save").textContent = editing ? "Update business" : "Create business";
        $("biz-cancel").hidden = !editing;
        body.querySelectorAll("[data-biz-card]").forEach((el) => el.classList.remove("is-editing"));
        if (editing) body.querySelector(`[data-edit="${CSS.escape(b.id)}"]`)?.closest("[data-biz-card]")?.classList.add("is-editing");
        hint.className = "hint";
        hint.textContent = editing
          ? `Editing ${b.name}. Leave password blank to keep the current login.`
          : "";
        form.scrollIntoView({ block: "start" });
      }
      $("biz-cancel").onclick = () => fillBusiness(null);
      body.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.onclick = () => {
          const b = rows.find((r) => r.id === btn.dataset.edit);
          if (b) fillBusiness(b);
        };
      });
      form.onsubmit = async (e) => {
        e.preventDefault();
        hint.className = "hint";
        const fd = new FormData(form);
        const payload = Object.fromEntries(fd);
        const id = payload.business_id;
        delete payload.business_id;
        delete payload.logo;
        if (id && !String(payload.password || "").trim()) {
          delete payload.password;
          delete payload.confirmPassword;
        }
        const passwordChanged = Boolean(String(fd.get("password") || "").trim());
        const btn = $("biz-save");
        btn.disabled = true;
        hint.textContent = id ? "Updating business…" : "Creating business…";
        try {
          payload.logoDataUrl = await readLogo(fd.get("logo"));
          if (id) await api(`/api/master/businesses/${id}`, { method: "PUT", body: JSON.stringify(payload) });
          else await api("/api/master/businesses", { method: "POST", body: JSON.stringify(payload) });
          panelFlash = id && passwordChanged ? "Business updated. Login password changed." : "Saved";
          render();
        } catch (err) {
          hint.textContent = err.message;
          hint.className = "hint error";
        } finally {
          btn.disabled = false;
        }
      };
      body.querySelectorAll("[data-act]").forEach((btn) => {
        btn.onclick = async () => {
          await api(`/api/master/businesses/${btn.dataset.id}/status`, {
            method: "POST",
            body: JSON.stringify({ status: btn.dataset.act === "activate" ? "active" : "suspended" }),
          });
          render();
        };
      });
      const bizPw = bindPasswordForm($("biz-pw-form"), $("biz-pw-hint"), $("biz-pw-who"), $("biz-pw-cancel"), async (fd, password) => {
        const businessId = fd.get("business_id");
        await api(`/api/master/businesses/${businessId}/reset-password`, {
          method: "POST",
          body: JSON.stringify({ password }),
        });
      });
      const bizCleanForm = $("biz-clean-form");
      const bizCleanHint = $("biz-clean-hint");
      const bizCleanWho = $("biz-clean-who");
      $("biz-clean-cancel").onclick = () => {
        bizCleanForm.hidden = true;
        bizCleanForm.reset();
        bizCleanHint.textContent = "";
        bizCleanHint.className = "hint";
      };
      bizCleanForm.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(bizCleanForm);
        const password = String(fd.get("password") || "");
        const confirm = String(fd.get("confirm") || "");
        if (password !== confirm) {
          bizCleanHint.textContent = "Password and confirm password do not match";
          bizCleanHint.className = "hint error";
          return;
        }
        const businessId = fd.get("business_id");
        const shop = rows.find((r) => r.id === businessId);
        try {
          bizCleanHint.className = "hint";
          bizCleanHint.textContent = "Checking password and cleaning data…";
          await api(`/api/master/businesses/${businessId}/clean`, {
            method: "POST",
            body: JSON.stringify({ password }),
          });
          panelFlash = `Cleaned all data for ${shop?.name || "this shop"}. Login and shop settings were kept.`;
          render();
        } catch (err) {
          bizCleanHint.textContent = err.message;
          bizCleanHint.className = "hint error";
        }
      };
      body.querySelectorAll("[data-reset-biz]").forEach((btn) => {
        btn.onclick = () => {
          bizCleanForm.hidden = true;
          const b = rows.find((r) => r.id === btn.dataset.resetBiz);
          bizPw.open(btn.dataset.resetBiz, `New login password for ${b?.name || "this shop"} (${b?.admin_username || b?.email || "business admin"}).`);
        };
      });
      body.querySelectorAll("[data-clean-biz]").forEach((btn) => {
        btn.onclick = () => {
          $("biz-pw-form").hidden = true;
          const b = rows.find((r) => r.id === btn.dataset.cleanBiz);
          bizCleanForm.hidden = false;
          bizCleanForm.business_id.value = btn.dataset.cleanBiz;
          bizCleanWho.textContent = `Delete sales, purchases, stock, items, customers, and bills for ${b?.name || "this shop"}.`;
          bizCleanForm.password.value = "";
          bizCleanForm.confirm.value = "";
          bizCleanHint.textContent = "";
          bizCleanHint.className = "hint";
          bizCleanForm.scrollIntoView({ block: "start" });
          bizCleanForm.password.focus();
        };
      });
      if (panelFlash) {
        hint.textContent = panelFlash;
        hint.className = "hint ok";
        panelFlash = "";
      }
    } else if (tab === "users") {
      const rows = await api("/api/master/users");
      body.innerHTML = `<p class="lede">Set a login password for any shop user, or unlock an account after too many failed sign-ins.</p>
        <form class="settings wide" id="user-pw-form" hidden>
          <h3 class="full">Set user password</h3>
          <input type="hidden" name="user_id" />
          <p class="section-note" id="user-pw-who"></p>
          <label>New password <input name="password" type="password" required minlength="8" autocomplete="new-password" /></label>
          <label>Confirm password <input name="confirm" type="password" required minlength="8" autocomplete="new-password" /></label>
          <button class="btn primary" type="submit">Save password</button>
          <button class="btn" type="button" id="user-pw-cancel">Cancel</button>
          <p class="hint" id="user-pw-hint"></p>
        </form>
        <p class="hint" id="users-hint"></p>
        <div class="table-wrap">${table(
        ["Email", "Name", "Role", "Business", "Status", ""],
        rows.map((u) => [
          u.email,
          `${u.first_name || ""} ${u.last_name || ""}`.trim() || "—",
          u.role,
          u.business_name || "—",
          accountStatusLabel(u),
          `${u.status === "active" ? `<button class="btn primary" type="button" data-enter-user="${u.id}">Open POS</button>` : ""}
           <button class="btn" type="button" data-reset-user="${u.id}">Set password</button>
           <button class="btn" type="button" data-unlock="${u.id}">Unlock</button>`,
        ]),
      )}</div>`;
      bindEnterPosButtons(body);
      const usersHint = $("users-hint");
      const userPw = bindPasswordForm($("user-pw-form"), $("user-pw-hint"), $("user-pw-who"), $("user-pw-cancel"), async (fd, password) => {
        await api(`/api/master/users/${fd.get("user_id")}/reset-password`, {
          method: "POST",
          body: JSON.stringify({ password }),
        });
      });
      body.querySelectorAll("[data-reset-user]").forEach((btn) => {
        btn.onclick = () => {
          const u = rows.find((r) => r.id === btn.dataset.resetUser);
          const name = `${u?.first_name || ""} ${u?.last_name || ""}`.trim() || u?.email || "this user";
          userPw.open(btn.dataset.resetUser, `New login password for ${name} (${u?.email || ""}).`);
        };
      });
      body.querySelectorAll("[data-unlock]").forEach((btn) => {
        btn.onclick = async () => {
          btn.disabled = true;
          try {
            await api(`/api/master/users/${btn.dataset.unlock}/unlock`, { method: "POST" });
            panelFlash = "Account unlocked. The user can sign in again.";
            render();
          } catch (err) {
            usersHint.textContent = err.message;
            usersHint.className = "hint error";
            btn.disabled = false;
          }
        };
      });
      if (panelFlash) {
        usersHint.textContent = panelFlash;
        usersHint.className = "hint ok";
        panelFlash = "";
      }
    } else if (tab === "plans") {
      const rows = await api("/api/master/plans");
      body.innerHTML = `<form class="settings wide" id="plan-form">
        <input type="hidden" name="plan_id" />
        <label>Code <input name="code" required placeholder="BASIC" /></label>
        <label>Name <input name="name" required placeholder="Basic" /></label>
        <label>Fee ₹ / month <input name="fee_monthly" type="number" min="0" step="0.01" required value="0" /></label>
        <label>Max branches <input name="max_branches" type="number" min="1" value="1" /></label>
        <label>Max users <input name="max_users" type="number" min="1" value="3" /></label>
        <label>Max devices <input name="max_devices" type="number" min="1" value="2" /></label>
        <label>Max products <input name="max_products" type="number" min="1" value="500" /></label>
        <label>Active <input name="active" type="checkbox" checked /></label>
        <button class="btn primary" type="submit" id="plan-save">Save plan</button>
        <button class="btn" type="button" id="plan-cancel" hidden>Cancel edit</button>
        <p class="hint" id="plan-hint"></p>
      </form>
      <p class="lede">Use <strong>Edit</strong> to change an existing plan. New codes create a plan.</p>
      <div class="table-wrap">${table(
        ["Code", "Name", "Fee / month", "Branches", "Users", "Devices", "Products", "Active", ""],
        rows.map((p) => [
          p.code,
          p.name,
          money(p.fee_monthly),
          p.max_branches,
          p.max_users,
          p.max_devices,
          p.max_products,
          p.active ? "yes" : "no",
          `<button class="btn" type="button" data-edit="${p.id}">Edit</button>`,
        ]),
      )}</div>`;
      const form = $("plan-form");
      const saveBtn = $("plan-save");
      const cancelBtn = $("plan-cancel");
      const hint = $("plan-hint");
      function fillPlan(p) {
        form.plan_id.value = p?.id || "";
        form.code.value = p?.code || "";
        form.code.readOnly = Boolean(p);
        form.name.value = p?.name || "";
        form.fee_monthly.value = p ? Number(p.fee_monthly) || 0 : 0;
        form.max_branches.value = p?.max_branches || 1;
        form.max_users.value = p?.max_users || 3;
        form.max_devices.value = p?.max_devices || 2;
        form.max_products.value = p?.max_products || 500;
        form.active.checked = p ? Boolean(Number(p.active)) : true;
        saveBtn.textContent = p ? "Update plan" : "Save plan";
        cancelBtn.hidden = !p;
        hint.textContent = p ? `Editing ${p.code}` : "";
        hint.className = "hint";
        form.scrollIntoView({ block: "start" });
      }
      cancelBtn.onclick = () => fillPlan(null);
      body.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.onclick = () => {
          const p = rows.find((r) => r.id === btn.dataset.edit);
          if (p) fillPlan(p);
        };
      });
      form.onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(form).entries());
        const id = fd.plan_id;
        delete fd.plan_id;
        fd.active = form.active.checked;
        try {
          hint.className = "hint";
          hint.textContent = "Saving…";
          if (id) await api(`/api/master/plans/${id}`, { method: "PUT", body: JSON.stringify(fd) });
          else await api("/api/master/plans", { method: "POST", body: JSON.stringify(fd) });
          render();
        } catch (err) {
          hint.textContent = err.message;
          hint.className = "hint error";
        }
      };
    } else if (tab === "branches") {
      const rows = await api("/api/master/branches");
      body.innerHTML = table(
        ["Business", "Branch", "Status"],
        rows.map((r) => [r.business_name, r.name, r.status]),
      );
    } else if (tab === "devices") {
      const rows = await api("/api/master/devices");
      body.innerHTML = table(
        ["Business", "Branch", "Device", "Code", "Status"],
        rows.map((r) => [r.business_name, r.branch_name, r.name, r.code, r.status]),
      );
    } else if (tab === "audit") {
      const rows = await api("/api/master/audit");
      body.innerHTML = table(
        ["When", "Actor", "Action", "Module", "Business", "Order / details"],
        rows.map((r) => [
          formatPlatformTime(r.created_at),
          r.actor_name,
          r.action,
          r.module,
          businessLabel(r),
          auditDetails(r),
        ]),
      );
    } else if (tab === "backup" || tab === "alerts") {
      if (tab === "alerts") backupPane = "settings";
      const shops = await api("/api/master/businesses");
      const alerts = backupPane === "settings" ? await api("/api/master/alerts") : null;
      const pane = backupPane === "settings" ? "settings" : "backup";
      const activeMsgs = pane === "settings" ? ALERT_DEFS.filter((d) => alerts?.[d.flag] === "1").length : 0;
      body.innerHTML = `<div class="items-desk settings-desk master-desk">
        ${masterHero(
          "Platform",
          pane === "settings" ? "Settings" : "Backup",
          pane === "settings"
            ? "Connect WhatsApp, then turn each auto-message Active or Inactive. Shops receive WhatsApp on their mobile and email on their shop email."
            : "Download or restore one shop, or the full platform. Backup and Messages are under Settings.",
          pane === "backup"
            ? [{ label: "Shops", value: shops.length }]
            : [
                { label: "WhatsApp", value: alerts?.wa_enabled === "1" ? "On" : "Off" },
                { label: "Active", value: `${activeMsgs}/${ALERT_DEFS.length}` },
              ],
        )}
        ${backupFamilyTabs(pane)}
        <div class="settings-pane" id="master-pane-backup" ${pane === "backup" ? "" : "hidden"}>
          <div class="master-backup-grid">
            <div class="settings" id="master-backup-card">
              <div class="settings-section backup-panel">
                <h3>Shop backup</h3>
                <p class="section-note">Includes that shop’s items, stock, customers, invoices, purchases, and accounts. Restore replaces current data for the selected shop only.</p>
                <label>Shop
                  <select id="master-backup-shop">
                    <option value="">Select shop</option>
                    ${shops.map((b) => `<option value="${attr(b.id)}">${attr(b.name)}</option>`).join("")}
                  </select>
                </label>
                <div class="backup-actions">
                  <a class="btn primary" id="btn-master-shop-download" href="#">Download shop backup</a>
                  <label class="backup-file-lab">Restore file
                    <input id="master-shop-backup-file" type="file" accept="application/json,.json" />
                  </label>
                  <button class="btn" type="button" id="btn-master-shop-restore">Restore into selected shop</button>
                </div>
                <p class="hint" id="master-shop-backup-hint"></p>
              </div>
            </div>
            <div class="settings">
              <div class="settings-section backup-panel">
                <h3>Platform backup</h3>
                <p class="backup-warn">Full restore overwrites every shop, subscription plan, and master admin. Keep the file private. Sessions are not included, so you stay signed in.</p>
                <div class="backup-actions">
                  <a class="btn primary" id="btn-master-platform-download" href="#">Download platform backup</a>
                  <label class="backup-file-lab">Restore file
                    <input id="master-platform-backup-file" type="file" accept="application/json,.json" />
                  </label>
                  <button class="btn" type="button" id="btn-master-platform-restore">Restore platform backup</button>
                </div>
                <p class="hint" id="master-platform-backup-hint"></p>
              </div>
            </div>
          </div>
        </div>
        <div class="settings-pane" id="master-pane-settings" ${pane === "settings" ? "" : "hidden"}>
          ${pane === "settings" ? alertsFormHtml(alerts) : ""}
        </div>
      </div>`;
      bindBackupFamilyTabs(body);
      if (pane === "backup") bindMasterBackup(body, shops);
      else bindAlertsForm(alerts);
    } else if (tab === "notes") {
      const [businesses, settings] = await Promise.all([
        api("/api/master/businesses"),
        api("/api/master/settings").catch(() => ({ notifications: [] })),
      ]);
      const notes = settings.notifications || [];
      body.innerHTML = `<div class="items-desk master-desk">
        ${masterHero("Platform", "Messages", "Post to the shop dashboard. If New update is Active in Settings, shops also get WhatsApp and email.", [
          { label: "Recent", value: notes.length },
          { label: "Shops", value: businesses.length },
        ])}
        ${backupFamilyTabs("notes")}
        <div class="items-split">
          <form class="settings item-composer" id="note-form">
            <div class="item-composer-top">
              <p class="item-mode">New notification</p>
              <p class="item-composer-note">Choose one shop or all businesses. Optional image prints on the dashboard card.</p>
            </div>
            <fieldset class="item-block">
              <legend>Message</legend>
              <label class="full">Send to
                <select name="business_id">
                  <option value="">All businesses</option>
                  ${businesses.map((b) => `<option value="${attr(b.id)}">${attr(b.name)}</option>`).join("")}
                </select>
              </label>
              <label class="full">Title <input name="title" required maxlength="180" placeholder="Holiday hours" /></label>
              <label class="full">Body <textarea name="body" rows="4" maxlength="2000" placeholder="What shops should see…"></textarea></label>
            </fieldset>
            <fieldset class="item-block">
              <legend>Image</legend>
              <div class="logo-row full">
                <div class="logo-preview-frame item-image-frame">
                  <img id="note-image-preview" class="logo-preview" alt="Notification image" hidden />
                </div>
                <div class="logo-controls">
                  <div class="logo-pick-row">
                    <input id="note-image" name="note-image" class="logo-file-input" type="file" accept="image/png,image/jpeg" />
                    <label class="btn logo-pick" for="note-image">Choose image</label>
                    <button class="btn" type="button" id="note-image-clear" hidden>Remove</button>
                  </div>
                </div>
              </div>
            </fieldset>
            <div class="item-composer-actions">
              <button class="btn primary" type="submit">Send notification</button>
              <p class="hint" id="note-hint"></p>
            </div>
          </form>
          <aside class="items-library">
            <div class="items-library-head">
              <h4>Recent</h4>
            </div>
            <div class="items-library-list">${
              notes.length
                ? notes
                    .map(
                      (n) =>
                        `<article class="report-card item-card platform-notice">
                          <div class="item-card-copy">
                            <strong>${attr(n.title || "Notice")}</strong>
                            <span>${attr(n.body || "")}</span>
                          </div>
                          ${n.image_url ? `<img class="notice-thumb" src="${attr(n.image_url)}" alt="" />` : ""}
                        </article>`,
                    )
                    .join("")
                : `<div class="item-empty-card"><strong>No notifications yet</strong><p>Send the first update from the left.</p></div>`
            }</div>
          </aside>
        </div>
      </div>`;
      bindBackupFamilyTabs(body);
      let noteImage = "";
      const preview = $("note-image-preview");
      const clearBtn = $("note-image-clear");
      const paintNoteImage = () => {
        if (preview) {
          preview.src = noteImage || "";
          preview.hidden = !noteImage;
        }
        if (clearBtn) clearBtn.hidden = !noteImage;
      };
      $("note-image")?.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          noteImage = await readLogo(file, 640);
          paintNoteImage();
        } catch (err) {
          $("note-hint").textContent = err.message;
          $("note-hint").className = "hint error";
        }
      });
      clearBtn?.addEventListener("click", () => {
        noteImage = "";
        if ($("note-image")) $("note-image").value = "";
        paintNoteImage();
      });
      $("note-form").onsubmit = async (e) => {
        e.preventDefault();
        const hint = $("note-hint");
        const fd = Object.fromEntries(new FormData(e.target).entries());
        if (!fd.business_id) delete fd.business_id;
        delete fd["note-image"];
        if (noteImage) fd.image_url = noteImage;
        hint.className = "hint";
        hint.textContent = "Sending…";
        try {
          const out = await api("/api/master/notifications", { method: "POST", body: JSON.stringify(fd) });
          panelFlash = summarizeNoticeDelivery(out.delivery);
          render();
        } catch (err) {
          hint.textContent = err.message;
          hint.className = "hint error";
        }
      };
      if (panelFlash) {
        const noteHint = $("note-hint");
        if (noteHint) {
          noteHint.textContent = panelFlash;
          noteHint.className = "hint ok";
        }
        panelFlash = "";
      }
    } else if (tab === "managers") {
      const [managers, shops] = await Promise.all([
        api("/api/master/account-managers"),
        api("/api/master/businesses"),
      ]);
      const activeN = managers.filter((m) => m.status !== "inactive").length;
      const assignedN = shops.filter((b) => b.account_manager_id).length;
      body.innerHTML = `<div class="items-desk master-desk">
        ${masterHero("Platform", "Account managers", "Add support staff, then assign each shop. That person is who the shop sees on Support.", [
          { label: "Managers", value: managers.length },
          { label: "Active", value: activeN },
          { label: "Shops assigned", value: assignedN },
          { label: "Unassigned shops", value: shops.length - assignedN, warn: shops.length - assignedN > 0 },
        ])}
        <div class="items-split">
          <div class="master-compose">
            <form class="settings item-composer" id="am-form">
              <div class="item-composer-top">
                <p class="item-mode" id="am-title">Add account manager</p>
                <p class="item-composer-note">Name and mobile are shown to assigned shops for support.</p>
              </div>
              <input type="hidden" name="manager_id" />
              <fieldset class="item-block">
                <legend>Contact</legend>
                <label class="full">Name *
                  <input name="name" required maxlength="120" />
                </label>
                <label>Mobile *
                  <input name="mobile" type="tel" required inputmode="numeric" maxlength="15" placeholder="10-digit mobile" />
                </label>
                <label>Email
                  <input name="email" type="email" maxlength="160" />
                </label>
                <label>Status
                  <select name="status">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
                <label class="full">Notes
                  <input name="notes" maxlength="200" placeholder="Optional" />
                </label>
              </fieldset>
              <div class="item-composer-actions">
                <button class="btn primary" type="submit" id="am-save">Save manager</button>
                <button class="btn" type="button" id="am-cancel" hidden>Cancel edit</button>
                <p class="hint" id="am-hint"></p>
              </div>
            </form>
          </div>
          <aside class="items-library">
            <div class="items-library-head">
              <h4>Managers</h4>
              <input id="am-search" type="search" placeholder="Search name or mobile…" autocomplete="off" />
            </div>
            <div class="items-library-list">${managers
              .map((m) => {
                const hay = `${m.name || ""} ${m.mobile || ""} ${m.email || ""}`.toLowerCase();
                const assigned = m.businesses || [];
                const assignOpts = shops
                  .filter((b) => b.account_manager_id !== m.id)
                  .map((b) => `<option value="${attr(b.id)}">${attr(b.name)}</option>`)
                  .join("");
                return `<article class="report-card item-card" data-am-card data-am-search="${attr(hay)}">
                  <div class="item-card-head">
                    <span class="item-thumb-empty" aria-hidden="true">${attr(letterMark(m.name))}</span>
                    <div class="item-card-copy">
                      <strong>${attr(m.name)}</strong>
                      <span>${attr(m.mobile || "—")}${m.email ? ` · ${attr(m.email)}` : ""}</span>
                    </div>
                    ${statusChip(m.status)}
                  </div>
                  <div class="item-card-meta">
                    <span class="item-chip">${assigned.length} shop${assigned.length === 1 ? "" : "s"}</span>
                    ${assigned.map((b) => `<span class="item-chip">${attr(b.name)}</span>`).join("")}
                  </div>
                  <div class="item-card-foot">
                    <div class="item-card-actions">
                      <button class="btn" type="button" data-edit-am="${attr(m.id)}">Edit</button>
                      ${m.status !== "inactive" && assignOpts ? `<label class="item-chip">Assign
                        <select data-assign-am="${attr(m.id)}"><option value="">Select shop…</option>${assignOpts}</select>
                      </label>` : ""}
                      ${assigned
                        .map(
                          (b) =>
                            `<button class="btn" type="button" data-unassign-shop="${attr(b.id)}">Remove ${attr(b.name)}</button>`,
                        )
                        .join("")}
                      <button class="btn danger" type="button" data-del-am="${attr(m.id)}">Delete</button>
                    </div>
                  </div>
                </article>`;
              })
              .join("") || `<div class="item-empty-card"><strong>No account managers yet</strong><p>Add the first support person on the left.</p></div>`}
            </div>
          </aside>
        </div>
      </div>`;
      $("am-search")?.addEventListener("input", () => {
        const q = String($("am-search").value || "").trim().toLowerCase();
        body.querySelectorAll("[data-am-card]").forEach((el) => {
          el.hidden = Boolean(q) && !String(el.dataset.amSearch || "").includes(q);
        });
      });
      const form = $("am-form");
      const hint = $("am-hint");
      function fillManager(m) {
        form.manager_id.value = m?.id || "";
        form.name.value = m?.name || "";
        form.mobile.value = m?.mobile || "";
        form.email.value = m?.email || "";
        form.notes.value = m?.notes || "";
        form.status.value = m?.status === "inactive" ? "inactive" : "active";
        $("am-title").textContent = m ? "Edit account manager" : "Add account manager";
        $("am-save").textContent = m ? "Update manager" : "Save manager";
        $("am-cancel").hidden = !m;
        hint.className = "hint";
        hint.textContent = m ? `Editing ${m.name}` : "";
        form.scrollIntoView({ block: "start" });
      }
      $("am-cancel").onclick = () => fillManager(null);
      body.querySelectorAll("[data-edit-am]").forEach((btn) => {
        btn.onclick = () => fillManager(managers.find((m) => m.id === btn.dataset.editAm));
      });
      body.querySelectorAll("[data-del-am]").forEach((btn) => {
        btn.onclick = async () => {
          const m = managers.find((row) => row.id === btn.dataset.delAm);
          if (!confirm(`Delete ${m?.name || "this account manager"}? Assigned shops will use the platform helpline.`)) return;
          await api(`/api/master/account-managers/${btn.dataset.delAm}`, { method: "DELETE" });
          panelFlash = "Account manager removed";
          render();
        };
      });
      body.querySelectorAll("[data-assign-am]").forEach((sel) => {
        sel.onchange = async () => {
          const shopId = sel.value;
          if (!shopId) return;
          await api(`/api/master/businesses/${shopId}/account-manager`, {
            method: "POST",
            body: JSON.stringify({ account_manager_id: sel.dataset.assignAm }),
          });
          panelFlash = "Shop assigned";
          render();
        };
      });
      body.querySelectorAll("[data-unassign-shop]").forEach((btn) => {
        btn.onclick = async () => {
          await api(`/api/master/businesses/${btn.dataset.unassignShop}/account-manager`, {
            method: "POST",
            body: JSON.stringify({ account_manager_id: "" }),
          });
          panelFlash = "Shop unassigned";
          render();
        };
      });
      form.onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(form).entries());
        const id = fd.manager_id;
        delete fd.manager_id;
        hint.className = "hint";
        hint.textContent = "Saving…";
        try {
          if (id) await api(`/api/master/account-managers/${id}`, { method: "PUT", body: JSON.stringify(fd) });
          else await api("/api/master/account-managers", { method: "POST", body: JSON.stringify(fd) });
          panelFlash = "Account manager saved";
          render();
        } catch (err) {
          hint.textContent = err.message;
          hint.className = "hint error";
        }
      };
      if (panelFlash) {
        hint.textContent = panelFlash;
        hint.className = "hint ok";
        panelFlash = "";
      }
    } else if (tab === "support") {
      const s = await api("/api/master/support");
      body.innerHTML = `<div class="support-admin">
        <div>
          <p class="lede">The sign-in screen always uses this platform helpline. Assigned shops see their account manager on Support instead; shops without one see this number.</p>
          <form class="settings settings-page" id="support-form">
            <div class="settings-section">
              <h3>Helpline</h3>
              <p class="section-note">Fallback contact when a shop has no account manager, or the manager is inactive.</p>
              <div class="settings-grid">
                <label>Support phone <input name="support_phone" required value="${attr(s.support_phone)}" placeholder="9876543210" /></label>
                <label>Support email <input name="support_email" type="email" value="${attr(s.support_email)}" placeholder="support@example.com" /></label>
              </div>
            </div>
            <div class="settings-actions">
              <button class="btn primary" type="submit">Save helpline</button>
              <p class="hint" id="support-save-hint"></p>
            </div>
          </form>
        </div>
        <aside>
          <p class="support-preview-label">Shop preview</p>
          <div class="support-page" id="support-preview"></div>
        </aside>
      </div>`;
      const form = $("support-form");
      const paintPreview = () => {
        const preview = $("support-preview");
        if (!preview || !window.SupportPage?.pageHtml) return;
        const fd = Object.fromEntries(new FormData(form).entries());
        preview.innerHTML = SupportPage.pageHtml(fd, {}, { compact: true });
      };
      paintPreview();
      form.addEventListener("input", paintPreview);
      form.onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target).entries());
        await api("/api/master/support", { method: "POST", body: JSON.stringify(fd) });
        document.getElementById("support-save-hint").textContent = "Saved. All shops will see this helpline.";
        document.getElementById("support-save-hint").className = "hint ok";
        paintPreview();
      };
    }
  } catch (err) {
    body.innerHTML = `<p class="hint error">${err.message}</p>`;
  }
}

function summarizeNoticeDelivery(delivery) {
  if (delivery?.skipped) {
    return "Saved on the shop dashboard. New update WhatsApp/email is Inactive in Settings.";
  }
  const results = delivery?.results;
  if (!Array.isArray(results) || !results.length) {
    return "Saved on the shop dashboard. Add a shop mobile and email to also send WhatsApp and email.";
  }
  let wa = 0;
  let mail = 0;
  for (const row of results) {
    if (row?.wa?.ok) wa += 1;
    if ((row?.mail || []).some((m) => m?.ok)) mail += 1;
  }
  return `Saved on the shop dashboard. WhatsApp ${wa}/${results.length} · Email ${mail}/${results.length}.`;
}

function attr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function table(headers, rows) {
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

boot();
