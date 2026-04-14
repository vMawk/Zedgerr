-- Match Supabase: voorschot op factuur
ALTER TABLE invoices ADD COLUMN advance_payment REAL NOT NULL DEFAULT 0;
