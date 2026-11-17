<?php
/** Item-wise overselling report for the PHP host when Node does not answer. */

function pos_ior_num($value) {
  $n = (float) $value;
  return is_finite($n) ? $n : 0.0;
}

function pos_ior_paise($value) {
  return round(pos_ior_num($value) + 1e-9, 2);
}

function pos_ior_qty($value) {
  return round(pos_ior_num($value) + 1e-9, 3);
}

function pos_ior_day($value) {
  $text = (string) $value;
  if (preg_match("/^(\d{4}-\d{2}-\d{2})/", $text, $m)) return $m[1];
  return "";
}

function pos_ior_stamp($value) {
  $text = (string) $value;
  if ($text === "") return 0;
  $ts = strtotime($text);
  return $ts === false ? 0 : $ts;
}

function pos_ior_cancelled($status) {
  return in_array(strtolower(trim((string) $status)), ["cancelled", "canceled", "void", "voided"], true);
}

function pos_ior_has($hay, $needle) {
  $q = strtolower(trim((string) $needle));
  if ($q === "") return true;
  return strpos(strtolower((string) $hay), $q) !== false;
}

function pos_ior_try($sql, $types, $params) {
  try {
    return pos_q($sql, $types, $params);
  } catch (Exception $e) {
    return null;
  }
}

function pos_ior_push(&$events, &$seen, $row, $delta, $kind) {
  $itemId = (string) ($row["item_id"] ?? "");
  $qty = pos_ior_qty($delta);
  if ($itemId === "" || $qty == 0.0) return;
  $day = pos_ior_day($row["sale_date"] ?? "");
  $id = $kind . ":" . ($row["id"] ?? "") . ":" . $day . ":" . $qty;
  if (($row["id"] ?? "") !== "" && isset($seen[$id])) return;
  if (($row["id"] ?? "") !== "") $seen[$id] = true;
  $events[] = [
    "item_id" => $itemId,
    "at" => pos_ior_stamp($row["sale_date"] ?? ""),
    "day" => $day,
    "delta" => $qty,
    "kind" => $kind,
    "row" => $row,
  ];
}

function pos_ior_collect($raw) {
  $events = [];
  $seen = [];
  foreach ($raw["purchases"] as $row) {
    if (pos_ior_cancelled($row["status"] ?? "")) continue;
    pos_ior_push($events, $seen, $row, pos_ior_num($row["quantity_gm"] ?? 0) + max(0, pos_ior_num($row["free_qty"] ?? 0)), "purchase");
  }
  foreach ($raw["returns"] as $row) {
    if (pos_ior_cancelled($row["status"] ?? "")) continue;
    $disposition = strtolower((string) ($row["stock_disposition"] ?? ($row["disposition"] ?? "sellable")));
    if ($disposition !== "" && $disposition !== "sellable") continue;
    pos_ior_push($events, $seen, $row, abs(pos_ior_num($row["quantity_gm"] ?? 0)), "return");
  }
  foreach ($raw["adjustments"] as $row) {
    $kind = strtolower((string) ($row["kind"] ?? ""));
    if (in_array($kind, ["sale", "purchase", "sale_return", "return"], true)) continue;
    pos_ior_push($events, $seen, $row, pos_ior_num($row["quantity_gm"] ?? 0), "adjustment");
  }
  foreach ($raw["online"] as $row) {
    if (pos_ior_cancelled($row["status"] ?? "")) continue;
    $qty = array_key_exists("quantity_base", $row) ? $row["quantity_base"] : ($row["quantity_gm"] ?? 0);
    pos_ior_push($events, $seen, $row, -abs(pos_ior_num($qty)), "online");
  }
  foreach ($raw["sales"] as $row) {
    if ((int) ($row["cancelled"] ?? 0) === 1 || (int) ($row["held"] ?? 0) === 1 || pos_ior_cancelled($row["status"] ?? "")) continue;
    pos_ior_push($events, $seen, $row, -abs(pos_ior_num($row["quantity_gm"] ?? 0)), "sale");
  }
  $rank = ["purchase" => 0, "return" => 1, "adjustment" => 2, "online" => 3, "sale" => 4];
  usort($events, function ($a, $b) use ($rank) {
    if ($a["day"] !== $b["day"]) return $a["day"] < $b["day"] ? -1 : 1;
    $ar = $rank[$a["kind"]] ?? 9;
    $br = $rank[$b["kind"]] ?? 9;
    if ($ar !== $br) return $ar < $br ? -1 : 1;
    if ($a["at"] == $b["at"]) return 0;
    return $a["at"] < $b["at"] ? -1 : 1;
  });
  return $events;
}

