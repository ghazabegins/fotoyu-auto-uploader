<?php
// Central License Server Configuration
// Localhost XAMPP & cPanel Hosting Compatibility

define('DB_HOST', 'localhost');
define('DB_NAME', 'fotoyu_licenses'); 
define('DB_USER', 'root');            
define('DB_PASS', '');                

// Secret Password for Admin Portal Dashboard
define('ADMIN_PASSWORD', 'admin123'); 

// Connect to Database via PDO
function getDBConnection($exitOnFailure = true) {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4";
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $e) {
            if (!$exitOnFailure) {
                return null;
            }
            header('Content-Type: application/json');
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Database Connection Failed: ' . $e->getMessage()
            ]);
            exit;
        }
    }
    return $pdo;
}

// Helper to format remaining days and expiration text
function calculateLicenseExpiration($activatedAt, $durationDays, $expiresAt = null) {
    if (empty($durationDays) || $durationDays <= 0) {
        return [
            'is_expired' => false,
            'is_lifetime' => true,
            'expires_at' => null,
            'remaining_days' => 'LIFETIME',
            'status_label' => 'PERMANEN (LIFETIME)'
        ];
    }

    $targetTime = null;
    if (!empty($expiresAt)) {
        $targetTime = strtotime($expiresAt);
    } else if (!empty($activatedAt)) {
        $targetTime = strtotime($activatedAt) + ($durationDays * 86400);
    }

    if (!$targetTime) {
        return [
            'is_expired' => false,
            'is_lifetime' => false,
            'expires_at' => null,
            'remaining_days' => $durationDays,
            'status_label' => "Belum Diaktifkan ({$durationDays} Hari)"
        ];
    }

    $now = time();
    $diffSeconds = $targetTime - $now;
    $remainingDays = ceil($diffSeconds / 86400);

    $formattedExpiresAt = date('Y-m-d H:i:s', $targetTime);

    if ($remainingDays <= 0) {
        return [
            'is_expired' => true,
            'is_lifetime' => false,
            'expires_at' => $formattedExpiresAt,
            'remaining_days' => 0,
            'status_label' => 'KEDALUWARSA'
        ];
    }

    return [
        'is_expired' => false,
        'is_lifetime' => false,
        'expires_at' => $formattedExpiresAt,
        'remaining_days' => (int)$remainingDays,
        'status_label' => "Sisa {$remainingDays} Hari"
    ];
}

// Auto-ensure telemetry_logs table exists
function ensureTelemetryLogsTable($pdo) {
    static $checked = false;
    if ($checked) return;
    try {
        $sql = "CREATE TABLE IF NOT EXISTS telemetry_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            license_key VARCHAR(100) NULL,
            action_type VARCHAR(50) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
            message TEXT NULL,
            hwid VARCHAR(255) NULL,
            ip_address VARCHAR(45) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_license_key (license_key),
            INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
        $pdo->exec($sql);
        $checked = true;
    } catch (Exception $e) {
        // Silent catch
    }
}

// Telemetry Logger Helper
function logServerTelemetry($pdo, $licenseKey, $actionType, $status = 'SUCCESS', $message = '', $hwid = null) {
    try {
        ensureTelemetryLogsTable($pdo);
        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $ip = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
        }

        $stmt = $pdo->prepare("INSERT INTO telemetry_logs (license_key, action_type, status, message, hwid, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $licenseKey ?: null,
            strtoupper($actionType),
            strtoupper($status),
            $message ?: null,
            $hwid ?: null,
            $ip,
            date('Y-m-d H:i:s')
        ]);
    } catch (Exception $e) {
        // Silent catch
    }
}

// Auto-ensure admin_users table exists, migrates role column, and seeds default admin account
function ensureAdminUsersTable($pdo) {
    static $checked = false;
    if ($checked) return;
    try {
        $sql = "CREATE TABLE IF NOT EXISTS admin_users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            name VARCHAR(100) NOT NULL DEFAULT 'Administrator',
            role VARCHAR(20) NOT NULL DEFAULT 'admin',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
        $pdo->exec($sql);

        // Auto-migrate role column if table was created previously without it
        try {
            $checkCol = $pdo->query("SHOW COLUMNS FROM admin_users LIKE 'role'")->fetchAll();
            if (empty($checkCol)) {
                $pdo->exec("ALTER TABLE admin_users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'admin' AFTER name");
            }
        } catch (Exception $e) {
            // Column might already exist
        }

        // Seed default admin if empty
        $count = (int)$pdo->query("SELECT COUNT(*) FROM admin_users")->fetchColumn();
        if ($count === 0) {
            $defaultPassHash = password_hash(ADMIN_PASSWORD, PASSWORD_BCRYPT);
            $stmt = $pdo->prepare("INSERT INTO admin_users (username, password_hash, name, role) VALUES (?, ?, ?, 'admin')");
            $stmt->execute(['admin', $defaultPassHash, 'Super Administrator']);
        }
        $checked = true;
    } catch (Exception $e) {
        // Silent catch
    }
}

// User Role Helper Functions
function getCurrentUserRole() {
    return $_SESSION['admin_role'] ?? 'admin';
}

function isAdmin() {
    return getCurrentUserRole() === 'admin';
}

function isStaff() {
    return getCurrentUserRole() === 'staff';
}
?>
