import { query } from "./db.js";
import { bid } from "./context.js";

export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function round2(value) {
  return Math.round(num(value) * 100) / 100;
}

export function pctChange(curr, prev) {
  const a = num(curr);
  const b = num(prev);
  if (!b && !a) return 0;
  if (!b) return 100;
  return round2(((a - b) / Math.abs(b)) * 100);
}

export function inrText(value) {
  return `₹${num(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function ymdAdd(ymd, days) {
  const s = String(ymd || "").slice(0, 10);
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

export function weekdayName(n) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][Number(n) || 0] || "—";
}

function pickTop(rows, key, n = 5) {
  return [...(rows || [])].sort((a, b) => num(b[key]) - num(a[key])).slice(0, n);
}

export function growthScore(parts) {
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(num(v))));
  const sales = clamp(50 + parts.salesGrowth);
  const profit = clamp(50 + parts.profitGrowth);
  const customers = clamp(40 + parts.customerGrowth + parts.retention / 2);
  const inventory = clamp(parts.inventoryHealth);
  const expenses = clamp(parts.expenseControl);
  const total = Math.round(sales * 0.28 + profit * 0.22 + customers * 0.2 + inventory * 0.18 + expenses * 0.12);
  const stars = (v) => "★".repeat(Math.max(1, Math.min(5, Math.round(v / 20)))) + "☆".repeat(Math.max(0, 5 - Math.max(1, Math.min(5, Math.round(v / 20)))));
  return {
    score: clamp(total),
    sales,
    profit,
    customers,
    inventory,
    expenses,
    stars: {
      sales: stars(sales),
      profit: stars(profit),
      customers: stars(customers),
      inventory: stars(inventory),
      retention: stars(customers),
    },
  };
}

export function analyzeGrowth(snap = {}) {
  const today = snap.today || {};
  const yesterday = snap.yesterday || {};
  const week = snap.thisWeek || {};
  const lastWeek = snap.lastWeek || {};
  const month = snap.thisMonth || {};
  const lastMonth = snap.lastMonth || {};
  const year = snap.thisYear || {};
  const lastYear = snap.lastYear || {};
  const products = snap.products || [];
  const stock = snap.stock || [];
  const customers = snap.customers || [];
  const daywise = snap.daywise || [];
  const hourwise = snap.hourwise || [];
  const weekday = snap.weekday || [];
  const branches = snap.branches || [];

  const salesGrowth = pctChange(week.takings, lastWeek.takings);
  const monthGrowth = pctChange(month.takings, lastMonth.takings);
  const yearGrowth = pctChange(year.takings, lastYear.takings);
  const todayGrowth = pctChange(today.takings, yesterday.takings);
  const profitGrowth = pctChange(month.profit, lastMonth.profit);
  const avgBill = today.bills ? round2(num(today.takings) / num(today.bills)) : 0;
  const margin = num(month.takings) ? round2((num(month.profit) / num(month.takings)) * 100) : 0;
  const low = stock.filter((i) => num(i.stock) <= num(i.reorder) && num(i.reorder) > 0);
  const out = stock.filter((i) => num(i.stock) <= 0);
  const over = stock.filter((i) => num(i.stock) > Math.max(num(i.reorder), 1) * 20 && num(i.daysCover) > 60);
  const dead = products.filter((p) => num(p.amount) <= 0 && num(p.stock) > 0);
  const slow = products.filter((p) => num(p.growth) < -15 || (num(p.qtyDay) < 0.2 && num(p.stock) > 0));
  const fast = products.filter((p) => num(p.qtyDay) >= 1 || num(p.daysLeft) <= 7);
  const topRev = pickTop(products, "amount", 5);
  const topProfit = pickTop(products, "profit", 5);
  const weakMargin = products.filter((p) => num(p.amount) > 0 && num(p.margin) > 0 && num(p.margin) < 8);
  const bestHour = pickTop(hourwise, "takings", 1)[0];
  const quietHour = [...hourwise].sort((a, b) => num(a.takings) - num(b.takings))[0];
  const bestDay = pickTop(weekday, "takings", 1)[0];
  const topCat = pickTop(snap.categories || [], "amount", 1)[0];
  const newCust = num(snap.newCustomers);
  const returning = num(snap.returningCustomers);
  const inactive = customers.filter((c) => num(c.daysSince) >= 45);
  const vip = customers.filter((c) => c.segment === "VIP" || c.segment === "High Value");
  const expenseShare = num(month.takings) ? round2((num(month.expenses) / num(month.takings)) * 100) : 0;
  const inventoryHealth = Math.max(20, 90 - low.length * 4 - out.length * 8 - dead.length * 2);
  const expenseControl = Math.max(15, 90 - Math.max(0, expenseShare - 8) * 3);
  const retention = customers.length ? round2((returning / Math.max(1, customers.length)) * 100) : 0;
  const score = growthScore({
    salesGrowth,
    profitGrowth,
    customerGrowth: pctChange(newCust + returning, lastMonth.customers || returning),
    retention,
    inventoryHealth,
    expenseControl,
  });

  const actions = [];
  if (out.length) {
    actions.push({
      level: "urgent",
      title: `${out.length} product${out.length === 1 ? "" : "s"} out of stock`,
      detail: out.slice(0, 4).map((i) => i.name).join(", ") || "Restock now to avoid lost sales.",
      jump: "purchases",
      action: "Reorder",
    });
  }
  if (low.length) {
    actions.push({
      level: "urgent",
      title: `${low.length} low-stock item${low.length === 1 ? "" : "s"}`,
      detail: low
        .slice(0, 3)
        .map((i) => `${i.name} (${Math.max(0, Math.round(num(i.daysLeft)))} day${num(i.daysLeft) === 1 ? "" : "s"} left)`)
        .join(" · "),
      jump: "stock",
      action: "View stock",
    });
  }
  if (num(snap.overdueInvoices) > 0) {
    actions.push({
      level: "urgent",
      title: `${snap.overdueInvoices} overdue invoice${num(snap.overdueInvoices) === 1 ? "" : "s"}`,
      detail: `Outstanding ${inrText(snap.outstanding)}. Collect dues to free cash.`,
      jump: "accounts",
      action: "Collect",
    });
  }
  if (monthGrowth <= -12) {
    actions.push({
      level: "urgent",
      title: "Sales dropped this month",
      detail: `This month is ${Math.abs(monthGrowth)}% below last month. Review evening hours and top products.`,
      jump: "reports",
      action: "View report",
    });
  }
  if (slow.length) {
    actions.push({
      level: "attention",
      title: `${slow.length} slow-moving product${slow.length === 1 ? "" : "s"}`,
      detail: "Clearance or a small bundle can free shelf space.",
      jump: "items",
      action: "Review items",
    });
    actions.push({
      level: "growth",
      kind: "clearance",
      title: "Clearance opportunity",
      detail: `${slow.slice(0, 4).map((p) => p.name).join(", ")} have not been moving. A 15–30% clearance offer can free stock.`,
      jump: "offers",
      action: "Create clearance offer",
      itemIds: slow.slice(0, 12).map((p) => p.itemId || p.id).filter(Boolean),
    });
  }
  if (inactive.length >= 5) {
    actions.push({
      level: "attention",
      title: `${inactive.length} customers have not purchased in 45 days`,
      detail: "A re-engagement offer can lift repeat sales.",
      jump: "customers",
      action: "View customers",
    });
  }
  if (margin > 0 && margin < 12) {
    actions.push({
      level: "attention",
      title: "Gross margin is thin",
      detail: `This month's margin is ${margin}%. Review purchase cost and selling price on high-volume items.`,
      jump: "items",
      action: "Adjust price",
    });
  }
  if (expenseShare > 12) {
    actions.push({
      level: "attention",
      title: "Expenses are high vs sales",
      detail: `Expenses are ${expenseShare}% of this month's sales.`,
      jump: "expenses",
      action: "View expenses",
    });
  }
  if (topRev[0] && topRev[1]) {
    actions.push({
      level: "growth",
      kind: "combo",
      title: "Create a combo offer",
      detail: `Customers who buy ${topRev[0].name} often add other fast movers. Try a ${topRev[0].name} + ${topRev[1].name} bundle.`,
      jump: "offers",
      action: "Create offer",
      itemA: { id: topRev[0].itemId || topRev[0].id || "", name: topRev[0].name },
      itemB: { id: topRev[1].itemId || topRev[1].id || "", name: topRev[1].name },
      discountType: "pct",
      discountValue: 8,
    });
  }
  if (fast.length) {
    actions.push({
      level: "growth",
      title: "Reorder fast-moving products",
      detail: `${fast.slice(0, 3).map((p) => p.name).join(", ")} are moving quickly.`,
      jump: "purchases",
      action: "Reorder",
    });
  }
  if (weakMargin[0]) {
    actions.push({
      level: "growth",
      title: "Lift profit on a top seller",
      detail: `${weakMargin[0].name} sells well but margin is only ${round2(weakMargin[0].margin)}%. A small price review can raise monthly profit.`,
      jump: "items",
      action: "Adjust price",
    });
  }
  if (vip.length) {
    actions.push({
      level: "growth",
      title: "Look after high-value customers",
      detail: `${vip.length} VIP / high-value customer${vip.length === 1 ? "" : "s"} drive a large share of takings.`,
      jump: "loyalty",
      action: "View royalty",
    });
  }

  const recommendations = [];
  if (salesGrowth > 0) {
    recommendations.push({
      kind: "sales",
      title: "Increase sales",
      text: `Sales are up ${salesGrowth}% vs last week. Keep stock of ${topRev[0]?.name || "top products"} and push evening hours${bestHour ? ` (peak around ${bestHour.label})` : ""}.`,
    });
  } else {
    recommendations.push({
      kind: "sales",
      title: "Increase sales",
      text: `This week is ${Math.abs(salesGrowth)}% vs last week. Run a weekend offer on ${topRev[0]?.name || "your best seller"} and message inactive customers.`,
    });
  }
  if (weakMargin[0]) {
    recommendations.push({
      kind: "profit",
      title: "Increase profit",
      text: `${weakMargin[0].name} has only a ${round2(weakMargin[0].margin)}% margin. A small price adjustment could improve monthly profit.`,
    });
  }
  if (low.length || out.length) {
    recommendations.push({
      kind: "stock",
      title: "Prevent lost sales",
      text: `${out.length + low.length} high-demand products may run out soon. Reorder now.`,
    });
  }
  if (inactive.length) {
    recommendations.push({
      kind: "retention",
      title: "Customer retention",
      text: `${inactive.length} customers have not purchased in the last 45 days. Send them a re-engagement offer.`,
    });
  }
  if (topRev[0] && topRev[1]) {
    recommendations.push({
      kind: "cross",
      title: "Cross-selling",
      text: `Customers purchasing ${topRev[0].name} often also buy other fast movers. Suggest ${topRev[1].name} during billing.`,
    });
  }

  const promotions = [];
  if (slow.length) {
    promotions.push({
      name: "Clearance offer",
      text: `Mark ${slow.slice(0, 3).map((p) => p.name).join(", ")} as Buy 2 Get Discount to free shelf space.`,
      expected: "Expected: more cash from dead stock, small margin trade-off.",
    });
  }
  if (topRev[0] && topRev[1]) {
    promotions.push({
      name: "Combo offer",
      text: `Create a ${topRev[0].name} + ${topRev[1].name} bundle this weekend.`,
      expected: "Expected: 8–15% lift on those two lines if stock holds.",
    });
  }
  if (bestDay) {
    promotions.push({
      name: "Peak-day offer",
      text: `${bestDay.label} is your strongest weekday. A same-day loyalty bonus can raise average bill value.`,
      expected: "Expected: higher repeat visits next week.",
    });
  }
  if (newCust > 0) {
    promotions.push({
      name: "New-customer welcome",
      text: `${newCust} new customer${newCust === 1 ? "" : "s"} this month. A first-repeat discount in 7 days improves retention.`,
      expected: "Expected: more returning customers next month.",
    });
  }

  const reorders = fast
    .concat(low)
    .filter((p, i, all) => all.findIndex((x) => x.name === p.name) === i)
    .slice(0, 8)
    .map((p) => {
      const day = Math.max(num(p.qtyDay), 0.2);
      const cover = num(p.stock) / day;
      const buy = Math.max(Math.ceil(day * 14 - num(p.stock)), num(p.reorder) || 0, 1);
      return {
        name: p.name,
        qtyDay: round2(day),
        stock: round2(num(p.stock)),
        daysLeft: Math.max(0, Math.round(cover)),
        suggested: buy,
        text: `${p.name} is selling about ${round2(day)} units/day. Current stock ${round2(num(p.stock))}. Estimated stock-out: ${Math.max(0, Math.round(cover))} day(s). Recommended purchase: ${buy}.`,
      };
    });

  const lastDays = daywise.slice(-14);
  const prevDays = daywise.slice(-28, -14);
  const lastAvg = lastDays.length ? lastDays.reduce((s, r) => s + num(r.takings), 0) / lastDays.length : 0;
  const prevAvg = prevDays.length ? prevDays.reduce((s, r) => s + num(r.takings), 0) / prevDays.length : lastAvg;
  const trend = pctChange(lastAvg, prevAvg);
  const tomorrow = round2(lastAvg * (1 + Math.max(-0.15, Math.min(0.15, trend / 200))));
  const next7 = round2(tomorrow * 7);
  const next30 = round2(tomorrow * 30);

  const alerts = [];
  if (monthGrowth <= -20) alerts.push(`Sales this month are ${Math.abs(monthGrowth)}% below last month.`);
  if (topCat && monthGrowth < -10) alerts.push(`Watch ${topCat.name} — it is your largest category while overall sales are down.`);
  if (num(month.discount) > 0 && num(month.profit) < num(lastMonth.profit)) {
    alerts.push(`Discounts this month are ${inrText(month.discount)}. Sales may be up, but profit is softer — consider a smaller offer.`);
  }
  if (branches.length >= 2) {
    const best = pickTop(branches, "takings", 1)[0];
    const weak = [...branches].sort((a, b) => num(a.takings) - num(b.takings))[0];
    if (best && weak && best.name !== weak.name) {
      alerts.push(`${best.name} is ahead of ${weak.name}. Check stock of top products at the weaker branch.`);
    }
  }

  const why = [];
  if (salesGrowth >= 8 && topCat) why.push(`${topCat.name} products generated the highest revenue.`);
  if (fast.length) why.push(`${fast.length} fast-moving product${fast.length === 1 ? "" : "s"} may go out of stock within a week.`);
  if (bestHour && quietHour && num(bestHour.takings) > num(quietHour.takings) * 1.2) {
    why.push(`${bestHour.label} sales are stronger than ${quietHour.label}. Consider staffing and promotions then.`);
  }
  if (!why.length) why.push("Keep billing every walk-in and restock your best sellers.");

  const summary =
    salesGrowth >= 0
      ? `Your sales increased by ${Math.round(salesGrowth)}% this week compared with last week. ${why.join(" ")}`
      : `Your sales are ${Math.abs(Math.round(salesGrowth))}% vs last week. ${why.join(" ")}`;

  const opportunity =
    out.length || low.length
      ? "Improve inventory availability for your top products and reorder before they stock out."
      : inactive.length
        ? "Increase repeat-customer campaigns for shoppers who have gone quiet."
        : "Protect margin on high-volume items and keep evening hours fully staffed.";

  const expansion = [];
  if (topCat) {
    expansion.push({
      source: "shop",
      text: `Your customers frequently purchase ${topCat.name} products. Consider adding related variants or a dedicated section.`,
    });
  }
  if (fast.length) {
    expansion.push({
      source: "shop",
      text: "Fast-moving items can become weekly refill or subscription products if the same customers buy them often.",
    });
  }
  if (vip.length) {
    expansion.push({
      source: "shop",
      text: "High-value customers may buy larger packs or wholesale if you offer a B2B price list.",
    });
  }
  expansion.push({
    source: "shop",
    text: "QR ordering and delivery can add a sales channel without opening a second counter.",
  });
  const market = [
    {
      source: "market",
      text: "Festival weeks in India often lift grocery and gift baskets — plan stock 10–14 days ahead. This is a general market estimate, not this shop's billed data.",
    },
    {
      source: "market",
      text: "Nearby retailers often bundle a staple with a small treat. Treat this as an idea, not a number from your bills.",
    },
  ];

  return {
    summary,
    opportunity,
    score,
    compare: {
      todayVsYesterday: todayGrowth,
      weekVsLast: salesGrowth,
      monthVsLast: monthGrowth,
      yearVsLast: yearGrowth,
    },
    kpis: {
      todaySales: round2(today.takings),
      todayProfit: round2(today.profit),
      todayBills: num(today.bills),
      avgBill,
      salesGrowth,
      monthGrowth,
      margin,
      newCustomers: newCust,
      returningCustomers: returning,
      stockValue: round2(snap.stockValue),
      lowStock: low.length,
      damaged: round2(snap.damageLoss),
      expenses: round2(month.expenses),
      outstanding: round2(snap.outstanding),
      score: score.score,
    },
    products: {
      top: topRev,
      profit: topProfit,
      slow: slow.slice(0, 8),
      dead: dead.slice(0, 8),
      weakMargin: weakMargin.slice(0, 5),
    },
    inventory: { low, out, over: over.slice(0, 8), reorders },
    customers: {
      total: customers.length,
      new: newCust,
      returning,
      inactive: inactive.length,
      vip: vip.length,
      top: pickTop(customers, "takings", 5),
      segments: snap.segments || [],
    },
    charts: { daywise, hourwise, weekday, categories: snap.categories || [] },
    forecast: { tomorrow, next7, next30, trend },
    actions,
    recommendations,
    promotions,
    alerts,
    branches,
    discount: {
      amount: round2(month.discount),
      note:
        num(month.discount) > 0 && profitGrowth < 0
          ? `Discounts are ${inrText(month.discount)} this month while profit is ${profitGrowth}%. Consider a smaller offer.`
          : num(month.discount) > 0
            ? `Discounts this month: ${inrText(month.discount)}.`
            : "No large discounts recorded this month.",
    },
    expansion,
    market,
    askExamples: [
      "Why did my sales drop this month?",
      "What are my most profitable products?",
      "Which products should I reorder?",
      "What should I promote today?",
      "How can I increase my profit?",
      "Which customers should I target?",
      "Which products are slow-moving?",
      "What should I stop selling?",
      "What should I buy this week?",
      "How can I increase repeat customers?",
    ],
  };
}

