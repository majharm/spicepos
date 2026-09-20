<?php
function pos_seo_categories() {
  return ["Retail","Pharmacy","Restaurant","Cafe","Salon","Spa","Garment","Grocery","Supermarket","Dairy","Electronics","Hardware","Bakery","Wholesale","Service Business"];
}

function pos_default_robots() {
  return "User-agent: *\nAllow: /\nAllow: /about.html\nAllow: /home.html\nDisallow: /index.html\nDisallow: /login.html\nDisallow: /master.html\nDisallow: /setup.html\nDisallow: /api/\nDisallow: /server/\nDisallow: /pos-data/\n";
}

function pos_ensure_seo_schema() {
  pos_q("CREATE TABLE IF NOT EXISTS seo_settings (
    id VARCHAR(16) PRIMARY KEY,
    site_title VARCHAR(160) NULL,
    default_description VARCHAR(320) NULL,
    default_keywords TEXT NULL,
    default_og_image VARCHAR(255) NULL,
    default_robots TEXT NULL,
    default_canonical VARCHAR(255) NULL,
    default_schema VARCHAR(64) NULL,
    google_site_verification VARCHAR(128) NULL,
    bing_verification VARCHAR(128) NULL,
    robots_txt TEXT NULL,
    sitemap_xml MEDIUMTEXT NULL,
    updated_at TIMESTAMP(3) NULL
  )");
  pos_q("CREATE TABLE IF NOT EXISTS seo_keywords (
    id VARCHAR(36) PRIMARY KEY,
    keyword VARCHAR(180) NOT NULL,
    variations TEXT NULL,
    keyword_type VARCHAR(32) NOT NULL DEFAULT 'Secondary',
    search_intent VARCHAR(48) NOT NULL DEFAULT 'Informational',
    business_type VARCHAR(64) NULL,
    business_category VARCHAR(64) NULL,
    target_page VARCHAR(180) NULL,
    target_url VARCHAR(255) NULL,
    country VARCHAR(64) NULL,
    state VARCHAR(64) NULL,
    city VARCHAR(64) NULL,
    area VARCHAR(64) NULL,
    language VARCHAR(16) NOT NULL DEFAULT 'en',
    priority VARCHAR(16) NOT NULL DEFAULT 'Medium',
    status VARCHAR(16) NOT NULL DEFAULT 'draft',
    group_id VARCHAR(36) NULL,
    reported_position DECIMAL(8,2) NULL,
    estimated_traffic INT NOT NULL DEFAULT 0,
    notes VARCHAR(500) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NULL,
    INDEX (status), INDEX (keyword)
  )");
  pos_q("CREATE TABLE IF NOT EXISTS seo_keyword_groups (
    id VARCHAR(36) PRIMARY KEY, name VARCHAR(128) NOT NULL, business_category VARCHAR(64) NULL, notes VARCHAR(500) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  )");
  pos_q("CREATE TABLE IF NOT EXISTS seo_pages (
    id VARCHAR(36) PRIMARY KEY, title VARCHAR(180) NOT NULL, url VARCHAR(180) NOT NULL, slug VARCHAR(180) NOT NULL,
    primary_keyword VARCHAR(180) NULL, secondary_keywords TEXT NULL, seo_title VARCHAR(160) NULL, meta_description VARCHAR(320) NULL,
    h1 VARCHAR(180) NULL, h2_suggestions TEXT NULL, canonical VARCHAR(255) NULL, og_title VARCHAR(160) NULL, og_description VARCHAR(320) NULL,
    og_image VARCHAR(255) NULL, twitter_title VARCHAR(160) NULL, twitter_description VARCHAR(320) NULL, schema_type VARCHAR(64) NULL,
    robots VARCHAR(64) NULL, index_status VARCHAR(16) NOT NULL DEFAULT 'index', follow_status VARCHAR(16) NOT NULL DEFAULT 'follow',
    publish_status VARCHAR(16) NOT NULL DEFAULT 'draft', business_category VARCHAR(64) NULL, country VARCHAR(64) NULL, state VARCHAR(64) NULL,
    city VARCHAR(64) NULL, hero_heading VARCHAR(180) NULL, intro TEXT NULL, features TEXT NULL, benefits TEXT NULL, use_cases TEXT NULL,
    cta VARCHAR(255) NULL, related_pages TEXT NULL, faq_json TEXT NULL, seo_score INT NOT NULL DEFAULT 0, approved TINYINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(3) NULL, UNIQUE KEY uq_seo_url (url)
  )");
  pos_q("CREATE TABLE IF NOT EXISTS seo_locations (id VARCHAR(36) PRIMARY KEY, country VARCHAR(64) NULL, state VARCHAR(64) NULL, city VARCHAR(64) NULL, area VARCHAR(64) NULL, status VARCHAR(16) NOT NULL DEFAULT 'active')");
  pos_q("CREATE TABLE IF NOT EXISTS seo_internal_links (id VARCHAR(36) PRIMARY KEY, source_url VARCHAR(180) NOT NULL, target_url VARCHAR(180) NOT NULL, anchor_text VARCHAR(180) NOT NULL, priority VARCHAR(16) NOT NULL DEFAULT 'Medium', status VARCHAR(16) NOT NULL DEFAULT 'active')");
  pos_q("CREATE TABLE IF NOT EXISTS seo_redirects (id VARCHAR(36) PRIMARY KEY, old_url VARCHAR(255) NOT NULL, new_url VARCHAR(255) NOT NULL, redirect_type VARCHAR(8) NOT NULL DEFAULT '301', status VARCHAR(16) NOT NULL DEFAULT 'active', hit_count INT NOT NULL DEFAULT 0)");
  pos_q("CREATE TABLE IF NOT EXISTS seo_faq (id VARCHAR(36) PRIMARY KEY, question VARCHAR(255) NOT NULL, answer TEXT NULL, business_type VARCHAR(64) NULL, category VARCHAR(64) NULL, target_page VARCHAR(180) NULL, priority VARCHAR(16) NOT NULL DEFAULT 'Medium', status VARCHAR(16) NOT NULL DEFAULT 'draft')");
  pos_q("CREATE TABLE IF NOT EXISTS seo_broken_urls (id VARCHAR(36) PRIMARY KEY, url VARCHAR(255) NOT NULL, status_code INT NOT NULL DEFAULT 404, source VARCHAR(255) NULL, last_detected TIMESTAMP(3) NULL, suggested_action VARCHAR(64) NULL, status VARCHAR(16) NOT NULL DEFAULT 'open')");
  pos_q("CREATE TABLE IF NOT EXISTS seo_templates (id VARCHAR(36) PRIMARY KEY, name VARCHAR(128) NOT NULL, title_tpl VARCHAR(180) NULL, description_tpl VARCHAR(320) NULL, status VARCHAR(16) NOT NULL DEFAULT 'active')");
  pos_q("CREATE TABLE IF NOT EXISTS seo_activity_logs (id VARCHAR(36) PRIMARY KEY, actor VARCHAR(128) NULL, action VARCHAR(64) NOT NULL, page_url VARCHAR(180) NULL, keyword VARCHAR(180) NULL, old_value TEXT NULL, new_value TEXT NULL, ip VARCHAR(64) NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))");
  $row = pos_q("SELECT id FROM seo_settings WHERE id = 'platform' LIMIT 1");
  if (!$row) {
    $r = pos_default_robots();
    pos_q("INSERT INTO seo_settings (id, site_title, default_description, robots_txt, default_schema, updated_at) VALUES ('platform','ATAV POS','Billing, inventory, customers and reports with ATAV POS.', ?, 'SoftwareApplication', CURRENT_TIMESTAMP(3))", "s", [$r]);
  }
}

