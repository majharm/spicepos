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

function pos_stock_excel_headers() {
  return [
    "Code", "Name", "Barcode", "HSN", "Category", "Subcategory", "Unit",
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

function pos_stock_to_sheets($rows) {
  $list = is_array($rows) ? $rows : [];
  $all = [];
  $low = [];
  foreach ($list as $item) {
    $row = pos_stock_excel_row($item);
    $all[] = $row;
    if (pos_stock_alert($item) !== "OK") $low[] = $row;
  }
  $headers = pos_stock_excel_headers();
  return [
    ["name" => "Stock", "headers" => $headers, "rows" => $all],
    ["name" => "Low stock", "headers" => $headers, "rows" => $low],
  ];
}

function pos_stock_excel_response($bid) {
  if (!function_exists("pos_workbook_xml")) {
    require_once __DIR__ . "/pos-reports.php";
  }
  $rows = pos_q("SELECT * FROM items WHERE business_id = ? ORDER BY name", "s", [$bid]);
  if (!is_array($rows)) $rows = [];
  $xml = pos_workbook_xml(pos_stock_to_sheets($rows));
  $day = date("Y-m-d");
  http_response_code(200);
  header("Content-Type: application/vnd.ms-excel; charset=utf-8");
  header("Content-Disposition: attachment; filename=\"stock-list-" . $day . ".xls\"");
  echo $xml;
  exit;
}
