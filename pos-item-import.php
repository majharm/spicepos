<?php

function pos_item_import_max_rows() {
  return 500;
}

function pos_item_import_headers() {
  return [
    "Name", "HSN", "Category", "Subcategory", "Unit", "MRP", "GST %", "Retail", "B2B", "Purchase",
    "Stock", "Barcode", "Manufacturer barcode", "Code", "Colour", "Size", "Wearer",
  ];
}

function pos_item_import_header_key($raw) {
  $n = strtolower(trim((string) $raw));
  $n = str_replace("%", " percent ", $n);
  $n = preg_replace("/[^a-z0-9]+/", " ", $n);
  $n = preg_replace("/\s+/", "", trim((string) $n));
  $aliases = [
    "name" => "name", "item" => "name", "itemname" => "name", "product" => "name", "productname" => "name",
    "hsn" => "hsn", "hsncode" => "hsn",
    "category" => "category", "group" => "category",
    "subcategory" => "subcategory", "subcategoryname" => "subcategory",
    "unit" => "unit", "unittype" => "unit", "uom" => "unit", "baseunit" => "unit",
    "mrp" => "mrp",
    "gst" => "gst", "gstpercent" => "gst", "gstrate" => "gst",
    "retail" => "retail", "retailrate" => "retail", "selling" => "retail", "salerate" => "retail",
    "b2b" => "b2b", "wholesale" => "b2b", "b2brate" => "b2b",
    "purchase" => "purchase", "cost" => "purchase", "purchaserate" => "purchase",
    "stock" => "stock", "qty" => "stock", "quantity" => "stock", "stockqty" => "stock",
    "barcode" => "barcode", "ownbarcode" => "barcode", "ean" => "barcode",
    "manufacturerbarcode" => "mfr_barcode", "mfrbarcode" => "mfr_barcode", "factorybarcode" => "mfr_barcode",
    "code" => "code", "sku" => "code", "itemcode" => "code",
    "colour" => "color", "color" => "color",
    "size" => "size",
    "wearer" => "wearer_type", "type" => "wearer_type", "girlsboys" => "wearer_type",
  ];
  return $aliases[$n] ?? "";
}

function pos_item_import_template_xml() {
  if (!function_exists("pos_workbook_xml")) {
    require_once __DIR__ . "/pos-reports.php";
  }
  return pos_workbook_xml([
    [
      "name" => "Items",
      "headers" => pos_item_import_headers(),
      "rows" => [
        ["Turmeric powder", "091030", "Whole Spices", "Powder", "GM", 220, 5, 240, 210, 180, 5000, "", "", "", "", "", ""],
        ["Soap bar", "", "Grocery", "", "PCS", 25, 5, 30, 28, 22, 24, "", "", "", "", "", ""],
      ],
    ],
    [
      "name" => "Help",
      "headers" => ["Field", "Notes"],
      "rows" => [
        ["Name", "Required. Each row is one item."],
        ["Unit", "GM, KG, PCS, ML, or LTR (or your unit master code)."],
        ["Stock", "Quantity in that unit: grams for GM, kg for KG, pcs for PCS."],
        ["GST %", "Defaults to 5 if blank on a new item."],
        ["Code", "Leave blank to create a new SKU. Matching Code or Barcode updates that item."],
        ["Limit", "Up to 500 rows per upload. .xlsx, Excel XML, or CSV."],
      ],
    ],
  ]);
}

function pos_item_import_xml_decode($value) {
  return html_entity_decode((string) $value, ENT_QUOTES | ENT_XML1, "UTF-8");
}

