-- Mileage log for business travel allowances.
CREATE TABLE mileage_entries (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  from_location TEXT,
  to_location TEXT,
  distance_km REAL NOT NULL,
  purpose TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_mileage_user_id ON mileage_entries(user_id);
CREATE INDEX idx_mileage_date ON mileage_entries(date);
