/** Inclusive calendar-day filters that can use created_at indexes. */

function createdCol(alias = "") {
  return alias ? `${alias}.created_at` : "created_at";
}

export function createdToday(alias = "") {
  const col = createdCol(alias);
  return `${col} >= CURDATE() AND ${col} < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`;
}

export function createdYesterday(alias = "") {
  const col = createdCol(alias);
  return `${col} >= DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND ${col} < CURDATE()`;
}

export function createdSinceDays(days, alias = "") {
  const n = Number(days);
  if (!Number.isInteger(n) || n < 0 || n > 36600) {
    throw new Error("invalid day count");
  }
  const col = createdCol(alias);
  return `${col} >= DATE_SUB(CURDATE(), INTERVAL ${n} DAY)`;
}

export function createdBetween(alias = "") {
  const col = createdCol(alias);
  return `${col} >= ? AND ${col} < DATE_ADD(?, INTERVAL 1 DAY)`;
}

export function createdBeforeDay(alias = "") {
  const col = createdCol(alias);
  return `${col} < ?`;
}

export function createdThisMonth(alias = "") {
  const col = createdCol(alias);
  return `${col} >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND ${col} < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)`;
}

export function createdPrevMonth(alias = "") {
  const col = createdCol(alias);
  return `${col} >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND ${col} < DATE_FORMAT(CURDATE(), '%Y-%m-01')`;
}
