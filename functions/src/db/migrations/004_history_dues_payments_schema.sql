-- Migration 004: History, Dues, and Payments Enhancements
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS return_paise BIGINT NOT NULL DEFAULT 0;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS cheque_number VARCHAR(50);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS cheque_date DATE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS deposit_date DATE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS clearing_status VARCHAR(20) DEFAULT 'CLEARED';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT;

-- Returns Table for detailed item return tracking
CREATE TABLE IF NOT EXISTS returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    amount_paise BIGINT NOT NULL,
    reason TEXT,
    return_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_due_date ON transactions(shop_id, due_date);
CREATE INDEX IF NOT EXISTS idx_payments_shop_party ON payments(shop_id, party_id);
CREATE INDEX IF NOT EXISTS idx_returns_shop_tx ON returns(shop_id, transaction_id);

