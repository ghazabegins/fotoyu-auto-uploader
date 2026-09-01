<?php
session_start();
require_once __DIR__ . '/../config.php';

$pdo = getDBConnection(false);
$dbOffline = ($pdo === null);

if ($pdo) {
    ensureAdminUsersTable($pdo);
}

// Login Session Check (Database Driven with Username + Password + Role)
if (isset($_POST['admin_pass'])) {
    $userIn = trim($_POST['admin_user'] ?? 'admin');
    $passIn = trim($_POST['admin_pass'] ?? '');

    $userRow = null;
    if ($pdo) {
        $stmt = $pdo->prepare("SELECT * FROM admin_users WHERE username = ?");
        $stmt->execute([$userIn]);
        $userRow = $stmt->fetch();
    }

    if ($userRow && password_verify($passIn, $userRow['password_hash'])) {
        $_SESSION['admin_auth'] = true;
        $_SESSION['admin_id'] = $userRow['id'];
        $_SESSION['admin_username'] = $userRow['username'];
        $_SESSION['admin_name'] = $userRow['name'];
        $_SESSION['admin_role'] = $userRow['role'] ?? 'admin';
        header('Location: index.php');
        exit;
    } else if (($userIn === 'admin' || empty($userIn)) && $passIn === ADMIN_PASSWORD) {
        $_SESSION['admin_auth'] = true;
        $_SESSION['admin_id'] = 1;
        $_SESSION['admin_username'] = 'admin';
        $_SESSION['admin_name'] = 'Super Administrator';
        $_SESSION['admin_role'] = 'admin';
        header('Location: index.php');
        exit;
    } else {
        $error_msg = "Username atau Kata Sandi Admin Salah!";
    }
}

if (isset($_GET['logout'])) {
    unset($_SESSION['admin_auth']);
    unset($_SESSION['admin_id']);
    unset($_SESSION['admin_username']);
    unset($_SESSION['admin_name']);
    unset($_SESSION['admin_role']);
    header('Location: index.php');
    exit;
}

$isLoggedIn = isset($_SESSION['admin_auth']) && $_SESSION['admin_auth'] === true;
$currentTab = $_GET['tab'] ?? 'licenses';
$adminDisplayName = $_SESSION['admin_name'] ?? 'Administrator Server';
$adminUsername = $_SESSION['admin_username'] ?? 'admin';
$adminRole = getCurrentUserRole();

