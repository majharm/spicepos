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

function pos_pay_mode_bucket($method) {
  $m = strtolower(trim(preg_replace("/[\\s_]+/", "-", (string) ($method ?? ""))));
  if ($m === "cash") return "cash";
  if ($m === "upi") return "upi";
  if ($m === "card" || $m === "credit-card" || $m === "debit-card") return "card";
  if ($m === "credit") return "credit";
  return "other";
}

function pos_pay_status_bucket($status) {
  $s = strtolower(trim((string) ($status ?? "paid")));
  if (in_array($s, ["partial", "partially-paid", "part-paid", "partly-paid"], true)) return "partial";
  if (in_array($s, ["unpaid", "due"], true)) return "unpaid";
  return "paid";
}

function pos_summarize_daily_sales($sales, $refundsByOrderId = []) {
  $seen = [];
  $invoices = [];
  $totals = [
    "bills" => 0,
    "subtotal" => 0.0,
    "discount" => 0.0,
    "gst" => 0.0,
    "returned" => 0.0,
    "net" => 0.0,
    "cash" => 0.0,
    "upi" => 0.0,
    "card" => 0.0,
    "credit" => 0.0,
    "other" => 0.0,
    "paid" => 0,
    "unpaid" => 0,
    "partial" => 0,
  ];
  $refunds = is_array($refundsByOrderId) ? $refundsByOrderId : [];
  foreach ($sales ?? [] as $row) {
    if (!is_array($row)) continue;
    $st = strtolower((string) ($row["status"] ?? ""));
    if ($st === "cancelled" || $st === "void") continue;
    $id = trim((string) ($row["id"] ?? ""));
    $num = trim((string) ($row["order_number"] ?? ""));
    $key = $id !== "" ? "id:" . $id : ($num !== "" ? "no:" . $num : "");
    if ($key !== "") {
      if (isset($seen[$key])) continue;
      $seen[$key] = true;
    }
    $total = pos_report_num($row["total"] ?? 0);
    $returnedRaw = $row["returned"] ?? null;
    if ($returnedRaw === null) {
      if ($id !== "" && isset($refunds[$id])) $returnedRaw = $refunds[$id];
      else if ($num !== "" && isset($refunds[$num])) $returnedRaw = $refunds[$num];
      else $returnedRaw = 0;
    }
    $returned = max(0, pos_report_num($returnedRaw));
    $net = max(0, $total - $returned);
    $mode = pos_pay_mode_bucket($row["payment_method"] ?? "");
    $payStatus = pos_pay_status_bucket($row["payment_status"] ?? "paid");
    $name = trim((string) ($row["customer_name"] ?? ""));
    $invoice = [
      "id" => $id,
      "order_number" => $row["order_number"] ?? "",
      "created_at" => $row["created_at"] ?? "",
      "customer_name" => $name !== "" ? $name : "Walk-in",
      "payment_method" => $row["payment_method"] ?? "",
      "payment_mode" => $mode,
      "payment_status" => $payStatus,
      "status" => $row["status"] ?? "confirmed",
      "subtotal" => pos_report_num($row["subtotal"] ?? 0),
      "discount" => pos_report_num($row["discount"] ?? 0),
      "gst" => pos_report_num($row["gst"] ?? 0),
      "total" => $total,
      "returned" => $returned,
      "net" => $net,
    ];
    $invoices[] = $invoice;
    $totals["bills"] += 1;
    $totals["subtotal"] += $invoice["subtotal"];
    $totals["discount"] += $invoice["discount"];
    $totals["gst"] += $invoice["gst"];
    $totals["returned"] += $returned;
    $totals["net"] += $net;
    $totals[$mode] += $net;
    $totals[$payStatus] += 1;
  }
  foreach (["subtotal", "discount", "gst", "returned", "net", "cash", "upi", "card", "credit", "other"] as $k) {
    $totals[$k] = round($totals[$k], 2);
  }
  return ["invoices" => $invoices, "totals" => $totals];
}

