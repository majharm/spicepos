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

  const UNITS = [
    { id: "ft", label: "Feet", toSqFt: 1 },
    { id: "in", label: "Inches", toSqFt: 1 / 144 },
    { id: "cm", label: "Centimeters", toSqFt: 1 / 929.0304 },
    { id: "mm", label: "Millimeters", toSqFt: 1 / 92903.04 },
    { id: "px", label: "Pixels", toSqFt: 0 },
    { id: "sqft", label: "Square Feet", toSqFt: 1 },
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

  function isPrintShop(biz) {
    const type = String(biz?.business_type || "").toLowerCase().trim();
    if (type === "printing business" || type === "printing") return true;
    if (globalThis.POSFootwear?.shopKind?.(biz) === "printing") return true;
    const t = [biz?.category, biz?.business_type, biz?.name].filter(Boolean).join(" ").toLowerCase();
    return /(flex\s*&\s*printing|flex printing|banner printing|vinyl printing|large format|hoarding|sunboard)/.test(t);
  }

  function statusMeta(id) {
    return STATUSES.find((s) => s.id === String(id || "").toLowerCase()) || STATUSES[0];
  }

  function unitMeta(id) {
    const u = String(id || "ft").toLowerCase();
    if (u === "feet" || u === "foot") return UNITS.find((x) => x.id === "ft");
    if (u === "inches" || u === "inch") return UNITS.find((x) => x.id === "in");
    if (u === "centimeters" || u === "centimetres") return UNITS.find((x) => x.id === "cm");
    if (u === "millimeters" || u === "millimetres") return UNITS.find((x) => x.id === "mm");
    if (u === "pixels" || u === "pixel") return UNITS.find((x) => x.id === "px");
    if (u === "sq ft" || u === "sqft" || u === "square feet") return UNITS.find((x) => x.id === "sqft");
    return UNITS.find((x) => x.id === u) || UNITS[0];
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
    } else if (u.id === "cm") {
      wIn /= 2.54;
      hIn /= 2.54;
    } else if (u.id === "mm") {
      wIn /= 25.4;
      hIn /= 25.4;
    } else if (u.id === "sqft") {
      return {
        inches: { width: 0, height: 0 },
        feet: { width: 0, height: 0 },
        cm: { width: 0, height: 0 },
        mm: { width: 0, height: 0 },
        sqft: round2(Number(width) || 0),
      };
    }
    const inches = { width: round2(wIn), height: round2(hIn) };
    const feet = { width: round2(wIn / 12), height: round2(hIn / 12) };
    const cm = { width: round2(wIn * 2.54), height: round2(hIn * 2.54) };
    const mm = { width: round2(wIn * 25.4), height: round2(hIn * 25.4) };
    const sqft = round2((wIn * hIn) / 144);
    return { inches, feet, cm, mm, sqft };
  }

  function areaSqFt(width, height, unit, dpi) {
    const u = unitMeta(unit);
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    if (u.id === "sqft") return round2(w);
    if (u.id === "px") {
      const win = pxToInches(w, dpi);
      const hin = pxToInches(h, dpi);
      return round2((win * hin) / 144);
    }
    if (u.id === "ft") return round2(w * h);
    if (u.id === "in") return round2((w * h) / 144);
    if (u.id === "cm") return round2((w * h) / 929.0304);
    if (u.id === "mm") return round2((w * h) / 92903.04);
    return round2(w * h);
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
    isPrintShop,
    statusMeta,
    unitMeta,
    convertSize,
    areaSqFt,
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
