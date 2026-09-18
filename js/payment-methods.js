(function (root, factory) {
  const api = factory();
  root.POSPay = api;
  if (typeof window !== "undefined") window.POSPay = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MODES = [
    ["cash", "Cash"],
    ["upi", "UPI"],
    ["bank-transfer", "Bank Transfer"],
    ["neft", "NEFT"],
    ["rtgs", "RTGS"],
    ["imps", "IMPS"],
    ["cheque", "Cheque"],
    ["card", "Card"],
    ["wallet", "Wallet"],
    ["other", "Other"],
  ];
  const MONEY = new Set(MODES.map(([v]) => v));

  function normalize(raw) {
    let m = String(raw || "cash").toLowerCase().trim();
    m = m.replace(/[\s_]+/g, "-");
    if (m === "bank" || m === "banktransfer" || m === "net-banking" || m === "netbanking") return "bank-transfer";
    if (m === "check") return "cheque";
    if (m === "credit-card" || m === "debit-card") return "card";
    if (m === "creditnote") return "credit-note";
    if (m === "storecredit") return "store-credit";
    return m || "cash";
  }

  function isMoneyMode(raw) {
    return MONEY.has(normalize(raw));
  }

  function isSaleMode(raw) {
    const m = normalize(raw);
    return m === "credit" || MONEY.has(m);
  }

  function isPurchaseMode(raw) {
    return isSaleMode(raw);
  }

  function isRefundMode(raw) {
    const m = normalize(raw);
    return MONEY.has(m) || m === "credit-note" || m === "store-credit";
  }

  function label(raw) {
    const m = normalize(raw);
    if (m === "credit") return "Credit";
    if (m === "credit-note") return "Credit note";
    if (m === "store-credit") return "Store credit";
    const hit = MODES.find(([v]) => v === m);
    if (hit) return hit[1];
    return m ? m.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";
  }

  function codes() {
    return MODES.map(([v]) => v);
  }

  function optionsHtml(opts = {}) {
    const selected = normalize(opts.selected || "cash");
    const extra = Array.isArray(opts.extra) ? opts.extra : [];
    const rows = MODES.slice();
    if (opts.includeCredit) rows.push(["credit", "Credit"]);
    for (const row of extra) {
      if (Array.isArray(row) && row[0]) rows.push([normalize(row[0]), row[1] || label(row[0])]);
    }
    const seen = new Set();
    return rows
      .filter(([v]) => {
        if (seen.has(v)) return false;
        seen.add(v);
        return true;
      })
      .map(([v, l]) => `<option value="${v}"${v === selected ? " selected" : ""}>${l}</option>`)
      .join("");
  }

  function assetCode(raw) {
    const m = normalize(raw);
    if (m === "credit") return "1101";
    if (m === "upi" || m === "wallet") return "1003";
    if (m === "cash") return "1001";
    return "1002";
  }

  return {
    MODES,
    normalize,
    isMoneyMode,
    isSaleMode,
    isPurchaseMode,
    isRefundMode,
    label,
    codes,
    optionsHtml,
    assetCode,
  };
});
