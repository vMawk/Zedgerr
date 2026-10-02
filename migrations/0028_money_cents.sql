-- Integer cents columns for exact money calculations.
-- The REAL columns stay for compatibility; the *_cents columns are the source of truth.
-- Triggers keep the *_cents columns in sync automatically.

-- invoices
ALTER TABLE invoices ADD COLUMN subtotal_cents          INTEGER;
ALTER TABLE invoices ADD COLUMN btw_amount_cents        INTEGER;
ALTER TABLE invoices ADD COLUMN total_cents             INTEGER;
ALTER TABLE invoices ADD COLUMN advance_payment_cents   INTEGER;

UPDATE invoices SET
  subtotal_cents        = CAST(ROUND(subtotal * 100)          AS INTEGER),
  btw_amount_cents      = CAST(ROUND(btw_amount * 100)        AS INTEGER),
  total_cents           = CAST(ROUND(total * 100)             AS INTEGER),
  advance_payment_cents = CAST(ROUND(advance_payment * 100)   AS INTEGER);

CREATE TRIGGER sync_invoices_cents_insert AFTER INSERT ON invoices BEGIN
  UPDATE invoices SET
    subtotal_cents        = CAST(ROUND(NEW.subtotal * 100)          AS INTEGER),
    btw_amount_cents      = CAST(ROUND(NEW.btw_amount * 100)        AS INTEGER),
    total_cents           = CAST(ROUND(NEW.total * 100)             AS INTEGER),
    advance_payment_cents = CAST(ROUND(NEW.advance_payment * 100)   AS INTEGER)
  WHERE id = NEW.id;
END;

CREATE TRIGGER sync_invoices_cents_update AFTER UPDATE ON invoices
WHEN NEW.subtotal != OLD.subtotal OR NEW.btw_amount != OLD.btw_amount
  OR NEW.total != OLD.total OR NEW.advance_payment != OLD.advance_payment
BEGIN
  UPDATE invoices SET
    subtotal_cents        = CAST(ROUND(NEW.subtotal * 100)          AS INTEGER),
    btw_amount_cents      = CAST(ROUND(NEW.btw_amount * 100)        AS INTEGER),
    total_cents           = CAST(ROUND(NEW.total * 100)             AS INTEGER),
    advance_payment_cents = CAST(ROUND(NEW.advance_payment * 100)   AS INTEGER)
  WHERE id = NEW.id;
END;

-- invoice_lines
ALTER TABLE invoice_lines ADD COLUMN amount_cents INTEGER;

UPDATE invoice_lines SET
  amount_cents = CAST(ROUND(amount * 100) AS INTEGER);

CREATE TRIGGER sync_invoice_lines_cents_insert AFTER INSERT ON invoice_lines BEGIN
  UPDATE invoice_lines SET
    amount_cents = CAST(ROUND(NEW.amount * 100) AS INTEGER)
  WHERE id = NEW.id;
END;

CREATE TRIGGER sync_invoice_lines_cents_update AFTER UPDATE ON invoice_lines
WHEN NEW.amount != OLD.amount BEGIN
  UPDATE invoice_lines SET
    amount_cents = CAST(ROUND(NEW.amount * 100) AS INTEGER)
  WHERE id = NEW.id;
END;

-- expenses
ALTER TABLE expenses ADD COLUMN amount_excl_vat_cents INTEGER;
ALTER TABLE expenses ADD COLUMN vat_amount_cents      INTEGER;
ALTER TABLE expenses ADD COLUMN amount_incl_vat_cents INTEGER;

UPDATE expenses SET
  amount_excl_vat_cents = CAST(ROUND(amount_excl_vat * 100) AS INTEGER),
  vat_amount_cents      = CAST(ROUND(vat_amount * 100)      AS INTEGER),
  amount_incl_vat_cents = CAST(ROUND(amount_incl_vat * 100) AS INTEGER);

CREATE TRIGGER sync_expenses_cents_insert AFTER INSERT ON expenses BEGIN
  UPDATE expenses SET
    amount_excl_vat_cents = CAST(ROUND(NEW.amount_excl_vat * 100) AS INTEGER),
    vat_amount_cents      = CAST(ROUND(NEW.vat_amount * 100)      AS INTEGER),
    amount_incl_vat_cents = CAST(ROUND(NEW.amount_incl_vat * 100) AS INTEGER)
  WHERE id = NEW.id;
END;

CREATE TRIGGER sync_expenses_cents_update AFTER UPDATE ON expenses
WHEN NEW.amount_excl_vat != OLD.amount_excl_vat OR NEW.amount_incl_vat != OLD.amount_incl_vat BEGIN
  UPDATE expenses SET
    amount_excl_vat_cents = CAST(ROUND(NEW.amount_excl_vat * 100) AS INTEGER),
    vat_amount_cents      = CAST(ROUND(NEW.vat_amount * 100)      AS INTEGER),
    amount_incl_vat_cents = CAST(ROUND(NEW.amount_incl_vat * 100) AS INTEGER)
  WHERE id = NEW.id;
END;

-- bank_transactions
ALTER TABLE bank_transactions ADD COLUMN amount_cents INTEGER;

UPDATE bank_transactions SET
  amount_cents = CAST(ROUND(amount * 100) AS INTEGER);

CREATE TRIGGER sync_bank_transactions_cents_insert AFTER INSERT ON bank_transactions BEGIN
  UPDATE bank_transactions SET
    amount_cents = CAST(ROUND(NEW.amount * 100) AS INTEGER)
  WHERE id = NEW.id;
END;

CREATE TRIGGER sync_bank_transactions_cents_update AFTER UPDATE ON bank_transactions
WHEN NEW.amount != OLD.amount BEGIN
  UPDATE bank_transactions SET
    amount_cents = CAST(ROUND(NEW.amount * 100) AS INTEGER)
  WHERE id = NEW.id;
END;

-- quotes
ALTER TABLE quotes ADD COLUMN subtotal_cents   INTEGER;
ALTER TABLE quotes ADD COLUMN btw_amount_cents INTEGER;
ALTER TABLE quotes ADD COLUMN total_cents      INTEGER;

UPDATE quotes SET
  subtotal_cents   = CAST(ROUND(subtotal * 100)   AS INTEGER),
  btw_amount_cents = CAST(ROUND(btw_amount * 100) AS INTEGER),
  total_cents      = CAST(ROUND(total * 100)      AS INTEGER);

CREATE TRIGGER sync_quotes_cents_insert AFTER INSERT ON quotes BEGIN
  UPDATE quotes SET
    subtotal_cents   = CAST(ROUND(NEW.subtotal * 100)   AS INTEGER),
    btw_amount_cents = CAST(ROUND(NEW.btw_amount * 100) AS INTEGER),
    total_cents      = CAST(ROUND(NEW.total * 100)      AS INTEGER)
  WHERE id = NEW.id;
END;

CREATE TRIGGER sync_quotes_cents_update AFTER UPDATE ON quotes
WHEN NEW.total != OLD.total BEGIN
  UPDATE quotes SET
    subtotal_cents   = CAST(ROUND(NEW.subtotal * 100)   AS INTEGER),
    btw_amount_cents = CAST(ROUND(NEW.btw_amount * 100) AS INTEGER),
    total_cents      = CAST(ROUND(NEW.total * 100)      AS INTEGER)
  WHERE id = NEW.id;
END;
