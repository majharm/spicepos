export function canonApiUrl(url) {
  const raw = String(url || "");
  const q = raw.indexOf("?");
  const path = q === -1 ? raw : raw.slice(0, q);
  const qs = q === -1 ? "" : raw.slice(q);
  if (path === "/pos-data" || path.startsWith("/pos-data/")) {
    return `/api${path.slice("/pos-data".length) || "/"}${qs}`;
  }
  return raw;
}

export function isApiUrl(url) {
  const path = canonApiUrl(url).split("?")[0];
  return path === "/api" || path.startsWith("/api/");
}
