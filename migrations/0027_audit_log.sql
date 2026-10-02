-- Audit log of every change to financial records.
-- user_id is set by the app, not a trigger, because triggers have no session context.
-- old_data and new_data hold JSON snapshots of the row before and after the change.

CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY NOT NULL,
  user_id     TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
  old_data    TEXT,   -- JSON
  new_data    TEXT,   -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_log_entity   ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_user_ts  ON audit_log(user_id, created_at);
