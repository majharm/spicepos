(function () {
  const params = new URLSearchParams(location.search);
  const id = params.get("id") || "";
  const status = document.getElementById("status");
  const bar = document.getElementById("bar");
  const title = document.getElementById("title");
  const sheet = document.getElementById("sheet");
  const download = document.getElementById("download");
  const printButton = document.getElementById("print");

  function pdfPath(which) {
    return which === "php"
      ? `/pos-api.php?p=quotations/public/${encodeURIComponent(id)}/pdf`
      : `/api/quotations/public/${encodeURIComponent(id)}/pdf`;
  }

  async function fetchQuote() {
    const paths = [
      `/api/quotations/public/${encodeURIComponent(id)}`,
      `/pos-api.php?p=quotations/public/${encodeURIComponent(id)}`,
    ];
    let last = "Quotation not found.";
    for (const path of paths) {
      try {
        const res = await fetch(path, { credentials: "omit" });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.quote) return { data, php: path.indexOf("pos-api.php") !== -1 };
        last = data.error || (res.ok ? "Quotation not found." : res.statusText) || last;
      } catch (err) {
        last = err.message || last;
      }
    }
    throw new Error(last);
  }

  async function run() {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      status.textContent = "This quotation link is not valid.";
      return;
    }
    if (params.get("download") === "1") {
      location.replace(pdfPath("node"));
      return;
    }
    try {
      const { data, php } = await fetchQuote();
      const html = globalThis.POSQuotations?.printHtml?.(data.quote, data.company || {});
      if (!html) throw new Error("Quotation view is unavailable.");
      const number = data.quote.quotation_number || "Quotation";
      document.title = number;
      title.textContent = number;
      download.href = pdfPath(php ? "php" : "node");
      sheet.srcdoc = html;
      status.hidden = true;
      bar.hidden = false;
      sheet.hidden = false;
      printButton.addEventListener("click", () => {
        const frame = sheet.contentWindow;
        if (frame) frame.print();
      });
    } catch (err) {
      status.textContent = err.message || "Quotation not found.";
    }
  }

  run();
})();
