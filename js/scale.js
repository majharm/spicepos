(function (root, factory) {
  const api = factory();
  root.POSScale = api;
  if (typeof window !== "undefined") window.POSScale = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const BAUD = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];
  const STORAGE = "pos-scale";
  const UART_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
  const UART_RX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
  const WEIGHT_SERVICE = 0x181d;
  const WEIGHT_MEASURE = 0x2a9d;

  let port = null;
  let reader = null;
  let reading = false;
  let bleDevice = null;
  let last = null;
  let listeners = [];
  let wedgeBuf = "";
  let wedgeAt = 0;

  function roundGrams(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return 0;
    return Math.min(1000000000, Math.round(v));
  }

  function kgToGrams(kg) {
    return roundGrams(Number(kg) * 1000);
  }

  function gramsToKg(g) {
    return (Number(g) || 0) / 1000;
  }

  function looksLikeWeight(raw) {
    const s = String(raw || "").trim();
    if (!s || s.length > 48) return false;
    if (/^\d{8,}$/.test(s)) return false;
    return Boolean(parseWeight(s));
  }

  function parseWeight(raw, prefer) {
    const text = String(raw || "").replace(/\u0000/g, " ").trim();
    if (!text) return null;
    const unitPref = String(prefer || "").toLowerCase();
    const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const hit = parseWeightLine(lines[i], unitPref);
      if (hit) return hit;
    }
    return parseWeightLine(text.replace(/\s+/g, " "), unitPref);
  }

  function parseWeightLine(line, unitPref) {
    let s = String(line || "").trim();
    if (!s) return null;
    if (/^(OL|I\s*S|US,OL)/i.test(s)) return null;
    const stable = !/\bUS\b/i.test(s) && !/\bunstable\b/i.test(s);
    s = s.replace(/^(ST|US|GS|NT|TR)[, ]+/ig, "").replace(/^[SW]\s+/i, "");
    s = s.replace(/^[+\-]\s*/, (m) => (m.includes("-") ? "-" : ""));
    const kg = s.match(/(-?\d+(?:[.,]\d+)?)\s*(kg|kgs|kilogram|kilograms)\b/i);
    if (kg) {
      const n = Number(String(kg[1]).replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) return null;
      const grams = kgToGrams(n);
      return grams ? { grams, kg: gramsToKg(grams), unit: "kg", stable, raw: line } : null;
    }
    const gm = s.match(/(-?\d+(?:[.,]\d+)?)\s*(g|gm|grm|gram|grams)\b/i);
    if (gm) {
      const n = Number(String(gm[1]).replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) return null;
      const grams = roundGrams(n);
      return grams ? { grams, kg: gramsToKg(grams), unit: "g", stable, raw: line } : null;
    }
    const num = s.match(/(-?\d+(?:[.,]\d+)?)/);
    if (!num) return null;
    const n = Number(String(num[1]).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return null;
    if (unitPref === "g" || unitPref === "gm") {
      const grams = roundGrams(n);
      return grams ? { grams, kg: gramsToKg(grams), unit: "g", stable, raw: line } : null;
    }
    if (n > 80 && Number.isInteger(n) && !String(num[1]).includes(".") && !String(num[1]).includes(",")) {
      const grams = roundGrams(n);
      return grams ? { grams, kg: gramsToKg(grams), unit: "g", stable, raw: line } : null;
    }
    if (n > 500) return null;
    const grams = kgToGrams(n);
    return grams ? { grams, kg: gramsToKg(grams), unit: "kg", stable, raw: line } : null;
  }

  function parseBleWeight(dv) {
    if (!dv || dv.byteLength < 3) return null;
    const flags = dv.getUint8(0);
    const imperial = Boolean(flags & 0x01);
    const raw = dv.getUint16(1, true);
    const kg = imperial ? (raw * 0.01) / 2.2046226218 : raw * 0.005;
    const grams = kgToGrams(kg);
    if (!grams) return null;
    return { grams, kg: gramsToKg(grams), unit: "kg", stable: true, raw: `ble:${raw}` };
  }

  function defaultSettings() {
    return {
      enabled: true,
      name: "Weighing scale",
      baud: 9600,
      unit: "kg",
      autoApply: true,
      source: "serial",
      port: "",
      host: "",
      precision: 3,
      allowManual: true,
    };
  }

  function loadSettings(bizId) {
    const key = `${STORAGE}:${bizId || "local"}`;
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
      const parsed = raw ? JSON.parse(raw) : {};
      return { ...defaultSettings(), ...(parsed && typeof parsed === "object" ? parsed : {}) };
    } catch {
      return defaultSettings();
    }
  }

  function logKey(bizId) {
    return `${STORAGE}-log:${bizId || "local"}`;
  }

  function loadLog(bizId) {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(logKey(bizId)) : null;
      const rows = raw ? JSON.parse(raw) : [];
      return Array.isArray(rows) ? rows.slice(0, 40) : [];
    } catch {
      return [];
    }
  }

  function appendLog(bizId, row) {
    const next = [{ at: new Date().toISOString(), ...(row || {}) }, ...loadLog(bizId)].slice(0, 40);
    if (typeof localStorage !== "undefined") localStorage.setItem(logKey(bizId), JSON.stringify(next));
    return next;
  }

  function clearLog(bizId) {
    if (typeof localStorage !== "undefined") localStorage.removeItem(logKey(bizId));
    return [];
  }

  function saveSettings(bizId, next) {
    const cur = { ...loadSettings(bizId), ...(next || {}) };
    if (typeof localStorage !== "undefined") localStorage.setItem(`${STORAGE}:${bizId || "local"}`, JSON.stringify(cur));
    return cur;
  }

  function hasSerial() {
    return Boolean(typeof navigator !== "undefined" && navigator.serial && typeof navigator.serial.requestPort === "function");
  }

  function hasBluetooth() {
    return Boolean(typeof navigator !== "undefined" && navigator.bluetooth && typeof navigator.bluetooth.requestDevice === "function");
  }

  function connected() {
    return Boolean((port && reading) || bleDevice);
  }

  function connectionKind() {
    if (port && reading) return "usb";
    if (bleDevice) return "bluetooth";
    return "";
  }

  function current() {
    return last;
  }

  function currentGrams() {
    const g = Number(last?.grams) || 0;
    if (g <= 0) return 0;
    if (Date.now() - Number(last.at || 0) > 8000) return 0;
    return g;
  }

  function onWeight(fn) {
    if (typeof fn === "function") listeners.push(fn);
    return () => {
      listeners = listeners.filter((x) => x !== fn);
    };
  }

  function emit(hit) {
    if (!hit?.grams) return null;
    last = { ...hit, at: Date.now() };
    listeners.forEach((fn) => {
      try {
        fn(last);
      } catch {
        /* ignore listener errors */
      }
    });
    return last;
  }

  function ingest(text, prefer) {
    const hit = parseWeight(text, prefer);
    return hit ? emit(hit) : null;
  }

  function ingestWedgeKey(e, prefer) {
    const now = Date.now();
    if (now - wedgeAt > 120) wedgeBuf = "";
    wedgeAt = now;
    const key = e?.key;
    if (key === "Enter") {
      const hit = ingest(wedgeBuf, prefer);
      wedgeBuf = "";
      return hit;
    }
    if (key && key.length === 1) wedgeBuf += key;
    return null;
  }

  async function readSerialLoop(prefer) {
    const dec = new TextDecoder();
    let buf = "";
    reading = true;
    try {
      while (port && port.readable && reading) {
        reader = port.readable.getReader();
        try {
          while (reading) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const parts = buf.split(/\r\n|\n|\r/);
            buf = parts.pop() || "";
            for (const part of parts) ingest(part, prefer);
            if (buf.length > 80) {
              ingest(buf, prefer);
              buf = "";
            }
          }
        } finally {
          try {
            reader.releaseLock();
          } catch {
            /* already released */
          }
          reader = null;
        }
      }
    } catch {
      reading = false;
    }
  }

  async function connectSerial(opts) {
    if (!hasSerial()) throw new Error("Use Chrome or Edge on this computer to connect a USB / RS-232 scale.");
    const baud = Number(opts?.baud) || 9600;
    const prefer = opts?.unit || "kg";
    await disconnect();
    const picked = await navigator.serial.requestPort();
    await picked.open({ baudRate: baud, dataBits: 8, stopBits: 1, parity: "none" });
    port = picked;
    readSerialLoop(prefer);
    return { source: "serial", baud };
  }

  async function connectBluetooth(opts) {
    if (!hasBluetooth()) throw new Error("This browser cannot open a Bluetooth scale.");
    const prefer = opts?.unit || "kg";
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [UART_SERVICE, WEIGHT_SERVICE],
    });
    await disconnect();
    bleDevice = device;
    const server = await device.gatt.connect();
    try {
      const weight = await server.getPrimaryService(WEIGHT_SERVICE);
      const ch = await weight.getCharacteristic(WEIGHT_MEASURE);
      await ch.startNotifications();
      ch.addEventListener("characteristicvaluechanged", (ev) => {
        const hit = parseBleWeight(ev.target.value);
        if (hit) emit(hit);
      });
      return { source: "bluetooth", mode: "weight-scale" };
    } catch {
      const uart = await server.getPrimaryService(UART_SERVICE);
      const rx = await uart.getCharacteristic(UART_RX);
      await rx.startNotifications();
      const dec = new TextDecoder();
      rx.addEventListener("characteristicvaluechanged", (ev) => {
        ingest(dec.decode(ev.target.value), prefer);
      });
      return { source: "bluetooth", mode: "uart" };
    }
  }

  async function connectNetwork({ url, unit } = {}) {
    const u = String(url || "").trim();
    if (!/^https?:\/\//i.test(u)) throw new Error("Enter an http(s) address for a network scale");
    const ctrl = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined;
    const res = await fetch(u, { signal: ctrl, cache: "no-store" });
    const text = await res.text();
    const hit = ingest(text, unit);
    if (!hit) throw new Error("Network scale did not return a readable weight");
    return hit;
  }

  async function disconnect() {
    reading = false;
    try {
      await reader?.cancel();
    } catch {
      /* ignore */
    }
    reader = null;
    try {
      await port?.close();
    } catch {
      /* ignore */
    }
    port = null;
    try {
      bleDevice?.gatt?.disconnect();
    } catch {
      /* ignore */
    }
    bleDevice = null;
  }

  return {
    BAUD,
    parseWeight,
    parseBleWeight,
    looksLikeWeight,
    kgToGrams,
    gramsToKg,
    loadSettings,
    saveSettings,
    loadLog,
    appendLog,
    clearLog,
    hasSerial,
    hasBluetooth,
    connected,
    connectionKind,
    current,
    currentGrams,
    onWeight,
    ingest,
    ingestWedgeKey,
    connectSerial,
    connectBluetooth,
    connectNetwork,
    disconnect,
  };
});
