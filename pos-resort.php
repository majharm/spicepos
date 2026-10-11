<?php
function pos_resort_ensure() {
  $db = pos_db();
  $db->query("CREATE TABLE IF NOT EXISTS resort_settings (business_id VARCHAR(255) PRIMARY KEY, settings_json MEDIUMTEXT NULL, updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3))");
  $db->query("CREATE TABLE IF NOT EXISTS resort_rooms (id VARCHAR(255) PRIMARY KEY, property_id VARCHAR(255) NULL, number VARCHAR(32) NOT NULL, name VARCHAR(180) NULL, category VARCHAR(64) NOT NULL DEFAULT 'standard', description TEXT NULL, photos_json MEDIUMTEXT NULL, amenities_json MEDIUMTEXT NULL, max_adults INT NOT NULL DEFAULT 2, max_children INT NOT NULL DEFAULT 1, bed_type VARCHAR(64) NULL, beds INT NOT NULL DEFAULT 1, rate DECIMAL(12,2) NOT NULL DEFAULT 0, weekday_rate DECIMAL(12,2) NOT NULL DEFAULT 0, weekend_rate DECIMAL(12,2) NOT NULL DEFAULT 0, extra_adult_rate DECIMAL(12,2) NOT NULL DEFAULT 0, extra_child_rate DECIMAL(12,2) NOT NULL DEFAULT 0, extra_bed_rate DECIMAL(12,2) NOT NULL DEFAULT 0, tax_rate DECIMAL(8,2) NOT NULL DEFAULT 12, service_rate DECIMAL(8,2) NOT NULL DEFAULT 0, physical_status VARCHAR(32) NOT NULL DEFAULT 'available', hk_status VARCHAR(32) NOT NULL DEFAULT 'ready', active TINYINT(1) NOT NULL DEFAULT 1, rates_json MEDIUMTEXT NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), INDEX (business_id), INDEX (number), INDEX (physical_status))");
  $db->query("CREATE TABLE IF NOT EXISTS resort_bookings (id VARCHAR(255) PRIMARY KEY, booking_no VARCHAR(32) NOT NULL, property_id VARCHAR(255) NULL, room_id VARCHAR(255) NOT NULL, category VARCHAR(64) NULL, status VARCHAR(32) NOT NULL DEFAULT 'hold', payment_status VARCHAR(32) NOT NULL DEFAULT 'pending', check_in DATE NOT NULL, check_out DATE NOT NULL, nights INT NOT NULL DEFAULT 1, adults INT NOT NULL DEFAULT 1, children INT NOT NULL DEFAULT 0, guest_name VARCHAR(180) NULL, guest_mobile VARCHAR(32) NULL, guest_email VARCHAR(160) NULL, id_type VARCHAR(32) NULL, id_number VARCHAR(64) NULL, source VARCHAR(32) NOT NULL DEFAULT 'website', expires_at TIMESTAMP(3) NULL, total DECIMAL(12,2) NOT NULL DEFAULT 0, paid DECIMAL(12,2) NOT NULL DEFAULT 0, due DECIMAL(12,2) NOT NULL DEFAULT 0, price_json MEDIUMTEXT NULL, checked_in_at TIMESTAMP(3) NULL, checked_out_at TIMESTAMP(3) NULL, cancelled_at TIMESTAMP(3) NULL, cancel_reason VARCHAR(255) NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), INDEX (business_id), INDEX (room_id), INDEX (status), INDEX (booking_no), INDEX (check_in), INDEX (expires_at))");
  $db->query("CREATE TABLE IF NOT EXISTS resort_blocks (id VARCHAR(255) PRIMARY KEY, room_id VARCHAR(255) NOT NULL, kind VARCHAR(32) NOT NULL DEFAULT 'blocked', start_date DATE NOT NULL, end_date DATE NOT NULL, note VARCHAR(255) NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (business_id), INDEX (room_id))");
  $db->query("CREATE TABLE IF NOT EXISTS resort_folio (id VARCHAR(255) PRIMARY KEY, booking_id VARCHAR(255) NOT NULL, room_id VARCHAR(255) NULL, kind VARCHAR(32) NOT NULL DEFAULT 'service', amount DECIMAL(12,2) NOT NULL DEFAULT 0, note VARCHAR(255) NULL, ref_id VARCHAR(255) NULL, user_id VARCHAR(255) NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (booking_id), INDEX (business_id))");
  $db->query("CREATE TABLE IF NOT EXISTS resort_payments (id VARCHAR(255) PRIMARY KEY, booking_id VARCHAR(255) NOT NULL, method VARCHAR(32) NOT NULL DEFAULT 'cash', status VARCHAR(32) NOT NULL DEFAULT 'pending', amount DECIMAL(12,2) NOT NULL DEFAULT 0, gateway_ref VARCHAR(120) NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (booking_id), INDEX (business_id))");
  $db->query("CREATE TABLE IF NOT EXISTS resort_audit (id VARCHAR(255) PRIMARY KEY, action VARCHAR(64) NOT NULL, detail VARCHAR(500) NULL, user_id VARCHAR(255) NULL, user_name VARCHAR(180) NULL, business_id VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (business_id))");
}