export function growthToSheets(a = {}) {
  const k = a.kpis || {};
  return [
    {
      name: "Summary",
      headers: ["Metric", "Value"],
      rows: [
        ["AI summary", a.summary || ""],
        ["Growth opportunity", a.opportunity || ""],
        ["Business growth score", k.score],
        ["Today sales", k.todaySales],
        ["Today profit", k.todayProfit],
        ["Today bills", k.todayBills],
        ["Average bill", k.avgBill],
        ["Sales growth % (week)", k.salesGrowth],
        ["Sales growth % (month)", k.monthGrowth],
        ["Gross margin %", k.margin],
        ["New customers", k.newCustomers],
        ["Returning customers", k.returningCustomers],
        ["Stock value", k.stockValue],
        ["Low stock items", k.lowStock],
        ["Damaged / wastage", k.damaged],
        ["Expenses (month)", k.expenses],
        ["Outstanding", k.outstanding],
        ["Discount note", a.discount?.note || ""],
      ],
    },
    {
      name: "Top products",
      headers: ["Name", "Revenue", "Profit", "Margin %", "Growth %"],
      rows: (a.products?.top || []).map((p) => [p.name, num(p.amount), num(p.profit), num(p.margin), num(p.growth)]),
    },
    {
      name: "Slow products",
      headers: ["Name", "Revenue", "Growth %", "Stock"],
      rows: (a.products?.slow || []).map((p) => [p.name, num(p.amount), num(p.growth), num(p.stock)]),
    },
    {
      name: "Reorders",
      headers: ["Name", "Qty / day", "Stock", "Days left", "Suggested buy", "Note"],
      rows: (a.inventory?.reorders || []).map((p) => [p.name, num(p.qtyDay), num(p.stock), num(p.daysLeft), num(p.suggested), p.text]),
    },
    {
      name: "Customers",
      headers: ["Name", "Bills", "Takings", "Segment", "Days since"],
      rows: (a.customers?.top || []).map((c) => [c.name, num(c.bills), num(c.takings), c.segment || "", num(c.daysSince)]),
    },
    {
      name: "Actions",
      headers: ["Level", "Title", "Detail"],
      rows: (a.actions || []).map((x) => [x.level, x.title, x.detail]),
    },
    {
      name: "Recommendations",
      headers: ["Kind", "Title", "Text"],
      rows: (a.recommendations || []).map((x) => [x.kind, x.title, x.text]),
    },
  ];
}

