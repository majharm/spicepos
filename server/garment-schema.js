import { query } from "./db.js";

async function columnExists(table, column) {
  const rows = await query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows.length > 0;
}

async function addColumn(table, column, ddl) {
  if (await columnExists(table, column)) return;
  await query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
}

async function widenVarchar(table, column, minLength, { nullable = true } = {}) {
  const rows = await query(
    `SELECT CHARACTER_MAXIMUM_LENGTH AS len FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  const len = Number(rows[0]?.len);
  if (!rows[0] || (Number.isFinite(len) && len >= minLength)) return;
  const nullSql = nullable ? "NULL" : "NOT NULL";
  await query(`ALTER TABLE \`${table}\` MODIFY \`${column}\` VARCHAR(${minLength}) ${nullSql}`);
}

export async function ensureGarmentSchema() {
  await addColumn("company_settings", "business_category", "business_category VARCHAR(40) NOT NULL DEFAULT 'pharmacy'");
  await addColumn("items", "colour", "colour VARCHAR(80) NULL");
  await addColumn("items", "size_chart", "size_chart VARCHAR(32) NULL");
  await addColumn("items", "sizes_json", "sizes_json TEXT NULL");
  await addColumn("purchase_lines", "colour", "colour VARCHAR(80) NULL");
  await addColumn("purchase_lines", "size_quantities", "size_quantities TEXT NULL");
  await addColumn("purchase_lines", "generate_barcodes", "generate_barcodes TINYINT NOT NULL DEFAULT 0");
  await addColumn("sales_order_lines", "colour", "colour VARCHAR(80) NULL");
  await addColumn("sales_order_lines", "size", "size VARCHAR(32) NULL");
  await addColumn("sales_order_lines", "piece_barcode", "piece_barcode VARCHAR(128) NULL");
  await addColumn("sales_return_lines", "colour", "colour VARCHAR(80) NULL");
  await addColumn("sales_return_lines", "size", "size VARCHAR(32) NULL");
  await addColumn("sales_return_lines", "piece_barcode", "piece_barcode VARCHAR(64) NULL");

  await query(`CREATE TABLE IF NOT EXISTS item_size_stock (
    id VARCHAR(36) PRIMARY KEY,
    business_id VARCHAR(36) NOT NULL,
    item_id VARCHAR(36) NOT NULL,
    colour VARCHAR(80) NOT NULL DEFAULT '',
    size VARCHAR(32) NOT NULL,
    qty DECIMAL(14,3) NOT NULL DEFAULT 0,
    UNIQUE KEY uq_item_size (business_id, item_id, colour, size),
    INDEX idx_item_size_item (item_id)
  )`);

  await widenVarchar("item_piece_barcodes", "barcode", 128, { nullable: false });
  await widenVarchar("sales_order_lines", "piece_barcode", 128);
  await widenVarchar("sales_return_lines", "piece_barcode", 128);

  await query(`CREATE TABLE IF NOT EXISTS item_piece_barcodes (
    id VARCHAR(36) PRIMARY KEY,
    business_id VARCHAR(36) NOT NULL,
    barcode VARCHAR(128) NOT NULL,
    item_id VARCHAR(36) NOT NULL,
    colour VARCHAR(80) NOT NULL DEFAULT '',
    size VARCHAR(32) NOT NULL,
    purchase_id VARCHAR(36) NULL,
    purchase_line_id VARCHAR(36) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'in_stock',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_piece_barcode (business_id, barcode),
    INDEX idx_piece_item (item_id, size, colour),
    INDEX idx_piece_purchase (purchase_id)
  )`);
}
