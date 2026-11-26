-- Migration 011: Move HSN / SAC code from bill-level to per-item level
-- Backward compatible: adds hsn_code to transaction_items and copies existing bill-level hsn_code onto every line item.

ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8);

UPDATE transaction_items ti
SET hsn_code = t.hsn_code
FROM transactions t
WHERE ti.transaction_id = t.id
  AND t.hsn_code IS NOT NULL
  AND t.hsn_code <> ''
  AND ti.hsn_code IS NULL;

COMMENT ON COLUMN transaction_items.hsn_code IS 'Per-item Harmonized System of Nomenclature (HSN) or Service Accounting Code (SAC), 4-8 digits';