export function answerGrowthQuestion(question, analysis) {
  const q = String(question || "").toLowerCase();
  const a = analysis || analyzeGrowth({});
  if (/why.*drop|sales drop|decreased|down/.test(q)) {
    return a.alerts[0] || a.summary;
  }
  if (/profit|margin/.test(q) && /product|item/.test(q)) {
    const p = a.products.profit[0];
    return p
      ? `${p.name} is among your most profitable lines (${inrText(p.profit)}, ${round2(p.margin)}% margin).`
      : "Profit by product needs more billed sales with cost recorded.";
  }
  if (/reorder|buy this week|out of stock|stock/.test(q)) {
    const r = a.inventory.reorders[0];
    return r ? r.text : a.inventory.low[0] ? `${a.inventory.low[0].name} is at reorder level.` : "Stock looks comfortable on tracked items.";
  }
  if (/promote|offer|today/.test(q)) {
    return a.promotions[0]?.text || a.recommendations[0]?.text || a.summary;
  }
  if (/increase.*profit|how.*profit/.test(q)) {
    return a.recommendations.find((r) => r.kind === "profit")?.text || a.opportunity;
  }
  if (/customer|target|repeat|inactive/.test(q)) {
    return a.recommendations.find((r) => r.kind === "retention")?.text || `${a.customers.inactive} inactive customers and ${a.customers.vip} high-value customers.`;
  }
  if (/slow|stop selling|dead/.test(q)) {
    const s = a.products.slow[0] || a.products.dead[0];
    return s ? `${s.name} is slow or idle. Consider a clearance offer.` : "No clear dead stock from this period.";
  }
  if (/forecast|tomorrow|next/.test(q)) {
    return `If the recent trend holds, tomorrow is about ${inrText(a.forecast.tomorrow)}, next 7 days ${inrText(a.forecast.next7)}, next 30 days ${inrText(a.forecast.next30)}. This is a shop-data estimate, not an external market forecast.`;
  }
  return a.summary;
}

