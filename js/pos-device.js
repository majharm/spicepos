/* One id per installed browser, so a phone and a counter stay separate. */
(function () {
  const KEY = "pos.device.id";

  function id() {
    try {
      let value = localStorage.getItem(KEY) || "";
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(value)) {
        const raw = (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`).replace(/-/g, "");
        value = raw.slice(0, 32);
        localStorage.setItem(KEY, value);
      }
      return value;
    } catch {
      return "";
    }
  }

  function label() {
    const ua = typeof navigator === "undefined" ? "" : navigator.userAgent || "";
    const standalone = typeof window !== "undefined" && (
      window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true
    );
    let kind = "Browser";
    if (/iPhone|iPad/.test(ua)) kind = "iPhone";
    else if (/Android/.test(ua)) kind = "Android";
    else if (/Windows/.test(ua)) kind = "Windows";
    else if (/Mac OS/.test(ua)) kind = "Mac";
    else if (/Linux/.test(ua)) kind = "Linux";
    return `${kind} ${standalone ? "app" : "browser"}`.slice(0, 40);
  }

  function payload() {
    return { deviceId: id(), deviceLabel: label() };
  }

  function attachDevice(body) {
    const extra = payload();
    if (!body) return JSON.stringify(extra);
    try {
      const data = JSON.parse(body);
      if (data && typeof data === "object" && !Array.isArray(data)) {
        return JSON.stringify({
          ...extra,
          ...data,
          deviceId: data.deviceId || extra.deviceId,
          deviceLabel: data.deviceLabel || extra.deviceLabel,
        });
      }
    } catch { /* a non-JSON body is left unchanged */ }
    return body;
  }

  function wrapRequest() {
    const orig = window.posRequest;
    if (typeof orig !== "function" || orig.__posDevice) return;
    function wrapped(url, opts) {
      const path = String(url || "");
      const method = String(opts?.method || "GET").toUpperCase();
      if (method === "POST" && /\/api\/(auth\/(login|logout)|session\/heartbeat)(?:\?|$)/.test(path)) {
        return orig(url, { ...opts, body: attachDevice(opts?.body) });
      }
      return orig(url, opts);
    }
    wrapped.__posDevice = true;
    window.posRequest = wrapped;
  }

  function register() {
    if (!("serviceWorker" in navigator)) return;
    const host = location.hostname;
    const secure = location.protocol === "https:" || host === "localhost" || host === "127.0.0.1";
    if (!secure) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }

  function install() {
    let promptEvent = null;
    const buttons = () => [...document.querySelectorAll("[data-pwa-install]")];
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      promptEvent = event;
      buttons().forEach((btn) => { btn.hidden = false; });
    });
    document.addEventListener("click", async (event) => {
      const btn = event.target.closest?.("[data-pwa-install]");
      if (!btn || !promptEvent) return;
      event.preventDefault();
      promptEvent.prompt();
      try { await promptEvent.userChoice; } catch { /* the prompt was dismissed */ }
      promptEvent = null;
      buttons().forEach((el) => { el.hidden = true; });
    });
    const ios = /iPhone|iPad/.test(navigator.userAgent || "") && navigator.standalone !== true;
    if (ios) document.querySelectorAll("[data-pwa-ios]").forEach((el) => { el.hidden = false; });
  }

  window.POSDevice = { id, label, payload };
  if (typeof document === "undefined") return;
  wrapRequest();
  const boot = () => { register(); install(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
