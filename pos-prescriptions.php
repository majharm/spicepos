<?php
require_once __DIR__ . "/pos-qr-ordering.php";

function pos_rx_statuses() {
  return ["pending", "under_review", "approved", "order_created", "completed"];
}

function pos_rx_status_label($status) {
  $s = strtolower((string) $status);
  if ($s === "under_review") return "Under Review";
  if ($s === "approved") return "Approved";
  if ($s === "order_created") return "Order Created";
  if ($s === "completed") return "Dispensed";
  return "Pending";
}

function pos_rx_allowed($biz) {
  return function_exists("pos_shop_kind") && pos_shop_kind($biz ?: []) === "pharmacy";
}

function pos_rx_ensure_schema() {
  $db = pos_db();
  $db->query(
    "CREATE TABLE IF NOT EXISTS prescription_orders (
      id VARCHAR(255) PRIMARY KEY,
      prescription_number VARCHAR(32) NOT NULL,
      business_id VARCHAR(255) NOT NULL,
      branch_id VARCHAR(255) NULL,
      customer_name VARCHAR(160) NOT NULL,
      mobile VARCHAR(32) NOT NULL,
      customer_address VARCHAR(500) NULL,
      doctor_name VARCHAR(160) NULL,
      clinic_name VARCHAR(180) NULL,
      notes TEXT NULL,
      file_name VARCHAR(180) NULL,
      mime_type VARCHAR(80) NULL,
      file_path VARCHAR(500) NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_rx_number (business_id, prescription_number),
      INDEX idx_rx_business_status (business_id, status, created_at)
    )"
  );
  if ($db->errno) throw new Exception($db->error ?: "Could not prepare prescriptions");
  @$db->query("ALTER TABLE prescription_orders ADD COLUMN customer_address VARCHAR(500) NULL");
  @$db->query("ALTER TABLE prescription_orders ADD COLUMN doctor_name VARCHAR(160) NULL");
  @$db->query("ALTER TABLE prescription_orders ADD COLUMN clinic_name VARCHAR(180) NULL");
}

function pos_rx_dir($bid) {
  $safe = preg_replace("/[^a-zA-Z0-9_-]/", "", (string) $bid);
  if ($safe === "") $safe = "shop";
  $dir = __DIR__ . "/uploads/prescriptions/" . $safe;
  if (!is_dir($dir)) @mkdir($dir, 0775, true);
  return $dir;
}

function pos_rx_ext($mime) {
  if ($mime === "image/jpeg" || $mime === "image/jpg") return "jpg";
  if ($mime === "image/png") return "png";
  if ($mime === "image/webp") return "webp";
  if ($mime === "application/pdf") return "pdf";
  return "";
}

function pos_rx_validate($body) {
  $name = pos_qr_clean($body["customer_name"] ?? $body["customerName"] ?? "", 160);
  $mobile = preg_replace('/[^\d+]/', '', pos_qr_clean($body["mobile"] ?? "", 32));
  $address = pos_qr_clean($body["customer_address"] ?? $body["customerAddress"] ?? $body["address"] ?? "", 500);
  $doctor = pos_qr_clean($body["doctor_name"] ?? $body["doctorName"] ?? "", 160);
  $clinic = pos_qr_clean($body["clinic_name"] ?? $body["clinicName"] ?? $body["hospital_name"] ?? $body["hospitalName"] ?? "", 180);
  $notes = pos_qr_clean($body["notes"] ?? $body["message"] ?? "", 1000);
  $fileName = pos_qr_clean($body["file_name"] ?? $body["fileName"] ?? "prescription", 180);
  $mime = strtolower(pos_qr_clean($body["mime"] ?? $body["mime_type"] ?? $body["mimeType"] ?? "", 80));
  if ($mime === "image/jpg") $mime = "image/jpeg";
  $data = (string) ($body["file_base64"] ?? $body["fileBase64"] ?? $body["file"] ?? "");
  $data = preg_replace("#^data:[^;]+;base64,#", "", $data);
  if ($name === "") throw new Exception("Customer name is required");
  if (strlen(preg_replace("/\D/", "", $mobile)) < 10) throw new Exception("Valid mobile number is required");
  if ($address === "") throw new Exception("Customer address is required");
  if ($doctor === "") throw new Exception("Doctor name is required");
  if (pos_rx_ext($mime) === "") throw new Exception("Upload a camera photo, gallery image, or PDF");
  if ($data === "") throw new Exception("Upload a prescription photo or PDF");
  $bin = base64_decode($data, true);
  if ($bin === false || $bin === "") throw new Exception("Could not read the uploaded file");
  if (strlen($bin) > 8 * 1024 * 1024) throw new Exception("File is too large (max 8 MB)");
  return [
    "customer_name" => $name,
    "mobile" => $mobile,
    "customer_address" => $address,
    "doctor_name" => $doctor,
    "clinic_name" => $clinic,
    "notes" => $notes,
    "file_name" => $fileName,
    "mime" => $mime,
    "bin" => $bin,
  ];
}