function pos_assemble_dsa_sales($shops, $sales, $refundsByOrderId = [], $opts = []) {
  [$start, $end] = pos_report_range($opts["from"] ?? null, $opts["to"] ?? null);
  $wanted = function_exists("pos_normalize_dsa_code") ? pos_normalize_dsa_code($opts["code"] ?? "") : strtoupper(trim((string) ($opts["code"] ?? "")));
  if ($wanted === "") $wanted = null;
  $shopList = [];
  foreach ($shops ?? [] as $s) {
    if (trim((string) ($s["dsa_code"] ?? "")) !== "") $shopList[] = $s;
  }
  $salesByShop = [];
  foreach ($sales ?? [] as $row) {
    $bid = (string) ($row["business_id"] ?? "");
    if (!isset($salesByShop[$bid])) $salesByShop[$bid] = [];
    $salesByShop[$bid][] = $row;
  }
  $codeMap = [];
  foreach ($shopList as $shop) {
    $code = function_exists("pos_normalize_dsa_code") ? pos_normalize_dsa_code($shop["dsa_code"] ?? "") : strtoupper(trim((string) ($shop["dsa_code"] ?? "")));
    if (!$code) continue;
    $ds = pos_summarize_daily_sales($salesByShop[(string) $shop["id"]] ?? [], $refundsByOrderId);
    if (!isset($codeMap[$code])) $codeMap[$code] = ["code" => $code, "shops" => 0, "bills" => 0, "net" => 0.0];
    $codeMap[$code]["shops"] += 1;
    $codeMap[$code]["bills"] += (int) ($ds["totals"]["bills"] ?? 0);
    $codeMap[$code]["net"] = round($codeMap[$code]["net"] + (float) ($ds["totals"]["net"] ?? 0), 2);
  }
  if (!isset($codeMap["0001"])) $codeMap["0001"] = ["code" => "0001", "shops" => 0, "bills" => 0, "net" => 0.0];
  $filtered = $wanted
    ? array_values(array_filter($shopList, function ($s) use ($wanted) {
        $code = function_exists("pos_normalize_dsa_code") ? pos_normalize_dsa_code($s["dsa_code"] ?? "") : strtoupper(trim((string) ($s["dsa_code"] ?? "")));
        return $code === $wanted;
      }))
    : $shopList;
  $shopRows = [];
  $invoices = [];
  $filteredIds = [];
  foreach ($filtered as $shop) {
    $ds = pos_summarize_daily_sales($salesByShop[(string) $shop["id"]] ?? [], $refundsByOrderId);
    $t = $ds["totals"];
    $code = function_exists("pos_normalize_dsa_code") ? pos_normalize_dsa_code($shop["dsa_code"] ?? "") : strtoupper(trim((string) ($shop["dsa_code"] ?? "")));
    $shopRows[] = [
      "id" => $shop["id"],
      "name" => $shop["name"] ?? "—",
      "city" => $shop["city"] ?? "",
      "status" => $shop["status"] ?? "",
      "dsa_code" => $code,
      "bills" => $t["bills"],
      "net" => $t["net"],
      "cash" => $t["cash"],
      "upi" => $t["upi"],
      "card" => $t["card"],
      "credit" => $t["credit"],
      "paid" => $t["paid"],
      "unpaid" => $t["unpaid"],
      "partial" => $t["partial"],
    ];
    $filteredIds[(string) $shop["id"]] = true;
    foreach ($ds["invoices"] as $inv) {
      $invoices[] = array_merge($inv, [
        "business_id" => $shop["id"],
        "shop_name" => $shop["name"] ?? "—",
        "dsa_code" => $code,
      ]);
    }
  }
  $filteredSales = [];
  foreach ($sales ?? [] as $row) {
    if (isset($filteredIds[(string) ($row["business_id"] ?? "")])) $filteredSales[] = $row;
  }
  $totals = pos_summarize_daily_sales($filteredSales, $refundsByOrderId)["totals"];
  $totals["shops"] = count($shopRows);
  $codes = array_values($codeMap);
  usort($codes, function ($a, $b) { return strcmp($a["code"], $b["code"]); });
  return [
    "from" => $start,
    "to" => $end,
    "code" => $wanted ?: "",
    "codes" => $codes,
    "shops" => $shopRows,
    "invoices" => $invoices,
    "totals" => $totals,
  ];
}

