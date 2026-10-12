(function (root) {
  const NAME_MAX = 128;
  const COMPANY_MAX = 160;
  const NOTES_MAX = 255;

  function clip(value, max) {
    const s = String(value ?? "").trim();
    return s ? s.slice(0, max) : "";
  }

  function normalizeBrandName(name) {
    return clip(name, NAME_MAX);
  }

  function brandKey(name) {
    return normalizeBrandName(name).toLowerCase().replace(/\s+/g, " ");
  }

  function sameBrand(a, b) {
    const left = brandKey(a);
    const right = brandKey(b);
    return Boolean(left) && left === right;
  }

  function itemBrandName(item) {
    return normalizeBrandName(item?.brand || item?.brand_name || "");
  }

  function collectBrands({ brands, items, barProducts } = {}) {
    const map = new Map();
    function add(row) {
      const name = normalizeBrandName(row?.name || row?.brand);
      if (!name) return;
      const key = brandKey(name);
      const prev = map.get(key) || {
        id: row.id || "",
        name,
        company: "",
        notes: "",
        status: "active",
        item_count: 0,
      };
      if (row.id && !prev.id) prev.id = row.id;
      if (row.company && !prev.company) prev.company = clip(row.company, COMPANY_MAX);
      if (row.notes && !prev.notes) prev.notes = clip(row.notes, NOTES_MAX);
      if (row.status) prev.status = String(row.status);
      if (row.item_count != null) prev.item_count = Number(row.item_count) || prev.item_count;
      map.set(key, prev);
    }
    (brands || []).forEach(add);
    (items || []).forEach((item) => {
      const name = itemBrandName(item);
      if (!name) return;
      add({ id: item.brand_id, name, company: item.manufacturer });
      const row = map.get(brandKey(name));
      if (row) row.item_count += 1;
    });
    (barProducts || []).forEach((p) => {
      const name = normalizeBrandName(p.brand);
      if (!name) return;
      add({ name });
      const row = map.get(brandKey(name));
      if (row) row.item_count += 1;
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  function itemMatchesBrand(item, brand) {
    const want = brandKey(brand);
    if (!want) return true;
    return brandKey(itemBrandName(item)) === want;
  }

  function upsertBrandList(list, input) {
    const name = normalizeBrandName(input?.name || input);
    if (!name) return Array.isArray(list) ? list.slice() : [];
    const next = collectBrands({ brands: list });
    const key = brandKey(name);
    const prev = next.find((b) => brandKey(b.name) === key);
    const row = {
      id: input?.id || prev?.id || "",
      name,
      company: clip(input?.company ?? prev?.company, COMPANY_MAX),
      notes: clip(input?.notes ?? prev?.notes, NOTES_MAX),
      status: input?.status || prev?.status || "active",
      item_count: prev?.item_count || 0,
    };
    if (prev) Object.assign(prev, row);
    else next.push(row);
    return next.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  function summarizeBrands(brands, items) {
    const rows = collectBrands({ brands, items });
    return {
      brands: rows.length,
      active: rows.filter((b) => b.status !== "inactive").length,
      assigned: (items || []).filter((i) => itemBrandName(i)).length,
    };
  }

  function brandCopy(kind) {
    const copies = {
      pharmacy: { brandLab: "Brand", brandHint: "Crocin / Dolo", companyLab: "Company / Manufacturer" },
      apparel: { brandLab: "Brand", brandHint: "Raymond / Local" },
      footwear: { brandLab: "Brand", brandHint: "Bata / Local" },
      grocery: { brandLab: "Brand", brandHint: "Aashirvaad / Tata" },
      restaurant: { brandLab: "Brand", brandHint: "House / Coca-Cola" },
      bar: { brandLab: "Brand", brandHint: "Johnnie Walker / Kingfisher" },
      electronics: { brandLab: "Brand", brandHint: "Samsung / Boat" },
      jewellery: { brandLab: "Brand", brandHint: "Tanishq / Local" },
      hardware: { brandLab: "Brand", brandHint: "Bosch / Local" },
      services: { brandLab: "Brand", brandHint: "House / L'Oreal" },
      printing: { brandLab: "Brand", brandHint: "House" },
      gym: { brandLab: "Brand", brandHint: "ON / MuscleBlaze" },
      spice: { brandLab: "Brand", brandHint: "MDH / Everest" },
      general: { brandLab: "Brand", brandHint: "Brand / make" },
    };
    return copies[kind] || copies.general;
  }

  root.POSItemMaster = {
    NAME_MAX,
    COMPANY_MAX,
    NOTES_MAX,
    clip,
    normalizeBrandName,
    brandKey,
    sameBrand,
    itemBrandName,
    collectBrands,
    itemMatchesBrand,
    upsertBrandList,
    summarizeBrands,
    brandCopy,
  };
})(typeof window !== "undefined" ? window : globalThis);
