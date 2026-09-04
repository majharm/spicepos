import { query } from "./db.js";

export async function getPlatformSettings() {
  const rows = await query("SELECT setting_key, setting_value FROM platform_settings");
  const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value || ""]));
  return {
    support_phone: map.support_phone || "",
    support_email: map.support_email || "",
  };
}

export async function setPlatformSetting(key, value) {
  await query(
    `INSERT INTO platform_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP(3)`,
    [key, value == null ? "" : String(value).trim()],
  );
}
