/* One calendar for Accounts and Reports.
   Presets and ranges are shop days in Asia/Kolkata, not the browser or UTC day. */
(function (root) {
  const ZONE = "Asia/Kolkata";
  const PRESETS = [
    ["today", "Today"],
    ["yesterday", "Yesterday"],
    ["last_7", "Last 7 Days"],
    ["last_30", "Last 30 Days"],
    ["month", "This Month"],
    ["last_month", "Last Month"],
    ["custom", "Custom"],
  ];

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function dayKey(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return shopToday(value);
    const match = String(value ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  }

  function shopToday(now = new Date(), timeZone = ZONE) {
    const when = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    let zone = String(timeZone || ZONE);
    let parts;
    try {
      parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(when);
    } catch {
      zone = ZONE;
      parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(when);
    }
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    return `${y}-${m}-${d}`;
  }

  function shiftYmd(ymd, days) {
    const match = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return "";
    const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }

  function presetRange(preset, today, timeZone) {
    const day = dayKey(today) || shopToday(new Date(), timeZone);
    const key = String(preset || "custom")
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (key === "today") return { preset: "today", from: day, to: day };
    if (key === "yesterday") {
      const y = shiftYmd(day, -1);
      return { preset: "yesterday", from: y, to: y };
    }
    if (key === "last_7" || key === "last7" || key === "last_7_days" || key === "7d") {
      return { preset: "last_7", from: shiftYmd(day, -6), to: day };
    }
    if (key === "last_30" || key === "last30" || key === "last_30_days" || key === "30d") {
      return { preset: "last_30", from: shiftYmd(day, -29), to: day };
    }
    if (key === "week" || key === "this_week") {
      const match = day.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
      const dow = dt.getUTCDay();
      const delta = dow === 0 ? 6 : dow - 1;
      return { preset: "week", from: shiftYmd(day, -delta), to: day };
    }
    if (key === "month" || key === "this_month") {
      return { preset: "month", from: `${day.slice(0, 8)}01`, to: day };
    }
    if (key === "last_month" || key === "prev_month") {
      const lastPrev = shiftYmd(`${day.slice(0, 8)}01`, -1);
      return { preset: "last_month", from: `${lastPrev.slice(0, 8)}01`, to: lastPrev };
    }
    return { preset: "custom", from: "", to: "" };
  }

  function normalizeRange(from, to, today, timeZone) {
    const day = dayKey(today) || shopToday(new Date(), timeZone);
    let start = dayKey(from) || day;
    let end = dayKey(to) || start;
    if (start > end) {
      const swap = start;
      start = end;
      end = swap;
    }
    return { from: start, to: end };
  }

  function matchingPreset(from, to, today, timeZone) {
    const start = dayKey(from);
    const end = dayKey(to);
    for (const key of ["today", "yesterday", "last_7", "last_30", "month", "last_month", "week"]) {
      const range = presetRange(key, today || shopToday(new Date(), timeZone), timeZone);
      if (range.from === start && range.to === end) return range.preset;
    }
    return "custom";
  }

  root.POSDateRange = {
    ZONE,
    PRESETS,
    dayKey,
    shopToday,
    shiftYmd,
    presetRange,
    normalizeRange,
    matchingPreset,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
