import zlib from "node:zlib";
import { workbookXml } from "./excel.js";
import "../js/units.js";
import "../js/footwear.js";

const POSUnits = globalThis.POSUnits;
const POSFootwear = globalThis.POSFootwear;

export const ITEM_IMPORT_MAX_ROWS = 500;
export const ITEM_IMPORT_MAX_BYTES = 2_000_000;

export const ITEM_IMPORT_HEADERS = [
  "Name",
  "HSN",
  "Category",
  "Subcategory",
  "Unit",
  "MRP",
  "GST %",
  "Retail",
  "B2B",
  "Purchase",
  "Stock",
  "Barcode",
  "Manufacturer barcode",
  "Code",
  "Colour",
  "Size",
  "Wearer",
];

const HEADER_ALIASES = {
  name: "name",
  item: "name",
  itemname: "name",
  product: "name",
  productname: "name",
  hsn: "hsn",
  hsncode: "hsn",
  category: "category",
  group: "category",
  subcategory: "subcategory",
  subcategoryname: "subcategory",
  unit: "unit",
  unittype: "unit",
  uom: "unit",
  baseunit: "unit",
  mrp: "mrp",
  gst: "gst",
  gstpercent: "gst",
  gstrate: "gst",
  retail: "retail",
  retailrate: "retail",
  selling: "retail",
  salerate: "retail",
  b2b: "b2b",
  wholesale: "b2b",
  b2brate: "b2b",
  purchase: "purchase",
  cost: "purchase",
  purchaserate: "purchase",
  stock: "stock",
  qty: "stock",
  quantity: "stock",
  stockqty: "stock",
  barcode: "barcode",
  ownbarcode: "barcode",
  ean: "barcode",
  manufacturerbarcode: "mfr_barcode",
  mfrbarcode: "mfr_barcode",
  factorybarcode: "mfr_barcode",
  code: "code",
  sku: "code",
  itemcode: "code",
  colour: "color",
  color: "color",
  size: "size",
  wearer: "wearer_type",
  type: "wearer_type",
  girlsboys: "wearer_type",
};

export function itemImportTemplateSheets() {
  return [
    {
      name: "Items",
      headers: ITEM_IMPORT_HEADERS,
      rows: [
        ["Turmeric powder", "091030", "Whole Spices", "Powder", "GM", 220, 5, 240, 210, 180, 5000, "", "", "", "", "", ""],
        ["Soap bar", "", "Grocery", "", "PCS", 25, 5, 30, 28, 22, 24, "", "", "", "", "", ""],
      ],
    },
    {
      name: "Help",
      headers: ["Field", "Notes"],
      rows: [
        ["Name", "Required. Each row is one item."],
        ["Unit", "GM, KG, PCS, ML, or LTR (or your unit master code)."],
        ["Stock", "Quantity in that unit: grams for GM, kg for KG, pcs for PCS."],
        ["GST %", "Defaults to 5 if blank on a new item."],
        ["Code", "Leave blank to create a new SKU. Matching Code or Barcode updates that item."],
        ["Limit", "Up to 500 rows per upload. .xlsx, Excel XML, or CSV."],
      ],
    },
  ];
}

export function itemImportTemplateXml() {
  return workbookXml(itemImportTemplateSheets());
}

function headerKey(raw) {
  const n = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/%/g, " percent ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "");
  return HEADER_ALIASES[n] || "";
}

