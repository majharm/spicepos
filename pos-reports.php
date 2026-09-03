<?php

require_once __DIR__ . "/pos-gst-supply.php";

function pos_report_num($v) {
  return (float) ($v ?? 0);
}

function pos_report_day($value) {
  $s = (string) ($value ?? "");
  if (preg_match("/^(\d{4}-\d{2}-\d{2})/", $s, $m)) return $m[1];
  return $s;
}

function pos_report_range($from, $to) {
  $fy = function_exists("pos_indian_fy") ? pos_indian_fy() : ["from" => date("Y") . "-04-01", "to" => date("Y-m-d")];
  $end = $to ?: date("Y-m-d");
  $start = $from ?: $fy["from"];
  return [$start, $end];
}

function pos_build_reports($bid, $from, $to) {
  if (function_exists("pos_ensure_accounts_schema")) pos_ensure_accounts_schema();
  [$start, $end] = pos_report_range($from, $to);
  $salesWhere = "business_id = ? AND DATE(created_at) BETWEEN ? AND ?";
  $poWhere = "business_id = ? AND purchase_date BETWEEN ? AND ?";

  $summary = pos_q(
    "SELECT COUNT(*) AS bills,
            COALESCE(SUM(subtotal),0) AS taxable,
            COALESCE(SUM(gst),0) AS gst,
            COALESCE(SUM(total),0) AS takings
     FROM sales_orders WHERE $salesWhere",
    "sss",
    [$bid, $start, $end]
  );
  $sales = pos_q(
    "SELECT order_number, customer_name, customer_type, pack_name, pack_count,
            status, total_quantity_gm, subtotal, gst, total, payment_method,
            payment_status, created_at
     FROM sales_orders WHERE $salesWhere ORDER BY created_at",
    "sss",
    [$bid, $start, $end]
  );
  $byItem = pos_q(
    "SELECT l.item_name, SUM(l.quantity_gm) AS quantity_gm, SUM(l.amount) AS amount,
            SUM(l.amount * l.gst_rate / 100) AS gst
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id
     WHERE o.business_id = ? AND DATE(o.created_at) BETWEEN ? AND ? AND l.cancelled = 0
     GROUP BY l.item_name ORDER BY amount DESC",
    "sss",
    [$bid, $start, $end]
  );
  $byCustomer = pos_q(
    "SELECT customer_name, customer_type, COUNT(*) AS bills,
            COALESCE(SUM(total),0) AS takings, COALESCE(SUM(gst),0) AS gst
     FROM sales_orders WHERE $salesWhere
     GROUP BY customer_name, customer_type ORDER BY takings DESC",
    "sss",
    [$bid, $start, $end]
  );
  $byPack = pos_q(
    "SELECT COALESCE(pack_name, 'Loose items') AS pack_type,
            COALESCE(SUM(pack_count),0) AS pack_count,
            COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings
     FROM sales_orders WHERE $salesWhere
     GROUP BY COALESCE(pack_name, 'Loose items') ORDER BY takings DESC",
    "sss",
    [$bid, $start, $end]
  );
  $byPay = pos_q(
    "SELECT payment_method, COUNT(*) AS bills, COALESCE(SUM(total),0) AS takings
     FROM sales_orders WHERE $salesWhere
     GROUP BY payment_method",
    "sss",
    [$bid, $start, $end]
  );
  $payDaywise = pos_q(
    "SELECT DATE(created_at) AS day,
            COUNT(*) AS bills,
            COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'cash' THEN total ELSE 0 END),0) AS cash,
            COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'upi' THEN total ELSE 0 END),0) AS upi,
            COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'card' THEN total ELSE 0 END),0) AS card,
            COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'credit' THEN total ELSE 0 END),0) AS credit,
            COALESCE(SUM(CASE WHEN LOWER(COALESCE(payment_method,'')) NOT IN ('cash','upi','card','credit') THEN total ELSE 0 END),0) AS other,
            COALESCE(SUM(total),0) AS total
     FROM sales_orders WHERE $salesWhere
     GROUP BY DATE(created_at) ORDER BY day",
    "sss",
    [$bid, $start, $end]
  );
  $gst = pos_q(
    "SELECT DATE(created_at) AS day, COALESCE(SUM(subtotal),0) AS taxable,
            COALESCE(SUM(gst),0) AS gst, COALESCE(SUM(total),0) AS total
     FROM sales_orders WHERE $salesWhere
     GROUP BY DATE(created_at) ORDER BY day",
    "sss",
    [$bid, $start, $end]
  );
  $stock = pos_q(
    "SELECT code, name, hsn, local_name, category, subcategory, stock_gm, reorder_level_gm,
            retail_rate, b2b_rate, purchase_rate, gst_rate
     FROM items WHERE business_id = ? ORDER BY name",
    "s",
    [$bid]
  );
  $low = [];
  foreach ($stock as $i) {
    if (pos_report_num($i["stock_gm"]) <= pos_report_num($i["reorder_level_gm"])) $low[] = $i;
  }
  $purchases = pos_q(
    "SELECT purchase_number, supplier_name, supplier_invoice_number, purchase_date,
            subtotal, gst, total, payment_method, payment_status
     FROM purchases WHERE $poWhere ORDER BY purchase_date",
    "sss",
    [$bid, $start, $end]
  );
  $expenses = [];
  $expenseSum = [["amount" => 0, "gst" => 0, "bills" => 0]];
  try {
    $expenses = pos_q(
      "SELECT expense_number, expense_date, category, account_code, amount, gst, payment_method, notes,
              (amount + gst) AS total
       FROM expenses WHERE business_id = ? AND expense_date BETWEEN ? AND ?
       ORDER BY expense_date",
      "sss",
      [$bid, $start, $end]
    );
    $expenseSum = pos_q(
      "SELECT COALESCE(SUM(amount),0) AS amount, COALESCE(SUM(gst),0) AS gst, COUNT(*) AS bills
       FROM expenses WHERE business_id = ? AND expense_date BETWEEN ? AND ?",
      "sss",
      [$bid, $start, $end]
    ) ?: $expenseSum;
  } catch (Exception $e) {
    $expenses = [];
  }
  $customers = pos_q(
    "SELECT code, name, business_name, mobile, type, gstin, state, credit_limit, outstanding
     FROM customers WHERE business_id = ? ORDER BY name",
    "s",
    [$bid]
  );
  $companyRows = pos_q("SELECT gstin, state FROM company_settings WHERE business_id = ? LIMIT 1", "s", [$bid]);
  $shop = [
    "gstin" => $companyRows[0]["gstin"] ?? null,
    "state" => $companyRows[0]["state"] ?? null,
  ];
  $gstOutputLines = pos_q(
    "SELECT l.gst_rate, l.amount, o.id AS order_id,
            c.gstin AS party_gstin, c.state AS party_state
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.business_id = ? AND DATE(o.created_at) BETWEEN ? AND ? AND l.cancelled = 0",
    "sss",
    [$bid, $start, $end]
  );
  $gstInputLines = pos_q(
    "SELECT l.gst_rate, l.amount,
            COALESCE(l.gst_amount, l.amount * l.gst_rate / 100) AS gst,
            p.id AS purchase_id, s.gstin AS party_gstin
     FROM purchase_lines l
     JOIN purchases p ON p.id = l.purchase_id
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     WHERE p.business_id = ? AND p.purchase_date BETWEEN ? AND ?",
    "sss",
    [$bid, $start, $end]
  );
  $gstByRate = pos_aggregate_gst_by_rate($gstOutputLines, $shop);
  $gstInputByRate = pos_aggregate_gst_by_rate(
    array_map(function ($r) {
      $r["order_id"] = $r["purchase_id"] ?? null;
      return $r;
    }, $gstInputLines),
    $shop
  );
  $gstHsn = pos_q(
    "SELECT COALESCE(NULLIF(TRIM(i.hsn), ''), i.code, '—') AS hsn, l.item_name, l.gst_rate,
            SUM(l.quantity_gm) AS quantity_gm,
            SUM(l.amount) AS taxable,
            SUM(l.amount * l.gst_rate / 100) AS gst
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id
     LEFT JOIN items i ON i.id = l.item_id
     WHERE o.business_id = ? AND DATE(o.created_at) BETWEEN ? AND ? AND l.cancelled = 0
     GROUP BY COALESCE(i.code, '—'), l.item_name, l.gst_rate
     ORDER BY hsn, l.item_name",
    "sss",
    [$bid, $start, $end]
  );
  $gstB2B = pos_q(
    "SELECT o.order_number, DATE(o.created_at) AS bill_date, o.customer_name, c.gstin,
            c.state AS customer_state, o.subtotal AS taxable, o.gst, o.total
     FROM sales_orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.business_id = ? AND DATE(o.created_at) BETWEEN ? AND ?
       AND c.gstin IS NOT NULL AND TRIM(c.gstin) <> ''
     ORDER BY o.created_at",
    "sss",
    [$bid, $start, $end]
  );
  $gstB2C = pos_q(
    "SELECT o.order_number, DATE(o.created_at) AS bill_date, o.customer_name,
            c.state AS customer_state, o.subtotal AS taxable, o.gst, o.total
     FROM sales_orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.business_id = ? AND DATE(o.created_at) BETWEEN ? AND ?
       AND (c.gstin IS NULL OR TRIM(c.gstin) = '')
     ORDER BY o.created_at",
    "sss",
    [$bid, $start, $end]
  );
  $purchaseGst = pos_q(
    "SELECT COALESCE(SUM(subtotal),0) AS taxable, COALESCE(SUM(gst),0) AS gst, COALESCE(SUM(total),0) AS total
     FROM purchases WHERE $poWhere",
    "sss",
    [$bid, $start, $end]
  );

  $sum = $summary[0] ?? ["bills" => 0, "taxable" => 0, "gst" => 0, "takings" => 0];
  $outputGst = pos_report_num($sum["gst"]);
  $inputGst = pos_report_num($purchaseGst[0]["gst"] ?? 0) + pos_report_num($expenseSum[0]["gst"] ?? 0);
  $outputSplit = pos_sum_split_gst($gstOutputLines, $shop);
  $purchaseInputSplit = pos_sum_split_gst($gstInputLines, $shop);
  $expenseInputSplit = pos_split_gst_amount(pos_report_num($expenseSum[0]["gst"] ?? 0), false);
  $inputSplit = [
    "cgst" => pos_gst_round2($purchaseInputSplit["cgst"] + $expenseInputSplit["cgst"]),
    "sgst" => pos_gst_round2($purchaseInputSplit["sgst"] + $expenseInputSplit["sgst"]),
    "igst" => pos_gst_round2($purchaseInputSplit["igst"] + $expenseInputSplit["igst"]),
    "total" => pos_gst_round2($purchaseInputSplit["total"] + $expenseInputSplit["total"]),
  ];
  $gstSummary = [
    "output" => $outputSplit,
    "input" => $inputSplit,
    "net" => [
      "cgst" => pos_gst_round2($outputSplit["cgst"] - $inputSplit["cgst"]),
      "sgst" => pos_gst_round2($outputSplit["sgst"] - $inputSplit["sgst"]),
      "igst" => pos_gst_round2($outputSplit["igst"] - $inputSplit["igst"]),
      "total" => pos_gst_round2($outputSplit["total"] - $inputSplit["total"]),
    ],
  ];
  $gstB2BRows = array_map(function ($row) use ($shop) {
    $split = pos_split_order_gst(array_merge($row, ["customer_gstin" => $row["gstin"] ?? null]), $shop);
    return array_merge($row, $split);
  }, $gstB2B);
  $gstB2CRows = array_map(function ($row) use ($shop) {
    return array_merge($row, pos_split_order_gst($row, $shop));
  }, $gstB2C);

  return [
    "from" => $start,
    "to" => $end,
    "shop" => $shop,
    "summary" => array_merge($sum, [
      "inputGst" => $inputGst,
      "netGst" => $outputGst - $inputGst,
      "expenses" => pos_report_num($expenseSum[0]["amount"] ?? 0) + pos_report_num($expenseSum[0]["gst"] ?? 0),
      "expenseBills" => (int) ($expenseSum[0]["bills"] ?? 0),
      "gstSummary" => $gstSummary,
    ]),
    "sales" => $sales,
    "byItem" => $byItem,
    "byCustomer" => $byCustomer,
    "byPack" => $byPack,
    "byPay" => $byPay,
    "payDaywise" => $payDaywise,
    "gst" => $gst,
    "gstByRate" => $gstByRate,
    "gstInputByRate" => $gstInputByRate,
    "gstHsn" => $gstHsn,
    "gstB2B" => $gstB2BRows,
    "gstB2C" => $gstB2CRows,
    "stock" => $stock,
    "low" => $low,
    "purchases" => $purchases,
    "expenses" => $expenses,
    "customers" => $customers,
    "php" => true,
  ];
}

