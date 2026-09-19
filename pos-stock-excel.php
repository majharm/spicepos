<?php

function pos_stock_excel_ymd($value) {
  $s = trim((string) $value);
  if (preg_match('/^(\d{4}-\d{2}-\d{2})/', $s, $m)) return $m[1];
  if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $s, $m)) return $m[3] . "-" . $m[2] . "-" . $m[1];
  return "";
}

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
    "Code", "Name", "Generic / local", "Type", "Manufacturer", "Pack size", "Pack unit", "Items per pack",
    "Batch no", "Expiry", "Barcode", $tax, "Category", "Subcategory", "Unit",
    "On hand", "Reorder", "Alert", "Purchase", "Retail", "MRP", "B2B", "Value", "GST %",
    "Colour", "Size", "Wearer", "Item status",
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
    $item["generic_name"] ?? $item["local_name"] ?? "",
    $item["medicine_type"] ?? "",
    $item["manufacturer"] ?? "",
    $item["pack_size"] ?? "",
    $item["pack_unit"] ?? "",
    $item["units_per_pack"] ?? "",
    $item["primary_batch_no"] ?? $item["batch_no"] ?? "",
    pos_stock_excel_ymd($item["primary_expiry"] ?? $item["default_expiry"] ?? $item["expiry_date"] ?? ""),
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
    (float) ($item["mrp"] ?? $item["retail_rate"] ?? 0),
    (float) ($item["b2b_rate"] ?? 0),
    $value,
    (float) ($item["gst_rate"] ?? 0),
    $item["color"] ?? "",
    $item["size"] ?? "",
    $item["wearer_type"] ?? "",
    $inactive ? "Inactive" : "Active",
  ];
}

function pos_stock_batch_excel_row($batch) {
  $unit = pos_item_unit($batch);
  $remaining = $batch["remaining_gm"] ?? 0;
  $received = $batch["qty_gm"] ?? $remaining;
  $rate = $batch["unit_cost"] ?? $batch["purchase_rate"] ?? 0;
  $valueItem = ["stock_gm" => $remaining, "purchase_rate" => $rate, "base_unit" => $unit, "unit" => $unit];
  $value = function_exists("pos_line_amount_for_item")
    ? pos_round2(pos_line_amount_for_item($remaining, $rate, $valueItem))
    : 0;
  $inactive = strtolower((string) ($batch["item_status"] ?? $batch["status"] ?? "")) === "inactive";
  return [
    $batch["item_code"] ?? $batch["code"] ?? "",
    $batch["item_name"] ?? $batch["name"] ?? "",
    $batch["generic_name"] ?? $batch["local_name"] ?? "",
    $batch["medicine_type"] ?? "",
    $batch["manufacturer"] ?? "",
    $batch["batch_no"] ?? "",
    $batch["barcode"] ?? $batch["batch_barcode"] ?? "",
    pos_stock_excel_ymd($batch["expiry_date"] ?? $batch["item_default_expiry"] ?? $batch["default_expiry"] ?? ""),
    pos_stock_excel_ymd($batch["manufactured_date"] ?? ""),
    pos_stock_display_qty($remaining, $unit),
    pos_stock_display_qty($received, $unit),
    $unit,
    (float) $rate,
    (float) ($batch["mrp"] ?? 0),
    (float) ($batch["retail_rate"] ?? 0),
    $value,
    $batch["hsn"] ?? "",
    $batch["category"] ?? "",
    $batch["supplier_name"] ?? "",
    $inactive ? "Inactive" : "Active",
  ];
}

function pos_on_hand_batches($batches) {
  $out = [];
  foreach (is_array($batches) ? $batches : [] as $batch) {
    if ((float) ($batch["remaining_gm"] ?? 0) > 0) $out[] = $batch;
  }
  return $out;
}

function pos_stock_excel_row_from_batch($batch) {
  return pos_stock_excel_row([
    "code" => $batch["item_code"] ?? $batch["code"] ?? "",
    "name" => $batch["item_name"] ?? $batch["name"] ?? "",
    "generic_name" => $batch["generic_name"] ?? "",
    "local_name" => $batch["local_name"] ?? "",
    "medicine_type" => $batch["medicine_type"] ?? "",
    "manufacturer" => $batch["manufacturer"] ?? "",
    "pack_size" => $batch["pack_size"] ?? "",
    "pack_unit" => $batch["pack_unit"] ?? "",
    "units_per_pack" => $batch["units_per_pack"] ?? "",
    "batch_no" => $batch["batch_no"] ?? "",
    "default_expiry" => $batch["expiry_date"] ?? $batch["item_default_expiry"] ?? "",
    "barcode" => $batch["barcode"] ?? $batch["item_barcode"] ?? "",
    "hsn" => $batch["hsn"] ?? "",
    "category" => $batch["category"] ?? "",
    "subcategory" => $batch["subcategory"] ?? "",
    "base_unit" => $batch["base_unit"] ?? "",
    "unit" => $batch["unit"] ?? "",
    "stock_gm" => $batch["remaining_gm"] ?? 0,
    "reorder_level_gm" => $batch["reorder_level_gm"] ?? 0,
    "purchase_rate" => $batch["unit_cost"] ?? $batch["purchase_rate"] ?? 0,
    "retail_rate" => $batch["retail_rate"] ?? 0,
    "mrp" => $batch["mrp"] ?? 0,
    "b2b_rate" => $batch["b2b_rate"] ?? 0,
    "gst_rate" => $batch["gst_rate"] ?? 0,
    "color" => $batch["color"] ?? "",
    "size" => $batch["size"] ?? "",
    "wearer_type" => $batch["wearer_type"] ?? "",
    "status" => $batch["item_status"] ?? $batch["status"] ?? "",
  ]);
}

