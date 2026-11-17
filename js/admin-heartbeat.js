/* Visible shop tabs tell the server they are still open. A login alone does not. */
(function () {
  const WAIT = 25000;
  let timer = 0;
  function send() {
    if (document.visibilityState === "hidden") return;
    if (typeof window.posRequest !== "function") return;
    window.posRequest("/api/session/heartbeat", { method: "POST", body: "{}" }).catch(() => {});
  }
  function arm() {
    if (timer) clearInterval(timer);
    timer = 0;
    if (document.visibilityState === "hidden") return;
    send();
    timer = setInterval(send, WAIT);
  }
  document.addEventListener("visibilitychange", arm);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arm);
  else arm();
})();
