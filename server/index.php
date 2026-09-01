<?php
// FotoSync PRO Product Landing Page
// Theme: Deep Pine (#004643) & Warm Cream (#F0EDE5)
require_once __DIR__ . '/config.php';

// Fetch dynamic version config
$configFile = __DIR__ . '/data/version_config.json';
$defaultWin = 'https://github.com/ghazabegins/fotoyu-auto-uploader/releases/download/v1.3.0/Fotoyu.Uploader.Pro.Setup.1.3.0.exe';
$defaultMacArm = 'https://github.com/ghazabegins/fotoyu-auto-uploader/releases/download/v1.3.0/Fotoyu.Uploader.Pro-1.3.0-arm64.dmg';
$defaultMacIntel = 'https://github.com/ghazabegins/fotoyu-auto-uploader/releases/download/v1.3.0/Fotoyu.Uploader.Pro-1.3.0.dmg';

$versionData = [
    'latest_version' => '1.3.0',
    'windows_download_url' => $defaultWin,
    'mac_download_url' => $defaultMacArm,
    'mac_intel_download_url' => $defaultMacIntel,
    'release_notes' => "• Pembedaan Sistem Lengkap: Kamera USB Direct (Live Shutter) vs SD Card Reader (Batch Ingest)\n• Otomatisasi Input Folder Target ke Dashboard & Antrean Upload\n• Integrasi Penuh macOS: Apple ImageCaptureCore Camera Bridge (Swift)\n• Otomatisasi Build CI/CD Multi-platform (Windows .exe & macOS .dmg)\n• Optimasi Ukuran Installer (>70% Lebih Ringan) & Launcher 1-Klik macOS",
    'released_at' => '2026-09-01'
];

if (file_exists($configFile)) {
    $loaded = json_decode(file_get_contents($configFile), true);
    if ($loaded && is_array($loaded)) {
        $versionData = array_merge($versionData, $loaded);
        if (empty($versionData['windows_download_url']) && !empty($versionData['download_url'])) {
            $versionData['windows_download_url'] = $versionData['download_url'];
        }
        if (empty($versionData['mac_download_url'])) {
            $versionData['mac_download_url'] = $defaultMacArm;
        }
    }
}

