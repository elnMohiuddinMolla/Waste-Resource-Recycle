-- ==============================================================================
-- Waste Resource Recycle (WRR) Management System
-- Database Seed Data: seed.sql
-- Target DBMS: MySQL 8.0+ or MariaDB 10.4+ (XAMPP)
-- Course: CSE-3112 Software Engineering Lab, Faridpur Engineering College
-- Team: MD Mohiuddin Molla (2022254878), Abdul Al Noman (935)
-- ==============================================================================

USE wrr_db;

-- ------------------------------------------------------------------------------
-- 1. Seed Zones (Faridpur Municipal Area Example Zones)
-- ------------------------------------------------------------------------------
INSERT INTO zones (zone_id, name, description, is_active) VALUES
(1, 'Zone 1 - Baitul Aman', 'Covers Baitul Aman, Engineering College, and surrounding residential areas', TRUE),
(2, 'Zone 2 - Goalchamot', 'Covers Goalchamot, Old Bus Stand, and commercial hubs', TRUE),
(3, 'Zone 3 - Jhiltuly', 'Covers Jhiltuly, Court Area, and central residential neighborhoods', TRUE),
(4, 'Zone 4 - Aliabad', 'Covers Aliabad and peripheral residential/suburban areas', TRUE);

-- ------------------------------------------------------------------------------
-- 2. Seed Waste Categories (Per Proposal & Specification)
-- ------------------------------------------------------------------------------
INSERT INTO waste_categories (category_id, name, points_per_kg, is_other, is_active) VALUES
(1, 'Plastic', 10.00, FALSE, TRUE),
(2, 'Paper & Cardboard', 6.00, FALSE, TRUE),
(3, 'E-waste', 25.00, FALSE, TRUE),
(4, 'Metal', 15.00, FALSE, TRUE),
(5, 'Glass', 4.00, FALSE, TRUE),
(6, 'Other Recyclable Waste', 5.00, TRUE, TRUE);

-- ------------------------------------------------------------------------------
-- 3. Seed Users
-- Password for all seed accounts is: "password123"
-- Verified Bcrypt Hash (cost factor 10): $2a$10$avkNZrMj9vCRN098yEawa.vABOB4ZLk0Q9Bqz/LCfZj/qhojigwgG
-- ------------------------------------------------------------------------------
INSERT INTO users (user_id, full_name, email, phone, password_hash, role, address, zone_id, status) VALUES
(1, 'System Administrator', 'admin@wrr.com', '01711000001', '$2a$10$avkNZrMj9vCRN098yEawa.vABOB4ZLk0Q9Bqz/LCfZj/qhojigwgG', 'admin', 'WRR Operations Center, Faridpur', 3, 'active'),
(2, 'Rafiqul Islam', 'collector1@wrr.com', '01711000002', '$2a$10$avkNZrMj9vCRN098yEawa.vABOB4ZLk0Q9Bqz/LCfZj/qhojigwgG', 'collector', 'Baitul Aman, Faridpur', 1, 'active'),
(3, 'Kamal Hossain', 'collector2@wrr.com', '01711000003', '$2a$10$avkNZrMj9vCRN098yEawa.vABOB4ZLk0Q9Bqz/LCfZj/qhojigwgG', 'collector', 'Goalchamot, Faridpur', 2, 'active'),
(4, 'Tanvir Ahmed', 'tanvir@gmail.com', '01811000004', '$2a$10$avkNZrMj9vCRN098yEawa.vABOB4ZLk0Q9Bqz/LCfZj/qhojigwgG', 'user', 'House 14, Road 2, Baitul Aman', 1, 'active'),
(5, 'Sadia Sultana', 'sadia@gmail.com', '01811000005', '$2a$10$avkNZrMj9vCRN098yEawa.vABOB4ZLk0Q9Bqz/LCfZj/qhojigwgG', 'user', 'Apartment 4B, Green View, Jhiltuly', 3, 'active');

-- ------------------------------------------------------------------------------
-- 4. Seed Redemption Rules (Active Rule)
-- Rate: 1 Point = 0.50 BDT, Min Points for Redemption = 100 Points (50 BDT)
-- ------------------------------------------------------------------------------
INSERT INTO redemption_rules (rule_id, taka_per_point, min_points, is_active, updated_by, effective_from) VALUES
(1, 0.5000, 100.00, TRUE, 1, CURRENT_TIMESTAMP);