function pos_rx_public_row($row) {
  if (!$row) return null;
  unset($row["file_path"]);
  $row["status_label"] = pos_rx_status_label($row["status"] ?? "pending");
  $row["has_file"] = true;
  return $row;
}

function pos_rx_list($bid, $status = "") {
  pos_rx_ensure_schema();
  $status = strtolower(pos_qr_clean($status, 24));
  if ($status !== "" && in_array($status, pos_rx_statuses(), true)) {
    return pos_q(
      "SELECT * FROM prescription_orders WHERE business_id = ? AND status = ?
       ORDER BY created_at DESC LIMIT 200",
      "ss",
      [$bid, $status]
    );
  }
  return pos_q(
    "SELECT * FROM prescription_orders WHERE business_id = ?
     ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'under_review' THEN 1 WHEN 'approved' THEN 2
       WHEN 'order_created' THEN 3 ELSE 4 END, created_at DESC LIMIT 200",
    "s",
    [$bid]
  );
}

function pos_rx_public_dispatch($path, $method, $body) {
  if ($path === "rx/shop" && $method === "GET") {
    pos_rx_ensure_schema();
    require_once __DIR__ . "/pos-qr-ordering.php";
    $business = pos_qr_business($_GET["shop"] ?? "");
    if (!$business) pos_send(404, ["error" => "Pharmacy not found", "php" => true]);
    if (!pos_rx_allowed($business)) pos_send(403, ["error" => "Prescription upload is only for pharmacy shops", "php" => true]);
    pos_send(200, [
      "shop" => [
        "id" => $business["id"],
        "code" => $business["code"],
        "name" => $business["company_name"] ?: $business["name"],
        "address" => $business["company_address"] ?: ($business["address"] ?? ""),
        "phone" => $business["company_phone"] ?: ($business["mobile"] ?? ""),
        "logo_url" => $business["company_logo"] ?: ($business["logo_url"] ?? ""),
      ],
      "php" => true,
    ]);
  }
  if ($path === "rx/prescriptions" && $method === "POST") {
    pos_rx_ensure_schema();
    require_once __DIR__ . "/pos-qr-ordering.php";
    $input = pos_rx_validate(is_array($body) ? $body : []);
    $business = pos_qr_business($body["shop"] ?? "");
    if (!$business) pos_send(404, ["error" => "Pharmacy not found", "php" => true]);
    if (!pos_rx_allowed($business)) pos_send(403, ["error" => "Prescription upload is only for pharmacy shops", "php" => true]);
    $id = pos_uuid();
    $n = function_exists("pos_next_seq") ? pos_next_seq("prescription", $business["id"], 1001) : (1000 + random_int(1, 99));
    $number = "PR-" . $n;
    $ext = pos_rx_ext($input["mime"]);
    $dir = pos_rx_dir($business["id"]);
    $rel = "uploads/prescriptions/" . basename($dir) . "/" . $id . "." . $ext;
    if (@file_put_contents($dir . "/" . $id . "." . $ext, $input["bin"]) === false) {
      throw new Exception("Could not save the prescription file");
    }
    pos_q(
      "INSERT INTO prescription_orders
       (id, prescription_number, business_id, customer_name, mobile, customer_address, doctor_name, clinic_name, notes, file_name, mime_type, file_path, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pending')",
      "ssssssssssss",
      [$id, $number, $business["id"], $input["customer_name"], $input["mobile"], $input["customer_address"], $input["doctor_name"], $input["clinic_name"], $input["notes"], $input["file_name"], $input["mime"], $rel]
    );
    pos_send(201, [
      "ok" => true,
      "prescription" => ["id" => $id, "prescription_number" => $number, "status" => "pending"],
      "message" => "Prescription submitted successfully. Pharmacy will review it and contact you.",
      "php" => true,
    ]);
  }
  return false;
}

function pos_rx_staff_dispatch($path, $method, $body, $bid, $branchId, $uid = "") {
  require_once __DIR__ . "/pos-qr-ordering.php";
  pos_rx_ensure_schema();
  $bizRows = [];
  try {
    $bizRows = pos_q("SELECT name, category, business_type FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]);
  } catch (Exception $e) { $bizRows = []; }
  if (!pos_rx_allowed($bizRows[0] ?? [])) {
    pos_send(403, ["error" => "Prescriptions are only for pharmacy shops", "php" => true]);
  }
  if ($path === "prescriptions" && $method === "GET") {
    $status = strtolower(pos_qr_clean($_GET["status"] ?? "", 24));
    $rows = pos_rx_list($bid, $status);
    $out = [];
    foreach ($rows as $row) $out[] = pos_rx_public_row($row);
    pos_send(200, $out);
  }
  if (preg_match('#^prescriptions/([^/]+)/file$#', $path, $m) && $method === "GET") {
    $rows = pos_q("SELECT * FROM prescription_orders WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$m[1], $bid]);
    $row = $rows[0] ?? null;
    if (!$row) pos_send(404, ["error" => "Prescription not found", "php" => true]);
    $rel = str_replace("\\", "/", (string) ($row["file_path"] ?? ""));
    if (strpos($rel, "uploads/prescriptions/") !== 0) pos_send(404, ["error" => "File not found", "php" => true]);
    $abs = realpath(__DIR__ . "/" . $rel);
    $base = realpath(__DIR__ . "/uploads/prescriptions");
    if (!$abs || !$base || strpos($abs, $base) !== 0 || !is_file($abs)) pos_send(404, ["error" => "File not found", "php" => true]);
    header("Cache-Control: no-store");
    header("Content-Type: " . ($row["mime_type"] ?: "application/octet-stream"));
    header('Content-Disposition: inline; filename="' . str_replace('"', "", $row["file_name"] ?: "prescription") . '"');
    readfile($abs);
    exit;
  }
  if (preg_match('#^prescriptions/([^/]+)$#', $path, $m) && $method === "PATCH") {
    $status = strtolower(pos_qr_clean($body["status"] ?? "", 24));
    if (!in_array($status, pos_rx_statuses(), true)) pos_send(400, ["error" => "Invalid prescription status", "php" => true]);
    pos_q("UPDATE prescription_orders SET status = ? WHERE id = ? AND business_id = ?", "sss", [$status, $m[1], $bid]);
    $rows = pos_q("SELECT * FROM prescription_orders WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$m[1], $bid]);
    if (!$rows) pos_send(404, ["error" => "Prescription not found", "php" => true]);
    pos_send(200, ["ok" => true, "prescription" => pos_rx_public_row($rows[0]), "php" => true]);
  }
  return false;
}
