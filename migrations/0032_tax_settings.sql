ALTER TABLE business_settings ADD COLUMN tax_name TEXT NOT NULL DEFAULT 'VAT';
ALTER TABLE business_settings ADD COLUMN default_tax_rate REAL NOT NULL DEFAULT 20.0;
ALTER TABLE business_settings ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR';
