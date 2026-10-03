-- Daily notes per user (autosaved).
CREATE TABLE daily_notes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  note_date TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX uq_daily_notes_user_date ON daily_notes(user_id, note_date);
CREATE INDEX idx_daily_notes_user ON daily_notes(user_id);
