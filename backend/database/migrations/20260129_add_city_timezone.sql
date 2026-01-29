ALTER TABLE cities
  ADD COLUMN timezone varchar(64) DEFAULT 'UTC' AFTER longitude;
