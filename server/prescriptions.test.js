import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizeRxPayload, rxNextStatus, rxStatusLabel, decodeRxFile } from "./prescriptions.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

test("Prescription payload requires name, mobile, address, doctor, and a photo or PDF", () => {
  assert.throws(() => normalizeRxPayload({}), /Customer name/);
  assert.throws(
    () => normalizeRxPayload({ customer_name: "A", mobile: "123", file_base64: "aaa", mime: "image/jpeg" }),
    /Valid mobile/,
  );
  assert.throws(
    () =>
      normalizeRxPayload({
        customer_name: "A",
        mobile: "9876543210",
        file_base64: "aaaa",
        mime: "image/jpeg",
      }),
    /Customer address/,
  );
  assert.throws(
    () =>
      normalizeRxPayload({
        customer_name: "A",
        mobile: "9876543210",
        customer_address: "Pune 411001",
        file_base64: "aaaa",
        mime: "image/jpeg",
      }),
    /Doctor name/,
  );
  const row = normalizeRxPayload({
    customerName: " Ravi ",
    mobile: "+91 98765-43210",
    customer_address: " 12 Main Road, Kothrud, Pune 411038 ",
    doctorName: " Dr. Shah ",
    clinic_name: " City Clinic ",
    notes: "  urgent  ",
    fileName: "rx.jpg",
    mime: "image/jpg",
    file_base64: "data:image/jpeg;base64,aaaa",
  });
  assert.equal(row.customerName, "Ravi");
  assert.equal(row.mobile, "+919876543210");
  assert.equal(row.customerAddress, "12 Main Road, Kothrud, Pune 411038");
  assert.equal(row.doctorName, "Dr. Shah");
  assert.equal(row.clinicName, "City Clinic");
  assert.equal(row.mime, "image/jpeg");
  assert.equal(row.data, "aaaa");
});

test("Prescription status pipeline matches pharmacy workflow", () => {
  assert.equal(rxStatusLabel("pending"), "Pending");
  assert.equal(rxStatusLabel("under_review"), "Under Review");
  assert.equal(rxStatusLabel("order_created"), "Order Created");
  assert.equal(rxStatusLabel("completed"), "Dispensed");
  assert.equal(rxNextStatus("pending"), "under_review");
  assert.equal(rxNextStatus("under_review"), "approved");
  assert.equal(rxNextStatus("approved"), "order_created");
  assert.equal(rxNextStatus("order_created"), "completed");
  assert.equal(rxNextStatus("completed"), "");
});

test("PDF magic bytes are required for PDF uploads", () => {
  assert.throws(() => decodeRxFile(Buffer.from("not-pdf").toString("base64"), "application/pdf"), /PDF/);
  const pdf = Buffer.from("%PDF-1.4 test");
  assert.equal(decodeRxFile(pdf.toString("base64"), "application/pdf").slice(0, 4).toString(), "%PDF");
});

test("Pharmacy QR upload page and Prescription Orders desk are wired", () => {
  const html = read("rx.html");
  const js = read("js/rx.js");
  const index = read("index.html");
  const app = read("js/app.js");
  const php = read("pos-prescriptions.php");
  assert.match(html, /Upload Prescription/);
  assert.match(html, /data-pick="rx-camera"/);
  assert.match(html, /data-pick="rx-gallery"/);
  assert.match(html, /data-pick="rx-pdf"/);
  assert.match(html, /Submit Prescription/);
  assert.match(html, /name="customer_address"/);
  assert.match(html, /name="doctor_name"/);
  assert.match(js, /Prescription submitted successfully/);
  assert.match(js, /customer_address/);
  assert.match(js, /doctor_name/);
  assert.match(js, /clinic_name/);
  assert.match(js, /\/api\/rx\/prescriptions/);
  assert.match(index, /data-view="prescriptions"/);
  assert.match(index, /Prescription Orders/);
  assert.match(index, /id="rx-menu-code"/);
  assert.match(app, /function loadPrescriptions/);
  assert.match(app, /rx.html\?shop=/);
  assert.match(php, /CREATE TABLE IF NOT EXISTS prescription_orders/);
  assert.match(php, /function pos_rx_public_dispatch/);
  assert.match(read("server/index.js"), /url\.startsWith\("\/api\/rx\/"\)/);
  assert.match(read("server/index.js"), /req\.path\.startsWith\("\/uploads\/"\)/);
  assert.match(read("uploads/prescriptions/.htaccess"), /Require all denied|Deny from all/);
});
