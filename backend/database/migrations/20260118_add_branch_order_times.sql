-- Add preparation and assembly times for branches
ALTER TABLE branches
  ADD COLUMN prep_time_min INT DEFAULT 0 AFTER working_hours,
  ADD COLUMN prep_time_max INT DEFAULT 0 AFTER prep_time_min,
  ADD COLUMN assembly_time_min INT DEFAULT 0 AFTER prep_time_max,
  ADD COLUMN assembly_time_max INT DEFAULT 0 AFTER assembly_time_min;
