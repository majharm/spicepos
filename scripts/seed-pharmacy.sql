-- Demo pharmacy data for Cloud Agent / local MariaDB.
SET NAMES utf8mb4;

SET @biz = '00000000-0000-4000-8000-000000000001' COLLATE utf8mb4_unicode_ci;

INSERT INTO company_settings (
  id, name, address, phone, email, gstin, state, business_id
) SELECT
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Demo Pharmacy',
  '12 MG Road, Pune',
  '9876543210',
  'demo@pharmacy.local',
  '27AABCU9603R1ZX',
  'Maharashtra',
  @biz
WHERE NOT EXISTS (
  SELECT 1 FROM company_settings WHERE business_id = @biz
);

INSERT INTO customers (
  id, code, name, business_name, mobile, type, gstin, credit_limit, outstanding, business_id
) SELECT
  '11111111-1111-4111-8111-111111111111',
  'CUS-001',
  'Walk-in Customer',
  NULL,
  '9999999999',
  'b2c',
  NULL,
  0,
  0,
  @biz
WHERE NOT EXISTS (
  SELECT 1 FROM customers WHERE business_id = @biz AND code = 'CUS-001'
);

INSERT INTO items (
  id, code, name, local_name, category, subcategory, base_unit,
  purchase_rate, retail_rate, b2b_rate, gst_rate, hsn, stock_gm,
  reorder_level_gm, status, business_id,
  generic_name, medicine_type, manufacturer, pack_unit, units_per_pack, mrp, selling_price
) SELECT
  '22222222-2222-4222-8222-222222222222',
  'MED-001',
  'Paracetamol 500mg',
  'Paracetamol',
  'Medical',
  'Tablet',
  'Strip',
  20.00,
  35.00,
  32.00,
  12.00,
  '30049099',
  100,
  10,
  'active',
  @biz,
  'Paracetamol',
  'Tablet',
  'Demo Pharma',
  'Strip',
  10,
  40.00,
  35.00
WHERE NOT EXISTS (
  SELECT 1 FROM items WHERE business_id = @biz AND code = 'MED-001'
);

INSERT INTO item_batches (
  id, business_id, item_id, batch_no, expiry_date, qty, mrp, purchase_rate
) SELECT
  '33333333-3333-4333-8333-333333333333',
  @biz,
  '22222222-2222-4222-8222-222222222222',
  'BATCH-A1',
  '2027-12-31',
  100,
  40.00,
  20.00
WHERE NOT EXISTS (
  SELECT 1 FROM item_batches
  WHERE business_id = @biz AND item_id = '22222222-2222-4222-8222-222222222222' AND batch_no = 'BATCH-A1'
);

INSERT INTO number_sequences (name, next_value, business_id) VALUES
  ('order', 10036, @biz),
  ('customer', 5, @biz),
  ('item', 8, @biz)
ON DUPLICATE KEY UPDATE next_value = GREATEST(next_value, VALUES(next_value));
