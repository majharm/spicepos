const COUNT = new Set(["PCS", "PC", "QTY", "NOS", "NO", "COUNT", "UNIT", "UNITS"]);

export const STOCK_EXCEL_HEADERS = [
  "Code",
  "Name",
  "Barcode",
  "HSN",
  "Category",
  "Subcategory",
  "Unit",
  "On hand",
  "Reorder",
  "Alert",
  "Purchase",
  "Retail",
  "B2B",
  "Value",
  "GST %",
  "Item status",
];

export function stockUnit(item) {
  const raw = item && typeof item === "object" ? item.base_unit || item.unit : item;
  const key = String(raw || "GM").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (key === "G" || key === "GRAM" || key === "GRAMS") return "GM";
  if (key === "KILO" || key === "KILOGRAM") return "KG";
  if (key === "L" || key === "LITRE" || key === "LITER") return "LTR";
  if (COUNT.has(key)) return "PCS";
  return key || "GM";
}

export function stockDisplayQty(qtyGm, unit) {
  const n = Number(qtyGm) || 0;
  const u = stockUnit(unit);
  if (u === "KG" || u === "LTR") return Math.round((n / 1000) * 1000) / 1000;
  return n;
}

export function stockAlert(row) {
  const stock = Number(row?.stock_gm) || 0;
  const reorder = Number(row?.reorder_level_gm) || 0;
  if (stock <= 0) return "Out";
  if (stock <= reorder) return "Low";
  return "OK";
}

export function stockValue(row) {
  const qty = Number(row?.stock_gm) || 0;
  const rate = Number(row?.purchase_rate) || 0;
  const unit = stockUnit(row);
  const value = COUNT.has(unit) || unit === "PCS" ? qty * rate : (qty / 1000) * rate;
  return Math.round(value * 100) / 100;
}

export function stockExcelRow(item) {
  const unit = stockUnit(item);
  return [
    item.code || "",
    item.name || "",
    item.barcode || "",
    item.hsn || "",
    item.category || "",
    item.subcategory || "",
    unit,
    stockDisplayQty(item.stock_gm, unit),
    stockDisplayQty(item.reorder_level_gm, unit),
    stockAlert(item),
    Number(item.purchase_rate) || 0,
    Number(item.retail_rate) || 0,
    Number(item.b2b_rate) || 0,
    stockValue(item),
    Number(item.gst_rate) || 0,
    String(item.status || "").toLowerCase() === "inactive" ? "Inactive" : "Active",
  ];
}

export function stockToSheets(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const all = list.map(stockExcelRow);
  const low = list.filter((r) => stockAlert(r) !== "OK").map(stockExcelRow);
  return [
    { name: "Stock", headers: STOCK_EXCEL_HEADERS, rows: all },
    { name: "Low stock", headers: STOCK_EXCEL_HEADERS, rows: low },
  ];
}
