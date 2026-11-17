(function (root) {
  const PAGE = 25;
  const HEADERS = ["Product Name", "Product Code", "Category", "Customer", "Sold Qty", "Stock Before", "Oversold Qty", "Sale Rate", "Oversold Amount", "Sale Date", "Invoice", "Branch", "Stock Now"];

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function paise(value) {
    return Math.round((num(value) + Number.EPSILON) * 100) / 100;
  }

  function qtyRound(value) {
    return Math.round((num(value) + Number.EPSILON) * 1000) / 1000;
  }

  function day(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(value);
    }
    const text = String(value ?? "");
    const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match && !text.includes("T")) return match[1];
    const parsed = new Date(text);
    if (text.includes("T") && !Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(parsed);
    }
    return match ? match[1] : "";
  }

  function stamp(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
    const text = String(value ?? "");
    if (!text) return 0;
    const parsed = new Date(text.includes("T") || text.includes(":") ? text : `${text.slice(0, 10)}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }

  function cancelled(status) {
    return ["cancelled", "canceled", "void", "voided"].includes(String(status || "").trim().toLowerCase());
  }

  function has(hay, needle) {
    const q = String(needle || "").trim().toLowerCase();
    if (!q) return true;
    return String(hay || "").toLowerCase().includes(q);
  }

  function inRange(value, from, to) {
    if (!value) return false;
    if (from && value < from) return false;
    if (to && value > to) return false;
    return true;
  }

  function catalog(items) {
    const map = new Map();
    for (const row of items || []) {
      if (!row?.id) continue;
      map.set(String(row.id), row);
    }
    return map;
  }

  function pushEvent(list, seen, row, delta, kind) {
    const itemId = String(row.item_id || "");
    const qty = qtyRound(delta);
    if (!itemId || qty === 0) return;
    const id = `${kind}:${row.id || ""}:${day(row.sale_date || row.created_at || row.purchase_date)}:${qty}`;
    if (row.id && seen.has(id)) return;
    if (row.id) seen.add(id);
    list.push({
      item_id: itemId,
      at: stamp(row.sale_date || row.created_at || row.purchase_date),
      day: day(row.sale_date || row.created_at || row.purchase_date),
      delta: qty,
      kind,
      row,
    });
  }

  function collect(raw) {
    const events = [];
    const seen = new Set();
    for (const row of raw.purchases || []) {
      if (cancelled(row.status)) continue;
      pushEvent(events, seen, row, num(row.quantity_gm) + Math.max(0, num(row.free_qty)), "purchase");
    }
    for (const row of raw.returns || []) {
      if (cancelled(row.status)) continue;
      const disposition = String(row.stock_disposition || row.disposition || "sellable").toLowerCase();
      if (disposition && disposition !== "sellable") continue;
      pushEvent(events, seen, row, Math.abs(num(row.quantity_gm)), "return");
    }
    for (const row of raw.adjustments || []) {
      const kind = String(row.kind || "").toLowerCase();
      if (["sale", "purchase", "sale_return", "return"].includes(kind)) continue;
      pushEvent(events, seen, row, num(row.quantity_gm), "adjustment");
    }
    for (const row of raw.online || []) {
      if (cancelled(row.status)) continue;
      const qty = num(row.quantity_base != null ? row.quantity_base : row.quantity_gm);
      pushEvent(events, seen, row, -Math.abs(qty), "online");
    }
    for (const row of raw.sales || []) {
      if (Number(row.cancelled) === 1 || Number(row.held) === 1 || cancelled(row.status)) continue;
      pushEvent(events, seen, row, -Math.abs(num(row.quantity_gm)), "sale");
    }
    const rank = { purchase: 0, return: 1, adjustment: 2, online: 3, sale: 4 };
    events.sort((a, b) => a.day.localeCompare(b.day) || (rank[a.kind] - rank[b.kind]) || (a.at - b.at));
    return events;
  }

  function oversoldLines(raw, from, to) {
    const items = catalog(raw.items);
    const byItem = new Map();
    for (const event of collect(raw)) {
      const list = byItem.get(event.item_id) || [];
      list.push(event);
      byItem.set(event.item_id, list);
    }
    const lines = [];
    for (const [itemId, events] of byItem) {
      const item = items.get(itemId) || {};
      const moved = events.reduce((sum, event) => sum + event.delta, 0);
      let balance = qtyRound(num(item.stock_gm) - moved);
      for (const event of events) {
        if (event.kind === "sale") {
          const sold = Math.abs(event.delta);
          const before = balance;
          const oversold = qtyRound(Math.max(0, sold - Math.max(0, before)));
          const row = event.row || {};
          if (oversold > 0.0001 && inRange(event.day, from, to)) {
            const share = sold ? oversold / sold : 0;
            const net = paise(num(row.amount) * share);
            const gst = paise((net * num(row.gst_rate)) / 100);
            const invoice = String(row.order_number || "");
            lines.push({
              id: String(row.id || ""),
              item_id: itemId,
              product_name: String(row.item_name || item.name || "Item"),
              product_code: String(row.code || item.code || row.barcode || item.barcode || ""),
              category: String(row.category || item.category || ""),
              brand: String(row.brand || item.brand || ""),
              customer: String(row.customer_name || "Walk-in"),
              sold_qty: sold,
              stock_before: qtyRound(before),
              oversold_qty: oversold,
              rate: num(row.rate_per_kg),
              net,
              gst,
              amount: paise(net + gst),
              sale_date: event.day,
              invoice,
              order_number: invoice,
              branch: String(row.branch_name || ""),
              branch_id: String(row.branch_id || ""),
              stock_now: qtyRound(num(item.stock_gm)),
            });
          }
        }
        balance = qtyRound(balance + event.delta);
      }
    }
    lines.sort((a, b) => b.sale_date.localeCompare(a.sale_date) || a.product_name.localeCompare(b.product_name) || a.invoice.localeCompare(b.invoice));
    return lines;
  }

  function matchLine(line, filters) {
    if (filters.item) {
      if (line.item_id !== String(filters.item)) return false;
    } else if (!has(`${line.product_name} ${line.product_code}`, filters.product)) return false;
    if (!has(line.category, filters.category)) return false;
    if (!has(line.customer, filters.customer)) return false;
    if (!has(line.brand, filters.brand)) return false;
    if (!has(`${line.invoice} ${line.order_number}`, filters.invoice)) return false;
    if (filters.branch && line.branch_id !== String(filters.branch) && !has(line.branch, filters.branch)) return false;
    return true;
  }

  function negativeItems(raw, filters) {
    const rows = [];
    for (const item of raw.items || []) {
      const stock = qtyRound(num(item.stock_gm));
      if (stock >= -0.0001) continue;
      const row = {
        item_id: String(item.id || ""),
        product_name: String(item.name || "Item"),
        product_code: String(item.code || item.barcode || ""),
        category: String(item.category || ""),
        brand: String(item.brand || ""),
        stock_now: stock,
      };
      if (filters.item && row.item_id !== String(filters.item)) continue;
      if (!filters.item && !has(`${row.product_name} ${row.product_code}`, filters.product)) continue;
      if (!has(row.category, filters.category)) continue;
      if (!has(row.brand, filters.brand)) continue;
      rows.push(row);
    }
    rows.sort((a, b) => a.stock_now - b.stock_now || a.product_name.localeCompare(b.product_name));
    return rows;
  }

  function summarize(lines, negatives) {
    const items = new Set();
    const bills = new Set();
    const summary = { items: 0, bills: 0, soldQty: 0, oversoldQty: 0, amount: 0, negative: negatives.length };
    for (const line of lines) {
      items.add(line.item_id || line.product_name);
      if (line.invoice) bills.add(line.invoice);
      summary.soldQty += line.sold_qty;
      summary.oversoldQty += line.oversold_qty;
      summary.amount += line.amount;
    }
    summary.items = items.size;
    summary.bills = bills.size;
    summary.soldQty = qtyRound(summary.soldQty);
    summary.oversoldQty = qtyRound(summary.oversoldQty);
    summary.amount = paise(summary.amount);
    return summary;
  }

  function buildReport(raw, filters = {}) {
    const from = String(filters.from || "").slice(0, 10);
    const to = String(filters.to || "").slice(0, 10);
    const lines = oversoldLines(raw || {}, from, to).filter((line) => matchLine(line, filters));
    const negatives = negativeItems(raw || {}, filters);
    return { lines, negatives, summary: summarize(lines, negatives) };
  }

  function money(value) {
    return paise(value).toFixed(2);
  }

  function qtyText(value) {
    const n = qtyRound(value);
    return Number.isInteger(n) ? String(n) : String(n);
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  function lineCells(line) {
    return [line.product_name, line.product_code, line.category, line.customer, line.sold_qty, line.stock_before, line.oversold_qty, line.rate, line.amount, line.sale_date, line.invoice, line.branch, line.stock_now];
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function sheetsFromReport(report) {
    const s = report?.summary || {};
    return [
      { name: "Item-Wise Overselling", headers: HEADERS, rows: (report?.lines || []).map(lineCells) },
      { name: "Summary", headers: ["Items", "Bills", "Sold Qty", "Oversold Qty", "Oversold Amount", "Still Negative"], rows: [[s.items || 0, s.bills || 0, s.soldQty || 0, s.oversoldQty || 0, s.amount || 0, s.negative || 0]] },
      { name: "Still negative", headers: ["Product", "Code", "Category", "Brand", "Stock Now"], rows: (report?.negatives || []).map((row) => [row.product_name, row.product_code, row.category, row.brand, row.stock_now]) },
    ];
  }

  function csvFromReport(report) {
    const lines = [HEADERS.join(",")].concat((report?.lines || []).map((line) => lineCells(line).map(csvCell).join(",")));
    return `\uFEFF${lines.join("\n")}\n`;
  }

  function pdfLines(report) {
    const s = report?.summary || {};
    const rows = [
      "Item-Wise Overselling Report",
      `Range ${report?.from || ""} to ${report?.to || ""}`,
      `Items ${s.items || 0}  Bills ${s.bills || 0}  Oversold ${s.oversoldQty || 0}  Amount ${s.amount || 0}`,
      "",
    ];
    for (const line of report?.lines || []) {
      rows.push(`${line.sale_date}  ${line.product_name}  Sold ${line.sold_qty}  Before ${line.stock_before}  Oversold ${line.oversold_qty}  Rs ${line.amount}  ${line.invoice}`);
    }
    return rows;
  }

  const view = { sort: "sale_date", dir: "desc", page: 1, q: "", filters: {}, report: null, printAll: false };

  function read(id) {
    const el = root.document?.getElementById?.(id);
    return el ? String(el.value || "").trim() : "";
  }

  function captureFilters() {
    const own = root.document?.getElementById?.("ior-product");
    view.filters = {
      product: own ? read("ior-product") : read("rep-product"),
      category: own ? read("ior-category") : read("rep-category"),
      customer: own ? read("ior-customer") : read("rep-customer"),
      brand: read("ior-brand"),
      invoice: read("ior-invoice"),
      branch: own ? read("ior-branch") : read("rep-branch"),
      item: read("ior-item"),
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
    if (["sold_qty", "stock_before", "oversold_qty", "rate", "amount", "stock_now"].includes(key)) return num(line[key]);
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
      return `<section class="report-block" id="item-oversell-report" data-report-title="Item-Wise Overselling Report" data-report-group="sales" data-report-sheet="Item-Wise Overselling"><h3>Item-Wise Overselling Report</h3><p class="hint error">${esc(data.error)}</p></section>`;
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
      excel: href(data.links?.excel || `/api/reports/item-oversells/excel?${ownQuery}`),
      pdf: href(data.links?.pdf || `/api/reports/item-oversells/pdf?${ownQuery}`),
      csv: href(data.links?.csv || `/api/reports/item-oversells/csv?${ownQuery}`),
    };
    const branches = Array.isArray(data.branches) ? data.branches : [];
    const branchOptions = [`<option value="">All branches</option>`]
      .concat(branches.map((row) => `<option value="${esc(row.id)}"${String(row.id) === String(filters.branch) ? " selected" : ""}>${esc(row.name || row.id)}</option>`))
      .join("");
    const history = filters.item || filters.product || filters.invoice;
    const th = (key, label) => {
      const on = view.sort === key;
      const mark = on ? (view.dir === "asc" ? " ↑" : " ↓") : "";
      return `<th><button type="button" data-ior-sort="${esc(key)}">${esc(label)}${mark}</button></th>`;
    };
    const body = shown.length
      ? shown.map((line) => `<tr>
          <td><button type="button" class="link" data-ior-product="${esc(line.product_name)}" data-ior-item="${esc(line.item_id)}">${esc(line.product_name)}</button></td>
          <td>${esc(line.product_code)}</td>
          <td>${esc(line.category)}</td>
          <td>${esc(line.customer)}</td>
          <td class="num">${esc(qtyText(line.sold_qty))}</td>
          <td class="num">${esc(qtyText(line.stock_before))}</td>
          <td class="num">${esc(qtyText(line.oversold_qty))}</td>
          <td class="num">${esc(money(line.rate))}</td>
          <td class="num">${esc(money(line.amount))}</td>
          <td>${esc(line.sale_date)}</td>
          <td><button type="button" class="link" data-ior-invoice="${esc(line.order_number || line.invoice)}">${esc(line.invoice || line.order_number)}</button></td>
          <td>${esc(line.branch)}</td>
          <td class="num">${esc(qtyText(line.stock_now))}</td>
        </tr>`).join("")
      : `<tr><td colspan="13">No item was sold beyond the stock on hand in this range.</td></tr>`;
    const negativeRows = (data.negatives || []).map((row) => `<tr>
        <td><button type="button" class="link" data-ior-product="${esc(row.product_name)}" data-ior-item="${esc(row.item_id)}">${esc(row.product_name)}</button></td>
        <td>${esc(row.product_code)}</td><td>${esc(row.category)}</td><td>${esc(row.brand)}</td>
        <td class="num">${esc(qtyText(row.stock_now))}</td>
      </tr>`).join("") || `<tr><td colspan="5">No item is below zero.</td></tr>`;
    return `<section class="report-block" id="item-oversell-report" data-report-title="Item-Wise Overselling Report" data-report-group="sales" data-report-sheet="Item-Wise Overselling">
      <div class="report-block-head">
        <div>
          <h3>Item-Wise Overselling Report</h3>
          <p class="report-block-meta">${all.length} ${all.length === 1 ? "line" : "lines"}${history ? " · overselling history" : ""}</p>
        </div>
        <div class="print-actions">
          <button class="btn" type="button" data-ior-print>Print</button>
          <a class="btn" href="${esc(links.excel || "#")}">Excel</a>
          <a class="btn" href="${esc(links.pdf || "#")}">PDF</a>
          <a class="btn" href="${esc(links.csv || "#")}">CSV</a>
        </div>
      </div>
      <p class="hint">A line is listed when the sold quantity was greater than the stock on hand. Later purchases stay in stock and do not remove that sale.</p>
      <div class="report-grid">
        <div class="report-card"><span>Items oversold</span><strong>${esc(s.items || 0)}</strong></div>
        <div class="report-card"><span>Oversold quantity</span><strong>${esc(qtyText(s.oversoldQty || 0))}</strong></div>
        <div class="report-card"><span>Oversold amount</span><strong>${esc(money(s.amount || 0))}</strong></div>
        <div class="report-card"><span>Bills</span><strong>${esc(s.bills || 0)}</strong></div>
        <div class="report-card"><span>Items still below zero</span><strong>${esc(s.negative || 0)}</strong></div>
      </div>
      <div class="reports-more-grid">
        <label>Product name <input id="ior-product" value="${esc(filters.product || "")}" placeholder="All" autocomplete="off" /></label>
        <label>Product category <input id="ior-category" value="${esc(filters.category || "")}" placeholder="All" autocomplete="off" /></label>
        <label>Customer name <input id="ior-customer" value="${esc(filters.customer || "")}" placeholder="All" autocomplete="off" /></label>
        <label>Brand <input id="ior-brand" value="${esc(filters.brand || "")}" placeholder="All" autocomplete="off" /></label>
        <label class="ior-span">Invoice number <input id="ior-invoice" value="${esc(filters.invoice || "")}" placeholder="Bill number" autocomplete="off" /></label>
        <label class="ior-span">Business location / branch <select id="ior-branch">${branchOptions}</select></label>
        <input id="ior-item" type="hidden" value="${esc(filters.item || "")}" />
        <button class="btn primary" type="button" data-ior-apply>Show oversold lines</button>
        ${history ? `<button class="btn" type="button" data-ior-clear>All products</button>` : ""}
      </div>
      <label class="reports-search-label">Search this report
        <input id="ior-search" type="search" value="${esc(view.q)}" placeholder="Product, customer, invoice…" autocomplete="off" />
      </label>
      <div class="table-wrap"><table><thead><tr>
        ${th("product_name", "Product Name")}${th("product_code", "Product Code")}${th("category", "Category")}${th("customer", "Customer")}
        ${th("sold_qty", "Sold Qty")}${th("stock_before", "Stock Before")}${th("oversold_qty", "Oversold Qty")}${th("rate", "Sale Rate")}
        ${th("amount", "Oversold Amount")}${th("sale_date", "Sale Date")}
        <th>Invoice</th><th>Branch</th>${th("stock_now", "Stock Now")}
      </tr></thead><tbody>${body}</tbody></table></div>
      <div class="print-actions">
        <button class="btn" type="button" data-ior-page="prev"${view.page <= 1 ? " disabled" : ""}>Previous</button>
        <span class="hint">Page ${view.page} of ${pages}</span>
        <button class="btn" type="button" data-ior-page="next"${view.page >= pages ? " disabled" : ""}>Next</button>
      </div>
      <details open>
        <summary>Items still below zero</summary>
        <p class="hint">Current shop stock. This list is not limited to the selected dates.</p>
        <div class="table-wrap"><table><thead><tr><th>Product</th><th>Code</th><th>Category</th><th>Brand</th><th>Stock Now</th></tr></thead><tbody>${negativeRows}</tbody></table></div>
      </details>
    </section>`;
  }

  function rerender() {
    const host = root.document?.getElementById?.("item-oversell-report");
    if (!host) return;
    const search = root.document.getElementById("ior-search");
    const caret = search && root.document.activeElement === search ? search.selectionStart : null;
    host.outerHTML = sectionHtml(view.report);
    if (caret == null) return;
    const next = root.document.getElementById("ior-search");
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
    const product = e.target?.closest?.("[data-ior-product]");
    if (product) {
      e.preventDefault();
      const name = root.document.getElementById("ior-product");
      const item = root.document.getElementById("ior-item");
      const invoice = root.document.getElementById("ior-invoice");
      if (name) name.value = product.dataset.iorProduct || "";
      if (item) item.value = product.dataset.iorItem || "";
      if (invoice) invoice.value = "";
      view.page = 1;
      reload();
      return;
    }
    const invoiceBtn = e.target?.closest?.("[data-ior-invoice]");
    if (invoiceBtn) {
      e.preventDefault();
      const invoice = root.document.getElementById("ior-invoice");
      const item = root.document.getElementById("ior-item");
      if (invoice) invoice.value = invoiceBtn.dataset.iorInvoice || "";
      if (item) item.value = "";
      view.page = 1;
      reload();
      return;
    }
    const sort = e.target?.closest?.("[data-ior-sort]");
    if (sort) {
      e.preventDefault();
      const key = sort.dataset.iorSort;
      if (view.sort === key) view.dir = view.dir === "asc" ? "desc" : "asc";
      else {
        view.sort = key;
        view.dir = key === "product_name" || key === "customer" ? "asc" : "desc";
      }
      view.page = 1;
      rerender();
      return;
    }
    const page = e.target?.closest?.("[data-ior-page]");
    if (page) {
      e.preventDefault();
      view.page += page.dataset.iorPage === "next" ? 1 : -1;
      rerender();
      return;
    }
    if (e.target?.closest?.("[data-ior-apply]")) {
      e.preventDefault();
      view.page = 1;
      reload();
      return;
    }
    if (e.target?.closest?.("[data-ior-clear]")) {
      e.preventDefault();
      ["ior-product", "ior-category", "ior-customer", "ior-brand", "ior-invoice", "ior-item"].forEach((id) => {
        const el = root.document.getElementById(id);
        if (el) el.value = "";
      });
      const branch = root.document.getElementById("ior-branch");
      if (branch) branch.value = "";
      view.page = 1;
      view.q = "";
      reload();
      return;
    }
    if (e.target?.closest?.("[data-ior-print]")) {
      e.preventDefault();
      view.printAll = true;
      const block = sectionHtml(view.report).replace('id="item-oversell-report"', "");
      view.printAll = false;
      if (typeof root.printFinance === "function") {
        root.printFinance({ title: "Item-Wise Overselling Report", html: block, from: read("rep-from"), to: read("rep-to") });
      }
    }
  }

  function onInput(e) {
    if (e.target?.id === "ior-product") {
      const item = root.document.getElementById("ior-item");
      if (item) item.value = "";
    }
    if (e.target?.id === "ior-search") {
      view.q = e.target.value || "";
      view.page = 1;
      rerender();
    }
  }

  if (root.document?.addEventListener) {
    root.document.addEventListener("click", onClick);
    root.document.addEventListener("input", onInput);
  }

  root.POSItemOversellReport = {
    PAGE, paise, qtyRound, day, buildReport, summarize, sheetsFromReport, csvFromReport, pdfLines,
    captureFilters, queryString, sectionHtml, view,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
