<?php
/** Per-business mailbox on the PHP fallback. Passwords stay encrypted and never go back to the browser. */

function pos_bizmail_env($key) {
  if (function_exists("pos_env")) return trim((string) pos_env($key, ""));
  $value = getenv($key);
  return ($value === false || $value === null) ? "" : trim((string) $value);
}

function pos_bizmail_clip($value, $max) {
  $text = (string) $value;
  if (function_exists("mb_substr")) return mb_substr($text, 0, $max, "UTF-8");
  return substr($text, 0, $max);
}

function pos_bizmail_clean_email($raw) {
  $s = trim(str_replace(["\r", "\n"], "", (string) $raw));
  if ($s === "" || strlen($s) > 160) return "";
  if (!preg_match("/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/", $s)) return "";
  return $s;
}

function pos_bizmail_clean_host($raw) {
  $s = trim((string) preg_replace("/[\\r\\n\\s]+/", "", (string) $raw));
  if ($s === "" || strlen($s) > 180 || !preg_match("/^[A-Za-z0-9.-]+$/", $s)) return "";
  return $s;
}

function pos_bizmail_escape($value) {
  if (function_exists("pos_mail_escape")) return pos_mail_escape($value);
  return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, "UTF-8");
}

function pos_bizmail_key() {
  static $cached = null;
  static $cacheId = "";
  $env = pos_bizmail_env("MAIL_CREDENTIAL_KEY");
  if ($env === "") $env = pos_bizmail_env("APP_SECRET");
  if ($env !== "") {
    $id = "env:" . $env;
    if ($cacheId !== $id) {
      $cacheId = $id;
      $cached = hash("sha256", $env, true);
    }
    return $cached;
  }
  $file = __DIR__ . "/data/mail-credential.key";
  $id = "file:" . $file;
  if ($cacheId === $id && is_string($cached) && $cached !== "") return $cached;
  $hex = is_file($file) ? trim((string) file_get_contents($file)) : "";
  if (!preg_match("/^[0-9a-f]{64}$/i", $hex)) {
    $hex = bin2hex(random_bytes(32));
    $dir = dirname($file);
    if (!is_dir($dir)) mkdir($dir, 0700, true);
    file_put_contents($file, $hex);
    @chmod($file, 0600);
  }
  $cacheId = $id;
  $cached = hex2bin($hex);
  return $cached;
}

function pos_bizmail_encrypt($plain) {
  $iv = random_bytes(12);
  $tag = "";
  $enc = openssl_encrypt((string) $plain, "aes-256-gcm", pos_bizmail_key(), OPENSSL_RAW_DATA, $iv, $tag);
  if ($enc === false || $tag === "") throw new Exception("Stored email secret could not be read");
  return "v1:" . base64_encode($iv) . ":" . base64_encode($tag) . ":" . base64_encode($enc);
}

function pos_bizmail_decrypt($stored) {
  $parts = explode(":", (string) $stored);
  if (($parts[0] ?? "") !== "v1" || count($parts) !== 4) throw new Exception("Stored email secret could not be read");
  $iv = base64_decode($parts[1], true);
  $tag = base64_decode($parts[2], true);
  $enc = base64_decode($parts[3], true);
  if ($iv === false || $tag === false || $enc === false || strlen($iv) !== 12) {
    throw new Exception("Stored email secret could not be read");
  }
  $plain = openssl_decrypt($enc, "aes-256-gcm", pos_bizmail_key(), OPENSSL_RAW_DATA, $iv, $tag);
  if ($plain === false) throw new Exception("Stored email secret could not be read");
  return $plain;
}

function pos_bizmail_safe_error($err, $secret = "") {
  $message = trim((string) ($err !== "" ? $err : "Email was not sent"));
  $hidden = (string) $secret;
  if ($hidden !== "" && strlen($hidden) >= 3) $message = str_replace($hidden, "[redacted]", $message);
  $message = trim((string) preg_replace("/[\\r\\n]+/", " ", $message));
  return pos_bizmail_clip($message, 180);
}

function pos_bizmail_exec($sql, $types, $params) {
  $db = pos_db();
  $st = $db->prepare($sql);
  if (!$st) throw new Exception($db->error ?: "SQL error");
  if ($types !== "") {
    $bind = [$types];
    foreach ($params as $i => $p) {
      $bind[] = &$params[$i];
    }
    call_user_func_array([$st, "bind_param"], $bind);
  }
  if (!$st->execute()) {
    $err = $st->error;
    $st->close();
    throw new Exception($err ?: "SQL error");
  }
  $st->close();
}

