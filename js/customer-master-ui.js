(function (root) {
  const $ = (id) => document.getElementById(id);
  const M = () => root.POSCustomerMaster;

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function inputBody() {
    return {
      mobile: $("cust-mobile")?.value || $("qc-mobile")?.value || "",
      email: $("cust-email")?.value || "",
      gstin: $("cust-gstin")?.value || "",
      name: $("cust-name")?.value || "",
    };
  }

  function paintMatch(match, warning, hintId) {
    const hint = $(hintId || "cust-match-hint");
    if (!hint) return;
    if (!match) {
      hint.textContent = "";
      hint.className = "hint";
      return;
    }
    hint.textContent = warning || M()?.warningCopy(match, inputBody()) || "This customer already exists.";
    hint.className = "hint error";
    hint.dataset.matchId = match.id || "";
  }

  async function checkMatch(source) {
    const body = source === "quick"
      ? { mobile: $("qc-mobile")?.value || "", name: $("qc-name")?.value || "" }
      : inputBody();
    if (!M()?.normalizeMobile(body.mobile) && !M()?.normalizeGstin(body.gstin) && !M()?.normalizeEmail(body.email)) {
      paintMatch(null, "", source === "quick" ? "qc-hint" : "cust-match-hint");
      return null;
    }
    const local = M()?.findMatch(root.state?.customers || [], body);
    if (local) {
      const warning = M().warningCopy(local, body);
      paintMatch(local, warning, source === "quick" ? "qc-hint" : "cust-match-hint");
      return local;
    }
    try {
      const q = new URLSearchParams({
        mobile: body.mobile || "",
        email: body.email || "",
        gstin: body.gstin || "",
      });
      const data = await root.api?.(`/api/customers/match?${q}`);
      paintMatch(data?.match, data?.warning, source === "quick" ? "qc-hint" : "cust-match-hint");
      return data?.match || null;
    } catch {
      paintMatch(null, "", source === "quick" ? "qc-hint" : "cust-match-hint");
      return null;
    }
  }

  function useMatch(match) {
    if (!match) return;
    if ($("cust-name")) $("cust-name").value = match.name || "";
    if ($("cust-mobile")) $("cust-mobile").value = match.mobile || "";
    if ($("cust-gstin")) $("cust-gstin").value = match.gstin || "";
    if ($("cust-state")) $("cust-state").value = match.state || "";
    if ($("cust-address")) $("cust-address").value = match.address || "";
    if (root.state) root.state.customerId = match.id;
    if ($("customer")) $("customer").value = match.id;
    if ($("cust-hint")) {
      $("cust-hint").textContent = `Using existing ${match.business_name || match.name || "customer"}`;
      $("cust-hint").className = "hint ok";
    }
  }

  function paintDupes(groups) {
    const el = $("customer-dupes");
    if (!el || !M()) return;
    const rows = groups || M().groupDuplicates(root.state?.customers || []);
    const sum = M().summarizeDuplicates(rows);
    if ($("customers-dupe-stat")) $("customers-dupe-stat").textContent = String(sum.extra);
    if (!rows.length) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    el.innerHTML = `<div class="customer-dupe-head"><strong>${sum.groups} duplicate group${sum.groups === 1 ? "" : "s"}</strong><span>${sum.extra} extra records in this shop</span></div>
      <div class="customer-dupe-list">${rows
        .map((g) => {
          const primary = g.primary_id || g.members[0]?.id;
          const losers = g.members.filter((m) => m.id !== primary);
          return `<article class="customer-dupe-card">
            <p>Matched on ${(g.reasons || ["details"]).join(", ")}</p>
            <ul>${g.members
              .map((m) => `<li><strong>${escapeHtml(m.business_name || m.name)}</strong> · ${escapeHtml(m.mobile || "—")} · ${escapeHtml(m.code || "")}${m.id === primary ? " · keep" : ""}</li>`)
              .join("")}</ul>
            <button class="btn primary" type="button" data-merge-primary="${escapeHtml(primary)}" data-merge-losers="${escapeHtml(losers.map((m) => m.id).join(","))}">Merge into primary</button>
          </article>`;
        })
        .join("")}</div>`;
  }

  async function loadDupes() {
    try {
      const data = await root.api?.("/api/customers/duplicates");
      root.state && (root.state.customerDuplicates = data?.groups || []);
      paintDupes(data?.groups || []);
    } catch {
      paintDupes(M()?.groupDuplicates(root.state?.customers || []) || []);
    }
  }

  async function mergeGroup(primaryId, loserIds) {
    if (!primaryId || !loserIds?.length) return;
    if (!confirm("Merge these customers into one primary record? Invoices, payments, and dues stay on the primary. Duplicates are archived, not deleted.")) return;
    await root.api?.("/api/customers/merge", {
      method: "POST",
      body: JSON.stringify({ primary_id: primaryId, loser_ids: loserIds }),
    });
    if (typeof root.loadBootstrap === "function") await root.loadBootstrap();
    await loadDupes();
    if ($("cust-hint")) {
      $("cust-hint").textContent = "Customers merged. History kept on the primary record.";
      $("cust-hint").className = "hint ok";
    }
  }

  function bind() {
    ["cust-mobile", "cust-gstin", "cust-name"].forEach((id) => {
      $(id)?.addEventListener("blur", () => checkMatch("form"));
      $(id)?.addEventListener("change", () => checkMatch("form"));
    });
    $("qc-mobile")?.addEventListener("blur", () => checkMatch("quick"));
    $("cust-use-match")?.addEventListener("click", async () => {
      const match = await checkMatch("form");
      if (match) useMatch(match);
    });
    $("customer-dupes")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-merge-primary]");
      if (!btn) return;
      mergeGroup(btn.dataset.mergePrimary, String(btn.dataset.mergeLosers || "").split(",").filter(Boolean));
    });
  }

  function hookShowView() {
    if (typeof root.showView !== "function" || root.showView.__customerMaster) return;
    const orig = root.showView;
    root.showView = function (name) {
      const out = orig.apply(this, arguments);
      if (name === "customers") {
        paintDupes(root.state?.customerDuplicates);
        loadDupes();
      }
      return out;
    };
    root.showView.__customerMaster = true;
  }

  function boot() {
    if (!M()) return;
    bind();
    hookShowView();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  root.POSCustomerMasterUi = { checkMatch, paintDupes, loadDupes, useMatch, paintMatch };
})(typeof window !== "undefined" ? window : globalThis);
