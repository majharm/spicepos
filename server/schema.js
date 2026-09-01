import { query } from "./db.js";
import { hashPassword } from "./password.js";
import { defaultPerms } from "./roles.js";

async function hasTable(table) {
  const rows = await query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return rows.length > 0;
}

async function hasColumn(table, column) {
  const rows = await query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows.length > 0;
}

async function addColumn(table, column, def) {
  if (!(await hasTable(table))) return;
  if (!(await hasColumn(table, column))) {
    await query(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${def}`);
  }
}

async function create(sql) {
  await query(sql);
}

async function createBaseTables() {
  await create(`CREATE TABLE IF NOT EXISTS businesses (
    id VARCHAR(255) PRIMARY KEY,
    code VARCHAR(64) NULL,
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
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS company_settings (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT NULL,
    phone VARCHAR(32) NULL,
    email VARCHAR(255) NULL,
    gstin VARCHAR(32) NULL,
    logo_url MEDIUMTEXT NULL,
    pan VARCHAR(16) NULL,
    city VARCHAR(128) NULL,
    state VARCHAR(64) NULL,
    pincode VARCHAR(12) NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS staff_users (
    id VARCHAR(255) PRIMARY KEY,
    clerk_user_id VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(255) NULL,
    last_name VARCHAR(255) NULL,
    role VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    password_hash VARCHAR(255) NOT NULL,
    business_id VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255) NULL,
    permissions_json TEXT NULL,
    username VARCHAR(64) NULL,
    mobile VARCHAR(32) NULL,
    failed_logins INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX (business_id),
    INDEX (email)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS staff_sessions (
    id VARCHAR(255) PRIMARY KEY,
    staff_user_id VARCHAR(255) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP(3) NOT NULL,
    business_id VARCHAR(255) NOT NULL,
    ip VARCHAR(64) NULL,
    user_agent VARCHAR(255) NULL,
    branch_id VARCHAR(255) NULL,
    revoked_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (staff_user_id),
    INDEX (business_id)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS staff_audit_logs (
    id VARCHAR(255) PRIMARY KEY,
    actor_clerk_user_id VARCHAR(255) NULL,
    actor_name VARCHAR(255) NULL,
    module VARCHAR(64) NULL,
    target_id VARCHAR(255) NULL,
    target_name VARCHAR(255) NULL,
    action VARCHAR(255) NOT NULL,
    details TEXT NULL,
    business_id VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255) NULL,
    ip VARCHAR(64) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS items (
    id VARCHAR(255) PRIMARY KEY,
    code VARCHAR(64) NULL,
    name VARCHAR(255) NOT NULL,
    local_name VARCHAR(255) NULL,
    category VARCHAR(128) NULL,
    subcategory VARCHAR(128) NULL,
    base_unit VARCHAR(32) NULL,
    purchase_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    retail_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    b2b_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
    hsn VARCHAR(32) NULL,
    stock_gm DECIMAL(14,3) NOT NULL DEFAULT 0,
    reorder_level_gm DECIMAL(14,3) NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    business_id VARCHAR(255) NOT NULL,
    unit VARCHAR(32) NULL,
    barcode VARCHAR(64) NULL,
    brand VARCHAR(128) NULL,
    image_url MEDIUMTEXT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS customers (
    id VARCHAR(255) PRIMARY KEY,
    code VARCHAR(64) NULL,
    name VARCHAR(255) NOT NULL,
    business_name VARCHAR(255) NULL,
    mobile VARCHAR(32) NULL,
    type VARCHAR(16) NOT NULL DEFAULT 'b2c',
    gstin VARCHAR(32) NULL,
    credit_limit DECIMAL(12,2) NOT NULL DEFAULT 0,
    outstanding DECIMAL(12,2) NOT NULL DEFAULT 0,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS number_sequences (
    name VARCHAR(64) NOT NULL,
    next_value INT NOT NULL DEFAULT 1,
    business_id VARCHAR(255) NOT NULL,
    PRIMARY KEY (name, business_id)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS sales_orders (
    id VARCHAR(255) PRIMARY KEY,
    order_number VARCHAR(64) NOT NULL,
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
    gst DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(32) NULL,
    payment_status VARCHAR(32) NULL,
    business_id VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255) NULL,
    device_id VARCHAR(255) NULL,
    cashier_id VARCHAR(255) NULL,
    held TINYINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS sales_order_lines (
    id VARCHAR(255) PRIMARY KEY,
    order_id VARCHAR(255) NOT NULL,
    item_id VARCHAR(255) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity_gm DECIMAL(14,3) NOT NULL DEFAULT 0,
    rate_per_kg DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
    cancelled TINYINT NOT NULL DEFAULT 0,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (order_id),
    INDEX (business_id)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS purchases (
    id VARCHAR(255) PRIMARY KEY,
    purchase_number VARCHAR(64) NOT NULL,
    supplier_id VARCHAR(255) NULL,
    supplier_name VARCHAR(255) NULL,
    supplier_invoice_number VARCHAR(64) NULL,
    purchase_date DATE NULL,
    notes TEXT NULL,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(32) NULL,
    payment_status VARCHAR(32) NULL,
    business_id VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS purchase_lines (
    id VARCHAR(255) PRIMARY KEY,
    purchase_id VARCHAR(255) NOT NULL,
    item_id VARCHAR(255) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity_gm DECIMAL(14,3) NOT NULL DEFAULT 0,
    rate_per_kg DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (purchase_id),
    INDEX (business_id)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS packs (
    id VARCHAR(255) PRIMARY KEY,
    code VARCHAR(64) NULL,
    name VARCHAR(255) NOT NULL,
    total_quantity_gm DECIMAL(14,3) NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS pack_items (
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
  )`);

  await create(`CREATE TABLE IF NOT EXISTS suppliers (
    id VARCHAR(255) PRIMARY KEY,
    code VARCHAR(64) NULL,
    name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255) NULL,
    mobile VARCHAR(32) NULL,
    email VARCHAR(255) NULL,
    address TEXT NULL,
    gstin VARCHAR(32) NULL,
    opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);
}

export async function ensureSchema() {
  await createBaseTables();
  await addColumn("businesses", "owner_name", "VARCHAR(255) NULL");
  await addColumn("businesses", "mobile", "VARCHAR(32) NULL");
  await addColumn("businesses", "email", "VARCHAR(255) NULL");
  await addColumn("businesses", "address", "TEXT NULL");
  await addColumn("businesses", "gstin", "VARCHAR(32) NULL");
  await addColumn("businesses", "business_type", "VARCHAR(64) NULL");
  await addColumn("businesses", "logo_url", "MEDIUMTEXT NULL");
  await addColumn("businesses", "plan_id", "VARCHAR(255) NULL");
  await addColumn("businesses", "subscription_expires_at", "DATE NULL");
  await addColumn("businesses", "invoice_footer", "TEXT NULL");
  await addColumn("businesses", "invoice_terms", "TEXT NULL");
  await addColumn("businesses", "max_branches", "INT NULL");
  await addColumn("businesses", "max_users", "INT NULL");
  await addColumn("businesses", "max_devices", "INT NULL");
  await addColumn("businesses", "category", "VARCHAR(128) NULL");
  await addColumn("businesses", "pan", "VARCHAR(16) NULL");
  await addColumn("businesses", "city", "VARCHAR(128) NULL");
  await addColumn("businesses", "state", "VARCHAR(64) NULL");
  await addColumn("businesses", "pin_code", "VARCHAR(12) NULL");

  await addColumn("company_settings", "gstin", "VARCHAR(32) NULL");
  await addColumn("company_settings", "logo_url", "MEDIUMTEXT NULL");
  await addColumn("company_settings", "pan", "VARCHAR(16) NULL");
  await addColumn("company_settings", "city", "VARCHAR(128) NULL");
  await addColumn("company_settings", "state", "VARCHAR(64) NULL");
  await addColumn("company_settings", "pincode", "VARCHAR(12) NULL");

  await addColumn("staff_users", "mobile", "VARCHAR(32) NULL");
  await addColumn("staff_users", "username", "VARCHAR(64) NULL");
  await addColumn("staff_users", "branch_id", "VARCHAR(255) NULL");
  await addColumn("staff_users", "permissions_json", "TEXT NULL");
  await addColumn("staff_users", "failed_logins", "INT NOT NULL DEFAULT 0");
  await addColumn("staff_users", "locked_until", "TIMESTAMP(3) NULL");

  await addColumn("staff_sessions", "ip", "VARCHAR(64) NULL");
  await addColumn("staff_sessions", "user_agent", "VARCHAR(255) NULL");
  await addColumn("staff_sessions", "branch_id", "VARCHAR(255) NULL");

  await addColumn("staff_audit_logs", "branch_id", "VARCHAR(255) NULL");
  await addColumn("staff_audit_logs", "ip", "VARCHAR(64) NULL");

  await addColumn("sales_orders", "branch_id", "VARCHAR(255) NULL");
  await addColumn("sales_orders", "device_id", "VARCHAR(255) NULL");
  await addColumn("sales_orders", "cashier_id", "VARCHAR(255) NULL");
  await addColumn("sales_orders", "held", "TINYINT NOT NULL DEFAULT 0");
  await addColumn("purchases", "branch_id", "VARCHAR(255) NULL");
  await addColumn("items", "barcode", "VARCHAR(64) NULL");
  await addColumn("items", "brand", "VARCHAR(128) NULL");
  await addColumn("items", "image_url", "MEDIUMTEXT NULL");
  await addColumn("items", "unit", "VARCHAR(32) NULL");

  await create(`CREATE TABLE IF NOT EXISTS platform_admins (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS platform_sessions (
    id VARCHAR(255) PRIMARY KEY,
    admin_id VARCHAR(255) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    ip VARCHAR(64) NULL,
    user_agent VARCHAR(255) NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    revoked_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS subscription_plans (
    id VARCHAR(255) PRIMARY KEY,
    code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(64) NOT NULL,
    max_branches INT NOT NULL DEFAULT 1,
    max_users INT NOT NULL DEFAULT 3,
    max_devices INT NOT NULL DEFAULT 2,
    max_products INT NOT NULL DEFAULT 500,
    max_invoices INT NOT NULL DEFAULT 1000,
    fee_monthly DECIMAL(12,2) NOT NULL DEFAULT 0,
    features_json TEXT NULL,
    active TINYINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  )`);
  await addColumn("subscription_plans", "fee_monthly", "DECIMAL(12,2) NOT NULL DEFAULT 0");

  await create(`CREATE TABLE IF NOT EXISTS branches (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    address TEXT NULL,
    phone VARCHAR(32) NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS pos_devices (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255) NULL,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    last_seen TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id),
    INDEX (branch_id)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS branch_stocks (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255) NOT NULL,
    item_id VARCHAR(255) NOT NULL,
    stock_gm DECIMAL(14,3) NOT NULL DEFAULT 0,
    UNIQUE KEY uniq_branch_item (branch_id, item_id),
    INDEX (business_id)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS stock_movements (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255) NULL,
    item_id VARCHAR(255) NOT NULL,
    kind VARCHAR(32) NOT NULL,
    quantity_gm DECIMAL(14,3) NOT NULL,
    note VARCHAR(255) NULL,
    created_by VARCHAR(255) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id),
    INDEX (item_id)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS held_bills (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255) NULL,
    user_id VARCHAR(255) NULL,
    label VARCHAR(128) NULL,
    payload_json MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS platform_settings (
    setting_key VARCHAR(64) PRIMARY KEY,
    setting_value TEXT NULL,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  )`);

  await query(
    `INSERT INTO platform_settings (setting_key, setting_value) VALUES ('support_phone', '')
     ON DUPLICATE KEY UPDATE setting_key = setting_key`,
  );
  await query(
    `INSERT INTO platform_settings (setting_key, setting_value) VALUES ('support_email', '')
     ON DUPLICATE KEY UPDATE setting_key = setting_key`,
  );

  await seedPlans();
}

async function seedPlans() {
  const plans = [
    ["trial", "TRIAL", 1, 2, 1, 50, 100, 0],
    ["basic", "BASIC", 1, 5, 2, 500, 1000, 999],
    ["standard", "STANDARD", 3, 15, 5, 2000, 5000, 2499],
    ["premium", "PREMIUM", 10, 40, 15, 10000, 20000, 4999],
    ["enterprise", "ENTERPRISE", 100, 500, 200, 100000, 1000000, 14999],
  ];
  for (const [id, name, b, u, d, p, inv, fee] of plans) {
    await query(
      `INSERT INTO subscription_plans
         (id, code, name, max_branches, max_users, max_devices, max_products, max_invoices, fee_monthly, active)
       VALUES (?,?,?,?,?,?,?,?,?,1)
       ON DUPLICATE KEY UPDATE name=VALUES(name), max_branches=VALUES(max_branches),
         max_users=VALUES(max_users), max_devices=VALUES(max_devices),
         max_products=VALUES(max_products), max_invoices=VALUES(max_invoices),
         fee_monthly = IF(fee_monthly = 0 AND VALUES(fee_monthly) > 0, VALUES(fee_monthly), fee_monthly)`,
      [id, name, name, b, u, d, p, inv, fee],
    );
  }
}

export async function seedPlatform() {
  const masterEmail = (process.env.MASTER_ADMIN_EMAIL || "master@atavpos.local").toLowerCase();
  const masterPass = process.env.MASTER_ADMIN_PASSWORD || "Master@12345";
  const [existing] = await query("SELECT id FROM platform_admins WHERE email = ?", [masterEmail]);
  if (!existing) {
    await query(
      `INSERT INTO platform_admins (id, name, email, password_hash, status)
       VALUES (?,?,?,?, 'active')`,
      [crypto.randomUUID(), "Platform Owner", masterEmail, await hashPassword(masterPass)],
    );
  }

  const swamiId = process.env.BUSINESS_ID || "00000000-0000-4000-8000-000000000001";
  const [swamiBiz] = await query("SELECT id FROM businesses WHERE id = ?", [swamiId]);
  if (!swamiBiz) {
    await query(
      `INSERT INTO businesses (
         id, code, name, status, owner_name, mobile, email, address, gstin,
         business_type, plan_id, subscription_expires_at, category, city, state, pin_code
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?, DATE_ADD(CURDATE(), INTERVAL 365 DAY),?,?,?,?)`,
      [
        swamiId,
        "SWAMI001",
        "SWAMI MASALE SASWAD",
        "active",
        "SWAMI MASALE",
        "9876543210",
        "swami@atavtelecom.in",
        "Saswad Baji Market, Purandhar, Pune 412301",
        null,
        "spice",
        "premium",
        "Whole Spices",
        "Pune",
        "Maharashtra",
        "412301",
      ],
    );
    await query(
      `INSERT INTO company_settings (id, name, address, phone, email, business_id)
       VALUES (?,?,?,?,?,?)`,
      [
        crypto.randomUUID(),
        "SWAMI MASALE SASWAD",
        "Saswad Baji Market, Purandhar, Pune 412301",
        "9876543210",
        "swami@atavtelecom.in",
        swamiId,
      ],
    );
    const swamiAdminId = crypto.randomUUID();
    const swamiPass = process.env.DEMO_TENANT_PASSWORD || "Demo@12345";
    const mainBranchSeed = crypto.randomUUID();
    await query(
      `INSERT INTO branches (id, business_id, name, address, status)
       VALUES (?,?,?,?, 'active')`,
      [mainBranchSeed, swamiId, "Main Branch", "Saswad Baji Market, Purandhar, Pune 412301"],
    );
    await query(
      `INSERT INTO staff_users (
         id, clerk_user_id, email, first_name, last_name, role, status, password_hash,
         business_id, branch_id, permissions_json, username
       ) VALUES (?,?,?,?,?,?, 'active', ?,?,?,?,?)`,
      [
        swamiAdminId,
        `local:${swamiAdminId}`,
        "swami@atavtelecom.in",
        "SWAMI",
        "Admin",
        "business_admin",
        await hashPassword(swamiPass),
        swamiId,
        mainBranchSeed,
        JSON.stringify(defaultPerms("business_admin")),
        "swamiadmin",
      ],
    );
    const spiceItems = [
      ["TUR-100", "Turmeric powder", "Whole Spices", 450, 5, 48000],
      ["SAF-001", "Saffron", "Whole Spices", 12000, 5, 6000],
      ["COR-100", "Coriander powder", "Whole Spices", 380, 5, 50000],
      ["CUM-100", "Cumin seeds", "Whole Spices", 520, 5, 40000],
    ];
    for (const [code, name, category, retail, gst, stock] of spiceItems) {
      await query(
        `INSERT INTO items (
           id, code, name, category, base_unit, purchase_rate, retail_rate, b2b_rate,
           gst_rate, stock_gm, reorder_level_gm, status, business_id, unit
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?, 'active', ?, 'GM')`,
        [
          crypto.randomUUID(),
          code,
          name,
          category,
          "GM",
          retail * 0.8,
          retail,
          retail * 0.9,
          gst,
          stock,
          1000,
          swamiId,
        ],
      );
    }
    await query(
      `INSERT INTO customers (id, code, name, mobile, type, outstanding, business_id)
       VALUES (?,?,?,?, 'b2c', 0, ?)`,
      [crypto.randomUUID(), "CUS-001", "Walk-in", "0000000001", swamiId],
    );
    await query(
      `INSERT INTO number_sequences (name, next_value, business_id) VALUES ('order', 10001, ?), ('customer', 2, ?), ('item', 5, ?)`,
      [swamiId, swamiId, swamiId],
    );
  }

  await query(
    `UPDATE businesses b
     JOIN company_settings c ON c.business_id = b.id
     SET b.name = c.name,
         b.address = COALESCE(b.address, c.address),
         b.email = COALESCE(b.email, c.email),
         b.mobile = COALESCE(b.mobile, c.phone),
         b.gstin = COALESCE(b.gstin, c.gstin),
         b.business_type = COALESCE(b.business_type, 'spice'),
         b.plan_id = COALESCE(b.plan_id, 'premium'),
         b.subscription_expires_at = COALESCE(b.subscription_expires_at, DATE_ADD(CURDATE(), INTERVAL 365 DAY)),
         b.status = COALESCE(NULLIF(b.status,''), 'active')
     WHERE b.id = ?`,
    [swamiId],
  );

  const branches = await query("SELECT id FROM branches WHERE business_id = ?", [swamiId]);
  let mainBranch = branches[0]?.id;
  if (!mainBranch) {
    mainBranch = crypto.randomUUID();
    await query(
      `INSERT INTO branches (id, business_id, name, address, status)
       VALUES (?,?,?,?, 'active')`,
      [mainBranch, swamiId, "Main Branch", "Saswad Baji Market, Purandhar, Pune 412301"],
    );
  }

  const devices = await query("SELECT id FROM pos_devices WHERE business_id = ?", [swamiId]);
  if (!devices.length) {
    await query(
      `INSERT INTO pos_devices (id, business_id, branch_id, name, code, status)
       VALUES (?,?,?,?,?, 'active')`,
      [crypto.randomUUID(), swamiId, mainBranch, "POS 01", "POS-01"],
    );
  }

  await query(
    `UPDATE staff_users SET role = 'business_admin'
     WHERE business_id = ? AND role = 'master_admin'`,
    [swamiId],
  );
  const perms = JSON.stringify(defaultPerms("business_admin"));
  await query(
    `UPDATE staff_users SET permissions_json = COALESCE(permissions_json, ?), branch_id = COALESCE(branch_id, ?)
     WHERE business_id = ?`,
    [perms, mainBranch, swamiId],
  );

  try {
  const demoBizId = "10000000-0000-4000-8000-000000000002";
  const [demo] = await query("SELECT id FROM businesses WHERE id = ?", [demoBizId]);
  if (!demo) {
    await query(
      `INSERT INTO businesses (id, code, name, status, owner_name, mobile, email, address, gstin, business_type, plan_id, subscription_expires_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?, DATE_ADD(CURDATE(), INTERVAL 30 DAY))`,
      [
        demoBizId,
        "DEMO002",
        "ABC Super Mart (Demo Tenant)",
        "active",
        "Demo Owner",
        "9999990002",
        "owner@abc-supermart.local",
        "Pune",
        null,
        "grocery",
        "trial",
      ],
    );
    await query(
      `INSERT INTO company_settings (id, name, address, phone, email, business_id)
       VALUES (?,?,?,?,?,?)`,
      [crypto.randomUUID(), "ABC Super Mart", "Pune", "9999990002", "owner@abc-supermart.local", demoBizId],
    );
    const demoBranch = crypto.randomUUID();
    await query(
      `INSERT INTO branches (id, business_id, name, status) VALUES (?,?,?, 'active')`,
      [demoBranch, demoBizId, "Main Branch"],
    );
    const adminId = crypto.randomUUID();
    const demoPass = process.env.DEMO_TENANT_PASSWORD || "Demo@12345";
    await query(
      `INSERT INTO staff_users (
         id, clerk_user_id, email, first_name, last_name, role, status, password_hash,
         business_id, branch_id, permissions_json, username
       ) VALUES (?,?,?,?,?,?, 'active', ?,?,?,?,?)`,
      [
        adminId,
        `local:${adminId}`,
        "admin@abc-supermart.local",
        "ABC",
        "Admin",
        "business_admin",
        await hashPassword(demoPass),
        demoBizId,
        demoBranch,
        JSON.stringify(defaultPerms("business_admin")),
        "abcadmin",
      ],
    );
    const itemId = crypto.randomUUID();
    await query(
      `INSERT INTO items (
         id, code, name, category, subcategory, base_unit, purchase_rate, retail_rate, b2b_rate,
         gst_rate, stock_gm, reorder_level_gm, status, business_id, unit, barcode
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'active', ?,?,?)`,
      [
        itemId,
        "GR-001",
        "Sugar",
        "Grocery",
        "Staples",
        "GM",
        40,
        48,
        44,
        5,
        500000,
        10000,
        demoBizId,
        "kg",
        "890000000001",
      ],
    );
    await query(
      `INSERT INTO customers (id, code, name, mobile, type, outstanding, business_id)
       VALUES (?,?,?,?, 'b2c', 0, ?)`,
      [crypto.randomUUID(), "CUS-001", "Walk-in", "0000000002", demoBizId],
    );
    await query(
      `INSERT INTO number_sequences (name, next_value, business_id) VALUES ('order', 10001, ?), ('customer', 2, ?), ('item', 2, ?)`,
      [demoBizId, demoBizId, demoBizId],
    );
    }
  } catch (err) {
    console.error("demo tenant seed", err.message);
  }

  const cashierEmail = "cashier@swamimasale.local";
  const [cashier] = await query("SELECT id FROM staff_users WHERE email = ?", [cashierEmail]);
  if (!cashier) {
    const id = crypto.randomUUID();
    await query(
      `INSERT INTO staff_users (
         id, clerk_user_id, email, first_name, last_name, role, status, password_hash,
         business_id, branch_id, permissions_json, username
       ) VALUES (?,?,?,?,?,?, 'active', ?,?,?,?,?)`,
      [
        id,
        `local:${id}`,
        cashierEmail,
        "Till",
        "Cashier",
        "cashier",
        await hashPassword(process.env.CASHIER_PASSWORD || "Cashier@12345"),
        swamiId,
        mainBranch,
        JSON.stringify(defaultPerms("cashier")),
        "cashier",
      ],
    );
  }

  const stocks = await query("SELECT id FROM branch_stocks WHERE business_id = ? LIMIT 1", [swamiId]);
  if (!stocks.length) {
    const items = await query("SELECT id, stock_gm FROM items WHERE business_id = ?", [swamiId]);
    for (const item of items) {
      await query(
        `INSERT INTO branch_stocks (id, business_id, branch_id, item_id, stock_gm)
         VALUES (?,?,?,?,?)`,
        [crypto.randomUUID(), swamiId, mainBranch, item.id, item.stock_gm || 0],
      );
    }
  }
}
