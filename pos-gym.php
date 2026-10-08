<?php
function pos_gym_ensure() {
  $db = pos_db();
  @$db->query("ALTER TABLE customers ADD COLUMN email VARCHAR(160) NULL");
  @$db->query("ALTER TABLE customers ADD COLUMN password_hash VARCHAR(255) NULL");
  $db->query("CREATE TABLE IF NOT EXISTS gym_plans (id VARCHAR(255) PRIMARY KEY, name VARCHAR(180) NOT NULL, kind VARCHAR(32) NOT NULL DEFAULT 'monthly', duration_days INT NOT NULL DEFAULT 30, price DECIMAL(12,2) NOT NULL DEFAULT 0, admission_fee DECIMAL(12,2) NOT NULL DEFAULT 0, gst_rate DECIMAL(8,2) NOT NULL DEFAULT 0, sessions INT NOT NULL DEFAULT 0, status VARCHAR(16) NOT NULL DEFAULT 'active', description TEXT NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (business_id))");
  $db->query("CREATE TABLE IF NOT EXISTS gym_trainers (id VARCHAR(255) PRIMARY KEY, name VARCHAR(180) NOT NULL, mobile VARCHAR(32) NULL, email VARCHAR(160) NULL, specialty VARCHAR(80) NULL, commission_pct DECIMAL(8,2) NOT NULL DEFAULT 0, status VARCHAR(16) NOT NULL DEFAULT 'active', photo_url TEXT NULL, notes TEXT NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (business_id))");
  $db->query("CREATE TABLE IF NOT EXISTS gym_members (id VARCHAR(255) PRIMARY KEY, member_no VARCHAR(32) NOT NULL, customer_id VARCHAR(255) NULL, name VARCHAR(180) NOT NULL, mobile VARCHAR(32) NULL, email VARCHAR(160) NULL, photo_url TEXT NULL, gender VARCHAR(16) NULL, dob DATE NULL, emergency_name VARCHAR(180) NULL, emergency_mobile VARCHAR(32) NULL, trainer_id VARCHAR(255) NULL, status VARCHAR(16) NOT NULL DEFAULT 'active', password_hash VARCHAR(255) NULL, notes TEXT NULL, branch_id VARCHAR(255) NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (business_id), INDEX (member_no), INDEX (mobile))");
  $db->query("CREATE TABLE IF NOT EXISTS gym_memberships (id VARCHAR(255) PRIMARY KEY, member_id VARCHAR(255) NOT NULL, plan_id VARCHAR(255) NULL, plan_name VARCHAR(180) NOT NULL, kind VARCHAR(32) NOT NULL DEFAULT 'monthly', start_date DATE NOT NULL, end_date DATE NOT NULL, amount DECIMAL(12,2) NOT NULL DEFAULT 0, admission_fee DECIMAL(12,2) NOT NULL DEFAULT 0, discount DECIMAL(12,2) NOT NULL DEFAULT 0, total DECIMAL(12,2) NOT NULL DEFAULT 0, paid DECIMAL(12,2) NOT NULL DEFAULT 0, due DECIMAL(12,2) NOT NULL DEFAULT 0, method VARCHAR(32) NOT NULL DEFAULT 'upi', coupon VARCHAR(40) NULL, receipt_no VARCHAR(32) NULL, status VARCHAR(16) NOT NULL DEFAULT 'active', notes TEXT NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (member_id), INDEX (business_id), INDEX (end_date))");
  $db->query("CREATE TABLE IF NOT EXISTS gym_attendance (id VARCHAR(255) PRIMARY KEY, member_id VARCHAR(255) NOT NULL, check_in TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), check_out TIMESTAMP(3) NULL, source VARCHAR(16) NOT NULL DEFAULT 'manual', business_id VARCHAR(255) NOT NULL, INDEX (member_id), INDEX (business_id), INDEX (check_in))");
  $db->query("CREATE TABLE IF NOT EXISTS gym_trainer_attendance (id VARCHAR(255) PRIMARY KEY, trainer_id VARCHAR(255) NOT NULL, check_in TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), check_out TIMESTAMP(3) NULL, business_id VARCHAR(255) NOT NULL, INDEX (trainer_id), INDEX (business_id))");
  $db->query("CREATE TABLE IF NOT EXISTS gym_measurements (id VARCHAR(255) PRIMARY KEY, member_id VARCHAR(255) NOT NULL, measured_at DATE NOT NULL, weight_kg DECIMAL(8,2) NOT NULL DEFAULT 0, height_cm DECIMAL(8,2) NOT NULL DEFAULT 0, bmi DECIMAL(8,2) NOT NULL DEFAULT 0, chest DECIMAL(8,2) NULL, waist DECIMAL(8,2) NULL, hip DECIMAL(8,2) NULL, arms DECIMAL(8,2) NULL, photo_before TEXT NULL, photo_after TEXT NULL, notes TEXT NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (member_id), INDEX (business_id))");
  $db->query("CREATE TABLE IF NOT EXISTS gym_programs (id VARCHAR(255) PRIMARY KEY, member_id VARCHAR(255) NOT NULL, kind VARCHAR(16) NOT NULL DEFAULT 'workout', title VARCHAR(180) NOT NULL, body TEXT NULL, trainer_id VARCHAR(255) NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (member_id), INDEX (business_id))");
  $db->query("CREATE TABLE IF NOT EXISTS gym_sessions (id VARCHAR(255) PRIMARY KEY, token_hash VARCHAR(64) NOT NULL, member_id VARCHAR(255) NOT NULL, business_id VARCHAR(255) NOT NULL, expires_at TIMESTAMP(3) NOT NULL, INDEX (token_hash))");
}

function pos_gym_clip($v, $n) {
  return substr(trim((string) $v), 0, (int) $n);
}

function pos_gym_digits($v) {
  return preg_replace("/\D/", "", (string) $v);
}

function pos_gym_round2($n) {
  return round((float) $n, 2);
}

function pos_gym_today() {
  $tzName = function_exists("pos_shop_timezone") ? pos_shop_timezone() : "Asia/Kolkata";
  try {
    $tz = new DateTimeZone($tzName ?: "Asia/Kolkata");
    return (new DateTime("now", $tz))->format("Y-m-d");
  } catch (Exception $e) {
    return date("Y-m-d");
  }
}