function pos_ior_lines($raw, $from, $to) {
  $items = [];
  foreach ($raw["items"] as $row) {
    if (!empty($row["id"])) $items[(string) $row["id"]] = $row;
  }
  $byItem = [];
  foreach (pos_ior_collect($raw) as $event) {
    $byItem[$event["item_id"]][] = $event;
  }
  $lines = [];
  foreach ($byItem as $itemId => $events) {
    $item = $items[$itemId] ?? [];
    $moved = 0.0;
    foreach ($events as $event) $moved += $event["delta"];
    $balance = pos_ior_qty(pos_ior_num($item["stock_gm"] ?? 0) - $moved);
    foreach ($events as $event) {
      if ($event["kind"] === "sale") {
        $sold = abs($event["delta"]);
        $before = $balance;
        $oversold = pos_ior_qty(max(0, $sold - max(0, $before)));
        $row = $event["row"];
        $day = $event["day"];
        if ($oversold > 0.0001 && ($from === "" || $day >= $from) && ($to === "" || $day <= $to)) {
          $share = $sold ? $oversold / $sold : 0;
          $net = pos_ior_paise(pos_ior_num($row["amount"] ?? 0) * $share);
          $gst = pos_ior_paise(($net * pos_ior_num($row["gst_rate"] ?? 0)) / 100);
          $invoice = (string) ($row["order_number"] ?? "");
          $lines[] = [
            "id" => (string) ($row["id"] ?? ""),
            "item_id" => (string) $itemId,
            "product_name" => (string) ($row["item_name"] ?? ($item["name"] ?? "Item")),
            "product_code" => (string) ($row["code"] ?? ($item["code"] ?? ($row["barcode"] ?? ($item["barcode"] ?? "")))),
            "category" => (string) ($row["category"] ?? ($item["category"] ?? "")),
            "brand" => (string) ($row["brand"] ?? ($item["brand"] ?? "")),
            "customer" => (string) (($row["customer_name"] ?? "") !== "" ? $row["customer_name"] : "Walk-in"),
            "sold_qty" => $sold,
            "stock_before" => pos_ior_qty($before),
            "oversold_qty" => $oversold,
            "rate" => pos_ior_num($row["rate_per_kg"] ?? 0),
            "net" => $net,
            "gst" => $gst,
            "amount" => pos_ior_paise($net + $gst),
            "sale_date" => $day,
            "invoice" => $invoice,
            "order_number" => $invoice,
            "branch" => (string) ($row["branch_name"] ?? ""),
            "branch_id" => (string) ($row["branch_id"] ?? ""),
            "stock_now" => pos_ior_qty(pos_ior_num($item["stock_gm"] ?? 0)),
          ];
        }
      }
      $balance = pos_ior_qty($balance + $event["delta"]);
    }
  }
  usort($lines, function ($a, $b) {
    if ($a["sale_date"] !== $b["sale_date"]) return $a["sale_date"] < $b["sale_date"] ? 1 : -1;
    if ($a["product_name"] !== $b["product_name"]) return strcmp($a["product_name"], $b["product_name"]);
    return strcmp($a["invoice"], $b["invoice"]);
  });
  return $lines;
}

function pos_ior_match($line, $filters) {
  if (($filters["item"] ?? "") !== "") {
    if ($line["item_id"] !== (string) $filters["item"]) return false;
  } elseif (!pos_ior_has($line["product_name"] . " " . $line["product_code"], $filters["product"] ?? "")) return false;
  if (!pos_ior_has($line["category"], $filters["category"] ?? "")) return false;
  if (!pos_ior_has($line["customer"], $filters["customer"] ?? "")) return false;
  if (!pos_ior_has($line["brand"], $filters["brand"] ?? "")) return false;
  if (!pos_ior_has($line["invoice"] . " " . $line["order_number"], $filters["invoice"] ?? "")) return false;
  if (($filters["branch"] ?? "") !== "" && $line["branch_id"] !== (string) $filters["branch"] && !pos_ior_has($line["branch"], $filters["branch"])) return false;
  return true;
}

