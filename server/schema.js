import { query } from "./db.js";
import { hashPassword } from "./password.js";
import { defaultPerms } from "./roles.js";

async function hasColumn(table, column) {
  const rows = await query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows.length > 0;
}

async function addColumn(table, column, def) {
  if (!(await hasColumn(table, column))) {
    await query(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${def}`);
  }
}

async function create(sql) {
  await query(sql);
}

export async function ensureSchema() {
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
  await addColumn("company_settings", "timezone", "VARCHAR(64) NULL");
  await addColumn("company_settings", "tz_offset", "VARCHAR(8) NULL");

  await addColumn("staff_users", "mobile", "VARCHAR(32) NULL");
  await addColumn("staff_users", "username", "VARCHAR(64) NULL");
  await addColumn("staff_users", "branch_id", "VARCHAR(255) NULL");
  await addColumn("staff_users", "permissions_json", "TEXT NULL");
  await addColumn("staff_users", "failed_logins", "INT NOT NULL DEFAULT 0");
  await addColumn("staff_users", "locked_until", "TIMESTAMP(3) NULL");

  await addColumn("staff_sessions", "ip", "VARCHAR(64) NULL");
  await addColumn("staff_sessions", "user_agent", "VARCHAR(255) NULL");
  await addColumn("staff_sessions", "branch_id", "VARCHAR(255) NULL");
  await addColumn("staff_sessions", "impersonator_admin_id", "VARCHAR(255) NULL");

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
  await addColumn("items", "base_unit", "VARCHAR(32) NOT NULL DEFAULT 'GM'");

  await addColumn("suppliers", "payable_balance", "DECIMAL(12,2) NOT NULL DEFAULT 0");

  await create(`CREATE TABLE IF NOT EXISTS account_ledger (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    entry_no VARCHAR(32) NOT NULL,
    entry_type VARCHAR(32) NOT NULL,
    party_type VARCHAR(16) NOT NULL,
    party_id VARCHAR(255) NOT NULL,
    party_name VARCHAR(255) NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(32) NULL,
    reference_type VARCHAR(32) NULL,
    reference_id VARCHAR(255) NULL,
    notes TEXT NULL,
    created_by VARCHAR(255) NULL,
    created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_account_ledger_biz_date (business_id, created_at),
    INDEX idx_account_ledger_party (business_id, party_type, party_id)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    code VARCHAR(16) NOT NULL,
    name VARCHAR(255) NOT NULL,
    account_group VARCHAR(32) NOT NULL,
    parent_id VARCHAR(255) NULL,
    is_system TINYINT NOT NULL DEFAULT 0,
    active TINYINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_coa_biz_code (business_id, code),
    INDEX idx_coa_biz_group (business_id, account_group)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS journal_entries (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    voucher_no VARCHAR(32) NOT NULL,
    voucher_date DATE NOT NULL,
    voucher_type VARCHAR(32) NOT NULL,
    narration TEXT NULL,
    reference_type VARCHAR(32) NULL,
    reference_id VARCHAR(255) NULL,
    created_by VARCHAR(255) NULL,
    created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_journal_biz_date (business_id, voucher_date),
    INDEX idx_journal_ref (business_id, reference_type, reference_id)
  )`);

  await create(`CREATE TABLE IF NOT EXISTS journal_lines (
    id VARCHAR(255) PRIMARY KEY,
    journal_id VARCHAR(255) NOT NULL,
    account_id VARCHAR(255) NOT NULL,
    debit DECIMAL(12,2) NOT NULL DEFAULT 0,
    credit DECIMAL(12,2) NOT NULL DEFAULT 0,
    business_id VARCHAR(255) NOT NULL,
    INDEX idx_jline_journal (journal_id),
    INDEX idx_jline_account (business_id, account_id)
  )`);

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
