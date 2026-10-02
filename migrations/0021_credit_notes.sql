-- Credit note fields on invoices.
ALTER TABLE invoices ADD COLUMN is_credit_note INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN credit_note_for_id TEXT REFERENCES invoices(id);
