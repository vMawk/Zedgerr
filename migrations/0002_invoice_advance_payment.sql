-- Advance payment on invoices
ALTER TABLE invoices ADD COLUMN advance_payment REAL NOT NULL DEFAULT 0;
