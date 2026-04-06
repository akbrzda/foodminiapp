CREATE TABLE IF NOT EXISTS tenants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(63) NOT NULL,
  db_name VARCHAR(96) NOT NULL,
  name VARCHAR(255) NOT NULL,
  status ENUM('trial', 'active', 'past_due', 'suspended', 'cancelled', 'deleted') NOT NULL DEFAULT 'trial',
  contact_email VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenants_slug (slug),
  UNIQUE KEY uq_tenants_db_name (db_name),
  CONSTRAINT chk_tenants_slug_format CHECK (
    slug REGEXP '^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])$'
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

