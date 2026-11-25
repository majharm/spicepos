<?php
/** Item-wise purchase report for the PHP host when Node does not answer. */

function pos_pir_num($value) {
  $n = (float) $value;
  return is_finite($n) ? $n : 0.0;
}

function pos_pir_round($value) {
  return round(pos_pir_num($value), 2);
}

function pos_pir_day($value) {
  $text = (string) $value;
  if (preg_match("/^(\d{4}-\d{2}-\d{2})/", $text, $m)) return $m[1];
  return "";
}

function pos_pir_clock($value) {
  $text = trim((string) $value);
  if (preg_match("/^(\d{2}:\d{2})/", $text, $m)) return $m[1];
  if (preg_match("/(?:T|\s)(\d{2}:\d{2})/", $text, $m)) return $m[1];
  return "";
}

function pos_pir_batch($row) {
  $id = trim((string) ($row["batch_id"] ?? ""));
  if ($id !== "") return $id;
  return trim((string) ($row["batch_no"] ?? ""));
}

function pos_pir_try($sql, $types, $params) {
  try {
    return pos_q($sql, $types, $params);
  } catch (Exception $e) {
    return null;
  }
}

function pos_pir_cancelled($status) {
  return in_array(strtolower(trim((string) $status)), ["cancelled", "canceled", "void", "voided"], true);
}

function pos_pir_has($hay, $needle) {
  $q = strtolower(trim((string) $needle));
  if ($q === "") return true;
  return strpos(strtolower((string) $hay), $q) !== false;
}

function pos_pir_line($row) {
  $purchase = pos_pir_num($row["purchase_qty"] ?? $row["quantity_gm"] ?? 0);
  $free = max(0, pos_pir_num($row["free_qty"] ?? $row["freeQty"] ?? 0));
  $discount = max(0, pos_pir_num($row["discount"] ?? 0));
  $net = pos_pir_num($row["net"] ?? $row["amount"] ?? 0);
  $gst = pos_pir_num($row["gst"] ?? $row["gst_amount"] ?? 0);
  $hasTotal = array_key_exists("total_amount", $row) || array_key_exists("total", $row);
  $total = $hasTotal ? pos_pir_num($row["total_amount"] ?? $row["total"] ?? 0) : pos_pir_round($net + $gst);
  $invoice = trim((string) ($row["supplier_invoice_number"] ?? $row["invoice"] ?? ""));
  $number = trim((string) ($row["purchase_number"] ?? ""));
  return [
    "id" => (string) ($row["id"] ?? ""),
    "item_id" => (string) ($row["item_id"] ?? ""),
    "product_name" => (string) ($row["product_name"] ?? $row["item_name"] ?? $row["catalog_name"] ?? $row["name"] ?? "Item"),
    "product_code" => (string) ($row["product_code"] ?? $row["code"] ?? $row["item_barcode"] ?? $row["line_barcode"] ?? $row["barcode"] ?? ""),
    "category" => (string) ($row["category"] ?? ""),
    "brand" => (string) ($row["brand"] ?? ""),
    "supplier" => (string) ($row["supplier"] ?? $row["supplier_name"] ?? ""),
    "purchase_qty" => $purchase,
    "free_qty" => $free,
    "total_qty" => $purchase + $free,
    "rate" => pos_pir_num($row["rate"] ?? $row["rate_per_kg"] ?? 0),
    "discount" => $discount,
    "net" => $net,
    "gst" => $gst,
    "total" => $total,
    "purchase_date" => pos_pir_day($row["purchase_date"] ?? ""),
    "purchase_time" => pos_pir_clock($row["purchase_time"] ?? ($row["created_at"] ?? "")),
    "batch_id" => pos_pir_batch($row),
    "invoice" => $invoice !== "" ? $invoice : $number,
    "purchase_number" => $number,
    "purchase_id" => (string) ($row["purchase_id"] ?? ""),
    "branch" => (string) ($row["branch"] ?? $row["branch_name"] ?? ""),
    "branch_id" => (string) ($row["branch_id"] ?? ""),
    "status" => (string) ($row["status"] ?? "posted"),
    "kind" => (string) ($row["kind"] ?? "purchase"),
  ];
}

