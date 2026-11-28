import { query } from "./db.js";
import { bid } from "./context.js";
import { requireStaff, requirePerm } from "./auth.js";
import { audit } from "./audit.js";
import { shopAutomationPatch } from "./automation-jobs.js";

let ready = null;

function ensureAutomationShop() {
  if (!ready) {
    ready = query(
      `CREATE TABLE IF NOT EXISTS automation_shop (
        business_id VARCHAR(64) PRIMARY KEY,
        low_stock TINYINT NOT NULL DEFAULT 0,
        daily_sales TINYINT NOT NULL DEFAULT 0,
        collections TINYINT NOT NULL DEFAULT 0,
        overdue TINYINT NOT NULL DEFAULT 0,
        eod TINYINT NOT NULL DEFAULT 0,
        channel_whatsapp TINYINT NOT NULL DEFAULT 1,
        channel_in_app TINYINT NOT NULL DEFAULT 1,
        close_time CHAR(5) NOT NULL DEFAULT '21:00',
        report_time CHAR(5) NOT NULL DEFAULT '21:00',
        low_stock_hours INT NOT NULL DEFAULT 24,
        low_signature VARCHAR(191) NOT NULL DEFAULT '',
        low_sent_at DATETIME NULL,
        low_checked_at DATETIME NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
    ).catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

async function testMode() {
  try {
    const rows = await query(
      "SELECT setting_value FROM platform_settings WHERE setting_key = ? LIMIT 1",
      ["automation_test_mode"],
    );
    return Number(rows[0]?.setting_value) === 1;
  } catch {
    return false;
  }
}

export async function loadShopAutomation(businessId) {
  await ensureAutomationShop();
  const rows = await query("SELECT * FROM automation_shop WHERE business_id = ? LIMIT 1", [businessId]);
  if (rows[0]) return shopAutomationPatch(rows[0], {});
  try {
    await query("INSERT INTO automation_shop (business_id) VALUES (?)", [businessId]);
  } catch (err) {
    if (!/duplicate/i.test(String(err?.message || err))) throw err;
  }
  const again = await query("SELECT * FROM automation_shop WHERE business_id = ? LIMIT 1", [businessId]);
  return shopAutomationPatch(again[0] || {}, {});
}

export async function saveShopAutomation(businessId, body) {
  const current = await loadShopAutomation(businessId);
  const next = shopAutomationPatch(current, body || {});
  await query(
    `UPDATE automation_shop
     SET low_stock=?, daily_sales=?, collections=?, overdue=?, eod=?,
         channel_whatsapp=?, channel_in_app=?, close_time=?, report_time=?, low_stock_hours=?
     WHERE business_id=?`,
    [
      next.low_stock,
      next.daily_sales,
      next.collections,
      next.overdue,
      next.eod,
      next.channel_whatsapp,
      next.channel_in_app,
      next.close_time,
      next.report_time,
      next.low_stock_hours,
      businessId,
    ],
  );
  return loadShopAutomation(businessId);
}

export function registerAutomationSettings(app) {
  app.get("/api/automation/settings", requireStaff, requirePerm("settings"), async (req, res) => {
    try {
      const settings = await loadShopAutomation(bid());
      res.json({ ok: true, settings, testMode: await testMode() });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  app.post("/api/automation/settings", requireStaff, requirePerm("settings"), async (req, res) => {
    try {
      const settings = await saveShopAutomation(bid(), req.body || {});
      await audit("Automation Saved", { module: "settings", settings }, req);
      res.json({ ok: true, settings });
    } catch (err) {
      res.status(400).json({ error: String(err.message || err) });
    }
  });
}
