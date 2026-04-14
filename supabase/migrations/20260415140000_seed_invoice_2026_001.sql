-- Factuur 2026-001 + 12 urenregels (66,5 u), €622,50 incl. BTW, voorschot €150.
-- Gebruikt het eerste bedrijf (oudste op created_at). Idempotent als 2026-001 al bestaat.
-- Draait als database-migratie (geen RLS voor postgres).

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS advance_payment NUMERIC(10, 2) NOT NULL DEFAULT 0;

DO $$
DECLARE
  uid uuid;
  cid uuid;
  iid uuid;
  te_id uuid;
  i int;
  hrs numeric[] := ARRAY[6, 4.5, 2, 3, 1.5, 7, 8, 5, 8, 5, 8, 8.5]::numeric[];
  amts numeric[] := ARRAY[
    46.42, 34.81, 15.47, 23.21, 11.60, 54.15, 61.89, 38.68, 61.89, 38.68, 61.89, 65.77
  ]::numeric[];
  d date;
  rate numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM public.invoices WHERE invoice_number = '2026-001') THEN
    RETURN;
  END IF;

  SELECT c.user_id, c.id INTO uid, cid
  FROM public.companies c
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF cid IS NULL THEN
    RAISE NOTICE 'seed_invoice_2026_001: geen bedrijf — sla over (voeg eerst een bedrijf toe).';
    RETURN;
  END IF;

  INSERT INTO public.invoices (
    user_id,
    company_id,
    invoice_number,
    invoice_date,
    due_date,
    status,
    subtotal,
    btw_percentage,
    btw_amount,
    total,
    advance_payment,
    notes
  ) VALUES (
    uid,
    cid,
    '2026-001',
    '2026-01-31',
    '2026-02-28',
    'betaald',
    514.46,
    21,
    108.04,
    622.50,
    150.00,
    'Voorschot €150,00. Ontvangen na voorschot €472,50. Totaal factuur €622,50 (incl. BTW).'
  )
  RETURNING id INTO iid;

  FOR i IN 1..12 LOOP
    d := make_date(2026, 1, i);
    rate := round((amts[i] / hrs[i])::numeric, 2);

    INSERT INTO public.time_entries (
      user_id,
      company_id,
      date,
      hours,
      description,
      hourly_rate,
      invoiced,
      invoice_id
    ) VALUES (
      uid,
      cid,
      d,
      hrs[i],
      'Urenregel ' || i,
      rate,
      true,
      iid
    )
    RETURNING id INTO te_id;

    INSERT INTO public.invoice_lines (
      invoice_id,
      time_entry_id,
      description,
      date,
      hours,
      hourly_rate,
      amount
    ) VALUES (
      iid,
      te_id,
      'Urenregel ' || i,
      d,
      hrs[i],
      rate,
      amts[i]
    );
  END LOOP;
END $$;
