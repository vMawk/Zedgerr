-- Factuurtype: zakelijk vs particulier (BTW-vrijgesteld).
ALTER TABLE invoices ADD COLUMN invoice_type TEXT NOT NULL DEFAULT 'business';

-- Privé-afzendergegevens voor particuliere facturen.
ALTER TABLE business_settings ADD COLUMN private_name TEXT;
ALTER TABLE business_settings ADD COLUMN private_street TEXT;
ALTER TABLE business_settings ADD COLUMN private_postal_code TEXT;
ALTER TABLE business_settings ADD COLUMN private_city TEXT;
ALTER TABLE business_settings ADD COLUMN private_country TEXT;
