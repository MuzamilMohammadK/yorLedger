-- Migration 012: Tally, HSN Stock Movements, Physical Counts & Polishing Entries
-- Scoped by shop_id; all money columns in integer paise.

CREATE TABLE IF NOT EXISTS stock_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hsn_code VARCHAR(8),
  unit TEXT NOT NULL DEFAULT 'sarees',
  opening_qty INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  item_id UUID REFERENCES stock_items(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'OPENING', 'PURCHASE', 'SALE', 'SALE_RETURN',
    'PURCHASE_RETURN', 'POLISH_OUT', 'POLISH_IN', 'COUNT_ADJUST'
  )),
  qty INTEGER NOT NULL,
  bill_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  party_id UUID REFERENCES parties(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS polish_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  party_id UUID REFERENCES parties(id) ON DELETE SET NULL,
  item_id UUID REFERENCES stock_items(id) ON DELETE SET NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price_paise BIGINT NOT NULL CHECK (unit_price_paise >= 0),
  total_paise BIGINT NOT NULL CHECK (total_paise >= 0),
  received_qty INTEGER NOT NULL DEFAULT 0 CHECK (received_qty >= 0 AND received_qty <= qty),
  bill_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8);
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES stock_items(id) ON DELETE SET NULL;

-- Backfill stock_items from distinct bill item names/HSNs where missing
INSERT INTO stock_items (shop_id, name, hsn_code)
SELECT DISTINCT t.shop_id, ti.item_name, ti.hsn_code
FROM transaction_items ti
JOIN transactions t ON t.id = ti.transaction_id
WHERE NOT EXISTS (
  SELECT 1 FROM stock_items si
  WHERE si.shop_id = t.shop_id AND si.name = ti.item_name
    AND COALESCE(si.hsn_code, '') = COALESCE(ti.hsn_code, '')
);

-- Backfill bill_items.item_id where possible
UPDATE transaction_items ti
SET item_id = si.id
FROM transactions t, stock_items si
WHERE ti.transaction_id = t.id
  AND si.shop_id = t.shop_id
  AND si.name = ti.item_name
  AND COALESCE(si.hsn_code, '') = COALESCE(ti.hsn_code, '')
  AND ti.item_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_shop_date ON stock_movements (shop_id, date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_shop_item ON stock_movements (shop_id, item_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_hsn_prefix ON stock_items (shop_id, hsn_code varchar_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_polish_entries_shop_date ON polish_entries (shop_id, date);
CREATE INDEX IF NOT EXISTS idx_transaction_items_hsn_prefix ON transaction_items (hsn_code varchar_pattern_ops);
