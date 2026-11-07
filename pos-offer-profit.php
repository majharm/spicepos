<?php
/** Offer-wise sales and sales-wise profit for the PHP host when Node does not answer. */

function pos_op_round($n) {
  $v = (float) $n;
  if (!is_finite($v)) return 0.0;
  return round($v, 2);
}

function pos_op_try($sql, $types, $params) {
  try {
    return pos_q($sql, $types, $params);
  } catch (Exception $e) {
    return null;
  }
}

function pos_op_rows($attempts) {
  foreach ($attempts as $attempt) {
    $rows = pos_op_try($attempt[0], $attempt[1], $attempt[2]);
    if (is_array($rows)) return $rows;
  }
  return [];
}

function pos_op_allocate($total, $weights) {
  $amount = pos_op_round($total);
  $out = array_fill(0, count($weights), 0.0);
  $sum = 0.0;
  foreach ($weights as $w) $sum += max(0, (float) $w);
  if (!($amount > 0) || !($sum > 0) || !$out) return $out;
  $used = 0.0;
  $last = count($out) - 1;
  foreach ($weights as $i => $w) {
    $share = $i === $last ? pos_op_round($amount - $used) : pos_op_round(($amount * max(0, (float) $w)) / $sum);
    $out[$i] = $share;
    $used = pos_op_round($used + $share);
  }
  return $out;
}

function pos_op_code($offer) {
  $cond = null;
  if (!empty($offer["conditions_json"])) {
    $parsed = json_decode((string) $offer["conditions_json"], true);
    if (is_array($parsed)) $cond = $parsed;
  }
  $explicit = strtoupper(trim((string) ($offer["code"] ?? $offer["offer_code"] ?? ($cond["code"] ?? ""))));
  if ($explicit !== "") return substr($explicit, 0, 32);
  $name = strtoupper((string) preg_replace("/[^A-Z0-9]+/", "", strtoupper((string) ($offer["name"] ?? ""))));
  if ($name !== "") return substr($name, 0, 12);
  return "OFFER";
}

function pos_op_margin($net, $sales) {
  return $sales != 0.0 ? pos_op_round(($net / $sales) * 100) : 0.0;
}

function pos_op_blank() {
  return [
    "bills" => 0, "qty" => 0, "discount" => 0, "loyalty" => 0, "gst" => 0,
    "netSales" => 0, "grossProfit" => 0, "netProfit" => 0, "totalSales" => 0,
    "purchaseCost" => 0,
  ];
}

function pos_op_add(&$tot, $fig) {
  $tot["bills"] += 1;
  foreach (["qty", "discount", "loyalty", "gst", "netSales", "grossProfit", "netProfit", "totalSales", "purchaseCost"] as $key) {
    $tot[$key] = pos_op_round($tot[$key] + (float) ($fig[$key] ?? 0));
  }
}

function pos_op_where($businessId, $branchId) {
  $sql = pos_sale_not_void("o") . " AND " . pos_created_between("o");
  $types = "ss";
  $params = [];
  if ($businessId !== "") {
    $sql = "o.business_id = ? AND " . $sql;
    $types = "s" . $types;
    $params[] = $businessId;
  }
  if ($branchId !== "") {
    $sql .= " AND o.branch_id = ?";
    $types .= "s";
  }
  return [$sql, $types, $params, $branchId];
}

function pos_op_locked_role($role) {
  return in_array(strtolower(str_replace(" ", "_", trim((string) $role))), [
    "branch_manager", "cashier", "captain", "kitchen", "bartender", "receptionist",
    "reservation_executive", "housekeeping", "maintenance", "restaurant_staff", "stock_manager", "staff",
  ], true);
}

