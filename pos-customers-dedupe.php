<?php

function pos_cust_mobile_norm($raw) {
  $d = preg_replace("/\D+/", "", (string) $raw);
  if (strlen($d) >= 10) return substr($d, -10);
  return $d;
}

function pos_cust_email_norm($raw) {
  return strtolower(trim((string) $raw));
}

function pos_cust_gstin_norm($raw) {
  return strtoupper(preg_replace("/\s+/", "", trim((string) $raw)));
}

function pos_cust_is_walk_in($row) {
  if (!is_array($row)) return true;
  if (($row["code"] ?? "") === "CUS-001") return true;
  return (bool) preg_match('/^walk-?in$/i', trim((string) ($row["name"] ?? "")));
}

function pos_cust_is_merged($row) {
  if (!is_array($row)) return false;
  if (!empty($row["merged_into"])) return true;
  return strtolower((string) ($row["status"] ?? "")) === "merged";
}

function pos_cust_is_placeholder_mobile($raw) {
  $m = pos_cust_mobile_norm($raw);
  return $m === "0000000000" || $m === "0000000002";
}

function pos_cust_is_active($row) {
  return is_array($row) && !empty($row["id"]) && !pos_cust_is_walk_in($row) && !pos_cust_is_merged($row);
}

function pos_ensure_customer_dedupe_schema() {
  static $done = false;
  if ($done) return;
  $done = true;
  $db = $GLOBALS["pos_db"] ?? null;
  if (!$db) return;
  $db->query("CREATE TABLE IF NOT EXISTS customer_merge_backups (
    id VARCHAR(255) PRIMARY KEY,
    business_id VARCHAR(255) NOT NULL,
    primary_id VARCHAR(255) NOT NULL,
    loser_ids TEXT NOT NULL,
    snapshot MEDIUMTEXT NULL,
    created_by VARCHAR(255) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_cmb_biz (business_id)
  )");
  if (function_exists("pos_ensure_columns")) {
    pos_ensure_columns("customers", [
      "email" => "VARCHAR(160) NULL",
      "merged_into" => "VARCHAR(255) NULL",
      "status" => "VARCHAR(16) NOT NULL DEFAULT 'active'",
      "mobile_norm" => "VARCHAR(16) NULL",
      "email_norm" => "VARCHAR(160) NULL",
      "gstin_norm" => "VARCHAR(32) NULL",
    ]);
  }
}

function pos_stamp_customer_norms($id, $body) {
  pos_ensure_customer_dedupe_schema();
  try {
    pos_q(
      "UPDATE customers SET mobile_norm=?, email_norm=?, gstin_norm=? WHERE id=?",
      "ssss",
      [
        pos_cust_mobile_norm($body["mobile"] ?? "") ?: null,
        pos_cust_email_norm($body["email"] ?? "") ?: null,
        pos_cust_gstin_norm($body["gstin"] ?? "") ?: null,
        $id,
      ]
    );
  } catch (Exception $e) { /* optional */ }
}

function pos_active_customers($rows) {
  $out = [];
  foreach ((array) $rows as $row) {
    if (!pos_cust_is_merged($row)) $out[] = $row;
  }
  return $out;
}

function pos_find_existing_customer($bid, $body, $excludeId = "") {
  pos_ensure_customer_dedupe_schema();
  $rows = pos_q("SELECT * FROM customers WHERE business_id=?", "s", [$bid]);
  $wantMobile = pos_cust_mobile_norm($body["mobile"] ?? "");
  $wantEmail = pos_cust_email_norm($body["email"] ?? "");
  $wantGstin = pos_cust_gstin_norm($body["gstin"] ?? "");
  foreach ($rows as $row) {
    if (!pos_cust_is_active($row)) continue;
    if ($excludeId !== "" && ($row["id"] ?? "") === $excludeId) continue;
    $mobile = pos_cust_mobile_norm($row["mobile"] ?? "");
    $email = pos_cust_email_norm($row["email"] ?? "");
    $gstin = pos_cust_gstin_norm($row["gstin"] ?? "");
    if ($wantMobile !== "" && strlen($wantMobile) === 10 && !pos_cust_is_placeholder_mobile($wantMobile) && $mobile === $wantMobile) return $row;
    if ($wantEmail !== "" && $email === $wantEmail) return $row;
    if ($wantGstin !== "" && strlen($wantGstin) >= 10 && $gstin === $wantGstin) return $row;
  }
  return null;
}

function pos_customer_match_warning($match, $body) {
  if (!$match) return "";
  $reasons = [];
  if (pos_cust_mobile_norm($match["mobile"] ?? "") === pos_cust_mobile_norm($body["mobile"] ?? "") && pos_cust_mobile_norm($body["mobile"] ?? "") !== "") $reasons[] = "mobile";
  if (pos_cust_email_norm($match["email"] ?? "") !== "" && pos_cust_email_norm($match["email"] ?? "") === pos_cust_email_norm($body["email"] ?? "")) $reasons[] = "email";
  if (pos_cust_gstin_norm($match["gstin"] ?? "") !== "" && pos_cust_gstin_norm($match["gstin"] ?? "") === pos_cust_gstin_norm($body["gstin"] ?? "")) $reasons[] = "gstin";
  $label = $match["business_name"] ?? $match["name"] ?? "Customer";
  $detail = $match["mobile"] ?? $match["code"] ?? $match["id"];
  $why = $reasons ? implode(", ", $reasons) : "details";
  return "A customer already exists with the same {$why}: {$label} ({$detail}). Use that record instead of creating another.";
}

