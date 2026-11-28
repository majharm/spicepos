<?php
function pos_support_clip($value, $max) {
  $text = trim(preg_replace("/\\s+/", " ", (string) $value));
  if (function_exists("mb_substr")) return mb_substr($text, 0, $max);
  return substr($text, 0, $max);
}

function pos_support_body($value) {
  $text = trim(str_replace("\r\n", "\n", (string) $value));
  if (function_exists("mb_substr")) return mb_substr($text, 0, 2000);
  return substr($text, 0, 2000);
}

function pos_support_category($value) {
  $key = strtolower(pos_support_clip($value, 24));
  return in_array($key, ["billing", "login", "stock", "setup", "other"], true) ? $key : "other";
}

function pos_support_priority($value) {
  $key = strtolower(pos_support_clip($value, 16));
  return in_array($key, ["normal", "high", "urgent"], true) ? $key : "normal";
}

function pos_support_status($value) {
  $key = strtolower(pos_support_clip($value, 16));
  return in_array($key, ["open", "pending", "resolved"], true) ? $key : "";
}

function pos_support_actor_name($auth, $fallback) {
  $user = is_array($auth["user"] ?? null) ? $auth["user"] : [];
  $admin = is_array($auth["admin"] ?? null) ? $auth["admin"] : [];
  $name = trim((string) (($user["first_name"] ?? "") . " " . ($user["last_name"] ?? "")));
  if ($name === "" && function_exists("pos_display_name") && $user) $name = trim((string) pos_display_name($user));
  if ($name === "") $name = trim((string) ($admin["name"] ?? ""));
  if ($name === "") $name = trim((string) ($user["email"] ?? ($admin["email"] ?? $fallback)));
  $clipped = pos_support_clip($name, 120);
  return $clipped === "" ? $fallback : $clipped;
}