// Action Handlers
if ($isLoggedIn) {
    if (isset($_POST['action'])) {
        $act = $_POST['action'];

        // 1. Generate New License (Admin & Staff)
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
            $success_msg = "🎉 Master Key [{$planLabel}] Berhasil Dibuat: <strong style='font-family: var(--font-mono); color: var(--pine-primary);'>{$newKey}</strong> (Masa Aktif: {$durText}, Kuota: UNLIMITED Foto)";
        }

        // 2. Unbind Device HWID (Admin & Staff)
        if ($act === 'unbind' && !empty($_POST['license_id'])) {
            $stmt = $pdo->prepare("UPDATE licenses SET hwid = NULL, status = 'active' WHERE id = ?");
            $stmt->execute([$_POST['license_id']]);
            $success_msg = "Device HWID berhasil di-reset (Unbind). Member kini dapat mengaktifkan lisensi di komputer/laptop baru.";
        }

        // 3. Extend Duration (Admin & Staff)
        if ($act === 'extend' && !empty($_POST['license_id'])) {
            $licId = (int)$_POST['license_id'];
            $addDays = (int)($_POST['extend_days'] ?? 30);

            $stmt = $pdo->prepare("SELECT * FROM licenses WHERE id = ?");
            $stmt->execute([$licId]);
            $lic = $stmt->fetch();

            if ($lic) {
                if ($addDays == 0) {
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

        // 4. Revoke / Block License (Admin & Staff)
        if ($act === 'revoke' && !empty($_POST['license_id'])) {
            $stmt = $pdo->prepare("UPDATE licenses SET status = 'revoked' WHERE id = ?");
            $stmt->execute([$_POST['license_id']]);
            $warn_msg = "Lisensi ID #{$_POST['license_id']} telah DIBLOKIR (Revoked).";
        }

        // 5. Reactivate / Unblock License (Admin & Staff)
        if ($act === 'reactivate' && !empty($_POST['license_id'])) {
            $stmt = $pdo->prepare("UPDATE licenses SET status = IF(hwid IS NULL, 'active', 'used') WHERE id = ?");
            $stmt->execute([$_POST['license_id']]);
            $success_msg = "Lisensi ID #{$_POST['license_id']} berhasil diaktifkan kembali.";
        }

        // 6. Delete License (Admin Only)
        if ($act === 'delete' && !empty($_POST['license_id'])) {
            if (isAdmin()) {
                $stmt = $pdo->prepare("DELETE FROM licenses WHERE id = ?");
                $stmt->execute([$_POST['license_id']]);
                $warn_msg = "Lisensi ID #{$_POST['license_id']} telah dihapus dari database.";
            } else {
                $error_msg = "⛔ Hak Akses Ditolak: Hanya Administrator yang berhak menghapus lisensi.";
            }
        }

        // 7. Update App Version Config (Admin Only)
        if ($act === 'save_version') {
            if (isAdmin()) {
                $latestVer = trim($_POST['latest_version'] ?? '1.3.0');
                $minReqVer = trim($_POST['min_required_version'] ?? '1.0.0');
                $winDownloadUrl = trim($_POST['windows_download_url'] ?? $_POST['download_url'] ?? '');
                $macDownloadUrl = trim($_POST['mac_download_url'] ?? '');
                $releaseNotes = trim($_POST['release_notes'] ?? '');
                $isMandatory = isset($_POST['is_mandatory']) && $_POST['is_mandatory'] == '1';

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
                $success_msg = "🚀 Pengaturan Versi Multi-Platform Berhasil Diperbarui ke <strong>v{$latestVer}</strong>!";
            } else {
                $error_msg = "⛔ Hak Akses Ditolak: Hanya Administrator yang berhak mengubah versi software.";
            }
        }

        // 8. Clear Telemetry Logs (Admin Only)
        if ($act === 'clear_logs') {
            if (isAdmin()) {
                ensureTelemetryLogsTable($pdo);
                $pdo->exec("TRUNCATE TABLE telemetry_logs");
                $success_msg = "🧹 Seluruh Riwayat Server Telemetry Log Berhasil Dibersihkan!";
            } else {
                $error_msg = "⛔ Hak Akses Ditolak: Hanya Administrator yang berhak menghapus log telemetry.";
            }
        }

        // 9. Update Self Profile Name (Admin & Staff)
        if ($act === 'update_profile') {
            $newName = trim($_POST['display_name'] ?? '');
            if (!empty($newName) && !empty($_SESSION['admin_username'])) {
                $stmt = $pdo->prepare("UPDATE admin_users SET name = ? WHERE username = ?");
                $stmt->execute([$newName, $_SESSION['admin_username']]);
                $_SESSION['admin_name'] = $newName;
                $success_msg = "Nama profil berhasil diperbarui menjadi <strong>" . htmlspecialchars($newName) . "</strong>!";
            } else {
                $error_msg = "Nama profil tidak boleh kosong.";
            }
        }

        // 10. Change Password (Admin & Staff)
        if ($act === 'change_password') {
            $oldPass = trim($_POST['current_password'] ?? '');
            $newPass = trim($_POST['new_password'] ?? '');
            $confirmPass = trim($_POST['confirm_password'] ?? '');

            if (strlen($newPass) < 6) {
                $error_msg = "Kata sandi baru minimal harus 6 karakter!";
            } else if ($newPass !== $confirmPass) {
                $error_msg = "Konfirmasi kata sandi baru tidak cocok!";
            } else {
                $stmt = $pdo->prepare("SELECT * FROM admin_users WHERE username = ?");
                $stmt->execute([$_SESSION['admin_username']]);
                $currUser = $stmt->fetch();

                if ($currUser && (password_verify($oldPass, $currUser['password_hash']) || ($oldPass === ADMIN_PASSWORD && $_SESSION['admin_username'] === 'admin'))) {
                    $newHash = password_hash($newPass, PASSWORD_BCRYPT);
                    $update = $pdo->prepare("UPDATE admin_users SET password_hash = ? WHERE username = ?");
                    $update->execute([$newHash, $_SESSION['admin_username']]);
                    $success_msg = "🔒 Kata sandi Anda berhasil diperbarui!";
                } else {
                    $error_msg = "Kata sandi saat ini (lama) salah!";
                }
            }
        }

        // 11. Create New User (Admin Only)
        if ($act === 'create_user') {
            if (isAdmin()) {
                $newUsername = strtolower(trim($_POST['new_username'] ?? ''));
                $newName = trim($_POST['new_name'] ?? '');
                $newPassword = trim($_POST['new_password'] ?? '');
                $newRole = in_array($_POST['new_role'] ?? '', ['admin', 'staff']) ? $_POST['new_role'] : 'staff';

                if (empty($newUsername) || empty($newPassword)) {
                    $error_msg = "Username dan Kata Sandi wajib diisi!";
                } else if (strlen($newPassword) < 6) {
                    $error_msg = "Kata sandi minimal 6 karakter!";
                } else {
                    $check = $pdo->prepare("SELECT COUNT(*) FROM admin_users WHERE username = ?");
                    $check->execute([$newUsername]);
                    if ($check->fetchColumn() > 0) {
                        $error_msg = "Username <strong>" . htmlspecialchars($newUsername) . "</strong> sudah digunakan!";
                    } else {
                        $passHash = password_hash($newPassword, PASSWORD_BCRYPT);
                        $stmt = $pdo->prepare("INSERT INTO admin_users (username, password_hash, name, role) VALUES (?, ?, ?, ?)");
                        $stmt->execute([$newUsername, $passHash, $newName ?: ucfirst($newUsername), $newRole]);
                        $success_msg = "🎉 Pengguna baru <strong>" . htmlspecialchars($newUsername) . "</strong> (Role: " . strtoupper($newRole) . ") berhasil dibuat!";
                    }
                }
            } else {
                $error_msg = "⛔ Hak Akses Ditolak: Hanya Administrator yang berhak membuat user baru.";
            }
        }

        // 12. Edit Existing User (Admin Only)
        if ($act === 'edit_user') {
            if (isAdmin()) {
                $targetId = (int)($_POST['user_id'] ?? 0);
                $newName = trim($_POST['edit_name'] ?? '');
                $newRole = in_array($_POST['edit_role'] ?? '', ['admin', 'staff']) ? $_POST['edit_role'] : 'staff';
                $resetPass = trim($_POST['reset_password'] ?? '');

                if ($targetId == ($_SESSION['admin_id'] ?? 0) && $newRole !== 'admin') {
                    $error_msg = "Anda tidak dapat menurunkan role akun Anda sendiri menjadi Staff!";
                } else {
                    if (!empty($resetPass)) {
                        if (strlen($resetPass) < 6) {
                            $error_msg = "Password reset minimal 6 karakter!";
                        } else {
                            $passHash = password_hash($resetPass, PASSWORD_BCRYPT);
                            $stmt = $pdo->prepare("UPDATE admin_users SET name = ?, role = ?, password_hash = ? WHERE id = ?");
                            $stmt->execute([$newName, $newRole, $passHash, $targetId]);
                            $success_msg = "Pengguna ID #{$targetId} dan kata sandi berhasil diperbarui!";
                        }
                    } else {
                        $stmt = $pdo->prepare("UPDATE admin_users SET name = ?, role = ? WHERE id = ?");
                        $stmt->execute([$newName, $newRole, $targetId]);
                        $success_msg = "Pengguna ID #{$targetId} berhasil diperbarui!";
                    }
                }
            } else {
                $error_msg = "⛔ Hak Akses Ditolak: Hanya Administrator yang berhak mengubah data user.";
            }
        }

        // 13. Delete User (Admin Only)
        if ($act === 'delete_user') {
            if (isAdmin()) {
                $targetId = (int)($_POST['user_id'] ?? 0);
                $targetUsername = trim($_POST['target_username'] ?? '');

                if ($targetId == ($_SESSION['admin_id'] ?? 0) || $targetUsername === $_SESSION['admin_username']) {
                    $error_msg = "Anda tidak dapat menghapus akun yang sedang Anda gunakan saat ini!";
                } else {
                    // Check if it's the last admin
                    $adminCount = (int)$pdo->query("SELECT COUNT(*) FROM admin_users WHERE role = 'admin'")->fetchColumn();
                    $stmtCheck = $pdo->prepare("SELECT role FROM admin_users WHERE id = ?");
                    $stmtCheck->execute([$targetId]);
                    $targetRole = $stmtCheck->fetchColumn();

                    if ($targetRole === 'admin' && $adminCount <= 1) {
                        $error_msg = "Tidak dapat menghapus Administrator terakhir di sistem!";
                    } else {
                        $stmt = $pdo->prepare("DELETE FROM admin_users WHERE id = ?");
                        $stmt->execute([$targetId]);
                        $warn_msg = "Pengguna ID #{$targetId} (@{$targetUsername}) telah dihapus dari sistem.";
                    }
                }
            } else {
                $error_msg = "⛔ Hak Akses Ditolak: Hanya Administrator yang berhak menghapus user.";
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Portal Admin FotoSync PRO — Manajemen Lisensi & Pengguna</title>
  <link rel="icon" type="image/png" href="../assets/logo.png">
  
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  
  <style>
    /* DESIGN SYSTEM: PINE TEAL (#004643) & WARM CREAM (#F0EDE5) */
    :root {
      --pine-primary: #004643;
      --pine-hover: #003634;
      --pine-deep: #002221;
      --pine-surface: rgba(0, 70, 67, 0.08);
      --pine-border: rgba(0, 70, 67, 0.16);
      --pine-glow: rgba(0, 70, 67, 0.25);
      
      --cream-bg: #F0EDE5;
      --cream-surface: #FAF8F5;
      --card-white: #FFFFFF;
      
      --text-main: #0B2422;
      --text-muted: #4A6360;
      --text-dim: #7C9491;
      
      --accent-mint: #ABD1C6;
      --accent-gold: #F9BC60;
      --accent-danger: #E16162;
      --accent-success: #2A9D8F;

      --shadow-sm: 0 2px 8px rgba(0, 70, 67, 0.05);
      --shadow-md: 0 8px 24px -4px rgba(0, 70, 67, 0.08);
      --shadow-lg: 0 16px 36px -6px rgba(0, 70, 67, 0.12);
      
      --radius-sm: 8px;
      --radius-md: 14px;
      --radius-lg: 20px;
      --radius-full: 9999px;
      
      --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--cream-bg);
      color: var(--text-main);
      font-family: var(--font-sans);
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
    }

    /* LOGIN PAGE STYLES */
    .login-wrapper {
      width: 100%;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: radial-gradient(circle at top, rgba(0, 70, 67, 0.12) 0%, rgba(240, 237, 229, 1) 70%);
    }
    .login-card {
      background: var(--card-white);
      border: 1.5px solid var(--pine-border);
      border-radius: var(--radius-lg);
      padding: 42px 36px;
      max-width: 440px;
      width: 100%;
      box-shadow: var(--shadow-lg);
      text-align: center;
    }
    .login-logo {
      width: 56px;
      height: 56px;
      object-fit: contain;
      margin-bottom: 16px;
    }
    .login-title {
      font-size: 24px;
      font-weight: 800;
      color: var(--pine-primary);
      letter-spacing: -0.5px;
    }
    .login-desc {
      font-size: 14px;
      color: var(--text-muted);
      margin-top: 6px;
      margin-bottom: 28px;
    }
    .form-group {
      text-align: left;
      margin-bottom: 18px;
    }
    .form-label {
      display: block;
      font-size: 13px;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 6px;
    }
    .input-wrapper {
      position: relative;
    }
    .form-input {
      width: 100%;
      height: 46px;
      padding: 0 14px;
      border: 1.5px solid var(--pine-border);
      border-radius: var(--radius-sm);
      font-family: var(--font-sans);
      font-size: 14px;
      background: var(--cream-surface);
      color: var(--text-main);
      outline: none;
      transition: all 0.2s;
    }
    .form-input:focus {
      border-color: var(--pine-primary);
      background: #fff;
      box-shadow: 0 0 0 3px var(--pine-glow);
    }
    .toggle-pass-btn {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: var(--text-dim);
      cursor: pointer;
      font-size: 16px;
    }
    .btn-login {
      width: 100%;
      height: 48px;
      background: var(--pine-primary);
      color: var(--cream-bg);
      border: none;
      border-radius: var(--radius-sm);
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 4px 14px var(--pine-glow);
      transition: all 0.25s ease;
      margin-top: 10px;
    }
    .btn-login:hover {
      background: var(--pine-hover);
      transform: translateY(-1px);
      box-shadow: 0 6px 18px var(--pine-glow);
    }
    .login-footer-link {
      margin-top: 24px;
      font-size: 13px;
      color: var(--text-dim);
    }
    .login-footer-link a {
      color: var(--pine-primary);
      font-weight: 700;
      text-decoration: none;
    }

    /* DASHBOARD LAYOUT */
    .dashboard-layout {
      display: flex;
      width: 100%;
      min-height: 100vh;
    }

    /* SIDEBAR COMPONENT STYLES */
    .sidebar {
      width: 280px;
      background: var(--pine-primary);
      color: #fff;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      border-right: 1px solid rgba(255, 255, 255, 0.1);
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      z-index: 100;
      transition: all 0.3s ease;
    }
    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 24px 20px 18px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .brand-info h2 {
      font-size: 19px;
      font-weight: 800;
      color: #fff;
      line-height: 1.2;
    }
    .brand-info h2 span {
      background: var(--accent-mint);
      color: var(--pine-deep);
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      vertical-align: middle;
      font-weight: 800;
    }
    .brand-info p {
      font-size: 11.5px;
      color: var(--accent-mint);
      font-weight: 600;
    }

    /* USER SESSION CARD IN SIDEBAR */
    .user-session-card {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 16px;
      padding: 12px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: var(--radius-md);
    }
    .user-avatar {
      width: 38px;
      height: 38px;
      background: var(--accent-mint);
      color: var(--pine-deep);
      font-weight: 800;
      font-size: 17px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .user-name {
      font-size: 13.5px;
      font-weight: 800;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 150px;
    }
    .user-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 3px;
    }
    .role-badge {
      font-size: 10px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .role-admin {
      background: var(--accent-gold);
      color: #000;
    }
    .role-staff {
      background: var(--accent-mint);
      color: var(--pine-deep);
    }
    .user-handle {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.6);
      font-family: var(--font-mono);
    }

    .sidebar-nav {
      flex: 1;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .nav-section-label {
      font-size: 11px;
      font-weight: 800;
      color: rgba(255, 255, 255, 0.45);
      letter-spacing: 0.8px;
      padding: 10px 12px 4px 12px;
      text-transform: uppercase;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 14px;
      border-radius: var(--radius-sm);
      color: rgba(255, 255, 255, 0.8);
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s ease;
    }
    .nav-item:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }
    .nav-item.active {
      background: var(--cream-bg);
      color: var(--pine-primary);
      font-weight: 800;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    .nav-item.active svg {
      stroke: var(--pine-primary);
    }

    .sidebar-footer {
      padding: 18px 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    .status-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11.5px;
      font-weight: 700;
      color: var(--accent-mint);
      margin-bottom: 12px;
      padding: 6px 10px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: var(--radius-sm);
    }
    .status-dot {
      width: 7px;
      height: 7px;
      background: var(--accent-success);
      border-radius: 50%;
      box-shadow: 0 0 6px rgba(42, 157, 143, 0.8);
    }
    .btn-sidebar-logout {
      width: 100%;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(225, 97, 98, 0.15);
      border: 1px solid var(--accent-danger);
      color: #fff;
      border-radius: var(--radius-sm);
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
      transition: all 0.2s ease;
    }
    .btn-sidebar-logout:hover {
      background: var(--accent-danger);
      color: #fff;
    }

    /* MAIN CONTENT AREA */
    .content-area {
      flex: 1;
      padding: 30px 36px;
      overflow-y: auto;
      max-width: calc(100vw - 280px);
    }
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 28px;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--pine-border);
    }
    .page-title {
      font-size: 26px;
      font-weight: 800;
      color: var(--pine-primary);
      letter-spacing: -0.5px;
    }
    .page-subtitle {
      font-size: 14px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .top-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    /* ALERTS */
    .alert {
      padding: 14px 18px;
      border-radius: var(--radius-sm);
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 22px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .alert-success {
      background: #E8F5E9;
      border: 1px solid #A5D6A7;
      color: #2E7D32;
    }
    .alert-warning {
      background: #FFF8E1;
      border: 1px solid #FFE082;
      color: #F57F17;
    }
    .alert-danger {
      background: #FFEBEE;
      border: 1px solid #FFCDD2;
      color: #C62828;
    }

    /* STATS CARDS */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 18px;
      margin-bottom: 28px;
    }
    .stat-card {
      background: var(--card-white);
      border: 1px solid var(--pine-border);
      border-radius: var(--radius-md);
      padding: 18px 20px;
      box-shadow: var(--shadow-sm);
    }
    .stat-header {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--text-dim);
      letter-spacing: 0.5px;
    }
    .stat-value {
      font-size: 28px;
      font-weight: 800;
      color: var(--pine-primary);
      font-family: var(--font-mono);
      margin-top: 4px;
    }
    .stat-sub {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    /* CARD CONTAINER */
    .card {
      background: var(--card-white);
      border: 1px solid var(--pine-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm);
      margin-bottom: 28px;
    }
    .card-header {
      padding: 18px 22px;
      border-bottom: 1px solid var(--pine-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-title {
      font-size: 17px;
      font-weight: 800;
      color: var(--pine-primary);
    }
    .card-body {
      padding: 22px;
    }

    /* BUTTONS */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 18px;
      border-radius: var(--radius-sm);
      font-size: 13.5px;
      font-weight: 700;
      cursor: pointer;
      border: none;
      transition: all 0.2s ease;
      text-decoration: none;
    }
    .btn-primary {
      background: var(--pine-primary);
      color: var(--cream-bg);
      box-shadow: 0 4px 12px var(--pine-glow);
    }
    .btn-primary:hover {
      background: var(--pine-hover);
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: var(--cream-surface);
      color: var(--pine-primary);
      border: 1.5px solid var(--pine-border);
    }
    .btn-secondary:hover {
      background: var(--pine-surface);
    }
    .btn-danger {
      background: var(--accent-danger);
      color: #fff;
    }
    .btn-danger:hover {
      background: #c54a4b;
    }
    .btn-sm {
      padding: 6px 12px;
      font-size: 12px;
      border-radius: 6px;
    }

    /* DATA TABLES */
    .table-responsive {
      overflow-x: auto;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13.5px;
      text-align: left;
    }
    table.data-table th {
      background: var(--cream-surface);
      color: var(--text-muted);
      font-weight: 800;
      font-size: 11.5px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 12px 16px;
      border-bottom: 1.5px solid var(--pine-border);
    }
    table.data-table td {
      padding: 14px 16px;
      border-bottom: 1px solid rgba(0, 70, 67, 0.08);
      color: var(--text-main);
      vertical-align: middle;
    }
    table.data-table tr:hover td {
      background: rgba(0, 70, 67, 0.02);
    }

    /* BADGES */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 9px;
      border-radius: var(--radius-full);
      font-size: 11.5px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-active { background: #E8F5E9; color: #2E7D32; border: 1px solid #C8E6C9; }
    .badge-used { background: #E0F2FE; color: #0369A1; border: 1px solid #BAE6FD; }
    .badge-expired { background: #FFEBEE; color: #C62828; border: 1px solid #FFCDD2; }
    .badge-revoked { background: #F3F4F6; color: #4B5563; border: 1px solid #E5E7EB; }

    /* MODAL POPUPS */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 34, 33, 0.6);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
    }
    .modal-box {
      background: var(--card-white);
      border: 1.5px solid var(--pine-border);
      border-radius: var(--radius-lg);
      max-width: 520px;
      width: 100%;
      box-shadow: var(--shadow-lg);
      overflow: hidden;
      animation: modalFadeIn 0.25s ease;
    }
    @keyframes modalFadeIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    .modal-header {
      padding: 18px 24px;
      border-bottom: 1px solid var(--pine-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-header h3 {
      font-size: 18px;
      font-weight: 800;
      color: var(--pine-primary);
    }
    .modal-close-btn {
      background: none;
      border: none;
      font-size: 20px;
      color: var(--text-dim);
      cursor: pointer;
    }
    .modal-body {
      padding: 24px;
    }
    .modal-footer {
      padding: 16px 24px;
      border-top: 1px solid var(--pine-border);
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      background: var(--cream-surface);
    }

    .mobile-nav-toggle {
      display: none;
      background: var(--pine-primary);
      color: #fff;
      border: none;
      border-radius: var(--radius-sm);
      padding: 8px 12px;
      font-size: 18px;
      cursor: pointer;
    }

    @media (max-width: 992px) {
      .sidebar {
        position: fixed;
        left: -280px;
        top: 0;
        bottom: 0;
      }
      .sidebar.open {
        left: 0;
      }
      .content-area {
        max-width: 100vw;
        padding: 20px 16px;
      }
      .mobile-nav-toggle {
        display: block;
      }
      .stats-row {
        grid-template-columns: 1fr 1fr;
      }
    }

    @media (max-width: 576px) {
      .stats-row {
        grid-template-columns: 1fr;
      }
      .top-bar {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
      }
    }
  </style>
</head>
<body>

<?php if (!$isLoggedIn): ?>
  <!-- ========================================== -->
  <!-- 1. ADMIN LOGIN VIEW                         -->
  <!-- ========================================== -->
  <div class="login-wrapper">
    <div class="login-card">
      <img src="../assets/logo.png" alt="Logo FotoSync" class="login-logo">
      <h2 class="login-title">FotoSync PRO Portal</h2>
      <p class="login-desc">Masuk untuk mengelola lisensi, pengguna, dan versi aplikasi</p>

      <?php if (!empty($error_msg)): ?>
        <div class="alert alert-danger" style="margin-bottom: 20px; text-align: left;">
          <span>⚠️ <?= htmlspecialchars($error_msg) ?></span>
        </div>
      <?php endif; ?>

      <?php if (!empty($dbOffline)): ?>
        <div class="alert alert-warning" style="margin-bottom: 20px; text-align: left; font-size: 12.5px; line-height: 1.5;">
          <span>⚠️ <strong>MySQL Belum Aktif:</strong> Silakan aktifkan service MySQL di XAMPP Control Panel untuk koneksi database. Anda tetap dapat login dengan kredensial master.</span>
        </div>
      <?php endif; ?>

      <form method="POST" action="index.php">
        <div class="form-group">
          <label class="form-label" for="admin_user">Username</label>
          <input type="text" id="admin_user" name="admin_user" class="form-input" placeholder="admin" required autofocus>
        </div>

        <div class="form-group">
          <label class="form-label" for="admin_pass">Kata Sandi</label>
          <div class="input-wrapper">
            <input type="password" id="admin_pass" name="admin_pass" class="form-input" placeholder="••••••••" required>
            <button type="button" class="toggle-pass-btn" onclick="togglePassVisibility('admin_pass')">👁️</button>
          </div>
        </div>

        <button type="submit" class="btn-login">Masuk ke Portal Admin</button>
      </form>

      <div class="login-footer-link">
        <a href="../index.php">← Kembali ke Halaman Utama</a>
      </div>
    </div>
  </div>

  <script>
    function togglePassVisibility(id) {
      const inp = document.getElementById(id);
      inp.type = inp.type === 'password' ? 'text' : 'password';
    }
  </script>

<?php else: ?>
  <!-- ========================================== -->
  <!-- 2. AUTHENTICATED ADMIN DASHBOARD VIEW       -->
  <!-- ========================================== -->
  <div class="dashboard-layout">
    <!-- Include Modular Sidebar with Pine & Cream Theme -->
    <?php require_once __DIR__ . '/sidebar.php'; ?>

    <!-- Main Content Area -->
    <main class="content-area">
      <!-- Top Bar -->
      <div class="top-bar">
        <div style="display: flex; align-items: center; gap: 14px;">
          <button class="mobile-nav-toggle" onclick="toggleMobileSidebar()">☰</button>
          <div>
            <h1 class="page-title">
              <?php
                if ($currentTab === 'users') echo 'Kelola Pengguna (Users)';
                else if ($currentTab === 'profile') echo 'Edit Profil & Ubah Kata Sandi';
                else if ($currentTab === 'updater') echo 'Pengaturan Auto-Update Software';
                else if ($currentTab === 'telemetry') echo 'Riwayat Server Telemetry Log';
                else echo 'Manajemen Lisensi Master Key';
              ?>
            </h1>
            <p class="page-subtitle">
              Login sebagai: <strong><?= htmlspecialchars($adminDisplayName) ?></strong> (Role: <?= strtoupper($adminRole) ?>)
            </p>
          </div>
        </div>

        <div class="top-actions">
          <?php if ($currentTab === 'licenses'): ?>
            <button class="btn btn-primary" onclick="openGenerateModal()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>Buat Lisensi Baru</span>
            </button>
          <?php elseif ($currentTab === 'users' && isAdmin()): ?>
            <button class="btn btn-primary" onclick="openCreateUserModal()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>Tambah User Baru</span>
            </button>
          <?php endif; ?>
        </div>
      </div>

      <!-- Alerts Notifications -->
      <?php if (!empty($success_msg)): ?>
        <div class="alert alert-success">
          <span><?= $success_msg ?></span>
        </div>
      <?php endif; ?>
      <?php if (!empty($warn_msg)): ?>
        <div class="alert alert-warning">
          <span><?= $warn_msg ?></span>
        </div>
      <?php endif; ?>
      <?php if (!empty($error_msg)): ?>
        <div class="alert alert-danger">
          <span><?= $error_msg ?></span>
        </div>
      <?php endif; ?>

      <!-- TAB 1: MANAGE LICENSES -->
      <?php if ($currentTab === 'licenses'): ?>
        <?php
          // Query licenses data
          $statusFilter = $_GET['status'] ?? 'all';
          $searchQuery = trim($_GET['q'] ?? '');

          $sql = "SELECT * FROM licenses WHERE 1=1";
          $params = [];

          if ($statusFilter !== 'all') {
              $sql .= " AND status = ?";
              $params[] = $statusFilter;
          }
          if (!empty($searchQuery)) {
              $sql .= " AND (license_key LIKE ? OR buyer_name LIKE ? OR buyer_phone LIKE ?)";
              $params[] = "%$searchQuery%";
              $params[] = "%$searchQuery%";
              $params[] = "%$searchQuery%";
          }
          $sql .= " ORDER BY id DESC";
          $stmt = $pdo->prepare($sql);
          $stmt->execute($params);
          $licenses = $stmt->fetchAll();

          // Stats calculation
          $totalLicenses = (int)$pdo->query("SELECT COUNT(*) FROM licenses")->fetchColumn();
          $activeLicenses = (int)$pdo->query("SELECT COUNT(*) FROM licenses WHERE status = 'active'")->fetchColumn();
          $usedLicenses = (int)$pdo->query("SELECT COUNT(*) FROM licenses WHERE status = 'used'")->fetchColumn();
          $revokedLicenses = (int)$pdo->query("SELECT COUNT(*) FROM licenses WHERE status = 'revoked'")->fetchColumn();
        ?>

        <!-- Stats Overview -->
        <div class="stats-row">
          <div class="stat-card">
            <div class="stat-header">Total Lisensi Diterbitkan</div>
            <div class="stat-value"><?= number_format($totalLicenses) ?></div>
            <div class="stat-sub">Seluruh Master Key</div>
          </div>
          <div class="stat-card">
            <div class="stat-header">Lisensi Siap Pakai</div>
            <div class="stat-value" style="color: var(--accent-success);"><?= number_format($activeLicenses) ?></div>
            <div class="stat-sub">Belum Terikat HWID</div>
          </div>
          <div class="stat-card">
            <div class="stat-header">Lisensi Sedang Aktif</div>
            <div class="stat-value" style="color: #0284c7;"><?= number_format($usedLicenses) ?></div>
            <div class="stat-sub">Terpasang di Laptop Fotografer</div>
          </div>
          <div class="stat-card">
            <div class="stat-header">Lisensi Diblokir</div>
            <div class="stat-value" style="color: var(--accent-danger);"><?= number_format($revokedLicenses) ?></div>
            <div class="stat-sub">Status Revoked</div>
          </div>
        </div>

        <!-- Table Card -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Daftar Lisensi Master Key</h3>
            
            <!-- Filters -->
            <form method="GET" action="index.php" style="display: flex; gap: 10px; align-items: center;">
              <input type="hidden" name="tab" value="licenses">
              <input type="text" name="q" value="<?= htmlspecialchars($searchQuery) ?>" placeholder="Cari Key / Nama / HP..." class="form-input" style="height: 36px; width: 220px; font-size: 13px;">
              <select name="status" class="form-input" style="height: 36px; width: 140px; font-size: 13px;" onchange="this.form.submit()">
                <option value="all" <?= $statusFilter === 'all' ? 'selected' : '' ?>>Semua Status</option>
                <option value="active" <?= $statusFilter === 'active' ? 'selected' : '' ?>>Siap Pakai</option>
                <option value="used" <?= $statusFilter === 'used' ? 'selected' : '' ?>>Digunakan</option>
                <option value="revoked" <?= $statusFilter === 'revoked' ? 'selected' : '' ?>>Diblokir</option>
              </select>
              <button type="submit" class="btn btn-secondary btn-sm">Filter</button>
            </form>
          </div>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Kode Lisensi Master Key</th>
                  <th>Member / Pembeli</th>
                  <th>Paket</th>
                  <th>Masa Aktif</th>
                  <th>Status & HWID</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                <?php if (empty($licenses)): ?>
                  <tr>
                    <td colspan="7" style="text-align: center; padding: 36px; color: var(--text-dim);">
                      Belum ada data lisensi yang sesuai dengan kriteria pencarian.
                    </td>
                  </tr>
                <?php else: ?>
                  <?php foreach ($licenses as $lic): ?>
                    <?php
                      $exp = calculateLicenseExpiration($lic['activated_at'], $lic['duration_days'], $lic['expires_at']);
                      $badgeClass = 'badge-active';
                      if ($lic['status'] === 'used') $badgeClass = 'badge-used';
                      if ($lic['status'] === 'revoked') $badgeClass = 'badge-revoked';
                      if ($exp['is_expired']) $badgeClass = 'badge-expired';
                    ?>
                    <tr>
                      <td>#<?= $lic['id'] ?></td>
                      <td>
                        <strong style="font-family: var(--font-mono); color: var(--pine-primary); font-size: 14px;">
                          <?= htmlspecialchars($lic['license_key']) ?>
                        </strong>
                      </td>
                      <td>
                        <div style="font-weight: 700;"><?= htmlspecialchars($lic['buyer_name'] ?: 'Member') ?></div>
                        <div style="font-size: 12px; color: var(--text-dim);"><?= htmlspecialchars($lic['buyer_phone'] ?: '-') ?></div>
                      </td>
                      <td>
                        <span class="badge" style="background: var(--pine-surface); color: var(--pine-primary); border: 1px solid var(--pine-border);">
                          <?= strtoupper($lic['plan_tier']) ?>
                        </span>
                      </td>
                      <td>
                        <div style="font-weight: 700; font-size: 13px;"><?= $exp['status_label'] ?></div>
                        <?php if (!empty($lic['expires_at'])): ?>
                          <div style="font-size: 11px; color: var(--text-dim);">Exp: <?= date('d M Y', strtotime($lic['expires_at'])) ?></div>
                        <?php endif; ?>
                      </td>
                      <td>
                        <span class="badge <?= $badgeClass ?>"><?= strtoupper($lic['status']) ?></span>
                        <?php if (!empty($lic['hwid'])): ?>
                          <div style="font-size: 11px; font-family: var(--font-mono); color: var(--text-dim); margin-top: 4px;" title="<?= htmlspecialchars($lic['hwid']) ?>">
                            HWID: <?= substr($lic['hwid'], 0, 10) ?>...
                          </div>
                        <?php endif; ?>
                      </td>
                      <td>
                        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                          <!-- Reset HWID (Unbind) -->
                          <?php if (!empty($lic['hwid'])): ?>
                            <form method="POST" onsubmit="return confirm('Reset HWID perangkat untuk lisensi ini?');">
                              <input type="hidden" name="action" value="unbind">
                              <input type="hidden" name="license_id" value="<?= $lic['id'] ?>">
                              <button type="submit" class="btn btn-secondary btn-sm" title="Lepas Ikatan HWID Perangkat">Unbind</button>
                            </form>
                          <?php endif; ?>

                          <!-- Extend / Lifetime Modal Trigger -->
                          <button class="btn btn-secondary btn-sm" onclick="openExtendModal(<?= $lic['id'] ?>, '<?= htmlspecialchars($lic['license_key']) ?>')">Perpanjang</button>

                          <!-- Revoke / Reactivate -->
                          <?php if ($lic['status'] === 'revoked'): ?>
                            <form method="POST">
                              <input type="hidden" name="action" value="reactivate">
                              <input type="hidden" name="license_id" value="<?= $lic['id'] ?>">
                              <button type="submit" class="btn btn-secondary btn-sm">Aktifkan</button>
                            </form>
                          <?php else: ?>
                            <form method="POST" onsubmit="return confirm('Blokir lisensi ini?');">
                              <input type="hidden" name="action" value="revoke">
                              <input type="hidden" name="license_id" value="<?= $lic['id'] ?>">
                              <button type="submit" class="btn btn-secondary btn-sm" style="color: var(--accent-danger);">Blokir</button>
                            </form>
                          <?php endif; ?>

                          <!-- Delete (Admin Only) -->
                          <?php if (isAdmin()): ?>
                            <form method="POST" onsubmit="return confirm('Yakin ingin MENGHAPUS PERMANEN lisensi ini?');">
                              <input type="hidden" name="action" value="delete">
                              <input type="hidden" name="license_id" value="<?= $lic['id'] ?>">
                              <button type="submit" class="btn btn-danger btn-sm">Hapus</button>
                            </form>
                          <?php endif; ?>
                        </div>
                      </td>
                    </tr>
                  <?php endforeach; ?>
                <?php endif; ?>
              </tbody>
            </table>
          </div>
        </div>

      <!-- TAB 2: MANAGE USERS (ADMIN ONLY) -->
      <?php elseif ($currentTab === 'users' && isAdmin()): ?>
        <?php
          $users = $pdo->query("SELECT * FROM admin_users ORDER BY id ASC")->fetchAll();
          $totalUsers = count($users);
          $adminCount = 0;
          $staffCount = 0;
          foreach ($users as $u) {
              if (($u['role'] ?? 'admin') === 'admin') $adminCount++;
              else $staffCount++;
          }
        ?>

        <!-- User Stats -->
        <div class="stats-row">
          <div class="stat-card">
            <div class="stat-header">Total Pengguna Terdaftar</div>
            <div class="stat-value"><?= $totalUsers ?></div>
            <div class="stat-sub">Akun Admin & Staff</div>
          </div>
          <div class="stat-card">
            <div class="stat-header">Administrator</div>
            <div class="stat-value" style="color: var(--pine-primary);"><?= $adminCount ?></div>
            <div class="stat-sub">Hak Akses Penuh</div>
          </div>
          <div class="stat-card">
            <div class="stat-header">Staff CS / Operasional</div>
            <div class="stat-value" style="color: #0284c7;"><?= $staffCount ?></div>
            <div class="stat-sub">Hak Akses Terbatas</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Daftar Pengguna Portal Admin</h3>
            <button class="btn btn-primary btn-sm" onclick="openCreateUserModal()">+ Tambah Pengguna</button>
          </div>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nama Lengkap</th>
                  <th>Username</th>
                  <th>Role Hak Akses</th>
                  <th>Tanggal Dibuat</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                <?php foreach ($users as $u): ?>
                  <tr>
                    <td>#<?= $u['id'] ?></td>
                    <td>
                      <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="user-avatar" style="width: 32px; height: 32px; font-size: 14px;">
                          <?= strtoupper(substr($u['name'], 0, 1)) ?>
                        </div>
                        <strong><?= htmlspecialchars($u['name']) ?></strong>
                        <?php if ($u['id'] == ($_SESSION['admin_id'] ?? 0)): ?>
                          <span style="font-size: 11px; background: var(--pine-surface); color: var(--pine-primary); padding: 2px 6px; border-radius: 4px; font-weight: 700;">(Anda)</span>
                        <?php endif; ?>
                      </div>
                    </td>
                    <td><code style="font-family: var(--font-mono); font-weight: 700;">@<?= htmlspecialchars($u['username']) ?></code></td>
                    <td>
                      <span class="role-badge <?= ($u['role'] ?? 'admin') === 'admin' ? 'role-admin' : 'role-staff' ?>">
                        <?= ($u['role'] ?? 'admin') === 'admin' ? '🛡️ Administrator' : '👤 Staff CS' ?>
                      </span>
                    </td>
                    <td style="font-size: 12.5px; color: var(--text-dim);">
                      <?= date('d M Y, H:i', strtotime($u['created_at'])) ?>
                    </td>
                    <td>
                      <div style="display: flex; gap: 6px;">
                        <button class="btn btn-secondary btn-sm" onclick="openEditUserModal(<?= $u['id'] ?>, '<?= htmlspecialchars($u['username']) ?>', '<?= htmlspecialchars($u['name']) ?>', '<?= htmlspecialchars($u['role'] ?? 'admin') ?>')">Edit</button>

                        <?php if ($u['id'] != ($_SESSION['admin_id'] ?? 0) && $u['username'] !== $_SESSION['admin_username']): ?>
                          <form method="POST" onsubmit="return confirm('Hapus akun user <?= htmlspecialchars($u['username']) ?>?');">
                            <input type="hidden" name="action" value="delete_user">
                            <input type="hidden" name="user_id" value="<?= $u['id'] ?>">
                            <input type="hidden" name="target_username" value="<?= htmlspecialchars($u['username']) ?>">
                            <button type="submit" class="btn btn-danger btn-sm">Hapus</button>
                          </form>
                        <?php endif; ?>
                      </div>
                    </td>
                  </tr>
                <?php endforeach; ?>
              </tbody>
            </table>
          </div>
        </div>

      <!-- TAB 3: EDIT PROFILE & PASSWORD (ALL USERS) -->
      <?php elseif ($currentTab === 'profile'): ?>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; max-width: 900px;">
          <!-- Edit Name Card -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Profil Saya</h3>
            </div>
            <div class="card-body">
              <form method="POST">
                <input type="hidden" name="action" value="update_profile">

                <div class="form-group">
                  <label class="form-label">Username</label>
                  <input type="text" class="form-input" value="<?= htmlspecialchars($adminUsername) ?>" disabled style="background: rgba(0,0,0,0.05);">
                </div>

                <div class="form-group">
                  <label class="form-label">Role Akses</label>
                  <div style="margin-top: 4px;">
                    <span class="role-badge <?= $adminRole === 'admin' ? 'role-admin' : 'role-staff' ?>" style="font-size: 13px; padding: 4px 10px;">
                      <?= $adminRole === 'admin' ? '🛡️ Administrator' : '👤 Staff Server' ?>
                    </span>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">Nama Lengkap Tampilan</label>
                  <input type="text" name="display_name" class="form-input" value="<?= htmlspecialchars($adminDisplayName) ?>" required>
                </div>

                <button type="submit" class="btn btn-primary" style="width: 100%;">Simpan Perubahan Nama</button>
              </form>
            </div>
          </div>

          <!-- Change Password Card -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Ubah Kata Sandi</h3>
            </div>
            <div class="card-body">
              <form method="POST">
                <input type="hidden" name="action" value="change_password">

                <div class="form-group">
                  <label class="form-label">Kata Sandi Saat Ini (Lama)</label>
                  <input type="password" name="current_password" class="form-input" placeholder="••••••••" required>
                </div>

                <div class="form-group">
                  <label class="form-label">Kata Sandi Baru</label>
                  <input type="password" name="new_password" class="form-input" placeholder="Minimal 6 karakter" required>
                </div>

                <div class="form-group">
                  <label class="form-label">Konfirmasi Kata Sandi Baru</label>
                  <input type="password" name="confirm_password" class="form-input" placeholder="Ulangi kata sandi baru" required>
                </div>

                <button type="submit" class="btn btn-primary" style="width: 100%;">Perbarui Kata Sandi</button>
              </form>
            </div>
          </div>
        </div>

      <!-- TAB 4: AUTO-UPDATER CONFIG (ADMIN ONLY) -->
      <?php elseif ($currentTab === 'updater' && isAdmin()): ?>
        <?php
          $configFile = __DIR__ . '/../data/version_config.json';
          $cfg = [
              'latest_version' => '1.3.0',
              'min_required_version' => '1.0.0',
              'windows_download_url' => '',
              'mac_download_url' => '',
              'release_notes' => '',
              'is_mandatory' => false
          ];
          if (file_exists($configFile)) {
              $loaded = json_decode(file_get_contents($configFile), true);
              if ($loaded) $cfg = array_merge($cfg, $loaded);
          }
        ?>
        <div class="card" style="max-width: 800px;">
          <div class="card-header">
            <h3 class="card-title">Konfigurasi Rilis Auto-Update Multi-Platform</h3>
          </div>
          <div class="card-body">
            <form method="POST">
              <input type="hidden" name="action" value="save_version">

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div class="form-group">
                  <label class="form-label">Versi Terbaru Aplikasi (Latest Version)</label>
                  <input type="text" name="latest_version" class="form-input" value="<?= htmlspecialchars($cfg['latest_version']) ?>" required placeholder="Contoh: 1.3.0">
                </div>
                <div class="form-group">
                  <label class="form-label">Versi Minimum Diperlukan</label>
                  <input type="text" name="min_required_version" class="form-input" value="<?= htmlspecialchars($cfg['min_required_version']) ?>" required placeholder="Contoh: 1.0.0">
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">URL Unduh Windows (.exe Installer)</label>
                <input type="url" name="windows_download_url" class="form-input" value="<?= htmlspecialchars($cfg['windows_download_url'] ?? $cfg['download_url'] ?? '') ?>" placeholder="https://github.com/.../Setup.exe" required>
              </div>

              <div class="form-group">
                <label class="form-label">URL Unduh macOS (.dmg Installer)</label>
                <input type="url" name="mac_download_url" class="form-input" value="<?= htmlspecialchars($cfg['mac_download_url'] ?? '') ?>" placeholder="https://github.com/.../Fotoyu.dmg">
              </div>

              <div class="form-group">
                <label class="form-label">Catatan Rilis (Release Notes)</label>
                <textarea name="release_notes" class="form-input" style="height: 100px; padding: 10px;" placeholder="• Perbaikan fitur Live Shutter..."><?= htmlspecialchars($cfg['release_notes']) ?></textarea>
              </div>

              <button type="submit" class="btn btn-primary">Simpan & Publikasikan Versi Baru</button>
            </form>
          </div>
        </div>

      <!-- TAB 5: TELEMETRY LOG -->
      <?php elseif ($currentTab === 'telemetry'): ?>
        <?php
          ensureTelemetryLogsTable($pdo);
          $logs = $pdo->query("SELECT * FROM telemetry_logs ORDER BY id DESC LIMIT 100")->fetchAll();
        ?>
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Log Aktivitas & Permintaan Lisensi (Terakhir 100)</h3>
            <?php if (isAdmin()): ?>
              <form method="POST" onsubmit="return confirm('Bersihkan seluruh riwayat log telemetry?');">
                <input type="hidden" name="action" value="clear_logs">
                <button type="submit" class="btn btn-secondary btn-sm" style="color: var(--accent-danger);">Bersihkan Log</button>
              </form>
            <?php endif; ?>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Lisensi Key</th>
                  <th>Pesan / Keterangan</th>
                  <th>IP Address</th>
                </tr>
              </thead>
              <tbody>
                <?php if (empty($logs)): ?>
                  <tr><td colspan="6" style="text-align: center; padding: 30px; color: var(--text-dim);">Belum ada log tercatat.</td></tr>
                <?php else: ?>
                  <?php foreach ($logs as $l): ?>
                    <tr>
                      <td style="font-size: 12px; color: var(--text-dim);"><?= date('d/m/Y H:i:s', strtotime($l['created_at'])) ?></td>
                      <td><strong><?= htmlspecialchars($l['action_type']) ?></strong></td>
                      <td>
                        <span class="badge <?= $l['status'] === 'SUCCESS' ? 'badge-active' : 'badge-expired' ?>">
                          <?= htmlspecialchars($l['status']) ?>
                        </span>
                      </td>
                      <td><code style="font-family: var(--font-mono);"><?= htmlspecialchars($l['license_key'] ?: '-') ?></code></td>
                      <td style="font-size: 13px;"><?= htmlspecialchars($l['message'] ?: '-') ?></td>
                      <td style="font-size: 12px; color: var(--text-dim);"><?= htmlspecialchars($l['ip_address']) ?></td>
                    </tr>
                  <?php endforeach; ?>
                <?php endif; ?>
              </tbody>
            </table>
          </div>
        </div>
      <?php endif; ?>
    </main>
  </div>

  <!-- MODAL: GENERATE MASTER KEY -->
  <div id="generateModal" class="modal-overlay">
    <div class="modal-box">
      <div class="modal-header">
        <h3>Terbitkan Master Key Baru</h3>
        <button class="modal-close-btn" onclick="closeGenerateModal()">✕</button>
      </div>
      <form method="POST">
        <input type="hidden" name="action" value="generate">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Nama Member / Fotografer</label>
            <input type="text" name="buyer_name" class="form-input" placeholder="Contoh: Budi Santoso" required>
          </div>
          <div class="form-group">
            <label class="form-label">Nomor WhatsApp Member</label>
            <input type="text" name="buyer_phone" class="form-input" placeholder="081234567890">
          </div>
          <div class="form-group">
            <label class="form-label">Pilihan Paket Lisensi</label>
            <select name="plan_tier" class="form-input" id="planSelect" onchange="updateDurationPreset(this.value)">
              <option value="7_days">PRO (7 Hari) — Rp 99.000</option>
              <option value="1_day">EXPRESS (1 Hari) — Rp 25.000</option>
              <option value="30_days">MONTHLY PRO (30 Hari) — Rp 299.000</option>
              <option value="free">TRIAL (1 Hari Kuota 20)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Masa Aktif</label>
            <select name="duration_days_preset" class="form-input" id="durationSelect">
              <option value="auto">Sesuai Paket (Otomatis)</option>
              <option value="1">1 Hari</option>
              <option value="7">7 Hari</option>
              <option value="30">30 Hari</option>
              <option value="0">LIFETIME (Permanen Tanpa Batas Waktu)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Catatan Tambahan (Opsional)</label>
            <input type="text" name="notes" class="form-input" placeholder="Event Marathon Bali 2026">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeGenerateModal()">Batal</button>
          <button type="submit" class="btn btn-primary">Terbitkan Lisensi</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: EXTEND LICENSE -->
  <div id="extendModal" class="modal-overlay">
    <div class="modal-box">
      <div class="modal-header">
        <h3>Perpanjang Masa Aktif Lisensi</h3>
        <button class="modal-close-btn" onclick="closeExtendModal()">✕</button>
      </div>
      <form method="POST">
        <input type="hidden" name="action" value="extend">
        <input type="hidden" name="license_id" id="extendLicId">
        <div class="modal-body">
          <p style="margin-bottom: 14px; font-size: 14px; color: var(--text-muted);">
            Lisensi: <strong id="extendLicKeyText" style="color: var(--pine-primary); font-family: var(--font-mono);"></strong>
          </p>
          <div class="form-group">
            <label class="form-label">Tambahan Durasi Masa Aktif</label>
            <select name="extend_days" class="form-input">
              <option value="7">+ 7 Hari</option>
              <option value="30" selected>+ 30 Hari (1 Bulan)</option>
              <option value="90">+ 90 Hari (3 Bulan)</option>
              <option value="365">+ 365 Hari (1 Tahun)</option>
              <option value="0">Ubah Menjadi LIFETIME (Permanen)</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeExtendModal()">Batal</button>
          <button type="submit" class="btn btn-primary">Simpan Perpanjangan</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: CREATE NEW USER (ADMIN ONLY) -->
  <?php if (isAdmin()): ?>
  <div id="createUserModal" class="modal-overlay">
    <div class="modal-box">
      <div class="modal-header">
        <h3>Tambah Pengguna Baru</h3>
        <button class="modal-close-btn" onclick="closeCreateUserModal()">✕</button>
      </div>
      <form method="POST">
        <input type="hidden" name="action" value="create_user">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Username (Login)</label>
            <input type="text" name="new_username" class="form-input" placeholder="contoh: staff_jkt" required autocomplete="off">
          </div>
          <div class="form-group">
            <label class="form-label">Nama Lengkap</label>
            <input type="text" name="new_name" class="form-input" placeholder="contoh: Ahmad Pratama" required>
          </div>
          <div class="form-group">
            <label class="form-label">Kata Sandi Awal</label>
            <input type="password" name="new_password" class="form-input" placeholder="Minimal 6 karakter" required>
          </div>
          <div class="form-group">
            <label class="form-label">Role Hak Akses</label>
            <select name="new_role" class="form-input">
              <option value="staff" selected>👤 Staff CS (Lisensi & Unbind HWID)</option>
              <option value="admin">🛡️ Administrator (Akses Penuh Server)</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeCreateUserModal()">Batal</button>
          <button type="submit" class="btn btn-primary">Buat Pengguna</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: EDIT USER (ADMIN ONLY) -->
  <div id="editUserModal" class="modal-overlay">
    <div class="modal-box">
      <div class="modal-header">
        <h3>Edit Pengguna</h3>
        <button class="modal-close-btn" onclick="closeEditUserModal()">✕</button>
      </div>
      <form method="POST">
        <input type="hidden" name="action" value="edit_user">
        <input type="hidden" name="user_id" id="editUserId">
        <div class="modal-body">
          <p style="margin-bottom: 14px; font-size: 14px; color: var(--text-muted);">
            Username: <strong id="editUsernameText" style="color: var(--pine-primary); font-family: var(--font-mono);"></strong>
          </p>
          <div class="form-group">
            <label class="form-label">Nama Lengkap</label>
            <input type="text" name="edit_name" id="editNameInput" class="form-input" required>
          </div>
          <div class="form-group">
            <label class="form-label">Role Hak Akses</label>
            <select name="edit_role" id="editRoleSelect" class="form-input">
              <option value="staff">👤 Staff CS (Lisensi & Unbind HWID)</option>
              <option value="admin">🛡️ Administrator (Akses Penuh)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Reset Kata Sandi Baru (Kosongkan jika tidak diubah)</label>
            <input type="password" name="reset_password" class="form-input" placeholder="Minimal 6 karakter jika diisi">
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeEditUserModal()">Batal</button>
          <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
        </div>
      </form>
    </div>
  </div>
  <?php endif; ?>

  <script>
    function toggleMobileSidebar() {
      const sb = document.getElementById('adminSidebar');
      sb.classList.toggle('open');
    }

    // Generate Modal
    function openGenerateModal() {
      document.getElementById('generateModal').style.display = 'flex';
    }
    function closeGenerateModal() {
      document.getElementById('generateModal').style.display = 'none';
    }

    // Extend Modal
    function openExtendModal(id, key) {
      document.getElementById('extendLicId').value = id;
      document.getElementById('extendLicKeyText').textContent = key;
      document.getElementById('extendModal').style.display = 'flex';
    }
    function closeExtendModal() {
      document.getElementById('extendModal').style.display = 'none';
    }

    // Create User Modal
    function openCreateUserModal() {
      const modal = document.getElementById('createUserModal');
      if (modal) modal.style.display = 'flex';
    }
    function closeCreateUserModal() {
      const modal = document.getElementById('createUserModal');
      if (modal) modal.style.display = 'none';
    }

    // Edit User Modal
    function openEditUserModal(id, username, name, role) {
      const modal = document.getElementById('editUserModal');
      if (modal) {
        document.getElementById('editUserId').value = id;
        document.getElementById('editUsernameText').textContent = '@' + username;
        document.getElementById('editNameInput').value = name;
        document.getElementById('editRoleSelect').value = role;
        modal.style.display = 'flex';
      }
    }
    function closeEditUserModal() {
      const modal = document.getElementById('editUserModal');
      if (modal) modal.style.display = 'none';
    }
  </script>
<?php endif; ?>

</body>
</html>
