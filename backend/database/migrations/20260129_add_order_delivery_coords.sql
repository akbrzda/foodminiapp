ALTER TABLE orders
  ADD COLUMN delivery_latitude decimal(10,8) DEFAULT NULL AFTER delivery_address_id,
  ADD COLUMN delivery_longitude decimal(11,8) DEFAULT NULL AFTER delivery_latitude;
