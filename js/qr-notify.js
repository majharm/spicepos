(function (root) {
  const SOUND_KEY = "atav.qrOrderSound";
  const FILE_SRC = "./sounds/qr-order.wav";
  let audioCtx = null;
  let lastPlayAt = 0;
  let memorySound = "on";
  let heard = false;
  let fileAudio = null;
  let fallbackAudio = null;
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

  function emit() {
    try {
      root.document?.dispatchEvent(new root.CustomEvent("pos-qr-sound", {
        detail: { heard, soundOn: soundOn() },
      }));
    } catch {
      /* Node tests */
    }
  }

  function markHeard(ok) {
    heard = ok !== false;
    emit();
    return heard;
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
    return soundOn() && !heard;
  }

  function makeChimeWav() {
    const sampleRate = 16000;
    const notes = [
      [784, 0, 0.18],
      [988, 0.16, 0.2],
      [1175, 0.34, 0.26],
    ];
    const n = Math.floor(sampleRate * 0.68);
    const pcm = new Int16Array(n);
    for (const [freq, start, dur] of notes) {
      const s0 = Math.floor(start * sampleRate);
      const len = Math.floor(dur * sampleRate);
      for (let i = 0; i < len && s0 + i < n; i++) {
        const env = Math.sin((Math.PI * i) / Math.max(1, len - 1));
        const sample = Math.round(0.7 * 32767 * env * Math.sin((2 * Math.PI * freq * i) / sampleRate));
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
    new Uint8Array(buf, 44).set(new Uint8Array(pcm.buffer, pcm.byteOffset, bytes));
    const u8 = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    const b64 = typeof root.btoa === "function" ? root.btoa(bin) : Buffer.from(bin, "binary").toString("base64");
    return `data:audio/wav;base64,${b64}`;
  }

  function dataUri() {
    if (!wavUri) wavUri = makeChimeWav();
    return wavUri;
  }

  function fileUrl() {
    const el = root.document?.getElementById("qr-order-chime");
    const src = el?.getAttribute("src") || el?.currentSrc || FILE_SRC;
    return src || FILE_SRC;
  }

  function bindFileAudio() {
    if (typeof root.Audio !== "function") return null;
    if (fileAudio) return fileAudio;
    const el = root.document?.getElementById("qr-order-chime");
    if (el) {
      el.preload = "auto";
      el.setAttribute("playsinline", "");
      el.muted = false;
      fileAudio = el;
      return el;
    }
    fileAudio = new root.Audio(fileUrl());
    fileAudio.preload = "auto";
    return fileAudio;
  }

  function startElement(el, onFail) {
    if (!el) return false;
    try {
      el.muted = false;
      el.volume = 1;
      try {
        if (el.readyState >= 1) el.currentTime = 0;
      } catch {
        /* not seekable yet */
      }
      const played = el.play();
      if (played && typeof played.then === "function") {
        played.then(() => markHeard(true)).catch(() => {
          if (typeof onFail === "function") onFail();
          else markHeard(false);
        });
      } else {
        markHeard(true);
      }
      return true;
    } catch {
      if (typeof onFail === "function") onFail();
      return false;
    }
  }

  function playDataUri() {
    if (typeof root.Audio !== "function") return false;
    try {
      if (!fallbackAudio) fallbackAudio = new root.Audio(dataUri());
      fallbackAudio.src = dataUri();
      return startElement(fallbackAudio);
    } catch {
      return false;
    }
  }

  function playWav() {
    const file = bindFileAudio();
    if (file && startElement(file, () => playDataUri())) return true;
    return playDataUri();
  }

  function playOsc(ctx) {
    if (!ctx || ctx.state !== "running") return false;
    const now = ctx.currentTime;
    [784, 988, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      const start = now + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.28);
    });
    return true;
  }

  function unlock() {
    const AC = root.AudioContext || root.webkitAudioContext;
    if (AC) {
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    }
    bindFileAudio();
    return audioCtx;
  }

  function pulse() {
    const btn = root.document?.getElementById("qr-sound-toggle");
    if (!btn) return;
    btn.classList.add("is-sounding");
    root.setTimeout?.(() => btn.classList.remove("is-sounding"), 900);
  }

  function playTone(opts = {}) {
    if (!soundOn()) return false;
    const force = opts.force === true;
    const nowMs = Date.now();
    if (!force && nowMs - lastPlayAt < 800) return false;
    lastPlayAt = nowMs;
    const ctx = unlock();
    const wavOk = playWav();
    if (ctx && ctx.state === "running") playOsc(ctx);
    else if (ctx && ctx.state === "suspended") ctx.resume().then(() => playOsc(ctx)).catch(() => {});
    pulse();
    return wavOk || Boolean(ctx);
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
    playWav,
    needsUnlock,
    isArmed: () => heard,
    markHeard,
    desktopNotify,
    askNotifyPermission,
    SOUND_KEY,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
