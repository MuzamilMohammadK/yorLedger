-- Migration 006: Add HSN Code and Invoice Prefix to transactions table
-- Backward compatible nullable columns

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS invoice_prefix VARCHAR(32);

COMMENT ON COLUMN transactions.hsn_code IS 'Harmonized System of Nomenclature (HSN) or Service Accounting Code (SAC), 4-8 digits';
COMMENT ON COLUMN transactions.invoice_prefix IS 'Invoice prefix configured at time of bill generation (e.g. INV-)';
