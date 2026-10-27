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
  if (Number(order.subtotal)) rows.push(`Subtotal ${money(order.subtotal)}`);
  if (Number(order.discount)) rows.push(`Discount ${money(order.discount)}`);
  if (Number(order.gst)) rows.push(`Tax ${money(order.gst)}`);
  rows.push(`Total ${money(order.total)}`);
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

export function quotationPdfLines(company = {}, quote = {}) {
  const shop = ascii(company.name) || "Shop";
  const rows = [
    shop,
    ascii(company.address),
    [company.phone ? `Phone ${ascii(company.phone)}` : "", company.gstin ? `GSTIN ${ascii(company.gstin)}` : ""]
      .filter(Boolean)
      .join("   "),
    "",
    "QUOTATION",
    "QUOTATION - NOT A TAX INVOICE",
    `Number ${ascii(quote.quotation_number) || "Quotation"}`,
    `Date ${ascii(quote.quotation_date) || ""}`,
    `Valid until ${ascii(quote.valid_until) || ""}`,
    `Customer ${ascii(quote.customer_name) || "Customer"}`,
    quote.customer_email ? `Email ${ascii(quote.customer_email)}` : "",
    quote.billing_address ? ascii(quote.billing_address) : "",
    "",
    "Item                          Qty        Rate       Amount",
  ];
  const items = Array.isArray(quote.lines) ? quote.lines : [];
  const shown = items.slice(0, 18);
  for (const line of shown) {
    const name = ascii(line.name || line.item_name || "Item").slice(0, 28).padEnd(28, " ");
    const qty = ascii(line.quantity ?? line.qty ?? "").slice(0, 8).padStart(8, " ");
    const rate = money(line.rate).padStart(12, " ");
    const amount = money(line.total ?? line.amount).padStart(12, " ");
    rows.push(`${name}${qty}${rate}${amount}`);
  }
  if (items.length > shown.length) rows.push(`+ ${items.length - shown.length} more lines on the printed quotation`);
  rows.push("");
  if (Number(quote.subtotal)) rows.push(`Subtotal ${money(quote.subtotal)}`);
  if (Number(quote.discount)) rows.push(`Discount ${money(quote.discount)}`);
  if (Number(quote.gst)) rows.push(`Tax ${money(quote.gst)}`);
  rows.push(`Grand total ${money(quote.total)}`);
  rows.push("");
  rows.push("This document is a quotation, not a tax invoice.");
  rows.push("Stock and payment are unchanged until a sales invoice is posted.");
  return rows.filter((line) => line !== "");
}

export function quotationPdfBuffer(company, quote) {
  return buildPdf(quotationPdfLines(company, quote));
}
