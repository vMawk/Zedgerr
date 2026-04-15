-- Factuur splitten in termijnen: relatie naar originele factuur.
ALTER TABLE invoices ADD COLUMN split_from_invoice_id TEXT;

CREATE INDEX idx_invoices_split_from ON invoices(split_from_invoice_id);
