<?php

function pos_smtp_config() {
  $user = trim(pos_env("SMTP_USER", pos_env("MAIL_USER")));
  $pass = pos_env("SMTP_PASS", pos_env("MAIL_PASS", pos_env("SMTP_PASSWORD")));
  $host = trim(pos_env("SMTP_HOST", $user !== "" ? "smtp.hostinger.com" : ""));
  $port = (int) pos_env("SMTP_PORT", $host !== "" ? "465" : "0");
  $secureEnv = strtolower(trim(pos_env("SMTP_SECURE")));
  $secure = $port === 465;
  if ($secureEnv !== "") $secure = !in_array($secureEnv, ["0", "false", "no"], true);
  $from = trim(pos_env("MAIL_FROM", pos_env("SMTP_FROM", $user)));
  $fromName = trim(pos_env("MAIL_FROM_NAME", "ATAV POS")) ?: "ATAV POS";
  return [
    "host" => $host,
    "port" => $port,
    "secure" => $secure,
    "user" => $user,
    "pass" => $pass,
    "from" => $from,
    "fromName" => $fromName,
  ];
}

function pos_smtp_configured($cfg = null) {
  $cfg = $cfg ?: pos_smtp_config();
  return $cfg["host"] !== "" && $cfg["port"] > 0 && $cfg["user"] !== "" && $cfg["pass"] !== "" && $cfg["from"] !== "";
}

function pos_public_app_url() {
  $env = rtrim(pos_env("APP_PUBLIC_URL", pos_env("POS_PUBLIC_URL")), "/");
  if ($env !== "") return $env;
  $proto = pos_env("HTTP_X_FORWARDED_PROTO");
  if ($proto === "") $proto = (!empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off") ? "https" : "http";
  $proto = trim(explode(",", $proto)[0]);
  $host = pos_env("HTTP_X_FORWARDED_HOST", pos_env("HTTP_HOST", (string) ($_SERVER["HTTP_HOST"] ?? "")));
  $host = trim(explode(",", $host)[0]);
  return $host !== "" ? $proto . "://" . $host : "";
}

function pos_login_url() {
  $base = pos_public_app_url();
  return $base !== "" ? $base . "/login.html" : "/login.html";
}

function pos_mail_escape($value) {
  return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, "UTF-8");
}

function pos_welcome_signup_message($payload) {
  $shop = $payload["shopName"] ?? "your shop";
  $who = $payload["ownerName"] ?? "there";
  $email = $payload["email"] ?? "";
  $user = $payload["username"] ?? $email;
  $url = $payload["signInUrl"] ?? pos_login_url();
  $subject = "Welcome to ATAV POS · " . $shop;
  $text = "Hello {$who},\n\nYour ATAV POS shop \"{$shop}\" is ready.\n\nSign in: {$url}\nEmail: {$email}"
    . ($user !== "" ? "\nUsername: {$user}" : "")
    . "\n\nUse the password you set when you registered. Keep it private.\nNeed help? Reply to this email.\n\n— ATAV Telecom POS";
  $html = "<p>Hello " . pos_mail_escape($who) . ",</p>"
    . "<p>Your ATAV POS shop <strong>" . pos_mail_escape($shop) . "</strong> is ready.</p>"
    . "<p><a href=\"" . pos_mail_escape($url) . "\">Sign in to ATAV POS</a></p>"
    . "<p>Email: " . pos_mail_escape($email) . ($user !== "" ? "<br>Username: " . pos_mail_escape($user) : "") . "</p>"
    . "<p>Use the password you set when you registered. Keep it private.</p>"
    . "<p>Need help? Reply to this email.</p><p>— ATAV Telecom POS</p>";
  return ["subject" => $subject, "text" => $text, "html" => $html];
}

