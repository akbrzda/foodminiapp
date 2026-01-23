ALTER TABLE orders
  ADD COLUMN bonus_earned DECIMAL(10, 2) DEFAULT 0.00 AFTER bonus_used,
  ADD COLUMN bonus_earn_transaction_id INT NULL AFTER bonus_earned,
  ADD COLUMN bonus_spend_transaction_id INT NULL AFTER bonus_earn_transaction_id;

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  order_id INT NULL,
  type ENUM('earn', 'spend', 'refund', 'cancel_earn') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  balance_before DECIMAL(10, 2) NOT NULL,
  balance_after DECIMAL(10, 2) NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_loyalty_user (user_id),
  INDEX idx_loyalty_order (order_id),
  INDEX idx_loyalty_type (type),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;