function pos_reports_to_sheets($data) {
  $num = function ($v) {
    return pos_report_num($v);
  };
  $gstRateRows = [];
  foreach ($data["gstByRate"] ?? [] as $r) {
    $gstRateRows[] = [
      $num($r["gst_rate"]),
      $num($r["taxable"]),
      $num($r["cgst"] ?? 0),
      $num($r["sgst"] ?? 0),
      $num($r["igst"] ?? 0),
      $num($r["gst"]),
      $num($r["bills"] ?? 0),
    ];
  }
  $gstInputRows = [];
  foreach ($data["gstInputByRate"] ?? [] as $r) {
    $gstInputRows[] = [
      $num($r["gst_rate"]),
      $num($r["taxable"]),
      $num($r["cgst"] ?? 0),
      $num($r["sgst"] ?? 0),
      $num($r["igst"] ?? 0),
      $num($r["gst"]),
    ];
  }
  $s = $data["summary"] ?? [];
  $gstSummary = $s["gstSummary"] ?? [];
  $out = $gstSummary["output"] ?? [];
  $inp = $gstSummary["input"] ?? [];
  $net = $gstSummary["net"] ?? [];
  return [
    [
      "name" => "GST summary",
      "headers" => ["Type", "CGST", "SGST", "IGST", "Total GST"],
      "rows" => [
        ["Output", $num($out["cgst"] ?? 0), $num($out["sgst"] ?? 0), $num($out["igst"] ?? 0), $num($out["total"] ?? 0)],
        ["Input", $num($inp["cgst"] ?? 0), $num($inp["sgst"] ?? 0), $num($inp["igst"] ?? 0), $num($inp["total"] ?? 0)],
        ["Net payable", $num($net["cgst"] ?? 0), $num($net["sgst"] ?? 0), $num($net["igst"] ?? 0), $num($net["total"] ?? 0)],
      ],
    ],
    [
      "name" => "Summary",
      "headers" => ["From", "To", "Bills", "Taxable", "Output GST", "Input GST", "Net GST", "Takings"],
      "rows" => [[
        $data["from"],
        $data["to"],
        $num($s["bills"] ?? 0),
        $num($s["taxable"] ?? 0),
        $num($s["gst"] ?? 0),
        $num($s["inputGst"] ?? 0),
        $num($s["netGst"] ?? 0),
        $num($s["takings"] ?? 0),
      ]],
    ],
    [
      "name" => "Sales bills",
      "headers" => ["Order", "Customer", "Type", "Pack", "Pack count", "Status", "Qty g", "Taxable", "GST", "Total", "Pay", "Pay status", "Date"],
      "rows" => array_map(function ($o) use ($num) {
        return [
          $o["order_number"],
          $o["customer_name"],
          $o["customer_type"],
          $o["pack_name"] ?: "Loose items",
          $num($o["pack_count"]),
          $o["status"],
          $num($o["total_quantity_gm"]),
          $num($o["subtotal"]),
          $num($o["gst"]),
          $num($o["total"]),
          $o["payment_method"],
          $o["payment_status"],
          (string) $o["created_at"],
        ];
      }, $data["sales"] ?? []),
    ],
    [
      "name" => "Item sales",
      "headers" => ["Item", "Qty g", "Amount", "GST"],
      "rows" => array_map(function ($r) use ($num) {
        return [$r["item_name"], $num($r["quantity_gm"]), $num($r["amount"]), $num($r["gst"])];
      }, $data["byItem"] ?? []),
    ],
    [
      "name" => "Customer sales",
      "headers" => ["Customer", "Type", "Bills", "Takings", "GST"],
      "rows" => array_map(function ($r) use ($num) {
        return [$r["customer_name"], $r["customer_type"], $num($r["bills"]), $num($r["takings"]), $num($r["gst"])];
      }, $data["byCustomer"] ?? []),
    ],
    [
      "name" => "Pack sales",
      "headers" => ["Pack type", "Pack count", "Bills", "Takings"],
      "rows" => array_map(function ($r) use ($num) {
        return [$r["pack_type"], $num($r["pack_count"]), $num($r["bills"]), $num($r["takings"])];
      }, $data["byPack"] ?? []),
    ],
    [
      "name" => "Payment",
      "headers" => ["Method", "Bills", "Takings"],
      "rows" => array_map(function ($r) use ($num) {
        return [$r["payment_method"], $num($r["bills"]), $num($r["takings"])];
      }, $data["byPay"] ?? []),
    ],
    [
      "name" => "Payment daywise",
      "headers" => ["Day", "Cash", "UPI", "Card", "Credit", "Other", "Bills", "Total"],
      "rows" => array_map(function ($r) use ($num) {
        return [
          pos_report_day($r["day"]),
          $num($r["cash"]),
          $num($r["upi"]),
          $num($r["card"]),
          $num($r["credit"]),
          $num($r["other"]),
          $num($r["bills"]),
          $num($r["total"]),
        ];
      }, $data["payDaywise"] ?? []),
    ],
    [
      "name" => "GST daywise",
      "headers" => ["Day", "Taxable", "GST", "Total"],
      "rows" => array_map(function ($r) use ($num) {
        return [pos_report_day($r["day"]), $num($r["taxable"]), $num($r["gst"]), $num($r["total"])];
      }, $data["gst"] ?? []),
    ],
    [
      "name" => "GST output by rate",
      "headers" => ["GST %", "Taxable", "CGST", "SGST", "IGST", "Total GST", "Bills"],
      "rows" => $gstRateRows,
    ],
    [
      "name" => "GST input by rate",
      "headers" => ["GST %", "Taxable", "CGST", "SGST", "IGST", "Total GST"],
      "rows" => $gstInputRows,
    ],
    [
      "name" => "GST HSN itemwise",
      "headers" => ["HSN/SKU", "Item", "GST %", "Qty g", "Taxable", "GST"],
      "rows" => array_map(function ($r) use ($num) {
        return [$r["hsn"], $r["item_name"], $num($r["gst_rate"]), $num($r["quantity_gm"]), $num($r["taxable"]), $num($r["gst"])];
      }, $data["gstHsn"] ?? []),
    ],
    [
      "name" => "GST B2B sales",
      "headers" => ["Bill", "Date", "Customer", "GSTIN", "Taxable", "CGST", "SGST", "IGST", "Total", "Supply"],
      "rows" => array_map(function ($r) use ($num) {
        return [
          $r["order_number"],
          (string) $r["bill_date"],
          $r["customer_name"],
          $r["gstin"],
          $num($r["taxable"]),
          $num($r["cgst"] ?? 0),
          $num($r["sgst"] ?? 0),
          $num($r["igst"] ?? 0),
          $num($r["total"]),
          !empty($r["interState"]) ? "Inter-state" : "Intra-state",
        ];
      }, $data["gstB2B"] ?? []),
    ],
    [
      "name" => "GST B2C sales",
      "headers" => ["Bill", "Date", "Customer", "Taxable", "CGST", "SGST", "IGST", "Total", "Supply"],
      "rows" => array_map(function ($r) use ($num) {
        return [
          $r["order_number"],
          (string) $r["bill_date"],
          $r["customer_name"],
          $num($r["taxable"]),
          $num($r["cgst"] ?? 0),
          $num($r["sgst"] ?? 0),
          $num($r["igst"] ?? 0),
          $num($r["total"]),
          !empty($r["interState"]) ? "Inter-state" : "Intra-state",
        ];
      }, $data["gstB2C"] ?? []),
    ],
    [
      "name" => "Stock",
      "headers" => ["Code", "Name", "HSN", "Category", "Subcategory", "Stock g", "Reorder g", "Retail", "B2B", "Purchase", "GST %"],
      "rows" => array_map(function ($i) use ($num) {
        return [
          $i["code"], $i["name"], $i["hsn"], $i["category"], $i["subcategory"],
          $num($i["stock_gm"]), $num($i["reorder_level_gm"]), $num($i["retail_rate"]), $num($i["b2b_rate"]),
          $num($i["purchase_rate"]), $num($i["gst_rate"]),
        ];
      }, $data["stock"] ?? []),
    ],
    [
      "name" => "Low stock",
      "headers" => ["Code", "Name", "Stock g", "Reorder g"],
      "rows" => array_map(function ($i) use ($num) {
        return [$i["code"], $i["name"], $num($i["stock_gm"]), $num($i["reorder_level_gm"])];
      }, $data["low"] ?? []),
    ],
    [
      "name" => "Purchases",
      "headers" => ["PO", "Supplier", "Invoice", "Date", "Taxable", "GST", "Total", "Pay", "Status"],
      "rows" => array_map(function ($p) use ($num) {
        return [
          $p["purchase_number"], $p["supplier_name"], $p["supplier_invoice_number"], $p["purchase_date"],
          $num($p["subtotal"]), $num($p["gst"]), $num($p["total"]), $p["payment_method"], $p["payment_status"],
        ];
      }, $data["purchases"] ?? []),
    ],
    [
      "name" => "Expenses",
      "headers" => ["No.", "Date", "Category", "Amount", "GST", "Total", "Pay", "Notes"],
      "rows" => array_map(function ($e) use ($num) {
        return [
          $e["expense_number"], $e["expense_date"], $e["category"],
          $num($e["amount"]), $num($e["gst"]), $num($e["total"] ?? ($e["amount"] + $e["gst"])),
          $e["payment_method"], $e["notes"],
        ];
      }, $data["expenses"] ?? []),
    ],
    [
      "name" => "Customers",
      "headers" => ["Code", "Name", "Business", "Mobile", "Type", "State", "GSTIN", "Credit limit", "Outstanding"],
      "rows" => array_map(function ($c) use ($num) {
        return [
          $c["code"], $c["name"], $c["business_name"], $c["mobile"], $c["type"], $c["state"] ?? null, $c["gstin"],
          $num($c["credit_limit"]), $num($c["outstanding"]),
        ];
      }, $data["customers"] ?? []),
    ],
  ];
}

