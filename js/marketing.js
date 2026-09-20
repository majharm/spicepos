(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const openNav = () => {
    document.body.classList.add("nav-open");
    $(".scrim").hidden = false;
  };
  const closeNav = () => {
    document.body.classList.remove("nav-open");
    $(".scrim").hidden = true;
  };
  $$("[data-open-nav]").forEach((b) => b.addEventListener("click", openNav));
  $$("[data-close-nav]").forEach((b) => b.addEventListener("click", closeNav));
  $$(".drawer a").forEach((a) => a.addEventListener("click", closeNav));

  const BUSINESS_TYPES = [
    "Grocery & Retail",
    "Pharmacy & Medical",
    "Restaurant & Cafe",
    "Garment & Fashion",
    "Jewellery & Accessories",
    "Electronics & Mobile",
    "Salon & Spa",
    "Service Center & Repair",
  ];
  const FEATURES = [
    "Easy Billing (Touch / Keyboard / Barcode)",
    "Inventory & Stock Management",
    "Customer Management & Loyalty",
  ];
  const TESTIMONIALS = [
    { name: "Imran Shaikh", biz: "Grocery Store, Pune" },
    { name: "Sneha Patil", biz: "Cafe Corner, Pune" },
    { name: "Ravi More", biz: "Fashion Store, Pune" },
  ];
  const HERO_SLIDES = 4;
  void BUSINESS_TYPES;
  void FEATURES;
  void TESTIMONIALS;
  void HERO_SLIDES;

  const slider = $("[data-hero-slider]");
  if (slider) {
    const track = $("[data-hero-track]", slider);
    const slides = $$(".hero-slide", slider);
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
      if (user) restart();
    }
    function restart() {
      if (reduce) return;
      clearInterval(timer);
      timer = setInterval(() => go(i + 1), 5200);
    }
    $("[data-hero-prev]", slider)?.addEventListener("click", () => go(i - 1, true));
    $("[data-hero-next]", slider)?.addEventListener("click", () => go(i + 1, true));
    slider.addEventListener("mouseenter", () => clearInterval(timer));
    slider.addEventListener("mouseleave", restart);
    slider.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") go(i - 1, true);
      if (e.key === "ArrowRight") go(i + 1, true);
    });
    go(0);
    restart();
  }

  const nums = $$("[data-count]");
  if (nums.length) {
    const run = () => {
      nums.forEach((el) => {
        const target = Number(el.dataset.count);
        let n = 0;
        const step = Math.max(1, Math.round(target / 40));
        const t = setInterval(() => {
          n += step;
          if (n >= target) {
            n = target;
            clearInterval(t);
          }
          el.textContent = `${n}+`;
        }, 24);
      });
    };
    const io = new IntersectionObserver((ents) => {
      if (ents.some((e) => e.isIntersecting)) {
        run();
        io.disconnect();
      }
    });
    io.observe(nums[0]);
  }

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
    window.location.href = `mailto:info@atavtelecom.in?subject=${encodeURIComponent("ATAV POS demo request")}&body=${encodeURIComponent(lines.join("\n"))}`;
  });
})();