function pos_resort_clip($v, $n) {
  return substr(trim((string) $v), 0, (int) $n);
}

function pos_resort_num($v, $fallback = 0) {
  return is_numeric($v) ? (float) $v : (float) $fallback;
}

function pos_resort_flag($v) {
  return ($v === true || $v === 1 || $v === "1" || $v === "on" || $v === "true" || $v === "yes") ? 1 : 0;
}

function pos_resort_assert($bid) {
  $rows = pos_q("SELECT * FROM businesses WHERE id=? LIMIT 1", "s", [$bid]);
  $biz = $rows[0] ?? null;
  if (!$biz || !pos_is_resort_shop($biz)) {
    pos_send(403, ["error" => "Resort model is not enabled for this shop"]);
  }
  return $biz;
}

function pos_resort_defaults() {
  return [
    "property_name" => "",
    "address" => "",
    "phone" => "",
    "email" => "",
    "check_in_time" => "14:00",
    "check_out_time" => "11:00",
    "timezone" => "Asia/Kolkata",
    "hold_minutes" => 10,
    "tax_rate" => 12,
    "service_rate" => 0,
    "pay_on_arrival" => 0,
    "min_stay" => 1,
    "max_stay" => 30,
    "booking_policy" => "",
    "late_checkout_fee" => 0,
  ];
}

function pos_resort_settings($bid) {
  $rows = pos_q("SELECT settings_json FROM resort_settings WHERE business_id=?", "s", [$bid]);
  $parsed = [];
  if (!empty($rows[0]["settings_json"])) {
    $decoded = json_decode($rows[0]["settings_json"], true);
    if (is_array($decoded)) $parsed = $decoded;
  }
  return array_merge(pos_resort_defaults(), $parsed);
}

function pos_resort_ymd($v) {
  $s = substr(trim((string) $v), 0, 10);
  return preg_match("/^\\d{4}-\\d{2}-\\d{2}$/", $s) ? $s : "";
}

function pos_resort_overlap($a0, $a1, $b0, $b1) {
  $a0 = pos_resort_ymd($a0);
  $a1 = pos_resort_ymd($a1);
  $b0 = pos_resort_ymd($b0);
  $b1 = pos_resort_ymd($b1);
  if ($a0 === "" || $a1 === "" || $b0 === "" || $b1 === "") return false;
  return $a0 < $b1 && $b0 < $a1;
}

function pos_resort_nights($in, $out) {
  $a = pos_resort_ymd($in);
  $b = pos_resort_ymd($out);
  if ($a === "" || $b === "" || $b <= $a) return 0;
  return (int) round((strtotime($b . " 12:00:00") - strtotime($a . " 12:00:00")) / 86400);
}

function pos_resort_expire($bid) {
  pos_q(
    "UPDATE resort_bookings SET status='expired', payment_status=IF(payment_status='pending','failed',payment_status) WHERE business_id=? AND status='hold' AND expires_at IS NOT NULL AND expires_at < UTC_TIMESTAMP(3)",
    "s",
    [$bid]
  );
}

function pos_resort_blocks_dates($row) {
  $s = strtolower((string) ($row["status"] ?? ""));
  if (in_array($s, ["cancelled", "no_show", "expired", "checked_out"], true)) return false;
  if ($s === "hold") {
    $exp = $row["expires_at"] ?? "";
    return $exp !== "" && strtotime((string) $exp) > time();
  }
  return in_array($s, ["confirmed", "checked_in", "pending"], true);
}

