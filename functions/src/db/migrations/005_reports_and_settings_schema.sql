-- Migration 005: Reports, GST Analytics and Settings Configuration Schema

-- Ensure shop fields for logo, pin code, state
ALTER TABLE shops ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS pin_code VARCHAR(10);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS state VARCHAR(100);

-- Shop Settings Table
CREATE TABLE IF NOT EXISTS shop_settings (
    shop_id UUID PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
    invoice_settings JSONB NOT NULL DEFAULT '{
        "invoice_prefix": "INV-",
        "suggested_next_number": 1001,
        "date_format": "DD/MM/YYYY",
        "show_logo": true,
        "show_gstin": true,
        "show_tax_breakdown": true,
        "invoice_footer": "Thank you for supporting authentic handloom silk weaving!",
        "terms_and_conditions": "Goods once sold can be exchanged within 7 days in original condition with bill."
    }'::jsonb,
    notification_settings JSONB NOT NULL DEFAULT '{
        "push_notifications": true,
        "in_app_notifications": true,
        "due_reminders": true,
        "reminder_lead_time_days": 3,
        "daily_reminder_time": "08:00 IST"
    }'::jsonb,
    app_preferences JSONB NOT NULL DEFAULT '{
        "currency": "INR",
        "time_zone": "Asia/Kolkata",
        "date_format": "DD/MM/YYYY",
        "theme": "system",
        "language": "en",
        "default_landing_page": "/dashboard"
    }'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shop_settings_shop_id ON shop_settings(shop_id);

