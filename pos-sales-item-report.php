<?php
/** Item-wise sales report for the PHP host when Node does not answer. */

function pos_sir_num($value) {
  $n = (float) $value;
  return is_finite($n) ? $n : 0.0;
}

function pos_sir_paise($value) {
  return round(pos_sir_num($value), 2);
}

function pos_sir_day($value) {
  $text = (string) $value;
  if (preg_match("/^(\d{4}-\d{2}-\d{2})/", $text, $m)) return $m[1];
  return "";
}

function pos_sir_cancelled($status) {
  return in_array(strtolower(trim((string) $status)), ["cancelled", "canceled", "void", "voided"], true);
}

function pos_sir_has($hay, $needle) {
  $q = strtolower(trim((string) $needle));
  if ($q === "") return true;
  return strpos(strtolower((string) $hay), $q) !== false;
}

function pos_sir_free($row) {
  $qty = pos_sir_num($row["quantity_gm"] ?? 0);
  $amount = pos_sir_num($row["amount"] ?? 0);
  $discount = pos_sir_num($row["discount"] ?? 0);
  return $qty > 0 && $amount <= 0.009 && ($discount > 0.009 || pos_sir_num($row["rate_per_kg"] ?? 0) > 0);
}

function pos_sir_try($sql, $types, $params) {
  try {
    return pos_q($sql, $types, $params);
  } catch (Exception $e) {
    return null;
  }
}

function pos_sir_prepare($rows) {
  $seen = [];
  $kept = [];
  foreach ($rows as $row) {
    if ((int) ($row["cancelled"] ?? 0) === 1 || (int) ($row["held"] ?? 0) === 1 || pos_sir_cancelled($row["status"] ?? "")) continue;
    $id = (string) ($row["id"] ?? "");
    if ($id !== "") {
      if (isset($seen[$id])) continue;
      $seen[$id] = true;
    }
    $kept[] = $row;
  }
  $groups = [];
  foreach ($kept as $row) {
    $key = (string) ($row["order_id"] ?? $row["id"] ?? count($groups));
    $groups[$key][] = $row;
  }
  $out = [];
  foreach ($groups as $list) {
    $lineGst = 0.0;
    foreach ($list as $row) $lineGst += (max(0, pos_sir_num($row["amount"] ?? 0)) * pos_sir_num($row["gst_rate"] ?? 0)) / 100;
    $discount = pos_sir_num($list[0]["order_discount"] ?? 0);
    $loyalty = pos_sir_num($list[0]["order_loyalty"] ?? 0);
    $orderGst = pos_sir_num($list[0]["order_gst"] ?? 0);
    $useNet = ($discount + $loyalty) > 0.009 && $lineGst > $orderGst + 0.05;
    $taxable = [];
    $subtotal = 0.0;
    foreach ($list as $index => $row) {
      $net = max(0, pos_sir_num($row["amount"] ?? 0));
      if ($net > 0.009 && !pos_sir_free($row)) {
        $taxable[] = ["index" => $index, "net" => $net];
        $subtotal += $net;
      }
    }
    $reduction = $useNet ? min($subtotal, $discount + $loyalty) : 0;
    $shares = array_fill(0, count($list), 0);
    $used = 0.0;
    foreach ($taxable as $n => $row) {
      $last = $n === count($taxable) - 1;
      $share = $last ? pos_sir_paise($reduction - $used) : pos_sir_paise(($reduction * $row["net"]) / ($subtotal ?: 1));
      $take = pos_sir_paise(min(max(0, $share), $row["net"]));
      $shares[$row["index"]] = $take;
      $used = pos_sir_paise($used + $take);
    }
    foreach ($list as $index => $row) $out[] = pos_sir_line($row, $shares[$index]);
  }
  return $out;
}

