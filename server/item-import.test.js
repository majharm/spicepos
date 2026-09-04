import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";
import {
  ITEM_IMPORT_HEADERS,
  itemBodyFromImportRow,
  itemImportStockToBase,
  itemImportTemplateXml,
  mapItemImportRows,
  parseCsv,
  parseItemImportGrid,
  parseSpreadsheetMl,
  parseXlsx,
} from "./item-import.js";
import { workbookXml } from "./excel.js";

test("CSV item import maps Name and GST percent headers", () => {
  const grid = parseCsv(`Name,GST %,Unit,Stock,Retail\nChilli powder,5,GM,2000,180\n`);
  const rows = mapItemImportRows(grid);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Chilli powder");
  assert.equal(rows[0].gst, "5");
  const body = itemBodyFromImportRow(rows[0], { business_type: "spice" });
  assert.equal(body.unit, "GM");
  assert.equal(body.stock_gm, 2000);
  assert.equal(body.retail_rate, 180);
});

test("SpreadsheetML template round-trips through the parser", () => {
  const xml = itemImportTemplateXml();
  assert.match(xml, /ss:Name="Items"/);
  const grid = parseSpreadsheetMl(xml);
  assert.equal(grid[0][0], "Name");
  assert.ok(grid.every((r) => r[0] !== "Field"));
  const rows = mapItemImportRows(grid);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Turmeric powder");
  assert.equal(rows[1].unit, "PCS");
  assert.equal(itemBodyFromImportRow(rows[1], {}).stock_gm, 24);
});

test("KG stock converts to base grams", () => {
  assert.equal(itemImportStockToBase(2, "KG"), 2000);
  assert.equal(itemImportStockToBase(12, "PCS"), 12);
});

test("xlsx zip with shared strings parses the first sheet", () => {
  const shared = `<?xml version="1.0"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3">
  <si><t>Name</t></si><si><t>Unit</t></si><si><t>Black pepper</t></si>
</sst>`;
  const sheet = `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
    <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>GM</v></c></row>
  </sheetData>
</worksheet>`;
  const xlsx = zipStore({
    "xl/sharedStrings.xml": Buffer.from(shared),
    "xl/worksheets/sheet1.xml": Buffer.from(sheet),
  });
  const grid = parseXlsx(xlsx);
  const rows = mapItemImportRows(grid);
  assert.equal(rows[0].name, "Black pepper");
  assert.equal(rows[0].unit, "GM");
});

test("parseItemImportGrid reads workbook XML from filename .xls", () => {
  const xml = workbookXml([{ name: "Items", headers: ITEM_IMPORT_HEADERS, rows: [["Fenugreek", "", "", "", "GM"]] }]);
  const rows = mapItemImportRows(parseItemImportGrid(Buffer.from(xml), "items.xls"));
  assert.equal(rows[0].name, "Fenugreek");
});

test("import requires a Name column", () => {
  assert.throws(() => mapItemImportRows([["Nope"], ["x"]]), /Name column/);
});

function zipStore(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const comp = zlib.deflateRawSync(raw);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, comp);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(0, 12);
    cen.writeUInt32LE(0, 16);
    cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}
