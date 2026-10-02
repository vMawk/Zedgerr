-- Phase 5: bankafschrift reconciliatie
-- Voegt reconciliation-status toe aan bank_transactions.
-- bank_transaction_id FK op invoices en expenses voor directe koppeling.

ALTER TABLE bank_transactions ADD COLUMN reconciled        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bank_transactions ADD COLUMN reconciled_at     TEXT;
ALTER TABLE bank_transactions ADD COLUMN reconciled_type   TEXT;  -- 'invoice' | 'expense' | 'manual'
ALTER TABLE bank_transactions ADD COLUMN reconciled_ref_id TEXT;  -- invoice_id of expense_id

CREATE INDEX idx_bank_txn_reconciled ON bank_transactions(reconciled);
