<?php
function pos_report_day($value) {
  if ($value === null || $value === "") return "";
  $s = (string) $value;
  if (preg_match("/^(\d{4}-\d{2}-\d{2})/", $s, $m)) return $m[1];
  return $s;
}

function pos_num($v) {
  return (float) $v;
}

function pos_xml_esc($value) {
  return htmlspecialchars((string) ($value ?? ""), ENT_QUOTES | ENT_XML1, "UTF-8");
}

function pos_excel_cell($value) {
  if ($value === null || $value === "") {
    return "<Cell><Data ss:Type=\"String\"></Data></Cell>";
  }
  if (is_int($value) || is_float($value) || (is_numeric($value) && !is_string($value))) {
    return "<Cell><Data ss:Type=\"Number\">" . (0 + $value) . "</Data></Cell>";
  }
  if (is_numeric($value) && preg_match("/^-?\d+(\.\d+)?$/", (string) $value)) {
    return "<Cell><Data ss:Type=\"Number\">" . (0 + $value) . "</Data></Cell>";
  }
  return "<Cell><Data ss:Type=\"String\">" . pos_xml_esc($value) . "</Data></Cell>";
}

function pos_workbook_xml($sheets) {
  $body = "";
  foreach ($sheets as $sheet) {
    $name = pos_xml_esc(substr((string) ($sheet["name"] ?? "Sheet"), 0, 31));
    $header = "<Row>";
    foreach ($sheet["headers"] as $h) $header .= pos_excel_cell((string) $h);
    $header .= "</Row>";
    $rows = "";
    foreach ($sheet["rows"] as $row) {
      $rows .= "<Row>";
      foreach ($row as $v) $rows .= pos_excel_cell($v);
      $rows .= "</Row>";
    }
    $body .= "<Worksheet ss:Name=\"{$name}\"><Table>{$header}{$rows}</Table></Worksheet>";
  }
  return "<?xml version=\"1.0\"?>\n<?mso-application progid=\"Excel.Sheet\"?>\n"
    . "<Workbook xmlns=\"urn:schemas-microsoft-com:office:spreadsheet\"\n"
    . " xmlns:ss=\"urn:schemas-microsoft-com:office:spreadsheet\">\n{$body}\n</Workbook>";
}

function pos_q_safe($sql, $types = "", $params = []) {
  try {
    return pos_q($sql, $types, $params);
  } catch (Exception $e) {
    return [];
  }
}

