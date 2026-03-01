ALTER TABLE users
  ADD COLUMN registration_type ENUM('bot_only', 'miniapp') NOT NULL DEFAULT 'bot_only' AFTER telegram_id,
  ADD COLUMN bot_registered_at TIMESTAMP NULL DEFAULT NULL AFTER registration_type,
  ADD INDEX idx_users_registration_type (registration_type);

ALTER TABLE broadcast_campaigns
  MODIFY COLUMN type ENUM('manual', 'trigger', 'subscription_campaign') COLLATE utf8mb4_unicode_ci NOT NULL;

CREATE TABLE IF NOT EXISTS subscription_campaigns (
  id INT NOT NULL AUTO_INCREMENT,
  tag VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  channel_id VARCHAR(100) NOT NULL,
  channel_url VARCHAR(255) NOT NULL,
  welcome_message TEXT NOT NULL,
  success_message TEXT NOT NULL,
  error_message TEXT NOT NULL,
  media_type ENUM('photo', 'video') DEFAULT NULL,
  media_url VARCHAR(500) DEFAULT NULL,
  is_reward_unique TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_perpetual TINYINT(1) NOT NULL DEFAULT 0,
  start_date TIMESTAMP NULL DEFAULT NULL,
  end_date TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subscription_campaigns_tag (tag),
  KEY idx_subscription_campaigns_active_dates (is_active, start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscription_attempts (
  id INT NOT NULL AUTO_INCREMENT,
  campaign_id INT NOT NULL,
  user_id INT NOT NULL,
  telegram_id BIGINT NOT NULL,
  first_click_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  last_check_at TIMESTAMP NULL DEFAULT NULL,
  first_subscribed_at TIMESTAMP NULL DEFAULT NULL,
  last_reward_claimed_at TIMESTAMP NULL DEFAULT NULL,
  attempts_count INT NOT NULL DEFAULT 1,
  rewards_claimed_count INT NOT NULL DEFAULT 0,
  is_currently_subscribed TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_subscription_attempts_campaign_user (campaign_id, user_id),
  KEY idx_subscription_attempts_telegram_id (telegram_id),
  KEY idx_subscription_attempts_campaign_subscribed (campaign_id, is_currently_subscribed),
  KEY idx_subscription_attempts_campaign_first_subscribed (campaign_id, first_subscribed_at),
  CONSTRAINT fk_subscription_attempts_campaign
    FOREIGN KEY (campaign_id) REFERENCES subscription_campaigns (id) ON DELETE CASCADE,
  CONSTRAINT fk_subscription_attempts_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
