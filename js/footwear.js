(function (root, factory) {
  const api = factory();
  root.POSFootwear = api;
  if (typeof window !== "undefined") window.POSFootwear = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const WEARERS = [
    { value: "girls", label: "Girls" },
    { value: "boys", label: "Boys" },
    { value: "unisex", label: "Unisex" },
  ];
  const COLORS = [
    "Black", "Brown", "White", "Blue", "Red", "Pink", "Gold", "Silver",
    "Beige", "Grey", "Navy", "Green", "Tan", "Multi",
  ];
  const SIZES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"];

  function shopText(biz) {
    return [biz?.category, biz?.business_type].filter(Boolean).join(" ").toLowerCase();
  }

  function isFootwearShop(biz) {
    return /(^|[^a-z])(footwear|shoes?)([^a-z]|$)/.test(shopText(biz));
  }

  function normalizeWearer(raw) {
    const v = String(raw || "").trim().toLowerCase();
    if (v === "girl" || v === "girls") return "girls";
    if (v === "boy" || v === "boys") return "boys";
    if (v === "unisex" || v === "kids" || v === "kid") return "unisex";
    return "";
  }

  function wearerLabel(raw) {
    const v = normalizeWearer(raw);
    if (v === "girls") return "Girls";
    if (v === "boys") return "Boys";
    if (v === "unisex") return "Unisex";
    return "";
  }

  function variantParts(item) {
    const size = String(item?.size || "").trim();
    return [
      wearerLabel(item?.wearer_type),
      String(item?.color || "").trim(),
      size ? `Sz ${size}` : "",
    ].filter(Boolean);
  }

  function variantLabel(item) {
    return variantParts(item).join(" · ");
  }

  function billName(item) {
    const name = String(item?.name || "Item").trim() || "Item";
    const v = variantLabel(item);
    return v ? `${name} (${v})` : name;
  }

  function defaultCategory(biz) {
    return isFootwearShop(biz) ? "Footwear" : "Whole Spices";
  }

  function defaultUnit(biz) {
    return isFootwearShop(biz) ? "PCS" : "GM";
  }

  function fieldsFromBody(body) {
    return {
      color: String(body?.color || "").trim() || null,
      size: String(body?.size || "").trim() || null,
      wearer_type: normalizeWearer(body?.wearer_type) || null,
    };
  }

  return {
    WEARERS,
    COLORS,
    SIZES,
    isFootwearShop,
    normalizeWearer,
    wearerLabel,
    variantLabel,
    billName,
    defaultCategory,
    defaultUnit,
    fieldsFromBody,
  };
});
