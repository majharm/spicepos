<?php
function pos_login_page_id() {
  return bin2hex(random_bytes(16));
}

function pos_ensure_login_page_schema() {
  pos_q("CREATE TABLE IF NOT EXISTS login_page_settings (
    id VARCHAR(16) PRIMARY KEY,
    draft_json MEDIUMTEXT NULL,
    published_json MEDIUMTEXT NULL,
    published_version INT NOT NULL DEFAULT 0,
    updated_by VARCHAR(180) NULL,
    updated_at TIMESTAMP(3) NULL
  )");
  pos_q("CREATE TABLE IF NOT EXISTS login_page_images (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    kind VARCHAR(32) NOT NULL DEFAULT 'library',
    url MEDIUMTEXT NOT NULL,
    thumb MEDIUMTEXT NULL,
    width INT NOT NULL DEFAULT 0,
    height INT NOT NULL DEFAULT 0,
    bytes INT NOT NULL DEFAULT 0,
    mime VARCHAR(40) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    uploaded_by VARCHAR(180) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (kind), INDEX (status)
  )");
  pos_q("CREATE TABLE IF NOT EXISTS login_page_campaigns (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    image_id VARCHAR(36) NULL,
    start_date DATE NULL,
    end_date DATE NULL,
    start_time VARCHAR(8) NULL,
    end_time VARCHAR(8) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  )");
  pos_q("CREATE TABLE IF NOT EXISTS login_page_versions (
    id VARCHAR(36) PRIMARY KEY,
    version INT NOT NULL,
    config_json MEDIUMTEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'draft',
    actor VARCHAR(180) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (version)
  )");
  pos_q("CREATE TABLE IF NOT EXISTS login_page_audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    actor VARCHAR(180) NULL,
    action VARCHAR(64) NOT NULL,
    ip VARCHAR(64) NULL,
    details_json MEDIUMTEXT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (created_at)
  )");
}

function pos_login_page_json($raw, $fallback) {
  if ($raw === null || $raw === "") return $fallback;
  $d = json_decode((string) $raw, true);
  return is_array($d) ? $d : $fallback;
}

function pos_login_page_actor($auth) {
  return (string) ($auth["admin"]["email"] ?? $auth["user"]["email"] ?? "master");
}

function pos_login_page_audit($auth, $action, $details) {
  pos_q(
    "INSERT INTO login_page_audit_logs (id, actor, action, ip, details_json) VALUES (?,?,?,?,?)",
    "sssss",
    [pos_login_page_id(), pos_login_page_actor($auth), $action, (string) ($_SERVER["REMOTE_ADDR"] ?? ""), json_encode($details)]
  );
}

function pos_login_page_validate($dataUrl, $maxKb) {
  $raw = (string) $dataUrl;
  if (!preg_match('#^data:image/(jpeg|jpg|png|webp);base64,#i', $raw)) {
    throw new Exception("Only JPG, PNG, or WebP images are allowed");
  }
  $parts = explode(",", $raw, 2);
  $b64 = $parts[1] ?? "";
  $bytes = (int) ceil(strlen($b64) * 3 / 4);
  $cap = min(2048, max(200, (int) $maxKb ?: 900));
  if ($bytes > $cap * 1024) throw new Exception("Image must be under {$cap} KB after compress");
  return $bytes;
}

function pos_login_page_bundle() {
  pos_ensure_login_page_schema();
  $rows = pos_q("SELECT * FROM login_page_settings WHERE id = 'login' LIMIT 1");
  $row = $rows[0] ?? null;
  return [
    "draft" => pos_login_page_json($row["draft_json"] ?? null, []),
    "published" => pos_login_page_json($row["published_json"] ?? null, null),
    "published_version" => (int) ($row["published_version"] ?? 0),
    "updated_by" => $row["updated_by"] ?? "",
    "images" => pos_q("SELECT id, name, kind, url, thumb, width, height, bytes, mime, status, uploaded_by, created_at FROM login_page_images WHERE status <> 'deleted' ORDER BY created_at DESC"),
    "campaigns" => pos_q("SELECT * FROM login_page_campaigns ORDER BY created_at DESC"),
    "versions" => pos_q("SELECT id, version, status, actor, created_at FROM login_page_versions ORDER BY version DESC LIMIT 40"),
    "audit" => pos_q("SELECT * FROM login_page_audit_logs ORDER BY created_at DESC LIMIT 80"),
  ];
}

