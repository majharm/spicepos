/* Second sign-in step. WhatsApp OTP and the PIN are alternatives. */
(function () {
  const box = document.getElementById("login-verify");
  const loginForm = document.getElementById("login-form");
  if (!box || !loginForm) return;

  const methodsEl = document.getElementById("verify-methods");
  const otpForm = document.getElementById("verify-otp");
  const pinForm = document.getElementById("verify-pin");
  const hint = document.getElementById("verify-hint");
  const wait = document.getElementById("verify-otp-wait");
  const resend = document.getElementById("verify-otp-resend");
  const back = document.getElementById("verify-back");
  const otpLead = document.getElementById("verify-otp-lead");
  let challenge = null;
  let timer = 0;

  function digits(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 6);
  }

  function say(message, bad) {
    if (!hint) return;
    hint.textContent = message || "";
    hint.className = bad ? "hint error" : "hint";
  }

  function device() {
    return window.POSDevice?.payload?.() || {};
  }

  async function post(path, body) {
    const payload = { ...device(), ...body };
    if (window.posRequest) {
      const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined;
      return window.posRequest(path, { method: "POST", body: JSON.stringify(payload), signal });
    }
    const res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  function showMethods() {
    otpForm.hidden = true;
    pinForm.hidden = true;
    methodsEl.hidden = false;
    back.hidden = true;
    say("");
  }

  function setHeading(title, leadText) {
    const heading = document.getElementById("auth-heading");
    const lead = document.getElementById("auth-lead");
    if (heading) heading.textContent = title;
    if (lead) lead.textContent = leadText;
    const hello = document.querySelector("#m-login-hello h2 + p");
    if (hello) hello.textContent = title === "Sign in" ? "Sign in with your credentials" : "Choose WhatsApp OTP or your security PIN";
  }

  function showOtp() {
    methodsEl.hidden = true;
    pinForm.hidden = true;
    otpForm.hidden = false;
    back.hidden = false;
    const masked = challenge?.whatsappMasked ? ` to ${challenge.whatsappMasked}` : "";
    if (otpLead) otpLead.textContent = `Enter the 6-digit code sent${masked}.`;
    document.getElementById("verify-otp-code").focus();
  }

  function showPin() {
    methodsEl.hidden = true;
    otpForm.hidden = true;
    pinForm.hidden = false;
    back.hidden = false;
    document.getElementById("verify-pin-code").focus();
  }

  function paintMethods() {
    methodsEl.innerHTML = "";
    const methods = challenge?.methods || [];
    if (methods.includes("whatsapp")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn primary";
      btn.textContent = "WhatsApp OTP";
      btn.addEventListener("click", () => sendOtp(false));
      methodsEl.appendChild(btn);
    }
    if (methods.includes("pin")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = "6-digit security PIN";
      btn.addEventListener("click", () => {
        say("");
        showPin();
      });
      methodsEl.appendChild(btn);
    }
    if (methods.length === 1 && methods[0] === "pin") showPin();
  }

  function countdown(seconds) {
    window.clearInterval(timer);
    let left = Math.max(0, Number(seconds) || 0);
    const tick = () => {
      if (resend) resend.disabled = left > 0;
      if (wait) wait.textContent = left > 0 ? `Resend code in ${left}s` : "You can resend the code.";
      if (left <= 0) window.clearInterval(timer);
      left -= 1;
    };
    tick();
    timer = window.setInterval(tick, 1000);
  }

  async function sendOtp(isResend) {
    say(isResend ? "Sending a new code…" : "Sending the WhatsApp code…");
    showOtp();
    const { res, data } = await post("/api/auth/otp/send", {
      purpose: "login",
      challengeId: challenge.challengeId,
    });
    if (!res.ok) {
      say(data.error || "Could not send the WhatsApp code. Try again.", true);
      countdown(Number(data.retryAfter) || 0);
      return;
    }
    say("Code sent. It expires in 5 minutes.");
    countdown(Number(data.resendAfter) || 45);
  }

  async function finish(data) {
    if (!data?.ok || data.challenge) {
      say(data?.error || "Verification failed.", true);
      return;
    }
    say("Verified. Opening the dashboard…");
    window.setTimeout(() => {
      location.href = "/index.html";
    }, 400);
  }

  otpForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = digits(document.getElementById("verify-otp-code").value);
    if (code.length !== 6) {
      say("Enter the 6-digit code.", true);
      return;
    }
    say("Checking the code…");
    const { res, data } = await post("/api/auth/otp/verify", { purpose: "login", challengeId: challenge.challengeId, code });
    if (!res.ok) {
      say(data.error || "Verification failed.", true);
      return;
    }
    await finish(data);
  });

  pinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = digits(document.getElementById("verify-pin-code").value);
    if (pin.length !== 6) {
      say("Enter the 6-digit PIN.", true);
      return;
    }
    say("Checking the PIN…");
    const { res, data } = await post("/api/auth/pin/verify", { challengeId: challenge.challengeId, pin });
    if (!res.ok) {
      say(data.error || "Verification failed.", true);
      return;
    }
    await finish(data);
  });

  resend?.addEventListener("click", () => sendOtp(true));
  back?.addEventListener("click", () => {
    if ((challenge?.methods || []).length > 1) showMethods();
    else {
      box.hidden = true;
      loginForm.hidden = false;
      setHeading("Sign in", "to access ATAV POS");
    }
  });

  ["verify-otp-code", "verify-pin-code"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", (e) => {
      e.target.value = digits(e.target.value);
    });
  });

  window.POSLoginVerify = {
    open(data) {
      challenge = data || {};
      loginForm.hidden = true;
      setHeading("Verify it's you", "One more check, then the dashboard opens.");
      const title = document.getElementById("verify-title");
      if (title) title.hidden = true;
      const forgot = document.getElementById("forgot-panel");
      if (forgot) forgot.hidden = true;
      box.hidden = false;
      paintMethods();
      if ((challenge.methods || []).length !== 1 || challenge.methods[0] !== "pin") showMethods();
      if ((challenge.methods || []).length === 1 && challenge.methods[0] === "whatsapp") sendOtp(false);
    },
  };
})();
