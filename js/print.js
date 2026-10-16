(function (root, factory) {
  const api = factory();
  root.POSPrint = api;
  if (typeof window !== "undefined") window.POSPrint = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PRODUCTS = [
    "Flex",
    "Banner",
    "Vinyl",
    "Sunboard",
    "Poster",
    "Sticker",
    "Canvas",
    "Hoarding",
    "Photo",
    "ACP",
    "One-Way Vision",
    "Visiting Card",
    "Brochure",
    "Other Custom Print",
  ];

  const PRINT_SIDES = [
    { id: "single", label: "Single Side" },
    { id: "double", label: "Double Side" },
  ];

  const SQFT_PER_SQM = 10.7639;
  const SQIN_PER_SQFT = 144;
  const SQFT_PER_SQYD = 9;
  const SQCM_PER_SQFT = 929.0304;
  const SQMM_PER_SQFT = 92903.04;
  const IN_PER_M = 39.37007874;

  const UNITS = [
    { id: "ft", label: "Feet", toSqFt: 1 },
    { id: "in", label: "Inches", toSqFt: 1 / SQIN_PER_SQFT },
    { id: "m", label: "Meters", toSqFt: SQFT_PER_SQM },
    { id: "cm", label: "Centimeters", toSqFt: 1 / 929.0304 },
    { id: "mm", label: "Millimeters", toSqFt: 1 / SQMM_PER_SQFT },
    { id: "yd", label: "Yards", toSqFt: SQFT_PER_SQYD },
    { id: "px", label: "Pixels", toSqFt: 0 },
    { id: "sqft", label: "Square Feet", toSqFt: 1 },
    { id: "custom", label: "Custom", toSqFt: 0 },
  ];

  const COUNTER_DIM_UNITS = [
    { id: "ft", label: "ft" },
    { id: "in", label: "in" },
    { id: "m", label: "m" },
    { id: "cm", label: "cm" },
    { id: "mm", label: "mm" },
    { id: "yd", label: "yd" },
    { id: "custom", label: "custom" },
  ];

  const PRINT_BILL_UNITS = [
    { id: "SQFT", label: "Sq. Ft.", dim: "ft" },
    { id: "SQM", label: "Sq. Meter", dim: "m" },
    { id: "SQIN", label: "Inch", dim: "in" },
    { id: "SQYD", label: "Sq. Yard", dim: "yd" },
    { id: "SQCM", label: "Sq. Cm", dim: "cm" },
    { id: "SQMM", label: "Sq. Mm", dim: "mm" },
    { id: "CUSTOM", label: "Custom Unit", dim: "custom" },
  ];

  const DPIS = [72, 96, 150, 200, 300];

  const ALLOWED_TYPES = ["pdf", "jpg", "jpeg", "png", "svg", "ai", "eps", "cdr"];

  const PRICE_MODELS = [
    { id: "sqft", label: "Per Sq Ft" },
    { id: "piece", label: "Per Piece" },
    { id: "size", label: "Per Size" },
    { id: "custom", label: "Custom Pricing" },
  ];

  const DEFAULT_MATERIALS = [
    { id: "frontlit", name: "Frontlit Flex", price_model: "sqft", rate: 18, gst_rate: 18, active: 1 },
    { id: "backlit", name: "Backlit Flex", price_model: "sqft", rate: 35, gst_rate: 18, active: 1 },
    { id: "vinyl", name: "Vinyl", price_model: "sqft", rate: 30, gst_rate: 18, active: 1 },
    { id: "sunboard", name: "Sunboard", price_model: "sqft", rate: 45, gst_rate: 18, active: 1 },
    { id: "canvas", name: "Canvas", price_model: "sqft", rate: 80, gst_rate: 18, active: 1 },
    { id: "acp", name: "ACP", price_model: "sqft", rate: 120, gst_rate: 18, active: 1 },
    { id: "poster", name: "Poster Paper", price_model: "sqft", rate: 12, gst_rate: 18, active: 1 },
    { id: "sticker", name: "Sticker Vinyl", price_model: "sqft", rate: 28, gst_rate: 18, active: 1 },
    { id: "photo", name: "Photo Paper", price_model: "sqft", rate: 40, gst_rate: 18, active: 1 },
    { id: "owv", name: "One-Way Vision", price_model: "sqft", rate: 55, gst_rate: 18, active: 1 },
    { id: "card", name: "Visiting Card", price_model: "piece", rate: 500, pack_qty: 1000, gst_rate: 18, active: 1 },
  ];

  const DEFAULT_FINISHING = [
    { id: "eyelets", name: "Eyelets", rate: 100, unit: "job", gst_rate: 18, active: 1 },
    { id: "pasting", name: "Pasting", rate: 80, unit: "job", gst_rate: 18, active: 1 },
    { id: "folding", name: "Folding", rate: 40, unit: "job", gst_rate: 18, active: 1 },
    { id: "cutting", name: "Cutting", rate: 50, unit: "job", gst_rate: 18, active: 1 },
    { id: "lamination", name: "Lamination", rate: 15, unit: "sqft", gst_rate: 18, active: 1 },
    { id: "pole", name: "Pole Pocket", rate: 60, unit: "job", gst_rate: 18, active: 1 },
    { id: "velcro", name: "Velcro", rate: 70, unit: "job", gst_rate: 18, active: 1 },
    { id: "mounting", name: "Mounting", rate: 90, unit: "job", gst_rate: 18, active: 1 },
    { id: "frame", name: "Frame", rate: 150, unit: "job", gst_rate: 18, active: 1 },
    { id: "install", name: "Installation", rate: 200, unit: "job", gst_rate: 18, active: 1 },
    { id: "delivery", name: "Delivery", rate: 50, unit: "job", gst_rate: 18, active: 1 },
  ];

  const DEFAULT_SETTINGS = {
    max_file_mb: 25,
    allowed_types: ALLOWED_TYPES.slice(),
    min_dpi: 72,
    warn_dpi: 150,
    block_low_res: false,
    customer_approval_required: true,
    gst_rate: 18,
    min_order_amount: 0,
    min_billing_sqft: 0,
    urgent_charge: 0,
    round: "near",
    portal_login_image: "",
  };

  const ORDER_TABS = [
    { id: "new", label: "New", statuses: ["pending_review"] },
    { id: "pending_review", label: "Pending Review", statuses: ["pending_review"] },
    { id: "file_approved", label: "Approved", statuses: ["file_approved"] },
    { id: "quote_sent", label: "Quotation Sent", statuses: ["quote_sent"] },
    { id: "customer_approved", label: "Customer Approved", statuses: ["customer_approved"] },
    { id: "payment_pending", label: "Payment Pending", statuses: ["payment_pending"] },
    { id: "paid", label: "Paid", statuses: ["paid"] },
    { id: "production", label: "Production", statuses: ["production_pending", "printing", "finishing", "quality_check"] },
    { id: "ready", label: "Ready", statuses: ["ready"] },
    { id: "dispatched", label: "Dispatched", statuses: ["dispatched"] },
    { id: "delivered", label: "Delivered", statuses: ["delivered"] },
    { id: "rejected", label: "Rejected", statuses: ["rejected", "file_rejected"] },
    { id: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
  ];

  const STATUSES = [
    { id: "pending_review", label: "Pending Admin Review", customer: "Order Submitted" },
    { id: "file_approved", label: "File Approved", customer: "File Approved" },
    { id: "file_rejected", label: "File Rejected", customer: "File Rejected" },
    { id: "changes_requested", label: "Changes Requested", customer: "Changes Requested" },
    { id: "quote_sent", label: "Quote Sent", customer: "Quote Approved" },
    { id: "customer_approved", label: "Customer Approved", customer: "Quote Approved" },
    { id: "payment_pending", label: "Payment Pending", customer: "Payment Pending" },
    { id: "paid", label: "Paid", customer: "Payment Received" },
    { id: "production_pending", label: "Production Pending", customer: "Production" },
    { id: "printing", label: "Printing", customer: "Printing" },
    { id: "finishing", label: "Finishing", customer: "Finishing" },
    { id: "quality_check", label: "Quality Check", customer: "Quality Check" },
    { id: "ready", label: "Ready", customer: "Ready" },
    { id: "dispatched", label: "Dispatched", customer: "Dispatched" },
    { id: "delivered", label: "Delivered", customer: "Delivered" },
    { id: "rejected", label: "Rejected", customer: "Rejected" },
    { id: "cancelled", label: "Cancelled", customer: "Cancelled" },
  ];

  const PRODUCTION_FLOW = [
    "customer_approved",
    "paid",
    "production_pending",
    "printing",
    "finishing",
    "quality_check",
    "ready",
    "dispatched",
    "delivered",
  ];

  const CUSTOMER_STEPS = [
    { id: "pending_review", label: "Order Submitted" },
    { id: "file_approved", label: "File Approved" },
    { id: "quote_sent", label: "Quote Approved" },
    { id: "paid", label: "Payment Received" },
    { id: "printing", label: "Printing" },
    { id: "finishing", label: "Finishing" },
    { id: "quality_check", label: "Quality Check" },
    { id: "ready", label: "Ready" },
    { id: "delivered", label: "Delivered" },
  ];

  const NOTICE_KINDS = [
    "file_received",
    "file_approved",
    "file_rejected",
    "quote_created",
    "quote_updated",
    "approval_required",
    "payment_received",
    "production_started",
    "printing_completed",
    "order_ready",
    "dispatched",
    "delivered",
  ];

  const REPORTS = [
    { id: "print-sales", title: "Sales" },
    { id: "print-orders", title: "Orders" },
    { id: "print-sqft", title: "Sq Ft Sold" },
    { id: "print-material", title: "Material Usage" },
    { id: "print-material-sales", title: "Material-wise Sales" },
    { id: "print-customers", title: "Customer Sales" },
    { id: "print-quotes", title: "Pending Quotes" },
    { id: "print-dues", title: "Pending Payments" },
    { id: "print-production", title: "Production Status" },
    { id: "print-delivery", title: "Delivery" },
    { id: "print-profit", title: "Profitability" },
  ];

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function round4(n) {
    return Math.round((Number(n) || 0) * 10000) / 10000;
  }

  function clampArea(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return 0;
    return Math.min(1000000000, round4(v));
  }

  function isPrintShop(biz) {
    const type = String(biz?.business_type || "").toLowerCase().trim();
    if (type === "printing business" || type === "printing") return true;
    if (globalThis.POSFootwear?.shopKind?.(biz) === "printing") return true;
    const t = [biz?.category, biz?.business_type, biz?.name].filter(Boolean).join(" ").toLowerCase();
    return /(flex\s*&\s*printing|flex printing|banner printing|vinyl printing|large format|hoarding|sunboard|printing press|\bprinting\b)/.test(t);
  }

  function statusMeta(id) {
    return STATUSES.find((s) => s.id === String(id || "").toLowerCase()) || STATUSES[0];
  }

  function unitMeta(id) {
    const u = String(id || "ft").toLowerCase().trim();
    if (u === "feet" || u === "foot" || u === "ft") return UNITS.find((x) => x.id === "ft");
    if (u === "inches" || u === "inch" || u === "in") return UNITS.find((x) => x.id === "in");
    if (u === "meters" || u === "metres" || u === "meter" || u === "metre" || u === "m") return UNITS.find((x) => x.id === "m");
    if (u === "centimeters" || u === "centimetres" || u === "cm") return UNITS.find((x) => x.id === "cm");
    if (u === "millimeters" || u === "millimetres" || u === "mm") return UNITS.find((x) => x.id === "mm");
    if (u === "yards" || u === "yard" || u === "yd") return UNITS.find((x) => x.id === "yd");
    if (u === "pixels" || u === "pixel" || u === "px") return UNITS.find((x) => x.id === "px");
    if (u === "sq ft" || u === "sqft" || u === "square feet" || u === "square foot") return UNITS.find((x) => x.id === "sqft");
    if (u === "custom" || u === "other" || u === "unt") return UNITS.find((x) => x.id === "custom");
    return UNITS.find((x) => x.id === u) || UNITS[0];
  }

  function billUnitCode(raw) {
    const s = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (["SQM", "SQMETER", "SQMETRE", "M2", "SQMT"].includes(s)) return "SQM";
    if (["SQIN", "SQINCH", "IN2", "INCH", "IN", "INCHES"].includes(s)) return "SQIN";
    if (["SQYD", "SQYARD", "YD2", "SQYARDS", "YARD"].includes(s)) return "SQYD";
    if (["SQCM", "CM2"].includes(s)) return "SQCM";
    if (["SQMM", "MM2"].includes(s)) return "SQMM";
    if (["SQFT", "SQFEET", "SFT", "SQFOOT"].includes(s)) return "SQFT";
    if (["CUSTOM", "UNT", "OTH", "OTHER"].includes(s)) return "CUSTOM";
    return s || "SQFT";
  }

  function billUnitLabel(code, customName) {
    const b = billUnitCode(code);
    if (b === "SQM") return "sqm";
    if (b === "SQIN") return "sqin";
    if (b === "SQYD") return "sqyd";
    if (b === "SQCM") return "sqcm";
    if (b === "SQMM") return "sqmm";
    if (b === "CUSTOM") return String(customName || "unit").trim() || "unit";
    return "sqft";
  }

  function dimUnitId(raw) {
    return unitMeta(raw).id;
  }

  function defaultDimUnit(billUnit) {
    const b = billUnitCode(billUnit);
    if (b === "SQM") return "m";
    if (b === "SQIN") return "in";
    if (b === "SQYD") return "yd";
    if (b === "SQCM") return "cm";
    if (b === "SQMM") return "mm";
    if (b === "CUSTOM") return "custom";
    return "ft";
  }

  function isMatchingPair(dimUnit, billUnit) {
    const d = dimUnitId(dimUnit);
    const b = billUnitCode(billUnit);
    if (b === "CUSTOM" || d === "custom") return true;
    if (b === "SQFT" && d === "ft") return true;
    if (b === "SQM" && d === "m") return true;
    if (b === "SQIN" && d === "in") return true;
    if (b === "SQYD" && d === "yd") return true;
    if (b === "SQCM" && d === "cm") return true;
    if (b === "SQMM" && d === "mm") return true;
    return false;
  }

  function isAreaBillItem(item, biz) {
    if (!item) return false;
    const code = billUnitCode(item.base_unit || item.unit);
    if (["SQFT", "SQM", "SQIN", "SQYD", "SQCM", "SQMM", "CUSTOM"].includes(code)) return true;
    if (String(item.custom_unit || "").trim()) return true;
    const family = String(item.unit_family || "").toLowerCase();
    if (family === "area") return true;
    if (!isPrintShop(biz || {})) return false;
    return /(flex|banner|vinyl|sunboard|hoarding|canvas|acp|sticker|poster|print)/i.test(
      [item.category, item.subcategory, item.name].filter(Boolean).join(" "),
    );
  }

  function pxToInches(px, dpi) {
    const d = Number(dpi) || 150;
    return round2((Number(px) || 0) / d);
  }

  function convertSize(width, height, fromUnit) {
    const u = unitMeta(fromUnit);
    let wIn = Number(width) || 0;
    let hIn = Number(height) || 0;
    if (u.id === "ft") {
      wIn *= 12;
      hIn *= 12;
    } else if (u.id === "m") {
      wIn *= IN_PER_M;
      hIn *= IN_PER_M;
    } else if (u.id === "cm") {
      wIn /= 2.54;
      hIn /= 2.54;
    } else if (u.id === "mm") {
      wIn /= 25.4;
      hIn /= 25.4;
    } else if (u.id === "yd") {
      wIn *= 36;
      hIn *= 36;
    } else if (u.id === "sqft" || u.id === "custom") {
      return {
        inches: { width: 0, height: 0 },
        feet: { width: 0, height: 0 },
        m: { width: 0, height: 0 },
        cm: { width: 0, height: 0 },
        mm: { width: 0, height: 0 },
        sqft: round2(Number(width) || 0),
      };
    }
    const inches = { width: round2(wIn), height: round2(hIn) };
    const feet = { width: round2(wIn / 12), height: round2(hIn / 12) };
    const m = { width: round2(wIn / IN_PER_M), height: round2(hIn / IN_PER_M) };
    const cm = { width: round2(wIn * 2.54), height: round2(hIn * 2.54) };
    const mm = { width: round2(wIn * 25.4), height: round2(hIn * 25.4) };
    const sqft = round2((wIn * hIn) / SQIN_PER_SQFT);
    return { inches, feet, m, cm, mm, sqft };
  }

  function areaSqFt(width, height, unit, dpi) {
    const u = unitMeta(unit);
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    if (u.id === "sqft") return round2(w);
    if (u.id === "custom") return round2(w * h);
    if (u.id === "px") {
      const win = pxToInches(w, dpi);
      const hin = pxToInches(h, dpi);
      return round2((win * hin) / SQIN_PER_SQFT);
    }
    if (u.id === "ft") return round2(w * h);
    if (u.id === "in") return round2((w * h) / SQIN_PER_SQFT);
    if (u.id === "m") return round2(w * h * SQFT_PER_SQM);
    if (u.id === "cm") return round2((w * h) / SQCM_PER_SQFT);
    if (u.id === "mm") return round2((w * h) / SQMM_PER_SQFT);
    if (u.id === "yd") return round2(w * h * SQFT_PER_SQYD);
    return round2(w * h);
  }

  function billedArea(input) {
    const w = Number(input?.width) || 0;
    const h = Number(input?.height) || 0;
    const copies = Math.max(1, Number(input?.copies ?? input?.quantity) || 1);
    const minQty = Math.max(0, Number(input?.minQty ?? input?.min_billing_qty) || 0);
    const dim = dimUnitId(input?.dimUnit ?? input?.unit);
    const bill = billUnitCode(input?.billUnit ?? input?.base_unit);
    const customName = String(input?.customUnit || "").trim();
    let raw = 0;
    if (isMatchingPair(dim, bill)) {
      raw = round4(w * h);
    } else {
      const sqft = areaSqFt(w, h, dim, input?.dpi);
      if (bill === "SQM") raw = round4(sqft / SQFT_PER_SQM);
      else if (bill === "SQIN") raw = round4(sqft * SQIN_PER_SQFT);
      else if (bill === "SQYD") raw = round4(sqft / SQFT_PER_SQYD);
      else if (bill === "SQCM") raw = round4(sqft * SQCM_PER_SQFT);
      else if (bill === "SQMM") raw = round4(sqft * SQMM_PER_SQFT);
      else raw = round4(sqft);
    }
    const total = round4(raw * copies);
    const billed = clampArea(Math.max(total, minQty));
    return {
      rawArea: raw,
      totalArea: total,
      billedArea: billed,
      billUnit: bill,
      billLabel: billUnitLabel(bill, customName),
      dimUnit: dim,
      copies,
      minQty,
    };
  }

  function counterQuote(input) {
    const area = billedArea(input);
    const rate = Number(input?.rate) || 0;
    const itemAmount = round2(area.billedArea * rate);
    const dtype = String(input?.discountType || "amt").toLowerCase() === "pct" ? "pct" : "amt";
    const dval = Number(input?.discountValue) || 0;
    const discount = round2(dtype === "pct" ? (itemAmount * dval) / 100 : dval);
    const taxable = round2(Math.max(0, itemAmount - discount));
    const gstRate = Number(input?.gstRate);
    const gst = round2(taxable * ((Number.isFinite(gstRate) ? gstRate : 0) / 100));
    const extra = round2(Number(input?.extraCharges) || 0);
    const total = round2(taxable + gst + extra);
    return {
      ...area,
      rate,
      itemAmount,
      discount,
      taxable,
      gst,
      gst_rate: Number.isFinite(gstRate) ? gstRate : 0,
      extra,
      total,
      width: Number(input?.width) || 0,
      height: Number(input?.height) || 0,
    };
  }

  function printSizeLabel(width, height, dimUnit, customName) {
    const d = dimUnitId(dimUnit);
    const unit = d === "custom" ? String(customName || "unit") : d;
    return `${Number(width) || 0} × ${Number(height) || 0} ${unit}`;
  }

  function printAreaLabel(area, billUnit, customName) {
    const n = clampArea(area);
    const shown = Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : String(n);
    return `${shown} ${billUnitLabel(billUnit, customName)}`;
  }

  function printLineCaption(input) {
    const area = billedArea(input);
    const size = printSizeLabel(input?.width, input?.height, area.dimUnit, input?.customUnit);
    const copies = area.copies > 1 ? ` × ${area.copies}` : "";
    const file = String(input?.fileName || "").trim();
    const fileBit = file ? ` · ${file}` : "";
    return `${size}${copies} · ${printAreaLabel(area.billedArea, area.billUnit, input?.customUnit)}${fileBit}`.slice(0, 240);
  }

  function decodePrintSpec(raw) {
    const s = String(raw || "");
    const m = s.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ft|in|m|cm|mm|custom|[a-z]+)?/i);
    if (!m) return null;
    return {
      width: Number(m[1]) || 0,
      height: Number(m[2]) || 0,
      dimUnit: dimUnitId(m[3] || "ft"),
    };
  }

  function effectiveDpi(pxW, pxH, printW, printH, printUnit) {
    const conv = convertSize(printW, printH, printUnit);
    const wIn = conv.inches.width;
    const hIn = conv.inches.height;
    if (!wIn || !hIn) return 0;
    return Math.min((Number(pxW) || 0) / wIn, (Number(pxH) || 0) / hIn);
  }

  function qualityWarning(file, size, settings) {
    const min = Number(settings?.warn_dpi ?? DEFAULT_SETTINGS.warn_dpi) || 150;
    const block = Number(settings?.min_dpi ?? DEFAULT_SETTINGS.min_dpi) || 72;
    const pxW = Number(file?.width_px) || 0;
    const pxH = Number(file?.height_px) || 0;
    if (!pxW || !pxH) return { warn: false, block: false, dpi: 0, message: "" };
    const dpi = effectiveDpi(pxW, pxH, size.width, size.height, size.unit);
    const dim = `${size.width} × ${size.height} ${unitMeta(size.unit).label.toLowerCase()}`;
    if (dpi > 0 && dpi < block) {
      return {
        warn: true,
        block: Boolean(settings?.block_low_res),
        dpi: round2(dpi),
        message: `Print Quality Warning. Uploaded image may have low resolution for ${dim} printing.`,
      };
    }
    if (dpi > 0 && dpi < min) {
      return {
        warn: true,
        block: false,
        dpi: round2(dpi),
        message: `Print Quality Warning. Uploaded image may have low resolution for ${dim} printing.`,
      };
    }
    return { warn: false, block: false, dpi: round2(dpi), message: "" };
  }

  function allowedFile(name, mime, settings) {
    const types = (settings?.allowed_types || ALLOWED_TYPES).map((t) => String(t).toLowerCase());
    const ext = String(name || "")
      .split(".")
      .pop()
      .toLowerCase();
    const m = String(mime || "").toLowerCase();
    if (types.includes(ext)) return true;
    if (m.includes("pdf") && types.includes("pdf")) return true;
    if (m.includes("jpeg") && (types.includes("jpg") || types.includes("jpeg"))) return true;
    if (m.includes("png") && types.includes("png")) return true;
    if (m.includes("svg") && types.includes("svg")) return true;
    return false;
  }

  function finishingAmount(option, area, qty) {
    const rate = Number(option?.rate) || 0;
    const unit = String(option?.unit || "job").toLowerCase();
    const q = Math.max(1, Number(qty) || 1);
    if (unit === "sqft") return round2(rate * (Number(area) || 0) * q);
    return round2(rate * q);
  }

  function printAmount(input) {
    const area = areaSqFt(input.width, input.height, input.unit, input.dpi);
    const qty = Math.max(1, Number(input.quantity) || 1);
    const totalArea = round2(area * qty);
    const model = String(input.price_model || input.material?.price_model || "sqft");
    const rate = Number(input.rate ?? input.material?.rate) || 0;
    const minArea = Number(input.min_billing_sqft) || 0;
    const billedArea = Math.max(totalArea, minArea);
    let printing = 0;
    if (model === "piece") {
      const pack = Number(input.material?.pack_qty) || 1;
      printing = round2(rate * (qty / pack));
    } else if (model === "size") {
      printing = round2(rate * qty);
    } else if (model === "custom") {
      printing = round2(Number(input.custom_amount) || 0);
    } else {
      printing = round2(billedArea * rate);
    }
    const sides = String(input.print_type || "single") === "double" ? 2 : 1;
    if (model === "sqft" && sides === 2) printing = round2(printing * 2);
    return { area, totalArea: billedArea, printing, rate, model, qty, sides };
  }

  function quoteTotals(input) {
    const print = printAmount(input);
    const finishRows = (input.finishing || []).map((f) => {
      const amount = finishingAmount(f, print.area, print.qty);
      return { ...f, amount };
    });
    const finishing = round2(finishRows.reduce((s, r) => s + r.amount, 0));
    const delivery = round2(Number(input.delivery ?? input.delivery_amount) || 0);
    const urgent = round2(Number(input.urgent) || 0);
    const other = round2(Number(input.other_charges) || 0);
    const subtotal = round2(print.printing + finishing + delivery + urgent + other);
    const discount = round2(Number(input.discount) || 0);
    const taxable = round2(Math.max(0, subtotal - discount));
    const gstRate = Number(input.gst_rate);
    const gst = round2(taxable * ((Number.isFinite(gstRate) ? gstRate : 18) / 100));
    const total = round2(taxable + gst);
    const paid = round2(Number(input.paid) || 0);
    const minOrder = Number(input.min_order_amount) || 0;
    return {
      ...print,
      finishing,
      finishing_rows: finishRows,
      delivery,
      urgent,
      other,
      subtotal,
      discount,
      taxable,
      gst,
      gst_rate: Number.isFinite(gstRate) ? gstRate : 18,
      total: Math.max(total, minOrder && total < minOrder ? minOrder : total),
      paid,
      balance: round2(Math.max(0, total - paid)),
      pay_status: paid <= 0 ? "pending" : paid + 0.009 >= total ? "paid" : "partial",
    };
  }

  function customerTimeline(status) {
    const cur = String(status || "pending_review");
    const rank = {
      pending_review: 0,
      changes_requested: 0,
      file_rejected: 0,
      rejected: 0,
      cancelled: 0,
      file_approved: 1,
      quote_sent: 2,
      customer_approved: 2,
      payment_pending: 2,
      paid: 3,
      production_pending: 4,
      printing: 4,
      finishing: 5,
      quality_check: 6,
      ready: 7,
      dispatched: 7,
      delivered: 8,
    };
    const idx = rank[cur] ?? 0;
    const failed = ["file_rejected", "rejected", "cancelled"].includes(cur);
    return CUSTOMER_STEPS.map((step, i) => ({
      ...step,
      done: !failed && i < idx,
      current: !failed && i === idx,
      failed: failed && i === 0,
    }));
  }

  function invoiceLines(order, quote) {
    const q = quote || quoteTotals(order);
    const size = `${order.width} × ${order.height} ${unitMeta(order.unit).label}`;
    return {
      customer: order.customer_name,
      order_number: order.order_number,
      file_name: order.file_name,
      product: order.product,
      material: order.material_name,
      width: order.width,
      height: order.height,
      unit: order.unit,
      area_sqft: q.area,
      quantity: q.qty,
      rate: q.rate,
      printing: q.printing,
      finishing: q.finishing,
      delivery: q.delivery,
      discount: q.discount,
      gst: q.gst,
      total: q.total,
      size_label: size,
    };
  }

  function nextOrderNumber(seq, year) {
    const y = Number(year) || new Date().getFullYear();
    const n = String(Number(seq) || 1).padStart(5, "0");
    return `FP-${y}-${n}`;
  }

  function payStatus(paid, total) {
    const p = Number(paid) || 0;
    const t = Number(total) || 0;
    if (p <= 0) return "pending";
    if (p + 0.009 >= t) return "paid";
    return "partial";
  }

  return {
    PRODUCTS,
    PRINT_SIDES,
    UNITS,
    COUNTER_DIM_UNITS,
    PRINT_BILL_UNITS,
    SQFT_PER_SQM,
    SQIN_PER_SQFT,
    SQFT_PER_SQYD,
    SQCM_PER_SQFT,
    SQMM_PER_SQFT,
    DPIS,
    ALLOWED_TYPES,
    PRICE_MODELS,
    DEFAULT_MATERIALS,
    DEFAULT_FINISHING,
    DEFAULT_SETTINGS,
    ORDER_TABS,
    STATUSES,
    PRODUCTION_FLOW,
    CUSTOMER_STEPS,
    NOTICE_KINDS,
    REPORTS,
    round2,
    round4,
    clampArea,
    isPrintShop,
    statusMeta,
    unitMeta,
    billUnitCode,
    billUnitLabel,
    dimUnitId,
    defaultDimUnit,
    isMatchingPair,
    isAreaBillItem,
    convertSize,
    areaSqFt,
    billedArea,
    counterQuote,
    printSizeLabel,
    printAreaLabel,
    printLineCaption,
    decodePrintSpec,
    pxToInches,
    effectiveDpi,
    qualityWarning,
    allowedFile,
    finishingAmount,
    printAmount,
    quoteTotals,
    customerTimeline,
    invoiceLines,
    nextOrderNumber,
    payStatus,
  };
});
