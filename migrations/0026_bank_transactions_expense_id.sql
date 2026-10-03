ALTER TABLE bank_transactions ADD COLUMN expense_id TEXT REFERENCES expenses(id);