function pos_build_reports($bid, $from, $to) {
  $start = $from ?: "2000-01-01";
  $end = $to ?: date("Y-m-d");
  $salesWhere = "business_id = ? AND DATE(created_at) BETWEEN ? AND ?";
  $poWhere = "business_id = ? AND purchase_date BETWEEN ? AND ?";
  $args = [$bid, $start, $end];

  $summaryRows = pos_q_safe(
    "SELECT COUNT(*) AS bills, COALESCE(SUM(subtotal),0) AS taxable,
            COALESCE(SUM(gst),0) AS gst, COALESCE(SUM(total),0) AS takings
     FROM sales_orders WHERE {$salesWhere}",
    "sss",
    $args
  );
  $summary = $summaryRows[0] ?? ["bills" => 0, "taxable" => 0, "gst" => 0, "takings" => 0];
  $summary["takings"] = $summary["takings"] ?? $summary["total"] ?? 0;

  $sales = pos_q_safe(
    "SELECT order_number, customer_name, customer_type, pack_name, pack_count,
            status, total_quantity_gm, subtotal, gst, total, payment_method,
            payment_status, created_at
     FROM sales_orders WHERE {$salesWhere} ORDER BY created_at",
    "sss",
    $args
  );
  $byItem = pos_q_safe(
    "SELECT l.item_name, SUM(l.quantity_gm) AS quantity_gm, SUM(l.amount) AS amount,
            SUM(l.amount * l.gst_rate / 100) AS gst
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id
     WHERE o.business_id = ? AND DATE(o.created_at) BETWEEN ? AND ? AND l.cancelled = 0
     GROUP BY l.item_name ORDER BY amount DESC",
    "sss",
    $args
  );
  $byCustomer = pos_q_safe(
    "SELECT customer_name, customer_type, COUNT(*) AS bills,
            COALESCE(SUM(total),0) AS takings, COALESCE(SUM(gst),0) AS gst
     FROM sales_orders WHERE {$salesWhere}
     GROUP BY customer_name, customer_type ORDER BY takings DESC",
    "sss",
    $args
  );
  $byPack = pos_q_safe(
    "SELECT COALESCE(pack_name, 'Loose items') AS pack_type,
            COALESCE(SUM(pack_count),0) AS pack_count,
            COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings
     FROM sales_orders WHERE {$salesWhere}
     GROUP BY COALESCE(pack_name, 'Loose items') ORDER BY takings DESC",
    "sss",
    $args
  );
  $byPay = pos_q_safe(
    "SELECT payment_method, COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings
     FROM sales_orders WHERE {$salesWhere}
     GROUP BY payment_method",
    "sss",
    $args
  );
  $gst = pos_q_safe(
    "SELECT DATE(created_at) AS day, COALESCE(SUM(subtotal),0) AS taxable,
            COALESCE(SUM(gst),0) AS gst, COALESCE(SUM(total),0) AS total
     FROM sales_orders WHERE {$salesWhere}
     GROUP BY DATE(created_at) ORDER BY day",
    "sss",
    $args
  );
  foreach ($gst as &$row) {
    $row["day"] = pos_report_day($row["day"] ?? "");
  }
  unset($row);

  $stock = pos_q_safe(
    "SELECT code, name, local_name, category, subcategory, stock_gm, reorder_level_gm,
            retail_rate, b2b_rate, purchase_rate, gst_rate
     FROM items WHERE business_id = ? ORDER BY name",
    "s",
    [$bid]
  );
  $low = [];
  foreach ($stock as $i) {
    if ((float) ($i["stock_gm"] ?? 0) <= (float) ($i["reorder_level_gm"] ?? 0)) $low[] = $i;
  }
  $purchases = pos_q_safe(
    "SELECT purchase_number, supplier_name, supplier_invoice_number, purchase_date,
            subtotal, gst, total, payment_method, payment_status
     FROM purchases WHERE {$poWhere} ORDER BY purchase_date",
    "sss",
    $args
  );
  $customers = pos_q_safe(
    "SELECT code, name, business_name, mobile, type, gstin, credit_limit, outstanding
     FROM customers WHERE business_id = ? ORDER BY name",
    "s",
    [$bid]
  );

  return [
    "from" => $start,
    "to" => $end,
    "summary" => $summary,
    "sales" => $sales,
    "byItem" => $byItem,
    "byCustomer" => $byCustomer,
    "byPack" => $byPack,
    "byPay" => $byPay,
    "gst" => $gst,
    "stock" => $stock,
    "low" => $low,
    "purchases" => $purchases,
    "customers" => $customers,
  ];
}