function segmentCustomer(row) {
  const days = num(row.daysSince);
  const bills = num(row.bills);
  const takings = num(row.takings);
  if (days >= 45 && bills > 0) return "Inactive";
  if (days >= 30 && bills > 0) return "At-Risk";
  if (bills <= 1 && days <= 30) return "New";
  if (takings >= 25000 || bills >= 12) return "VIP";
  if (takings >= 8000 || bills >= 6) return "High Value";
  if (bills >= 3) return "Regular";
  return "Occasional";
}

async function periodSales(tenant, start, end) {
  const [row] = await query(
    `SELECT COUNT(*) AS bills,
            COALESCE(SUM(total),0) AS takings,
            COALESCE(SUM(gst),0) AS gst,
            COALESCE(SUM(discount),0) AS discount
     FROM sales_orders
     WHERE business_id = ? AND DATE(created_at) BETWEEN ? AND ?`,
    [tenant, start, end],
  );
  const [p] = await query(
    `SELECT COALESCE(SUM(COALESCE(l.profit, l.amount - COALESCE(l.cost, 0))),0) AS profit
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id
     WHERE o.business_id = ? AND DATE(o.created_at) BETWEEN ? AND ? AND l.cancelled = 0`,
    [tenant, start, end],
  );
  return {
    bills: num(row?.bills),
    takings: num(row?.takings),
    gst: num(row?.gst),
    discount: num(row?.discount),
    profit: round2(p?.profit),
  };
}

