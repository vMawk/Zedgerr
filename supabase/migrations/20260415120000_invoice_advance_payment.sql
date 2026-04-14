-- Voorschot op factuur (bijv. al ontvangen bedrag vóór restbetaling)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS advance_payment NUMERIC(10, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.invoices.advance_payment IS 'Reeds ontvangen voorschot (excl. BTW-logica; bedrag in EUR)';
