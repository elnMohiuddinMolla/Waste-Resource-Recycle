-- ==============================================================================
-- Waste Resource Recycle (WRR) Management System
-- Database Schema: schema.sql
-- Target DBMS: MySQL 8.0+ or MariaDB 10.4+ (XAMPP)
-- Course: CSE-3112 Software Engineering Lab, Faridpur Engineering College
-- Team: MD Mohiuddin Molla (2022254878), Abdul Al Noman (935)
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS wrr_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE wrr_db;

-- Drop tables in reverse order of foreign key dependencies if re-running
DROP TABLE IF EXISTS support_tickets;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS reward_transactions;
DROP TABLE IF EXISTS cash_redemptions;
DROP TABLE IF EXISTS redemption_rules;
DROP TABLE IF EXISTS collection_records;
DROP TABLE IF EXISTS request_status_logs;
DROP TABLE IF EXISTS pickup_requests;
DROP TABLE IF EXISTS waste_categories;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS zones;

-- ------------------------------------------------------------------------------
-- 1. Table: zones
-- ------------------------------------------------------------------------------
CREATE TABLE zones (
  zone_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. Table: users
-- ------------------------------------------------------------------------------
CREATE TABLE users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  phone VARCHAR(20) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user','collector','admin') NOT NULL DEFAULT 'user',
  address VARCHAR(255),
  zone_id INT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (zone_id) REFERENCES zones(zone_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 3. Table: waste_categories
-- ------------------------------------------------------------------------------
CREATE TABLE waste_categories (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  points_per_kg DECIMAL(10,2) NOT NULL CHECK (points_per_kg >= 0),
  is_other BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 4. Table: pickup_requests
-- ------------------------------------------------------------------------------
CREATE TABLE pickup_requests (
  request_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  category_id INT NOT NULL,
  zone_id INT NOT NULL,
  collector_id INT NULL,
  pickup_address VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  other_description TEXT,
  photo_path VARCHAR(64) NULL, -- file name in backend/uploads/pickups (required for new requests)
  estimated_weight_kg DECIMAL(10,2) NOT NULL CHECK (estimated_weight_kg > 0),
  preferred_at DATETIME NOT NULL,
  status ENUM('Pending','Assigned','Accepted','Rejected','Collected','Completed','Cancelled')
         NOT NULL DEFAULT 'Pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (category_id) REFERENCES waste_categories(category_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (zone_id) REFERENCES zones(zone_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (collector_id) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_req_status (status),
  INDEX idx_req_collector (collector_id, status),
  INDEX idx_req_zone (zone_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 5. Table: request_status_logs
-- ------------------------------------------------------------------------------
CREATE TABLE request_status_logs (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  changed_by_id INT NOT NULL,
  old_status VARCHAR(20),
  new_status VARCHAR(20) NOT NULL,
  note VARCHAR(255),
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES pickup_requests(request_id) ON DELETE RESTRICT ON UPDATE CASCADE, -- audit rows are never deleted
  FOREIGN KEY (changed_by_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_log_timeline (request_id, changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 6. Table: collection_records
-- ------------------------------------------------------------------------------
CREATE TABLE collection_records (
  record_id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL UNIQUE,
  collector_id INT NOT NULL,
  actual_weight_kg DECIMAL(10,2) NOT NULL CHECK (actual_weight_kg > 0),
  points_per_kg_applied DECIMAL(10,2) NOT NULL,
  collected_at DATETIME NOT NULL,
  completed_at DATETIME NULL,
  remarks TEXT,
  FOREIGN KEY (request_id) REFERENCES pickup_requests(request_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (collector_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 7. Table: redemption_rules
-- ------------------------------------------------------------------------------
CREATE TABLE redemption_rules (
  rule_id INT AUTO_INCREMENT PRIMARY KEY,
  taka_per_point DECIMAL(10,4) NOT NULL CHECK (taka_per_point > 0),
  min_points DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (min_points >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by INT NOT NULL,
  effective_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- 1 for the active rule, NULL otherwise. UNIQUE allows many NULLs but only one 1,
  -- so the database itself guarantees a single active rule.
  active_key TINYINT GENERATED ALWAYS AS (IF(is_active, 1, NULL)) STORED,
  UNIQUE KEY uq_rule_single_active (active_key),
  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 8. Table: cash_redemptions
-- ------------------------------------------------------------------------------
CREATE TABLE cash_redemptions (
  redemption_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  rule_id INT NOT NULL,
  points_redeemed DECIMAL(10,2) NOT NULL CHECK (points_redeemed > 0),
  cash_amount DECIMAL(10,2) NOT NULL,
  payout_method VARCHAR(50) NOT NULL,
  payout_account VARCHAR(255) NOT NULL,
  payout_trx_id VARCHAR(100) NULL,
  status ENUM('Pending','Approved','Rejected','Paid') NOT NULL DEFAULT 'Pending',
  admin_id INT NULL,
  admin_note VARCHAR(255),
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (rule_id) REFERENCES redemption_rules(rule_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 9. Table: reward_transactions
-- ------------------------------------------------------------------------------
CREATE TABLE reward_transactions (
  transaction_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  txn_type ENUM('EARN','REDEEM','REFUND','ADJUST') NOT NULL,
  record_id INT NULL,
  redemption_id INT NULL,
  points DECIMAL(10,2) NOT NULL, -- positive = credit, negative = debit
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- record_id for EARN rows, NULL otherwise. UNIQUE = at most one EARN per collection record.
  earn_record_id INT GENERATED ALWAYS AS (IF(txn_type = 'EARN', record_id, NULL)) STORED,
  UNIQUE KEY uq_rt_one_earn (earn_record_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (record_id) REFERENCES collection_records(record_id) ON DELETE RESTRICT ON UPDATE RESTRICT, -- no CASCADE: record_id feeds a generated column
  FOREIGN KEY (redemption_id) REFERENCES cash_redemptions(redemption_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_rt_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 10. Table: notifications
-- ------------------------------------------------------------------------------
CREATE TABLE notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  request_id INT NULL,
  redemption_id INT NULL,
  type VARCHAR(50) NOT NULL,
  message VARCHAR(255) NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (request_id) REFERENCES pickup_requests(request_id) ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY (redemption_id) REFERENCES cash_redemptions(redemption_id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_notif_user (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

