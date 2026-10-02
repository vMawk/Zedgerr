-- Products per client with their own sales and cost price.
CREATE TABLE company_products (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sale_price REAL NOT NULL,
  cost_price REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_company_products_company_id ON company_products(company_id);
CREATE INDEX idx_company_products_user_id ON company_products(user_id);