function pos_gym_kind_days($kind, $custom = 0) {
  $customDays = (int) $custom;
  if ($customDays > 0) return $customDays;
  $map = [
    "monthly" => 30,
    "quarterly" => 90,
    "half_yearly" => 182,
    "yearly" => 365,
    "custom" => 30,
    "couple" => 365,
    "family" => 365,
    "student" => 30,
    "personal_training" => 30,
  ];
  return $map[strtolower((string) $kind)] ?? 30;
}

function pos_gym_add_days($ymd, $days) {
  $d = DateTime::createFromFormat("Y-m-d", substr((string) $ymd, 0, 10));
  if (!$d) return "";
  $d->modify("+" . intval($days) . " days");
  return $d->format("Y-m-d");
}

function pos_gym_window($start, $kind, $custom) {
  $start = substr((string) $start, 0, 10) ?: pos_gym_today();
  $days = pos_gym_kind_days($kind, $custom);
  return ["start_date" => $start, "end_date" => pos_gym_add_days($start, $days), "duration_days" => $days];
}

function pos_gym_bill_totals($planPrice, $admissionFee, $discount, $paid) {
  $plan = pos_gym_round2($planPrice);
  $admission = pos_gym_round2($admissionFee);
  $disc = pos_gym_round2($discount);
  $total = pos_gym_round2(max(0, $plan + $admission - $disc));
  $pay = pos_gym_round2(max(0, $paid));
  $due = pos_gym_round2(max(0, $total - $pay));
  return ["plan" => $plan, "admission" => $admission, "discount" => $disc, "total" => $total, "paid" => min($pay, $total), "due" => $due];
}

function pos_gym_bmi($weightKg, $heightCm) {
  $w = (float) $weightKg;
  $h = ((float) $heightCm) / 100;
  if ($w <= 0 || $h <= 0) return 0;
  return pos_gym_round2($w / ($h * $h));
}

function pos_gym_qr($shopId, $memberId) {
  return "ATAVGYM:" . $shopId . ":" . $memberId;
}

function pos_gym_parse_qr($raw) {
  if (!preg_match("/^ATAVGYM:([^:]+):([^:]+)$/", trim((string) $raw), $m)) return null;
  return ["shopId" => $m[1], "memberId" => $m[2]];
}

function pos_gym_member_status($row, $day = "") {
  if ((string) ($row["status"] ?? "") === "frozen") return "frozen";
  $end = substr((string) ($row["end_date"] ?? ""), 0, 10);
  $day = substr((string) ($day ?: pos_gym_today()), 0, 10);
  if ($end === "" || $end < $day) return "expired";
  return "active";
}

function pos_gym_default_plans() {
  return [
    ["Monthly", "monthly", 30, 1500, 500, 0],
    ["Quarterly", "quarterly", 90, 4000, 500, 0],
    ["Half-Yearly", "half_yearly", 182, 7000, 0, 0],
    ["Yearly", "yearly", 365, 12000, 0, 0],
    ["Couple Membership", "couple", 365, 20000, 0, 0],
    ["Family Membership", "family", 365, 28000, 0, 0],
    ["Student Membership", "student", 30, 999, 0, 0],
    ["Personal Training", "personal_training", 30, 5000, 0, 12],
  ];
}

function pos_gym_services() {
  return ["Personal Training", "Diet Consultation", "Zumba", "Yoga", "CrossFit", "Cardio Training", "Supplements", "Gym Accessories", "Merchandise"];
}

function pos_gym_pay_modes() {
  return ["cash", "upi", "card", "online", "bank-transfer", "wallet"];
}

function pos_gym_reports() {
  return [
    ["id" => "gym-members", "title" => "Member Report"],
    ["id" => "gym-attendance", "title" => "Attendance Report"],
    ["id" => "gym-collection", "title" => "Collection Report"],
    ["id" => "gym-dues", "title" => "Due Report"],
    ["id" => "gym-expiry", "title" => "Membership Expiry Report"],
    ["id" => "gym-trainers", "title" => "Trainer Report"],
    ["id" => "gym-expense", "title" => "Expense Report"],
    ["id" => "gym-pl", "title" => "Profit/Loss"],
    ["id" => "gym-sales-daily", "title" => "Daily Sales"],
    ["id" => "gym-sales-monthly", "title" => "Monthly Sales"],
    ["id" => "gym-sales-yearly", "title" => "Yearly Sales"],
  ];
}

function pos_gym_seed($shop) {
  $n = pos_q("SELECT id FROM gym_plans WHERE business_id=? LIMIT 1", "s", [$shop]);
  if ($n) return;
  foreach (pos_gym_default_plans() as $p) {
    pos_q(
      "INSERT INTO gym_plans (id, name, kind, duration_days, price, admission_fee, sessions, status, business_id) VALUES (?,?,?,?,?,?,?, 'active', ?)",
      "sssiddss",
      [pos_uuid(), $p[0], $p[1], $p[2], $p[3], $p[4], $p[5], $shop]
    );
  }
}

function pos_gym_next_no($shop, $name, $prefix, $start = 1001) {
  $n = function_exists("pos_next_seq") ? pos_next_seq($name, $shop, $start) : random_int($start, $start + 9000);
  return $prefix . $n;
}

function pos_gym_is_shop($biz) {
  if (function_exists("pos_shop_kind") && pos_shop_kind($biz) === "gym") return true;
  $t = strtolower(trim((string) (($biz["category"] ?? "") . " " . ($biz["business_type"] ?? "") . " " . ($biz["name"] ?? ""))));
  return (bool) preg_match("/(gym|fitness|health club|workout studio)/", $t);
}

function pos_gym_shop($id) {
  $rows = pos_q("SELECT id, name, category, business_type, address, mobile FROM businesses WHERE id=?", "s", [$id]);
  return $rows[0] ?? null;
}

function pos_gym_latest_membership($memberId, $shop) {
  $rows = pos_q(
    "SELECT * FROM gym_memberships WHERE member_id=? AND business_id=? ORDER BY end_date DESC, created_at DESC LIMIT 1",
    "ss",
    [$memberId, $shop]
  );
  return $rows[0] ?? null;
}

function pos_gym_public_member($row) {
  if (!$row) return null;
  return [
    "id" => $row["id"],
    "member_no" => $row["member_no"],
    "name" => $row["name"],
    "mobile" => $row["mobile"],
    "email" => $row["email"],
    "status" => $row["status"],
    "trainer_id" => $row["trainer_id"] ?? null,
    "photo_url" => $row["photo_url"] ?? "",
  ];
}

