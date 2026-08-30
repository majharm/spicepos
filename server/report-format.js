export function formatReportDay(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

export function emptyReports(from, to) {
  return {
    from,
    to,
    summary: { bills: 0, taxable: 0, gst: 0, takings: 0 },
    sales: [],
    byItem: [],
    byCustomer: [],
    byPack: [],
    byPay: [],
    gst: [],
    stock: [],
    low: [],
    purchases: [],
    customers: [],
  };
}

export function reportsToSheets(data) {
  const num = (v) => Number(v) || 0;
  const summary = data.summary || {};
  const sales = data.sales || [];
  const byItem = data.byItem || [];
  const byCustomer = data.byCustomer || [];
  const byPack = data.byPack || [];
  const byPay = data.byPay || [];
  const gst = data.gst || [];
  const stock = data.stock || [];
  const low = data.low || [];
  const purchases = data.purchases || [];
  const customers = data.customers || [];
  return [
    {
      name: "Summary",
      headers: ["From", "To", "Bills", "Taxable", "GST", "Takings"],
      rows: [[data.from, data.to, num(summary.bills), num(summary.taxable), num(summary.gst), num(summary.takings ?? summary.total)]],
    },
    {
      name: "Sales bills",
      headers: ["Order", "Customer", "Type", "Pack", "Pack count", "Status", "Qty g", "Taxable", "GST", "Total", "Pay", "Pay status", "Date"],
      rows: sales.map((o) => [
        o.order_number,
        o.customer_name,
        o.customer_type,
        o.pack_name || "Loose items",
        num(o.pack_count),
        o.status,
        num(o.total_quantity_gm),
        num(o.subtotal),
        num(o.gst),
        num(o.total),
        o.payment_method,
        o.payment_status,
        o.created_at instanceof Date ? o.created_at.toISOString() : String(o.created_at || ""),
      ]),
    },
    {
      name: "Item sales",
      headers: ["Item", "Qty g", "Amount", "GST"],
      rows: byItem.map((r) => [r.item_name, num(r.quantity_gm), num(r.amount), num(r.gst)]),
    },
    {
      name: "Customer sales",
      headers: ["Customer", "Type", "Bills", "Takings", "GST"],
      rows: byCustomer.map((r) => [r.customer_name, r.customer_type, num(r.bills), num(r.takings), num(r.gst)]),
    },
    {
      name: "Pack sales",
      headers: ["Pack type", "Pack count", "Bills", "Takings"],
      rows: byPack.map((r) => [r.pack_type, num(r.pack_count), num(r.bills), num(r.takings)]),
    },
    {
      name: "Payment",
      headers: ["Method", "Bills", "Takings"],
      rows: byPay.map((r) => [r.payment_method, num(r.bills), num(r.takings)]),
    },
    {
      name: "GST daywise",
      headers: ["Day", "Taxable", "GST", "Total"],
      rows: gst.map((r) => [formatReportDay(r.day), num(r.taxable), num(r.gst), num(r.total)]),
    },
    {
      name: "Stock",
      headers: ["Code", "Name", "Local", "Category", "Subcategory", "Stock g", "Reorder g", "Retail", "B2B", "Purchase", "GST %"],
      rows: stock.map((i) => [
        i.code, i.name, i.local_name, i.category, i.subcategory,
        num(i.stock_gm), num(i.reorder_level_gm), num(i.retail_rate), num(i.b2b_rate),
        num(i.purchase_rate), num(i.gst_rate),
      ]),
    },
    {
      name: "Low stock",
      headers: ["Code", "Name", "Stock g", "Reorder g"],
      rows: low.map((i) => [i.code, i.name, num(i.stock_gm), num(i.reorder_level_gm)]),
    },
    {
      name: "Purchases",
      headers: ["PO", "Supplier", "Invoice", "Date", "Taxable", "GST", "Total", "Pay", "Status"],
      rows: purchases.map((p) => [
        p.purchase_number, p.supplier_name, p.supplier_invoice_number, p.purchase_date,
        num(p.subtotal), num(p.gst), num(p.total), p.payment_method, p.payment_status,
      ]),
    },
    {
      name: "Customers",
      headers: ["Code", "Name", "Business", "Mobile", "Type", "GSTIN", "Credit limit", "Outstanding"],
      rows: customers.map((c) => [
        c.code, c.name, c.business_name, c.mobile, c.type, c.gstin,
        num(c.credit_limit), num(c.outstanding),
      ]),
    },
  ];
}
