<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config.php';

$rawBody = file_get_contents('php://input');
$data = json_decode($rawBody, true);

$licenseKey = strtoupper(trim($data['license_key'] ?? ''));
$hwid = trim($data['hwid'] ?? '');

if (empty($licenseKey) || empty($hwid)) {
    echo json_encode([
        'success' => false,
        'message' => 'Parameter Kode Lisensi atau Hardware ID (HWID) tidak lengkap.'
    ]);
    exit;
}

try {
    $pdo = getDBConnection();

    // 1. Fetch license details from database
    $stmt = $pdo->prepare("SELECT * FROM licenses WHERE license_key = ?");
    $stmt->execute([$licenseKey]);
    $license = $stmt->fetch();

    if (!$license) {
        logServerTelemetry($pdo, $licenseKey, 'ACTIVATION', 'ERROR', 'Kode lisensi tidak ditemukan di server', $hwid);
        echo json_encode([
            'success' => false,
            'message' => 'Kode Lisensi tidak ditemukan di Database Server Admin.'
        ]);
        exit;
    }

    if ($license['status'] === 'revoked') {
        logServerTelemetry($pdo, $licenseKey, 'ACTIVATION', 'ERROR', 'Upaya aktivasi lisensi terblokir (Revoked)', $hwid);
        echo json_encode([
            'success' => false,
            'message' => '⛔ GAGAL! Kode Lisensi ini telah DIBLOKIR oleh Admin.'
        ]);
        exit;
    }

    $durationDays = (int)($license['duration_days'] ?? 365);

    // 2. Expiration Check for already activated or existing license
    if (!empty($license['expires_at'])) {
        if (strtotime($license['expires_at']) < time()) {
            // Update status in DB to expired
            $updateExp = $pdo->prepare("UPDATE licenses SET status = 'expired' WHERE id = ?");
            $updateExp->execute([$license['id']]);

            $expDateFormatted = date('d M Y H:i', strtotime($license['expires_at']));
            logServerTelemetry($pdo, $licenseKey, 'ACTIVATION', 'ERROR', "Upaya aktivasi lisensi kedaluwarsa ({$expDateFormatted})", $hwid);
            echo json_encode([
                'success' => false,
                'status' => 'expired',
                'message' => "⚠️ GAGAL! Masa aktif Lisensi PRO Anda telah KEDALUWARSA pada {$expDateFormatted}. Silakan perpanjang ke Admin."
            ]);
            exit;
        }
    }

    // 3. HWID Binding & Activation Logic
    if (empty($license['hwid'])) {
        // FIRST ACTIVATION -> Bind HWID & Calculate Expiration Date
        $nowStr = date('Y-m-d H:i:s');
        $expiresAtStr = null;

        if ($durationDays > 0) {
            $expiresAtStr = date('Y-m-d H:i:s', strtotime("+{$durationDays} days"));
        }

        $updateStmt = $pdo->prepare("UPDATE licenses SET hwid = ?, status = 'used', activated_at = ?, expires_at = ?, last_check_at = ? WHERE id = ?");
        $updateStmt->execute([$hwid, $nowStr, $expiresAtStr, $nowStr, $license['id']]);

        $expMeta = calculateLicenseExpiration($nowStr, $durationDays, $expiresAtStr);

        logServerTelemetry($pdo, $licenseKey, 'ACTIVATION', 'SUCCESS', "Aktivasi Pertama Berhasil [Tier: " . strtoupper($license['plan_tier'] ?? 'pro') . "]", $hwid);

        echo json_encode([
            'success' => true,
            'message' => "🎉 Lisensi PRO Berhasil Diaktifkan & Terikat pada Perangkat Ini!",
            'license_key' => $licenseKey,
            'hwid' => $hwid,
            'plan_tier' => $license['plan_tier'] ?? 'pro',
            'daily_limit' => (int)($license['daily_limit'] ?? 0),
            'buyer_name' => $license['buyer_name'] ?? 'Member PRO',
            'duration_days' => $durationDays,
            'activated_at' => $nowStr,
            'expires_at' => $expiresAtStr,
            'remaining_days' => $expMeta['remaining_days'],
            'is_lifetime' => $expMeta['is_lifetime']
        ]);
        exit;

    } else if ($license['hwid'] === $hwid) {
        // RE-VERIFICATION ON BOUD DEVICE -> Update Last Check
        $updateStmt = $pdo->prepare("UPDATE licenses SET last_check_at = NOW() WHERE id = ?");
        $updateStmt->execute([$license['id']]);

        $expMeta = calculateLicenseExpiration($license['activated_at'], $durationDays, $license['expires_at']);

        if ($expMeta['is_expired']) {
            $pdo->query("UPDATE licenses SET status = 'expired' WHERE id = " . (int)$license['id']);
            logServerTelemetry($pdo, $licenseKey, 'CHECK_LICENSE', 'ERROR', 'Lisensi terverifikasi namun telah kedaluwarsa', $hwid);
            echo json_encode([
                'success' => false,
                'status' => 'expired',
                'message' => "⚠️ Masa aktif Lisensi PRO telah Kedaluwarsa pada " . date('d M Y', strtotime($license['expires_at']))
            ]);
            exit;
        }

        logServerTelemetry($pdo, $licenseKey, 'CHECK_LICENSE', 'SUCCESS', "Verifikasi Sesi Perangkat [Tier: " . strtoupper($license['plan_tier'] ?? 'pro') . "]", $hwid);

        echo json_encode([
            'success' => true,
            'message' => 'Lisensi PRO Terverifikasi Aktif pada Perangkat Ini.',
            'license_key' => $licenseKey,
            'hwid' => $hwid,
            'plan_tier' => $license['plan_tier'] ?? 'pro',
            'daily_limit' => (int)($license['daily_limit'] ?? 0),
            'buyer_name' => $license['buyer_name'] ?? 'Member PRO',
            'duration_days' => $durationDays,
            'activated_at' => $license['activated_at'],
            'expires_at' => $license['expires_at'],
            'remaining_days' => $expMeta['remaining_days'],
            'is_lifetime' => $expMeta['is_lifetime']
        ]);
        exit;

    } else {
        // HWID MISMATCH -> Reject activation on foreign hardware!
        logServerTelemetry($pdo, $licenseKey, 'ACTIVATION', 'WARNING', 'Gagal: Lisensi sudah terikat di perangkat/HWID lain', $hwid);
        echo json_encode([
            'success' => false,
            'message' => '⛔ GAGAL! Lisensi ini sudah terikat pada perangkat/komputer lain. Hubungi Admin jika Anda ingin memindahkan lisensi ke laptop baru (Unbind Device).'
        ]);
        exit;
    }

} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Server Error: ' . $e->getMessage()
    ]);
    exit;
}
?>
