function pathAndQuery(url) {
  let raw = String(url || "");
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      raw = `${u.pathname}${u.search}`;
    } catch {
      /* keep raw */
    }
  }
  const q = raw.indexOf("?");
  let path = q === -1 ? raw : raw.slice(0, q);
  if (path && !path.startsWith("/")) path = `/${path}`;
  if (!path) path = "/";
  const qs = q === -1 ? "" : raw.slice(q);
  return { path, qs };
}

export function rewriteToApi(url, headerPath) {
  const { path, qs } = pathAndQuery(url);
  const params = new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : "");

  if (path === "/health.json") return "/api/health";

  if (path === "/atavpos-rpc.json") {
    const p = String(headerPath || params.get("p") || params.get("path") || "health")
      .replace(/^\/+/, "")
      .replace(/^api\//, "");
    params.delete("p");
    params.delete("path");
    const rest = params.toString();
    return `/api/${p}${rest ? `?${rest}` : ""}`;
  }

  for (const prefix of ["/pos-data", "/atav-data"]) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return `/api${path.slice(prefix.length) || "/"}${qs}`;
    }
  }

  if (
    path.startsWith("/auth/") ||
    path === "/health" ||
    path.startsWith("/health?") ||
    path.startsWith("/support-contact") ||
    path.startsWith("/bootstrap")
  ) {
    return `/api${path}${qs}`;
  }

  return `${path}${qs}`;
}

export function canonApiUrl(url, headerPath) {
  return rewriteToApi(url, headerPath);
}

export function isAliasedApi(url) {
  const { path } = pathAndQuery(url);
  return (
    path === "/health.json" ||
    path === "/atavpos-rpc.json" ||
    path === "/pos-data" ||
    path.startsWith("/pos-data/") ||
    path === "/atav-data" ||
    path.startsWith("/atav-data/")
  );
}

export function isApiUrl(url, headerPath) {
  const path = canonApiUrl(url, headerPath).split("?")[0];
  return path === "/api" || path.startsWith("/api/");
}