function pos_sir_line($row, $share) {
  $qty = pos_sir_num($row["quantity_gm"] ?? 0);
  $free = pos_sir_free($row);
  $extra = $free ? 0 : max(0, pos_sir_num($share));
  $net = pos_sir_paise(max(0, pos_sir_num($row["amount"] ?? 0) - $extra));
  $gst = $free ? 0 : pos_sir_paise(($net * pos_sir_num($row["gst_rate"] ?? 0)) / 100);
  $invoice = trim((string) ($row["order_number"] ?? ""));
  return [
    "id" => (string) ($row["id"] ?? ""),
    "item_id" => (string) ($row["item_id"] ?? ""),
    "product_name" => (string) ($row["item_name"] ?? $row["catalog_name"] ?? "Item"),
    "product_code" => (string) ($row["code"] ?? $row["item_barcode"] ?? $row["line_barcode"] ?? ""),
    "category" => (string) ($row["category"] ?? ""),
    "brand" => (string) ($row["brand"] ?? ""),
    "customer" => (string) (($row["customer_name"] ?? "") !== "" ? $row["customer_name"] : "Walk-in"),
    "sales_qty" => $free ? 0 : $qty,
    "free_qty" => $free ? $qty : 0,
    "total_qty" => $qty,
    "rate" => pos_sir_num($row["rate_per_kg"] ?? 0),
    "discount" => pos_sir_paise(max(0, pos_sir_num($row["discount"] ?? 0)) + $extra),
    "net" => $net,
    "gst" => $gst,
    "total" => pos_sir_paise($net + $gst),
    "sale_date" => pos_sir_day($row["sale_date"] ?? ""),
    "invoice" => $invoice,
    "order_number" => $invoice,
    "order_id" => (string) ($row["order_id"] ?? ""),
    "branch" => (string) ($row["branch_name"] ?? ""),
    "branch_id" => (string) ($row["branch_id"] ?? ""),
    "status" => (string) ($row["status"] ?? "confirmed"),
    "kind" => "sale",
  ];
}

function pos_sir_returns($rows) {
  $seen = [];
  $out = [];
  foreach ($rows as $row) {
    if (pos_sir_cancelled($row["status"] ?? "")) continue;
    $id = "return:" . ($row["id"] ?? "") . ":" . pos_sir_day($row["sale_date"] ?? "");
    if (isset($seen[$id])) continue;
    $qty = abs(pos_sir_num($row["quantity_gm"] ?? 0));
    if ($qty <= 0 || (string) ($row["item_id"] ?? "") === "") continue;
    $seen[$id] = true;
    $inclusive = abs(pos_sir_num($row["amount"] ?? 0));
    $gstRate = pos_sir_num($row["gst_rate"] ?? 0);
    $taxable = $gstRate ? $inclusive / (1 + $gstRate / 100) : $inclusive;
    $gst = $inclusive - $taxable;
    $number = (string) ($row["return_number"] ?? "Return");
    $out[] = [
      "id" => $id,
      "item_id" => (string) $row["item_id"],
      "product_name" => (string) ($row["item_name"] ?? "Item"),
      "product_code" => (string) ($row["item_code"] ?? $row["code"] ?? $row["barcode"] ?? ""),
      "category" => (string) ($row["category"] ?? ""),
      "brand" => (string) ($row["brand"] ?? ""),
      "customer" => (string) (($row["customer_name"] ?? "") !== "" ? $row["customer_name"] : "Walk-in"),
      "sales_qty" => -$qty,
      "free_qty" => 0,
      "total_qty" => -$qty,
      "rate" => pos_sir_num($row["rate_per_kg"] ?? 0),
      "discount" => 0,
      "net" => -pos_sir_paise($taxable),
      "gst" => -pos_sir_paise($gst),
      "total" => -pos_sir_paise($inclusive),
      "sale_date" => pos_sir_day($row["sale_date"] ?? ""),
      "invoice" => $number,
      "order_number" => (string) ($row["order_number"] ?? $number),
      "order_id" => (string) ($row["order_id"] ?? ""),
      "branch" => (string) ($row["branch_name"] ?? ""),
      "branch_id" => (string) ($row["branch_id"] ?? ""),
      "status" => "posted",
      "kind" => "return",
    ];
  }
  return $out;
}

function pos_sir_match($line, $filters) {
  if (($filters["item"] ?? "") !== "") {
    if ($line["item_id"] !== (string) $filters["item"]) return false;
  } elseif (!pos_sir_has($line["product_name"] . " " . $line["product_code"], $filters["product"] ?? "")) return false;
  if (!pos_sir_has($line["category"], $filters["category"] ?? "")) return false;
  if (!pos_sir_has($line["customer"], $filters["customer"] ?? "")) return false;
  if (!pos_sir_has($line["brand"], $filters["brand"] ?? "")) return false;
  if (!pos_sir_has($line["invoice"] . " " . $line["order_number"], $filters["invoice"] ?? "")) return false;
  if (($filters["branch"] ?? "") !== "") {
    $branch = (string) $filters["branch"];
    if ($line["branch_id"] !== $branch && !pos_sir_has($line["branch"], $branch)) return false;
  }
  return true;
}