function pos_gym_with_status($member, $membership, $day = "") {
  $row = $member;
  $row["end_date"] = $membership["end_date"] ?? "";
  $status = pos_gym_member_status($row, $day);
  $out = pos_gym_public_member($member);
  $out["status"] = $status;
  $out["membership"] = $membership;
  $out["qr"] = pos_gym_qr($member["business_id"] ?? "", $member["id"] ?? "");
  return $out;
}

function pos_gym_bearer() {
  $h = (string) ($_SERVER["HTTP_AUTHORIZATION"] ?? $_SERVER["REDIRECT_HTTP_AUTHORIZATION"] ?? "");
  if ($h === "" && function_exists("apache_request_headers")) {
    $headers = apache_request_headers();
    foreach ($headers as $k => $v) {
      if (strcasecmp((string) $k, "Authorization") === 0) {
        $h = (string) $v;
        break;
      }
    }
  }
  if (stripos($h, "Bearer ") === 0) return trim(substr($h, 7));
  return trim((string) ($_SERVER["HTTP_X_GYM_TOKEN"] ?? $_GET["token"] ?? ""));
}

function pos_gym_issue_session($memberId, $shop) {
  $token = bin2hex(random_bytes(24));
  pos_q(
    "INSERT INTO gym_sessions (id, token_hash, member_id, business_id, expires_at) VALUES (?,?,?,?, DATE_ADD(NOW(), INTERVAL 30 DAY))",
    "ssss",
    [pos_uuid(), hash("sha256", $token), $memberId, $shop]
  );
  return $token;
}

function pos_gym_member_from_token($shop) {
  $token = pos_gym_bearer();
  if ($token === "") return null;
  $rows = pos_q(
    "SELECT m.* FROM gym_sessions s JOIN gym_members m ON m.id=s.member_id WHERE s.token_hash=? AND s.business_id=? AND s.expires_at > NOW() LIMIT 1",
    "ss",
    [hash("sha256", $token), $shop]
  );
  return $rows[0] ?? null;
}

function pos_gym_bump_outstanding($customerId, $shop, $delta) {
  if (!$customerId || abs((float) $delta) < 0.001) return;
  pos_q(
    "UPDATE customers SET outstanding = GREATEST(0, COALESCE(outstanding,0) + ?) WHERE id=? AND business_id=?",
    "dss",
    [(float) $delta, $customerId, $shop]
  );
}

function pos_gym_dashboard_cards($stats) {
  return [
    ["id" => "members", "label" => "Total Members", "value" => $stats["totalMembers"] ?? 0],
    ["id" => "active", "label" => "Active Members", "value" => $stats["activeMembers"] ?? 0],
    ["id" => "expired", "label" => "Expired Members", "value" => $stats["expiredMembers"] ?? 0],
    ["id" => "checkins", "label" => "Today's Check-ins", "value" => $stats["todayCheckins"] ?? 0],
    ["id" => "collection", "label" => "Today's Collection", "value" => $stats["todayCollection"] ?? 0, "money" => true],
    ["id" => "monthly", "label" => "Monthly Revenue", "value" => $stats["monthlyRevenue"] ?? 0, "money" => true],
    ["id" => "dues", "label" => "Pending Dues", "value" => $stats["pendingDues"] ?? 0, "money" => true],
    ["id" => "renewals", "label" => "Membership Renewals", "value" => $stats["renewals"] ?? 0],
    ["id" => "registrations", "label" => "New Registrations", "value" => $stats["newRegistrations"] ?? 0],
  ];
}

function pos_gym_sum($sql, $types, $params) {
  $rows = pos_q($sql, $types, $params);
  return (float) ($rows[0]["n"] ?? 0);
}

function pos_gym_board_stats($shop) {
  $members = pos_q("SELECT id, status FROM gym_members WHERE business_id=?", "s", [$shop]);
  $day = pos_gym_today();
  $active = 0;
  $expired = 0;
  foreach ($members as $m) {
    $mem = pos_gym_latest_membership($m["id"], $shop);
    $st = ((string) $m["status"] === "frozen") ? "frozen" : pos_gym_member_status(["end_date" => $mem["end_date"] ?? "", "status" => $m["status"]], $day);
    if ($st === "active") $active++;
    if ($st === "expired") $expired++;
  }
  return [
    "totalMembers" => count($members),
    "activeMembers" => $active,
    "expiredMembers" => $expired,
    "todayCheckins" => (int) pos_gym_sum("SELECT COUNT(*) n FROM gym_attendance WHERE business_id=? AND DATE(check_in)=CURDATE()", "s", [$shop]),
    "todayCollection" => pos_gym_sum("SELECT COALESCE(SUM(paid),0) n FROM gym_memberships WHERE business_id=? AND DATE(created_at)=CURDATE()", "s", [$shop]),
    "monthlyRevenue" => pos_gym_sum("SELECT COALESCE(SUM(paid),0) n FROM gym_memberships WHERE business_id=? AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')", "s", [$shop]),
    "pendingDues" => pos_gym_sum("SELECT COALESCE(SUM(due),0) n FROM gym_memberships WHERE business_id=? AND due>0", "s", [$shop]),
    "renewals" => (int) pos_gym_sum("SELECT COUNT(*) n FROM gym_memberships WHERE business_id=? AND DATE(created_at)=CURDATE() AND notes LIKE 'renew%'", "s", [$shop]),
    "newRegistrations" => (int) pos_gym_sum("SELECT COUNT(*) n FROM gym_members WHERE business_id=? AND DATE(created_at)=CURDATE()", "s", [$shop]),
  ];
}