function pos_login_page_save_draft($body, $auth) {
  $bundle = pos_login_page_bundle();
  $draft = array_merge(is_array($bundle["draft"]) ? $bundle["draft"] : [], is_array($body) ? $body : []);
  unset($draft["images"], $draft["campaigns"]);
  $json = json_encode($draft);
  $who = pos_login_page_actor($auth);
  $exists = pos_q("SELECT id FROM login_page_settings WHERE id = 'login' LIMIT 1");
  if (!$exists) {
    pos_q("INSERT INTO login_page_settings (id, draft_json, published_version, updated_by, updated_at) VALUES ('login', ?, 0, ?, CURRENT_TIMESTAMP(3))", "ss", [$json, $who]);
  } else {
    pos_q("UPDATE login_page_settings SET draft_json = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = 'login'", "ss", [$json, $who]);
  }
  pos_q("INSERT INTO login_page_versions (id, version, config_json, status, actor) VALUES (?,?,?,'draft',?)", "siss", [pos_login_page_id(), ((int) $bundle["published_version"]) + 1, $json, $who]);
  pos_login_page_audit($auth, "Login Text Changed", ["keys" => array_keys($body ?: [])]);
  return pos_login_page_bundle();
}

function pos_login_page_public() {
  $b = pos_login_page_bundle();
  $images = [];
  foreach ($b["images"] as $i) {
    $images[] = ["id" => $i["id"], "name" => $i["name"], "kind" => $i["kind"], "url" => $i["url"], "status" => $i["status"]];
  }
  return [
    "settings" => $b["published"] ?: new stdClass(),
    "images" => $images,
    "campaigns" => $b["campaigns"],
    "published_version" => $b["published_version"],
    "v" => $b["published_version"],
  ];
}

function pos_login_page_public_dispatch($path, $method, $body) {
  if ($path === "login-page" && $method === "GET") {
    header("Cache-Control: no-store");
    pos_send(200, pos_login_page_public());
    return true;
  }
  return false;
}

