ALTER TABLE orders
  ADD COLUMN user_timezone_offset INT DEFAULT 0 AFTER completed_at,
  ADD COLUMN auto_status_date DATE NULL AFTER user_timezone_offset;