function pos_ior_negatives($raw, $filters) {
  $rows = [];
  foreach ($raw["items"] as $item) {
    $stock = pos_ior_qty(pos_ior_num($item["stock_gm"] ?? 0));
    if ($stock >= -0.0001) continue;
    $row = [
      "item_id" => (string) ($item["id"] ?? ""),
      "product_name" => (string) ($item["name"] ?? "Item"),
      "product_code" => (string) ($item["code"] ?? ($item["barcode"] ?? "")),
      "category" => (string) ($item["category"] ?? ""),
      "brand" => (string) ($item["brand"] ?? ""),
      "stock_now" => $stock,
    ];
    if (($filters["item"] ?? "") !== "" && $row["item_id"] !== (string) $filters["item"]) continue;
    if (($filters["item"] ?? "") === "" && !pos_ior_has($row["product_name"] . " " . $row["product_code"], $filters["product"] ?? "")) continue;
    if (!pos_ior_has($row["category"], $filters["category"] ?? "")) continue;
    if (!pos_ior_has($row["brand"], $filters["brand"] ?? "")) continue;
    $rows[] = $row;
  }
  usort($rows, function ($a, $b) {
    if ($a["stock_now"] == $b["stock_now"]) return strcmp($a["product_name"], $b["product_name"]);
    return $a["stock_now"] < $b["stock_now"] ? -1 : 1;
  });
  return $rows;
}

function pos_ior_summary($lines, $negatives) {
  $items = [];
  $bills = [];
  $summary = ["items" => 0, "bills" => 0, "soldQty" => 0, "oversoldQty" => 0, "amount" => 0, "negative" => count($negatives)];
  foreach ($lines as $line) {
    $items[$line["item_id"] !== "" ? $line["item_id"] : $line["product_name"]] = true;
    if ($line["invoice"] !== "") $bills[$line["invoice"]] = true;
    $summary["soldQty"] += $line["sold_qty"];
    $summary["oversoldQty"] += $line["oversold_qty"];
    $summary["amount"] += $line["amount"];
  }
  $summary["items"] = count($items);
  $summary["bills"] = count($bills);
  $summary["soldQty"] = pos_ior_qty($summary["soldQty"]);
  $summary["oversoldQty"] = pos_ior_qty($summary["oversoldQty"]);
  $summary["amount"] = pos_ior_paise($summary["amount"]);
  return $summary;
}

function pos_ior_build_rows($raw, $from, $to, $filters) {
  $lines = [];
  foreach (pos_ior_lines($raw, $from, $to) as $line) {
    if (pos_ior_match($line, $filters)) $lines[] = $line;
  }
  $negatives = pos_ior_negatives($raw, $filters);
  return ["lines" => $lines, "negatives" => $negatives, "summary" => pos_ior_summary($lines, $negatives)];
}

