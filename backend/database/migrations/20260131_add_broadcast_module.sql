CREATE TABLE `broadcast_segments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `config` json NOT NULL,
  `estimated_size` int DEFAULT NULL,
  `estimated_at` timestamp NULL DEFAULT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_broadcast_segments_created_by` (`created_by`),
  KEY `idx_broadcast_segments_created_at` (`created_at`),
  CONSTRAINT `broadcast_segments_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `admin_users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `broadcast_campaigns` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `type` enum('manual','trigger') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('draft','scheduled','sending','completed','cancelled','failed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `trigger_type` enum('inactive_users','birthday','new_registration') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `trigger_config` json DEFAULT NULL,
  `segment_id` int DEFAULT NULL,
  `segment_config` json NOT NULL,
  `content_text` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `content_image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content_buttons` json DEFAULT NULL,
  `scheduled_at` timestamp NULL DEFAULT NULL,
  `use_user_timezone` tinyint(1) DEFAULT '1',
  `target_hour` int DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_by` int NOT NULL,
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_broadcast_campaigns_type` (`type`),
  KEY `idx_broadcast_campaigns_status` (`status`),
  KEY `idx_broadcast_campaigns_trigger_type` (`trigger_type`),
  KEY `idx_broadcast_campaigns_scheduled_at` (`scheduled_at`),
  KEY `idx_broadcast_campaigns_is_active` (`is_active`),
  KEY `idx_broadcast_campaigns_created_by` (`created_by`),
  KEY `idx_broadcast_campaigns_created_at` (`created_at`),
  KEY `idx_broadcast_campaigns_segment_id` (`segment_id`),
  CONSTRAINT `broadcast_campaigns_ibfk_1` FOREIGN KEY (`segment_id`) REFERENCES `broadcast_segments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `broadcast_campaigns_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `admin_users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `broadcast_messages` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `user_id` int NOT NULL,
  `status` enum('pending','sending','sent','failed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `telegram_message_id` bigint DEFAULT NULL,
  `personalized_text` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `scheduled_at` timestamp NULL DEFAULT NULL,
  `sent_at` timestamp NULL DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `retry_count` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_broadcast_messages_campaign_id` (`campaign_id`),
  KEY `idx_broadcast_messages_user_id` (`user_id`),
  KEY `idx_broadcast_messages_status` (`status`),
  KEY `idx_broadcast_messages_scheduled_at` (`scheduled_at`),
  KEY `idx_broadcast_messages_campaign_status` (`campaign_id`,`status`),
  KEY `idx_broadcast_messages_status_scheduled` (`status`,`scheduled_at`),
  KEY `idx_broadcast_messages_status_retry` (`status`,`retry_count`),
  CONSTRAINT `broadcast_messages_ibfk_1` FOREIGN KEY (`campaign_id`) REFERENCES `broadcast_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `broadcast_messages_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `broadcast_clicks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `message_id` bigint NOT NULL,
  `user_id` int NOT NULL,
  `button_index` int NOT NULL,
  `button_url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `clicked_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_broadcast_clicks` (`message_id`,`button_index`,`user_id`),
  KEY `idx_broadcast_clicks_campaign_id` (`campaign_id`),
  KEY `idx_broadcast_clicks_message_id` (`message_id`),
  KEY `idx_broadcast_clicks_user_id` (`user_id`),
  KEY `idx_broadcast_clicks_clicked_at` (`clicked_at`),
  CONSTRAINT `broadcast_clicks_ibfk_1` FOREIGN KEY (`campaign_id`) REFERENCES `broadcast_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `broadcast_clicks_ibfk_2` FOREIGN KEY (`message_id`) REFERENCES `broadcast_messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `broadcast_clicks_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `broadcast_conversions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `message_id` bigint NOT NULL,
  `user_id` int NOT NULL,
  `order_id` int NOT NULL,
  `order_total` decimal(10,2) NOT NULL,
  `order_created_at` timestamp NULL DEFAULT NULL,
  `days_after_broadcast` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_broadcast_conversions_order` (`order_id`),
  KEY `idx_broadcast_conversions_campaign_id` (`campaign_id`),
  KEY `idx_broadcast_conversions_message_id` (`message_id`),
  KEY `idx_broadcast_conversions_user_id` (`user_id`),
  KEY `idx_broadcast_conversions_order_id` (`order_id`),
  CONSTRAINT `broadcast_conversions_ibfk_1` FOREIGN KEY (`campaign_id`) REFERENCES `broadcast_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `broadcast_conversions_ibfk_2` FOREIGN KEY (`message_id`) REFERENCES `broadcast_messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `broadcast_conversions_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `broadcast_conversions_ibfk_4` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `broadcast_queue` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `message_id` bigint NOT NULL,
  `priority` int DEFAULT '0',
  `scheduled_at` timestamp NULL DEFAULT NULL,
  `locked_at` timestamp NULL DEFAULT NULL,
  `locked_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_broadcast_queue_message_id` (`message_id`),
  KEY `idx_broadcast_queue_schedule_lock` (`scheduled_at`,`locked_at`,`priority`),
  KEY `idx_broadcast_queue_locked_by` (`locked_by`),
  CONSTRAINT `broadcast_queue_ibfk_1` FOREIGN KEY (`message_id`) REFERENCES `broadcast_messages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `broadcast_stats` (
  `id` int NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `total_recipients` int DEFAULT '0',
  `sent_count` int DEFAULT '0',
  `failed_count` int DEFAULT '0',
  `click_count` int DEFAULT '0',
  `unique_clicks` int DEFAULT '0',
  `conversion_count` int DEFAULT '0',
  `conversion_amount` decimal(10,2) DEFAULT '0.00',
  `avg_send_time_seconds` int DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_broadcast_stats_campaign` (`campaign_id`),
  CONSTRAINT `broadcast_stats_ibfk_1` FOREIGN KEY (`campaign_id`) REFERENCES `broadcast_campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `broadcast_trigger_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `user_id` int NOT NULL,
  `trigger_date` date NOT NULL,
  `executed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_broadcast_trigger_log` (`campaign_id`,`user_id`,`trigger_date`),
  KEY `idx_broadcast_trigger_log_executed` (`executed_at`),
  CONSTRAINT `broadcast_trigger_log_ibfk_1` FOREIGN KEY (`campaign_id`) REFERENCES `broadcast_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `broadcast_trigger_log_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `users`
  ADD COLUMN `timezone` varchar(64) DEFAULT NULL AFTER `date_of_birth`;

CREATE INDEX `idx_users_timezone` ON `users` (`timezone`);

ALTER TABLE `cities`
  MODIFY COLUMN `timezone` varchar(64) DEFAULT 'Europe/Moscow';