export function parseCsv(text) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else inQuotes = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }
    if (ch === "\r") continue;
    cur += ch;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c || "").trim() !== ""));
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function parseSpreadsheetMl(xml) {
  const src = String(xml || "");
  const firstSheet = src.match(/<Worksheet\b[^>]*>[\s\S]*?<\/Worksheet>/i);
  const sheet = firstSheet ? firstSheet[0] : src;
    const rowBlocks = [...sheet.matchAll(/<Row\b[^>]*>([\s\S]*?)<\/Row>/gi)];
  const rows = [];
  for (const block of rowBlocks) {
    const cells = [];
    let col = 1;
    for (const cell of block[1].matchAll(/<Cell\b([^>]*)>([\s\S]*?)<\/Cell>|<Cell\b([^>]*)\/>/gi)) {
      const attrs = cell[1] || cell[3] || "";
      const inner = cell[2] || "";
      const idx = attrs.match(/ss:Index="(\d+)"/i);
      if (idx) col = Number(idx[1]);
      const data = inner.match(/<Data\b[^>]*>([\s\S]*?)<\/Data>/i);
      const text = data ? decodeXml(data[1].replace(/<[^>]+>/g, "")) : "";
      while (cells.length < col - 1) cells.push("");
      cells.push(text);
      col += 1;
    }
    if (cells.some((c) => String(c).trim() !== "")) rows.push(cells);
  }
  return rows;
}

function colLettersToIndex(letters) {
  let n = 0;
  const s = String(letters || "").toUpperCase();
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function unzipEntries(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const out = {};
  let i = 0;
  while (i + 30 <= b.length) {
    const sig = b.readUInt32LE(i);
    if (sig === 0x02014b50 || sig === 0x06054b50) break;
    if (sig !== 0x04034b50) break;
    const flags = b.readUInt16LE(i + 6);
    const method = b.readUInt16LE(i + 8);
    let compSize = b.readUInt32LE(i + 18);
    const nameLen = b.readUInt16LE(i + 26);
    const extraLen = b.readUInt16LE(i + 28);
    const name = b.slice(i + 30, i + 30 + nameLen).toString("utf8");
    const start = i + 30 + nameLen + extraLen;
    if (flags & 0x8) {
      throw new Error("Excel file uses unsupported zip streaming. Save as CSV or Excel XML and upload again.");
    }
    const data = b.slice(start, start + compSize);
    let raw = data;
    if (method === 8) raw = zlib.inflateRawSync(data);
    else if (method !== 0) throw new Error("Unsupported Excel compression");
    out[name] = raw;
    i = start + compSize;
  }
  return out;
}

function parseSharedStrings(xml) {
  const src = String(xml || "");
  const out = [];
  for (const m of src.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)) {
    const texts = [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((t) => decodeXml(t[1]));
    out.push(texts.join(""));
  }
  return out;
}

function parseXlsxSheet(sheetXml, shared) {
  const rows = [];
  const src = String(sheetXml || "");
  for (const rowM of src.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    const cells = [];
    for (const c of rowM[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^/]*)\/>/gi)) {
      const attrs = c[1] || c[3] || "";
      const inner = c[2] || "";
      const ref = (attrs.match(/\br="([A-Z]+)(\d+)"/i) || [])[1];
      if (!ref) continue;
      const idx = colLettersToIndex(ref);
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || "";
      let val = "";
      if (type === "s") {
        const v = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i);
        val = shared[Number(v?.[1] ?? -1)] || "";
      } else if (type === "inlineStr") {
        const t = inner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/i);
        val = decodeXml(t?.[1] || "");
      } else {
        const v = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i);
        val = v ? decodeXml(v[1]) : "";
      }
      while (cells.length < idx) cells.push("");
      cells[idx] = val;
    }
    if (cells.some((c) => String(c || "").trim() !== "")) rows.push(cells);
  }
  return rows;
}

export function parseXlsx(buf) {
  const files = unzipEntries(buf);
  const sheetName = files["xl/worksheets/sheet1.xml"]
    ? "xl/worksheets/sheet1.xml"
    : Object.keys(files).find((n) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n)) ||
      "xl/worksheets/sheet1.xml";
  const sheet = files[sheetName];
  if (!sheet) throw new Error("Excel workbook has no worksheet");
  const shared = parseSharedStrings(String(files["xl/sharedStrings.xml"] || ""));
  return parseXlsxSheet(String(sheet), shared);
}

