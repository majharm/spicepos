import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("support ticket routes stay wired in Node and PHP", () => {
  const node = read("server/index.js");
  const php = read("pos-php-core.php");
  const module = read("server/support-tickets.js");
  const twin = read("pos-support-tickets.php");
  assert.match(node, /registerSupportTickets\(app\)/);
  assert.match(module, /\/api\/support\/tickets/);
  assert.match(module, /\/api\/master\/support-tickets/);
  assert.match(module, /support_tickets/);
  assert.match(twin, /pos_support_ticket_dispatch/);
  assert.match(php, /pos-support-tickets\.php/);
  assert.match(php, /pos_support_ticket_dispatch/);
  assert.match(php, /strpos\(\$path, "master\/support-tickets"\) === 0 && is_file/);
  assert.match(twin, /if \(\$shop && \$bid === ""\) return false/);
});

test("support ticket UI pins on shop and master pages", () => {
  const index = read("index.html");
  const master = read("master.html");
  assert.match(index, /support\.js\?v=20261119sup1/);
  assert.match(index, /app\.js\?v=20261119sup1/);
  assert.match(index, /pos\.css\?v=20261119sup1/);
  assert.match(master, /support\.js\?v=20261119sup1/);
  assert.match(master, /master\.js\?v=20261119sup1/);
  assert.match(master, /pos\.css\?v=20261119sup1/);
  assert.match(master, /data-tab="tickets"/);
});