function pos_build_offer_profit($scope, $query) {
  $today = function_exists("pos_shop_today") ? pos_shop_today() : date("Y-m-d");
  $preset = strtolower((string) ($query["preset"] ?? ""));
  $from = substr((string) ($query["from"] ?? ""), 0, 10);
  $to = substr((string) ($query["to"] ?? ""), 0, 10);
  if ($preset !== "" && $preset !== "custom") {
    $day = preg_match("/^\d{4}-\d{2}-\d{2}$/", (string) ($query["today"] ?? "")) ? $query["today"] : $today;
    if ($preset === "today") { $from = $to = $day; }
    elseif ($preset === "yesterday") { $from = $to = date("Y-m-d", strtotime($day . " -1 day")); }
    elseif ($preset === "week") {
      $dow = (int) date("w", strtotime($day));
      $delta = $dow === 0 ? 6 : $dow - 1;
      $from = date("Y-m-d", strtotime($day . " -" . $delta . " day"));
      $to = $day;
    } elseif ($preset === "month") {
      $from = substr($day, 0, 8) . "01";
      $to = $day;
    }
  }
  if (!preg_match("/^\d{4}-\d{2}-\d{2}$/", $from)) $from = substr($today, 0, 8) . "01";
  if (!preg_match("/^\d{4}-\d{2}-\d{2}$/", $to)) $to = $today;
  if ($from > $to) { $swap = $from; $from = $to; $to = $swap; }

  $businessId = (string) ($scope["businessId"] ?? "");
  $branchId = (string) ($scope["branchId"] ?? "");
  [$where, $types, $prefix, $branchUsed] = pos_op_where($businessId, $branchId);
  $params = $prefix;
  $params[] = $from;
  $params[] = $to;
  if ($branchUsed !== "") $params[] = $branchUsed;
  $bind = $types;
  if ($branchUsed !== "") {
    /* types already include the branch placeholder */
  }

  $orders = pos_op_rows([
    [
      "SELECT o.id, o.order_number, o.business_id, o.branch_id, o.status, o.created_at,
              o.subtotal, o.discount, o.loyalty_discount, o.gst, o.total, o.extra_charges,
              b.name AS business_name, br.name AS branch_name
       FROM sales_orders o
       LEFT JOIN businesses b ON b.id = o.business_id
       LEFT JOIN branches br ON br.id = o.branch_id
       WHERE $where ORDER BY o.created_at",
      $bind, $params,
    ],
    [
      "SELECT o.id, o.order_number, o.business_id, o.status, o.created_at,
              o.subtotal, o.discount, o.gst, o.total, b.name AS business_name
       FROM sales_orders o
       LEFT JOIN businesses b ON b.id = o.business_id
       WHERE $where ORDER BY o.created_at",
      $bind, $params,
    ],
  ]);
  $lines = pos_op_rows([
    [
      "SELECT l.order_id, l.item_name, l.quantity_gm, l.amount, l.discount, l.cost, l.gst_rate, l.cancelled,
              COALESCE(NULLIF(TRIM(i.category), ''), 'Uncategorised') AS category
       FROM sales_order_lines l
       JOIN sales_orders o ON o.id = l.order_id
       LEFT JOIN items i ON i.id = l.item_id
       WHERE $where AND COALESCE(l.cancelled, 0) = 0",
      $bind, $params,
    ],
    [
      "SELECT l.order_id, l.item_name, l.quantity_gm, l.amount, l.gst_rate
       FROM sales_order_lines l
       JOIN sales_orders o ON o.id = l.order_id
       WHERE $where",
      $bind, $params,
    ],
  ]);

  $byOrder = [];
  foreach ($lines as $line) {
    $id = (string) ($line["order_id"] ?? "");
    if ($id === "" || (int) ($line["cancelled"] ?? 0) === 1) continue;
    $byOrder[$id][] = $line;
  }
  $offerById = [];
  $offerSql = "SELECT id, business_id, name, conditions_json FROM promo_offers";
  $offerParams = [];
  $offerTypes = "";
  if ($businessId !== "") {
    $offerSql .= " WHERE business_id = ?";
    $offerTypes = "s";
    $offerParams[] = $businessId;
  }
  foreach (pos_op_try($offerSql, $offerTypes, $offerParams) ?: [] as $offer) {
    $offer["code"] = pos_op_code($offer);
    $offerById[(string) $offer["id"]] = $offer;
  }
  $redemptions = [];
  $ids = [];
  foreach ($orders as $order) $ids[] = (string) ($order["id"] ?? "");
  $ids = array_values(array_filter($ids));
  for ($i = 0; $i < count($ids); $i += 400) {
    $chunk = array_slice($ids, $i, 400);
    $marks = implode(",", array_fill(0, count($chunk), "?"));
    $got = pos_op_try(
      "SELECT offer_id, order_id, discount_amount FROM promo_offer_redemptions WHERE order_id IN ($marks)",
      str_repeat("s", count($chunk)),
      $chunk
    );
    if ($got) $redemptions = array_merge($redemptions, $got);
  }
  $linksByOrder = [];
  foreach ($redemptions as $row) {
    $oid = (string) ($row["order_id"] ?? "");
    $fid = (string) ($row["offer_id"] ?? "");
    if ($oid === "" || $fid === "") continue;
    $linksByOrder[$oid][$fid] = $offerById[$fid] ?? ["id" => $fid, "name" => "Offer", "code" => pos_op_code(["id" => $fid, "name" => "Offer"])];
  }

  $wantOffer = strtolower(trim((string) ($query["offer"] ?? "")));
  $wantProduct = strtolower(trim((string) ($query["product"] ?? "")));
  $wantCategory = strtolower(trim((string) ($query["category"] ?? "")));
  $expenses = 0.0;
  if ($branchId === "") {
    $expSql = "SELECT COALESCE(SUM(amount),0) AS amount FROM expenses WHERE expense_date >= ? AND expense_date < DATE_ADD(?, INTERVAL 1 DAY)";
    $expTypes = "ss";
    $expParams = [$from, $to];
    if ($businessId !== "") {
      $expSql = "SELECT COALESCE(SUM(amount),0) AS amount FROM expenses WHERE business_id = ? AND expense_date >= ? AND expense_date < DATE_ADD(?, INTERVAL 1 DAY)";
      $expTypes = "sss";
      $expParams = [$businessId, $from, $to];
    }
    $exp = pos_op_try($expSql, $expTypes, $expParams);
    $expenses = pos_op_round($exp[0]["amount"] ?? 0);
  }

  $kept = [];
  foreach ($orders as $order) {
    $status = strtolower((string) ($order["status"] ?? ""));
    if ($status === "cancelled" || $status === "void") continue;
    $id = (string) ($order["id"] ?? "");
    if ($id === "") continue;
    $source = $byOrder[$id] ?? [[
      "item_name" => "Bill",
      "category" => "Uncategorised",
      "quantity_gm" => 0,
      "amount" => $order["subtotal"] ?? 0,
      "discount" => 0,
      "cost" => 0,
      "gst_rate" => 0,
    ]];
    $weights = [];
    foreach ($source as $line) $weights[] = max(0, (float) ($line["amount"] ?? 0));
    $billShares = pos_op_allocate($order["discount"] ?? 0, $weights);
    $loyaltyShares = pos_op_allocate($order["loyalty_discount"] ?? 0, $weights);
    $rawGst = [];
    foreach ($source as $line) $rawGst[] = pos_op_round(((float) ($line["amount"] ?? 0) * (float) ($line["gst_rate"] ?? 0)) / 100);
    $rawSum = 0.0;
    foreach ($rawGst as $g) $rawSum += $g;
    $orderGst = (float) ($order["gst"] ?? 0);
    $gstShares = $orderGst > 0 && $rawSum > 0 ? pos_op_allocate($orderGst, $rawGst) : ($orderGst > 0 ? pos_op_allocate($orderGst, $weights) : $rawGst);
    $rows = [];
    foreach ($source as $i => $line) {
      $product = (string) ($line["item_name"] ?? "Item");
      $category = trim((string) ($line["category"] ?? "")) ?: "Uncategorised";
      if ($wantProduct !== "" && strpos(strtolower($product), $wantProduct) === false) continue;
      if ($wantCategory !== "" && strpos(strtolower($category), $wantCategory) === false) continue;
      $selling = pos_op_round((float) ($line["amount"] ?? 0) + (float) ($line["discount"] ?? 0));
      $cost = pos_op_round($line["cost"] ?? 0);
      $discount = pos_op_round((float) ($line["discount"] ?? 0) + (float) ($billShares[$i] ?? 0));
      $loyalty = pos_op_round($loyaltyShares[$i] ?? 0);
      $gst = pos_op_round($gstShares[$i] ?? 0);
      $gross = pos_op_round($selling - $cost);
      $netSales = pos_op_round($selling - $discount - $loyalty);
      $net = pos_op_round($selling - $cost - $discount - $loyalty);
      $rows[] = [
        "invoice" => (string) ($order["order_number"] ?? ""),
        "date" => substr((string) ($order["created_at"] ?? ""), 0, 10),
        "businessName" => (string) ($order["business_name"] ?? "Business"),
        "branchName" => (string) ($order["branch_name"] ?? ""),
        "product" => $product,
        "category" => $category,
        "qty" => pos_op_round($line["quantity_gm"] ?? 0),
        "purchaseCost" => $cost,
        "sellingPrice" => $selling,
        "discount" => $discount,
        "loyalty" => $loyalty,
        "gst" => $gst,
        "totalSales" => pos_op_round($netSales + $gst),
        "grossProfit" => $gross,
        "netProfit" => $net,
        "margin" => pos_op_margin($net, $netSales),
      ];
    }
    if (($wantProduct !== "" || $wantCategory !== "") && !$rows) continue;
    $links = array_values($linksByOrder[$id] ?? []);
    if (!$links) {
      $disc = 0.0;
      foreach ($rows as $row) $disc += (float) $row["discount"] + (float) $row["loyalty"];
      if ($disc > 0 || (float) ($order["discount"] ?? 0) > 0 || (float) ($order["loyalty_discount"] ?? 0) > 0) {
        $links[] = ["id" => "manual", "name" => "Manual discount", "code" => "MANUAL"];
      }
    }
    if ($wantOffer !== "") {
      $links = array_values(array_filter($links, function ($link) use ($wantOffer) {
        $id = strtolower((string) ($link["id"] ?? ""));
        $code = strtolower((string) ($link["code"] ?? ""));
        $name = strtolower((string) ($link["name"] ?? ""));
        return $id === $wantOffer || $code === $wantOffer || strpos($name, $wantOffer) !== false;
      }));
      if (!$links) continue;
    }
    $fig = pos_op_blank();
    foreach ($rows as $row) {
      $fig["qty"] = pos_op_round($fig["qty"] + $row["qty"]);
      foreach (["discount", "loyalty", "gst", "grossProfit", "netProfit", "totalSales", "purchaseCost"] as $key) {
        $fig[$key] = pos_op_round($fig[$key] + $row[$key]);
      }
      $fig["netSales"] = pos_op_round($fig["netSales"] + ($row["sellingPrice"] - $row["discount"] - $row["loyalty"]));
    }
    $extra = (float) ($order["extra_charges"] ?? 0);
    if (!$wantProduct && !$wantCategory) {
      $fig["netSales"] = pos_op_round($fig["netSales"] + $extra);
      $fig["netProfit"] = pos_op_round($fig["netProfit"] + $extra);
      $fig["totalSales"] = pos_op_round(((float) ($order["total"] ?? 0)) ?: ($fig["totalSales"] + $extra));
      $fig["gst"] = pos_op_round((float) ($order["gst"] ?? $fig["gst"]));
    }
    $kept[] = ["order" => $order, "rows" => $rows, "figures" => $fig, "links" => $links];
  }

  $totals = pos_op_blank();
  $offerMap = [];
  $dayMap = [];
  $monthMap = [];
  $bizMap = [];
  foreach ($kept as $entry) {
    pos_op_add($totals, $entry["figures"]);
    $bizName = (string) ($entry["order"]["business_name"] ?? "Business");
    $bizKey = (string) ($entry["order"]["business_id"] ?? $bizName);
    if (!isset($bizMap[$bizKey])) $bizMap[$bizKey] = array_merge(["name" => $bizName], pos_op_blank());
    pos_op_add($bizMap[$bizKey], $entry["figures"]);
    foreach ($entry["links"] as $link) {
      $key = (string) ($link["id"] ?? $link["code"]);
      if (!isset($offerMap[$key])) $offerMap[$key] = array_merge(["id" => $link["id"], "name" => $link["name"], "code" => $link["code"]], pos_op_blank());
      pos_op_add($offerMap[$key], $entry["figures"]);
      $day = $entry["rows"][0]["date"] ?? substr((string) ($entry["order"]["created_at"] ?? ""), 0, 10);
      if ($day !== "") {
        $dk = $key . "|" . $day;
        if (!isset($dayMap[$dk])) $dayMap[$dk] = array_merge(["name" => $link["name"], "code" => $link["code"], "day" => $day], pos_op_blank());
        pos_op_add($dayMap[$dk], $entry["figures"]);
        $month = substr($day, 0, 7);
        $mk = $key . "|" . $month;
        if (!isset($monthMap[$mk])) $monthMap[$mk] = array_merge(["name" => $link["name"], "code" => $link["code"], "month" => $month], pos_op_blank());
        pos_op_add($monthMap[$mk], $entry["figures"]);
      }
    }
  }
  $finish = function ($row) {
    $row["margin"] = pos_op_margin($row["netProfit"], $row["netSales"]);
    return $row;
  };
  $offers = array_map($finish, array_values($offerMap));
  usort($offers, function ($a, $b) { return $b["totalSales"] <=> $a["totalSales"]; });
  $days = array_map($finish, array_values($dayMap));
  usort($days, function ($a, $b) { return strcmp($a["day"], $b["day"]); });
  $months = array_map($finish, array_values($monthMap));
  usort($months, function ($a, $b) { return strcmp($a["month"], $b["month"]); });
  $businesses = array_map($finish, array_values($bizMap));
  usort($businesses, function ($a, $b) { return $b["totalSales"] <=> $a["totalSales"]; });
  $profitLines = [];
  foreach ($kept as $entry) {
    $names = array_map(function ($link) { return $link["name"]; }, $entry["links"]);
    $codes = array_map(function ($link) { return $link["code"]; }, $entry["links"]);
    foreach ($entry["rows"] as $row) {
      $row["offerName"] = implode(", ", $names);
      $row["offerCode"] = implode(", ", $codes);
      $profitLines[] = $row;
    }
  }
  $netProfit = pos_op_round($totals["netProfit"] - $expenses);
  $offerSales = 0.0;
  foreach ($kept as $entry) {
    if ($entry["links"]) $offerSales += (float) $entry["figures"]["totalSales"];
  }
  $catalog = [];
  foreach ($offerById as $offer) $catalog[] = ["id" => $offer["id"], "code" => $offer["code"], "name" => $offer["name"]];
  $branchRows = [];
  if ($businessId !== "") {
    $branchRows = pos_op_try("SELECT id, name, business_id FROM branches WHERE business_id = ? ORDER BY name", "s", [$businessId]) ?: [];
  }
  return [
    "from" => $from,
    "to" => $to,
    "preset" => $preset !== "" && $preset !== "custom" ? $preset : "custom",
    "scope" => [
      "master" => !empty($scope["master"]),
      "businessId" => $businessId !== "" ? $businessId : null,
      "branchId" => $branchId !== "" ? $branchId : null,
      "locked" => !empty($scope["locked"]),
      "allBusinesses" => !empty($scope["allBusinesses"]),
    ],
    "dashboard" => [
      "totalSales" => $totals["totalSales"],
      "totalProfit" => $netProfit,
      "offerSales" => pos_op_round($offerSales),
      "totalDiscount" => $totals["discount"],
      "grossProfit" => $totals["grossProfit"],
      "netSales" => $totals["netSales"],
      "gst" => $totals["gst"],
      "expenses" => $expenses,
      "margin" => pos_op_margin($netProfit, $totals["netSales"]),
      "offers" => array_map(function ($row) {
        return ["id" => $row["id"], "name" => $row["name"], "code" => $row["code"], "sales" => $row["totalSales"], "profit" => $row["netProfit"]];
      }, $offers),
    ],
    "offers" => $offers,
    "byDay" => $days,
    "byMonth" => $months,
    "byBusiness" => $businesses,
    "profitLines" => array_slice($profitLines, 0, 400),
    "profitTruncated" => count($profitLines) > 400,
    "profitRowCount" => count($profitLines),
    "summary" => [
      "totalSales" => $totals["totalSales"],
      "gst" => $totals["gst"],
      "netSales" => $totals["netSales"],
      "grossProfit" => $totals["grossProfit"],
      "purchaseCost" => $totals["purchaseCost"],
      "discounts" => $totals["discount"],
      "loyalty" => $totals["loyalty"],
      "expenses" => $expenses,
      "expensesOmitted" => $branchId !== "",
      "netProfit" => $netProfit,
      "margin" => pos_op_margin($netProfit, $totals["netSales"]),
      "bills" => $totals["bills"],
    ],
    "catalog" => $catalog,
    "branches" => $branchRows,
    "businesses" => [],
    "php" => true,
  ];
}

