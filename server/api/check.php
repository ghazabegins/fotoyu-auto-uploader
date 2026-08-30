<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config.php';

$licenseKey = strtoupper(trim($_GET['license_key'] ?? $_POST['license_key'] ?? ''));
$hwid = trim($_GET['hwid'] ?? $_POST['hwid'] ?? '');

if (empty($licenseKey)) {
    echo json_encode([
        'valid' => false,
        'message' => 'Parameter missing.'
    ]);
    exit;
}

try {
    $pdo = getDBConnection();
    $stmt = $pdo->prepare("SELECT * FROM licenses WHERE license_key = ?");
    $stmt->execute([$licenseKey]);
    $license = $stmt->fetch();

    // 1. Key not found in Database -> Invalid
    if (!$license) {
        logServerTelemetry($pdo, $licenseKey, 'CHECK_LICENSE', 'ERROR', 'Pengecekan gagal: Master key tidak ditemukan', $hwid);
        echo json_encode([
            'valid' => false,
            'status' => 'not_found',
            'message' => 'License key not found.'
        ]);
        exit;
    }

    // 2. Status Revoked -> Invalid
    if ($license['status'] === 'revoked') {
        logServerTelemetry($pdo, $licenseKey, 'CHECK_LICENSE', 'ERROR', 'Pengecekan gagal: Lisensi diblokir Admin', $hwid);
        echo json_encode([
            'valid' => false,
            'status' => 'revoked',
            'message' => 'License revoked by administrator.'
        ]);
        exit;
    }

    // 3. HWID empty or status still 'active' (Belum Diaktifkan) -> Invalid until activated via activate.php!
    if (empty($license['hwid']) || $license['status'] === 'active') {
        logServerTelemetry($pdo, $licenseKey, 'CHECK_LICENSE', 'WARNING', 'Pengecekan: Lisensi belum terikat ke perangkat (Unbound)', $hwid);
        echo json_encode([
            'valid' => false,
            'status' => 'unbound',
            'message' => 'License key is not activated on any device yet.'
        ]);
        exit;
    }

    // 4. HWID mismatch -> Invalid
    if (!empty($hwid) && $license['hwid'] !== $hwid) {
        logServerTelemetry($pdo, $licenseKey, 'CHECK_LICENSE', 'WARNING', 'Pengecekan gagal: Perangkat HWID berbeda', $hwid);
        echo json_encode([
            'valid' => false,
            'status' => 'hwid_mismatch',
            'message' => 'License bound to another device.'
        ]);
        exit;
    }

    // 5. Expiration Check
    $expMeta = calculateLicenseExpiration($license['activated_at'], $license['duration_days'], $license['expires_at']);

    if ($expMeta['is_expired']) {
        $pdo->query("UPDATE licenses SET status = 'expired' WHERE id = " . (int)$license['id']);
        logServerTelemetry($pdo, $licenseKey, 'CHECK_LICENSE', 'ERROR', 'Pengecekan gagal: Masa aktif lisensi habis', $hwid);
        echo json_encode([
            'valid' => false,
            'status' => 'expired',
            'message' => 'License expired.'
        ]);
        exit;
    }

    // Update last check timestamp
    $pdo->query("UPDATE licenses SET last_check_at = NOW() WHERE id = " . (int)$license['id']);

    logServerTelemetry($pdo, $licenseKey, 'CHECK_LICENSE', 'SUCCESS', "Sync Lisensi & Kuota OK [Tier: " . strtoupper($license['plan_tier'] ?? 'pro') . "]", $hwid);

    echo json_encode([
        'valid' => true,
        'status' => $license['status'],
        'plan_tier' => $license['plan_tier'] ?? 'pro',
        'daily_limit' => (int)($license['daily_limit'] ?? 0),
        'buyer_name' => $license['buyer_name'],
        'duration_days' => (int)$license['duration_days'],
        'activated_at' => $license['activated_at'],
        'expires_at' => $license['expires_at'],
        'remaining_days' => $expMeta['remaining_days'],
        'is_lifetime' => $expMeta['is_lifetime'],
        'message' => 'License valid and active.'
    ]);
    exit;

} catch (Exception $e) {
    echo json_encode([
        'valid' => false,
        'message' => 'Server error: ' . $e->getMessage()
    ]);
    exit;
}
?>
