-- Migration 010: Separate Weavers from Parties & Billing
-- Creates dedicated weavers table if not already existing, and migrates any existing ARTISAN parties into weavers

CREATE TABLE IF NOT EXISTS weavers (
  id VARCHAR(64) PRIMARY KEY,
  shop_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  additional_phones TEXT[] DEFAULT '{}',
  address TEXT NOT NULL,
  type VARCHAR(32) DEFAULT 'HANDLOOM',
  looms_count INT DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weavers_shop_id ON weavers(shop_id);

-- Migrate any parties with type = 'ARTISAN' into weavers
INSERT INTO weavers (id, shop_id, name, phone, additional_phones, address, type, looms_count, notes, created_at, updated_at)
SELECT
  id,
  shop_id,
  name,
  phone,
  COALESCE(additional_phones, '{}'),
  COALESCE(address, ''),
  COALESCE(loom_type, 'HANDLOOM'),
  COALESCE(looms_count, 1),
  notes,
  created_at,
  updated_at
FROM parties
WHERE type = 'ARTISAN'
ON CONFLICT (id) DO NOTHING;

-- Remove migrated ARTISAN records from parties so weavers do not appear in Parties, Ledger, or Dues
DELETE FROM parties WHERE type = 'ARTISAN';
