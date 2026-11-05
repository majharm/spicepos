/** A one-page invoice PDF built from the saved bill. No browser or extra package. */

function ascii(value) {
  return String(value ?? "")
    .replaceAll("₹", "Rs ")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfEscape(value) {
  return ascii(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function money(n) {
  const v = Number(n);
  return `Rs ${(Number.isFinite(v) ? v : 0).toFixed(2)}`;
}

export function invoicePdfLines(company = {}, order = {}, lines = []) {
  const shop = ascii(company.name) || "Shop";
  const rows = [
    shop,
    ascii(company.address),
    [company.phone ? `Phone ${ascii(company.phone)}` : "", company.gstin ? `GSTIN ${ascii(company.gstin)}` : ""]
      .filter(Boolean)
      .join("   "),
    "",
    `Invoice ${ascii(order.order_number) || "Invoice"}`,
    `Date ${ascii(order.invoice_date) || ""}`,
    `Customer ${ascii(order.customer_name) || "Customer"}`,
    order.customer_email ? `Email ${ascii(order.customer_email)}` : "",
    "",
    "Item                          Qty        Rate       Amount",
  ];
  const items = (Array.isArray(lines) ? lines : []).filter((line) => Number(line?.cancelled) !== 1);
  const shown = items.slice(0, 24);
  for (const line of shown) {
    const name = ascii(line.item_name || line.name || "Item").slice(0, 28).padEnd(28, " ");
    const qty = ascii(line.quantity_gm ?? line.quantity ?? "").slice(0, 8).padStart(8, " ");
    const rate = money(line.rate_per_kg ?? line.rate).padStart(12, " ");
    const amount = money(line.amount).padStart(12, " ");
    rows.push(`${name}${qty}${rate}${amount}`);
  }
  if (items.length > shown.length) rows.push(`+ ${items.length - shown.length} more lines on the shop invoice`);
  rows.push("");
  const subtotal = Number(order.subtotal) || 0;
  const discount = Number(order.discount) || 0;
  const loyalty = Number(order.loyalty_discount) || 0;
  const taxable = Math.max(0, Math.round((subtotal - discount - loyalty) * 100) / 100);
  if (subtotal) rows.push(`Subtotal ${money(subtotal)}`);
  if (discount) rows.push(`Discount ${money(discount)}`);
  if (loyalty) rows.push(`Royalty points redeemed ${money(loyalty)}`);
  if (discount || loyalty) rows.push(`Taxable amount ${money(taxable)}`);
  if (Number(order.gst)) rows.push(`GST ${money(order.gst)}`);
  rows.push(`Grand total ${money(order.total)}`);
  rows.push("");
  rows.push(order.payment_status ? `Payment ${ascii(order.payment_status)}` : "");
  rows.push("This is a computer-generated invoice.");
  return rows.filter((line) => line !== "");
}

export function buildPdf(textLines) {
  const commands = ["BT", "/F1 11 Tf", "48 800 Td", "14 TL"];
  textLines.forEach((line, index) => {
    const text = `(${pdfEscape(line).slice(0, 110)})`;
    commands.push(index === 0 ? `${text} Tj` : `${text} '`);
  });
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(body);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  body += `${xref}trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(body, "latin1");
}

export function invoicePdfBuffer(company, order, lines) {
  return buildPdf(invoicePdfLines(company, order, lines));
}

const TEAL = [0.102, 0.478, 0.427];
const MINT = [0.929, 0.969, 0.961];
const INK = [0.129, 0.129, 0.129];
const MUTED = [0.333, 0.333, 0.333];
const HAIR = [0.9, 0.9, 0.9];
const WHITE = [1, 1, 1];

function pdfNum(value) {
  return (Math.round(Number(value) * 100) / 100).toString();
}

function charWidth(ch) {
  if (ch === " ") return 278;
  if ("ilj.,'`:;!".includes(ch)) return 278;
  if ("ftrI".includes(ch)) return 333;
  if ("mwMW@".includes(ch)) return 833;
  if (ch >= "0" && ch <= "9") return 556;
  if (ch >= "A" && ch <= "Z") return 667;
  return 500;
}

function textWidth(value, size, bold = false) {
  let units = 0;
  for (const ch of ascii(value)) units += charWidth(ch);
  return (units / 1000) * size * (bold ? 1.04 : 1);
}

function wrapText(value, maxWidth, size, bold = false) {
  const words = ascii(value).split(" ").filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (textWidth(next, size, bold) <= maxWidth) current = next;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function measuredLine(line) {
  const unit = ascii(line?.unit).toUpperCase();
  if (line?.isCount === false || line?.is_count === false || line?.is_count === 0) return true;
  return unit === "GM" || unit === "G" || unit === "KG";
}

function qtyLabel(line) {
  const qty = Number(line?.quantity ?? line?.qty) || 0;
  const unit = ascii(line?.unit).toUpperCase();
  if (measuredLine(line) && (unit === "GM" || unit === "G" || unit === "") && qty >= 1000) return `${(qty / 1000).toFixed(2)} kg`;
  if (measuredLine(line) && unit === "KG") return `${qty.toFixed(2)} kg`;
  return `${ascii(line?.quantity ?? line?.qty ?? "")} ${ascii(line?.unit || "")}`.trim();
}

function rateLabel(line) {
  return `${inr(line?.rate)}${measuredLine(line) ? "/kg" : ""}`;
}

function inr(value) {
  const n = Number(value);
  const neg = Number.isFinite(n) && n < 0;
  const abs = (Number.isFinite(n) ? Math.abs(n) : 0).toFixed(2);
  const [whole, dec] = abs.split(".");
  let grouped = whole;
  if (whole.length > 3) {
    const last = whole.slice(-3);
    const rest = whole.slice(0, -3).replace(/\B(?=(?:\d{2})+(?!\d))/g, ",");
    grouped = `${rest},${last}`;
  }
  return `${neg ? "-" : ""}Rs ${grouped}.${dec}`;
}

function prettyDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!match) return ascii(value);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${match[3]} ${months[Number(match[2]) - 1] || ""} ${match[1]}`.trim();
}

function rupeesInWords(value) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`.trim());
  const three = (n) => (n < 100 ? two(n) : `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${two(n % 100)}` : ""}`.trim());
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  const rupees = Math.floor(Math.abs(rounded));
  const paise = Math.round((Math.abs(rounded) - rupees) * 100);
  if (!rupees && !paise) return "Rupees Zero Only";
  let rest = rupees;
  const crore = Math.floor(rest / 10000000);
  rest %= 10000000;
  const lakh = Math.floor(rest / 100000);
  rest %= 100000;
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;
  const parts = [];
  if (crore) parts.push(`${two(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  let out = `Rupees ${parts.join(" ") || "Zero"}`;
  if (paise) out += ` and ${two(paise)} Paise`;
  return `${out} Only`;
}

function gstGroups(lines, quote = {}) {
  const groups = new Map();
  for (const line of lines) {
    const rate = Number(line.gstRate ?? line.gst_rate) || 0;
    const key = rate.toFixed(2);
    const row = groups.get(key) || { rate, taxable: 0, gst: 0 };
    row.taxable += Number(line.taxable) || 0;
    row.gst += Number(line.gst) || 0;
    groups.set(key, row);
  }
  const rows = [...groups.values()];
  const rawGst = rows.reduce((sum, row) => sum + row.gst, 0);
  const rawTaxable = rows.reduce((sum, row) => sum + row.taxable, 0);
  const billGst = Number(quote.gst);
  const billTaxable = Number(quote.taxable);
  const gstScale = rawGst > 0.009 && Number.isFinite(billGst) ? billGst / rawGst : 1;
  const taxScale = rawTaxable > 0.009 && Number.isFinite(billTaxable) ? billTaxable / rawTaxable : 1;
  return rows.map((row) => ({ ...row, taxable: row.taxable * taxScale, gst: row.gst * gstScale }));
}

function quotationPdfLines(company = {}, quote = {}) {
  const items = Array.isArray(quote.lines) ? quote.lines : [];
  return [
    ascii(company.name) || "Shop",
    "QUOTATION",
    "QUOTATION - NOT A TAX INVOICE",
    `Quotation# ${ascii(quote.quotation_number) || "Quotation"}`,
    `Bill To ${ascii(quote.customer_name) || "Customer"}`,
    `Quoted total ${inr(quote.total)}`,
    items.length ? "Item & Description" : "No line items",
    `Amount in words: ${rupeesInWords(quote.total)}`,
  ];
}

function buildPdfPages(streams) {
  const pages = streams.length ? streams : ["BT ET"];
  const fontRegular = pages.length * 2 + 3;
  const fontBold = fontRegular + 1;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${index * 2 + 3} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];
  pages.forEach((stream) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${objects.length + 2} 0 R /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(body);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  body += `${xref}trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(body, "latin1");
}

function paintOfficeQuotation(company = {}, quote = {}) {
  const items = Array.isArray(quote.lines) ? quote.lines : [];
  const left = 36;
  const right = 559;
  const width = right - left;
  const pages = [];
  let ops = [];
  let y = 806;
  const rgb = (color) => color.map((part) => (Math.round(part * 1000) / 1000).toString()).join(" ");
  const add = (op) => ops.push(op);
  const fill = (color, x, top, w, h) => {
    add(`${rgb(color)} rg`);
    add(`${pdfNum(x)} ${pdfNum(top - h)} ${pdfNum(w)} ${pdfNum(h)} re f`);
  };
  const rule = (x, top, w) => {
    add(`${rgb(HAIR)} RG`);
    add("0.6 w");
    add(`${pdfNum(x)} ${pdfNum(top)} m ${pdfNum(x + w)} ${pdfNum(top)} l S`);
  };
  const text = (font, size, x, baseline, value, color = INK) => {
    const safe = pdfEscape(value).slice(0, 180);
    if (!safe) return;
    add(`${rgb(color)} rg`);
    add("BT");
    add(`/${font} ${pdfNum(size)} Tf`);
    add(`1 0 0 1 ${pdfNum(x)} ${pdfNum(baseline)} Tm`);
    add(`(${safe}) Tj`);
    add("ET");
  };
  const rightText = (font, size, edge, baseline, value, color = INK, bold = false) => {
    const shown = ascii(value);
    text(font, size, edge - textWidth(shown, size, bold), baseline, shown, color);
  };
  const finishPage = () => {
    text("F1", 8, left, 28, "QUOTATION - NOT A TAX INVOICE", MUTED);
    rightText("F1", 8, right, 28, `Page ${pages.length + 1}`, MUTED, false);
    pages.push(ops.join("\n"));
    ops = [];
    y = 806;
  };
  const room = (need) => {
    if (y - need >= 52) return;
    finishPage();
    text("F2", 11, left, y - 12, ascii(company.name) || "Shop", TEAL);
    rightText("F1", 9, right, y - 12, ascii(quote.quotation_number) || "Quotation", MUTED, false);
    y -= 28;
  };

  const shop = ascii(company.name) || "Shop";
  text("F2", 16, left, y - 16, shop, TEAL);
  rightText("F2", 16, right, y - 16, "QUOTATION", TEAL, true);
  y -= 22;
  rightText("F1", 8, right, y - 8, "QUOTATION - NOT A TAX INVOICE", MUTED, false);
  y -= 16;
  const seller = [
    ascii(company.address),
    [ascii(company.city), ascii(company.state)].filter(Boolean).join(", "),
    [company.phone ? `Ph: ${ascii(company.phone)}` : "", company.email ? `Email: ${ascii(company.email)}` : ""].filter(Boolean).join("  "),
    [company.gstin ? `GSTIN: ${ascii(company.gstin)}` : "", company.pan ? `PAN: ${ascii(company.pan)}` : ""].filter(Boolean).join("  "),
  ].filter(Boolean).flatMap((line) => wrapText(line, 280, 9)).slice(0, 6);
  const meta = [
    ["Quotation#", ascii(quote.quotation_number) || "Quotation"],
    ["Quotation Date", prettyDate(quote.quotation_date)],
    ["Valid until", prettyDate(quote.valid_until) || "-"],
  ];
  if (ascii(quote.reference_no)) meta.push(["Reference", ascii(quote.reference_no)]);
  if (ascii(quote.salesperson)) meta.push(["Salesperson", ascii(quote.salesperson)]);
  let sellerY = y;
  seller.forEach((line) => {
    text("F1", 9, left, sellerY - 9, line, MUTED);
    sellerY -= 12;
  });
  let metaY = y;
  for (const [label, value] of meta) {
    text("F1", 9, 360, metaY - 9, label, MUTED);
    rightText("F2", 9, right, metaY - 9, value, INK, true);
    metaY -= 13;
  }
  metaY -= 4;
  fill(MINT, 360, metaY, 199, 22);
  fill(TEAL, 360, metaY, 4, 22);
  text("F2", 9, 370, metaY - 15, "Quoted total", TEAL);
  rightText("F2", 11, right - 6, metaY - 15, inr(quote.total), TEAL, true);
  metaY -= 30;
  y = Math.min(sellerY, metaY) - 6;
  room(16);
  text("F2", 8, left, y - 8, "BILL TO", MUTED);
  text("F2", 8, 310, y - 8, ascii(quote.shipping_address) ? "SHIP TO" : "PLACE OF SUPPLY", MUTED);
  y -= 14;
  const buyer = [
    ascii(quote.customer_name) || "Customer",
    ascii(quote.customer_phone),
    quote.customer_email ? `Email: ${ascii(quote.customer_email)}` : "",
    ...wrapText(quote.billing_address, 250, 9),
  ].filter(Boolean);
  const other = ascii(quote.shipping_address)
    ? wrapText(quote.shipping_address, 230, 9)
    : wrapText([company.address, company.city, company.state].filter(Boolean).join(", "), 230, 9);
  const partyRows = Math.max(buyer.length, other.length, 1);
  for (let i = 0; i < partyRows; i += 1) {
    room(12);
    if (buyer[i]) text(i === 0 ? "F2" : "F1", 9, left, y - 9, buyer[i], i === 0 ? INK : MUTED);
    if (other[i]) text("F1", 9, 310, y - 9, other[i], MUTED);
    y -= 12;
  }
  y -= 8;

  const drawHead = () => {
    room(20);
    fill(TEAL, left, y, width, 18);
    text("F2", 9, left + 6, y - 13, "#", WHITE);
    text("F2", 9, left + 28, y - 13, "Item & Description", WHITE);
    rightText("F2", 9, 400, y - 13, "Qty", WHITE, true);
    rightText("F2", 9, 470, y - 13, "Rate", WHITE, true);
    rightText("F2", 9, right - 6, y - 13, "Amount", WHITE, true);
    y -= 18;
  };
  drawHead();
  if (!items.length) {
    room(18);
    text("F1", 9, left + 28, y - 13, "No line items", MUTED);
    y -= 18;
  }
  items.forEach((line, index) => {
    const name = ascii(line.name || line.item_name || "Item");
    const extra = [line.sku, line.size, line.color, line.description, `GST ${Number(line.gstRate ?? line.gst_rate) || 0}%`]
      .map(ascii)
      .filter(Boolean)
      .join(" · ");
    const nameLines = wrapText(name, 230, 9, true).slice(0, 2);
    const extraLines = wrapText(extra, 230, 8).slice(0, 2);
    const rowH = 8 + nameLines.length * 11 + extraLines.length * 10;
    if (y - rowH < 52) {
      finishPage();
      drawHead();
    }
    const top = y;
    text("F1", 9, left + 6, top - 14, String(index + 1), MUTED);
    nameLines.forEach((part, i) => text("F2", 9, left + 28, top - 14 - i * 11, part, INK));
    extraLines.forEach((part, i) => text("F1", 8, left + 28, top - 14 - nameLines.length * 11 - i * 10, part, MUTED));
    rightText("F1", 9, 400, top - 14, qtyLabel(line), INK, false);
    rightText("F1", 9, 470, top - 14, rateLabel(line), INK, false);
    rightText("F2", 9, right - 6, top - 14, inr(line.taxable ?? line.total ?? line.amount), INK, true);
    y -= rowH;
    rule(left, y, width);
    y -= 2;
  });

  const groups = gstGroups(items, quote);
  const inter = Number(quote.igst) > 0.009 && !(Number(quote.cgst) > 0.009);
  const totals = [["Subtotal", inr(quote.subtotal)]];
  if (Number(quote.discount) > 0.009) totals.push(["Discount", `(-) ${inr(quote.discount)}`]);
  if (Number(quote.discount) > 0.009 || Number(quote.subtotal)) totals.push(["Taxable amount", inr(quote.taxable ?? Math.max(0, Number(quote.subtotal || 0) - Number(quote.discount || 0)))]);
  if (Number(quote.extra_charges ?? quote.extraCharges) > 0.009) totals.push(["Additional charges", inr(quote.extra_charges ?? quote.extraCharges)]);
  totals.push(["Tax", inr(quote.gst)]);
  if (Math.abs(Number(quote.round_off ?? quote.roundOff) || 0) > 0.009) totals.push(["Round off", inr(quote.round_off ?? quote.roundOff)]);
  totals.push(["Quotation total", inr(quote.total)]);
  const words = wrapText(`Amount in words: ${rupeesInWords(quote.total)}`, 300, 9);
  const notes = wrapText(quote.notes, 300, 8).slice(0, 4);
  const terms = wrapText(quote.terms, 300, 8).slice(0, 6);
  const summaryH = 16 + groups.length * 14 + words.length * 12 + (notes.length ? 24 + notes.length * 10 : 0) + (terms.length ? 24 + terms.length * 10 : 0) + 70;
  if (y - Math.max(summaryH, totals.length * 14 + 80) < 52) finishPage();
  const summaryTop = y;
  if (groups.length) {
    text("F2", 8, left, y - 12, "Rate", MUTED);
    text("F2", 8, left + 50, y - 12, "Taxable", MUTED);
    text("F2", 8, left + 120, y - 12, inter ? "IGST" : "CGST", MUTED);
    text("F2", 8, left + 180, y - 12, inter ? "" : "SGST", MUTED);
    text("F2", 8, left + 240, y - 12, "Tax", MUTED);
    y -= 16;
    for (const group of groups) {
      const half = inter ? 0 : group.gst / 2;
      text("F1", 8, left, y - 10, `${group.rate}%`, INK);
      text("F1", 8, left + 50, y - 10, inr(group.taxable), INK);
      text("F1", 8, left + 120, y - 10, inr(inter ? group.gst : half), INK);
      if (!inter) text("F1", 8, left + 180, y - 10, inr(group.gst - half), INK);
      text("F1", 8, left + 240, y - 10, inr(group.gst), INK);
      y -= 13;
    }
  }
  y -= 4;
  for (const line of words) {
    text("F1", 9, left, y - 10, line, INK);
    y -= 12;
  }
  if (notes.length) {
    y -= 4;
    text("F2", 9, left, y - 10, "Notes", TEAL);
    y -= 14;
    for (const line of notes) {
      text("F1", 8, left, y - 9, line, MUTED);
      y -= 10;
    }
  }
  if (terms.length) {
    y -= 4;
    text("F2", 9, left, y - 10, "Terms & conditions", TEAL);
    y -= 14;
    for (const line of terms) {
      text("F1", 8, left, y - 9, line, MUTED);
      y -= 10;
    }
  }
  let ty = summaryTop;
  for (const [label, value] of totals) {
    const grand = label === "Quotation total";
    if (grand) {
      fill(MINT, 360, ty, 199, 18);
      fill(TEAL, 360, ty, 4, 18);
    }
    text(grand ? "F2" : "F1", grand ? 10 : 9, 370, ty - (grand ? 13 : 11), label, grand ? TEAL : MUTED);
    rightText(grand ? "F2" : "F1", grand ? 10 : 9, right - 4, ty - (grand ? 13 : 11), value, grand ? TEAL : INK, grand);
    ty -= grand ? 20 : 14;
  }
  y = Math.min(y, ty) - 18;
  room(46);
  text("F1", 10, left, y - 12, "Thanks for your business.", TEAL);
  y -= 36;
  rule(left, y + 16, 150);
  rule(390, y + 16, 150);
  text("F1", 8, left, y, "Customer acceptance", MUTED);
  rightText("F1", 8, right, y, `For ${shop}`, MUTED, false);
  y -= 16;
  const note = wrapText("This is a computer-generated quotation. No signature is required. Stock and payment are unchanged until a sales invoice is posted.", width, 8);
  for (const line of note) {
    room(11);
    text("F1", 8, left, y - 8, line, MUTED);
    y -= 11;
  }
  finishPage();
  return pages;
}

export { quotationPdfLines };

export function quotationPdfBuffer(company, quote) {
  return buildPdfPages(paintOfficeQuotation(company, quote));
}