export function parseItemImportGrid(buf, filename = "") {
  const name = String(filename || "").toLowerCase();
  const raw = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
  if (!raw.length) throw new Error("Upload file is empty");
  if (raw[0] === 0x50 && raw[1] === 0x4b) return parseXlsx(raw);
  const text = raw.toString("utf8");
  if (name.endsWith(".csv") || (!text.includes("<Workbook") && !text.includes("<worksheet") && text.includes(","))) {
    return parseCsv(text);
  }
  if (/<Workbook\b/i.test(text) || /urn:schemas-microsoft-com:office:spreadsheet/i.test(text)) {
    return parseSpreadsheetMl(text);
  }
  return parseCsv(text);
}

export function mapItemImportRows(grid) {
  if (!Array.isArray(grid) || !grid.length) throw new Error("Excel has no rows");
  const header = grid[0].map((h) => headerKey(h));
  if (!header.includes("name")) throw new Error("First row must include a Name column");
  const out = [];
  for (let i = 1; i < grid.length; i++) {
    if (out.length >= ITEM_IMPORT_MAX_ROWS) break;
    const raw = grid[i] || [];
    const row = {};
    header.forEach((key, idx) => {
      if (!key) return;
      row[key] = raw[idx] == null ? "" : String(raw[idx]).trim();
    });
    if (!row.name && !row.code) continue;
    row._line = i + 1;
    out.push(row);
  }
  if (!out.length) throw new Error("No item rows found. Keep the header row and add names below it.");
  return out;
}

export function itemImportStockToBase(stock, unit) {
  if (stock == null || String(stock).trim() === "") return null;
  const n = Number(stock);
  if (!Number.isFinite(n)) return null;
  return POSUnits.toBase(n, unit);
}

export function itemBodyFromImportRow(row, biz) {
  const footwear = POSFootwear.isFootwearShop(biz || {});
  const unit = POSUnits.normalize(row.unit || POSFootwear.defaultUnit(biz || {}));
  const stock = itemImportStockToBase(row.stock, unit);
  const gstRaw = row.gst;
  const body = {
    name: String(row.name || "").trim(),
    hsn: String(row.hsn || "").trim(),
    category: String(row.category || "").trim() || POSFootwear.defaultCategory(biz || {}),
    subcategory: String(row.subcategory || "").trim(),
    base_unit: unit,
    unit,
    barcode: String(row.barcode || "").trim(),
    mfr_barcode: String(row.mfr_barcode || "").trim(),
    color: String(row.color || "").trim(),
    size: String(row.size || "").trim(),
    wearer_type: POSFootwear.normalizeWearer(row.wearer_type),
    code: String(row.code || "").trim(),
  };
  if (row.mrp !== "" && row.mrp != null) body.mrp = Number(row.mrp) || 0;
  if (gstRaw !== "" && gstRaw != null) body.gst_rate = Number(gstRaw);
  else body.gst_rate = 5;
  if (row.retail !== "" && row.retail != null) body.retail_rate = Number(row.retail) || 0;
  if (row.b2b !== "" && row.b2b != null) body.b2b_rate = Number(row.b2b) || 0;
  if (row.purchase !== "" && row.purchase != null) body.purchase_rate = Number(row.purchase) || 0;
  if (stock != null) body.stock_gm = stock;
  if (footwear && !body.category) body.category = "Footwear";
  return body;
}

export function decodeImportUpload(body) {
  if (Array.isArray(body?.rows)) return { rows: body.rows, filename: "rows.json" };
  const filename = String(body?.filename || body?.name || "items.xlsx");
  const content = body?.content ?? body?.file ?? body?.data ?? "";
  if (typeof content !== "string" || !content.trim()) throw new Error("Choose an Excel or CSV file");
  let buf;
  try {
    buf = Buffer.from(content.replace(/^data:[^;]+;base64,/, ""), "base64");
  } catch {
    throw new Error("Could not read the upload");
  }
  if (!buf.length) throw new Error("Upload file is empty");
  if (buf.length > ITEM_IMPORT_MAX_BYTES) throw new Error("File is too large (max 2 MB)");
  return { buf, filename };
}
