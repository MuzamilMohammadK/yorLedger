-- Migration 003: Party Management Schema Updates
-- Enhances parties table with state, pin_code, additional_phones (JSONB), and notes

ALTER TABLE parties ADD COLUMN IF NOT EXISTS state VARCHAR(100);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS pin_code VARCHAR(10);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS additional_phones JSONB DEFAULT '[]'::jsonb;
ALTER TABLE parties ADD COLUMN IF NOT EXISTS notes TEXT;

-- Index for searching parties by phone and name with tenant isolation
CREATE INDEX IF NOT EXISTS idx_parties_shop_phone ON parties(shop_id, phone);
CREATE INDEX IF NOT EXISTS idx_parties_shop_gstin ON parties(shop_id, gstin);

