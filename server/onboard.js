import { query, withTransaction } from "./db.js";
import { hashPassword } from "./password.js";
import { defaultPerms } from "./roles.js";

const REQUIRED = [
  "name",
  "business_type",
  "category",
  "owner_name",
  "mobile",
  "email",
  "address",
  "city",
  "state",
  "pin_code",
  "username",
  "password",
];

function pick(body, ...keys) {
  for (const key of keys) {
    if (body[key] != null && String(body[key]).trim() !== "") return body[key];
  }
  return "";
}

export function validateSignup(body, opts = {}) {
  const requireAdmin = opts.requireAdmin !== false;
  const raw = body || {};
  const b = {
    name: pick(raw, "name", "businessName"),
    business_type: pick(raw, "business_type", "businessType"),
    category: pick(raw, "category", "businessCategory"),
    owner_name: pick(raw, "owner_name", "ownerName"),
    mobile: pick(raw, "mobile"),
    email: pick(raw, "email", "admin_email"),
    gstin: pick(raw, "gstin", "gstNumber"),
    pan: pick(raw, "pan", "panNumber"),
    address: pick(raw, "address"),
    city: pick(raw, "city"),
    state: pick(raw, "state"),
    pin_code: pick(raw, "pin_code", "pinCode"),
    logo_url: pick(raw, "logo_url", "logoDataUrl"),
    username: pick(raw, "username", "adminUsername", "admin_username"),
    password: pick(raw, "password", "admin_password"),
    confirm_password: pick(raw, "confirm_password", "confirmPassword", "admin_password_confirm"),
    plan_id: pick(raw, "plan_id"),
    subscription_expires_at: pick(raw, "subscription_expires_at"),
    status: pick(raw, "status"),
  };
  const required = requireAdmin ? REQUIRED : REQUIRED.filter((k) => k !== "username" && k !== "password");
  for (const key of required) {
    if (!String(b[key] || "").trim()) throw new Error(`${key.replaceAll("_", " ")} is required`);
  }
  if (requireAdmin || b.password || b.confirm_password) {
    if (!requireAdmin && (b.password || b.confirm_password)) {
      if (!b.password || !b.confirm_password) {
        throw new Error("Enter and confirm the new password");
      }
    }
    if (String(b.password) !== String(b.confirm_password)) {
      throw new Error("Password and confirm password do not match");
    }
    if (String(b.password).length < 8) throw new Error("Password must be at least 8 characters");
  }
  const mobile = String(b.mobile).replaceAll(/\D/g, "");
  if (mobile.length < 10) throw new Error("Enter a valid mobile number");
  const email = String(b.email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email ID");
  const username = String(b.username || "").trim().toLowerCase();
  if ((requireAdmin || username) && !/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new Error("Username must be 3–32 letters, numbers, dot, dash or underscore");
  }
  const pin = String(b.pin_code).replaceAll(/\D/g, "");
  if (pin.length !== 6) throw new Error("PIN code must be 6 digits");
  let logo = b.logo_url ? String(b.logo_url) : "";
  if (logo && !logo.startsWith("data:image/")) throw new Error("Logo must be an uploaded image");
  if (logo && logo.length > 6_000_000) throw new Error("Logo is too large");
  const status = String(b.status || "active").trim() || "active";
  if (!["active", "inactive", "suspended"].includes(status)) throw new Error("Invalid status");
  return {
    name: String(b.name).trim(),
    business_type: String(b.business_type).trim(),
    category: String(b.category).trim(),
    owner_name: String(b.owner_name).trim(),
    mobile,
    email,
    gstin: String(b.gstin || "").trim() || null,
    pan: String(b.pan || "").trim().toUpperCase() || null,
    address: String(b.address).trim(),
    city: String(b.city).trim(),
    state: String(b.state).trim(),
    pin_code: pin,
    logo_url: logo || null,
    username,
    password: String(b.password || ""),
    plan_id: String(b.plan_id || "trial").trim() || "trial",
    subscription_expires_at: String(b.subscription_expires_at || "").trim() || null,
    status,
  };
}

export async function registerBusiness(raw) {
  const b = validateSignup(raw);
  const [emailTaken] = await query("SELECT id FROM staff_users WHERE email = ? LIMIT 1", [b.email]);
  if (emailTaken) throw new Error("This email is already registered");
  const [userTaken] = await query("SELECT id FROM staff_users WHERE username = ? LIMIT 1", [b.username]);
  if (userTaken) throw new Error("This username is already taken");

  const fullAddress = `${b.address}, ${b.city}, ${b.state} ${b.pin_code}`;
  const id = crypto.randomUUID();
  const code = `B${Date.now().toString(36).toUpperCase()}`.slice(0, 12);
  let shopName = b.name;
  const [nameHit] = await query("SELECT id FROM businesses WHERE name = ? LIMIT 1", [shopName]);
  if (nameHit) shopName = `${b.name} (${b.city})`;

  const [planRow] = await query("SELECT id FROM subscription_plans WHERE id = ? OR code = ? LIMIT 1", [
    b.plan_id,
    b.plan_id.toUpperCase(),
  ]);
  const planId = planRow?.id || "trial";
  const expiry = b.subscription_expires_at;

  const admin = await withTransaction(async (conn) => {
    await conn.query(
      `INSERT INTO businesses (
         id, code, name, status, owner_name, mobile, email, address, gstin,
         business_type, plan_id, subscription_expires_at, logo_url,
         category, pan, city, state, pin_code
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        code,
        shopName,
        b.status || "active",
        b.owner_name,
        b.mobile,
        b.email,
        fullAddress,
        b.gstin,
        b.business_type,
        planId,
        expiry,
        b.logo_url,
        b.category,
        b.pan,
        b.city,
        b.state,
        b.pin_code,
      ],
    );
    if (!expiry) {
      await conn.query(
        `UPDATE businesses SET subscription_expires_at = DATE_ADD(CURDATE(), INTERVAL 30 DAY) WHERE id = ?`,
        [id],
      );
    }
    await conn.query(
      `INSERT INTO company_settings (id, name, address, phone, email, gstin, pan, city, state, pincode, logo_url, business_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(),
        shopName,
        fullAddress,
        b.mobile,
        b.email,
        b.gstin,
        b.pan,
        b.city,
        b.state,
        b.pin_code,
        b.logo_url,
        id,
      ],
    );
    const branchId = crypto.randomUUID();
    await conn.query(`INSERT INTO branches (id, business_id, name, address, phone, status) VALUES (?,?,?,?,?, 'active')`, [
      branchId,
      id,
      "Main Branch",
      fullAddress,
      b.mobile,
    ]);
    await conn.query(
      `INSERT INTO pos_devices (id, business_id, branch_id, name, code, status)
       VALUES (?,?,?,?,?, 'active')`,
      [crypto.randomUUID(), id, branchId, "POS 01", `POS-${code}`],
    );
    try {
      await conn.query(
        `INSERT INTO number_sequences (name, next_value, business_id) VALUES
         ('order', 10001, ?), ('customer', 2, ?), ('item', 1, ?), ('purchase', 10001, ?)`,
        [id, id, id, id],
      );
    } catch {
      /* sequences may be unique on name only */
    }
    await conn.query(
      `INSERT INTO customers (id, code, name, mobile, type, outstanding, business_id)
       VALUES (?,?, 'Walk-in', '0000000000', 'b2c', 0, ?)`,
      [crypto.randomUUID(), `W${Date.now().toString(36).toUpperCase()}`, id],
    );
    const uid = crypto.randomUUID();
    await conn.query(
      `INSERT INTO staff_users (
         id, clerk_user_id, email, first_name, last_name, role, status, password_hash,
         business_id, branch_id, permissions_json, username, mobile
       ) VALUES (?,?,?,?,?,?, 'active', ?,?,?,?,?,?)`,
      [
        uid,
        `local:${uid}`,
        b.email,
        b.owner_name,
        "",
        "business_admin",
        await hashPassword(b.password),
        id,
        branchId,
        JSON.stringify(defaultPerms("business_admin")),
        b.username,
        b.mobile,
      ],
    );
    const [users] = await conn.query("SELECT * FROM staff_users WHERE id = ?", [uid]);
    return users[0];
  });

  return { businessId: id, user: admin };
}

export async function updateBusiness(id, raw) {
  const b = validateSignup(raw, { requireAdmin: false });
  const [existing] = await query("SELECT * FROM businesses WHERE id = ?", [id]);
  if (!existing) throw new Error("Business not found");
  const [emailTaken] = await query(
    "SELECT id FROM staff_users WHERE email = ? AND business_id <> ? LIMIT 1",
    [b.email, id],
  );
  if (emailTaken) throw new Error("This email is already registered");
  if (b.username) {
    const [userTaken] = await query(
      "SELECT id FROM staff_users WHERE username = ? AND business_id <> ? LIMIT 1",
      [b.username, id],
    );
    if (userTaken) throw new Error("This username is already taken");
  }
  const [planRow] = await query("SELECT id FROM subscription_plans WHERE id = ? OR code = ? LIMIT 1", [
    b.plan_id,
    b.plan_id.toUpperCase(),
  ]);
  const planId = planRow?.id || existing.plan_id || "trial";
  const fullAddress = `${b.address}, ${b.city}, ${b.state} ${b.pin_code}`;
  const logo = b.logo_url || existing.logo_url || null;
  const expiry = b.subscription_expires_at || existing.subscription_expires_at;
  await query(
    `UPDATE businesses SET
       name=?, owner_name=?, mobile=?, email=?, address=?, gstin=?, business_type=?,
       status=?, plan_id=?, subscription_expires_at=?, logo_url=?,
       category=?, pan=?, city=?, state=?, pin_code=?
     WHERE id=?`,
    [
      b.name,
      b.owner_name,
      b.mobile,
      b.email,
      fullAddress,
      b.gstin,
      b.business_type,
      b.status,
      planId,
      expiry,
      logo,
      b.category,
      b.pan,
      b.city,
      b.state,
      b.pin_code,
      id,
    ],
  );
  await query(
    `UPDATE company_settings
     SET name=?, address=?, phone=?, email=?, gstin=?, pan=?, city=?, state=?, pincode=?, logo_url=?
     WHERE business_id=?`,
    [b.name, fullAddress, b.mobile, b.email, b.gstin, b.pan, b.city, b.state, b.pin_code, logo, id],
  );
  const [admin] = await query(
    `SELECT * FROM staff_users WHERE business_id = ? AND role = 'business_admin' LIMIT 1`,
    [id],
  );
  if (admin) {
    const nextUser = b.username || admin.username;
    const passwordChanged = Boolean(b.password);
    const nextHash = passwordChanged ? await hashPassword(b.password) : admin.password_hash;
    await query(
      `UPDATE staff_users SET email=?, first_name=?, mobile=?, username=?, password_hash=?, failed_logins=0, locked_until=NULL WHERE id=?`,
      [b.email, b.owner_name, b.mobile, nextUser, nextHash, admin.id],
    );
  }
  const [row] = await query("SELECT * FROM businesses WHERE id = ?", [id]);
  return { business: row };
}
