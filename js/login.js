const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const card = document.getElementById("auth-card");
const lead = document.getElementById("auth-lead");

document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach((t) => {
      const on = t === tab;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    const signup = tab.dataset.panel === "signup";
    loginForm.hidden = signup;
    signupForm.hidden = !signup;
    card.classList.toggle("signup", signup);
    lead.textContent = signup ? "Start billing in minutes — 2-day free trial, no card." : "Sign in to continue.";
  });
});

if (new URLSearchParams(location.search).get("tab") === "signup" || location.hash === "#signup") {
  document.querySelector('[data-panel="signup"]')?.click();
}

(() => {
  const saved = localStorage.getItem("pos_remember_login");
  if (!saved) return;
  const input = loginForm.querySelector('[name="identifier"]');
  const box = loginForm.querySelector('[name="remember"]');
  if (input) input.value = saved;
  if (box) box.checked = true;
})();

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const hint = document.getElementById("hint");
  const fd = new FormData(e.target);
  hint.className = "hint";
  hint.textContent = "Signing in…";
  try {
    const { res, data } = await posRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        identifier: fd.get("identifier"),
        password: fd.get("password"),
        remember: Boolean(fd.get("remember")),
      }),
    });
    if (!res.ok) throw new Error(data.error || "Login failed");
    if (data.expired) {
      hint.textContent = "Subscription expired. You can view the renewal message after opening the dashboard.";
    }
    if (fd.get("remember")) localStorage.setItem("pos_remember_login", String(fd.get("identifier") || ""));
    else localStorage.removeItem("pos_remember_login");
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

function categoriesForSignupType(type) {
  const t = String(type || "").trim();
  if (t === "Restaurant" || t === "Cafe" || t === "Bakery") return ["Food & beverage"];
  if (t === "Grocery") return ["Kirana / FMCG", "Supermarket", "General trade"];
  if (t === "Pharmacy") return ["Medical"];
  if (t === "Electronics") return ["Mobile & electronics"];
  if (t === "Fashion") {
    return ["Apparel", "Garments", "Clothing", "Boutique", "Saree Shop", "Ladies Fashion", "Mens Fashion", "Kids Fashion"];
  }
  if (t === "Footwear") return ["Footwear"];
  return null;
}

function fillSignupCategory(form) {
  const typeSel = form?.querySelector('[name="businessType"]');
  const catSel = form?.querySelector('[name="businessCategory"]');
  if (!typeSel || !catSel) return;
  const all = [...catSel.options].map((o) => o.value).filter(Boolean);
  if (!catSel.dataset.allCategories) catSel.dataset.allCategories = all.join("\n");
  const source = catSel.dataset.allCategories.split("\n").filter(Boolean);
  const list = categoriesForSignupType(typeSel.value) || source;
  const cur = catSel.value;
  const want = list.includes(cur) ? cur : list.length === 1 ? list[0] : "";
  catSel.innerHTML = `<option value="">Select category</option>${list.map((v) => `<option>${v}</option>`).join("")}`;
  if (want) catSel.value = want;
}

fillSignupCategory(signupForm);
signupForm.querySelector('[name="businessType"]')?.addEventListener("change", () => fillSignupCategory(signupForm));

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
    const { res, data } = await posRequest("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(data.error || "Could not create business");
    location.href = "/";
  } catch (err) {
    hint.textContent = err.message;
    hint.className = "hint error";
  } finally {
    btn.disabled = false;
  }
});

posRequest("/api/support-contact")
  .then(({ data: s }) => {
    const el = document.getElementById("login-support");
    if (!el) return;
    const html = window.SupportPage?.loginHtml(s) || "";
    if (!html) return;
    el.innerHTML = html;
    el.hidden = false;
  })
  .catch(() => {});