function pos_welcome_staff_message($payload) {
  $shop = $payload["shopName"] ?? "your shop";
  $who = $payload["name"] ?? "there";
  $email = $payload["email"] ?? "";
  $user = $payload["username"] ?? $email;
  $url = $payload["signInUrl"] ?? pos_login_url();
  $role = str_replace("_", " ", (string) ($payload["role"] ?? "staff"));
  $subject = "You have been added to {$shop} on ATAV POS";
  $text = "Hello {$who},\n\nYou have been added to \"{$shop}\" on ATAV POS as {$role}.\n\nSign in: {$url}\nEmail: {$email}"
    . ($user !== "" ? "\nUsername: {$user}" : "")
    . "\n\nUse the password your admin shared with you. Keep it private.\nNeed help? Reply to this email.\n\n— ATAV Telecom POS";
  $html = "<p>Hello " . pos_mail_escape($who) . ",</p>"
    . "<p>You have been added to <strong>" . pos_mail_escape($shop) . "</strong> on ATAV POS as " . pos_mail_escape($role) . ".</p>"
    . "<p><a href=\"" . pos_mail_escape($url) . "\">Sign in to ATAV POS</a></p>"
    . "<p>Email: " . pos_mail_escape($email) . ($user !== "" ? "<br>Username: " . pos_mail_escape($user) : "") . "</p>"
    . "<p>Use the password your admin shared with you. Keep it private.</p>"
    . "<p>Need help? Reply to this email.</p><p>— ATAV Telecom POS</p>";
  return ["subject" => $subject, "text" => $text, "html" => $html];
}

function pos_smtp_read($fp, $timeout) {
  stream_set_timeout($fp, (int) $timeout);
  $last = "";
  while (!feof($fp)) {
    $line = fgets($fp, 2048);
    if ($line === false) break;
    $last = rtrim($line, "\r\n");
    if (preg_match("/^\\d{3} /", $last)) return $last;
  }
  return $last;
}

function pos_smtp_write($fp, $line) {
  return fwrite($fp, $line . "\r\n") !== false;
}

function pos_mail_subject($value) {
  $s = (string) $value;
  if (preg_match('/^[\\x20-\\x7E]*$/', $s)) return $s;
  return "=?UTF-8?B?" . base64_encode($s) . "?=";
}

function pos_mail_from_header($email, $name) {
  $name = trim(preg_replace("/[\\r\\n]+/", " ", (string) $name));
  if ($name === "") return $email;
  if (preg_match('/^[\\x20-\\x7E]*$/', $name) && !preg_match('/[",<>]/', $name)) return $name . " <" . $email . ">";
  return "=?UTF-8?B?" . base64_encode($name) . "?= <" . $email . ">";
}

function pos_dot_stuff($body) {
  $body = str_replace(["\r\n", "\r"], "\n", (string) $body);
  $lines = explode("\n", $body);
  foreach ($lines as &$line) {
    if (isset($line[0]) && $line[0] === ".") $line = "." . $line;
  }
  return implode("\r\n", $lines);
}