export async function buildGrowthDashboard() {
  const tenant = bid();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = ymdAdd(today, -1);
  const weekStart = ymdAdd(today, -6);
  const lastWeekStart = ymdAdd(today, -13);
  const lastWeekEnd = ymdAdd(today, -7);
  const monthStart = `${today.slice(0, 7)}-01`;
  const prevMonthEnd = ymdAdd(monthStart, -1);
  const prevMonthStart = `${prevMonthEnd.slice(0, 7)}-01`;
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const lastYearStart = `${Number(today.slice(0, 4)) - 1}-01-01`;
  const lastYearEnd = `${Number(today.slice(0, 4)) - 1}-12-31`;
  const last30 = ymdAdd(today, -29);
  const last90 = ymdAdd(today, -89);

  const [thisToday, thisYest, thisWeek, lastWeek, thisMonth, lastMonth, thisYear, lastYear] = await Promise.all([
    periodSales(tenant, today, today),
    periodSales(tenant, yesterday, yesterday),
    periodSales(tenant, weekStart, today),
    periodSales(tenant, lastWeekStart, lastWeekEnd),
    periodSales(tenant, monthStart, today),
    periodSales(tenant, prevMonthStart, prevMonthEnd),
    periodSales(tenant, yearStart, today),
    periodSales(tenant, lastYearStart, lastYearEnd),
  ]);

  const daywise = await query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings
     FROM sales_orders WHERE business_id = ? AND DATE(created_at) BETWEEN ? AND ?
     GROUP BY DATE(created_at) ORDER BY day`,
    [tenant, last30, today],
  );
  const hourwise = await query(
    `SELECT HOUR(created_at) AS hour, COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings
     FROM sales_orders WHERE business_id = ? AND DATE(created_at) BETWEEN ? AND ?
     GROUP BY HOUR(created_at) ORDER BY hour`,
    [tenant, last30, today],
  );
  const weekday = await query(
    `SELECT DAYOFWEEK(created_at) AS dow, COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings
     FROM sales_orders WHERE business_id = ? AND DATE(created_at) BETWEEN ? AND ?
     GROUP BY DAYOFWEEK(created_at) ORDER BY dow`,
    [tenant, last90, today],
  );
  const products = await query(
    `SELECT COALESCE(MAX(l.item_id),'') AS item_id,
            l.item_name AS name,
            COALESCE(MAX(i.category),'') AS category,
            COALESCE(MAX(i.stock_gm),0) AS stock_gm,
            COALESCE(MAX(i.reorder_level_gm),0) AS reorder_gm,
            COALESCE(MAX(i.purchase_rate),0) AS purchase_rate,
            SUM(l.quantity_gm) AS qty,
            SUM(l.amount) AS amount,
            SUM(COALESCE(l.profit, l.amount - COALESCE(l.cost,0))) AS profit
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id
     LEFT JOIN items i ON i.id = l.item_id
     WHERE o.business_id = ? AND DATE(o.created_at) BETWEEN ? AND ? AND l.cancelled = 0
     GROUP BY l.item_name
     ORDER BY amount DESC`,
    [tenant, monthStart, today],
  );
  const prevProducts = await query(
    `SELECT l.item_name AS name, SUM(l.amount) AS amount
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id
     WHERE o.business_id = ? AND DATE(o.created_at) BETWEEN ? AND ? AND l.cancelled = 0
     GROUP BY l.item_name`,
    [tenant, prevMonthStart, prevMonthEnd],
  );
  const prevMap = Object.fromEntries(prevProducts.map((r) => [r.name, num(r.amount)]));
  const daysInMonth = Math.max(1, Number(today.slice(8, 10)));
  const productRows = products.map((p) => {
    const qty = num(p.qty);
    const qtyDay = qty / daysInMonth;
    const stock = num(p.stock_gm);
    const isCount = stock > 0 && stock < 50000 && qty < 50000;
    const stockUnits = isCount && stock > 200 ? stock / 1000 : stock;
    const qtyUnits = isCount && qty > 200 ? qty / 1000 : qty;
    const day = Math.max(qtyUnits / daysInMonth, 0);
    return {
      itemId: p.item_id || "",
      name: p.name,
      category: p.category || "General",
      amount: num(p.amount),
      profit: num(p.profit),
      margin: num(p.amount) ? round2((num(p.profit) / num(p.amount)) * 100) : 0,
      qty: qtyUnits,
      qtyDay: round2(day || qtyDay),
      stock: stockUnits,
      reorder: num(p.reorder_gm) > 200 ? num(p.reorder_gm) / 1000 : num(p.reorder_gm),
      daysLeft: day > 0 ? round2(stockUnits / day) : 99,
      daysCover: day > 0 ? stockUnits / day : 99,
      growth: pctChange(num(p.amount), prevMap[p.name] || 0),
    };
  });

  const stockItems = await query(
    `SELECT name, category, stock_gm, reorder_level_gm, purchase_rate, retail_rate
     FROM items WHERE business_id = ? AND (status IS NULL OR status <> 'inactive') ORDER BY name`,
    [tenant],
  );
  const soldMap = Object.fromEntries(productRows.map((p) => [p.name, p]));
  const stock = stockItems.map((i) => {
    const sold = soldMap[i.name] || {};
    const stockQty = num(i.stock_gm);
    const units = stockQty > 200 ? stockQty / 1000 : stockQty;
    const day = num(sold.qtyDay) || 0.15;
    return {
      name: i.name,
      category: i.category || "General",
      stock: units,
      reorder: num(i.reorder_level_gm) > 200 ? num(i.reorder_level_gm) / 1000 : num(i.reorder_level_gm),
      daysLeft: day > 0 ? units / day : 99,
      daysCover: day > 0 ? units / day : 99,
      qtyDay: day,
      amount: num(sold.amount),
      profit: num(sold.profit),
      margin: num(sold.margin),
      growth: num(sold.growth),
    };
  });

  const [stockVal] = await query(
    `SELECT COALESCE(SUM(CASE WHEN stock_gm > 200 THEN stock_gm/1000.0 * purchase_rate ELSE stock_gm * purchase_rate END),0) AS value
     FROM items WHERE business_id = ?`,
    [tenant],
  );
  const [outRow] = await query(
    `SELECT COALESCE(SUM(outstanding),0) AS outstanding FROM customers WHERE business_id = ?`,
    [tenant],
  );
  const [expRow] = await query(
    `SELECT COALESCE(SUM(amount + COALESCE(gst,0)),0) AS total FROM expenses
     WHERE business_id = ? AND expense_date BETWEEN ? AND ?`,
    [tenant, monthStart, today],
  );
  let damageLoss = 0;
  try {
    const [dmg] = await query(
      `SELECT COALESCE(SUM(loss_amount),0) AS loss FROM damage_records
       WHERE business_id = ? AND DATE(created_at) BETWEEN ? AND ?`,
      [tenant, monthStart, today],
    );
    damageLoss = num(dmg?.loss);
  } catch {
    damageLoss = 0;
  }

  const custRows = await query(
    `SELECT c.id, c.name, c.mobile, c.outstanding,
            COUNT(o.id) AS bills,
            COALESCE(SUM(o.total),0) AS takings,
            MAX(o.created_at) AS last_sale
     FROM customers c
     LEFT JOIN sales_orders o ON o.customer_id = c.id AND o.business_id = c.business_id
       AND DATE(o.created_at) BETWEEN ? AND ?
     WHERE c.business_id = ?
     GROUP BY c.id, c.name, c.mobile, c.outstanding
     ORDER BY takings DESC`,
    [last90, today, tenant],
  );
  const customers = custRows.map((c) => {
    const last = c.last_sale ? String(c.last_sale).slice(0, 10) : "";
    const daysSince = last ? Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${last}T12:00:00Z`)) / 86400000)) : 90;
    const row = { name: c.name, mobile: c.mobile, bills: num(c.bills), takings: num(c.takings), outstanding: num(c.outstanding), daysSince };
    row.segment = segmentCustomer(row);
    return row;
  });
  const segments = ["VIP", "High Value", "Regular", "New", "Occasional", "At-Risk", "Inactive"].map((name) => ({
    name,
    count: customers.filter((c) => c.segment === name).length,
  }));
  const [newCust] = await query(
    `SELECT COUNT(*) AS n FROM customers WHERE business_id = ? AND DATE(created_at) BETWEEN ? AND ?`,
    [tenant, monthStart, today],
  ).catch(() => [{ n: customers.filter((c) => c.segment === "New").length }]);
  const returning = customers.filter((c) => num(c.bills) >= 2).length;

  const [overdue] = await query(
    `SELECT COUNT(*) AS n FROM sales_orders
     WHERE business_id = ? AND LOWER(COALESCE(payment_status,'')) IN ('unpaid','partial','credit')
       AND DATE(created_at) < ?`,
    [tenant, ymdAdd(today, -7)],
  ).catch(() => [{ n: 0 }]);

  const catMap = {};
  for (const p of productRows) {
    const key = p.category || "General";
    catMap[key] = (catMap[key] || 0) + num(p.amount);
  }
  const categories = Object.entries(catMap)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);

  let branches = [];
  try {
    branches = await query(
      `SELECT COALESCE(b.name, 'Main') AS name, COUNT(o.id) AS bills, COALESCE(SUM(o.total),0) AS takings
       FROM sales_orders o
       LEFT JOIN branches b ON b.id = o.branch_id
       WHERE o.business_id = ? AND DATE(o.created_at) BETWEEN ? AND ?
       GROUP BY COALESCE(b.name, 'Main') ORDER BY takings DESC`,
      [tenant, monthStart, today],
    );
  } catch {
    branches = [];
  }

  thisMonth.expenses = num(expRow?.total);
  lastMonth.customers = customers.length;

  const snap = {
    today: thisToday,
    yesterday: thisYest,
    thisWeek,
    lastWeek,
    thisMonth,
    lastMonth,
    thisYear,
    lastYear,
    daywise: daywise.map((r) => ({ label: String(r.day).slice(0, 10), bills: num(r.bills), takings: num(r.takings) })),
    hourwise: hourwise.map((r) => ({ label: `${String(r.hour).padStart(2, "0")}:00`, hour: num(r.hour), bills: num(r.bills), takings: num(r.takings) })),
    weekday: weekday.map((r) => ({ label: weekdayName(num(r.dow) - 1), bills: num(r.bills), takings: num(r.takings) })),
    products: productRows,
    stock,
    stockValue: num(stockVal?.value),
    outstanding: num(outRow?.outstanding),
    damageLoss,
    customers,
    segments,
    newCustomers: num(newCust?.n ?? customers.filter((c) => c.segment === "New").length),
    returningCustomers: returning,
    overdueInvoices: num(overdue?.n),
    categories,
    branches,
  };

  const analysis = analyzeGrowth(snap);
  analysis.range = { today, monthStart, weekStart };
  analysis.source = "shop";
  return analysis;
}
