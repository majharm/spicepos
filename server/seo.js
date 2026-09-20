import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "./db.js";
import { requireMaster } from "./auth.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SEO_CATEGORIES = [
  "Retail", "Pharmacy", "Restaurant", "Cafe", "Salon", "Spa", "Garment", "Grocery",
  "Supermarket", "Dairy", "Electronics", "Hardware", "Bakery", "Wholesale", "Service Business",
];
export const KEYWORD_TYPES = [
  "Primary", "Secondary", "Long Tail", "Local", "Branded", "Commercial", "Informational", "Transactional",
];
export const SEARCH_INTENTS = [
  "Informational", "Commercial Investigation", "Transactional", "Navigational", "Local",
];
export const RESERVED_SLUGS = new Set([
  "api", "js", "css", "assets", "server", "scripts", "node_modules", "legal", "uploads", "pos-data",
  "index", "login", "master", "setup", "qr", "order", "invoice", "about", "privacy", "terms",
  "cookies", "refund", "shipping", "health", "favicon", "home",
]);

export const DEFAULT_ROBOTS = `User-agent: *
Allow: /
Allow: /about.html
Allow: /home.html
Disallow: /index.html
Disallow: /login.html
Disallow: /master.html
Disallow: /setup.html
Disallow: /api/
Disallow: /server/
Disallow: /pos-data/
`;

function uid() {
  return crypto.randomUUID();
}

function clip(v, n) {
  return String(v ?? "").trim().slice(0, n);
}

function jsonCol(v, fallback) {
  if (Array.isArray(v) || (v && typeof v === "object")) return JSON.stringify(v);
  if (typeof v === "string" && v.trim().startsWith("[")) {
    try {
      JSON.parse(v);
      return v;
    } catch {
      /* fall through */
    }
  }
  return JSON.stringify(fallback);
}

function parseJson(v, fallback) {
  try {
    const x = typeof v === "string" ? JSON.parse(v || "null") : v;
    return x == null ? fallback : x;
  } catch {
    return fallback;
  }
}

