/* Original simplified continent outlines for the Master Admin IP map. */
(function (root) {
  const ONLINE_MS = 5 * 60 * 1000;
  const WIDTH = 960;
  const HEIGHT = 480;
  const LAND = [
    [[-168, 71], [-153, 70], [-140, 70], [-128, 71], [-105, 73], [-88, 74], [-82, 68], [-70, 68], [-64, 60], [-56, 53], [-64, 47], [-70, 45], [-74, 40], [-76, 35], [-81, 25], [-80, 25], [-82, 30], [-90, 29], [-97, 26], [-97, 21], [-87, 21], [-90, 16], [-84, 10], [-77, 8], [-81, 8], [-87, 13], [-92, 16], [-97, 16], [-105, 21], [-110, 23], [-115, 32], [-124, 40], [-124, 48], [-130, 55], [-140, 60], [-153, 60], [-166, 65], [-168, 71]],
    [[-81, 12], [-77, 7], [-71, 12], [-62, 8], [-51, 1], [-35, -5], [-35, -8], [-39, -16], [-40, -22], [-48, -28], [-52, -34], [-58, -38], [-62, -40], [-65, -47], [-68, -55], [-71, -55], [-75, -52], [-74, -45], [-72, -36], [-74, -18], [-70, -18], [-77, -5], [-80, 0], [-81, 8], [-81, 12]],
    [[-10, 36], [-9, 43], [-8, 52], [-5, 58], [-6, 62], [0, 61], [5, 62], [10, 59], [12, 66], [20, 70], [28, 71], [30, 70], [30, 60], [24, 45], [20, 41], [16, 38], [10, 37], [0, 36], [-5, 36], [-10, 36]],
    [[-5, 50], [-2, 51], [1, 51], [1, 53], [-2, 59], [-5, 58], [-8, 55], [-5, 50]],
    [[-17, 15], [-17, 21], [-16, 28], [-10, 32], [-6, 36], [10, 37], [11, 32], [25, 32], [32, 31], [43, 12], [51, 12], [44, -1], [42, -16], [35, -26], [32, -29], [28, -34], [18, -35], [17, -29], [12, -18], [13, -6], [9, 4], [8, 4], [9, 13], [-5, 5], [-16, 12], [-17, 15]],
    [[43, -12], [50, -15], [47, -25], [43, -25], [43, -12]],
    [[26, 41], [32, 31], [36, 36], [44, 37], [48, 30], [56, 27], [62, 25], [68, 24], [72, 21], [73, 16], [77, 8], [80, 13], [88, 22], [92, 22], [98, 16], [104, 2], [109, 1], [104, 7], [109, 14], [120, 22], [122, 31], [129, 35], [132, 43], [140, 45], [142, 47], [135, 48], [128, 42], [126, 34], [120, 38], [118, 39], [110, 40], [100, 42], [90, 44], [80, 48], [70, 55], [60, 56], [50, 50], [40, 46], [32, 45], [28, 41]],
    [[130, 31], [134, 33], [136, 35], [140, 35], [141, 41], [145, 43], [142, 40], [136, 34], [131, 31]],
    [[113, -22], [122, -18], [128, -15], [136, -12], [142, -11], [146, -15], [153, -25], [153, -32], [150, -38], [146, -39], [140, -38], [135, -35], [128, -32], [124, -34], [115, -35], [114, -28], [113, -22]],
    [[-73, 78], [-60, 76], [-44, 70], [-22, 70], [-20, 80], [-44, 83], [-62, 83], [-73, 78]],
  ];

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

  function landPath(width, height) {
    return LAND.map((ring) => {
      const commands = ring.map((point, index) => {
        const spot = project(point[0], point[1], width, height);
        return `${index ? "L" : "M"}${spot.x} ${spot.y}`;
      });
      return `${commands.join("")}Z`;
    }).join("");
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

  function graticule(width, height) {
    const lines = [];
    for (let lon = -180; lon <= 180; lon += 30) {
      const spot = project(lon, 0, width, height);
      const cls = lon === 0 ? "ip-graticule ip-equator" : "ip-graticule";
      lines.push(`<line class="${cls}" x1="${spot.x}" y1="0" x2="${spot.x}" y2="${height}" />`);
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const spot = project(0, lat, width, height);
      const cls = lat === 0 ? "ip-graticule ip-equator" : "ip-graticule";
      lines.push(`<line class="${cls}" x1="0" y1="${spot.y}" x2="${width}" y2="${spot.y}" />`);
    }
    return lines.join("");
  }

  function worldSvg(places) {
    const pins = mapPins(places);
    const dots = pins.map((pin) => {
      const spot = project(pin.lon, pin.lat);
      const radius = Math.min(11, 3.5 + Math.sqrt(pin.sessions));
      const cls = pin.online > 0 ? "ip-pin is-on" : "ip-pin is-off";
      const halo = pin.online > 0 ? `<circle class="ip-pin-halo" cx="${spot.x}" cy="${spot.y}" r="${(radius + 4).toFixed(1)}" />` : "";
      const title = `${pin.label} · ${pin.sessions} session${pin.sessions === 1 ? "" : "s"}`;
      return `${halo}<g class="${cls}"><title>${esc(title)}</title><circle cx="${spot.x}" cy="${spot.y}" r="${radius.toFixed(1)}" /></g>`;
    }).join("");
    return `<div class="ip-map-legend"><span><i class="is-on"></i>Online</span><span><i class="is-off"></i>Recent</span></div>
      <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="World map of staff sign-in locations">
        <rect class="ip-ocean" width="${WIDTH}" height="${HEIGHT}" />
        ${graticule(WIDTH, HEIGHT)}
        <path class="ip-land" d="${landPath(WIDTH, HEIGHT)}" />
        ${dots}
      </svg>`;
  }

  function locationText(place) {
    if (place.local) return "Private network";
    const parts = [place.city, place.region, place.country].map((part) => String(part || "").trim()).filter(Boolean);
    return parts.length ? parts.join(", ") : "Not mapped yet";
  }

  function whenText(value) {
    if (!value) return "—";
    return String(value).replace("T", " ").replace(/\.\d+Z$/, "").replace(/Z$/, "").slice(0, 16);
  }

  function countLabel(n, word) {
    const count = Number(n) || 0;
    return `${count} ${word}${count === 1 ? "" : "s"}`;
  }

  function activityText(place) {
    if (place.views != null) {
      return `${countLabel(place.views, "view")} · ${countLabel(place.sessions, "session")}${Number(place.online) > 0 ? " · live" : ""}`;
    }
    return `${Number(place.online) || 0} online · ${Number(place.sessions) || 0}`;
  }

  function placeRows(places) {
    if (!places?.length) return `<tr><td colspan="5">No website visits in this view.</td></tr>`;
    return places.map((place) => `<tr>
      <td>${esc(locationText(place))}</td>
      <td>${esc(place.businesses?.length ? place.businesses.join(", ") : "—")}</td>
      <td><code>${esc(place.ip)}</code></td>
      <td>${esc(activityText(place))}</td>
      <td>${esc(whenText(place.lastSeen))}</td>
    </tr>`).join("");
  }

  function countryList(countries) {
    if (!countries?.length) return `<li class="hint">No locations yet.</li>`;
    return countries.map((row) => {
      const amount = Number(row.views) > 0 ? `${Number(row.views)} views` : `${Number(row.sessions) || 0} sessions`;
      return `<li><button type="button" data-ip-country="${esc(row.country)}"><strong>${esc(row.country)}</strong><span>${Number(row.ips) || 0} IPs · ${amount}</span></button></li>`;
    }).join("");
  }

  function render(payload) {
    const places = Array.isArray(payload?.places) ? payload.places : [];
    const countries = Array.isArray(payload?.countries) && payload.countries.length ? payload.countries : countryTotals(places);
    const website = payload?.traffic !== "staff";
    const note = payload?.note || "Website page views from the last 14 days. Locations are estimated from the visitor IP. Private networks stay off the map.";
    const subject = website ? "Page" : "Business";
    return `<div id="ip-map-board">
      <div class="ip-map-filters">
        <button type="button" data-ip-filter="all" class="is-on">All</button>
        <button type="button" data-ip-filter="online">Online</button>
        <button type="button" data-ip-filter="mapped">On map</button>
        <button type="button" data-ip-filter="local">Private</button>
        <button type="button" data-ip-refresh>Refresh</button>
      </div>
      <div class="ip-map-layout">
        <div class="ip-map-stage" id="ip-map-stage">${worldSvg(places)}</div>
        <aside class="ip-map-side">
          <h3>Countries</h3>
          <ul>${countryList(countries)}</ul>
        </aside>
      </div>
      <div class="ip-map-table table-wrap"><table class="master-data data"><thead><tr>
        <th>Location</th><th>${subject}</th><th>IP</th><th>Traffic</th><th>Last seen</th>
      </tr></thead><tbody id="ip-map-rows">${placeRows(places)}</tbody></table></div>
      <p class="hint">${esc(note)} Public addresses are located once and cached for 30 days.</p>
    </div>`;
  }

  function bind(root, payload, onRefresh) {
    const board = root?.querySelector?.("#ip-map-board");
    if (!board) return;
    let filter = "all";
    let country = "";
    const paint = () => {
      const places = filterPlaces(payload?.places, filter, country);
      const stage = board.querySelector("#ip-map-stage");
      const rows = board.querySelector("#ip-map-rows");
      if (stage) stage.innerHTML = worldSvg(places);
      if (rows) rows.innerHTML = placeRows(places);
      board.querySelectorAll("[data-ip-filter]").forEach((button) => {
        button.classList.toggle("is-on", !country && button.getAttribute("data-ip-filter") === filter);
      });
      board.querySelectorAll("[data-ip-country]").forEach((button) => {
        button.classList.toggle("is-on", button.getAttribute("data-ip-country") === country);
      });
    };
    board.addEventListener("click", (event) => {
      const refresh = event.target.closest?.("[data-ip-refresh]");
      if (refresh) {
        onRefresh?.();
        return;
      }
      const filterBtn = event.target.closest?.("[data-ip-filter]");
      if (filterBtn) {
        filter = filterBtn.getAttribute("data-ip-filter") || "all";
        country = "";
        paint();
        return;
      }
      const countryBtn = event.target.closest?.("[data-ip-country]");
      if (countryBtn) {
        const next = countryBtn.getAttribute("data-ip-country") || "";
        country = country === next ? "" : next;
        filter = "all";
        paint();
      }
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
    render,
    bind,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