function pos_gym_bill($shop, $member, $body, $note) {
  $planId = pos_gym_clip($body["plan_id"] ?? "", 64);
  $planRows = pos_q("SELECT * FROM gym_plans WHERE id=? AND business_id=?", "ss", [$planId, $shop]);
  $plan = $planRows[0] ?? null;
  if (!$plan) throw new Exception("Select a membership plan");
  $start = pos_gym_clip($body["start_date"] ?? "", 10) ?: pos_gym_today();
  $win = pos_gym_window($start, $plan["kind"], $plan["duration_days"]);
  $admission = ($note === "renew") ? 0 : (isset($body["admission_fee"]) ? $body["admission_fee"] : $plan["admission_fee"]);
  $totals = pos_gym_bill_totals($plan["price"], $admission, $body["discount"] ?? 0, $body["paid"] ?? 0);
  $id = pos_uuid();
  $receipt = pos_gym_next_no($shop, "gym_receipt", "GYR-", 1001);
  pos_q(
    "INSERT INTO gym_memberships (id, member_id, plan_id, plan_name, kind, start_date, end_date, amount, admission_fee, discount, total, paid, due, method, coupon, receipt_no, status, notes, business_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'active', ?, ?)",
    "sssssssdddddsssss",
    [
      $id,
      $member["id"],
      $plan["id"],
      $plan["name"],
      $plan["kind"],
      $win["start_date"],
      $win["end_date"],
      $totals["plan"],
      $totals["admission"],
      $totals["discount"],
      $totals["total"],
      $totals["paid"],
      $totals["due"],
      pos_gym_clip($body["method"] ?? "upi", 32) ?: "upi",
      pos_gym_clip($body["coupon"] ?? "", 40),
      $receipt,
      $note ?: "new",
      $shop,
    ]
  );
  pos_q("UPDATE gym_members SET status='active' WHERE id=?", "s", [$member["id"]]);
  pos_gym_bump_outstanding($member["customer_id"] ?? "", $shop, $totals["due"]);
  return array_merge(["id" => $id, "receipt_no" => $receipt, "plan_name" => $plan["name"]], $win, $totals);
}

function pos_gym_notice($kind, $ctx) {
  $name = $ctx["name"] ?? "member";
  $no = $ctx["member_no"] ?? "";
  $end = $ctx["end_date"] ?? "";
  $due = pos_gym_round2($ctx["due"] ?? 0);
  $map = [
    "welcome" => "Welcome {$name}. Membership ID {$no}.",
    "renewal" => "Hi {$name}, renew your gym membership {$no} before {$end}.",
    "expiry" => "Membership {$no} expired on {$end}. Renew to keep training.",
    "reminder" => "Reminder: {$name} membership ends on {$end}.",
    "due" => "Pending gym due ₹{$due} for {$no}.",
    "checkin" => "{$name} checked in.",
  ];
  return $map[$kind] ?? "Gym update";
}

function pos_gym_assert_checkin($member, $shop) {
  $membership = pos_gym_latest_membership($member["id"], $shop);
  $st = pos_gym_member_status(["status" => $member["status"] ?? "", "end_date" => $membership["end_date"] ?? ""]);
  if ($st === "frozen") throw new Exception("Membership is frozen");
  if ($st === "expired") throw new Exception("Membership expired — renew before check-in");
}

function pos_gym_checkin($shop, $body, $source = "manual") {
  $parsed = pos_gym_parse_qr($body["qr"] ?? ($body["code"] ?? ""));
  $memberId = $parsed["memberId"] ?? pos_gym_clip($body["member_id"] ?? "", 64);
  if ($memberId === "") $memberId = pos_gym_clip($body["qr"] ?? ($body["code"] ?? ""), 64);
  if ($memberId === "") throw new Exception("Scan a member QR code");
  $rows = pos_q("SELECT * FROM gym_members WHERE business_id=? AND (id=? OR member_no=?) LIMIT 1", "sss", [$shop, $memberId, $memberId]);
  $m = $rows[0] ?? null;
  if (!$m) throw new Exception("Member not found");
  pos_gym_assert_checkin($m, $shop);
  $uid = $m["id"];
  $open = pos_q("SELECT id FROM gym_attendance WHERE member_id=? AND check_out IS NULL ORDER BY check_in DESC LIMIT 1", "s", [$uid]);
  if ($open) {
    pos_q("UPDATE gym_attendance SET check_out=CURRENT_TIMESTAMP(3) WHERE id=?", "s", [$open[0]["id"]]);
    return ["ok" => true, "action" => "checkout", "member" => pos_gym_public_member($m)];
  }
  pos_q("INSERT INTO gym_attendance (id, member_id, source, business_id) VALUES (?,?,?,?)", "ssss", [pos_uuid(), $uid, pos_gym_clip($source, 16) ?: "manual", $shop]);
  return ["ok" => true, "action" => "checkin", "member" => pos_gym_public_member($m)];
}

