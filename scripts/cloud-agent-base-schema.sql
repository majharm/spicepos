-- Base MySQL schema for fresh Cloud Agent / local MariaDB installs.
-- Production Hostinger databases are created separately; this bootstraps empty spicepos DBs.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS businesses (
  id VARCHAR(255) PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  owner_name VARCHAR(255) NULL,
  mobile VARCHAR(32) NULL,
  email VARCHAR(255) NULL,
  address TEXT NULL,
  gstin VARCHAR(32) NULL,
  business_type VARCHAR(64) NULL,
  logo_url MEDIUMTEXT NULL,
  plan_id VARCHAR(255) NULL,
  subscription_expires_at DATE NULL,
  invoice_footer TEXT NULL,
  invoice_terms TEXT NULL,
  max_branches INT NULL,
  max_users INT NULL,
  max_devices INT NULL,
  category VARCHAR(128) NULL,
  pan VARCHAR(16) NULL,
  city VARCHAR(128) NULL,
  state VARCHAR(64) NULL,
  pin_code VARCHAR(12) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX (status),
  INDEX (plan_id)
);

CREATE TABLE IF NOT EXISTS company_settings (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT NULL,
  phone VARCHAR(32) NULL,
  email VARCHAR(255) NULL,
  gstin VARCHAR(32) NULL,
  pan VARCHAR(16) NULL,
  city VARCHAR(128) NULL,
  state VARCHAR(64) NULL,
  pincode VARCHAR(12) NULL,
  logo_url MEDIUMTEXT NULL,
  timezone VARCHAR(64) NULL,
  tz_offset VARCHAR(8) NULL,
  business_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_company_biz (business_id)
);

CREATE TABLE IF NOT EXISTS staff_users (
  id VARCHAR(255) PRIMARY KEY,
  clerk_user_id VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  first_name VARCHAR(255) NULL,
  last_name VARCHAR(255) NULL,
  role VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  password_hash VARCHAR(255) NOT NULL,
  business_id VARCHAR(255) NOT NULL,
  branch_id VARCHAR(255) NULL,
  permissions_json TEXT NULL,
  mobile VARCHAR(32) NULL,
  username VARCHAR(64) NULL,
  failed_logins INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX (business_id),
  INDEX (email),
  INDEX (username)
);

CREATE TABLE IF NOT EXISTS staff_sessions (
  id VARCHAR(255) PRIMARY KEY,
  staff_user_id VARCHAR(255) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  business_id VARCHAR(255) NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  branch_id VARCHAR(255) NULL,
  impersonator_admin_id VARCHAR(255) NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  revoked_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_staff_token (token_hash),
  INDEX (staff_user_id),
  INDEX (business_id)
);

CREATE TABLE IF NOT EXISTS staff_audit_logs (
  id VARCHAR(255) PRIMARY KEY,
  actor_clerk_user_id VARCHAR(255) NULL,
  actor_name VARCHAR(255) NULL,
  module VARCHAR(64) NULL,
  target_id VARCHAR(255) NULL,
  target_name VARCHAR(255) NULL,
  action VARCHAR(255) NULL,
  details TEXT NULL,
  business_id VARCHAR(255) NULL,
  branch_id VARCHAR(255) NULL,
  ip VARCHAR(64) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX (business_id),
  INDEX (created_at)
);

CREATE TABLE IF NOT EXISTS items (
  id VARCHAR(255) PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  local_name VARCHAR(255) NULL,
  category VARCHAR(128) NULL,
  subcategory VARCHAR(128) NULL,
  color VARCHAR(64) NULL,
  size VARCHAR(32) NULL,
  wearer_type VARCHAR(16) NULL,
  base_unit VARCHAR(32) NOT NULL DEFAULT 'GM',
  unit VARCHAR(32) NULL,
  purchase_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  retail_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  b2b_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  gst_rate DECIMAL(5,2) NOT NULL DEFAULT 5,
  hsn VARCHAR(32) NULL,
  barcode VARCHAR(64) NULL,
  mrp DECIMAL(12,2) NULL,
  brand VARCHAR(128) NULL,
  image_url MEDIUMTEXT NULL,
  stock_gm DECIMAL(14,3) NOT NULL DEFAULT 0,
  reorder_level_gm DECIMAL(14,3) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  business_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX (business_id),
  INDEX (code),
  INDEX (barcode)
);

CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(255) PRIMARY KEY,
  code VARCHAR(64) NULL,
  name VARCHAR(255) NOT NULL,
  business_name VARCHAR(255) NULL,
  mobile VARCHAR(32) NULL,
  type VARCHAR(16) NOT NULL DEFAULT 'b2c',
  gstin VARCHAR(32) NULL,
  state VARCHAR(64) NULL,
  dob DATE NULL,
  referred_by VARCHAR(255) NULL,
  credit_limit DECIMAL(12,2) NOT NULL DEFAULT 0,
  outstanding DECIMAL(12,2) NOT NULL DEFAULT 0,
  business_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX (business_id)
);

CREATE TABLE IF NOT EXISTS packs (
  id VARCHAR(255) PRIMARY KEY,
  code VARCHAR(64) NULL,
  name VARCHAR(255) NOT NULL,
  total_quantity_gm DECIMAL(14,3) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  business_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX (business_id)
);

