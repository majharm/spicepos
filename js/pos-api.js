(function () {
  const RPC = "/atavpos-rpc.json";
  const STORAGE = "pos_api_spec_v2";

  function pageDir() {
    const p = location.pathname || "/";
    if (p.endsWith("/")) return p;
    return p.replace(/\/[^/]+$/, "/") || "/";
  }

  function specs() {
    const dir = pageDir();
    const out = [];
    const prefixes = new Set(["/api", "/pos-data", "/atav-data", `${dir}api`.replace(/\/{2,}/g, "/"), `${dir}pos-data`.replace(/\/{2,}/g, "/")]);
    for (const base of prefixes) {
      out.push({ mode: "prefix", base: base.replace(/\/$/, "") || "/" });
    }
    const rpcFiles = ["/atavpos-rpc.json", `${dir}atavpos-rpc.json`.replace(/\/{2,}/g, "/"), "/pos-api.php", `${dir}pos-api.php`.replace(/\/{2,}/g, "/")];
    for (const base of rpcFiles) out.push({ mode: "rpc", base });
    return out;
  }

  function applySpec(spec, apiPath) {
    const raw = String(apiPath || "");
    const q = raw.indexOf("?");
    const path = (q === -1 ? raw : raw.slice(0, q)).replace(/^\/api\/?/, "");
    const extra = q === -1 ? "" : raw.slice(q + 1);
    if (spec.mode === "rpc") {
      const params = new URLSearchParams(extra);
      params.set("p", path || "health");
      return `${spec.base}?${params.toString()}`;
    }
    const base = spec.base.replace(/\/$/, "");
    return extra ? `${base}/${path}?${extra}` : `${base}/${path}`;
  }

  function isDeadBridge(data, res) {
    if (!data || typeof data !== "object") return false;
    if (data.bridge === "down") return true;
    const err = String(data.error || "");
    if (/not listening|not reachable from PHP|Could not reach POS Node/i.test(err)) return true;
    return Boolean(res && (res.status === 502 || res.status === 503) && /Node/i.test(err));
  }

  function isPhpUnimplemented(data, res) {
    if (!res || res.status !== 501 || !data || typeof data !== "object") return false;
    return /not available in PHP fallback/i.test(String(data.error || ""));
  }

  function isMutating(method) {
    const m = String(method || "GET").toUpperCase();
    return m !== "GET" && m !== "HEAD" && m !== "OPTIONS";
  }

  function orderedSpecs(method, preferred) {
    const list = specs();
    const mutating = isMutating(method);
    const rpc = list.filter((s) => s.mode === "rpc");
    const prefix = list.filter((s) => s.mode !== "rpc");
    const out = [];
    if (preferred && !mutating) out.push(preferred);
    if (mutating) out.push(...rpc, ...prefix);
    else out.push(...prefix, ...rpc);
    if (preferred && mutating) out.push(preferred);
    return out;
  }

  function looksLikeJson(text, res) {
    const ct = String(res?.headers?.get("content-type") || "").toLowerCase();
    if (ct.includes("json")) return true;
    const t = String(text || "").trim();
    if (!t || t.startsWith("<") || /^<!doctype/i.test(t)) return false;
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        JSON.parse(t);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  function loadSpec() {
    try {
      const raw = sessionStorage.getItem(STORAGE);
      if (!raw) return null;
      const spec = JSON.parse(raw);
      if (spec && spec.mode && spec.base) return spec;
    } catch {
      /* ignore */
    }
    return null;
  }

  function saveSpec(spec) {
    window.POS_API_SPEC = spec;
    window.POS_API = spec.mode === "rpc" ? spec.base : spec.base;
    try {
      sessionStorage.setItem(STORAGE, JSON.stringify(spec));
    } catch {
      /* ignore */
    }
  }

  async function probe() {
    const saved = loadSpec();
    const list = specs();
    if (saved) list.unshift(saved);
    const seen = new Set();
    for (const spec of list) {
      const key = `${spec.mode}:${spec.base}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const health =
        spec.mode === "rpc" ? applySpec(spec, "/api/health") : `${spec.base.replace(/\/$/, "")}/health`;
      try {
        const res = await fetch(health, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
        const text = await res.text();
        if (looksLikeJson(text, res)) {
          let data = {};
          try {
            data = text ? JSON.parse(text) : {};
          } catch {
            continue;
          }
          if (isDeadBridge(data, res)) continue;
          saveSpec(spec);
          return spec;
        }
      } catch {
        /* try next */
      }
    }
    try {
      const res = await fetch("/health.json", { cache: "no-store", headers: { Accept: "application/json" } });
      const text = await res.text();
      if (looksLikeJson(text, res)) {
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = {};
        }
        if (!isDeadBridge(data, res)) {
          const spec = { mode: "rpc", base: RPC };
          saveSpec(spec);
          return spec;
        }
      }
    } catch {
      /* ignore */
    }
    return list[0];
  }

  let ready = null;
  function ensureSpec(force) {
    if (force) ready = null;
    if (!ready) ready = probe();
    return ready;
  }

  window.posApiReady = ensureSpec();

  window.posUrl = function posUrl(path) {
    const spec = window.POS_API_SPEC || loadSpec() || { mode: "prefix", base: "/pos-data" };
    return applySpec(spec, path);
  };

  window.posRequest = async function posRequest(path, options = {}) {
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    if (!headers["Content-Type"] && !headers["content-type"] && options.body) {
      headers["Content-Type"] = "application/json";
    }
    const method = String(options.method || "GET").toUpperCase();
    const trySpecs = orderedSpecs(method, await ensureSpec());

    const seen = new Set();
    let lastText = "";
    let lastUnimplemented = null;
    for (const spec of trySpecs) {
      const key = `${spec.mode}:${spec.base}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const url = applySpec(spec, path);
      const hdrs = { ...headers };
      if (spec.mode === "rpc") hdrs["X-Pos-Path"] = String(path).replace(/^\/api\/?/, "").split("?")[0];
      try {
        const res = await fetch(url, { credentials: "same-origin", cache: "no-store", redirect: "follow", ...options, headers: hdrs });
        const text = await res.text();
        lastText = text;
        if (!looksLikeJson(text, res)) continue;
        const data = text ? JSON.parse(text) : {};
        if (isDeadBridge(data, res)) continue;
        if (isPhpUnimplemented(data, res)) {
          lastUnimplemented = { res, data, text };
          continue;
        }
        saveSpec(spec);
        return { res, data, text };
      } catch {
        /* try next */
      }
    }
    if (lastUnimplemented) return lastUnimplemented;
    const snippet = String(lastText || "").replace(/\s+/g, " ").slice(0, 80);
    throw new Error(
      snippet.startsWith("<") || /<!doctype/i.test(snippet)
        ? "Sign-in did not reach the POS server (got a web page). Open /pos-api.php?p=health — it must be JSON. In hPanel use Express, entry server.js, empty build/output, then Redeploy and Restart."
        : "Could not reach the POS API. Redeploy and Restart the Node.js app in hPanel.",
    );
  };
})();
