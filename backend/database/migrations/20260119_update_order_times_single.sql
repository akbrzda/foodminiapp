-- Collapse min/max order times into single values

ALTER TABLE branches
  ADD COLUMN prep_time INT DEFAULT 0 AFTER working_hours,
  ADD COLUMN assembly_time INT DEFAULT 0 AFTER prep_time;

UPDATE branches
  SET prep_time = COALESCE(prep_time_max, prep_time_min, 0),
      assembly_time = COALESCE(assembly_time_max, assembly_time_min, 0);

ALTER TABLE branches
  DROP COLUMN prep_time_min,
  DROP COLUMN prep_time_max,
  DROP COLUMN assembly_time_min,
  DROP COLUMN assembly_time_max;

ALTER TABLE delivery_polygons
  ADD COLUMN delivery_time INT DEFAULT 30 AFTER polygon;

UPDATE delivery_polygons
  SET delivery_time = COALESCE(delivery_time_max, delivery_time_min, 30);

ALTER TABLE delivery_polygons
  DROP COLUMN delivery_time_min,
  DROP COLUMN delivery_time_max;
