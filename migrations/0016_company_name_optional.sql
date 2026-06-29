-- Bedrijfsnaam optioneel: klanten zonder naam worden gewoon als "Klant" weergegeven.
-- SQLite ondersteunt geen ALTER COLUMN, dus tabel opnieuw aanmaken.
PRAGMA foreign_keys = OFF;

CREATE TABLE companies_new (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  street TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT,
  kvk_number TEXT,
  btw_number TEXT,
  default_hourly_rate REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  advance_balance REAL NOT NULL DEFAULT 0,
  debt_to_client REAL NOT NULL DEFAULT 0
);

INSERT INTO companies_new SELECT * FROM companies;
DROP TABLE companies;
ALTER TABLE companies_new RENAME TO companies;

CREATE INDEX idx_companies_user_id ON companies(user_id);

PRAGMA foreign_keys = ON;