function pos_sir_summary($lines) {
  $items = [];
  $summary = ["items" => 0, "salesQty" => 0, "freeQty" => 0, "amount" => 0, "gst" => 0, "discount" => 0];
  foreach ($lines as $line) {
    if ($line["kind"] !== "return" && $line["total_qty"] != 0.0) {
      $key = $line["item_id"] !== "" ? $line["item_id"] : $line["product_name"];
      $items[$key] = true;
    }
    $summary["salesQty"] += $line["sales_qty"];
    $summary["freeQty"] += $line["free_qty"];
    $summary["amount"] += $line["total"];
    $summary["gst"] += $line["gst"];
    $summary["discount"] += $line["discount"];
  }
  $summary["items"] = count($items);
  foreach (["salesQty", "freeQty", "amount", "gst", "discount"] as $key) $summary[$key] = pos_sir_paise($summary[$key]);
  return $summary;
}

function pos_sir_customers($lines) {
  $map = [];
  foreach ($lines as $line) {
    $key = $line["customer"] !== "" ? $line["customer"] : "Walk-in";
    if (!isset($map[$key])) $map[$key] = ["customer" => $key, "items" => [], "salesQty" => 0, "freeQty" => 0, "amount" => 0, "gst" => 0, "discount" => 0];
    $item = $line["item_id"] !== "" ? $line["item_id"] : $line["product_name"];
    if ($item !== "") $map[$key]["items"][$item] = true;
    $map[$key]["salesQty"] += $line["sales_qty"];
    $map[$key]["freeQty"] += $line["free_qty"];
    $map[$key]["amount"] += $line["total"];
    $map[$key]["gst"] += $line["gst"];
    $map[$key]["discount"] += $line["discount"];
  }
  $out = [];
  foreach ($map as $row) {
    $out[] = [
      "customer" => $row["customer"], "items" => count($row["items"]),
      "salesQty" => pos_sir_paise($row["salesQty"]), "freeQty" => pos_sir_paise($row["freeQty"]),
      "amount" => pos_sir_paise($row["amount"]), "gst" => pos_sir_paise($row["gst"]), "discount" => pos_sir_paise($row["discount"]),
    ];
  }
  usort($out, function ($a, $b) {
    if ($a["amount"] == $b["amount"]) return strcmp($a["customer"], $b["customer"]);
    return $a["amount"] < $b["amount"] ? 1 : -1;
  });
  return $out;
}

function pos_sir_rates($lines) {
  $map = [];
  foreach ($lines as $line) {
    if ($line["kind"] === "return" || $line["sales_qty"] <= 0) continue;
    $key = $line["item_id"] !== "" ? $line["item_id"] : $line["product_name"];
    if (!isset($map[$key])) {
      $map[$key] = ["item_id" => $line["item_id"], "product_name" => $line["product_name"], "product_code" => $line["product_code"], "bills" => 0, "min" => $line["rate"], "max" => $line["rate"], "weighted" => 0, "qty" => 0, "amount" => 0];
    }
    $map[$key]["bills"] += 1;
    $map[$key]["min"] = min($map[$key]["min"], $line["rate"]);
    $map[$key]["max"] = max($map[$key]["max"], $line["rate"]);
    $map[$key]["weighted"] += $line["rate"] * $line["sales_qty"];
    $map[$key]["qty"] += $line["sales_qty"];
    $map[$key]["amount"] += $line["total"];
  }
  $out = [];
  foreach ($map as $row) {
    $out[] = [
      "item_id" => $row["item_id"], "product_name" => $row["product_name"], "product_code" => $row["product_code"],
      "bills" => $row["bills"], "min" => pos_sir_paise($row["min"]), "max" => pos_sir_paise($row["max"]),
      "avg" => $row["qty"] ? pos_sir_paise($row["weighted"] / $row["qty"]) : 0,
      "qty" => pos_sir_paise($row["qty"]), "amount" => pos_sir_paise($row["amount"]),
    ];
  }
  usort($out, function ($a, $b) { return strcmp($a["product_name"], $b["product_name"]); });
  return $out;
}

