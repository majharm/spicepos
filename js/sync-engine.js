/* Automatic sync: local id, queue, reconnect, batch upload, cloud ack. */
(function () {
  const BATCH_SIZE = 20;
  const KINDS = new Set(["checkout", "payment", "stock", "purchase"]);

  function round2(value) {
    return Math.round(Number(value) * 100) / 100;
  }

  function transactionId(deviceId) {
    const device = String(deviceId || "device").replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "device";
    return `txn_${device}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.slice(0, 80);
  }

  function checkInvoiceMath(payload) {
    const lines = Array.isArray(payload?.lines) ? payload.lines : [];
    if (!lines.length) return "Cart is empty";
    let subtotal = 0;
    let priced = 0;
    for (const line of lines) {
      const qty = Number(line?.quantity_gm);
      if (!Number.isFinite(qty) || qty <= 0) return "Invalid quantity";
      if (line?.rate == null || line.rate === "") continue;
      const rate = Number(line.rate);
      if (!Number.isFinite(rate) || rate < 0) return "Invalid rate";
      const expected = round2(rate * qty);
      subtotal += expected;
      priced += 1;
      if (line.amount != null && line.amount !== "" && Math.abs(Number(line.amount) - expected) > 0.05) {
        return "Line total does not match rate and quantity";
      }
    }
    const discount = Number(payload?.discount) || 0;
    if (!Number.isFinite(discount) || discount < -0.001) return "Discount cannot be negative";
    if (priced === lines.length && discount - subtotal > 0.05) return "Discount is larger than the bill";
    if (priced === lines.length && payload?.total != null && payload.total !== "") {
      const expected = round2(Math.max(0, subtotal - discount));
      if (!Number.isFinite(Number(payload.total)) || Math.abs(Number(payload.total) - expected) > 0.05) {
        return "Bill total does not match the lines";
      }
    }
    const paid = payload?.amountPaid ?? payload?.amount_paid;
    if (paid != null && paid !== "" && (!Number.isFinite(Number(paid)) || Number(paid) < 0)) return "Payment amount is invalid";
    return "";
  }

  function reviewTransaction(txn, ctx = {}) {
    const id = String(txn?.transactionId || txn?.idempotencyKey || "").trim().slice(0, 80);
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) return { transactionId: id, reject: "Transaction id required" };
    const deviceId = String(ctx.deviceId || "").trim();
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(deviceId)) return { transactionId: id, reject: "This device is not authorized" };
    if (txn?.deviceId && String(txn.deviceId) !== deviceId) return { transactionId: id, reject: "This device is not authorized" };
    const businessId = String(ctx.businessId || "");
    if (!businessId) return { transactionId: id, reject: "Shop sign in required" };
    if (txn?.businessId && String(txn.businessId) !== businessId) return { transactionId: id, reject: "This transaction belongs to another shop" };
    const kind = String(txn?.kind || "");
    if (!KINDS.has(kind)) return { transactionId: id, reject: "Unknown transaction" };
    const payload = txn?.payload || {};
    if (kind === "checkout") {
      const math = checkInvoiceMath(payload);
      if (math) return { transactionId: id, reject: math };
      if (!payload.customerId) return { transactionId: id, reject: "Customer not found" };
    }
    if (kind === "payment") {
      const amount = Number(payload.amount ?? payload.amountPaid);
      if (!Number.isFinite(amount) || amount < 0) return { transactionId: id, reject: "Payment amount is invalid" };
    }
    if (kind === "stock") {
      if (!payload.item_id) return { transactionId: id, reject: "Item not found" };
      if (payload.set_on_hand == null && !Number.isFinite(Number(payload.quantity_gm))) return { transactionId: id, reject: "Invalid quantity" };
    }
    if (kind === "purchase") {
      if (!payload.supplier_id) return { transactionId: id, reject: "Supplier not found" };
      if (!Array.isArray(payload.lines) || !payload.lines.length) return { transactionId: id, reject: "Purchase lines are required" };
    }
    return { transactionId: id, ok: true };
  }

  function applyBatchAck(rows, result) {
    const accepted = new Set(result?.accepted || []);
    const duplicate = new Set(result?.duplicate || []);
    const rejected = new Map((result?.rejected || []).map((row) => [row.transactionId, row.error || "Rejected"]));
    const applied = result?.applied || {};
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const id = row.transactionId || row.idempotencyKey;
      const info = applied[id] || {};
      if (accepted.has(id) || duplicate.has(id)) {
        return {
          ...row,
          status: "synced",
          error: "",
          duplicate: duplicate.has(id),
          serverNumber: info.orderNumber || info.purchaseNumber || row.serverNumber || "",
          serverOrderId: info.orderId || info.purchaseId || row.serverOrderId || "",
          syncedAt: row.syncedAt || new Date().toISOString(),
        };
      }
      if (rejected.has(id)) return { ...row, status: "conflict", error: rejected.get(id) };
      return row;
    });
  }

  function mergeById(current, updates, fields) {
    if (!Array.isArray(updates) || !updates.length) return Array.isArray(current) ? current : [];
    const list = (Array.isArray(current) ? current : []).map((row) => ({ ...row }));
    for (const update of updates) {
      if (!update?.id) continue;
      const index = list.findIndex((row) => row.id === update.id);
      if (index < 0) {
        list.push({ ...update });
        continue;
      }
      const merged = { ...list[index] };
      for (const field of fields) {
        if (update[field] !== undefined) merged[field] = update[field];
      }
      list[index] = merged;
    }
    return list;
  }

  function mergeChanges(snapshot, changes) {
    const next = { ...(snapshot || {}) };
    next.items = mergeById(next.items, changes?.items, ["name", "retail_rate", "purchase_rate", "b2b_rate", "gst_rate", "stock_gm", "barcode", "status", "hsn"]);
    next.customers = mergeById(next.customers, changes?.customers, ["name", "business_name", "mobile", "outstanding", "status", "gstin"]);
    if (Array.isArray(changes?.taxes) && changes.taxes.length) next.taxes = changes.taxes;
    if (changes?.settings?.company) next.company = { ...(next.company || {}), ...changes.settings.company };
    if (changes?.settings?.business) next.business = { ...(next.business || {}), ...changes.settings.business };
    if (changes?.nextSince) next.syncSince = changes.nextSince;
    return next;
  }

  globalThis.POSSyncEngine = {
    BATCH_SIZE,
    transactionId,
    checkInvoiceMath,
    reviewTransaction,
    applyBatchAck,
    mergeChanges,
  };
})();
