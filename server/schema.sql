-- Database Schema for FotoSync PRO License Management Server
-- Compatible with MySQL 5.7+ / MariaDB 10+ / cPanel phpMyAdmin

-- 1. Licenses Table
CREATE TABLE IF NOT EXISTS `licenses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `license_key` VARCHAR(50) NOT NULL UNIQUE,
  `buyer_name` VARCHAR(100) DEFAULT NULL,
  `buyer_phone` VARCHAR(30) DEFAULT NULL,
  `hwid` VARCHAR(100) DEFAULT NULL,
  `plan_tier` VARCHAR(20) NOT NULL DEFAULT '7_days',
  `daily_limit` INT NOT NULL DEFAULT 0,
  `status` ENUM('active', 'used', 'expired', 'revoked') NOT NULL DEFAULT 'active',
  `duration_days` INT NOT NULL DEFAULT 7,
  `activated_at` DATETIME DEFAULT NULL,
  `expires_at` DATETIME DEFAULT NULL,
  `last_check_at` DATETIME DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert Sample Master Keys
INSERT IGNORE INTO `licenses` (`license_key`, `buyer_name`, `buyer_phone`, `plan_tier`, `daily_limit`, `duration_days`, `status`) 
VALUES 
('DAY7-FOTOYU-8888-9999', 'Demo Photographer (7 Hari Pro)', '081234567890', '7_days', 0, 7, 'active'),
('DAY1-FOTOYU-5050-5050', 'Demo Photographer Express (1 Hari)', '081299998888', '1_day', 0, 1, 'active'),
('DAY30-FOTOYU-3030-3030', 'Demo Monthly Pro (30 Hari)', '081277776666', '30_days', 0, 30, 'active');

-- 2. Telemetry Request Logs Table
CREATE TABLE IF NOT EXISTS `telemetry_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `license_key` VARCHAR(100) DEFAULT NULL,
  `action_type` VARCHAR(50) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
  `message` TEXT DEFAULT NULL,
  `hwid` VARCHAR(255) DEFAULT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_license_key` (`license_key`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Admin Users Database Table
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(50) UNIQUE NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `name` VARCHAR(100) NOT NULL DEFAULT 'Administrator',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default Admin Account (Username: admin, Password: admin123)
INSERT IGNORE INTO `admin_users` (`username`, `password_hash`, `name`) 
VALUES ('admin', '$2y$10$CAiPiwDX36jW/bmrK/bSvusMGXFPjgGLyi3CO6RYeDb2p5N6N0B9a', 'Super Administrator');
