<?php
// Modular Sidebar Component for FotoSync PRO Admin Suite
// Color Theme: Pine Teal (#004643) & Warm Cream (#F0EDE5)
if (!defined('DB_HOST')) {
    exit('Direct access not permitted.');
}

$activeTab = $currentTab ?? 'licenses';
$userRole = getCurrentUserRole();
$userFullName = $_SESSION['admin_name'] ?? 'Administrator';
$userName = $_SESSION['admin_username'] ?? 'admin';
?>
<!-- ENTERPRISE SIDEBAR COMPONENT -->
<aside class="sidebar" id="adminSidebar">
  <div class="sidebar-brand">
    <div class="brand-logo" style="background: transparent; box-shadow: none;">
      <img src="../assets/logo.png" alt="FotoSync Logo" style="width: 36px; height: 36px; object-fit: contain;">
    </div>
    <div class="brand-info">
      <h2>FotoSync <span>PRO</span></h2>
      <p>Server Admin Portal</p>
    </div>
  </div>

  <!-- CURRENT LOGGED IN USER CARD -->
  <div class="user-session-card">
    <div class="user-avatar">
      <?= strtoupper(substr($userFullName, 0, 1)) ?>
    </div>
    <div class="user-details">
      <div class="user-name"><?= htmlspecialchars($userFullName) ?></div>
      <div class="user-meta">
        <span class="role-badge <?= $userRole === 'admin' ? 'role-admin' : 'role-staff' ?>">
          <?= $userRole === 'admin' ? '🛡️ Admin' : '👤 Staff' ?>
        </span>
        <span class="user-handle">@<?= htmlspecialchars($userName) ?></span>
      </div>
    </div>
  </div>

  <nav class="sidebar-nav">
    <div class="nav-section-label">MANAJEMEN UTAMA</div>
    
    <a href="?tab=licenses" class="nav-item <?= $activeTab === 'licenses' ? 'active' : '' ?>">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
      <span>Lisensi Master Key</span>
    </a>

    <?php if (isAdmin()): ?>
    <a href="?tab=users" class="nav-item <?= $activeTab === 'users' ? 'active' : '' ?>">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
      </svg>
      <span>Kelola Pengguna (Users)</span>
    </a>

    <a href="?tab=updater" class="nav-item <?= $activeTab === 'updater' ? 'active' : '' ?>">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>Auto-Update Software</span>
    </a>
    <?php endif; ?>

    <div class="nav-section-label" style="margin-top: 16px;">PENGATURAN AKUN</div>

    <a href="?tab=profile" class="nav-item <?= $activeTab === 'profile' ? 'active' : '' ?>">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
      <span>Edit Profil & Sandi</span>
    </a>

    <a href="?tab=telemetry" class="nav-item <?= $activeTab === 'telemetry' ? 'active' : '' ?>">
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
      <span>SERVER PORTAL ONLINE</span>
    </div>

    <a href="?logout=1" class="btn-sidebar-logout">
      <span>🔒 Keluar (Logout)</span>
    </a>

    <div style="text-align: center; font-size: 11px; color: var(--text-dim); margin-top: 10px; font-weight: 600;">
      Developed by <a href="https://ghazabegins.id/" target="_blank" rel="noopener noreferrer" style="color: var(--accent-mint); text-decoration: none; font-weight: 700;">ghazabegins.id</a>
    </div>
  </div>
</aside>