function pos_login_page_master_dispatch($path, $method, $body, $auth) {
  if (strpos($path, "master/login-page") !== 0) return false;
  if ($path === "master/login-page" && $method === "GET") {
    pos_send(200, pos_login_page_bundle());
    return true;
  }
  if ($path === "master/login-page" && $method === "POST") {
    pos_send(200, pos_login_page_save_draft($body, $auth));
    return true;
  }
  if ($path === "master/login-page/publish" && $method === "POST") {
    $b = pos_login_page_bundle();
    $next = ((int) $b["published_version"]) + 1;
    $json = json_encode($b["draft"] ?: []);
    $who = pos_login_page_actor($auth);
    pos_q("UPDATE login_page_settings SET published_json = ?, published_version = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = 'login'", "siss", [$json, $next, $who]);
    pos_q("INSERT INTO login_page_versions (id, version, config_json, status, actor) VALUES (?,?,?,'published',?)", "siss", [pos_login_page_id(), $next, $json, $who]);
    pos_login_page_audit($auth, "Campaign Published", ["version" => $next]);
    pos_send(200, pos_login_page_bundle());
    return true;
  }
  if ($path === "master/login-page/unpublish" && $method === "POST") {
    pos_q("UPDATE login_page_settings SET published_json = NULL, updated_by = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = 'login'", "s", [pos_login_page_actor($auth)]);
    pos_login_page_audit($auth, "Login Layout Changed", ["unpublished" => true]);
    pos_send(200, pos_login_page_bundle());
    return true;
  }
  if ($path === "master/login-page/images" && $method === "POST") {
    $bytes = pos_login_page_validate($body["dataUrl"] ?? "", $body["maxUploadKb"] ?? 900);
    $id = pos_login_page_id();
    pos_q(
      "INSERT INTO login_page_images (id, name, kind, url, thumb, width, height, bytes, mime, status, uploaded_by) VALUES (?,?,?,?,?,?,?,?,'image/jpeg','active',?)",
      "sssssiiis",
      [
        $id,
        substr((string) ($body["name"] ?? "Login image"), 0, 180),
        substr((string) ($body["kind"] ?? "library"), 0, 32),
        (string) ($body["dataUrl"] ?? ""),
        (string) ($body["thumb"] ?? $body["dataUrl"] ?? ""),
        (int) ($body["width"] ?? 0),
        (int) ($body["height"] ?? 0),
        $bytes,
        pos_login_page_actor($auth),
      ]
    );
    pos_login_page_audit($auth, "Image Uploaded", ["id" => $id]);
    pos_send(200, pos_login_page_bundle());
    return true;
  }
  if (preg_match('#^master/login-page/images/([^/]+)$#', $path, $m) && $method === "POST") {
    $id = $m[1];
    $rows = pos_q("SELECT * FROM login_page_images WHERE id = ? LIMIT 1", "s", [$id]);
    if (!$rows) throw new Exception("Image not found");
    if (($body["status"] ?? "") === "deleted") {
      pos_q("UPDATE login_page_images SET status = 'deleted' WHERE id = ?", "s", [$id]);
      pos_login_page_audit($auth, "Image Deleted", ["id" => $id]);
      pos_send(200, pos_login_page_bundle());
      return true;
    }
    $name = $body["name"] ?? $rows[0]["name"];
    $kind = $body["kind"] ?? $rows[0]["kind"];
    $url = $rows[0]["url"];
    if (!empty($body["dataUrl"])) {
      pos_login_page_validate($body["dataUrl"], $body["maxUploadKb"] ?? 900);
      $url = $body["dataUrl"];
      pos_login_page_audit($auth, "Image Replaced", ["id" => $id]);
    }
    pos_q("UPDATE login_page_images SET name = ?, kind = ?, url = ? WHERE id = ?", "ssss", [$name, $kind, $url, $id]);
    pos_send(200, pos_login_page_bundle());
    return true;
  }
  if ($path === "master/login-page/campaigns" && $method === "POST") {
    $id = (string) ($body["id"] ?? pos_login_page_id());
    $exists = pos_q("SELECT id FROM login_page_campaigns WHERE id = ? LIMIT 1", "s", [$id]);
    $status = (($body["status"] ?? "") === "active") ? "active" : "draft";
    $name = substr((string) ($body["name"] ?? "Campaign"), 0, 180);
    $image = $body["image_id"] ?? null;
    $sd = $body["start_date"] ?? null;
    $ed = $body["end_date"] ?? null;
    $st = $body["start_time"] ?? "00:00";
    $et = $body["end_time"] ?? "23:59";
    if ($exists) {
      pos_q("UPDATE login_page_campaigns SET name=?, image_id=?, start_date=?, end_date=?, start_time=?, end_time=?, status=? WHERE id=?", "ssssssss", [$name, $image, $sd, $ed, $st, $et, $status, $id]);
    } else {
      pos_q("INSERT INTO login_page_campaigns (id, name, image_id, start_date, end_date, start_time, end_time, status) VALUES (?,?,?,?,?,?,?,?)", "ssssssss", [$id, $name, $image, $sd, $ed, $st, $et, $status]);
    }
    pos_login_page_audit($auth, "Campaign Published", ["id" => $id, "status" => $status]);
    pos_send(200, pos_login_page_bundle());
    return true;
  }
  if (preg_match('#^master/login-page/versions/([^/]+)/restore$#', $path, $m) && $method === "POST") {
    $rows = pos_q("SELECT * FROM login_page_versions WHERE id = ? LIMIT 1", "s", [$m[1]]);
    if (!$rows) throw new Exception("Version not found");
    pos_q("UPDATE login_page_settings SET draft_json = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = 'login'", "ss", [$rows[0]["config_json"], pos_login_page_actor($auth)]);
    pos_login_page_audit($auth, "Login Layout Changed", ["restore" => $rows[0]["version"]]);
    pos_send(200, pos_login_page_bundle());
    return true;
  }
  return false;
}