function pos_customer_duplicate_groups($bid) {
  pos_ensure_customer_dedupe_schema();
  $rows = pos_active_customers(pos_q("SELECT * FROM customers WHERE business_id=?", "s", [$bid]));
  $counts = [];
  try {
    $counts = pos_q("SELECT customer_id, COUNT(*) n FROM sales_orders WHERE business_id=? AND (held IS NULL OR held=0) GROUP BY customer_id", "s", [$bid]);
  } catch (Exception $e) {
    $counts = [];
  }
  $byId = [];
  foreach ($counts as $row) $byId[$row["customer_id"]] = (int) $row["n"];
  foreach ($rows as &$row) $row["bill_count"] = $byId[$row["id"] ?? ""] ?? 0;
  unset($row);

  $parent = [];
  $find = function ($id) use (&$parent, &$find) {
    $p = $parent[$id] ?? $id;
    if ($p === $id) return $id;
    $parent[$id] = $find($p);
    return $parent[$id];
  };
  $union = function ($a, $b) use (&$parent, $find) {
    $ra = $find($a);
    $rb = $find($b);
    if ($ra !== $rb) $parent[$rb] = $ra;
  };
  $index = ["mobile" => [], "email" => [], "gstin" => []];
  foreach ($rows as $row) {
    if (!pos_cust_is_active($row)) continue;
    $id = $row["id"];
    $parent[$id] = $id;
    $mobile = pos_cust_mobile_norm($row["mobile"] ?? "");
    $email = pos_cust_email_norm($row["email"] ?? "");
    $gstin = pos_cust_gstin_norm($row["gstin"] ?? "");
    if (strlen($mobile) === 10 && !pos_cust_is_placeholder_mobile($mobile)) {
      if (isset($index["mobile"][$mobile])) $union($index["mobile"][$mobile], $id);
      else $index["mobile"][$mobile] = $id;
    }
    if ($email !== "") {
      if (isset($index["email"][$email])) $union($index["email"][$email], $id);
      else $index["email"][$email] = $id;
    }
    if (strlen($gstin) >= 10) {
      if (isset($index["gstin"][$gstin])) $union($index["gstin"][$gstin], $id);
      else $index["gstin"][$gstin] = $id;
    }
  }
  $buckets = [];
  foreach ($rows as $row) {
    if (!pos_cust_is_active($row)) continue;
    $root = $find($row["id"]);
    $buckets[$root][] = $row;
  }
  $groups = [];
  foreach ($buckets as $members) {
    if (count($members) < 2) continue;
    usort($members, function ($a, $b) {
      $bills = ((int) ($b["bill_count"] ?? 0)) - ((int) ($a["bill_count"] ?? 0));
      if ($bills) return $bills;
      $due = ((float) ($b["outstanding"] ?? 0)) - ((float) ($a["outstanding"] ?? 0));
      if ($due) return $due < 0 ? -1 : 1;
      return strcmp((string) ($a["code"] ?? ""), (string) ($b["code"] ?? ""));
    });
    $due = 0;
    foreach ($members as $m) $due += (float) ($m["outstanding"] ?? 0);
    $groups[] = [
      "key" => $members[0]["id"],
      "primary_id" => $members[0]["id"],
      "reasons" => ["mobile"],
      "members" => $members,
      "count" => count($members),
      "outstanding" => $due,
    ];
  }
  return $groups;
}

function pos_customer_merge_remap($table, $column, $fromId, $toId, $bid) {
  try {
    if ($table === "account_ledger") {
      pos_q("UPDATE account_ledger SET party_id=? WHERE business_id=? AND party_type='customer' AND party_id=?", "sss", [$toId, $bid, $fromId]);
      return;
    }
    pos_q("UPDATE {$table} SET {$column}=? WHERE {$column}=? AND business_id=?", "sss", [$toId, $fromId, $bid]);
  } catch (Exception $e) {
    try {
      pos_q("UPDATE {$table} SET {$column}=? WHERE {$column}=?", "ss", [$toId, $fromId]);
    } catch (Exception $e2) { /* optional */ }
  }
}

