(function () {
  const STORAGE = "pos_api_spec_v2";
  const LOGIN_URLS = [
    "/pos-api.php?p=auth/login",
    "/api/auth/login",
    "/api/auth/login/",
    "/pos-data/auth/login",
    "/atavpos-rpc.json?p=auth/login",
  ];

  function restPath(apiPath) {
    const raw = String(apiPath || "");
    const q = raw.indexOf("?");
    const path = (q === -1 ? raw : raw.slice(0, q)).replace(/^\/api\/?/, "");
    const extra = q === -1 ? "" : raw.slice(q + 1);
    return { path, extra };
  }

  function saveLoginSpec(url) {
    let spec = null;
    if (String(url).includes("pos-api.php")) spec = { mode: "rpc", base: "/pos-api.php" };
    else if (String(url).includes("atavpos-rpc.json")) spec = { mode: "rpc", base: "/atavpos-rpc.json" };
    else if (String(url).includes("/pos-data/")) spec = { mode: "prefix", base: "/pos-data" };
    else if (String(url).includes("/api/")) spec = { mode: "prefix", base: "/api" };
    if (!spec) return;
    const raw = JSON.stringify(spec);
    try {
      sessionStorage.setItem(STORAGE, raw);
      localStorage.setItem(STORAGE, raw);
    } catch {
      /* ignore */
    }
  }

  function specUrl(spec, apiPath) {
    const { path, extra } = restPath(apiPath);
    if (!spec || !spec.mode || !spec.base) return "";
    if (spec.mode === "rpc") {
      return `${spec.base}?p=${encodeURIComponent(path)}${extra ? `&${extra}` : ""}`;
    }
    const base = String(spec.base).replace(/\/$/, "");
    return extra ? `${base}/${path}?${extra}` : `${base}/${path}`;
  }

  function candidateUrls(apiPath) {
    const { path, extra } = restPath(apiPath);
    const p = extra ? `${path}?${extra}` : path;
    const urls = [
      `/pos-api.php?p=${encodeURIComponent(path)}${extra ? `&${extra}` : ""}`,
      `/api/${p}`,
      `/api/${path}/`,
      `/pos-data/${p}`,
      `/atavpos-rpc.json?p=${encodeURIComponent(path)}${extra ? `&${extra}` : ""}`,
    ];
    try {
      const spec = JSON.parse(sessionStorage.getItem(STORAGE) || localStorage.getItem(STORAGE) || "null");
      const preferred = specUrl(spec, apiPath);
      if (preferred) urls.unshift(preferred);
    } catch {
      /* ignore */
    }
    return urls;
  }

  function looksJson(text) {
    const t = String(text || "").trim();
    return t.startsWith("{") || t.startsWith("[");
  }

  function deadBridge(data) {
    if (!data || typeof data !== "object") return false;
    if (data.bridge === "down") return true;
    return /not listening|not reachable from PHP|Could not reach POS Node/i.test(String(data.error || ""));
  }

  window.posRequest = async function posRequest(apiPath, options = {}) {
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
    const { path } = restPath(apiPath);
    headers["X-Pos-Path"] = path.split("?")[0];
    let last = "";
    let lastJsonErr = "";
    for (const url of candidateUrls(apiPath)) {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : 0;
      try {
        const res = await fetch(url, {
          credentials: "same-origin",
          cache: "no-store",
          ...options,
          headers,
          signal: options.signal || (ctrl ? ctrl.signal : undefined),
        });
        const text = await res.text();
        last = text;
        if (!looksJson(text)) continue;
        const data = text ? JSON.parse(text) : {};
        if (deadBridge(data)) {
          lastJsonErr = data.error || lastJsonErr;
          continue;
        }
        saveLoginSpec(url);
        return { res, data, text };
      } catch {
        /* next */
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    throw new Error(
      lastJsonErr ||
        (String(last || "").trim().startsWith("<")
          ? "Sign-in did not reach Node.js. Open /pos-api.php?p=health. In hPanel the domain must be a Node.js web app (Express, server.js), then Restart."
          : "Could not reach the POS API. In hPanel start the Node.js web app (entry server.js) on this domain."),
    );
  };

  window.posUrl = function posUrl(apiPath) {
    const { path, extra } = restPath(apiPath);
    return extra ? `/api/${path}?${extra}` : `/api/${path}`;
  };

  function categoriesForSignupType(type) {
    const t = String(type || "").trim();
    if (t === "Restaurant") return ["Food & beverage", "Bar & Lounge"];
    if (t === "Cafe" || t === "Bakery") return ["Food & beverage"];
    if (t === "Bar") return ["Bar & Lounge"];
    if (t === "Grocery") return ["Kirana / FMCG", "Supermarket", "General trade"];
    if (t === "Pharmacy") return ["Medical"];
    if (t === "Electronics") return ["Mobile & electronics"];
    if (t === "Fashion") return ["Apparel", "Garments", "Clothing", "Boutique", "Saree Shop", "Ladies Fashion", "Mens Fashion", "Kids Fashion"];
    if (t === "Footwear") return ["Footwear"];
    if (t === "Services") return ["Services", "Salon / spa", "Repair", "Consultancy"];
    if (t === "Printing Business") return ["Flex & Printing"];
    if (t === "Resort") return ["Resort & Restaurant with Room Booking"];
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

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function showSubscriptionAlert(data) {
    const box = document.getElementById("subscription-alert");
    if (!box || !data) return;
    const title = document.getElementById("subscription-alert-title");
    const message = document.getElementById("subscription-alert-message");
    const facts = document.getElementById("subscription-alert-facts");
    const renew = document.getElementById("subscription-renew");
    const panel = document.getElementById("subscription-renew-panel");
    const copy = document.getElementById("subscription-renew-copy");
    if (title) title.textContent = data.title || "Subscription Expired!";
    if (message) message.textContent = data.error || data.message || "";
    const exp = String(data.business?.subscription_expires_at || "").slice(0, 10);
    const plan = data.plan || null;
    const bits = [];
    if (data.business?.name) bits.push(`<div><dt>Business</dt><dd>${escapeHtml(data.business.name)}</dd></div>`);
    if (exp) bits.push(`<div><dt>Expiry date</dt><dd>${escapeHtml(exp)}</dd></div>`);
    if (plan?.name) {
      const fee = plan.fee_monthly != null && plan.fee_monthly !== "" ? ` · ₹${plan.fee_monthly} / year` : "";
      bits.push(`<div><dt>Renewal plan</dt><dd>${escapeHtml(String(plan.name) + fee)}</dd></div>`);
    }
    if (facts) facts.innerHTML = bits.join("");
    if (renew) {
      renew.hidden = data.code !== "subscription_expired";
      renew.onclick = () => {
        if (!panel) return;
        panel.hidden = false;
        const fee = plan?.name
          ? `Plan ${plan.name}${plan.fee_monthly != null && plan.fee_monthly !== "" ? ` is ₹${plan.fee_monthly} / year` : ""}. `
          : "";
        if (copy) {
          copy.textContent = `${fee}Contact ATAV support to renew. The same business account works again after the subscription is updated on the server.`;
        }
      };
    }
    const support = document.getElementById("subscription-support");
    if (support) {
      support.onclick = () => {
        const el = document.getElementById("login-support");
        if (!el) return;
        el.hidden = false;
        el.scrollIntoView({ block: "nearest" });
      };
    }
    if (panel) panel.hidden = true;
    box.hidden = false;
    box.scrollIntoView({ block: "nearest" });
  }

  function readSubscriptionNotice() {
    try {
      const raw = sessionStorage.getItem("pos_subscription_notice");
      if (!raw) return;
      sessionStorage.removeItem("pos_subscription_notice");
      showSubscriptionAlert(JSON.parse(raw));
    } catch {
      try { sessionStorage.removeItem("pos_subscription_notice"); } catch { /* ignore */ }
    }
  }

  function bindShopLogin() {
    const loginForm = document.getElementById("login-form");
    const signupForm = document.getElementById("signup-form");
    const card = document.getElementById("auth-card");
    const lead = document.getElementById("auth-lead");

    const masterForm = document.getElementById("master-login");
    if (masterForm) {
      masterForm.addEventListener(
        "submit",
        async (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          const hint = document.getElementById("login-hint");
          const fd = new FormData(masterForm);
          if (hint) {
            hint.className = "hint";
            hint.textContent = "Signing in…";
          }
          try {
            const { res, data } = await window.posRequest("/api/auth/master-login", {
              method: "POST",
              body: JSON.stringify({
                email: fd.get("email"),
                password: fd.get("password"),
                remember: Boolean(fd.get("remember")),
              }),
            });
            if (!res.ok) throw new Error(data.error || "Login failed");
            if (fd.get("remember")) localStorage.setItem("pos_remember_master", String(fd.get("email") || ""));
            else localStorage.removeItem("pos_remember_master");
            location.reload();
          } catch (err) {
            if (hint) {
              hint.textContent = err.message;
              hint.className = "hint error";
            }
          }
        },
        true,
      );
    }

    readSubscriptionNotice();
    if (!loginForm) return;

    document.querySelectorAll(".auth-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".auth-tab").forEach((t) => {
          const on = t === tab;
          t.classList.toggle("is-active", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });
        const signup = tab.dataset.panel === "signup";
        const forgotPanel = document.getElementById("forgot-panel");
        if (forgotPanel) forgotPanel.hidden = true;
        loginForm.hidden = signup;
        if (signupForm) signupForm.hidden = !signup;
        card?.classList.toggle("signup", signup);
        if (lead) lead.textContent = signup ? "Start billing in minutes — 2-day free trial, no card." : "to access ATAV POS";
        const heading = document.getElementById("auth-heading");
        if (heading) heading.textContent = signup ? "Create your shop" : "Sign in";
      });
    });

    if (new URLSearchParams(location.search).get("tab") === "signup" || location.hash === "#signup") {
      document.querySelector('[data-panel="signup"]')?.click();
    }

    const saved = localStorage.getItem("pos_remember_login");
    if (saved) {
      const input = loginForm.querySelector('[name="identifier"]');
      const box = loginForm.querySelector('[name="remember"]');
      if (input) input.value = saved;
      if (box) box.checked = true;
    }

    const pass = loginForm.querySelector('[name="password"]');
    const passToggle = document.getElementById("login-pass-toggle");
    if (pass && passToggle) {
      passToggle.addEventListener("click", () => {
        const show = pass.type === "password";
        pass.type = show ? "text" : "password";
        passToggle.textContent = show ? "Hide" : "Show";
        passToggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
      });
    }

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const hint = document.getElementById("hint");
      const submit = document.getElementById("login-submit");
      const fd = new FormData(loginForm);
      if (hint) {
        hint.className = "hint";
        hint.textContent = "Signing in…";
      }
      if (submit) {
        submit.disabled = true;
        submit.textContent = "Signing in…";
      }
      try {
        const payload = {
          identifier: fd.get("identifier"),
          password: fd.get("password"),
          remember: Boolean(fd.get("remember")),
        };
        let result = null;
        for (const url of LOGIN_URLS) {
          try {
            const res = await fetch(url, {
              method: "POST",
              credentials: "same-origin",
              cache: "no-store",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                "X-Pos-Path": "auth/login",
              },
              body: JSON.stringify(payload),
            });
            const text = await res.text();
            if (!looksJson(text)) continue;
            const data = JSON.parse(text);
            if (deadBridge(data)) continue;
            result = { res, data };
            break;
          } catch {
            /* try next URL */
          }
        }
        if (!result) {
          result = await window.posRequest("/api/auth/login", {
            method: "POST",
            body: JSON.stringify(payload),
          });
        }
        if (!result.res.ok) {
          if (String(result.data?.code || "").startsWith("subscription_")) {
            showSubscriptionAlert(result.data);
            if (fd.get("remember")) localStorage.setItem("pos_remember_login", String(fd.get("identifier") || ""));
            if (hint) {
              hint.textContent = "";
              hint.className = "hint";
            }
            if (submit) {
              submit.disabled = false;
              submit.textContent = "Sign in";
            }
            return;
          }
          throw new Error(result.data.error || "Login failed");
        }
        if (fd.get("remember")) localStorage.setItem("pos_remember_login", String(fd.get("identifier") || ""));
        else localStorage.removeItem("pos_remember_login");
        location.href = "/index.html";
      } catch (err) {
        if (hint) {
          hint.textContent = err.message;
          hint.className = "hint error";
        }
        if (submit) {
          submit.disabled = false;
          submit.textContent = "Sign in";
        }
      }
    }, true);

    if (signupForm) {
      fillSignupCategory(signupForm);
      const typeSel = signupForm.querySelector('[name="businessType"]');
      const catSel = signupForm.querySelector('[name="businessCategory"]');
      const syncCats = () => fillSignupCategory(signupForm);
      typeSel?.addEventListener("change", syncCats);
      typeSel?.addEventListener("input", syncCats);
      catSel?.addEventListener("focus", syncCats);
      catSel?.addEventListener("mousedown", syncCats);
      signupForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        const hint = document.getElementById("signup-hint");
        const fd = new FormData(signupForm);
        const payload = Object.fromEntries(fd);
        delete payload.logo;
        const btn = signupForm.querySelector("button[type=submit]");
        if (hint) {
          hint.className = "hint";
          hint.textContent = "Creating your business…";
        }
        if (btn) btn.disabled = true;
        try {
          if (payload.password !== payload.confirmPassword) {
            throw new Error("Password and confirm password do not match");
          }
          const file = fd.get("logo");
          payload.logoDataUrl = "";
          if (file && file.size) {
            payload.logoDataUrl = await new Promise((resolve, reject) => {
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
          const { res, data } = await window.posRequest("/api/auth/signup", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error(data.error || "Could not create business");
          location.href = "/index.html";
        } catch (err) {
          if (hint) {
            hint.textContent = err.message;
            hint.className = "hint error";
          }
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    }

    const forgotPanel = document.getElementById("forgot-panel");
    const forgotHint = document.getElementById("forgot-hint");

    function showForgotHint(message, isError) {
      if (!forgotHint) return;
      forgotHint.textContent = message || "";
      forgotHint.className = isError ? "hint error" : "hint";
    }

    function openForgotPanel() {
      if (!forgotPanel) return;
      const idInput = document.getElementById("forgot-id");
      const loginId = document.getElementById("login-identifier");
      if (idInput && loginId && !idInput.value) idInput.value = loginId.value || "";
      forgotPanel.hidden = false;
      loginForm.hidden = true;
      if (signupForm) signupForm.hidden = true;
      idInput?.focus();
      forgotPanel.scrollIntoView({ block: "nearest" });
    }

    function closeForgotPanel() {
      if (forgotPanel) forgotPanel.hidden = true;
      loginForm.hidden = false;
      document.getElementById("login-identifier")?.focus();
    }

    document.querySelector(".auth-forgot")?.addEventListener("click", (e) => {
      const href = String(e.currentTarget.getAttribute("href") || "");
      if (/^https?:\/\//i.test(href)) return;
      e.preventDefault();
      openForgotPanel();
    });

    document.getElementById("forgot-back")?.addEventListener("click", () => {
      closeForgotPanel();
    });

    forgotPanel?.addEventListener("submit", (e) => {
      e.preventDefault();
      document.getElementById("forgot-save")?.click();
    });

    document.getElementById("forgot-send")?.addEventListener("click", async () => {
      const btn = document.getElementById("forgot-send");
      const identifier = String(document.getElementById("forgot-id")?.value || "").trim();
      if (!identifier) {
        showForgotHint("Enter the email, username, or mobile on the account.", true);
        return;
      }
      if (btn) btn.disabled = true;
      showForgotHint("Sending a sign-in code…", false);
      try {
        const { res, data } = await window.posRequest("/api/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ identifier }),
        });
        if (!res.ok) throw new Error(data.error || "Could not send a sign-in code");
        showForgotHint(data.message || "Check your email for the code.", false);
        document.getElementById("forgot-code")?.focus();
      } catch (err) {
        showForgotHint(err.message, true);
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    document.getElementById("forgot-save")?.addEventListener("click", async () => {
      const btn = document.getElementById("forgot-save");
      const identifier = String(document.getElementById("forgot-id")?.value || "").trim();
      const code = String(document.getElementById("forgot-code")?.value || "").replace(/\D/g, "");
      const password = String(document.getElementById("forgot-next")?.value || "");
      const confirm = String(document.getElementById("forgot-confirm")?.value || "");
      if (!identifier || code.length !== 6) {
        showForgotHint("Enter the account and the 6-digit code from the email.", true);
        return;
      }
      if (password.length < 8) {
        showForgotHint("Password must be 8+ characters", true);
        return;
      }
      if (password !== confirm) {
        showForgotHint("New password and confirm password do not match.", true);
        return;
      }
      if (btn) btn.disabled = true;
      showForgotHint("Saving the new password…", false);
      try {
        const { res, data } = await window.posRequest("/api/auth/forgot-password/confirm", {
          method: "POST",
          body: JSON.stringify({ identifier, code, password }),
        });
        if (!res.ok) throw new Error(data.error || "Could not save the password");
        const nextPass = document.getElementById("login-password");
        const loginId = document.getElementById("login-identifier");
        if (loginId) loginId.value = identifier;
        if (nextPass) nextPass.value = "";
        closeForgotPanel();
        const hint = document.getElementById("hint");
        if (hint) {
          hint.className = "hint";
          hint.textContent = data.message || "Password saved. Sign in with the new password.";
        }
      } catch (err) {
        showForgotHint(err.message, true);
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    window.posRequest("/api/support-contact")
      .then(({ data: s }) => {
        const html = window.SupportPage?.loginHtml(s) || "";
        if (!html) return;
        const el = document.getElementById("login-support");
        const help = document.getElementById("forgot-help");
        if (el) {
          el.innerHTML = html;
          el.hidden = false;
        }
        if (help) {
          help.innerHTML = html;
          help.hidden = false;
        }
      })
      .catch(() => {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindShopLogin);
  } else {
    bindShopLogin();
  }
})();