function pos_offer_profit_scope_shop($bid, $auth) {
  $role = (string) ($auth["user"]["role"] ?? "");
  $own = (string) ($auth["branchId"] ?? $auth["user"]["branch_id"] ?? "");
  $asked = trim((string) ($_GET["branch"] ?? ""));
  $locked = pos_op_locked_role($role) && $own !== "";
  return [
    "businessId" => $bid,
    "branchId" => $locked ? $own : $asked,
    "locked" => $locked,
    "master" => false,
    "allBusinesses" => false,
  ];
}

function pos_offer_profit_send($path, $report) {
  require_once __DIR__ . "/pos-reports.php";
  if (substr($path, -6) === "/excel") {
    $sheets = [
      ["name" => "Offer Wise Sales", "headers" => ["Offer", "Code", "Bills", "Sales", "GST", "Net profit"], "rows" => array_map(function ($r) {
        return [$r["name"], $r["code"], $r["bills"], $r["totalSales"], $r["gst"], $r["netProfit"]];
      }, $report["offers"])],
      ["name" => "Sales Wise Profit", "headers" => ["Invoice", "Product", "Qty", "Cost", "Selling", "Discount", "GST", "Net profit"], "rows" => array_map(function ($r) {
        return [$r["invoice"], $r["product"], $r["qty"], $r["purchaseCost"], $r["sellingPrice"], $r["discount"], $r["gst"], $r["netProfit"]];
      }, $report["profitLines"])],
    ];
    $xml = pos_workbook_xml($sheets);
    http_response_code(200);
    header("Content-Type: application/vnd.ms-excel; charset=utf-8");
    header("Content-Disposition: attachment; filename=\"offer-profit-" . $report["from"] . "-to-" . $report["to"] . ".xls\"");
    echo $xml;
    exit;
  }
  if (substr($path, -4) === "/pdf") {
    $d = $report["dashboard"];
    $text = "Offer Wise Sales\\nTotal sales " . $d["totalSales"] . "\\nTotal profit " . $d["totalProfit"] . "\\nOffer sales " . $d["offerSales"] . "\\nTotal discount " . $d["totalDiscount"];
    $stream = "BT /F1 12 Tf 40 800 Td (" . str_replace(["\\", "(", ")"], ["\\\\", "\\(", "\\)"], $text) . ") Tj ET";
    $pdf = "%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n4 0 obj<< /Length " . strlen($stream) . " >>stream\n" . $stream . "\nendstream\nendobj\n5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\ntrailer<< /Root 1 0 R >>\n%%EOF";
    http_response_code(200);
    header("Content-Type: application/pdf");
    header("Content-Disposition: attachment; filename=\"offer-profit-" . $report["from"] . "-to-" . $report["to"] . ".pdf\"");
    echo $pdf;
    exit;
  }
  pos_send(200, $report);
}

