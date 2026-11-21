-- Migration 008: Stock & Production Module
-- Tables for finished stock ledger, raw materials, weavers, own looms, staff, and polishing

-- 1. Finished Stock Movements Ledger
CREATE TABLE IF NOT EXISTS stock_movements (
  id VARCHAR(64) PRIMARY KEY,
  shop_id VARCHAR(64) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  movement_type VARCHAR(32) NOT NULL, -- OPENING, PURCHASE, PRODUCTION, SALE, POLISH_OUT, POLISH_IN, RETURN
  qty INTEGER NOT NULL CHECK (qty > 0),
  rate_paise BIGINT DEFAULT 0,
  ref_id VARCHAR(64),
  ref_no VARCHAR(64),
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_shop_item ON stock_movements(shop_id, item_name);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(date);

-- 2. Raw Materials Master & Transactions
CREATE TABLE IF NOT EXISTS raw_materials (
  id VARCHAR(64) PRIMARY KEY,
  shop_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  unit VARCHAR(16) DEFAULT 'kg',
  unit_price_paise BIGINT NOT NULL DEFAULT 0,
  low_stock_threshold_kg NUMERIC(10, 3) DEFAULT 5.000,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_raw_materials_shop ON raw_materials(shop_id);

CREATE TABLE IF NOT EXISTS raw_material_tx (
  id VARCHAR(64) PRIMARY KEY,
  shop_id VARCHAR(64) NOT NULL,
  material_id VARCHAR(64) NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  material_name VARCHAR(255) NOT NULL,
  tx_type VARCHAR(32) NOT NULL, -- PURCHASE, ISSUE_WEAVER, RETURN, WASTAGE
  qty_kg NUMERIC(10, 3) NOT NULL CHECK (qty_kg > 0),
  rate_per_kg_paise BIGINT NOT NULL DEFAULT 0,
  total_amount_paise BIGINT NOT NULL DEFAULT 0,
  weaver_id VARCHAR(64),
  weaver_name VARCHAR(255),
  date DATE NOT NULL,
  ref_no VARCHAR(64),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_raw_material_tx_shop ON raw_material_tx(shop_id, material_id);

-- 3. Weavers, Own Looms, and Weaver Transactions
CREATE TABLE IF NOT EXISTS weavers (
  id VARCHAR(64) PRIMARY KEY,
  shop_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address TEXT,
  type VARCHAR(32) NOT NULL DEFAULT 'HANDLOOM', -- HANDLOOM, POWERLOOM
  looms_count INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_weavers_shop ON weavers(shop_id);

CREATE TABLE IF NOT EXISTS own_looms (
  id VARCHAR(64) PRIMARY KEY,
  shop_id VARCHAR(64) NOT NULL UNIQUE,
  handloom_running INTEGER NOT NULL DEFAULT 0,
  handloom_idle INTEGER NOT NULL DEFAULT 0,
  handloom_repair INTEGER NOT NULL DEFAULT 0,
  powerloom_running INTEGER NOT NULL DEFAULT 0,
  powerloom_idle INTEGER NOT NULL DEFAULT 0,
  powerloom_repair INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS weaver_transactions (
  id VARCHAR(64) PRIMARY KEY,
  shop_id VARCHAR(64) NOT NULL,
  weaver_id VARCHAR(64) NOT NULL REFERENCES weavers(id) ON DELETE CASCADE,
  weaver_name VARCHAR(255) NOT NULL,
  action_type VARCHAR(32) NOT NULL, -- ISSUE, RECEIVE, WAGE_PAYMENT
  date DATE NOT NULL,
  material_id VARCHAR(64),
  material_name VARCHAR(255),
  qty_kg NUMERIC(10, 3) DEFAULT 0,
  unit_price_paise BIGINT DEFAULT 0,
  total_material_paise BIGINT DEFAULT 0,
  finished_item_name VARCHAR(255),
  sarees_count INTEGER DEFAULT 0,
  wastage_kg NUMERIC(10, 3) DEFAULT 0,
  wage_amount_paise BIGINT DEFAULT 0,
  payment_amount_paise BIGINT DEFAULT 0,
  payment_mode VARCHAR(32),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_weaver_tx_shop_weaver ON weaver_transactions(shop_id, weaver_id);

-- 4. Staff Directory & Staff Records
CREATE TABLE IF NOT EXISTS staff (
  id VARCHAR(64) PRIMARY KEY,
  shop_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(64) NOT NULL,
  phone VARCHAR(20),
  wage_type VARCHAR(32) NOT NULL DEFAULT 'MONTHLY', -- MONTHLY, DAILY, PIECE_RATE
  wage_amount_paise BIGINT NOT NULL DEFAULT 0,
  joining_date DATE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_staff_shop ON staff(shop_id);

CREATE TABLE IF NOT EXISTS staff_records (
  id VARCHAR(64) PRIMARY KEY,
  shop_id VARCHAR(64) NOT NULL,
  staff_id VARCHAR(64) NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  staff_name VARCHAR(255) NOT NULL,
  record_type VARCHAR(32) NOT NULL, -- ATTENDANCE, ADVANCE, SALARY_PAY
  date DATE NOT NULL,
  attendance_status VARCHAR(32), -- PRESENT, ABSENT, HALF_DAY
  amount_paise BIGINT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_staff_records_shop ON staff_records(shop_id, staff_id);

-- 5. Polishing Batches
CREATE TABLE IF NOT EXISTS polishing_batches (
  id VARCHAR(64) PRIMARY KEY,
  shop_id VARCHAR(64) NOT NULL,
  person_name VARCHAR(255) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  sarees_sent INTEGER NOT NULL CHECK (sarees_sent > 0),
  sarees_received INTEGER NOT NULL DEFAULT 0,
  unit_price_paise BIGINT NOT NULL DEFAULT 0,
  total_amount_paise BIGINT NOT NULL DEFAULT 0,
  sent_date DATE NOT NULL,
  received_date DATE,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING, RECEIVED, PARTIAL
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_polishing_shop ON polishing_batches(shop_id);
