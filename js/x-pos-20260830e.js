(function () {
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

  function candidateUrls(apiPath) {
    const { path, extra } = restPath(apiPath);
    const q = extra ? `?${extra}` : "";
    const p = extra ? `${path}?${extra}` : path;
    return [
      `/pos-api.php?p=${encodeURIComponent(path)}${extra ? `&${extra}` : ""}`,
      `/api/${p}`,
      `/api/${path}/`,
      `/pos-data/${p}`,
      `/atavpos-rpc.json?p=${encodeURIComponent(path)}${extra ? `&${extra}` : ""}`,
    ];
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
      try {
        const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options, headers });
        const text = await res.text();
        last = text;
        if (!looksJson(text)) continue;
        const data = text ? JSON.parse(text) : {};
        if (deadBridge(data)) {
          lastJsonErr = data.error || lastJsonErr;
          continue;
        }
        return { res, data, text };
      } catch {
        /* next */
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

    if (!loginForm) return;

    document.querySelectorAll(".auth-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("is-active"));
        tab.classList.add("is-active");
        const signup = tab.dataset.panel === "signup";
        loginForm.hidden = signup;
        if (signupForm) signupForm.hidden = !signup;
        card?.classList.toggle("signup", signup);
        if (lead) lead.textContent = signup ? "Register your business to start billing." : "Sign in to continue.";
      });
    });

    const saved = localStorage.getItem("pos_remember_login");
    if (saved) {
      const input = loginForm.querySelector('[name="identifier"]');
      const box = loginForm.querySelector('[name="remember"]');
      if (input) input.value = saved;
      if (box) box.checked = true;
    }

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const hint = document.getElementById("hint");
      const fd = new FormData(loginForm);
      if (hint) {
        hint.className = "hint";
        hint.textContent = "Signing in…";
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
        if (!result.res.ok) throw new Error(result.data.error || "Login failed");
        if (result.data.expired && hint) {
          hint.textContent = "Subscription expired. You can view the renewal message after opening the dashboard.";
        }
        if (fd.get("remember")) localStorage.setItem("pos_remember_login", String(fd.get("identifier") || ""));
        else localStorage.removeItem("pos_remember_login");
        location.href = "/";
      } catch (err) {
        if (hint) {
          hint.textContent = err.message;
          hint.className = "hint error";
        }
      }
    }, true);

    if (signupForm) {
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
          location.href = "/";
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

    window.posRequest("/api/support-contact")
      .then(({ data: s }) => {
        const el = document.getElementById("login-support");
        if (!el) return;
        const html = window.SupportPage?.loginHtml(s) || "";
        if (!html) return;
        el.innerHTML = html;
        el.hidden = false;
      })
      .catch(() => {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindShopLogin);
  } else {
    bindShopLogin();
  }
})();
