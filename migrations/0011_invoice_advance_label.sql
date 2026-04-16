-- Woordkeuze op factuur-PDF: krediet of voorschot (weergave; bedrag blijft advance_payment)
ALTER TABLE invoices ADD COLUMN advance_label TEXT NOT NULL DEFAULT 'krediet';
