-- Diensten/catalogus: vaste bedragen om facturen op te baseren.
CREATE TABLE services (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_services_user_id ON services(user_id);