CREATE TABLE IF NOT EXISTS pack_items (
  id VARCHAR(255) PRIMARY KEY,
  pack_id VARCHAR(255) NOT NULL,
  item_id VARCHAR(255) NOT NULL,
  quantity_gm DECIMAL(14,3) NOT NULL DEFAULT 0,
  retail_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  b2b_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  business_id VARCHAR(255) NOT NULL,
  INDEX (pack_id),
  INDEX (business_id)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id VARCHAR(255) PRIMARY KEY,
  code VARCHAR(64) NULL,
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255) NULL,
  mobile VARCHAR(32) NULL,
  email VARCHAR(255) NULL,
  address TEXT NULL,
  gstin VARCHAR(32) NULL,
  opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  payable_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  business_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX (business_id)
);

CREATE TABLE IF NOT EXISTS purchases (
  id VARCHAR(255) PRIMARY KEY,
  purchase_number VARCHAR(32) NOT NULL,
  supplier_id VARCHAR(255) NULL,
  supplier_name VARCHAR(255) NULL,
  supplier_invoice_number VARCHAR(64) NULL,
  purchase_date DATE NOT NULL,
  notes TEXT NULL,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  gst DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(32) NOT NULL DEFAULT 'cash',
  payment_status VARCHAR(32) NOT NULL DEFAULT 'paid',
  branch_id VARCHAR(255) NULL,
  business_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX (business_id),
  INDEX (purchase_date)
);

CREATE TABLE IF NOT EXISTS purchase_lines (
  id VARCHAR(255) PRIMARY KEY,
  purchase_id VARCHAR(255) NOT NULL,
  item_id VARCHAR(255) NOT NULL,
  item_name VARCHAR(255) NULL,
  quantity_gm DECIMAL(14,3) NOT NULL DEFAULT 0,
  rate_per_kg DECIMAL(12,4) NOT NULL DEFAULT 0,
  gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  gst_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  batch_no VARCHAR(64) NULL,
  barcode VARCHAR(64) NULL,
  expiry_date DATE NULL,
  mrp DECIMAL(12,2) NULL,
  business_id VARCHAR(255) NOT NULL,
  INDEX (purchase_id),
  INDEX (business_id)
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id VARCHAR(255) PRIMARY KEY,
  order_number VARCHAR(32) NOT NULL,
  customer_id VARCHAR(255) NULL,
  customer_name VARCHAR(255) NULL,
  customer_type VARCHAR(16) NULL,
  pack_id VARCHAR(255) NULL,
  pack_name VARCHAR(255) NULL,
  pack_count INT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'confirmed',
  total_quantity_gm DECIMAL(14,3) NOT NULL DEFAULT 0,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_type VARCHAR(16) NOT NULL DEFAULT 'amt',
  discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  gst DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(32) NULL,
  payment_status VARCHAR(32) NOT NULL DEFAULT 'paid',
  branch_id VARCHAR(255) NULL,
  device_id VARCHAR(255) NULL,
  cashier_id VARCHAR(255) NULL,
  held TINYINT NOT NULL DEFAULT 0,
  loyalty_points_redeemed INT NOT NULL DEFAULT 0,
  loyalty_points_earned INT NOT NULL DEFAULT 0,
  loyalty_discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  business_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX (business_id),
  INDEX (order_number)
);

CREATE TABLE IF NOT EXISTS sales_order_lines (
  id VARCHAR(255) PRIMARY KEY,
  order_id VARCHAR(255) NOT NULL,
  item_id VARCHAR(255) NOT NULL,
  item_name VARCHAR(255) NULL,
  quantity_gm DECIMAL(14,3) NOT NULL DEFAULT 0,
  rate_per_kg DECIMAL(12,4) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_type VARCHAR(16) NOT NULL DEFAULT 'amt',
  discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  cancelled TINYINT NOT NULL DEFAULT 0,
  mrp DECIMAL(12,2) NOT NULL DEFAULT 0,
  barcode VARCHAR(64) NULL,
  batch_id VARCHAR(255) NULL,
  cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  profit DECIMAL(12,2) NOT NULL DEFAULT 0,
  business_id VARCHAR(255) NOT NULL,
  INDEX (order_id),
  INDEX (business_id)
);

CREATE TABLE IF NOT EXISTS number_sequences (
  name VARCHAR(64) NOT NULL,
  next_value INT NOT NULL DEFAULT 1,
  business_id VARCHAR(255) NOT NULL,
  PRIMARY KEY (name, business_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id VARCHAR(255) PRIMARY KEY,
  business_id VARCHAR(255) NOT NULL,
  branch_id VARCHAR(255) NULL,
  item_id VARCHAR(255) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  quantity_gm DECIMAL(14,3) NOT NULL,
  note VARCHAR(255) NULL,
  created_by VARCHAR(255) NULL,
  barcode VARCHAR(64) NULL,
  batch_id VARCHAR(255) NULL,
  unit_cost DECIMAL(12,4) NOT NULL DEFAULT 0,
  reason VARCHAR(64) NULL,
  ref_type VARCHAR(32) NULL,
  ref_id VARCHAR(255) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX (business_id),
  INDEX (item_id)
);