function pos_seo_cnt($sql) {
  $rows = pos_q($sql);
  return (int) ($rows[0]["n"] ?? 0);
}

function pos_seo_suggest($body) {
  $biz = strtolower(trim((string) ($body["businessType"] ?? $body["business_type"] ?? "")));
  $svc = strtolower(trim((string) ($body["service"] ?? "POS software"))) ?: "pos software";
  $loc = trim((string) ($body["location"] ?? ""));
  if ($biz === "") return [];
  $bit = $loc !== "" ? " " . $loc : "";
  $in = $loc !== "" ? " in " . $loc : "";
  $out = [
    "$biz $svc$bit",
    "$biz billing software$bit",
    "$biz inventory software$bit",
    "$biz billing and inventory software$bit",
    "best $biz POS software$in",
  ];
  return array_values(array_unique($out));
}

function pos_seo_overview() {
  pos_ensure_seo_schema();
  $total = pos_seo_cnt("SELECT COUNT(*) AS n FROM seo_keywords");
  $used = pos_seo_cnt("SELECT COUNT(*) AS n FROM seo_keywords WHERE target_url IS NOT NULL AND target_url <> ''");
  $pos = pos_q("SELECT AVG(reported_position) AS n FROM seo_keywords WHERE reported_position IS NOT NULL AND reported_position > 0");
  $traf = pos_q("SELECT SUM(estimated_traffic) AS n FROM seo_keywords");
  return [
    "source" => "seo_workspace",
    "php" => true,
    "note" => "Counts are keywords and pages stored by Master Admin. Average position and estimated traffic are optional stored values, not live Google ranks.",
    "kpis" => [
      "total_keywords" => $total,
      "active_keywords" => pos_seo_cnt("SELECT COUNT(*) AS n FROM seo_keywords WHERE status = 'active'"),
      "primary_keywords" => pos_seo_cnt("SELECT COUNT(*) AS n FROM seo_keywords WHERE keyword_type = 'Primary'"),
      "secondary_keywords" => pos_seo_cnt("SELECT COUNT(*) AS n FROM seo_keywords WHERE keyword_type = 'Secondary'"),
      "long_tail_keywords" => pos_seo_cnt("SELECT COUNT(*) AS n FROM seo_keywords WHERE keyword_type = 'Long Tail'"),
      "keywords_used" => $used,
      "keywords_not_used" => max(0, $total - $used),
      "pages_optimized" => pos_seo_cnt("SELECT COUNT(*) AS n FROM seo_pages"),
      "pages_published" => pos_seo_cnt("SELECT COUNT(*) AS n FROM seo_pages WHERE publish_status = 'published'"),
      "average_position" => isset($pos[0]["n"]) ? round((float) $pos[0]["n"], 1) : null,
      "estimated_traffic" => (int) ($traf[0]["n"] ?? 0),
      "keyword_opportunities" => pos_seo_cnt("SELECT COUNT(*) AS n FROM seo_keywords WHERE status IN ('draft','opportunity')"),
    ],
  ];
}

