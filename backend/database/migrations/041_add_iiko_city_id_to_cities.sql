ALTER TABLE cities
  ADD COLUMN iiko_city_id VARCHAR(255) NULL AFTER name,
  ADD KEY idx_cities_iiko_city_id (iiko_city_id);
