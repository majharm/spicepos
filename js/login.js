document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const hint = document.getElementById("hint");
  const fd = new FormData(e.target);
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

fetch("/api/support-contact")
  .then((r) => r.json())
  .then((s) => {
    if (!s.support_phone) return;
    const el = document.getElementById("login-support");
    const tel = String(s.support_phone).replaceAll(/[^\d+]/g, "");
    el.innerHTML = `Support <a href="tel:${tel}">${s.support_phone}</a>`;
  })
  .catch(() => {});
