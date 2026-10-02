-- SMTP configuration for sending invite emails and notifications.
CREATE TABLE IF NOT EXISTS smtp_settings (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  host        TEXT NOT NULL DEFAULT '',
  port        INTEGER NOT NULL DEFAULT 587,
  secure      INTEGER NOT NULL DEFAULT 0,
  username    TEXT NOT NULL DEFAULT '',
  password    TEXT NOT NULL DEFAULT '',
  from_name   TEXT NOT NULL DEFAULT '',
  from_email  TEXT NOT NULL DEFAULT '',
  base_url    TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