function pos_ior_select($bid) {
  $open = pos_sale_not_void("o");
  $sales = null;
  $last = "Sales lines did not load";
  foreach ([
    "SELECT l.id, l.item_id, l.item_name, l.quantity_gm, l.rate_per_kg, l.amount, l.gst_rate,
            COALESCE(l.cancelled,0) AS cancelled, o.order_number, o.customer_name, o.status, o.branch_id,
            o.created_at AS sale_date, COALESCE(o.held,0) AS held, i.code, i.category, COALESCE(i.brand,'') AS brand,
            br.name AS branch_name
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id AND o.business_id = l.business_id
     LEFT JOIN items i ON i.id = l.item_id AND i.business_id = o.business_id
     LEFT JOIN branches br ON br.id = o.branch_id
     WHERE o.business_id = ? AND $open AND COALESCE(l.cancelled,0) = 0 AND COALESCE(o.held,0) = 0",
    "SELECT l.id, l.item_id, l.item_name, l.quantity_gm, l.rate_per_kg, l.amount, l.gst_rate,
            COALESCE(l.cancelled,0) AS cancelled, o.order_number, o.customer_name, o.status, o.created_at AS sale_date
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id AND o.business_id = l.business_id
     WHERE o.business_id = ? AND $open AND COALESCE(l.cancelled,0) = 0",
  ] as $sql) {
    try {
      $sales = pos_q($sql, "s", [$bid]);
      break;
    } catch (Exception $e) {
      $last = $e->getMessage();
    }
  }
  if (!is_array($sales)) throw new Exception($last);
  $purchases = pos_ior_try(
    "SELECT l.id, l.item_id, l.quantity_gm, COALESCE(l.free_qty,0) AS free_qty, p.purchase_date AS sale_date, p.status
     FROM purchase_lines l JOIN purchases p ON p.id = l.purchase_id AND p.business_id = l.business_id
     WHERE p.business_id = ?",
    "s",
    [$bid]
  );
  if (!is_array($purchases)) {
    $purchases = pos_ior_try(
      "SELECT l.id, l.item_id, l.quantity_gm, p.purchase_date AS sale_date, p.status
       FROM purchase_lines l JOIN purchases p ON p.id = l.purchase_id WHERE p.business_id = ?",
      "s",
      [$bid]
    );
  }
  $returns = pos_ior_try(
    "SELECT rl.id, rl.item_id, rl.quantity_gm, rl.stock_disposition, r.created_at AS sale_date, r.status
     FROM sales_return_lines rl JOIN sales_returns r ON r.id = rl.return_id AND r.business_id = rl.business_id
     WHERE r.business_id = ? AND LOWER(COALESCE(r.status,'')) <> 'cancelled'",
    "s",
    [$bid]
  );
  if (!is_array($returns)) {
    $returns = pos_ior_try(
      "SELECT rl.id, rl.item_id, rl.quantity_gm, r.created_at AS sale_date, r.status
       FROM sales_return_lines rl JOIN sales_returns r ON r.id = rl.return_id
       WHERE r.business_id = ? AND LOWER(COALESCE(r.status,'')) <> 'cancelled'",
      "s",
      [$bid]
    );
  }
  $adjustments = pos_ior_try(
    "SELECT id, item_id, kind, quantity_gm, created_at AS sale_date FROM stock_movements
     WHERE business_id = ? AND LOWER(COALESCE(kind,'')) NOT IN ('sale','purchase','sale_return','return')",
    "s",
    [$bid]
  );
  $online = pos_ior_try(
    "SELECT l.id, l.item_id, l.quantity_base, o.created_at AS sale_date, o.status
     FROM online_order_lines l JOIN online_orders o ON o.id = l.order_id AND o.business_id = l.business_id
     WHERE o.business_id = ? AND LOWER(COALESCE(o.status,'')) <> 'cancelled'",
    "s",
    [$bid]
  );
  $items = pos_ior_try("SELECT id, name, code, barcode, category, brand, stock_gm FROM items WHERE business_id = ?", "s", [$bid]);
  if (!is_array($items)) $items = pos_ior_try("SELECT id, name, code, category, stock_gm FROM items WHERE business_id = ?", "s", [$bid]);
  return [
    "sales" => $sales,
    "purchases" => is_array($purchases) ? $purchases : [],
    "returns" => is_array($returns) ? $returns : [],
    "adjustments" => is_array($adjustments) ? $adjustments : [],
    "online" => is_array($online) ? $online : [],
    "items" => is_array($items) ? $items : [],
  ];
}

function pos_ior_cells($line) {
  return [
    $line["product_name"], $line["product_code"], $line["category"], $line["customer"],
    $line["sold_qty"], $line["stock_before"], $line["oversold_qty"], $line["rate"], $line["amount"],
    $line["sale_date"], $line["invoice"], $line["branch"], $line["stock_now"],
  ];
}

function pos_ior_csv_cell($value) {
  $text = (string) $value;
  if (preg_match('/[",\n]/', $text)) return '"' . str_replace('"', '""', $text) . '"';
  return $text;
}