function pos_escape_xml($value) {
  return htmlspecialchars((string) ($value ?? ""), ENT_XML1 | ENT_QUOTES, "UTF-8");
}

function pos_excel_cell($value) {
  if ($value === null || $value === "") {
    return "<Cell><Data ss:Type=\"String\"></Data></Cell>";
  }
  if (is_numeric($value) && is_finite((float) $value)) {
    return "<Cell><Data ss:Type=\"Number\">" . $value . "</Data></Cell>";
  }
  return "<Cell><Data ss:Type=\"String\">" . pos_escape_xml($value) . "</Data></Cell>";
}

function pos_workbook_xml($sheets) {
  $body = "";
  foreach ($sheets as $sheet) {
    $name = mb_substr((string) $sheet["name"], 0, 31);
    $header = "<Row>" . implode("", array_map("pos_excel_cell", $sheet["headers"])) . "</Row>";
    $rows = "";
    foreach ($sheet["rows"] as $row) {
      $rows .= "<Row>" . implode("", array_map("pos_excel_cell", $row)) . "</Row>";
    }
    $body .= "<Worksheet ss:Name=\"" . pos_escape_xml($name) . "\"><Table>" . $header . $rows . "</Table></Worksheet>";
  }
  return '<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
' . $body . '
</Workbook>';
}

function pos_reports_excel_response($bid, $from, $to, $sheetFilter = "") {
  $data = pos_build_reports($bid, $from, $to);
  $sheets = pos_reports_to_sheets($data);
  if ($sheetFilter !== "") {
    $filtered = [];
    foreach ($sheets as $s) {
      if ($s["name"] === $sheetFilter) $filtered[] = $s;
    }
    if (!$filtered) pos_send(400, ["error" => "Unknown report type", "php" => true]);
    $sheets = $filtered;
  }
  $slug = "reports";
  $xml = pos_workbook_xml($sheets);
  http_response_code(200);
  header("Content-Type: application/vnd.ms-excel; charset=utf-8");
  header("Content-Disposition: attachment; filename=\"reports-" . $slug . "-" . $data["from"] . "-to-" . $data["to"] . ".xls\"");
  echo $xml;
  exit;
}
