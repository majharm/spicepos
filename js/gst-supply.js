/** India GST supply type: intra-state (CGST+SGST) vs inter-state (IGST). */
(function () {
  function round2(v) {
    return Math.round((Number(v) || 0) * 100) / 100;
  }

  function gstinStateCode(gstin) {
    const g = String(gstin || "")
      .trim()
      .toUpperCase();
    if (g.length >= 2 && /^\d{2}/.test(g)) return g.slice(0, 2);
    return "";
  }

  function normalizeState(state) {
    return String(state || "")
      .trim()
      .toLowerCase();
  }

  function isInterStateSupply(shop, party) {
    const shopCode = gstinStateCode(shop?.gstin);
    const partyCode = gstinStateCode(party?.gstin);
    if (shopCode && partyCode) return shopCode !== partyCode;

    const shopState = normalizeState(shop?.state);
    const partyState = normalizeState(party?.state);
    if (shopState && partyState) return shopState !== partyState;

    return false;
  }

  function splitGstAmount(totalGst, interState) {
    const total = round2(totalGst);
    if (interState) return { cgst: 0, sgst: 0, igst: total };
    const cgst = round2(total / 2);
    return { cgst, sgst: round2(total - cgst), igst: 0 };
  }

  window.GstSupply = {
    round2,
    gstinStateCode,
    normalizeState,
    isInterStateSupply,
    splitGstAmount,
  };
})();
