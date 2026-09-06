(function (root) {
  const SOUND_KEY = "atav.qrOrderSound";
  let audioCtx = null;
  let lastPlayAt = 0;
  let memorySound = "on";

  function store() {
    try {
      if (root.localStorage) return root.localStorage;
    } catch {
      /* private mode */
    }
    return {
      getItem: () => memorySound,
      setItem: (_k, v) => {
        memorySound = String(v);
      },
    };
  }

  function newPending(seen, rows) {
    if (seen == null) return [];
    const known = seen instanceof Set ? seen : new Set(seen);
    return (rows || []).filter((order) => {
      const id = String(order?.id || "");
      return id && String(order.status || "") === "pending" && !known.has(id);
    });
  }

  function toastCopy(order, extra = 0) {
    const number = String(order?.order_number || "QR order");
    const name = String(order?.customer_name || "Customer").trim();
    const table = String(order?.table_no || "").trim();
    const more = extra > 0 ? ` · +${extra} more` : "";
    return `${number} · ${name}${table ? ` · ${table}` : ""}${more}`;
  }

  function soundOn() {
    return store().getItem(SOUND_KEY) !== "off";
  }

  function setSoundOn(on) {
    store().setItem(SOUND_KEY, on ? "on" : "off");
    return soundOn();
  }

  function unlock() {
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function playTone() {
    if (!soundOn()) return false;
    const nowMs = Date.now();
    if (nowMs - lastPlayAt < 1200) return false;
    const ctx = unlock();
    if (!ctx) return false;
    lastPlayAt = nowMs;
    const now = ctx.currentTime;
    [880, 1175, 1568].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.15;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
    return true;
  }

  function desktopNotify(order, extra = 0) {
    if (typeof root.Notification !== "function" || root.Notification.permission !== "granted") return false;
    try {
      const note = new root.Notification("New QR order", {
        body: `${toastCopy(order, extra)} · ${Number(order?.total) ? `₹${Number(order.total).toFixed(2)}` : "Open till"}`,
        tag: `qr-order-${order?.id || "new"}`,
      });
      setTimeout(() => note.close?.(), 12000);
      return true;
    } catch {
      return false;
    }
  }

  function askNotifyPermission() {
    if (typeof root.Notification !== "function") return Promise.resolve("unsupported");
    if (root.Notification.permission !== "default") return Promise.resolve(root.Notification.permission);
    return root.Notification.requestPermission().catch(() => "denied");
  }

  root.POSQrNotify = {
    newPending,
    toastCopy,
    soundOn,
    setSoundOn,
    unlock,
    playTone,
    desktopNotify,
    askNotifyPermission,
    SOUND_KEY,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