function pos_pir_unique($rows) {
  $seen = [];
  $out = [];
  foreach ($rows as $row) {
    $line = pos_pir_line($row);
    if (pos_pir_cancelled($line["status"])) continue;
    if ($line["id"] !== "") {
      if (isset($seen[$line["id"]])) continue;
      $seen[$line["id"]] = true;
    }
    $out[] = $line;
  }
  return $out;
}

function pos_pir_returns($rows, $purchases) {
  $already = [];
  foreach ($purchases as $line) {
    if ($line["purchase_qty"] < 0 && $line["item_id"] !== "") $already[$line["item_id"]] = true;
  }
  $seen = [];
  $out = [];
  foreach ($rows as $row) {
    $qty = abs(pos_pir_num($row["qty"] ?? $row["quantity_gm"] ?? 0));
    $value = abs(pos_pir_num($row["value"] ?? $row["amount"] ?? 0));
    $line = pos_pir_line([
      "id" => "return:" . ($row["item_id"] ?? "") . ":" . pos_pir_day($row["purchase_date"] ?? ""),
      "item_id" => $row["item_id"] ?? "",
      "item_name" => $row["item_name"] ?? $row["product_name"] ?? $row["name"] ?? "",
      "code" => $row["code"] ?? $row["product_code"] ?? $row["barcode"] ?? "",
      "category" => $row["category"] ?? "",
      "brand" => $row["brand"] ?? "",
      "supplier_name" => "Purchase return",
      "quantity_gm" => -$qty,
      "free_qty" => 0,
      "rate_per_kg" => $qty ? $value / $qty : 0,
      "discount" => 0,
      "amount" => -$value,
      "gst_amount" => 0,
      "total_amount" => -$value,
      "purchase_date" => $row["purchase_date"] ?? "",
      "purchase_number" => "Return",
      "supplier_invoice_number" => "Return",
      "kind" => "return",
      "status" => "posted",
    ]);
    if ($line["item_id"] === "" || isset($already[$line["item_id"]]) || $line["purchase_qty"] == 0.0 || isset($seen[$line["id"]])) continue;
    $seen[$line["id"]] = true;
    $out[] = $line;
  }
  return $out;
}

function pos_pir_match($line, $filters) {
  if (($filters["item"] ?? "") !== "") {
    if ($line["item_id"] !== (string) $filters["item"]) return false;
  } elseif (!pos_pir_has($line["product_name"] . " " . $line["product_code"], $filters["product"] ?? "")) {
    return false;
  }
  if (!pos_pir_has($line["category"], $filters["category"] ?? "")) return false;
  if (!pos_pir_has($line["supplier"], $filters["supplier"] ?? "")) return false;
  if (!pos_pir_has($line["brand"], $filters["brand"] ?? "")) return false;
  if (!pos_pir_has($line["invoice"] . " " . $line["purchase_number"], $filters["invoice"] ?? "")) return false;
  if (($filters["branch"] ?? "") !== "") {
    $branch = (string) $filters["branch"];
    if ($line["branch_id"] !== $branch && !pos_pir_has($line["branch"], $branch)) return false;
  }
  return true;
}

function pos_pir_summary($lines) {
  $items = [];
  $summary = ["items" => 0, "purchaseQty" => 0, "freeQty" => 0, "amount" => 0, "gst" => 0, "discount" => 0];
  foreach ($lines as $line) {
    if ($line["kind"] !== "return" && $line["total_qty"] != 0.0) {
      $key = $line["item_id"] !== "" ? $line["item_id"] : $line["product_name"];
      $items[$key] = true;
    }
    $summary["purchaseQty"] += $line["purchase_qty"];
    $summary["freeQty"] += $line["free_qty"];
    $summary["amount"] += $line["total"];
    $summary["gst"] += $line["gst"];
    $summary["discount"] += $line["discount"];
  }
  $summary["items"] = count($items);
  foreach (["purchaseQty", "freeQty", "amount", "gst", "discount"] as $key) $summary[$key] = pos_pir_round($summary[$key]);
  return $summary;
}

