(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const nav = $(".m-nav");
  $(".m-burger")?.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    $(".m-burger").setAttribute("aria-expanded", open ? "true" : "false");
  });
  $$(".m-menu a, .m-cta a").forEach((a) => a.addEventListener("click", () => nav.classList.remove("open")));

  const slider = $("[data-hero-slider]");
  if (slider) {
    const track = $("[data-hero-track]", slider);
    const slides = $$("[data-hero-slide]", slider);
    const dotsWrap = $("[data-hero-dots]", slider);
    let i = 0;
    let timer = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    slides.forEach((_, n) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", `Show slide ${n + 1}`);
      b.addEventListener("click", () => go(n, true));
      dotsWrap.appendChild(b);
    });
    function go(n, user) {
      i = (n + slides.length) % slides.length;
      track.style.transform = `translateX(-${i * 100}%)`;
      $$("[data-hero-dots] button", slider).forEach((d, di) => d.classList.toggle("is-on", di === i));
      slides.forEach((s, si) => s.classList.toggle("is-on", si === i));
      if (user) restart();
    }
    function next() { go(i + 1); }
    function restart() {
      if (reduce) return;
      clearInterval(timer);
      timer = setInterval(next, 5200);
    }
    $("[data-hero-prev]", slider)?.addEventListener("click", () => go(i - 1, true));
    $("[data-hero-next]", slider)?.addEventListener("click", () => go(i + 1, true));
    slider.addEventListener("mouseenter", () => clearInterval(timer));
    slider.addEventListener("mouseleave", restart);
    slider.addEventListener("focusin", () => clearInterval(timer));
    slider.addEventListener("focusout", restart);
    slider.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") go(i - 1, true);
      if (e.key === "ArrowRight") go(i + 1, true);
    });
    go(0);
    restart();
  }

  const copy = {
    retail: { title: "Retail", hero: "Retail counter", body: "Fast billing, barcodes, stock, offers, and multi-counter sales for shops of every size.", bits: ["Billing", "Barcode", "Stock", "Offers", "Customers", "Reports"], widgets: "Today’s sales · Fast movers · GST bills · Offers applied", flow: "Scan → Bill → Pay → Stock ↓ → Loyalty" },
    pharmacy: { title: "Pharmacy", hero: "Pharmacy Rx desk", body: "Bill medicines with batch, expiry, prescriptions, suppliers, and regulated stock alerts.", bits: ["Billing", "Batch", "Expiry", "Prescription", "Supplier", "Stock", "Customer", "Reports"], widgets: "Near-expiry · Batch pick · Rx queue · Low stock", flow: "Scan medicine → Batch/expiry → Rx → Bill → Stock" },
    restaurant: { title: "Restaurant", hero: "Floor + kitchen", body: "Counter POS, KOT, tables, QR ordering, kitchen status, and delivery in one floor flow.", bits: ["POS", "KOT", "Tables", "QR ordering", "Kitchen", "Delivery"], widgets: "Open tables · KOT tickets · QR orders · Delivery", flow: "Table/QR → KOT → Kitchen → Serve → Bill" },
    salon: { title: "Salon & Spa", hero: "Appointment book", body: "Appointments, services, packages, staff commission, memberships, and billing.", bits: ["Appointments", "Services", "Packages", "Staff", "Customers", "Membership", "Commission", "Billing"], widgets: "Today’s bookings · Staff load · Packages · Commission", flow: "Book → Service → Package/membership → Pay → Repeat" },
    garment: { title: "Garment", hero: "Size & colour stock", body: "Size and colour variants, barcodes, returns, exchanges, and inventory by style.", bits: ["Size", "Colour", "Variants", "Barcode", "Stock", "Returns", "Exchange", "Customer"], widgets: "Variant matrix · Barcode · Returns · Slow movers", flow: "Pick size/colour → Scan → Bill → Exchange/return" },
    grocery: { title: "Grocery", hero: "Kirana + scale", body: "Weighing scale, packs, GST, purchases, and fast kirana-style billing.", bits: ["Scale", "Packs", "GST", "Purchase", "Low stock", "Offers"], widgets: "Live weight · Packs · Low stock · Daily sales", flow: "Weigh → Rate → Cart → Pay → Stock" },
    dairy: { title: "Dairy", hero: "Perishable stock", body: "Weight-based selling, batches, routes, and daily stock for perishable goods.", bits: ["Weight", "Batches", "Stock", "Customers", "Reports"], widgets: "Morning stock · Routes · Weight bills · Returns", flow: "Receive → Weigh/batch → Bill routes → Close day" },
    wholesale: { title: "Wholesale", hero: "B2B invoices", body: "B2B rates, GSTIN customers, bulk billing, payables, and branch stock.", bits: ["B2B rates", "GSTIN", "Bulk bills", "Payables", "Branches"], widgets: "GSTIN parties · Bulk qty · Payables · Branch stock", flow: "Quote → Bulk bill → Ledger → Dispatch → Collect" },
  };

  function paintSolution(key) {
    const d = copy[key];
    if (!d) return;
    $("#sol-title").textContent = d.title;
    $("#sol-body").textContent = d.body;
    $("#sol-bits").innerHTML = d.bits.map((x) => `<li>${x}</li>`).join("");
    if ($("#sol-hero")) $("#sol-hero").textContent = d.hero;
    if ($("#sol-widgets")) $("#sol-widgets").textContent = d.widgets;
    if ($("#sol-flow")) $("#sol-flow").textContent = d.flow;
  }

  $$("[data-sol-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("[data-sol-tab]").forEach((b) => b.classList.toggle("is-on", b === btn));
      paintSolution(btn.dataset.solTab);
    });
  });

  $$(".branch-list button").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".branch-list button").forEach((b) => b.classList.toggle("is-on", b === btn));
    });
  });

  $$("[data-report-range]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("[data-report-range]").forEach((b) => b.classList.toggle("is-on", b === btn));
      const range = btn.dataset.reportRange;
      if ($("#report-title")) $("#report-title").textContent = `Sales · ${range}`;
    });
  });

  function num(id, fallback) {
    const n = Number($(id)?.value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }
  function paintCalc() {
    const bills = num("#c-bills", 80);
    const mins = num("#c-mins", 3);
    const staff = num("#c-staff", 2);
    const branches = num("#c-branches", 1);
    const month = num("#c-month", bills * 26);
    const savedMin = Math.max(0.4, mins - 0.8);
    const hours = Math.round((bills * savedMin * 26) / 60);
    const records = month * branches;
    $("#c-hours").textContent = `${hours} hours / month`;
    $("#c-manual").textContent = `${Math.min(70, Math.round((savedMin / Math.max(mins, 0.1)) * 100))}% less waiting at the counter`;
    $("#c-tx").textContent = `${records.toLocaleString("en-IN")} transactions in view`;
    $("#c-cust").textContent = `${Math.round(month * 0.35).toLocaleString("en-IN")} customer records you can reuse`;
    $("#c-vis").textContent = `${staff * branches} staff seats · ${branches} branch${branches === 1 ? "" : "es"} on one dashboard`;
  }
  ["#c-bills", "#c-mins", "#c-staff", "#c-branches", "#c-month"].forEach((id) => $(id)?.addEventListener("input", paintCalc));
  paintCalc();

  $("#contact-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const lines = [
      `Name: ${fd.get("name") || ""}`,
      `Mobile: ${fd.get("mobile") || ""}`,
      `Email: ${fd.get("email") || ""}`,
      `Business type: ${fd.get("type") || ""}`,
      "",
      String(fd.get("message") || ""),
    ];
    const href = `mailto:svginfo@atavtelecom.in?subject=${encodeURIComponent("ATAV POS enquiry")}&body=${encodeURIComponent(lines.join("\n"))}`;
    window.location.href = href;
  });
})();