function pos_reports_to_sheets($data) {
  $num = function ($v) { return (float) $v; };
  $sales = $data["sales"] ?? [];
  $byItem = $data["byItem"] ?? [];
  $byCustomer = $data["byCustomer"] ?? [];
  $byPack = $data["byPack"] ?? [];
  $byPay = $data["byPay"] ?? [];
  $gst = $data["gst"] ?? [];
  $stock = $data["stock"] ?? [];
  $low = $data["low"] ?? [];
  $purchases = $data["purchases"] ?? [];
  $customers = $data["customers"] ?? [];
  $s = $data["summary"] ?? [];
  return [
    [
      "name" => "Summary",
      "headers" => ["From", "To", "Bills", "Taxable", "GST", "Takings"],
      "rows" => [[$data["from"], $data["to"], $num($s["bills"] ?? 0), $num($s["taxable"] ?? 0), $num($s["gst"] ?? 0), $num($s["takings"] ?? $s["total"] ?? 0)]],
    ],
    [
      "name" => "Sales bills",
      "headers" => ["Order", "Customer", "Type", "Pack", "Pack count", "Status", "Qty g", "Taxable", "GST", "Total", "Pay", "Pay status", "Date"],
      "rows" => array_map(function ($o) use ($num) {
        return [
          $o["order_number"] ?? "",
          $o["customer_name"] ?? "",
          $o["customer_type"] ?? "",
          $o["pack_name"] ?: "Loose items",
          $num($o["pack_count"] ?? 0),
          $o["status"] ?? "",
          $num($o["total_quantity_gm"] ?? 0),
          $num($o["subtotal"] ?? 0),
          $num($o["gst"] ?? 0),
          $num($o["total"] ?? 0),
          $o["payment_method"] ?? "",
          $o["payment_status"] ?? "",
          (string) ($o["created_at"] ?? ""),
        ];
      }, $sales),
    ],
    [
      "name" => "Item sales",
      "headers" => ["Item", "Qty g", "Amount", "GST"],
      "rows" => array_map(function ($r) use ($num) {
        return [$r["item_name"] ?? "", $num($r["quantity_gm"] ?? 0), $num($r["amount"] ?? 0), $num($r["gst"] ?? 0)];
      }, $byItem),
    ],
    [
      "name" => "Customer sales",
      "headers" => ["Customer", "Type", "Bills", "Takings", "GST"],
      "rows" => array_map(function ($r) use ($num) {
        return [$r["customer_name"] ?? "", $r["customer_type"] ?? "", $num($r["bills"] ?? 0), $num($r["takings"] ?? 0), $num($r["gst"] ?? 0)];
      }, $byCustomer),
    ],
    [
      "name" => "Pack sales",
      "headers" => ["Pack type", "Pack count", "Bills", "Takings"],
      "rows" => array_map(function ($r) use ($num) {
        return [$r["pack_type"] ?? "", $num($r["pack_count"] ?? 0), $num($r["bills"] ?? 0), $num($r["takings"] ?? 0)];
      }, $byPack),
    ],
    [
      "name" => "Payment",
      "headers" => ["Method", "Bills", "Takings"],
      "rows" => array_map(function ($r) use ($num) {
        return [$r["payment_method"] ?? "", $num($r["bills"] ?? 0), $num($r["takings"] ?? 0)];
      }, $byPay),
    ],
    [
      "name" => "GST daywise",
      "headers" => ["Day", "Taxable", "GST", "Total"],
      "rows" => array_map(function ($r) use ($num) {
        return [pos_report_day($r["day"] ?? ""), $num($r["taxable"] ?? 0), $num($r["gst"] ?? 0), $num($r["total"] ?? 0)];
      }, $gst),
    ],
    [
      "name" => "Stock",
      "headers" => ["Code", "Name", "Local", "Category", "Subcategory", "Stock g", "Reorder g", "Retail", "B2B", "Purchase", "GST %"],
      "rows" => array_map(function ($i) use ($num) {
        return [
          $i["code"] ?? "", $i["name"] ?? "", $i["local_name"] ?? "", $i["category"] ?? "", $i["subcategory"] ?? "",
          $num($i["stock_gm"] ?? 0), $num($i["reorder_level_gm"] ?? 0), $num($i["retail_rate"] ?? 0), $num($i["b2b_rate"] ?? 0),
          $num($i["purchase_rate"] ?? 0), $num($i["gst_rate"] ?? 0),
        ];
      }, $stock),
    ],
    [
      "name" => "Low stock",
      "headers" => ["Code", "Name", "Stock g", "Reorder g"],
      "rows" => array_map(function ($i) use ($num) {
        return [$i["code"] ?? "", $i["name"] ?? "", $num($i["stock_gm"] ?? 0), $num($i["reorder_level_gm"] ?? 0)];
      }, $low),
    ],
    [
      "name" => "Purchases",
      "headers" => ["PO", "Supplier", "Invoice", "Date", "Taxable", "GST", "Total", "Pay", "Status"],
      "rows" => array_map(function ($p) use ($num) {
        return [
          $p["purchase_number"] ?? "", $p["supplier_name"] ?? "", $p["supplier_invoice_number"] ?? "", $p["purchase_date"] ?? "",
          $num($p["subtotal"] ?? 0), $num($p["gst"] ?? 0), $num($p["total"] ?? 0), $p["payment_method"] ?? "", $p["payment_status"] ?? "",
        ];
      }, $purchases),
    ],
    [
      "name" => "Customers",
      "headers" => ["Code", "Name", "Business", "Mobile", "Type", "GSTIN", "Credit limit", "Outstanding"],
      "rows" => array_map(function ($c) use ($num) {
        return [
          $c["code"] ?? "", $c["name"] ?? "", $c["business_name"] ?? "", $c["mobile"] ?? "", $c["type"] ?? "", $c["gstin"] ?? "",
          $num($c["credit_limit"] ?? 0), $num($c["outstanding"] ?? 0),
        ];
      }, $customers),
    ],
  ];
}
