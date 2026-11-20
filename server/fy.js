/** Indian financial year: 1 April – 31 March. */

import { shopToday } from "./date-range.js";

export function indianFinancialYear(ymd) {
  const today = shopToday();
  const s = String(ymd || today).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const year = m ? Number(m[1]) : Number(today.slice(0, 4));
  const month = m ? Number(m[2]) : Number(today.slice(5, 7));
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
  const today = String(todayYmd || shopToday()).slice(0, 10);
  const fy = indianFinancialYear(today);
  const asOf = today < fy.from ? fy.from : today > fy.to ? fy.to : today;
  return {
    ...fy,
    from: fy.from,
    to: fy.to,
    asOf,
  };
}

/** Auto-generate Indian FY years (1 April–31 March) around today. */
export function fyYearList(todayYmd, past = 10, future = 1) {
  const current = indianFinancialYear(todayYmd).startYear;
  const out = [];
  for (let y = current + future; y >= current - past; y -= 1) {
    out.push(indianFinancialYear(`${y}-04-01`));
  }
  return out;
}