function pos_build_dsa_sales($code, $from, $to) {
  if (function_exists("pos_ensure_report_columns")) pos_ensure_report_columns();
  $end = $to ?: date("Y-m-d");
  $start = $from ?: $end;
  $shops = pos_q(
    "SELECT id, name, city, status, dsa_code
     FROM businesses
     WHERE dsa_code IS NOT NULL AND TRIM(dsa_code) <> ''
     ORDER BY name"
  ) ?: [];
  $ids = [];
  foreach ($shops as $s) $ids[] = $s["id"];
  $sales = [];
  $refunds = [];
  if ($ids) {
    $ph = implode(",", array_fill(0, count($ids), "?"));
    $types = str_repeat("s", count($ids) + 2);
    $params = array_merge($ids, [$start, $end]);
    $sales = pos_q(
      "SELECT id, business_id, order_number, customer_name, status, subtotal, discount, gst, total,
              payment_method, payment_status, created_at
       FROM sales_orders
       WHERE business_id IN ($ph) AND " . pos_created_between() . "
       ORDER BY created_at",
      $types,
      $params
    ) ?: [];
    try {
      $refundRows = pos_q(
        "SELECT r.order_id, COALESCE(SUM(r.refund_amount),0) AS refunded
         FROM sales_returns r
         JOIN sales_orders o ON o.id = r.order_id AND o.business_id = r.business_id
         WHERE o.business_id IN ($ph) AND " . pos_created_between("o") . "
           AND LOWER(COALESCE(r.status,'')) <> 'cancelled'
         GROUP BY r.order_id",
        $types,
        $params
      ) ?: [];
      foreach ($refundRows as $r) {
        $refunds[(string) ($r["order_id"] ?? "")] = pos_report_num($r["refunded"] ?? 0);
      }
    } catch (Exception $e) {
      $refunds = [];
    }
  }
  return pos_assemble_dsa_sales($shops, $sales, $refunds, ["code" => $code, "from" => $start, "to" => $end]);
}

function pos_dsa_sales_to_sheets($data) {
  $num = function ($v) { return pos_report_num($v); };
  $t = $data["totals"] ?? [];
  $shopRows = [];
  foreach ($data["shops"] ?? [] as $s) {
    $shopRows[] = [
      $s["name"] ?? "",
      $s["city"] ?? "",
      $s["dsa_code"] ?? "",
      $num($s["bills"] ?? 0),
      $num($s["cash"] ?? 0),
      $num($s["upi"] ?? 0),
      $num($s["card"] ?? 0),
      $num($s["credit"] ?? 0),
      $num($s["net"] ?? 0),
    ];
  }
  $invRows = [];
  foreach ($data["invoices"] ?? [] as $o) {
    $invRows[] = [
      $o["shop_name"] ?? "",
      $o["order_number"] ?? "",
      (string) ($o["created_at"] ?? ""),
      $o["customer_name"] ?? "",
      $o["payment_method"] ?? ($o["payment_mode"] ?? ""),
      $o["payment_status"] ?? "",
      $num($o["subtotal"] ?? 0),
      $num($o["discount"] ?? 0),
      $num($o["gst"] ?? 0),
      $num($o["returned"] ?? 0),
      $num($o["net"] ?? 0),
    ];
  }
  return [
    [
      "name" => "DSA summary",
      "headers" => ["DSA", "From", "To", "Shops", "Invoices", "Cash", "UPI", "Card", "Credit", "Total"],
      "rows" => [[
        $data["code"] ?: "All",
        $data["from"] ?? "",
        $data["to"] ?? "",
        $num($t["shops"] ?? 0),
        $num($t["bills"] ?? 0),
        $num($t["cash"] ?? 0),
        $num($t["upi"] ?? 0),
        $num($t["card"] ?? 0),
        $num($t["credit"] ?? 0),
        $num($t["net"] ?? 0),
      ]],
    ],
    [
      "name" => "DSA shops",
      "headers" => ["Shop", "City", "DSA", "Invoices", "Cash", "UPI", "Card", "Credit", "Total"],
      "rows" => $shopRows,
    ],
    [
      "name" => "DSA invoices",
      "headers" => ["Shop", "Invoice", "Date & Time", "Customer", "Payment Mode", "Status", "Subtotal", "Discount", "GST", "Returned", "Amount"],
      "rows" => $invRows,
    ],
  ];
}

function pos_report_range($from, $to) {
  $fy = function_exists("pos_indian_fy") ? pos_indian_fy() : ["from" => date("Y") . "-04-01", "to" => date("Y-m-d")];
  $end = $to ?: date("Y-m-d");
  $start = $from ?: $fy["from"];
  return [$start, $end];
}

