-- Label on the invoice PDF: credit or advance (the amount stays in advance_payment).
ALTER TABLE invoices ADD COLUMN advance_label TEXT NOT NULL DEFAULT 'krediet';
