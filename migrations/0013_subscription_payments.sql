CREATE TABLE IF NOT EXISTS subscription_payments (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  period_date TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sub_payments_sub_id ON subscription_payments(subscription_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_payments_unique ON subscription_payments(subscription_id, period_date);
