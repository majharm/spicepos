import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function configRoots() {
  const out = new Set([root, process.cwd()]);
  if (process.env.HOME) {
    out.add(process.env.HOME);
    out.add(path.join(process.env.HOME, "public_html"));
  }
  return [...out].filter((dir) => dir && fs.existsSync(dir));
}

function setEnv(key, value) {
  if (!key || value == null || value === "") return;
  if (process.env[key]) return;
  process.env[key] = String(value);
}

function parseEnvText(raw) {
  for (const line of String(raw || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    let body = trimmed;
    if (body.toLowerCase().startsWith("export ")) body = body.slice(7).trim();
    const eq = body.indexOf("=");
    if (eq < 1) continue;
    const key = body.slice(0, eq).trim();
    let value = body.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    setEnv(key, value);
  }
}

function parsePosDbPhp(raw) {
  const map = {};
  for (const m of String(raw || "").matchAll(/['"]([^'"]+)['"]\s*=>\s*['"]([^'"]*)['"]/g)) {
    map[m[1]] = m[2];
  }
  return map;
}

function loadJsonEnv(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (data && typeof data === "object") {
      for (const [key, value] of Object.entries(data)) setEnv(key, value);
    }
  } catch {
    /* ignore */
  }
}

export function loadSharedEnv() {
  dotenv.config();
  for (const dir of configRoots()) {
    for (const rel of [".env", "pos.env"]) {
      const file = path.join(dir, rel);
      if (fs.existsSync(file)) parseEnvText(fs.readFileSync(file, "utf8"));
    }
    const dbPhp = path.join(dir, "pos-db.php");
    if (fs.existsSync(dbPhp)) {
      for (const [key, value] of Object.entries(parsePosDbPhp(fs.readFileSync(dbPhp, "utf8")))) {
        setEnv(key, value);
      }
    }
    const dbJson = path.join(dir, "pos-db.json");
    if (fs.existsSync(dbJson)) loadJsonEnv(dbJson);
    const smtpPhp = path.join(dir, "pos-smtp.php");
    if (fs.existsSync(smtpPhp)) {
      for (const [key, value] of Object.entries(parsePosDbPhp(fs.readFileSync(smtpPhp, "utf8")))) {
        setEnv(key, value);
      }
    }
  }
}

loadSharedEnv();