function pos_resort_room_ok($room, $stay, $bookings, $blocks, $ignore = "", $ignoreHolds = false) {
  if (!$room || (int) ($room["active"] ?? 1) === 0) return "inactive";
  $in = pos_resort_ymd($stay["check_in"] ?? "");
  $out = pos_resort_ymd($stay["check_out"] ?? "");
  if ($in === "" || $out === "" || $out <= $in) return "invalid_dates";
  $adults = max(1, (int) ($stay["adults"] ?? 1));
  $maxA = (int) ($room["max_adults"] ?? 2);
  if ($maxA > 0 && $adults > $maxA) return "occupancy";
  $today = date("Y-m-d");
  $phys = strtolower((string) ($room["physical_status"] ?? "available"));
  if ($phys === "blocked") return "blocked";
  if ($in === $today && in_array($phys, ["cleaning", "checkout_pending"], true)) return "not_ready";
  if ($in === $today && $phys === "maintenance") return "maintenance";
  foreach ($bookings as $row) {
    if ($ignore !== "" && (string) $row["id"] === (string) $ignore) continue;
    if ((string) $row["room_id"] !== (string) $room["id"]) continue;
    if ($ignoreHolds && strtolower((string) ($row["status"] ?? "")) === "hold") continue;
    if (!pos_resort_blocks_dates($row)) continue;
    if (pos_resort_overlap($in, $out, $row["check_in"], $row["check_out"])) {
      return strtolower((string) $row["status"]) === "hold" ? "held" : "booked";
    }
  }
  foreach ($blocks as $blk) {
    if ((string) $blk["room_id"] !== (string) $room["id"]) continue;
    if (pos_resort_overlap($in, $out, $blk["start_date"] ?? $blk["start"], $blk["end_date"] ?? $blk["end"])) {
      return strtolower((string) ($blk["kind"] ?? "")) === "maintenance" ? "maintenance" : "blocked";
    }
  }
  return "";
}

function pos_resort_rate($room, $date, $settings) {
  $ts = strtotime($date . " 12:00:00");
  $dow = (int) date("w", $ts);
  if (in_array($dow, [0, 6], true) && pos_resort_num($room["weekend_rate"] ?? 0) > 0) return pos_resort_num($room["weekend_rate"]);
  if (!in_array($dow, [0, 6], true) && pos_resort_num($room["weekday_rate"] ?? 0) > 0) return pos_resort_num($room["weekday_rate"]);
  return pos_resort_num($room["rate"] ?? 0);
}

function pos_resort_price($room, $stay, $settings) {
  $nights = pos_resort_nights($stay["check_in"], $stay["check_out"]);
  $roomTotal = 0;
  $cur = pos_resort_ymd($stay["check_in"]);
  $end = pos_resort_ymd($stay["check_out"]);
  $nightly = [];
  while ($cur !== "" && $end !== "" && $cur < $end) {
    $rate = pos_resort_rate($room, $cur, $settings);
    $nightly[] = ["date" => $cur, "rate" => $rate];
    $roomTotal += $rate;
    $cur = date("Y-m-d", strtotime($cur . " +1 day"));
  }
  $adults = max(1, (int) ($stay["adults"] ?? 1));
  $children = max(0, (int) ($stay["children"] ?? 0));
  $extraAdult = max(0, $adults - 2) * $nights * pos_resort_num($room["extra_adult_rate"] ?? $settings["extra_adult_rate"] ?? 0);
  $extraChild = $children * $nights * pos_resort_num($room["extra_child_rate"] ?? $settings["extra_child_rate"] ?? 0);
  $sub = $roomTotal + $extraAdult + $extraChild;
  $taxRate = pos_resort_num($room["tax_rate"] ?? $settings["tax_rate"] ?? 12);
  $tax = round($sub * ($taxRate / 100), 2);
  $total = round($sub + $tax, 2);
  return ["nights" => $nights, "nightly" => $nightly, "room" => round($roomTotal, 2), "extras" => round($extraAdult + $extraChild, 2), "tax" => $tax, "total" => $total];
}

function pos_resort_rooms($bid) {
  return pos_q("SELECT * FROM resort_rooms WHERE business_id=? ORDER BY number", "s", [$bid]);
}

function pos_resort_bookings($bid) {
  return pos_q("SELECT * FROM resort_bookings WHERE business_id=? ORDER BY created_at DESC LIMIT 800", "s", [$bid]);
}

function pos_resort_blocks($bid) {
  return pos_q("SELECT room_id, kind, start_date, end_date FROM resort_blocks WHERE business_id=?", "s", [$bid]);
}

function pos_resort_public_card($room, $price) {
  $photos = json_decode($room["photos_json"] ?? "[]", true);
  $amen = json_decode($room["amenities_json"] ?? "[]", true);
  return [
    "id" => $room["id"],
    "number" => $room["number"],
    "name" => $room["name"],
    "category" => $room["category"],
    "photos" => is_array($photos) ? $photos : [],
    "amenities" => is_array($amen) ? $amen : [],
    "max_adults" => (int) $room["max_adults"],
    "max_children" => (int) $room["max_children"],
    "price" => $price,
  ];
}

