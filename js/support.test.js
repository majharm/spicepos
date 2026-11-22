import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./support.js";

const S = globalThis.SupportPage;

test("support tel WhatsApp and mail hrefs", () => {
  assert.equal(S.telHref("98765 43210"), "tel:9876543210");
  assert.equal(S.telHref("+91-98765-43210"), "tel:+919876543210");
  assert.equal(S.waHref("9876543210"), "https://wa.me/919876543210");
  assert.equal(S.waHref("09876543210"), "https://wa.me/919876543210");
  assert.equal(S.waHref("+91 98765 43210"), "https://wa.me/919876543210");
  assert.equal(S.waHref("9876543210", "Hello"), "https://wa.me/919876543210?text=Hello");
  assert.equal(S.mailHref("help@atavtelecom.in"), "mailto:help@atavtelecom.in");
  assert.equal(S.mailHref("not-an-email"), "");
  assert.equal(S.telHref(""), "");
  assert.equal(S.formatPhone("9876543210"), "+91 98765 43210");
  assert.equal(S.formatPhone("+91 98765 43210"), "+91 98765 43210");
});

test("support page names the assigned account manager", () => {
  const html = S.pageHtml(
    { support_phone: "9876543210", support_email: "am@atavtelecom.in", account_manager_name: "Priya Shah" },
    { name: "SWAMI MASALE" },
  );
  assert.match(html, /Your account manager/);
  assert.match(html, /Priya Shah/);
  assert.match(html, /assigned ATAV POS account manager/);
  assert.doesNotMatch(html, /ATAV POS helpline/);
});

