CREATE TABLE IF NOT EXISTS order_ratings (
  id INT NOT NULL AUTO_INCREMENT,
  order_id INT NOT NULL,
  user_id INT NOT NULL,
  rating TINYINT NOT NULL,
  comment TEXT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_order_ratings_order_user (order_id, user_id),
  KEY idx_order_ratings_user (user_id),
  KEY idx_order_ratings_rating (rating),
  KEY idx_order_ratings_created_at (created_at),
  CONSTRAINT order_ratings_ibfk_1 FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT order_ratings_ibfk_2 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_order_ratings_rating CHECK ((rating >= 1) AND (rating <= 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monthly_nps_surveys (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  survey_month DATE NOT NULL,
  score TINYINT NULL,
  comment TEXT NULL,
  notified_at TIMESTAMP NULL DEFAULT NULL,
  submitted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_monthly_nps_user_month (user_id, survey_month),
  KEY idx_monthly_nps_survey_month (survey_month),
  KEY idx_monthly_nps_score (score),
  KEY idx_monthly_nps_submitted_at (submitted_at),
  CONSTRAINT monthly_nps_surveys_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_monthly_nps_score CHECK (score IS NULL OR (score >= 0 AND score <= 10))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
