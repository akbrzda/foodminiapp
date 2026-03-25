CREATE TABLE stories_campaigns (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  placement ENUM('home') NOT NULL DEFAULT 'home',
  status ENUM('draft', 'active', 'paused', 'archived') NOT NULL DEFAULT 'draft',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  priority INT NOT NULL DEFAULT 0,
  cover_image_url VARCHAR(500) DEFAULT NULL,
  start_at TIMESTAMP NULL DEFAULT NULL,
  end_at TIMESTAMP NULL DEFAULT NULL,
  city_id INT DEFAULT NULL,
  branch_id INT DEFAULT NULL,
  segment_config JSON DEFAULT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stories_campaigns_status (status),
  KEY idx_stories_campaigns_placement_status (placement, status, is_active),
  KEY idx_stories_campaigns_dates (start_at, end_at),
  KEY idx_stories_campaigns_city_id (city_id),
  KEY idx_stories_campaigns_branch_id (branch_id),
  KEY idx_stories_campaigns_created_by (created_by),
  CONSTRAINT fk_stories_campaigns_city_id FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE SET NULL,
  CONSTRAINT fk_stories_campaigns_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_stories_campaigns_created_by FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stories_slides (
  id INT NOT NULL AUTO_INCREMENT,
  campaign_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  subtitle VARCHAR(500) DEFAULT NULL,
  media_url VARCHAR(500) NOT NULL,
  cta_text VARCHAR(120) DEFAULT NULL,
  cta_type ENUM('none', 'route', 'url', 'category', 'product', 'promo') NOT NULL DEFAULT 'none',
  cta_value VARCHAR(500) DEFAULT NULL,
  duration_seconds INT NOT NULL DEFAULT 6,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stories_slides_campaign_id (campaign_id),
  KEY idx_stories_slides_campaign_sort (campaign_id, sort_order, is_active),
  CONSTRAINT fk_stories_slides_campaign_id FOREIGN KEY (campaign_id) REFERENCES stories_campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stories_impressions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  campaign_id INT NOT NULL,
  slide_id INT DEFAULT NULL,
  user_id INT NOT NULL,
  placement ENUM('home') NOT NULL DEFAULT 'home',
  platform ENUM('telegram', 'max', 'unknown') NOT NULL DEFAULT 'unknown',
  viewed_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stories_impressions_campaign_id (campaign_id),
  KEY idx_stories_impressions_user_id (user_id),
  KEY idx_stories_impressions_campaign_user (campaign_id, user_id),
  KEY idx_stories_impressions_viewed_at (viewed_at),
  CONSTRAINT fk_stories_impressions_campaign_id FOREIGN KEY (campaign_id) REFERENCES stories_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_stories_impressions_slide_id FOREIGN KEY (slide_id) REFERENCES stories_slides(id) ON DELETE SET NULL,
  CONSTRAINT fk_stories_impressions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stories_clicks (
  id BIGINT NOT NULL AUTO_INCREMENT,
  campaign_id INT NOT NULL,
  slide_id INT DEFAULT NULL,
  user_id INT NOT NULL,
  placement ENUM('home') NOT NULL DEFAULT 'home',
  platform ENUM('telegram', 'max', 'unknown') NOT NULL DEFAULT 'unknown',
  cta_type ENUM('none', 'route', 'url', 'category', 'product', 'promo') NOT NULL DEFAULT 'none',
  cta_value VARCHAR(500) DEFAULT NULL,
  clicked_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stories_clicks_campaign_id (campaign_id),
  KEY idx_stories_clicks_user_id (user_id),
  KEY idx_stories_clicks_campaign_user (campaign_id, user_id),
  KEY idx_stories_clicks_clicked_at (clicked_at),
  CONSTRAINT fk_stories_clicks_campaign_id FOREIGN KEY (campaign_id) REFERENCES stories_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_stories_clicks_slide_id FOREIGN KEY (slide_id) REFERENCES stories_slides(id) ON DELETE SET NULL,
  CONSTRAINT fk_stories_clicks_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stories_user_state (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  campaign_id INT NOT NULL,
  last_slide_index INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  last_viewed_at TIMESTAMP NULL DEFAULT NULL,
  views_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stories_user_state (user_id, campaign_id),
  KEY idx_stories_user_state_campaign_id (campaign_id),
  KEY idx_stories_user_state_completed_at (completed_at),
  CONSTRAINT fk_stories_user_state_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_stories_user_state_campaign_id FOREIGN KEY (campaign_id) REFERENCES stories_campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO admin_permissions (code, module, action, description, is_active)
SELECT 'marketing.stories.manage', 'marketing', 'stories_manage', 'Управление stories-кампаниями', 1
WHERE NOT EXISTS (
  SELECT 1 FROM admin_permissions WHERE code = 'marketing.stories.manage'
);

INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM admin_roles r
JOIN admin_permissions p ON p.code = 'marketing.stories.manage'
WHERE r.code IN ('ceo', 'admin')
  AND NOT EXISTS (
    SELECT 1
    FROM admin_role_permissions arp
    WHERE arp.role_id = r.id
      AND arp.permission_id = p.id
  );
