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

function baseName(path) {
  const i = String(path).lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

function prefixRest(path, name) {
  const token = `/${name}`;
  if (path === token) return "/";
  const idx = path.indexOf(token);
  if (idx === -1) return null;
  const rest = path.slice(idx + token.length);
  if (rest && !rest.startsWith("/")) return null;
  return rest || "/";
}

function rpcPath(headerPath, params) {
  return String(headerPath || params.get("p") || params.get("path") || "health")
    .replace(/^\/+/, "")
    .replace(/^api\//, "");
}

export function rewriteToApi(url, headerPath) {
  const { path, qs } = pathAndQuery(url);
  const params = new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : "");
  const name = baseName(path);

  if (name === "health.json") return "/api/health";

  if (name === "atavpos-rpc.json" || name === "pos-api.php") {
    const p = rpcPath(headerPath, params);
    params.delete("p");
    params.delete("path");
    const rest = params.toString();
    return `/api/${p}${rest ? `?${rest}` : ""}`;
  }

  for (const prefix of ["pos-data", "atav-data"]) {
    const rest = prefixRest(path, prefix);
    if (rest) return `/api${rest}${qs}`;
  }

  if (
    path.startsWith("/auth/") ||
    path.endsWith("/auth") ||
    /\/auth\//.test(path) ||
    path === "/health" ||
    path.endsWith("/health") ||
    path.startsWith("/support-contact") ||
    path.includes("/support-contact") ||
    path.startsWith("/bootstrap") ||
    path.includes("/bootstrap")
  ) {
    if (path === "/health" || path.endsWith("/health")) return `/api/health${qs}`;
    const auth = prefixRest(path, "auth");
    if (auth) return `/api/auth${auth === "/" ? "" : auth}${qs}`;
    const support = prefixRest(path, "support-contact");
    if (support) return `/api/support-contact${support === "/" ? "" : support}${qs}`;
    const boot = prefixRest(path, "bootstrap");
    if (boot) return `/api/bootstrap${boot === "/" ? "" : boot}${qs}`;
  }

  return `${path}${qs}`;
}

export function canonApiUrl(url, headerPath) {
  return rewriteToApi(url, headerPath);
}

export function isAliasedApi(url) {
  const { path } = pathAndQuery(url);
  const name = baseName(path);
  if (name === "health.json" || name === "atavpos-rpc.json" || name === "pos-api.php") return true;
  return Boolean(prefixRest(path, "pos-data") || prefixRest(path, "atav-data"));
}

export function isApiUrl(url, headerPath) {
  const path = canonApiUrl(url, headerPath).split("?")[0];
  return path === "/api" || path.startsWith("/api/");
}
