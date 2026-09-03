import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const pages = [
  ["privacy", "Privacy Policy"],
  ["terms", "Terms &amp; Conditions"],
  ["data-deletion", "Data Deletion Policy"],
  ["refund", "Refund &amp; Cancellation"],
  ["shipping", "Shipping &amp; Delivery"],
  ["cookies", "Cookie Policy"],
];

test("login page links Cashfree legal URLs on atavtelecom.in", () => {
  const login = readFileSync(path.join(root, "login.html"), "utf8");
  assert.match(login, /class="login-legal"/);
  assert.match(login, /login-legal-agree/);
  for (const [slug, label] of pages) {
    assert.match(login, new RegExp(`href="https://atavtelecom\\.in/legal/${slug}"[^>]*>${label}<`));
  }
});

test("legal pages live at /legal/{page} with headings, contact, and Cashfree", () => {
  for (const [slug, title] of pages) {
    const html = readFileSync(path.join(root, "legal", slug, "index.html"), "utf8");
    assert.match(html, new RegExp(`<h1>${title}</h1>`));
    assert.match(html, /noc@atavtelecom\.in/);
    assert.match(html, /97650 40588/);
    assert.match(html, /Cashfree/);
    assert.match(html, /https:\/\/pos\.atavtelecom\.in\/login\.html/);
    assert.match(html, new RegExp(`href="https://atavtelecom\\.in/legal/${slug}" class="is-active"`));
    assert.match(html, /rel="canonical" href="https:\/\/atavtelecom\.in\/legal\//);
    assert.match(html, /20260903deploy71/);
    assert.doesNotMatch(html, /<script/);
    const bounce = readFileSync(path.join(root, `${slug}.html`), "utf8");
    assert.match(bounce, new RegExp(`url=https://atavtelecom\\.in/legal/${slug}`));
  }
});
