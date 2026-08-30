<?php
session_start();
require_once __DIR__ . '/../config.php';

$pdo = getDBConnection();
ensureAdminUsersTable($pdo);

// Login Session Check (Database Driven with Username + Password)
if (isset($_POST['admin_pass'])) {
    $userIn = trim($_POST['admin_user'] ?? 'admin');
    $passIn = trim($_POST['admin_pass'] ?? '');

    $stmt = $pdo->prepare("SELECT * FROM admin_users WHERE username = ?");
    $stmt->execute([$userIn]);
    $userRow = $stmt->fetch();

    if ($userRow && password_verify($passIn, $userRow['password_hash'])) {
        $_SESSION['admin_auth'] = true;
        $_SESSION['admin_username'] = $userRow['username'];
        $_SESSION['admin_name'] = $userRow['name'];
        header('Location: index.php');
        exit;
    } else if (($userIn === 'admin' || empty($userIn)) && $passIn === ADMIN_PASSWORD) {
        $_SESSION['admin_auth'] = true;
        $_SESSION['admin_username'] = 'admin';
        $_SESSION['admin_name'] = 'Super Administrator';
        header('Location: index.php');
        exit;
    } else {
        $error_msg = "Username atau Kata Sandi Admin Salah!";
    }
}

if (isset($_GET['logout'])) {
    unset($_SESSION['admin_auth']);
    unset($_SESSION['admin_username']);
    unset($_SESSION['admin_name']);
    header('Location: index.php');
    exit;
}

$isLoggedIn = isset($_SESSION['admin_auth']) && $_SESSION['admin_auth'] === true;
$currentTab = $_GET['tab'] ?? 'licenses';
$adminDisplayName = $_SESSION['admin_name'] ?? 'Administrator Server';

