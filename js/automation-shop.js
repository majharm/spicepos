(function () {
  const pane = document.getElementById("settings-pane-automation");
  const form = document.getElementById("shop-automation-form");
  if (!pane || !form) return;
  const hint = document.getElementById("shop-automation-hint");
  const keys = ["low_stock", "daily_sales", "collections", "overdue", "eod", "channel_whatsapp", "channel_in_app"];

  function say(text, ok) {
    if (!hint) return;
    hint.textContent = text;
    hint.className = ok ? "hint ok" : "hint error";
  }

  async function phpSettings(options) {
    const res = await fetch("/pos-api.php?p=automation/settings", {
      method: options?.method || "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: options?.body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Could not save automation");
    return data;
  }

  async function api(path, options) {
    if (typeof window.posRequest !== "function") throw new Error("Sign in to change automation");
    const out = await window.posRequest(path, options || {});
    if (out.res?.ok) return out.data;
    const message = out.data?.error || "Could not save automation";
    if (out.res?.status === 404 && /Unknown API/i.test(message)) return phpSettings(options);
    throw new Error(message);
  }

  function paint(settings) {
    const row = settings || {};
    for (const key of keys) {
      const input = form.querySelector(`[name="${key}"]`);
      if (input) input.checked = Number(row[key]) === 1;
    }
    form.close_time.value = row.close_time || "21:00";
    form.report_time.value = row.report_time || "21:00";
    form.low_stock_hours.value = row.low_stock_hours || 24;
  }

  window.posLoadShopAutomation = function posLoadShopAutomation() {
    pane.hidden = false;
    return api("/api/automation/settings")
      .then((out) => paint(out.settings))
      .catch((err) => say(err.message, false));
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const body = {};
    for (const key of keys) body[key] = form.querySelector(`[name="${key}"]`)?.checked ? 1 : 0;
    body.close_time = form.close_time.value;
    body.report_time = form.report_time.value;
    body.low_stock_hours = Number(form.low_stock_hours.value || 24);
    if (button) {
      button.disabled = true;
      button.textContent = "Saving…";
    }
    try {
      const out = await api("/api/automation/settings", { method: "POST", body: JSON.stringify(body) });
      paint(out.settings);
      say("Automation saved for this shop.", true);
    } catch (err) {
      say(err.message, false);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Save automation";
      }
    }
  });
})();