test("support page html has call actions and shop details", () => {
  const html = S.pageHtml(
    { support_phone: "9876543210", support_email: "help@atavtelecom.in" },
    { name: "SWAMI MASALE", address: "Pune", phone: "020111", email: "shop@local", gstin: "27ABCDE1234F1Z5" },
  );
  assert.match(html, /support-hero/);
  assert.match(html, /items-hero-copy/);
  assert.match(html, /support-cta/);
  assert.match(html, /Call now/);
  assert.match(html, /WhatsApp/);
  assert.match(html, /href="tel:9876543210"/);
  assert.match(html, /href="https:\/\/wa\.me\/919876543210/);
  assert.match(html, /mailto:help@atavtelecom\.in/);
  assert.match(html, /Copy number/);
  assert.match(html, /SWAMI MASALE/);
  assert.match(html, /27ABCDE1234F1Z5/);
  assert.match(html, /Before you call/);
});

test("support page empty state and compact preview", () => {
  const empty = S.pageHtml({}, { name: "Shop" });
  assert.match(empty, /Helpline not set yet/);
  assert.doesNotMatch(empty, /Call now/);
  assert.match(empty, /This shop/);
  const compact = S.pageHtml({ support_phone: "9876543210" }, { name: "Shop" }, { compact: true });
  assert.match(compact, /Call now/);
  assert.doesNotMatch(compact, /Copy number/);
  assert.doesNotMatch(compact, /This shop/);
});

test("support ticket desk html", () => {
  const list = S.ticketListHtml(
    [{ id: "t1", subject: "Billing issue", category: "billing", status: "open", created_at: "2026-11-19 10:00:00" }],
    { audience: "shop" },
  );
  assert.match(list, /data-ticket-open="t1"/);
  assert.match(list, /Billing issue/);
  const desk = S.ticketDeskHtml([], null);
  assert.match(desk, /Tickets to ATAV support/);
  assert.match(desk, /support-ticket-split/);
  assert.match(desk, /New ticket/);
  assert.match(desk, /Your tickets/);
  assert.match(desk, /support-ticket-form/);
  assert.match(desk, /class="btn primary"/);
  assert.match(list, /support-ticket-meta/);
  assert.match(list, /With support/);
  assert.doesNotMatch(desk, /btn-primary/);
  const failed = S.ticketDeskHtml([], null, "Could not load tickets");
  assert.match(failed, /Could not load tickets/);
  assert.match(failed, /hint error/);
  const thread = S.ticketThreadHtml(
    { id: "t1", subject: "Login", status: "pending" },
    [{ author_role: "shop", author_name: "Asha", body: "Need help", created_at: "2026-11-19 10:00:00" }],
    { audience: "master" },
  );
  assert.match(thread, /master-ticket-reply/);
  assert.match(thread, /Need help/);
  assert.equal(S.ticketCategory("BILLING"), "billing");
  assert.equal(S.ticketStatus("bad"), "");
});

test("live chat panel and inbox", () => {
  const panel = S.chatPanelHtml(
    [{ id: "m1", author_role: "shop", author_name: "Asha", body: "Counter is stuck", created_at: "2026-11-20 12:00:00" }],
    { audience: "shop" },
  );
  assert.match(panel, /id="support-chat-form"/);
  assert.match(panel, /id="support-chat-log"/);
  assert.match(panel, /Counter is stuck/);
  assert.match(panel, /Live chat/);
  const master = S.chatPanelHtml([], { audience: "master", shopName: "SWAMI MASALE" });
  assert.match(master, /id="master-chat-form"/);
  assert.match(master, /SWAMI MASALE/);
  const inbox = S.chatInboxHtml([
    { business_id: "biz-1", shop_name: "SWAMI MASALE", author_role: "shop", body: "Need help", created_at: "2026-11-20 12:01:00" },
  ]);
  assert.match(inbox, /data-chat-open="biz-1"/);
  assert.match(inbox, /Need help/);
  assert.match(inbox, />New</);
  const open = S.chatInboxHtml(
    [{ business_id: "biz-1", shop_name: "SWAMI MASALE", author_role: "shop", body: "", attachment_name: "bill.pdf", created_at: "2026-11-20 12:01:00" }],
    "biz-1",
  );
  assert.match(open, /is-open/);
  assert.match(open, /Attachment · bill.pdf/);
  const photo = S.chatLogHtml([
    {
      id: "m2",
      author_role: "master",
      body: "",
      attachment_name: "counter.png",
      attachment_mime: "image/png",
      attachment_data: "data:image/png;base64,aaaa",
    },
  ]);
  assert.match(photo, /<img/);
  assert.match(photo, /counter\.png/);
  assert.equal(S.chatAttachment({ data: "data:text/html;base64,aaaa" }).error, "Attach a photo or PDF");
  const ok = S.chatAttachment({ name: "note.pdf", data: "data:application/pdf;base64," + "A".repeat(20) });
  assert.equal(ok.mime, "application/pdf");
  assert.equal(ok.name, "note.pdf");
  assert.equal(typeof S.playChatSound, "function");
  assert.match(master, /Attach/);
  assert.match(S.footerChatHtml(), /Attach/);
});

test("shop chat box lives in the footer dock", () => {
  const html = S.footerChatHtml();
  assert.match(html, /id="support-dock"/);
  assert.match(html, /id="support-dock-panel" hidden/);
  assert.match(html, /id="support-chat-log"/);
  assert.match(html, /id="support-chat-form"/);
  assert.match(html, /id="support-dock-open"/);
  assert.match(html, /Support chat/);
  assert.match(html, /Message the support team/);
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  const paint = app.slice(app.indexOf("async function paintSupport"), app.indexOf("async function refreshSupportChat"));
  assert.match(app, /footerChatHtml\(\)/);
  assert.match(app, /function mountSupportDock/);
  assert.doesNotMatch(paint, /chatPanelHtml/);
  assert.doesNotMatch(paint, /support-chat/);
});

test("login support chips", () => {
  assert.equal(S.loginHtml({}), "");
  const html = S.loginHtml({ support_phone: "9876543210", support_email: "help@atavtelecom.in" });
  assert.match(html, /Need help signing in/);
  assert.match(html, /Call 9876543210/);
  assert.match(html, /WhatsApp/);
  assert.match(html, /mailto:help@atavtelecom\.in/);
});
