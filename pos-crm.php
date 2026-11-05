<?php
/** CRM on the PHP fallback. Profiles link the customer master and never copy it. */

function pos_crm_ensure() {
  static $done = false;
  if ($done) return;
  $done = true;
  if (function_exists("pos_ensure_columns")) {
    pos_ensure_columns("company_settings", ["crm_enabled" => "TINYINT(1) NOT NULL DEFAULT 0"]);
  }
  $tables = [
    "CREATE TABLE IF NOT EXISTS crm_lead_sources (id VARCHAR(36) PRIMARY KEY, business_id VARCHAR(36) NOT NULL, name VARCHAR(80) NOT NULL, active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE KEY uq_crm_source (business_id, name))",
    "CREATE TABLE IF NOT EXISTS crm_pipeline_stages (id VARCHAR(36) PRIMARY KEY, business_id VARCHAR(36) NOT NULL, stage_key VARCHAR(24) NOT NULL, label VARCHAR(80) NOT NULL, sort_order INT NOT NULL DEFAULT 0, is_won TINYINT(1) NOT NULL DEFAULT 0, is_lost TINYINT(1) NOT NULL DEFAULT 0, UNIQUE KEY uq_crm_stage (business_id, stage_key))",
    "CREATE TABLE IF NOT EXISTS crm_customer_segments (id VARCHAR(36) PRIMARY KEY, business_id VARCHAR(36) NOT NULL, name VARCHAR(80) NOT NULL, rule_json TEXT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE KEY uq_crm_segment (business_id, name))",
    "CREATE TABLE IF NOT EXISTS crm_customers (id VARCHAR(36) PRIMARY KEY, business_id VARCHAR(36) NOT NULL, branch_id VARCHAR(36) NULL, customer_id VARCHAR(36) NOT NULL, assigned_to VARCHAR(36) NULL, segment_id VARCHAR(36) NULL, source_id VARCHAR(36) NULL, sms_consent TINYINT(1) NOT NULL DEFAULT 0, email_consent TINYINT(1) NOT NULL DEFAULT 0, custom_json TEXT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), UNIQUE KEY uq_crm_customer (business_id, customer_id), INDEX (business_id, assigned_to))",
    "CREATE TABLE IF NOT EXISTS crm_leads (id VARCHAR(36) PRIMARY KEY, business_id VARCHAR(36) NOT NULL, branch_id VARCHAR(36) NULL, name VARCHAR(180) NOT NULL, mobile VARCHAR(32) NULL, email VARCHAR(160) NULL, company_name VARCHAR(180) NULL, gstin VARCHAR(32) NULL, source_id VARCHAR(36) NULL, stage VARCHAR(24) NOT NULL DEFAULT 'new', priority VARCHAR(16) NOT NULL DEFAULT 'normal', assigned_to VARCHAR(36) NULL, customer_id VARCHAR(36) NULL, expected_value DECIMAL(14,2) NOT NULL DEFAULT 0, notes VARCHAR(1000) NULL, custom_json TEXT NULL, next_followup DATE NULL, created_by VARCHAR(36) NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), INDEX (business_id, stage))",
    "CREATE TABLE IF NOT EXISTS crm_contacts (id VARCHAR(36) PRIMARY KEY, business_id VARCHAR(36) NOT NULL, customer_id VARCHAR(36) NULL, lead_id VARCHAR(36) NULL, name VARCHAR(180) NOT NULL, role_name VARCHAR(80) NULL, mobile VARCHAR(32) NULL, email VARCHAR(160) NULL, address VARCHAR(500) NULL, is_primary TINYINT(1) NOT NULL DEFAULT 0, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (business_id, customer_id))",
    "CREATE TABLE IF NOT EXISTS crm_followups (id VARCHAR(36) PRIMARY KEY, business_id VARCHAR(36) NOT NULL, branch_id VARCHAR(36) NULL, customer_id VARCHAR(36) NULL, lead_id VARCHAR(36) NULL, assigned_to VARCHAR(36) NULL, kind VARCHAR(24) NOT NULL DEFAULT 'call', due_on DATE NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending', note VARCHAR(500) NULL, completed_at TIMESTAMP(3) NULL, created_by VARCHAR(36) NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX (business_id, due_on, status))",
    "CREATE TABLE IF NOT EXISTS crm_tasks (id VARCHAR(36) PRIMARY KEY, business_id VARCHAR(36) NOT NULL, branch_id VARCHAR(36) NULL, title VARCHAR(180) NOT NULL, assigned_to VARCHAR(36) NULL, customer_id VARCHAR(36) NULL, lead_id VARCHAR(36) NULL, due_on DATE NULL, status VARCHAR(16) NOT NULL DEFAULT 'open', priority VARCHAR(16) NOT NULL DEFAULT 'normal', created_by VARCHAR(36) NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))",
    "CREATE TABLE IF NOT EXISTS crm_activities (id VARCHAR(36) PRIMARY KEY, business_id VARCHAR(36) NOT NULL, customer_id VARCHAR(36) NULL, lead_id VARCHAR(36) NULL, actor_id VARCHAR(36) NULL, kind VARCHAR(32) NOT NULL, summary VARCHAR(255) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))",
    "CREATE TABLE IF NOT EXISTS crm_notes (id VARCHAR(36) PRIMARY KEY, business_id VARCHAR(36) NOT NULL, customer_id VARCHAR(36) NULL, lead_id VARCHAR(36) NULL, author_id VARCHAR(36) NULL, body VARCHAR(2000) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))",
    "CREATE TABLE IF NOT EXISTS crm_quotations (id VARCHAR(36) PRIMARY KEY, business_id VARCHAR(36) NOT NULL, customer_id VARCHAR(36) NULL, lead_id VARCHAR(36) NULL, quotation_id VARCHAR(36) NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE KEY uq_crm_quote (business_id, quotation_id))",
    "CREATE TABLE IF NOT EXISTS crm_communication_logs (id VARCHAR(36) PRIMARY KEY, business_id VARCHAR(36) NOT NULL, customer_id VARCHAR(36) NULL, lead_id VARCHAR(36) NULL, channel VARCHAR(16) NOT NULL, template_key VARCHAR(32) NULL, recipient VARCHAR(160) NOT NULL, body TEXT NULL, status VARCHAR(16) NOT NULL, error VARCHAR(255) NULL, attempts INT NOT NULL DEFAULT 0, dedupe_key VARCHAR(191) NULL, provider_message_id VARCHAR(128) NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), sent_at TIMESTAMP(3) NULL, INDEX (business_id, dedupe_key))",
    "CREATE TABLE IF NOT EXISTS crm_support_tickets (id VARCHAR(36) PRIMARY KEY, business_id VARCHAR(36) NOT NULL, branch_id VARCHAR(36) NULL, customer_id VARCHAR(36) NULL, subject VARCHAR(180) NOT NULL, body VARCHAR(2000) NULL, status VARCHAR(16) NOT NULL DEFAULT 'open', priority VARCHAR(16) NOT NULL DEFAULT 'normal', assigned_to VARCHAR(36) NULL, created_by VARCHAR(36) NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3))",
    "CREATE TABLE IF NOT EXISTS crm_reminders (id VARCHAR(36) PRIMARY KEY, business_id VARCHAR(36) NOT NULL, customer_id VARCHAR(36) NULL, assigned_to VARCHAR(36) NULL, kind VARCHAR(32) NOT NULL, due_on DATE NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending', note VARCHAR(500) NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))",
    "CREATE TABLE IF NOT EXISTS crm_automations (id VARCHAR(36) PRIMARY KEY, business_id VARCHAR(36) NOT NULL, auto_key VARCHAR(32) NOT NULL, enabled TINYINT(1) NOT NULL DEFAULT 0, channel VARCHAR(16) NOT NULL DEFAULT 'whatsapp', template TEXT NULL, wait_days INT NOT NULL DEFAULT 0, UNIQUE KEY uq_crm_auto (business_id, auto_key))",
  ];
  foreach ($tables as $sql) pos_q($sql);
}

