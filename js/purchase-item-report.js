/* Item-wise purchase report.
   One posted purchase line is one row. Amount is already net of discount.
   Total qty = purchase qty + free qty. Final amount = net + GST.
   Cancelled bills are left out. A return is counted once, never also as a purchase. */
(function (root) {
  const PAGE = 25;
  const CANCELLED = new Set(["cancelled", "canceled", "void", "voided"]);

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function round2(value) {
    return Math.round((num(value) + Number.EPSILON) * 100) / 100;
  }

  function day(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  }

  function clock(value) {
    const match = String(value || "").trim().match(/(?:T|\s)(\d{2}:\d{2})/);
    return match ? match[1] : "";
  }

  function batchId(row) {
    return String(row?.batch_id || row?.batchId || row?.batch_no || row?.batchNo || "").trim();
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function money(value) {
    return round2(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function qtyText(value) {
    const n = Math.round(num(value) * 1000) / 1000;
    return String(n);
  }

  function includes(hay, needle) {
    const q = String(needle || "").trim().toLowerCase();
    if (!q) return true;
    return String(hay || "").toLowerCase().includes(q);
  }

  function cancelled(status) {
    return CANCELLED.has(String(status || "").trim().toLowerCase());
  }

  function normalizeLine(row) {
    const purchaseQty = num(row.purchase_qty ?? row.quantity_gm);
    const freeQty = Math.max(0, num(row.free_qty ?? row.freeQty));
    const discount = Math.max(0, num(row.discount));
    const net = num(row.net ?? row.amount);
    const gst = num(row.gst ?? row.gst_amount);
    const hasTotal = row.total_amount != null || row.total != null;
    const total = hasTotal ? num(row.total_amount ?? row.total) : round2(net + gst);
    const invoice = String(row.supplier_invoice_number || row.invoice || "").trim();
    const purchaseNumber = String(row.purchase_number || "").trim();
    return {
      id: String(row.id || ""),
      item_id: String(row.item_id || ""),
      product_name: String(row.product_name || row.item_name || row.catalog_name || row.name || "Item"),
      product_code: String(row.product_code || row.code || row.item_barcode || row.line_barcode || row.barcode || ""),
      category: String(row.category || ""),
      brand: String(row.brand || ""),
      supplier: String(row.supplier || row.supplier_name || ""),
      purchase_qty: purchaseQty,
      free_qty: freeQty,
      total_qty: purchaseQty + freeQty,
      rate: num(row.rate ?? row.rate_per_kg),
      discount,
      net,
      gst,
      total,
      purchase_date: day(row.purchase_date),
      purchase_time: String(row.purchase_time || row.purchaseTime || clock(row.purchase_at || row.created_at) || ""),
      batch_id: batchId(row),
      invoice: invoice || purchaseNumber,
      purchase_number: purchaseNumber,
      purchase_id: String(row.purchase_id || ""),
      branch: String(row.branch || row.branch_name || ""),
      branch_id: String(row.branch_id || ""),
      status: String(row.status || "posted"),
      kind: String(row.kind || "purchase"),
    };
  }

  function uniqueLines(rows) {
    const seen = new Set();
    const out = [];
    for (const row of rows || []) {
      const line = normalizeLine(row);
      if (cancelled(line.status)) continue;
      if (line.id) {
        if (seen.has(line.id)) continue;
        seen.add(line.id);
      }
      out.push(line);
    }
    return out;
  }

  function returnLines(rows, purchases) {
    const already = new Set((purchases || []).filter((line) => line.purchase_qty < 0 && line.item_id).map((line) => line.item_id));
    const seen = new Set();
    return (rows || []).map((row) => {
      const qty = Math.abs(num(row.qty ?? row.quantity_gm));
      const value = Math.abs(num(row.value ?? row.amount));
      return normalizeLine({
        id: `return:${row.item_id || row.product_name || ""}:${day(row.purchase_date)}`,
        item_id: row.item_id,
        product_name: row.product_name || row.item_name || row.name,
        product_code: row.product_code || row.code || row.barcode,
        category: row.category,
        brand: row.brand,
        supplier_name: "Purchase return",
        quantity_gm: -qty,
        free_qty: 0,
        rate_per_kg: qty ? value / qty : 0,
        discount: 0,
        amount: -value,
        gst_amount: 0,
        total_amount: -value,
        purchase_date: row.purchase_date,
        purchase_time: row.purchase_time || clock(row.created_at),
        batch_id: row.batch_id || row.batch_no || "",
        purchase_number: "Return",
        supplier_invoice_number: "Return",
        kind: "return",
        status: "posted",
      });
    }).filter((line) => {
    if (!line.item_id || already.has(line.item_id) || line.purchase_qty === 0 || seen.has(line.id)) return false;
    seen.add(line.id);
    return true;
  });
  }

  function matches(line, filters) {
    const f = filters || {};
    if (f.item) {
      if (line.item_id !== String(f.item)) return false;
    } else if (!includes(`${line.product_name} ${line.product_code}`, f.product)) return false;
    if (!includes(line.category, f.category)) return false;
    if (!includes(line.supplier, f.supplier)) return false;
    if (!includes(line.brand, f.brand)) return false;
    if (!includes(`${line.invoice} ${line.purchase_number}`, f.invoice)) return false;
    if (f.branch) {
      const branch = String(f.branch);
      if (line.branch_id !== branch && !includes(line.branch, branch)) return false;
    }
    return true;
  }

  function summarize(lines) {
    const items = new Set();
    const summary = { items: 0, purchaseQty: 0, freeQty: 0, amount: 0, gst: 0, discount: 0 };
    for (const line of lines) {
      if (line.kind !== "return" && line.total_qty !== 0) items.add(line.item_id || line.product_name);
      summary.purchaseQty += line.purchase_qty;
      summary.freeQty += line.free_qty;
      summary.amount += line.total;
      summary.gst += line.gst;
      summary.discount += line.discount;
    }
    summary.items = items.size;
    summary.purchaseQty = round2(summary.purchaseQty);
    summary.freeQty = round2(summary.freeQty);
    summary.amount = round2(summary.amount);
    summary.gst = round2(summary.gst);
    summary.discount = round2(summary.discount);
    return summary;
  }

  function bySupplier(lines) {
    const map = new Map();
    for (const line of lines) {
      const key = line.supplier || "Supplier";
      const row = map.get(key) || { supplier: key, items: new Set(), purchaseQty: 0, freeQty: 0, amount: 0, gst: 0, discount: 0 };
      if (line.item_id || line.product_name) row.items.add(line.item_id || line.product_name);
      row.purchaseQty += line.purchase_qty;
      row.freeQty += line.free_qty;
      row.amount += line.total;
      row.gst += line.gst;
      row.discount += line.discount;
      map.set(key, row);
    }
    return [...map.values()]
      .map((row) => ({
        supplier: row.supplier,
        items: row.items.size,
        purchaseQty: round2(row.purchaseQty),
        freeQty: round2(row.freeQty),
        amount: round2(row.amount),
        gst: round2(row.gst),
        discount: round2(row.discount),
      }))
      .sort((a, b) => b.amount - a.amount || a.supplier.localeCompare(b.supplier));
  }

  function byRate(lines) {
    const map = new Map();
    for (const line of lines) {
      if (line.kind === "return" || line.purchase_qty <= 0) continue;
      const key = line.item_id || line.product_name;
      const row = map.get(key) || {
        item_id: line.item_id,
        product_name: line.product_name,
        product_code: line.product_code,
        bills: 0,
        min: line.rate,
        max: line.rate,
        weighted: 0,
        qty: 0,
        amount: 0,
      };
      row.bills += 1;
      row.min = Math.min(row.min, line.rate);
      row.max = Math.max(row.max, line.rate);
      row.weighted += line.rate * line.purchase_qty;
      row.qty += line.purchase_qty;
      row.amount += line.total;
      if (!row.product_code && line.product_code) row.product_code = line.product_code;
      map.set(key, row);
    }
    return [...map.values()]
      .map((row) => ({
        item_id: row.item_id,
        product_name: row.product_name,
        product_code: row.product_code,
        bills: row.bills,
        min: round2(row.min),
        max: round2(row.max),
        avg: row.qty ? round2(row.weighted / row.qty) : 0,
        qty: round2(row.qty),
        amount: round2(row.amount),
      }))
      .sort((a, b) => a.product_name.localeCompare(b.product_name));
  }

  function buildReport(rawLines, rawReturns, filters) {
    const purchases = uniqueLines(rawLines);
    const lines = purchases.concat(returnLines(rawReturns, purchases)).filter((line) => matches(line, filters));
    return {
      lines,
      summary: summarize(lines),
      suppliers: bySupplier(lines),
      rates: byRate(lines),
    };
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  const HEADERS = [
    "Product Name",
    "Product Code",
    "Category",
    "Supplier",
    "Purchase Qty",
    "Free Qty",
    "Total Qty",
    "Purchase Rate",
    "Discount",
    "GST",
    "Total Amount",
    "Purchase Date",
    "Time",
    "Batch ID",
    "Invoice",
    "Branch",
  ];

  function lineCells(line) {
    return [
      line.product_name,
      line.product_code,
      line.category,
      line.supplier,
      line.purchase_qty,
      line.free_qty,
      line.total_qty,
      line.rate,
      line.discount,
      line.gst,
      line.total,
      line.purchase_date,
      line.purchase_time,
      line.batch_id,
      line.invoice,
      line.branch,
    ];
  }

  function sheetsFromReport(report) {
    const lines = report?.lines || [];
    return [
      {
        name: "Item-Wise Purchase",
        headers: HEADERS,
        rows: lines.map(lineCells),
      },
      {
        name: "Summary",
        headers: ["Total Items", "Purchase Qty", "Free Qty", "Purchase Amount", "GST", "Discount"],
        rows: [[
          report?.summary?.items || 0,
          report?.summary?.purchaseQty || 0,
          report?.summary?.freeQty || 0,
          report?.summary?.amount || 0,
          report?.summary?.gst || 0,
          report?.summary?.discount || 0,
        ]],
      },
      {
        name: "Supplier analysis",
        headers: ["Supplier", "Items", "Purchase Qty", "Free Qty", "Amount", "GST", "Discount"],
        rows: (report?.suppliers || []).map((row) => [row.supplier, row.items, row.purchaseQty, row.freeQty, row.amount, row.gst, row.discount]),
      },
      {
        name: "Rate comparison",
        headers: ["Product", "Code", "Bills", "Min rate", "Max rate", "Avg rate", "Purchase Qty", "Amount"],
        rows: (report?.rates || []).map((row) => [row.product_name, row.product_code, row.bills, row.min, row.max, row.avg, row.qty, row.amount]),
      },
    ];
  }

  function csvFromReport(report) {
    const lines = [HEADERS.join(",")].concat((report?.lines || []).map((line) => lineCells(line).map(csvCell).join(",")));
    return `\uFEFF${lines.join("\n")}\n`;
  }

  function pdfLines(report) {
    const s = report?.summary || {};
    const rows = [
      "Item-Wise Purchase Report",
      `Range ${report?.from || ""} to ${report?.to || ""}`,
      `Items ${s.items || 0}  Qty ${s.purchaseQty || 0}  Free ${s.freeQty || 0}`,
      `Amount ${s.amount || 0}  GST ${s.gst || 0}  Discount ${s.discount || 0}`,
      "",
    ];
    for (const line of report?.lines || []) {
      rows.push(`${line.purchase_date} ${line.purchase_time}  ${line.product_name}  ${line.supplier}  Batch ${line.batch_id || "—"}  Qty ${line.purchase_qty}+${line.free_qty}  Rs ${line.total}  ${line.invoice}`);
    }
    return rows;
  }

  const view = {
    sort: "purchase_date",
    dir: "desc",
    page: 1,
    q: "",
    filters: {},
    report: null,
  };

  function read(id) {
    const el = root.document?.getElementById?.(id);
    return el ? String(el.value || "").trim() : "";
  }

  function captureFilters() {
    const own = root.document?.getElementById?.("pir-product");
    view.filters = {
      product: own ? read("pir-product") : read("rep-product"),
      category: own ? read("pir-category") : read("rep-category"),
      supplier: own ? read("pir-supplier") : read("rep-supplier"),
      brand: read("pir-brand"),
      invoice: read("pir-invoice"),
      branch: own ? read("pir-branch") : read("rep-branch"),
      item: read("pir-item"),
    };
  }

  function queryString() {
    const params = new URLSearchParams();
    const from = read("rep-from");
    const to = read("rep-to");
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    for (const [key, value] of Object.entries(view.filters || {})) {
      if (value) params.set(key, value);
    }
    return params.toString();
  }

  function sortValue(line, key) {
    if (["purchase_qty", "free_qty", "total_qty", "rate", "discount", "gst", "total"].includes(key)) return num(line[key]);
    return String(line[key] || "").toLowerCase();
  }

  function sorted(lines) {
    const key = view.sort || "purchase_date";
    const dir = view.dir === "asc" ? 1 : -1;
    return lines.slice().sort((a, b) => {
      const av = sortValue(a, key);
      const bv = sortValue(b, key);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return String(a.invoice).localeCompare(String(b.invoice)) * dir;
    });
  }

  function searched(lines) {
    const q = view.q.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((line) => lineCells(line).join(" ").toLowerCase().includes(q));
  }

  function sectionHtml(report) {
    if (report) view.report = report;
    const data = view.report || {};
    if (data.error) {
      return `<section class="report-block" id="item-purchase-report" data-report-title="Item-Wise Purchase Report" data-report-group="books" data-report-sheet="Item-Wise Purchase"><h3>Item-Wise Purchase Report</h3><p class="hint error">${esc(data.error)}</p></section>`;
    }
    const filters = view.filters || {};
    const all = searched(sorted(data.lines || []));
    const pages = Math.max(1, Math.ceil(all.length / PAGE));
    if (view.page > pages) view.page = pages;
    if (view.page < 1) view.page = 1;
    const start = (view.page - 1) * PAGE;
    const shown = view.printAll ? all : all.slice(start, start + PAGE);
    const s = data.summary || {};
    const href = (path) => (typeof root.posUrl === "function" && path ? root.posUrl(path) : (path || "#"));
    const ownQuery = queryString();
    const links = {
      excel: href(data.links?.excel || `/api/reports/item-purchases/excel?${ownQuery}`),
      pdf: href(data.links?.pdf || `/api/reports/item-purchases/pdf?${ownQuery}`),
      csv: href(data.links?.csv || `/api/reports/item-purchases/csv?${ownQuery}`),
    };
    const branches = Array.isArray(data.branches) ? data.branches : [];
    const branchOptions = [`<option value="">All branches</option>`]
      .concat(branches.map((row) => `<option value="${esc(row.id)}"${String(row.id) === String(filters.branch) ? " selected" : ""}>${esc(row.name || row.id)}</option>`))
      .join("");
    const history = filters.item || filters.product || filters.invoice;
    const th = (key, label) => {
      const on = view.sort === key;
      const mark = on ? (view.dir === "asc" ? " ↑" : " ↓") : "";
      return `<th><button type="button" data-pir-sort="${esc(key)}">${esc(label)}${mark}</button></th>`;
    };
    const body = shown.length
      ? shown.map((line) => {
        const search = esc(lineCells(line).join(" ").toLowerCase());
        return `<tr data-report-row="${search}">
          <td><button type="button" class="link" data-pir-product="${esc(line.product_name)}" data-pir-item="${esc(line.item_id)}">${esc(line.product_name)}</button></td>
          <td>${esc(line.product_code)}</td>
          <td>${esc(line.category)}</td>
          <td>${esc(line.supplier)}</td>
          <td class="num">${esc(qtyText(line.purchase_qty))}</td>
          <td class="num">${esc(qtyText(line.free_qty))}</td>
          <td class="num">${esc(qtyText(line.total_qty))}</td>
          <td class="num">${esc(money(line.rate))}</td>
          <td class="num">${esc(money(line.discount))}</td>
          <td class="num">${esc(money(line.gst))}</td>
          <td class="num">${esc(money(line.total))}</td>
          <td>${esc(line.purchase_date)}</td>
          <td>${esc(line.purchase_time || "—")}</td>
          <td>${esc(line.batch_id || "—")}</td>
          <td><button type="button" class="link" data-pir-invoice="${esc(line.purchase_number || line.invoice)}">${esc(line.invoice || line.purchase_number)}</button></td>
          <td>${esc(line.branch)}</td>
        </tr>`;
      }).join("")
      : `<tr><td colspan="16">No purchase lines in this range.</td></tr>`;
    const supplierRows = (data.suppliers || []).map((row) => `<tr><td>${esc(row.supplier)}</td><td class="num">${esc(row.items)}</td><td class="num">${esc(qtyText(row.purchaseQty))}</td><td class="num">${esc(qtyText(row.freeQty))}</td><td class="num">${esc(money(row.amount))}</td><td class="num">${esc(money(row.gst))}</td><td class="num">${esc(money(row.discount))}</td></tr>`).join("") || `<tr><td colspan="7">No supplier rows.</td></tr>`;
    const rateRows = (data.rates || []).map((row) => `<tr><td><button type="button" class="link" data-pir-product="${esc(row.product_name)}" data-pir-item="${esc(row.item_id)}">${esc(row.product_name)}</button></td><td>${esc(row.product_code)}</td><td class="num">${esc(row.bills)}</td><td class="num">${esc(money(row.min))}</td><td class="num">${esc(money(row.max))}</td><td class="num">${esc(money(row.avg))}</td><td class="num">${esc(qtyText(row.qty))}</td><td class="num">${esc(money(row.amount))}</td></tr>`).join("") || `<tr><td colspan="8">No purchase rates in this range.</td></tr>`;
    return `<section class="report-block" id="item-purchase-report" data-report-title="Item-Wise Purchase Report" data-report-group="books" data-report-sheet="Item-Wise Purchase">
      <div class="report-block-head">
        <div>
          <h3>Item-Wise Purchase Report</h3>
          <p class="report-block-meta">${all.length} ${all.length === 1 ? "line" : "lines"}${history ? " · purchase history" : ""}</p>
        </div>
        <div class="print-actions">
          <button class="btn" type="button" data-pir-print>Print</button>
          <a class="btn" href="${esc(links.excel || "#")}">Excel</a>
          <a class="btn" href="${esc(links.pdf || "#")}">PDF</a>
          <a class="btn" href="${esc(links.csv || "#")}">CSV</a>
        </div>
      </div>
      <div class="report-grid">
        <div class="report-card"><span>Total items purchased</span><strong>${esc(s.items || 0)}</strong></div>
        <div class="report-card"><span>Total purchase quantity</span><strong>${esc(qtyText(s.purchaseQty || 0))}</strong></div>
        <div class="report-card"><span>Total purchase amount</span><strong>${esc(money(s.amount || 0))}</strong></div>
        <div class="report-card"><span>Total GST amount</span><strong>${esc(money(s.gst || 0))}</strong></div>
        <div class="report-card"><span>Total discount</span><strong>${esc(money(s.discount || 0))}</strong></div>
        <div class="report-card"><span>Total free quantity</span><strong>${esc(qtyText(s.freeQty || 0))}</strong></div>
      </div>
      <div class="reports-more-grid">
        <label>Product name <input id="pir-product" value="${esc(filters.product || "")}" placeholder="All" autocomplete="off" /></label>
        <label>Product category <input id="pir-category" value="${esc(filters.category || "")}" placeholder="All" autocomplete="off" /></label>
        <label>Supplier name <input id="pir-supplier" value="${esc(filters.supplier || "")}" placeholder="All" autocomplete="off" /></label>
        <label>Brand <input id="pir-brand" value="${esc(filters.brand || "")}" placeholder="All" autocomplete="off" /></label>
        <label class="pir-span">Purchase invoice number <input id="pir-invoice" value="${esc(filters.invoice || "")}" placeholder="PO or supplier invoice" autocomplete="off" /></label>
        <label class="pir-span">Business location / branch <select id="pir-branch">${branchOptions}</select></label>
        <input id="pir-item" type="hidden" value="${esc(filters.item || "")}" />
        <button class="btn primary" type="button" data-pir-apply>Show purchase lines</button>
        ${history ? `<button class="btn" type="button" data-pir-clear>All products</button>` : ""}
      </div>
      <label class="reports-search-label">Search this report
        <input id="pir-search" type="search" value="${esc(view.q)}" placeholder="Product, supplier, invoice, batch…" autocomplete="off" />
      </label>
      <div class="table-wrap"><table><thead><tr>
        ${th("product_name", "Product Name")}${th("product_code", "Product Code")}${th("category", "Category")}${th("supplier", "Supplier")}
        ${th("purchase_qty", "Purchase Qty")}${th("free_qty", "Free Qty")}${th("total_qty", "Total Qty")}${th("rate", "Purchase Rate")}
        ${th("discount", "Discount")}${th("gst", "GST")}${th("total", "Total Amount")}${th("purchase_date", "Purchase Date")}
        ${th("purchase_time", "Time")}${th("batch_id", "Batch ID")}
        <th>Invoice</th><th>Branch</th>
      </tr></thead><tbody>${body}</tbody></table></div>
      <div class="print-actions">
        <button class="btn" type="button" data-pir-page="prev"${view.page <= 1 ? " disabled" : ""}>Previous</button>
        <span class="hint">Page ${view.page} of ${pages}</span>
        <button class="btn" type="button" data-pir-page="next"${view.page >= pages ? " disabled" : ""}>Next</button>
      </div>
      <details open>
        <summary>Supplier-wise item purchase</summary>
        <div class="table-wrap"><table><thead><tr><th>Supplier</th><th>Items</th><th>Purchase Qty</th><th>Free Qty</th><th>Amount</th><th>GST</th><th>Discount</th></tr></thead><tbody>${supplierRows}</tbody></table></div>
      </details>
      <details open>
        <summary>Item-wise purchase rate comparison</summary>
        <div class="table-wrap"><table><thead><tr><th>Product</th><th>Code</th><th>Bills</th><th>Min rate</th><th>Max rate</th><th>Avg rate</th><th>Purchase Qty</th><th>Amount</th></tr></thead><tbody>${rateRows}</tbody></table></div>
      </details>
    </section>`;
  }

  function rerender() {
    const host = root.document?.getElementById?.("item-purchase-report");
    if (!host) return;
    const search = root.document.getElementById("pir-search");
    const caret = search && root.document.activeElement === search ? search.selectionStart : null;
    host.outerHTML = sectionHtml(view.report);
    if (caret == null) return;
    const next = root.document.getElementById("pir-search");
    if (!next) return;
    next.focus();
    if (typeof next.setSelectionRange === "function") next.setSelectionRange(caret, caret);
  }

  function reload() {
    const form = root.document?.getElementById?.("report-form");
    if (form && typeof form.requestSubmit === "function") form.requestSubmit();
    else if (typeof root.loadReports === "function") root.loadReports();
  }

  function onClick(e) {
    const product = e.target?.closest?.("[data-pir-product]");
    if (product) {
      e.preventDefault();
      const name = root.document.getElementById("pir-product");
      const item = root.document.getElementById("pir-item");
      const invoice = root.document.getElementById("pir-invoice");
      if (name) name.value = product.dataset.pirProduct || "";
      if (item) item.value = product.dataset.pirItem || "";
      if (invoice) invoice.value = "";
      view.page = 1;
      reload();
      return;
    }
    const invoiceBtn = e.target?.closest?.("[data-pir-invoice]");
    if (invoiceBtn) {
      e.preventDefault();
      const invoice = root.document.getElementById("pir-invoice");
      const item = root.document.getElementById("pir-item");
      if (invoice) invoice.value = invoiceBtn.dataset.pirInvoice || "";
      if (item) item.value = "";
      view.page = 1;
      reload();
      return;
    }
    const sort = e.target?.closest?.("[data-pir-sort]");
    if (sort) {
      e.preventDefault();
      const key = sort.dataset.pirSort;
      if (view.sort === key) view.dir = view.dir === "asc" ? "desc" : "asc";
      else {
        view.sort = key;
        view.dir = key === "product_name" || key === "supplier" ? "asc" : "desc";
      }
      view.page = 1;
      rerender();
      return;
    }
    const page = e.target?.closest?.("[data-pir-page]");
    if (page) {
      e.preventDefault();
      view.page += page.dataset.pirPage === "next" ? 1 : -1;
      rerender();
      return;
    }
    if (e.target?.closest?.("[data-pir-apply]")) {
      e.preventDefault();
      view.page = 1;
      reload();
      return;
    }
    if (e.target?.closest?.("[data-pir-clear]")) {
      e.preventDefault();
      ["pir-product", "pir-category", "pir-supplier", "pir-brand", "pir-invoice", "pir-item"].forEach((id) => {
        const el = root.document.getElementById(id);
        if (el) el.value = "";
      });
      const branch = root.document.getElementById("pir-branch");
      if (branch) branch.value = "";
      view.page = 1;
      view.q = "";
      reload();
      return;
    }
    if (e.target?.closest?.("[data-pir-print]")) {
      e.preventDefault();
      view.printAll = true;
      const block = sectionHtml(view.report).replace('id="item-purchase-report"', "");
      view.printAll = false;
      if (typeof root.printFinance === "function") {
        root.printFinance({
          title: "Item-Wise Purchase Report",
          html: block,
          from: read("rep-from"),
          to: read("rep-to"),
        });
      }
    }
  }

  function onInput(e) {
    if (e.target?.id === "pir-product") {
      const item = root.document.getElementById("pir-item");
      if (item) item.value = "";
    }
    if (e.target?.id === "pir-search") {
      view.q = e.target.value || "";
      view.page = 1;
      rerender();
    }
  }

  if (root.document?.addEventListener) {
    root.document.addEventListener("click", onClick);
    root.document.addEventListener("input", onInput);
  }

  const api = {
    PAGE,
    round2,
    normalizeLine,
    uniqueLines,
    returnLines,
    summarize,
    bySupplier,
    byRate,
    buildReport,
    sheetsFromReport,
    csvFromReport,
    pdfLines,
    captureFilters,
    queryString,
    sectionHtml,
    view,
  };
  root.POSPurchaseItemReport = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