function pos_parse_item_csv($text) {
  $src = preg_replace("/^\xEF\xBB\xBF/", "", (string) $text);
  $rows = [];
  $row = [];
  $cur = "";
  $inQuotes = false;
  $len = strlen($src);
  for ($i = 0; $i < $len; $i++) {
    $ch = $src[$i];
    if ($inQuotes) {
      if ($ch === '"') {
        if (($i + 1) < $len && $src[$i + 1] === '"') {
          $cur .= '"';
          $i++;
        } else $inQuotes = false;
      } else $cur .= $ch;
      continue;
    }
    if ($ch === '"') { $inQuotes = true; continue; }
    if ($ch === ",") { $row[] = $cur; $cur = ""; continue; }
    if ($ch === "\n") { $row[] = $cur; $rows[] = $row; $row = []; $cur = ""; continue; }
    if ($ch === "\r") continue;
    $cur .= $ch;
  }
  if ($cur !== "" || $row) {
    $row[] = $cur;
    $rows[] = $row;
  }
  return array_values(array_filter($rows, function ($r) {
    foreach ($r as $c) if (trim((string) $c) !== "") return true;
    return false;
  }));
}

function pos_parse_item_spreadsheetml($xml) {
  $src = (string) $xml;
  if (preg_match('#<Worksheet\b[^>]*>[\s\S]*?</Worksheet>#i', $src, $sheetM)) $src = $sheetM[0];
  $rows = [];
  if (!preg_match_all('#<Row\b[^>]*>([\s\S]*?)</Row>#i', (string) $src, $blocks)) return $rows;
  foreach ($blocks[1] as $block) {
    $cells = [];
    $col = 1;
    if (preg_match_all('#<Cell\b([^>]*)>([\s\S]*?)</Cell>|<Cell\b([^>]*)/>#i', $block, $found, PREG_SET_ORDER)) {
      foreach ($found as $cell) {
        $attrs = $cell[1] !== "" ? $cell[1] : ($cell[3] ?? "");
        $inner = $cell[2] ?? "";
        if (preg_match('/ss:Index="(\d+)"/i', $attrs, $idx)) $col = (int) $idx[1];
        $text = "";
        if (preg_match('#<Data\b[^>]*>([\s\S]*?)</Data>#i', $inner, $data)) {
          $text = pos_item_import_xml_decode(preg_replace("/<[^>]+>/", "", $data[1]));
        }
        while (count($cells) < $col - 1) $cells[] = "";
        $cells[] = $text;
        $col++;
      }
    }
    foreach ($cells as $c) {
      if (trim((string) $c) !== "") {
        $rows[] = $cells;
        break;
      }
    }
  }
  return $rows;
}

function pos_xlsx_col_index($letters) {
  $n = 0;
  $s = strtoupper((string) $letters);
  $len = strlen($s);
  for ($i = 0; $i < $len; $i++) $n = $n * 26 + (ord($s[$i]) - 64);
  return $n - 1;
}

function pos_parse_xlsx_shared_strings($xml) {
  $out = [];
  if (!preg_match_all('#<si\b[^>]*>([\s\S]*?)</si>#i', (string) $xml, $m)) return $out;
  foreach ($m[1] as $si) {
    $text = "";
    if (preg_match_all('#<t\b[^>]*>([\s\S]*?)</t>#i', $si, $t)) {
      foreach ($t[1] as $bit) $text .= pos_item_import_xml_decode($bit);
    }
    $out[] = $text;
  }
  return $out;
}

function pos_parse_xlsx_sheet($sheetXml, $shared) {
  $rows = [];
  if (!preg_match_all('#<row\b[^>]*>([\s\S]*?)</row>#i', (string) $sheetXml, $rowMs)) return $rows;
  foreach ($rowMs[1] as $rowXml) {
    $cells = [];
    if (!preg_match_all('#<c\b([^>]*)>([\s\S]*?)</c>|<c\b([^/]*)/>#i', $rowXml, $found, PREG_SET_ORDER)) continue;
    foreach ($found as $c) {
      $attrs = $c[1] !== "" ? $c[1] : ($c[3] ?? "");
      $inner = $c[2] ?? "";
      if (!preg_match('/\br="([A-Z]+)(\d+)"/i', $attrs, $ref)) continue;
      $idx = pos_xlsx_col_index($ref[1]);
      $type = "";
      if (preg_match('/\bt="([^"]+)"/', $attrs, $tm)) $type = $tm[1];
      $val = "";
      if ($type === "s") {
        $v = preg_match('#<v\b[^>]*>([\s\S]*?)</v>#i', $inner, $vm) ? (int) $vm[1] : -1;
        $val = $shared[$v] ?? "";
      } elseif ($type === "inlineStr") {
        $val = preg_match('#<t\b[^>]*>([\s\S]*?)</t>#i', $inner, $tm2) ? pos_item_import_xml_decode($tm2[1]) : "";
      } else {
        $val = preg_match('#<v\b[^>]*>([\s\S]*?)</v>#i', $inner, $vm) ? pos_item_import_xml_decode($vm[1]) : "";
      }
      while (count($cells) < $idx) $cells[] = "";
      $cells[$idx] = $val;
    }
    foreach ($cells as $c) {
      if (trim((string) $c) !== "") {
        $rows[] = $cells;
        break;
      }
    }
  }
  return $rows;
}

