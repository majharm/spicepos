<?php

function pos_online_store_banner($row) {
  if (!$row || (int) ($row["banner_enabled"] ?? 0) !== 1) return ["desktop" => "", "mobile" => ""];
  return [
    "desktop" => (string) ($row["banner_desktop"] ?? ""),
    "mobile" => (string) ($row["banner_mobile"] ?? ""),
  ];
}

function pos_online_store_slug($raw) {
  $slug = strtolower(trim((string) $raw));
  $slug = preg_replace("/[^a-z0-9]+/", "-", $slug);
  $slug = trim((string) $slug, "-");
  $slug = substr($slug, 0, 40);
  if (!preg_match("/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/", $slug)) {
    throw new Exception("Store URL must be 3–40 letters, numbers, or dashes");
  }
  return $slug;
}

function pos_online_store_public_row($slug) {
  $rows = pos_q(
    "SELECT b.id, b.name, b.status, b.online_store, s.slug, s.store_name, s.published, s.banner_enabled, s.banner_desktop, s.banner_mobile
     FROM online_stores s JOIN businesses b ON b.id = s.business_id
     WHERE s.slug = ? LIMIT 1",
    "s",
    [$slug]
  );
  return $rows[0] ?? null;
}

function pos_online_store_public_dispatch($path, $method) {
  if (!preg_match("#^store/([^/]+)$#", $path, $m) || $method !== "GET") return false;
  pos_ensure_business_columns();
  $row = pos_online_store_public_row(pos_online_store_slug($m[1]));
  if (!$row || (int) ($row["online_store"] ?? 0) !== 1 || ($row["status"] ?? "") !== "active") {
    pos_send(404, ["error" => "Online store is not available", "php" => true]);
  }
  pos_send(200, [
    "shop" => $row["slug"],
    "store_name" => $row["store_name"] ?: $row["name"],
    "published" => (int) ($row["published"] ?? 0) === 1 ? 1 : 0,
    "banner" => pos_online_store_banner($row),
    "php" => true,
  ]);
  return true;
}

function pos_online_store_master_dispatch($path, $method, $body) {
  if (strpos($path, "master/online-store") !== 0) return false;
  pos_ensure_business_columns();
  if ($path === "master/online-store" && $method === "GET") {
    $forAll = pos_online_store_for_all();
    $rows = pos_q(
      "SELECT b.id, b.name, b.city, b.business_type, b.category, b.status, b.online_store, b.store_banner_allowed,
              s.slug, s.published, s.store_name
       FROM businesses b LEFT JOIN online_stores s ON s.business_id = b.id
       ORDER BY b.name"
    );
    $list = [];
    foreach ($rows as $b) {
      $on = (int) ($b["online_store"] ?? 0) === 1 ? 1 : 0;
      $b["online_store"] = $on;
      $b["store_banner_allowed"] = (int) ($b["store_banner_allowed"] ?? 0) === 1 ? 1 : 0;
      $b["status_label"] = $on ? "Enabled" : "Disabled";
      $list[] = $b;
    }
    pos_send(200, ["forAll" => $forAll, "businesses" => $list, "php" => true]);
  }
  if ($path === "master/online-store/for-all" && $method === "PUT") {
    $enabled = pos_online_store_flag($body["enabled"] ?? 0);
    pos_q(
      "INSERT INTO platform_settings (setting_key, setting_value) VALUES ('online_store_for_all', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)",
      "s",
      [(string) $enabled]
    );
    if ($enabled) pos_q("UPDATE businesses SET online_store = 1");
    pos_send(200, ["ok" => true, "forAll" => $enabled, "php" => true]);
  }
  if ($path === "master/online-store/enable-all" && $method === "POST") {
    pos_q("UPDATE businesses SET online_store = 1");
    pos_send(200, ["ok" => true, "online_store" => 1, "php" => true]);
  }
  if ($path === "master/online-store/disable-all" && $method === "POST") {
    pos_q("UPDATE businesses SET online_store = 0");
    pos_send(200, ["ok" => true, "online_store" => 0, "php" => true]);
  }
  if (preg_match("#^master/online-store/businesses/([^/]+)$#", $path, $m) && $method === "PUT") {
    $id = $m[1];
    $rows = pos_q("SELECT id, online_store, store_banner_allowed FROM businesses WHERE id = ? LIMIT 1", "s", [$id]);
    if (!$rows) pos_send(404, ["error" => "Business not found", "php" => true]);
    $online = array_key_exists("online_store", $body) ? pos_online_store_flag($body["online_store"]) : ((int) $rows[0]["online_store"] === 1 ? 1 : 0);
    $banner = array_key_exists("store_banner_allowed", $body) ? pos_online_store_flag($body["store_banner_allowed"]) : ((int) $rows[0]["store_banner_allowed"] === 1 ? 1 : 0);
    pos_q("UPDATE businesses SET online_store = ?, store_banner_allowed = ? WHERE id = ?", "iis", [$online, $banner, $id]);
    pos_send(200, ["ok" => true, "id" => $id, "online_store" => $online, "store_banner_allowed" => $banner, "status_label" => $online ? "Enabled" : "Disabled", "php" => true]);
  }
  return false;
}