function pos_merge_customers($bid, $primaryId, $loserIds, $actor = []) {
  pos_ensure_customer_dedupe_schema();
  $ids = [];
  foreach ((array) $loserIds as $id) {
    $id = trim((string) $id);
    if ($id !== "" && $id !== $primaryId) $ids[$id] = $id;
  }
  $ids = array_values($ids);
  if ($primaryId === "" || !$ids) throw new Exception("Pick a primary customer and at least one duplicate");
  $primaryRows = pos_q("SELECT * FROM customers WHERE id=? AND business_id=? LIMIT 1", "ss", [$primaryId, $bid]);
  if (empty($primaryRows[0])) throw new Exception("Primary customer not found in this shop");
  $primary = $primaryRows[0];
  if (pos_cust_is_walk_in($primary)) throw new Exception("Walk-in cannot be the merge target");
  $losers = [];
  foreach ($ids as $id) {
    $rows = pos_q("SELECT * FROM customers WHERE id=? AND business_id=? LIMIT 1", "ss", [$id, $bid]);
    if (empty($rows[0])) throw new Exception("Duplicate customer not found in this shop");
    if (pos_cust_is_walk_in($rows[0])) throw new Exception("Walk-in records are not merged");
    if (pos_cust_is_merged($rows[0])) throw new Exception("That customer was already merged");
    $losers[] = $rows[0];
  }
  $backupId = pos_uuid();
  pos_q(
    "INSERT INTO customer_merge_backups (id, business_id, primary_id, loser_ids, snapshot, created_by) VALUES (?,?,?,?,?,?)",
    "ssssss",
    [$backupId, $bid, $primaryId, json_encode($ids), json_encode(["primary" => $primary, "losers" => $losers]), $actor["id"] ?? $actor["email"] ?? "staff"]
  );
  $tables = [
    ["sales_orders", "customer_id"],
    ["sales_returns", "customer_id"],
    ["loyalty_ledger", "customer_id"],
    ["promo_offer_redemptions", "customer_id"],
    ["gym_members", "customer_id"],
    ["salon_bookings", "customer_id"],
    ["salon_booking_payments", "customer_id"],
    ["print_orders", "customer_id"],
    ["account_ledger", "party_id"],
  ];
  foreach ($losers as $loser) {
    foreach ($tables as $pair) pos_customer_merge_remap($pair[0], $pair[1], $loser["id"], $primaryId, $bid);
    try {
      pos_q("UPDATE customers SET referred_by=? WHERE business_id=? AND referred_by=?", "sss", [$primaryId, $bid, $loser["id"]]);
    } catch (Exception $e) { /* optional */ }
    pos_q("UPDATE customers SET merged_into=?, status='merged' WHERE id=? AND business_id=?", "sss", [$primaryId, $loser["id"], $bid]);
    if (empty($primary["mobile"]) && !empty($loser["mobile"])) $primary["mobile"] = $loser["mobile"];
    if (empty($primary["gstin"]) && !empty($loser["gstin"])) $primary["gstin"] = $loser["gstin"];
    if (empty($primary["address"]) && !empty($loser["address"])) $primary["address"] = $loser["address"];
    if (empty($primary["email"]) && !empty($loser["email"])) $primary["email"] = $loser["email"];
  }
  try {
    pos_q(
      "UPDATE customers SET mobile=?, email=?, gstin=?, address=? WHERE id=? AND business_id=?",
      "ssssss",
      [$primary["mobile"] ?? null, $primary["email"] ?? null, $primary["gstin"] ?? null, $primary["address"] ?? null, $primaryId, $bid]
    );
  } catch (Exception $e) { /* optional */ }
  pos_stamp_customer_norms($primaryId, $primary);
  return ["ok" => true, "backup_id" => $backupId, "primary_id" => $primaryId, "merged_ids" => $ids, "deleted" => false];
}

function pos_customers_dedupe_dispatch($path, $method, $body, $bid, $auth = []) {
  if ($path === "customers/duplicates" && $method === "GET") {
    $groups = pos_customer_duplicate_groups($bid);
    $extra = 0;
    foreach ($groups as $g) $extra += max(0, ((int) $g["count"]) - 1);
    pos_send(200, ["groups" => $groups, "summary" => ["groups" => count($groups), "extra" => $extra]]);
    return true;
  }
  if ($path === "customers/match" && $method === "GET") {
    $input = ["mobile" => $_GET["mobile"] ?? "", "email" => $_GET["email"] ?? "", "gstin" => $_GET["gstin"] ?? ""];
    $match = pos_find_existing_customer($bid, $input);
    pos_send(200, ["match" => $match, "warning" => pos_customer_match_warning($match, $input)]);
    return true;
  }
  if ($path === "customers/merge" && $method === "POST") {
    try {
      $result = pos_merge_customers($bid, trim((string) ($body["primary_id"] ?? "")), $body["loser_ids"] ?? [], $auth["user"] ?? []);
      if (function_exists("pos_staff_audit")) {
        pos_staff_audit($auth["user"] ?? [], "Customer merge", [
          "module" => "customers",
          "target_id" => $result["primary_id"],
          "backup_id" => $result["backup_id"],
          "merged_ids" => $result["merged_ids"],
          "deleted" => false,
        ], $bid);
      }
      pos_send(200, $result);
    } catch (Exception $e) {
      pos_send(400, ["error" => $e->getMessage()]);
    }
    return true;
  }
  return false;
}
