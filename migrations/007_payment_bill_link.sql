-- Migration 007: Add transaction_id column to payments table
-- Backward compatible nullable column linking payments directly to their parent bill

ALTER TABLE payments ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments(transaction_id);

COMMENT ON COLUMN payments.transaction_id IS 'ID of the bill/transaction this payment is associated with (nullable for standalone receipts)';
