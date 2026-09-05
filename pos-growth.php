<?php

function pos_growth_num($v) {
  return is_numeric($v) ? (float) $v : 0.0;
}

function pos_growth_round($v) {
  return round(pos_growth_num($v), 2);
}

function pos_growth_pct($curr, $prev) {
  $a = pos_growth_num($curr);
  $b = pos_growth_num($prev);
  if (!$b && !$a) return 0.0;
  if (!$b) return 100.0;
  return pos_growth_round((($a - $b) / abs($b)) * 100);
}

function pos_growth_inr($v) {
  return "₹" . number_format(pos_growth_num($v), 0, ".", ",");
}

function pos_ymd_add($ymd, $days) {
  $t = strtotime($ymd . " 12:00:00");
  return date("Y-m-d", strtotime((int) $days . " days", $t));
}

function pos_growth_score($parts) {
  $clamp = function ($v) {
    return max(0, min(100, (int) round(pos_growth_num($v))));
  };
  $sales = $clamp(50 + ($parts["salesGrowth"] ?? 0));
  $profit = $clamp(50 + ($parts["profitGrowth"] ?? 0));
  $customers = $clamp(40 + ($parts["customerGrowth"] ?? 0) + (($parts["retention"] ?? 0) / 2));
  $inventory = $clamp($parts["inventoryHealth"] ?? 50);
  $expenses = $clamp($parts["expenseControl"] ?? 50);
  $total = (int) round($sales * 0.28 + $profit * 0.22 + $customers * 0.2 + $inventory * 0.18 + $expenses * 0.12);
  $stars = function ($v) {
    $n = max(1, min(5, (int) round($v / 20)));
    return str_repeat("★", $n) . str_repeat("☆", 5 - $n);
  };
  return [
    "score" => $clamp($total),
    "sales" => $sales,
    "profit" => $profit,
    "customers" => $customers,
    "inventory" => $inventory,
    "expenses" => $expenses,
    "stars" => [
      "sales" => $stars($sales),
      "profit" => $stars($profit),
      "customers" => $stars($customers),
      "inventory" => $stars($inventory),
      "retention" => $stars($customers),
    ],
  ];
}

function pos_growth_top($rows, $key, $n = 5) {
  $copy = $rows ?: [];
  usort($copy, function ($a, $b) use ($key) {
    return pos_growth_num($b[$key] ?? 0) <=> pos_growth_num($a[$key] ?? 0);
  });
  return array_slice($copy, 0, $n);
}

