/* Item-wise sales report.
   One posted sale line is one row. Amount is already net of the line discount.
   A fully free line counts as free quantity. Total quantity = sales quantity + free quantity.
   Final amount = net + GST. Cancelled bills and cancelled lines are left out.
   A sales return is one negative row, never a second copy of the sale. */
(function (root) {
  const PAGE = 25;
  const CANCELLED = new Set(["cancelled", "canceled", "void", "voided"]);

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function paise(value) {
    return Math.round((num(value) + Number.EPSILON) * 100) / 100;
  }

  function day(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (value && !Number.isNaN(date.getTime()) && String(value).includes("T") || value instanceof Date) {
      try {
        return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
      } catch {
        return date.toISOString().slice(0, 10);
      }
    }
    const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function money(value) {
    return paise(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function qtyText(value) {
    return String(Math.round(num(value) * 1000) / 1000);
  }

  function includes(hay, needle) {
    const q = String(needle || "").trim().toLowerCase();
    if (!q) return true;
    return String(hay || "").toLowerCase().includes(q);
  }

  function cancelled(status) {
    return CANCELLED.has(String(status || "").trim().toLowerCase());
  }

  function isFreeLine(row) {
    const qty = num(row.quantity_gm ?? row.sales_qty);
    const amount = num(row.amount ?? row.net);
    const discount = num(row.discount);
    return qty > 0 && amount <= 0.009 && (discount > 0.009 || num(row.rate ?? row.rate_per_kg) > 0);
  }

  function toLine(row, share) {
    const qty = num(row.quantity_gm ?? row.sales_qty);
    const free = isFreeLine(row);
    const lineDiscount = Math.max(0, num(row.discount));
    const extra = free ? 0 : Math.max(0, num(share));
    const net = paise(Math.max(0, num(row.amount ?? row.net) - extra));
    const gst = free ? 0 : paise((net * num(row.gst_rate ?? row.gstRate)) / 100);
    const invoice = String(row.order_number || row.invoice || "").trim();
    return {
      id: String(row.id || ""),
      item_id: String(row.item_id || ""),
      product_name: String(row.product_name || row.item_name || row.catalog_name || row.name || "Item"),
      product_code: String(row.product_code || row.code || row.item_barcode || row.line_barcode || row.barcode || ""),
      category: String(row.category || ""),
      brand: String(row.brand || ""),
      customer: String(row.customer || row.customer_name || "Walk-in"),
      sales_qty: free ? 0 : qty,
      free_qty: free ? qty : 0,
      total_qty: qty,
      rate: num(row.rate ?? row.rate_per_kg),
      discount: paise(lineDiscount + extra),
      net,
      gst,
      total: paise(net + gst),
      sale_date: day(row.sale_date || row.created_at || row.purchase_date),
      invoice,
      order_number: invoice,
      order_id: String(row.order_id || ""),
      branch: String(row.branch || row.branch_name || ""),
      branch_id: String(row.branch_id || ""),
      status: String(row.status || "confirmed"),
      kind: "sale",
    };
  }

  function prepareSales(rows) {
    const seen = new Set();
    const kept = [];
    for (const row of rows || []) {
      if (Number(row.cancelled) === 1 || Number(row.held) === 1 || cancelled(row.status)) continue;
      const id = String(row.id || "");
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      kept.push(row);
    }
    const groups = new Map();
    for (const row of kept) {
      const key = String(row.order_id || row.id || kept.length);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    const out = [];
    for (const list of groups.values()) {
      const lineGst = list.reduce((sum, row) => sum + (Math.max(0, num(row.amount)) * num(row.gst_rate)) / 100, 0);
      const order = {
        discount: list[0].order_discount,
        loyalty_discount: list[0].order_loyalty,
        gst: list[0].order_gst,
        subtotal: list[0].order_subtotal,
      };
      const useNet = root.POSDiscount
        ? Boolean(root.POSDiscount.orderUsesNetGst(order, lineGst))
        : (num(order.discount) + num(order.loyalty_discount) > 0.009 && lineGst > num(order.gst) + 0.05);
      const taxable = list
        .map((row, index) => ({ index, net: Math.max(0, num(row.amount)), free: isFreeLine(row) }))
        .filter((row) => row.net > 0.009 && !row.free);
      const subtotal = taxable.reduce((sum, row) => sum + row.net, 0);
      const reduction = useNet ? Math.min(subtotal, num(order.discount) + num(order.loyalty_discount)) : 0;
      const shares = list.map(() => 0);
      let used = 0;
      taxable.forEach((row, n) => {
        const last = n === taxable.length - 1;
        const share = last ? paise(reduction - used) : paise((reduction * row.net) / (subtotal || 1));
        const take = paise(Math.min(Math.max(0, share), row.net));
        shares[row.index] = take;
        used = paise(used + take);
      });
      list.forEach((row, index) => out.push(toLine(row, shares[index])));
    }
    return out;
  }

  function returnLines(rows) {
    const seen = new Set();
    const out = [];
    for (const row of rows || []) {
      if (cancelled(row.status)) continue;
      const id = `return:${row.id || row.item_id || ""}:${day(row.sale_date || row.created_at)}:${num(row.quantity_gm)}`;
      if (seen.has(id)) continue;
      const qty = Math.abs(num(row.quantity_gm ?? row.qty));
      if (!qty || !row.item_id) continue;
      seen.add(id);
      const inclusive = Math.abs(num(row.amount ?? row.value));
      const gstRate = num(row.gst_rate);
      const taxable = gstRate ? inclusive / (1 + gstRate / 100) : inclusive;
      const gst = inclusive - taxable;
      const number = String(row.return_number || "Return");
      out.push({
        id,
        item_id: String(row.item_id),
        product_name: String(row.item_name || row.product_name || row.name || "Item"),
        product_code: String(row.item_code || row.code || row.barcode || ""),
        category: String(row.category || ""),
        brand: String(row.brand || ""),
        customer: String(row.customer_name || "Walk-in"),
        sales_qty: -qty,
        free_qty: 0,
        total_qty: -qty,
        rate: num(row.rate_per_kg),
        discount: 0,
        net: -paise(taxable),
        gst: -paise(gst),
        total: -paise(inclusive),
        sale_date: day(row.sale_date || row.created_at),
        invoice: number,
        order_number: String(row.order_number || number),
        order_id: String(row.order_id || ""),
        branch: String(row.branch_name || row.branch || ""),
        branch_id: String(row.branch_id || ""),
        status: "posted",
        kind: "return",
      });
    }
    return out;
  }

  function matches(line, filters) {
    const f = filters || {};
    if (f.item) {
      if (line.item_id !== String(f.item)) return false;
    } else if (!includes(`${line.product_name} ${line.product_code}`, f.product)) return false;
    if (!includes(line.category, f.category)) return false;
    if (!includes(line.customer, f.customer)) return false;
    if (!includes(line.brand, f.brand)) return false;
    if (!includes(`${line.invoice} ${line.order_number}`, f.invoice)) return false;
    if (f.branch) {
      const branch = String(f.branch);
      if (line.branch_id !== branch && !includes(line.branch, branch)) return false;
    }
    return true;
  }

  function summarize(lines) {
    const items = new Set();
    const summary = { items: 0, salesQty: 0, freeQty: 0, amount: 0, gst: 0, discount: 0 };
    for (const line of lines) {
      if (line.kind !== "return" && line.total_qty !== 0) items.add(line.item_id || line.product_name);
      summary.salesQty += line.sales_qty;
      summary.freeQty += line.free_qty;
      summary.amount += line.total;
      summary.gst += line.gst;
      summary.discount += line.discount;
    }
    summary.items = items.size;
    summary.salesQty = paise(summary.salesQty);
    summary.freeQty = paise(summary.freeQty);
    summary.amount = paise(summary.amount);
    summary.gst = paise(summary.gst);
    summary.discount = paise(summary.discount);
    return summary;
  }

  function byCustomer(lines) {
    const map = new Map();
    for (const line of lines) {
      const key = line.customer || "Walk-in";
      const row = map.get(key) || { customer: key, items: new Set(), salesQty: 0, freeQty: 0, amount: 0, gst: 0, discount: 0 };
      if (line.item_id || line.product_name) row.items.add(line.item_id || line.product_name);
      row.salesQty += line.sales_qty;
      row.freeQty += line.free_qty;
      row.amount += line.total;
      row.gst += line.gst;
      row.discount += line.discount;
      map.set(key, row);
    }
    return [...map.values()]
      .map((row) => ({
        customer: row.customer,
        items: row.items.size,
        salesQty: paise(row.salesQty),
        freeQty: paise(row.freeQty),
        amount: paise(row.amount),
        gst: paise(row.gst),
        discount: paise(row.discount),
      }))
      .sort((a, b) => b.amount - a.amount || a.customer.localeCompare(b.customer));
  }

  function byRate(lines) {
    const map = new Map();
    for (const line of lines) {
      if (line.kind === "return" || line.sales_qty <= 0) continue;
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
      row.weighted += line.rate * line.sales_qty;
      row.qty += line.sales_qty;
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
        min: paise(row.min),
        max: paise(row.max),
        avg: row.qty ? paise(row.weighted / row.qty) : 0,
        qty: paise(row.qty),
        amount: paise(row.amount),
      }))
      .sort((a, b) => a.product_name.localeCompare(b.product_name));
  }

  function buildReport(rawLines, rawReturns, filters) {
    const lines = prepareSales(rawLines).concat(returnLines(rawReturns)).filter((line) => matches(line, filters));
    return { lines, summary: summarize(lines), customers: byCustomer(lines), rates: byRate(lines) };
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  const HEADERS = [
    "Product Name", "Product Code", "Category", "Customer", "Sales Qty", "Free Qty", "Total Qty",
    "Sale Rate", "Discount", "GST", "Total Amount", "Sale Date", "Invoice", "Branch",
  ];

  function lineCells(line) {
    return [
      line.product_name, line.product_code, line.category, line.customer, line.sales_qty, line.free_qty,
      line.total_qty, line.rate, line.discount, line.gst, line.total, line.sale_date, line.invoice, line.branch,
    ];
  }

  function sheetsFromReport(report) {
    const s = report?.summary || {};
    return [
      { name: "Item-Wise Sales", headers: HEADERS, rows: (report?.lines || []).map(lineCells) },
      {
        name: "Summary",
        headers: ["Total Items", "Sales Qty", "Free Qty", "Sales Amount", "GST", "Discount"],
        rows: [[s.items || 0, s.salesQty || 0, s.freeQty || 0, s.amount || 0, s.gst || 0, s.discount || 0]],
      },
      {
        name: "Customer analysis",
        headers: ["Customer", "Items", "Sales Qty", "Free Qty", "Amount", "GST", "Discount"],
        rows: (report?.customers || []).map((row) => [row.customer, row.items, row.salesQty, row.freeQty, row.amount, row.gst, row.discount]),
      },
      {
        name: "Rate comparison",
        headers: ["Product", "Code", "Bills", "Min rate", "Max rate", "Avg rate", "Sales Qty", "Amount"],
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
      "Item-Wise Sales Report",
      `Range ${report?.from || ""} to ${report?.to || ""}`,
      `Items ${s.items || 0}  Qty ${s.salesQty || 0}  Free ${s.freeQty || 0}`,
      `Amount ${s.amount || 0}  GST ${s.gst || 0}  Discount ${s.discount || 0}`,
      "",
    ];
    for (const line of report?.lines || []) {
      rows.push(`${line.sale_date}  ${line.product_name}  ${line.customer}  Qty ${line.sales_qty}+${line.free_qty}  Rs ${line.total}  ${line.invoice}`);
    }
    return rows;
  }

  const view = { sort: "sale_date", dir: "desc", page: 1, q: "", filters: {}, report: null };

  function read(id) {
    const el = root.document?.getElementById?.(id);
    return el ? String(el.value || "").trim() : "";
  }

  function captureFilters() {
    const own = root.document?.getElementById?.("sir-product");
    view.filters = {
      product: own ? read("sir-product") : read("rep-product"),
      category: own ? read("sir-category") : read("rep-category"),
      customer: own ? read("sir-customer") : read("rep-customer"),
      brand: read("sir-brand"),
      invoice: read("sir-invoice"),
      branch: own ? read("sir-branch") : read("rep-branch"),
      item: read("sir-item"),
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
    if (["sales_qty", "free_qty", "total_qty", "rate", "discount", "gst", "total"].includes(key)) return num(line[key]);
    return String(line[key] || "").toLowerCase();
  }

  function sorted(lines) {
    const key = view.sort || "sale_date";
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
      return `<section class="report-block" id="item-sales-report" data-report-title="Item-Wise Sales Report" data-report-group="sales" data-report-sheet="Item-Wise Sales"><h3>Item-Wise Sales Report</h3><p class="hint error">${esc(data.error)}</p></section>`;
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
      excel: href(data.links?.excel || `/api/reports/item-sales/excel?${ownQuery}`),
      pdf: href(data.links?.pdf || `/api/reports/item-sales/pdf?${ownQuery}`),
      csv: href(data.links?.csv || `/api/reports/item-sales/csv?${ownQuery}`),
    };
    const branches = Array.isArray(data.branches) ? data.branches : [];
    const branchOptions = [`<option value="">All branches</option>`]
      .concat(branches.map((row) => `<option value="${esc(row.id)}"${String(row.id) === String(filters.branch) ? " selected" : ""}>${esc(row.name || row.id)}</option>`))
      .join("");
    const history = filters.item || filters.product || filters.invoice;
    const th = (key, label) => {
      const on = view.sort === key;
      const mark = on ? (view.dir === "asc" ? " ↑" : " ↓") : "";
      return `<th><button type="button" data-sir-sort="${esc(key)}">${esc(label)}${mark}</button></th>`;
    };
    const body = shown.length
      ? shown.map((line) => `<tr data-report-row="${esc(lineCells(line).join(" ").toLowerCase())}">
          <td><button type="button" class="link" data-sir-product="${esc(line.product_name)}" data-sir-item="${esc(line.item_id)}">${esc(line.product_name)}</button></td>
          <td>${esc(line.product_code)}</td>
          <td>${esc(line.category)}</td>
          <td>${esc(line.customer)}</td>
          <td class="num">${esc(qtyText(line.sales_qty))}</td>
          <td class="num">${esc(qtyText(line.free_qty))}</td>
          <td class="num">${esc(qtyText(line.total_qty))}</td>
          <td class="num">${esc(money(line.rate))}</td>
          <td class="num">${esc(money(line.discount))}</td>
          <td class="num">${esc(money(line.gst))}</td>
          <td class="num">${esc(money(line.total))}</td>
          <td>${esc(line.sale_date)}</td>
          <td><button type="button" class="link" data-sir-invoice="${esc(line.order_number || line.invoice)}">${esc(line.invoice || line.order_number)}</button></td>
          <td>${esc(line.branch)}</td>
        </tr>`).join("")
      : `<tr><td colspan="14">No sales lines in this range.</td></tr>`;
    const customerRows = (data.customers || []).map((row) => `<tr><td>${esc(row.customer)}</td><td class="num">${esc(row.items)}</td><td class="num">${esc(qtyText(row.salesQty))}</td><td class="num">${esc(qtyText(row.freeQty))}</td><td class="num">${esc(money(row.amount))}</td><td class="num">${esc(money(row.gst))}</td><td class="num">${esc(money(row.discount))}</td></tr>`).join("") || `<tr><td colspan="7">No customer rows.</td></tr>`;
    const rateRows = (data.rates || []).map((row) => `<tr><td><button type="button" class="link" data-sir-product="${esc(row.product_name)}" data-sir-item="${esc(row.item_id)}">${esc(row.product_name)}</button></td><td>${esc(row.product_code)}</td><td class="num">${esc(row.bills)}</td><td class="num">${esc(money(row.min))}</td><td class="num">${esc(money(row.max))}</td><td class="num">${esc(money(row.avg))}</td><td class="num">${esc(qtyText(row.qty))}</td><td class="num">${esc(money(row.amount))}</td></tr>`).join("") || `<tr><td colspan="8">No sale rates in this range.</td></tr>`;
    return `<section class="report-block" id="item-sales-report" data-report-title="Item-Wise Sales Report" data-report-group="sales" data-report-sheet="Item-Wise Sales">
      <div class="report-block-head">
        <div>
          <h3>Item-Wise Sales Report</h3>
          <p class="report-block-meta">${all.length} ${all.length === 1 ? "line" : "lines"}${history ? " · sales history" : ""}</p>
        </div>
        <div class="print-actions">
          <button class="btn" type="button" data-sir-print>Print</button>
          <a class="btn" href="${esc(links.excel || "#")}">Excel</a>
          <a class="btn" href="${esc(links.pdf || "#")}">PDF</a>
          <a class="btn" href="${esc(links.csv || "#")}">CSV</a>
        </div>
      </div>
      <div class="report-grid">
        <div class="report-card"><span>Total items sold</span><strong>${esc(s.items || 0)}</strong></div>
        <div class="report-card"><span>Total sales quantity</span><strong>${esc(qtyText(s.salesQty || 0))}</strong></div>
        <div class="report-card"><span>Total sales amount</span><strong>${esc(money(s.amount || 0))}</strong></div>
        <div class="report-card"><span>Total GST amount</span><strong>${esc(money(s.gst || 0))}</strong></div>
        <div class="report-card"><span>Total discount</span><strong>${esc(money(s.discount || 0))}</strong></div>
        <div class="report-card"><span>Total free quantity</span><strong>${esc(qtyText(s.freeQty || 0))}</strong></div>
      </div>
      <div class="reports-more-grid">
        <label>Product name <input id="sir-product" value="${esc(filters.product || "")}" placeholder="All" autocomplete="off" /></label>
        <label>Product category <input id="sir-category" value="${esc(filters.category || "")}" placeholder="All" autocomplete="off" /></label>
        <label>Customer name <input id="sir-customer" value="${esc(filters.customer || "")}" placeholder="All" autocomplete="off" /></label>
        <label>Brand <input id="sir-brand" value="${esc(filters.brand || "")}" placeholder="All" autocomplete="off" /></label>
        <label class="sir-span">Invoice number <input id="sir-invoice" value="${esc(filters.invoice || "")}" placeholder="Bill number" autocomplete="off" /></label>
        <label class="sir-span">Business location / branch <select id="sir-branch">${branchOptions}</select></label>
        <input id="sir-item" type="hidden" value="${esc(filters.item || "")}" />
        <button class="btn primary" type="button" data-sir-apply>Show sales lines</button>
        ${history ? `<button class="btn" type="button" data-sir-clear>All products</button>` : ""}
      </div>
      <label class="reports-search-label">Search this report
        <input id="sir-search" type="search" value="${esc(view.q)}" placeholder="Product, customer, invoice…" autocomplete="off" />
      </label>
      <div class="table-wrap"><table><thead><tr>
        ${th("product_name", "Product Name")}${th("product_code", "Product Code")}${th("category", "Category")}${th("customer", "Customer")}
        ${th("sales_qty", "Sales Qty")}${th("free_qty", "Free Qty")}${th("total_qty", "Total Qty")}${th("rate", "Sale Rate")}
        ${th("discount", "Discount")}${th("gst", "GST")}${th("total", "Total Amount")}${th("sale_date", "Sale Date")}
        <th>Invoice</th><th>Branch</th>
      </tr></thead><tbody>${body}</tbody></table></div>
      <div class="print-actions">
        <button class="btn" type="button" data-sir-page="prev"${view.page <= 1 ? " disabled" : ""}>Previous</button>
        <span class="hint">Page ${view.page} of ${pages}</span>
        <button class="btn" type="button" data-sir-page="next"${view.page >= pages ? " disabled" : ""}>Next</button>
      </div>
      <details open>
        <summary>Customer-wise item sales</summary>
        <div class="table-wrap"><table><thead><tr><th>Customer</th><th>Items</th><th>Sales Qty</th><th>Free Qty</th><th>Amount</th><th>GST</th><th>Discount</th></tr></thead><tbody>${customerRows}</tbody></table></div>
      </details>
      <details open>
        <summary>Item-wise sale rate comparison</summary>
        <div class="table-wrap"><table><thead><tr><th>Product</th><th>Code</th><th>Bills</th><th>Min rate</th><th>Max rate</th><th>Avg rate</th><th>Sales Qty</th><th>Amount</th></tr></thead><tbody>${rateRows}</tbody></table></div>
      </details>
    </section>`;
  }

  function rerender() {
    const host = root.document?.getElementById?.("item-sales-report");
    if (!host) return;
    const search = root.document.getElementById("sir-search");
    const caret = search && root.document.activeElement === search ? search.selectionStart : null;
    host.outerHTML = sectionHtml(view.report);
    if (caret == null) return;
    const next = root.document.getElementById("sir-search");
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
    const product = e.target?.closest?.("[data-sir-product]");
    if (product) {
      e.preventDefault();
      const name = root.document.getElementById("sir-product");
      const item = root.document.getElementById("sir-item");
      const invoice = root.document.getElementById("sir-invoice");
      if (name) name.value = product.dataset.sirProduct || "";
      if (item) item.value = product.dataset.sirItem || "";
      if (invoice) invoice.value = "";
      view.page = 1;
      reload();
      return;
    }
    const invoiceBtn = e.target?.closest?.("[data-sir-invoice]");
    if (invoiceBtn) {
      e.preventDefault();
      const invoice = root.document.getElementById("sir-invoice");
      const item = root.document.getElementById("sir-item");
      if (invoice) invoice.value = invoiceBtn.dataset.sirInvoice || "";
      if (item) item.value = "";
      view.page = 1;
      reload();
      return;
    }
    const sort = e.target?.closest?.("[data-sir-sort]");
    if (sort) {
      e.preventDefault();
      const key = sort.dataset.sirSort;
      if (view.sort === key) view.dir = view.dir === "asc" ? "desc" : "asc";
      else {
        view.sort = key;
        view.dir = key === "product_name" || key === "customer" ? "asc" : "desc";
      }
      view.page = 1;
      rerender();
      return;
    }
    const page = e.target?.closest?.("[data-sir-page]");
    if (page) {
      e.preventDefault();
      view.page += page.dataset.sirPage === "next" ? 1 : -1;
      rerender();
      return;
    }
    if (e.target?.closest?.("[data-sir-apply]")) {
      e.preventDefault();
      view.page = 1;
      reload();
      return;
    }
    if (e.target?.closest?.("[data-sir-clear]")) {
      e.preventDefault();
      ["sir-product", "sir-category", "sir-customer", "sir-brand", "sir-invoice", "sir-item"].forEach((id) => {
        const el = root.document.getElementById(id);
        if (el) el.value = "";
      });
      const branch = root.document.getElementById("sir-branch");
      if (branch) branch.value = "";
      view.page = 1;
      view.q = "";
      reload();
      return;
    }
    if (e.target?.closest?.("[data-sir-print]")) {
      e.preventDefault();
      view.printAll = true;
      const block = sectionHtml(view.report).replace('id="item-sales-report"', "");
      view.printAll = false;
      if (typeof root.printFinance === "function") {
        root.printFinance({ title: "Item-Wise Sales Report", html: block, from: read("rep-from"), to: read("rep-to") });
      }
    }
  }

  function onInput(e) {
    if (e.target?.id === "sir-product") {
      const item = root.document.getElementById("sir-item");
      if (item) item.value = "";
    }
    if (e.target?.id === "sir-search") {
      view.q = e.target.value || "";
      view.page = 1;
      rerender();
    }
  }

  if (root.document?.addEventListener) {
    root.document.addEventListener("click", onClick);
    root.document.addEventListener("input", onInput);
  }

  root.POSSalesItemReport = {
    PAGE, paise, isFreeLine, prepareSales, returnLines, summarize, byCustomer, byRate, buildReport,
    sheetsFromReport, csvFromReport, pdfLines, captureFilters, queryString, sectionHtml, view,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
