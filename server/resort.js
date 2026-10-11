import { query, withTransaction } from "./db.js";
import { bid, authUser } from "./context.js";
import { requirePerm, requirePermAny } from "./auth.js";
import "../js/resort.js";

const R = () => globalThis.POSResort;

function clip(v, n) {
  return String(v ?? "").trim().slice(0, n);
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function flag(v) {
  return R().flagOn(v) ? 1 : 0;
}

function parseJson(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

async function loadBiz(shopId) {
  const rows = await query("SELECT * FROM businesses WHERE id=? LIMIT 1", [shopId]);
  return rows[0] || null;
}

function assertResort(biz) {
  if (!R().isResortShop(biz)) {
    const err = new Error("Resort model is not enabled for this shop");
    err.status = 403;
    throw err;
  }
}

async function audit(action, detail, shopId = bid()) {
  const user = authUser() || {};
  await query(
    `INSERT INTO resort_audit (id, action, detail, user_id, user_name, business_id) VALUES (?,?,?,?,?,?)`,
    [crypto.randomUUID(), clip(action, 64), clip(detail, 500), user.id || null, clip(user.first_name || user.name || user.email || "", 180), shopId],
  );
}

export async function ensureResortSchema() {
  await query(`CREATE TABLE IF NOT EXISTS resort_settings (
    business_id VARCHAR(255) PRIMARY KEY,
    settings_json MEDIUMTEXT NULL,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS resort_properties (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    address VARCHAR(255) NULL,
    phone VARCHAR(32) NULL,
    email VARCHAR(160) NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS resort_rooms (
    id VARCHAR(255) PRIMARY KEY,
    property_id VARCHAR(255) NULL,
    number VARCHAR(32) NOT NULL,
    name VARCHAR(180) NULL,
    category VARCHAR(64) NOT NULL DEFAULT 'standard',
    description TEXT NULL,
    photos_json MEDIUMTEXT NULL,
    amenities_json MEDIUMTEXT NULL,
    max_adults INT NOT NULL DEFAULT 2,
    max_children INT NOT NULL DEFAULT 1,
    bed_type VARCHAR(64) NULL,
    beds INT NOT NULL DEFAULT 1,
    rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    weekday_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    weekend_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    extra_adult_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    extra_child_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    extra_bed_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_rate DECIMAL(8,2) NOT NULL DEFAULT 12,
    service_rate DECIMAL(8,2) NOT NULL DEFAULT 0,
    physical_status VARCHAR(32) NOT NULL DEFAULT 'available',
    hk_status VARCHAR(32) NOT NULL DEFAULT 'ready',
    active TINYINT(1) NOT NULL DEFAULT 1,
    rates_json MEDIUMTEXT NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX (business_id),
    INDEX (number),
    INDEX (physical_status)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS resort_bookings (
    id VARCHAR(255) PRIMARY KEY,
    booking_no VARCHAR(32) NOT NULL,
    property_id VARCHAR(255) NULL,
    room_id VARCHAR(255) NOT NULL,
    category VARCHAR(64) NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'hold',
    payment_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    nights INT NOT NULL DEFAULT 1,
    adults INT NOT NULL DEFAULT 1,
    children INT NOT NULL DEFAULT 0,
    guest_name VARCHAR(180) NULL,
    guest_mobile VARCHAR(32) NULL,
    guest_email VARCHAR(160) NULL,
    id_type VARCHAR(32) NULL,
    id_number VARCHAR(64) NULL,
    source VARCHAR(32) NOT NULL DEFAULT 'website',
    expires_at TIMESTAMP(3) NULL,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    paid DECIMAL(12,2) NOT NULL DEFAULT 0,
    due DECIMAL(12,2) NOT NULL DEFAULT 0,
    price_json MEDIUMTEXT NULL,
    checked_in_at TIMESTAMP(3) NULL,
    checked_out_at TIMESTAMP(3) NULL,
    cancelled_at TIMESTAMP(3) NULL,
    cancel_reason VARCHAR(255) NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX (business_id),
    INDEX (room_id),
    INDEX (status),
    INDEX (booking_no),
    INDEX (check_in),
    INDEX (expires_at)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS resort_blocks (
    id VARCHAR(255) PRIMARY KEY,
    room_id VARCHAR(255) NOT NULL,
    kind VARCHAR(32) NOT NULL DEFAULT 'blocked',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    note VARCHAR(255) NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id),
    INDEX (room_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS resort_folio (
    id VARCHAR(255) PRIMARY KEY,
    booking_id VARCHAR(255) NOT NULL,
    room_id VARCHAR(255) NULL,
    kind VARCHAR(32) NOT NULL DEFAULT 'service',
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    note VARCHAR(255) NULL,
    ref_id VARCHAR(255) NULL,
    user_id VARCHAR(255) NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (booking_id),
    INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS resort_payments (
    id VARCHAR(255) PRIMARY KEY,
    booking_id VARCHAR(255) NOT NULL,
    method VARCHAR(32) NOT NULL DEFAULT 'cash',
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    gateway_ref VARCHAR(120) NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (booking_id),
    INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS resort_services (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    kind VARCHAR(32) NOT NULL DEFAULT 'service',
    price DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_rate DECIMAL(8,2) NOT NULL DEFAULT 0,
    active TINYINT(1) NOT NULL DEFAULT 1,
    business_id VARCHAR(255) NOT NULL,
    INDEX (business_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS resort_audit (
    id VARCHAR(255) PRIMARY KEY,
    action VARCHAR(64) NOT NULL,
    detail VARCHAR(500) NULL,
    user_id VARCHAR(255) NULL,
    user_name VARCHAR(180) NULL,
    business_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX (business_id)
  )`);
}

async function settingsOf(shopId) {
  const rows = await query("SELECT settings_json FROM resort_settings WHERE business_id=?", [shopId]);
  return { ...R().DEFAULT_SETTINGS, ...parseJson(rows[0]?.settings_json, {}) };
}

async function saveSettings(shopId, patch) {
  const cur = await settingsOf(shopId);
  const next = {
    ...cur,
    property_name: clip(patch.property_name ?? cur.property_name, 180),
    address: clip(patch.address ?? cur.address, 255),
    phone: clip(patch.phone ?? cur.phone, 32),
    email: clip(patch.email ?? cur.email, 160),
    logo_url: clip(patch.logo_url ?? cur.logo_url, 2000),
    check_in_time: clip(patch.check_in_time ?? cur.check_in_time, 8) || "14:00",
    check_out_time: clip(patch.check_out_time ?? cur.check_out_time, 8) || "11:00",
    timezone: clip(patch.timezone ?? cur.timezone, 64) || "Asia/Kolkata",
    hold_minutes: num(patch.hold_minutes, cur.hold_minutes || 10),
    tax_rate: num(patch.tax_rate, cur.tax_rate),
    service_rate: num(patch.service_rate, cur.service_rate),
    extra_adult_rate: num(patch.extra_adult_rate, cur.extra_adult_rate),
    extra_child_rate: num(patch.extra_child_rate, cur.extra_child_rate),
    pay_on_arrival: flag(patch.pay_on_arrival ?? cur.pay_on_arrival),
    min_stay: num(patch.min_stay, cur.min_stay || 1),
    max_stay: num(patch.max_stay, cur.max_stay || 30),
    booking_policy: clip(patch.booking_policy ?? cur.booking_policy, 2000),
    late_checkout_fee: num(patch.late_checkout_fee, cur.late_checkout_fee),
  };
  await query(
    `INSERT INTO resort_settings (business_id, settings_json) VALUES (?,?)
     ON DUPLICATE KEY UPDATE settings_json=VALUES(settings_json)`,
    [shopId, JSON.stringify(next)],
  );
  return next;
}

function mapRoom(row) {
  return {
    ...row,
    photos: parseJson(row.photos_json, []),
    amenities: parseJson(row.amenities_json, []),
    date_rates: parseJson(row.rates_json, {}).date_rates || [],
    seasons: parseJson(row.rates_json, {}).seasons || [],
    active: Number(row.active),
  };
}

async function listRooms(shopId) {
  const rows = await query("SELECT * FROM resort_rooms WHERE business_id=? ORDER BY number", [shopId]);
  return rows.map(mapRoom);
}

async function listBookings(shopId) {
  const rows = await query("SELECT * FROM resort_bookings WHERE business_id=? ORDER BY created_at DESC LIMIT 800", [shopId]);
  return rows;
}

async function listBlocks(shopId) {
  const rows = await query("SELECT room_id, kind, start_date AS start, end_date AS end FROM resort_blocks WHERE business_id=?", [shopId]);
  return rows;
}

async function expireShopHolds(shopId) {
  await query(
    `UPDATE resort_bookings SET status='expired', payment_status=IF(payment_status='pending','failed',payment_status)
     WHERE business_id=? AND status='hold' AND expires_at IS NOT NULL AND expires_at < UTC_TIMESTAMP(3)`,
    [shopId],
  );
}

function availabilityContext(rooms, bookings, blocks, extra = {}) {
  return { rooms, bookings, blocks, now: extra.now || new Date(), today: extra.today || R().ymdInZone(new Date()), settings: extra.settings };
}

async function searchShop(shopId, queryIn) {
  await expireShopHolds(shopId);
  const [rooms, bookings, blocks, settings] = await Promise.all([
    listRooms(shopId),
    listBookings(shopId),
    listBlocks(shopId),
    settingsOf(shopId),
  ]);
  return R().searchAvailability({
    rooms,
    bookings,
    blocks,
    checkIn: queryIn.check_in || queryIn.checkIn,
    checkOut: queryIn.check_out || queryIn.checkOut,
    adults: queryIn.adults,
    children: queryIn.children,
    roomsNeeded: queryIn.rooms,
    settings,
    today: R().ymdInZone(new Date(), settings.timezone),
    now: new Date(),
  });
}

async function createHoldRow(shopId, body, source) {
  await expireShopHolds(shopId);
  const rooms = await listRooms(shopId);
  const room = rooms.find((r) => String(r.id) === String(body.room_id) || String(r.number) === String(body.room_id || body.room_no));
  if (!room) {
    const err = new Error("Room not found");
    err.status = 404;
    throw err;
  }
  const settings = await settingsOf(shopId);
  const stay = {
    checkIn: body.check_in || body.checkIn,
    checkOut: body.check_out || body.checkOut,
    adults: body.adults,
    children: body.children,
  };
  const avail = R().roomAvailableOnDates(room, stay, {
    bookings: await listBookings(shopId),
    blocks: await listBlocks(shopId),
    now: new Date(),
    today: R().ymdInZone(new Date(), settings.timezone),
    timezone: settings.timezone,
  });
  if (!avail.ok) {
    const err = new Error(avail.reason === "booked" ? "This room is not available for the selected dates" : `Room unavailable (${avail.reason})`);
    err.status = 409;
    throw err;
  }
  const nights = R().nightsBetween(stay.checkIn, stay.checkOut);
  if (!R().minStayOk(nights, settings)) {
    const err = new Error("Stay length is outside the property minimum or maximum");
    err.status = 400;
    throw err;
  }
  const hold = R().createHold({ room, stay, guest: body.guest || body, settings, now: new Date(), source: source || body.source || "website" });
  await query(
    `INSERT INTO resort_bookings (
       id, booking_no, property_id, room_id, category, status, payment_status, check_in, check_out, nights,
       adults, children, guest_name, guest_mobile, guest_email, source, expires_at, total, paid, due, price_json, business_id
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      hold.id,
      hold.booking_no,
      hold.property_id || null,
      hold.room_id,
      hold.category,
      "hold",
      "pending",
      hold.check_in,
      hold.check_out,
      hold.nights,
      hold.adults,
      hold.children,
      clip(hold.guest_name, 180),
      clip(hold.guest_mobile, 32),
      clip(hold.guest_email, 160),
      hold.source,
      hold.expires_at.slice(0, 19).replace("T", " "),
      hold.total,
      0,
      hold.total,
      JSON.stringify(hold.price),
      shopId,
    ],
  );
  return hold;
}

async function confirmHoldRow(shopId, holdId, payment, settingsOverride) {
  return withTransaction(async (conn) => {
    await conn.query(
      `UPDATE resort_bookings SET status='expired', payment_status=IF(payment_status='pending','failed',payment_status)
       WHERE business_id=? AND status='hold' AND expires_at IS NOT NULL AND expires_at < UTC_TIMESTAMP(3)`,
      [shopId],
    );
    const [holds] = await conn.query(
      `SELECT * FROM resort_bookings WHERE id=? AND business_id=? FOR UPDATE`,
      [holdId, shopId],
    );
    const hold = holds[0];
    if (!hold) {
      const err = new Error("Hold not found");
      err.status = 404;
      throw err;
    }
    const [roomRows] = await conn.query(`SELECT * FROM resort_rooms WHERE id=? AND business_id=? FOR UPDATE`, [hold.room_id, shopId]);
    const room = roomRows[0] ? mapRoom(roomRows[0]) : null;
    const [bookingRows] = await conn.query(`SELECT * FROM resort_bookings WHERE business_id=? AND room_id=? FOR UPDATE`, [shopId, hold.room_id]);
    const [blockRows] = await conn.query(`SELECT room_id, kind, start_date AS start, end_date AS end FROM resort_blocks WHERE business_id=? AND room_id=?`, [shopId, hold.room_id]);
    const settings = settingsOverride || (await settingsOf(shopId));
    const result = R().confirmHold(hold, {
      room,
      bookings: bookingRows,
      blocks: blockRows,
      payment,
      settings,
      now: new Date(),
      today: R().ymdInZone(new Date(), settings.timezone),
    });
    if (!result.ok) {
      const err = new Error(
        result.reason === "payment_failed"
          ? "Payment failed. The room was not booked."
          : result.reason === "expired"
            ? "The temporary hold expired. Please search again."
            : result.reason === "booked" || result.reason === "held"
              ? "This room was just reserved by someone else. Choose another room or dates."
              : `Cannot confirm (${result.reason})`,
      );
      err.status = result.reason === "payment_failed" ? 402 : 409;
      throw err;
    }
    const booking = result.booking;
    await conn.query(
      `UPDATE resort_bookings SET status='confirmed', payment_status=?, paid=?, due=?, expires_at=NULL WHERE id=? AND business_id=?`,
      [booking.payment_status, booking.paid, booking.due, hold.id, shopId],
    );
    await conn.query(`UPDATE resort_rooms SET physical_status='reserved' WHERE id=? AND business_id=? AND physical_status='available'`, [hold.room_id, shopId]);
    if (Number(booking.paid) > 0) {
      await conn.query(
        `INSERT INTO resort_payments (id, booking_id, method, status, amount, gateway_ref, business_id) VALUES (?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), hold.id, clip(payment?.method || "online", 32), clip(payment?.status || "paid", 32), booking.paid, clip(payment?.gateway_ref, 120), shopId],
      );
    }
    return booking;
  });
}