function pos_parse_item_xlsx($bin) {
  if (!class_exists("ZipArchive")) throw new Exception("This server cannot read .xlsx. Save the sheet as CSV or Excel XML.");
  $tmp = tempnam(sys_get_temp_dir(), "posxlsx");
  file_put_contents($tmp, $bin);
  $zip = new ZipArchive();
  $ok = $zip->open($tmp);
  if ($ok !== true) {
    @unlink($tmp);
    throw new Exception("Could not open the Excel file");
  }
  $sheet = $zip->getFromName("xl/worksheets/sheet1.xml");
  if ($sheet === false) {
    for ($i = 0; $i < $zip->numFiles; $i++) {
      $name = $zip->getNameIndex($i);
      if (preg_match('#^xl/worksheets/sheet\d+\.xml$#i', (string) $name)) {
        $sheet = $zip->getFromName($name);
        break;
      }
    }
  }
  $sharedXml = $zip->getFromName("xl/sharedStrings.xml");
  $zip->close();
  @unlink($tmp);
  if ($sheet === false || $sheet === "") throw new Exception("Excel workbook has no worksheet");
  $shared = pos_parse_xlsx_shared_strings((string) $sharedXml);
  return pos_parse_xlsx_sheet((string) $sheet, $shared);
}

function pos_parse_item_import_grid($bin, $filename = "") {
  $name = strtolower((string) $filename);
  if ($bin === "" || $bin === null) throw new Exception("Upload file is empty");
  $raw = is_string($bin) ? $bin : (string) $bin;
  if (strlen($raw) >= 2 && $raw[0] === "P" && $raw[1] === "K") return pos_parse_item_xlsx($raw);
  if (substr($name, -4) === ".csv" || (strpos($raw, "<Workbook") === false && strpos($raw, ",") !== false)) {
    return pos_parse_item_csv($raw);
  }
  if (preg_match("/<Workbook\b/i", $raw) || strpos($raw, "urn:schemas-microsoft-com:office:spreadsheet") !== false) {
    return pos_parse_item_spreadsheetml($raw);
  }
  return pos_parse_item_csv($raw);
}

function pos_map_item_import_rows($grid) {
  if (!is_array($grid) || !$grid) throw new Exception("Excel has no rows");
  $header = [];
  foreach ($grid[0] as $h) $header[] = pos_item_import_header_key($h);
  if (!in_array("name", $header, true)) throw new Exception("First row must include a Name column");
  $out = [];
  $max = pos_item_import_max_rows();
  for ($i = 1; $i < count($grid); $i++) {
    if (count($out) >= $max) break;
    $raw = $grid[$i] ?? [];
    $row = ["_line" => $i + 1];
    foreach ($header as $idx => $key) {
      if ($key === "") continue;
      $row[$key] = trim((string) ($raw[$idx] ?? ""));
    }
    if (($row["name"] ?? "") === "" && ($row["code"] ?? "") === "") continue;
    $out[] = $row;
  }
  if (!$out) throw new Exception("No item rows found. Keep the header row and add names below it.");
  return $out;
}

function pos_item_import_stock_to_base($stock, $unit) {
  if ($stock === "" || $stock === null) return null;
  $n = (float) $stock;
  $code = function_exists("pos_unit_code") ? pos_unit_code($unit) : pos_item_unit($unit);
  if ($code === "KG" || $code === "LTR") return $n * 1000;
  return $n;
}