function pos_crm_on($bid) {
  pos_crm_ensure();
  $rows = pos_q("SELECT crm_enabled FROM company_settings WHERE business_id = ? LIMIT 1", "s", [$bid]);
  $flag = $rows[0]["crm_enabled"] ?? 0;
  if (!($flag === 1 || $flag === "1" || $flag === true)) {
    throw new Exception("Turn on Enable CRM in Business Settings before using CRM.");
  }
}

function pos_crm_seed($bid) {
  pos_crm_ensure();
  $stages = [
    ["new", "New Lead", 1, 0, 0], ["contacted", "Contacted", 2, 0, 0], ["interested", "Interested", 3, 0, 0],
    ["quotation", "Quotation Sent", 4, 0, 0], ["negotiation", "Negotiation", 5, 0, 0], ["converted", "Converted", 6, 1, 0], ["lost", "Lost", 7, 0, 1],
  ];
  if (!pos_q("SELECT id FROM crm_pipeline_stages WHERE business_id = ? LIMIT 1", "s", [$bid])) {
    foreach ($stages as $stage) {
      pos_q("INSERT INTO crm_pipeline_stages (id, business_id, stage_key, label, sort_order, is_won, is_lost) VALUES (?,?,?,?,?,?,?)", "ssssiii", [pos_uuid(), $bid, $stage[0], $stage[1], $stage[2], $stage[3], $stage[4]]);
    }
  }
  if (!pos_q("SELECT id FROM crm_lead_sources WHERE business_id = ? LIMIT 1", "s", [$bid])) {
    foreach (["Walk-in", "Phone", "WhatsApp", "Website", "Referral", "Campaign"] as $name) {
      pos_q("INSERT INTO crm_lead_sources (id, business_id, name) VALUES (?,?,?)", "sss", [pos_uuid(), $bid, $name]);
    }
  }
  if (!pos_q("SELECT id FROM crm_customer_segments WHERE business_id = ? LIMIT 1", "s", [$bid])) {
    foreach (["Retail", "Wholesale", "VIP", "Inactive"] as $name) {
      pos_q("INSERT INTO crm_customer_segments (id, business_id, name) VALUES (?,?,?)", "sss", [pos_uuid(), $bid, $name]);
    }
  }
  if (!pos_q("SELECT id FROM crm_automations WHERE business_id = ? LIMIT 1", "s", [$bid])) {
    $autos = [
      ["welcome", "whatsapp", "Hello {{name}}, welcome to {{shop}}. Reply STOP to opt out of WhatsApp messages.", 0],
      ["birthday", "whatsapp", "Happy birthday {{name}}. {{shop}} wishes you a wonderful day.", 0],
      ["payment", "whatsapp", "{{name}}, this is {{shop}}. ₹{{due}} is still outstanding.", 1],
      ["quotation", "whatsapp", "{{name}}, quotation {{number}} from {{shop}} is ready.", 2],
      ["order", "whatsapp", "{{name}}, {{shop}} confirmed {{number}} for ₹{{total}}.", 0],
      ["invoice", "whatsapp", "{{name}}, invoice {{number}} from {{shop}} is ₹{{total}}.", 0],
      ["feedback", "whatsapp", "{{name}}, thank you for visiting {{shop}}.", 1],
      ["revisit", "whatsapp", "{{name}}, we miss you at {{shop}}.", 30],
      ["daily", "whatsapp", "{{shop}} today: ₹{{total}} across {{count}} bills.", 0],
    ];
    foreach ($autos as $auto) {
      pos_q("INSERT INTO crm_automations (id, business_id, auto_key, enabled, channel, template, wait_days) VALUES (?,?,?,0,?,?,?)", "sssssi", [pos_uuid(), $bid, $auto[0], $auto[1], $auto[2], $auto[3]]);
    }
  }
}

