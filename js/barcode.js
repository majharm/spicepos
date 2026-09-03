(function (root, factory) {
  const api = factory();
  root.POSBarcode = api;
  if (typeof window !== "undefined") window.POSBarcode = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ENCODINGS = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
  ];

  function ean13Checksum(digits12) {
    const d = String(digits12 || "").replace(/\D/g, "").padStart(12, "0").slice(0, 12);
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(d[i]) * (i % 2 === 0 ? 1 : 3);
    return (10 - (sum % 10)) % 10;
  }

  function isValidEan13(code) {
    const d = String(code || "").replace(/\D/g, "");
    if (d.length !== 13) return false;
    return Number(d[12]) === ean13Checksum(d.slice(0, 12));
  }

  function generateEan13(seq, shopKey) {
    const n = Math.max(1, Math.abs(Number(seq) || 1)) % 1000000;
    const shop = String(shopKey || "00000").replace(/\D/g, "").padStart(5, "0").slice(-5);
    const body = (`2${shop}${String(n).padStart(6, "0")}`).slice(0, 12);
    return body + String(ean13Checksum(body));
  }

  function cleanCode(raw) {
    return String(raw || "").trim().replace(/\s+/g, "");
  }

  function code128Value(ch) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) return -1;
    return c - 32;
  }

  function patternToBits(pattern, startBar) {
    let bits = "";
    let bar = startBar;
    for (const ch of pattern) {
      bits += (bar ? "1" : "0").repeat(Number(ch) || 0);
      bar = !bar;
    }
    return bits;
  }

  function encodeCode128(text) {
    const value = String(text || "");
    if (!value) return "";
    const codes = [104];
    for (const ch of value) {
      const v = code128Value(ch);
      if (v < 0) continue;
      codes.push(v);
    }
    if (codes.length === 1) return "";
    let checksum = 104;
    for (let i = 1; i < codes.length; i++) checksum += codes[i] * i;
    codes.push(checksum % 103);
    codes.push(106);
    let bits = "0000000000";
    for (const code of codes) bits += patternToBits(ENCODINGS[code] || ENCODINGS[0], true);
    bits += "0000000000";
    return bits;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function code128Svg(text, opts) {
    const bits = encodeCode128(text);
    const height = Number(opts?.height) || 52;
    const scale = Number(opts?.scale) || 2;
    const showText = opts?.showText !== false;
    const w = Math.max(bits.length, 1) * scale;
    const h = height + (showText ? 16 : 0);
    let rects = "";
    let run = 0;
    let x = 0;
    for (let i = 0; i <= bits.length; i++) {
      if (bits[i] === "1") {
        if (!run) x = i;
        run += 1;
      } else if (run) {
        rects += `<rect x="${x * scale}" y="0" width="${run * scale}" height="${height}"/>`;
        run = 0;
      }
    }
    const label = showText
      ? `<text x="${w / 2}" y="${height + 13}" text-anchor="middle" font-size="12" font-family="ui-monospace,monospace">${escapeHtml(text)}</text>`
      : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">${rects}${label}</svg>`;
  }

  function money(n) {
    const v = Number(n) || 0;
    return `₹${v.toFixed(2)}`;
  }

  function labelCard(row) {
    const name = escapeHtml(row.name || "Item");
    const code = escapeHtml(row.barcode || row.code || "");
    const mrp = row.mrp != null && row.mrp !== "" ? money(row.mrp) : "";
    const rate = row.rate != null && row.rate !== "" ? money(row.rate) : "";
    const svg = code ? code128Svg(row.barcode || row.code, { height: 44, scale: 1.6 }) : "";
    return `<article class="bc-label">
      <div class="bc-name">${name}</div>
      <div class="bc-meta">${mrp ? `MRP ${escapeHtml(mrp)}` : ""}${mrp && rate ? " · " : ""}${rate ? `SP ${escapeHtml(rate)}` : ""}</div>
      <div class="bc-svg">${svg}</div>
    </article>`;
  }

  function labelsDocument(rows) {
    const cards = (rows || []).map(labelCard).join("");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Barcode labels</title>
<style>
@page { margin: 8mm; }
body { margin: 0; font-family: "Segoe UI", sans-serif; color: #111; }
.bc-sheet { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; padding: 8px; }
.bc-label { border: 1px solid #222; padding: 8px 10px; break-inside: avoid; text-align: center; }
.bc-name { font-weight: 700; font-size: 13px; }
.bc-meta { font-size: 11px; color: #333; margin: 4px 0; }
.bc-svg svg { max-width: 100%; height: auto; }
</style></head><body>
<div class="bc-sheet">${cards}</div>
<script>window.onload=function(){window.focus();window.print();};<\/script>
</body></html>`;
  }

  function expandCopies(rows, copies) {
    const n = Math.max(1, Math.min(200, Number(copies) || 1));
    const out = [];
    for (const row of rows || []) {
      const c = Math.max(1, Math.min(200, Number(row.copies) || n));
      for (let i = 0; i < c; i++) out.push(row);
    }
    return out;
  }

  function printLabels(rows, copies) {
    const w = window.open("", "barcode-labels", "width=720,height=900");
    if (!w) return false;
    w.document.write(labelsDocument(expandCopies(rows, copies)));
    w.document.close();
    return true;
  }

  return {
    ean13Checksum,
    isValidEan13,
    generateEan13,
    cleanCode,
    encodeCode128,
    code128Svg,
    labelsDocument,
    expandCopies,
    printLabels,
  };
});