function pos_resort_search($bid, $q) {
  pos_resort_expire($bid);
  $stay = [
    "check_in" => pos_resort_ymd($q["check_in"] ?? $q["checkIn"] ?? ""),
    "check_out" => pos_resort_ymd($q["check_out"] ?? $q["checkOut"] ?? ""),
    "adults" => (int) ($q["adults"] ?? 2),
    "children" => (int) ($q["children"] ?? 0),
  ];
  $needed = max(1, (int) ($q["rooms"] ?? 1));
  $settings = pos_resort_settings($bid);
  $rooms = pos_resort_rooms($bid);
  $bookings = pos_resort_bookings($bid);
  $blocks = pos_resort_blocks($bid);
  $available = [];
  foreach ($rooms as $room) {
    if (pos_resort_room_ok($room, $stay, $bookings, $blocks) === "") $available[] = $room;
  }
  $cats = [];
  foreach ($available as $room) {
    $cat = (string) $room["category"];
    if (!isset($cats[$cat])) $cats[$cat] = [];
    $cats[$cat][] = $room;
  }
  $out = [];
  foreach ($cats as $cat => $list) {
    $price = pos_resort_price($list[0], $stay, $settings);
    $out[] = [
      "category" => $cat,
      "category_label" => $cat,
      "available_count" => count($list),
      "bookable" => count($list) >= $needed,
      "occupancy" => ["adults" => (int) $list[0]["max_adults"], "children" => (int) $list[0]["max_children"]],
      "amenities" => json_decode($list[0]["amenities_json"] ?? "[]", true) ?: [],
      "price" => $price,
      "rooms" => array_map(function ($r) use ($stay, $settings) {
        return pos_resort_public_card($r, pos_resort_price($r, $stay, $settings));
      }, $list),
    ];
  }
  return [
    "check_in" => $stay["check_in"],
    "check_out" => $stay["check_out"],
    "nights" => pos_resort_nights($stay["check_in"], $stay["check_out"]),
    "adults" => $stay["adults"],
    "children" => $stay["children"],
    "rooms_needed" => $needed,
    "categories" => $out,
    "available_rooms" => array_map(function ($r) use ($stay, $settings) {
      return pos_resort_public_card($r, pos_resort_price($r, $stay, $settings));
    }, $available),
    "message" => $out ? "" : "No rooms are available for these dates. Try other dates or another room category.",
  ];
}

function pos_resort_audit($bid, $action, $detail, $auth = null) {
  pos_q(
    "INSERT INTO resort_audit (id, action, detail, user_id, user_name, business_id) VALUES (?,?,?,?,?,?)",
    "ssssss",
    [pos_uuid(), pos_resort_clip($action, 64), pos_resort_clip($detail, 500), $auth["user"]["id"] ?? "", $auth["user"]["name"] ?? "", $bid]
  );
}

function pos_resort_create_hold($bid, $body, $source = "website") {
  pos_resort_expire($bid);
  $roomId = (string) ($body["room_id"] ?? $body["room_no"] ?? "");
  $rooms = pos_q("SELECT * FROM resort_rooms WHERE business_id=? AND (id=? OR number=?) LIMIT 1", "sss", [$bid, $roomId, $roomId]);
  $room = $rooms[0] ?? null;
  if (!$room) throw new Exception("Room not found");
  $stay = [
    "check_in" => pos_resort_ymd($body["check_in"] ?? $body["checkIn"] ?? ""),
    "check_out" => pos_resort_ymd($body["check_out"] ?? $body["checkOut"] ?? ""),
    "adults" => (int) ($body["adults"] ?? 1),
    "children" => (int) ($body["children"] ?? 0),
  ];
  $reason = pos_resort_room_ok($room, $stay, pos_resort_bookings($bid), pos_resort_blocks($bid));
  if ($reason !== "") throw new Exception($reason === "booked" ? "This room is not available for the selected dates" : "Room unavailable ({$reason})");
  $settings = pos_resort_settings($bid);
  $price = pos_resort_price($room, $stay, $settings);
  $guest = $body["guest"] ?? $body;
  $id = pos_uuid();
  $no = "RSV-" . date("Ymd") . "-" . strtoupper(substr($id, 0, 4));
  $mins = max(1, (int) ($settings["hold_minutes"] ?? 10));
  $exp = gmdate("Y-m-d H:i:s", time() + $mins * 60);
  pos_q(
    "INSERT INTO resort_bookings (id, booking_no, room_id, category, status, payment_status, check_in, check_out, nights, adults, children, guest_name, guest_mobile, guest_email, source, expires_at, total, paid, due, price_json, business_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    "ssssssssiiisssssdddss",
    [
      $id, $no, $room["id"], $room["category"], "hold", "pending", $stay["check_in"], $stay["check_out"],
      $price["nights"], $stay["adults"], $stay["children"],
      pos_resort_clip($guest["name"] ?? $guest["guest_name"] ?? "", 180),
      pos_resort_clip($guest["mobile"] ?? $guest["guest_mobile"] ?? "", 32),
      pos_resort_clip($guest["email"] ?? $guest["guest_email"] ?? "", 160),
      $source, $exp, $price["total"], 0, $price["total"], json_encode($price), $bid,
    ]
  );
  return pos_q("SELECT * FROM resort_bookings WHERE id=? LIMIT 1", "s", [$id])[0];
}

