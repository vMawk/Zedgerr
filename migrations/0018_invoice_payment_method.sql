-- Betaalwijze per factuur: overboeking (standaard) of contant.
ALTER TABLE invoices ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'overboeking';