-- ------------------------------------------------------------------------------
-- 5. Seed Pickup Requests (Demonstrating Full Lifecycle States)
-- ------------------------------------------------------------------------------
INSERT INTO pickup_requests (request_id, user_id, category_id, zone_id, collector_id, pickup_address, contact_phone, other_description, estimated_weight_kg, preferred_at, status, created_at) VALUES
(1, 4, 1, 1, 2, 'House 14, Road 2, Baitul Aman', '01811000004', NULL, 15.00, '2026-11-10 11:00:00', 'Completed', '2026-11-10 09:00:00'),
(2, 4, 2, 1, 2, 'House 14, Road 2, Baitul Aman', '01811000004', NULL, 20.00, '2026-11-13 14:00:00', 'Accepted', '2026-11-11 08:30:00'),
(3, 5, 3, 3, NULL, 'Apartment 4B, Green View, Jhiltuly', '01811000005', NULL, 5.00, '2026-11-14 11:00:00', 'Pending', '2026-11-11 12:00:00');

-- ------------------------------------------------------------------------------
-- 6. Seed Request Status Logs
-- ------------------------------------------------------------------------------
INSERT INTO request_status_logs (log_id, request_id, changed_by_id, old_status, new_status, note, changed_at) VALUES
(1, 1, 4, NULL, 'Pending', 'User submitted request', '2026-11-10 09:00:00'),
(2, 1, 1, 'Pending', 'Assigned', 'Assigned to Rafiqul Islam', '2026-11-10 09:30:00'),
(3, 1, 2, 'Assigned', 'Accepted', 'Accepted by collector', '2026-11-10 09:45:00'),
(4, 1, 2, 'Accepted', 'Collected', 'Weighed 15.5 kg on certified scale', '2026-11-10 11:00:00'),
(5, 1, 2, 'Collected', 'Completed', 'Collection completed and reward points posted', '2026-11-10 11:05:00'),
(6, 2, 4, NULL, 'Pending', 'User submitted request', '2026-11-11 08:30:00'),
(7, 2, 1, 'Pending', 'Assigned', 'Assigned to Rafiqul Islam', '2026-11-11 09:00:00'),
(8, 2, 2, 'Assigned', 'Accepted', 'Accepted by collector', '2026-11-11 09:20:00'),
(9, 3, 5, NULL, 'Pending', 'User submitted request', '2026-11-11 12:00:00');

-- ------------------------------------------------------------------------------
-- 7. Seed Collection Records
-- ------------------------------------------------------------------------------
INSERT INTO collection_records (record_id, request_id, collector_id, actual_weight_kg, points_per_kg_applied, collected_at, completed_at, remarks) VALUES
(1, 1, 2, 15.50, 10.00, '2026-11-10 11:00:00', '2026-11-10 11:05:00', 'Clean PET bottles, verified scale');

-- ------------------------------------------------------------------------------
-- 8. Seed Reward Transactions Ledger
-- ------------------------------------------------------------------------------
INSERT INTO reward_transactions (transaction_id, user_id, txn_type, record_id, redemption_id, points, created_at) VALUES
(1, 4, 'EARN', 1, NULL, 155.00, '2026-11-10 11:05:00');

-- ------------------------------------------------------------------------------
-- 9. Seed Cash Redemptions
-- ------------------------------------------------------------------------------
INSERT INTO cash_redemptions (redemption_id, user_id, rule_id, points_redeemed, cash_amount, payout_method, payout_account, payout_trx_id, status, admin_id, admin_note, requested_at, processed_at) VALUES
(1, 4, 1, 100.00, 50.00, 'bKash', '01811000004', 'BK99X8877A', 'Paid', 1, 'Disbursed via bKash merchant payout', '2026-11-10 14:00:00', '2026-11-10 15:30:00');

-- Additional Ledger entry locking the 100 points
INSERT INTO reward_transactions (transaction_id, user_id, txn_type, record_id, redemption_id, points, created_at) VALUES
(2, 4, 'REDEEM', NULL, 1, -100.00, '2026-11-10 14:00:00');

-- ------------------------------------------------------------------------------
-- 10. Seed Notifications
-- ------------------------------------------------------------------------------
INSERT INTO notifications (notification_id, user_id, request_id, redemption_id, type, message, is_read, created_at) VALUES
(1, 4, 1, NULL, 'PICKUP_COMPLETED', 'Pickup #1 completed! 15.50 kg Plastic earned you 155.00 points.', TRUE, '2026-11-10 11:05:00'),
(2, 4, NULL, 1, 'REDEMPTION_PAID', 'Your redemption of 50.00 BDT via bKash has been paid! TrxID: BK99X8877A', FALSE, '2026-11-10 15:30:00');
