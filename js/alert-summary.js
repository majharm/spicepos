/* Full alert result: every number, every email, every shop outcome. */
(function () {
  function formatWaDisplay(raw) {
    const n = String(raw || "").replace(/\D/g, "");
    if (!n) return "";
    return n.length === 10 ? `+91${n}` : `+${n}`;
  }

  function formatAlertWaTos(row) {
    const raw = row?.wa?.to;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const fromResults = (row?.wa?.results || []).map((item) => item?.number || item?.to || "");
    const all = [...list, ...fromResults, row?.wa?.number || ""];
    const out = [];
    const seen = new Set();
    for (const item of all) {
      const shown = formatWaDisplay(item);
      if (!shown || seen.has(shown)) continue;
      seen.add(shown);
      out.push(shown);
    }
    return out;
  }

  function formatAlertWaTo(row) {
    return formatAlertWaTos(row)[0] || "";
  }

  function formatAlertMailTos(row) {
    const out = [];
    const seen = new Set();
    for (const mail of row?.mail || []) {
      const email = String(mail?.to || "").trim();
      if (!email.includes("@")) continue;
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(email);
    }
    return out;
  }

  function alertSkipReason(row) {
    const name = row?.shopName || "This shop";
    switch (row?.reason) {
      case "no-number":
        return `${name}: no mobile or email on file`;
      case "no-low-stock":
        return `${name}: no low-stock or out-of-stock items`;
      case "no-admin-number":
        return `${name}: business admin has no WhatsApp number or email`;
      case "no-expiry":
        return `${name}: no expiry date`;
      case "not-due-yet":
        return `${name}: not in the last 7 days${row.days != null ? ` (${row.days} days left)` : ""}`;
      case "not-expired":
        return `${name}: not expired yet${row.days != null ? ` (${row.days} days left)` : ""}`;
      case "already-expired":
        return `${name}: already expired`;
      case "already-sent":
        return `${name}: already sent`;
      case "alerts-off":
        return "Renewal and expired alerts are inactive in Settings";
      default:
        return row?.reason ? `${name}: ${row.reason}` : name;
    }
  }

  function mailFailReason(row) {
    const mails = row?.mail || [];
    if (!mails.length) return "";
    const fail = mails.find((mail) => mail && !mail.ok);
    if (!fail) return "";
    if (fail.error) return fail.error;
    if (fail.skipped) return "SMTP not configured";
    return "email failed";
  }

  function uniqueAlertBits(items, max = 3, sep = " · ") {
    const unique = [...new Set((items || []).filter(Boolean))];
    if (!unique.length) return "";
    const head = unique.slice(0, max).join(sep);
    return unique.length > max ? `${head}${sep}+${unique.length - max} more` : head;
  }

  function summarizeAlertDelivery(out) {
    if (out?.kind === "test") {
      const row = Array.isArray(out?.results) ? out.results[0] : null;
      const to = formatAlertWaTo(row) || "the number";
      if (row?.wa?.ok) return `Test WhatsApp accepted for ${to}. Reconnect the WA Master QR if the phone stays empty.`;
      const why = row?.wa?.error || row?.wa?.reason || out?.error || "WhatsApp did not accept the test";
      return `Test WhatsApp failed for ${to}: ${why}`;
    }
    if (out?.skipped) {
      return out.reason === "alerts-off"
        ? "Renewal and expired alerts are inactive in Settings."
        : "No expiry alerts were sent.";
    }
    const results = Array.isArray(out?.results) ? out.results : [];
    if (!results.length) return "No shops with an expiry date matched a renewal or expired alert.";
    const summary = out?.summary || {};
    const wa = summary.wa ?? results.filter((row) => row.wa?.ok).length;
    const mail = summary.mail ?? results.filter((row) => (row.mail || []).some((item) => item?.ok)).length;
    const sent = summary.sent ?? results.filter((row) => row.wa?.ok || (row.mail || []).some((item) => item?.ok)).length;
    const skipped = summary.skipped ?? results.filter((row) => row.skipped).length;
    const skipBits = uniqueAlertBits(results.filter((row) => row.skipped).map(alertSkipReason), 500, "\n");
    const failByShop = new Map();
    for (const row of results.filter((item) => !item.skipped && !(item.wa?.ok || (item.mail || []).some((mail) => mail?.ok)))) {
      const waWhy = row.wa?.reason || row.wa?.error || (row.wa?.skipped ? "WhatsApp skipped" : "");
      const why = [waWhy, mailFailReason(row)].filter(Boolean).join(" · ") || "not delivered";
      const name = row.shopName || "Shop";
      const prev = failByShop.get(name) || new Set();
      prev.add(why);
      failByShop.set(name, prev);
    }
    const failBits = uniqueAlertBits(
      [...failByShop.entries()].map(([name, set]) => `${name}: ${[...set].join(" · ")}`),
      500,
      "\n",
    );
    const numbers = [...new Set(results.flatMap((row) => formatAlertWaTos(row)))];
    const emails = [];
    const seenMail = new Set();
    for (const row of results) {
      for (const email of formatAlertMailTos(row)) {
        const key = email.toLowerCase();
        if (seenMail.has(key)) continue;
        seenMail.add(key);
        emails.push(email);
      }
    }
    const mailWhy = [...new Set(results.map(mailFailReason).filter(Boolean))];
    const rateLimited = results.some((row) => /429|rate limited/i.test(String(row.wa?.error || row.wa?.reason || "")));
    let msg = `Alerts sent. WhatsApp ${wa}/${results.length} · Email ${mail}/${results.length}`;
    if (mail < results.length && mailWhy.length) msg += ` (${mailWhy.join("; ")})`;
    msg += ` · Delivered ${sent}, skipped ${skipped}.`;
    if (rateLimited) msg += " WA Master hit its per-minute limit. Wait one minute, then send again for the shops that failed.";
    else if (wa > 0) msg += " WA Master accepted the queue — reconnect the WhatsApp QR if the phone stays empty.";
    if (numbers.length) msg += `\nEvery number\n${numbers.join("\n")}`;
    if (emails.length) msg += `\nEvery email\n${emails.join("\n")}`;
    if (skipBits) msg += `\n${skipBits}`;
    if (failBits) msg += `\n${failBits}`;
    return msg;
  }

  globalThis.POSAlertSummary = {
    formatAlertWaTo,
    formatAlertWaTos,
    formatAlertMailTos,
    alertSkipReason,
    mailFailReason,
    uniqueAlertBits,
    summarizeAlertDelivery,
  };
})();
