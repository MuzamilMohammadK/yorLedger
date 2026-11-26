-- Migration 013: Stock & Production Rework
-- Adds ledger-based movement tables with ACTIVE/VOID status, audit_log,
-- looms, workers, attendance, polish_payments, and weaver_payments.

CREATE TABLE IF NOT EXISTS raw_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  hsn_code VARCHAR(8),
  reorder_level_grams BIGINT NOT NULL DEFAULT 5000,
  unit_price_paise BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raw_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('PURCHASE', 'ISSUE_JOBWORK', 'SOLD', 'RETURN', 'WASTAGE', 'ADJUST')),
  grams BIGINT NOT NULL,
  rate_paise_per_kg BIGINT NOT NULL DEFAULT 0,
  amount_paise BIGINT NOT NULL DEFAULT 0,
  party_id UUID,
  weaver_id UUID,
  bill_id UUID,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOID')),
  voided_by UUID,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  created_by UUID,
  source_type TEXT,
  source_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weavers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  party_id UUID,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  loom_type TEXT NOT NULL DEFAULT 'HANDLOOM',
  looms_count INTEGER NOT NULL DEFAULT 1,
  weaver_type TEXT NOT NULL DEFAULT 'OUTSIDE' CHECK (weaver_type IN ('OWN_STAFF', 'OUTSIDE')),
  piece_rate_paise BIGINT NOT NULL DEFAULT 0,
  day_rate_paise BIGINT NOT NULL DEFAULT 0,
  std_grams_per_saree INTEGER NOT NULL DEFAULT 500,
  allowed_wastage_pct NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS looms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  loom_no TEXT NOT NULL,
  loom_type TEXT NOT NULL CHECK (loom_type IN ('HANDLOOM', 'POWERLOOM')),
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'IDLE', 'REPAIR')),
  assigned_worker_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  weaver_id UUID REFERENCES weavers(id) ON DELETE SET NULL,
  loom_id UUID REFERENCES looms(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  phone TEXT,
  day_wage_paise BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  present BOOLEAN NOT NULL DEFAULT true,
  wage_paise BIGINT NOT NULL DEFAULT 0,
  advance_paise BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOID')),
  voided_by UUID,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  created_by UUID,
  source_type TEXT,
  source_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finished_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  item_id UUID,
  item_name TEXT NOT NULL,
  hsn_code VARCHAR(8),
  date DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('OPENING', 'PRODUCTION', 'SALE', 'POLISH_OUT', 'POLISH_IN', 'RETURN', 'ADJUST')),
  qty INTEGER NOT NULL,
  rate_paise BIGINT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOID')),
  voided_by UUID,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  created_by UUID,
  source_type TEXT,
  source_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS polish_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  party_id UUID,
  person_name TEXT NOT NULL,
  date DATE NOT NULL,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  mode TEXT NOT NULL,
  is_advance BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOID')),
  voided_by UUID,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  created_by UUID,
  source_type TEXT,
  source_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weaver_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  weaver_id UUID NOT NULL REFERENCES weavers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  mode TEXT NOT NULL,
  is_advance BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOID')),
  voided_by UUID,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  created_by UUID,
  source_type TEXT,
  source_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_uid TEXT NOT NULL,
  reason TEXT,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raw_movements_shop_item_date ON raw_movements (shop_id, item_id, date);
CREATE INDEX IF NOT EXISTS idx_finished_movements_shop_item_date ON finished_movements (shop_id, item_id, date);
CREATE INDEX IF NOT EXISTS idx_polish_payments_shop_date ON polish_payments (shop_id, date);
CREATE INDEX IF NOT EXISTS idx_weaver_payments_shop_weaver_date ON weaver_payments (shop_id, weaver_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_shop_worker_date ON attendance (shop_id, worker_id, date);