export function suggestKeywords({ businessType = "", service = "POS software", location = "" }) {
  const biz = clip(businessType, 40).toLowerCase();
  const svc = clip(service, 40).toLowerCase() || "pos software";
  const loc = clip(location, 40);
  const locBit = loc ? ` ${loc}` : "";
  if (!biz) return [];
  const rows = [
    `${biz} ${svc}${locBit}`,
    `${biz} billing software${locBit}`,
    `${biz} inventory software${locBit}`,
    `${biz} billing and inventory software${locBit}`,
    `best ${biz} POS software${loc ? ` in ${loc}` : ""}`,
  ];
  const extra = {
    pharmacy: [`medical shop POS${locBit}`, `medicine stock management software${locBit}`, `pharmacy POS with expiry management${locBit}`],
    garment: [`clothing store POS${locBit}`, `fashion store billing software${locBit}`, `garment POS with size and color management${locBit}`],
    restaurant: [`restaurant table management software${locBit}`, `restaurant QR ordering software${locBit}`, `restaurant POS with KOT${locBit}`],
    salon: [`salon appointment software${locBit}`, `spa management software${locBit}`, `beauty salon POS${locBit}`],
    spa: [`spa management software${locBit}`, `salon POS software${locBit}`],
  };
  const more = extra[biz] || extra[biz.split(" ")[0]] || [];
  return [...new Set([...rows, ...more].map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

export function applyTemplate(tpl, vars = {}) {
  return String(tpl || "").replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? vars[k?.toLowerCase()] ?? ""));
}

export function scoreSeoPage(page = {}) {
  let score = 0;
  const title = clip(page.meta_title || page.seo_title, 120);
  const desc = clip(page.meta_description, 320);
  const h1 = clip(page.h1, 160);
  const slug = clip(page.slug || page.url, 180);
  const primary = clip(page.primary_keyword, 120).toLowerCase();
  const body = `${page.intro || ""} ${page.hero_heading || ""} ${page.features || ""}`.toLowerCase();
  const checks = {};
  checks.title = title.length >= 20 && title.length <= 60;
  checks.meta = desc.length >= 70 && desc.length <= 160;
  checks.h1 = h1.length >= 8;
  checks.url = /^\/[a-z0-9/-]+$/.test(slug) && !slug.includes("//");
  checks.keyword = Boolean(primary);
  checks.titleKw = primary ? title.toLowerCase().includes(primary) : false;
  checks.h1Kw = primary ? h1.toLowerCase().includes(primary) : false;
  checks.metaKw = primary ? desc.toLowerCase().includes(primary) : false;
  checks.content = body.length >= 280;
  checks.contentKw = primary ? body.includes(primary) : false;
  checks.canonical = Boolean(clip(page.canonical, 255));
  checks.og = Boolean(clip(page.og_title, 120));
  checks.schema = Boolean(clip(page.schema_type, 64));
  const weights = { title: 10, meta: 10, h1: 8, url: 8, keyword: 8, titleKw: 8, h1Kw: 8, metaKw: 6, content: 12, contentKw: 8, canonical: 6, og: 4, schema: 4 };
  for (const [k, w] of Object.entries(weights)) if (checks[k]) score += w;
  let grade = "Critical";
  if (score >= 80) grade = "Excellent";
  else if (score >= 55) grade = "Needs Improvement";
  return { score, grade, checks, note: "On-page checklist only. This is not a Google ranking." };
}

export async function ensureSeoSchema() {
  await query(`CREATE TABLE IF NOT EXISTS seo_settings (
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
  )`);
  await query(`CREATE TABLE IF NOT EXISTS seo_keywords (
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
    INDEX (status), INDEX (business_category), INDEX (keyword)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS seo_keyword_groups (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    business_category VARCHAR(64) NULL,
    notes VARCHAR(500) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS seo_pages (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(180) NOT NULL,
    url VARCHAR(180) NOT NULL,
    slug VARCHAR(180) NOT NULL,
    primary_keyword VARCHAR(180) NULL,
    secondary_keywords TEXT NULL,
    seo_title VARCHAR(160) NULL,
    meta_description VARCHAR(320) NULL,
    h1 VARCHAR(180) NULL,
    h2_suggestions TEXT NULL,
    canonical VARCHAR(255) NULL,
    og_title VARCHAR(160) NULL,
    og_description VARCHAR(320) NULL,
    og_image VARCHAR(255) NULL,
    twitter_title VARCHAR(160) NULL,
    twitter_description VARCHAR(320) NULL,
    schema_type VARCHAR(64) NULL,
    robots VARCHAR(64) NULL,
    index_status VARCHAR(16) NOT NULL DEFAULT 'index',
    follow_status VARCHAR(16) NOT NULL DEFAULT 'follow',
    publish_status VARCHAR(16) NOT NULL DEFAULT 'draft',
    business_category VARCHAR(64) NULL,
    country VARCHAR(64) NULL,
    state VARCHAR(64) NULL,
    city VARCHAR(64) NULL,
    hero_heading VARCHAR(180) NULL,
    intro TEXT NULL,
    features TEXT NULL,
    benefits TEXT NULL,
    use_cases TEXT NULL,
    cta VARCHAR(255) NULL,
    related_pages TEXT NULL,
    faq_json TEXT NULL,
    seo_score INT NOT NULL DEFAULT 0,
    approved TINYINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(3) NULL,
    UNIQUE KEY uq_seo_url (url)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS seo_locations (
    id VARCHAR(36) PRIMARY KEY,
    country VARCHAR(64) NULL,
    state VARCHAR(64) NULL,
    city VARCHAR(64) NULL,
    area VARCHAR(64) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active'
  )`);
  await query(`CREATE TABLE IF NOT EXISTS seo_internal_links (
    id VARCHAR(36) PRIMARY KEY,
    source_url VARCHAR(180) NOT NULL,
    target_url VARCHAR(180) NOT NULL,
    anchor_text VARCHAR(180) NOT NULL,
    priority VARCHAR(16) NOT NULL DEFAULT 'Medium',
    status VARCHAR(16) NOT NULL DEFAULT 'active'
  )`);
  await query(`CREATE TABLE IF NOT EXISTS seo_redirects (
    id VARCHAR(36) PRIMARY KEY,
    old_url VARCHAR(255) NOT NULL,
    new_url VARCHAR(255) NOT NULL,
    redirect_type VARCHAR(8) NOT NULL DEFAULT '301',
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    hit_count INT NOT NULL DEFAULT 0
  )`);
  await query(`CREATE TABLE IF NOT EXISTS seo_faq (
    id VARCHAR(36) PRIMARY KEY,
    question VARCHAR(255) NOT NULL,
    answer TEXT NULL,
    business_type VARCHAR(64) NULL,
    category VARCHAR(64) NULL,
    target_page VARCHAR(180) NULL,
    priority VARCHAR(16) NOT NULL DEFAULT 'Medium',
    status VARCHAR(16) NOT NULL DEFAULT 'draft'
  )`);
  await query(`CREATE TABLE IF NOT EXISTS seo_broken_urls (
    id VARCHAR(36) PRIMARY KEY,
    url VARCHAR(255) NOT NULL,
    status_code INT NOT NULL DEFAULT 404,
    source VARCHAR(255) NULL,
    last_detected TIMESTAMP(3) NULL,
    suggested_action VARCHAR(64) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'open'
  )`);
  await query(`CREATE TABLE IF NOT EXISTS seo_templates (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    title_tpl VARCHAR(180) NULL,
    description_tpl VARCHAR(320) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active'
  )`);
  await query(`CREATE TABLE IF NOT EXISTS seo_activity_logs (
    id VARCHAR(36) PRIMARY KEY,
    actor VARCHAR(128) NULL,
    action VARCHAR(64) NOT NULL,
    page_url VARCHAR(180) NULL,
    keyword VARCHAR(180) NULL,
    old_value TEXT NULL,
    new_value TEXT NULL,
    ip VARCHAR(64) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  )`);
  const [row] = await query("SELECT id FROM seo_settings WHERE id = 'platform' LIMIT 1");
  if (!row) {
    await query(
      `INSERT INTO seo_settings (id, site_title, default_description, default_robots, robots_txt, default_schema, updated_at)
       VALUES ('platform', 'ATAV POS', 'Billing, inventory, customers and reports with ATAV POS.', ?, ?, 'SoftwareApplication', CURRENT_TIMESTAMP(3))`,
      [DEFAULT_ROBOTS, DEFAULT_ROBOTS],
    );
  }
}

async function logActivity(req, fields) {
  await query(
    `INSERT INTO seo_activity_logs (id, actor, action, page_url, keyword, old_value, new_value, ip)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      uid(),
      clip(req?.user?.email || req?.auth?.email || "master", 128),
      clip(fields.action, 64),
      clip(fields.page_url, 180),
      clip(fields.keyword, 180),
      clip(fields.old_value, 500),
      clip(fields.new_value, 500),
      clip(req?.ip || req?.headers?.["x-forwarded-for"], 64),
    ],
  );
}

function send(res, fn) {
  return Promise.resolve()
    .then(fn)
    .then((data) => res.json(data))
    .catch((err) => res.status(400).json({ error: String(err.message) }));
}

async function overview() {
  await ensureSeoSchema();
  const count = async (sql, params = []) => {
    const [r] = await query(sql, params);
    return Number(r?.n || 0);
  };
  const total = await count("SELECT COUNT(*) AS n FROM seo_keywords");
  const active = await count("SELECT COUNT(*) AS n FROM seo_keywords WHERE status = 'active'");
  const primary = await count("SELECT COUNT(*) AS n FROM seo_keywords WHERE keyword_type = 'Primary'");
  const secondary = await count("SELECT COUNT(*) AS n FROM seo_keywords WHERE keyword_type = 'Secondary'");
  const longTail = await count("SELECT COUNT(*) AS n FROM seo_keywords WHERE keyword_type = 'Long Tail'");
  const used = await count("SELECT COUNT(*) AS n FROM seo_keywords WHERE target_url IS NOT NULL AND target_url <> ''");
  const pages = await count("SELECT COUNT(*) AS n FROM seo_pages");
  const published = await count("SELECT COUNT(*) AS n FROM seo_pages WHERE publish_status = 'published'");
  const opp = await count("SELECT COUNT(*) AS n FROM seo_keywords WHERE status IN ('draft','opportunity')");
  const [pos] = await query("SELECT AVG(reported_position) AS n FROM seo_keywords WHERE reported_position IS NOT NULL AND reported_position > 0");
  const [traf] = await query("SELECT SUM(estimated_traffic) AS n FROM seo_keywords");
  return {
    source: "seo_workspace",
    note: "Counts are keywords and pages stored by Master Admin. Average position and estimated traffic are optional stored values, not live Google ranks.",
    kpis: {
      total_keywords: total,
      active_keywords: active,
      primary_keywords: primary,
      secondary_keywords: secondary,
      long_tail_keywords: longTail,
      keywords_used: used,
      keywords_not_used: Math.max(0, total - used),
      pages_optimized: pages,
      pages_published: published,
      average_position: pos?.n == null ? null : Math.round(Number(pos.n) * 10) / 10,
      estimated_traffic: Number(traf?.n || 0),
      keyword_opportunities: opp,
    },
  };
}

function keywordPayload(body) {
  return [
    clip(body.keyword, 180),
    jsonCol(body.variations, []),
    KEYWORD_TYPES.includes(body.keyword_type) ? body.keyword_type : "Secondary",
    SEARCH_INTENTS.includes(body.search_intent) ? body.search_intent : "Informational",
    clip(body.business_type, 64),
    clip(body.business_category, 64),
    clip(body.target_page, 180),
    clip(body.target_url, 255),
    clip(body.country, 64),
    clip(body.state, 64),
    clip(body.city, 64),
    clip(body.area, 64),
    clip(body.language, 16) || "en",
    ["High", "Medium", "Low"].includes(body.priority) ? body.priority : "Medium",
    ["active", "draft", "inactive", "opportunity"].includes(body.status) ? body.status : "draft",
    clip(body.group_id, 36),
    body.reported_position === "" || body.reported_position == null ? null : Number(body.reported_position),
    Number(body.estimated_traffic || 0),
    clip(body.notes, 500),
    Number(body.sort_order || 0),
  ];
}

async function saveKeyword(body, req) {
  if (!clip(body.keyword, 180)) throw new Error("Keyword is required");
  const id = clip(body.id, 36) || uid();
  const vals = keywordPayload(body);
  await query(
    `INSERT INTO seo_keywords
       (id, keyword, variations, keyword_type, search_intent, business_type, business_category,
        target_page, target_url, country, state, city, area, language, priority, status, group_id,
        reported_position, estimated_traffic, notes, sort_order, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       keyword=VALUES(keyword), variations=VALUES(variations), keyword_type=VALUES(keyword_type),
       search_intent=VALUES(search_intent), business_type=VALUES(business_type),
       business_category=VALUES(business_category), target_page=VALUES(target_page),
       target_url=VALUES(target_url), country=VALUES(country), state=VALUES(state), city=VALUES(city),
       area=VALUES(area), language=VALUES(language), priority=VALUES(priority), status=VALUES(status),
       group_id=VALUES(group_id), reported_position=VALUES(reported_position),
       estimated_traffic=VALUES(estimated_traffic), notes=VALUES(notes), sort_order=VALUES(sort_order),
       updated_at=CURRENT_TIMESTAMP(3)`,
    [id, ...vals],
  );
  await logActivity(req, { action: body.id ? "Keyword Edited" : "Keyword Added", keyword: vals[0] });
  return { ok: true, id };
}

function pagePayload(body) {
  const url = clip(body.url || body.slug, 180) || "/";
  const scored = scoreSeoPage({ ...body, url });
  return {
    title: clip(body.title, 180) || "Untitled",
    url,
    slug: clip(body.slug || url.replace(/^\//, ""), 180),
    primary_keyword: clip(body.primary_keyword, 180),
    secondary_keywords: jsonCol(body.secondary_keywords, []),
    seo_title: clip(body.seo_title || body.meta_title, 160),
    meta_description: clip(body.meta_description, 320),
    h1: clip(body.h1, 180),
    h2_suggestions: jsonCol(body.h2_suggestions, []),
    canonical: clip(body.canonical, 255),
    og_title: clip(body.og_title, 160),
    og_description: clip(body.og_description, 320),
    og_image: clip(body.og_image, 255),
    twitter_title: clip(body.twitter_title, 160),
    twitter_description: clip(body.twitter_description, 320),
    schema_type: clip(body.schema_type, 64) || "SoftwareApplication",
    robots: clip(body.robots, 64) || "index,follow",
    index_status: body.index_status === "noindex" ? "noindex" : "index",
    follow_status: body.follow_status === "nofollow" ? "nofollow" : "follow",
    publish_status: ["published", "draft", "unpublished"].includes(body.publish_status) ? body.publish_status : "draft",
    business_category: clip(body.business_category, 64),
    country: clip(body.country, 64),
    state: clip(body.state, 64),
    city: clip(body.city, 64),
    hero_heading: clip(body.hero_heading, 180),
    intro: clip(body.intro, 8000),
    features: clip(body.features, 8000),
    benefits: clip(body.benefits, 8000),
    use_cases: clip(body.use_cases, 8000),
    cta: clip(body.cta, 255),
    related_pages: jsonCol(body.related_pages, []),
    faq_json: jsonCol(body.faq_json, []),
    seo_score: scored.score,
    approved: body.approved ? 1 : 0,
  };
}

async function savePage(body, req) {
  const p = pagePayload(body);
  const id = clip(body.id, 36) || uid();
  await query(
    `INSERT INTO seo_pages
       (id, title, url, slug, primary_keyword, secondary_keywords, seo_title, meta_description, h1, h2_suggestions,
        canonical, og_title, og_description, og_image, twitter_title, twitter_description, schema_type, robots,
        index_status, follow_status, publish_status, business_category, country, state, city, hero_heading, intro,
        features, benefits, use_cases, cta, related_pages, faq_json, seo_score, approved, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       title=VALUES(title), url=VALUES(url), slug=VALUES(slug), primary_keyword=VALUES(primary_keyword),
       secondary_keywords=VALUES(secondary_keywords), seo_title=VALUES(seo_title), meta_description=VALUES(meta_description),
       h1=VALUES(h1), h2_suggestions=VALUES(h2_suggestions), canonical=VALUES(canonical), og_title=VALUES(og_title),
       og_description=VALUES(og_description), og_image=VALUES(og_image), twitter_title=VALUES(twitter_title),
       twitter_description=VALUES(twitter_description), schema_type=VALUES(schema_type), robots=VALUES(robots),
       index_status=VALUES(index_status), follow_status=VALUES(follow_status), publish_status=VALUES(publish_status),
       business_category=VALUES(business_category), country=VALUES(country), state=VALUES(state), city=VALUES(city),
       hero_heading=VALUES(hero_heading), intro=VALUES(intro), features=VALUES(features), benefits=VALUES(benefits),
       use_cases=VALUES(use_cases), cta=VALUES(cta), related_pages=VALUES(related_pages), faq_json=VALUES(faq_json),
       seo_score=VALUES(seo_score), approved=VALUES(approved), updated_at=CURRENT_TIMESTAMP(3)`,
    [
      id, p.title, p.url, p.slug, p.primary_keyword, p.secondary_keywords, p.seo_title, p.meta_description, p.h1,
      p.h2_suggestions, p.canonical, p.og_title, p.og_description, p.og_image, p.twitter_title, p.twitter_description,
      p.schema_type, p.robots, p.index_status, p.follow_status, p.publish_status, p.business_category, p.country,
      p.state, p.city, p.hero_heading, p.intro, p.features, p.benefits, p.use_cases, p.cta, p.related_pages,
      p.faq_json, p.seo_score, p.approved,
    ],
  );
  await logActivity(req, { action: body.id ? "Meta Updated" : "Page Saved", page_url: p.url });
  return { ok: true, id, seo: scoreSeoPage(p) };
}

function isSafePublishPath(url) {
  const clean = clip(url, 180).replace(/^\//, "").replace(/\/+$/, "");
  if (!clean || clean.includes("..") || clean.includes("\\")) return false;
  const first = clean.split("/")[0].toLowerCase();
  if (RESERVED_SLUGS.has(first)) return false;
  if (!/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(clean)) return false;
  return clean;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderLandingHtml(page, settings = {}) {
  const title = escapeHtml(page.seo_title || page.title || "ATAV POS");
  const desc = escapeHtml(page.meta_description || settings.default_description || "");
  const h1 = escapeHtml(page.h1 || page.hero_heading || page.title);
  const intro = escapeHtml(page.intro || "");
  const features = escapeHtml(page.features || "");
  const canonical = escapeHtml(page.canonical || `https://pos.atavtelecom.in${page.url || "/"}`);
  const robots = escapeHtml(`${page.index_status || "index"},${page.follow_status || "follow"}`);
  const faqs = parseJson(page.faq_json, []);
  const faqLd = Array.isArray(faqs) && faqs.length
    ? `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      })}</script>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${desc}" />
  <link rel="canonical" href="${canonical}" />
  <meta name="robots" content="${robots}" />
  <meta property="og:title" content="${escapeHtml(page.og_title || title)}" />
  <meta property="og:description" content="${escapeHtml(page.og_description || desc)}" />
  <link rel="stylesheet" href="/css/marketing.css" />
</head>
<body class="mkt">
  <header class="wrap"><p><a href="/">ATAV POS</a></p></header>
  <main class="wrap">
    <h1>${h1}</h1>
    <p>${intro}</p>
    ${features ? `<h2>Features</h2><p>${features.replace(/\n/g, "<br/>")}</p>` : ""}
    ${page.benefits ? `<h2>Benefits</h2><p>${escapeHtml(page.benefits).replace(/\n/g, "<br/>")}</p>` : ""}
    ${page.use_cases ? `<h2>Business use cases</h2><p>${escapeHtml(page.use_cases).replace(/\n/g, "<br/>")}</p>` : ""}
    ${page.cta ? `<p><a class="btn" href="/login.html">${escapeHtml(page.cta)}</a></p>` : `<p><a class="btn" href="/login.html">Get Started</a></p>`}
  </main>
  ${faqLd}
</body>
</html>`;
}

async function publishPage(id, req) {
  await ensureSeoSchema();
  const [page] = await query("SELECT * FROM seo_pages WHERE id = ? LIMIT 1", [id]);
  if (!page) throw new Error("Page not found");
  const uniqueLen = `${page.intro || ""}${page.features || ""}${page.benefits || ""}`.trim().length;
  if (uniqueLen < 280) throw new Error("Approve only pages with unique intro/features/benefits (at least 280 characters). Thin location copies are blocked.");
  if (!page.approved) throw new Error("Master Admin must approve the page before publishing.");
  const slug = isSafePublishPath(page.url || page.slug);
  if (!slug) throw new Error("URL is reserved or invalid. Public SEO pages cannot overwrite POS, login, or admin paths.");
  const html = renderLandingHtml(page, (await query("SELECT * FROM seo_settings WHERE id='platform' LIMIT 1"))[0] || {});
  const dir = path.join(root, ...slug.split("/"));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
  await query("UPDATE seo_pages SET publish_status='published', updated_at=CURRENT_TIMESTAMP(3) WHERE id=?", [id]);
  await logActivity(req, { action: "Page Published", page_url: page.url });
  return { ok: true, url: `/${slug}` };
}

async function conflicts() {
  const rows = await query(
    `SELECT primary_keyword AS keyword, GROUP_CONCAT(url) AS pages, COUNT(*) AS n
     FROM seo_pages WHERE primary_keyword IS NOT NULL AND primary_keyword <> ''
     GROUP BY primary_keyword HAVING n > 1`,
  );
  return { conflicts: rows, note: "Potential keyword cannibalization in stored pages. Live pages are not changed automatically." };
}

async function usage() {
  const keys = await query("SELECT * FROM seo_keywords ORDER BY keyword LIMIT 500");
  const pages = await query("SELECT url, primary_keyword, seo_title, h1, meta_description, intro FROM seo_pages");
  return keys.map((k) => {
    const kw = String(k.keyword || "").toLowerCase();
    const hits = pages.filter((p) =>
      [p.primary_keyword, p.seo_title, p.h1, p.meta_description, p.intro, p.url].some((x) => String(x || "").toLowerCase().includes(kw)),
    );
    const first = hits[0] || {};
    const has = (field) => String(first[field] || "").toLowerCase().includes(kw);
    return {
      keyword: k.keyword,
      search_intent: k.search_intent,
      pages: hits.map((p) => p.url),
      title: has("seo_title"),
      h1: has("h1"),
      meta: has("meta_description"),
      content: has("intro"),
      url: String(first.url || "").toLowerCase().includes(kw.replace(/\s+/g, "-")),
      status: k.status,
    };
  });
}

async function generateSitemap() {
  await ensureSeoSchema();
  const pages = await query("SELECT url, updated_at, index_status, publish_status FROM seo_pages");
  const staticUrls = ["/", "/about.html"];
  const urls = [
    ...staticUrls.map((u) => ({ loc: `https://pos.atavtelecom.in${u}`, lastmod: new Date().toISOString().slice(0, 10) })),
    ...pages
      .filter((p) => p.publish_status === "published" && p.index_status !== "noindex")
      .map((p) => ({ loc: `https://pos.atavtelecom.in${p.url}`, lastmod: String(p.updated_at || "").slice(0, 10) })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod || ""}</lastmod></url>`).join("\n")}
</urlset>
`;
  fs.writeFileSync(path.join(root, "sitemap.xml"), xml, "utf8");
  await query("UPDATE seo_settings SET sitemap_xml=?, updated_at=CURRENT_TIMESTAMP(3) WHERE id='platform'", [xml]);
  return { ok: true, urls: urls.length, xml };
}

async function saveRobots(body) {
  const txt = clip(body.robots_txt || DEFAULT_ROBOTS, 8000) || DEFAULT_ROBOTS;
  if (!/disallow:\s*\/api/i.test(txt)) {
    throw new Error("robots.txt must Disallow /api/ so the POS application is not indexed.");
  }
  fs.writeFileSync(path.join(root, "robots.txt"), txt, "utf8");
  await query("UPDATE seo_settings SET robots_txt=?, updated_at=CURRENT_TIMESTAMP(3) WHERE id='platform'", [txt]);
  return { ok: true, robots_txt: txt };
}

export function registerSeoMaster(app) {
  app.get("/api/master/seo/overview", requireMaster, (_req, res) => send(res, overview));
  app.get("/api/master/seo/catalog", requireMaster, (_req, res) =>
    res.json({ categories: SEO_CATEGORIES, types: KEYWORD_TYPES, intents: SEARCH_INTENTS }),
  );
  app.get("/api/master/seo/keywords", requireMaster, (req, res) =>
    send(res, async () => {
      await ensureSeoSchema();
      const q = clip(req.query.q, 80);
      const cat = clip(req.query.category, 64);
      const sql = `SELECT * FROM seo_keywords WHERE (? = '' OR keyword LIKE ?) AND (? = '' OR business_category = ?) ORDER BY sort_order, keyword LIMIT 2000`;
      return query(sql, [q, `%${q}%`, cat, cat]);
    }),
  );
  app.post("/api/master/seo/keywords", requireMaster, (req, res) => send(res, () => saveKeyword(req.body || {}, req)));
  app.post("/api/master/seo/keywords/bulk", requireMaster, (req, res) =>
    send(res, async () => {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((id) => clip(id, 36)).filter(Boolean) : [];
      if (!ids.length) throw new Error("Select keywords");
      const act = req.body?.action;
      const ph = ids.map(() => "?").join(",");
      if (act === "delete") await query(`DELETE FROM seo_keywords WHERE id IN (${ph})`, ids);
      else if (act === "activate") await query(`UPDATE seo_keywords SET status='active' WHERE id IN (${ph})`, ids);
      else if (act === "deactivate") await query(`UPDATE seo_keywords SET status='inactive' WHERE id IN (${ph})`, ids);
      else if (act === "assign_page") await query(`UPDATE seo_keywords SET target_url=? WHERE id IN (${ph})`, [clip(req.body.target_url, 255), ...ids]);
      else if (act === "assign_category") await query(`UPDATE seo_keywords SET business_category=? WHERE id IN (${ph})`, [clip(req.body.business_category, 64), ...ids]);
      else if (act === "assign_location") await query(`UPDATE seo_keywords SET city=? WHERE id IN (${ph})`, [clip(req.body.city, 64), ...ids]);
      else throw new Error("Unknown bulk action");
      await logActivity(req, { action: `Bulk ${act}` });
      return { ok: true };
    }),
  );
  app.post("/api/master/seo/keywords/import", requireMaster, (req, res) =>
    send(res, async () => {
      const csv = String(req.body?.csv || "");
      const lines = csv.split(/\r?\n/).filter(Boolean);
      let n = 0;
      for (const line of lines.slice(1)) {
        const [keyword, keyword_type, business_category, city, search_intent] = line.split(",").map((s) => s?.trim());
        if (!keyword) continue;
        await saveKeyword({ keyword, keyword_type, business_category, city, search_intent, status: "draft" }, req);
        n += 1;
      }
      return { ok: true, imported: n, note: "Imported as drafts. They are not published." };
    }),
  );
  app.get("/api/master/seo/export", requireMaster, (_req, res) =>
    send(res, async () => {
      const rows = await query("SELECT keyword, keyword_type, business_category, city, search_intent, target_url, status FROM seo_keywords ORDER BY keyword");
      const csv = ["keyword,type,category,city,intent,url,status", ...rows.map((r) => [r.keyword, r.keyword_type, r.business_category, r.city, r.search_intent, r.target_url, r.status].join(","))].join("\n");
      return { csv };
    }),
  );
  app.get("/api/master/seo/groups", requireMaster, (_req, res) => send(res, async () => query("SELECT * FROM seo_keyword_groups ORDER BY name")));
  app.post("/api/master/seo/groups", requireMaster, (req, res) =>
    send(res, async () => {
      const id = clip(req.body?.id, 36) || uid();
      await query(
        `INSERT INTO seo_keyword_groups (id, name, business_category, notes) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), business_category=VALUES(business_category), notes=VALUES(notes)`,
        [id, clip(req.body?.name, 128) || "Group", clip(req.body?.business_category, 64), clip(req.body?.notes, 500)],
      );
      return { ok: true, id };
    }),
  );
  app.get("/api/master/seo/pages", requireMaster, (_req, res) => send(res, async () => query("SELECT * FROM seo_pages ORDER BY url")));
  app.post("/api/master/seo/pages", requireMaster, (req, res) => send(res, () => savePage(req.body || {}, req)));
  app.post("/api/master/seo/pages/:id/publish", requireMaster, (req, res) => send(res, () => publishPage(req.params.id, req)));
  app.post("/api/master/seo/pages/:id/unpublish", requireMaster, (req, res) =>
    send(res, async () => {
      await query("UPDATE seo_pages SET publish_status='unpublished' WHERE id=?", [req.params.id]);
      await logActivity(req, { action: "Page Unpublished" });
      return { ok: true };
    }),
  );
  app.get("/api/master/seo/locations", requireMaster, (_req, res) => send(res, async () => query("SELECT * FROM seo_locations ORDER BY country, state, city")));
  app.post("/api/master/seo/locations", requireMaster, (req, res) =>
    send(res, async () => {
      const id = uid();
      await query("INSERT INTO seo_locations (id, country, state, city, area, status) VALUES (?,?,?,?,?,?)", [
        id, clip(req.body?.country, 64), clip(req.body?.state, 64), clip(req.body?.city, 64), clip(req.body?.area, 64), "active",
      ]);
      return { ok: true, id, phrase: [clip(req.body?.base || "POS software"), clip(req.body?.city || req.body?.state || req.body?.country)].filter(Boolean).join(" in ") };
    }),
  );
  app.post("/api/master/seo/generate", requireMaster, (req, res) =>
    send(res, async () => ({ suggestions: suggestKeywords(req.body || {}), note: "Suggestions are not saved until you add them." })),
  );
  app.get("/api/master/seo/links", requireMaster, (_req, res) => send(res, async () => query("SELECT * FROM seo_internal_links ORDER BY source_url")));
  app.post("/api/master/seo/links", requireMaster, (req, res) =>
    send(res, async () => {
      const id = uid();
      await query("INSERT INTO seo_internal_links (id, source_url, target_url, anchor_text, priority, status) VALUES (?,?,?,?,?,?)", [
        id, clip(req.body?.source_url, 180), clip(req.body?.target_url, 180), clip(req.body?.anchor_text, 180), clip(req.body?.priority, 16) || "Medium", "active",
      ]);
      return { ok: true, id };
    }),
  );
  app.get("/api/master/seo/faq", requireMaster, (_req, res) => send(res, async () => query("SELECT * FROM seo_faq ORDER BY question")));
  app.post("/api/master/seo/faq", requireMaster, (req, res) =>
    send(res, async () => {
      const id = clip(req.body?.id, 36) || uid();
      await query(
        `INSERT INTO seo_faq (id, question, answer, business_type, category, target_page, priority, status)
         VALUES (?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE question=VALUES(question), answer=VALUES(answer), business_type=VALUES(business_type),
           category=VALUES(category), target_page=VALUES(target_page), priority=VALUES(priority), status=VALUES(status)`,
        [
          id, clip(req.body?.question, 255), clip(req.body?.answer, 4000), clip(req.body?.business_type, 64),
          clip(req.body?.category, 64), clip(req.body?.target_page, 180), clip(req.body?.priority, 16) || "Medium",
          req.body?.status === "active" ? "active" : "draft",
        ],
      );
      return { ok: true, id };
    }),
  );
  app.get("/api/master/seo/redirects", requireMaster, (_req, res) => send(res, async () => query("SELECT * FROM seo_redirects ORDER BY old_url")));
  app.post("/api/master/seo/redirects", requireMaster, (req, res) =>
    send(res, async () => {
      const id = uid();
      await query("INSERT INTO seo_redirects (id, old_url, new_url, redirect_type, status) VALUES (?,?,?,?,?)", [
        id, clip(req.body?.old_url, 255), clip(req.body?.new_url, 255), req.body?.redirect_type === "302" ? "302" : "301", "active",
      ]);
      await logActivity(req, { action: "Redirect Created", page_url: req.body?.old_url });
      return { ok: true, id };
    }),
  );
  app.get("/api/master/seo/broken", requireMaster, (_req, res) => send(res, async () => query("SELECT * FROM seo_broken_urls ORDER BY last_detected DESC")));
  app.post("/api/master/seo/broken", requireMaster, (req, res) =>
    send(res, async () => {
      const id = uid();
      await query("INSERT INTO seo_broken_urls (id, url, status_code, source, last_detected, suggested_action, status) VALUES (?,?,?,?,CURRENT_TIMESTAMP(3),?,?)", [
        id, clip(req.body?.url, 255), Number(req.body?.status_code || 404), clip(req.body?.source, 255), clip(req.body?.suggested_action, 64) || "Redirect", "open",
      ]);
      return { ok: true, id };
    }),
  );
  app.get("/api/master/seo/conflicts", requireMaster, (_req, res) => send(res, conflicts));
  app.post("/api/master/seo/conflicts", requireMaster, (req, res) =>
    send(res, async () => {
      await logActivity(req, { action: `Conflict ${clip(req.body?.decision, 32)}`, keyword: clip(req.body?.keyword, 180) });
      return { ok: true, note: "Decision recorded. Live pages were not changed." };
    }),
  );
  app.get("/api/master/seo/usage", requireMaster, (_req, res) => send(res, usage));
  app.get("/api/master/seo/templates", requireMaster, (_req, res) => send(res, async () => query("SELECT * FROM seo_templates ORDER BY name")));
  app.post("/api/master/seo/templates", requireMaster, (req, res) =>
    send(res, async () => {
      const id = uid();
      await query("INSERT INTO seo_templates (id, name, title_tpl, description_tpl, status) VALUES (?,?,?,?, 'active')", [
        id, clip(req.body?.name, 128) || "Template", clip(req.body?.title_tpl, 180), clip(req.body?.description_tpl, 320),
      ]);
      return { ok: true, id, preview: applyTemplate(req.body?.title_tpl, req.body?.vars || {}) };
    }),
  );
  app.get("/api/master/seo/settings", requireMaster, (_req, res) =>
    send(res, async () => {
      await ensureSeoSchema();
      const [row] = await query("SELECT * FROM seo_settings WHERE id='platform' LIMIT 1");
      return row || {};
    }),
  );
  app.post("/api/master/seo/settings", requireMaster, (req, res) =>
    send(res, async () => {
      await query(
        `UPDATE seo_settings SET site_title=?, default_description=?, default_keywords=?, default_og_image=?,
           default_canonical=?, default_schema=?, google_site_verification=?, bing_verification=?, updated_at=CURRENT_TIMESTAMP(3)
         WHERE id='platform'`,
        [
          clip(req.body?.site_title, 160), clip(req.body?.default_description, 320), clip(req.body?.default_keywords, 500),
          clip(req.body?.default_og_image, 255), clip(req.body?.default_canonical, 255), clip(req.body?.default_schema, 64),
          clip(req.body?.google_site_verification, 128), clip(req.body?.bing_verification, 128),
        ],
      );
      return { ok: true };
    }),
  );
  app.post("/api/master/seo/sitemap/generate", requireMaster, (req, res) =>
    send(res, async () => {
      const out = await generateSitemap();
      await logActivity(req, { action: "Sitemap Updated" });
      return out;
    }),
  );
  app.post("/api/master/seo/robots", requireMaster, (req, res) => send(res, () => saveRobots(req.body || {})));
  app.get("/api/master/seo/activity", requireMaster, (_req, res) =>
    send(res, async () => query("SELECT * FROM seo_activity_logs ORDER BY created_at DESC LIMIT 200")),
  );
}

export function registerSeoPublic(app) {
  app.get("/robots.txt", async (_req, res) => {
    try {
      await ensureSeoSchema();
      const [row] = await query("SELECT robots_txt FROM seo_settings WHERE id='platform' LIMIT 1");
      res.type("text/plain").send(row?.robots_txt || DEFAULT_ROBOTS);
    } catch {
      res.type("text/plain").send(DEFAULT_ROBOTS);
    }
  });
  app.get("/sitemap.xml", async (_req, res) => {
    try {
      await ensureSeoSchema();
      const [row] = await query("SELECT sitemap_xml FROM seo_settings WHERE id='platform' LIMIT 1");
      res.type("application/xml").send(row?.sitemap_xml || `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`);
    } catch {
      res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`);
    }
  });
  app.get("/api/seo/redirects", async (req, res) => {
    try {
      await ensureSeoSchema();
      const url = clip(req.query.url, 255);
      const [row] = await query("SELECT * FROM seo_redirects WHERE old_url = ? AND status='active' LIMIT 1", [url]);
      res.json(row || null);
    } catch (err) {
      res.status(400).json({ error: String(err.message) });
    }
  });
}
