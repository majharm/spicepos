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

export async function ensurePharmacySchema() {
  await addColumn("items", "generic_name", "generic_name VARCHAR(255) NULL");
  await addColumn("items", "medicine_type", "medicine_type VARCHAR(64) NULL");
  await addColumn("items", "manufacturer", "manufacturer VARCHAR(160) NULL");
  await addColumn("items", "pack_size", "pack_size VARCHAR(80) NULL");
  await addColumn("items", "pack_unit", "pack_unit VARCHAR(40) NULL");
  await addColumn("items", "units_per_pack", "units_per_pack INT NOT NULL DEFAULT 1");
  await addColumn("items", "mrp", "mrp DECIMAL(12,2) NOT NULL DEFAULT 0");
  await addColumn("items", "selling_price", "selling_price DECIMAL(12,2) NULL");
  await addColumn("items", "barcode", "barcode VARCHAR(64) NULL");
  await addColumn("items", "default_expiry", "default_expiry DATE NULL");

  await addColumn("suppliers", "firm_name", "firm_name VARCHAR(160) NULL");
  await addColumn("suppliers", "drug_licence_no", "drug_licence_no VARCHAR(80) NULL");
  await addColumn("suppliers", "pan", "pan VARCHAR(20) NULL");
  await addColumn("suppliers", "fssai_licence_no", "fssai_licence_no VARCHAR(80) NULL");
  await addColumn("suppliers", "licence_expiry", "licence_expiry DATE NULL");
  await addColumn("suppliers", "state", "state VARCHAR(80) NULL");
  await addColumn("suppliers", "state_code", "state_code VARCHAR(8) NULL");
  await addColumn("suppliers", "city", "city VARCHAR(80) NULL");
  await addColumn("suppliers", "pincode", "pincode VARCHAR(12) NULL");

  await addColumn("purchases", "due_date", "due_date DATE NULL");
  await addColumn("purchases", "purchase_order_no", "purchase_order_no VARCHAR(64) NULL");
  await addColumn("purchases", "eway_bill_no", "eway_bill_no VARCHAR(64) NULL");
  await addColumn("purchases", "cgst", "cgst DECIMAL(12,2) NOT NULL DEFAULT 0");
  await addColumn("purchases", "sgst", "sgst DECIMAL(12,2) NOT NULL DEFAULT 0");
  await addColumn("purchases", "igst", "igst DECIMAL(12,2) NOT NULL DEFAULT 0");
  await addColumn("purchases", "discount", "discount DECIMAL(12,2) NOT NULL DEFAULT 0");

  await addColumn("purchase_lines", "generic_name", "generic_name VARCHAR(255) NULL");
  await addColumn("purchase_lines", "manufacturer", "manufacturer VARCHAR(160) NULL");
  await addColumn("purchase_lines", "hsn", "hsn VARCHAR(32) NULL");
  await addColumn("purchase_lines", "batch_no", "batch_no VARCHAR(64) NULL");
  await addColumn("purchase_lines", "expiry_date", "expiry_date DATE NULL");
  await addColumn("purchase_lines", "pack_type", "pack_type VARCHAR(40) NULL");
  await addColumn("purchase_lines", "pack_qty", "pack_qty DECIMAL(12,3) NOT NULL DEFAULT 0");
  await addColumn("purchase_lines", "units_per_pack", "units_per_pack INT NOT NULL DEFAULT 1");
  await addColumn("purchase_lines", "total_qty", "total_qty DECIMAL(12,3) NOT NULL DEFAULT 0");
  await addColumn("purchase_lines", "free_qty", "free_qty DECIMAL(12,3) NOT NULL DEFAULT 0");
  await addColumn("purchase_lines", "mrp", "mrp DECIMAL(12,2) NOT NULL DEFAULT 0");
  await addColumn("purchase_lines", "discount", "discount DECIMAL(12,2) NOT NULL DEFAULT 0");
  await addColumn("purchase_lines", "cgst", "cgst DECIMAL(12,2) NOT NULL DEFAULT 0");
  await addColumn("purchase_lines", "sgst", "sgst DECIMAL(12,2) NOT NULL DEFAULT 0");
  await addColumn("purchase_lines", "igst", "igst DECIMAL(12,2) NOT NULL DEFAULT 0");

  await addColumn("customers", "address", "address VARCHAR(255) NULL");

  await addColumn("sales_orders", "doctor_name", "doctor_name VARCHAR(160) NULL");
  await addColumn("sales_orders", "prescription_no", "prescription_no VARCHAR(80) NULL");
  await addColumn("sales_orders", "customer_mobile", "customer_mobile VARCHAR(32) NULL");
  await addColumn("sales_orders", "customer_address", "customer_address VARCHAR(255) NULL");
  await addColumn("sales_orders", "cgst", "cgst DECIMAL(12,2) NOT NULL DEFAULT 0");
  await addColumn("sales_orders", "sgst", "sgst DECIMAL(12,2) NOT NULL DEFAULT 0");
  await addColumn("sales_orders", "igst", "igst DECIMAL(12,2) NOT NULL DEFAULT 0");
  await addColumn("sales_orders", "round_off", "round_off DECIMAL(12,2) NOT NULL DEFAULT 0");
  await addColumn("sales_orders", "amount_paid", "amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0");

  await addColumn("sales_order_lines", "batch_id", "batch_id VARCHAR(36) NULL");
  await addColumn("sales_order_lines", "batch_no", "batch_no VARCHAR(64) NULL");
  await addColumn("sales_order_lines", "expiry_date", "expiry_date DATE NULL");
  await addColumn("sales_order_lines", "pack_type", "pack_type VARCHAR(40) NULL");
  await addColumn("sales_order_lines", "mrp", "mrp DECIMAL(12,2) NOT NULL DEFAULT 0");
  await addColumn("sales_order_lines", "cgst", "cgst DECIMAL(12,2) NOT NULL DEFAULT 0");
  await addColumn("sales_order_lines", "sgst", "sgst DECIMAL(12,2) NOT NULL DEFAULT 0");
  await addColumn("sales_order_lines", "igst", "igst DECIMAL(12,2) NOT NULL DEFAULT 0");
  await addColumn("sales_order_lines", "hsn", "hsn VARCHAR(32) NULL");

  await addColumn("company_settings", "drug_licence_no", "drug_licence_no VARCHAR(80) NULL");
  await addColumn("company_settings", "drug_licence_type", "drug_licence_type VARCHAR(80) NULL");
  await addColumn("company_settings", "fssai_licence_no", "fssai_licence_no VARCHAR(80) NULL");
  await addColumn("company_settings", "pharmacy_registration_no", "pharmacy_registration_no VARCHAR(80) NULL");
  await addColumn("company_settings", "other_licence_no", "other_licence_no VARCHAR(80) NULL");
  await addColumn("company_settings", "licence_expiry", "licence_expiry DATE NULL");
  await addColumn("company_settings", "state", "state VARCHAR(80) NULL");
  await addColumn("company_settings", "state_code", "state_code VARCHAR(8) NULL");

  await query(`CREATE TABLE IF NOT EXISTS item_batches (
    id VARCHAR(36) PRIMARY KEY,
    business_id VARCHAR(36) NOT NULL,
    item_id VARCHAR(36) NOT NULL,
    batch_no VARCHAR(64) NOT NULL,
    expiry_date DATE NULL,
    qty DECIMAL(14,3) NOT NULL DEFAULT 0,
    mrp DECIMAL(12,2) NOT NULL DEFAULT 0,
    purchase_rate DECIMAL(12,4) NOT NULL DEFAULT 0,
    purchase_id VARCHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_item_batch (business_id, item_id, batch_no),
    INDEX idx_item_batches_item (item_id, expiry_date),
    INDEX idx_item_batches_expiry (business_id, expiry_date)
  )`);

  await query(`CREATE TABLE IF NOT EXISTS sales_returns (
    id VARCHAR(36) PRIMARY KEY,
    return_number VARCHAR(32) NOT NULL,
    order_id VARCHAR(36) NOT NULL,
    order_number VARCHAR(32) NULL,
    customer_name VARCHAR(160) NULL,
    reason VARCHAR(255) NULL,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    business_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_return_number (business_id, return_number),
    INDEX idx_returns_order (order_id)
  )`);

  await query(`CREATE TABLE IF NOT EXISTS sales_return_lines (
    id VARCHAR(36) PRIMARY KEY,
    return_id VARCHAR(36) NOT NULL,
    order_line_id VARCHAR(36) NULL,
    item_id VARCHAR(36) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    batch_id VARCHAR(36) NULL,
    batch_no VARCHAR(64) NULL,
    quantity DECIMAL(14,3) NOT NULL,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    business_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_return_lines_return (return_id)
  )`);
}
