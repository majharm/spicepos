import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const pages = [
  ["privacy.html", "Privacy Policy"],
  ["terms.html", "Terms &amp; Conditions"],
  ["data-deletion.html", "Data Deletion Policy"],
  ["refund.html", "Refund &amp; Cancellation"],
  ["shipping.html", "Shipping &amp; Delivery"],
  ["cookies.html", "Cookie Policy"],
];

test("login page links every Cashfree legal page", () => {
  const login = readFileSync(path.join(root, "login.html"), "utf8");
  assert.match(login, /class="login-legal"/);
  assert.match(login, /login-legal-agree/);
  for (const [file, label] of pages) {
    assert.match(login, new RegExp(`href="\\./${file}">${label}<`));
  }
});

test("legal pages are static HTML with headings, contact, and Cashfree", () => {
  for (const [file, title] of pages) {
    const html = readFileSync(path.join(root, file), "utf8");
    assert.match(html, new RegExp(`<h1>${title}</h1>`));
    assert.match(html, /noc@atavtelecom\.in/);
    assert.match(html, /97650 40588/);
    assert.match(html, /Cashfree/);
    assert.match(html, /href="\.\/login\.html"/);
    assert.match(html, new RegExp(`href="\\./${file}" class="is-active"`));
    assert.match(html, /20260903deploy70/);
    assert.doesNotMatch(html, /<script/);
  }
});
