export const SHOP_TIMEZONE = process.env.POS_TIMEZONE || "Asia/Kolkata";
export const SHOP_TZ_OFFSET = process.env.POS_TZ_OFFSET || "+05:30";

export function shopTimezonePayload() {
  return { timezone: SHOP_TIMEZONE, tzOffset: SHOP_TZ_OFFSET };
}
