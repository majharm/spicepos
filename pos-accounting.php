<?php

require_once __DIR__ . "/pos-gst-supply.php";

function pos_default_coa() {
  return [
    ["1001", "Cash in hand", "asset"],
    ["1002", "Bank account", "asset"],
    ["1003", "UPI clearing", "asset"],
    ["1101", "Sundry debtors", "asset"],
    ["1201", "Stock in trade", "asset"],
    ["2301", "GST input CGST", "asset"],
    ["2302", "GST input SGST", "asset"],
    ["2303", "GST input IGST", "asset"],
    ["2101", "Sundry creditors", "liability"],
    ["2201", "GST output CGST", "liability"],
    ["2202", "GST output SGST", "liability"],
    ["2203", "GST output IGST", "liability"],
    ["3101", "Capital account", "equity"],
    ["4101", "Sales", "income"],
    ["5101", "Purchase of goods", "expense"],
    ["5102", "Rent", "expense"],
    ["5103", "Electricity", "expense"],
    ["5104", "Salaries & wages", "expense"],
    ["5105", "Transport & freight", "expense"],
    ["5106", "Packaging", "expense"],
    ["5107", "Telephone & internet", "expense"],
    ["5108", "Repairs & maintenance", "expense"],
    ["5199", "Miscellaneous expenses", "expense"],
  ];
}

function pos_expense_categories() {
  $out = [];
  foreach (pos_default_coa() as $row) {
    if ($row[0] >= "5102" && $row[2] === "expense") $out[] = ["code" => $row[0], "name" => $row[1]];
  }
  return $out;
}

function pos_asset_code_for_method($method) {
  $m = strtolower((string) $method);
  if ($m === "credit") return "1101";
  if ($m === "upi") return "1003";
  if ($m === "card" || $m === "bank") return "1002";
  return "1001";
}

function pos_ensure_coa($bid) {
  pos_ensure_accounts_schema();
  $rows = pos_q("SELECT code FROM chart_of_accounts WHERE business_id = ?", "s", [$bid]);
  $have = [];
  foreach ($rows as $r) $have[$r["code"]] = true;
  foreach (pos_default_coa() as $row) {
    if (!empty($have[$row[0]])) continue;
    pos_q(
      "INSERT INTO chart_of_accounts (id, business_id, code, name, account_group, is_system, active) VALUES (?,?,?,?,?,1,1)",
      "sssss",
      [pos_uuid(), $bid, $row[0], $row[1], $row[2]]
    );
  }
}

function pos_account_map($bid) {
  pos_ensure_coa($bid);
  $rows = pos_q("SELECT id, code, name, account_group FROM chart_of_accounts WHERE business_id = ? AND active = 1", "s", [$bid]);
  $map = [];
  foreach ($rows as $r) $map[$r["code"]] = $r;
  return $map;
}

function pos_journal_exists($bid, $refType, $refId) {
  $rows = pos_q(
    "SELECT id FROM journal_entries WHERE business_id = ? AND reference_type = ? AND reference_id = ? LIMIT 1",
    "sss",
    [$bid, $refType, $refId]
  );
  return (bool) $rows;
}

function pos_post_journal($bid, $uid, $opts) {
  pos_ensure_coa($bid);
  $accounts = pos_account_map($bid);
  $lines = $opts["lines"] ?? [];
  $totalDr = 0;
  $totalCr = 0;
  foreach ($lines as $l) {
    $totalDr += (float) ($l["debit"] ?? 0);
    $totalCr += (float) ($l["credit"] ?? 0);
  }
  $totalDr = pos_round2($totalDr);
  $totalCr = pos_round2($totalCr);
  if ($totalDr !== $totalCr) throw new Exception("Journal not balanced");
  if (!$lines) return null;
  $jid = pos_uuid();
  $n = pos_next_seq("journal", $bid, 1001);
  $voucherNo = $opts["voucher_no"] ?? "JNL-{$n}";
  pos_q(
    "INSERT INTO journal_entries (id, business_id, voucher_no, voucher_date, voucher_type, narration, reference_type, reference_id, created_by)
     VALUES (?,?,?,?,?,?,?,?,?)",
    "sssssssss",
    [
      $jid, $bid, $voucherNo,
      $opts["voucher_date"] ?? date("Y-m-d"),
      $opts["voucher_type"] ?? "journal",
      $opts["narration"] ?? null,
      $opts["reference_type"] ?? null,
      $opts["reference_id"] ?? null,
      $uid,
    ]
  );
  foreach ($lines as $l) {
    $code = $l["accountCode"];
    if (!isset($accounts[$code])) throw new Exception("Unknown account {$code}");
    pos_q(
      "INSERT INTO journal_lines (id, journal_id, account_id, debit, credit, business_id) VALUES (?,?,?,?,?,?)",
      "sssdds",
      [pos_uuid(), $jid, $accounts[$code]["id"], (float) ($l["debit"] ?? 0), (float) ($l["credit"] ?? 0), $bid]
    );
  }
  return $jid;
}