function pos_resort_confirm($bid, $holdId, $payment, $settings = null) {
  return pos_with_transaction(function () use ($bid, $holdId, $payment, $settings) {
    pos_resort_expire($bid);
    $holds = pos_q("SELECT * FROM resort_bookings WHERE id=? AND business_id=? FOR UPDATE", "ss", [$holdId, $bid]);
    $hold = $holds[0] ?? null;
    if (!$hold) throw new Exception("Hold not found");
    if (($hold["status"] ?? "") !== "hold") throw new Exception("not_a_hold");
    $exp = $hold["expires_at"] ?? "";
    if ($exp !== "" && strtotime((string) $exp) <= time()) {
      pos_q("UPDATE resort_bookings SET status='expired', payment_status='failed' WHERE id=?", "s", [$holdId]);
      throw new Exception("The temporary hold expired. Please search again.");
    }
    $payStatus = strtolower((string) ($payment["status"] ?? ""));
    $settings = $settings ?: pos_resort_settings($bid);
    if ($payStatus === "failed" || $payStatus === "refunded") throw new Exception("Payment failed. The room was not booked.");
    $payOk = in_array($payStatus, ["success", "paid", "authorized"], true);
    $arrival = pos_resort_flag($settings["pay_on_arrival"] ?? 0) && in_array($payStatus, ["pending", "pay_on_arrival", ""], true);
    if (!$payOk && !$arrival) throw new Exception("Payment is required to confirm this booking");
    $rooms = pos_q("SELECT * FROM resort_rooms WHERE id=? AND business_id=? FOR UPDATE", "ss", [$hold["room_id"], $bid]);
    $room = $rooms[0] ?? null;
    $bookings = pos_q("SELECT * FROM resort_bookings WHERE business_id=? AND room_id=? FOR UPDATE", "ss", [$bid, $hold["room_id"]]);
    $blocks = pos_q("SELECT room_id, kind, start_date, end_date FROM resort_blocks WHERE business_id=? AND room_id=?", "ss", [$bid, $hold["room_id"]]);
    $reason = pos_resort_room_ok($room, $hold, $bookings, $blocks, $hold["id"], true);
    if ($reason !== "") throw new Exception("This room was just reserved by someone else. Choose another room or dates.");
    $paid = $payOk ? pos_resort_num($payment["amount"] ?? $hold["total"]) : 0;
    $pstat = $payOk ? ($payStatus === "authorized" ? "authorized" : "paid") : "pending";
    pos_q(
      "UPDATE resort_bookings SET status='confirmed', payment_status=?, paid=?, due=?, expires_at=NULL WHERE id=? AND business_id=?",
      "sddss",
      [$pstat, $paid, max(0, pos_resort_num($hold["total"]) - $paid), $holdId, $bid]
    );
    pos_q("UPDATE resort_rooms SET physical_status='reserved' WHERE id=? AND business_id=? AND physical_status='available'", "ss", [$hold["room_id"], $bid]);
    if ($paid > 0) {
      pos_q(
        "INSERT INTO resort_payments (id, booking_id, method, status, amount, gateway_ref, business_id) VALUES (?,?,?,?,?,?,?)",
        "ssssdss",
        [pos_uuid(), $holdId, pos_resort_clip($payment["method"] ?? "online", 32), $pstat, $paid, pos_resort_clip($payment["gateway_ref"] ?? "", 120), $bid]
      );
    }
    $rows = pos_q("SELECT * FROM resort_bookings WHERE id=? LIMIT 1", "s", [$holdId]);
    return $rows[0];
  });
}