function pos_pir_suppliers($lines) {
  $map = [];
  foreach ($lines as $line) {
    $key = $line["supplier"] !== "" ? $line["supplier"] : "Supplier";
    if (!isset($map[$key])) {
      $map[$key] = ["supplier" => $key, "items" => [], "purchaseQty" => 0, "freeQty" => 0, "amount" => 0, "gst" => 0, "discount" => 0];
    }
    $item = $line["item_id"] !== "" ? $line["item_id"] : $line["product_name"];
    if ($item !== "") $map[$key]["items"][$item] = true;
    $map[$key]["purchaseQty"] += $line["purchase_qty"];
    $map[$key]["freeQty"] += $line["free_qty"];
    $map[$key]["amount"] += $line["total"];
    $map[$key]["gst"] += $line["gst"];
    $map[$key]["discount"] += $line["discount"];
  }
  $out = [];
  foreach ($map as $row) {
    $out[] = [
      "supplier" => $row["supplier"],
      "items" => count($row["items"]),
      "purchaseQty" => pos_pir_round($row["purchaseQty"]),
      "freeQty" => pos_pir_round($row["freeQty"]),
      "amount" => pos_pir_round($row["amount"]),
      "gst" => pos_pir_round($row["gst"]),
      "discount" => pos_pir_round($row["discount"]),
    ];
  }
  usort($out, function ($a, $b) {
    if ($a["amount"] == $b["amount"]) return strcmp($a["supplier"], $b["supplier"]);
    return $a["amount"] < $b["amount"] ? 1 : -1;
  });
  return $out;
}

function pos_pir_rates($lines) {
  $map = [];
  foreach ($lines as $line) {
    if ($line["kind"] === "return" || $line["purchase_qty"] <= 0) continue;
    $key = $line["item_id"] !== "" ? $line["item_id"] : $line["product_name"];
    if (!isset($map[$key])) {
      $map[$key] = [
        "item_id" => $line["item_id"],
        "product_name" => $line["product_name"],
        "product_code" => $line["product_code"],
        "bills" => 0,
        "min" => $line["rate"],
        "max" => $line["rate"],
        "weighted" => 0,
        "qty" => 0,
        "amount" => 0,
      ];
    }
    $map[$key]["bills"] += 1;
    $map[$key]["min"] = min($map[$key]["min"], $line["rate"]);
    $map[$key]["max"] = max($map[$key]["max"], $line["rate"]);
    $map[$key]["weighted"] += $line["rate"] * $line["purchase_qty"];
    $map[$key]["qty"] += $line["purchase_qty"];
    $map[$key]["amount"] += $line["total"];
    if ($map[$key]["product_code"] === "" && $line["product_code"] !== "") $map[$key]["product_code"] = $line["product_code"];
  }
  $out = [];
  foreach ($map as $row) {
    $out[] = [
      "item_id" => $row["item_id"],
      "product_name" => $row["product_name"],
      "product_code" => $row["product_code"],
      "bills" => $row["bills"],
      "min" => pos_pir_round($row["min"]),
      "max" => pos_pir_round($row["max"]),
      "avg" => $row["qty"] ? pos_pir_round($row["weighted"] / $row["qty"]) : 0,
      "qty" => pos_pir_round($row["qty"]),
      "amount" => pos_pir_round($row["amount"]),
    ];
  }
  usort($out, function ($a, $b) {
    return strcmp($a["product_name"], $b["product_name"]);
  });
  return $out;
}