function pos_crm_clip($value, $max) {
  return substr(trim((string) $value), 0, $max);
}

function pos_crm_allows($person, $channel) {
  $opt = (int) ($person["whatsapp_opt_out"] ?? 0) === 1;
  if ($channel === "whatsapp") return !$opt && (int) ($person["whatsapp_consent"] ?? 0) === 1;
  if ($channel === "sms") return (int) ($person["sms_consent"] ?? 0) === 1;
  if ($channel === "email") return (int) ($person["email_consent"] ?? 0) === 1 && strpos((string) ($person["email"] ?? ""), "@") !== false;
  return false;
}

function pos_crm_template($template, $vars) {
  return trim(preg_replace_callback('/\{\{\s*([a-z0-9_]+)\s*\}\}/i', function ($m) use ($vars) {
    return (string) ($vars[$m[1]] ?? "");
  }, (string) $template));
}

function pos_crm_link($bid, $customerId) {
  $rows = pos_q("SELECT id FROM crm_customers WHERE business_id = ? AND customer_id = ? LIMIT 1", "ss", [$bid, $customerId]);
  if (!empty($rows[0]["id"])) return $rows[0]["id"];
  $id = pos_uuid();
  pos_q("INSERT INTO crm_customers (id, business_id, customer_id) VALUES (?,?,?)", "sss", [$id, $bid, $customerId]);
  return $id;
}

