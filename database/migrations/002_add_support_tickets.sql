-- ==============================================================================
-- WRR migration 002 (PRD v1.5.0, FR-22): help and support tickets.
-- Run once on a database created before this change (e.g. an existing wrr_db).
-- New databases built from schema.sql already have the table.
-- ==============================================================================
USE wrr_db;
-- ------------------------------------------------------------------------------
-- 11. Table: support_tickets (PRD v1.5.0, FR-22)
-- A user or collector asks for help; an admin answers. Open -> Answered -> Closed.
-- ------------------------------------------------------------------------------
CREATE TABLE support_tickets (
  ticket_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  category ENUM('Pickup','Points','Redemption','Account','Other') NOT NULL,
  subject VARCHAR(120) NOT NULL,
  message TEXT NOT NULL,
  request_id INT NULL,
  redemption_id INT NULL,
  status ENUM('Open','Answered','Closed') NOT NULL DEFAULT 'Open',
  admin_reply TEXT NULL,
  admin_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  replied_at DATETIME NULL,
  closed_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (request_id) REFERENCES pickup_requests(request_id) ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY (redemption_id) REFERENCES cash_redemptions(redemption_id) ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_ticket_user (user_id, status),
  INDEX idx_ticket_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
