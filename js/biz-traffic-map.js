/* Live business-admin map. Login time alone is not online. */
(function (root) {
  const ONLINE_MS = 90 * 1000;
  const RECENT_MS = 30 * 60 * 1000;
  const STATUS_RANK = { online: 3, recent: 2, offline: 1 };
  const COLORS = { online: "#22c55e", recent: "#f59e0b", offline: "#94a3b8" };
  const NOTE = "Locations are approximate, estimated from the business admin IP address. They are not an exact street address. A login by itself does not mark a business online.";
  let activeMap = null;

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function stamp(value) {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const parsed = Date.parse(String(value).trim().replace(" ", "T"));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function kolkataDay(ms) {
    if (!ms) return "";
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(ms));
    } catch {
      return "";
    }
  }

  function whenText(value) {
    const ms = stamp(value);
    if (!ms) return "—";
    try {
      return new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(ms));
    } catch {
      return "—";
    }
  }

  function isPrivateIp(raw) {
    const geo = root.POSIpMap;
    if (geo?.isPrivateIp) return geo.isPrivateIp(raw);
    const ip = String(raw || "").trim().toLowerCase();
    return !ip || ip === "localhost" || ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("127.");
  }

  function adminStatus(row, now = Date.now()) {
    const named = String(row?.status || "");
    if (named === "online" || named === "recent" || named === "offline") return named;
    const beat = stamp(row?.heartbeatAt);
    const out = stamp(row?.logoutAt);
    if (beat && now - beat <= ONLINE_MS && (!out || out < beat)) return "online";
    const last = Math.max(beat || 0, out || 0);
    if (last && now - last <= RECENT_MS) return "recent";
    return "offline";
  }

  function located(row) {
    const lat = Number(row?.lat);
    const lon = Number(row?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    if (lat === 0 && lon === 0) return false;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
    return !isPrivateIp(row?.ip);
  }

  function foldBusinessAdmins(rows, now = Date.now()) {
    const byBusiness = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const businessId = String(row?.businessId || row?.business_id || "").trim();
      if (!businessId) continue;
      const status = adminStatus(row, now);
      const beat = stamp(row?.heartbeatAt || row?.heartbeat_at);
      const activeToday = row?.activeToday === true || row?.activeToday === 1 || row?.activeToday === "1" || (beat && kolkataDay(beat) === kolkataDay(now));
      const place = {
        businessId,
        businessName: String(row?.businessName || row?.business_name || "Business"),
        ownerName: String(row?.ownerName || row?.owner_name || "—"),
        category: String(row?.category || "Other"),
        ip: String(row?.ip || "").trim(),
        loginAt: row?.loginAt || row?.login_at || null,
        lastActive: row?.heartbeatAt || row?.heartbeat_at || row?.lastActive || null,
        logoutAt: row?.logoutAt || row?.logout_at || null,
        country: String(row?.country || ""),
        region: String(row?.region || ""),
        city: String(row?.city || ""),
        lat: row?.lat,
        lon: row?.lon,
        status,
        activeToday: Boolean(activeToday),
        local: isPrivateIp(row?.ip),
      };
      place.plotted = located(place);
      const prev = byBusiness.get(businessId);
      if (!prev) {
        byBusiness.set(businessId, place);
        continue;
      }
      const better = (STATUS_RANK[status] || 0) - (STATUS_RANK[prev.status] || 0);
      const newer = stamp(place.lastActive) - stamp(prev.lastActive);
      if (better > 0 || (better === 0 && newer > 0)) {
        place.activeToday = place.activeToday || prev.activeToday;
        byBusiness.set(businessId, place);
      } else if (activeToday) {
        prev.activeToday = true;
      }
    }
    return [...byBusiness.values()].sort((a, b) => {
      const rank = (STATUS_RANK[b.status] || 0) - (STATUS_RANK[a.status] || 0);
      if (rank) return rank;
      return String(a.businessName).localeCompare(String(b.businessName));
    });
  }

  function summarize(rows, now = Date.now()) {
    const list = foldBusinessAdmins(rows, now);
    let online = 0;
    let recent = 0;
    let offline = 0;
    let activeToday = 0;
    let plotted = 0;
    for (const row of list) {
      if (row.status === "online") online += 1;
      else if (row.status === "recent") recent += 1;
      else offline += 1;
      if (row.activeToday) activeToday += 1;
      if (row.plotted) plotted += 1;
    }
    return { total: list.length, online, recent, offline, activeToday, plotted };
  }

  function filterBusinesses(rows, filters = {}) {
    const country = String(filters.country || "").trim().toLowerCase();
    const region = String(filters.region || "").trim().toLowerCase();
    const city = String(filters.city || "").trim().toLowerCase();
    const category = String(filters.category || "").trim().toLowerCase();
    const status = String(filters.status || "").trim().toLowerCase();
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      if (country && String(row.country || "").toLowerCase() !== country) return false;
      if (region && String(row.region || "").toLowerCase() !== region) return false;
      if (city && String(row.city || "").toLowerCase() !== city) return false;
      if (category && String(row.category || "").toLowerCase() !== category) return false;
      if (status && row.status !== status) return false;
      return true;
    });
  }

  function choices(rows) {
    const bag = { country: new Set(), region: new Set(), city: new Set(), category: new Set() };
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row.country) bag.country.add(row.country);
      if (row.region) bag.region.add(row.region);
      if (row.city) bag.city.add(row.city);
      if (row.category) bag.category.add(row.category);
    }
    const sort = (set) => [...set].sort((a, b) => a.localeCompare(b));
    return {
      country: sort(bag.country),
      region: sort(bag.region),
      city: sort(bag.city),
      category: sort(bag.category),
    };
  }

  function statusLabel(status) {
    if (status === "online") return "Online";
    if (status === "recent") return "Recently active";
    return "Offline";
  }

  function popupHtml(row) {
    const place = [row.city, row.region, row.country].filter(Boolean).join(", ") || (row.local ? "Private network" : "Location unavailable");
    return `<strong>${esc(row.businessName)}</strong><br>
      Business ID ${esc(row.businessId)}<br>
      Owner ${esc(row.ownerName)}<br>
      IP ${esc(row.ip || "—")}<br>
      ${esc(place)}<br>
      Category ${esc(row.category || "—")}<br>
      Login ${esc(whenText(row.loginAt))}<br>
      Last active ${esc(whenText(row.lastActive))}<br>
      Status ${esc(statusLabel(row.status))}<br>
      <span>Approximate IP location, not an exact address.</span>`;
  }

  function optionList(values, current, allLabel) {
    const opts = [`<option value="">${esc(allLabel)}</option>`];
    for (const value of values || []) {
      opts.push(`<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(value)}</option>`);
    }
    return opts.join("");
  }

  function render(data) {
    const rows = Array.isArray(data?.businesses) ? data.businesses : foldBusinessAdmins(data?.rows || []);
    const summary = data?.summary || summarize(rows);
    return `<div class="ip-dash biz-dash" id="biz-map-board">
      <div class="ip-dash-stats">
        <div class="ip-dash-stat"><label>Total businesses</label><strong id="biz-total">${esc(summary.total || 0)}</strong><small>Registered admins</small></div>
        <div class="ip-dash-stat"><label>Online now</label><strong id="biz-online">${esc(summary.online || 0)}</strong><small>Heartbeat in 90 seconds</small></div>
        <div class="ip-dash-stat"><label>Offline</label><strong id="biz-offline">${esc(summary.offline || 0)}</strong><small>No recent heartbeat</small></div>
        <div class="ip-dash-stat"><label>Active today</label><strong id="biz-today">${esc(summary.activeToday || 0)}</strong><small>Heartbeat today</small></div>
      </div>
      <div class="ip-dash-layout">
        <section class="ip-dash-panel">
          <div class="ip-dash-head">
            <h2>Business admin traffic</h2>
            <div class="ip-dash-legend">
              <span><i class="is-online"></i>Online</span>
              <span><i class="is-recent"></i>Recent</span>
              <span><i class="is-offline"></i>Offline</span>
            </div>
          </div>
          <div id="biz-leaflet" role="img" aria-label="World map of business admins"></div>
        </section>
        <aside class="ip-dash-side">
          <section class="ip-dash-panel ip-dash-section">
            <h2>Filters</h2>
            <div class="ip-dash-filters">
              <label>Country <select id="biz-country"></select></label>
              <label>State <select id="biz-region"></select></label>
              <label>City <select id="biz-city"></select></label>
              <label>Category <select id="biz-category"></select></label>
              <label>Status <select id="biz-status">
                <option value="">All</option>
                <option value="online">Online</option>
                <option value="recent">Recently active</option>
                <option value="offline">Offline</option>
              </select></label>
            </div>
            <p class="ip-dash-status" id="biz-status-line"></p>
          </section>
          <section class="ip-dash-panel ip-dash-section">
            <h2>Businesses</h2>
            <div class="ip-dash-table"><table class="ip-dash-records"><thead><tr><th>Business</th><th>Place</th><th>Status</th></tr></thead><tbody id="biz-rows"></tbody></table></div>
          </section>
        </aside>
      </div>
      <p class="ip-dash-foot">${esc(data?.note || NOTE)}</p>
    </div>`;
  }

  function bind(rootEl, data) {
    const board = rootEl?.querySelector?.("#biz-map-board") || rootEl;
    if (!board) return null;
    if (activeMap) {
      activeMap.remove();
      activeMap = null;
    }
    let rows = Array.isArray(data?.businesses) ? data.businesses : [];
    let summary = data?.summary || summarize(rows);
    const filters = { country: "", region: "", city: "", category: "", status: "" };
    const markers = new Map();
    let fitted = false;
    let openId = "";
    const Leaflet = root.L;
    const canvas = Leaflet?.canvas ? Leaflet.canvas({ padding: 0.5 }) : undefined;
    const map = Leaflet ? Leaflet.map(board.querySelector("#biz-leaflet"), { preferCanvas: true, worldCopyJump: true }) : null;
    if (map) {
      activeMap = map;
      Leaflet.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Tiles &copy; Esri",
        maxZoom: 16,
      }).addTo(map);
      Leaflet.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 16,
        pane: "overlayPane",
      }).addTo(map);
      map.setView([22, 12], 2);
      setTimeout(() => map.invalidateSize(), 80);
    }
    const layer = map ? Leaflet.layerGroup().addTo(map) : null;

    function paintFilters() {
      const pick = choices(rows);
      const country = board.querySelector("#biz-country");
      const region = board.querySelector("#biz-region");
      const city = board.querySelector("#biz-city");
      const category = board.querySelector("#biz-category");
      if (country) country.innerHTML = optionList(pick.country, filters.country, "All countries");
      if (region) region.innerHTML = optionList(pick.region, filters.region, "All states");
      if (city) city.innerHTML = optionList(pick.city, filters.city, "All cities");
      if (category) category.innerHTML = optionList(pick.category, filters.category, "All categories");
    }

    function paintStats() {
      const set = (id, value) => {
        const el = board.querySelector(id);
        if (el) el.textContent = String(value || 0);
      };
      set("#biz-total", summary.total);
      set("#biz-online", summary.online);
      set("#biz-offline", summary.offline);
      set("#biz-today", summary.activeToday);
    }

    function paint() {
      const shown = filterBusinesses(rows, filters);
      paintStats();
      const line = board.querySelector("#biz-status-line");
      if (line) {
        line.textContent = `${shown.length} shown · ${summary.plotted || 0} plotted · refreshes every 30 seconds`;
      }
      const body = board.querySelector("#biz-rows");
      if (body) {
        const slice = shown.slice(0, 100);
        body.innerHTML = slice.map((row) => `<tr data-biz-id="${esc(row.businessId)}">
          <td><strong>${esc(row.businessName)}</strong><small>${esc(row.category)}</small></td>
          <td>${esc(row.city || row.region || row.country || (row.local ? "Private network" : "—"))}</td>
          <td><span class="biz-status is-${esc(row.status)}">${esc(statusLabel(row.status))}</span></td>
        </tr>`).join("") || `<tr><td colspan="3">No businesses match these filters.</td></tr>`;
        if (shown.length > slice.length) {
          body.insertAdjacentHTML("beforeend", `<tr><td colspan="3">${shown.length - slice.length} more match. Narrow the filters to see them.</td></tr>`);
        }
      }
      if (!map || !layer) return;
      layer.clearLayers();
      markers.clear();
      const bounds = [];
      for (const row of shown) {
        if (!row.plotted) continue;
        const marker = Leaflet.circleMarker([Number(row.lat), Number(row.lon)], {
          renderer: canvas,
          radius: row.status === "online" ? 8 : 6,
          color: COLORS[row.status] || COLORS.offline,
          fillColor: COLORS[row.status] || COLORS.offline,
          fillOpacity: 0.9,
          weight: 1,
        });
        marker.bindPopup(popupHtml(row));
        marker.on("click", () => { openId = row.businessId; });
        marker.addTo(layer);
        markers.set(row.businessId, marker);
        bounds.push([Number(row.lat), Number(row.lon)]);
      }
      if (!fitted && bounds.length) {
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 5 });
        fitted = true;
      }
      if (openId && markers.get(openId)) markers.get(openId).openPopup();
    }

    paintFilters();
    paint();
    ["biz-country", "biz-region", "biz-city", "biz-category", "biz-status"].forEach((id) => {
      board.querySelector(`#${id}`)?.addEventListener("change", (event) => {
        const key = id.replace("biz-", "");
        filters[key] = event.target.value;
        paintFilters();
        paint();
      });
    });
    board.querySelector("#biz-rows")?.addEventListener("click", (event) => {
      const rowEl = event.target.closest?.("[data-biz-id]");
      const marker = markers.get(rowEl?.dataset?.bizId || "");
      if (!marker || !map) return;
      openId = rowEl.dataset.bizId;
      map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 4), { duration: 0.6 });
      marker.openPopup();
    });

    return {
      update(next) {
        rows = Array.isArray(next?.businesses) ? next.businesses : [];
        summary = next?.summary || summarize(rows);
        paintFilters();
        paint();
      },
      destroy() {
        if (activeMap === map && map) {
          map.remove();
          activeMap = null;
        }
      },
    };
  }

  const api = {
    ONLINE_MS,
    RECENT_MS,
    NOTE,
    adminStatus,
    foldBusinessAdmins,
    summarize,
    filterBusinesses,
    choices,
    popupHtml,
    statusLabel,
    render,
    bind,
  };
  root.POSBizTraffic = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