function pos_offer_profit_shop($path, $bid, $auth) {
  $user = $auth["user"] ?? [];
  $user["role"] = strtolower(str_replace(" ", "_", trim((string) ($user["role"] ?? ""))));
  $perms = function_exists("pos_parse_perms") ? pos_parse_perms($user) : [];
  $role = $user["role"];
  if ($role !== "business_admin" && $role !== "resort_owner" && empty($perms["reports"])) {
    pos_send(403, ["error" => "You do not have permission for this module", "php" => true]);
  }
  $report = pos_build_offer_profit(pos_offer_profit_scope_shop($bid, $auth), $_GET);
  pos_offer_profit_send($path, $report);
}

function pos_offer_profit_master($path) {
  $business = trim((string) ($_GET["business"] ?? ""));
  $branch = trim((string) ($_GET["branch"] ?? ""));
  $report = pos_build_offer_profit([
    "businessId" => $business,
    "branchId" => $branch,
    "locked" => false,
    "master" => true,
    "allBusinesses" => $business === "",
  ], $_GET);
  if ($business === "") {
    $report["businesses"] = pos_op_try("SELECT id, name FROM businesses ORDER BY name", "", []) ?: [];
    $report["branches"] = pos_op_try(
      "SELECT br.id, br.name, br.business_id, b.name AS business_name FROM branches br LEFT JOIN businesses b ON b.id = br.business_id ORDER BY b.name, br.name",
      "",
      []
    ) ?: [];
  }
  pos_offer_profit_send($path, $report);
}
