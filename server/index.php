<?php
// FotoSync PRO Product Landing Page (Clean Light Theme)
require_once __DIR__ . '/config.php';

// Fetch dynamic version config
$configFile = __DIR__ . '/data/version_config.json';
$defaultWin = 'https://ghazabegins.id/fotosync/downloads/FotoSync-Setup-Latest.exe';
$defaultMac = 'https://ghazabegins.id/fotosync/downloads/FotoSync-Setup-Latest.dmg';

$versionData = [
    'latest_version' => '1.0.0',
    'windows_download_url' => $defaultWin,
    'mac_download_url' => $defaultMac,
    'release_notes' => "• Penambahan sistem kuota 3 tier (Free 20, Premium 500, Pro Unlimited)\n• Integrasi Kontak Admin WhatsApp Official\n• Peningkatan sistem auto-sync & penanganan kuota harian real-time",
    'released_at' => date('Y-m-d')
];

if (file_exists($configFile)) {
    $loaded = json_decode(file_get_contents($configFile), true);
    if ($loaded && is_array($loaded)) {
        $versionData = array_merge($versionData, $loaded);
        if (empty($versionData['windows_download_url']) && !empty($versionData['download_url'])) {
            $versionData['windows_download_url'] = $data['download_url'];
        }
        if (empty($versionData['mac_download_url'])) {
            $versionData['mac_download_url'] = str_replace('.exe', '.dmg', $versionData['windows_download_url']);
        }
    }
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FotoSync PRO — Protokol Auto-Sync & Real-Time Photo Uploader untuk Event Fotografi</title>
  <meta name="description" content="Software uploader foto real-time berkecepatan tinggi dengan multi-worker parallel sync, monitoring folder FTP kamera, dan integrasi langsung ke platform Fotoyu.">
  
  <link rel="icon" type="image/png" href="assets/logo.png">
  <link rel="shortcut icon" type="image/png" href="assets/logo.png">
  
  <!-- Google Fonts: Plus Jakarta Sans & JetBrains Mono -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  
  <style>
    /* CLEAN LIGHT DESIGN SYSTEM (MATCHING SOFTWARE THEME) */
    :root {
      --bg-body: #f8fafc;
      --bg-card: #ffffff;
      --bg-card-sub: #f1f5f9;
      --navy-darker: #0f172a;
      --navy-dark: #1e293b;
      --text-main: #334155;
      --text-muted: #64748b;
      --text-dim: #94a3b8;
      --primary-blue: #2563eb;
      --primary-blue-hover: #1d4ed8;
      --accent-cyan: #0284c7;
      --border-light: #e2e8f0;
      --border-blue: rgba(37, 99, 235, 0.25);
      --shadow-subtle: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
      --shadow-card: 0 10px 30px -5px rgba(15, 23, 42, 0.08);
      --shadow-elevated: 0 20px 40px -10px rgba(37, 99, 235, 0.12);
      --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-body);
      color: var(--text-main);
      font-family: var(--font-sans);
      line-height: 1.6;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }

    /* LIGHT GRADIENT BLURS */
    .glow-bg-1 {
      position: absolute; top: -120px; left: 50%; transform: translateX(-50%);
      width: 900px; height: 500px;
      background: radial-gradient(circle, rgba(37, 99, 235, 0.08) 0%, rgba(2, 132, 199, 0.04) 50%, rgba(255, 255, 255, 0) 70%);
      filter: blur(80px); pointer-events: none; z-index: 0;
    }

    /* CONTAINER */
    .container { max-width: 1240px; margin: 0 auto; padding: 0 24px; position: relative; z-index: 1; }

    /* NAVBAR */
    .navbar {
      display: flex; justify-content: space-between; align-items: center;
      padding: 20px 0; border-bottom: 1px solid var(--border-light);
      position: sticky; top: 0; background: rgba(248, 250, 252, 0.9);
      backdrop-filter: blur(12px); z-index: 100;
    }
    .nav-brand { display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--navy-darker); }
    .nav-brand img { width: 38px; height: 38px; object-fit: contain; }
    .nav-brand h1 { font-size: 21px; font-weight: 800; letter-spacing: -0.5px; }
    .nav-brand h1 span { color: var(--primary-blue); font-size: 11px; background: rgba(37, 99, 235, 0.08); border: 1px solid var(--border-blue); padding: 3px 9px; border-radius: 6px; margin-left: 6px; vertical-align: middle; }

    .nav-links { display: flex; align-items: center; gap: 32px; list-style: none; }
    .nav-links a { color: var(--text-muted); text-decoration: none; font-size: 14.5px; font-weight: 700; transition: color 0.2s; }
    .nav-links a:hover { color: var(--primary-blue); }

    .btn-nav-action {
      background: var(--primary-blue);
      color: #fff; text-decoration: none; padding: 10px 22px; border-radius: 30px;
      font-size: 13.5px; font-weight: 800; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3);
      transition: all 0.25s ease; border: none; display: inline-flex; align-items: center; gap: 8px;
    }
    .btn-nav-action:hover { background: var(--primary-blue-hover); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4); }

    /* HERO SECTION */
    .hero-section { text-align: center; padding: 75px 0 50px 0; }
    .hero-badge {
      display: inline-flex; align-items: center; gap: 8px;
      background: #ffffff; border: 1px solid var(--border-blue);
      color: var(--primary-blue); padding: 6px 18px; border-radius: 30px;
      font-size: 12.5px; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 24px;
      box-shadow: var(--shadow-subtle);
    }
    .hero-title {
      font-size: 48px; font-weight: 800; line-height: 1.18; letter-spacing: -1.5px;
      max-width: 920px; margin: 0 auto 20px auto; color: var(--navy-darker);
    }
    .hero-subtitle {
      font-size: 18px; color: var(--text-muted); max-width: 780px; margin: 0 auto 36px auto;
      font-weight: 500; line-height: 1.6;
    }

    /* DOWNLOAD CTA BUTTONS ROW */
    .download-cta-group {
      display: flex; justify-content: center; align-items: center; gap: 16px; flex-wrap: wrap;
      margin-bottom: 28px;
    }
    .btn-download-primary {
      background: linear-gradient(135deg, var(--primary-blue) 0%, #1d4ed8 100%);
      color: #ffffff; text-decoration: none; padding: 16px 34px; border-radius: 14px;
      font-size: 16px; font-weight: 800; display: inline-flex; align-items: center; gap: 12px;
      box-shadow: 0 10px 25px rgba(37, 99, 235, 0.3); transition: all 0.25s ease; border: none;
    }
    .btn-download-primary:hover { transform: translateY(-3px); box-shadow: 0 14px 35px rgba(37, 99, 235, 0.45); }

    .btn-download-secondary {
      background: #ffffff; color: var(--navy-darker); text-decoration: none;
      padding: 16px 28px; border-radius: 14px; font-size: 15px; font-weight: 700;
      display: inline-flex; align-items: center; gap: 10px; border: 1px solid var(--border-light);
      box-shadow: var(--shadow-subtle); transition: all 0.25s ease;
    }
    .btn-download-secondary:hover { background: #f1f5f9; border-color: #cbd5e1; transform: translateY(-2px); }

    .tech-badges-row {
      display: flex; justify-content: center; align-items: center; gap: 20px; flex-wrap: wrap;
      font-size: 13px; color: var(--text-muted); font-weight: 700; margin-bottom: 55px;
    }
    .tech-badges-row span { display: inline-flex; align-items: center; gap: 6px; }

    /* MOCKUP CONTAINER (SOFTWARE LIGHT STYLING) */
    .mockup-container {
      background: var(--bg-card); border: 1px solid var(--border-light);
      border-radius: 24px; padding: 12px; box-shadow: var(--shadow-elevated);
      position: relative; max-width: 1060px; margin: 0 auto; overflow: hidden;
    }
    .mockup-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 18px; background: #f1f5f9; border-radius: 16px 16px 0 0;
      border-bottom: 1px solid var(--border-light);
    }
    .mac-dots { display: flex; gap: 8px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; }
    .dot-red { background: #ef4444; } .dot-yellow { background: #f59e0b; } .dot-green { background: #10b981; }
    .mockup-title { font-size: 12px; font-family: var(--font-mono); color: var(--text-muted); font-weight: 600; }

    .mockup-body {
      padding: 24px; background: #f8fafc; border-radius: 0 0 16px 16px;
      display: grid; grid-template-columns: 250px 1fr; gap: 20px; text-align: left;
    }
    .mockup-sidebar { background: #ffffff; border-radius: 14px; padding: 16px; border: 1px solid var(--border-light); box-shadow: var(--shadow-subtle); }
    .mockup-main { background: #ffffff; border-radius: 14px; padding: 20px; border: 1px solid var(--border-light); box-shadow: var(--shadow-subtle); }

    /* STATS METRICS BAR */
    .stats-bar {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px;
      margin: 80px 0; padding: 32px; background: #ffffff;
      border: 1px solid var(--border-light); border-radius: 20px; box-shadow: var(--shadow-card);
    }
    .stat-item { text-align: center; }
    .stat-item .num { font-size: 36px; font-weight: 800; color: var(--primary-blue); font-family: var(--font-sans); letter-spacing: -1px; }
    .stat-item .label { font-size: 13.5px; color: var(--text-muted); font-weight: 700; margin-top: 4px; }

    /* SECTION TITLE */
    .section-title-wrapper { text-align: center; margin-bottom: 50px; }
    .section-subtitle { color: var(--primary-blue); font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 8px; display: block; }
    .section-title { font-size: 34px; font-weight: 800; letter-spacing: -0.8px; color: var(--navy-darker); }

    /* FEATURES GRID */
    .features-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 24px;
      margin-bottom: 100px;
    }
    .feature-card {
      background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 20px;
      padding: 32px; transition: all 0.3s ease; position: relative; box-shadow: var(--shadow-card);
    }
    .feature-card:hover { transform: translateY(-5px); border-color: var(--primary-blue); box-shadow: var(--shadow-elevated); }
    .feature-icon {
      width: 52px; height: 52px; border-radius: 14px; background: #eff6ff;
      border: 1px solid var(--border-blue); display: flex; align-items: center; justify-content: center;
      font-size: 24px; margin-bottom: 20px; color: var(--primary-blue);
    }
    .feature-card h3 { font-size: 20px; font-weight: 800; margin-bottom: 10px; color: var(--navy-darker); }
    .feature-card p { font-size: 14px; color: var(--text-muted); line-height: 1.6; }

    /* WORKFLOW STEPS */
    .workflow-steps {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px;
      margin-bottom: 100px;
    }
    .step-card {
      background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 18px;
      padding: 26px; box-shadow: var(--shadow-card);
    }
    .step-num {
      width: 38px; height: 38px; border-radius: 50%; background: var(--primary-blue);
      color: #fff; font-weight: 800; font-size: 15px; display: flex; align-items: center; justify-content: center;
      margin-bottom: 16px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
    }
    .step-card h4 { font-size: 17px; font-weight: 800; margin-bottom: 8px; color: var(--navy-darker); }
    .step-card p { font-size: 13.5px; color: var(--text-muted); }

    /* PRICING GRID */
    .pricing-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 28px;
      margin-bottom: 100px;
    }
    .price-card {
      background: var(--bg-card); border: 1px solid var(--border-light); border-radius: 24px;
      padding: 36px 30px; display: flex; flex-direction: column; position: relative;
      box-shadow: var(--shadow-card);
    }
    .price-card.popular {
      border: 2px solid var(--primary-blue);
      background: #ffffff;
      box-shadow: var(--shadow-elevated);
    }
    .badge-popular {
      position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
      background: var(--primary-blue); color: #fff;
      font-size: 11px; font-weight: 800; padding: 4px 16px; border-radius: 20px;
      text-transform: uppercase; letter-spacing: 0.8px;
    }
    .plan-title { font-size: 22px; font-weight: 800; margin-bottom: 8px; color: var(--navy-darker); }
    .plan-price { font-size: 38px; font-weight: 800; color: var(--navy-darker); font-family: var(--font-mono); margin-bottom: 20px; }
    .plan-price small { font-size: 14px; color: var(--text-muted); font-family: var(--font-sans); }
    .plan-features { list-style: none; margin-bottom: 30px; display: flex; flex-direction: column; gap: 12px; }
    .plan-features li { font-size: 14px; color: var(--text-muted); display: flex; align-items: center; gap: 10px; }
    .plan-features li strong { color: var(--navy-darker); }

    .btn-pricing {
      margin-top: auto; padding: 14px; border-radius: 12px; text-align: center;
      text-decoration: none; font-weight: 800; font-size: 14px; transition: all 0.2s;
    }
    .btn-pricing.outline { background: #f1f5f9; border: 1px solid var(--border-light); color: var(--navy-darker); }
    .btn-pricing.outline:hover { background: #e2e8f0; }
    .btn-pricing.cyan { background: var(--primary-blue); color: #fff; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3); }
    .btn-pricing.cyan:hover { background: var(--primary-blue-hover); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4); }

    /* FOOTER */
    .footer {
      border-top: 1px solid var(--border-light); padding: 40px 0; text-align: center;
      color: var(--text-muted); font-size: 13.5px; background: #ffffff;
    }
    .footer a { color: var(--primary-blue); text-decoration: none; font-weight: 700; }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>

  <div class="glow-bg-1"></div>

  <!-- NAVBAR (NO ADMIN PORTAL BUTTON) -->
  <header class="navbar container">
    <a href="index.php" class="nav-brand">
      <img src="assets/logo.png" alt="FotoSync PRO Logo">
      <h1>FotoSync <span>PRO</span></h1>
    </a>

    <ul class="nav-links">
      <li><a href="#fitur">Fitur Utama</a></li>
      <li><a href="#workflow">Cara Kerja</a></li>
      <li><a href="#harga">Paket & Harga</a></li>
    </ul>

    <a href="#download" class="btn-nav-action">
      <span>⚡ Download v<?= htmlspecialchars($versionData['latest_version']) ?></span>
    </a>
  </header>

  <main class="container">

    <!-- HERO SECTION -->
    <section class="hero-section">
      <div class="hero-badge">
        <span>🚀 FOTOYU AUTO-SYNC PROTOCOL V<?= htmlspecialchars($versionData['latest_version']) ?> IS LIVE</span>
      </div>

      <h1 class="hero-title">
        Protokol Auto-Sync Foto Real-Time Berkecepatan Tinggi untuk Event & Studio
      </h1>

      <p class="hero-subtitle">
        Otomatisasi pengunggahan foto dari kamera ke platform Fotoyu secara instan tanpa hambatan. Dilengkapi teknologi Multi-Worker parallel sync, monitoring folder FTP, dan enkripsi lisensi hardware.
      </p>

      <!-- DUAL DOWNLOAD BUTTONS -->
      <div id="download" class="download-cta-group">
        <a href="<?= htmlspecialchars($versionData['windows_download_url']) ?>" class="btn-download-primary">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Download untuk Windows (.exe)</span>
        </a>

        <a href="<?= htmlspecialchars($versionData['mac_download_url']) ?>" class="btn-download-secondary">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.59L8.41 12 9.83 10.59 12 12.76l4.17-4.17L17.59 10z"></path>
          </svg>
          <span>Download untuk macOS (.dmg)</span>
        </a>
      </div>

      <div class="tech-badges-row">
        <span>⚡ 10 Multi-Worker Parallel</span>
        <span>·</span>
        <span>🔒 HWID Hardware Binding</span>
        <span>·</span>
        <span>📡 S3 Direct Presigned Upload</span>
        <span>·</span>
        <span>🎯 Metadata GPS & Price Tagging</span>
      </div>

      <!-- MOCKUP UI DISPLAY (SOFTWARE LIGHT STYLE) -->
      <div class="mockup-container">
        <div class="mockup-header">
          <div class="mac-dots">
            <span class="dot dot-red"></span>
            <span class="dot dot-yellow"></span>
            <span class="dot dot-green"></span>
          </div>
          <span class="mockup-title">FOTOSYNC PRO v1.0.0 — Direct Upload Engine</span>
          <span></span>
        </div>
        <div class="mockup-body">
          <div class="mockup-sidebar">
            <div style="font-size: 11px; font-weight: 800; color: var(--primary-blue); letter-spacing: 0.8px; margin-bottom: 12px;">MANAJEMEN UPLOADER</div>
            <div style="background: #eff6ff; border: 1px solid var(--border-blue); padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 800; color: var(--primary-blue); margin-bottom: 8px;">🚀 Upload & Monitor</div>
            <div style="padding: 8px 12px; font-size: 12px; color: var(--text-muted); font-weight: 600;">📋 Riwayat Upload</div>
            <div style="padding: 8px 12px; font-size: 12px; color: var(--text-muted); font-weight: 600;">⚙️ Pengaturan API</div>
            <div style="padding: 8px 12px; font-size: 12px; color: var(--text-muted); font-weight: 600;">📍 Preset Metadata GPS</div>
            
            <div style="margin-top: 40px; padding: 10px; background: #f1f5f9; border-radius: 8px; border: 1px solid var(--border-light);">
              <span style="font-size: 10px; color: var(--text-muted); display: block;">Status Lisensi</span>
              <strong style="font-size: 11px; color: #059669;">👑 PRO UNLIMITED</strong>
            </div>
          </div>

          <div class="mockup-main">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <div>
                <h3 style="font-size: 16.5px; font-weight: 800; color: var(--navy-darker);">Mandiri Jogja Marathon 2026</h3>
                <span style="font-size: 11.5px; color: #059669; font-weight: 700;">● WATCHER RUNNING (FTP SYNC)</span>
              </div>
              <span style="background: var(--primary-blue); color: #fff; font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 20px;">6 WORKERS ACTIVE</span>
            </div>

            <div style="background: #f8fafc; border-radius: 12px; padding: 18px; border: 1px solid var(--border-light); margin-bottom: 16px;">
              <div style="display: flex; justify-content: space-between; font-size: 28px; font-weight: 800; font-family: var(--font-sans); letter-spacing: -0.5px;">
                <span><strong style="color: var(--primary-blue);">1,284</strong> <small style="font-size: 13px; color: var(--text-muted);">/ 1,284 foto</small></span>
                <span style="color: #059669;">100%</span>
              </div>
              <div style="width: 100%; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; margin-top: 8px;">
                <div style="width: 100%; height: 100%; background: linear-gradient(90deg, #3b82f6, #1d4ed8);"></div>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 11px;">
              <div style="background: #f1f5f9; padding: 10px; border-radius: 8px; border: 1px solid var(--border-light);">
                <span style="color: var(--text-muted);">Kecepatan</span>
                <strong style="display: block; font-size: 13px; color: var(--navy-darker);">4.2 foto/dtk</strong>
              </div>
              <div style="background: #f1f5f9; padding: 10px; border-radius: 8px; border: 1px solid var(--border-light);">
                <span style="color: var(--text-muted);">Status Jaringan</span>
                <strong style="display: block; font-size: 13px; color: #059669;">Stabil (52 Mbps)</strong>
              </div>
              <div style="background: #f1f5f9; padding: 10px; border-radius: 8px; border: 1px solid var(--border-light);">
                <span style="color: var(--text-muted);">Sisa Kuota</span>
                <strong style="display: block; font-size: 13px; color: var(--primary-blue);">UNLIMITED</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- METRICS NUMBERS BAR -->
    <section class="stats-bar">
      <div class="stat-item">
        <div class="num">10 Workers</div>
        <div class="label">High-Speed Parallel Upload</div>
      </div>
      <div class="stat-item">
        <div class="num">0.2 Dtk</div>
        <div class="label">Latency Monitoring Watcher</div>
      </div>
      <div class="stat-item">
        <div class="num">100%</div>
        <div class="label">Otomatisasi FTP Direct Sync</div>
      </div>
      <div class="stat-item">
        <div class="num">UNLIMITED</div>
        <div class="label">Opsi Kuota Harian (PRO Plan)</div>
      </div>
    </section>

    <!-- FEATURES GRID SECTION -->
    <section id="fitur" style="padding: 40px 0;">
      <div class="section-title-wrapper">
        <span class="section-subtitle">FITUR UNGGULAN SOFTWARE</span>
        <h2 class="section-title">Dirancang Khusus untuk Alur Kerja Fotografer Profesional</h2>
      </div>

      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon">📸</div>
          <h3>Instant Watch Folder Monitor</h3>
          <p>Mendeteksi file foto JPEG baru yang dikirim oleh kamera via FTP secara otomatis dalam waktu kurang dari 200 milidetik tanpa perlu mengunggah manual.</p>
        </div>

        <div class="feature-card">
          <div class="feature-icon">🚀</div>
          <h3>Multi-Worker Parallel Sync</h3>
          <p>Dukungan 1 hingga 10 worker simultaneous yang memaksimalkan seluruh potensi bandwidth jaringan fiber di lokasi event maraton atau studio.</p>
        </div>

        <div class="feature-card">
          <div class="feature-icon">🔒</div>
          <h3>Enterprise Device Binding (HWID)</h3>
          <p>Keamanan lisensi tingkat lanjut di mana Master Key terikat pada enkripsi Hardware ID komputer pengguna untuk mencegah penyalahgunaan akun.</p>
        </div>

        <div class="feature-card">
          <div class="feature-icon">📍</div>
          <h3>Auto Metadata & GPS Tagging</h3>
          <p>Menyematkan harga foto, tag lokasi, koordinat GPS (lat/lng), dan nickname fotografer pada tiap berkas foto sebelum diunggah ke server.</p>
        </div>

        <div class="feature-card">
          <div class="feature-icon">📡</div>
          <h3>Direct S3 Presigned Upload</h3>
          <p>Jalur komunikasi API langsung ke storage S3 Presigned URL untuk kecepatan transfer maksimal dan efisiensi memori RAM komputer.</p>
        </div>

        <div class="feature-card">
          <div class="feature-icon">📊</div>
          <h3>Live Telemetry & Diagnostics</h3>
          <p>Monitoring indikator jaringan real-time, statistik upload per detik, serta log pengujian koneksi untuk memastikan integritas data.</p>
        </div>
      </div>
    </section>

    <!-- WORKFLOW SECTION -->
    <section id="workflow" style="padding: 40px 0;">
      <div class="section-title-wrapper">
        <span class="section-subtitle">ALUR KERJA MUDAH</span>
        <h2 class="section-title">Hanya 4 Langkah dari Kamera ke Server</h2>
      </div>

      <div class="workflow-steps">
        <div class="step-card">
          <div class="step-num">1</div>
          <h4>Unduh & Install</h4>
          <p>Download file installer FotoSync PRO untuk sistem operasi Windows (.exe) atau macOS (.dmg).</p>
        </div>

        <div class="step-card">
          <div class="step-num">2</div>
          <h4>Login & Masukkan Key</h4>
          <p>Login dengan akun Fotoyu Anda dan masukkan Master Key lisensi (Free / Premium / PRO).</p>
        </div>

        <div class="step-card">
          <div class="step-num">3</div>
          <h4>Pilih Watch Folder</h4>
          <p>Tentukan folder target tempat software kamera (seperti Canon WFT/Nikon FTP) menyimpan hasil jepretan.</p>
        </div>

        <div class="step-card">
          <div class="step-num">4</div>
          <h4>Start Auto-Sync</h4>
          <p>Klik tombol Start! Foto secara otomatis akan ter-sync dan terunggah ke platform Fotoyu secara real-time.</p>
        </div>
      </div>
    </section>

    <!-- PRICING SECTION -->
    <section id="harga" style="padding: 40px 0;">
      <div class="section-title-wrapper">
        <span class="section-subtitle">PAKET & LISENSI</span>
        <h2 class="section-title">Pilih Paket Langganan Sesuai Kebutuhan Event Anda</h2>
      </div>

      <div class="pricing-grid">
        <!-- PAKET 1 HARI -->
        <div class="price-card">
          <div class="plan-title">PAKET 1 HARI</div>
          <div class="plan-price">Rp 25.000 <small>/ 24 jam</small></div>
          <ul class="plan-features">
            <li>⏱️ Masa Aktif <strong>1 Hari (24 Jam)</strong></li>
            <li>🚀 Kuota <strong>UNLIMITED Foto</strong></li>
            <li>⚡ 5 Worker High-Speed Sync</li>
            <li>🔒 Terikat 1 Device HWID</li>
            <li>🎯 Cocok untuk Single Day Event</li>
          </ul>
          <a href="https://wa.me/628176498254?text=Halo%20Admin%20FotoSync%20PRO,%20saya%20ingin%20berlangganan%20Paket%201%20HARI%20(Rp%2025.000)" target="_blank" class="btn-pricing outline">Order Paket 1 Hari via WA</a>
        </div>

        <!-- PAKET 7 HARI -->
        <div class="price-card popular">
          <div class="badge-popular">POPULER FOR EVENT</div>
          <div class="plan-title">PAKET 7 HARI</div>
          <div class="plan-price">Rp 50.000 <small>/ 7 hari</small></div>
          <ul class="plan-features">
            <li>⏱️ Masa Aktif <strong>7 Hari (1 Minggu)</strong></li>
            <li>🚀 Kuota <strong>UNLIMITED Foto</strong></li>
            <li>⚡ 8 Worker High-Speed Sync</li>
            <li>🔒 Terikat 1 Device HWID</li>
            <li>⭐ Cocok untuk Trip & Festival</li>
            <li>💬 Support Admin Dedicated</li>
          </ul>
          <a href="https://wa.me/628176498254?text=Halo%20Admin%20FotoSync%20PRO,%20saya%20ingin%20berlangganan%20Paket%207%20HARI%20(Rp%2050.000)" target="_blank" class="btn-pricing cyan">Order Paket 7 Hari via WA</a>
        </div>

        <!-- PAKET 30 HARI -->
        <div class="price-card">
          <div class="plan-title">PAKET 30 HARI</div>
          <div class="plan-price">Rp 110.000 <small>/ 30 hari</small></div>
          <ul class="plan-features">
            <li>⏱️ Masa Aktif <strong>30 Hari (1 Bulan)</strong></li>
            <li>👑 Kuota <strong>UNLIMITED Foto</strong></li>
            <li>⚡ 10 Worker Parallel Sync</li>
            <li>🔒 Terikat 1 Device HWID</li>
            <li>👑 Prioritas Utama Server</li>
            <li>💬 Support Langsung 24/7</li>
          </ul>
          <a href="https://wa.me/628176498254?text=Halo%20Admin%20FotoSync%20PRO,%20saya%20ingin%20berlangganan%20Paket%2030%20HARI%20(Rp%20110.000)" target="_blank" class="btn-pricing outline">Order Paket 30 Hari via WA</a>
        </div>
      </div>
    </section>

  </main>

  <!-- FOOTER -->
  <footer class="footer">
    <div class="container">
      <p style="margin-bottom: 8px; font-weight: 800; color: var(--navy-darker);">FotoSync PRO Enterprise Suite v<?= htmlspecialchars($versionData['latest_version']) ?></p>
      <p style="margin-bottom: 6px;">WhatsApp Admin: <a href="https://wa.me/628176498254" target="_blank">08176498254</a> &bull; Email: <a href="mailto:r00t@ghazabegins.id">r00t@ghazabegins.id</a></p>
      <p>Developed by <a href="https://ghazabegins.id/" target="_blank" rel="noopener noreferrer">ghazabegins.id</a> &bull; All Rights Reserved.</p>
    </div>
  </footer>

</body>
</html>