function pos_pir_line_sql($flags) {
  $discount = $flags["discount"] ? "COALESCE(pl.discount,0)" : "0";
  $free = $flags["free"] ? "COALESCE(pl.free_qty,0)" : "0";
  $status = $flags["status"] ? "COALESCE(p.status,'posted')" : "'posted'";
  $brand = $flags["brand"] ? "COALESCE(i.brand,'')" : "''";
  $branchJoin = $flags["branch"] ? "LEFT JOIN branches br ON br.id = p.branch_id" : "";
  $branchName = $flags["branch"] ? "br.name" : "''";
  $batch = !empty($flags["batch"])
    ? "COALESCE(pl.batch_id,'') AS batch_id, COALESCE(pl.batch_no,'') AS batch_no"
    : "'' AS batch_id, '' AS batch_no";
  $statusWhere = $flags["status"]
    ? "AND LOWER(COALESCE(p.status,'posted')) NOT IN ('cancelled','canceled','void','voided')"
    : "";
  return "SELECT pl.id, pl.item_id, pl.item_name, pl.quantity_gm, $free AS free_qty, pl.rate_per_kg,
            $discount AS discount, pl.gst_amount, pl.amount, pl.total_amount, pl.barcode AS line_barcode,
            $batch, DATE_FORMAT(p.created_at, '%H:%i') AS purchase_time,
            p.id AS purchase_id, p.purchase_number, p.supplier_invoice_number, p.supplier_name,
            p.purchase_date, p.branch_id, $status AS status,
            i.code, i.barcode AS item_barcode, i.category, $brand AS brand, i.name AS catalog_name,
            $branchName AS branch_name
     FROM purchase_lines pl
     JOIN purchases p ON p.id = pl.purchase_id AND p.business_id = pl.business_id
     LEFT JOIN items i ON i.id = pl.item_id AND i.business_id = p.business_id
     $branchJoin
     WHERE p.business_id = ? AND p.purchase_date >= ? AND p.purchase_date < DATE_ADD(?, INTERVAL 1 DAY)
     $statusWhere";
}

function pos_pir_select_lines($bid, $from, $to) {
  $plans = [
    ["discount" => 1, "free" => 1, "status" => 1, "brand" => 1, "branch" => 1, "batch" => 1],
    ["discount" => 1, "free" => 1, "status" => 0, "brand" => 1, "branch" => 1, "batch" => 1],
    ["discount" => 0, "free" => 0, "status" => 0, "brand" => 1, "branch" => 1, "batch" => 0],
    ["discount" => 0, "free" => 0, "status" => 0, "brand" => 0, "branch" => 0, "batch" => 0],
  ];
  $last = "Purchase lines did not load";
  foreach ($plans as $flags) {
    try {
      return pos_q(pos_pir_line_sql($flags), "sss", [$bid, $from, $to]);
    } catch (Exception $e) {
      $last = $e->getMessage();
    }
  }
  throw new Exception($last);
}

function pos_pir_select_returns($bid, $from, $to) {
  $rows = pos_pir_try(
    "SELECT m.item_id, i.name AS item_name, i.code, i.barcode, i.category, i.brand,
            DATE(m.created_at) AS purchase_date,
            DATE_FORMAT(MIN(m.created_at), '%H:%i') AS purchase_time,
            SUM(ABS(m.quantity_gm)) AS qty,
            SUM(ABS(m.quantity_gm) * ABS(COALESCE(m.unit_cost,0))) AS value
     FROM stock_movements m
     LEFT JOIN items i ON i.id = m.item_id AND i.business_id = m.business_id
     WHERE m.business_id = ?
       AND m.created_at >= ? AND m.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       AND (m.ref_type IN ('purchase_return','preturn','debit') OR m.kind IN ('purchase_return','purchase-return','preturn'))
     GROUP BY m.item_id, i.name, i.code, i.barcode, i.category, i.brand, DATE(m.created_at)",
    "sss",
    [$bid, $from, $to]
  );
  return is_array($rows) ? $rows : [];
}

function pos_pir_filters_from($query) {
  $keys = ["product", "category", "supplier", "brand", "invoice", "branch", "item"];
  $out = [];
  foreach ($keys as $key) $out[$key] = trim((string) ($query[$key] ?? ""));
  return $out;
}

function pos_pir_build($bid, $from, $to, $filters) {
  if (function_exists("pos_ensure_purchase_line_columns")) pos_ensure_purchase_line_columns();
  $raw = pos_pir_select_lines($bid, $from, $to);
  $returns = pos_pir_select_returns($bid, $from, $to);
  $purchases = pos_pir_unique($raw);
  $lines = [];
  foreach (array_merge($purchases, pos_pir_returns($returns, $purchases)) as $line) {
    if (pos_pir_match($line, $filters)) $lines[] = $line;
  }
  $branches = pos_pir_try("SELECT id, name FROM branches WHERE business_id = ? ORDER BY name", "s", [$bid]);
  $branchRows = [];
  foreach (is_array($branches) ? $branches : [] as $row) {
    $branchRows[] = ["id" => $row["id"], "name" => $row["name"] ?: "Branch"];
  }
  $q = ["from" => $from, "to" => $to];
  foreach ($filters as $key => $value) {
    if ($value !== "") $q[$key] = $value;
  }
  $queryText = http_build_query($q);
  return [
    "from" => $from,
    "to" => $to,
    "filters" => $filters,
    "branches" => $branchRows,
    "summary" => pos_pir_summary($lines),
    "lines" => $lines,
    "suppliers" => pos_pir_suppliers($lines),
    "rates" => pos_pir_rates($lines),
    "links" => [
      "excel" => "/api/reports/item-purchases/excel?" . $queryText,
      "pdf" => "/api/reports/item-purchases/pdf?" . $queryText,
      "csv" => "/api/reports/item-purchases/csv?" . $queryText,
    ],
    "php" => true,
  ];
}

