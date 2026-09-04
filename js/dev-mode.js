(function () {
  const KEY = "pos_developer_mode";
  const LOG_MAX = 40;
  const logs = [];
  let context = { devToolsAllowed: true };

  function isEnabled() {
    return localStorage.getItem(KEY) === "1";
  }

  function setEnabled(on) {
    localStorage.setItem(KEY, on ? "1" : "0");
    syncUi();
  }

  function canUse(session) {
    if (!session) return false;
    if (session.role !== "business_admin") return false;
    return context.devToolsAllowed !== false;
  }

  function syncUi() {
    const on = isEnabled();
    document.body.classList.toggle("dev-mode", on);
    const panel = document.getElementById("dev-panel");
    const badge = document.getElementById("dev-badge");
    if (panel) panel.hidden = !on;
    if (badge) badge.hidden = !on;
    const toggle = document.getElementById("set-dev-mode");
    if (toggle) toggle.checked = on;
    if (on) renderPanel();
  }

  function logEntry(entry) {
    logs.unshift({ ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
    if (logs.length > LOG_MAX) logs.length = LOG_MAX;
    renderLogs();
  }

  function renderLogs() {
    const el = document.getElementById("dev-request-log");
    if (!el) return;
    if (!logs.length) {
      el.innerHTML = '<p class="dev-empty">No requests yet.</p>';
      return;
    }
    el.innerHTML = logs
      .map((row) => {
        const status = row.status === "ERR" ? "ERR" : String(row.status ?? "?");
        const cls = row.ok === false || status === "ERR" ? "dev-log-row is-error" : "dev-log-row";
        return `<div class="${cls}">
          <div class="dev-log-meta"><b>${escapeHtml(row.method)}</b> ${escapeHtml(row.path)} · ${status} · ${row.ms}ms</div>
          <div class="dev-log-time">${escapeHtml(row.time)}</div>
          ${row.error ? `<div class="dev-log-error">${escapeHtml(row.error)}</div>` : ""}
        </div>`;
      })
      .join("");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function getApiSpec() {
    try {
      const raw = sessionStorage.getItem("pos_api_spec_v2");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function renderPanel() {
    const sessionEl = document.getElementById("dev-session-info");
    if (sessionEl && context.session) {
      const lines = [
        `User: ${context.session.name || context.session.email || "—"}`,
        `Role: ${context.session.role || "—"}`,
        `Branch: ${context.session.branch_id || "—"}`,
        `Business: ${context.business?.name || "—"} (${context.business?.id || "—"})`,
        `Status: ${context.business?.status || "—"}`,
        `Plan: ${context.plan?.name || context.plan?.code || "—"}`,
        `Timezone: ${context.timezone || "—"}`,
        `Cart lines: ${context.cartLines ?? 0}`,
      ];
      sessionEl.textContent = lines.join("\n");
    }

    const specEl = document.getElementById("dev-api-spec");
    if (specEl) {
      const spec = getApiSpec();
      specEl.textContent = spec ? JSON.stringify(spec, null, 2) : "No cached API bridge";
    }
    renderLogs();
  }

  async function refreshHealth() {
    const el = document.getElementById("dev-health-info");
    if (!el) return;
    el.textContent = "Loading…";
    try {
      const { res, data } = await window.posRequest("/api/health");
      el.textContent = JSON.stringify({ status: res.status, ...data }, null, 2);
    } catch (err) {
      el.textContent = String(err.message || err);
    }
  }

  async function reprobeApi() {
    sessionStorage.removeItem("pos_api_spec_v2");
    location.reload();
  }

  function clearApiCache() {
    sessionStorage.removeItem("pos_api_spec_v2");
    renderPanel();
  }

  function clearLog() {
    logs.length = 0;
    renderLogs();
  }

  function wrapPosRequest() {
    const original = window.posRequest;
    if (!original || original.__devWrapped) return;
    async function devPosRequest(path, options = {}) {
      const start = performance.now();
      let result;
      let err;
      try {
        result = await original(path, options);
        return result;
      } catch (e) {
        err = e;
        throw e;
      } finally {
        if (isEnabled()) {
          logEntry({
            time: new Date().toLocaleTimeString(),
            method: (options.method || "GET").toUpperCase(),
            path: String(path),
            status: err ? "ERR" : result?.res?.status,
            ms: Math.round(performance.now() - start),
            ok: err ? false : result?.res?.ok,
            error: err ? String(err.message || err) : "",
          });
        }
      }
    }
    devPosRequest.__devWrapped = true;
    window.posRequest = devPosRequest;
  }

  function bindControls() {
    document.getElementById("set-dev-mode")?.addEventListener("change", (e) => {
      setEnabled(e.target.checked);
    });
    document.getElementById("dev-panel-close")?.addEventListener("click", () => setEnabled(false));
    document.getElementById("dev-badge")?.addEventListener("click", () => {
      const panel = document.getElementById("dev-panel");
      if (panel) panel.hidden = !panel.hidden;
    });
    document.getElementById("dev-health-refresh")?.addEventListener("click", refreshHealth);
    document.getElementById("dev-reprobe")?.addEventListener("click", reprobeApi);
    document.getElementById("dev-clear-cache")?.addEventListener("click", clearApiCache);
    document.getElementById("dev-clear-log")?.addEventListener("click", clearLog);
  }

  function init(meta = {}) {
    context = { ...context, ...meta };
    wrapPosRequest();
    bindControls();

    const section = document.getElementById("dev-settings-section");
    if (section) section.hidden = !canUse(context.session);

    const params = new URLSearchParams(location.search);
    if (params.get("dev") === "1" && canUse(context.session)) setEnabled(true);

    syncUi();
    if (isEnabled()) refreshHealth();

    document.addEventListener("keydown", (e) => {
      if (!canUse(context.session)) return;
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setEnabled(!isEnabled());
        if (isEnabled()) refreshHealth();
      }
    });
  }

  function updateContext(patch) {
    context = { ...context, ...patch };
    if (isEnabled()) renderPanel();
  }

  window.DevMode = {
    isEnabled,
    setEnabled,
    canUse,
    init,
    updateContext,
    renderPanel,
    refreshHealth,
  };

  wrapPosRequest();
})();
