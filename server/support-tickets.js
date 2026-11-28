import crypto from "node:crypto";
import { query } from "./db.js";
import { bid, authUser } from "./context.js";
import { requireStaff, requireMaster } from "./auth.js";
import "../js/support.js";

const Support = globalThis.SupportPage;

let ready = null;

function personName(user, fallback) {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
  return String(name || user?.name || user?.email || fallback || "Shop").slice(0, 120);
}

function fail(res, status, error) {
  res.status(status).json({ error });
}

const TICKET_TABLES = ["support_tickets", "support_ticket_replies", "support_chat_messages"];

async function alignTicketCollation(table) {
  if (!TICKET_TABLES.includes(table)) return;
  const [row] = await query(`SHOW TABLE STATUS LIKE '${table}'`);
  const collation = String(row?.Collation || row?.collation || "");
  if (collation && collation !== "utf8mb4_unicode_ci") {
    await query(`ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  }
}

export async function ensureSupportTicketSchema() {
  if (!ready) {
    ready = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS support_tickets (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        subject VARCHAR(180) NOT NULL,
        category VARCHAR(24) NOT NULL DEFAULT 'other',
        priority VARCHAR(16) NOT NULL DEFAULT 'normal',
        status VARCHAR(16) NOT NULL DEFAULT 'open',
        created_by VARCHAR(36) NOT NULL DEFAULT '',
        created_by_name VARCHAR(120) NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_support_tickets_shop (business_id, updated_at),
        INDEX idx_support_tickets_status (status, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      await query(`CREATE TABLE IF NOT EXISTS support_ticket_replies (
        id VARCHAR(36) PRIMARY KEY,
        ticket_id VARCHAR(36) NOT NULL,
        business_id VARCHAR(36) NOT NULL,
        author_role VARCHAR(16) NOT NULL,
        author_name VARCHAR(120) NOT NULL DEFAULT '',
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_support_replies_ticket (ticket_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      await query(`CREATE TABLE IF NOT EXISTS support_chat_messages (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        author_role VARCHAR(16) NOT NULL,
        author_name VARCHAR(120) NOT NULL DEFAULT '',
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_support_chat_shop (business_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      for (const table of TICKET_TABLES) await alignTicketCollation(table);
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

const TICKET_EQ = "COLLATE utf8mb4_unicode_ci";
const TICKET_COLUMNS = `t.id, t.business_id, t.subject, t.category, t.priority, t.status,
  t.created_by_name, t.created_at, t.updated_at, b.name AS shop_name,
  (SELECT COUNT(*) FROM support_ticket_replies r WHERE r.ticket_id ${TICKET_EQ} = t.id ${TICKET_EQ}) AS reply_count`;

async function loadTicket(id, businessId) {
  const params = [id];
  let where = "t.id = ?";
  if (businessId) {
    where += " AND t.business_id = ?";
    params.push(businessId);
  }
  const [ticket] = await query(
    `SELECT ${TICKET_COLUMNS}
     FROM support_tickets t
     LEFT JOIN businesses b ON b.id COLLATE utf8mb4_unicode_ci = t.business_id COLLATE utf8mb4_unicode_ci
     WHERE ${where}
     LIMIT 1`,
    params,
  );
  if (!ticket) return null;
  const replies = await query(
    `SELECT id, author_role, author_name, body, created_at
     FROM support_ticket_replies
     WHERE ticket_id = ?
     ORDER BY created_at ASC, id ASC`,
    [id],
  );
  return { ticket, replies };
}

async function addReply(ticket, role, name, body) {
  await query(
    `INSERT INTO support_ticket_replies (id, ticket_id, business_id, author_role, author_name, body)
     VALUES (?,?,?,?,?,?)`,
    [crypto.randomUUID(), ticket.id, ticket.business_id, role, name, body],
  );
}

async function loadChat(businessId) {
  const messages = await query(
    `SELECT id, business_id, author_role, author_name, body, created_at
     FROM support_chat_messages
     WHERE business_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 80`,
    [businessId],
  );
  messages.reverse();
  return messages;
}

async function addChat(businessId, role, name, body) {
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO support_chat_messages (id, business_id, author_role, author_name, body)
     VALUES (?,?,?,?,?)`,
    [id, businessId, role, name, body],
  );
  return loadChat(businessId);
}

export function registerSupportTickets(app) {
  app.get("/api/support/tickets", requireStaff, async (req, res) => {
    try {
      await ensureSupportTicketSchema();
      const tickets = await query(
        `SELECT ${TICKET_COLUMNS}
         FROM support_tickets t
         LEFT JOIN businesses b ON b.id COLLATE utf8mb4_unicode_ci = t.business_id COLLATE utf8mb4_unicode_ci
         WHERE t.business_id = ?
         ORDER BY t.updated_at DESC
         LIMIT 100`,
        [bid()],
      );
      res.json({ tickets });
    } catch (err) {
      fail(res, 500, err.message || "Could not load tickets");
    }
  });

  app.post("/api/support/tickets", requireStaff, async (req, res) => {
    try {
      await ensureSupportTicketSchema();
      const subject = Support.ticketSubject(req.body?.subject);
      const message = Support.ticketBody(req.body?.body);
      if (subject.length < 3) return fail(res, 400, "Subject needs at least 3 characters");
      if (!message) return fail(res, 400, "Write a message");
      const user = authUser() || {};
      const name = personName(user, "Shop");
      const id = crypto.randomUUID();
      const businessId = bid();
      await query(
        `INSERT INTO support_tickets
          (id, business_id, subject, category, priority, status, created_by, created_by_name)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          id,
          businessId,
          subject,
          Support.ticketCategory(req.body?.category),
          Support.ticketPriority(req.body?.priority),
          "open",
          user.id || "",
          name,
        ],
      );
      await addReply({ id, business_id: businessId }, "shop", name, message);
      res.json(await loadTicket(id, businessId));
    } catch (err) {
      fail(res, 500, err.message || "Could not send the ticket");
    }
  });

  app.get("/api/support/tickets/:id", requireStaff, async (req, res) => {
    try {
      await ensureSupportTicketSchema();
      const found = await loadTicket(req.params.id, bid());
      if (!found) return fail(res, 404, "Ticket not found");
      res.json(found);
    } catch (err) {
      fail(res, 500, err.message || "Could not load the ticket");
    }
  });

  app.post("/api/support/tickets/:id/reply", requireStaff, async (req, res) => {
    try {
      await ensureSupportTicketSchema();
      const message = Support.ticketBody(req.body?.body);
      if (!message) return fail(res, 400, "Write a message");
      const found = await loadTicket(req.params.id, bid());
      if (!found) return fail(res, 404, "Ticket not found");
      const name = personName(authUser(), "Shop");
      await addReply(found.ticket, "shop", name, message);
      await query(`UPDATE support_tickets SET status = 'open' WHERE id = ? AND business_id = ?`, [
        found.ticket.id,
        found.ticket.business_id,
      ]);
      res.json(await loadTicket(found.ticket.id, found.ticket.business_id));
    } catch (err) {
      fail(res, 500, err.message || "Could not send the reply");
    }
  });

  app.get("/api/support/chat", requireStaff, async (req, res) => {
    try {
      await ensureSupportTicketSchema();
      res.json({ messages: await loadChat(bid()) });
    } catch (err) {
      fail(res, 500, err.message || "Could not load the chat");
    }
  });

  app.post("/api/support/chat", requireStaff, async (req, res) => {
    try {
      await ensureSupportTicketSchema();
      const message = Support.ticketBody(req.body?.body);
      if (!message) return fail(res, 400, "Write a message");
      const messages = await addChat(bid(), "shop", personName(authUser(), "Shop"), message);
      res.json({ messages });
    } catch (err) {
      fail(res, 500, err.message || "Could not send the message");
    }
  });

  app.get("/api/master/support-chat", requireMaster, async (req, res) => {
    try {
      await ensureSupportTicketSchema();
      const chats = await query(
        `SELECT c.business_id, b.name AS shop_name, c.body, c.author_role, c.author_name, c.created_at
         FROM support_chat_messages c
         JOIN (
           SELECT business_id, MAX(created_at) AS created_at
           FROM support_chat_messages
           GROUP BY business_id
         ) latest ON latest.business_id COLLATE utf8mb4_unicode_ci = c.business_id COLLATE utf8mb4_unicode_ci
           AND latest.created_at = c.created_at
         LEFT JOIN businesses b ON b.id COLLATE utf8mb4_unicode_ci = c.business_id COLLATE utf8mb4_unicode_ci
         ORDER BY c.created_at DESC
         LIMIT 100`,
      );
      res.json({ chats });
    } catch (err) {
      fail(res, 500, err.message || "Could not load live chats");
    }
  });

  app.get("/api/master/support-chat/:businessId", requireMaster, async (req, res) => {
    try {
      await ensureSupportTicketSchema();
      const businessId = String(req.params.businessId || "");
      const [shop] = await query("SELECT id, name FROM businesses WHERE id = ? LIMIT 1", [businessId]);
      if (!shop) return fail(res, 404, "Shop not found");
      res.json({ shop, messages: await loadChat(businessId) });
    } catch (err) {
      fail(res, 500, err.message || "Could not load the chat");
    }
  });

  app.post("/api/master/support-chat/:businessId", requireMaster, async (req, res) => {
    try {
      await ensureSupportTicketSchema();
      const message = Support.ticketBody(req.body?.body);
      if (!message) return fail(res, 400, "Write a message");
      const businessId = String(req.params.businessId || "");
      const [shop] = await query("SELECT id, name FROM businesses WHERE id = ? LIMIT 1", [businessId]);
      if (!shop) return fail(res, 404, "Shop not found");
      const messages = await addChat(businessId, "master", personName(req.auth?.admin, "Support"), message);
      res.json({ shop, messages });
    } catch (err) {
      fail(res, 500, err.message || "Could not send the message");
    }
  });

  app.get("/api/master/support-tickets", requireMaster, async (req, res) => {
    try {
      await ensureSupportTicketSchema();
      const status = Support.ticketStatus(req.query.status);
      const params = [];
      let where = "";
      if (status) {
        where = "WHERE t.status = ?";
        params.push(status);
      }
      const tickets = await query(
        `SELECT ${TICKET_COLUMNS}
         FROM support_tickets t
         LEFT JOIN businesses b ON b.id COLLATE utf8mb4_unicode_ci = t.business_id COLLATE utf8mb4_unicode_ci
         ${where}
         ORDER BY t.updated_at DESC
         LIMIT 200`,
        params,
      );
      res.json({ tickets });
    } catch (err) {
      fail(res, 500, err.message || "Could not load tickets");
    }
  });

  app.get("/api/master/support-tickets/:id", requireMaster, async (req, res) => {
    try {
      await ensureSupportTicketSchema();
      const found = await loadTicket(req.params.id, "");
      if (!found) return fail(res, 404, "Ticket not found");
      res.json(found);
    } catch (err) {
      fail(res, 500, err.message || "Could not load the ticket");
    }
  });

  app.post("/api/master/support-tickets/:id/reply", requireMaster, async (req, res) => {
    try {
      await ensureSupportTicketSchema();
      const message = Support.ticketBody(req.body?.body);
      if (!message) return fail(res, 400, "Write a message");
      const found = await loadTicket(req.params.id, "");
      if (!found) return fail(res, 404, "Ticket not found");
      const status = Support.ticketStatus(req.body?.status) || "pending";
      const name = personName(req.auth?.admin, "Support");
      await addReply(found.ticket, "master", name, message);
      await query(`UPDATE support_tickets SET status = ? WHERE id = ?`, [status, found.ticket.id]);
      res.json(await loadTicket(found.ticket.id, ""));
    } catch (err) {
      fail(res, 500, err.message || "Could not send the reply");
    }
  });
}
