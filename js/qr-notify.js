(function (root) {
  const SOUND_KEY = "atav.qrOrderSound";
  let audioCtx = null;
  let lastPlayAt = 0;
  let memorySound = "on";
  let armed = false;
  let primedAudio = null;
  let wavUri = "";

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

  function needsUnlock() {
    return soundOn() && !armed;
  }

  function makeChimeWav() {
    const sampleRate = 16000;
    const notes = [
      [880, 0, 0.16],
      [1175, 0.14, 0.16],
      [1568, 0.28, 0.18],
    ];
    const n = Math.floor(sampleRate * 0.52);
    const pcm = new Int16Array(n);
    for (const [freq, start, dur] of notes) {
      const s0 = Math.floor(start * sampleRate);
      const len = Math.floor(dur * sampleRate);
      for (let i = 0; i < len && s0 + i < n; i++) {
        const env = Math.sin((Math.PI * i) / Math.max(1, len - 1));
        const sample = Math.round(0.42 * 32767 * env * Math.sin((2 * Math.PI * freq * i) / sampleRate));
        const next = pcm[s0 + i] + sample;
        pcm[s0 + i] = Math.max(-32767, Math.min(32767, next));
      }
    }
    const bytes = pcm.byteLength;
    const buf = new ArrayBuffer(44 + bytes);
    const view = new DataView(buf);
    const writeStr = (off, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + bytes, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, bytes, true);
    new Uint8Array(buf, 44).set(new Uint8Array(pcm.buffer));
    const u8 = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    const b64 = typeof root.btoa === "function" ? root.btoa(bin) : Buffer.from(bin, "binary").toString("base64");
    return `data:audio/wav;base64,${b64}`;
  }

  function wavSrc() {
    if (!wavUri) wavUri = makeChimeWav();
    return wavUri;
  }

  function playWav() {
    if (typeof root.Audio !== "function") return false;
    try {
      if (!primedAudio) primedAudio = new root.Audio(wavSrc());
      primedAudio.volume = 0.9;
      primedAudio.currentTime = 0;
      const played = primedAudio.play();
      if (played && typeof played.catch === "function") played.catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  function playOsc(ctx) {
    if (!ctx || ctx.state !== "running") return false;
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

  function unlock() {
    armed = true;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (AC) {
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    }
    if (typeof root.Audio === "function" && !primedAudio) {
      try {
        primedAudio = new root.Audio(wavSrc());
        primedAudio.volume = 0.01;
        const primed = primedAudio.play();
        if (primed && typeof primed.then === "function") {
          primed.then(() => {
            primedAudio.pause();
            primedAudio.currentTime = 0;
            primedAudio.volume = 0.9;
          }).catch(() => {});
        }
      } catch {
        primedAudio = null;
      }
    }
    return audioCtx;
  }

  function playTone() {
    if (!soundOn()) return false;
    const nowMs = Date.now();
    if (nowMs - lastPlayAt < 1200) return false;
    lastPlayAt = nowMs;
    const ctx = unlock();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().then(() => {
        if (!playOsc(ctx)) playWav();
      }).catch(() => {
        playWav();
      });
      return true;
    }
    if (playOsc(ctx)) return true;
    return playWav();
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

  if (root.document?.addEventListener) {
    ["pointerdown", "keydown", "touchstart"].forEach((type) => {
      root.document.addEventListener(type, () => unlock(), true);
    });
  }

  root.POSQrNotify = {
    newPending,
    toastCopy,
    soundOn,
    setSoundOn,
    unlock,
    playTone,
    playWav,
    needsUnlock,
    isArmed: () => armed,
    desktopNotify,
    askNotifyPermission,
    SOUND_KEY,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