function pos_analyze_growth($snap) {
  $today = $snap["today"] ?? [];
  $yesterday = $snap["yesterday"] ?? [];
  $week = $snap["thisWeek"] ?? [];
  $lastWeek = $snap["lastWeek"] ?? [];
  $month = $snap["thisMonth"] ?? [];
  $lastMonth = $snap["lastMonth"] ?? [];
  $year = $snap["thisYear"] ?? [];
  $lastYear = $snap["lastYear"] ?? [];
  $products = $snap["products"] ?? [];
  $stock = $snap["stock"] ?? [];
  $customers = $snap["customers"] ?? [];
  $hourwise = $snap["hourwise"] ?? [];
  $weekday = $snap["weekday"] ?? [];
  $salesGrowth = pos_growth_pct($week["takings"] ?? 0, $lastWeek["takings"] ?? 0);
  $monthGrowth = pos_growth_pct($month["takings"] ?? 0, $lastMonth["takings"] ?? 0);
  $yearGrowth = pos_growth_pct($year["takings"] ?? 0, $lastYear["takings"] ?? 0);
  $todayGrowth = pos_growth_pct($today["takings"] ?? 0, $yesterday["takings"] ?? 0);
  $profitGrowth = pos_growth_pct($month["profit"] ?? 0, $lastMonth["profit"] ?? 0);
  $avgBill = pos_growth_num($today["bills"] ?? 0) ? pos_growth_round(pos_growth_num($today["takings"] ?? 0) / pos_growth_num($today["bills"])) : 0;
  $margin = pos_growth_num($month["takings"] ?? 0) ? pos_growth_round((pos_growth_num($month["profit"] ?? 0) / pos_growth_num($month["takings"])) * 100) : 0;
  $low = array_values(array_filter($stock, function ($i) {
    return pos_growth_num($i["stock"] ?? 0) <= pos_growth_num($i["reorder"] ?? 0) && pos_growth_num($i["reorder"] ?? 0) > 0;
  }));
  $out = array_values(array_filter($stock, function ($i) { return pos_growth_num($i["stock"] ?? 0) <= 0; }));
  $slow = array_values(array_filter($products, function ($p) {
    return pos_growth_num($p["growth"] ?? 0) < -15 || (pos_growth_num($p["qtyDay"] ?? 0) < 0.2 && pos_growth_num($p["stock"] ?? 0) > 0);
  }));
  $fast = array_values(array_filter($products, function ($p) {
    return pos_growth_num($p["qtyDay"] ?? 0) >= 1 || pos_growth_num($p["daysLeft"] ?? 99) <= 7;
  }));
  $topRev = pos_growth_top($products, "amount", 5);
  $topProfit = pos_growth_top($products, "profit", 5);
  $weakMargin = array_values(array_filter($products, function ($p) {
    return pos_growth_num($p["amount"] ?? 0) > 0 && pos_growth_num($p["margin"] ?? 0) > 0 && pos_growth_num($p["margin"]) < 8;
  }));
  $bestHour = pos_growth_top($hourwise, "takings", 1)[0] ?? null;
  $quietHour = $hourwise ? $hourwise : [];
  usort($quietHour, function ($a, $b) { return pos_growth_num($a["takings"] ?? 0) <=> pos_growth_num($b["takings"] ?? 0); });
  $quietHour = $quietHour[0] ?? null;
  $bestDay = pos_growth_top($weekday, "takings", 1)[0] ?? null;
  $topCat = pos_growth_top($snap["categories"] ?? [], "amount", 1)[0] ?? null;
  $newCust = (int) ($snap["newCustomers"] ?? 0);
  $returning = (int) ($snap["returningCustomers"] ?? 0);
  $inactive = array_values(array_filter($customers, function ($c) { return pos_growth_num($c["daysSince"] ?? 0) >= 45; }));
  $vip = array_values(array_filter($customers, function ($c) { return in_array($c["segment"] ?? "", ["VIP", "High Value"], true); }));
  $expenseShare = pos_growth_num($month["takings"] ?? 0) ? pos_growth_round((pos_growth_num($month["expenses"] ?? 0) / pos_growth_num($month["takings"])) * 100) : 0;
  $inventoryHealth = max(20, 90 - count($low) * 4 - count($out) * 8);
  $expenseControl = max(15, 90 - max(0, $expenseShare - 8) * 3);
  $retention = count($customers) ? pos_growth_round(($returning / max(1, count($customers))) * 100) : 0;
  $score = pos_growth_score([
    "salesGrowth" => $salesGrowth,
    "profitGrowth" => $profitGrowth,
    "customerGrowth" => pos_growth_pct($newCust + $returning, $lastMonth["customers"] ?? $returning),
    "retention" => $retention,
    "inventoryHealth" => $inventoryHealth,
    "expenseControl" => $expenseControl,
  ]);

  $actions = [];
  if ($out) $actions[] = ["level" => "urgent", "title" => count($out) . " products out of stock", "detail" => implode(", ", array_slice(array_column($out, "name"), 0, 4)), "jump" => "purchases", "action" => "Reorder"];
  if ($low) $actions[] = ["level" => "urgent", "title" => count($low) . " low-stock items", "detail" => implode(" · ", array_slice(array_map(function ($i) { return $i["name"]; }, $low), 0, 3)), "jump" => "stock", "action" => "View stock"];
  if (pos_growth_num($snap["overdueInvoices"] ?? 0) > 0) {
    $actions[] = ["level" => "urgent", "title" => $snap["overdueInvoices"] . " overdue invoices", "detail" => "Outstanding " . pos_growth_inr($snap["outstanding"] ?? 0), "jump" => "accounts", "action" => "Collect"];
  }
  if ($monthGrowth <= -12) $actions[] = ["level" => "urgent", "title" => "Sales dropped this month", "detail" => "This month is " . abs($monthGrowth) . "% below last month.", "jump" => "reports", "action" => "View report"];
  if ($slow) $actions[] = ["level" => "attention", "title" => count($slow) . " slow-moving products", "detail" => "Clearance or a bundle can free shelf space.", "jump" => "items", "action" => "Review items"];
  if (count($inactive) >= 5) $actions[] = ["level" => "attention", "title" => count($inactive) . " customers have not purchased in 45 days", "detail" => "A re-engagement offer can lift repeat sales.", "jump" => "customers", "action" => "View customers"];
  if ($margin > 0 && $margin < 12) $actions[] = ["level" => "attention", "title" => "Gross margin is thin", "detail" => "This month's margin is {$margin}%.", "jump" => "items", "action" => "Adjust price"];
  if ($topRev && count($topRev) > 1) $actions[] = ["level" => "growth", "title" => "Create a combo offer", "detail" => "Try a " . $topRev[0]["name"] . " + " . $topRev[1]["name"] . " bundle.", "jump" => "counter", "action" => "Open counter"];
  if ($fast) $actions[] = ["level" => "growth", "title" => "Reorder fast-moving products", "detail" => implode(", ", array_slice(array_column($fast, "name"), 0, 3)), "jump" => "purchases", "action" => "Reorder"];
  if ($weakMargin) $actions[] = ["level" => "growth", "title" => "Lift profit on a top seller", "detail" => $weakMargin[0]["name"] . " margin is only " . pos_growth_round($weakMargin[0]["margin"]) . "%.", "jump" => "items", "action" => "Adjust price"];

  $recs = [];
  $recs[] = ["kind" => "sales", "title" => "Increase sales", "text" => $salesGrowth >= 0
    ? "Sales are up {$salesGrowth}% vs last week. Keep stock of " . ($topRev[0]["name"] ?? "top products") . "."
    : "This week is " . abs($salesGrowth) . "% vs last week. Run a weekend offer on " . ($topRev[0]["name"] ?? "your best seller") . "."];
  if ($weakMargin) $recs[] = ["kind" => "profit", "title" => "Increase profit", "text" => $weakMargin[0]["name"] . " has only a " . pos_growth_round($weakMargin[0]["margin"]) . "% margin. A small price adjustment could improve monthly profit."];
  if ($low || $out) $recs[] = ["kind" => "stock", "title" => "Prevent lost sales", "text" => (count($out) + count($low)) . " high-demand products may run out soon. Reorder now."];
  if ($inactive) $recs[] = ["kind" => "retention", "title" => "Customer retention", "text" => count($inactive) . " customers have not purchased in the last 45 days. Send them a re-engagement offer."];
  if ($topRev && count($topRev) > 1) $recs[] = ["kind" => "cross", "title" => "Cross-selling", "text" => "Customers purchasing " . $topRev[0]["name"] . " often also buy other fast movers. Suggest " . $topRev[1]["name"] . " during billing."];

  $promos = [];
  if ($slow) $promos[] = ["name" => "Clearance offer", "text" => "Mark " . implode(", ", array_slice(array_column($slow, "name"), 0, 3)) . " as Buy 2 Get Discount.", "expected" => "Expected: more cash from dead stock."];
  if ($topRev && count($topRev) > 1) $promos[] = ["name" => "Combo offer", "text" => "Create a " . $topRev[0]["name"] . " + " . $topRev[1]["name"] . " bundle this weekend.", "expected" => "Expected: 8–15% lift if stock holds."];
  if ($bestDay) $promos[] = ["name" => "Peak-day offer", "text" => ($bestDay["label"] ?? "Your peak day") . " is your strongest weekday.", "expected" => "Expected: higher repeat visits."];

  $reorders = [];
  foreach (array_slice(array_merge($fast, $low), 0, 8) as $p) {
    $day = max(pos_growth_num($p["qtyDay"] ?? 0), 0.2);
    $cover = pos_growth_num($p["stock"] ?? 0) / $day;
    $buy = max((int) ceil($day * 14 - pos_growth_num($p["stock"] ?? 0)), (int) ($p["reorder"] ?? 0), 1);
    $reorders[] = [
      "name" => $p["name"],
      "qtyDay" => pos_growth_round($day),
      "stock" => pos_growth_round($p["stock"] ?? 0),
      "daysLeft" => max(0, (int) round($cover)),
      "suggested" => $buy,
      "text" => $p["name"] . " is selling about " . pos_growth_round($day) . " units/day. Current stock " . pos_growth_round($p["stock"] ?? 0) . ". Estimated stock-out: " . max(0, (int) round($cover)) . " day(s). Recommended purchase: {$buy}.",
    ];
  }

  $daywise = $snap["daywise"] ?? [];
  $lastDays = array_slice($daywise, -14);
  $prevDays = array_slice($daywise, -28, 14);
  $lastAvg = $lastDays ? array_sum(array_map(function ($r) { return pos_growth_num($r["takings"] ?? 0); }, $lastDays)) / count($lastDays) : 0;
  $prevAvg = $prevDays ? array_sum(array_map(function ($r) { return pos_growth_num($r["takings"] ?? 0); }, $prevDays)) / count($prevDays) : $lastAvg;
  $trend = pos_growth_pct($lastAvg, $prevAvg);
  $tomorrow = pos_growth_round($lastAvg * (1 + max(-0.15, min(0.15, $trend / 200))));

  $why = [];
  if ($salesGrowth >= 8 && $topCat) $why[] = ($topCat["name"] ?? "One category") . " products generated the highest revenue.";
  if ($fast) $why[] = count($fast) . " fast-moving products may go out of stock within a week.";
  if ($bestHour && $quietHour && pos_growth_num($bestHour["takings"] ?? 0) > pos_growth_num($quietHour["takings"] ?? 0) * 1.2) {
    $why[] = ($bestHour["label"] ?? "Peak hours") . " sales are stronger than " . ($quietHour["label"] ?? "slower hours") . ".";
  }
  if (!$why) $why[] = "Keep billing every walk-in and restock your best sellers.";
  $summary = $salesGrowth >= 0
    ? "Your sales increased by {$salesGrowth}% this week compared with last week. " . implode(" ", $why)
    : "Your sales are " . abs($salesGrowth) . "% vs last week. " . implode(" ", $why);

  $alerts = [];
  if ($monthGrowth <= -20) $alerts[] = "Sales this month are " . abs($monthGrowth) . "% below last month.";
  $branches = $snap["branches"] ?? [];
  if (count($branches) >= 2) {
    $best = pos_growth_top($branches, "takings", 1)[0] ?? null;
    $weak = $branches;
    usort($weak, function ($a, $b) { return pos_growth_num($a["takings"] ?? 0) <=> pos_growth_num($b["takings"] ?? 0); });
    $weak = $weak[0] ?? null;
    if ($best && $weak && ($best["name"] ?? "") !== ($weak["name"] ?? "")) {
      $alerts[] = $best["name"] . " is ahead of " . $weak["name"] . ". Check stock of top products at the weaker branch.";
    }
  }

  $expansion = [];
  if ($topCat) $expansion[] = ["source" => "shop", "text" => "Your customers frequently purchase " . $topCat["name"] . " products. Consider adding related variants or a dedicated section."];
  if ($fast) $expansion[] = ["source" => "shop", "text" => "Fast-moving items can become weekly refill or subscription products if the same customers buy them often."];
  if ($vip) $expansion[] = ["source" => "shop", "text" => "High-value customers may buy larger packs or wholesale if you offer a B2B price list."];
  $expansion[] = ["source" => "shop", "text" => "QR ordering and delivery can add a sales channel without opening a second counter."];
  $market = [
    ["source" => "market", "text" => "Festival weeks in India often lift grocery and gift baskets — plan stock 10–14 days ahead. This is a general market estimate, not this shop's billed data."],
    ["source" => "market", "text" => "Nearby retailers often bundle a staple with a small treat. Treat this as an idea, not a number from your bills."],
  ];

  return [
    "summary" => $summary,
    "opportunity" => ($out || $low) ? "Improve inventory availability for your top products and reorder before they stock out." : (count($inactive) ? "Increase repeat-customer campaigns for shoppers who have gone quiet." : "Protect margin on high-volume items and keep evening hours fully staffed."),
    "score" => $score,
    "compare" => ["todayVsYesterday" => $todayGrowth, "weekVsLast" => $salesGrowth, "monthVsLast" => $monthGrowth, "yearVsLast" => $yearGrowth],
    "kpis" => [
      "todaySales" => pos_growth_round($today["takings"] ?? 0),
      "todayProfit" => pos_growth_round($today["profit"] ?? 0),
      "todayBills" => pos_growth_num($today["bills"] ?? 0),
      "avgBill" => $avgBill,
      "salesGrowth" => $salesGrowth,
      "monthGrowth" => $monthGrowth,
      "margin" => $margin,
      "newCustomers" => $newCust,
      "returningCustomers" => $returning,
      "stockValue" => pos_growth_round($snap["stockValue"] ?? 0),
      "lowStock" => count($low),
      "damaged" => pos_growth_round($snap["damageLoss"] ?? 0),
      "expenses" => pos_growth_round($month["expenses"] ?? 0),
      "outstanding" => pos_growth_round($snap["outstanding"] ?? 0),
      "score" => $score["score"],
    ],
    "products" => ["top" => $topRev, "profit" => $topProfit, "slow" => array_slice($slow, 0, 8), "dead" => [], "weakMargin" => array_slice($weakMargin, 0, 5)],
    "inventory" => ["low" => $low, "out" => $out, "over" => [], "reorders" => $reorders],
    "customers" => [
      "total" => count($customers),
      "new" => $newCust,
      "returning" => $returning,
      "inactive" => count($inactive),
      "vip" => count($vip),
      "top" => pos_growth_top($customers, "takings", 5),
      "segments" => $snap["segments"] ?? [],
    ],
    "charts" => ["daywise" => $snap["daywise"] ?? [], "hourwise" => $hourwise, "weekday" => $weekday, "categories" => $snap["categories"] ?? []],
    "forecast" => ["tomorrow" => $tomorrow, "next7" => pos_growth_round($tomorrow * 7), "next30" => pos_growth_round($tomorrow * 30), "trend" => $trend],
    "actions" => $actions,
    "recommendations" => $recs,
    "promotions" => $promos,
    "alerts" => $alerts,
    "branches" => $branches,
    "discount" => [
      "amount" => pos_growth_round($month["discount"] ?? 0),
      "note" => pos_growth_num($month["discount"] ?? 0) > 0
        ? "Discounts this month: " . pos_growth_inr($month["discount"]) . "."
        : "No large discounts recorded this month.",
    ],
    "expansion" => $expansion,
    "market" => $market,
    "askExamples" => [
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
  ];
}

function pos_growth_ask($question, $analysis) {
  $q = strtolower((string) $question);
  $a = $analysis ?: [];
  if (preg_match("/why.*drop|sales drop|decreased|down/", $q)) return $a["alerts"][0] ?? ($a["summary"] ?? "");
  if (preg_match("/profit|margin/", $q) && preg_match("/product|item/", $q)) {
    $p = $a["products"]["profit"][0] ?? null;
    return $p ? $p["name"] . " is among your most profitable lines (" . pos_growth_inr($p["profit"]) . ")." : "Profit by product needs more billed sales with cost recorded.";
  }
  if (preg_match("/reorder|buy this week|out of stock|stock/", $q)) {
    $r = $a["inventory"]["reorders"][0] ?? null;
    return $r ? $r["text"] : "Stock looks comfortable on tracked items.";
  }
  if (preg_match("/promote|offer|today/", $q)) return $a["promotions"][0]["text"] ?? ($a["recommendations"][0]["text"] ?? ($a["summary"] ?? ""));
  if (preg_match("/increase.*profit|how.*profit/", $q)) {
    foreach ($a["recommendations"] ?? [] as $r) if (($r["kind"] ?? "") === "profit") return $r["text"];
    return $a["opportunity"] ?? "";
  }
  if (preg_match("/customer|target|repeat|inactive/", $q)) {
    return ($a["customers"]["inactive"] ?? 0) . " inactive customers and " . ($a["customers"]["vip"] ?? 0) . " high-value customers.";
  }
  if (preg_match("/slow|stop selling|dead/", $q)) {
    $s = $a["products"]["slow"][0] ?? null;
    return $s ? $s["name"] . " is slow or idle. Consider a clearance offer." : "No clear dead stock from this period.";
  }
  if (preg_match("/forecast|tomorrow|next/", $q)) {
    return "If the recent trend holds, tomorrow is about " . pos_growth_inr($a["forecast"]["tomorrow"] ?? 0) . ". This is a shop-data estimate, not an external market forecast.";
  }
  return $a["summary"] ?? "Open AI Growth after you have sales on this shop.";
}

function pos_growth_period($bid, $from, $to) {
  $row = pos_q("SELECT COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings, COALESCE(SUM(gst),0) AS gst, COALESCE(SUM(discount),0) AS discount FROM sales_orders WHERE business_id = ? AND DATE(created_at) BETWEEN ? AND ?", "sss", [$bid, $from, $to]);
  $p = pos_q("SELECT COALESCE(SUM(COALESCE(l.profit, l.amount - COALESCE(l.cost,0))),0) AS profit FROM sales_order_lines l JOIN sales_orders o ON o.id = l.order_id WHERE o.business_id = ? AND DATE(o.created_at) BETWEEN ? AND ? AND l.cancelled = 0", "sss", [$bid, $from, $to]);
  return [
    "bills" => pos_growth_num($row[0]["bills"] ?? 0),
    "takings" => pos_growth_num($row[0]["takings"] ?? 0),
    "gst" => pos_growth_num($row[0]["gst"] ?? 0),
    "discount" => pos_growth_num($row[0]["discount"] ?? 0),
    "profit" => pos_growth_round($p[0]["profit"] ?? 0),
  ];
}

function pos_growth_segment($bills, $takings, $days) {
  if ($days >= 45 && $bills > 0) return "Inactive";
  if ($days >= 30 && $bills > 0) return "At-Risk";
  if ($bills <= 1 && $days <= 30) return "New";
  if ($takings >= 25000 || $bills >= 12) return "VIP";
  if ($takings >= 8000 || $bills >= 6) return "High Value";
  if ($bills >= 3) return "Regular";
  return "Occasional";
}

function pos_build_growth($bid) {
  $today = date("Y-m-d");
  $yesterday = pos_ymd_add($today, -1);
  $weekStart = pos_ymd_add($today, -6);
  $lastWeekStart = pos_ymd_add($today, -13);
  $lastWeekEnd = pos_ymd_add($today, -7);
  $monthStart = date("Y-m-01");
  $prevMonthEnd = pos_ymd_add($monthStart, -1);
  $prevMonthStart = date("Y-m-01", strtotime($prevMonthEnd));
  $yearStart = date("Y-01-01");
  $lastYearStart = (date("Y") - 1) . "-01-01";
  $lastYearEnd = (date("Y") - 1) . "-12-31";
  $last30 = pos_ymd_add($today, -29);
  $last90 = pos_ymd_add($today, -89);

  $thisToday = pos_growth_period($bid, $today, $today);
  $thisYest = pos_growth_period($bid, $yesterday, $yesterday);
  $thisWeek = pos_growth_period($bid, $weekStart, $today);
  $lastWeek = pos_growth_period($bid, $lastWeekStart, $lastWeekEnd);
  $thisMonth = pos_growth_period($bid, $monthStart, $today);
  $lastMonth = pos_growth_period($bid, $prevMonthStart, $prevMonthEnd);
  $thisYear = pos_growth_period($bid, $yearStart, $today);
  $lastYear = pos_growth_period($bid, $lastYearStart, $lastYearEnd);

  $daywise = [];
  foreach (pos_q("SELECT DATE(created_at) AS day, COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings FROM sales_orders WHERE business_id = ? AND DATE(created_at) BETWEEN ? AND ? GROUP BY DATE(created_at) ORDER BY day", "sss", [$bid, $last30, $today]) as $r) {
    $daywise[] = ["label" => substr($r["day"], 0, 10), "bills" => pos_growth_num($r["bills"]), "takings" => pos_growth_num($r["takings"])];
  }
  $hourwise = [];
  foreach (pos_q("SELECT HOUR(created_at) AS hour, COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings FROM sales_orders WHERE business_id = ? AND DATE(created_at) BETWEEN ? AND ? GROUP BY HOUR(created_at) ORDER BY hour", "sss", [$bid, $last30, $today]) as $r) {
    $hourwise[] = ["label" => str_pad((string) (int) $r["hour"], 2, "0", STR_PAD_LEFT) . ":00", "hour" => (int) $r["hour"], "bills" => pos_growth_num($r["bills"]), "takings" => pos_growth_num($r["takings"])];
  }
  $names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  $weekday = [];
  foreach (pos_q("SELECT DAYOFWEEK(created_at) AS dow, COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings FROM sales_orders WHERE business_id = ? AND DATE(created_at) BETWEEN ? AND ? GROUP BY DAYOFWEEK(created_at) ORDER BY dow", "sss", [$bid, $last90, $today]) as $r) {
    $weekday[] = ["label" => $names[max(0, ((int) $r["dow"]) - 1)] ?? "—", "bills" => pos_growth_num($r["bills"]), "takings" => pos_growth_num($r["takings"])];
  }

  $daysInMonth = max(1, (int) date("j"));
  $products = [];
  foreach (pos_q(
    "SELECT l.item_name AS name, COALESCE(MAX(i.category),'') AS category, COALESCE(MAX(i.stock_gm),0) AS stock_gm, COALESCE(MAX(i.reorder_level_gm),0) AS reorder_gm, SUM(l.quantity_gm) AS qty, SUM(l.amount) AS amount, SUM(COALESCE(l.profit, l.amount - COALESCE(l.cost,0))) AS profit FROM sales_order_lines l JOIN sales_orders o ON o.id = l.order_id LEFT JOIN items i ON i.id = l.item_id WHERE o.business_id = ? AND DATE(o.created_at) BETWEEN ? AND ? AND l.cancelled = 0 GROUP BY l.item_name ORDER BY amount DESC",
    "sss",
    [$bid, $monthStart, $today]
  ) as $p) {
    $qty = pos_growth_num($p["qty"]);
    $stock = pos_growth_num($p["stock_gm"]);
    $units = ($stock > 200) ? $stock / 1000 : $stock;
    $qtyU = ($qty > 200) ? $qty / 1000 : $qty;
    $day = $qtyU / $daysInMonth;
    $products[] = [
      "name" => $p["name"],
      "category" => $p["category"] ?: "General",
      "amount" => pos_growth_num($p["amount"]),
      "profit" => pos_growth_num($p["profit"]),
      "margin" => pos_growth_num($p["amount"]) ? pos_growth_round((pos_growth_num($p["profit"]) / pos_growth_num($p["amount"])) * 100) : 0,
      "qty" => $qtyU,
      "qtyDay" => pos_growth_round($day),
      "stock" => $units,
      "reorder" => pos_growth_num($p["reorder_gm"]) > 200 ? pos_growth_num($p["reorder_gm"]) / 1000 : pos_growth_num($p["reorder_gm"]),
      "daysLeft" => $day > 0 ? pos_growth_round($units / $day) : 99,
      "growth" => 0,
    ];
  }
  $sold = [];
  foreach ($products as $p) $sold[$p["name"]] = $p;
  $stock = [];
  foreach (pos_q("SELECT name, category, stock_gm, reorder_level_gm FROM items WHERE business_id = ? AND (status IS NULL OR status <> 'inactive') ORDER BY name", "s", [$bid]) as $i) {
    $s = $sold[$i["name"]] ?? [];
    $units = pos_growth_num($i["stock_gm"]) > 200 ? pos_growth_num($i["stock_gm"]) / 1000 : pos_growth_num($i["stock_gm"]);
    $day = pos_growth_num($s["qtyDay"] ?? 0.15);
    $stock[] = array_merge($s, [
      "name" => $i["name"],
      "category" => $i["category"] ?: "General",
      "stock" => $units,
      "reorder" => pos_growth_num($i["reorder_level_gm"]) > 200 ? pos_growth_num($i["reorder_level_gm"]) / 1000 : pos_growth_num($i["reorder_level_gm"]),
      "daysLeft" => $day > 0 ? $units / $day : 99,
      "qtyDay" => $day,
    ]);
  }
  $val = pos_q("SELECT COALESCE(SUM(CASE WHEN stock_gm > 200 THEN stock_gm/1000.0 * purchase_rate ELSE stock_gm * purchase_rate END),0) AS value FROM items WHERE business_id = ?", "s", [$bid]);
  $out = pos_q("SELECT COALESCE(SUM(outstanding),0) AS outstanding FROM customers WHERE business_id = ?", "s", [$bid]);
  $exp = pos_q("SELECT COALESCE(SUM(amount + COALESCE(gst,0)),0) AS total FROM expenses WHERE business_id = ? AND expense_date BETWEEN ? AND ?", "sss", [$bid, $monthStart, $today]);
  $damage = 0;
  try {
    $d = pos_q("SELECT COALESCE(SUM(loss_amount),0) AS loss FROM damage_records WHERE business_id = ? AND DATE(created_at) BETWEEN ? AND ?", "sss", [$bid, $monthStart, $today]);
    $damage = pos_growth_num($d[0]["loss"] ?? 0);
  } catch (Throwable $e) { $damage = 0; }

  $customers = [];
  foreach (pos_q(
    "SELECT c.name, c.mobile, c.outstanding, COUNT(o.id) AS bills, COALESCE(SUM(o.total),0) AS takings, MAX(o.created_at) AS last_sale FROM customers c LEFT JOIN sales_orders o ON o.customer_id = c.id AND o.business_id = c.business_id AND DATE(o.created_at) BETWEEN ? AND ? WHERE c.business_id = ? GROUP BY c.id, c.name, c.mobile, c.outstanding ORDER BY takings DESC",
    "sss",
    [$last90, $today, $bid]
  ) as $c) {
    $last = $c["last_sale"] ? substr($c["last_sale"], 0, 10) : "";
    $days = $last ? (int) round((strtotime($today) - strtotime($last)) / 86400) : 90;
    $seg = pos_growth_segment(pos_growth_num($c["bills"]), pos_growth_num($c["takings"]), $days);
    $customers[] = ["name" => $c["name"], "mobile" => $c["mobile"], "bills" => pos_growth_num($c["bills"]), "takings" => pos_growth_num($c["takings"]), "outstanding" => pos_growth_num($c["outstanding"]), "daysSince" => $days, "segment" => $seg];
  }
  $segNames = ["VIP", "High Value", "Regular", "New", "Occasional", "At-Risk", "Inactive"];
  $segments = [];
  foreach ($segNames as $name) $segments[] = ["name" => $name, "count" => count(array_filter($customers, function ($c) use ($name) { return ($c["segment"] ?? "") === $name; }))];
  $newN = count(array_filter($customers, function ($c) { return ($c["segment"] ?? "") === "New"; }));
  try {
    $nr = pos_q("SELECT COUNT(*) AS n FROM customers WHERE business_id = ? AND DATE(created_at) BETWEEN ? AND ?", "sss", [$bid, $monthStart, $today]);
    if ($nr) $newN = (int) ($nr[0]["n"] ?? $newN);
  } catch (Throwable $e) {}
  $returning = count(array_filter($customers, function ($c) { return pos_growth_num($c["bills"]) >= 2; }));
  $overdue = 0;
  try {
    $ov = pos_q("SELECT COUNT(*) AS n FROM sales_orders WHERE business_id = ? AND LOWER(COALESCE(payment_status,'')) IN ('unpaid','partial','credit') AND DATE(created_at) < ?", "ss", [$bid, pos_ymd_add($today, -7)]);
    $overdue = (int) ($ov[0]["n"] ?? 0);
  } catch (Throwable $e) {}

  $catMap = [];
  foreach ($products as $p) {
    $k = $p["category"] ?: "General";
    $catMap[$k] = ($catMap[$k] ?? 0) + $p["amount"];
  }
  $categories = [];
  foreach ($catMap as $name => $amount) $categories[] = ["name" => $name, "amount" => $amount];
  usort($categories, function ($a, $b) { return $b["amount"] <=> $a["amount"]; });
  $branches = [];
  try {
    foreach (pos_q("SELECT COALESCE(b.name,'Main') AS name, COUNT(o.id) AS bills, COALESCE(SUM(o.total),0) AS takings FROM sales_orders o LEFT JOIN branches b ON b.id = o.branch_id WHERE o.business_id = ? AND DATE(o.created_at) BETWEEN ? AND ? GROUP BY COALESCE(b.name,'Main') ORDER BY takings DESC", "sss", [$bid, $monthStart, $today]) as $b) {
      $branches[] = ["name" => $b["name"], "bills" => pos_growth_num($b["bills"]), "takings" => pos_growth_num($b["takings"])];
    }
  } catch (Throwable $e) {}

  $thisMonth["expenses"] = pos_growth_num($exp[0]["total"] ?? 0);
  $lastMonth["customers"] = count($customers);
  $snap = [
    "today" => $thisToday,
    "yesterday" => $thisYest,
    "thisWeek" => $thisWeek,
    "lastWeek" => $lastWeek,
    "thisMonth" => $thisMonth,
    "lastMonth" => $lastMonth,
    "thisYear" => $thisYear,
    "lastYear" => $lastYear,
    "daywise" => $daywise,
    "hourwise" => $hourwise,
    "weekday" => $weekday,
    "products" => $products,
    "stock" => $stock,
    "stockValue" => pos_growth_num($val[0]["value"] ?? 0),
    "outstanding" => pos_growth_num($out[0]["outstanding"] ?? 0),
    "damageLoss" => $damage,
    "customers" => $customers,
    "segments" => $segments,
    "newCustomers" => $newN,
    "returningCustomers" => $returning,
    "overdueInvoices" => $overdue,
    "categories" => $categories,
    "branches" => $branches,
  ];
  $analysis = pos_analyze_growth($snap);
  $analysis["range"] = ["today" => $today, "monthStart" => $monthStart, "weekStart" => $weekStart];
  $analysis["source"] = "shop";
  return $analysis;
}

function pos_growth_to_sheets($a) {
  $k = $a["kpis"] ?? [];
  $rows = function ($list, $fn) {
    $out = [];
    foreach ($list ?: [] as $row) $out[] = $fn($row);
    return $out;
  };
  return [
    [
      "name" => "Summary",
      "headers" => ["Metric", "Value"],
      "rows" => [
        ["AI summary", $a["summary"] ?? ""],
        ["Growth opportunity", $a["opportunity"] ?? ""],
        ["Business growth score", $k["score"] ?? 0],
        ["Today sales", $k["todaySales"] ?? 0],
        ["Today profit", $k["todayProfit"] ?? 0],
        ["Today bills", $k["todayBills"] ?? 0],
        ["Average bill", $k["avgBill"] ?? 0],
        ["Sales growth % (week)", $k["salesGrowth"] ?? 0],
        ["Gross margin %", $k["margin"] ?? 0],
        ["Stock value", $k["stockValue"] ?? 0],
        ["Outstanding", $k["outstanding"] ?? 0],
        ["Discount note", $a["discount"]["note"] ?? ""],
      ],
    ],
    [
      "name" => "Top products",
      "headers" => ["Name", "Revenue", "Profit", "Margin %"],
      "rows" => $rows($a["products"]["top"] ?? [], function ($p) {
        return [$p["name"] ?? "", pos_growth_num($p["amount"] ?? 0), pos_growth_num($p["profit"] ?? 0), pos_growth_num($p["margin"] ?? 0)];
      }),
    ],
    [
      "name" => "Reorders",
      "headers" => ["Name", "Qty / day", "Stock", "Days left", "Suggested buy", "Note"],
      "rows" => $rows($a["inventory"]["reorders"] ?? [], function ($p) {
        return [$p["name"] ?? "", pos_growth_num($p["qtyDay"] ?? 0), pos_growth_num($p["stock"] ?? 0), pos_growth_num($p["daysLeft"] ?? 0), pos_growth_num($p["suggested"] ?? 0), $p["text"] ?? ""];
      }),
    ],
    [
      "name" => "Actions",
      "headers" => ["Level", "Title", "Detail"],
      "rows" => $rows($a["actions"] ?? [], function ($x) {
        return [$x["level"] ?? "", $x["title"] ?? "", $x["detail"] ?? ""];
      }),
    ],
    [
      "name" => "Recommendations",
      "headers" => ["Kind", "Title", "Text"],
      "rows" => $rows($a["recommendations"] ?? [], function ($x) {
        return [$x["kind"] ?? "", $x["title"] ?? "", $x["text"] ?? ""];
      }),
    ],
  ];
}

function pos_growth_excel_response($bid) {
  require_once __DIR__ . "/pos-reports.php";
  $data = pos_build_growth($bid);
  $xml = pos_workbook_xml(pos_growth_to_sheets($data));
  http_response_code(200);
  header("Content-Type: application/vnd.ms-excel; charset=utf-8");
  header("Content-Disposition: attachment; filename=\"ai-growth-" . date("Y-m-d") . ".xls\"");
  echo $xml;
  exit;
}
