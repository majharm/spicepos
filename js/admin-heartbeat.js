/* Visible shop tabs tell the server they are still open. A login alone does not.
   Business admins also send the device location after the browser asks permission. */
(function () {
  const WAIT = 25000;
  let timer = 0;
  let track = false;
  let asking = false;
  let fix = null;

  function remember(pos) {
    const coords = pos?.coords;
    if (!coords) return;
    const lat = Number(coords.latitude);
    const lon = Number(coords.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const first = !fix;
    fix = { lat, lon, accuracy: Number(coords.accuracy) };
    if (first && document.visibilityState !== "hidden") send();
  }

  function askLocation() {
    if (!track || asking || !navigator.geolocation) return;
    asking = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        asking = false;
        remember(pos);
      },
      () => { asking = false; },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 },
    );
  }

  function send() {
    if (document.visibilityState === "hidden") return;
    if (typeof window.posRequest !== "function") return;
    const body = JSON.stringify(fix || {});
    window.posRequest("/api/session/heartbeat", { method: "POST", body }).then((reply) => {
      if (reply?.data?.tracked === true) {
        track = true;
        if (!fix) askLocation();
      } else if (reply?.data?.tracked === false) {
        track = false;
      }
    }).catch(() => {});
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
