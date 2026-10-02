-- One client portal account per company (email and password).
CREATE TABLE company_portal_users (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_company_portal_email ON company_portal_users(email);