function pos_pir_cells($line) {
  return [
    $line["product_name"], $line["product_code"], $line["category"], $line["supplier"],
    $line["purchase_qty"], $line["free_qty"], $line["total_qty"], $line["rate"],
    $line["discount"], $line["gst"], $line["total"], $line["purchase_date"],
    $line["purchase_time"], $line["batch_id"],
    $line["invoice"], $line["branch"],
  ];
}

function pos_pir_csv_cell($value) {
  $text = (string) $value;
  if (preg_match('/[",\n]/', $text)) return '"' . str_replace('"', '""', $text) . '"';
  return $text;
}

function pos_pir_csv($report) {
  $headers = ["Product Name", "Product Code", "Category", "Supplier", "Purchase Qty", "Free Qty", "Total Qty", "Purchase Rate", "Discount", "GST", "Total Amount", "Purchase Date", "Time", "Batch ID", "Invoice", "Branch"];
  $lines = [implode(",", $headers)];
  foreach ($report["lines"] as $line) {
    $cells = [];
    foreach (pos_pir_cells($line) as $cell) $cells[] = pos_pir_csv_cell($cell);
    $lines[] = implode(",", $cells);
  }
  return "\xEF\xBB\xBF" . implode("\n", $lines) . "\n";
}

function pos_pir_pdf_escape($value) {
  $text = str_replace(["\\", "(", ")"], ["\\\\", "\\(", "\\)"], (string) $value);
  return preg_replace("/[^\\x20-\\x7E]/", " ", $text);
}

function pos_pir_pdf($report) {
  $s = $report["summary"];
  $text = [
    "Item-Wise Purchase Report",
    "Range " . $report["from"] . " to " . $report["to"],
    "Items " . $s["items"] . "  Qty " . $s["purchaseQty"] . "  Free " . $s["freeQty"],
    "Amount " . $s["amount"] . "  GST " . $s["gst"] . "  Discount " . $s["discount"],
    "",
  ];
  foreach ($report["lines"] as $line) {
    $text[] = $line["purchase_date"] . "  " . $line["product_name"] . "  " . $line["supplier"] . "  Qty " . $line["purchase_qty"] . "+" . $line["free_qty"] . "  Rs " . $line["total"] . "  " . $line["invoice"];
  }
  if (!$text) $text = ["No rows"];
  $pages = array_chunk($text, 46);
  $objects = [];
  $objects[] = "<< /Type /Catalog /Pages 2 0 R >>";
  $kids = [];
  for ($i = 0; $i < count($pages); $i++) $kids[] = (3 + $i * 2) . " 0 R";
  $objects[] = "<< /Type /Pages /Kids [" . implode(" ", $kids) . "] /Count " . count($pages) . " >>";
  $fontId = 3 + count($pages) * 2;
  foreach ($pages as $index => $lines) {
    $commands = ["BT", "/F1 10 Tf", "40 800 Td", "14 TL"];
    foreach ($lines as $i => $line) {
      $bit = "(" . pos_pir_pdf_escape(substr($line, 0, 110)) . ")";
      $commands[] = $i === 0 ? $bit . " Tj" : $bit . " '";
    }
    $commands[] = "ET";
    $stream = implode("\n", $commands);
    $objects[] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents " . (4 + $index * 2) . " 0 R /Resources << /Font << /F1 " . $fontId . " 0 R >> >> >>";
    $objects[] = "<< /Length " . strlen($stream) . " >>\nstream\n" . $stream . "\nendstream";
  }
  $objects[] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  $body = "%PDF-1.4\n";
  $offsets = [0];
  foreach ($objects as $i => $obj) {
    $offsets[] = strlen($body);
    $body .= ($i + 1) . " 0 obj\n" . $obj . "\nendobj\n";
  }
  $xrefAt = strlen($body);
  $xref = "xref\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";
  for ($i = 1; $i < count($offsets); $i++) $xref .= str_pad((string) $offsets[$i], 10, "0", STR_PAD_LEFT) . " 00000 n \n";
  $body .= $xref . "trailer << /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n" . $xrefAt . "\n%%EOF";
  return $body;
}

