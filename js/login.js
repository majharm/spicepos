const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const card = document.getElementById("auth-card");
const lead = document.getElementById("auth-lead");

document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    const signup = tab.dataset.panel === "signup";
    loginForm.hidden = signup;
    signupForm.hidden = !signup;
    card.classList.toggle("signup", signup);
    lead.textContent = signup ? "Register your business to start billing." : "Sign in to continue.";
  });
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const hint = document.getElementById("hint");
  const fd = new FormData(e.target);
  hint.className = "hint";
  hint.textContent = "Signing in…";
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: fd.get("identifier"),
        password: fd.get("password"),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    if (data.expired) {
      hint.textContent = "Subscription expired. You can view the renewal message after opening the dashboard.";
    }
    location.href = "/";
  } catch (err) {
    hint.textContent = err.message;
    hint.className = "hint error";
  }
});

function readLogo(file) {
  if (!file || !file.size) return Promise.resolve("");
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const max = 280;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read logo"));
    };
    img.src = url;
  });
}

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const hint = document.getElementById("signup-hint");
  const fd = new FormData(signupForm);
  const payload = Object.fromEntries(fd);
  delete payload.logo;
  hint.className = "hint";
  hint.textContent = "Creating your business…";
  const btn = signupForm.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    if (payload.password !== payload.confirmPassword) {
      throw new Error("Password and confirm password do not match");
    }
    payload.logoDataUrl = await readLogo(fd.get("logo"));
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not create business");
    location.href = "/";
  } catch (err) {
    hint.textContent = err.message;
    hint.className = "hint error";
  } finally {
    btn.disabled = false;
  }
});

fetch("/api/support-contact")
  .then((r) => r.json())
  .then((s) => {
    if (!s.support_phone) return;
    const el = document.getElementById("login-support");
    const tel = String(s.support_phone).replaceAll(/[^\d+]/g, "");
    el.innerHTML = `Support <a href="tel:${tel}">${s.support_phone}</a>`;
  })
  .catch(() => {});
