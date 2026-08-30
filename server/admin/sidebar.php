<?php
// Modular Sidebar Component for FotoSync PRO Admin Suite
if (!defined('DB_HOST')) {
    exit('Direct access not permitted.');
}

$activeTab = $currentTab ?? 'licenses';
?>
<!-- ENTERPRISE SIDEBAR COMPONENT -->
<aside class="sidebar">
  <div class="sidebar-brand">
    <div class="brand-logo" style="background: transparent; box-shadow: none;">
      <img src="../assets/logo.png" alt="FotoSync Logo" style="width: 32px; height: 32px; object-fit: contain;">
    </div>
    <div class="brand-info">
      <h2>FotoSync <span>PRO</span></h2>
      <p>Enterprise License Portal</p>
    </div>
  </div>

  <nav class="sidebar-nav">
    <div class="nav-section-label">MANAJEMEN SERVER</div>
    <a href="?tab=licenses" class="nav-item <?= $activeTab === 'licenses' ? 'active' : '' ?>" style="text-decoration: none;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
      <span>Lisensi Master Key</span>
    </a>

    <a href="?tab=updater" class="nav-item <?= $activeTab === 'updater' ? 'active' : '' ?>" style="text-decoration: none;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>Auto-Update Software</span>
    </a>

    <a href="?tab=telemetry" class="nav-item <?= $activeTab === 'telemetry' ? 'active' : '' ?>" style="text-decoration: none;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="4 17 10 11 4 5"></polyline>
        <line x1="12" y1="19" x2="20" y2="19"></line>
      </svg>
      <span>Server Telemetry Log</span>
    </a>
  </nav>

  <div class="sidebar-footer">
    <div class="status-pill">
      <span class="status-dot"></span>
      <span>SERVER LOCALHOST ONLINE</span>
    </div>

    <a href="?logout=1" class="btn btn-danger btn-sm" style="width: 100%; text-align: center; height: 38px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700;">
      🔒 Keluar (Logout Admin)
    </a>

    <div style="text-align: center; font-size: 11px; color: var(--text-dim); margin-top: 10px; font-weight: 600;">
      Developed by <a href="https://ghazabegins.id/" target="_blank" rel="noopener noreferrer" style="color: #60a5fa; text-decoration: none; font-weight: 700;">ghazabegins.id</a>
    </div>
  </div>
</aside>