function pos_pir_send($path, $report) {
  if (substr($path, -6) === "/excel") {
    require_once __DIR__ . "/pos-reports.php";
    $s = $report["summary"];
    $sheets = [
      ["name" => "Item-Wise Purchase", "headers" => ["Product Name", "Product Code", "Category", "Supplier", "Purchase Qty", "Free Qty", "Total Qty", "Purchase Rate", "Discount", "GST", "Total Amount", "Purchase Date", "Time", "Batch ID", "Invoice", "Branch"], "rows" => array_map("pos_pir_cells", $report["lines"])],
      ["name" => "Summary", "headers" => ["Total Items", "Purchase Qty", "Free Qty", "Purchase Amount", "GST", "Discount"], "rows" => [[$s["items"], $s["purchaseQty"], $s["freeQty"], $s["amount"], $s["gst"], $s["discount"]]]],
      ["name" => "Supplier analysis", "headers" => ["Supplier", "Items", "Purchase Qty", "Free Qty", "Amount", "GST", "Discount"], "rows" => array_map(function ($row) {
        return [$row["supplier"], $row["items"], $row["purchaseQty"], $row["freeQty"], $row["amount"], $row["gst"], $row["discount"]];
      }, $report["suppliers"])],
      ["name" => "Rate comparison", "headers" => ["Product", "Code", "Bills", "Min rate", "Max rate", "Avg rate", "Purchase Qty", "Amount"], "rows" => array_map(function ($row) {
        return [$row["product_name"], $row["product_code"], $row["bills"], $row["min"], $row["max"], $row["avg"], $row["qty"], $row["amount"]];
      }, $report["rates"])],
    ];
    http_response_code(200);
    header("Content-Type: application/vnd.ms-excel; charset=utf-8");
    header("Content-Disposition: attachment; filename=\"item-wise-purchase-" . $report["from"] . "-to-" . $report["to"] . ".xls\"");
    echo pos_workbook_xml($sheets);
    exit;
  }
  if (substr($path, -4) === "/pdf") {
    http_response_code(200);
    header("Content-Type: application/pdf");
    header("Content-Disposition: attachment; filename=\"item-wise-purchase-" . $report["from"] . "-to-" . $report["to"] . ".pdf\"");
    echo pos_pir_pdf($report);
    exit;
  }
  if (substr($path, -4) === "/csv") {
    http_response_code(200);
    header("Content-Type: text/csv; charset=utf-8");
    header("Content-Disposition: attachment; filename=\"item-wise-purchase-" . $report["from"] . "-to-" . $report["to"] . ".csv\"");
    echo pos_pir_csv($report);
    exit;
  }
  pos_send(200, $report);
}

function pos_item_purchases_shop($path, $bid, $auth) {
  $user = $auth["user"] ?? [];
  if (!function_exists("pos_can") || !pos_can($user, "reports")) {
    pos_send(403, ["error" => "You do not have permission for this module", "php" => true]);
  }
  $from = substr((string) ($_GET["from"] ?? ""), 0, 10);
  $to = substr((string) ($_GET["to"] ?? ""), 0, 10);
  if (!preg_match("/^\d{4}-\d{2}-\d{2}$/", $from) || !preg_match("/^\d{4}-\d{2}-\d{2}$/", $to)) {
    pos_send(400, ["error" => "Choose a from and to date", "php" => true]);
  }
  if ($from > $to) {
    $swap = $from;
    $from = $to;
    $to = $swap;
  }
  pos_pir_send($path, pos_pir_build($bid, $from, $to, pos_pir_filters_from($_GET)));
}
