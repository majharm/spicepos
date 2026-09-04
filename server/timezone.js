export const SHOP_TIMEZONE = process.env.POS_TIMEZONE || "Asia/Kolkata";
export const SHOP_TZ_OFFSET = process.env.POS_TZ_OFFSET || "+05:30";

export const SHOP_TIMEZONE_OPTIONS = [
  { id: "Asia/Kolkata", label: "India (IST, UTC+5:30)", offset: "+05:30" },
  { id: "Asia/Dubai", label: "UAE (UTC+4)", offset: "+04:00" },
  { id: "Asia/Singapore", label: "Singapore (UTC+8)", offset: "+08:00" },
  { id: "Asia/Colombo", label: "Sri Lanka (UTC+5:30)", offset: "+05:30" },
  { id: "Asia/Kathmandu", label: "Nepal (UTC+5:45)", offset: "+05:45" },
  { id: "UTC", label: "UTC", offset: "+00:00" },
];

export function tzOffsetFor(timezone) {
  const row = SHOP_TIMEZONE_OPTIONS.find((t) => t.id === timezone);
  return row?.offset || SHOP_TZ_OFFSET;
}

export function normalizeTimezone(timezone) {
  const id = String(timezone || "").trim();
  if (SHOP_TIMEZONE_OPTIONS.some((t) => t.id === id)) return id;
  return SHOP_TIMEZONE;
}

export function companyTimezone(company = {}) {
  const timezone = normalizeTimezone(company.timezone || SHOP_TIMEZONE);
  const tzOffset = company.tz_offset || tzOffsetFor(timezone);
  return { timezone, tzOffset };
}

export function shopTimezonePayload(company = {}) {
  return companyTimezone(company);
}
