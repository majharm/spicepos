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
  const APPAREL_WEARERS = [
    { value: "female", label: "Female" },
    { value: "male", label: "Male" },
    { value: "kids", label: "Kids" },
    { value: "unisex", label: "Unisex" },
  ];
  const COLORS = [
    "Black", "Brown", "White", "Blue", "Red", "Pink", "Gold", "Silver",
    "Beige", "Grey", "Navy", "Green", "Tan", "Maroon", "Yellow", "Orange",
    "Purple", "Cream", "Multi",
  ];
  const SIZES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"];
  const APPAREL_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "28", "30", "32", "34", "36", "38", "40", "42", "44"];

  function shopText(biz) {
    return [biz?.category, biz?.business_type].filter(Boolean).join(" ").toLowerCase();
  }

  function isFootwearShop(biz) {
    return /(^|[^a-z])(footwear|shoes?)([^a-z]|$)/.test(shopText(biz));
  }

  function isApparelShop(biz) {
    if (isFootwearShop(biz)) return false;
    return /(apparel|garment|clothing|boutique|saree|fashion|dress|textile)/.test(shopText(biz));
  }

  function isVariantShop(biz) {
    return isFootwearShop(biz) || isApparelShop(biz);
  }

  function wearersForShop(biz) {
    return isApparelShop(biz) ? APPAREL_WEARERS : WEARERS;
  }

  function sizesForShop(biz) {
    return isApparelShop(biz) ? APPAREL_SIZES : SIZES;
  }

  function itemPrefix(biz) {
    if (isFootwearShop(biz)) return "FW";
    if (isApparelShop(biz)) return "AP";
    return "SP";
  }

  function normalizeWearer(raw) {
    const v = String(raw || "").trim().toLowerCase();
    if (v === "girl" || v === "girls") return "girls";
    if (v === "boy" || v === "boys") return "boys";
    if (v === "female" || v === "women" || v === "woman" || v === "ladies" || v === "lady") return "female";
    if (v === "male" || v === "men" || v === "man" || v === "gents" || v === "gent") return "male";
    if (v === "kids" || v === "kid" || v === "children" || v === "child") return "kids";
    if (v === "unisex") return "unisex";
    return "";
  }

  function wearerLabel(raw) {
    const v = normalizeWearer(raw);
    if (v === "girls") return "Girls";
    if (v === "boys") return "Boys";
    if (v === "female") return "Female";
    if (v === "male") return "Male";
    if (v === "kids") return "Kids";
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
    if (isFootwearShop(biz)) return "Footwear";
    if (isApparelShop(biz)) {
      const cat = String(biz?.category || "").trim();
      if (cat && !/^other$/i.test(cat)) return cat;
      return "Garments";
    }
    return "Whole Spices";
  }

  function defaultUnit(biz) {
    return isVariantShop(biz) ? "PCS" : "GM";
  }

  function parseSizes(raw) {
    if (Array.isArray(raw)) return [...new Set(raw.map((s) => String(s || "").trim()).filter(Boolean))];
    const s = String(raw || "").trim();
    if (!s) return [];
    return [...new Set(s.split(/[\s,+/]+/).map((p) => p.trim()).filter(Boolean))];
  }

  function fieldsFromBody(body) {
    const rawSizes = body?.sizes !== undefined ? body.sizes : body?.size;
    const list = parseSizes(rawSizes);
    const size = list.length === 1 ? list[0] : (String(body?.size || "").trim() || (list[0] || null));
    return {
      color: String(body?.color || "").trim() || null,
      size,
      sizes: list,
      wearer_type: normalizeWearer(body?.wearer_type) || null,
    };
  }

  return {
    WEARERS,
    APPAREL_WEARERS,
    COLORS,
    SIZES,
    APPAREL_SIZES,
    isFootwearShop,
    isApparelShop,
    isVariantShop,
    wearersForShop,
    sizesForShop,
    itemPrefix,
    normalizeWearer,
    wearerLabel,
    variantLabel,
    billName,
    defaultCategory,
    defaultUnit,
    parseSizes,
    fieldsFromBody,
  };
});
