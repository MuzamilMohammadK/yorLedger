-- Migration 002: Ledger, Parties, Payments and Dashboard Analytics Schema
-- Supports Tenancy, GST compliant transactions, and real-time ledger balance calculations

-- Parties Table (Customers, Silk Suppliers, Weavers & Artisans)
CREATE TABLE IF NOT EXISTS parties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('CUSTOMER', 'SUPPLIER', 'ARTISAN')),
    owner_name VARCHAR(255),
    gstin VARCHAR(15),
    phone VARCHAR(20) NOT NULL,
    alt_phone VARCHAR(20),
    address TEXT,
    state_code VARCHAR(2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Transactions Table (Sales, Purchases, Job Work, Returns)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    type VARCHAR(30) NOT NULL CHECK (type IN ('SALE', 'PURCHASE', 'JOB_WORK', 'RETURN')),
    invoice_number VARCHAR(100) NOT NULL,
    invoice_date DATE NOT NULL,
    subtotal_paise BIGINT NOT NULL DEFAULT 0,
    tax_paise BIGINT NOT NULL DEFAULT 0,
    cgst_paise BIGINT NOT NULL DEFAULT 0,
    sgst_paise BIGINT NOT NULL DEFAULT 0,
    igst_paise BIGINT NOT NULL DEFAULT 0,
    grand_total_paise BIGINT NOT NULL DEFAULT 0,
    paid_paise BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PARTIAL', 'SETTLED')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_shop_invoice UNIQUE (shop_id, type, invoice_number)
);

-- Transaction Line Items (Saree descriptions, meterage/qty, rates)
CREATE TABLE IF NOT EXISTS transaction_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    item_name VARCHAR(255) NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
    rate_paise BIGINT NOT NULL,
    gst_rate_bp INTEGER NOT NULL DEFAULT 500,
    amount_paise BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Payments Table (Cash, Cheque, NEFT/RTGS, UPI)
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    amount_paise BIGINT NOT NULL,
    payment_mode VARCHAR(20) NOT NULL CHECK (payment_mode IN ('CASH', 'CHEQUE', 'NEFT', 'UPI')),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_number VARCHAR(100),
    collected_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Fast Indexes for multi-tenant analytical queries
CREATE INDEX IF NOT EXISTS idx_parties_shop_type ON parties(shop_id, type);
CREATE INDEX IF NOT EXISTS idx_transactions_shop_date ON transactions(shop_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_shop_status ON transactions(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_shop_type ON transactions(shop_id, type);
CREATE INDEX IF NOT EXISTS idx_payments_shop_tx ON payments(shop_id, transaction_id);
