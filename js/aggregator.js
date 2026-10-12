(function (root) {
  const SOURCES = ["zomato", "swiggy"];
  const STATUSES = ["pending", "accepted", "rejected", "preparing", "ready", "dispatched", "delivered", "cancelled"];
  const OPEN = ["pending", "accepted", "preparing", "ready", "dispatched"];

  function clip(raw, n = 180) {
    return String(raw ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, n);
  }

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function normalizeSource(raw) {
    const s = String(raw || "").toLowerCase();
    if (s.includes("zomato") || s === "zmt") return "zomato";
    if (s.includes("swiggy") || s === "swg") return "swiggy";
    return "";
  }

  function normalizeStatus(raw) {
    const s = String(raw || "").toLowerCase().replace(/[\s-]+/g, "_");
    if (["placed", "placed_order", "new", "relay", "created"].includes(s)) return "pending";
    if (["confirm", "confirmed", "acknowledged", "accepted", "accept"].includes(s)) return "accepted";
    if (["reject", "rejected", "declined"].includes(s)) return "rejected";
    if (["preparing", "food_preparation", "kot_sent"].includes(s)) return "preparing";
    if (["ready", "food_ready", "prepared", "picked"].includes(s)) return "ready";
    if (["dispatched", "picked_up", "out_for_delivery", "ofd", "rider_assigned"].includes(s)) return "dispatched";
    if (["delivered", "completed", "complete"].includes(s)) return "delivered";
    if (["cancel", "cancelled", "canceled", "timeout"].includes(s)) return "cancelled";
    return STATUSES.includes(s) ? s : "";
  }

  function sourceLabel(source) {
    return normalizeSource(source) === "swiggy" ? "Swiggy" : "Zomato";
  }

  function statusLabel(status) {
    const s = normalizeStatus(status) || String(status || "pending");
    if (s === "pending") return "New";
    if (s === "accepted") return "Accepted";
    if (s === "rejected") return "Rejected";
    if (s === "preparing") return "Preparing";
    if (s === "ready") return "Ready";
    if (s === "dispatched") return "Out for delivery";
    if (s === "delivered") return "Delivered";
    if (s === "cancelled") return "Cancelled";
    return s;
  }

  function nextActions(status) {
    const s = normalizeStatus(status) || "pending";
    if (s === "pending") return ["accepted", "rejected"];
    if (s === "accepted") return ["preparing", "ready", "cancelled"];
    if (s === "preparing") return ["ready", "cancelled"];
    if (s === "ready") return ["dispatched", "cancelled"];
    if (s === "dispatched") return ["delivered"];
    return [];
  }

  function actionLabel(status) {
    const s = normalizeStatus(status);
    if (s === "accepted") return "Accept order";
    if (s === "rejected") return "Reject order";
    if (s === "preparing") return "Start kitchen";
    if (s === "ready") return "Mark food ready";
    if (s === "dispatched") return "Hand to rider";
    if (s === "delivered") return "Mark delivered";
    if (s === "cancelled") return "Cancel order";
    return statusLabel(s);
  }

  function fulfillmentOf(raw) {
    const s = String(raw || "").toLowerCase();
    if (/(pickup|takeaway|take.?away|self)/.test(s)) return "pickup";
    return "delivery";
  }

  function num(raw) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function pick(obj, keys) {
    for (const key of keys) {
      const cur = key.split(".").reduce((acc, part) => (acc == null ? acc : acc[part]), obj);
      if (cur != null && cur !== "") return cur;
    }
    return "";
  }

  function lineFrom(raw) {
    const qty = num(raw.quantity ?? raw.qty ?? raw.qtyGm ?? raw.quantity_gm ?? raw.count) || 1;
    const rate = num(raw.unit_cost ?? raw.unit_price ?? raw.rate ?? raw.price ?? raw.final_price);
    const amount = num(raw.total_cost ?? raw.total ?? raw.amount) || round2(qty * rate);
    const extras = Array.isArray(raw.addons || raw.customizations || raw.options)
      ? (raw.addons || raw.customizations || raw.options).map((row) => clip(row.name || row.title || row, 80)).filter(Boolean)
      : [];
    return {
      external_item_id: clip(raw.id ?? raw.item_id ?? raw.dish_id ?? raw.sku, 80),
      name: clip(raw.name ?? raw.item_name ?? raw.title ?? raw.dish_name ?? "Item", 160) || "Item",
      qty: qty,
      rate: rate,
      amount: amount,
      notes: clip(raw.instructions ?? raw.notes ?? raw.special_instructions ?? extras.join(", "), 240),
    };
  }

  function collectLines(raw) {
    const list = raw.items || raw.dishes || raw.item_list || raw.order_items || raw.cart || [];
    return (Array.isArray(list) ? list : []).map(lineFrom).filter((line) => line.qty > 0);
  }

  function totalsFrom(raw, lines) {
    const lineSum = round2(lines.reduce((sum, line) => sum + num(line.amount), 0));
    const subtotal = round2(num(raw.subtotal ?? raw.item_total ?? raw.order_subtotal ?? raw.net_amount) || lineSum);
    const tax = round2(num(raw.tax ?? raw.gst ?? raw.taxes ?? raw.tax_amount ?? (Array.isArray(raw.tax_breakup) ? raw.tax_breakup.reduce((s, t) => s + num(t.amount), 0) : 0)));
    const discount = round2(num(raw.discount ?? raw.discount_total ?? raw.offer_amount ?? raw.promo_discount));
    const packing = round2(num(raw.packing ?? raw.packing_charges ?? raw.container_charge));
    const deliveryFee = round2(num(raw.delivery_fee ?? raw.delivery_charge ?? raw.delivery_charges));
    const total = round2(
      num(raw.total ?? raw.net_total ?? raw.order_total ?? raw.grand_total ?? raw.amount) ||
        Math.max(0, subtotal + tax + packing + deliveryFee - discount),
    );
    return { subtotal, tax, discount, packing, delivery_fee: deliveryFee, total };
  }

  function customerFrom(raw) {
    const cust = raw.customer || raw.user || raw.buyer || {};
    return {
      customer_name: clip(cust.name ?? cust.customer_name ?? raw.customer_name ?? raw.user_name ?? "Guest", 160) || "Guest",
      mobile: clip(cust.phone ?? cust.mobile ?? cust.phone_number ?? raw.mobile ?? raw.phone, 32),
      address: clip(
        pick(cust, ["address", "delivery_address", "full_address"]) ||
          pick(raw, ["delivery_address.address", "delivery_address.full_address", "address", "drop_address"]) ||
          (typeof raw.delivery_address === "string" ? raw.delivery_address : ""),
        400,
      ),
    };
  }

  function unwrap(body) {
    if (!body || typeof body !== "object") return {};
    if (body.order && typeof body.order === "object") return { ...body, ...body.order, nested: body.order };
    if (body.data && typeof body.data === "object") return { ...body, ...body.data };
    if (body.payload && typeof body.payload === "object") return { ...body, ...body.payload };
    return body;
  }

  function detectSource(body, hint) {
    const forced = normalizeSource(hint || body.source || body.platform || body.channel || body.aggregator);
    if (forced) return forced;
    const blob = JSON.stringify(body || {}).toLowerCase();
    if (blob.includes("swiggy") || blob.includes("swg-")) return "swiggy";
    if (blob.includes("zomato") || blob.includes("zmt")) return "zomato";
    return hint === "swiggy" ? "swiggy" : "zomato";
  }

  function parseInbound(body, hint) {
    const raw = unwrap(body || {});
    const source = detectSource({ ...body, ...raw }, hint);
    const statusHint = normalizeStatus(raw.status || raw.order_status || raw.state || body?.event || body?.type);
    const externalId = clip(
      raw.order_id ??
        raw.orderId ??
        raw.id ??
        raw.external_order_id ??
        raw.details?.id ??
        raw.details?.ext_platforms?.[0]?.id ??
        raw.ext_platform?.id,
      80,
    );
    if (!externalId) return { ok: false, error: "Order id missing" };
    if (statusHint && !raw.items && !raw.dishes && !raw.item_list && ["rejected", "cancelled", "delivered", "dispatched"].includes(statusHint)) {
      return { ok: true, kind: "status", source, external_id: externalId, status: statusHint, restaurant_id: clip(raw.restaurant_id ?? raw.outlet_id ?? raw.res_id, 80) };
    }
    const lines = collectLines(raw.nested && (raw.nested.items || raw.nested.dishes) ? raw.nested : raw);
    if (!lines.length && statusHint) {
      return { ok: true, kind: "status", source, external_id: externalId, status: statusHint, restaurant_id: clip(raw.restaurant_id ?? raw.outlet_id, 80) };
    }
    if (!lines.length) return { ok: false, error: "No order items" };
    const money = totalsFrom(raw, lines);
    const who = customerFrom(raw);
    const fulfillment = fulfillmentOf(raw.order_type || raw.fulfillment || raw.delivery_mode || raw.details?.fulfillment || raw.service_type);
    return {
      ok: true,
      kind: "order",
      source,
      external_id: externalId,
      restaurant_id: clip(raw.restaurant_id ?? raw.outlet_id ?? raw.res_id ?? raw.store_id, 80),
      status: statusHint && statusHint !== "pending" ? statusHint : "pending",
      fulfillment,
      ...who,
      notes: clip(raw.instructions ?? raw.notes ?? raw.special_instructions ?? raw.comment, 250),
      ...money,
      prep_minutes: Math.max(0, Math.min(180, Math.round(num(raw.prep_time ?? raw.preparation_time ?? raw.prep_minutes)) || 0)) || null,
      payment_status: clip(raw.payment_status ?? raw.payment?.status ?? (raw.paid ? "paid" : "paid"), 24) || "paid",
      lines,
    };
  }

  function orderNumber(source, externalId) {
    const prefix = source === "swiggy" ? "SWG" : "ZMT";
    const tail = clip(externalId, 18).replace(/[^a-zA-Z0-9]/g, "").slice(-10) || String(Date.now()).slice(-6);
    return `${prefix}-${tail}`;
  }

  function kotTable(source, fulfillment) {
    if (fulfillment === "pickup") return "Parcel";
    return sourceLabel(source);
  }

  function isOpen(status) {
    return OPEN.includes(normalizeStatus(status) || "pending");
  }

  function laneCounts(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const n = (status) => list.filter((row) => (Array.isArray(status) ? status.includes(row.status) : row.status === status)).length;
    return {
      pending: n("pending"),
      kitchen: n(["accepted", "preparing"]),
      ready: n("ready"),
      out: n("dispatched"),
      open: list.filter((row) => isOpen(row.status)).length,
    };
  }

  function zomatoConfirmUrl(base) {
    return `${String(base || "https://api.zomato.com").replace(/\/$/, "")}/online-ordering/v1/order/confirm`;
  }

  function zomatoRejectUrl(base) {
    return `${String(base || "https://api.zomato.com").replace(/\/$/, "")}/online-ordering/v1/order/reject`;
  }

  function zomatoReadyUrl(base) {
    return `${String(base || "https://api.zomato.com").replace(/\/$/, "")}/online-ordering/v1/order/food-ready`;
  }

  function zomatoPickedUrl(base) {
    return `${String(base || "https://api.zomato.com").replace(/\/$/, "")}/online-ordering/v1/order/picked-up`;
  }

  function swiggyStatusUrl(base, orderId, action) {
    const root = String(base || "https://partner.swiggy.com").replace(/\/$/, "");
    return `${root}/pos/v1/orders/${encodeURIComponent(orderId)}/${action}`;
  }

  function outboundFor(source, status, cfg = {}, order = {}) {
    const id = order.external_id || order.order_id;
    const restaurantId = order.restaurant_id || cfg.restaurant_id || cfg.outlet_id;
    if (source === "zomato") {
      if (status === "accepted") return { url: zomatoConfirmUrl(cfg.api_base), method: "POST", body: { order_id: id, restaurant_id: restaurantId } };
      if (status === "rejected") return { url: zomatoRejectUrl(cfg.api_base), method: "POST", body: { order_id: id, restaurant_id: restaurantId, reason: order.reason || "Out of stock" } };
      if (status === "ready") return { url: zomatoReadyUrl(cfg.api_base), method: "POST", body: { order_id: id, restaurant_id: restaurantId } };
      if (status === "dispatched") return { url: zomatoPickedUrl(cfg.api_base), method: "POST", body: { order_id: id, restaurant_id: restaurantId } };
    }
    if (source === "swiggy") {
      const action = status === "accepted" ? "accept" : status === "rejected" ? "reject" : status === "ready" ? "ready" : status === "dispatched" ? "dispatched" : "";
      if (action) return { url: swiggyStatusUrl(cfg.api_base, id, action), method: "POST", body: { order_id: id, outlet_id: restaurantId, status: action, reason: order.reason || "" } };
    }
    return null;
  }

  function webhookPath(source, shopId) {
    const src = normalizeSource(source) || "zomato";
    return `/api/webhooks/${src}?shop=${encodeURIComponent(shopId || "")}`;
  }

  function maskSecret(raw) {
    const v = String(raw || "");
    if (!v) return "";
    if (v.length <= 4) return "••••";
    return `${v.slice(0, 2)}••••${v.slice(-2)}`;
  }

  function isMasked(raw) {
    return /•/.test(String(raw || ""));
  }

  function flagOn(raw) {
    return raw === true || raw === 1 || raw === "1";
  }

  function isAuthorized(source, settings = {}) {
    const src = normalizeSource(source);
    if (src === "swiggy") return flagOn(settings.swiggy_allowed);
    if (src === "zomato") return flagOn(settings.zomato_allowed);
    return false;
  }

  function hasCredentials(source, settings = {}) {
    const src = normalizeSource(source);
    if (src === "swiggy") return Boolean(clip(settings.swiggy_outlet_id, 80) && clip(settings.swiggy_api_key, 180) && !isMasked(settings.swiggy_api_key));
    if (src === "zomato") return Boolean(clip(settings.zomato_restaurant_id, 80) && clip(settings.zomato_api_key, 180) && !isMasked(settings.zomato_api_key));
    return false;
  }

  function isLive(source, settings = {}) {
    const src = normalizeSource(source);
    if (!isAuthorized(src, settings)) return false;
    if (src === "swiggy") return flagOn(settings.swiggy_enabled);
    if (src === "zomato") return flagOn(settings.zomato_enabled);
    return false;
  }

  function activationBlock(source, settings = {}, { wantEnable = false, storedKey = "" } = {}) {
    const src = normalizeSource(source) || "zomato";
    const label = sourceLabel(src);
    if (!isAuthorized(src, settings)) {
      return `${label} is not authorized for this shop. Ask Master Admin to allow it first.`;
    }
    if (wantEnable) {
      const idOk = src === "swiggy" ? clip(settings.swiggy_outlet_id, 80) : clip(settings.zomato_restaurant_id, 80);
      const keyRaw = src === "swiggy" ? settings.swiggy_api_key : settings.zomato_api_key;
      const keyOk = (clip(keyRaw, 180) && !isMasked(keyRaw)) || clip(storedKey, 180);
      if (!idOk) return `Save the ${label} ${src === "swiggy" ? "outlet ID" : "restaurant ID"} before activating.`;
      if (!keyOk) return `Save the ${label} API key before activating.`;
    }
    if (!isLive(src, settings)) return `${label} is disabled. A Business Admin must turn it on in Settings.`;
    return "";
  }

  root.POSAggregator = {
    SOURCES,
    STATUSES,
    clip,
    round2,
    normalizeSource,
    normalizeStatus,
    sourceLabel,
    statusLabel,
    nextActions,
    actionLabel,
    fulfillmentOf,
    parseInbound,
    orderNumber,
    kotTable,
    isOpen,
    laneCounts,
    outboundFor,
    webhookPath,
    maskSecret,
    isMasked,
    flagOn,
    isAuthorized,
    hasCredentials,
    isLive,
    activationBlock,
  };
})(typeof window !== "undefined" ? window : globalThis);