function decorateBooking(row, rooms) {
  const room = (rooms || []).find((r) => String(r.id) === String(row.room_id));
  return { ...row, room_no: room?.number || row.room_id, room_name: room?.name || "" };
}

async function board(shopId) {
  await expireShopHolds(shopId);
  const today = R().ymdInZone(new Date());
  const [rooms, bookings] = await Promise.all([listRooms(shopId), listBookings(shopId)]);
  const groups = R().classifyBookings(bookings, today);
  const occupied = rooms.filter((r) => r.physical_status === "occupied").length;
  const roomRev = bookings.filter((b) => ["confirmed", "checked_in", "checked_out"].includes(b.status)).reduce((s, b) => s + Number(b.paid || 0), 0);
  return {
    cards: [
      { id: "occ", label: "Occupied now", value: occupied },
      { id: "avail", label: "Available rooms", value: rooms.filter((r) => r.physical_status === "available").length },
      { id: "arrivals", label: "Arrivals today", value: groups.arrivals.length },
      { id: "departures", label: "Departures today", value: groups.departures.length },
      { id: "occ-pct", label: "Occupancy %", value: R().occupancyPct(occupied, rooms.length) },
      { id: "revpar", label: "RevPAR", value: R().revpar(roomRev, rooms.length), money: true },
    ],
    arrivals: groups.arrivals.map((b) => decorateBooking(b, rooms)),
    departures: groups.departures.map((b) => decorateBooking(b, rooms)),
    reports: R().REPORTS,
  };
}

