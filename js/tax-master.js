/* Tax master: GST slabs the shop picks on an item. */
(function (root) {
  const DEFAULTS = [
    { code: "EXEMPT", name: "Exempt", tax_type: "exempt", rate: 0, sort_order: 10 },
    { code: "GST0", name: "GST Nil 0%", tax_type: "gst", rate: 0, sort_order: 20 },
    { code: "GST5", name: "GST 5%", tax_type: "gst", rate: 5, sort_order: 30 },
    { code: "GST12", name: "GST 12%", tax_type: "gst", rate: 12, sort_order: 40 },
    { code: "GST18", name: "GST 18%", tax_type: "gst", rate: 18, sort_order: 50 },
    { code: "GST28", name: "GST 28%", tax_type: "gst", rate: 28, sort_order: 60 },
  ];

  function round2(n) {
    return Math.round(Number(n) * 100) / 100;
  }

  function splitTax(type, rate) {
    const kind = type === "igst" || type === "exempt" ? type : "gst";
    let pct = round2(rate);
    if (!Number.isFinite(pct) || pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    if (kind === "exempt") return { tax_type: "exempt", rate: 0, cgst_rate: 0, sgst_rate: 0, igst_rate: 0 };
    if (kind === "igst") return { tax_type: "igst", rate: pct, cgst_rate: 0, sgst_rate: 0, igst_rate: pct };
    const cgst = round2(pct / 2);
    return { tax_type: "gst", rate: pct, cgst_rate: cgst, sgst_rate: round2(pct - cgst), igst_rate: pct };
  }

  function rateKey(rate) {
    const n = Number(rate);
    if (!Number.isFinite(n)) return "";
    return String(round2(n));
  }

  function splitText(row) {
    const type = row?.tax_type === "igst" || row?.tax_type === "exempt" ? row.tax_type : "gst";
    const split = splitTax(type, row?.rate);
    if (split.tax_type === "exempt") return "No GST";
    if (split.tax_type === "igst") return `IGST ${rateKey(split.igst_rate)}%`;
    return `CGST ${rateKey(split.cgst_rate)}% + SGST ${rateKey(split.sgst_rate)}% · IGST ${rateKey(split.igst_rate)}%`;
  }

  root.POSTaxes = { DEFAULTS, splitTax, rateKey, splitText };
})(typeof globalThis !== "undefined" ? globalThis : window);