// Action Handlers
if ($isLoggedIn) {
    if (isset($_POST['action'])) {
        $act = $_POST['action'];

        // 1. Generate New License
        if ($act === 'generate') {
            $buyerName = trim($_POST['buyer_name'] ?? 'Member');
            $buyerPhone = trim($_POST['buyer_phone'] ?? '');
            $planTier = $_POST['plan_tier'] ?? '7_days';
            $durationPreset = $_POST['duration_days_preset'] ?? 'auto';
            
            $dailyLimit = 0;
            $prefix = "PROTJP";
            $autoDays = 7;

            if ($planTier === '1_day') {
                $prefix = "DAY1";
                $autoDays = 1;
            } else if ($planTier === '7_days') {
                $prefix = "DAY7";
                $autoDays = 7;
            } else if ($planTier === '30_days') {
                $prefix = "DAY30";
                $autoDays = 30;
            } else if ($planTier === 'free') {
                $prefix = "FREE";
                $dailyLimit = 20;
                $autoDays = 1;
            }

            if ($durationPreset === 'auto') {
                $durationDays = $autoDays;
            } else if ($durationPreset === 'custom') {
                $durationDays = max(0, (int)($_POST['custom_duration'] ?? 30));
            } else {
                $durationDays = (int)$durationPreset;
            }

            $notes = trim($_POST['notes'] ?? '');

            // Format Key: [PREFIX]-FOTOYU-XXXX-YYYY
            $rand1 = str_pad(mt_rand(1000, 9999), 4, '0', STR_PAD_LEFT);
            $rand2 = str_pad(mt_rand(1000, 9999), 4, '0', STR_PAD_LEFT);
            $newKey = "{$prefix}-FOTOYU-{$rand1}-{$rand2}";

            $stmt = $pdo->prepare("INSERT INTO licenses (license_key, buyer_name, buyer_phone, plan_tier, daily_limit, duration_days, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')");
            $stmt->execute([$newKey, $buyerName, $buyerPhone, $planTier, $dailyLimit, $durationDays, $notes]);

            $durText = $durationDays == 0 ? "Lifetime (Selamanya)" : "{$durationDays} Hari";
            $planLabel = strtoupper($planTier);
            $success_msg = "🎉 Master Key [{$planLabel}] Berhasil Dibuat: <strong style='font-family: var(--font-mono); color: var(--primary-blue-dark);'>{$newKey}</strong> (Masa Aktif: {$durText}, Kuota: UNLIMITED Foto)";
        }

        // 2. Unbind Device HWID
        if ($act === 'unbind' && !empty($_POST['license_id'])) {
            $stmt = $pdo->prepare("UPDATE licenses SET hwid = NULL, status = 'active' WHERE id = ?");
            $stmt->execute([$_POST['license_id']]);
            $success_msg = "Device HWID berhasil di-reset (Unbind). Member kini dapat mengaktifkan lisensi di komputer/laptop baru.";
        }

        // 3. Extend Duration
        if ($act === 'extend' && !empty($_POST['license_id'])) {
            $licId = (int)$_POST['license_id'];
            $addDays = (int)($_POST['extend_days'] ?? 30);

            $stmt = $pdo->prepare("SELECT * FROM licenses WHERE id = ?");
            $stmt->execute([$licId]);
            $lic = $stmt->fetch();

            if ($lic) {
                if ($addDays == 0) {
                    // Convert to Lifetime
                    $updateStmt = $pdo->prepare("UPDATE licenses SET duration_days = 0, expires_at = NULL, status = IF(hwid IS NULL, 'active', 'used') WHERE id = ?");
                    $updateStmt->execute([$licId]);
                    $success_msg = "Durasi Lisensi #{$licId} berhasil diubah menjadi <strong>LIFETIME (Permanen)</strong>.";
                } else {
                    $newDuration = max(1, (int)$lic['duration_days'] + $addDays);
                    $newExpiresAt = null;

                    if (!empty($lic['expires_at'])) {
                        $baseTime = max(time(), strtotime($lic['expires_at']));
                        $newExpiresAt = date('Y-m-d H:i:s', $baseTime + ($addDays * 86400));
                    }

                    $updateStmt = $pdo->prepare("UPDATE licenses SET duration_days = ?, expires_at = ?, status = IF(hwid IS NULL, 'active', 'used') WHERE id = ?");
                    $updateStmt->execute([$newDuration, $newExpiresAt, $licId]);
                    $success_msg = "Masa aktif Lisensi #{$licId} berhasil diperpanjang +{$addDays} Hari.";
                }
            }
        }

        // 4. Revoke / Block License
        if ($act === 'revoke' && !empty($_POST['license_id'])) {
            $stmt = $pdo->prepare("UPDATE licenses SET status = 'revoked' WHERE id = ?");
            $stmt->execute([$_POST['license_id']]);
            $warn_msg = "Lisensi ID #{$_POST['license_id']} telah DIBLOKIR (Revoked).";
        }

        // 5. Reactivate / Unblock License
        if ($act === 'reactivate' && !empty($_POST['license_id'])) {
            $stmt = $pdo->prepare("UPDATE licenses SET status = IF(hwid IS NULL, 'active', 'used') WHERE id = ?");
            $stmt->execute([$_POST['license_id']]);
            $success_msg = "Lisensi ID #{$_POST['license_id']} berhasil diaktifkan kembali.";
        }

        // 6. Delete License
        if ($act === 'delete' && !empty($_POST['license_id'])) {
            $stmt = $pdo->prepare("DELETE FROM licenses WHERE id = ?");
            $stmt->execute([$_POST['license_id']]);
            $warn_msg = "Lisensi ID #{$_POST['license_id']} telah dihapus dari database.";
        }

        // 7. Update App Version Config (Multi-Platform Windows & macOS)
        if ($act === 'save_version') {
            $latestVer = trim($_POST['latest_version'] ?? '1.0.0');
            $minReqVer = trim($_POST['min_required_version'] ?? '1.0.0');
            $winDownloadUrl = trim($_POST['windows_download_url'] ?? $_POST['download_url'] ?? '');
            $macDownloadUrl = trim($_POST['mac_download_url'] ?? '');
            $releaseNotes = trim($_POST['release_notes'] ?? '');
            $isMandatory = isset($_POST['is_mandatory']) && $_POST['is_mandatory'] == '1';

            if (empty($macDownloadUrl) && !empty($winDownloadUrl)) {
                $macDownloadUrl = str_replace('.exe', '.dmg', $winDownloadUrl);
            }

            $versionData = [
                'success' => true,
                'latest_version' => $latestVer,
                'min_required_version' => $minReqVer,
                'download_url' => $winDownloadUrl,
                'windows_download_url' => $winDownloadUrl,
                'mac_download_url' => $macDownloadUrl,
                'release_notes' => $releaseNotes,
                'is_mandatory' => $isMandatory,
                'updated_at' => date('Y-m-d H:i:s')
            ];

            $configDir = __DIR__ . '/../data';
            if (!is_dir($configDir)) {
                @mkdir($configDir, 0777, true);
            }
            file_put_contents($configDir . '/version_config.json', json_encode($versionData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

            $success_msg = "🚀 Pengaturan Versi Multi-Platform (Windows & macOS) Berhasil Diperbarui ke <strong>v{$latestVer}</strong>!";
        }

        // 8. Clear Telemetry Logs
        if ($act === 'clear_logs') {
            ensureTelemetryLogsTable($pdo);
            $pdo->exec("TRUNCATE TABLE telemetry_logs");
            $success_msg = "🧹 Seluruh Riwayat Server Telemetry Log Berhasil Dibersihkan!";
        }
    }

    // Read Current App Version Config
    $versionConfigFile = __DIR__ . '/../data/version_config.json';
    $defaultWin = 'http://localhost/photoculler/SOFTWARE%20FOTOYU%20UPLOADER/downloads/FotoSync-Setup-Latest.exe';
    $defaultMac = 'http://localhost/photoculler/SOFTWARE%20FOTOYU%20UPLOADER/downloads/FotoSync-Setup-Latest.dmg';
    $versionConfig = [
        'latest_version' => '1.0.0',
        'min_required_version' => '1.0.0',
        'download_url' => $defaultWin,
        'windows_download_url' => $defaultWin,
        'mac_download_url' => $defaultMac,
        'release_notes' => "• Penambahan sistem kuota 3 tier (Free 20, Premium 500, Pro Unlimited)\n• Integrasi Kontak Admin WhatsApp Official\n• Peningkatan sistem auto-sync & penanganan kuota harian real-time",
        'is_mandatory' => false
    ];
    if (file_exists($versionConfigFile)) {
        $loadedVer = json_decode(file_get_contents($versionConfigFile), true);
        if ($loadedVer && is_array($loadedVer)) {
            $versionConfig = array_merge($versionConfig, $loadedVer);
            if (empty($versionConfig['windows_download_url']) && !empty($versionConfig['download_url'])) {
                $versionConfig['windows_download_url'] = $versionConfig['download_url'];
            }
            if (empty($versionConfig['mac_download_url'])) {
                $versionConfig['mac_download_url'] = str_replace('.exe', '.dmg', $versionConfig['windows_download_url']);
            }
        }
    }

    // Read Telemetry Logs if on telemetry tab
    $telemetryLogs = [];
    $telemetryStats = ['total' => 0, 'success' => 0, 'warning' => 0, 'error' => 0];
    if ($currentTab === 'telemetry') {
        ensureTelemetryLogsTable($pdo);
        $telemetryLogs = $pdo->query("SELECT * FROM telemetry_logs ORDER BY id DESC LIMIT 250")->fetchAll();
        $telemetryStats['total'] = count($telemetryLogs);
        foreach ($telemetryLogs as $logItem) {
            if ($logItem['status'] === 'SUCCESS') $telemetryStats['success']++;
            else if ($logItem['status'] === 'WARNING') $telemetryStats['warning']++;
            else if ($logItem['status'] === 'ERROR') $telemetryStats['error']++;
        }
    }

    // Fetch All Licenses
    $licensesRaw = $pdo->query("SELECT * FROM licenses ORDER BY id DESC")->fetchAll();
    $licenses = [];

    $stats = [
        'total' => count($licensesRaw),
        'active' => 0,
        'used' => 0,
        'expired' => 0,
        'revoked' => 0
    ];

    foreach ($licensesRaw as $lic) {
        $expMeta = calculateLicenseExpiration($lic['activated_at'], $lic['duration_days'], $lic['expires_at']);
        
        $computedStatus = $lic['status'];
        if ($lic['status'] !== 'revoked' && $expMeta['is_expired']) {
            $computedStatus = 'expired';
        }

        if ($computedStatus === 'active') $stats['active']++;
        else if ($computedStatus === 'used') $stats['used']++;
        else if ($computedStatus === 'expired') $stats['expired']++;
        else if ($computedStatus === 'revoked') $stats['revoked']++;

        $lic['computed_status'] = $computedStatus;
        $lic['exp_meta'] = $expMeta;
        $licenses[] = $lic;
    }
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FotoSync PRO — Enterprise Admin Suite</title>
  <!-- Google Fonts: Plus Jakarta Sans & JetBrains Mono -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="icon" type="image/png" href="../assets/logo.png">
  <link rel="shortcut icon" type="image/png" href="../assets/logo.png">
  
  <style>
    /* ENTERPRISE DESIGN SYSTEM */
    :root {
      --bg-body: #f8fafc;
      --bg-sidebar: #0f172a;
      --bg-sidebar-hover: #1e293b;
      --bg-sidebar-active: rgba(59, 130, 246, 0.15);
      --bg-card: #ffffff;
      --bg-card-sub: #f1f5f9;
      --bg-input: #ffffff;

      --primary-blue: #2563eb;
      --primary-blue-dark: #1d4ed8;
      --primary-blue-light: #eff6ff;
      --navy-dark: #1e293b;
      --navy-darker: #0f172a;

      --emerald-success: #10b981;
      --amber-warning: #f59e0b;
      --rose-error: #ef4444;

      --text-main: #0f172a;
      --text-muted: #64748b;
      --text-dim: #94a3b8;
      --text-white: #f8fafc;

      --border-subtle: #e2e8f0;
      --border-card: #e5e7eb;
      
      --shadow-subtle: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      --shadow-card: 0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.02);
      --shadow-elevated: 0 12px 30px -4px rgba(15, 23, 42, 0.08);

      --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: var(--font-sans); 
      background-color: var(--bg-body); 
      color: var(--text-main); 
      min-height: 100vh; 
      overflow-x: hidden; 
      -webkit-font-smoothing: antialiased;
    }

    /* STANDALONE PURE LOGIN PAGE STYLING */
    .login-wrapper {
      min-height: 100vh;
      width: 100vw;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at top right, #1e293b 0%, #0f172a 100%);
      padding: 20px;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 99999;
    }
    .login-card {
      background: #ffffff;
      border-radius: 24px;
      padding: 40px 36px;
      width: 100%;
      max-width: 440px;
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
      animation: loginFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes loginFadeIn {
      from { opacity: 0; transform: translateY(14px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .login-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      margin-bottom: 28px;
    }
    .brand-logo-large {
      width: 58px;
      height: 58px;
      border-radius: 16px;
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      box-shadow: 0 8px 22px rgba(37, 99, 235, 0.45);
      margin-bottom: 14px;
    }
    .login-header h2 {
      font-size: 22px;
      font-weight: 800;
      color: var(--navy-darker);
      letter-spacing: -0.5px;
    }
    .login-header h2 span {
      font-size: 11px;
      background: #eff6ff;
      color: #2563eb;
      padding: 3px 8px;
      border-radius: 8px;
      font-weight: 800;
      border: 1px solid #bfdbfe;
      margin-left: 4px;
    }
    .login-header p {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 4px;
      font-weight: 500;
    }
    .login-form {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .input-with-icon {
      position: relative;
      display: flex;
      align-items: center;
    }
    .input-with-icon .icon {
      position: absolute;
      left: 14px;
      font-size: 15px;
      color: var(--text-dim);
      pointer-events: none;
    }
    .input-with-icon input {
      width: 100%;
      padding-left: 42px !important;
      height: 46px;
      font-size: 14px;
      border-radius: 12px;
    }
    .btn-login {
      height: 48px;
      font-size: 15px;
      font-weight: 700;
      margin-top: 6px;
      border-radius: 12px;
      width: 100%;
    }
    .login-footer {
      margin-top: 24px;
      padding-top: 18px;
      border-top: 1px solid var(--border-subtle);
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.5;
    }
    .login-footer code {
      font-family: var(--font-mono);
      background: var(--bg-card-sub);
      padding: 2px 6px;
      border-radius: 4px;
      color: var(--navy-darker);
    }

    /* DASHBOARD LAYOUT */
    .app-layout { display: flex; min-height: 100vh; }

    /* ENTERPRISE DARK SIDEBAR */
    .sidebar {
      width: 270px;
      flex-shrink: 0;
      background-color: var(--bg-sidebar);
      border-right: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      flex-direction: column;
      padding: 24px 18px;
      gap: 24px;
      color: var(--text-white);
      box-shadow: 4px 0 24px rgba(0, 0, 0, 0.06);
      z-index: 10;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
    }

    .sidebar-brand { 
      display: flex; 
      align-items: center; 
      gap: 14px; 
      padding: 4px 8px; 
    }
    .brand-logo {
      width: 42px; height: 42px; border-radius: 12px; 
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      display: flex; align-items: center; justify-content: center; color: #ffffff;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
    }
    .brand-info h2 { font-size: 17px; font-weight: 800; color: #ffffff; line-height: 1.2; letter-spacing: -0.4px; }
    .brand-info h2 span { 
      font-size: 10px; background: rgba(59, 130, 246, 0.2); color: #60a5fa; 
      padding: 2px 6px; border-radius: 6px; margin-left: 4px; font-weight: 700; border: 1px solid rgba(96, 165, 250, 0.3); 
    }
    .brand-info p { font-size: 11.5px; color: var(--text-dim); font-weight: 500; margin-top: 2px; }

    .sidebar-nav { display: flex; flex-direction: column; gap: 6px; flex: 1; margin-top: 8px; }
    .nav-section-label { font-size: 10px; font-weight: 800; color: var(--text-dim); letter-spacing: 1px; text-transform: uppercase; padding: 12px 10px 4px; opacity: 0.7; }
    .nav-item {
      display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 10px;
      color: #94a3b8; font-weight: 600; font-size: 13.5px; text-decoration: none; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      border: 1px solid transparent; background: transparent; cursor: pointer; text-align: left; width: 100%;
    }
    .nav-item svg { stroke-width: 2.2; transition: 0.2s; }
    .nav-item:hover { background: var(--bg-sidebar-hover); color: #f8fafc; transform: translateX(3px); }
    .nav-item.active { 
      background: var(--bg-sidebar-active); 
      color: #60a5fa; 
      font-weight: 700; 
      border: 1px solid rgba(59, 130, 246, 0.3); 
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); 
    }
    .nav-item.active svg { stroke: #60a5fa; }

    .sidebar-footer { padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.08); display: flex; flex-direction: column; gap: 12px; }
    .status-pill { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; color: #34d399; background: rgba(16, 185, 129, 0.12); padding: 8px 12px; border-radius: 20px; border: 1px solid rgba(52, 211, 153, 0.2); }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #34d399; box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.25); animation: pulseDot 2s infinite; }

    @keyframes pulseDot {
      0% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.5); }
      70% { box-shadow: 0 0 0 6px rgba(52, 211, 153, 0); }
      100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
    }

    /* MAIN CONTENT AREA */
    .main-wrapper { flex: 1; display: flex; flex-direction: column; overflow-y: auto; background-color: var(--bg-body); }
    
    /* TOP NAVBAR HEADER */
    .top-header { 
      background: #ffffff; 
      border-bottom: 1px solid var(--border-subtle); 
      padding: 18px 36px; 
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      position: sticky; 
      top: 0; 
      z-index: 5;
      box-shadow: var(--shadow-subtle);
    }
    .header-left-group { display: flex; flex-direction: column; gap: 2px; }
    .breadcrumb-text { font-size: 11px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 2px; }
    .top-header h1 { font-size: 21px; font-weight: 800; color: var(--navy-darker); letter-spacing: -0.5px; }
    .top-header p { font-size: 12.5px; color: var(--text-muted); }
    
    .header-right { display: flex; align-items: center; gap: 14px; }
    .user-profile-badge { 
      display: flex; align-items: center; gap: 10px;
      font-size: 12.5px; font-weight: 700; color: var(--navy-dark); 
      background: var(--bg-body); padding: 8px 16px; border-radius: 30px; 
      border: 1px solid var(--border-subtle); box-shadow: var(--shadow-subtle);
    }
    .avatar-circle { width: 26px; height: 26px; border-radius: 50%; background: var(--navy-darker); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; }

    .content-container { padding: 32px 36px; max-width: 1400px; margin: 0 auto; width: 100%; }

    /* METRICS STATS CARDS */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 18px; margin-bottom: 28px; }
    .stat-card { 
      background: var(--bg-card); 
      border: 1px solid var(--border-card); 
      border-radius: 16px; 
      padding: 20px 22px; 
      box-shadow: var(--shadow-card); 
      display: flex; 
      flex-direction: column; 
      gap: 6px; 
      position: relative;
      overflow: hidden;
      transition: all 0.25s ease;
    }
    .stat-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-elevated); border-color: #cbd5e1; }
    .stat-card::before {
      content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 4px; background: var(--border-subtle);
    }
    .stat-card.total::before { background: linear-gradient(90deg, #64748b, #475569); }
    .stat-card.active::before { background: linear-gradient(90deg, #10b981, #059669); }
    .stat-card.used::before { background: linear-gradient(90deg, #2563eb, #1d4ed8); }
    .stat-card.expired::before { background: linear-gradient(90deg, #f59e0b, #d97706); }
    .stat-card.revoked::before { background: linear-gradient(90deg, #ef4444, #dc2626); }

    .stat-header-row { display: flex; justify-content: space-between; align-items: center; }
    .stat-label { font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.6px; }
    .stat-icon { width: 32px; height: 32px; border-radius: 8px; background: var(--bg-body); display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
    .stat-number { font-size: 30px; font-weight: 800; color: var(--navy-darker); font-family: var(--font-sans); letter-spacing: -0.8px; margin-top: 4px; }
    .stat-card.active .stat-number { color: #059669; }
    .stat-card.used .stat-number { color: #2563eb; }
    .stat-card.expired .stat-number { color: #d97706; }
    .stat-card.revoked .stat-number { color: #dc2626; }

    /* ENTERPRISE CARDS */
    .card { 
      background: var(--bg-card); 
      border: 1px solid var(--border-card); 
      border-radius: 18px; 
      padding: 26px; 
      margin-bottom: 28px; 
      box-shadow: var(--shadow-card); 
      transition: all 0.2s ease;
    }
    .card-title-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
    .card-title { font-size: 16.5px; font-weight: 800; color: var(--navy-darker); display: flex; align-items: center; gap: 10px; letter-spacing: -0.3px; margin-bottom: 6px; }
    .card-title svg { stroke: var(--primary-blue); stroke-width: 2.2; }
    .card-subtitle { font-size: 13px; color: var(--text-muted); margin-bottom: 22px; font-weight: 500; line-height: 1.4; }

    /* FORMS & INPUTS */
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 18px; align-items: end; }
    .form-group { display: flex; flex-direction: column; gap: 7px; }
    .form-group label { font-size: 12px; font-weight: 700; color: var(--navy-dark); letter-spacing: -0.1px; line-height: 1.3; }
    input[type="text"], input[type="password"], input[type="number"], select, textarea {
      background: var(--bg-input); 
      border: 1px solid #cbd5e1; 
      color: var(--text-main);
      padding: 11px 14px; 
      border-radius: 11px; 
      font-size: 13.5px; 
      font-weight: 500; 
      font-family: inherit;
      outline: none; 
      transition: all 0.2s ease;
      box-shadow: var(--shadow-subtle);
    }
    input:focus, select:focus, textarea:focus { 
      border-color: var(--primary-blue); 
      box-shadow: 0 0 0 3.5px rgba(37, 99, 235, 0.15); 
      background: #ffffff;
    }

    /* BUTTONS */
    .btn {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); 
      color: #ffffff; 
      border: none; 
      padding: 11px 22px; 
      font-weight: 700;
      border-radius: 11px; 
      cursor: pointer; 
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); 
      font-size: 13.5px; 
      display: inline-flex; 
      align-items: center; 
      justify-content: center; 
      gap: 8px; 
      text-decoration: none;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
    }
    .btn:hover { background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%); transform: translateY(-1px); box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35); }
    .btn-secondary { background: var(--bg-body); color: var(--text-main); border: 1px solid #cbd5e1; box-shadow: var(--shadow-subtle); }
    .btn-secondary:hover { background: #e2e8f0; color: var(--navy-darker); }
    .btn-danger { background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; box-shadow: none; }
    .btn-danger:hover { background: #dc2626; color: #ffffff; }
    .btn-warning { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; box-shadow: none; }
    .btn-warning:hover { background: #d97706; color: #ffffff; }
    .btn-sm { padding: 7px 12px; font-size: 11.5px; border-radius: 8px; }

    /* TOOLBAR & ENTERPRISE TABLE */
    .table-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .search-box { position: relative; flex: 1; max-width: 360px; }
    .search-box input { width: 100%; padding-left: 38px; height: 40px; border-radius: 11px; }
    .search-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); font-size: 14px; color: var(--text-dim); }

    .table-responsive { overflow-x: auto; border: 1px solid var(--border-subtle); border-radius: 14px; box-shadow: var(--shadow-subtle); }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; background: #ffffff; }
    th, td { padding: 15px 20px; border-bottom: 1px solid var(--border-subtle); vertical-align: middle; }
    th { background: #f8fafc; color: var(--text-muted); font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.7px; }
    tr:last-child td { border-bottom: none; }
    tbody tr { transition: background 0.15s ease; }
    tbody tr:hover { background: #f1f5f9; }

    /* ENTERPRISE BADGES */
    .key-badge { 
      font-family: var(--font-mono); 
      font-weight: 700; 
      color: #1e40af; 
      background: #eff6ff; 
      padding: 4px 10px; 
      border-radius: 7px; 
      border: 1px solid #bfdbfe; 
      font-size: 12px; 
      letter-spacing: -0.2px;
    }
    .badge { padding: 5px 12px; border-radius: 20px; font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block; }
    .badge.active { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .badge.used { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .badge.expired { background: #fffbebf; color: #b45309; border: 1px solid #fde68a; }
    .badge.revoked { background: #fef2f2; color: #b91c1c; border: 1px solid #fca5a5; }

    .exp-text { font-size: 12px; font-weight: 700; color: #047857; }
    .exp-text.expired { color: #d97706; }
    .exp-text.lifetime { color: #2563eb; }

    .alert { padding: 16px 20px; border-radius: 14px; margin-bottom: 24px; font-weight: 600; font-size: 13.5px; display: flex; align-items: center; justify-content: space-between; box-shadow: var(--shadow-subtle); }
    .alert-success { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
    .alert-danger { background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }

    /* MODAL */
    .modal-backdrop { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 9999; }
    .modal-card { background: #ffffff; border-radius: 20px; padding: 28px; width: 90%; max-width: 460px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); border: 1px solid var(--border-subtle); animation: modalIn 0.2s ease-out; }

    @keyframes modalIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
  </style>
</head>
<body>

  <?php if (!$isLoggedIn): ?>
    <!-- STANDALONE PURE LOGIN PAGE (NO SIDEBAR, NO TOP HEADER) -->
    <div class="login-wrapper">
      <div class="login-card">
        <div class="login-header">
          <div class="brand-logo-large" style="background: transparent; box-shadow: none;">
            <img src="../assets/logo.png" alt="FotoSync Logo" style="width: 56px; height: 56px; object-fit: contain;">
          </div>
          <h2>FotoSync <span>PRO</span></h2>
          <p>Enterprise Server Admin Portal</p>
        </div>

        <?php if (!empty($error_msg)): ?>
          <div class="alert alert-danger" style="margin-bottom: 20px; padding: 12px 16px; font-size: 13px;">
            <span>⚠️ <?= htmlspecialchars($error_msg) ?></span>
          </div>
        <?php endif; ?>

        <form method="POST" action="index.php" class="login-form">
          <div class="form-group">
            <label>Username Admin</label>
            <div class="input-with-icon">
              <span class="icon">👤</span>
              <input type="text" name="admin_user" placeholder="Masukkan username admin..." value="admin" required autofocus>
            </div>
          </div>

          <div class="form-group">
            <label>Kata Sandi (Password)</label>
            <div class="input-with-icon">
              <span class="icon">🔒</span>
              <input type="password" name="admin_pass" placeholder="Masukkan password admin..." required>
            </div>
          </div>

          <button type="submit" class="btn btn-login">
            🔐 Masuk ke Portal Admin
          </button>
        </form>

        <div class="login-footer">
          <span>Terhubung ke Database <strong>fotoyu_licenses</strong> (Tabel <code>admin_users</code>)</span>
          <br><small style="color: var(--text-dim); font-size: 11.5px; margin-top: 4px; display: inline-block;">Developed by <a href="https://ghazabegins.id/" target="_blank" rel="noopener noreferrer" style="color: #2563eb; font-weight: 700; text-decoration: none;">ghazabegins.id</a></small>
        </div>
      </div>
    </div>
  <?php else: ?>

    <!-- ENTERPRISE DASHBOARD LAYOUT (SIDEBAR & MAIN DASHBOARD) -->
    <div class="app-layout">

      <!-- MODULAR SIDEBAR COMPONENT -->
      <?php require __DIR__ . '/sidebar.php'; ?>

      <!-- MAIN CONTENT WRAPPER -->
      <main class="main-wrapper">
        
        <!-- TOP NAVBAR HEADER -->
        <header class="top-header">
          <div class="header-left-group">
            <div class="breadcrumb-text">
              Server Admin / <?= strtoupper($currentTab) ?>
            </div>
            <?php if ($currentTab === 'telemetry'): ?>
              <h1>Server Telemetry & Request Log</h1>
              <p>Monitoring Real-Time Aktivitas Lisensi, IP Address, Perangkat HWID, & Event Server</p>
            <?php elseif ($currentTab === 'updater'): ?>
              <h1>Auto-Update & Versi Software</h1>
              <p>Kelola Versi Rilis Terbaru, Catatan Perubahan, & Mandatory Update (Windows & macOS)</p>
            <?php else: ?>
              <h1>Manajemen Lisensi Terpusat</h1>
              <p>Kontrol Durasi Masa Aktif, Master Key, & Device Binding (HWID)</p>
            <?php endif; ?>
          </div>

          <div class="header-right">
            <div class="user-profile-badge">
              <div class="avatar-circle"><?= strtoupper(substr($adminDisplayName, 0, 1)) ?></div>
              <span><?= htmlspecialchars($adminDisplayName) ?></span>
            </div>
          </div>
        </header>

        <div class="content-container">

          <?php if (!empty($success_msg)): ?>
            <div class="alert alert-success"><span><?= $success_msg ?></span></div>
          <?php endif; ?>
          <?php if (!empty($warn_msg)): ?>
            <div class="alert alert-danger"><span><?= $warn_msg ?></span></div>
          <?php endif; ?>

          <?php if ($currentTab === 'telemetry'): ?>

            <!-- TELEMETRY STATS GRID -->
            <div class="stats-grid">
              <div class="stat-card total">
                <div class="stat-header-row">
                  <span class="stat-label">Total Log Recorded</span>
                  <div class="stat-icon">📡</div>
                </div>
                <span class="stat-number"><?= number_format($telemetryStats['total']) ?></span>
              </div>
              <div class="stat-card active">
                <div class="stat-header-row">
                  <span class="stat-label">Event Sukses</span>
                  <div class="stat-icon">✅</div>
                </div>
                <span class="stat-number"><?= number_format($telemetryStats['success']) ?></span>
              </div>
              <div class="stat-card expired">
                <div class="stat-header-row">
                  <span class="stat-label">Peringatan (Warning)</span>
                  <div class="stat-icon">⚠️</div>
                </div>
                <span class="stat-number"><?= number_format($telemetryStats['warning']) ?></span>
              </div>
              <div class="stat-card revoked">
                <div class="stat-header-row">
                  <span class="stat-label">Gagal / Error</span>
                  <div class="stat-icon">❌</div>
                </div>
                <span class="stat-number"><?= number_format($telemetryStats['error']) ?></span>
              </div>
            </div>

            <!-- TELEMETRY LOGS TABLE CARD -->
            <div class="card">
              <div class="table-toolbar">
                <div class="card-title" style="margin-bottom: 0;">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline points="4 17 10 11 4 5"></polyline>
                    <line x1="12" y1="19" x2="20" y2="19"></line>
                  </svg>
                  Riwayat Aktivitas Server Real-Time
                </div>

                <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                  <div class="search-box">
                    <span class="search-icon">🔍</span>
                    <input type="text" id="telemetrySearch" onkeyup="filterTelemetryTable()" placeholder="Cari key, IP, status, event...">
                  </div>

                  <form method="POST" action="?tab=telemetry" onsubmit="return confirm('Apakah Anda yakin ingin menghapus SELURUH log telemetry server?');">
                    <input type="hidden" name="action" value="clear_logs">
                    <button type="submit" class="btn btn-danger btn-sm" style="height: 40px; padding: 0 16px;">🧹 Bersihkan Log</button>
                  </form>
                </div>
              </div>

              <div class="table-responsive">
                <table id="telemetryTable">
                  <thead>
                    <tr>
                      <th># ID</th>
                      <th>Waktu WIB</th>
                      <th>Tipe Event</th>
                      <th>Master Key / Perangkat</th>
                      <th>IP Address</th>
                      <th>Status</th>
                      <th>Detail Pesan Telemetri</th>
                    </tr>
                  </thead>
                  <tbody>
                    <?php if (empty($telemetryLogs)): ?>
                      <tr>
                        <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">
                          Belum ada catatan log telemetri server saat ini.
                        </td>
                      </tr>
                    <?php else: ?>
                      <?php foreach ($telemetryLogs as $log): ?>
                        <?php
                          $statusClass = 'used';
                          if ($log['status'] === 'SUCCESS') $statusClass = 'active';
                          else if ($log['status'] === 'WARNING') $statusClass = 'expired';
                          else if ($log['status'] === 'ERROR') $statusClass = 'revoked';
                        ?>
                        <tr>
                          <td><strong>#<?= $log['id'] ?></strong></td>
                          <td style="font-family: var(--font-mono); font-size: 11.5px; white-space: nowrap; color: var(--text-muted);">
                            <?= date('d/m/Y H:i:s', strtotime($log['created_at'])) ?>
                          </td>
                          <td>
                            <span class="badge" style="background: var(--bg-body); color: var(--navy-dark); border: 1px solid var(--border-subtle);">
                              <?= htmlspecialchars($log['action_type']) ?>
                            </span>
                          </td>
                          <td>
                            <?php if (!empty($log['license_key'])): ?>
                              <span class="key-badge"><?= htmlspecialchars($log['license_key']) ?></span>
                            <?php else: ?>
                              <span style="color: var(--text-dim); font-size: 11.5px;">- Non License -</span>
                            <?php endif; ?>
                            <?php if (!empty($log['hwid'])): ?>
                              <div style="font-family: var(--font-mono); font-size: 10.5px; color: var(--text-muted); margin-top: 2px;">
                                HWID: <?= htmlspecialchars(substr($log['hwid'], 0, 16)) ?>...
                              </div>
                            <?php endif; ?>
                          </td>
                          <td style="font-family: var(--font-mono); font-size: 11.5px;">
                            <?= htmlspecialchars($log['ip_address']) ?>
                          </td>
                          <td>
                            <span class="badge <?= $statusClass ?>"><?= htmlspecialchars($log['status']) ?></span>
                          </td>
                          <td style="font-size: 12.5px; color: var(--navy-darker); font-weight: 500;">
                            <?= htmlspecialchars($log['message']) ?>
                          </td>
                        </tr>
                      <?php endforeach; ?>
                    <?php endif; ?>
                  </tbody>
                </table>
              </div>
            </div>

          <?php elseif ($currentTab === 'updater'): ?>

            <!-- SOFTWARE AUTO-UPDATE SETTINGS CARD ONLY -->
            <div class="card" style="border-top: 4px solid var(--primary-blue); max-width: 860px; margin: 0 auto;">
              <div class="card-title" style="color: var(--primary-blue-dark); font-size: 17px;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                🚀 Pengaturan Versi & Auto-Update Multi-Platform (FotoSync PRO)
              </div>
              <p class="card-subtitle">
                Perbarui versi rilis di bawah ini untuk mendorong notifikasi update otomatis secara real-time ke seluruh aplikasi desktop pengguna FotoSync PRO (Windows & macOS).
              </p>

              <form method="POST" action="?tab=updater" class="form-grid">
                <input type="hidden" name="action" value="save_version">
                
                <div class="form-group">
                  <label>Versi Rilis Terbaru (Latest Version)</label>
                  <input type="text" name="latest_version" value="<?= htmlspecialchars($versionConfig['latest_version']) ?>" placeholder="Contoh: 1.1.0" required>
                </div>

                <div class="form-group">
                  <label>Versi Minimal Wajib (Min Required Version)</label>
                  <input type="text" name="min_required_version" value="<?= htmlspecialchars($versionConfig['min_required_version']) ?>" placeholder="Contoh: 1.0.0" required>
                </div>

                <div class="form-group">
                  <label>🪟 URL Download Windows (.exe)</label>
                  <input type="text" name="windows_download_url" value="<?= htmlspecialchars($versionConfig['windows_download_url']) ?>" placeholder="http://localhost/.../FotoSync-Setup-Latest.exe" required>
                </div>

                <div class="form-group">
                  <label>🍎 URL Download macOS / Macbook (.dmg)</label>
                  <input type="text" name="mac_download_url" value="<?= htmlspecialchars($versionConfig['mac_download_url']) ?>" placeholder="http://localhost/.../FotoSync-Setup-Latest.dmg" required>
                </div>

                <div class="form-group" style="grid-column: span 2;">
                  <label>Catatan Perubahan Versi Baru (Release Notes)</label>
                  <textarea name="release_notes" rows="4" style="width: 100%; border: 1px solid #cbd5e1; border-radius: 11px; padding: 12px; font-family: inherit; font-size: 13px; color: var(--navy-darker);" placeholder="• Penambahan fitur...&#10;• Perbaikan bug..."><?= htmlspecialchars($versionConfig['release_notes']) ?></textarea>
                </div>

                <div class="form-group" style="grid-column: span 2; display: flex; align-items: center; gap: 12px; background: #fff5f5; border: 1px solid #fed7d7; padding: 14px 16px; border-radius: 11px;">
                  <input type="checkbox" id="is_mandatory" name="is_mandatory" value="1" <?= !empty($versionConfig['is_mandatory']) ? 'checked' : '' ?> style="width: 18px; height: 18px; cursor: pointer; accent-color: #dc2626;">
                  <label for="is_mandatory" style="margin-bottom: 0; cursor: pointer; font-weight: 700; color: #991b1b; font-size: 13px;">
                    ⚠️ Update Wajib (Mandatory Update) — Pengguna wajib melakukan update sebelum bisa menggunakan aplikasi uploader
                  </label>
                </div>

                <button type="submit" class="btn" style="grid-column: span 2; height: 48px; font-size: 14.5px;">
                  💾 Terbitkan Pembaruan Versi <?= htmlspecialchars($versionConfig['latest_version']) ?> ke Semua Pengguna
                </button>
              </form>
            </div>

          <?php else: ?>

            <!-- METRICS STATS CARDS -->
            <div class="stats-grid">
              <div class="stat-card total">
                <div class="stat-header-row">
                  <span class="stat-label">Total Master Key</span>
                  <div class="stat-icon">🔑</div>
                </div>
                <span class="stat-number"><?= number_format($stats['total']) ?></span>
              </div>
              <div class="stat-card active">
                <div class="stat-header-row">
                  <span class="stat-label">Belum Dipakai (Siap)</span>
                  <div class="stat-icon">✨</div>
                </div>
                <span class="stat-number"><?= number_format($stats['active']) ?></span>
              </div>
              <div class="stat-card used">
                <div class="stat-header-row">
                  <span class="stat-label">Terpakai & Aktif</span>
                  <div class="stat-icon">💻</div>
                </div>
                <span class="stat-number"><?= number_format($stats['used']) ?></span>
              </div>
              <div class="stat-card expired">
                <div class="stat-header-row">
                  <span class="stat-label">Kedaluwarsa (Expired)</span>
                  <div class="stat-icon">⏳</div>
                </div>
                <span class="stat-number"><?= number_format($stats['expired']) ?></span>
              </div>
              <div class="stat-card revoked">
                <div class="stat-header-row">
                  <span class="stat-label">Diblokir (Revoked)</span>
                  <div class="stat-icon">🚫</div>
                </div>
                <span class="stat-number"><?= number_format($stats['revoked']) ?></span>
              </div>
            </div>

            <!-- GENERATE LICENSE CARD -->
            <div class="card">
              <div class="card-title">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
                Generate Master Key & Durasi Baru
              </div>
              <p class="card-subtitle">Buat Master Key lisensi baru untuk member dengan pilihan tier kuota harian dan durasi langganan.</p>
              
              <form method="POST" class="form-grid">
                <input type="hidden" name="action" value="generate">
                
                <div class="form-group">
                  <label>Nama Member / Studio</label>
                  <input type="text" name="buyer_name" placeholder="Contoh: Studio Foto Berkah" required>
                </div>

                <div class="form-group">
                  <label>No. WhatsApp / HP</label>
                  <input type="text" name="buyer_phone" placeholder="Contoh: 081234567890">
                </div>

                <div class="form-group">
                  <label>Pilih Paket Langganan Durasi</label>
                  <select name="plan_tier" required>
                    <option value="1_day">⚡ PAKET 1 HARI (Unlimited Foto - 24 Jam) - Rp 25rb</option>
                    <option value="7_days" selected>🚀 PAKET 7 HARI (Unlimited Foto - 1 Minggu) - Rp 50rb</option>
                    <option value="30_days">👑 PAKET 30 HARI (Unlimited Foto - 1 Bulan) - Rp 110rb</option>
                    <option value="pro">⭐ PAKET LIFETIME (Unlimited Foto - Permanen)</option>
                  </select>
                </div>

                <div class="form-group">
                  <label>Durasi Masa Aktif</label>
                  <select name="duration_days_preset" id="durationSelect" onchange="toggleCustomDuration(this.value)">
                    <option value="auto" selected>Otomatis Sesuai Paket Ditentukan</option>
                    <option value="1">1 Hari (24 Jam)</option>
                    <option value="7">7 Hari (1 Minggu)</option>
                    <option value="30">1 Bulan (30 Hari)</option>
                    <option value="90">3 Bulan (90 Hari)</option>
                    <option value="365">1 Tahun (365 Hari)</option>
                    <option value="0">⭐ Lifetime / Permanen (Tanpa Batas)</option>
                    <option value="custom">Input Custom Hari...</option>
                  </select>
                </div>

                <div class="form-group" id="customDurationGroup" style="display: none;">
                  <label>Jumlah Hari Custom</label>
                  <input type="number" name="custom_duration" min="1" placeholder="30">
                </div>

                <div class="form-group">
                  <label>Catatan / Tag Event (Opsional)</label>
                  <input type="text" name="notes" placeholder="Contoh: Mandiri Jogja Marathon 2026">
                </div>

                <button type="submit" class="btn" style="height: 44px;">⚡ Buat Master Key</button>
              </form>
            </div>

            <!-- LICENSES LIST TABLE CARD -->
            <div class="card">
              <div class="table-toolbar">
                <div class="card-title" style="margin-bottom: 0;">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                  Daftar Lisensi Terdaftar & Device Binding
                </div>

                <div class="search-box">
                  <span class="search-icon">🔍</span>
                  <input type="text" id="tableSearch" placeholder="Cari Nama, Key, HP..." onkeyup="filterTable()">
                </div>
              </div>

              <div class="table-responsive">
                <table id="licensesTable">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Master Key</th>
                      <th>Paket & Limit</th>
                      <th>Nama Member & Kontak</th>
                      <th>Durasi Lisensi</th>
                      <th>Status</th>
                      <th>Device Bound (HWID)</th>
                      <th>Masa Aktif & Expiry</th>
                      <th style="text-align: right;">Aksi Admin</th>
                    </tr>
                  </thead>
                  <tbody>
                    <?php foreach ($licenses as $lic): ?>
                      <tr>
                        <td><strong>#<?= $lic['id'] ?></strong></td>
                        <td>
                          <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="key-badge"><?= htmlspecialchars($lic['license_key']) ?></span>
                            <button type="button" class="btn btn-secondary btn-sm" style="padding: 4px 8px;" onclick="copyText('<?= htmlspecialchars($lic['license_key']) ?>')" title="Salin Kode Master Key">📋</button>
                          </div>
                        </td>
                        <td>
                          <?php 
                            $pTier = $lic['plan_tier'] ?? 'pro';
                            if ($pTier === 'free') echo '<span class="badge" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;">🆓 FREE (20 Foto)</span>';
                            else if ($pTier === 'premium') echo '<span class="badge" style="background: #fffbebf; color: #b45309; border: 1px solid #fde68a;">⚡ PREMIUM (500 Foto)</span>';
                            else echo '<span class="badge" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;">🚀 PRO (UNLIMITED)</span>';
                          ?>
                        </td>
                        <td>
                          <strong style="color: var(--navy-darker);"><?= htmlspecialchars($lic['buyer_name'] ?? 'Member') ?></strong><br>
                          <small style="color: var(--text-muted); font-size: 11.5px;"><?= htmlspecialchars($lic['buyer_phone'] ?? '-') ?></small>
                        </td>
                        <td>
                          <strong><?= $lic['duration_days'] == 0 ? '⭐ Lifetime' : "{$lic['duration_days']} Hari" ?></strong>
                          <?php if ($lic['notes']): ?>
                            <br><small style="color: var(--text-muted); font-size: 11.5px;"><?= htmlspecialchars($lic['notes']) ?></small>
                          <?php endif; ?>
                        </td>
                        <td>
                          <span class="badge <?= $lic['computed_status'] ?>"><?= strtoupper($lic['computed_status']) ?></span>
                        </td>
                        <td>
                          <?php if ($lic['hwid']): ?>
                            <code style="color: var(--navy-darker); font-family: var(--font-mono); font-size: 11px; background: #e2e8f0; padding: 3px 7px; border-radius: 6px;"><?= htmlspecialchars($lic['hwid']) ?></code>
                            <br><small style="color: var(--text-muted); font-size: 11px;">Cek: <?= $lic['last_check_at'] ? date('d/m/y H:i', strtotime($lic['last_check_at'])) : '-' ?></small>
                          <?php else: ?>
                            <span style="color: var(--text-dim); font-style: italic; font-size: 12px;">Belum Diaktifkan</span>
                          <?php endif; ?>
                        </td>
                        <td>
                          <?php if ($lic['exp_meta']['is_lifetime']): ?>
                            <span class="exp-text lifetime">PERMANEN (LIFETIME)</span>
                          <?php elseif ($lic['exp_meta']['is_expired']): ?>
                            <span class="exp-text expired">⚠️ KEDALUWARSA</span><br>
                            <small style="color: var(--text-muted); font-size: 11px;"><?= date('d M Y', strtotime($lic['expires_at'])) ?></small>
                          <?php elseif (!empty($lic['expires_at'])): ?>
                            <span class="exp-text">Sisa <?= $lic['exp_meta']['remaining_days'] ?> Hari</span><br>
                            <small style="color: var(--text-muted); font-size: 11px;">s.d. <?= date('d M Y', strtotime($lic['expires_at'])) ?></small>
                          <?php else: ?>
                            <span style="color: var(--text-muted); font-size: 12px;">Siap Aktif (<?= $lic['duration_days'] ?> Hari)</span>
                          <?php endif; ?>
                        </td>
                        <td style="text-align: right;">
                          <div style="display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap;">
                            <?php if ($lic['hwid']): ?>
                              <form method="POST" style="display:inline;" onsubmit="return confirm('Unbind HWID Perangkat untuk member ini? Member bisa mengaktifkan ulang di laptop baru.');">
                                <input type="hidden" name="action" value="unbind">
                                <input type="hidden" name="license_id" value="<?= $lic['id'] ?>">
                                <button type="submit" class="btn btn-warning btn-sm" title="Reset Device Binding (Unbind HWID)">🔄 Unbind</button>
                              </form>
                            <?php endif; ?>

                            <!-- EXTEND DURATION BUTTON -->
                            <button type="button" class="btn btn-secondary btn-sm" onclick="openExtendModal(<?= $lic['id'] ?>, '<?= htmlspecialchars($lic['license_key']) ?>', '<?= htmlspecialchars($lic['buyer_name']) ?>', <?= $lic['duration_days'] ?>)" title="Perpanjang Masa Aktif">⏳ Perpanjang</button>

                            <?php if ($lic['computed_status'] !== 'revoked'): ?>
                              <form method="POST" style="display:inline;" onsubmit="return confirm('Blokir lisensi ini?');">
                                <input type="hidden" name="action" value="revoke">
                                <input type="hidden" name="license_id" value="<?= $lic['id'] ?>">
                                <button type="submit" class="btn btn-danger btn-sm" title="Blokir Lisensi">🚫 Blokir</button>
                              </form>
                            <?php else: ?>
                              <form method="POST" style="display:inline;">
                                <input type="hidden" name="action" value="reactivate">
                                <input type="hidden" name="license_id" value="<?= $lic['id'] ?>">
                                <button type="submit" class="btn btn-secondary btn-sm" title="Buka Blokir">✅ Buka Blokir</button>
                              </form>
                            <?php endif; ?>

                            <form method="POST" style="display:inline;" onsubmit="return confirm('Hapus lisensi ini secara permanen?');">
                              <input type="hidden" name="action" value="delete">
                              <input type="hidden" name="license_id" value="<?= $lic['id'] ?>">
                              <button type="submit" class="btn btn-danger btn-sm" style="padding: 6px 10px;" title="Hapus Permanen">🗑️</button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    <?php endforeach; ?>
                    <?php if (empty($licenses)): ?>
                      <tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 40px;">Belum ada kode lisensi terdaftar di database server.</td></tr>
                    <?php endif; ?>
                  </tbody>
                </table>
              </div>
            </div>

          <?php endif; ?>

          <!-- FOOTER COPYRIGHT CREDIT -->
          <footer style="margin-top: 36px; padding-top: 20px; border-top: 1px solid var(--border-subtle); text-align: center; font-size: 12.5px; color: var(--text-muted); font-weight: 500;">
            FotoSync PRO Enterprise License Server &bull; Developed by <a href="https://ghazabegins.id/" target="_blank" rel="noopener noreferrer" style="color: var(--primary-blue); font-weight: 700; text-decoration: none;">ghazabegins.id</a>
          </footer>
        </div>
      </main>
    </div>

    <!-- EXTEND DURATION MODAL -->
    <div id="extendModal" class="modal-backdrop" style="display: none;">
      <div class="modal-card">
        <h3 style="margin-bottom: 8px; font-size: 17px; font-weight: 800; color: var(--navy-darker);">⏳ Perpanjang Masa Aktif Lisensi</h3>
        <p id="extendModalSub" style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;"></p>
        
        <form method="POST">
          <input type="hidden" name="action" value="extend">
          <input type="hidden" name="license_id" id="extendLicenseId">

          <div class="form-group" style="margin-bottom: 22px;">
            <label>Tambah Durasi Masa Aktif</label>
            <select name="extend_days" required style="width: 100%; height: 44px;">
              <option value="30">+30 Hari (1 Bulan)</option>
              <option value="90">+90 Hari (3 Bulan)</option>
              <option value="180">+180 Hari (6 Bulan)</option>
              <option value="365" selected>+365 Hari (1 Tahun)</option>
              <option value="0">⭐ Ubah Menjadi LIFETIME (Permanen)</option>
            </select>
          </div>

          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary" onclick="closeExtendModal()">Batal</button>
            <button type="submit" class="btn">Simpan Perpanjangan</button>
          </div>
        </form>
      </div>
    </div>
  <?php endif; ?>

  <script>
    function toggleCustomDuration(val) {
      const group = document.getElementById('customDurationGroup');
      if (group) group.style.display = (val === 'custom') ? 'flex' : 'none';
    }

    function copyText(text) {
      navigator.clipboard.writeText(text);
      alert('Master Key berhasil disalin ke clipboard:\n' + text);
    }

    function filterTable() {
      const q = document.getElementById('tableSearch').value.toLowerCase();
      const rows = document.querySelectorAll('#licensesTable tbody tr');
      rows.forEach(r => {
        const text = r.textContent.toLowerCase();
        r.style.display = text.includes(q) ? '' : 'none';
      });
    }

    function filterTelemetryTable() {
      const q = document.getElementById('telemetrySearch').value.toLowerCase();
      const rows = document.querySelectorAll('#telemetryTable tbody tr');
      rows.forEach(r => {
        const text = r.textContent.toLowerCase();
        r.style.display = text.includes(q) ? '' : 'none';
      });
    }

    function openExtendModal(id, key, name, duration) {
      document.getElementById('extendLicenseId').value = id;
      document.getElementById('extendModalSub').innerHTML = 'Lisensi: <strong style="font-family: var(--font-mono); color: var(--primary-blue);">' + key + '</strong> (' + name + ')';
      document.getElementById('extendModal').style.display = 'flex';
    }

    function closeExtendModal() {
      document.getElementById('extendModal').style.display = 'none';
    }
  </script>
</body>
</html>
