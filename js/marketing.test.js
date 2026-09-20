import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("public landing is a premium SaaS home independent of the POS shell", () => {
  const home = read("home.html");
  const css = read("css/marketing.css");
  const js = read("js/marketing.js");
  const server = read("server/index.js");
  const loginJs = read("js/x-pos-20260830e.js");
  const deploy = read("DEPLOY-FILES.txt");
  const ht = read(".htaccess");

  assert.match(home, /Run Your Business\. Sell More\. Grow Smarter\./);
  assert.match(home, /All-in-one POS software for Billing, Inventory, Customers, Payments, Staff, Reports and AI-powered Business Growth/);
  assert.match(home, /Start Free \/ Get Started/);
  assert.match(home, /Book a Demo/);
  assert.match(home, /Explore Features/);
  assert.match(home, /One POS\. Every Business\./);
  assert.match(home, /More Than Billing Software/);
  assert.match(home, /How ATAV POS Helps Your Business Grow/);
  assert.match(home, /Billing[\s\S]*Data[\s\S]*Insights[\s\S]*Actions[\s\S]*Growth/);
  assert.match(home, /Your POS Should Not Just Record Sales/);
  assert.match(home, /Turn Any Table, Counter or Storefront/);
  assert.match(home, /Connect Your Digital Weighing Scale Directly to POS/);
  assert.match(home, /One Dashboard\. Multiple Branches\./);
  assert.match(home, /Turn First-Time Buyers Into Repeat Customers/);
  assert.match(home, /Know Your Business Numbers at a Glance/);
  assert.match(home, /Give Every Team Member the Right Access/);
  assert.match(home, />Sales</);
  assert.match(home, />Staff</);
  assert.match(home, /Your Business Doesn't Stop When You Leave the Counter/);
  assert.match(home, /See How Much Time Your Business Can Save/);
  assert.match(home, /Ready to Run Your Business Smarter\?/);
  assert.match(home, /svginfo@atavtelecom\.in/);
  assert.match(home, /\+91 7757090344/);
  assert.match(home, /Space 31, Khadi Machine Chowk/);
  assert.match(home, /© 2026 ATAV TELECOM/);
  assert.match(home, /application\/ld\+json/);
  assert.match(home, /og:title/);
  assert.match(home, /login\.html\?tab=signup/);
  assert.doesNotMatch(home, /id="view-orders"/);
  assert.match(home, /marketing\.css\?v=20260920deploy191/);
  assert.match(home, /marketing\.js\?v=20260920deploy191/);

  assert.match(css, /\.m-nav \{[\s\S]*position: sticky/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);

  assert.match(js, /data-sol-tab/);
  assert.match(js, /pharmacy: \{ title: "Pharmacy"/);
  assert.match(js, /garment: \{ title: "Garment"/);
  assert.match(js, /mailto:svginfo@atavtelecom\.in/);
  assert.match(js, /hours \/ month/);
  assert.doesNotMatch(js, /₹.*income|profit guarantee/i);

  assert.match(server, /sendFile\(path\.join\(publicDir, "home\.html"\)\)/);
  assert.match(loginJs, /location\.href = "\/index\.html"/);
  assert.match(deploy, /home\.html/);
  assert.match(deploy, /css\/marketing\.css/);
  assert.match(deploy, /js\/marketing\.js/);
  assert.match(ht, /DirectoryIndex home\.html index\.html/);
  assert.doesNotMatch(ht, /^RewriteRule/m);
});