function pos_sir_select_lines($bid, $from, $to) {
  $between = pos_created_between("o");
  $open = pos_sale_not_void("o");
  $plans = [
    "SELECT l.id, l.item_id, l.item_name, l.quantity_gm, l.rate_per_kg, COALESCE(l.discount,0) AS discount,
            l.amount, l.gst_rate, COALESCE(l.cancelled,0) AS cancelled, l.barcode AS line_barcode,
            o.id AS order_id, o.order_number, o.customer_name, o.status, o.branch_id, o.created_at AS sale_date,
            o.subtotal AS order_subtotal, o.discount AS order_discount, o.loyalty_discount AS order_loyalty, o.gst AS order_gst,
            COALESCE(o.held,0) AS held, i.code, i.barcode AS item_barcode, i.category, COALESCE(i.brand,'') AS brand, i.name AS catalog_name,
            br.name AS branch_name
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id AND o.business_id = l.business_id
     LEFT JOIN items i ON i.id = l.item_id AND i.business_id = o.business_id
     LEFT JOIN branches br ON br.id = o.branch_id
     WHERE o.business_id = ? AND $between AND $open AND COALESCE(l.cancelled,0) = 0 AND COALESCE(o.held,0) = 0",
    "SELECT l.id, l.item_id, l.item_name, l.quantity_gm, l.rate_per_kg, COALESCE(l.discount,0) AS discount,
            l.amount, l.gst_rate, COALESCE(l.cancelled,0) AS cancelled,
            o.id AS order_id, o.order_number, o.customer_name, o.status, o.created_at AS sale_date,
            o.subtotal AS order_subtotal, o.discount AS order_discount, o.gst AS order_gst
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id AND o.business_id = l.business_id
     WHERE o.business_id = ? AND $between AND $open AND COALESCE(l.cancelled,0) = 0",
  ];
  $last = "Sales lines did not load";
  foreach ($plans as $sql) {
    try {
      return pos_q($sql, "sss", [$bid, $from, $to]);
    } catch (Exception $e) {
      $last = $e->getMessage();
    }
  }
  throw new Exception($last);
}

function pos_sir_select_returns($bid, $from, $to) {
  $rows = pos_sir_try(
    "SELECT rl.id, rl.item_id, rl.item_name, rl.item_code, rl.quantity_gm, rl.rate_per_kg, rl.amount, rl.gst_rate,
            r.return_number, r.customer_name, r.created_at AS sale_date, r.order_id, r.status, r.branch_id,
            o.order_number, i.category, i.brand, i.code, br.name AS branch_name
     FROM sales_return_lines rl
     JOIN sales_returns r ON r.id = rl.return_id AND r.business_id = rl.business_id
     LEFT JOIN sales_orders o ON o.id = r.order_id
     LEFT JOIN items i ON i.id = rl.item_id AND i.business_id = r.business_id
     LEFT JOIN branches br ON br.id = r.branch_id
     WHERE r.business_id = ? AND r.created_at >= ? AND r.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       AND LOWER(COALESCE(r.status,'')) <> 'cancelled'",
    "sss",
    [$bid, $from, $to]
  );
  return is_array($rows) ? $rows : [];
}

function pos_sir_build($bid, $from, $to, $filters) {
  $lines = [];
  foreach (array_merge(pos_sir_prepare(pos_sir_select_lines($bid, $from, $to)), pos_sir_returns(pos_sir_select_returns($bid, $from, $to))) as $line) {
    if (pos_sir_match($line, $filters)) $lines[] = $line;
  }
  $branches = pos_sir_try("SELECT id, name FROM branches WHERE business_id = ? ORDER BY name", "s", [$bid]);
  $branchRows = [];
  foreach (is_array($branches) ? $branches : [] as $row) $branchRows[] = ["id" => $row["id"], "name" => $row["name"] ?: "Branch"];
  $q = ["from" => $from, "to" => $to];
  foreach ($filters as $key => $value) if ($value !== "") $q[$key] = $value;
  $queryText = http_build_query($q);
  return [
    "from" => $from, "to" => $to, "filters" => $filters, "branches" => $branchRows,
    "summary" => pos_sir_summary($lines), "lines" => $lines,
    "customers" => pos_sir_customers($lines), "rates" => pos_sir_rates($lines),
    "links" => [
      "excel" => "/api/reports/item-sales/excel?" . $queryText,
      "pdf" => "/api/reports/item-sales/pdf?" . $queryText,
      "csv" => "/api/reports/item-sales/csv?" . $queryText,
    ],
    "php" => true,
  ];
}

function pos_sir_cells($line) {
  return [
    $line["product_name"], $line["product_code"], $line["category"], $line["customer"],
    $line["sales_qty"], $line["free_qty"], $line["total_qty"], $line["rate"], $line["discount"],
    $line["gst"], $line["total"], $line["sale_date"], $line["invoice"], $line["branch"],
  ];
}

function pos_sir_csv_cell($value) {
  $text = (string) $value;
  if (preg_match('/[",\n]/', $text)) return '"' . str_replace('"', '""', $text) . '"';
  return $text;
}

