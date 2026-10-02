-- Invoice instalments: link to the original invoice.
ALTER TABLE invoices ADD COLUMN split_from_invoice_id TEXT;

CREATE INDEX idx_invoices_split_from ON invoices(split_from_invoice_id);
