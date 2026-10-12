(function (root) {
  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function clipKey(raw) {
    return String(raw || "")
      .trim()
      .slice(0, 80);
  }

  function newKey() {
    if (root.crypto?.randomUUID) return root.crypto.randomUUID();
    return `pay-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function billTotal(parts = {}) {
    const subtotal = Number(parts.subtotal) || 0;
    const tax = Number(parts.tax ?? parts.gst) || 0;
    const service = Number(parts.service ?? parts.serviceCharge) || 0;
    const discount = Number(parts.discount) || 0;
    if (parts.total != null && Number.isFinite(Number(parts.total))) return round2(Math.max(0, Number(parts.total)));
    return round2(Math.max(0, subtotal + tax + service - discount));
  }

  function outstanding(parts = {}) {
    const total = billTotal(parts);
    const paid = Number(parts.paid ?? parts.alreadyPaid ?? parts.amountPaid) || 0;
    const refunds = Number(parts.refunds) || 0;
    return round2(Math.max(0, total - paid + refunds));
  }

  function isFailedStatus(status) {
    const st = String(status || "").toLowerCase();
    return ["failed", "unverified", "cancelled", "void", "declined"].includes(st);
  }

  function isPendingStatus(status) {
    const st = String(status || "").toLowerCase();
    return st === "pending" || st === "processing";
  }

  function validatePaymentAttempt(opts = {}) {
    const key = clipKey(opts.idempotencyKey || opts.key);
    const existing = Array.isArray(opts.existingKeys) ? opts.existingKeys.map(clipKey).filter(Boolean) : [];
    const pending = Array.isArray(opts.pendingKeys) ? opts.pendingKeys.map(clipKey).filter(Boolean) : [];
    const amount = round2(opts.amount);
    const due = outstanding({
      total: opts.billTotal ?? opts.total,
      paid: opts.alreadyPaid,
      refunds: opts.refunds,
    });
    if (isFailedStatus(opts.status)) {
      return { ok: false, failed: true, remaining: due, error: "Unverified or failed payments cannot be collected as successful." };
    }
    if (key && pending.includes(key)) {
      return {
        ok: false,
        pending: true,
        remaining: due,
        error: "This payment is still pending. Verify it before collecting again.",
      };
    }
    if (key && existing.includes(key)) {
      return { ok: true, replay: true, remaining: due, collected: 0 };
    }
    if (!(amount > 0)) return { ok: false, remaining: due, error: "Enter a payment amount" };
    if (amount > due + 0.004 && !opts.allowOverpay) {
      return {
        ok: false,
        overpay: true,
        remaining: due,
        error: `Amount exceeds outstanding (₹${due.toFixed(2)})`,
      };
    }
    return { ok: true, remaining: round2(Math.max(0, due - amount)), collected: amount };
  }

  function splitPayments(payments, bill, alreadyPaid) {
    const rows = Array.isArray(payments) ? payments : [];
    const keys = [];
    let sum = 0;
    const accepted = [];
    const total = billTotal(typeof bill === "object" ? bill : { total: bill });
    for (const raw of rows) {
      const key = clipKey(raw.idempotencyKey || raw.key);
      if (isFailedStatus(raw.status)) continue;
      const check = validatePaymentAttempt({
        billTotal: total,
        alreadyPaid: round2((Number(alreadyPaid) || 0) + sum),
        amount: raw.amount,
        idempotencyKey: key,
        existingKeys: keys,
        pendingKeys: isPendingStatus(raw.status) ? [key] : [],
        status: raw.status,
        allowOverpay: false,
      });
      if (check.pending || check.failed) return { ok: false, error: check.error, payments: accepted, remaining: check.remaining };
      if (check.replay) continue;
      if (!check.ok) return { ok: false, error: check.error, payments: accepted, remaining: check.remaining };
      if (key) keys.push(key);
      sum = round2(sum + Number(raw.amount));
      accepted.push({
        method: String(raw.method || raw.payment_method || "cash").toLowerCase(),
        amount: round2(raw.amount),
        reference: String(raw.reference || raw.payment_reference || "").trim(),
        idempotencyKey: key,
        status: "success",
      });
    }
    const paid = round2((Number(alreadyPaid) || 0) + sum);
    return { ok: true, payments: accepted, paid, remaining: outstanding({ total, paid }) };
  }

  function keepTableAfterPayment(paymentStatus, remaining) {
    const st = String(paymentStatus || "").toLowerCase();
    if (st === "partial" || st === "unpaid" || st === "due") return true;
    return round2(remaining) > 0.004;
  }

  function sourceVacantAfterShift(opts = {}) {
    const holdsLeft = Number(opts.sourceHoldCount) || 0;
    const openQr = Number(opts.sourceOpenQr) || 0;
    const restriction = Boolean(opts.restriction);
    return holdsLeft <= 0 && openQr <= 0 && !restriction;
  }

  root.POSPayIntegrity = {
    round2,
    clipKey,
    newKey,
    billTotal,
    outstanding,
    isFailedStatus,
    isPendingStatus,
    validatePaymentAttempt,
    splitPayments,
    keepTableAfterPayment,
    sourceVacantAfterShift,
  };
})(typeof window !== "undefined" ? window : globalThis);
