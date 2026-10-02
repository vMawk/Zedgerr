-- Bank statement reconciliation
-- Adds reconciliation status to bank_transactions
-- and a bank_transaction_id link on invoices and expenses.

ALTER TABLE bank_transactions ADD COLUMN reconciled        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bank_transactions ADD COLUMN reconciled_at     TEXT;
ALTER TABLE bank_transactions ADD COLUMN reconciled_type   TEXT;  -- 'invoice' | 'expense' | 'manual'
ALTER TABLE bank_transactions ADD COLUMN reconciled_ref_id TEXT;  -- invoice_id of expense_id

CREATE INDEX idx_bank_txn_reconciled ON bank_transactions(reconciled);