function pos_sir_send($path, $report) {
  $s = $report["summary"];
  if (substr($path, -6) === "/excel") {
    require_once __DIR__ . "/pos-reports.php";
    $sheets = [
      ["name" => "Item-Wise Sales", "headers" => ["Product Name", "Product Code", "Category", "Customer", "Sales Qty", "Free Qty", "Total Qty", "Sale Rate", "Discount", "GST", "Total Amount", "Sale Date", "Invoice", "Branch"], "rows" => array_map("pos_sir_cells", $report["lines"])],
      ["name" => "Summary", "headers" => ["Total Items", "Sales Qty", "Free Qty", "Sales Amount", "GST", "Discount"], "rows" => [[$s["items"], $s["salesQty"], $s["freeQty"], $s["amount"], $s["gst"], $s["discount"]]]],
      ["name" => "Customer analysis", "headers" => ["Customer", "Items", "Sales Qty", "Free Qty", "Amount", "GST", "Discount"], "rows" => array_map(function ($row) {
        return [$row["customer"], $row["items"], $row["salesQty"], $row["freeQty"], $row["amount"], $row["gst"], $row["discount"]];
      }, $report["customers"])],
      ["name" => "Rate comparison", "headers" => ["Product", "Code", "Bills", "Min rate", "Max rate", "Avg rate", "Sales Qty", "Amount"], "rows" => array_map(function ($row) {
        return [$row["product_name"], $row["product_code"], $row["bills"], $row["min"], $row["max"], $row["avg"], $row["qty"], $row["amount"]];
      }, $report["rates"])],
    ];
    http_response_code(200);
    header("Content-Type: application/vnd.ms-excel; charset=utf-8");
    header("Content-Disposition: attachment; filename=\"item-wise-sales-" . $report["from"] . "-to-" . $report["to"] . ".xls\"");
    echo pos_workbook_xml($sheets);
    exit;
  }
  if (substr($path, -4) === "/csv") {
    $headers = ["Product Name", "Product Code", "Category", "Customer", "Sales Qty", "Free Qty", "Total Qty", "Sale Rate", "Discount", "GST", "Total Amount", "Sale Date", "Invoice", "Branch"];
    $lines = [implode(",", $headers)];
    foreach ($report["lines"] as $line) {
      $cells = [];
      foreach (pos_sir_cells($line) as $cell) $cells[] = pos_sir_csv_cell($cell);
      $lines[] = implode(",", $cells);
    }
    http_response_code(200);
    header("Content-Type: text/csv; charset=utf-8");
    header("Content-Disposition: attachment; filename=\"item-wise-sales-" . $report["from"] . "-to-" . $report["to"] . ".csv\"");
    echo "\xEF\xBB\xBF" . implode("\n", $lines) . "\n";
    exit;
  }
  if (substr($path, -4) === "/pdf") {
    $text = "Item-Wise Sales Report\\nItems " . $s["items"] . " Qty " . $s["salesQty"] . " Amount " . $s["amount"] . " GST " . $s["gst"];
    $stream = "BT /F1 12 Tf 40 800 Td (" . str_replace(["\\", "(", ")"], ["\\\\", "\\(", "\\)"], $text) . ") Tj ET";
    $pdf = "%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n4 0 obj<< /Length " . strlen($stream) . " >>stream\n" . $stream . "\nendstream\nendobj\n5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\ntrailer<< /Root 1 0 R >>\n%%EOF";
    http_response_code(200);
    header("Content-Type: application/pdf");
    header("Content-Disposition: attachment; filename=\"item-wise-sales-" . $report["from"] . "-to-" . $report["to"] . ".pdf\"");
    echo $pdf;
    exit;
  }
  pos_send(200, $report);
}

function pos_sales_item_report_shop($path, $bid, $auth) {
  $user = $auth["user"] ?? [];
  if (!function_exists("pos_can") || !pos_can($user, "reports")) {
    pos_send(403, ["error" => "You do not have permission for this module", "php" => true]);
  }
  $from = substr((string) ($_GET["from"] ?? ""), 0, 10);
  $to = substr((string) ($_GET["to"] ?? ""), 0, 10);
  if (!preg_match("/^\d{4}-\d{2}-\d{2}$/", $from) || !preg_match("/^\d{4}-\d{2}-\d{2}$/", $to)) {
    pos_send(400, ["error" => "Choose a from and to date", "php" => true]);
  }
  if ($from > $to) { $swap = $from; $from = $to; $to = $swap; }
  $filters = [];
  foreach (["product", "category", "customer", "brand", "invoice", "branch", "item"] as $key) {
    $filters[$key] = trim((string) ($_GET[$key] ?? ""));
  }
  pos_sir_send($path, pos_sir_build($bid, $from, $to, $filters));
}
