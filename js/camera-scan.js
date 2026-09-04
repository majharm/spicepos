(function (root, factory) {
  const api = factory();
  root.POSCameraScan = api;
  if (typeof window !== "undefined") window.POSCameraScan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FORMATS = ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "codabar", "itf"];
  let modal = null;
  let video = null;
  let hint = null;
  let stream = null;
  let detector = null;
  let rafId = 0;
  let scanning = false;
  let lastCode = "";
  let lastAt = 0;
  let onScanCb = null;

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
      <div class="camera-scan-sheet" role="dialog" aria-modal="true" aria-label="Scan barcode">
        <div class="camera-scan-head">
          <strong>Scan barcode</strong>
          <button type="button" class="camera-scan-close" aria-label="Close camera">×</button>
        </div>
        <div class="camera-scan-viewport">
          <video class="camera-scan-video" playsinline muted autoplay></video>
          <div class="camera-scan-frame" aria-hidden="true"></div>
        </div>
        <p class="camera-scan-hint">Point the camera at a barcode</p>
      </div>
    `;
    document.body.appendChild(modal);
    video = modal.querySelector(".camera-scan-video");
    hint = modal.querySelector(".camera-scan-hint");
    modal.querySelector(".camera-scan-close")?.addEventListener("click", () => close());
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
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
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    scanning = false;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
    if (video) {
      video.srcObject = null;
    }
  }

  function setHint(text) {
    if (hint) hint.textContent = text || "Point the camera at a barcode";
  }

  async function scanLoop() {
    if (!scanning || !video || !detector) return;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      rafId = requestAnimationFrame(scanLoop);
      return;
    }
    try {
      const codes = await detector.detect(video);
      const hit = codes.find((c) => c?.rawValue);
      if (hit?.rawValue) {
        const code = String(hit.rawValue).trim();
        const now = Date.now();
        if (code !== lastCode || now - lastAt > 1200) {
          lastCode = code;
          lastAt = now;
          setHint(`Found: ${code}`);
          if (onScanCb) onScanCb(code);
          close();
          return;
        }
      }
    } catch {
      /* keep scanning */
    }
    rafId = requestAnimationFrame(scanLoop);
  }

  async function open(opts) {
    onScanCb = typeof opts?.onScan === "function" ? opts.onScan : null;
    if (!isSupported()) {
      const msg = hasCameraApi()
        ? "Camera scan needs Chrome or a browser with barcode detection."
        : "Camera is not available on this device.";
      if (typeof opts?.onError === "function") opts.onError(new Error(msg));
      else alert(msg);
      return false;
    }
    ensureModal();
    stopStream();
    setHint("Starting camera…");
    modal.hidden = false;
    document.body.classList.add("camera-scan-open");
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      detector = await createDetector();
      if (!detector) throw new Error("Barcode detection is not supported.");
      video.srcObject = stream;
      await video.play();
      scanning = true;
      setHint("Point the camera at a barcode");
      rafId = requestAnimationFrame(scanLoop);
      return true;
    } catch (err) {
      stopStream();
      modal.hidden = true;
      document.body.classList.remove("camera-scan-open");
      const msg = err?.name === "NotAllowedError"
        ? "Camera permission denied. Allow camera access in browser settings."
        : (err?.message || "Could not open camera.");
      if (typeof opts?.onError === "function") opts.onError(new Error(msg));
      else alert(msg);
      return false;
    }
  }

  function close() {
    stopStream();
    if (modal) modal.hidden = true;
    document.body.classList.remove("camera-scan-open");
    onScanCb = null;
    lastCode = "";
    lastAt = 0;
  }

  function bindButton(btn, opts) {
    if (!btn) return;
    const show = isSupported();
    btn.hidden = !show;
    if (!show) return;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      void open(opts);
    });
  }

  return {
    isSupported,
    open,
    close,
    bindButton,
  };
});