function pos_item_import_decode_upload($body) {
  if (isset($body["rows"]) && is_array($body["rows"])) {
    return ["grid" => $body["rows"]];
  }
  $filename = (string) ($body["filename"] ?? $body["name"] ?? "items.xlsx");
  $content = (string) ($body["content"] ?? $body["file"] ?? $body["data"] ?? "");
  if (trim($content) === "") throw new Exception("Choose an Excel or CSV file");
  $content = preg_replace("#^data:[^;]+;base64,#", "", $content);
  $bin = base64_decode($content, true);
  if ($bin === false || $bin === "") throw new Exception("Could not read the upload");
  if (strlen($bin) > 2000000) throw new Exception("File is too large (max 2 MB)");
  return ["bin" => $bin, "filename" => $filename];
}

function pos_find_item_for_import($bid, $row) {
  $code = trim((string) ($row["code"] ?? ""));
  if ($code !== "") {
    $found = pos_q("SELECT * FROM items WHERE business_id = ? AND code = ? LIMIT 1", "ss", [$bid, $code]);
    if ($found) return $found[0];
  }
  $barcode = trim((string) ($row["barcode"] ?? ""));
  if ($barcode === "") return null;
  $found = pos_q("SELECT * FROM items WHERE business_id = ? AND barcode = ? LIMIT 1", "ss", [$bid, $barcode]);
  if ($found) return $found[0];
  try {
    $found = pos_q(
      "SELECT i.* FROM item_barcodes b JOIN items i ON i.id = b.item_id
       WHERE b.business_id = ? AND b.barcode = ? LIMIT 1",
      "ss",
      [$bid, $barcode]
    );
    if ($found) return $found[0];
  } catch (Exception $e) { /* optional */ }
  return null;
}

function pos_item_import_insert($bid, $biz, $body) {
  $footwear = pos_is_footwear_shop($biz);
  $n = pos_next_seq("item", $bid, 7);
  $code = trim((string) ($body["code"] ?? "")) ?: (($footwear ? "FW-" : "SP-") . str_pad((string) $n, 3, "0", STR_PAD_LEFT));
  $id = pos_uuid();
  $unit = pos_item_unit($body["base_unit"] ?? $body["unit"] ?? ($footwear ? "PCS" : "GM"));
  $color = trim((string) ($body["color"] ?? "")) ?: null;
  $size = trim((string) ($body["size"] ?? "")) ?: null;
  $wearer = pos_item_wearer($body["wearer_type"] ?? "") ?: null;
  $category = trim((string) ($body["category"] ?? "")) ?: ($footwear ? "Footwear" : "Whole Spices");
  pos_q(
    "INSERT INTO items (
       id, code, name, local_name, category, subcategory, color, size, wearer_type, base_unit,
       purchase_rate, retail_rate, b2b_rate, gst_rate, hsn, image_url, stock_gm,
       reorder_level_gm, status, business_id
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'active', ?)",
    "ssssssssssddddssdds",
    [
      $id, $code, $body["name"], $body["local_name"] ?? null, $category,
      $body["subcategory"] ?? null, $color, $size, $wearer, $unit,
      (float) ($body["purchase_rate"] ?? 0), (float) ($body["retail_rate"] ?? 0),
      (float) ($body["b2b_rate"] ?? 0), (float) ($body["gst_rate"] ?? 5),
      trim((string) ($body["hsn"] ?? "")) ?: null, null,
      (float) ($body["stock_gm"] ?? 0), (float) ($body["reorder_level_gm"] ?? 0), $bid,
    ]
  );
  try { pos_q("UPDATE items SET unit = ? WHERE id = ?", "ss", [$unit, $id]); } catch (Exception $e) { /* optional */ }
  if (is_file(__DIR__ . "/pos-advanced.php")) {
    require_once __DIR__ . "/pos-advanced.php";
    if (function_exists("pos_assign_item_barcodes")) pos_assign_item_barcodes($bid, $id, $body);
  }
  if (array_key_exists("mrp", $body)) {
    try { pos_q("UPDATE items SET mrp = ? WHERE id = ?", "ds", [(float) $body["mrp"], $id]); } catch (Exception $e) { /* optional */ }
  }
  $rows = pos_q("SELECT * FROM items WHERE id = ? LIMIT 1", "s", [$id]);
  return $rows[0] ?? ["code" => $code];
}