function pos_seo_master_dispatch($path, $method, $body) {
  pos_ensure_seo_schema();
  if ($path === "master/seo/overview" && $method === "GET") { pos_send(200, pos_seo_overview()); return true; }
  if ($path === "master/seo/catalog" && $method === "GET") {
    pos_send(200, ["categories" => pos_seo_categories(), "types" => ["Primary","Secondary","Long Tail","Local","Branded","Commercial","Informational","Transactional"], "intents" => ["Informational","Commercial Investigation","Transactional","Navigational","Local"], "php" => true]);
    return true;
  }
  if ($path === "master/seo/keywords" && $method === "GET") {
    pos_send(200, pos_q("SELECT * FROM seo_keywords ORDER BY sort_order, keyword LIMIT 2000"));
    return true;
  }
  if ($path === "master/seo/keywords" && $method === "POST") {
    $kw = trim((string) ($body["keyword"] ?? ""));
    if ($kw === "") pos_send(400, ["error" => "Keyword is required"]);
    $id = trim((string) ($body["id"] ?? "")) ?: pos_uuid();
    $type = (string) ($body["keyword_type"] ?? "Secondary");
    $intent = (string) ($body["search_intent"] ?? "Informational");
    $prio = (string) ($body["priority"] ?? "Medium");
    $status = (string) ($body["status"] ?? "draft");
    $vars = json_encode($body["variations"] ?? []);
    pos_q(
      "INSERT INTO seo_keywords (id, keyword, variations, keyword_type, search_intent, business_type, business_category, target_page, target_url, country, state, city, area, language, priority, status, notes, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE keyword=VALUES(keyword), variations=VALUES(variations), keyword_type=VALUES(keyword_type), search_intent=VALUES(search_intent),
         business_type=VALUES(business_type), business_category=VALUES(business_category), target_page=VALUES(target_page), target_url=VALUES(target_url),
         country=VALUES(country), state=VALUES(state), city=VALUES(city), area=VALUES(area), language=VALUES(language), priority=VALUES(priority),
         status=VALUES(status), notes=VALUES(notes), updated_at=CURRENT_TIMESTAMP(3)",
      "sssssssssssssssss",
      [$id, $kw, $vars, $type, $intent, (string) ($body["business_type"] ?? ""), (string) ($body["business_category"] ?? ""),
        (string) ($body["target_page"] ?? ""), (string) ($body["target_url"] ?? ""), (string) ($body["country"] ?? ""),
        (string) ($body["state"] ?? ""), (string) ($body["city"] ?? ""), (string) ($body["area"] ?? ""), (string) ($body["language"] ?? "en"),
        $prio, $status, (string) ($body["notes"] ?? "")]
    );
    pos_send(200, ["ok" => true, "id" => $id, "php" => true]);
    return true;
  }
  if ($path === "master/seo/keywords/bulk" && $method === "POST") {
    $ids = $body["ids"] ?? [];
    if (!is_array($ids) || !$ids) pos_send(400, ["error" => "Select keywords"]);
    $act = (string) ($body["action"] ?? "");
    foreach ($ids as $id) {
      $id = substr((string) $id, 0, 36);
      if ($act === "delete") pos_q("DELETE FROM seo_keywords WHERE id = ?", "s", [$id]);
      elseif ($act === "activate") pos_q("UPDATE seo_keywords SET status='active' WHERE id = ?", "s", [$id]);
      elseif ($act === "deactivate") pos_q("UPDATE seo_keywords SET status='inactive' WHERE id = ?", "s", [$id]);
    }
    pos_send(200, ["ok" => true, "php" => true]);
    return true;
  }
  if ($path === "master/seo/export" && $method === "GET") {
    $rows = pos_q("SELECT keyword, keyword_type, business_category, city, search_intent, target_url, status FROM seo_keywords ORDER BY keyword");
    $lines = ["keyword,type,category,city,intent,url,status"];
    foreach ($rows as $r) $lines[] = implode(",", [$r["keyword"], $r["keyword_type"], $r["business_category"], $r["city"], $r["search_intent"], $r["target_url"], $r["status"]]);
    pos_send(200, ["csv" => implode("\n", $lines), "php" => true]);
    return true;
  }
  if ($path === "master/seo/groups" && $method === "GET") { pos_send(200, pos_q("SELECT * FROM seo_keyword_groups ORDER BY name")); return true; }
  if ($path === "master/seo/groups" && $method === "POST") {
    $id = pos_uuid();
    pos_q("INSERT INTO seo_keyword_groups (id, name, business_category, notes) VALUES (?,?,?,?)", "ssss", [
      $id, substr((string) ($body["name"] ?? "Group"), 0, 128), (string) ($body["business_category"] ?? ""), (string) ($body["notes"] ?? "")
    ]);
    pos_send(200, ["ok" => true, "id" => $id, "php" => true]);
    return true;
  }
  if ($path === "master/seo/pages" && $method === "GET") { pos_send(200, pos_q("SELECT * FROM seo_pages ORDER BY url")); return true; }
  if ($path === "master/seo/pages" && $method === "POST") {
    $id = trim((string) ($body["id"] ?? "")) ?: pos_uuid();
    $title = substr((string) ($body["title"] ?? "Untitled"), 0, 180);
    $url = substr((string) ($body["url"] ?? $body["slug"] ?? "/"), 0, 180);
    pos_q(
      "INSERT INTO seo_pages (id, title, url, slug, primary_keyword, seo_title, meta_description, h1, canonical, index_status, follow_status, publish_status, business_category, hero_heading, intro, features, benefits, use_cases, cta, approved, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE title=VALUES(title), url=VALUES(url), slug=VALUES(slug), primary_keyword=VALUES(primary_keyword), seo_title=VALUES(seo_title),
         meta_description=VALUES(meta_description), h1=VALUES(h1), canonical=VALUES(canonical), index_status=VALUES(index_status), follow_status=VALUES(follow_status),
         publish_status=VALUES(publish_status), business_category=VALUES(business_category), hero_heading=VALUES(hero_heading), intro=VALUES(intro), features=VALUES(features),
         benefits=VALUES(benefits), use_cases=VALUES(use_cases), cta=VALUES(cta), approved=VALUES(approved), updated_at=CURRENT_TIMESTAMP(3)",
      "ssssssssssssssssssssi",
      [
        $id, $title, $url, ltrim($url, "/"), (string) ($body["primary_keyword"] ?? ""), (string) ($body["seo_title"] ?? ""),
        (string) ($body["meta_description"] ?? ""), (string) ($body["h1"] ?? ""), (string) ($body["canonical"] ?? ""),
        (($body["index_status"] ?? "") === "noindex") ? "noindex" : "index",
        (($body["follow_status"] ?? "") === "nofollow") ? "nofollow" : "follow",
        (string) ($body["publish_status"] ?? "draft"), (string) ($body["business_category"] ?? ""),
        (string) ($body["hero_heading"] ?? ""), (string) ($body["intro"] ?? ""), (string) ($body["features"] ?? ""),
        (string) ($body["benefits"] ?? ""), (string) ($body["use_cases"] ?? ""), (string) ($body["cta"] ?? ""),
        empty($body["approved"]) ? 0 : 1,
      ]
    );
    pos_send(200, ["ok" => true, "id" => $id, "php" => true]);
    return true;
  }
  if (preg_match("#^master/seo/pages/([^/]+)/publish$#", $path, $m) && $method === "POST") {
    $rows = pos_q("SELECT * FROM seo_pages WHERE id = ? LIMIT 1", "s", [$m[1]]);
    $p = $rows[0] ?? null;
    if (!$p) pos_send(404, ["error" => "Page not found"]);
    $len = strlen(trim(($p["intro"] ?? "") . ($p["features"] ?? "") . ($p["benefits"] ?? "")));
    if ($len < 280) pos_send(400, ["error" => "Approve only pages with unique intro/features/benefits (at least 280 characters)."]);
    if (empty($p["approved"])) pos_send(400, ["error" => "Master Admin must approve the page before publishing."]);
    pos_q("UPDATE seo_pages SET publish_status='published' WHERE id = ?", "s", [$m[1]]);
    pos_send(200, ["ok" => true, "php" => true]);
    return true;
  }
  if ($path === "master/seo/locations" && $method === "GET") { pos_send(200, pos_q("SELECT * FROM seo_locations ORDER BY city")); return true; }
  if ($path === "master/seo/locations" && $method === "POST") {
    $id = pos_uuid();
    pos_q("INSERT INTO seo_locations (id, country, state, city, area, status) VALUES (?,?,?,?,?,'active')", "sssss", [
      $id, (string) ($body["country"] ?? ""), (string) ($body["state"] ?? ""), (string) ($body["city"] ?? ""), (string) ($body["area"] ?? "")
    ]);
    $place = trim((string) ($body["city"] ?? $body["state"] ?? $body["country"] ?? ""));
    pos_send(200, ["ok" => true, "id" => $id, "phrase" => trim(($body["base"] ?? "POS software") . ($place ? " in $place" : "")), "php" => true]);
    return true;
  }
  if ($path === "master/seo/generate" && $method === "POST") {
    pos_send(200, ["suggestions" => pos_seo_suggest($body), "note" => "Suggestions are not saved until you add them.", "php" => true]);
    return true;
  }
  if ($path === "master/seo/links" && $method === "GET") { pos_send(200, pos_q("SELECT * FROM seo_internal_links ORDER BY source_url")); return true; }
  if ($path === "master/seo/links" && $method === "POST") {
    $id = pos_uuid();
    pos_q("INSERT INTO seo_internal_links (id, source_url, target_url, anchor_text, priority, status) VALUES (?,?,?,?,?,'active')", "sssss", [
      $id, (string) ($body["source_url"] ?? ""), (string) ($body["target_url"] ?? ""), (string) ($body["anchor_text"] ?? ""), (string) ($body["priority"] ?? "Medium")
    ]);
    pos_send(200, ["ok" => true, "id" => $id, "php" => true]);
    return true;
  }
  if ($path === "master/seo/faq" && $method === "GET") { pos_send(200, pos_q("SELECT * FROM seo_faq ORDER BY question")); return true; }
  if ($path === "master/seo/faq" && $method === "POST") {
    $id = pos_uuid();
    pos_q("INSERT INTO seo_faq (id, question, answer, business_type, category, target_page, priority, status) VALUES (?,?,?,?,?,?,?,?)", "ssssssss", [
      $id, (string) ($body["question"] ?? ""), (string) ($body["answer"] ?? ""), (string) ($body["business_type"] ?? ""),
      (string) ($body["category"] ?? ""), (string) ($body["target_page"] ?? ""), (string) ($body["priority"] ?? "Medium"),
      (($body["status"] ?? "") === "active") ? "active" : "draft"
    ]);
    pos_send(200, ["ok" => true, "id" => $id, "php" => true]);
    return true;
  }
  if ($path === "master/seo/redirects" && $method === "GET") { pos_send(200, pos_q("SELECT * FROM seo_redirects ORDER BY old_url")); return true; }
  if ($path === "master/seo/redirects" && $method === "POST") {
    $id = pos_uuid();
    pos_q("INSERT INTO seo_redirects (id, old_url, new_url, redirect_type, status) VALUES (?,?,?,?,'active')", "ssss", [
      $id, (string) ($body["old_url"] ?? ""), (string) ($body["new_url"] ?? ""), (($body["redirect_type"] ?? "") === "302") ? "302" : "301"
    ]);
    pos_send(200, ["ok" => true, "id" => $id, "php" => true]);
    return true;
  }
  if ($path === "master/seo/broken" && $method === "GET") { pos_send(200, pos_q("SELECT * FROM seo_broken_urls ORDER BY last_detected DESC")); return true; }
  if ($path === "master/seo/conflicts" && $method === "GET") {
    $rows = pos_q("SELECT primary_keyword AS keyword, GROUP_CONCAT(url) AS pages, COUNT(*) AS n FROM seo_pages WHERE primary_keyword IS NOT NULL AND primary_keyword <> '' GROUP BY primary_keyword HAVING n > 1");
    pos_send(200, ["conflicts" => $rows, "note" => "Potential keyword cannibalization in stored pages. Live pages are not changed automatically.", "php" => true]);
    return true;
  }
  if ($path === "master/seo/usage" && $method === "GET") { pos_send(200, []); return true; }
  if ($path === "master/seo/templates" && $method === "GET") { pos_send(200, pos_q("SELECT * FROM seo_templates ORDER BY name")); return true; }
  if ($path === "master/seo/templates" && $method === "POST") {
    $id = pos_uuid();
    pos_q("INSERT INTO seo_templates (id, name, title_tpl, description_tpl, status) VALUES (?,?,?,?,'active')", "ssss", [
      $id, (string) ($body["name"] ?? "Template"), (string) ($body["title_tpl"] ?? ""), (string) ($body["description_tpl"] ?? "")
    ]);
    pos_send(200, ["ok" => true, "id" => $id, "php" => true]);
    return true;
  }
  if ($path === "master/seo/settings" && $method === "GET") {
    $rows = pos_q("SELECT * FROM seo_settings WHERE id='platform' LIMIT 1");
    pos_send(200, ($rows[0] ?? []) + ["php" => true]);
    return true;
  }
  if ($path === "master/seo/settings" && $method === "POST") {
    pos_q(
      "UPDATE seo_settings SET site_title=?, default_description=?, default_keywords=?, default_og_image=?, default_canonical=?, default_schema=?, google_site_verification=?, bing_verification=?, updated_at=CURRENT_TIMESTAMP(3) WHERE id='platform'",
      "ssssssss",
      [
        (string) ($body["site_title"] ?? ""), (string) ($body["default_description"] ?? ""), (string) ($body["default_keywords"] ?? ""),
        (string) ($body["default_og_image"] ?? ""), (string) ($body["default_canonical"] ?? ""), (string) ($body["default_schema"] ?? ""),
        (string) ($body["google_site_verification"] ?? ""), (string) ($body["bing_verification"] ?? ""),
      ]
    );
    pos_send(200, ["ok" => true, "php" => true]);
    return true;
  }
  if ($path === "master/seo/sitemap/generate" && $method === "POST") {
    $pages = pos_q("SELECT url FROM seo_pages WHERE publish_status='published' AND index_status <> 'noindex'");
    $xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n  <url><loc>https://pos.atavtelecom.in/</loc></url>\n  <url><loc>https://pos.atavtelecom.in/about.html</loc></url>\n";
    foreach ($pages as $p) $xml .= "  <url><loc>https://pos.atavtelecom.in" . htmlspecialchars($p["url"]) . "</loc></url>\n";
    $xml .= "</urlset>\n";
    @file_put_contents(__DIR__ . "/sitemap.xml", $xml);
    pos_q("UPDATE seo_settings SET sitemap_xml=?, updated_at=CURRENT_TIMESTAMP(3) WHERE id='platform'", "s", [$xml]);
    pos_send(200, ["ok" => true, "urls" => 2 + count($pages), "xml" => $xml, "php" => true]);
    return true;
  }
  if ($path === "master/seo/robots" && $method === "POST") {
    $txt = (string) ($body["robots_txt"] ?? pos_default_robots());
    if (!preg_match("/disallow:\\s*\\/api/i", $txt)) pos_send(400, ["error" => "robots.txt must Disallow /api/ so the POS application is not indexed."]);
    @file_put_contents(__DIR__ . "/robots.txt", $txt);
    pos_q("UPDATE seo_settings SET robots_txt=?, updated_at=CURRENT_TIMESTAMP(3) WHERE id='platform'", "s", [$txt]);
    pos_send(200, ["ok" => true, "robots_txt" => $txt, "php" => true]);
    return true;
  }
  if ($path === "master/seo/activity" && $method === "GET") { pos_send(200, pos_q("SELECT * FROM seo_activity_logs ORDER BY created_at DESC LIMIT 200")); return true; }
  return false;
}
