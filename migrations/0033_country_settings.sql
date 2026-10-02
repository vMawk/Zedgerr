ALTER TABLE business_settings ADD COLUMN country_code TEXT;
ALTER TABLE business_settings ADD COLUMN mileage_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE business_settings ADD COLUMN distance_unit TEXT NOT NULL DEFAULT 'km';