function pos_bizmail_ensure() {
  static $done = false;
  if ($done) return;
  $db = pos_db();
  if (!$db->query("CREATE TABLE IF NOT EXISTS business_mailboxes (
    business_id VARCHAR(36) NOT NULL PRIMARY KEY,
    from_email VARCHAR(160) NOT NULL DEFAULT '',
    from_name VARCHAR(160) NOT NULL DEFAULT '',
    reply_to VARCHAR(160) NULL,
    smtp_host VARCHAR(180) NOT NULL DEFAULT '',
    smtp_port INT NOT NULL DEFAULT 465,
    smtp_secure TINYINT(1) NOT NULL DEFAULT 1,
    smtp_user VARCHAR(180) NOT NULL DEFAULT '',
    smtp_pass_enc TEXT NULL,
    password_set TINYINT(1) NOT NULL DEFAULT 0,
    auto_invoice_email TINYINT(1) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'missing',
    status_detail VARCHAR(180) NOT NULL DEFAULT '',
    verified_at DATETIME NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )")) {
    throw new Exception($db->error ?: "Could not prepare the business mailbox");
  }
  $done = true;
}

function pos_bizmail_company($bid) {
  try {
    $rows = pos_q(
      "SELECT name, address, phone, gstin, email, timezone FROM company_settings WHERE business_id = ? LIMIT 1",
      "s",
      [$bid]
    );
    if (!empty($rows[0]["name"])) {
      $row = $rows[0];
      if (empty($row["timezone"])) $row["timezone"] = "Asia/Kolkata";
      return $row;
    }
  } catch (Throwable $e) {
    /* company profile is optional */
  }
  try {
    $rows = pos_q("SELECT name FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]);
    $name = $rows[0]["name"] ?? "Shop";
  } catch (Throwable $e) {
    $name = "Shop";
  }
  return [
    "name" => $name !== "" ? $name : "Shop",
    "address" => "",
    "phone" => "",
    "gstin" => "",
    "email" => "",
    "timezone" => "Asia/Kolkata",
  ];
}

function pos_bizmail_load($bid) {
  pos_bizmail_ensure();
  $rows = pos_q("SELECT * FROM business_mailboxes WHERE business_id = ? LIMIT 1", "s", [$bid]);
  return $rows[0] ?? null;
}

function pos_bizmail_public($row, $companyName = "") {
  if (!$row) {
    return [
      "configured" => false,
      "from_email" => "",
      "from_name" => $companyName ?: "",
      "reply_to" => "",
      "smtp_host" => "",
      "smtp_port" => 465,
      "smtp_secure" => 1,
      "smtp_user" => "",
      "password_set" => false,
      "auto_invoice_email" => 0,
      "status" => "missing",
      "status_detail" => "",
      "verified_at" => null,
    ];
  }
  $passwordSet = (int) ($row["password_set"] ?? 0) === 1 || !empty($row["smtp_pass_enc"]);
  $verified = $row["verified_at"] ?? null;
  return [
    "configured" => !empty($row["from_email"]) && !empty($row["smtp_host"]) && !empty($row["smtp_user"]) && $passwordSet,
    "from_email" => (string) ($row["from_email"] ?? ""),
    "from_name" => (string) (($row["from_name"] ?? "") !== "" ? $row["from_name"] : ($companyName ?: "")),
    "reply_to" => (string) ($row["reply_to"] ?? ""),
    "smtp_host" => (string) ($row["smtp_host"] ?? ""),
    "smtp_port" => (int) ($row["smtp_port"] ?? 0) ?: 465,
    "smtp_secure" => (int) ($row["smtp_secure"] ?? 1) === 0 ? 0 : 1,
    "smtp_user" => (string) ($row["smtp_user"] ?? ""),
    "password_set" => $passwordSet,
    "auto_invoice_email" => (int) ($row["auto_invoice_email"] ?? 0) === 1 ? 1 : 0,
    "status" => (string) (($row["status"] ?? "") !== "" ? $row["status"] : "unverified"),
    "status_detail" => pos_bizmail_clip((string) ($row["status_detail"] ?? ""), 180),
    "verified_at" => $verified !== null && $verified !== "" ? $verified : null,
  ];
}

function pos_bizmail_user($raw) {
  $email = pos_bizmail_clean_email($raw);
  if ($email !== "") return $email;
  return trim((string) $raw);
}

function pos_bizmail_save($bid, $body) {
  pos_bizmail_ensure();
  $current = pos_bizmail_load($bid);
  $company = pos_bizmail_company($bid);
  $from = pos_bizmail_clean_email($body["from_email"] ?? $body["fromEmail"] ?? ($current["from_email"] ?? ""));
  if ($from === "") throw new Exception("Enter a valid business email address");
  $replyRaw = array_key_exists("reply_to", $body)
    ? $body["reply_to"]
    : ($body["replyTo"] ?? ($current["reply_to"] ?? ""));
  $reply = trim((string) $replyRaw);
  if ($reply !== "" && pos_bizmail_clean_email($reply) === "") {
    throw new Exception("Reply-To must be a valid email address");
  }
  $host = pos_bizmail_clean_host($body["smtp_host"] ?? $body["smtpHost"] ?? ($current["smtp_host"] ?? ""));
  $user = pos_bizmail_user($body["smtp_user"] ?? $body["smtpUser"] ?? ($current["smtp_user"] ?? ""));
  if ($host === "" || $user === "" || strlen($user) > 180 || preg_match("/[\\r\\n]/", $user)) {
    throw new Exception("Enter the SMTP host and username for this business");
  }
  $portRaw = $body["smtp_port"] ?? $body["smtpPort"] ?? ($current["smtp_port"] ?? 465);
  if (is_string($portRaw) && !preg_match("/^\\d+$/", trim($portRaw))) throw new Exception("SMTP port is not valid");
  if (is_float($portRaw) && floor($portRaw) != $portRaw) throw new Exception("SMTP port is not valid");
  $port = (int) $portRaw;
  if ($port < 1 || $port > 65535) throw new Exception("SMTP port is not valid");
  $secure = $port === 587 ? 0 : ((int) ($body["smtp_secure"] ?? $body["smtpSecure"] ?? 1) === 0 ? 0 : 1);
  $typedPass = (string) ($body["smtp_pass"] ?? $body["smtpPass"] ?? "");
  $keepPass = $typedPass === "" || $typedPass === "********";
  if ($keepPass && empty($current["smtp_pass_enc"])) {
    throw new Exception("Enter the mailbox password. It is stored encrypted on the server.");
  }
  $passEnc = $keepPass ? $current["smtp_pass_enc"] : pos_bizmail_encrypt($typedPass);
  $fromName = pos_bizmail_clip(trim((string) preg_replace("/[\\r\\n]+/", " ", (string) ($body["from_name"] ?? $body["fromName"] ?? ($current["from_name"] ?? "")))), 160);
  $changed = !$current
    || (string) ($current["from_email"] ?? "") !== $from
    || (string) ($current["smtp_host"] ?? "") !== $host
    || (int) ($current["smtp_port"] ?? 0) !== $port
    || (string) ($current["smtp_user"] ?? "") !== $user
    || (int) ($current["smtp_secure"] ?? 1) !== $secure
    || !$keepPass;
  $status = $changed ? "unverified" : (string) (($current["status"] ?? "") !== "" ? $current["status"] : "unverified");
  $detail = $changed ? "Send a test email before automatic invoices." : (string) ($current["status_detail"] ?? "");
  $verifiedAt = $changed ? null : (($current["verified_at"] ?? "") !== "" ? $current["verified_at"] : null);
  $auto = (int) ($body["auto_invoice_email"] ?? $body["autoInvoiceEmail"] ?? ($current["auto_invoice_email"] ?? 0)) === 1 ? 1 : 0;
  if ($changed) $auto = 0;
  if ($auto && $status !== "verified") {
    throw new Exception("Send a test email before turning on automatic invoice emails");
  }
  $replyStored = $reply !== "" ? pos_bizmail_clean_email($reply) : null;
  pos_bizmail_exec(
    "INSERT INTO business_mailboxes (
       business_id, from_email, from_name, reply_to, smtp_host, smtp_port, smtp_secure, smtp_user,
       smtp_pass_enc, password_set, auto_invoice_email, status, status_detail, verified_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       from_email=VALUES(from_email), from_name=VALUES(from_name), reply_to=VALUES(reply_to),
       smtp_host=VALUES(smtp_host), smtp_port=VALUES(smtp_port), smtp_secure=VALUES(smtp_secure),
       smtp_user=VALUES(smtp_user), smtp_pass_enc=VALUES(smtp_pass_enc), password_set=VALUES(password_set),
       auto_invoice_email=VALUES(auto_invoice_email), status=VALUES(status), status_detail=VALUES(status_detail),
       verified_at=VALUES(verified_at)",
    "sssssiissiisss",
    [
      $bid,
      $from,
      $fromName,
      $replyStored,
      $host,
      $port,
      $secure,
      pos_bizmail_clip($user, 180),
      $passEnc,
      1,
      $auto,
      $status,
      pos_bizmail_clip($detail, 180),
      $verifiedAt,
    ]
  );
  return pos_bizmail_public(pos_bizmail_load($bid), $company["name"] ?? "");
}

function pos_bizmail_smtp($row, $company) {
  $pass = "";
  try {
    $pass = pos_bizmail_decrypt($row["smtp_pass_enc"] ?? "");
  } catch (Throwable $e) {
    $pass = "";
  }
  $port = (int) ($row["smtp_port"] ?? 0) ?: 465;
  $fromName = trim((string) ($row["from_name"] ?? ""));
  if ($fromName === "") $fromName = trim((string) ($company["name"] ?? ""));
  if ($fromName === "") $fromName = "Shop";
  return [
    "host" => (string) ($row["smtp_host"] ?? ""),
    "port" => $port,
    "secure" => (int) ($row["smtp_secure"] ?? 1) !== 0 && $port !== 587,
    "user" => (string) ($row["smtp_user"] ?? ""),
    "pass" => $pass,
    "from" => (string) ($row["from_email"] ?? ""),
    "fromName" => $fromName,
    "replyTo" => (string) ($row["reply_to"] ?? ""),
  ];
}

function pos_bizmail_test($bid, $toRaw) {
  pos_bizmail_ensure();
  $row = pos_bizmail_load($bid);
  $company = pos_bizmail_company($bid);
  if (empty($row["smtp_pass_enc"]) || empty($row["from_email"])) {
    throw new Exception("Save the mailbox before sending a test email");
  }
  $to = pos_bizmail_clean_email($toRaw);
  if ($to === "") $to = pos_bizmail_clean_email($row["from_email"] ?? "");
  if ($to === "") throw new Exception("Enter a valid address for the test email");
  $shop = trim((string) preg_replace("/[\\r\\n]+/", " ", (string) ($company["name"] ?? "")));
  if ($shop === "") $shop = "your shop";
  $cfg = pos_bizmail_smtp($row, $company);
  $sent = pos_send_mail(
    $to,
    "ATAV POS email test – " . $shop,
    "This is a test from {$shop}. Invoice copies can be sent from {$row["from_email"]}.",
    "<p>This is a test from <strong>" . pos_bizmail_escape($shop) . "</strong>.</p><p>Invoice copies can be sent from " . pos_bizmail_escape($row["from_email"]) . ".</p>",
    "",
    [],
    15,
    $cfg
  );
  $ok = !empty($sent["ok"]);
  $detail = $ok
    ? "Connected. Automatic invoice emails can be turned on."
    : pos_bizmail_safe_error($sent["error"] ?? "", $cfg["pass"] ?? "");
  $status = $ok ? "verified" : "failed";
  pos_bizmail_exec(
    "UPDATE business_mailboxes SET status = ?, status_detail = ?, verified_at = ?, auto_invoice_email = IF(? = 'verified', auto_invoice_email, 0) WHERE business_id = ?",
    "sssss",
    [$status, $detail, $ok ? date("Y-m-d H:i:s") : null, $status, $bid]
  );
  $saved = pos_bizmail_load($bid);
  return [
    "ok" => $ok,
    "error" => $ok ? "" : $detail,
    "to" => $to,
    "mailbox" => pos_bizmail_public($saved, $company["name"] ?? ""),
  ];
}

function pos_business_email_dispatch($path, $method, $body, $bid, $auth) {
  if ($path !== "business-email" && $path !== "business-email/test") return false;
  $user = $auth["user"] ?? [];
  if (!pos_can($user, "settings")) {
    pos_send(403, ["error" => "You do not have permission for this module", "php" => true]);
  }
  $body = is_array($body) ? $body : [];
  $method = strtoupper((string) $method);
  try {
    if ($path === "business-email" && $method === "GET") {
      $company = pos_bizmail_company($bid);
      pos_send(200, ["mailbox" => pos_bizmail_public(pos_bizmail_load($bid), $company["name"] ?? "")]);
    }
    if ($path === "business-email" && $method === "POST") {
      pos_send(200, ["ok" => true, "mailbox" => pos_bizmail_save($bid, $body)]);
    }
    if ($path === "business-email/test" && $method === "POST") {
      pos_send(200, pos_bizmail_test($bid, $body["to"] ?? ""));
    }
    pos_send(405, ["error" => "Method not allowed", "php" => true]);
  } catch (Exception $e) {
    $msg = $e->getMessage();
    $code = (stripos($msg, "SQL") !== false || stripos($msg, "MySQL") !== false) ? 500 : 400;
    pos_send($code, ["error" => $msg, "php" => true]);
  }
  return false;
}
