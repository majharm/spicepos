(function () {
  const shopKey = new URLSearchParams(location.search).get("shop") || "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  const state = { shop: null, file: null };

  function fileToPayload(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const raw = String(reader.result || "");
        const mime = file.type || (String(file.name).toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
        resolve({
          file_name: file.name || "prescription",
          mime,
          file_base64: raw.replace(/^data:[^;]+;base64,/, ""),
        });
      };
      reader.onerror = () => reject(new Error("Could not read that file"));
      reader.readAsDataURL(file);
    });
  }

  function showFile(file) {
    state.file = file;
    $("file-name").textContent = file ? file.name : "No file chosen";
    const preview = $("file-preview");
    if (file && String(file.type || "").startsWith("image/")) {
      preview.src = URL.createObjectURL(file);
      preview.hidden = false;
    } else {
      preview.removeAttribute("src");
      preview.hidden = true;
    }
  }

  async function loadShop() {
    if (!shopKey) throw new Error("This QR link is incomplete. Ask the pharmacy for a new QR.");
    const res = await fetch(`/api/rx/shop?shop=${encodeURIComponent(shopKey)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not open this pharmacy");
    state.shop = data.shop;
    document.title = `Upload prescription · ${data.shop.name}`;
    $("shop-name").textContent = data.shop.name;
    $("shop-address").textContent = [data.shop.address, data.shop.phone].filter(Boolean).join(" · ");
    if (data.shop.logo_url) {
      $("shop-logo").src = data.shop.logo_url;
      $("shop-logo").hidden = false;
    }
    $("rx-form").hidden = false;
  }

  document.querySelectorAll("[data-pick]").forEach((btn) => {
    btn.addEventListener("click", () => $(btn.dataset.pick)?.click());
  });
  ["rx-camera", "rx-gallery", "rx-pdf"].forEach((id) => {
    $(id)?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) showFile(file);
    });
  });

  let sending = false;
  $("rx-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    const formEl = event.currentTarget;
    const hint = $("rx-hint");
    const button = formEl.querySelector("button[type=submit]");
    if (!state.file) {
      hint.textContent = "Upload a camera photo, gallery image, or PDF";
      return;
    }
    sending = true;
    if (button) button.disabled = true;
    hint.textContent = "Sending prescription…";
    try {
      const form = new FormData(formEl);
      const file = await fileToPayload(state.file);
      const res = await fetch("/api/rx/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          shop: shopKey,
          customer_name: form.get("customer_name"),
          mobile: form.get("mobile"),
          customer_address: form.get("customer_address"),
          doctor_name: form.get("doctor_name"),
          clinic_name: form.get("clinic_name"),
          notes: form.get("notes"),
          ...file,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not submit the prescription");
      $("rx-form").hidden = true;
      $("success-number").textContent = data.prescription?.prescription_number || "";
      $("success-copy").textContent =
        data.message || "Prescription submitted successfully. Pharmacy will review it and contact you.";
      $("rx-success").hidden = false;
      formEl.reset();
      showFile(null);
      hint.textContent = "";
    } catch (err) {
      hint.textContent = err.message;
    } finally {
      sending = false;
      if (button) button.disabled = false;
    }
  });

  $("rx-again").addEventListener("click", () => {
    $("rx-success").hidden = true;
    $("rx-form").hidden = false;
  });

  loadShop().catch((err) => {
    $("shop-name").textContent = "Pharmacy unavailable";
    $("rx-error").hidden = false;
    $("rx-error").textContent = esc(err.message);
  });
})();