function pos_gym_public_dispatch($path, $method, $body) {
  if (!preg_match("#^gym/public/([^/]+)(/.*)?$#", $path, $m)) return false;
  pos_gym_ensure();
  $shopId = $m[1];
  $rest = trim($m[2] ?? "", "/");
  $body = is_array($body) ? $body : [];
  try {
    if ($method === "GET" && $rest === "") {
      $shop = pos_gym_shop($shopId);
      if (!$shop || !pos_gym_is_shop($shop)) pos_send(404, ["error" => "Gym not found", "php" => true]);
      pos_gym_seed($shopId);
      $plans = pos_q("SELECT id, name, kind, duration_days, price, admission_fee, sessions FROM gym_plans WHERE business_id=? AND status='active'", "s", [$shopId]);
      $trainers = pos_q("SELECT id, name, specialty FROM gym_trainers WHERE business_id=? AND status='active'", "s", [$shopId]);
      pos_send(200, ["shop" => $shop, "plans" => $plans, "trainers" => $trainers, "services" => pos_gym_services(), "pay" => pos_gym_pay_modes()]);
    }
    if ($method === "POST" && $rest === "register") {
      $shop = pos_gym_shop($shopId);
      if (!$shop) throw new Exception("Gym not found");
      $name = pos_gym_clip($body["name"] ?? "", 180);
      $mobile = substr(pos_gym_digits($body["mobile"] ?? ""), -10);
      $email = strtolower(pos_gym_clip($body["email"] ?? "", 160));
      $password = (string) ($body["password"] ?? "");
      if ($name === "" || strlen($mobile) < 10 || strlen($password) < 6) throw new Exception("Name, 10-digit mobile, and a 6+ character password are required");
      $exists = pos_q("SELECT * FROM gym_members WHERE business_id=? AND mobile=? LIMIT 1", "ss", [$shopId, $mobile]);
      if ($exists) {
        $row = $exists[0];
        if (!empty($row["password_hash"])) throw new Exception("This mobile is already registered");
        $hash = pos_hash_password($password);
        pos_q(
          "UPDATE gym_members SET password_hash=?, name=?, email=?, gender=?, emergency_name=?, emergency_mobile=? WHERE id=? AND business_id=?",
          "ssssssss",
          [$hash, $name, $email, pos_gym_clip($body["gender"] ?? "", 16), pos_gym_clip($body["emergency_name"] ?? "", 180), substr(pos_gym_digits($body["emergency_mobile"] ?? ""), -10), $row["id"], $shopId]
        );
        $token = pos_gym_issue_session($row["id"], $shopId);
        pos_send(200, ["token" => $token, "member" => ["id" => $row["id"], "member_no" => $row["member_no"], "name" => $name, "mobile" => $mobile, "email" => $email, "status" => $row["status"], "qr" => pos_gym_qr($shopId, $row["id"])]]);
      }
      $id = pos_uuid();
      $memberNo = pos_gym_next_no($shopId, "gym_member", "GY-", 1001);
      $hash = pos_hash_password($password);
      $customerId = pos_uuid();
      try {
        pos_q(
          "INSERT INTO customers (id, code, name, mobile, email, password_hash, type, outstanding, business_id) VALUES (?,?,?,?,?,?,'b2c',0,?)",
          "sssssss",
          [$customerId, $memberNo, $name, $mobile, $email, $hash, $shopId]
        );
      } catch (Exception $e) {
        $customerId = null;
      }
      pos_q(
        "INSERT INTO gym_members (id, member_no, customer_id, name, mobile, email, gender, emergency_name, emergency_mobile, trainer_id, status, password_hash, business_id) VALUES (?,?,?,?,?,?,?,?,?,?, 'active', ?, ?)",
        "ssssssssssss",
        [
          $id,
          $memberNo,
          $customerId,
          $name,
          $mobile,
          $email,
          pos_gym_clip($body["gender"] ?? "", 16),
          pos_gym_clip($body["emergency_name"] ?? "", 180),
          substr(pos_gym_digits($body["emergency_mobile"] ?? ""), -10),
          pos_gym_clip($body["trainer_id"] ?? "", 64) ?: null,
          $hash,
          $shopId,
        ]
      );
      $token = pos_gym_issue_session($id, $shopId);
      pos_send(200, ["token" => $token, "member" => ["id" => $id, "member_no" => $memberNo, "name" => $name, "mobile" => $mobile, "email" => $email, "status" => "active", "qr" => pos_gym_qr($shopId, $id)]]);
    }
    if ($method === "POST" && $rest === "login") {
      $idn = pos_gym_clip($body["mobile"] ?? ($body["email"] ?? ""), 160);
      $password = (string) ($body["password"] ?? "");
      $rows = pos_q("SELECT * FROM gym_members WHERE business_id=? AND (mobile=? OR email=?) LIMIT 1", "sss", [$shopId, substr(pos_gym_digits($idn), -10), strtolower($idn)]);
      $mem = $rows[0] ?? null;
      if (!$mem || empty($mem["password_hash"]) || !pos_verify_password($password, $mem["password_hash"])) {
        throw new Exception("Mobile/email or password is wrong");
      }
      $token = pos_gym_issue_session($mem["id"], $shopId);
      $membership = pos_gym_latest_membership($mem["id"], $shopId);
      pos_send(200, ["token" => $token, "member" => pos_gym_with_status($mem, $membership)]);
    }
    if ($method === "GET" && $rest === "me") {
      $mem = pos_gym_member_from_token($shopId);
      if (!$mem) pos_send(401, ["error" => "Sign in required", "php" => true]);
      $membership = pos_gym_latest_membership($mem["id"], $shopId);
      $programs = pos_q("SELECT * FROM gym_programs WHERE member_id=? ORDER BY created_at DESC LIMIT 20", "s", [$mem["id"]]);
      $measures = pos_q("SELECT * FROM gym_measurements WHERE member_id=? ORDER BY measured_at DESC LIMIT 20", "s", [$mem["id"]]);
      $plans = pos_q("SELECT id, name, kind, duration_days, price, admission_fee FROM gym_plans WHERE business_id=? AND status='active'", "s", [$shopId]);
      pos_send(200, ["member" => pos_gym_with_status($mem, $membership), "membership" => $membership, "programs" => $programs, "measurements" => $measures, "plans" => $plans]);
    }
    if ($method === "POST" && $rest === "renew") {
      $mem = pos_gym_member_from_token($shopId);
      if (!$mem) pos_send(401, ["error" => "Sign in required", "php" => true]);
      pos_send(200, pos_gym_bill($shopId, $mem, $body, "renew"));
    }
    if ($method === "POST" && $rest === "checkin") {
      pos_send(200, pos_gym_checkin($shopId, $body, "qr"));
    }
    pos_send(404, ["error" => "Gym route not found", "php" => true]);
  } catch (Exception $e) {
    pos_send(400, ["error" => $e->getMessage(), "php" => true]);
  }
  return true;
}

