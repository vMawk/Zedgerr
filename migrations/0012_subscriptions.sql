CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'prive',
  contract_number TEXT,
  amount REAL NOT NULL DEFAULT 0,
  billing_cycle TEXT NOT NULL DEFAULT 'maandelijks',
  payment_method TEXT,
  contract_end_date TEXT,
  next_payment_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
