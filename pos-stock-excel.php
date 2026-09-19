<?php

function pos_stock_display_qty($qty, $unit) {
  $n = (float) $qty;
  $u = function_exists("pos_item_unit") ? pos_item_unit($unit) : strtoupper((string) $unit);
  if ($u === "KG" || $u === "LTR") return round($n / 1000, 3);
  return $n;
}

function pos_stock_alert($row) {
  $stock = (float) ($row["stock_gm"] ?? 0);
  $reorder = (float) ($row["reorder_level_gm"] ?? 0);
  if ($stock <= 0) return "Out";
  if ($stock <= $reorder) return "Low";
  return "OK";
}

function pos_stock_excel_headers($biz = null) {
  $tax = function_exists("pos_tax_code_label") ? pos_tax_code_label($biz ?: []) : "HSN";
  return [
    "Code", "Name", "Barcode", $tax, "Category", "Subcategory", "Unit",
    "On hand", "Reorder", "Alert", "Purchase", "Retail", "B2B", "Value", "GST %", "Item status",
  ];
}

function pos_stock_excel_row($item) {
  $unit = pos_item_unit($item);
  $value = function_exists("pos_line_amount_for_item")
    ? pos_round2(pos_line_amount_for_item($item["stock_gm"] ?? 0, $item["purchase_rate"] ?? 0, $item))
    : 0;
  $inactive = strtolower((string) ($item["status"] ?? "")) === "inactive";
  return [
    $item["code"] ?? "",
    $item["name"] ?? "",
    $item["barcode"] ?? "",
    $item["hsn"] ?? "",
    $item["category"] ?? "",
    $item["subcategory"] ?? "",
    $unit,
    pos_stock_display_qty($item["stock_gm"] ?? 0, $unit),
    pos_stock_display_qty($item["reorder_level_gm"] ?? 0, $unit),
    pos_stock_alert($item),
    (float) ($item["purchase_rate"] ?? 0),
    (float) ($item["retail_rate"] ?? 0),
    (float) ($item["b2b_rate"] ?? 0),
    $value,
    (float) ($item["gst_rate"] ?? 0),
    $inactive ? "Inactive" : "Active",
  ];
}

function pos_stock_batch_excel_row($batch) {
  $unit = pos_item_unit($batch);
  $remaining = $batch["remaining_gm"] ?? 0;
  $rate = $batch["unit_cost"] ?? $batch["purchase_rate"] ?? 0;
  $valueItem = ["stock_gm" => $remaining, "purchase_rate" => $rate, "base_unit" => $unit, "unit" => $unit];
  $value = function_exists("pos_line_amount_for_item")
    ? pos_round2(pos_line_amount_for_item($remaining, $rate, $valueItem))
    : 0;
  return [
    $batch["item_code"] ?? $batch["code"] ?? "",
    $batch["item_name"] ?? $batch["name"] ?? "",
    $batch["batch_no"] ?? "",
    $batch["expiry_date"] ?? "",
    pos_stock_display_qty($remaining, $unit),
    $unit,
    (float) $rate,
    (float) ($batch["mrp"] ?? 0),
    $value,
  ];
}

function pos_stock_to_sheets($rows, $biz = null, $batches = []) {
  $list = is_array($rows) ? $rows : [];
  $all = [];
  $low = [];
  foreach ($list as $item) {
    $row = pos_stock_excel_row($item);
    $all[] = $row;
    if (pos_stock_alert($item) !== "OK") $low[] = $row;
  }
  $headers = pos_stock_excel_headers($biz);
  $sheets = [
    ["name" => "Stock", "headers" => $headers, "rows" => $all],
    ["name" => "Low stock", "headers" => $headers, "rows" => $low],
  ];
  $pharmacy = function_exists("pos_shop_kind") && pos_shop_kind($biz ?: []) === "pharmacy";
  if ($pharmacy) {
    $batchHeaders = ["Code", "Name", "Batch no", "Expiry", "On hand", "Unit", "Purchase", "MRP", "Value"];
    $batchRows = [];
    foreach (is_array($batches) ? $batches : [] as $batch) {
      if ((float) ($batch["remaining_gm"] ?? 0) <= 0) continue;
      $batchRows[] = pos_stock_batch_excel_row($batch);
    }
    $sheets[] = ["name" => "Batches", "headers" => $batchHeaders, "rows" => $batchRows];
  }
  return $sheets;
}

function pos_stock_excel_response($bid) {
  if (!function_exists("pos_workbook_xml")) {
    require_once __DIR__ . "/pos-reports.php";
  }
  $rows = pos_q("SELECT * FROM items WHERE business_id = ? ORDER BY name", "s", [$bid]);
  if (!is_array($rows)) $rows = [];
  $bizRows = pos_q("SELECT name, category, business_type FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]);
  $biz = is_array($bizRows) && $bizRows ? $bizRows[0] : [];
  $batches = [];
  if (function_exists("pos_shop_kind") && pos_shop_kind($biz) === "pharmacy") {
    $found = pos_q(
      "SELECT b.batch_no, b.remaining_gm, b.unit_cost, b.mrp,
              DATE_FORMAT(b.expiry_date, '%Y-%m-%d') AS expiry_date,
              i.name AS item_name, i.code AS item_code, i.base_unit, i.unit, i.purchase_rate
       FROM stock_batches b JOIN items i ON i.id = b.item_id
       WHERE b.business_id = ? AND b.remaining_gm > 0
       ORDER BY i.name ASC, (b.expiry_date IS NULL) ASC, b.expiry_date ASC, b.batch_no ASC
       LIMIT 800",
      "s",
      [$bid]
    );
    $batches = is_array($found) ? $found : [];
  }
  $xml = pos_workbook_xml(pos_stock_to_sheets($rows, $biz, $batches));
  $day = date("Y-m-d");
  http_response_code(200);
  header("Content-Type: application/vnd.ms-excel; charset=utf-8");
  header("Content-Disposition: attachment; filename=\"stock-list-" . $day . ".xls\"");
  echo $xml;
  exit;
}