function pos_gym_staff_dispatch($path, $method, $body, $bid, $auth) {
  if (strpos($path, "gym/") !== 0 || strpos($path, "gym/public/") === 0) return false;
  pos_gym_ensure();
  pos_gym_seed($bid);
  $body = is_array($body) ? $body : [];
  try {
    if ($path === "gym/board" && $method === "GET") {
      $stats = pos_gym_board_stats($bid);
      $expiring = pos_q(
        "SELECT m.id, m.member_no, m.name, m.mobile, x.end_date, x.due FROM gym_members m JOIN gym_memberships x ON x.member_id=m.id WHERE m.business_id=? AND x.end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) ORDER BY x.end_date LIMIT 40",
        "s",
        [$bid]
      );
      pos_send(200, ["stats" => $stats, "cards" => pos_gym_dashboard_cards($stats), "expiring" => $expiring, "reports" => pos_gym_reports(), "services" => pos_gym_services()]);
    }
    if ($path === "gym/plans" && $method === "GET") {
      pos_send(200, pos_q("SELECT * FROM gym_plans WHERE business_id=? ORDER BY duration_days, name", "s", [$bid]));
    }
    if ($path === "gym/plans" && $method === "POST") {
      $id = pos_gym_clip($body["id"] ?? "", 64) ?: pos_uuid();
      $kind = pos_gym_clip($body["kind"] ?? "custom", 32) ?: "custom";
      $days = pos_gym_kind_days($kind, $body["duration_days"] ?? 30);
      $name = pos_gym_clip($body["name"] ?? "Plan", 180) ?: "Plan";
      $exists = pos_q("SELECT id FROM gym_plans WHERE id=? AND business_id=?", "ss", [$id, $bid]);
      if ($exists) {
        pos_q(
          "UPDATE gym_plans SET name=?, kind=?, duration_days=?, price=?, admission_fee=?, gst_rate=?, sessions=?, status=?, description=? WHERE id=? AND business_id=?",
          "ssiddddssss",
          [$name, $kind, $days, (float) ($body["price"] ?? 0), (float) ($body["admission_fee"] ?? 0), (float) ($body["gst_rate"] ?? 0), (int) ($body["sessions"] ?? 0), pos_gym_clip($body["status"] ?? "active", 16) ?: "active", pos_gym_clip($body["description"] ?? "", 2000), $id, $bid]
        );
      } else {
        pos_q(
          "INSERT INTO gym_plans (id, name, kind, duration_days, price, admission_fee, gst_rate, sessions, status, description, business_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          "sssidddssss",
          [$id, $name, $kind, $days, (float) ($body["price"] ?? 0), (float) ($body["admission_fee"] ?? 0), (float) ($body["gst_rate"] ?? 0), (int) ($body["sessions"] ?? 0), pos_gym_clip($body["status"] ?? "active", 16) ?: "active", pos_gym_clip($body["description"] ?? "", 2000), $bid]
        );
      }
      pos_send(200, ["ok" => true, "id" => $id]);
    }
    if ($path === "gym/trainers" && $method === "GET") {
      $rows = pos_q("SELECT * FROM gym_trainers WHERE business_id=? ORDER BY name", "s", [$bid]);
      $counts = pos_q("SELECT trainer_id, COUNT(*) n FROM gym_members WHERE business_id=? AND trainer_id IS NOT NULL GROUP BY trainer_id", "s", [$bid]);
      $map = [];
      foreach ($counts as $c) $map[$c["trainer_id"]] = (int) $c["n"];
      foreach ($rows as &$t) $t["members"] = $map[$t["id"]] ?? 0;
      pos_send(200, $rows);
    }
    if ($path === "gym/trainers" && $method === "POST") {
      $id = pos_gym_clip($body["id"] ?? "", 64) ?: pos_uuid();
      $name = pos_gym_clip($body["name"] ?? "", 180);
      $mobile = substr(pos_gym_digits($body["mobile"] ?? ""), -10);
      $email = pos_gym_clip($body["email"] ?? "", 160);
      $specialty = pos_gym_clip($body["specialty"] ?? "", 80);
      $comm = (float) ($body["commission_pct"] ?? 0);
      $status = pos_gym_clip($body["status"] ?? "active", 16) ?: "active";
      $photo = pos_gym_clip($body["photo_url"] ?? "", 4000);
      $notes = pos_gym_clip($body["notes"] ?? "", 2000);
      $exists = pos_q("SELECT id FROM gym_trainers WHERE id=? AND business_id=?", "ss", [$id, $bid]);
      if ($exists) {
        pos_q("UPDATE gym_trainers SET name=?, mobile=?, email=?, specialty=?, commission_pct=?, status=?, photo_url=?, notes=? WHERE id=? AND business_id=?", "ssssdsssss", [$name, $mobile, $email, $specialty, $comm, $status, $photo, $notes, $id, $bid]);
      } else {
        pos_q("INSERT INTO gym_trainers (id, name, mobile, email, specialty, commission_pct, status, photo_url, notes, business_id) VALUES (?,?,?,?,?,?,?,?,?,?)", "ssssdsssss", [$id, $name, $mobile, $email, $specialty, $comm, $status, $photo, $notes, $bid]);
      }
      pos_send(200, ["ok" => true, "id" => $id]);
    }
    if (preg_match("#^gym/trainers/([^/]+)/members$#", $path, $mm) && $method === "GET") {
      pos_send(200, pos_q("SELECT id, member_no, name, mobile, status FROM gym_members WHERE trainer_id=? AND business_id=? ORDER BY name", "ss", [$mm[1], $bid]));
    }
    if ($path === "gym/trainers/attendance" && $method === "GET") {
      $day = pos_gym_clip($_GET["date"] ?? "", 10) ?: pos_gym_today();
      pos_send(200, pos_q("SELECT a.*, t.name FROM gym_trainer_attendance a JOIN gym_trainers t ON t.id=a.trainer_id WHERE a.business_id=? AND DATE(a.check_in)=? ORDER BY a.check_in DESC", "ss", [$bid, $day]));
    }
    if (preg_match("#^gym/trainers/([^/]+)/attendance$#", $path, $mm) && $method === "POST") {
      $trainerId = $mm[1];
      $t = pos_q("SELECT * FROM gym_trainers WHERE id=? AND business_id=?", "ss", [$trainerId, $bid]);
      if (!$t) throw new Exception("Trainer not found");
      $open = pos_q("SELECT id FROM gym_trainer_attendance WHERE trainer_id=? AND check_out IS NULL ORDER BY check_in DESC LIMIT 1", "s", [$trainerId]);
      if ($open) {
        pos_q("UPDATE gym_trainer_attendance SET check_out=CURRENT_TIMESTAMP(3) WHERE id=?", "s", [$open[0]["id"]]);
        pos_send(200, ["ok" => true, "action" => "checkout", "trainer" => $t[0]]);
      }
      pos_q("INSERT INTO gym_trainer_attendance (id, trainer_id, business_id) VALUES (?,?,?)", "sss", [pos_uuid(), $trainerId, $bid]);
      pos_send(200, ["ok" => true, "action" => "checkin", "trainer" => $t[0]]);
    }
    if ($path === "gym/members" && $method === "GET") {
      $q = strtolower(pos_gym_clip($_GET["q"] ?? "", 80));
      $status = pos_gym_clip($_GET["status"] ?? "", 16);
      $rows = pos_q("SELECT * FROM gym_members WHERE business_id=? ORDER BY created_at DESC LIMIT 400", "s", [$bid]);
      $day = pos_gym_today();
      $out = [];
      foreach ($rows as $row) {
        $membership = pos_gym_latest_membership($row["id"], $bid);
        $full = $row;
        $full["end_date"] = $membership["end_date"] ?? "";
        $full["status"] = pos_gym_member_status($full, $day);
        $full["membership"] = $membership;
        $full["qr"] = pos_gym_qr($bid, $row["id"]);
        if ($status !== "" && $full["status"] !== $status) continue;
        if ($q !== "" && strpos(strtolower($full["name"] . " " . $full["mobile"] . " " . $full["member_no"]), $q) === false) continue;
        unset($full["password_hash"]);
        $out[] = $full;
      }
      pos_send(200, $out);
    }
    if ($path === "gym/members" && $method === "POST") {
      $name = pos_gym_clip($body["name"] ?? "", 180);
      $mobile = substr(pos_gym_digits($body["mobile"] ?? ""), -10);
      if ($name === "" || strlen($mobile) < 10) throw new Exception("Name and 10-digit mobile are required");
      $id = pos_gym_clip($body["id"] ?? "", 64) ?: pos_uuid();
      $dup = pos_q("SELECT id FROM gym_members WHERE business_id=? AND mobile=? AND id<>? LIMIT 1", "sss", [$bid, $mobile, $id]);
      if ($dup) throw new Exception("This mobile is already registered");
      $exists = pos_q("SELECT * FROM gym_members WHERE id=? AND business_id=?", "ss", [$id, $bid]);
      $email = pos_gym_clip($body["email"] ?? "", 160);
      $photo = pos_gym_clip($body["photo_url"] ?? "", 4000);
      $gender = pos_gym_clip($body["gender"] ?? "", 16);
      $dob = pos_gym_clip($body["dob"] ?? "", 10) ?: null;
      $en = pos_gym_clip($body["emergency_name"] ?? "", 180);
      $em = substr(pos_gym_digits($body["emergency_mobile"] ?? ""), -10);
      $trainer = pos_gym_clip($body["trainer_id"] ?? "", 64) ?: null;
      $notes = pos_gym_clip($body["notes"] ?? "", 2000);
      if ($exists) {
        pos_q(
          "UPDATE gym_members SET name=?, mobile=?, email=?, photo_url=?, gender=?, dob=?, emergency_name=?, emergency_mobile=?, trainer_id=?, notes=? WHERE id=? AND business_id=?",
          "ssssssssssss",
          [$name, $mobile, $email, $photo, $gender, $dob, $en, $em, $trainer, $notes, $id, $bid]
        );
        pos_send(200, ["ok" => true, "id" => $id, "member_no" => $exists[0]["member_no"]]);
      }
      $memberNo = pos_gym_next_no($bid, "gym_member", "GY-", 1001);
      $customerId = pos_uuid();
      try {
        pos_q("INSERT INTO customers (id, code, name, mobile, email, type, outstanding, business_id) VALUES (?,?,?,?,?,'b2c',0,?)", "ssssss", [$customerId, $memberNo, $name, $mobile, $email, $bid]);
      } catch (Exception $e) {
        $customerId = null;
      }
      pos_q(
        "INSERT INTO gym_members (id, member_no, customer_id, name, mobile, email, photo_url, gender, dob, emergency_name, emergency_mobile, trainer_id, status, notes, business_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'active', ?, ?)",
        "ssssssssssssss",
        [$id, $memberNo, $customerId, $name, $mobile, $email, $photo, $gender, $dob, $en, $em, $trainer, $notes, $bid]
      );
      pos_send(200, ["ok" => true, "id" => $id, "member_no" => $memberNo, "qr" => pos_gym_qr($bid, $id)]);
    }
    if (preg_match("#^gym/members/([^/]+)/status$#", $path, $mm) && $method === "POST") {
      $status = pos_gym_clip($body["status"] ?? "", 16);
      if (!in_array($status, ["active", "expired", "frozen"], true)) throw new Exception("Status must be Active, Expired, or Frozen");
      pos_q("UPDATE gym_members SET status=? WHERE id=? AND business_id=?", "sss", [$status, $mm[1], $bid]);
      pos_send(200, ["ok" => true, "status" => $status]);
    }
    if (preg_match("#^gym/members/([^/]+)/bill$#", $path, $mm) && $method === "POST") {
      $rows = pos_q("SELECT * FROM gym_members WHERE id=? AND business_id=?", "ss", [$mm[1], $bid]);
      if (!$rows) throw new Exception("Member not found");
      pos_send(200, pos_gym_bill($bid, $rows[0], $body, pos_gym_clip($body["kind"] ?? "new", 16) ?: "new"));
    }
    if ($path === "gym/attendance" && $method === "GET") {
      $day = pos_gym_clip($_GET["date"] ?? "", 10) ?: pos_gym_today();
      $rows = pos_q("SELECT a.*, m.name, m.member_no FROM gym_attendance a JOIN gym_members m ON m.id=a.member_id WHERE a.business_id=? AND DATE(a.check_in)=? ORDER BY a.check_in DESC LIMIT 400", "ss", [$bid, $day]);
      if (pos_gym_clip($_GET["report"] ?? "", 16) === "absent") {
        $present = [];
        foreach ($rows as $r) $present[$r["member_id"]] = true;
        $members = pos_q("SELECT id, member_no, name, status FROM gym_members WHERE business_id=?", "s", [$bid]);
        $absent = [];
        foreach ($members as $mem) {
          if (!empty($present[$mem["id"]])) continue;
          $membership = pos_gym_latest_membership($mem["id"], $bid);
          $st = pos_gym_member_status(["status" => $mem["status"], "end_date" => $membership["end_date"] ?? ""], $day);
          if ($st === "active") {
            $mem["status"] = $st;
            $mem["date"] = $day;
            $absent[] = $mem;
          }
        }
        pos_send(200, $absent);
      }
      pos_send(200, $rows);
    }
    if ($path === "gym/attendance/checkin" && $method === "POST") {
      pos_send(200, pos_gym_checkin($bid, $body, pos_gym_clip($body["source"] ?? "manual", 16) ?: "manual"));
    }
    if ($path === "gym/expiry" && $method === "GET") {
      $rows = pos_q(
        "SELECT m.id, m.member_no, m.name, m.mobile, m.status, x.plan_name, x.end_date, x.due FROM gym_members m LEFT JOIN gym_memberships x ON x.id=(SELECT y.id FROM gym_memberships y WHERE y.member_id=m.id ORDER BY y.end_date DESC LIMIT 1) WHERE m.business_id=? ORDER BY x.end_date IS NULL, x.end_date LIMIT 400",
        "s",
        [$bid]
      );
      $day = pos_gym_today();
      foreach ($rows as &$r) $r["status"] = ((string) $r["status"] === "frozen") ? "frozen" : pos_gym_member_status($r, $day);
      pos_send(200, $rows);
    }
    if ($path === "gym/reminders" && $method === "POST") {
      $rows = pos_q(
        "SELECT m.name, m.mobile, m.member_no, x.end_date FROM gym_members m JOIN gym_memberships x ON x.member_id=m.id WHERE m.business_id=? AND x.end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)",
        "s",
        [$bid]
      );
      $sent = 0;
      if (is_file(__DIR__ . "/pos-alerts.php")) {
        require_once __DIR__ . "/pos-alerts.php";
        foreach ($rows as $r) {
          if (empty($r["mobile"])) continue;
          $msg = pos_gym_notice("reminder", $r);
          try {
            if (function_exists("pos_alert_dispatch")) {
              pos_alert_dispatch([$r["mobile"]], [], "Gym renewal reminder", $msg, "", "", ["kind" => "gym-reminder", "businessId" => $bid]);
              $sent++;
            }
          } catch (Exception $e) { /* skip */ }
        }
      }
      pos_send(200, ["ok" => true, "sent" => $sent, "queued" => count($rows)]);
    }
    if ($path === "gym/measurements" && $method === "GET") {
      $memberId = pos_gym_clip($_GET["member_id"] ?? "", 64);
      if ($memberId !== "") pos_send(200, pos_q("SELECT * FROM gym_measurements WHERE member_id=? AND business_id=? ORDER BY measured_at DESC LIMIT 80", "ss", [$memberId, $bid]));
      pos_send(200, pos_q("SELECT * FROM gym_measurements WHERE business_id=? ORDER BY measured_at DESC LIMIT 80", "s", [$bid]));
    }
    if ($path === "gym/measurements" && $method === "POST") {
      $memberId = pos_gym_clip($body["member_id"] ?? "", 64);
      if ($memberId === "") throw new Exception("Member is required");
      $weight = (float) ($body["weight_kg"] ?? 0);
      $height = (float) ($body["height_cm"] ?? 0);
      pos_q(
        "INSERT INTO gym_measurements (id, member_id, measured_at, weight_kg, height_cm, bmi, chest, waist, hip, arms, photo_before, photo_after, notes, business_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        "sssdddddddssss",
        [
          pos_uuid(),
          $memberId,
          pos_gym_clip($body["measured_at"] ?? "", 10) ?: pos_gym_today(),
          $weight,
          $height,
          pos_gym_bmi($weight, $height),
          (float) ($body["chest"] ?? 0) ?: null,
          (float) ($body["waist"] ?? 0) ?: null,
          (float) ($body["hip"] ?? 0) ?: null,
          (float) ($body["arms"] ?? 0) ?: null,
          pos_gym_clip($body["photo_before"] ?? "", 4000),
          pos_gym_clip($body["photo_after"] ?? "", 4000),
          pos_gym_clip($body["notes"] ?? "", 2000),
          $bid,
        ]
      );
      pos_send(200, ["ok" => true, "bmi" => pos_gym_bmi($weight, $height)]);
    }
    if ($path === "gym/programs" && $method === "GET") {
      $memberId = pos_gym_clip($_GET["member_id"] ?? "", 64);
      if ($memberId !== "") pos_send(200, pos_q("SELECT * FROM gym_programs WHERE member_id=? AND business_id=? ORDER BY created_at DESC", "ss", [$memberId, $bid]));
      pos_send(200, pos_q("SELECT * FROM gym_programs WHERE business_id=? ORDER BY created_at DESC LIMIT 80", "s", [$bid]));
    }
    if ($path === "gym/programs" && $method === "POST") {
      $memberId = pos_gym_clip($body["member_id"] ?? "", 64);
      $title = pos_gym_clip($body["title"] ?? "", 180);
      if ($memberId === "" || $title === "") throw new Exception("Member and plan title are required");
      pos_q(
        "INSERT INTO gym_programs (id, member_id, kind, title, body, trainer_id, business_id) VALUES (?,?,?,?,?,?,?)",
        "sssssss",
        [pos_uuid(), $memberId, pos_gym_clip($body["kind"] ?? "workout", 16) ?: "workout", $title, pos_gym_clip($body["body"] ?? "", 8000), pos_gym_clip($body["trainer_id"] ?? "", 64) ?: null, $bid]
      );
      pos_send(200, ["ok" => true]);
    }
    if (preg_match("#^gym/reports/([^/]+)$#", $path, $mm) && $method === "GET") {
      $id = $mm[1];
      $rows = [];
      if ($id === "gym-members") $rows = pos_q("SELECT member_no, name, mobile, status, created_at FROM gym_members WHERE business_id=? ORDER BY created_at DESC LIMIT 400", "s", [$bid]);
      else if ($id === "gym-attendance") $rows = pos_q("SELECT m.member_no, m.name, a.check_in, a.check_out, a.source FROM gym_attendance a JOIN gym_members m ON m.id=a.member_id WHERE a.business_id=? ORDER BY a.check_in DESC LIMIT 400", "s", [$bid]);
      else if ($id === "gym-collection" || $id === "gym-sales-daily") $rows = pos_q("SELECT receipt_no, plan_name, paid, method, created_at FROM gym_memberships WHERE business_id=? AND DATE(created_at)=CURDATE() ORDER BY created_at DESC", "s", [$bid]);
      else if ($id === "gym-sales-monthly") $rows = pos_q("SELECT receipt_no, plan_name, paid, method, created_at FROM gym_memberships WHERE business_id=? AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') ORDER BY created_at DESC", "s", [$bid]);
      else if ($id === "gym-sales-yearly") $rows = pos_q("SELECT receipt_no, plan_name, paid, method, created_at FROM gym_memberships WHERE business_id=? AND YEAR(created_at)=YEAR(CURDATE()) ORDER BY created_at DESC", "s", [$bid]);
      else if ($id === "gym-dues") $rows = pos_q("SELECT m.member_no, m.name, x.plan_name, x.due, x.end_date FROM gym_memberships x JOIN gym_members m ON m.id=x.member_id WHERE x.business_id=? AND x.due>0 ORDER BY x.due DESC", "s", [$bid]);
      else if ($id === "gym-expiry") $rows = pos_q("SELECT m.member_no, m.name, x.plan_name, x.end_date FROM gym_memberships x JOIN gym_members m ON m.id=x.member_id WHERE x.business_id=? ORDER BY x.end_date LIMIT 400", "s", [$bid]);
      else if ($id === "gym-trainers") $rows = pos_q("SELECT name, specialty, commission_pct, status FROM gym_trainers WHERE business_id=?", "s", [$bid]);
      else if ($id === "gym-expense" || $id === "gym-pl") {
        try {
          $rows = pos_q("SELECT expense_date AS date, category, amount, notes FROM expenses WHERE business_id=? ORDER BY expense_date DESC LIMIT 200", "s", [$bid]);
        } catch (Exception $e) {
          $rows = [];
        }
      }
      pos_send(200, ["id" => $id, "rows" => $rows]);
    }
  } catch (Exception $e) {
    pos_send(400, ["error" => $e->getMessage(), "php" => true]);
  }
  return false;
}