function pos_item_import_update($bid, $existing, $biz, $body, $row) {
  $footwear = pos_is_footwear_shop($biz);
  $unit = trim((string) ($row["unit"] ?? "")) !== ""
    ? pos_item_unit($body["unit"])
    : pos_item_unit($existing);
  $name = trim((string) ($row["name"] ?? "")) !== "" ? $body["name"] : $existing["name"];
  $category = trim((string) ($row["category"] ?? "")) !== "" ? $body["category"] : ($existing["category"] ?? ($footwear ? "Footwear" : "Whole Spices"));
  $sub = array_key_exists("subcategory", $row) && $row["subcategory"] !== "" ? $body["subcategory"] : ($existing["subcategory"] ?? null);
  $hsn = array_key_exists("hsn", $row) && $row["hsn"] !== "" ? $body["hsn"] : ($existing["hsn"] ?? null);
  $color = array_key_exists("color", $row) && $row["color"] !== "" ? ($body["color"] ?: null) : ($existing["color"] ?? null);
  $size = array_key_exists("size", $row) && $row["size"] !== "" ? ($body["size"] ?: null) : ($existing["size"] ?? null);
  $wearer = array_key_exists("wearer_type", $row) && $row["wearer_type"] !== ""
    ? (pos_item_wearer($body["wearer_type"]) ?: null)
    : ($existing["wearer_type"] ?? null);
  $purchase = array_key_exists("purchase", $row) && $row["purchase"] !== "" ? (float) $body["purchase_rate"] : (float) ($existing["purchase_rate"] ?? 0);
  $retail = array_key_exists("retail", $row) && $row["retail"] !== "" ? (float) $body["retail_rate"] : (float) ($existing["retail_rate"] ?? 0);
  $b2b = array_key_exists("b2b", $row) && $row["b2b"] !== "" ? (float) $body["b2b_rate"] : (float) ($existing["b2b_rate"] ?? 0);
  $gst = array_key_exists("gst", $row) && $row["gst"] !== "" ? (float) $body["gst_rate"] : (float) ($existing["gst_rate"] ?? 5);
  $stock = array_key_exists("stock_gm", $body) ? (float) $body["stock_gm"] : (float) ($existing["stock_gm"] ?? 0);
  pos_q(
    "UPDATE items SET name=?, category=?, subcategory=?, color=?, size=?, wearer_type=?, base_unit=?,
       purchase_rate=?, retail_rate=?, b2b_rate=?, gst_rate=?, hsn=?, stock_gm=?
     WHERE id=? AND business_id=?",
    "sssssssddddsdss",
    [
      $name, $category, $sub, $color, $size, $wearer, $unit,
      $purchase, $retail, $b2b, $gst, $hsn ?: null, $stock,
      $existing["id"], $bid,
    ]
  );
  try { pos_q("UPDATE items SET unit = ? WHERE id = ?", "ss", [$unit, $existing["id"]]); } catch (Exception $e) { /* optional */ }
  if (is_file(__DIR__ . "/pos-advanced.php")) {
    require_once __DIR__ . "/pos-advanced.php";
    if (function_exists("pos_assign_item_barcodes")) pos_assign_item_barcodes($bid, $existing["id"], $body);
  }
  if (array_key_exists("mrp", $body)) {
    try { pos_q("UPDATE items SET mrp = ? WHERE id = ?", "ds", [(float) $body["mrp"], $existing["id"]]); } catch (Exception $e) { /* optional */ }
  }
  $rows = pos_q("SELECT * FROM items WHERE id = ? LIMIT 1", "s", [$existing["id"]]);
  return $rows[0] ?? $existing;
}

