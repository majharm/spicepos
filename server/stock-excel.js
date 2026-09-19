import "../js/footwear.js";

const WEIGHT_VOL = new Set(["GM", "G", "KG", "ML", "L", "LTR"]);
const POSFootwear = globalThis.POSFootwear;

export const STOCK_EXCEL_HEADERS = [
  "Code",
  "Name",
  "Generic / local",
  "Type",
  "Manufacturer",
  "Pack size",
  "Pack unit",
  "Items per pack",
  "Batch no",
  "Expiry",
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
  "MRP",
  "B2B",
  "Value",
  "GST %",
  "Colour",
  "Size",
  "Wearer",
  "Item status",
];

export const STOCK_BATCH_EXCEL_HEADERS = [
  "Code",
  "Name",
  "Generic / local",
  "Type",
  "Manufacturer",
  "Batch no",
  "Batch barcode",
  "Expiry",
  "Mfg date",
  "On hand",
  "Received qty",
  "Unit",
  "Purchase",
  "MRP",
  "Retail",
  "Value",
  "HSN",
  "Category",
  "Supplier",
  "Item status",
];

export function excelYmd(value) {
  const s = String(value || "").trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return "";
}

export function stockExcelHeaders(biz) {
  const tax = POSFootwear?.taxCodeLabel(biz || {}) || "HSN";
  return STOCK_EXCEL_HEADERS.map((h) => (h === "HSN" ? tax : h));
}

export function stockUnit(item) {
  const raw = item && typeof item === "object" ? item.base_unit || item.unit : item;
  const key = String(raw || "GM").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (key === "GRAM" || key === "GRAMS") return "G";
  if (key === "KILO" || key === "KILOGRAM") return "KG";
  if (key === "LITRE" || key === "LITER") return "L";
  if (key === "PC" || key === "QTY") return "PCS";
  return key || "PCS";
}

export function stockDisplayQty(qtyGm, unit) {
  const n = Number(qtyGm) || 0;
  const u = stockUnit(unit);
  if (u === "KG" || u === "LTR" || u === "L") return Math.round((n / 1000) * 1000) / 1000;
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
  const value = WEIGHT_VOL.has(unit) ? (qty / 1000) * rate : qty * rate;
  return Math.round(value * 100) / 100;
}

export function stockExcelRow(item) {
  const unit = stockUnit(item);
  return [
    item.code || "",
    item.name || "",
    item.generic_name || item.local_name || "",
    item.medicine_type || "",
    item.manufacturer || "",
    item.pack_size || "",
    item.pack_unit || "",
    item.units_per_pack || "",
    item.primary_batch_no || item.batch_no || "",
    excelYmd(item.primary_expiry || item.default_expiry || item.expiry_date),
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
    Number(item.mrp || item.retail_rate) || 0,
    Number(item.b2b_rate) || 0,
    stockValue(item),
    Number(item.gst_rate) || 0,
    item.color || "",
    item.size || "",
    item.wearer_type || "",
    String(item.status || "").toLowerCase() === "inactive" ? "Inactive" : "Active",
  ];
}

export function stockBatchExcelRow(batch) {
  const row = batch && typeof batch === "object" ? batch : {};
  const unit = stockUnit(row);
  const remaining = Number(row.remaining_gm) || 0;
  const received = Number(row.qty_gm) || remaining;
  const rate = Number(row.unit_cost ?? row.purchase_rate) || 0;
  const valueRow = { stock_gm: remaining, purchase_rate: rate, base_unit: unit, unit };
  return [
    row.item_code || row.code || "",
    row.item_name || row.name || "",
    row.generic_name || row.local_name || "",
    row.medicine_type || "",
    row.manufacturer || "",
    row.batch_no || "",
    row.barcode || row.batch_barcode || "",
    excelYmd(row.expiry_date || row.item_default_expiry || row.default_expiry),
    excelYmd(row.manufactured_date),
    stockDisplayQty(remaining, unit),
    stockDisplayQty(received, unit),
    unit,
    rate,
    Number(row.mrp) || 0,
    Number(row.retail_rate) || 0,
    stockValue(valueRow),
    row.hsn || "",
    row.category || "",
    row.supplier_name || "",
    String(row.item_status || row.status || "").toLowerCase() === "inactive" ? "Inactive" : "Active",
  ];
}

export function onHandBatches(batches) {
  return (Array.isArray(batches) ? batches : []).filter((b) => (Number(b?.remaining_gm) || 0) > 0);
}

export function stockExcelRowFromBatch(batch) {
  const row = batch && typeof batch === "object" ? batch : {};
  return stockExcelRow({
    code: row.item_code || row.code,
    name: row.item_name || row.name,
    generic_name: row.generic_name,
    local_name: row.local_name,
    medicine_type: row.medicine_type,
    manufacturer: row.manufacturer,
    pack_size: row.pack_size,
    pack_unit: row.pack_unit,
    units_per_pack: row.units_per_pack,
    batch_no: row.batch_no,
    default_expiry: row.expiry_date || row.item_default_expiry,
    barcode: row.barcode || row.item_barcode,
    hsn: row.hsn,
    category: row.category,
    subcategory: row.subcategory,
    base_unit: row.base_unit,
    unit: row.unit,
    stock_gm: row.remaining_gm,
    reorder_level_gm: row.reorder_level_gm,
    purchase_rate: row.unit_cost ?? row.purchase_rate,
    retail_rate: row.retail_rate,
    mrp: row.mrp,
    b2b_rate: row.b2b_rate,
    gst_rate: row.gst_rate,
    color: row.color,
    size: row.size,
    wearer_type: row.wearer_type,
    status: row.item_status || row.status,
  });
}

export function stockToSheets(rows, biz = {}, batches = []) {
  const list = Array.isArray(rows) ? rows : [];
  const skuRows = list.map(stockExcelRow);
  const low = list.filter((r) => stockAlert(r) !== "OK").map(stockExcelRow);
  const headers = stockExcelHeaders(biz);
  const live = onHandBatches(batches);
  const pharmacy = Boolean(POSFootwear?.isPharmacyShop?.(biz));
  if (pharmacy || live.length) {
    const covered = new Set(live.map((b) => String(b.item_id || "")).filter(Boolean));
    const extras = list.filter((item) => item?.id && !covered.has(String(item.id))).map(stockExcelRow);
    const stockRows = live.map(stockExcelRowFromBatch).concat(extras);
    return [
      { name: "Stock", headers, rows: stockRows },
      { name: "SKUs", headers, rows: skuRows },
      { name: "Low stock", headers, rows: low },
    ];
  }
  return [
    { name: "Stock", headers, rows: skuRows },
    { name: "Low stock", headers, rows: low },
  ];
}
