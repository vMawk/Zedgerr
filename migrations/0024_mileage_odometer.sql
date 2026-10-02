ALTER TABLE mileage_entries ADD COLUMN odometer_start REAL;
ALTER TABLE mileage_entries ADD COLUMN odometer_end REAL;
ALTER TABLE mileage_entries ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0;
