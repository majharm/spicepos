/* Leaflet world map for Master Admin website traffic and extra public IP lookups. */
(function (root) {
  const ONLINE_MS = 5 * 60 * 1000;
  const WIDTH = 960;
  const HEIGHT = 480;
  const SAMPLE_IPS = "8.8.8.8\n1.1.1.1\n208.67.222.222";

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isPrivateIp(raw) {
    let ip = String(raw || "").trim().toLowerCase();
    if (!ip || ip === "localhost") return true;
    if (ip.startsWith("::ffff:")) ip = ip.slice(7);
    const zone = ip.indexOf("%");
    if (zone >= 0) ip = ip.slice(0, zone);
    if (ip === "::1" || ip === "::" || ip === "0.0.0.0") return true;
    if (ip.includes(":") && !ip.includes(".")) {
      return ip.startsWith("fe80") || ip.startsWith("fc") || ip.startsWith("fd");
    }
    const parts = ip.split(".");
    if (parts.length !== 4) return true;
    const n = parts.map((part) => Number(part));
    if (n.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
    if (n[0] === 10 || n[0] === 127 || n[0] === 0 || n[0] >= 224) return true;
    if (n[0] === 192 && n[1] === 168) return true;
    if (n[0] === 169 && n[1] === 254) return true;
    if (n[0] === 172 && n[1] >= 16 && n[1] <= 31) return true;
    if (n[0] === 100 && n[1] >= 64 && n[1] <= 127) return true;
    return false;
  }

  function stamp(value) {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    const parsed = Date.parse(String(value).trim().replace(" ", "T"));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function seenValue(row) {
    const value = row.last_seen_at || row.lastSeen || row.created_at || row.createdAt || null;
    if (value instanceof Date) return value.toISOString();
    return value ? String(value) : null;
  }

  function groupIpSessions(rows, now = Date.now()) {
    const byIp = new Map();
    for (const row of rows || []) {
      const ip = String(row.ip || "").trim().slice(0, 64);
      if (!ip) continue;
      let place = byIp.get(ip);
      if (!place) {
        place = {
          ip,
          sessions: 0,
          online: 0,
          businesses: new Set(),
          lastSeen: null,
          lastMs: 0,
          local: isPrivateIp(ip),
        };
        byIp.set(ip, place);
      }
      place.sessions += 1;
      const seen = seenValue(row);
      const seenMs = stamp(seen);
      if (seenMs && seenMs >= place.lastMs) {
        place.lastMs = seenMs;
        place.lastSeen = seen;
      }
      const revoked = row.revoked_at || row.revokedAt;
      const expiresMs = stamp(row.expires_at || row.expiresAt);
      const active = !revoked && seenMs && now - seenMs <= ONLINE_MS && (!expiresMs || expiresMs > now);
      if (active) place.online += 1;
      const business = String(row.business_name || row.businessName || "").trim();
      if (business) place.businesses.add(business);
    }
    return [...byIp.values()]
      .map((place) => ({
        ip: place.ip,
        sessions: place.sessions,
        online: place.online,
        businesses: [...place.businesses].sort((a, b) => a.localeCompare(b)).slice(0, 4),
        lastSeen: place.lastSeen,
        local: place.local,
      }))
      .sort((a, b) => b.online - a.online || b.sessions - a.sessions || String(b.lastSeen || "").localeCompare(String(a.lastSeen || "")));
  }

  function parseWhois(body) {
    let data = body;
    if (typeof body === "string") {
      try {
        data = JSON.parse(body);
      } catch {
        return null;
      }
    }
    if (!data || typeof data !== "object" || data.success === false) return null;
    const lat = Number(data.latitude ?? data.lat);
    const lon = Number(data.longitude ?? data.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return {
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      country: String(data.country || "").slice(0, 80),
      countryCode: String(data.country_code || data.countryCode || "").slice(0, 8),
      region: String(data.region || "").slice(0, 80),
      city: String(data.city || "").slice(0, 80),
    };
  }

  function placeCountry(place) {
    if (place?.local) return "Private network";
    return String(place?.country || "").trim() || "Unmapped";
  }

  function groupWebsiteTraffic(rows, now = Date.now()) {
    const byIp = new Map();
    for (const row of rows || []) {
      const ip = String(row.ip || "").trim().slice(0, 64);
      if (!ip) continue;
      let place = byIp.get(ip);
      if (!place) {
        place = {
          ip,
          views: 0,
          sessions: new Set(),
          pages: new Set(),
          lastSeen: null,
          lastMs: 0,
          recent: false,
          local: isPrivateIp(ip),
        };
        byIp.set(ip, place);
      }
      place.views += 1;
      const session = String(row.session_id || row.sessionId || "").trim();
      if (session) place.sessions.add(session);
      const page = String(row.page_path || row.pagePath || "").trim();
      if (page) place.pages.add(page);
      const seen = seenValue({ last_seen_at: row.occurred_at || row.occurredAt || row.last_seen_at });
      const seenMs = stamp(seen);
      if (seenMs && seenMs >= place.lastMs) {
        place.lastMs = seenMs;
        place.lastSeen = seen;
      }
      if (seenMs && now - seenMs <= ONLINE_MS && now - seenMs >= 0) place.recent = true;
    }
    return [...byIp.values()]
      .map((place) => ({
        ip: place.ip,
        views: place.views,
        sessions: place.sessions.size || place.views,
        online: place.recent ? 1 : 0,
        businesses: [...place.pages].sort((a, b) => a.localeCompare(b)).slice(0, 4),
        lastSeen: place.lastSeen,
        local: place.local,
      }))
      .sort((a, b) => b.views - a.views || b.online - a.online || String(b.lastSeen || "").localeCompare(String(a.lastSeen || "")));
  }

  function countryTotals(places) {
    const map = new Map();
    for (const place of places || []) {
      const country = placeCountry(place);
      let row = map.get(country);
      if (!row) {
        row = { country, sessions: 0, views: 0, ips: 0, online: 0 };
        map.set(country, row);
      }
      row.sessions += Number(place.sessions) || 0;
      row.views += Number(place.views) || 0;
      row.ips += 1;
      row.online += Number(place.online) || 0;
    }
    return [...map.values()].sort((a, b) => (b.views || b.sessions) - (a.views || a.sessions) || a.country.localeCompare(b.country));
  }

  function totals(places) {
    const list = places || [];
    const mapped = list.filter((place) => Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lon)) && !place.local);
    return {
      ips: list.length,
      views: list.reduce((sum, place) => sum + (Number(place.views) || 0), 0),
      sessions: list.reduce((sum, place) => sum + (Number(place.sessions) || 0), 0),
      online: list.reduce((sum, place) => sum + (Number(place.online) || 0), 0),
      countries: new Set(mapped.map((place) => place.country).filter(Boolean)).size,
      mapped: mapped.length,
    };
  }

  function project(lon, lat, width = WIDTH, height = HEIGHT) {
    const x = ((Number(lon) + 180) / 360) * width;
    const y = ((90 - Number(lat)) / 180) * height;
    return {
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
    };
  }

  function mapPins(places) {
    const groups = new Map();
    for (const place of places || []) {
      if (place.local) continue;
      const lat = Number(place.lat);
      const lon = Number(place.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
      const key = `${lat.toFixed(1)}|${lon.toFixed(1)}`;
      let pin = groups.get(key);
      if (!pin) {
        const label = [place.city, place.country].filter(Boolean).join(", ") || place.ip;
        pin = { lat, lon, sessions: 0, online: 0, label };
        groups.set(key, pin);
      }
      pin.sessions += Number(place.sessions) || 0;
      pin.online += Number(place.online) || 0;
    }
    return [...groups.values()];
  }

  function filterPlaces(places, filter, country) {
    return (places || []).filter((place) => {
      if (country && placeCountry(place) !== country) return false;
      if (filter === "online") return Number(place.online) > 0;
      if (filter === "mapped") return Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lon)) && !place.local;
      if (filter === "local") return !!place.local;
      return true;
    });
  }

  function parseIpList(text) {
    return [...new Set(String(text || "").split(/[\s,;]+/).map((part) => part.trim()).filter(Boolean))].slice(0, 25);
  }

  function toRecord(place) {
    const lat = Number(place?.lat);
    const lon = Number(place?.lon);
    const local = !!place?.local || isPrivateIp(place?.ip);
    return {
      ip: String(place?.ip || ""),
      city: local ? "" : String(place?.city || ""),
      region: local ? "" : String(place?.region || ""),
      country: local ? "Private network" : String(place?.country || ""),
      isp: String(place?.isp || ""),
      lat: Number.isFinite(lat) ? lat : NaN,
      lon: Number.isFinite(lon) ? lon : NaN,
      page: Array.isArray(place?.businesses) ? place.businesses.join(", ") : String(place?.page || ""),
      views: Number(place?.views) || 0,
      sessions: Number(place?.sessions) || 0,
      live: Number(place?.online) > 0,
      local,
      manual: !!place?.manual,
    };
  }

  function dashboardStats(records) {
    const list = records || [];
    return {
      total: list.length,
      countries: new Set(list.map((row) => row.country).filter((name) => name && name !== "Private network" && name !== "Lookup failed")).size,
      cities: new Set(list.map((row) => row.city).filter(Boolean)).size,
      plotted: list.filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon) && !row.local).length,
    };
  }

  function recordsCsv(records) {
    const cols = ["ip", "city", "region", "country", "isp", "lat", "lon", "page", "views"];
    const lines = [cols.join(",")];
    for (const row of records || []) {
      lines.push(cols.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(","));
    }
    return lines.join("\n");
  }

  function countLabel(n, word) {
    const count = Number(n) || 0;
    return `${count} ${word}${count === 1 ? "" : "s"}`;
  }

  function popupHtml(row) {
    const where = [row.city, row.region, row.country].filter(Boolean).join(", ");
    const coords = Number.isFinite(row.lat) && Number.isFinite(row.lon) ? `${row.lat.toFixed(4)}, ${row.lon.toFixed(4)}` : "unavailable";
    const extra = row.page ? `<br>Page: ${esc(row.page)}` : "";
    const traffic = row.views ? `<br>${esc(countLabel(row.views, "view"))} · ${esc(countLabel(row.sessions, "session"))}` : "";
    return `<b>${esc(row.ip)}</b><br>${esc(where)}<br>ISP: ${esc(row.isp || "Unknown")}<br>Coordinates: ${esc(coords)}${extra}${traffic}`;
  }

  function recordRows(records) {
    if (!records?.length) return `<tr><td colspan="2">No IP locations yet</td></tr>`;
    return records.map((row) => {
      const where = [row.city, row.region].filter(Boolean).join(", ") || (row.local ? "Private network" : "Location unavailable");
      const page = row.page ? `<br><span class="ip-dash-muted">${esc(row.page)}</span>` : "";
      const pill = row.views ? `<div class="ip-dash-pill">${esc(countLabel(row.views, "view"))}</div>` : "";
      return `<tr data-ip="${esc(row.ip)}"><td><b>${esc(row.ip)}</b><br><span class="ip-dash-muted">${esc(where)}</span>${page}</td><td>${esc(row.country || "—")}${pill}</td></tr>`;
    }).join("");
  }

  function render(payload) {
    const places = Array.isArray(payload?.places) ? payload.places : [];
    const records = places.map(toRecord);
    const stats = dashboardStats(records);
    const note = payload?.note || "Website page views from the last 14 days. Locations are estimated from the visitor IP. Private networks stay off the map.";
    return `<div class="ip-dash" id="ip-map-board">
      <section class="ip-dash-stats">
        <div class="ip-dash-stat"><label>IP addresses</label><strong id="ip-total">${stats.total}</strong><small>Loaded into dashboard</small></div>
        <div class="ip-dash-stat"><label>Countries</label><strong id="ip-countries">${stats.countries}</strong><small>Unique countries found</small></div>
        <div class="ip-dash-stat"><label>Cities</label><strong id="ip-cities">${stats.cities}</strong><small>Unique cities found</small></div>
        <div class="ip-dash-stat"><label>Locations plotted</label><strong id="ip-plotted">${stats.plotted}</strong><small>With valid coordinates</small></div>
      </section>
      <section class="ip-dash-layout">
        <div class="ip-dash-panel">
          <div class="ip-dash-head"><h2>World map · IP locations</h2><div class="ip-dash-legend"><span><i></i>Resolved IP</span><span>Click a marker for details</span></div></div>
          <div id="ip-leaflet" role="region" aria-label="World map of IP locations"></div>
        </div>
        <aside class="ip-dash-side">
          <div class="ip-dash-panel ip-dash-section">
            <h2>Add IP addresses</h2>
            <textarea id="ip-lookup" placeholder="Enter one public IP address per line"></textarea>
            <div class="ip-dash-actions">
              <button type="button" id="ip-resolve">Locate IPs</button>
              <button type="button" class="secondary" id="ip-sample">Load sample</button>
              <button type="button" class="secondary" id="ip-clear">Clear added</button>
              <button type="button" class="secondary" id="ip-refresh">Refresh traffic</button>
            </div>
            <div class="ip-dash-status" id="ip-status">Website visits are already on the map. Add public IPs, then select Locate IPs.</div>
            <p class="ip-dash-hint">Uses the ipwho.is geolocation service. Requests may be rate-limited. Private networks stay off the map.</p>
          </div>
          <div class="ip-dash-panel ip-dash-section">
            <h2>Location records</h2>
            <input class="ip-dash-search" id="ip-filter" placeholder="Filter IP, city, country or ISP…" />
            <div class="ip-dash-table"><table class="ip-dash-records"><thead><tr><th>IP / Location</th><th>Country</th></tr></thead><tbody id="ip-rows">${recordRows(records)}</tbody></table></div>
            <div class="ip-dash-actions"><button type="button" class="secondary" id="ip-export">Export CSV</button></div>
          </div>
        </aside>
      </section>
      <p class="ip-dash-foot">${esc(note)} Geolocation is an estimate. It does not identify a person's exact address.</p>
    </div>`;
  }

  let activeMap = null;

  function bind(root, payload, onRefresh) {
    const board = root?.querySelector?.("#ip-map-board");
    if (!board) return;
    if (activeMap) {
      activeMap.remove();
      activeMap = null;
    }
    const traffic = (Array.isArray(payload?.places) ? payload.places : []).map(toRecord);
    let manual = [];
    const all = () => traffic.concat(manual);
    const leaflet = root.L || globalThis.L;
    const mapEl = board.querySelector("#ip-leaflet");
    let markers = null;
    if (leaflet && mapEl) {
      const map = leaflet.map(mapEl, { worldCopyJump: true }).setView([22, 12], 2);
      leaflet.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Tiles &copy; Esri",
        maxZoom: 16,
      }).addTo(map);
      leaflet.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 16,
        pane: "overlayPane",
      }).addTo(map);
      markers = leaflet.featureGroup().addTo(map);
      activeMap = map;
      setTimeout(() => map.invalidateSize(), 80);
    } else if (mapEl) {
      mapEl.textContent = "The world map did not load.";
    }
    const paintMarkers = () => {
      if (!markers || !activeMap || !leaflet) return;
      markers.clearLayers();
      for (const row of all()) {
        if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon) || row.local) continue;
        const marker = leaflet.circleMarker([row.lat, row.lon], {
          radius: 8,
          color: "#75e3c1",
          weight: 2,
          fillColor: "#24b88b",
          fillOpacity: 0.85,
          ip: row.ip,
        }).addTo(markers);
        marker.bindPopup(popupHtml(row));
      }
      if (markers.getLayers().length) activeMap.fitBounds(markers.getBounds().pad(0.2), { maxZoom: 5 });
    };
    const paintTable = () => {
      const query = String(board.querySelector("#ip-filter")?.value || "").toLowerCase();
      const records = all();
      const visible = records.filter((row) => [row.ip, row.city, row.region, row.country, row.isp, row.page].join(" ").toLowerCase().includes(query));
      const rows = board.querySelector("#ip-rows");
      if (rows) rows.innerHTML = recordRows(visible.length || !query ? visible : []);
      if (rows && query && !visible.length) rows.innerHTML = `<tr><td colspan="2">No matching records</td></tr>`;
      const stats = dashboardStats(records);
      const set = (id, value) => {
        const node = board.querySelector(id);
        if (node) node.textContent = String(value);
      };
      set("#ip-total", stats.total);
      set("#ip-countries", stats.countries);
      set("#ip-cities", stats.cities);
      set("#ip-plotted", stats.plotted);
      rows?.querySelectorAll("tr[data-ip]").forEach((tr) => {
        tr.addEventListener("click", () => {
          const row = records.find((item) => item.ip === tr.getAttribute("data-ip"));
          if (!row || !activeMap || !Number.isFinite(row.lat) || !Number.isFinite(row.lon)) return;
          activeMap.setView([row.lat, row.lon], 7);
          markers?.getLayers().find((item) => item.options.ip === row.ip)?.openPopup();
        });
      });
    };
    const paint = () => {
      paintMarkers();
      paintTable();
    };
    paint();
    board.querySelector("#ip-filter")?.addEventListener("input", paintTable);
    board.querySelector("#ip-sample")?.addEventListener("click", () => {
      const box = board.querySelector("#ip-lookup");
      if (box) box.value = SAMPLE_IPS;
      const status = board.querySelector("#ip-status");
      if (status) status.textContent = "Sample public IPs loaded. Click Locate IPs.";
    });
    board.querySelector("#ip-clear")?.addEventListener("click", () => {
      manual = [];
      const box = board.querySelector("#ip-lookup");
      if (box) box.value = "";
      const status = board.querySelector("#ip-status");
      if (status) status.textContent = "Added addresses cleared. Website traffic remains on the map.";
      paint();
    });
    board.querySelector("#ip-refresh")?.addEventListener("click", () => onRefresh?.());
    board.querySelector("#ip-export")?.addEventListener("click", () => {
      const records = all();
      const status = board.querySelector("#ip-status");
      if (!records.length) {
        if (status) status.textContent = "No records to export.";
        return;
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([recordsCsv(records)], { type: "text/csv" }));
      link.download = "global-ip-locations.csv";
      link.click();
      URL.revokeObjectURL(link.href);
    });
    board.querySelector("#ip-resolve")?.addEventListener("click", async () => {
      const button = board.querySelector("#ip-resolve");
      const status = board.querySelector("#ip-status");
      const ips = parseIpList(board.querySelector("#ip-lookup")?.value);
      if (!ips.length) {
        if (status) status.textContent = "Enter at least one IP address.";
        return;
      }
      const bad = ips.filter((ip) => !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) && !ip.includes(":"));
      if (bad.length) {
        if (status) status.textContent = `Check IP format: ${bad.join(", ")}`;
        return;
      }
      const blocked = ips.filter((ip) => isPrivateIp(ip));
      if (blocked.length) {
        if (status) status.textContent = `Private networks stay off the map: ${blocked.join(", ")}`;
        return;
      }
      if (button) button.disabled = true;
      let done = 0;
      let failed = 0;
      for (const ip of ips) {
        if (all().some((row) => row.ip === ip)) {
          done += 1;
          continue;
        }
        if (status) status.textContent = `Looking up ${ip} (${done + failed + 1}/${ips.length})…`;
        try {
          const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`);
          if (!res.ok) throw new Error(`Lookup failed (HTTP ${res.status})`);
          const body = await res.json();
          const parsed = parseWhois(body);
          if (!parsed) throw new Error(body?.message || "IP lookup failed");
          manual.push(toRecord({ ...parsed, ip, isp: body?.connection?.isp || "", manual: true }));
        } catch (err) {
          failed += 1;
          manual.push(toRecord({ ip, country: "Lookup failed", isp: err.message, manual: true }));
        }
        done += 1;
        paint();
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      if (status) status.textContent = `Finished: ${done} processed, ${failed} lookup errors.`;
      if (button) button.disabled = false;
    });
  }

  root.POSIpMap = {
    ONLINE_MS,
    isPrivateIp,
    groupIpSessions,
    groupWebsiteTraffic,
    parseWhois,
    countryTotals,
    totals,
    project,
    mapPins,
    filterPlaces,
    parseIpList,
    toRecord,
    dashboardStats,
    recordsCsv,
    popupHtml,
    render,
    bind,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
