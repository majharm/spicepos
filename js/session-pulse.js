/* Activity pulse. A quiet tab does not count as online. */
(function () {
  let last = 0;
  function send() {
    const now = Date.now();
    if (now - last < 60000) return;
    if (document.visibilityState === "hidden") return;
    if (typeof window.posRequest !== "function") return;
    last = now;
    window.posRequest("/api/session/pulse", { method: "POST", body: "{}" }).catch(() => {});
  }
  ["pointerdown", "keydown"].forEach((name) => {
    document.addEventListener(name, send, { passive: true });
  });
})();
