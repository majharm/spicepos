export function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cell(value) {
  if (value == null || value === "") {
    return `<Cell><Data ss:Type="String"></Data></Cell>`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

export function workbookXml(sheets) {
  const body = sheets
    .map((sheet) => {
      const header = `<Row>${sheet.headers.map((h) => cell(h)).join("")}</Row>`;
      const rows = sheet.rows.map((row) => `<Row>${row.map((v) => cell(v)).join("")}</Row>`).join("");
      return `<Worksheet ss:Name="${escapeXml(sheet.name.slice(0, 31))}"><Table>${header}${rows}</Table></Worksheet>`;
    })
    .join("");
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${body}
</Workbook>`;
}
