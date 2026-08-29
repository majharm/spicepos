const $ = (id) => document.getElementById(id);
let tab = "dash";

async function api(path, options) {
  const res = await fetch(posUrl(path), {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      "Sign-in did not reach the POS server (got a web page). Open /pos-data/health — it must be JSON.",
    );
  }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function money(n) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(n) || 0);
}

const BIZ_TYPES = ["Retail", "Wholesale", "Distributor", "Restaurant", "Cafe", "Grocery", "Pharmacy", "Electronics", "Fashion", "Services", "Other"];
const BIZ_CATEGORIES = [
  "Spices & masala",
  "Kirana / FMCG",
  "Supermarket",
  "Apparel",
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

function readLogo(file) {
  if (!file || !file.size) return Promise.resolve("");
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const max = 280;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
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
    const me = await api("/api/auth/me");
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

document.querySelectorAll("[data-tab]").forEach((btn) => {
  btn.onclick = () => {
    tab = btn.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b === btn));
    render();
  };
});

async function render() {
  const titles = {
    dash: "Platform dashboard",
    biz: "Businesses",
    users: "Users",
    plans: "Subscription plans",
    branches: "Branches",
    devices: "POS devices",
    audit: "Audit log",
    notes: "Notifications",
    support: "Support number",
  };
  $("panel-title").textContent = titles[tab];
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
          ["Today platform sales", money(t.todaySales)],
          ["Monthly subscription fees", money(t.subscriptionRevenue)],
        ]
          .map(([k, v]) => `<div class="report-card"><span>${k}</span><strong>${v}</strong></div>`)
          .join("")}
      </div>
      <div class="table-wrap" style="padding:20px 0">${table(
        ["Business", "Status", "Plan", "Fee / month", "Users", "Branches", "Today"],
        d.businesses.map((b) => [
          b.name,
          b.computed_status,
          b.plan_name || b.plan_id || "—",
          money(b.fee_monthly),
          b.users,
          b.branches,
          money(b.today_sales),
        ]),
      )}</div>`;
    } else if (tab === "biz") {
      const [rows, plans] = await Promise.all([api("/api/master/businesses"), api("/api/master/plans")]);
      const planOptions = plans
        .map((p) => `<option value="${p.id}">${p.name} · ${money(p.fee_monthly)} / month</option>`)
        .join("");
      body.innerHTML = `<form class="settings wide biz-create" id="biz-form">
        <h3 class="full" id="biz-title">Add business</h3>
        <input type="hidden" name="business_id" />
        <div class="signup-grid">
          <label class="full">Business Name *
            <input name="businessName" required maxlength="180" />
          </label>
          <label>Business Type *
            <select name="businessType" required>${options(BIZ_TYPES, "Select type")}</select>
          </label>
          <label>Business Category *
            <select name="businessCategory" required>${options(BIZ_CATEGORIES, "Select category")}</select>
          </label>
          <label>Owner Name *
            <input name="ownerName" required maxlength="120" />
          </label>
          <label>Mobile Number *
            <input name="mobile" type="tel" required inputmode="numeric" maxlength="15" placeholder="10-digit mobile" />
          </label>
          <label class="full">Email ID *
            <input name="email" type="email" required maxlength="160" />
          </label>
          <label>GST Number
            <input name="gstNumber" maxlength="20" placeholder="Optional" />
          </label>
          <label>PAN Number
            <input name="panNumber" maxlength="12" placeholder="Optional" />
          </label>
          <label class="full">Address *
            <textarea name="address" required rows="2" maxlength="500"></textarea>
          </label>
          <label>City *
            <input name="city" required maxlength="80" />
          </label>
          <label>State *
            <select name="state" required>${options(IN_STATES, "Select state")}</select>
          </label>
          <label>PIN Code *
            <input name="pinCode" required inputmode="numeric" maxlength="6" placeholder="6-digit PIN" />
          </label>
          <label>Business Logo
            <input name="logo" type="file" accept="image/*" />
          </label>
          <label>Status
            <select name="status">
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label>Admin Username *
            <input name="adminUsername" required maxlength="32" autocomplete="off" />
          </label>
          <label>Password *
            <input name="password" type="password" required minlength="8" autocomplete="new-password" />
          </label>
          <label class="full">Confirm Password *
            <input name="confirmPassword" type="password" required minlength="8" autocomplete="new-password" />
          </label>
          <label>Plan
            <select name="plan_id">${planOptions}</select>
          </label>
          <label>Expiry
            <input name="subscription_expires_at" type="date" />
          </label>
        </div>
        <button class="btn primary" type="submit" id="biz-save">Create business</button>
        <button class="btn" type="button" id="biz-cancel" hidden>Cancel edit</button>
        <p class="hint full" id="biz-hint"></p>
      </form>
      <div class="table-wrap">${table(
        ["Name", "Owner", "City", "Category", "Status", "Plan", "Fee / month", "Expiry", ""],
        rows.map((b) => [
          b.name,
          b.owner_name || "—",
          b.city || "—",
          b.category || b.business_type || "—",
          b.computed_status,
          b.plan_name || b.plan_id,
          money(b.fee_monthly),
          b.subscription_expires_at || "—",
          `<button class="btn" type="button" data-edit="${b.id}">Edit</button>
           <button class="btn" data-act="suspend" data-id="${b.id}">Suspend</button>
           <button class="btn" data-act="activate" data-id="${b.id}">Activate</button>`,
        ]),
      )}</div>`;
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
        const editing = Boolean(b);
        setAdminRequired(!editing);
        $("biz-title").textContent = editing ? "Edit business" : "Add business";
        $("biz-save").textContent = editing ? "Update business" : "Create business";
        $("biz-cancel").hidden = !editing;
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
        const btn = $("biz-save");
        btn.disabled = true;
        hint.textContent = id ? "Updating business…" : "Creating business…";
        try {
          payload.logoDataUrl = await readLogo(fd.get("logo"));
          if (id) await api(`/api/master/businesses/${id}`, { method: "PUT", body: JSON.stringify(payload) });
          else await api("/api/master/businesses", { method: "POST", body: JSON.stringify(payload) });
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
    } else if (tab === "users") {
      const rows = await api("/api/master/users");
      body.innerHTML = table(
        ["Email", "Name", "Role", "Business", "Status"],
        rows.map((u) => [u.email, `${u.first_name || ""} ${u.last_name || ""}`.trim(), u.role, u.business_name, u.status]),
      );
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
        ["When", "Actor", "Action", "Business", "Details"],
        rows.map((r) => [r.created_at, r.actor_name, r.action, r.business_id, String(r.details || "").slice(0, 80)]),
      );
    } else if (tab === "notes") {
      body.innerHTML = `<form class="settings" id="note-form">
        <label>Title <input name="title" required /></label>
        <label>Body <input name="body" /></label>
        <button class="btn primary">Send</button>
      </form>`;
      $("note-form").onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target).entries());
        await api("/api/master/notifications", { method: "POST", body: JSON.stringify(fd) });
        e.target.reset();
      };
    } else if (tab === "support") {
      const s = await api("/api/master/support");
      body.innerHTML = `<p class="lede">This number is stored in MySQL and shown to every shop user on Support (and on the login screen).</p>
        <form class="settings" id="support-form">
          <label>Support phone <input name="support_phone" required value="${attr(s.support_phone)}" placeholder="9876543210" /></label>
          <label>Support email <input name="support_email" type="email" value="${attr(s.support_email)}" /></label>
          <button class="btn primary" type="submit">Save</button>
          <p class="hint" id="support-save-hint"></p>
        </form>`;
      $("support-form").onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target).entries());
        await api("/api/master/support", { method: "POST", body: JSON.stringify(fd) });
        document.getElementById("support-save-hint").textContent = "Saved to MySQL. All users will see this number.";
        document.getElementById("support-save-hint").className = "hint ok";
      };
    }
  } catch (err) {
    body.innerHTML = `<p class="hint error">${err.message}</p>`;
  }
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