function pos_ensure_report_columns() {
  if (!function_exists("pos_ensure_columns")) return;
  pos_ensure_columns("sales_orders", [
    "discount" => "DECIMAL(12,2) NOT NULL DEFAULT 0",
  ]);
  pos_ensure_columns("items", [
    "hsn" => "VARCHAR(32) NULL",
    "local_name" => "VARCHAR(255) NULL",
  ]);
  pos_ensure_columns("customers", [
    "state" => "VARCHAR(64) NULL",
    "gstin" => "VARCHAR(32) NULL",
  ]);
  pos_ensure_columns("company_settings", [
    "gstin" => "VARCHAR(32) NULL",
    "state" => "VARCHAR(64) NULL",
  ]);
  pos_ensure_columns("purchase_lines", ["gst_amount" => "DECIMAL(12,2) NOT NULL DEFAULT 0"]);
  pos_ensure_columns("suppliers", ["gstin" => "VARCHAR(32) NULL"]);
}

function pos_build_reports($bid, $from, $to) {
  if (function_exists("pos_ensure_accounts_schema")) pos_ensure_accounts_schema();
  pos_ensure_report_columns();
  [$start, $end] = pos_report_range($from, $to);
  $salesWhere = "business_id = ? AND " . pos_created_between() . "";
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
    "SELECT id, order_number, customer_name, customer_type, pack_name, pack_count,
            status, total_quantity_gm, subtotal, discount, gst, total, payment_method,
            payment_status, created_at
     FROM sales_orders WHERE $salesWhere ORDER BY created_at",
    "sss",
    [$bid, $start, $end]
  );
  $refunds = [];
  try {
    $refundRows = pos_q(
      "SELECT r.order_id, COALESCE(SUM(r.refund_amount),0) AS refunded
       FROM sales_returns r
       JOIN sales_orders o ON o.id = r.order_id AND o.business_id = r.business_id
       WHERE o.business_id = ? AND " . pos_created_between("o") . "
         AND LOWER(COALESCE(r.status,'')) <> 'cancelled'
       GROUP BY r.order_id",
      "sss",
      [$bid, $start, $end]
    );
    foreach ($refundRows ?: [] as $r) {
      $refunds[(string) ($r["order_id"] ?? "")] = pos_report_num($r["refunded"] ?? 0);
    }
  } catch (Exception $e) {
    $refunds = [];
  }
  $dailySales = pos_summarize_daily_sales($sales ?: [], $refunds);
  $byItem = pos_q(
    "SELECT l.item_name,
            COALESCE(NULLIF(TRIM(l.color), ''), NULLIF(TRIM(i.color), ''), '') AS color,
            COALESCE(NULLIF(TRIM(l.size), ''), NULLIF(TRIM(i.size), ''), '') AS size,
            SUM(l.quantity_gm) AS quantity_gm, SUM(l.amount) AS amount,
            SUM(l.amount * l.gst_rate / 100) AS gst
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id
     LEFT JOIN items i ON i.id = l.item_id
     WHERE o.business_id = ? AND " . pos_created_between("o") . " AND l.cancelled = 0
     GROUP BY l.item_name,
              COALESCE(NULLIF(TRIM(l.color), ''), NULLIF(TRIM(i.color), ''), ''),
              COALESCE(NULLIF(TRIM(l.size), ''), NULLIF(TRIM(i.size), ''), '')
     ORDER BY amount DESC",
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
    "SELECT code, name, hsn, local_name, category, subcategory, color, size, stock_gm, reorder_level_gm,
            retail_rate, b2b_rate, purchase_rate, gst_rate
     FROM items WHERE business_id = ? ORDER BY name",
    "s",
    [$bid]
  );
  $low = [];
  foreach ($stock as $i) {
    if (pos_report_num($i["stock_gm"]) <= pos_report_num($i["reorder_level_gm"])) $low[] = $i;
  }
  $purchaseLines = [];
  try {
    $purchaseLines = pos_q(
      "SELECT p.purchase_number, p.purchase_date, p.supplier_name, l.item_name,
              COALESCE(NULLIF(TRIM(l.color), ''), NULLIF(TRIM(i.color), ''), '') AS color,
              COALESCE(NULLIF(TRIM(l.size), ''), NULLIF(TRIM(i.size), ''), '') AS size,
              l.quantity_gm, l.amount
       FROM purchase_lines l
       JOIN purchases p ON p.id = l.purchase_id
       LEFT JOIN items i ON i.id = l.item_id
       WHERE p.business_id = ? AND p.purchase_date BETWEEN ? AND ?
       ORDER BY p.purchase_date, l.item_name",
      "sss",
      [$bid, $start, $end]
    ) ?: [];
  } catch (Exception $e) {
    $purchaseLines = [];
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
  if (function_exists("pos_ensure_columns")) {
    pos_ensure_columns("customers", ["email" => "VARCHAR(160) NULL"]);
  }
  try {
    $customers = pos_q(
      "SELECT code, name, business_name, mobile, email, type, gstin, state, credit_limit, outstanding
       FROM customers WHERE business_id = ? ORDER BY name",
      "s",
      [$bid]
    );
  } catch (Exception $e) {
    $customers = pos_q(
      "SELECT code, name, business_name, mobile, type, gstin, state, credit_limit, outstanding
       FROM customers WHERE business_id = ? ORDER BY name",
      "s",
      [$bid]
    );
    foreach ($customers as &$customerRow) $customerRow["email"] = null;
    unset($customerRow);
  }
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
     WHERE o.business_id = ? AND " . pos_created_between("o") . " AND l.cancelled = 0",
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
  $hsnExpr = "COALESCE(NULLIF(TRIM(i.hsn), ''), NULLIF(TRIM(i.code), ''), '-')";
  $gstHsn = pos_q(
    "SELECT $hsnExpr AS hsn, l.item_name, l.gst_rate,
            SUM(l.quantity_gm) AS quantity_gm,
            SUM(l.amount) AS taxable,
            SUM(l.amount * l.gst_rate / 100) AS gst
     FROM sales_order_lines l
     JOIN sales_orders o ON o.id = l.order_id
     LEFT JOIN items i ON i.id = l.item_id
     WHERE o.business_id = ? AND " . pos_created_between("o") . " AND l.cancelled = 0
     GROUP BY i.hsn, i.code, l.item_name, l.gst_rate
     ORDER BY hsn, l.item_name",
    "sss",
    [$bid, $start, $end]
  );
  $gstB2B = pos_q(
    "SELECT o.order_number, DATE(o.created_at) AS bill_date, o.customer_name, c.gstin,
            c.state AS customer_state, o.subtotal AS taxable, o.gst, o.total
     FROM sales_orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.business_id = ? AND " . pos_created_between("o") . "
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
     WHERE o.business_id = ? AND " . pos_created_between("o") . "
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
    "total" => pos_gst_round2(
      $purchaseInputSplit["total"] + $expenseInputSplit["cgst"] + $expenseInputSplit["sgst"] + $expenseInputSplit["igst"]
    ),
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
    "dailySales" => $dailySales,
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
    "purchaseLines" => $purchaseLines,
    "expenses" => $expenses,
    "customers" => $customers,
    "php" => true,
  ];
}

