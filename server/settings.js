import { query } from "./db.js";

export async function getPlatformSettings() {
  const rows = await query("SELECT setting_key, setting_value FROM platform_settings");
  const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value || ""]));
  return {
    support_phone: map.support_phone || "",
    support_email: map.support_email || "",
  };
}

export async function shopSupportContact(businessId) {
  const platform = await getPlatformSettings();
  const id = String(businessId || "").trim();
  if (!id) return platform;
  try {
    const [biz] = await query("SELECT account_manager_id FROM businesses WHERE id = ? LIMIT 1", [id]);
    if (!biz?.account_manager_id) return platform;
    const [am] = await query(
      "SELECT name, mobile, email, status FROM account_managers WHERE id = ? LIMIT 1",
      [biz.account_manager_id],
    );
    if (!am || am.status !== "active") return platform;
    return {
      support_phone: String(am.mobile || "").trim() || platform.support_phone,
      support_email: String(am.email || "").trim() || platform.support_email,
      account_manager_name: String(am.name || "").trim(),
    };
  } catch {
    return platform;
  }
}

export async function setPlatformSetting(key, value) {
  await query(
    `INSERT INTO platform_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP(3)`,
    [key, value == null ? "" : String(value).trim()],
  );
}