function pos_resort_decorate($rows, $rooms) {
  $map = [];
  foreach ($rooms as $r) $map[$r["id"]] = $r;
  foreach ($rows as &$row) {
    $room = $map[$row["room_id"]] ?? null;
    $row["room_no"] = $room["number"] ?? $row["room_id"];
  }
  return $rows;
}

function pos_resort_public_shop($shopId) {
  $rows = pos_q("SELECT * FROM businesses WHERE id=? LIMIT 1", "s", [$shopId]);
  $biz = $rows[0] ?? null;
  if (!$biz || !pos_is_resort_shop($biz)) {
    pos_send(404, ["error" => "Resort booking is not available for this shop"]);
  }
  return $biz;
}

function pos_resort_public_dispatch($path, $method, $body) {
  if (strpos($path, "resort/public/") !== 0) return false;
  pos_resort_ensure();
  $parts = explode("/", $path);
  $shopId = $parts[2] ?? "";
  $action = $parts[3] ?? "";
  $extra = $parts[4] ?? "";
  $biz = pos_resort_public_shop($shopId);
  if ($action === "" && $method === "GET") {
    pos_send(200, ["business" => ["id" => $biz["id"], "name" => $biz["name"]], "property" => pos_resort_settings($biz["id"])]);
  }
  if ($action === "search" && $method === "GET") {
    pos_send(200, pos_resort_search($biz["id"], array_merge($_GET, $body ?: [])));
  }
  if ($action === "hold" && $method === "POST") {
    try {
      pos_send(200, ["booking" => pos_resort_create_hold($biz["id"], $body ?: [], "website")]);
    } catch (Exception $e) {
      pos_send(409, ["error" => $e->getMessage()]);
    }
  }
  if ($action === "confirm" && $method === "POST") {
    try {
      pos_send(200, ["booking" => pos_resort_confirm($biz["id"], $body["hold_id"] ?? "", $body["payment"] ?? [])]);
    } catch (Exception $e) {
      $code = strpos($e->getMessage(), "Payment failed") !== false ? 402 : 409;
      pos_send($code, ["error" => $e->getMessage()]);
    }
  }
  if ($action === "booking" && $extra !== "" && $method === "GET") {
    $rows = pos_q(
      "SELECT id, booking_no, status, payment_status, check_in, check_out, nights, adults, children, total, paid, due, category FROM resort_bookings WHERE business_id=? AND (booking_no=? OR id=?) LIMIT 1",
      "sss",
      [$biz["id"], $extra, $extra]
    );
    if (!$rows) pos_send(404, ["error" => "Booking not found"]);
    pos_send(200, ["booking" => $rows[0]]);
  }
  return false;
}

