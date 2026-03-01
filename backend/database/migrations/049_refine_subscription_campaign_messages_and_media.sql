ALTER TABLE subscription_campaigns
  ADD COLUMN already_subscribed_message TEXT NULL AFTER success_message;

UPDATE subscription_campaigns
SET already_subscribed_message = 'Вы уже подписаны на канал. Нажмите кнопку проверки, если хотите получить награду.'
WHERE already_subscribed_message IS NULL OR TRIM(already_subscribed_message) = '';

ALTER TABLE subscription_campaigns
  MODIFY COLUMN already_subscribed_message TEXT NOT NULL;

UPDATE subscription_campaigns
SET media_type = NULL
WHERE media_type = 'video';

ALTER TABLE subscription_campaigns
  MODIFY COLUMN media_type ENUM('photo') COLLATE utf8mb4_unicode_ci DEFAULT NULL;
