UPDATE `orders`
SET `comment` = `delivery_comment`
WHERE (`comment` IS NULL OR TRIM(`comment`) = '')
  AND `delivery_comment` IS NOT NULL
  AND TRIM(`delivery_comment`) <> '';

ALTER TABLE `orders`
DROP COLUMN `delivery_comment`;
