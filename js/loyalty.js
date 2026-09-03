(function (root, factory) {
  const api = factory();
  root.POSLoyalty = api;
  if (typeof window !== "undefined") window.POSLoyalty = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULTS = {
    enabled: true,
    earn_per_100: 1,
    rupees_per_point: 1,
    min_redeem: 10,
    expiry_days: 365,
    birthday_bonus: 50,
    referral_points: 25,
    silver_spend: 10000,
    gold_spend: 50000,
    platinum_spend: 150000,
  };

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function num(n, fallback = 0) {
    const v = Number(n);
    return Number.isFinite(v) ? v : fallback;
  }

  function settingsFrom(row) {
    const s = { ...DEFAULTS, ...(row || {}) };
    s.enabled = s.enabled === false || s.enabled === 0 || s.enabled === "0" ? false : true;
    s.earn_per_100 = Math.max(0, num(s.earn_per_100, DEFAULTS.earn_per_100));
    s.rupees_per_point = Math.max(0, num(s.rupees_per_point, DEFAULTS.rupees_per_point));
    s.min_redeem = Math.max(0, num(s.min_redeem, DEFAULTS.min_redeem));
    s.expiry_days = Math.max(0, num(s.expiry_days, DEFAULTS.expiry_days));
    s.birthday_bonus = Math.max(0, num(s.birthday_bonus, DEFAULTS.birthday_bonus));
    s.referral_points = Math.max(0, num(s.referral_points, DEFAULTS.referral_points));
    s.silver_spend = Math.max(0, num(s.silver_spend, DEFAULTS.silver_spend));
    s.gold_spend = Math.max(0, num(s.gold_spend, DEFAULTS.gold_spend));
    s.platinum_spend = Math.max(0, num(s.platinum_spend, DEFAULTS.platinum_spend));
    return s;
  }

  function earnPoints(rupees, settings) {
    const s = settingsFrom(settings);
    if (!s.enabled) return 0;
    const amt = Math.max(0, num(rupees));
    return Math.floor((amt * s.earn_per_100) / 100);
  }

  function redeemValue(points, settings) {
    const s = settingsFrom(settings);
    return round2(Math.max(0, num(points)) * s.rupees_per_point);
  }

  function pointsForRupees(rupees, settings) {
    const s = settingsFrom(settings);
    if (s.rupees_per_point <= 0) return 0;
    return Math.floor(Math.max(0, num(rupees)) / s.rupees_per_point);
  }

  function canRedeem(balance, want, settings) {
    const s = settingsFrom(settings);
    const pts = Math.floor(Math.max(0, num(want)));
    const bal = Math.floor(Math.max(0, num(balance)));
    if (!s.enabled || pts <= 0) return { ok: false, points: 0, rupees: 0 };
    if (pts < s.min_redeem) return { ok: false, points: 0, rupees: 0, error: `Minimum ${s.min_redeem} points to redeem` };
    if (pts > bal) return { ok: false, points: 0, rupees: 0, error: "Not enough points" };
    return { ok: true, points: pts, rupees: redeemValue(pts, s) };
  }

  function tierFromSpend(lifetimeSpend, settings) {
    const s = settingsFrom(settings);
    const spend = num(lifetimeSpend);
    if (spend >= s.platinum_spend) return "platinum";
    if (spend >= s.gold_spend) return "gold";
    if (spend >= s.silver_spend) return "silver";
    return "bronze";
  }

  function tierLabel(tier) {
    const t = String(tier || "bronze").toLowerCase();
    if (t === "platinum") return "Platinum";
    if (t === "gold") return "Gold";
    if (t === "silver") return "Silver";
    return "Bronze";
  }

  function isBirthdayToday(dob, todayYmd) {
    const raw = String(dob || "").slice(0, 10);
    const today = String(todayYmd || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
    return raw.slice(5) === today.slice(5);
  }

  return {
    DEFAULTS,
    settingsFrom,
    earnPoints,
    redeemValue,
    pointsForRupees,
    canRedeem,
    tierFromSpend,
    tierLabel,
    isBirthdayToday,
  };
});
