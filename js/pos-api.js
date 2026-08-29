window.POS_API = "/pos-data";
window.posUrl = function posUrl(path) {
  const p = String(path || "");
  if (p.startsWith("/api/")) return "/pos-data/" + p.slice("/api/".length);
  if (p === "/api") return "/pos-data";
  return p;
};
