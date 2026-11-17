/* Business Admin → Settings → Security & Login */
(function () {
  const root = document.getElementById("login-security");
  if (!root) return;
  const hint = document.getElementById("login-security-hint");
  let pinChallenge = "";
  let waChallenge = "";
  let pinPurpose = "pin_setup";
  let pinSet = false;

  function say(message, bad) {
    if (!hint) return;
    hint.textContent = message || "";
    hint.className = bad ? "hint error" : "hint";
  }

  function digits(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 6);
  }

  function device() {
    return window.POSDevice?.payload?.() || {};
  }

  async function call(path, options) {
    const opts = options || {};
    const body = opts.body ? { ...device(), ...JSON.parse(opts.body) } : undefined;
    if (window.posRequest) {
      return window.posRequest(path, { ...opts, body: body ? JSON.stringify(body) : opts.body });
    }
    const res = await fetch(path, {
      method: opts.method || "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  function paint(data) {
    if (!data?.applicable) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    const note = document.getElementById("login-security-note");
    if (note && data.note) note.textContent = data.note;
    const wa = document.getElementById("login-security-wa");
    wa.textContent = data.whatsappVerified
      ? `Verified ${data.whatsappMasked || ""}`
      : "Not verified. Verify this number before OTP login or a PIN.";
    document.getElementById("login-security-otp").checked = Boolean(data.otpLoginEnabled);
    document.getElementById("login-security-otp").disabled = !data.whatsappVerified;
    pinSet = Boolean(data.pinSet);
    document.getElementById("login-security-pin-state").textContent = data.pinSet
      ? "A PIN is set. Changing or resetting it needs a fresh WhatsApp code."
      : "No PIN yet. A WhatsApp code is required before a PIN can be saved or reset.";
    const history = document.getElementById("login-security-history");
    history.replaceChildren();
    const rows = data.history || [];
    if (!rows.length) history.textContent = "No login events yet.";
    rows.forEach((row) => {
      const p = document.createElement("p");
      p.textContent = [row.at, row.event, row.method, row.ip, row.deviceId].filter(Boolean).join(" · ");
      history.appendChild(p);
    });
    const devices = document.getElementById("login-security-devices");
    devices.replaceChildren();
    const list = data.devices || [];
    if (!list.length) devices.textContent = "No devices yet.";
    list.forEach((row) => {
      const line = document.createElement("p");
      const label = document.createElement("span");
      label.textContent = `${row.label || "Browser"} · ${row.active ? "Active" : "Signed out"} · ${row.ip || ""}`;
      line.appendChild(label);
      if (row.deviceId && row.deviceId !== "browser") {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn";
        btn.textContent = "Revoke";
        btn.addEventListener("click", () => revoke(row.deviceId));
        line.appendChild(btn);
      }
      devices.appendChild(line);
    });
  }

  async function load() {
    const { res, data } = await call("/api/auth/security/settings");
    if (!res.ok) {
      if (res.status === 401) return;
      say(data.error || "Could not load security settings.", true);
      return;
    }
    paint(data);
  }

  async function sendCode(purpose, number) {
    const body = { purpose };
    if (number) body.number = number;
    const { res, data } = await call("/api/auth/otp/send", { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) {
      say(data.error || "Could not send the WhatsApp code. Try again.", true);
      return "";
    }
    say("Code sent. It expires in 5 minutes.");
    return data.challengeId || "";
  }

  async function revoke(deviceId) {
    const { res, data } = await call("/api/auth/session/revoke", {
      method: "POST",
      body: JSON.stringify({ deviceId }),
    });
    if (!res.ok) {
      say(data.error || "Could not revoke that device.", true);
      return;
    }
    if (data.signedOut) {
      location.href = "/login.html";
      return;
    }
    say("Device session revoked.");
    load();
  }

  document.getElementById("login-security-wa-send")?.addEventListener("click", async () => {
    waChallenge = await sendCode("verify_number", document.getElementById("login-security-number").value);
  });

  document.getElementById("login-security-wa-verify")?.addEventListener("click", async () => {
    const code = digits(document.getElementById("login-security-wa-code").value);
    if (!waChallenge || code.length !== 6) {
      say("Send a code, then enter the 6 digits.", true);
      return;
    }
    const { res, data } = await call("/api/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ purpose: "verify_number", challengeId: waChallenge, code }),
    });
    if (!res.ok) {
      say(data.error || "Verification failed.", true);
      return;
    }
    say("WhatsApp number verified.");
    waChallenge = "";
    load();
  });

  document.getElementById("login-security-otp-save")?.addEventListener("click", async () => {
    const { res, data } = await call("/api/auth/security/settings", {
      method: "POST",
      body: JSON.stringify({ otpLoginEnabled: document.getElementById("login-security-otp").checked }),
    });
    if (!res.ok) {
      say(data.error || "Could not save OTP login.", true);
      return;
    }
    say("OTP login saved.");
    paint(data);
  });

  document.getElementById("login-security-pin-send")?.addEventListener("click", async () => {
    pinPurpose = pinSet ? "pin_reset" : "pin_setup";
    pinChallenge = await sendCode(pinPurpose);
  });

  async function savePin(purpose) {
    const pin = digits(document.getElementById("login-security-pin").value);
    const confirm = digits(document.getElementById("login-security-pin-confirm").value);
    const code = digits(document.getElementById("login-security-pin-code").value);
    if (!pinChallenge || code.length !== 6) {
      say("Send a WhatsApp code before saving the PIN.", true);
      return;
    }
    if (pin.length !== 6 || pin !== confirm) {
      say("Enter the same 6-digit PIN twice.", true);
      return;
    }
    const { res, data } = await call(purpose === "pin_reset" ? "/api/auth/pin/reset" : "/api/auth/pin/setup", {
      method: "POST",
      body: JSON.stringify({ pin, confirm, code, challengeId: pinChallenge }),
    });
    if (!res.ok) {
      say(data.error || "Verification failed.", true);
      return;
    }
    document.getElementById("login-security-pin").value = "";
    document.getElementById("login-security-pin-confirm").value = "";
    document.getElementById("login-security-pin-code").value = "";
    pinChallenge = "";
    say(purpose === "pin_reset" ? "PIN reset." : "PIN saved.");
    load();
  }

  document.getElementById("login-security-pin-save")?.addEventListener("click", () => savePin(pinPurpose));
  document.getElementById("login-security-pin-reset")?.addEventListener("click", async () => {
    pinPurpose = "pin_reset";
    pinChallenge = await sendCode("pin_reset");
    if (pinChallenge) say("Enter the WhatsApp code and a new PIN, then press Save PIN.");
  });

  document.querySelectorAll('[data-settings-tab="security"]').forEach((btn) => {
    btn.addEventListener("click", () => load());
  });
  if (document.querySelector(".settings-side") && !document.querySelector(".settings-side").hidden) load();
})();