function pos_crm_deliver($bid, $person, $channel, $key, $body, $dedupe, $recipient) {
  $prior = pos_q("SELECT status, error FROM crm_communication_logs WHERE business_id = ? AND dedupe_key = ? ORDER BY created_at DESC LIMIT 1", "ss", [$bid, $dedupe]);
  if (!empty($prior[0])) {
    $status = $prior[0]["status"] ?? "";
    if (in_array($status, ["sent", "queued", "skipped"], true)) return ["ok" => true, "skipped" => true];
    $fails = pos_q("SELECT COUNT(*) AS n FROM crm_communication_logs WHERE business_id = ? AND dedupe_key = ? AND status = 'failed'", "ss", [$bid, $dedupe]);
    $temporary = preg_match("/timeout|network|temporar|rate|429|503/i", (string) ($prior[0]["error"] ?? ""));
    if ((int) ($fails[0]["n"] ?? 0) >= 3 || !$temporary) return ["ok" => false, "skipped" => true];
  }
  $status = "failed";
  $error = "";
  if (!pos_crm_allows($person, $channel)) {
    $status = "skipped";
    $error = "Customer has not consented";
  } elseif ($channel === "whatsapp" && function_exists("pos_wa_send") && function_exists("pos_alert_settings")) {
    $sent = pos_wa_send(pos_alert_settings(), [$recipient], $body);
    $status = !empty($sent["ok"]) ? "sent" : "failed";
    $error = !empty($sent["ok"]) ? "" : pos_crm_clip($sent["reason"] ?? ($sent["error"] ?? "WhatsApp was not sent"), 255);
  } elseif ($channel === "sms") {
    $error = "SMS provider is not configured";
  } else {
    $error = "Email was not sent";
  }
  pos_q(
    "INSERT INTO crm_communication_logs (id, business_id, customer_id, channel, template_key, recipient, body, status, error, attempts, dedupe_key, sent_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)",
    "sssssssssss",
    [pos_uuid(), $bid, (string) ($person["id"] ?? ""), $channel, $key, pos_crm_clip($recipient, 160), pos_crm_clip($body, 4000), $status, $error, $dedupe, $status === "sent" ? date("Y-m-d H:i:s") : ""]
  );
  return ["ok" => $status === "sent", "status" => $status, "error" => $error];
}

