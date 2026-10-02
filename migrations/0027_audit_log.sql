-- Audit log: registreert alle mutaties op financiële entiteiten.
-- user_id: wie de actie uitvoerde (app-level; niet via trigger omdat triggers geen session-context hebben).
-- old_data / new_data: JSON snapshot van de rij voor/na de mutatie.

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