function pos_stock_to_sheets($rows, $biz = null, $batches = []) {
  $list = is_array($rows) ? $rows : [];
  $skuRows = [];
  $low = [];
  foreach ($list as $item) {
    $row = pos_stock_excel_row($item);
    $skuRows[] = $row;
    if (pos_stock_alert($item) !== "OK") $low[] = $row;
  }
  $headers = pos_stock_excel_headers($biz);
  $live = pos_on_hand_batches($batches);
  $pharmacy = function_exists("pos_shop_kind") && pos_shop_kind($biz ?: []) === "pharmacy";
  if ($pharmacy || count($live) > 0) {
    $covered = [];
    foreach ($live as $batch) {
      $id = (string) ($batch["item_id"] ?? "");
      if ($id !== "") $covered[$id] = true;
    }
    $stockRows = [];
    foreach ($live as $batch) $stockRows[] = pos_stock_excel_row_from_batch($batch);
    foreach ($list as $item) {
      $id = (string) ($item["id"] ?? "");
      if ($id === "" || isset($covered[$id])) continue;
      $stockRows[] = pos_stock_excel_row($item);
    }
    return [
      ["name" => "Stock", "headers" => $headers, "rows" => $stockRows],
      ["name" => "SKUs", "headers" => $headers, "rows" => $skuRows],
      ["name" => "Low stock", "headers" => $headers, "rows" => $low],
    ];
  }
  return [
    ["name" => "Stock", "headers" => $headers, "rows" => $skuRows],
    ["name" => "Low stock", "headers" => $headers, "rows" => $low],
  ];
}

function pos_stock_excel_batches($bid) {
  try {
    $found = pos_q(
      "SELECT b.id, b.item_id, b.batch_no, b.barcode, b.qty_gm, b.remaining_gm, b.unit_cost, b.mrp,
              DATE_FORMAT(b.expiry_date, '%Y-%m-%d') AS expiry_date,
              DATE_FORMAT(b.manufactured_date, '%Y-%m-%d') AS manufactured_date,
              i.name AS item_name, i.code AS item_code, i.base_unit, i.unit, i.purchase_rate, i.retail_rate, i.b2b_rate, i.gst_rate, i.mrp AS item_mrp,
              i.generic_name, i.local_name, i.medicine_type, i.manufacturer, i.pack_size, i.pack_unit, i.units_per_pack,
              i.hsn, i.category, i.subcategory, i.barcode AS item_barcode, i.reorder_level_gm, i.status AS item_status,
              DATE_FORMAT(i.default_expiry, '%Y-%m-%d') AS item_default_expiry,
              s.name AS supplier_name
       FROM stock_batches b
       JOIN items i ON i.id = b.item_id
       LEFT JOIN suppliers s ON s.id = b.supplier_id
       WHERE b.business_id = ?
       ORDER BY i.name ASC, (b.expiry_date IS NULL) ASC, b.expiry_date ASC, b.batch_no ASC, b.id ASC
       LIMIT 10000",
      "s",
      [$bid]
    );
    return is_array($found) ? $found : [];
  } catch (Exception $e) {
    return [];
  }
}

function pos_stock_excel_response($bid) {
  if (!function_exists("pos_workbook_xml")) {
    require_once __DIR__ . "/pos-reports.php";
  }
  $rows = pos_q("SELECT * FROM items WHERE business_id = ? ORDER BY name", "s", [$bid]);
  if (!is_array($rows)) $rows = [];
  $bizRows = pos_q("SELECT name, category, business_type FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]);
  $biz = is_array($bizRows) && $bizRows ? $bizRows[0] : [];
  $batches = pos_stock_excel_batches($bid);
  $xml = pos_workbook_xml(pos_stock_to_sheets($rows, $biz, $batches));
  $day = date("Y-m-d");
  http_response_code(200);
  header("Content-Type: application/vnd.ms-excel; charset=utf-8");
  header("Content-Disposition: attachment; filename=\"stock-list-" . $day . ".xls\"");
  echo $xml;
  exit;
}
