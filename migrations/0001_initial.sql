-- SQLite schema (TEXT ids are UUIDs).
-- Timestamps stored as ISO-8601 strings; booleans as INTEGER 0/1.

CREATE TABLE business_settings (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  company_name TEXT,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  street TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT,
  kvk_number TEXT,
  btw_number TEXT,
  iban TEXT,
  logo_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_business_settings_user_id ON business_settings(user_id);

CREATE TABLE companies (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  street TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT,
  kvk_number TEXT,
  btw_number TEXT,
  default_hourly_rate REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_companies_user_id ON companies(user_id);

CREATE TABLE quotes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_number TEXT NOT NULL,
  quote_date TEXT NOT NULL,
  valid_until TEXT,
  status TEXT NOT NULL,
  subtotal REAL NOT NULL,
  btw_percentage REAL NOT NULL,
  btw_amount REAL NOT NULL,
  total REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_quotes_user_id ON quotes(user_id);
CREATE INDEX idx_quotes_company_id ON quotes(company_id);

CREATE TABLE quote_lines (
  id TEXT PRIMARY KEY NOT NULL,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  hours REAL,
  hourly_rate REAL,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_quote_lines_quote_id ON quote_lines(quote_id);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL,
  subtotal REAL NOT NULL,
  btw_percentage REAL NOT NULL,
  btw_amount REAL NOT NULL,
  total REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_invoices_user_id ON invoices(user_id);
CREATE INDEX idx_invoices_company_id ON invoices(company_id);

CREATE TABLE time_entries (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  hours REAL NOT NULL,
  hourly_rate REAL,
  description TEXT,
  invoiced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX idx_time_entries_company_id ON time_entries(company_id);
CREATE INDEX idx_time_entries_invoice_id ON time_entries(invoice_id);

CREATE TABLE invoice_lines (
  id TEXT PRIMARY KEY NOT NULL,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  time_entry_id TEXT REFERENCES time_entries(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  date TEXT,
  hours REAL,
  hourly_rate REAL,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_invoice_lines_invoice_id ON invoice_lines(invoice_id);
CREATE INDEX idx_invoice_lines_time_entry_id ON invoice_lines(time_entry_id);
