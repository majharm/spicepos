(function (root, factory) {
  const api = factory();
  root.POSCameraScan = api;
  if (typeof window !== "undefined") window.POSCameraScan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FORMATS = ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "codabar", "itf"];
  const HOLD_GAP_MS = 1200;
  let modal = null;
  let video = null;
  let hint = null;
  let resultEl = null;
  let missingEl = null;
  let stream = null;
  let detector = null;
  let rafId = 0;
  let scanning = false;
  let lastCode = "";
  let lastAt = 0;
  let armed = true;
  let clearFrames = 0;
  let generation = 0;
  let onScanCb = null;
  let onErrorCb = null;
  let onCreateCb = null;
  let onAssignCb = null;
  let keepOpen = false;
  let audioCtx = null;

  function hasCameraApi() {
    return Boolean(
      typeof navigator !== "undefined"
      && navigator.mediaDevices
      && typeof navigator.mediaDevices.getUserMedia === "function",
    );
  }

  function hasBarcodeDetector() {
    return typeof BarcodeDetector === "function";
  }

  function isSupported() {
    return hasCameraApi() && hasBarcodeDetector();
  }

  function ensureModal() {
    if (modal) return;
    modal = document.createElement("div");
    modal.className = "camera-scan-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="camera-scan-sheet" role="dialog" aria-modal="true" aria-labelledby="camera-scan-title">
        <div class="camera-scan-head">
          <strong class="camera-scan-title" id="camera-scan-title">Scan barcode</strong>
          <button type="button" class="camera-scan-close" aria-label="Close camera">×</button>
        </div>
        <div class="camera-scan-viewport">
          <video class="camera-scan-video" playsinline muted autoplay></video>
          <div class="camera-scan-frame" aria-hidden="true"></div>
        </div>
        <p class="camera-scan-hint" aria-live="polite">Point the camera at a barcode</p>
        <p class="camera-scan-result" hidden></p>
        <div class="camera-scan-missing" hidden>
          <button type="button" class="btn primary camera-scan-create">Create product</button>
          <button type="button" class="btn camera-scan-assign">Assign barcode</button>
        </div>
        <div class="camera-scan-actions">
          <button type="button" class="btn primary camera-scan-start">Start Camera</button>
          <button type="button" class="btn camera-scan-stop">Stop Camera</button>
          <button type="button" class="btn camera-scan-dismiss">Close</button>
        </div>
        <form class="camera-scan-manual">
          <input class="camera-scan-manual-code" maxlength="64" autocomplete="off" inputmode="text" placeholder="Type barcode and press Enter" aria-label="Manual barcode" />
          <button type="submit" class="btn">Use barcode</button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    video = modal.querySelector(".camera-scan-video");
    hint = modal.querySelector(".camera-scan-hint");
    resultEl = modal.querySelector(".camera-scan-result");
    missingEl = modal.querySelector(".camera-scan-missing");
    modal.querySelector(".camera-scan-close")?.addEventListener("click", () => close());
    modal.querySelector(".camera-scan-dismiss")?.addEventListener("click", () => close());
    modal.querySelector(".camera-scan-start")?.addEventListener("click", () => {
      void startCamera();
    });
    modal.querySelector(".camera-scan-stop")?.addEventListener("click", () => stopCamera());
    modal.querySelector(".camera-scan-create")?.addEventListener("click", () => {
      if (onCreateCb) onCreateCb(lastCode);
    });
    modal.querySelector(".camera-scan-assign")?.addEventListener("click", () => {
      if (onAssignCb) onAssignCb(lastCode);
    });
    modal.querySelector(".camera-scan-manual")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = modal.querySelector(".camera-scan-manual-code");
      const code = String(input?.value || "").trim();
      if (!code) return;
      if (input) input.value = "";
      void deliver(code);
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = [...modal.querySelectorAll("button, input, select, textarea")].filter((el) => !el.disabled && !el.closest("[hidden]"));
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
    paintCameraButtons();
  }

  async function createDetector() {
    if (!hasBarcodeDetector()) return null;
    try {
      return new BarcodeDetector({ formats: FORMATS });
    } catch {
      try {
        return new BarcodeDetector();
      } catch {
        return null;
      }
    }
  }

  function stopStream() {
    generation += 1;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    scanning = false;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
    if (video) video.srcObject = null;
    paintCameraButtons();
  }

  function setHint(text) {
    if (hint) hint.textContent = text || "Point the camera at a barcode";
  }

  function setTitle(text) {
    const title = modal?.querySelector(".camera-scan-title");
    if (title) title.textContent = text || "Scan barcode";
  }

  function paintCameraButtons() {
    const start = modal?.querySelector(".camera-scan-start");
    const stop = modal?.querySelector(".camera-scan-stop");
    if (start) start.disabled = scanning;
    if (stop) stop.disabled = !scanning;
  }

  function beep(ok) {
    const Ctx = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!Ctx) return;
    try {
      audioCtx = audioCtx || new Ctx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = ok ? 880 : 220;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch {
      /* autoplay or audio policy */
    }
  }

  function flash(ok) {
    const frame = modal?.querySelector(".camera-scan-frame");
    const sheet = modal?.querySelector(".camera-scan-sheet");
    frame?.classList.toggle("is-hit", Boolean(ok));
    frame?.classList.toggle("is-miss", ok === false);
    sheet?.classList.toggle("is-hit", Boolean(ok));
    sheet?.classList.toggle("is-miss", ok === false);
    clearTimeout(flash._t);
    flash._t = setTimeout(() => {
      frame?.classList.remove("is-hit", "is-miss");
      sheet?.classList.remove("is-hit", "is-miss");
    }, 700);
  }

  function confirm(result) {
    const ok = result === true || result?.ok === true;
    const missing = Boolean(result?.missing);
    const text = typeof result === "string"
      ? result
      : (result?.text || (ok ? (keepOpen ? `Found: ${lastCode} — scan next or tap ×` : `Found: ${lastCode}`) : "Product Not Found"));
    setHint(text);
    if (resultEl) {
      resultEl.hidden = false;
      resultEl.textContent = text;
      resultEl.className = ok ? "camera-scan-result is-hit" : "camera-scan-result is-miss";
    }
    if (missingEl) missingEl.hidden = !missing;
    beep(ok);
    flash(ok);
    return result;
  }

  async function deliver(code) {
    const cleaned = String(code || "").trim();
    if (!cleaned || !onScanCb) return false;
    lastCode = cleaned;
    lastAt = Date.now();
    setHint(keepOpen ? `Found: ${cleaned} — scan next or tap ×` : `Found: ${cleaned}`);
    let result;
    try {
      result = await onScanCb(cleaned);
    } catch (err) {
      result = { ok: false, text: err?.message || "Could not use that barcode" };
    }
    if (result && typeof result === "object") return confirm(result);
    return confirm({
      ok: result !== false,
      text: result === false
        ? (hint?.textContent || "Could not use that barcode")
        : (keepOpen ? `Found: ${cleaned} — scan next or tap ×` : `Found: ${cleaned}`),
    });
  }

  async function scanLoop(gen) {
    if (gen !== generation || !scanning || !video || !detector) return;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      rafId = requestAnimationFrame(() => scanLoop(gen));
      return;
    }
    let fired = "";
    try {
      const codes = await detector.detect(video);
      if (gen !== generation || !scanning) return;
      const hit = codes.find((c) => c?.rawValue);
      if (hit?.rawValue) {
        clearFrames = 0;
        const code = String(hit.rawValue).trim();
        const now = Date.now();
        const held = code === lastCode && !armed;
        if (!held && code && (code !== lastCode || now - lastAt > HOLD_GAP_MS)) {
          armed = false;
          fired = code;
        }
      } else {
        clearFrames += 1;
        if (clearFrames >= 12) armed = true;
      }
    } catch {
      /* keep scanning */
    }
    if (gen !== generation) return;
    if (fired) {
      scanning = false;
      paintCameraButtons();
      await deliver(fired);
      if (gen !== generation) return;
      if (!keepOpen) {
        close();
        return;
      }
      if (stream && modal && !modal.hidden) {
        scanning = true;
        paintCameraButtons();
      } else {
        return;
      }
    }
    if (gen !== generation || !scanning) return;
    rafId = requestAnimationFrame(() => scanLoop(gen));
  }

  async function startCamera() {
    if (!modal || scanning) return true;
    if (!isSupported()) {
      const msg = hasCameraApi()
        ? "Camera scan needs Chrome or a browser with barcode detection. Type the barcode below."
        : "Camera is not available on this device. Type the barcode below.";
      setHint(msg);
      if (typeof onErrorCb === "function") onErrorCb(new Error(msg));
      modal.querySelector(".camera-scan-manual-code")?.focus();
      return false;
    }
    stopStream();
    const gen = generation;
    setHint("Starting camera…");
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      const abandon = () => {
        for (const track of nextStream.getTracks()) track.stop();
        if (stream === nextStream) {
          stream = null;
          if (video) video.srcObject = null;
        }
      };
      if (gen !== generation) {
        abandon();
        return false;
      }
      stream = nextStream;
      detector = detector || await createDetector();
      if (gen !== generation) {
        abandon();
        return false;
      }
      if (!detector) throw new Error("Barcode detection is not supported.");
      video.srcObject = stream;
      await video.play();
      if (gen !== generation) {
        abandon();
        return false;
      }
      scanning = true;
      armed = true;
      clearFrames = 0;
      paintCameraButtons();
      setHint("Point the camera at a barcode");
      rafId = requestAnimationFrame(() => scanLoop(gen));
      return true;
    } catch (err) {
      stopStream();
      const msg = err?.name === "NotAllowedError"
        ? "Camera permission denied. Allow camera access in browser settings."
        : (err?.message || "Could not open camera.");
      setHint(msg);
      if (resultEl) {
        resultEl.hidden = false;
        resultEl.textContent = msg;
        resultEl.className = "camera-scan-result is-miss";
      }
      if (typeof onErrorCb === "function") onErrorCb(new Error(msg));
      modal.querySelector(".camera-scan-manual-code")?.focus();
      return false;
    }
  }

  function stopCamera() {
    stopStream();
    if (modal && !modal.hidden) setHint("Camera stopped. Start Camera, or type a barcode.");
  }

  async function open(opts) {
    onScanCb = typeof opts?.onScan === "function" ? opts.onScan : null;
    onErrorCb = typeof opts?.onError === "function" ? opts.onError : null;
    onCreateCb = typeof opts?.onCreate === "function" ? opts.onCreate : null;
    onAssignCb = typeof opts?.onAssign === "function" ? opts.onAssign : null;
    keepOpen = Boolean(opts?.keepOpen);
    ensureModal();
    stopStream();
    detector = null;
    lastCode = "";
    lastAt = 0;
    armed = true;
    clearFrames = 0;
    setTitle(opts?.title || (keepOpen ? "Scan barcodes" : "Scan barcode"));
    setHint("Point the camera at a barcode, or type it below.");
    if (resultEl) {
      resultEl.hidden = true;
      resultEl.textContent = "";
      resultEl.className = "camera-scan-result";
    }
    if (missingEl) missingEl.hidden = true;
    const manual = modal.querySelector(".camera-scan-manual-code");
    if (manual) manual.value = "";
    modal.hidden = false;
    document.body.classList.add("camera-scan-open");
    const started = opts?.autoStart === false ? false : await startCamera();
    if (!started) modal.querySelector(".camera-scan-manual-code")?.focus();
    else modal.querySelector(".camera-scan-stop")?.focus();
    return true;
  }

  function close() {
    stopStream();
    detector = null;
    if (modal) modal.hidden = true;
    document.body.classList.remove("camera-scan-open");
    onScanCb = null;
    onErrorCb = null;
    onCreateCb = null;
    onAssignCb = null;
    keepOpen = false;
    lastCode = "";
    lastAt = 0;
    armed = true;
    clearFrames = 0;
  }

  function bindButton(btn, opts) {
    if (!btn) return;
    const show = Boolean(opts?.alwaysShow) || isSupported();
    btn.hidden = !show;
    if (btn.dataset.cameraBound === "1") return;
    btn.dataset.cameraBound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      void open(opts);
    });
  }

  return {
    isSupported,
    open,
    close,
    confirm,
    startCamera,
    stopCamera,
    bindButton,
  };
});
