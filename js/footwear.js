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
  const PREFIX = {
    footwear: "FW",
    apparel: "AP",
    spice: "SP",
    grocery: "GR",
    restaurant: "FD",
    pharmacy: "PH",
    electronics: "EL",
    jewellery: "JW",
    hardware: "HW",
    services: "SV",
    general: "IT",
  };

  function shopText(biz) {
    return [biz?.category, biz?.business_type, biz?.name].filter(Boolean).join(" ").toLowerCase();
  }

  function isFootwearShop(biz) {
    return /(^|[^a-z])(footwear|shoes?)([^a-z]|$)/.test(shopText(biz));
  }

  function isApparelShop(biz) {
    if (isFootwearShop(biz)) return false;
    return /(apparel|garment|clothing|boutique|saree|fashion|dress|textile)/.test(shopText(biz));
  }

  function shopKind(biz) {
    const type = String(biz?.business_type || "").toLowerCase().trim();
    if (type === "restaurant" || type === "cafe" || type === "bakery") return "restaurant";
    if (isFootwearShop(biz)) return "footwear";
    if (isApparelShop(biz)) return "apparel";
    const t = shopText(biz);
    if (/(spice|masala)/.test(t)) return "spice";
    if (/(kirana|fmcg|grocery|supermarket|general trade)/.test(t)) return "grocery";
    if (/(restaurant|cafe|bakery|food)/.test(t)) return "restaurant";
    if (/(pharmacy|medical)/.test(t)) return "pharmacy";
    if (/(electronic|mobile)/.test(t)) return "electronics";
    if (/(jewel)/.test(t)) return "jewellery";
    if (/(hardware)/.test(t)) return "hardware";
    if (/(service)/.test(t)) return "services";
    return "general";
  }

  function isSpiceShop(biz) {
    return shopKind(biz) === "spice";
  }

  function isRestaurantShop(biz) {
    return shopKind(biz) === "restaurant";
  }

  function isVariantShop(biz) {
    return isFootwearShop(biz) || isApparelShop(biz);
  }

  function isWeightShop(biz) {
    const k = shopKind(biz);
    return k === "spice" || k === "grocery";
  }

  function wearersForShop(biz) {
    return isApparelShop(biz) ? APPAREL_WEARERS : WEARERS;
  }

  function sizesForShop(biz) {
    return isApparelShop(biz) ? APPAREL_SIZES : SIZES;
  }

  function itemPrefix(biz) {
    return PREFIX[shopKind(biz)] || "IT";
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

  function isPharmacyShop(biz) {
    return shopKind(biz) === "pharmacy";
  }

  function suggestedItemCategories(biz) {
    if (shopKind(biz) === "pharmacy") {
      return ["Medical", "OTC", "Ayurvedic", "Surgical", "Baby care", "Personal care"];
    }
    if (shopKind(biz) !== "restaurant") return [];
    return [
      "South Indian",
      "North Indian",
      "Chinese",
      "Starters",
      "Main course",
      "Rice",
      "Breads",
      "Tandoor",
      "Biryani",
      "Beverages",
      "Desserts",
      "Snacks",
    ];
  }

  function defaultCategory(biz) {
    const k = shopKind(biz);
    if (k === "spice") return "Whole Spices";
    if (k === "footwear") return "Footwear";
    if (k === "restaurant") return "Menu";
    const cat = String(biz?.category || "").trim();
    if (cat && !/^other$/i.test(cat)) return cat;
    const fallback = {
      apparel: "Garments",
      grocery: "Grocery",
      restaurant: "Menu",
      pharmacy: "Medical",
      electronics: "Electronics",
      jewellery: "Jewellery",
      hardware: "Hardware",
      services: "Service",
      general: "General",
    };
    return fallback[k] || "General";
  }

  function defaultUnit(biz) {
    return isWeightShop(biz) ? "GM" : "PCS";
  }

  function itemFormCopy(biz) {
    const k = shopKind(biz);
    const copies = {
      spice: {
        name: "Turmeric powder",
        localName: "चावल / तांदूळ / Rice",
        category: "Whole Spices",
        subcategory: "Haldi / Jeera",
        categoryLab: "Category",
        subcategoryLab: "Subcategory",
        search: "Search name or HSN…",
        scan: "Scan or search",
        lede: "Name, photo, HSN code, unit type, rates, and stock.",
        itemsSub: "Photo, HSN, unit type, rates, and stock",
        counterSub: "Scan, tap, or search — then Pay",
        ticket: "Tap a product or scan",
        hsn: "e.g. 0908",
      },
      apparel: {
        name: "Cotton kurti",
        localName: "कुर्ती / कुर्ता / Kurti",
        category: "Shirt / Kurti / Jeans",
        subcategory: "Cotton / Silk / Denim",
        categoryLab: "Category",
        subcategoryLab: "Subcategory",
        search: "Search garment, colour, or size…",
        scan: "Scan or search garment",
        lede: "Name, colour, size, female/male/kids type, photo, rates, and stock.",
        itemsSub: "Colour, size, female/male/kids, rates, and stock",
        counterSub: "Scan or tap a garment — female, male, kids, colour, size",
        ticket: "Scan or tap a garment · female, male, or kids",
        hsn: "e.g. 6109",
      },
      footwear: {
        name: "School shoe",
        localName: "जूता / जोडा / Shoe",
        category: "School / Sports / Sandal",
        subcategory: "Bata / Local",
        categoryLab: "Style",
        subcategoryLab: "Brand",
        search: "Search shoe, colour, or size…",
        scan: "Scan or search shoe",
        lede: "Name, colour, size, girls/boys type, photo, rates, and stock.",
        itemsSub: "Colour, size, girls/boys type, rates, and stock",
        counterSub: "Scan or tap a pair — girls, boys, colour, size",
        ticket: "Scan or tap a pair · girls or boys",
        hsn: "e.g. 6402",
      },
      grocery: {
        name: "Toor dal",
        localName: "तूर डाळ / तूर दाल / Dal",
        category: "Staples / Snacks",
        subcategory: "Dal / Oil / Atta",
        categoryLab: "Category",
        subcategoryLab: "Subcategory",
        search: "Search name or HSN…",
        scan: "Scan or search",
        lede: "Name, photo, HSN code, unit type, rates, and stock.",
        itemsSub: "Photo, HSN, unit type, rates, and stock",
        counterSub: "Scan, tap, or search — then Pay",
        ticket: "Tap a product or scan",
        hsn: "e.g. 0713",
      },
      restaurant: {
        name: "Masala dosa",
        localName: "डोसा / डोसा / Dosa",
        category: "South Indian / Chinese",
        subcategory: "Dosa / Rice / Starter",
        categoryLab: "Category",
        subcategoryLab: "Subcategory",
        search: "Search dish or HSN…",
        scan: "Scan or search dish",
        lede: "Name, photo, HSN code, unit type, rates, and stock.",
        itemsSub: "Photo, HSN, unit type, rates, and stock",
        counterSub: "Create tables, tap dishes, kitchen KOT, then Pay",
        ticket: "Open a table, then tap a dish",
        hsn: "e.g. 2106",
      },
      pharmacy: {
        name: "Paracetamol 500mg",
        localName: "Paracetamol",
        localNameLab: "Generic Name",
        category: "Medical",
        subcategory: "Fever / Cough",
        categoryLab: "Category",
        subcategoryLab: "Subcategory",
        search: "Search medicine, generic, or barcode…",
        scan: "Scan or search medicine",
        lede: "Item name, generic, type, manufacturer, pack, batch, expiry, GST, barcode, and stock.",
        itemsSub: "Generic, type, pack, batch, expiry, rates, and stock",
        counterSub: "Scan, tap, or search medicine — then Pay",
        ticket: "Tap a medicine or scan",
        hsn: "e.g. 3004",
      },
      electronics: {
        name: "USB cable",
        localName: "केबल / केबल / Cable",
        category: "Mobile / Accessory",
        subcategory: "Cable / Charger",
        categoryLab: "Category",
        subcategoryLab: "Subcategory",
        search: "Search item or HSN…",
        scan: "Scan or search",
        lede: "Name, photo, HSN code, unit type, rates, and stock.",
        itemsSub: "Photo, HSN, unit type, rates, and stock",
        counterSub: "Scan, tap, or search — then Pay",
        ticket: "Tap a product or scan",
        hsn: "e.g. 8544",
      },
      jewellery: {
        name: "Gold chain",
        localName: "साखळी / चैन / Chain",
        category: "Gold / Silver",
        subcategory: "Chain / Ring",
        categoryLab: "Category",
        subcategoryLab: "Subcategory",
        search: "Search jewellery or HSN…",
        scan: "Scan or search",
        lede: "Name, photo, HSN code, unit type, rates, and stock.",
        itemsSub: "Photo, HSN, unit type, rates, and stock",
        counterSub: "Scan, tap, or search — then Pay",
        ticket: "Tap a product or scan",
        hsn: "e.g. 7113",
      },
      hardware: {
        name: "Screw 2 inch",
        localName: "स्क्रू / स्क्रू / Screw",
        category: "Fasteners / Tools",
        subcategory: "Screw / Bolt",
        categoryLab: "Category",
        subcategoryLab: "Subcategory",
        search: "Search item or HSN…",
        scan: "Scan or search",
        lede: "Name, photo, HSN code, unit type, rates, and stock.",
        itemsSub: "Photo, HSN, unit type, rates, and stock",
        counterSub: "Scan, tap, or search — then Pay",
        ticket: "Tap a product or scan",
        hsn: "e.g. 7318",
      },
      services: {
        name: "Service charge",
        localName: "सेवा / सेवा / Service",
        category: "Service / Repair",
        subcategory: "Labour / Visit",
        categoryLab: "Category",
        subcategoryLab: "Subcategory",
        search: "Search service…",
        scan: "Scan or search",
        lede: "Name, photo, HSN code, unit type, rates, and stock.",
        itemsSub: "Photo, HSN, unit type, rates, and stock",
        counterSub: "Tap a service — then Pay",
        ticket: "Tap a service",
        hsn: "e.g. 9983",
      },
      general: {
        name: "Item name",
        localName: "स्थानीय नाम / Local name",
        category: "Group / Section",
        subcategory: "Type / Brand",
        categoryLab: "Category",
        subcategoryLab: "Subcategory",
        search: "Search name or HSN…",
        scan: "Scan or search",
        lede: "Name, photo, HSN code, unit type, rates, and stock.",
        itemsSub: "Photo, HSN, unit type, rates, and stock",
        counterSub: "Scan, tap, or search — then Pay",
        ticket: "Tap a product or scan",
        hsn: "e.g. 1234",
      },
    };
    return copies[k] || copies.general;
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

  function demoItems(biz) {
    if (shopKind(biz) !== "pharmacy") return [];
    const expiry = "2027-12-31";
    return [
      {
        name: "Paracetamol 500mg",
        local_name: "Paracetamol",
        generic_name: "Paracetamol",
        medicine_type: "Tablet",
        category: "Medical",
        manufacturer: "Generic Pharma",
        hsn: "3004",
        pack_size: "10 Tablets",
        pack_unit: "Strip",
        units_per_pack: 10,
        unit: "PCS",
        mrp: 20,
        retail_rate: 18,
        b2b_rate: 16,
        purchase_rate: 11,
        gst_rate: 12,
        stock_gm: 200,
        reorder_level_gm: 40,
        barcode: "890DEMO000001",
        batch_no: "PCM2401",
        default_expiry: expiry,
        expiry_date: expiry,
      },
      {
        name: "Dolo 650",
        local_name: "Paracetamol",
        generic_name: "Paracetamol",
        medicine_type: "Tablet",
        category: "Medical",
        manufacturer: "Micro Labs",
        hsn: "3004",
        pack_size: "15 Tablets",
        pack_unit: "Strip",
        units_per_pack: 15,
        unit: "PCS",
        mrp: 32,
        retail_rate: 30,
        b2b_rate: 27,
        purchase_rate: 20,
        gst_rate: 12,
        stock_gm: 150,
        reorder_level_gm: 30,
        barcode: "890DEMO000002",
        batch_no: "DLO2402",
        default_expiry: expiry,
        expiry_date: expiry,
      },
      {
        name: "Amoxicillin 500mg",
        local_name: "Amoxicillin",
        generic_name: "Amoxicillin",
        medicine_type: "Capsule",
        category: "Medical",
        manufacturer: "Cipla",
        hsn: "3004",
        pack_size: "10 Capsules",
        pack_unit: "Strip",
        units_per_pack: 10,
        unit: "PCS",
        mrp: 85,
        retail_rate: 78,
        b2b_rate: 70,
        purchase_rate: 52,
        gst_rate: 12,
        stock_gm: 80,
        reorder_level_gm: 20,
        barcode: "890DEMO000003",
        batch_no: "AMX2403",
        default_expiry: expiry,
        expiry_date: expiry,
      },
      {
        name: "Azithromycin 500mg",
        local_name: "Azithromycin",
        generic_name: "Azithromycin",
        medicine_type: "Tablet",
        category: "Medical",
        manufacturer: "Cipla",
        hsn: "3004",
        pack_size: "3 Tablets",
        pack_unit: "Strip",
        units_per_pack: 3,
        unit: "PCS",
        mrp: 75,
        retail_rate: 69,
        b2b_rate: 62,
        purchase_rate: 45,
        gst_rate: 12,
        stock_gm: 60,
        reorder_level_gm: 15,
        barcode: "890DEMO000004",
        batch_no: "AZI2404",
        default_expiry: expiry,
        expiry_date: expiry,
      },
      {
        name: "Cetirizine 10mg",
        local_name: "Cetirizine",
        generic_name: "Cetirizine",
        medicine_type: "Tablet",
        category: "Medical",
        manufacturer: "Dr Reddy's",
        hsn: "3004",
        pack_size: "10 Tablets",
        pack_unit: "Strip",
        units_per_pack: 10,
        unit: "PCS",
        mrp: 18,
        retail_rate: 16,
        b2b_rate: 14,
        purchase_rate: 9,
        gst_rate: 12,
        stock_gm: 180,
        reorder_level_gm: 30,
        barcode: "890DEMO000005",
        batch_no: "CTZ2405",
        default_expiry: expiry,
        expiry_date: expiry,
      },
      {
        name: "Cough Syrup 100ml",
        local_name: "Dextromethorphan",
        generic_name: "Dextromethorphan",
        medicine_type: "Syrup",
        category: "Medical",
        manufacturer: "Abbott",
        hsn: "3004",
        pack_size: "100 ml",
        pack_unit: "Bottle",
        units_per_pack: 1,
        unit: "PCS",
        mrp: 98,
        retail_rate: 89,
        b2b_rate: 80,
        purchase_rate: 62,
        gst_rate: 12,
        stock_gm: 40,
        reorder_level_gm: 10,
        barcode: "890DEMO000006",
        batch_no: "CSY2406",
        default_expiry: expiry,
        expiry_date: expiry,
      },
      {
        name: "Povidone Iodine Ointment",
        local_name: "Povidone Iodine",
        generic_name: "Povidone Iodine",
        medicine_type: "Ointment",
        category: "Medical",
        manufacturer: "Win-Medicare",
        hsn: "3004",
        pack_size: "15 g",
        pack_unit: "Tube",
        units_per_pack: 1,
        unit: "PCS",
        mrp: 55,
        retail_rate: 49,
        b2b_rate: 44,
        purchase_rate: 32,
        gst_rate: 12,
        stock_gm: 35,
        reorder_level_gm: 8,
        barcode: "890DEMO000007",
        batch_no: "PVI2407",
        default_expiry: expiry,
        expiry_date: expiry,
      },
      {
        name: "ORS Sachet",
        local_name: "Oral Rehydration Salts",
        generic_name: "Oral Rehydration Salts",
        medicine_type: "Powder",
        category: "Medical",
        manufacturer: "Cipla",
        hsn: "3004",
        pack_size: "21.8 g",
        pack_unit: "Packet",
        units_per_pack: 1,
        unit: "PCS",
        mrp: 22,
        retail_rate: 20,
        b2b_rate: 17,
        purchase_rate: 12,
        gst_rate: 5,
        stock_gm: 90,
        reorder_level_gm: 20,
        barcode: "890DEMO000008",
        batch_no: "ORS2408",
        default_expiry: expiry,
        expiry_date: expiry,
      },
    ];
  }

  return {
    WEARERS,
    APPAREL_WEARERS,
    COLORS,
    SIZES,
    APPAREL_SIZES,
    isFootwearShop,
    isApparelShop,
    isSpiceShop,
    isRestaurantShop,
    isPharmacyShop,
    isVariantShop,
    shopKind,
    suggestedItemCategories,
    itemFormCopy,
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
    demoItems,
  };
});
