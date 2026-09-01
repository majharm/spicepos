/** Indian financial year: 1 April – 31 March. */

export function indianFinancialYear(ymd) {
  const s = String(ymd || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const now = new Date();
  const year = m ? Number(m[1]) : now.getUTCFullYear();
  const month = m ? Number(m[2]) : now.getUTCMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  return {
    startYear,
    from: `${startYear}-04-01`,
    to: `${endYear}-03-31`,
    label: `FY ${startYear}–${String(endYear).slice(-2)}`,
  };
}

export function fyRangeForToday(todayYmd) {
  const today = String(todayYmd || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const fy = indianFinancialYear(today);
  return {
    ...fy,
    from: fy.from,
    to: today < fy.from ? fy.from : today > fy.to ? fy.to : today,
  };
}