function pos_crm_automation_tick() {
  pos_crm_ensure();
  $shops = pos_q("SELECT business_id FROM company_settings WHERE crm_enabled = 1 LIMIT 100");
  $sent = 0;
  foreach ($shops as $shop) {
    $bid = $shop["business_id"] ?? "";
    if ($bid === "") continue;
    try {
      pos_crm_seed($bid);
      $biz = pos_q("SELECT name, mobile FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]);
      $name = $biz[0]["name"] ?? "Shop";
      $autos = pos_q("SELECT * FROM crm_automations WHERE business_id = ? AND enabled = 1", "s", [$bid]);
      $by = [];
      foreach ($autos as $auto) $by[$auto["auto_key"]] = $auto;
      $today = date("Y-m-d");
      if (!empty($by["payment"])) {
        $rows = pos_q("SELECT id, name, mobile, email, whatsapp_consent, whatsapp_opt_out, outstanding FROM customers WHERE business_id = ? AND outstanding > 0.5 LIMIT 40", "s", [$bid]);
        foreach ($rows as $row) {
          $result = pos_crm_deliver($bid, $row, $by["payment"]["channel"], "payment", pos_crm_template($by["payment"]["template"], ["name" => $row["name"], "shop" => $name, "due" => number_format((float) $row["outstanding"], 2, ".", "")]), "payment:" . $row["id"] . ":" . $today, $row["mobile"] ?? "");
          if (!empty($result["ok"])) $sent++;
        }
      }
      if (!empty($by["birthday"])) {
        $rows = pos_q("SELECT id, name, mobile, email, whatsapp_consent, whatsapp_opt_out, dob FROM customers WHERE business_id = ? AND dob IS NOT NULL LIMIT 200", "s", [$bid]);
        foreach ($rows as $row) {
          if (substr((string) $row["dob"], 5, 5) !== substr($today, 5, 5)) continue;
          $result = pos_crm_deliver($bid, $row, $by["birthday"]["channel"], "birthday", pos_crm_template($by["birthday"]["template"], ["name" => $row["name"], "shop" => $name]), "birthday:" . $row["id"] . ":" . substr($today, 0, 4), $row["mobile"] ?? "");
          if (!empty($result["ok"])) $sent++;
        }
      }
    } catch (Throwable $e) {
      error_log("crm tick: " . $e->getMessage());
    }
  }
  return ["shops" => count($shops), "sent" => $sent];
}

function pos_crm_dispatch($path, $method, $body, $bid, $auth) {
  if (strpos($path, "crm") !== 0) return false;
  $uid = $auth["user"]["id"] ?? "";
  try {
    pos_crm_ensure();
    if ($path === "crm/bootstrap" && $method === "GET") {
      pos_crm_on($bid);
      pos_crm_seed($bid);
      $shop = pos_q("SELECT b.name, b.category FROM businesses b WHERE b.id = ? LIMIT 1", "s", [$bid]);
      pos_send(200, [
        "shop" => $shop[0]["name"] ?? "",
        "category" => $shop[0]["category"] ?? "retail",
        "sources" => pos_q("SELECT id, name FROM crm_lead_sources WHERE business_id = ? ORDER BY name", "s", [$bid]),
        "stages" => pos_q("SELECT stage_key AS `key`, label, sort_order, is_won, is_lost FROM crm_pipeline_stages WHERE business_id = ? ORDER BY sort_order", "s", [$bid]),
        "segments" => pos_q("SELECT id, name FROM crm_customer_segments WHERE business_id = ? ORDER BY name", "s", [$bid]),
        "automations" => pos_q("SELECT auto_key AS `key`, enabled, channel, template, wait_days FROM crm_automations WHERE business_id = ?", "s", [$bid]),
        "staff" => pos_q("SELECT id, role, COALESCE(NULLIF(TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))), ''), NULLIF(email, ''), username) AS name FROM staff_users WHERE business_id = ? ORDER BY first_name, last_name LIMIT 200", "s", [$bid]),
        "kpis" => [
          "customers" => (int) (pos_q("SELECT COUNT(*) AS n FROM customers WHERE business_id = ? AND merged_into IS NULL", "s", [$bid])[0]["n"] ?? 0),
          "leads" => (int) (pos_q("SELECT COUNT(*) AS n FROM crm_leads WHERE business_id = ? AND stage NOT IN ('converted','lost')", "s", [$bid])[0]["n"] ?? 0),
          "followups" => (int) (pos_q("SELECT COUNT(*) AS n FROM crm_followups WHERE business_id = ? AND status = 'pending'", "s", [$bid])[0]["n"] ?? 0),
          "outstanding" => (float) (pos_q("SELECT COALESCE(SUM(outstanding),0) AS n FROM customers WHERE business_id = ?", "s", [$bid])[0]["n"] ?? 0),
        ],
        "php" => true,
      ]);
    }
    if ($path === "crm/leads" && $method === "GET") {
      pos_crm_on($bid);
      pos_send(200, ["leads" => pos_q("SELECT * FROM crm_leads WHERE business_id = ? ORDER BY updated_at DESC LIMIT 300", "s", [$bid]), "php" => true]);
    }
    if ($path === "crm/leads" && $method === "POST") {
      pos_crm_on($bid);
      $name = pos_crm_clip($body["name"] ?? "", 180);
      if ($name === "") throw new Exception("Enter the lead name");
      $id = pos_uuid();
      pos_q(
        "INSERT INTO crm_leads (id, business_id, name, mobile, email, company_name, stage, priority, assigned_to, expected_value, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        "sssssssssdss",
        [$id, $bid, $name, pos_crm_clip($body["mobile"] ?? "", 32), pos_crm_clip($body["email"] ?? "", 160), pos_crm_clip($body["company_name"] ?? "", 180), "new", pos_crm_clip($body["priority"] ?? "normal", 16), pos_crm_clip($body["assigned_to"] ?? "", 36), (float) ($body["expected_value"] ?? 0), pos_crm_clip($body["notes"] ?? "", 1000), $uid]
      );
      pos_send(200, ["ok" => true, "lead" => pos_q("SELECT * FROM crm_leads WHERE id = ? AND business_id = ?", "ss", [$id, $bid])[0] ?? ["id" => $id], "php" => true]);
    }
    if (preg_match("#^crm/leads/([^/]+)/stage$#", $path, $m) && $method === "POST") {
      pos_crm_on($bid);
      $stage = pos_crm_clip($body["stage"] ?? "new", 24);
      pos_q("UPDATE crm_leads SET stage = ? WHERE id = ? AND business_id = ?", "sss", [$stage, $m[1], $bid]);
      pos_send(200, ["ok" => true, "stage" => $stage, "php" => true]);
    }
    if (preg_match("#^crm/leads/([^/]+)/convert$#", $path, $m) && $method === "POST") {
      pos_crm_on($bid);
      $lead = pos_q("SELECT * FROM crm_leads WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$m[1], $bid])[0] ?? null;
      if (!$lead) pos_send(404, ["error" => "Lead not found", "php" => true]);
      if (!empty($lead["customer_id"])) pos_send(200, ["ok" => true, "customerId" => $lead["customer_id"], "linked" => true, "php" => true]);
      $mobile = preg_replace("/\D/", "", (string) ($lead["mobile"] ?? ""));
      $match = $mobile !== "" ? (pos_q("SELECT id FROM customers WHERE business_id = ? AND REPLACE(REPLACE(mobile,' ',''),'-','') LIKE ? LIMIT 1", "ss", [$bid, "%" . substr($mobile, -10)])[0] ?? null) : null;
      $customerId = $match["id"] ?? "";
      if ($customerId === "") {
        if ($mobile === "") throw new Exception("Add a mobile number before converting this lead");
        $customerId = pos_uuid();
        $count = (int) (pos_q("SELECT COUNT(*) AS n FROM customers WHERE business_id = ?", "s", [$bid])[0]["n"] ?? 0);
        pos_q(
          "INSERT INTO customers (id, code, name, business_name, mobile, type, gstin, credit_limit, outstanding, business_id) VALUES (?,?,?,?,?,'b2c',?,0,0,?)",
          "sssssss",
          [$customerId, "CUS-" . str_pad((string) ($count + 1), 3, "0", STR_PAD_LEFT), $lead["name"], $lead["company_name"] ?? "", $lead["mobile"] ?? "", $lead["gstin"] ?? "", $bid]
        );
      }
      pos_crm_link($bid, $customerId);
      pos_q("UPDATE crm_leads SET stage = 'converted', customer_id = ? WHERE id = ? AND business_id = ?", "sss", [$customerId, $lead["id"], $bid]);
      pos_send(200, ["ok" => true, "customerId" => $customerId, "linked" => (bool) $match, "php" => true]);
    }
    if ($path === "crm/customers" && $method === "GET") {
      pos_crm_on($bid);
      pos_send(200, ["customers" => pos_q("SELECT c.id, c.code, c.name, c.business_name, c.mobile, c.email, c.gstin, c.outstanding, c.credit_limit, c.whatsapp_consent, c.whatsapp_opt_out, p.assigned_to, p.sms_consent, p.email_consent, p.custom_json FROM customers c LEFT JOIN crm_customers p ON p.customer_id = c.id AND p.business_id = c.business_id WHERE c.business_id = ? AND c.merged_into IS NULL ORDER BY c.name LIMIT 300", "s", [$bid]), "php" => true]);
    }
    if (preg_match("#^crm/customers/([^/]+)$#", $path, $m) && $method === "GET") {
      pos_crm_on($bid);
      $customer = pos_q("SELECT * FROM customers WHERE id = ? AND business_id = ? LIMIT 1", "ss", [$m[1], $bid])[0] ?? null;
      if (!$customer) pos_send(404, ["error" => "Customer not found", "php" => true]);
      pos_crm_link($bid, $customer["id"]);
      $orders = pos_q("SELECT id, order_number, total, amount_paid, payment_status, created_at FROM sales_orders WHERE business_id = ? AND customer_id = ? ORDER BY created_at DESC LIMIT 20", "ss", [$bid, $customer["id"]]);
      pos_send(200, [
        "customer" => $customer,
        "profile" => pos_q("SELECT * FROM crm_customers WHERE business_id = ? AND customer_id = ? LIMIT 1", "ss", [$bid, $customer["id"]])[0] ?? [],
        "orders" => $orders,
        "quotes" => pos_q("SELECT id, quotation_number, status, total, valid_until, quotation_date FROM quotations WHERE business_id = ? AND customer_id = ? ORDER BY quotation_date DESC LIMIT 20", "ss", [$bid, $customer["id"]]),
        "contacts" => pos_q("SELECT * FROM crm_contacts WHERE business_id = ? AND customer_id = ?", "ss", [$bid, $customer["id"]]),
        "notes" => pos_q("SELECT * FROM crm_notes WHERE business_id = ? AND customer_id = ? ORDER BY created_at DESC LIMIT 30", "ss", [$bid, $customer["id"]]),
        "followups" => pos_q("SELECT * FROM crm_followups WHERE business_id = ? AND customer_id = ? ORDER BY due_on DESC LIMIT 30", "ss", [$bid, $customer["id"]]),
        "tickets" => pos_q("SELECT * FROM crm_support_tickets WHERE business_id = ? AND customer_id = ? ORDER BY created_at DESC LIMIT 20", "ss", [$bid, $customer["id"]]),
        "logs" => pos_q("SELECT channel, template_key, status, error, body, created_at FROM crm_communication_logs WHERE business_id = ? AND customer_id = ? ORDER BY created_at DESC LIMIT 30", "ss", [$bid, $customer["id"]]),
        "php" => true,
      ]);
    }
    if (preg_match("#^crm/customers/([^/]+)$#", $path, $m) && $method === "POST") {
      pos_crm_on($bid);
      pos_crm_link($bid, $m[1]);
      pos_q("UPDATE crm_customers SET assigned_to = ?, sms_consent = ?, email_consent = ?, custom_json = ? WHERE business_id = ? AND customer_id = ?", "siisss", [pos_crm_clip($body["assigned_to"] ?? "", 36), !empty($body["sms_consent"]) ? 1 : 0, !empty($body["email_consent"]) ? 1 : 0, json_encode($body["custom"] ?? []), $bid, $m[1]]);
      if (array_key_exists("whatsapp_consent", $body) || array_key_exists("whatsapp_opt_out", $body)) {
        pos_q("UPDATE customers SET whatsapp_consent = ?, whatsapp_opt_out = ? WHERE id = ? AND business_id = ?", "iiss", [!empty($body["whatsapp_consent"]) ? 1 : 0, !empty($body["whatsapp_opt_out"]) ? 1 : 0, $m[1], $bid]);
      }
      pos_send(200, ["ok" => true, "php" => true]);
    }
    if ($path === "crm/followups" && $method === "GET") {
      pos_crm_on($bid);
      pos_send(200, ["followups" => pos_q("SELECT * FROM crm_followups WHERE business_id = ? ORDER BY due_on ASC LIMIT 300", "s", [$bid]), "php" => true]);
    }
    if ($path === "crm/followups" && $method === "POST") {
      pos_crm_on($bid);
      $due = substr((string) ($body["due_on"] ?? ""), 0, 10);
      if (!preg_match("/^\d{4}-\d{2}-\d{2}$/", $due)) throw new Exception("Choose a follow-up date");
      $id = pos_uuid();
      pos_q("INSERT INTO crm_followups (id, business_id, customer_id, lead_id, assigned_to, kind, due_on, note, created_by) VALUES (?,?,?,?,?,?,?,?,?)", "sssssssss", [$id, $bid, pos_crm_clip($body["customer_id"] ?? "", 36), pos_crm_clip($body["lead_id"] ?? "", 36), pos_crm_clip($body["assigned_to"] ?? $uid, 36), pos_crm_clip($body["kind"] ?? "call", 24), $due, pos_crm_clip($body["note"] ?? "", 500), $uid]);
      pos_q("INSERT INTO crm_reminders (id, business_id, customer_id, assigned_to, kind, due_on, note) VALUES (?,?,?,?,?,?,?)", "sssssss", [pos_uuid(), $bid, pos_crm_clip($body["customer_id"] ?? "", 36), pos_crm_clip($body["assigned_to"] ?? $uid, 36), pos_crm_clip($body["kind"] ?? "call", 24), $due, pos_crm_clip($body["note"] ?? "", 500)]);
      pos_send(200, ["ok" => true, "id" => $id, "php" => true]);
    }
    if (preg_match("#^crm/followups/([^/]+)/done$#", $path, $m) && $method === "POST") {
      pos_crm_on($bid);
      pos_q("UPDATE crm_followups SET status = 'done' WHERE id = ? AND business_id = ?", "ss", [$m[1], $bid]);
      pos_send(200, ["ok" => true, "php" => true]);
    }
    if ($path === "crm/tasks" && $method === "GET") {
      pos_crm_on($bid);
      pos_send(200, ["tasks" => pos_q("SELECT * FROM crm_tasks WHERE business_id = ? ORDER BY created_at DESC LIMIT 300", "s", [$bid]), "php" => true]);
    }
    if ($path === "crm/tasks" && $method === "POST") {
      pos_crm_on($bid);
      $title = pos_crm_clip($body["title"] ?? "", 180);
      if ($title === "") throw new Exception("Enter a task");
      $id = pos_uuid();
      pos_q("INSERT INTO crm_tasks (id, business_id, title, assigned_to, customer_id, due_on, priority, created_by) VALUES (?,?,?,?,?,?,?,?)", "ssssssss", [$id, $bid, $title, pos_crm_clip($body["assigned_to"] ?? $uid, 36), pos_crm_clip($body["customer_id"] ?? "", 36), substr((string) ($body["due_on"] ?? ""), 0, 10), pos_crm_clip($body["priority"] ?? "normal", 16), $uid]);
      pos_send(200, ["ok" => true, "id" => $id, "php" => true]);
    }
    if (preg_match("#^crm/tasks/([^/]+)/done$#", $path, $m) && $method === "POST") {
      pos_crm_on($bid);
      pos_q("UPDATE crm_tasks SET status = 'done' WHERE id = ? AND business_id = ?", "ss", [$m[1], $bid]);
      pos_send(200, ["ok" => true, "php" => true]);
    }
    if ($path === "crm/tickets" && $method === "GET") {
      pos_crm_on($bid);
      pos_send(200, ["tickets" => pos_q("SELECT * FROM crm_support_tickets WHERE business_id = ? ORDER BY created_at DESC LIMIT 200", "s", [$bid]), "php" => true]);
    }
    if ($path === "crm/tickets" && $method === "POST") {
      pos_crm_on($bid);
      $subject = pos_crm_clip($body["subject"] ?? "", 180);
      if ($subject === "") throw new Exception("Enter the complaint or request");
      $id = pos_uuid();
      pos_q("INSERT INTO crm_support_tickets (id, business_id, customer_id, subject, body, priority, assigned_to, created_by) VALUES (?,?,?,?,?,?,?,?)", "ssssssss", [$id, $bid, pos_crm_clip($body["customer_id"] ?? "", 36), $subject, pos_crm_clip($body["body"] ?? "", 2000), pos_crm_clip($body["priority"] ?? "normal", 16), pos_crm_clip($body["assigned_to"] ?? "", 36), $uid]);
      pos_send(200, ["ok" => true, "id" => $id, "php" => true]);
    }
    if ($path === "crm/notes" && $method === "POST") {
      pos_crm_on($bid);
      $note = pos_crm_clip($body["body"] ?? "", 2000);
      if ($note === "") throw new Exception("Write a note");
      pos_q("INSERT INTO crm_notes (id, business_id, customer_id, lead_id, author_id, body) VALUES (?,?,?,?,?,?)", "ssssss", [pos_uuid(), $bid, pos_crm_clip($body["customer_id"] ?? "", 36), pos_crm_clip($body["lead_id"] ?? "", 36), $uid, $note]);
      pos_send(200, ["ok" => true, "php" => true]);
    }
    if ($path === "crm/contacts" && $method === "POST") {
      pos_crm_on($bid);
      $name = pos_crm_clip($body["name"] ?? "", 180);
      if ($name === "") throw new Exception("Enter a contact name and choose a customer or lead");
      pos_q("INSERT INTO crm_contacts (id, business_id, customer_id, lead_id, name, role_name, mobile, email, address, is_primary) VALUES (?,?,?,?,?,?,?,?,?,?)", "sssssssssi", [pos_uuid(), $bid, pos_crm_clip($body["customer_id"] ?? "", 36), pos_crm_clip($body["lead_id"] ?? "", 36), $name, pos_crm_clip($body["role_name"] ?? "", 80), pos_crm_clip($body["mobile"] ?? "", 32), pos_crm_clip($body["email"] ?? "", 160), pos_crm_clip($body["address"] ?? "", 500), !empty($body["is_primary"]) ? 1 : 0]);
      pos_send(200, ["ok" => true, "php" => true]);
    }
    if ($path === "crm/automations" && $method === "POST") {
      pos_crm_on($bid);
      pos_crm_seed($bid);
      foreach (is_array($body["automations"] ?? null) ? $body["automations"] : [] as $item) {
        pos_q("UPDATE crm_automations SET enabled = ?, channel = ?, template = ?, wait_days = ? WHERE business_id = ? AND auto_key = ?", "ississ", [!empty($item["enabled"]) ? 1 : 0, pos_crm_clip($item["channel"] ?? "whatsapp", 16), pos_crm_clip($item["template"] ?? "", 1000), (int) ($item["days"] ?? 0), $bid, pos_crm_clip($item["key"] ?? "", 32)]);
      }
      pos_send(200, ["ok" => true, "php" => true]);
    }
    if ($path === "crm/automations/run" && $method === "POST") {
      pos_crm_on($bid);
      pos_send(200, ["ok" => true, "php" => true] + pos_crm_automation_tick());
    }
    if ($path === "crm/message" && $method === "POST") {
      pos_crm_on($bid);
      $customer = pos_q("SELECT * FROM customers WHERE id = ? AND business_id = ? LIMIT 1", "ss", [pos_crm_clip($body["customer_id"] ?? "", 36), $bid])[0] ?? null;
      if (!$customer) pos_send(404, ["error" => "Customer not found", "php" => true]);
      $channel = in_array($body["channel"] ?? "", ["whatsapp", "sms", "email"], true) ? $body["channel"] : "whatsapp";
      $text = pos_crm_clip($body["body"] ?? "", 1000);
      if ($text === "") throw new Exception("Write the message");
      $result = pos_crm_deliver($bid, $customer, $channel, "manual", $text, "manual:" . $customer["id"] . ":" . (string) microtime(true), $channel === "email" ? ($customer["email"] ?? "") : ($customer["mobile"] ?? ""));
      pos_send(200, ["ok" => !empty($result["ok"]), "php" => true] + $result);
    }
    pos_send(404, ["error" => "Unknown CRM action", "php" => true]);
  } catch (Throwable $e) {
    pos_send(400, ["error" => $e->getMessage(), "php" => true]);
  }
  return true;
}
