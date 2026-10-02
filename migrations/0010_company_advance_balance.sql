-- Available credit per client
ALTER TABLE companies ADD COLUMN advance_balance REAL NOT NULL DEFAULT 0;
