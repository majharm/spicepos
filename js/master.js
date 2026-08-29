const $ = (id) => document.getElementById(id);
let tab = "dash";

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function money(n) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(n) || 0);
}

function showLogin(on) {
  $("master-login").hidden = !on;
  $("panel").hidden = on;
}

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
      body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
    });
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
        ]
          .map(([k, v]) => `<div class="report-card"><span>${k}</span><strong>${v}</strong></div>`)
          .join("")}
      </div>
      <div class="table-wrap" style="padding:20px 0">${table(
        ["Business", "Status", "Users", "Branches", "Today"],
        d.businesses.map((b) => [b.name, b.computed_status, b.users, b.branches, money(b.today_sales)]),
      )}</div>`;
    } else if (tab === "biz") {
      const rows = await api("/api/master/businesses");
      body.innerHTML = `<form class="settings wide" id="biz-form">
        <label>Name <input name="name" required /></label>
        <label>Owner <input name="owner_name" /></label>
        <label>Mobile <input name="mobile" /></label>
        <label>Email <input name="email" /></label>
        <label>Type <input name="business_type" value="retail" /></label>
        <label>Plan <input name="plan_id" value="trial" /></label>
        <label>Expiry <input name="subscription_expires_at" type="date" /></label>
        <label>Admin email <input name="admin_email" /></label>
        <label>Admin password <input name="admin_password" type="password" /></label>
        <button class="btn primary" type="submit">Create business</button>
      </form>
      <div class="table-wrap">${table(
        ["Name", "Code", "Status", "Plan", "Expiry", ""],
        rows.map(
          (b) =>
            [b.name, b.code, b.computed_status, b.plan_id, b.subscription_expires_at || "—",
              `<button class="btn" data-act="suspend" data-id="${b.id}">Suspend</button>
               <button class="btn" data-act="activate" data-id="${b.id}">Activate</button>`],
        ),
      )}</div>`;
      $("biz-form").onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target).entries());
        await api("/api/master/businesses", { method: "POST", body: JSON.stringify(fd) });
        render();
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
      body.innerHTML = table(
        ["Code", "Name", "Branches", "Users", "Devices", "Products", "Active"],
        rows.map((p) => [p.code, p.name, p.max_branches, p.max_users, p.max_devices, p.max_products, p.active ? "yes" : "no"]),
      );
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
    }
  } catch (err) {
    body.innerHTML = `<p class="hint error">${err.message}</p>`;
  }
}

function table(headers, rows) {
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

boot();
