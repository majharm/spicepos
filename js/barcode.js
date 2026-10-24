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

  function asBarcodeString(raw) {
    if (raw == null || raw === false) return "";
    if (typeof raw === "number") {
      if (!Number.isFinite(raw)) return "";
      if (Number.isSafeInteger(raw)) return String(raw);
      return raw.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 0 });
    }
    let s = String(raw).trim();
    if (!s) return "";
    s = s.replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, "");
    s = s.replace(/\s+/g, "");
    s = s.replace(/^\][A-Za-z][0-9]/, "");
    return s;
  }

  function cleanCode(raw) {
    return asBarcodeString(raw);
  }

  function barcodesEqual(a, b) {
    const x = asBarcodeString(a);
    const y = asBarcodeString(b);
    return Boolean(x) && x === y;
  }

  function isBarcodeLike(raw) {
    const s = asBarcodeString(raw);
    return s.length >= 4 && s.length <= 64 && /^[A-Za-z0-9._/-]+$/.test(s);
  }

  function isReusableProductKind(kind) {
    const k = String(kind || "").toLowerCase();
    return k === "own" || k === "manufacturer" || k === "variant" || k === "product" || k === "batch";
  }

  const DESK_PROFILES = {
    apparel: { size: true, color: true, sku: true, price: true, batch: false, expiry: false, serial: false, kinds: ["own", "variant", "unit"] },
    footwear: { size: true, color: true, sku: true, price: true, batch: false, expiry: false, serial: false, kinds: ["own", "variant", "unit"] },
    pharmacy: { size: false, color: false, sku: true, price: true, batch: true, expiry: true, serial: false, kinds: ["own", "batch", "unit"] },
    electronics: { size: false, color: false, sku: true, price: true, batch: false, expiry: false, serial: true, kinds: ["own", "serial", "unit"] },
    jewellery: { size: false, color: false, sku: true, price: true, batch: false, expiry: false, serial: true, kinds: ["own", "serial", "unit"] },
    grocery: { size: false, color: false, sku: true, price: true, batch: false, expiry: false, serial: false, kinds: ["own", "unit"] },
    spice: { size: false, color: false, sku: true, price: true, batch: false, expiry: false, serial: false, kinds: ["own", "unit"] },
    restaurant: { size: false, color: false, sku: true, price: true, batch: false, expiry: false, serial: false, kinds: ["own", "unit"] },
    hardware: { size: false, color: false, sku: true, price: true, batch: false, expiry: false, serial: false, kinds: ["own", "unit"] },
    printing: { size: false, color: false, sku: true, price: true, batch: false, expiry: false, serial: false, kinds: ["own"] },
    gym: { size: false, color: false, sku: true, price: true, batch: false, expiry: false, serial: false, kinds: ["own"] },
    bar: { size: false, color: false, sku: true, price: true, batch: false, expiry: false, serial: false, kinds: ["own", "unit"] },
    services: { size: false, color: false, sku: true, price: true, batch: false, expiry: false, serial: false, kinds: ["own"] },
    general: { size: true, color: true, sku: true, price: true, batch: true, expiry: true, serial: true, kinds: ["own", "manufacturer", "variant", "batch", "unit", "serial"] },
  };

  function deskProfile(shopKind) {
    const key = String(shopKind || "general").toLowerCase();
    const row = DESK_PROFILES[key] || DESK_PROFILES.general;
    return { ...row, shopKind: DESK_PROFILES[key] ? key : "general" };
  }

  function deskLead(shopKind) {
    const profile = deskProfile(shopKind);
    const bits = ["a product barcode"];
    if (profile.size || profile.color) bits.push("size and colour");
    if (profile.batch || profile.expiry) bits.push("batch and expiry");
    if (profile.serial) bits.push("serial numbers");
    if (profile.kinds.includes("unit")) bits.push("a unique code for every piece");
    return `This shop can print ${bits.join(", ")}.`;
  }

  function normalizeBarcodeKind(kind) {
    const k = String(kind || "own").toLowerCase();
    if (k === "piece") return "unit";
    if (k === "product") return "own";
    if (["own", "manufacturer", "variant", "batch", "unit", "serial"].includes(k)) return k;
    return "own";
  }

  function isPieceKind(kind) {
    const k = normalizeBarcodeKind(kind);
    return k === "unit" || k === "serial";
  }

  function kindLabel(kind) {
    const k = normalizeBarcodeKind(kind);
    if (k === "own") return "Product";
    if (k === "manufacturer") return "Manufacturer";
    if (k === "variant") return "Variant";
    if (k === "batch") return "Batch";
    if (k === "serial") return "Serial";
    return "Piece";
  }

  function extraBarcodeValue(row) {
    if (row == null) return "";
    if (typeof row === "string" || typeof row === "number") return asBarcodeString(row);
    return asBarcodeString(row.barcode);
  }

  function itemHasBarcode(item, code) {
    const q = asBarcodeString(code);
    if (!q || !item) return false;
    if (barcodesEqual(item.barcode, q) || barcodesEqual(item.mfr_barcode, q) || barcodesEqual(item.item_barcode, q)) {
      return true;
    }
    const extra = Array.isArray(item.barcodes) ? item.barcodes : [];
    return extra.some((b) => barcodesEqual(extraBarcodeValue(b), q));
  }

  function shouldConsumePieceBarcode(row) {
    if (!row) return false;
    return !isReusableProductKind(row.kind);
  }

  function parseManualCodes(raw) {
    const parts = Array.isArray(raw) ? raw : String(raw ?? "").split(/[\s,;]+/);
    const out = [];
    const seen = Object.create(null);
    for (const part of parts) {
      const code = cleanCode(part);
      if (!code) continue;
      if (seen[code]) throw new Error("Duplicate barcode " + code);
      seen[code] = true;
      out.push(code);
      if (out.length > 500) throw new Error("Max 500 barcodes at once");
    }
    return out;
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

  const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
  const EAN_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
  const EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
  const EAN_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

  function encodeEan13(code) {
    const d = String(code || "").replace(/\D/g, "");
    if (!isValidEan13(d)) return "";
    const parity = EAN_PARITY[Number(d[0])];
    let bits = "101";
    for (let i = 0; i < 6; i++) {
      const n = Number(d[i + 1]);
      bits += (parity[i] === "L" ? EAN_L : EAN_G)[n];
    }
    bits += "01010";
    for (let i = 0; i < 6; i++) bits += EAN_R[Number(d[i + 7])];
    bits += "101";
    return bits;
  }

  function bitsSvg(bits, text, opts) {
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

  function code128Svg(text, opts) {
    return bitsSvg(encodeCode128(text), text, opts);
  }

  function ean13Svg(text, opts) {
    const bits = encodeEan13(text);
    if (!bits) return code128Svg(text, opts);
    return bitsSvg(bits, text, opts);
  }

  function barcodeSvg(row, opts) {
    const code = asBarcodeString(row?.barcode || row?.code || row);
    const format = String(row?.format || row?.barcode_format || "").toLowerCase();
    if (!code) return "";
    if (format === "ean13" || isValidEan13(code)) return ean13Svg(code, opts);
    return code128Svg(code, opts);
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
    const svg = code ? barcodeSvg(row, { height: 44, scale: 1.6 }) : "";
    const shop = row.shop ? `<div class="bc-shop">${escapeHtml(row.shop)}</div>` : "";
    const logo = row.logo ? `<img class="bc-logo" alt="" src="${escapeHtml(row.logo)}" />` : "";
    const bits = [];
    if (row.size) bits.push(`Size ${row.size}`);
    if (row.color) bits.push(row.color);
    if (row.batch_no || row.batch) bits.push(`Batch ${row.batch_no || row.batch}`);
    if (row.expiry) bits.push(`Exp ${row.expiry}`);
    if (row.serial_no || row.serial) bits.push(`SN ${row.serial_no || row.serial}`);
    if (row.sku || row.item_code) bits.push(row.sku || row.item_code);
    const extra = bits.length ? `<div class="bc-extra">${escapeHtml(bits.join(" · "))}</div>` : "";
    return `<article class="bc-label">
      ${logo}${shop}
      <div class="bc-name">${name}</div>
      ${extra}
      <div class="bc-meta">${mrp ? `MRP ${escapeHtml(mrp)}` : ""}${mrp && rate ? " · " : ""}${rate ? `SP ${escapeHtml(rate)}` : ""}</div>
      <div class="bc-svg">${svg}</div>
      <div class="bc-code">${code}</div>
    </article>`;
  }

  function labelsDocument(rows, opts) {
    const layout = opts?.layout === "a4" ? "a4" : "thermal";
    const width = Math.max(20, Math.min(120, Number(opts?.widthMm) || (layout === "a4" ? 48 : 50)));
    const height = Math.max(15, Math.min(90, Number(opts?.heightMm) || (layout === "a4" ? 25 : 30)));
    const cards = (rows || []).map(labelCard).join("");
    const columns = layout === "a4" ? "repeat(4, 48mm)" : `repeat(auto-fill, ${width}mm)`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Barcode labels</title>
<style>
@page { margin: 8mm; }
body { margin: 0; font-family: "Segoe UI", sans-serif; color: #111; }
.bc-sheet { display: grid; grid-template-columns: ${columns}; gap: 4mm; padding: 4mm; }
.bc-label { border: 1px solid #222; padding: 2mm; break-inside: avoid; text-align: center; width: ${width}mm; min-height: ${height}mm; box-sizing: border-box; }
.bc-shop { font-size: 10px; font-weight: 700; }
.bc-logo { max-height: 10mm; max-width: 24mm; object-fit: contain; }
.bc-name { font-weight: 700; font-size: 12px; }
.bc-extra, .bc-meta, .bc-code { font-size: 10px; color: #333; margin: 1mm 0; }
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

  function printLabels(rows, copies, opts) {
    const w = window.open("", "barcode-labels", "width=720,height=900");
    if (!w) return false;
    w.document.write(labelsDocument(expandCopies(rows, copies), opts));
    w.document.close();
    return true;
  }

  function labelsCsv(rows) {
    const head = ["barcode", "kind", "status", "product", "sku", "size", "colour", "batch", "serial", "created"];
    const lines = [head.join(",")];
    for (const row of rows || []) {
      const cells = [
        row.barcode,
        row.kind,
        row.status,
        row.item_name || row.name,
        row.item_code || row.sku,
        row.size,
        row.color,
        row.batch_no,
        row.serial_no,
        row.created_at,
      ].map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`);
      lines.push(cells.join(","));
    }
    return lines.join("\n");
  }

  return {
    ean13Checksum,
    isValidEan13,
    generateEan13,
    asBarcodeString,
    cleanCode,
    barcodesEqual,
    isBarcodeLike,
    isReusableProductKind,
    itemHasBarcode,
    shouldConsumePieceBarcode,
    parseManualCodes,
    encodeCode128,
    encodeEan13,
    code128Svg,
    ean13Svg,
    barcodeSvg,
    deskProfile,
    deskLead,
    normalizeBarcodeKind,
    isPieceKind,
    kindLabel,
    labelsDocument,
    labelsCsv,
    expandCopies,
    printLabels,
  };
});