function pos_split_gst($gst, $interState = false) {
  return pos_split_gst_amount($gst, $interState);
}

function pos_shop_profile($bid) {
  $rows = pos_q("SELECT gstin, state FROM company_settings WHERE business_id = ? LIMIT 1", "s", [$bid]);
  return $rows[0] ?? [];
}

function pos_customer_profile($bid, $customerId) {
  if (!$customerId) return [];
  $rows = pos_q("SELECT gstin, state FROM customers WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$customerId, $bid]);
  return $rows[0] ?? [];
}

function pos_supplier_profile($bid, $supplierId) {
  if (!$supplierId) return [];
  $rows = pos_q("SELECT gstin FROM suppliers WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$supplierId, $bid]);
  return $rows[0] ?? [];
}

function pos_push_gst_output_lines(&$lines, $split) {
  if (($split["cgst"] ?? 0) > 0) $lines[] = ["accountCode" => "2201", "debit" => 0, "credit" => $split["cgst"]];
  if (($split["sgst"] ?? 0) > 0) $lines[] = ["accountCode" => "2202", "debit" => 0, "credit" => $split["sgst"]];
  if (($split["igst"] ?? 0) > 0) $lines[] = ["accountCode" => "2203", "debit" => 0, "credit" => $split["igst"]];
}

function pos_push_gst_input_lines(&$lines, $split) {
  if (($split["cgst"] ?? 0) > 0) $lines[] = ["accountCode" => "2301", "debit" => $split["cgst"], "credit" => 0];
  if (($split["sgst"] ?? 0) > 0) $lines[] = ["accountCode" => "2302", "debit" => $split["sgst"], "credit" => 0];
  if (($split["igst"] ?? 0) > 0) $lines[] = ["accountCode" => "2303", "debit" => $split["igst"], "credit" => 0];
}

function pos_post_sale_journal($bid, $uid, $order) {
  if (pos_journal_exists($bid, "sales_order", $order["id"])) return null;
  $subtotal = pos_round2($order["subtotal"] ?? 0);
  $shop = pos_shop_profile($bid);
  $customer = pos_customer_profile($bid, $order["customer_id"] ?? null);
  $interState = pos_is_inter_state_supply($shop, $customer);
  $gst = pos_split_gst($order["gst"] ?? 0, $interState);
  $total = pos_round2($order["total"] ?? 0);
  $lines = [
    ["accountCode" => pos_asset_code_for_method($order["payment_method"] ?? "cash"), "debit" => $total, "credit" => 0],
    ["accountCode" => "4101", "debit" => 0, "credit" => $subtotal],
  ];
  pos_push_gst_output_lines($lines, $gst);
  return pos_post_journal($bid, $uid, [
    "voucher_type" => "sale",
    "voucher_date" => pos_normalize_date_only($order["created_at"] ?? null) ?? date("Y-m-d"),
    "narration" => "Sale " . ($order["order_number"] ?? ""),
    "reference_type" => "sales_order",
    "reference_id" => $order["id"],
    "lines" => $lines,
  ]);
}

function pos_post_purchase_journal($bid, $uid, $purchase) {
  if (pos_journal_exists($bid, "purchase", $purchase["id"])) return null;
  $subtotal = pos_round2($purchase["subtotal"] ?? 0);
  $shop = pos_shop_profile($bid);
  $supplier = pos_supplier_profile($bid, $purchase["supplier_id"] ?? null);
  $interState = pos_is_inter_state_supply($shop, $supplier);
  $gst = pos_split_gst($purchase["gst"] ?? 0, $interState);
  $total = pos_round2($purchase["total"] ?? 0);
  $lines = [
    ["accountCode" => "5101", "debit" => $subtotal, "credit" => 0],
  ];
  pos_push_gst_input_lines($lines, $gst);
  $method = strtolower((string) ($purchase["payment_method"] ?? "cash"));
  $creditCode = $method === "credit" ? "2101" : pos_asset_code_for_method($method);
  $lines[] = ["accountCode" => $creditCode, "debit" => 0, "credit" => $total];
  return pos_post_journal($bid, $uid, [
    "voucher_type" => "purchase",
    "voucher_date" => pos_normalize_date_only($purchase["purchase_date"] ?? null) ?? date("Y-m-d"),
    "narration" => "Purchase " . ($purchase["purchase_number"] ?? ""),
    "reference_type" => "purchase",
    "reference_id" => $purchase["id"],
    "lines" => $lines,
  ]);
}

function pos_post_expense_journal($bid, $uid, $expense) {
  if (pos_journal_exists($bid, "expense", $expense["id"])) return null;
  $amt = pos_round2($expense["amount"] ?? 0);
  $gst = pos_split_gst($expense["gst"] ?? 0, false);
  $total = pos_round2($amt + ($expense["gst"] ?? 0));
  $lines = [
    ["accountCode" => $expense["account_code"], "debit" => $amt, "credit" => 0],
  ];
  pos_push_gst_input_lines($lines, $gst);
  $method = strtolower((string) ($expense["payment_method"] ?? "cash"));
  $creditCode = $method === "credit" ? "2101" : pos_asset_code_for_method($method);
  $lines[] = ["accountCode" => $creditCode, "debit" => 0, "credit" => $total];
  return pos_post_journal($bid, $uid, [
    "voucher_type" => "expense",
    "voucher_date" => pos_normalize_date_only($expense["expense_date"] ?? null) ?? date("Y-m-d"),
    "narration" => "Expense " . ($expense["expense_number"] ?? "") . " · " . ($expense["category"] ?? ""),
    "reference_type" => "expense",
    "reference_id" => $expense["id"],
    "lines" => $lines,
  ]);
}

function pos_post_receipt_journal($bid, $uid, $amount, $method, $entryNo, $ledgerId) {
  $amt = pos_round2($amount);
  return pos_post_journal($bid, $uid, [
    "voucher_type" => "receipt",
    "narration" => "Customer receipt {$entryNo}",
    "reference_type" => "account_ledger",
    "reference_id" => $ledgerId,
    "lines" => [
      ["accountCode" => pos_asset_code_for_method($method), "debit" => $amt, "credit" => 0],
      ["accountCode" => "1101", "debit" => 0, "credit" => $amt],
    ],
  ]);
}

function pos_post_payment_journal($bid, $uid, $amount, $method, $entryNo, $ledgerId) {
  $amt = pos_round2($amount);
  return pos_post_journal($bid, $uid, [
    "voucher_type" => "payment",
    "narration" => "Supplier payment {$entryNo}",
    "reference_type" => "account_ledger",
    "reference_id" => $ledgerId,
    "lines" => [
      ["accountCode" => "2101", "debit" => $amt, "credit" => 0],
      ["accountCode" => pos_asset_code_for_method($method), "debit" => 0, "credit" => $amt],
    ],
  ]);
}

function pos_lines_for_period($bid, $from, $to) {
  pos_ensure_coa($bid);
  return pos_q(
    "SELECT a.code, a.name, a.account_group,
            COALESCE(SUM(l.debit),0) AS debit,
            COALESCE(SUM(l.credit),0) AS credit
     FROM chart_of_accounts a
     LEFT JOIN journal_lines l ON l.account_id = a.id AND l.business_id = a.business_id
     LEFT JOIN journal_entries j ON j.id = l.journal_id AND j.business_id = a.business_id
       AND j.voucher_date BETWEEN ? AND ?
     WHERE a.business_id = ? AND a.active = 1
     GROUP BY a.id, a.code, a.name, a.account_group
     ORDER BY a.code",
    "sss",
    [$from, $to, $bid]
  );
}

function pos_accounts_dispatch($path, $method, $body, $bid, $auth, $branchId, $uid) {
  if (strpos($path, "accounts/") !== 0 && $path !== "expenses") return false;
  if (!pos_can($auth["user"], "accounts")) pos_send(403, ["error" => "Not allowed"]);
  pos_ensure_accounts_schema();
  pos_ensure_coa($bid);

  if ($path === "expenses" && $method === "GET") {
    $fy = pos_indian_fy();
    $from = $_GET["from"] ?? $fy["from"];
    $to = $_GET["to"] ?? $fy["to"];
    pos_send(200, pos_q(
      "SELECT * FROM expenses WHERE business_id = ? AND expense_date BETWEEN ? AND ?
       ORDER BY expense_date DESC, created_at DESC LIMIT 200",
      "sss",
      [$bid, $from, $to]
    ));
  }

  if ($path === "expenses" && $method === "POST") {
    $code = trim((string) ($body["account_code"] ?? ""));
    $cat = null;
    foreach (pos_expense_categories() as $row) {
      if ($row["code"] === $code) { $cat = $row; break; }
    }
    if (!$cat) pos_send(400, ["error" => "Choose an expense category"]);
    $amt = pos_round2($body["amount"] ?? 0);
    if ($amt <= 0) pos_send(400, ["error" => "Amount is required"]);
    $gstAmt = pos_round2($body["gst"] ?? 0);
    $methodPay = strtolower((string) ($body["payment_method"] ?? "cash"));
    if (!in_array($methodPay, ["cash", "upi", "card", "bank"], true)) pos_send(400, ["error" => "Invalid payment method"]);
    try {
      $expense = pos_with_transaction(function () use ($body, $bid, $uid, $cat, $amt, $gstAmt, $methodPay) {
        $n = pos_next_seq("expense", $bid, 1001);
        $id = pos_uuid();
        $expenseNumber = "EXP-{$n}";
        pos_q(
          "INSERT INTO expenses (
             id, business_id, expense_number, expense_date, category, account_code,
             amount, gst, payment_method, notes, created_by
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          "ssssssddsss",
          [
            $id, $bid, $expenseNumber, $body["expense_date"] ?? date("Y-m-d"),
            $body["category"] ?? $cat["name"], $cat["code"], $amt, $gstAmt, $methodPay,
            trim((string) ($body["notes"] ?? "")) ?: null, $uid,
          ]
        );
        $rows = pos_q("SELECT * FROM expenses WHERE id = ? LIMIT 1", "s", [$id]);
        $expense = $rows[0] ?? null;
        pos_post_expense_journal($bid, $uid, $expense);
        return $expense;
      });
      pos_send(200, ["ok" => true, "expense" => $expense, "php" => true]);
    } catch (Exception $e) {
      pos_send(400, ["error" => $e->getMessage(), "php" => true]);
    }
  }

  if ($path === "accounts/summary" && $method === "GET") {
    $recv = pos_q("SELECT COALESCE(SUM(outstanding),0) AS total FROM customers WHERE business_id = ?", "s", [$bid]);
    $pay = pos_q("SELECT COALESCE(SUM(payable_balance),0) AS total FROM suppliers WHERE business_id = ?", "s", [$bid]);
    $custs = pos_q("SELECT COUNT(*) AS n FROM customers WHERE business_id = ? AND outstanding > 0", "s", [$bid]);
    $sups = pos_q("SELECT COUNT(*) AS n FROM suppliers WHERE business_id = ? AND COALESCE(payable_balance,0) > 0", "s", [$bid]);
    pos_send(200, [
      "receivables" => (float) ($recv[0]["total"] ?? 0),
      "payables" => (float) ($pay[0]["total"] ?? 0),
      "customersDue" => (int) ($custs[0]["n"] ?? 0),
      "suppliersDue" => (int) ($sups[0]["n"] ?? 0),
      "php" => true,
    ]);
  }

  if ($path === "accounts/receivables" && $method === "GET") {
    pos_send(200, pos_q(
      "SELECT id, code, name, business_name, mobile, type, credit_limit, outstanding
       FROM customers WHERE business_id = ? AND outstanding > 0 ORDER BY outstanding DESC, name",
      "s", [$bid]
    ));
  }

  if ($path === "accounts/payables" && $method === "GET") {
    pos_send(200, pos_q(
      "SELECT id, code, name, contact_name, mobile, gstin, COALESCE(payable_balance,0) AS payable_balance
       FROM suppliers WHERE business_id = ? AND COALESCE(payable_balance,0) > 0 ORDER BY payable_balance DESC, name",
      "s", [$bid]
    ));
  }

  if ($path === "accounts/ledger" && $method === "GET") {
    $from = $_GET["from"] ?? date("Y-m-d");
    $to = $_GET["to"] ?? $from;
    pos_send(200, pos_q(
      "SELECT * FROM account_ledger WHERE business_id = ? AND DATE(created_at) BETWEEN ? AND ?
       ORDER BY created_at DESC, entry_no DESC LIMIT 500",
      "sss", [$bid, $from, $to]
    ));
  }

  if ($path === "accounts/coa" && $method === "GET") {
    pos_send(200, pos_q(
      "SELECT id, code, name, account_group, is_system, active FROM chart_of_accounts WHERE business_id = ? ORDER BY code",
      "s", [$bid]
    ));
  }

  if ($path === "accounts/trial-balance" && $method === "GET") {
    $from = $_GET["from"] ?? date("Y-m-d");
    $to = $_GET["to"] ?? $from;
    $rows = pos_lines_for_period($bid, $from, $to);
    $mapped = [];
    $totalDr = 0;
    $totalCr = 0;
    foreach ($rows as $r) {
      $debit = pos_round2($r["debit"]);
      $credit = pos_round2($r["credit"]);
      $totalDr += $debit;
      $totalCr += $credit;
      $mapped[] = array_merge($r, ["debit" => $debit, "credit" => $credit, "balance" => pos_round2($debit - $credit)]);
    }
    pos_send(200, ["from" => $from, "to" => $to, "rows" => $mapped, "totalDebit" => pos_round2($totalDr), "totalCredit" => pos_round2($totalCr), "php" => true]);
  }

  if ($path === "accounts/profit-loss" && $method === "GET") {
    $from = $_GET["from"] ?? date("Y-m-d");
    $to = $_GET["to"] ?? $from;
    $rows = pos_lines_for_period($bid, $from, $to);
    $income = 0;
    $expense = 0;
    $incomeRows = [];
    $expenseRows = [];
    foreach ($rows as $r) {
      $net = pos_round2((float) $r["credit"] - (float) $r["debit"]);
      if ($r["account_group"] === "income" && $net != 0) {
        $income += $net;
        $incomeRows[] = ["code" => $r["code"], "name" => $r["name"], "amount" => $net];
      }
      if ($r["account_group"] === "expense" && $net != 0) {
        $amt = pos_round2((float) $r["debit"] - (float) $r["credit"]);
        $expense += $amt;
        $expenseRows[] = ["code" => $r["code"], "name" => $r["name"], "amount" => $amt];
      }
    }
    pos_send(200, [
      "from" => $from, "to" => $to,
      "income" => pos_round2($income), "expense" => pos_round2($expense),
      "netProfit" => pos_round2($income - $expense),
      "incomeRows" => $incomeRows, "expenseRows" => $expenseRows, "php" => true,
    ]);
  }

  if ($path === "accounts/balance-sheet" && $method === "GET") {
    $asOf = $_GET["asOf"] ?? date("Y-m-d");
    $rows = pos_lines_for_period($bid, "2000-01-01", $asOf);
    $groups = ["asset" => [], "liability" => [], "equity" => []];
    $assets = 0;
    $liabilities = 0;
    $equity = 0;
    foreach ($rows as $r) {
      $debit = pos_round2($r["debit"]);
      $credit = pos_round2($r["credit"]);
      $bal = pos_round2($debit - $credit);
      if (!$bal) continue;
      if ($r["account_group"] === "asset") {
        $assets += $bal;
        $groups["asset"][] = ["code" => $r["code"], "name" => $r["name"], "balance" => $bal];
      } elseif ($r["account_group"] === "liability") {
        $lb = pos_round2($credit - $debit);
        $liabilities += $lb;
        $groups["liability"][] = ["code" => $r["code"], "name" => $r["name"], "balance" => $lb];
      } elseif ($r["account_group"] === "equity") {
        $eb = pos_round2($credit - $debit);
        $equity += $eb;
        $groups["equity"][] = ["code" => $r["code"], "name" => $r["name"], "balance" => $eb];
      }
    }
    $plFrom = "2000-01-01";
    $plRows = pos_lines_for_period($bid, $plFrom, $asOf);
    $income = 0;
    $expense = 0;
    foreach ($plRows as $r) {
      if ($r["account_group"] === "income") $income += pos_round2((float) $r["credit"] - (float) $r["debit"]);
      if ($r["account_group"] === "expense") $expense += pos_round2((float) $r["debit"] - (float) $r["credit"]);
    }
    $netProfit = pos_round2($income - $expense);
    $equity = pos_round2($equity + $netProfit);
    pos_send(200, [
      "asOf" => $asOf, "assets" => pos_round2($assets), "liabilities" => pos_round2($liabilities),
      "equity" => $equity, "netProfit" => $netProfit, "groups" => $groups, "php" => true,
    ]);
  }

  if ($path === "accounts/cash-book" && $method === "GET") {
    $from = $_GET["from"] ?? date("Y-m-d");
    $to = $_GET["to"] ?? $from;
    $rows = pos_q(
      "SELECT j.voucher_no, j.voucher_date, j.voucher_type, j.narration, a.code, a.name, l.debit, l.credit
       FROM journal_lines l
       JOIN journal_entries j ON j.id = l.journal_id
       JOIN chart_of_accounts a ON a.id = l.account_id
       WHERE l.business_id = ? AND j.voucher_date BETWEEN ? AND ? AND a.code IN ('1001','1002','1003')
       ORDER BY j.voucher_date, j.voucher_no, a.code",
      "sss", [$bid, $from, $to]
    );
    $balance = 0;
    $entries = [];
    foreach ($rows as $r) {
      $debit = pos_round2($r["debit"]);
      $credit = pos_round2($r["credit"]);
      $balance = pos_round2($balance + $debit - $credit);
      $entries[] = array_merge($r, ["debit" => $debit, "credit" => $credit, "balance" => $balance]);
    }
    pos_send(200, ["from" => $from, "to" => $to, "entries" => $entries, "closingBalance" => $balance, "php" => true]);
  }

  if ($path === "accounts/journal" && $method === "GET") {
    $from = $_GET["from"] ?? date("Y-m-d");
    $to = $_GET["to"] ?? $from;
    pos_send(200, pos_q(
      "SELECT j.*, GROUP_CONCAT(CONCAT(a.code, ':', l.debit, '/', l.credit) SEPARATOR ' | ') AS lines
       FROM journal_entries j
       LEFT JOIN journal_lines l ON l.journal_id = j.id
       LEFT JOIN chart_of_accounts a ON a.id = l.account_id
       WHERE j.business_id = ? AND j.voucher_date BETWEEN ? AND ?
       GROUP BY j.id ORDER BY j.voucher_date DESC, j.voucher_no DESC LIMIT 300",
      "sss", [$bid, $from, $to]
    ));
  }

  if ($path === "accounts/receipts" && $method === "POST") {
    $customerId = $body["customer_id"] ?? "";
    $amt = pos_round2((float) ($body["amount"] ?? 0));
    if (!$customerId || $amt <= 0) pos_send(400, ["error" => "Customer and amount are required"]);
    $methodPay = strtolower((string) ($body["payment_method"] ?? "cash"));
    if (!in_array($methodPay, ["cash", "upi", "card", "bank"], true)) pos_send(400, ["error" => "Invalid payment method"]);
    $cust = pos_q("SELECT * FROM customers WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$customerId, $bid]);
    $customer = $cust[0] ?? null;
    if (!$customer) pos_send(400, ["error" => "Customer not found"]);
    $outstanding = pos_round2((float) ($customer["outstanding"] ?? 0));
    if ($outstanding <= 0) pos_send(400, ["error" => "No outstanding balance for this customer"]);
    if ($amt > $outstanding) pos_send(400, ["error" => "Amount exceeds outstanding"]);
    $next = pos_round2($outstanding - $amt);
    pos_q("UPDATE customers SET outstanding = ? WHERE id = ? AND business_id = ?", "dss", [$next, $customer["id"], $bid]);
    $n = pos_next_seq("receipt", $bid, 1001);
    $entryNo = "RCP-{$n}";
    $ledgerId = pos_insert_ledger([
      "entry_no" => $entryNo, "entry_type" => "receipt", "party_type" => "customer",
      "party_id" => $customer["id"], "party_name" => $customer["business_name"] ?? $customer["name"],
      "amount" => $amt, "payment_method" => $methodPay,
      "reference_type" => !empty($body["order_id"]) ? "sales_order" : "manual",
      "reference_id" => $body["order_id"] ?? null, "notes" => $body["notes"] ?? null,
    ], $bid, $uid);
    pos_post_receipt_journal($bid, $uid, $amt, $methodPay, $entryNo, $ledgerId);
    pos_send(200, ["ok" => true, "entryNo" => $entryNo, "ledgerId" => $ledgerId, "customer" => array_merge($customer, ["outstanding" => $next]), "amount" => $amt, "php" => true]);
  }

  if ($path === "accounts/payments" && $method === "POST") {
    $supplierId = $body["supplier_id"] ?? "";
    $amt = pos_round2((float) ($body["amount"] ?? 0));
    if (!$supplierId || $amt <= 0) pos_send(400, ["error" => "Supplier and amount are required"]);
    $methodPay = strtolower((string) ($body["payment_method"] ?? "cash"));
    if (!in_array($methodPay, ["cash", "upi", "card", "bank"], true)) pos_send(400, ["error" => "Invalid payment method"]);
    $sup = pos_q("SELECT * FROM suppliers WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$supplierId, $bid]);
    $supplier = $sup[0] ?? null;
    if (!$supplier) pos_send(400, ["error" => "Supplier not found"]);
    $payable = pos_round2((float) ($supplier["payable_balance"] ?? 0));
    if ($payable <= 0) pos_send(400, ["error" => "No payable balance for this supplier"]);
    if ($amt > $payable) pos_send(400, ["error" => "Amount exceeds payable"]);
    $next = pos_round2($payable - $amt);
    pos_q("UPDATE suppliers SET payable_balance = ? WHERE id = ? AND business_id = ?", "dss", [$next, $supplier["id"], $bid]);
    $n = pos_next_seq("payment", $bid, 1001);
    $entryNo = "PAY-{$n}";
    $ledgerId = pos_insert_ledger([
      "entry_no" => $entryNo, "entry_type" => "payment", "party_type" => "supplier",
      "party_id" => $supplier["id"], "party_name" => $supplier["name"],
      "amount" => $amt, "payment_method" => $methodPay,
      "reference_type" => !empty($body["purchase_id"]) ? "purchase" : "manual",
      "reference_id" => $body["purchase_id"] ?? null, "notes" => $body["notes"] ?? null,
    ], $bid, $uid);
    pos_post_payment_journal($bid, $uid, $amt, $methodPay, $entryNo, $ledgerId);
    pos_send(200, ["ok" => true, "entryNo" => $entryNo, "ledgerId" => $ledgerId, "supplier" => array_merge($supplier, ["payable_balance" => $next]), "amount" => $amt, "php" => true]);
  }

  pos_send(404, ["error" => "Unknown accounts route", "php" => true]);
  return true;
}
