import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.POS_URL || "http://127.0.0.1:5173/";
const ARTIFACTS = "/opt/cursor/artifacts";
fs.mkdirSync(ARTIFACTS, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1280,900"],
  defaultViewport: { width: 1280, height: 900 },
});

const page = await browser.newPage();
const failures = [];

function check(name, ok, detail = "") {
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function shot(name) {
  const file = path.join(ARTIFACTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function fill(selector, value) {
  await page.$eval(
    selector,
    (el, v) => {
      el.focus();
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    value,
  );
}

async function clickProduct(name) {
  const clicked = await page.evaluate((label) => {
    const card = [...document.querySelectorAll(".card")].find((c) =>
      c.textContent.includes(label),
    );
    if (!card) return false;
    card.click();
    return true;
  }, name);
  if (!clicked) throw new Error(`Product not found: ${name}`);
}

async function unlock() {
  await fill("#pin", "1234");
  await page.click("#pin-form button[type='submit']");
  await page.waitForFunction(() => document.getElementById("lock").hidden);
}

try {
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });

  const lockVisible = await page.$eval("#lock", (el) => !el.hidden);
  check("lock overlay on load", lockVisible);

  await fill("#pin", "0000");
  await page.click("#pin-form button[type='submit']");
  const wrong = await page.$eval("#pin-hint", (el) => el.textContent);
  const stillLocked = await page.$eval("#lock", (el) => !el.hidden);
  check("wrong PIN stays locked", stillLocked && /wrong/i.test(wrong), wrong);

  await unlock();
  check("PIN 1234 unlocks", await page.$eval("#lock", (el) => el.hidden));
  await shot("screenshot_pos_unlocked_catalog");

  await fill("#search", "tur");
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".card .name")].some((n) => /turmeric/i.test(n.textContent)),
  );
  check("search tur finds turmeric", true);

  await fill("#search", "SAF-001");
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".card .sku")].some((n) => n.textContent.includes("SAF-001")),
  );
  check("search SKU finds saffron", true);

  await fill("#search", "");
  await page.waitForFunction(() => document.querySelectorAll(".card").length > 5);

  await clickProduct("Turmeric");
  await clickProduct("Turmeric");
  const totals = await page.evaluate(() => ({
    taxable: document.getElementById("taxable").textContent,
    tax: document.getElementById("tax").textContent,
    total: document.getElementById("total").textContent,
    lines: document.getElementById("lines").innerText,
  }));
  check("2x turmeric taxable", totals.taxable === "₹90.00", totals.taxable);
  check("2x turmeric GST", totals.tax === "₹4.50", totals.tax);
  check("2x turmeric total", totals.total === "₹94.50", totals.total);

  await page.click('.line button[data-act="inc"]');
  const qty3 = await page.$eval(".line .qty span", (el) => el.textContent);
  check("plus increases qty", qty3 === "3", qty3);
  await page.click('.line button[data-act="dec"]');
  check("minus decreases qty", (await page.$eval(".line .qty span", (el) => el.textContent)) === "2");

  await page.click("#btn-clear");
  for (let i = 0; i < 7; i += 1) {
    await clickProduct("Saffron");
  }
  const oversellHint = await page.$eval("#hint", (el) => el.textContent);
  const saffronQty = await page.evaluate(() => {
    const span = document.querySelector(".line .qty span");
    return span ? span.textContent : "0";
  });
  check("saffron cannot exceed stock 6", saffronQty === "6" && /stock/i.test(oversellHint), `${saffronQty} ${oversellHint}`);

  await page.click("#btn-clear");
  check("empty cart cash blocked", await page.$eval("#pay-cash", (el) => el.disabled));
  check("empty cart hold blocked", await page.$eval("#btn-hold", (el) => el.disabled));

  await clickProduct("Turmeric");
  await clickProduct("Turmeric");

  await page.click("#pay-cash");
  check("empty tender rejected", /amount/i.test(await page.$eval("#hint", (el) => el.textContent)));

  await fill("#tender", "1");
  await page.click("#pay-cash");
  check("short cash rejected", /short/i.test(await page.$eval("#hint", (el) => el.textContent)));
  const stockBefore = await page.evaluate(() =>
    [...document.querySelectorAll(".card")].find((c) => c.textContent.includes("Turmeric")).textContent,
  );

  await fill("#tender", "1000");
  await page.click("#pay-cash");
  await page.waitForSelector(".receipt");
  const receipt = await page.$eval(".receipt", (el) => el.textContent);
  check("cash receipt total", receipt.includes("TOTAL    ₹94.50"), receipt);
  check("cash change", receipt.includes("Change   ₹905.50"), receipt);
  await shot("screenshot_cash_receipt_change");
  await page.click("#modal-close");

  const stockAfter = await page.evaluate(() =>
    [...document.querySelectorAll(".card")].find((c) => c.textContent.includes("Turmeric")).textContent,
  );
  check("stock decremented after cash sale", stockAfter.includes("46 in stock") && stockBefore.includes("48 in stock"), stockAfter);
  const today = await page.$eval("#today-total", (el) => el.textContent);
  check("today takings updated", today === "₹94.50", today);

  await clickProduct("Cumin");
  await page.click("#btn-hold");
  check("hold empties cart", /held/i.test(await page.$eval("#hint", (el) => el.textContent)));
  const emptyCart = await page.$eval("#lines", (el) => el.innerText);
  check("cart empty after hold", /tap a spice/i.test(emptyCart));

  await page.click("#btn-held");
  await page.waitForSelector("[data-hold]");
  await page.click("[data-hold]");
  check("recall restores cumin", (await page.$eval("#lines", (el) => el.innerText)).includes("Cumin"));

  await clickProduct("Coriander");
  await page.click("#btn-hold");
  await clickProduct("Coriander");
  await page.click("#btn-held");
  await page.click("[data-hold]");
  check(
    "recall blocked when cart live",
    /clear or hold/i.test(await page.$eval("#hint", (el) => el.textContent)),
  );
  await page.click("#btn-clear");
  await page.click("#btn-held");
  if (await page.$("[data-hold]")) {
    await page.click("[data-hold]");
  }
  await page.click("#pay-upi");
  await page.waitForSelector(".receipt");
  const upiReceipt = await page.$eval(".receipt", (el) => el.textContent);
  check("UPI change is zero", /Change\s+₹0\.00/.test(upiReceipt), upiReceipt);
  await page.click("#modal-close");

  await page.click("#btn-orders");
  await page.waitForSelector("[data-order]");
  await page.click("[data-order]");
  check("orders reprint receipt", Boolean(await page.$(".receipt")));
  await page.click("#modal-close");

  await page.click("#btn-lock");
  check("lock returns PIN", await page.$eval("#lock", (el) => !el.hidden));
  await unlock();
  check("unlock after lock", await page.$eval("#today-count", (el) => el.textContent !== "0"));

  await page.reload({ waitUntil: "networkidle0" });
  await unlock();
  check("reload keeps today's sales", (await page.$eval("#today-total", (el) => el.textContent)) !== "₹0.00");
  await shot("screenshot_pos_after_reload_sales");

  await page.setViewport({ width: 390, height: 844 });
  await shot("screenshot_pos_mobile_390");
  const mobileCatalog = await page.$eval("#catalog", (el) => el.getBoundingClientRect().height > 40);
  check("mobile catalog visible", mobileCatalog);
} catch (err) {
  failures.push(String(err.stack || err));
  console.error(err);
  await shot("screenshot_e2e_failure").catch(() => {});
} finally {
  await browser.close();
}

if (failures.length) {
  console.error("\nFailed checks:\n" + failures.map((f) => `- ${f}`).join("\n"));
  process.exit(1);
}
console.log("\nAll browser checklist items passed.");
