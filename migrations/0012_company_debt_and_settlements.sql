-- Schuld aan klant (bedrag dat jij de klant verschuldigd bent) + verrekening via uren
ALTER TABLE companies ADD COLUMN debt_to_client REAL NOT NULL DEFAULT 0;

CREATE TABLE debt_settlements (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  total_amount REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_debt_settlements_user_id ON debt_settlements(user_id);
CREATE INDEX idx_debt_settlements_company_id ON debt_settlements(company_id);

ALTER TABLE time_entries ADD COLUMN debt_settlement_id TEXT REFERENCES debt_settlements(id) ON DELETE SET NULL;

CREATE INDEX idx_time_entries_debt_settlement_id ON time_entries(debt_settlement_id);
