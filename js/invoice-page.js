import { buildReceiptText, moneyINR, shareActions } from "./invoice-share.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const params = new URLSearchParams(location.search);
const id = params.get("id") || "";
const status = document.getElementById("status");
const bill = document.getElementById("bill");
const actions = document.getElementById("actions");

if (!id) {
  status.textContent = "Missing invoice id.";
} else {
  try {
    const res = await fetch(`/api/invoices/${encodeURIComponent(id)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    const { order, company } = data;
    document.title = [order.order_number, company?.name].filter(Boolean).join(" · ") || "Invoice";
    status.hidden = true;
    bill.hidden = false;
    const logo = company.logo_url
      ? `<img src="${escapeHtml(company.logo_url)}" alt="" style="max-height:72px;max-width:180px;display:block;margin:0 auto 12px">`
      : "";
    bill.innerHTML = `${logo}<pre class="receipt">${escapeHtml(buildReceiptText(order, company, moneyINR))}</pre>`;
    const share = shareActions(order, company, location.origin);
    actions.hidden = false;
    actions.innerHTML = `
      <a class="btn primary" href="${escapeHtml(share.whatsapp)}" target="_blank" rel="noopener">Share on WhatsApp</a>
      <button class="btn" type="button" id="copy-link">Copy link</button>
      <button class="btn" type="button" id="print-btn">Print</button>
    `;
    document.getElementById("copy-link").onclick = async () => {
      try {
        await navigator.clipboard.writeText(share.url);
        status.hidden = false;
        status.textContent = "Invoice link copied.";
        status.className = "hint ok";
      } catch {
        status.hidden = false;
        status.textContent = share.url;
      }
    };
    document.getElementById("print-btn").onclick = () => window.print();
  } catch (err) {
    status.textContent = err.message || "Invoice not found.";
    status.className = "hint error";
  }
}