function pos_item_body_from_import_row($row, $biz) {
  $footwear = pos_is_footwear_shop($biz);
  $unit = pos_item_unit($row["unit"] ?? ($footwear ? "PCS" : "GM"));
  $stock = pos_item_import_stock_to_base($row["stock"] ?? "", $unit);
  $body = [
    "name" => trim((string) ($row["name"] ?? "")),
    "hsn" => trim((string) ($row["hsn"] ?? "")),
    "category" => trim((string) ($row["category"] ?? "")) ?: ($footwear ? "Footwear" : "Whole Spices"),
    "subcategory" => trim((string) ($row["subcategory"] ?? "")),
    "base_unit" => $unit,
    "unit" => $unit,
    "barcode" => trim((string) ($row["barcode"] ?? "")),
    "mfr_barcode" => trim((string) ($row["mfr_barcode"] ?? "")),
    "color" => trim((string) ($row["color"] ?? "")),
    "size" => trim((string) ($row["size"] ?? "")),
    "wearer_type" => pos_item_wearer($row["wearer_type"] ?? ""),
    "code" => trim((string) ($row["code"] ?? "")),
    "gst_rate" => (trim((string) ($row["gst"] ?? "")) === "" ? 5 : (float) $row["gst"]),
  ];
  if (trim((string) ($row["mrp"] ?? "")) !== "") $body["mrp"] = (float) $row["mrp"];
  if (trim((string) ($row["retail"] ?? "")) !== "") $body["retail_rate"] = (float) $row["retail"];
  if (trim((string) ($row["b2b"] ?? "")) !== "") $body["b2b_rate"] = (float) $row["b2b"];
  if (trim((string) ($row["purchase"] ?? "")) !== "") $body["purchase_rate"] = (float) $row["purchase"];
  if ($stock !== null) $body["stock_gm"] = $stock;
  return $body;
}

function pos_item_import_run($bid, $body) {
  pos_ensure_business_columns();
  pos_ensure_item_unit_columns();
  if (is_file(__DIR__ . "/pos-units.php")) {
    require_once __DIR__ . "/pos-units.php";
    if (function_exists("pos_ensure_inventory_units_schema")) pos_ensure_inventory_units_schema($bid);
  }
  $decoded = pos_item_import_decode_upload($body);
  $grid = isset($decoded["grid"]) ? $decoded["grid"] : pos_parse_item_import_grid($decoded["bin"], $decoded["filename"] ?? "");
  $mapped = pos_map_item_import_rows($grid);
  $bizRows = pos_q("SELECT category, business_type FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]);
  $biz = $bizRows[0] ?? [];
  $created = [];
  $updated = [];
  $errors = [];
  foreach ($mapped as $row) {
    try {
      $itemBody = pos_item_body_from_import_row($row, $biz);
      if ($itemBody["name"] === "") throw new Exception("Name is required");
      $existing = pos_find_item_for_import($bid, $row);
      if ($existing) {
        $saved = pos_item_import_update($bid, $existing, $biz, $itemBody, $row);
        $updated[] = $saved["code"] ?? $existing["code"];
      } else {
        $saved = pos_item_import_insert($bid, $biz, $itemBody);
        $created[] = $saved["code"] ?? "";
      }
    } catch (Exception $e) {
      $errors[] = ["line" => $row["_line"] ?? "", "name" => $row["name"] ?? $row["code"] ?? "", "error" => $e->getMessage()];
    }
  }
  return [
    "ok" => true,
    "created" => count($created),
    "updated" => count($updated),
    "failed" => count($errors),
    "created_codes" => $created,
    "updated_codes" => $updated,
    "errors" => $errors,
    "php" => true,
  ];
}

function pos_item_import_dispatch($path, $method, $body, $bid) {
  if ($path === "items/import/template" && $method === "GET") {
    $xml = pos_item_import_template_xml();
    header("Content-Type: application/vnd.ms-excel; charset=utf-8");
    header('Content-Disposition: attachment; filename="pos-items-template.xls"');
    echo $xml;
    exit;
  }
  if ($path === "items/import" && $method === "POST") {
    pos_send(200, pos_item_import_run($bid, is_array($body) ? $body : []));
  }
  return false;
}
