-- Business expenses and purchase invoices for tax returns and profit and loss.
CREATE TABLE expenses (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  supplier TEXT,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'overig',
  amount_excl_vat REAL NOT NULL,
  vat_percentage REAL NOT NULL DEFAULT 21,
  vat_amount REAL NOT NULL DEFAULT 0,
  amount_incl_vat REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_expenses_user_id ON expenses(user_id);
CREATE INDEX idx_expenses_date ON expenses(date);
