<?php
// Database Auto-Setup Script for Localhost Testing
require_once __DIR__ . '/config.php';

try {
    // 1. Connect without DB selected to ensure DB exists
    $dsn = "mysql:host=" . DB_HOST . ";charset=utf8mb4";
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);

    $pdo->exec("CREATE DATABASE IF NOT EXISTS `" . DB_NAME . "` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    echo "Database `" . DB_NAME . "` created or verified successfully.<br>\n";

    // 2. Re-connect with DB selected
    $pdoDB = getDBConnection();

    // 3. Create or update table `licenses`
    $sql = "CREATE TABLE IF NOT EXISTS `licenses` (
      `id` INT AUTO_INCREMENT PRIMARY KEY,
      `license_key` VARCHAR(50) NOT NULL UNIQUE,
      `buyer_name` VARCHAR(100) DEFAULT NULL,
      `buyer_phone` VARCHAR(30) DEFAULT NULL,
      `hwid` VARCHAR(100) DEFAULT NULL,
      `status` ENUM('active', 'used', 'expired', 'revoked') NOT NULL DEFAULT 'active',
      `duration_days` INT NOT NULL DEFAULT 365,
      `activated_at` DATETIME DEFAULT NULL,
      `expires_at` DATETIME DEFAULT NULL,
      `last_check_at` DATETIME DEFAULT NULL,
      `notes` TEXT DEFAULT NULL,
      `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";

    $pdoDB->exec($sql);
    echo "Table `licenses` created or verified successfully.<br>\n";

    // Add missing columns if upgrading existing table
    $columns = $pdoDB->query("SHOW COLUMNS FROM `licenses`")->fetchAll(PDO::FETCH_COLUMN);

    if (!in_array('duration_days', $columns)) {
        $pdoDB->exec("ALTER TABLE `licenses` ADD COLUMN `duration_days` INT NOT NULL DEFAULT 365 AFTER `status`");
    }
    if (!in_array('expires_at', $columns)) {
        $pdoDB->exec("ALTER TABLE `licenses` ADD COLUMN `expires_at` DATETIME DEFAULT NULL AFTER `activated_at`");
    }
    if (!in_array('notes', $columns)) {
        $pdoDB->exec("ALTER TABLE `licenses` ADD COLUMN `notes` TEXT DEFAULT NULL AFTER `last_check_at`");
    }

    // Insert initial sample keys if empty
    $count = $pdoDB->query("SELECT COUNT(*) FROM licenses")->fetchColumn();
    if ($count == 0) {
        $sampleKeys = [
            ['PROTJP-FOTOYU-8888-9999', 'Demo Photographer 1 Tahun', '081234567890', 365],
            ['PROTJP-FOTOYU-3030-1111', 'Trial Photographer 30 Hari', '089876543210', 30],
            ['PROTJP-FOTOYU-9999-0000', 'VIP Photographer Lifetime', '085551234567', 0]
        ];

        $insertStmt = $pdoDB->prepare("INSERT IGNORE INTO licenses (license_key, buyer_name, buyer_phone, duration_days, status) VALUES (?, ?, ?, ?, 'active')");
        foreach ($sampleKeys as $k) {
            $insertStmt->execute($k);
        }
        echo "Inserted sample Master License keys.<br>\n";
    }

    echo "<strong>License Server Database Setup Complete!</strong><br>\n";

} catch (Exception $e) {
    echo "Setup Error: " . $e->getMessage() . "<br>\n";
}
?>