function pos_resort_staff_dispatch($path, $method, $body, $bid, $auth) {
  if (strpos($path, "resort/") !== 0) return false;
  pos_resort_ensure();
  pos_resort_assert($bid);
  pos_resort_expire($bid);
  if ($path === "resort/board" && $method === "GET") {
    $rooms = pos_resort_rooms($bid);
    $bookings = pos_resort_decorate(pos_resort_bookings($bid), $rooms);
    $today = date("Y-m-d");
    $arrivals = array_values(array_filter($bookings, fn($b) => ($b["status"] === "confirmed" && substr((string) $b["check_in"], 0, 10) === $today)));
    $departures = array_values(array_filter($bookings, fn($b) => (substr((string) $b["check_out"], 0, 10) === $today && in_array($b["status"], ["checked_in", "confirmed"], true))));
    $occupied = count(array_filter($rooms, fn($r) => $r["physical_status"] === "occupied"));
    pos_send(200, [
      "cards" => [
        ["id" => "occ", "label" => "Occupied now", "value" => $occupied],
        ["id" => "avail", "label" => "Available rooms", "value" => count(array_filter($rooms, fn($r) => $r["physical_status"] === "available"))],
        ["id" => "arrivals", "label" => "Arrivals today", "value" => count($arrivals)],
        ["id" => "departures", "label" => "Departures today", "value" => count($departures)],
      ],
      "arrivals" => $arrivals,
      "departures" => $departures,
      "reports" => [
        ["id" => "resort-rooms", "title" => "Room operations"],
        ["id" => "resort-revenue", "title" => "Room, restaurant, and service revenue"],
        ["id" => "resort-adr", "title" => "ADR and RevPAR"],
      ],
    ]);
  }
  if ($path === "resort/settings" && $method === "GET") {
    pos_send(200, ["settings" => pos_resort_settings($bid)]);
  }
  if ($path === "resort/settings" && $method === "POST") {
    $cur = pos_resort_settings($bid);
    $next = array_merge($cur, $body ?: []);
    pos_q(
      "INSERT INTO resort_settings (business_id, settings_json) VALUES (?,?) ON DUPLICATE KEY UPDATE settings_json=VALUES(settings_json)",
      "ss",
      [$bid, json_encode($next)]
    );
    pos_resort_audit($bid, "settings", "Updated resort settings", $auth);
    pos_send(200, ["settings" => $next]);
  }
  if ($path === "resort/rooms" && $method === "GET") {
    pos_send(200, ["rooms" => pos_resort_rooms($bid)]);
  }
  if ($path === "resort/rooms" && $method === "POST") {
    $id = pos_resort_clip($body["id"] ?? "", 255) ?: pos_uuid();
    $existing = pos_q("SELECT id FROM resort_rooms WHERE id=? AND business_id=?", "ss", [$id, $bid]);
    $vals = [
      pos_resort_clip($body["number"] ?? "", 32),
      pos_resort_clip($body["name"] ?? "", 180),
      pos_resort_clip($body["category"] ?? "standard", 64),
      pos_resort_num($body["max_adults"] ?? 2, 2),
      pos_resort_num($body["max_children"] ?? 1, 1),
      pos_resort_num($body["rate"] ?? 0),
      pos_resort_num($body["weekday_rate"] ?? $body["rate"] ?? 0),
      pos_resort_num($body["weekend_rate"] ?? $body["rate"] ?? 0),
      pos_resort_clip($body["physical_status"] ?? "available", 32),
      pos_resort_clip($body["hk_status"] ?? "ready", 32),
      pos_resort_flag($body["active"] ?? 1),
    ];
    if ($existing) {
      pos_q(
        "UPDATE resort_rooms SET number=?, name=?, category=?, max_adults=?, max_children=?, rate=?, weekday_rate=?, weekend_rate=?, physical_status=?, hk_status=?, active=? WHERE id=? AND business_id=?",
        "sssdddddssiss",
        array_merge($vals, [$id, $bid])
      );
    } else {
      pos_q(
        "INSERT INTO resort_rooms (id, number, name, category, max_adults, max_children, rate, weekday_rate, weekend_rate, physical_status, hk_status, active, business_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        "ssssdddddssis",
        array_merge([$id], $vals, [$bid])
      );
    }
    pos_send(200, ["ok" => true, "id" => $id]);
  }
  if ($path === "resort/bookings" && $method === "GET") {
    $rooms = pos_resort_rooms($bid);
    $bookings = pos_resort_decorate(pos_resort_bookings($bid), $rooms);
    $today = date("Y-m-d");
    $filter = (string) ($_GET["filter"] ?? $body["filter"] ?? "all");
    $inHouse = array_values(array_filter($bookings, fn($b) => $b["status"] === "checked_in"));
    $arrivals = array_values(array_filter($bookings, fn($b) => $b["status"] === "confirmed" && substr((string) $b["check_in"], 0, 10) === $today));
    $rows = $bookings;
    if ($filter === "in_house") $rows = $inHouse;
    if ($filter === "arrivals") $rows = $arrivals;
    pos_send(200, ["bookings" => $rows, "in_house" => $inHouse, "arrivals" => $arrivals, "departures" => []]);
  }
  if ($path === "resort/bookings" && $method === "POST") {
    try {
      $hold = pos_resort_create_hold($bid, $body ?: [], $body["source"] ?? "walk_in");
      $booking = pos_resort_confirm($bid, $hold["id"], $body["payment"] ?? ["status" => "paid", "method" => "cash", "amount" => $hold["total"]]);
      pos_resort_audit($bid, "booking.create", $booking["booking_no"], $auth);
      pos_send(200, ["booking" => $booking]);
    } catch (Exception $e) {
      pos_send(409, ["error" => $e->getMessage()]);
    }
  }
  if (preg_match("#^resort/bookings/([^/]+)/(cancel|checkin|checkout)$#", $path, $m)) {
    $id = $m[1];
    $act = $m[2];
    $rows = pos_q("SELECT * FROM resort_bookings WHERE id=? AND business_id=?", "ss", [$id, $bid]);
    $booking = $rows[0] ?? null;
    if (!$booking) pos_send(404, ["error" => "Booking not found"]);
    if ($act === "cancel") {
      pos_q("UPDATE resort_bookings SET status='cancelled', cancelled_at=UTC_TIMESTAMP(3), cancel_reason=? WHERE id=? AND business_id=?", "sss", [pos_resort_clip($body["reason"] ?? "", 255), $id, $bid]);
      pos_resort_audit($bid, "booking.cancel", $booking["booking_no"], $auth);
      pos_send(200, ["booking" => array_merge($booking, ["status" => "cancelled"])]);
    }
    if ($act === "checkin") {
      pos_q("UPDATE resort_bookings SET status='checked_in', checked_in_at=UTC_TIMESTAMP(3) WHERE id=? AND business_id=?", "ss", [$id, $bid]);
      pos_q("UPDATE resort_rooms SET physical_status='occupied' WHERE id=? AND business_id=?", "ss", [$booking["room_id"], $bid]);
      pos_resort_audit($bid, "booking.checkin", $booking["booking_no"], $auth);
      pos_send(200, ["booking" => array_merge($booking, ["status" => "checked_in"])]);
    }
    if ($act === "checkout") {
      $folio = pos_q("SELECT COALESCE(SUM(amount),0) n FROM resort_folio WHERE booking_id=? AND business_id=?", "ss", [$id, $bid]);
      $extra = pos_resort_num($folio[0]["n"] ?? 0);
      pos_q("UPDATE resort_bookings SET status='checked_out', checked_out_at=UTC_TIMESTAMP(3), due=GREATEST(0, total + ? - paid) WHERE id=? AND business_id=?", "dss", [$extra, $id, $bid]);
      pos_q("UPDATE resort_rooms SET physical_status='cleaning', hk_status='dirty' WHERE id=? AND business_id=?", "ss", [$booking["room_id"], $bid]);
      pos_resort_audit($bid, "booking.checkout", $booking["booking_no"], $auth);
      pos_send(200, ["booking" => array_merge($booking, ["status" => "checked_out"]), "invoice" => ["restaurant" => $extra]]);
    }
  }
  if ($path === "resort/folio" && $method === "POST") {
    $rows = pos_q("SELECT * FROM resort_bookings WHERE id=? AND business_id=?", "ss", [$body["booking_id"] ?? "", $bid]);
    $booking = $rows[0] ?? null;
    if (!$booking || !in_array($booking["status"], ["checked_in", "confirmed"], true)) {
      pos_send(403, ["error" => "Cannot post to this guest folio"]);
    }
    $amount = pos_resort_num($body["amount"] ?? $body["total"] ?? 0);
    pos_q(
      "INSERT INTO resort_folio (id, booking_id, room_id, kind, amount, note, ref_id, user_id, business_id) VALUES (?,?,?,?,?,?,?,?,?)",
      "ssssdssss",
      [pos_uuid(), $booking["id"], $booking["room_id"], pos_resort_clip($body["kind"] ?? "restaurant", 32), $amount, pos_resort_clip($body["note"] ?? $body["bill_no"] ?? "Restaurant", 255), pos_resort_clip($body["ref_id"] ?? "", 255), $auth["user"]["id"] ?? "", $bid]
    );
    pos_q("UPDATE resort_bookings SET due=due+? WHERE id=? AND business_id=?", "dss", [$amount, $booking["id"], $bid]);
    pos_send(200, ["charge" => ["booking_id" => $booking["id"], "amount" => $amount, "kind" => "restaurant"]]);
  }
  if ($path === "resort/housekeeping" && $method === "GET") {
    pos_send(200, ["rooms" => pos_resort_rooms($bid)]);
  }
  if ($path === "resort/housekeeping" && $method === "POST") {
    pos_q("UPDATE resort_rooms SET hk_status=?, physical_status=? WHERE id=? AND business_id=?", "ssss", [
      pos_resort_clip($body["hk_status"] ?? "ready", 32),
      pos_resort_clip($body["physical_status"] ?? "available", 32),
      $body["room_id"] ?? "",
      $bid,
    ]);
    pos_resort_audit($bid, "housekeeping", ($body["room_id"] ?? "") . " " . ($body["hk_status"] ?? ""), $auth);
    pos_send(200, ["ok" => true]);
  }
  if (strpos($path, "resort/reports/") === 0 && $method === "GET") {
    $rooms = pos_resort_rooms($bid);
    $bookings = pos_resort_decorate(pos_resort_bookings($bid), $rooms);
    $rows = [];
    foreach ($bookings as $b) {
      $rows[] = ["booking" => $b["booking_no"], "room" => $b["room_no"], "status" => $b["status"], "total" => $b["total"], "paid" => $b["paid"], "due" => $b["due"]];
    }
    pos_send(200, ["rows" => $rows]);
  }
  return false;
}