function pos_send_mail($to, $subject, $text, $html = "") {
  $cfg = pos_smtp_config();
  if (!pos_smtp_configured($cfg)) return ["ok" => false, "skipped" => true];
  $recipient = trim((string) $to);
  if ($recipient === "" || !preg_match("/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/", $recipient)) {
    return ["ok" => false, "error" => "Invalid recipient"];
  }
  $timeout = (int) pos_env("SMTP_TIMEOUT_MS", "12000");
  $timeoutSec = max(3, (int) ceil($timeout / 1000));
  $remote = ($cfg["secure"] ? "ssl://" : "") . $cfg["host"] . ":" . $cfg["port"];
  $fp = @stream_socket_client($remote, $errno, $errstr, $timeoutSec, STREAM_CLIENT_CONNECT);
  if (!$fp) return ["ok" => false, "error" => $errstr ?: "SMTP connect failed ({$errno})"];
  try {
    $greet = pos_smtp_read($fp, $timeoutSec);
    if (!str_starts_with($greet, "2")) throw new Exception($greet ?: "SMTP handshake failed");
    pos_smtp_write($fp, "EHLO spicepos");
    $ehlo = pos_smtp_read($fp, $timeoutSec);
    if (!str_starts_with($ehlo, "2")) throw new Exception($ehlo ?: "EHLO failed");
    if (!$cfg["secure"] && (int) $cfg["port"] === 587) {
      pos_smtp_write($fp, "STARTTLS");
      $tlsReply = pos_smtp_read($fp, $timeoutSec);
      if (!str_starts_with($tlsReply, "2")) throw new Exception($tlsReply ?: "STARTTLS failed");
      $ok = stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
      if (!$ok) throw new Exception("STARTTLS upgrade failed");
      pos_smtp_write($fp, "EHLO spicepos");
      $ehlo = pos_smtp_read($fp, $timeoutSec);
      if (!str_starts_with($ehlo, "2")) throw new Exception($ehlo ?: "EHLO after STARTTLS failed");
    }
    pos_smtp_write($fp, "AUTH LOGIN");
    $authReady = pos_smtp_read($fp, $timeoutSec);
    if (!str_starts_with($authReady, "3")) throw new Exception($authReady ?: "AUTH LOGIN not accepted");
    pos_smtp_write($fp, base64_encode($cfg["user"]));
    $userOk = pos_smtp_read($fp, $timeoutSec);
    if (!str_starts_with($userOk, "3")) throw new Exception($userOk ?: "SMTP username rejected");
    pos_smtp_write($fp, base64_encode($cfg["pass"]));
    $passOk = pos_smtp_read($fp, $timeoutSec);
    if (!str_starts_with($passOk, "2")) throw new Exception("SMTP authentication failed");
    pos_smtp_write($fp, "MAIL FROM:<" . $cfg["from"] . ">");
    $fromOk = pos_smtp_read($fp, $timeoutSec);
    if (!str_starts_with($fromOk, "2")) throw new Exception($fromOk ?: "MAIL FROM rejected");
    pos_smtp_write($fp, "RCPT TO:<" . $recipient . ">");
    $rcptOk = pos_smtp_read($fp, $timeoutSec);
    if (!str_starts_with($rcptOk, "2")) throw new Exception($rcptOk ?: "RCPT TO rejected");
    pos_smtp_write($fp, "DATA");
    $dataOk = pos_smtp_read($fp, $timeoutSec);
    if (!str_starts_with($dataOk, "3")) throw new Exception($dataOk ?: "DATA rejected");
    $boundary = "pos" . bin2hex(random_bytes(6));
    $payload = "From: " . pos_mail_from_header($cfg["from"], $cfg["fromName"]) . "\r\n"
      . "To: {$recipient}\r\n"
      . "Subject: " . pos_mail_subject($subject) . "\r\n"
      . "MIME-Version: 1.0\r\n"
      . "Content-Type: multipart/alternative; boundary=\"{$boundary}\"\r\n\r\n"
      . "--{$boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n"
      . pos_dot_stuff($text) . "\r\n\r\n"
      . "--{$boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n"
      . pos_dot_stuff($html !== "" ? $html : "<pre>" . pos_mail_escape($text) . "</pre>") . "\r\n\r\n"
      . "--{$boundary}--\r\n.";
    fwrite($fp, $payload . "\r\n");
    $queued = pos_smtp_read($fp, $timeoutSec);
    if (!str_starts_with($queued, "2")) throw new Exception($queued ?: "Message not accepted");
    pos_smtp_write($fp, "QUIT");
    return ["ok" => true];
  } catch (Throwable $e) {
    return ["ok" => false, "error" => $e->getMessage()];
  } finally {
    fclose($fp);
  }
}

function pos_send_welcome_signup($payload) {
  try {
    if (!pos_smtp_configured()) return ["ok" => false, "skipped" => true];
    $msg = pos_welcome_signup_message(array_merge($payload, ["signInUrl" => pos_login_url()]));
    $result = pos_send_mail($payload["email"] ?? "", $msg["subject"], $msg["text"], $msg["html"]);
    if (empty($result["ok"]) && empty($result["skipped"])) {
      error_log("welcome signup email failed: " . ($result["error"] ?? "unknown"));
    }
    return $result;
  } catch (Throwable $e) {
    error_log("welcome signup email failed: " . $e->getMessage());
    return ["ok" => false, "error" => $e->getMessage()];
  }
}

function pos_send_welcome_staff($payload) {
  try {
    if (!pos_smtp_configured()) return ["ok" => false, "skipped" => true];
    $msg = pos_welcome_staff_message(array_merge($payload, ["signInUrl" => pos_login_url()]));
    $result = pos_send_mail($payload["email"] ?? "", $msg["subject"], $msg["text"], $msg["html"]);
    if (empty($result["ok"]) && empty($result["skipped"])) {
      error_log("welcome staff email failed: " . ($result["error"] ?? "unknown"));
    }
    return $result;
  } catch (Throwable $e) {
    error_log("welcome staff email failed: " . $e->getMessage());
    return ["ok" => false, "error" => $e->getMessage()];
  }
}