function pos_reports_to_sheets($data, $biz = null) {
  $tax = function_exists("pos_tax_code_label") ? pos_tax_code_label($biz ?: []) : "HSN";
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
  $sheets = [
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
      "name" => "Daily Sales",
      "headers" => ["Invoice", "Date & Time", "Customer", "Payment Mode", "Status", "Subtotal", "Discount", "GST", "Returned", "Amount"],
      "rows" => array_map(function ($o) use ($num) {
        return [
          $o["order_number"] ?? "",
          (string) ($o["created_at"] ?? ""),
          $o["customer_name"] ?? "",
          $o["payment_method"] ?? ($o["payment_mode"] ?? ""),
          $o["payment_status"] ?? "",
          $num($o["subtotal"] ?? 0),
          $num($o["discount"] ?? 0),
          $num($o["gst"] ?? 0),
          $num($o["returned"] ?? 0),
          $num($o["net"] ?? 0),
        ];
      }, $data["dailySales"]["invoices"] ?? []),
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
          strtolower((string) ($o["status"] ?? "")) === "cancelled" ? "Void" : $o["status"],
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
      "headers" => (function_exists("pos_is_apparel_shop") && pos_is_apparel_shop($biz)) ? ["Item", "Colour", "Size", "Qty g", "Amount", "GST"] : ["Item", "Qty g", "Amount", "GST"],
      "rows" => array_map(function ($r) use ($num, $biz) {
        if (function_exists("pos_is_apparel_shop") && pos_is_apparel_shop($biz)) {
          return [$r["item_name"], $r["color"] ?? "", $r["size"] ?? "", $num($r["quantity_gm"]), $num($r["amount"]), $num($r["gst"])];
        }
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
      "name" => "GST " . $tax . " itemwise",
      "headers" => [$tax . "/SKU", "Item", "GST %", "Qty g", "Taxable", "GST"],
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
      "headers" => (function_exists("pos_is_apparel_shop") && pos_is_apparel_shop($biz))
        ? ["Code", "Name", $tax, "Category", "Subcategory", "Colour", "Size", "Stock g", "Reorder g", "Retail", "B2B", "Purchase", "GST %"]
        : ["Code", "Name", $tax, "Category", "Subcategory", "Stock g", "Reorder g", "Retail", "B2B", "Purchase", "GST %"],
      "rows" => array_map(function ($i) use ($num, $biz) {
        if (function_exists("pos_is_apparel_shop") && pos_is_apparel_shop($biz)) {
          return [
            $i["code"], $i["name"], $i["hsn"], $i["category"], $i["subcategory"], $i["color"] ?? "", $i["size"] ?? "",
            $num($i["stock_gm"]), $num($i["reorder_level_gm"]), $num($i["retail_rate"]), $num($i["b2b_rate"]),
            $num($i["purchase_rate"]), $num($i["gst_rate"]),
          ];
        }
        return [
          $i["code"], $i["name"], $i["hsn"], $i["category"], $i["subcategory"],
          $num($i["stock_gm"]), $num($i["reorder_level_gm"]), $num($i["retail_rate"]), $num($i["b2b_rate"]),
          $num($i["purchase_rate"]), $num($i["gst_rate"]),
        ];
      }, $data["stock"] ?? []),
    ],
    [
      "name" => "Low stock",
      "headers" => (function_exists("pos_is_apparel_shop") && pos_is_apparel_shop($biz))
        ? ["Code", "Name", "Colour", "Size", "Stock g", "Reorder g"]
        : ["Code", "Name", "Stock g", "Reorder g"],
      "rows" => array_map(function ($i) use ($num, $biz) {
        if (function_exists("pos_is_apparel_shop") && pos_is_apparel_shop($biz)) {
          return [$i["code"], $i["name"], $i["color"] ?? "", $i["size"] ?? "", $num($i["stock_gm"]), $num($i["reorder_level_gm"])];
        }
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
      "headers" => ["Code", "Name", "Business", "Mobile", "Email", "Type", "State", "GSTIN", "Credit limit", "Outstanding"],
      "rows" => array_map(function ($c) use ($num) {
        return [
          $c["code"], $c["name"], $c["business_name"], $c["mobile"], $c["email"] ?? "", $c["type"], $c["state"] ?? null, $c["gstin"],
          $num($c["credit_limit"]), $num($c["outstanding"]),
        ];
      }, $data["customers"] ?? []),
    ],
  ];
  if (function_exists("pos_is_apparel_shop") && pos_is_apparel_shop($biz)) {
    $lineSheet = [
      "name" => "Purchase lines",
      "headers" => ["PO", "Date", "Supplier", "Item", "Colour", "Size", "Qty g", "Amount"],
      "rows" => array_map(function ($r) use ($num) {
        return [
          $r["purchase_number"] ?? "", $r["purchase_date"] ?? "", $r["supplier_name"] ?? "", $r["item_name"] ?? "",
          $r["color"] ?? "", $r["size"] ?? "", $num($r["quantity_gm"] ?? 0), $num($r["amount"] ?? 0),
        ];
      }, $data["purchaseLines"] ?? []),
    ];
    $at = count($sheets);
    foreach ($sheets as $i => $sheet) {
      if (($sheet["name"] ?? "") === "Purchases") $at = $i + 1;
    }
    array_splice($sheets, $at, 0, [$lineSheet]);
  }
  return $sheets;
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
  $bizRows = pos_q("SELECT name, category, business_type FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]);
  $biz = is_array($bizRows) && $bizRows ? $bizRows[0] : [];
  $sheets = pos_reports_to_sheets($data, $biz);
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

function pos_dsa_sales_excel_response($code, $from, $to) {
  $data = pos_build_dsa_sales($code, $from, $to);
  $sheets = pos_dsa_sales_to_sheets($data);
  $slug = strtolower(preg_replace("/[^a-z0-9]+/", "-", (string) ($data["code"] ?: "all"))) ?: "all";
  $xml = pos_workbook_xml($sheets);
  http_response_code(200);
  header("Content-Type: application/vnd.ms-excel; charset=utf-8");
  header("Content-Disposition: attachment; filename=\"dsa-sales-" . $slug . "-" . $data["from"] . "-to-" . $data["to"] . ".xls\"");
  echo $xml;
  exit;
}