export function registerResortPublic(app) {
  async function publicShop(req, res) {
    const biz = await loadBiz(req.params.shopId);
    if (!biz || !R().isResortShop(biz)) {
      res.status(404).json({ error: "Resort booking is not available for this shop" });
      return null;
    }
    return biz;
  }

  app.get("/api/resort/public/:shopId", async (req, res) => {
    try {
      const biz = await publicShop(req, res);
      if (!biz) return;
      const settings = await settingsOf(biz.id);
      res.json({
        business: { id: biz.id, name: biz.name },
        property: settings,
      });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.get("/api/resort/public/:shopId/search", async (req, res) => {
    try {
      const biz = await publicShop(req, res);
      if (!biz) return;
      res.json(await searchShop(biz.id, req.query));
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/resort/public/:shopId/hold", async (req, res) => {
    try {
      const biz = await publicShop(req, res);
      if (!biz) return;
      const booking = await createHoldRow(biz.id, req.body || {}, "website");
      res.json({ booking });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/resort/public/:shopId/confirm", async (req, res) => {
    try {
      const biz = await publicShop(req, res);
      if (!biz) return;
      const settings = await settingsOf(biz.id);
      const booking = await confirmHoldRow(biz.id, req.body?.hold_id, req.body?.payment, settings);
      await audit("booking.confirm", booking.booking_no, biz.id);
      res.json({ booking });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.get("/api/resort/public/:shopId/booking/:ref", async (req, res) => {
    try {
      const biz = await publicShop(req, res);
      if (!biz) return;
      const rows = await query(
        `SELECT id, booking_no, status, payment_status, check_in, check_out, nights, adults, children, total, paid, due, category
         FROM resort_bookings WHERE business_id=? AND (booking_no=? OR id=?) LIMIT 1`,
        [biz.id, req.params.ref, req.params.ref],
      );
      if (!rows[0]) return res.status(404).json({ error: "Booking not found" });
      res.json({ booking: rows[0] });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });
}

export function registerResortStaff(app) {
  async function gated(_req, res) {
    const biz = await loadBiz(bid());
    try {
      assertResort(biz);
    } catch (err) {
      res.status(err.status || 403).json({ error: err.message });
      return null;
    }
    return biz;
  }

  app.get("/api/resort/board", requirePerm("dashboard"), async (req, res) => {
    try {
      if (!(await gated(req, res))) return;
      res.json(await board(bid()));
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.get("/api/resort/settings", requirePerm("settings"), async (req, res) => {
    try {
      if (!(await gated(req, res))) return;
      res.json({ settings: await settingsOf(bid()) });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/resort/settings", requirePerm("settings"), async (req, res) => {
    try {
      if (!(await gated(req, res))) return;
      const settings = await saveSettings(bid(), req.body || {});
      await audit("settings", "Updated resort settings");
      res.json({ settings });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.get("/api/resort/rooms", requirePermAny("rooms", "dashboard"), async (req, res) => {
    try {
      if (!(await gated(req, res))) return;
      res.json({ rooms: await listRooms(bid()), categories: R().ROOM_CATEGORIES, statuses: R().PHYSICAL_STATUSES });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/resort/rooms", requirePermAny("rooms", "dashboard"), async (req, res) => {
    try {
      if (!(await gated(req, res))) return;
      const body = req.body || {};
      const id = clip(body.id, 255) || crypto.randomUUID();
      const existing = await query("SELECT id FROM resort_rooms WHERE id=? AND business_id=?", [id, bid()]);
      const payload = [
        clip(body.number, 32),
        clip(body.name, 180),
        clip(body.category, 64) || "standard",
        clip(body.description, 2000),
        JSON.stringify(body.photos || []),
        JSON.stringify(body.amenities || R().DEFAULT_AMENITIES),
        num(body.max_adults, 2),
        num(body.max_children, 1),
        clip(body.bed_type, 64),
        num(body.beds, 1),
        num(body.rate),
        num(body.weekday_rate, num(body.rate)),
        num(body.weekend_rate, num(body.rate)),
        num(body.extra_adult_rate),
        num(body.extra_child_rate),
        num(body.extra_bed_rate),
        num(body.tax_rate, 12),
        num(body.service_rate),
        clip(body.physical_status, 32) || "available",
        clip(body.hk_status, 32) || "ready",
        flag(body.active ?? 1),
        JSON.stringify({ date_rates: body.date_rates || [], seasons: body.seasons || [] }),
      ];
      if (existing[0]) {
        await query(
          `UPDATE resort_rooms SET number=?, name=?, category=?, description=?, photos_json=?, amenities_json=?, max_adults=?, max_children=?, bed_type=?, beds=?, rate=?, weekday_rate=?, weekend_rate=?, extra_adult_rate=?, extra_child_rate=?, extra_bed_rate=?, tax_rate=?, service_rate=?, physical_status=?, hk_status=?, active=?, rates_json=? WHERE id=? AND business_id=?`,
          [...payload, id, bid()],
        );
      } else {
        await query(
          `INSERT INTO resort_rooms (id, property_id, number, name, category, description, photos_json, amenities_json, max_adults, max_children, bed_type, beds, rate, weekday_rate, weekend_rate, extra_adult_rate, extra_child_rate, extra_bed_rate, tax_rate, service_rate, physical_status, hk_status, active, rates_json, business_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, body.property_id || null, ...payload, bid()],
        );
      }
      if (["blocked", "maintenance"].includes(String(body.physical_status || "")) && body.block_start && body.block_end) {
        await query(
          `INSERT INTO resort_blocks (id, room_id, kind, start_date, end_date, note, business_id) VALUES (?,?,?,?,?,?,?)`,
          [crypto.randomUUID(), id, body.physical_status, body.block_start, body.block_end, clip(body.block_note, 255), bid()],
        );
        await audit("block_room", `${body.number} ${body.block_start} ${body.block_end}`);
      }
      res.json({ ok: true, id });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.get("/api/resort/bookings", requirePermAny("rooms", "dashboard"), async (req, res) => {
    try {
      if (!(await gated(req, res))) return;
      await expireShopHolds(bid());
      const rooms = await listRooms(bid());
      const bookings = (await listBookings(bid())).map((b) => decorateBooking(b, rooms));
      const today = R().ymdInZone(new Date());
      const groups = R().classifyBookings(bookings, today);
      const filter = String(req.query.filter || "all");
      const role = authUser()?.role;
      const rows = (filter === "desk" ? bookings : groups[filter] || groups.all).map((b) => R().redactGuest(b, role));
      res.json({ bookings: rows, arrivals: groups.arrivals, departures: groups.departures, in_house: groups.in_house, filter });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/resort/bookings", requirePermAny("rooms", "dashboard"), async (req, res) => {
    try {
      if (!(await gated(req, res))) return;
      const body = req.body || {};
      const hold = await createHoldRow(bid(), body, body.source || "walk_in");
      const settings = await settingsOf(bid());
      const payment = body.payment || { status: settings.pay_on_arrival ? "pending" : "paid", method: "cash", amount: body.advance || hold.total };
      const confirmed = await confirmHoldRow(bid(), hold.id, payment, settings);
      await audit("booking.create", confirmed.booking_no);
      res.json({ booking: confirmed });
    } catch (err) {
      res.status(err.status || 500).json({ error: String(err.message) });
    }
  });

  app.post("/api/resort/bookings/:id/cancel", requirePermAny("rooms", "dashboard"), async (req, res) => {
    try {
      if (!(await gated(req, res))) return;
      const rows = await query("SELECT * FROM resort_bookings WHERE id=? AND business_id=?", [req.params.id, bid()]);
      const result = R().cancelBooking(rows[0], { now: new Date(), reason: req.body?.reason });
      if (!result.ok) return res.status(400).json({ error: result.reason });
      await query(`UPDATE resort_bookings SET status='cancelled', cancelled_at=UTC_TIMESTAMP(3), cancel_reason=? WHERE id=? AND business_id=?`, [
        clip(req.body?.reason, 255),
        req.params.id,
        bid(),
      ]);
      await audit("booking.cancel", rows[0]?.booking_no);
      res.json({ booking: result.booking });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/resort/bookings/:id/checkin", requirePermAny("rooms", "dashboard"), async (req, res) => {
    try {
      if (!(await gated(req, res))) return;
      const [booking] = await query("SELECT * FROM resort_bookings WHERE id=? AND business_id=?", [req.params.id, bid()]);
      const [room] = await query("SELECT * FROM resort_rooms WHERE id=? AND business_id=?", [booking?.room_id, bid()]);
      const result = R().applyCheckIn(booking, room ? mapRoom(room) : null, new Date());
      if (!result.ok) return res.status(400).json({ error: result.reason });
      await query(`UPDATE resort_bookings SET status='checked_in', checked_in_at=UTC_TIMESTAMP(3) WHERE id=? AND business_id=?`, [req.params.id, bid()]);
      await query(`UPDATE resort_rooms SET physical_status='occupied' WHERE id=? AND business_id=?`, [booking.room_id, bid()]);
      await audit("booking.checkin", booking.booking_no);
      res.json({ booking: result.booking });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/resort/bookings/:id/checkout", requirePermAny("rooms", "dashboard"), async (req, res) => {
    try {
      if (!(await gated(req, res))) return;
      const [booking] = await query("SELECT * FROM resort_bookings WHERE id=? AND business_id=?", [req.params.id, bid()]);
      const [room] = await query("SELECT * FROM resort_rooms WHERE id=? AND business_id=?", [booking?.room_id, bid()]);
      const charges = await query("SELECT * FROM resort_folio WHERE booking_id=? AND business_id=?", [req.params.id, bid()]);
      const restaurant = charges.filter((c) => c.kind === "restaurant").reduce((s, c) => s + Number(c.amount), 0);
      const extras = charges.filter((c) => c.kind !== "restaurant").reduce((s, c) => s + Number(c.amount), 0);
      const invoice = R().folioTotals({
        roomCharges: Number(booking?.total) - extras - restaurant || Number(booking?.total),
        extras,
        restaurant,
        taxes: 0,
        service: 0,
        discount: 0,
        payments: Number(booking?.paid),
        lateFee: num(req.body?.late_fee),
      });
      const result = R().applyCheckOut(booking, room ? mapRoom(room) : null, invoice, new Date());
      if (!result.ok) return res.status(400).json({ error: result.reason });
      await query(`UPDATE resort_bookings SET status='checked_out', checked_out_at=UTC_TIMESTAMP(3), due=? WHERE id=? AND business_id=?`, [
        invoice.due,
        req.params.id,
        bid(),
      ]);
      await query(`UPDATE resort_rooms SET physical_status='cleaning', hk_status='dirty' WHERE id=? AND business_id=?`, [booking.room_id, bid()]);
      await audit("booking.checkout", booking.booking_no);
      res.json({ booking: result.booking, invoice });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/resort/folio", requirePerm("counter"), async (req, res) => {
    try {
      if (!(await gated(req, res))) return;
      const [booking] = await query("SELECT * FROM resort_bookings WHERE id=? AND business_id=?", [req.body?.booking_id, bid()]);
      const linked = R().linkRestaurantCharge(req.body || {}, booking);
      if (!linked.ok) return res.status(403).json({ error: "Cannot post to this guest folio" });
      await query(
        `INSERT INTO resort_folio (id, booking_id, room_id, kind, amount, note, ref_id, user_id, business_id) VALUES (?,?,?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), booking.id, booking.room_id, linked.charge.kind, linked.charge.amount, clip(linked.charge.note, 255), clip(req.body?.ref_id, 255), authUser()?.id || null, bid()],
      );
      await query(`UPDATE resort_bookings SET due=due+? WHERE id=? AND business_id=?`, [linked.charge.amount, booking.id, bid()]);
      res.json({ charge: linked.charge });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.get("/api/resort/housekeeping", requirePermAny("rooms", "dashboard"), async (req, res) => {
    try {
      if (!(await gated(req, res))) return;
      res.json({ rooms: await listRooms(bid()) });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.post("/api/resort/housekeeping", requirePermAny("rooms", "dashboard"), async (req, res) => {
    try {
      if (!(await gated(req, res))) return;
      await query(`UPDATE resort_rooms SET hk_status=?, physical_status=? WHERE id=? AND business_id=?`, [
        clip(req.body?.hk_status, 32) || "ready",
        clip(req.body?.physical_status, 32) || "available",
        req.body?.room_id,
        bid(),
      ]);
      await audit("housekeeping", `${req.body?.room_id} ${req.body?.hk_status}`);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  app.get("/api/resort/reports/:id", requirePerm("reports"), async (req, res) => {
    try {
      if (!(await gated(req, res))) return;
      const role = authUser()?.role;
      if (["resort-revenue", "resort-adr", "resort-payments"].includes(req.params.id) && !R().canAccess(role, "reports.financial") && !["business_admin", "resort_owner", "property_manager", "accountant"].includes(role)) {
        return res.status(403).json({ error: "Financial reports are restricted" });
      }
      const rooms = await listRooms(bid());
      const bookings = await listBookings(bid());
      const rows = bookings.map((b) => decorateBooking(b, rooms)).map((b) => ({
        booking: b.booking_no,
        room: b.room_no,
        status: b.status,
        source: b.source,
        total: b.total,
        paid: b.paid,
        due: b.due,
        check_in: b.check_in,
        check_out: b.check_out,
      }));
      res.json({ rows, adr: R().adr(bookings.reduce((s, b) => s + Number(b.paid), 0), bookings.filter((b) => b.status !== "cancelled").length), revpar: R().revpar(bookings.reduce((s, b) => s + Number(b.paid), 0), rooms.length) });
    } catch (err) {
      res.status(500).json({ error: String(err.message) });
    }
  });
}