function pos_online_store_staff_allowed($auth) {
  $user = is_array($auth["user"] ?? null) ? $auth["user"] : [];
  $role = (string) ($user["role"] ?? "");
  if ($role === "business_admin" || $role === "resort_owner") return true;
  return pos_can($user, "settings") || pos_can($user, "items") || pos_can($user, "orders");
}

function pos_online_store_staff_dispatch($path, $method, $body, $bid, $auth = null) {
  if ($path !== "online-store" && strpos($path, "online-store/") !== 0) return false;
  pos_ensure_business_columns();
  $rows = pos_q("SELECT id, name, status, online_store, store_banner_allowed FROM businesses WHERE id = ? LIMIT 1", "s", [$bid]);
  $biz = $rows[0] ?? [];
  if (pos_online_store_flag($biz["online_store"] ?? 0) !== 1) {
    pos_send(403, ["error" => "Online Store is turned off for this shop", "php" => true]);
  }
  if (!pos_online_store_staff_allowed($auth)) {
    pos_send(403, ["error" => "You do not have permission for this module", "php" => true]);
  }
  if ($path === "online-store" && $method === "GET") {
    $store = pos_q("SELECT * FROM online_stores WHERE business_id = ? LIMIT 1", "s", [$bid]);
    $row = $store[0] ?? null;
    pos_send(200, [
      "business" => ["id" => $bid, "name" => $biz["name"] ?? "", "store_banner_allowed" => pos_online_store_flag($biz["store_banner_allowed"] ?? 0)],
      "store" => $row ? [
        "store_name" => $row["store_name"],
        "slug" => $row["slug"],
        "published" => (int) $row["published"] === 1 ? 1 : 0,
        "banner_enabled" => (int) $row["banner_enabled"] === 1 ? 1 : 0,
        "banner_desktop" => $row["banner_desktop"] ?? "",
        "banner_mobile" => $row["banner_mobile"] ?? "",
        "url" => "/store.html?shop=" . rawurlencode($row["slug"]),
      ] : null,
      "php" => true,
    ]);
  }
  if ($path === "online-store/banner" && $method === "DELETE") {
    if (pos_online_store_flag($biz["store_banner_allowed"] ?? 0) !== 1) pos_send(403, ["error" => "Login banner management is turned off for this shop", "php" => true]);
    pos_q("UPDATE online_stores SET banner_desktop = NULL, banner_mobile = NULL, banner_enabled = 0 WHERE business_id = ?", "s", [$bid]);
    pos_send(200, ["ok" => true, "php" => true]);
  }
  return false;
}
