-- Migration 009: Weaver Details - One Source of Truth in Parties
-- Adds loom_type and looms_count to the parties table so weavers are stored once as type = 'ARTISAN'

ALTER TABLE parties ADD COLUMN IF NOT EXISTS loom_type VARCHAR(32) DEFAULT 'HANDLOOM';
ALTER TABLE parties ADD COLUMN IF NOT EXISTS looms_count INT DEFAULT 1;

-- Index for artisan / weaver lookups
CREATE INDEX IF NOT EXISTS idx_parties_shop_type_weaver ON parties(shop_id, type) WHERE type = 'ARTISAN';