function pos_ior_send($path, $report) {
  $s = $report["summary"];
  if (substr($path, -6) === "/excel") {
    require_once __DIR__ . "/pos-reports.php";
    $sheets = [
      ["name" => "Item-Wise Overselling", "headers" => ["Product Name", "Product Code", "Category", "Customer", "Sold Qty", "Stock Before", "Oversold Qty", "Sale Rate", "Oversold Amount", "Sale Date", "Invoice", "Branch", "Stock Now"], "rows" => array_map("pos_ior_cells", $report["lines"])],
      ["name" => "Summary", "headers" => ["Items", "Bills", "Sold Qty", "Oversold Qty", "Oversold Amount", "Still Negative"], "rows" => [[$s["items"], $s["bills"], $s["soldQty"], $s["oversoldQty"], $s["amount"], $s["negative"]]]],
      ["name" => "Still negative", "headers" => ["Product", "Code", "Category", "Brand", "Stock Now"], "rows" => array_map(function ($row) {
        return [$row["product_name"], $row["product_code"], $row["category"], $row["brand"], $row["stock_now"]];
      }, $report["negatives"])],
    ];
    http_response_code(200);
    header("Content-Type: application/vnd.ms-excel; charset=utf-8");
    header("Content-Disposition: attachment; filename=\"item-wise-overselling-" . $report["from"] . "-to-" . $report["to"] . ".xls\"");
    echo pos_workbook_xml($sheets);
    exit;
  }
  if (substr($path, -4) === "/csv") {
    $headers = ["Product Name", "Product Code", "Category", "Customer", "Sold Qty", "Stock Before", "Oversold Qty", "Sale Rate", "Oversold Amount", "Sale Date", "Invoice", "Branch", "Stock Now"];
    $lines = [implode(",", $headers)];
    foreach ($report["lines"] as $line) {
      $cells = [];
      foreach (pos_ior_cells($line) as $cell) $cells[] = pos_ior_csv_cell($cell);
      $lines[] = implode(",", $cells);
    }
    http_response_code(200);
    header("Content-Type: text/csv; charset=utf-8");
    header("Content-Disposition: attachment; filename=\"item-wise-overselling-" . $report["from"] . "-to-" . $report["to"] . ".csv\"");
    echo "\xEF\xBB\xBF" . implode("\n", $lines) . "\n";
    exit;
  }
  if (substr($path, -4) === "/pdf") {
    $text = "Item-Wise Overselling Report\\nItems " . $s["items"] . " Oversold " . $s["oversoldQty"] . " Amount " . $s["amount"];
    $stream = "BT /F1 12 Tf 40 800 Td (" . str_replace(["\\", "(", ")"], ["\\\\", "\\(", "\\)"], $text) . ") Tj ET";
    $pdf = "%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n4 0 obj<< /Length " . strlen($stream) . " >>stream\n" . $stream . "\nendstream\nendobj\n5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\ntrailer<< /Root 1 0 R >>\n%%EOF";
    http_response_code(200);
    header("Content-Type: application/pdf");
    header("Content-Disposition: attachment; filename=\"item-wise-overselling-" . $report["from"] . "-to-" . $report["to"] . ".pdf\"");
    echo $pdf;
    exit;
  }
  pos_send(200, $report);
}

function pos_item_oversell_shop($path, $bid, $auth) {
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
  $filters = ["from" => $from, "to" => $to];
  foreach (["product", "category", "customer", "brand", "invoice", "branch", "item"] as $key) {
    $filters[$key] = trim((string) ($_GET[$key] ?? ""));
  }
  $built = pos_ior_build_rows(pos_ior_select($bid), $from, $to, $filters);
  $branches = pos_ior_try("SELECT id, name FROM branches WHERE business_id = ? ORDER BY name", "s", [$bid]);
  $branchRows = [];
  foreach (is_array($branches) ? $branches : [] as $row) $branchRows[] = ["id" => $row["id"], "name" => $row["name"] ?: "Branch"];
  $q = ["from" => $from, "to" => $to];
  foreach (["product", "category", "customer", "brand", "invoice", "branch", "item"] as $key) {
    if ($filters[$key] !== "") $q[$key] = $filters[$key];
  }
  $queryText = http_build_query($q);
  pos_ior_send($path, [
    "from" => $from, "to" => $to, "filters" => $filters, "branches" => $branchRows,
    "summary" => $built["summary"], "lines" => $built["lines"], "negatives" => $built["negatives"],
    "links" => [
      "excel" => "/api/reports/item-oversells/excel?" . $queryText,
      "pdf" => "/api/reports/item-oversells/pdf?" . $queryText,
      "csv" => "/api/reports/item-oversells/csv?" . $queryText,
    ],
    "php" => true,
  ]);
}