function pos_support_align_collation($table) {
  if (!in_array($table, ["support_tickets", "support_ticket_replies", "support_chat_messages"], true)) return;
  $rows = pos_q("SHOW TABLE STATUS LIKE '" . $table . "'");
  $row = $rows[0] ?? [];
  $collation = (string) ($row["Collation"] ?? ($row["collation"] ?? ""));
  if ($collation !== "" && $collation !== "utf8mb4_unicode_ci") {
    pos_q("ALTER TABLE `" . $table . "` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  }
}

function pos_support_ticket_schema() {
  static $done = false;
  if ($done) return;
  pos_q("CREATE TABLE IF NOT EXISTS support_tickets (
    id VARCHAR(36) PRIMARY KEY,
    business_id VARCHAR(36) NOT NULL,
    subject VARCHAR(180) NOT NULL,
    category VARCHAR(24) NOT NULL DEFAULT 'other',
    priority VARCHAR(16) NOT NULL DEFAULT 'normal',
    status VARCHAR(16) NOT NULL DEFAULT 'open',
    created_by VARCHAR(36) NOT NULL DEFAULT '',
    created_by_name VARCHAR(120) NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_support_tickets_shop (business_id, updated_at),
    INDEX idx_support_tickets_status (status, updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  pos_q("CREATE TABLE IF NOT EXISTS support_ticket_replies (
    id VARCHAR(36) PRIMARY KEY,
    ticket_id VARCHAR(36) NOT NULL,
    business_id VARCHAR(36) NOT NULL,
    author_role VARCHAR(16) NOT NULL,
    author_name VARCHAR(120) NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_support_replies_ticket (ticket_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  pos_q("CREATE TABLE IF NOT EXISTS support_chat_messages (
    id VARCHAR(36) PRIMARY KEY,
    business_id VARCHAR(36) NOT NULL,
    author_role VARCHAR(16) NOT NULL,
    author_name VARCHAR(120) NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_support_chat_shop (business_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  pos_support_align_collation("support_tickets");
  pos_support_align_collation("support_ticket_replies");
  pos_support_align_collation("support_chat_messages");
  $done = true;
}

function pos_support_chat_load($bid) {
  $rows = pos_q(
    "SELECT id, business_id, author_role, author_name, body, created_at
     FROM support_chat_messages
     WHERE business_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 80",
    "s",
    [$bid]
  );
  return array_reverse($rows ?: []);
}

function pos_support_chat_add($bid, $role, $name, $body) {
  pos_q(
    "INSERT INTO support_chat_messages (id, business_id, author_role, author_name, body) VALUES (?,?,?,?,?)",
    "sssss",
    [pos_uuid(), $bid, $role, $name, $body]
  );
  return pos_support_chat_load($bid);
}

function pos_support_load($id, $bid) {
  $sql = "SELECT t.id, t.business_id, t.subject, t.category, t.priority, t.status, t.created_by_name, t.created_at, t.updated_at, b.name AS shop_name
          FROM support_tickets t
          LEFT JOIN businesses b ON b.id COLLATE utf8mb4_unicode_ci = t.business_id COLLATE utf8mb4_unicode_ci
          WHERE t.id = ?";
  if ($bid !== "") {
    $rows = pos_q($sql . " AND t.business_id = ? LIMIT 1", "ss", [$id, $bid]);
  } else {
    $rows = pos_q($sql . " LIMIT 1", "s", [$id]);
  }
  $ticket = $rows[0] ?? null;
  if (!$ticket) return null;
  $replies = pos_q(
    "SELECT id, author_role, author_name, body, created_at FROM support_ticket_replies WHERE ticket_id = ? ORDER BY created_at ASC, id ASC",
    "s",
    [$id]
  );
  return ["ticket" => $ticket, "replies" => $replies ?: []];
}

function pos_support_add_reply($ticket, $role, $name, $body) {
  pos_q(
    "INSERT INTO support_ticket_replies (id, ticket_id, business_id, author_role, author_name, body) VALUES (?,?,?,?,?,?)",
    "ssssss",
    [pos_uuid(), $ticket["id"], $ticket["business_id"], $role, $name, $body]
  );
}

function pos_support_ticket_dispatch($path, $method, $body, $bid, $auth) {
  $shop = strpos($path, "support/tickets") === 0 || $path === "support/chat";
  $master = strpos($path, "master/support-tickets") === 0 || strpos($path, "master/support-chat") === 0;
  if (!$shop && !$master) return false;
  $bid = (string) $bid;
  // The master dispatcher calls this before a shop business id exists. Returning
  // here lets the staff dispatcher handle the same path with the signed-in shop.
  if ($shop && $bid === "") return false;
  pos_support_ticket_schema();
  $auth = is_array($auth) ? $auth : [];

  if ($path === "support/tickets" && $method === "GET") {
    if ($bid === "") pos_send(401, ["error" => "Sign in required"]);
    $rows = pos_q(
      "SELECT t.id, t.business_id, t.subject, t.category, t.priority, t.status, t.created_by_name, t.created_at, t.updated_at, b.name AS shop_name,
              (SELECT COUNT(*) FROM support_ticket_replies r WHERE r.ticket_id COLLATE utf8mb4_unicode_ci = t.id COLLATE utf8mb4_unicode_ci) AS reply_count
       FROM support_tickets t
       LEFT JOIN businesses b ON b.id COLLATE utf8mb4_unicode_ci = t.business_id COLLATE utf8mb4_unicode_ci
       WHERE t.business_id = ?
       ORDER BY t.updated_at DESC
       LIMIT 100",
      "s",
      [$bid]
    );
    pos_send(200, ["tickets" => $rows ?: [], "php" => true]);
  }

  if ($path === "support/tickets" && $method === "POST") {
    if ($bid === "") pos_send(401, ["error" => "Sign in required"]);
    $subject = pos_support_clip($body["subject"] ?? "", 180);
    $message = pos_support_body($body["body"] ?? "");
    if (strlen($subject) < 3) pos_send(400, ["error" => "Subject needs at least 3 characters"]);
    if ($message === "") pos_send(400, ["error" => "Write a message"]);
    $id = pos_uuid();
    $name = pos_support_actor_name($auth, "Shop");
    $user = is_array($auth["user"] ?? null) ? $auth["user"] : [];
    pos_q(
      "INSERT INTO support_tickets (id, business_id, subject, category, priority, status, created_by, created_by_name) VALUES (?,?,?,?,?,?,?,?)",
      "ssssssss",
      [
        $id,
        $bid,
        $subject,
        pos_support_category($body["category"] ?? ""),
        pos_support_priority($body["priority"] ?? ""),
        "open",
        (string) ($user["id"] ?? ""),
        $name,
      ]
    );
    pos_support_add_reply(["id" => $id, "business_id" => $bid], "shop", $name, $message);
    $saved = pos_support_load($id, $bid);
    pos_send(200, array_merge($saved ?: [], ["php" => true]));
  }

  if (preg_match("#^support/tickets/([^/]+)$#", $path, $m) && $method === "GET") {
    if ($bid === "") pos_send(401, ["error" => "Sign in required"]);
    $found = pos_support_load($m[1], $bid);
    if (!$found) pos_send(404, ["error" => "Ticket not found"]);
    pos_send(200, array_merge($found, ["php" => true]));
  }

  if (preg_match("#^support/tickets/([^/]+)/reply$#", $path, $m) && $method === "POST") {
    if ($bid === "") pos_send(401, ["error" => "Sign in required"]);
    $message = pos_support_body($body["body"] ?? "");
    if ($message === "") pos_send(400, ["error" => "Write a message"]);
    $found = pos_support_load($m[1], $bid);
    if (!$found) pos_send(404, ["error" => "Ticket not found"]);
    pos_support_add_reply($found["ticket"], "shop", pos_support_actor_name($auth, "Shop"), $message);
    pos_q("UPDATE support_tickets SET status = 'open' WHERE id = ? AND business_id = ?", "ss", [$found["ticket"]["id"], $bid]);
    $saved = pos_support_load($found["ticket"]["id"], $bid);
    pos_send(200, array_merge($saved ?: [], ["php" => true]));
  }

  if ($path === "support/chat" && $method === "GET") {
    if ($bid === "") pos_send(401, ["error" => "Sign in required"]);
    pos_send(200, ["messages" => pos_support_chat_load($bid), "php" => true]);
  }

  if ($path === "support/chat" && $method === "POST") {
    if ($bid === "") pos_send(401, ["error" => "Sign in required"]);
    $message = pos_support_body($body["body"] ?? "");
    if ($message === "") pos_send(400, ["error" => "Write a message"]);
    $messages = pos_support_chat_add($bid, "shop", pos_support_actor_name($auth, "Shop"), $message);
    pos_send(200, ["messages" => $messages, "php" => true]);
  }

  if ($path === "master/support-chat" && $method === "GET") {
    $rows = pos_q(
      "SELECT c.business_id, b.name AS shop_name, c.body, c.author_role, c.author_name, c.created_at
       FROM support_chat_messages c
       JOIN (
         SELECT business_id, MAX(created_at) AS created_at
         FROM support_chat_messages
         GROUP BY business_id
       ) latest ON latest.business_id COLLATE utf8mb4_unicode_ci = c.business_id COLLATE utf8mb4_unicode_ci
         AND latest.created_at = c.created_at
       LEFT JOIN businesses b ON b.id COLLATE utf8mb4_unicode_ci = c.business_id COLLATE utf8mb4_unicode_ci
       ORDER BY c.created_at DESC
       LIMIT 100"
    );
    pos_send(200, ["chats" => $rows ?: [], "php" => true]);
  }

  if (preg_match("#^master/support-chat/([^/]+)$#", $path, $m) && $method === "GET") {
    $shops = pos_q("SELECT id, name FROM businesses WHERE id = ? LIMIT 1", "s", [$m[1]]);
    if (!$shops) pos_send(404, ["error" => "Shop not found"]);
    pos_send(200, ["shop" => $shops[0], "messages" => pos_support_chat_load($m[1]), "php" => true]);
  }

  if (preg_match("#^master/support-chat/([^/]+)$#", $path, $m) && $method === "POST") {
    $message = pos_support_body($body["body"] ?? "");
    if ($message === "") pos_send(400, ["error" => "Write a message"]);
    $shops = pos_q("SELECT id, name FROM businesses WHERE id = ? LIMIT 1", "s", [$m[1]]);
    if (!$shops) pos_send(404, ["error" => "Shop not found"]);
    $messages = pos_support_chat_add($m[1], "master", pos_support_actor_name($auth, "Support"), $message);
    pos_send(200, ["shop" => $shops[0], "messages" => $messages, "php" => true]);
  }

  if ($path === "master/support-tickets" && $method === "GET") {
    $status = pos_support_status($_GET["status"] ?? "");
    $sql = "SELECT t.id, t.business_id, t.subject, t.category, t.priority, t.status, t.created_by_name, t.created_at, t.updated_at, b.name AS shop_name,
                   (SELECT COUNT(*) FROM support_ticket_replies r WHERE r.ticket_id COLLATE utf8mb4_unicode_ci = t.id COLLATE utf8mb4_unicode_ci) AS reply_count
            FROM support_tickets t
            LEFT JOIN businesses b ON b.id COLLATE utf8mb4_unicode_ci = t.business_id COLLATE utf8mb4_unicode_ci";
    if ($status !== "") {
      $rows = pos_q($sql . " WHERE t.status = ? ORDER BY t.updated_at DESC LIMIT 200", "s", [$status]);
    } else {
      $rows = pos_q($sql . " ORDER BY t.updated_at DESC LIMIT 200");
    }
    pos_send(200, ["tickets" => $rows ?: [], "php" => true]);
  }

  if (preg_match("#^master/support-tickets/([^/]+)$#", $path, $m) && $method === "GET") {
    $found = pos_support_load($m[1], "");
    if (!$found) pos_send(404, ["error" => "Ticket not found"]);
    pos_send(200, array_merge($found, ["php" => true]));
  }

  if (preg_match("#^master/support-tickets/([^/]+)/reply$#", $path, $m) && $method === "POST") {
    $message = pos_support_body($body["body"] ?? "");
    if ($message === "") pos_send(400, ["error" => "Write a message"]);
    $found = pos_support_load($m[1], "");
    if (!$found) pos_send(404, ["error" => "Ticket not found"]);
    $status = pos_support_status($body["status"] ?? "");
    if ($status === "") $status = "pending";
    pos_support_add_reply($found["ticket"], "master", pos_support_actor_name($auth, "Support"), $message);
    pos_q("UPDATE support_tickets SET status = ? WHERE id = ?", "ss", [$status, $found["ticket"]["id"]]);
    $saved = pos_support_load($found["ticket"]["id"], "");
    pos_send(200, array_merge($saved ?: [], ["php" => true]));
  }

  pos_send(404, ["error" => "Unknown support ticket path", "path" => $path, "php" => true]);
}
