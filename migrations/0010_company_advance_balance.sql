-- Beschikbaar voorschot op klantniveau
ALTER TABLE companies ADD COLUMN advance_balance REAL NOT NULL DEFAULT 0;
