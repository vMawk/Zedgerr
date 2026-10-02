-- Payment method per invoice: bank transfer (default) or cash.
ALTER TABLE invoices ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'overboeking';