// Quick server-side detection fallback
$ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
$isServerMobile = preg_match('/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i', $ua);
$isServerMac = strpos($ua, 'mac') !== false && !$isServerMobile;
$isServerWin = strpos($ua, 'win') !== false && !$isServerMobile;
?>
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FotoSync PRO — Software Auto-Sync & Real-Time Uploader untuk Fotografer Event</title>
  <meta name="description" content="Software desktop uploader foto real-time untuk Windows dan macOS. Mendukung Live Shutter USB kabel langsung, WiFi FTP server kamera, dan integrasi API Fotoyu.">
  
  <link rel="icon" type="image/png" href="assets/logo.png">
  <link rel="shortcut icon" type="image/png" href="assets/logo.png">
  
  <!-- Google Fonts: Plus Jakarta Sans & JetBrains Mono -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  
  <style>
    /* DESIGN SYSTEM: PINE TEAL (#004643) & WARM CREAM (#F0EDE5) */
    :root {
      --pine-primary: #004643;
      --pine-hover: #003734;
      --pine-deep: #002b29;
      --pine-surface: rgba(0, 70, 67, 0.06);
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
      --shadow-xl: 0 24px 48px -8px rgba(0, 70, 67, 0.16);
      
      --radius-sm: 8px;
      --radius-md: 14px;
      --radius-lg: 20px;
      --radius-full: 9999px;
      
      --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      background-color: var(--cream-bg);
      color: var(--text-main);
      font-family: var(--font-sans);
      line-height: 1.6;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }

    /* BACKGROUND GLOW ACCENTS */
    .ambient-glow {
      position: absolute;
      top: -150px;
      left: 50%;
      transform: translateX(-50%);
      width: 1000px;
      height: 600px;
      background: radial-gradient(circle, rgba(0, 70, 67, 0.12) 0%, rgba(171, 209, 198, 0.08) 50%, rgba(240, 237, 229, 0) 75%);
      filter: blur(100px);
      pointer-events: none;
      z-index: 0;
    }

    .container {
      max-width: 1240px;
      margin: 0 auto;
      padding: 0 24px;
      position: relative;
      z-index: 1;
    }

    /* NAVBAR */
    .navbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 18px 0;
      border-bottom: 1px solid var(--pine-border);
      position: sticky;
      top: 0;
      background: rgba(240, 237, 229, 0.92);
      backdrop-filter: blur(14px);
      z-index: 1000;
    }
    .nav-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: var(--pine-primary);
    }
    .nav-brand img {
      width: 40px;
      height: 40px;
      object-fit: contain;
    }
    .nav-brand h1 {
      font-size: 21px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: var(--pine-primary);
    }
    .nav-brand h1 span {
      color: #fff;
      font-size: 11px;
      background: var(--pine-primary);
      padding: 3px 8px;
      border-radius: 6px;
      margin-left: 6px;
      vertical-align: middle;
      font-weight: 800;
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 28px;
      list-style: none;
    }
    .nav-links a {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 14.5px;
      font-weight: 700;
      transition: all 0.2s;
    }
    .nav-links a:hover {
      color: var(--pine-primary);
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .btn-nav-admin {
      background: transparent;
      color: var(--pine-primary);
      text-decoration: none;
      padding: 9px 18px;
      border-radius: var(--radius-full);
      font-size: 13.5px;
      font-weight: 700;
      border: 1.5px solid var(--pine-primary);
      transition: all 0.25s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-nav-admin:hover {
      background: var(--pine-surface);
      transform: translateY(-1px);
    }

    .btn-nav-cta {
      background: var(--pine-primary);
      color: var(--cream-bg);
      text-decoration: none;
      padding: 10px 22px;
      border-radius: var(--radius-full);
      font-size: 13.5px;
      font-weight: 800;
      box-shadow: 0 4px 14px var(--pine-glow);
      transition: all 0.25s ease;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .btn-nav-cta:hover {
      background: var(--pine-hover);
      transform: translateY(-2px);
      box-shadow: 0 6px 18px var(--pine-glow);
    }

    .mobile-menu-btn {
      display: none;
      background: transparent;
      border: 1.5px solid var(--pine-border);
      border-radius: var(--radius-sm);
      color: var(--pine-primary);
      font-size: 20px;
      padding: 6px 12px;
      cursor: pointer;
    }

    /* HERO SECTION */
    .hero-section {
      text-align: center;
      padding: 65px 0 45px 0;
    }
    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--card-white);
      border: 1px solid var(--pine-border);
      color: var(--pine-primary);
      padding: 6px 18px;
      border-radius: var(--radius-full);
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 24px;
      box-shadow: var(--shadow-sm);
    }
    .badge-dot {
      width: 8px;
      height: 8px;
      background: var(--accent-success);
      border-radius: 50%;
      display: inline-block;
      box-shadow: 0 0 8px rgba(42, 157, 143, 0.6);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.2); }
    }

    .hero-title {
      font-size: 52px;
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: -1.2px;
      color: var(--text-main);
      max-width: 900px;
      margin: 0 auto 20px auto;
    }
    .hero-title span.highlight {
      color: var(--pine-primary);
      background: linear-gradient(120deg, rgba(0, 70, 67, 0.1) 0%, rgba(171, 209, 198, 0.4) 100%);
      padding: 0 8px;
      border-radius: 8px;
      display: inline-block;
    }

    .hero-subtitle {
      font-size: 18px;
      color: var(--text-muted);
      max-width: 760px;
      margin: 0 auto 36px auto;
      font-weight: 500;
      line-height: 1.6;
    }

    /* SMART DOWNLOAD CTA AREA */
    .download-cta-box {
      background: var(--card-white);
      border: 1.5px solid var(--pine-border);
      border-radius: var(--radius-lg);
      padding: 30px;
      max-width: 780px;
      margin: 0 auto 50px auto;
      box-shadow: var(--shadow-lg);
      text-align: center;
    }
    .device-indicator {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 13.5px;
      font-weight: 700;
      color: var(--pine-primary);
      background: var(--pine-surface);
      padding: 5px 14px;
      border-radius: var(--radius-full);
      margin-bottom: 20px;
    }

    .btn-download-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: var(--pine-primary);
      color: var(--cream-bg);
      text-decoration: none;
      padding: 16px 36px;
      border-radius: var(--radius-md);
      font-size: 17px;
      font-weight: 800;
      box-shadow: 0 10px 26px var(--pine-glow);
      transition: all 0.25s ease;
      cursor: pointer;
      border: none;
    }
    .btn-download-primary:hover {
      background: var(--pine-hover);
      transform: translateY(-3px);
      box-shadow: 0 14px 32px var(--pine-glow);
    }
    .btn-download-primary svg {
      width: 24px;
      height: 24px;
    }

    .btn-download-secondary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: var(--cream-surface);
      color: var(--pine-primary);
      text-decoration: none;
      padding: 14px 26px;
      border-radius: var(--radius-md);
      font-size: 15px;
      font-weight: 700;
      border: 1.5px solid var(--pine-border);
      transition: all 0.2s ease;
      margin-top: 10px;
    }
    .btn-download-secondary:hover {
      background: var(--pine-surface);
      border-color: var(--pine-primary);
    }

    /* Dual Buttons Container for Mobile & Multi-OS */
    .dual-download-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-top: 10px;
    }
    .os-card-btn {
      background: var(--cream-surface);
      border: 1.5px solid var(--pine-border);
      border-radius: var(--radius-md);
      padding: 18px 20px;
      text-align: left;
      text-decoration: none;
      color: var(--text-main);
      transition: all 0.25s ease;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .os-card-btn:hover {
      border-color: var(--pine-primary);
      background: var(--card-white);
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }
    .os-card-btn.active-target {
      background: var(--pine-primary);
      color: #fff;
      border-color: var(--pine-primary);
      box-shadow: 0 8px 20px var(--pine-glow);
    }
    .os-card-btn.active-target .os-meta {
      color: var(--accent-mint);
    }
    .os-icon {
      font-size: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .os-info h4 {
      font-size: 16px;
      font-weight: 800;
    }
    .os-meta {
      font-size: 12px;
      color: var(--text-dim);
      font-weight: 600;
      margin-top: 2px;
    }

    .mac-chip-selector {
      margin-top: 12px;
      font-size: 13px;
      color: var(--text-muted);
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .mac-chip-selector a {
      color: var(--pine-primary);
      font-weight: 700;
      text-decoration: underline;
    }

    .download-specs-note {
      font-size: 12.5px;
      color: var(--text-dim);
      margin-top: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    .download-specs-note span {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    /* MOCKUP SHOWCASE CARD */
    .mockup-preview {
      background: #111A18;
      border: 2px solid var(--pine-primary);
      border-radius: var(--radius-lg);
      padding: 16px;
      box-shadow: var(--shadow-xl);
      max-width: 960px;
      margin: 0 auto 80px auto;
      color: #F0EDE5;
      text-align: left;
    }
    .mockup-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      margin-bottom: 16px;
    }
    .mockup-dot {
      width: 11px;
      height: 11px;
      border-radius: 50%;
    }
    .mockup-dot.red { background: #FF5F56; }
    .mockup-dot.yellow { background: #FFBD2E; }
    .mockup-dot.green { background: #27C93F; }
    .mockup-title-bar {
      font-size: 12px;
      color: #9DB4B0;
      margin-left: 12px;
      font-family: var(--font-mono);
      font-weight: 600;
    }

    .mockup-body {
      display: grid;
      grid-template-columns: 240px 1fr;
      gap: 16px;
      min-height: 260px;
    }
    .mockup-sidebar {
      background: #182624;
      border-radius: var(--radius-sm);
      padding: 14px;
      font-size: 12.5px;
    }
    .mockup-main {
      background: #182624;
      border-radius: var(--radius-sm);
      padding: 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .mockup-stat-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 14px;
    }
    .mockup-stat-box {
      background: #203330;
      padding: 12px;
      border-radius: var(--radius-sm);
      border-left: 3px solid var(--accent-mint);
    }
    .mockup-stat-box .num {
      font-size: 22px;
      font-weight: 800;
      color: #fff;
      font-family: var(--font-mono);
    }
    .mockup-stat-box .lbl {
      font-size: 11px;
      color: #8CA6A2;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .mockup-log {
      background: #0E1716;
      border-radius: var(--radius-sm);
      padding: 12px;
      font-family: var(--font-mono);
      font-size: 11.5px;
      line-height: 1.7;
      color: #9DB4B0;
    }
    .mockup-log .success { color: #52B788; }
    .mockup-log .info { color: #64DFDF; }

    /* FEATURES GRID SECTION */
    .section-title-wrap {
      text-align: center;
      margin-bottom: 50px;
    }
    .section-tag {
      display: inline-block;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--pine-primary);
      background: var(--pine-surface);
      padding: 5px 14px;
      border-radius: var(--radius-full);
      margin-bottom: 12px;
    }
    .section-title {
      font-size: 36px;
      font-weight: 800;
      color: var(--text-main);
      letter-spacing: -0.8px;
    }
    .section-desc {
      font-size: 16px;
      color: var(--text-muted);
      max-width: 600px;
      margin: 10px auto 0 auto;
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      margin-bottom: 80px;
    }
    .feature-card {
      background: var(--card-white);
      border: 1px solid var(--pine-border);
      border-radius: var(--radius-md);
      padding: 30px 26px;
      box-shadow: var(--shadow-sm);
      transition: all 0.25s ease;
      display: flex;
      flex-direction: column;
    }
    .feature-card:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow-md);
      border-color: var(--pine-primary);
    }
    .feature-icon-box {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: var(--pine-surface);
      color: var(--pine-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      margin-bottom: 20px;
    }
    .feature-card h3 {
      font-size: 19px;
      font-weight: 800;
      color: var(--text-main);
      margin-bottom: 10px;
    }
    .feature-card p {
      font-size: 14.5px;
      color: var(--text-muted);
      line-height: 1.6;
    }

    /* LICENSE VERIFICATION SECTION */
    .license-verify-section {
      background: var(--card-white);
      border: 1.5px solid var(--pine-border);
      border-radius: var(--radius-lg);
      padding: 44px;
      max-width: 860px;
      margin: 0 auto 80px auto;
      box-shadow: var(--shadow-md);
      text-align: center;
    }
    .verify-input-group {
      display: flex;
      gap: 12px;
      max-width: 580px;
      margin: 24px auto 14px auto;
    }
    .verify-input {
      flex: 1;
      height: 48px;
      padding: 0 18px;
      border: 1.5px solid var(--pine-border);
      border-radius: var(--radius-sm);
      font-family: var(--font-mono);
      font-size: 14.5px;
      font-weight: 700;
      color: var(--text-main);
      background: var(--cream-surface);
      outline: none;
      transition: border-color 0.2s;
      text-transform: uppercase;
    }
    .verify-input:focus {
      border-color: var(--pine-primary);
      background: #fff;
      box-shadow: 0 0 0 3px var(--pine-glow);
    }
    .btn-verify {
      height: 48px;
      padding: 0 24px;
      background: var(--pine-primary);
      color: #fff;
      border: none;
      border-radius: var(--radius-sm);
      font-size: 14.5px;
      font-weight: 800;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn-verify:hover {
      background: var(--pine-hover);
    }
    .verify-result-box {
      margin-top: 20px;
      padding: 16px;
      border-radius: var(--radius-sm);
      font-size: 14px;
      display: none;
    }

    /* FOOTER */
    .footer {
      border-top: 1px solid var(--pine-border);
      padding: 40px 0 30px 0;
      background: var(--cream-surface);
      margin-top: 60px;
    }
    .footer-inner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 20px;
    }
    .footer-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--pine-primary);
      font-weight: 800;
      font-size: 17px;
    }
    .footer-brand img { width: 30px; height: 30px; }
    .footer-copy {
      font-size: 13px;
      color: var(--text-dim);
    }
    .footer-links {
      display: flex;
      gap: 20px;
      list-style: none;
    }
    .footer-links a {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 13.5px;
      font-weight: 700;
      transition: color 0.2s;
    }
    .footer-links a:hover {
      color: var(--pine-primary);
    }

    /* RESPONSIVE DESIGN */
    @media (max-width: 992px) {
      .hero-title { font-size: 40px; }
      .features-grid { grid-template-columns: 1fr 1fr; }
      .mockup-body { grid-template-columns: 1fr; }
      .mockup-sidebar { display: none; }
    }

    @media (max-width: 768px) {
      .navbar .nav-links { display: none; }
      .mobile-menu-btn { display: block; }
      .hero-title { font-size: 32px; }
      .hero-subtitle { font-size: 16px; }
      .features-grid { grid-template-columns: 1fr; }
      .dual-download-grid { grid-template-columns: 1fr; }
      .verify-input-group { flex-direction: column; }
      .btn-verify { width: 100%; }
      .footer-inner { flex-direction: column; text-align: center; }
      .download-cta-box { padding: 22px 16px; }
    }
  </style>
</head>
<body>

  <!-- Ambient Glow -->
  <div class="ambient-glow"></div>

  <!-- NAVBAR -->
  <header class="navbar">
    <div class="container" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
      <a href="index.php" class="nav-brand">
        <img src="assets/logo.png" alt="FotoSync Logo">
        <h1>FotoSync <span>PRO</span></h1>
      </a>

      <ul class="nav-links">
        <li><a href="#fitur">Fitur Unggulan</a></li>
        <li><a href="#alur-kerja">Alur Live Shutter</a></li>
        <li><a href="#cek-lisensi">Cek Lisensi</a></li>
        <li><a href="#download">Unduh v<?= htmlspecialchars($versionData['latest_version']) ?></a></li>
      </ul>

      <div class="nav-actions">
        <a href="admin/index.php" class="btn-nav-admin">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          Portal Admin
        </a>
        <a href="#download" class="btn-nav-cta">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          Unduh Software
        </a>
        <button class="mobile-menu-btn" onclick="toggleMobileMenu()">☰</button>
      </div>
    </div>
  </header>

  <!-- MOBILE DRAWER -->
  <div id="mobileDrawer" style="display:none; background: var(--cream-surface); border-bottom: 1.5px solid var(--pine-border); padding: 18px 24px;">
    <ul style="list-style: none; display: flex; flex-direction: column; gap: 14px;">
      <li><a href="#fitur" style="color: var(--pine-primary); font-weight: 700; text-decoration: none;" onclick="toggleMobileMenu()">Fitur Unggulan</a></li>
      <li><a href="#alur-kerja" style="color: var(--pine-primary); font-weight: 700; text-decoration: none;" onclick="toggleMobileMenu()">Alur Live Shutter</a></li>
      <li><a href="#cek-lisensi" style="color: var(--pine-primary); font-weight: 700; text-decoration: none;" onclick="toggleMobileMenu()">Cek Lisensi</a></li>
      <li><a href="#download" style="color: var(--pine-primary); font-weight: 700; text-decoration: none;" onclick="toggleMobileMenu()">Unduh Aplikasi</a></li>
      <li><a href="admin/index.php" style="color: var(--pine-primary); font-weight: 700; text-decoration: none;">Login Admin Portal</a></li>
    </ul>
  </div>

  <main class="container">

    <!-- HERO SECTION -->
    <section class="hero-section">
      <div class="hero-badge">
        <span class="badge-dot"></span>
        <span>Versi <?= htmlspecialchars($versionData['latest_version']) ?> Rilis — Dual Device & macOS Support</span>
      </div>

      <h2 class="hero-title">
        Sinkronisasi & Unggah Foto Event <br>
        <span class="highlight">Otomatis dari Kamera ke Fotoyu</span>
      </h2>

      <p class="hero-subtitle">
        Software desktop berkecepatan tinggi untuk fotografer event race, marathon, wisuda, dan panggung.
        Mendukung Live Shutter kabel USB langsung, WiFi FTP server kamera, dan multi-worker uploader tanpa batasan kuota.
      </p>

      <!-- DYNAMIC DOWNLOAD CTA BOX -->
      <div class="download-cta-box" id="download">
        <div class="device-indicator" id="deviceBadge">
          <span>🔍 Mendeteksi Perangkat Anda...</span>
        </div>

        <!-- Primary Target Container (Dynamically rendered by JS based on OS) -->
        <div id="primaryDownloadArea">
          <!-- Default Server Fallback (Overwritten by JS) -->
          <?php if ($isServerMac): ?>
            <a href="<?= htmlspecialchars($versionData['mac_download_url']) ?>" class="btn-download-primary" id="mainDownloadBtn">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.92-2.85-.9.04-2 .6-2.65 1.35-.58.66-1.09 1.73-.95 2.76 1.01.08 2.05-.51 2.68-1.26z"/></svg>
              <span>Unduh untuk macOS (.dmg)</span>
            </a>
          <?php else: ?>
            <a href="<?= htmlspecialchars($versionData['windows_download_url']) ?>" class="btn-download-primary" id="mainDownloadBtn">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.901-1.799"/></svg>
              <span>Unduh untuk Windows (.exe)</span>
            </a>
          <?php endif; ?>
        </div>

        <!-- Mac Chip Options (Apple Silicon vs Intel) -->
        <div class="mac-chip-selector" id="macChipSelector" style="display: none;">
          <span>Chip Mac Anda:</span>
          <strong>Apple Silicon M1/M2/M3/M4 (Rekomendasi)</strong>
          <span>•</span>
          <a href="<?= htmlspecialchars($versionData['mac_intel_download_url']) ?>">Unduh Versi Intel Mac</a>
        </div>

        <!-- Secondary Alternate OS Option -->
        <div id="secondaryDownloadArea" style="margin-top: 14px;">
          <!-- Populated by JS -->
        </div>

        <!-- Specs & Safety Note -->
        <div class="download-specs-note">
          <span>📦 Ukuran Ringan: <strong>~65 - 75 MB</strong></span>
          <span>🛡️ Bebas Virus & Malware</span>
          <span>⚡ Kompatibel: Windows 10/11 & macOS Sonoma/Ventura/Sequoia</span>
        </div>
      </div>

      <!-- MOCKUP UI PREVIEW -->
      <div class="mockup-preview">
        <div class="mockup-header">
          <div class="mockup-dot red"></div>
          <div class="mockup-dot yellow"></div>
          <div class="mockup-dot green"></div>
          <span class="mockup-title-bar">FotoSync PRO v<?= htmlspecialchars($versionData['latest_version']) ?> — Real-Time Shutter Engine</span>
        </div>
        <div class="mockup-body">
          <div class="mockup-sidebar">
            <div style="font-weight: 800; color: #fff; margin-bottom: 12px; font-size: 13px;">STATUS ENGINE</div>
            <div style="margin-bottom: 8px;">🟢 Watcher: <strong>AKTIF</strong></div>
            <div style="margin-bottom: 8px;">📷 Kamera: <strong>Nikon Z 6_2</strong></div>
            <div style="margin-bottom: 8px;">⚡ Mode: <strong>Live Shutter USB</strong></div>
            <div style="margin-bottom: 8px;">📡 Port FTP: <strong>2128 Online</strong></div>
            <div style="margin-top: 16px; font-size: 11px; color: #648480;">Terhubung ke API Fotoyu Multi-Worker</div>
          </div>
          <div class="mockup-main">
            <div class="mockup-stat-grid">
              <div class="mockup-stat-box">
                <div class="num">1,482</div>
                <div class="lbl">Foto Terunggah</div>
              </div>
              <div class="mockup-stat-box">
                <div class="num">0</div>
                <div class="lbl">Antrean Pending</div>
              </div>
              <div class="mockup-stat-box">
                <div class="num">100%</div>
                <div class="lbl">Tingkat Sukses</div>
              </div>
            </div>
            <div class="mockup-log">
              <div>[16:45:02] <span class="info">🔌 [Live Shutter]</span> Kamera Nikon Z 6_2 terhubung via USB Direct.</div>
              <div>[16:45:08] <span class="success">⚡ [Live Shot]</span> DSC_9821.JPG ditangkap kamera, langsung dialirkan ke antrean!</div>
              <div>[16:45:11] <span class="success">🚀 [Uploaded]</span> DSC_9821.JPG sukses terunggah ke Fotoyu (1.8s) via S3 Parallel.</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- FEATURES SECTION -->
    <section id="fitur" style="padding: 40px 0;">
      <div class="section-title-wrap">
        <span class="section-tag">Fitur Kelas Profesional</span>
        <h2 class="section-title">Dirancang untuk Ritme Kerja Fotografer Event</h2>
        <p class="section-desc">Kecepatan, kestabilan koneksi, dan akurasi upload foto di lapangan tanpa kompromi.</p>
      </div>

      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon-box">🔌</div>
          <h3>Dual Device Live Ingest</h3>
          <p>Mendeteksi secara cerdas antara jepretan kamera langsung via kabel USB (Live Shutter) maupun kartu memori di SD Card reader.</p>
        </div>

        <div class="feature-card">
          <div class="feature-icon-box">📡</div>
          <h3>Wireless WiFi FTP Server</h3>
          <p>Memiliki server FTP internal port 2128. Cukup hubungkan kamera (Sony, Canon, Nikon, Fuji) ke WiFi lokal/hotspot, foto otomatis terkirim.</p>
        </div>

        <div class="feature-card">
          <div class="feature-icon-box">🍏</div>
          <h3>Native Apple ImageCapture</h3>
          <p>Terintegrasi langsung di macOS melalui framework resmi Apple ImageCaptureCore via native Swift bridge. Sangat responsif dan hemat baterai.</p>
        </div>

        <div class="feature-card">
          <div class="feature-icon-box">⚡</div>
          <h3>Multi-Worker Parallel Sync</h3>
          <p>Mengunggah hingga 5 foto secara bersamaan dengan retry backoff otomatis. Foto masuk langsung diproses tanpa antrean macet.</p>
        </div>

        <div class="feature-card">
          <div class="feature-icon-box">💾</div>
          <h3>Anti-Duplikasi SHA256</h3>
          <p>Dilengkapi checksum hashing otomatis untuk memastikan foto yang sama tidak pernah terunggah dua kali, menghemat kuota internet lapangan.</p>
        </div>

        <div class="feature-card">
          <div class="feature-icon-box">🎨</div>
          <h3>Tema Modern Dark & Light</h3>
          <p>Antarmuka elegan dengan transisi warna halus (#004643 & #F0EDE5) yang nyaman di mata saat pemotretan terik siang maupun malam hari.</p>
        </div>
      </div>
    </section>

    <!-- ALUR KERJA SECTION -->
    <section id="alur-kerja" style="padding: 40px 0;">
      <div class="section-title-wrap">
        <span class="section-tag">Cara Kerja Sederhana</span>
        <h2 class="section-title">3 Langkah Mudah Live Shutter di Lokasi</h2>
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 1060px; margin: 0 auto 80px auto;">
        <div style="background: var(--card-white); border: 1.5px solid var(--pine-border); border-radius: var(--radius-md); padding: 30px; text-align: center;">
          <div style="font-size: 32px; font-weight: 800; color: var(--pine-primary); font-family: var(--font-mono); margin-bottom: 12px;">01</div>
          <h4 style="font-size: 18px; font-weight: 800; margin-bottom: 8px;">Colokkan Kamera</h4>
          <p style="font-size: 14px; color: var(--text-muted);">Sambungkan kamera via kabel USB atau tancapkan SD Card ke laptop Anda. Aplikasi otomatis mendeteksi perangkat.</p>
        </div>

        <div style="background: var(--card-white); border: 1.5px solid var(--pine-border); border-radius: var(--radius-md); padding: 30px; text-align: center;">
          <div style="font-size: 32px; font-weight: 800; color: var(--pine-primary); font-family: var(--font-mono); margin-bottom: 12px;">02</div>
          <h4 style="font-size: 18px; font-weight: 800; margin-bottom: 8px;">Konfirmasi Folder</h4>
          <p style="font-size: 14px; color: var(--text-muted);">Klik satu tombol konfirmasi pada modal. Folder target langsung terisi otomatis dan checklist sistem menyala hijau.</p>
        </div>

        <div style="background: var(--card-white); border: 1.5px solid var(--pine-border); border-radius: var(--radius-md); padding: 30px; text-align: center;">
          <div style="font-size: 32px; font-weight: 800; color: var(--pine-primary); font-family: var(--font-mono); margin-bottom: 12px;">03</div>
          <h4 style="font-size: 18px; font-weight: 800; margin-bottom: 8px;">Jepret & Terunggah</h4>
          <p style="font-size: 14px; color: var(--text-muted);">Setiap kali Anda menekan tombol rana kamera, foto seketika masuk ke antrean uploader dan terunggah ke Fotoyu!</p>
        </div>
      </div>
    </section>

    <!-- LICENSE VERIFICATION SECTION -->
    <section id="cek-lisensi" class="license-verify-section">
      <span class="section-tag">Verifikasi Lisensi</span>
      <h3 style="font-size: 26px; font-weight: 800; margin-top: 10px; color: var(--text-main);">Cek Status & Masa Aktif Master Key Anda</h3>
      <p style="font-size: 15px; color: var(--text-muted); margin-top: 6px;">Masukkan kode lisensi untuk memeriksa masa aktif, sisa kuota, dan status perangkat terikat.</p>

      <form id="verifyForm" onsubmit="handleVerifyLicense(event)">
        <div class="verify-input-group">
          <input type="text" id="licenseKeyInput" class="verify-input" placeholder="CONTOH: DAY7-FOTOYU-8888-9999" required autocomplete="off">
          <button type="submit" class="btn-verify" id="btnVerify">Periksa Lisensi</button>
        </div>
      </form>

      <div id="verifyResult" class="verify-result-box"></div>
    </section>

  </main>

  <!-- FOOTER -->
  <footer class="footer">
    <div class="container footer-inner">
      <div class="footer-brand">
        <img src="assets/logo.png" alt="Logo">
        <span>FotoSync PRO</span>
      </div>

      <div class="footer-copy">
        &copy; <?= date('Y') ?> Fotoyu Auto Uploader Ecosystem. Built for Professional Event Photographers.
      </div>

      <ul class="footer-links">
        <li><a href="admin/index.php">Portal Admin</a></li>
        <li><a href="https://github.com/ghazabegins/fotoyu-auto-uploader" target="_blank" rel="noopener">GitHub</a></li>
        <li><a href="https://wa.me/6281234567890?text=Halo%20Admin%20FotoSync" target="_blank" rel="noopener">Bantuan WhatsApp</a></li>
      </ul>
    </div>
  </footer>

  <!-- JAVASCRIPT DEVICE DETECTION & SMART DOWNLOAD LOGIC -->
  <script>
    const WIN_DOWNLOAD_URL = <?= json_encode($versionData['windows_download_url']) ?>;
    const MAC_ARM_DOWNLOAD_URL = <?= json_encode($versionData['mac_download_url']) ?>;
    const MAC_INTEL_DOWNLOAD_URL = <?= json_encode($versionData['mac_intel_download_url'] ?? $defaultMacIntel) ?>;
    const APP_VERSION = <?= json_encode($versionData['latest_version']) ?>;

    function detectDeviceOS() {
      const ua = (navigator.userAgent || navigator.vendor || window.opera || '').toLowerCase();
      const platform = (navigator.platform || '').toLowerCase();

      const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua) || 
                       (window.innerWidth <= 768 && ('ontouchstart' in window));
      const isMac = (platform.includes('mac') || ua.includes('macintosh')) && !isMobile;
      const isWindows = (platform.includes('win') || ua.includes('windows')) && !isMobile;

      return { isMobile, isMac, isWindows };
    }

    function setupSmartDownloadButtons() {
      const { isMobile, isMac, isWindows } = detectDeviceOS();
      const badge = document.getElementById('deviceBadge');
      const primaryArea = document.getElementById('primaryDownloadArea');
      const secondaryArea = document.getElementById('secondaryDownloadArea');
      const macChipSelector = document.getElementById('macChipSelector');

      if (isMobile) {
        // MOBILE DISPLAY: Show BOTH Windows and Mac buttons clearly side-by-side!
        badge.innerHTML = '📱 Dibuka dari Smartphone / Tablet';
        macChipSelector.style.display = 'none';

        primaryArea.innerHTML = `
          <div style="font-size: 15px; font-weight: 700; margin-bottom: 12px; color: var(--pine-primary);">
            Pilih Versi untuk Komputer / Laptop Anda:
          </div>
          <div class="dual-download-grid">
            <a href="${WIN_DOWNLOAD_URL}" class="os-card-btn active-target">
              <div class="os-icon">🪟</div>
              <div class="os-info">
                <h4>Unduh Windows (.exe)</h4>
                <div class="os-meta">Versi ${APP_VERSION} • ~65 MB</div>
              </div>
            </a>
            <a href="${MAC_ARM_DOWNLOAD_URL}" class="os-card-btn active-target">
              <div class="os-icon">🍏</div>
              <div class="os-info">
                <h4>Unduh macOS (.dmg)</h4>
                <div class="os-meta">Versi ${APP_VERSION} • ~75 MB</div>
              </div>
            </a>
          </div>
        `;
        secondaryArea.innerHTML = `
          <div style="font-size: 13px; color: var(--text-dim); margin-top: 10px;">
            💡 Unduh file installer di atas dan pasang di PC/Laptop fotografer Anda.
          </div>
        `;
      } else if (isMac) {
        // MAC DISPLAY: Highlight macOS DMG as Primary
        badge.innerHTML = '🍏 Terdeteksi: Komputer macOS';
        macChipSelector.style.display = 'flex';

        primaryArea.innerHTML = `
          <a href="${MAC_ARM_DOWNLOAD_URL}" class="btn-download-primary" id="mainDownloadBtn">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.92-2.85-.9.04-2 .6-2.65 1.35-.58.66-1.09 1.73-.95 2.76 1.01.08 2.05-.51 2.68-1.26z"/></svg>
            <span>Unduh untuk macOS v${APP_VERSION} (.dmg)</span>
          </a>
        `;

        secondaryArea.innerHTML = `
          <div style="margin-top: 14px;">
            <a href="${WIN_DOWNLOAD_URL}" class="btn-download-secondary">
              <span>🪟 Unduh Versi Windows (.exe)</span>
            </a>
          </div>
          <div style="font-size: 12px; color: var(--text-dim); margin-top: 8px;">
            ✨ Di dalam DMG sudah disertakan <code>panduan.txt</code> & launcher 1-klik untuk kemudahan izin keamanan Apple.
          </div>
        `;
      } else {
        // WINDOWS (OR DEFAULT DESKTOP): Highlight Windows EXE as Primary
        badge.innerHTML = '🪟 Terdeteksi: Komputer Windows';
        macChipSelector.style.display = 'none';

        primaryArea.innerHTML = `
          <a href="${WIN_DOWNLOAD_URL}" class="btn-download-primary" id="mainDownloadBtn">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.901-1.799"/></svg>
            <span>Unduh untuk Windows v${APP_VERSION} (.exe)</span>
          </a>
        `;

        secondaryArea.innerHTML = `
          <div style="margin-top: 14px;">
            <a href="${MAC_ARM_DOWNLOAD_URL}" class="btn-download-secondary">
              <span>🍏 Unduh Versi macOS (.dmg)</span>
            </a>
          </div>
        `;
      }
    }

    function toggleMobileMenu() {
      const drawer = document.getElementById('mobileDrawer');
      drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
    }

    async function handleVerifyLicense(e) {
      e.preventDefault();
      const input = document.getElementById('licenseKeyInput');
      const btn = document.getElementById('btnVerify');
      const resultBox = document.getElementById('verifyResult');
      const key = input.value.trim().toUpperCase();

      if (!key) return;

      btn.disabled = true;
      btn.textContent = 'Memeriksa...';
      resultBox.style.display = 'none';

      try {
        const res = await fetch(`api/check.php?license_key=${encodeURIComponent(key)}`);
        const data = await res.json();

        resultBox.style.display = 'block';
        if (data.success && data.valid) {
          resultBox.style.background = '#E8F5E9';
          resultBox.style.border = '1px solid #A5D6A7';
          resultBox.style.color = '#2E7D32';
          resultBox.innerHTML = `
            <strong>✅ Lisensi Valid & Aktif!</strong><br>
            Paket: <strong>${data.plan_tier || 'PRO'}</strong> | Sisa Masa Aktif: <strong>${data.remaining_days || 'Lifetime'}</strong><br>
            Status Kuota: <strong>${data.daily_limit ? data.daily_limit + ' Foto/Hari' : 'UNLIMITED'}</strong>
          `;
        } else {
          resultBox.style.background = '#FFEBEE';
          resultBox.style.border = '1px solid #FFCDD2';
          resultBox.style.color = '#C62828';
          resultBox.innerHTML = `<strong>❌ Lisensi Tidak Valid atau Telah Kedaluwarsa</strong><br>${data.message || 'Periksa kembali kode master key Anda.'}`;
        }
      } catch (err) {
        resultBox.style.display = 'block';
        resultBox.style.background = '#FFF3E0';
        resultBox.style.border = '1px solid #FFE0B2';
        resultBox.style.color = '#E65100';
        resultBox.innerHTML = `<strong>⚠️ Gagal menghubungi server lisensi.</strong> Pastikan koneksi internet stabil.`;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Periksa Lisensi';
      }
    }

    // Run smart device detector on page load
    document.addEventListener('DOMContentLoaded', setupSmartDownloadButtons);
  </script>
</body>
</html>
