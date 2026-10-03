-- Extra product fields: serial number, link, internal notes and tax settings.
ALTER TABLE company_products ADD COLUMN serial_number TEXT;
ALTER TABLE company_products ADD COLUMN url TEXT;
ALTER TABLE company_products ADD COLUMN internal_notes TEXT;
ALTER TABLE company_products ADD COLUMN price_includes_vat INTEGER NOT NULL DEFAULT 0;
ALTER TABLE company_products ADD COLUMN vat_percentage REAL NOT NULL DEFAULT 21;
