/** All money is integer paise (1 INR = 100 paise) to avoid float rounding bugs. */

export function rupeesToPaise(rupees) {
  if (!Number.isFinite(rupees)) throw new Error("Invalid rupees");
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise) {
  return paise / 100;
}

export function formatINR(paise) {
  const negative = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100);
  const remainder = abs % 100;
  const grouped = rupees.toLocaleString("en-IN");
  const body = `₹${grouped}.${String(remainder).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

/** GST basis points: 500 = 5%. Tax is rounded to nearest paise per line. */
export function lineAmounts(unitPaise, qty, gstBps) {
  if (!Number.isInteger(unitPaise) || unitPaise < 0) {
    throw new Error("Invalid unit price");
  }
  if (!Number.isInteger(qty) || qty < 0) {
    throw new Error("Invalid quantity");
  }
  if (!Number.isInteger(gstBps) || gstBps < 0) {
    throw new Error("Invalid GST");
  }
  const taxable = unitPaise * qty;
  const tax = Math.round((taxable * gstBps) / 10000);
  return { taxable, tax, total: taxable + tax };
}

export function sumCart(lines) {
  return lines.reduce(
    (acc, line) => {
      const amounts = lineAmounts(line.unitPaise, line.qty, line.gstBps);
      acc.taxable += amounts.taxable;
      acc.tax += amounts.tax;
      acc.total += amounts.total;
      return acc;
    },
    { taxable: 0, tax: 0, total: 0 },
  );
}

export function changeDue(totalPaise, tenderedPaise) {
  if (!Number.isInteger(totalPaise) || totalPaise < 0) {
    throw new Error("Invalid total");
  }
  if (!Number.isInteger(tenderedPaise) || tenderedPaise < 0) {
    throw new Error("Invalid tender");
  }
  if (tenderedPaise < totalPaise) {
    return { ok: false, shortfall: totalPaise - tenderedPaise, change: 0 };
  }
  return { ok: true, shortfall: 0, change: tenderedPaise - totalPaise };
}

export function parseMoneyInput(raw) {
  if (raw == null) return { ok: false, error: "Enter an amount" };
  const text = String(raw).trim().replace(/₹/g, "").replace(/,/g, "");
  if (text === "") return { ok: false, error: "Enter an amount" };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return { ok: false, error: "Use a valid amount (max 2 decimals)" };
  }
  const [whole, frac = ""] = text.split(".");
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) {
    return { ok: false, error: "Amount is too large" };
  }
  return { ok: true, paise };
}
