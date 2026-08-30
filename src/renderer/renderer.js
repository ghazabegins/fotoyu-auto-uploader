// State Variables
let currentTab = 'dashboard';
let logFilter = 'ALL';
let logEntries = [];
let queueListCache = [];

// DOM Element Selectors
const pageTitle = document.getElementById('pageTitle');

// User Account DOM
const userAccountText = document.getElementById('userAccountText');
const loginModalBtn = document.getElementById('loginModalBtn');
const autoGetTokenBtn = document.getElementById('autoGetTokenBtn');
const logoutBtn = document.getElementById('logoutBtn');


// License DOM Elements
const sidebarTierTitle = document.getElementById('sidebarTierTitle');
const sidebarUpgradeBtn = document.getElementById('sidebarUpgradeBtn');
const upgradeHeaderBtn = document.getElementById('upgradeHeaderBtn');

// Upgrade Modal DOM
const upgradeModal = document.getElementById('upgradeModal');
const closeUpgradeModalBtn = document.getElementById('closeUpgradeModalBtn');
const licenseKeyInput = document.getElementById('licenseKeyInput');
const activateLicenseBtn = document.getElementById('activateLicenseBtn');
const licenseMsgAlert = document.getElementById('licenseMsgAlert');

const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const toggleWatcherBtn = document.getElementById('toggleWatcherBtn');
const watcherBtnText = document.getElementById('watcherBtnText');

// Metric Elements & Dashboard UI
const queueCount = document.getElementById('queueCount');
const uploadedCount = document.getElementById('uploadedCount');
const failedCount = document.getElementById('failedCount');
const totalHistoryCount = document.getElementById('totalHistoryCount');
const totalQueueText = document.getElementById('totalQueueText');
const progressPercent = document.getElementById('progressPercent');
const mainProgressBar = document.getElementById('mainProgressBar');
const successCountDisplay = document.getElementById('successCountDisplay');
const watchFolderText = document.getElementById('watchFolderText');
const eventIdDisplay = document.getElementById('eventIdDisplay');
const eventStatusBadge = document.getElementById('eventStatusBadge');
const livePhotoGrid = document.getElementById('livePhotoGrid');

// Side Panel Checklists
const sideTierText = document.getElementById('sideTierText');
const sideQuotaText = document.getElementById('sideQuotaText');
const checkLoginStatus = document.getElementById('checkLoginStatus');
const checkMetadataStatus = document.getElementById('checkMetadataStatus');
const checkConfigStatus = document.getElementById('checkConfigStatus');
const checkFolderStatus = document.getElementById('checkFolderStatus');

// Form Inputs - Settings
const settingsForm = document.getElementById('settingsForm');
const watchDirInput = document.getElementById('watchDir');
const browseDirBtn = document.getElementById('browseDirBtn');
const browseDirBtnForm = document.getElementById('browseDirBtnForm');
const apiEndpointInput = document.getElementById('apiEndpoint');
const eventIdInput = document.getElementById('eventId');
const authTokenInput = document.getElementById('authToken');
const toggleTokenVisibility = document.getElementById('toggleTokenVisibility');
const concurrencySelect = document.getElementById('concurrency');

// Form Inputs - Metadata
const metadataForm = document.getElementById('metadataForm');
const priceInput = document.getElementById('price');
const userNicknamesInput = document.getElementById('userNicknames');
const locationNameInput = document.getElementById('locationName');
const latitudeInput = document.getElementById('latitude');
const longitudeInput = document.getElementById('longitude');
const descriptionInput = document.getElementById('description');

// Terminals & Tables
const logTerminal = document.getElementById('logTerminal');
const fullQueueTableBody = document.getElementById('fullQueueTableBody');

// Toast
const saveToast = document.getElementById('saveToast');

// Tab Titles Mapping
const tabTitles = {
  dashboard: 'Upload dan Monitor',
  settings: 'Pengaturan Uploader & Direct API',
  metadata: 'Info Konten & Presets Metadata',
  logs: 'Live Console Activity Logs',
  history: 'Riwayat Upload & Queue Database'
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupFormHandlers();
  setupLicenseModal();
  setupIPCListeners();
  await loadInitialSettings();
  await refreshEngineStatus();
});

// Tab Navigation Logic
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabTarget = item.getAttribute('data-tab');
      switchTab(tabTarget);
    });
  });
}

function switchTab(tabTarget) {
  currentTab = tabTarget;

  // Update Nav Active State
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabTarget);
  });

  // Update Panel Views
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabTarget}`);
  });

  // Update Header Title
  if (pageTitle) pageTitle.textContent = tabTitles[tabTarget] || 'Upload dan Monitor';
}

// Load Initial Settings into Form
async function loadInitialSettings() {
  try {
    const settings = await window.electronAPI.getSettings();
    if (settings) {
      // Settings tab
      if (watchDirInput) watchDirInput.value = settings.watchDir || '';
      if (apiEndpointInput) apiEndpointInput.value = settings.apiEndpoint || 'https://api.fotoyu.com';
      if (eventIdInput) eventIdInput.value = settings.eventId || '';
      if (authTokenInput) authTokenInput.value = settings.authToken || '';
      if (concurrencySelect) concurrencySelect.value = settings.concurrency || 2;

      // Metadata tab
      if (priceInput) priceInput.value = settings.price !== undefined ? settings.price : 0;
      if (userNicknamesInput) userNicknamesInput.value = settings.userNicknames || '';
      if (locationNameInput) locationNameInput.value = settings.locationName || 'lat: 3.583200 lng: 98.627400';
      if (latitudeInput) latitudeInput.value = settings.latitude !== undefined ? settings.latitude : 3.5832;
      if (longitudeInput) longitudeInput.value = settings.longitude !== undefined ? settings.longitude : 98.6274;
      if (descriptionInput) descriptionInput.value = settings.description || 'Uploaded via FotoSync Pro';

      // Header & Event Display
      if (watchFolderText) watchFolderText.textContent = `Target: ${settings.watchDir ? settings.watchDir.split(/[\\/]/).pop() : 'Folder Belum Dipilih'}`;
      if (eventIdDisplay) eventIdDisplay.textContent = settings.eventId || 'Mandiri Jogja Marathon 2026';

      // Checklist Status Update
      updateChecklists(settings);

      // Account Status
      updateUserAccountUI(settings.userProfile, settings.authToken);
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

function updateChecklists(settings) {
  if (!settings) return;

  if (checkLoginStatus) {
    checkLoginStatus.textContent = settings.authToken ? 'Siap' : 'Belum';
    checkLoginStatus.className = settings.authToken ? 'check-state ready' : 'check-state';
  }

  if (checkMetadataStatus) {
    checkMetadataStatus.textContent = 'Siap';
  }

  if (checkConfigStatus) {
    checkConfigStatus.textContent = 'Siap';
  }

  if (checkFolderStatus) {
    checkFolderStatus.textContent = settings.watchDir ? 'Siap' : 'Belum';
    checkFolderStatus.className = settings.watchDir ? 'check-state ready' : 'check-state';
  }
}

// User Account UI Helper
function updateUserAccountUI(userProfile, token) {

  if (!userAccountText) return;

  if (token && userProfile) {
    userAccountText.textContent = `@${userProfile.username || userProfile.nickname || 'FotoyuUser'}`;
    if (logoutBtn) logoutBtn.classList.remove('hidden');
  } else if (token) {
    userAccountText.textContent = 'Token Terpasang';
    if (logoutBtn) logoutBtn.classList.remove('hidden');
  } else {
    userAccountText.textContent = 'Login Akun Fotoyu';
    if (logoutBtn) logoutBtn.classList.add('hidden');
  }
}


// License & Upgrade Modal Logic
function setupLicenseModal() {
  const openModal = () => {
    const alertModalEl = document.getElementById('alertModal');
    if (alertModalEl) alertModalEl.classList.add('hidden');
    if (upgradeModal) upgradeModal.classList.remove('hidden');
    if (licenseMsgAlert) licenseMsgAlert.classList.add('hidden');
    if (licenseKeyInput) licenseKeyInput.value = '';
  };


  const closeModal = () => {
    if (upgradeModal) upgradeModal.classList.add('hidden');
  };

  if (upgradeHeaderBtn) upgradeHeaderBtn.addEventListener('click', openModal);
  if (sidebarUpgradeBtn) sidebarUpgradeBtn.addEventListener('click', openModal);
  if (closeUpgradeModalBtn) closeUpgradeModalBtn.addEventListener('click', closeModal);

  if (upgradeModal) {
    upgradeModal.addEventListener('click', (e) => {
      if (e.target === upgradeModal) closeModal();
    });
  }

  if (activateLicenseBtn) {
    activateLicenseBtn.addEventListener('click', async () => {
      const key = licenseKeyInput ? licenseKeyInput.value.trim() : '';
      if (!key) {
        showLicenseAlert('Masukkan Kode Lisensi PRO.', 'error');
        return;
      }

      activateLicenseBtn.disabled = true;
      activateLicenseBtn.textContent = 'Memverifikasi...';

      const res = await window.electronAPI.activateLicense(key);
      activateLicenseBtn.disabled = false;
      activateLicenseBtn.textContent = 'Aktifkan Lisensi';

      if (res.success) {
        showLicenseAlert(res.message, 'success');
        showToast('🎉 Lisensi PRO Berhasil Diaktifkan!');
        await refreshEngineStatus();
        setTimeout(() => {
          closeModal();
        }, 1500);
      } else {
        showLicenseAlert(res.message, 'error');
      }
    });
  }
}

function showLicenseAlert(msg, type) {
  if (!licenseMsgAlert) return;
  licenseMsgAlert.textContent = msg;
  licenseMsgAlert.className = `license-alert ${type}`;
  licenseMsgAlert.classList.remove('hidden');
}

function updateLicenseUI(license) {
  if (!license) return;
  const { trialUploadCount, dailyLimit, tier, isPro, isPremium, remainingDays } = license;
  const count = trialUploadCount !== undefined ? trialUploadCount : 0;

  const isUnlimitedOrPaid = isPro || isPremium || dailyLimit === 0 || ['1_day', '7_days', '30_days', 'pro', 'premium'].includes(tier);

  if (isUnlimitedOrPaid) {
    let expLabel = '';
    if (remainingDays === 'LIFETIME' || remainingDays === 0) {
      expLabel = 'LIFETIME';
    } else if (remainingDays !== undefined && remainingDays !== '') {
      expLabel = `${remainingDays} Hari`;
    }
    
    let tierName = 'PRO MEMBER';
    if (tier === '1_day') tierName = 'PAKET 1 HARI';
    else if (tier === '7_days') tierName = 'PAKET 7 HARI';
    else if (tier === '30_days') tierName = 'PAKET 30 HARI';

    if (sidebarTierTitle) sidebarTierTitle.textContent = expLabel ? `Lisensi PRO (${expLabel})` : `Lisensi ${tierName}`;
    if (sideTierText) sideTierText.textContent = expLabel ? `${tierName} (${expLabel})` : tierName;
    if (sideQuotaText) sideQuotaText.textContent = 'UNLIMITED';
  } else {
    const limit = dailyLimit || 20;
    if (sidebarTierTitle) sidebarTierTitle.textContent = `FREE PLAN (${count}/${limit})`;
    if (sideTierText) sideTierText.textContent = 'FREE PLAN';
    if (sideQuotaText) sideQuotaText.textContent = `${count} / ${limit} Foto`;
  }
}

// Form Handlers
function setupFormHandlers() {
  // Login Modal Trigger
  const triggerAutoLogin = async () => {
    showToast('Membuka Halaman Login Fotoyu...');
    const res = await window.electronAPI.openLoginModal();
    if (res && res.success) {
      if (authTokenInput) authTokenInput.value = res.token;
      updateUserAccountUI(res.userProfile, res.token);
      showToast(`Login Berhasil! Logged in sebagai @${res.userProfile?.username || 'user'}`);
    }
  };

  if (loginModalBtn) loginModalBtn.addEventListener('click', triggerAutoLogin);
  if (autoGetTokenBtn) autoGetTokenBtn.addEventListener('click', triggerAutoLogin);

  // Logout Button Trigger
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        const res = await window.electronAPI.logout();
        if (res && res.success) {
          if (authTokenInput) authTokenInput.value = '';
          updateUserAccountUI(null, null);
          updateChecklists({ authToken: '', watchDir: watchDirInput ? watchDirInput.value : '' });
          showToast('🔒 Logged out dari akun Fotoyu. Silakan login kembali.');
          await refreshEngineStatus();
        }
      } catch (err) {
        console.error('Logout error:', err);
      }
    });
  }

  // Browse Directory Button
  const handleBrowseDir = async () => {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      if (watchDirInput) watchDirInput.value = dir;
      if (watchFolderText) watchFolderText.textContent = `Target: ${dir.split(/[\\/]/).pop()}`;
      await window.electronAPI.saveSettings({ watchDir: dir });
      const currentSettings = await window.electronAPI.getSettings();
      updateChecklists(currentSettings);
      showToast('Folder Target FTP Berhasil Dipilih & Disimpan!');
    }
  };

  if (browseDirBtn) browseDirBtn.addEventListener('click', handleBrowseDir);
  if (browseDirBtnForm) browseDirBtnForm.addEventListener('click', handleBrowseDir);

  // Toggle Password Visibility
  if (toggleTokenVisibility && authTokenInput) {
    toggleTokenVisibility.addEventListener('click', () => {
      const isPass = authTokenInput.type === 'password';
      authTokenInput.type = isPass ? 'text' : 'password';
    });
  }

  // Save Settings Form
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newSettings = {
        watchDir: watchDirInput.value.trim(),
        apiEndpoint: apiEndpointInput.value.trim(),
        eventId: eventIdInput.value.trim(),
        authToken: authTokenInput.value.trim(),
        concurrency: parseInt(concurrencySelect.value, 10) || 2
      };

      const res = await window.electronAPI.saveSettings(newSettings);
      if (res.success) {
        if (watchFolderText) watchFolderText.textContent = `Target: ${newSettings.watchDir ? newSettings.watchDir.split(/[\\/]/).pop() : 'Folder Belum Dipilih'}`;
        if (eventIdDisplay) eventIdDisplay.textContent = newSettings.eventId || 'Mandiri Jogja Marathon 2026';
        updateChecklists(newSettings);
        showToast('Pengaturan Uploader Berhasil Disimpan!');
      } else {
        showCustomAlert({
          title: 'Gagal Menyimpan',
          message: res.message || 'Gagal menyimpan konfigurasi.',
          icon: 'error',
          confirmText: 'Tutup'
        });
      }
    });
  }

  // Save Metadata Form
  if (metadataForm) {
    metadataForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const metadataSettings = {
        price: parseInt(priceInput.value, 10) || 0,
        userNicknames: userNicknamesInput.value.trim(),
        locationName: locationNameInput.value.trim(),
        latitude: parseFloat(latitudeInput.value) || 3.5832,
        longitude: parseFloat(longitudeInput.value) || 98.6274,
        description: descriptionInput.value.trim()
      };

      const res = await window.electronAPI.saveSettings(metadataSettings);
      if (res.success) {
        showToast('Presets Metadata Berhasil Disimpan!');
      } else {
        showCustomAlert({
          title: 'Gagal Menyimpan',
          message: res.message || 'Gagal menyimpan metadata.',
          icon: 'error',
          confirmText: 'Tutup'
        });
      }
    });
  }

  // Toggle Watcher Button with Custom Alert Modal & Toast Feedback
  if (toggleWatcherBtn) {
    toggleWatcherBtn.addEventListener('click', async () => {
      const isCurrentlyWatching = statusBadge ? statusBadge.classList.contains('watching') : false;

      // Auto-save watchDir from input if present before toggling
      if (!isCurrentlyWatching && watchDirInput && watchDirInput.value.trim()) {
        await window.electronAPI.saveSettings({ watchDir: watchDirInput.value.trim() });
      }

      const res = await window.electronAPI.toggleWatcher(!isCurrentlyWatching);

      if (res && res.success) {
        showToast(!isCurrentlyWatching ? '🚀 Sesi Auto-Sync Berhasil Dimulai!' : '🛑 Sesi Auto-Sync Dihentikan.');
      } else if (res && res.success === false) {
        if (res.requireLogin) {
          showCustomAlert({
            title: 'Login Akun Diperlukan',
            message: 'Sesi Auto-Sync tidak dapat dimulai karena Anda belum login ke akun Fotoyu. Silakan login terlebih dahulu.',
            icon: 'warning',
            confirmText: '🔑 Login Sekarang',
            cancelText: 'Batal',
            onConfirm: () => triggerAutoLogin()
          });
        } else {
          showCustomAlert({
            title: 'Folder Target Belum Dipilih',
            message: res.message || 'Harap pilih Watch Directory (Folder Target FTP) terlebih dahulu di Pengaturan Uploader.',
            icon: 'warning',
            confirmText: '📁 Pilih Folder Target',
            cancelText: 'Tutup',
            onConfirm: () => handleBrowseDir()
          });
        }
      }
    });
  }




  // Speed Test Button Handler
  const testSpeedBtn = document.getElementById('testSpeedBtn');
  const netStateText = document.getElementById('netStateText');
  const netSpeedText = document.getElementById('netSpeedText');
  const netSpeedVal = document.getElementById('netSpeedVal');

  if (testSpeedBtn) {
    testSpeedBtn.addEventListener('click', async () => {
      testSpeedBtn.disabled = true;
      testSpeedBtn.textContent = 'Menguji...';
      if (netStateText) netStateText.textContent = 'Menguji...';

      const res = await window.electronAPI.testSpeed();
      testSpeedBtn.disabled = false;
      testSpeedBtn.textContent = 'Tes kecepatan';

      if (res && res.success) {
        if (netStateText) netStateText.textContent = res.stateText;
        if (netSpeedText) netSpeedText.textContent = `${res.downloadSpeedMbps} Mbps`;
        if (netSpeedVal) netSpeedVal.textContent = `${res.uploadSpeedMbps} Mbps`;
        showToast(`⚡ Tes Kecepatan Selesai! Upload: ${res.uploadSpeedMbps} Mbps (${res.latencyMs}ms)`);
      } else {
        if (netStateText) netStateText.textContent = 'Offline';
        if (netSpeedText) netSpeedText.textContent = '0 Mbps';
        if (netSpeedVal) netSpeedVal.textContent = '0 Mbps';
        showToast('⚠️ Gagal menguji kecepatan jaringan.');
      }
    });
  }


  // Retry Failed Button
  const retryBtnHist = document.getElementById('retryFailedBtnHist');
  if (retryBtnHist) {
    retryBtnHist.addEventListener('click', async () => {
      const res = await window.electronAPI.retryFailed();
      if (res && res.success) {
        showToast('Mencoba Ulang Seluruh Foto yang Gagal...');
      }
    });
  }

  // Clear Log Button
  const clearLogBtn = document.getElementById('clearLogBtn');
  if (clearLogBtn) {
    clearLogBtn.addEventListener('click', () => {
      logEntries = [];
      renderLogs();
    });
  }
}

// IPC Listeners
function setupIPCListeners() {
  window.electronAPI.onStatusUpdate((status) => {
    updateStatusUI(status);
  });

  window.electronAPI.onLogAdd((logEntry) => {
    appendLog(logEntry);
  });

  window.electronAPI.onTokenExtracted((data) => {
    if (data && data.token) {
      if (authTokenInput) authTokenInput.value = data.token;
      updateUserAccountUI(data.userProfile, data.token);
      showToast(`Token Berhasil Ditangkap! User: @${data.userProfile?.username || 'user'}`);
    }
  });

  window.electronAPI.onQuotaExceeded((data) => {
    if (upgradeModal) upgradeModal.classList.remove('hidden');
    const planName = data?.planName || 'FREE PLAN';
    showLicenseAlert(`Batas Kuota Harian ${planName} hari ini telah tercapai (${data.trialUploadCount}/${data.trialLimit}). Kuota akan otomatis di-reset besok (24 jam) atau aktifkan Master Key PREMIUM / PRO untuk mengunggah lebih banyak foto.`, 'error');
  });

  // Auto Updater Handlers
  let updateDownloadUrl = null;
  let isUpdateReadyToInstall = false;

  const updateModal = document.getElementById('updateModal');
  const latestVersionBadge = document.getElementById('latestVersionBadge');
  const updateReleaseNotes = document.getElementById('updateReleaseNotes');
  const updateProgressBox = document.getElementById('updateProgressBox');
  const updateProgressPercent = document.getElementById('updateProgressPercent');
  const updateProgressBar = document.getElementById('updateProgressBar');
  const startUpdateBtn = document.getElementById('startUpdateBtn');
  const skipUpdateBtn = document.getElementById('skipUpdateBtn');
  const closeUpdateModalBtn = document.getElementById('closeUpdateModalBtn');

  const updateHeaderBtn = document.getElementById('updateHeaderBtn');
  const updateHeaderVer = document.getElementById('updateHeaderVer');

  if (updateHeaderBtn) {
    updateHeaderBtn.addEventListener('click', () => {
      if (updateModal) updateModal.classList.remove('hidden');
    });
  }

  if (closeUpdateModalBtn) {
    closeUpdateModalBtn.addEventListener('click', () => {
      if (updateModal) updateModal.classList.add('hidden');
    });
  }

  if (skipUpdateBtn) {
    skipUpdateBtn.addEventListener('click', () => {
      if (updateModal) updateModal.classList.add('hidden');
    });
  }

  if (startUpdateBtn) {
    startUpdateBtn.addEventListener('click', async () => {
      if (isUpdateReadyToInstall) {
        showToast('🚀 Memulai Pemasangan Update...');
        await window.electronAPI.installUpdate();
      } else if (updateDownloadUrl) {
        startUpdateBtn.disabled = true;
        startUpdateBtn.textContent = '⏳ Mengunduh...';
        if (updateProgressBox) updateProgressBox.classList.remove('hidden');
        try {
          await window.electronAPI.downloadUpdate(updateDownloadUrl);
        } catch (err) {
          startUpdateBtn.disabled = false;
          startUpdateBtn.textContent = '⚡ Coba Lagi';
          showToast(`❌ Gagal mengunduh update: ${err.message}`);
        }
      }
    });
  }

  window.electronAPI.onUpdateAvailable((data) => {
    updateDownloadUrl = data.downloadUrl;
    isUpdateReadyToInstall = false;
    if (latestVersionBadge) latestVersionBadge.textContent = `v${data.latestVersion}`;
    if (updateHeaderVer) updateHeaderVer.textContent = `v${data.latestVersion}`;
    if (updateReleaseNotes) updateReleaseNotes.textContent = data.releaseNotes || 'Perbaikan stabilitas & fitur baru.';
    if (skipUpdateBtn) skipUpdateBtn.style.display = data.isMandatory ? 'none' : 'inline-flex';
    if (updateHeaderBtn) updateHeaderBtn.classList.remove('hidden');
    if (updateModal) updateModal.classList.remove('hidden');
  });

  window.electronAPI.onUpdateNotAvailable(() => {
    if (updateHeaderBtn) updateHeaderBtn.classList.add('hidden');
    if (updateModal) updateModal.classList.add('hidden');
  });

  window.electronAPI.onUpdateProgress((data) => {
    const pct = data.progressPct || 0;
    if (updateProgressPercent) updateProgressPercent.textContent = `${pct}%`;
    if (updateProgressBar) updateProgressBar.style.width = `${pct}%`;
  });

  window.electronAPI.onUpdateDownloaded(() => {
    isUpdateReadyToInstall = true;
    if (startUpdateBtn) {
      startUpdateBtn.disabled = false;
      startUpdateBtn.textContent = '🚀 Restart & Pasang Sekarang';
    }
    showToast('🎉 File update berhasil diunduh! Klik Restart & Pasang.');
  });

  window.electronAPI.onUpdateError((data) => {
    if (startUpdateBtn) {
      startUpdateBtn.disabled = false;
      startUpdateBtn.textContent = '⚡ Coba Lagi';
    }
    showToast(`❌ Error update: ${data.message}`);
  });
}

async function refreshEngineStatus() {
  const status = await window.electronAPI.getStatus();
  if (status) {
    updateStatusUI(status);
  }
}

// Update UI Components
function updateStatusUI(data) {
  const { isWatching, stats, queue, license } = data;

  // Update Status Badges & Start/Stop Button
  if (isWatching) {
    if (statusBadge) statusBadge.className = 'session-badge watching';
    if (statusText) statusText.textContent = 'Sesi Berjalan';
    if (eventStatusBadge) {
      eventStatusBadge.className = 'event-status-badge';
      eventStatusBadge.textContent = '• UPLOAD BERJALAN';
    }
    if (toggleWatcherBtn) {
      toggleWatcherBtn.className = 'btn btn-action-danger';
      toggleWatcherBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="6" y="6" width="12" height="12"></rect>
        </svg>
        <span id="watcherBtnText">Stop</span>
      `;
    }
  } else {
    if (statusBadge) statusBadge.className = 'session-badge stopped';
    if (statusText) statusText.textContent = 'Sesi Berhenti';
    if (eventStatusBadge) {
      eventStatusBadge.className = 'event-status-badge inactive';
      eventStatusBadge.textContent = '• SIAP UPLOAD';
    }
    if (toggleWatcherBtn) {
      toggleWatcherBtn.className = 'btn btn-action-primary';
      toggleWatcherBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span id="watcherBtnText">Start</span>
      `;
    }
  }


  // Update Big Counters & Progress Bar
  if (stats) {
    const uploaded = stats.uploaded || 0;
    const queued = stats.queued || 0;
    const failed = stats.failed || 0;
    const total = uploaded + queued + failed;

    if (uploadedCount) uploadedCount.textContent = uploaded;
    if (totalQueueText) totalQueueText.textContent = total;
    if (queueCount) queueCount.textContent = queued;
    if (failedCount) failedCount.textContent = failed;
    if (totalHistoryCount) totalHistoryCount.textContent = stats.historyTotal || 0;
    if (successCountDisplay) successCountDisplay.textContent = uploaded;

    const pct = total > 0 ? Math.round((uploaded / total) * 100) : 0;
    if (progressPercent) progressPercent.textContent = `${pct}%`;
    if (mainProgressBar) mainProgressBar.style.width = `${pct}%`;
  }

  // Update Queue & Photo Grid
  if (queue) {
    queueListCache = queue;
    renderQueueTables(queue);
    renderPhotoThumbnails(queue);
  }

  // Update License Info
  if (license) {
    updateLicenseUI(license);
  }
}

function renderPhotoThumbnails(queue) {
  if (!livePhotoGrid) return;

  const uploadedItems = queue.filter(i => i.status === 'uploaded');
  if (uploadedItems.length === 0) {
    livePhotoGrid.innerHTML = `<div class="empty-photo-placeholder"><span>Belum ada foto yang terupload. Jalankan watcher untuk mengunggah foto.</span></div>`;
    return;
  }

  const html = uploadedItems.slice(-8).map(item => `
    <div class="photo-thumb-card">
      <img src="file://${item.filePath}" alt="${item.filename}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'100\\' fill=\\'%231e293b\\'><rect width=\\'100\\' height=\\'100\\'/></svg>'">
      <div class="badge-check">✓</div>
      <div class="filename-overlay">${item.filename}</div>
    </div>
  `).join('');

  livePhotoGrid.innerHTML = html;
}

function renderQueueTables(queue) {
  if (!fullQueueTableBody) return;

  if (!queue || queue.length === 0) {
    fullQueueTableBody.innerHTML = `<tr class="empty-row"><td colspan="5">Belum ada riwayat upload.</td></tr>`;
    return;
  }

  const rowsHtml = queue.map(item => {
    const timeStr = new Date(item.timestamp).toLocaleTimeString();
    const sizeMb = (item.size / 1024 / 1024).toFixed(2);
    
    return `
      <tr>
        <td title="${item.filePath}"><strong>${item.filename}</strong></td>
        <td>${sizeMb} MB</td>
        <td><span class="status-pill ${item.status}">${item.status.toUpperCase()}</span></td>
        <td>${item.retries}</td>
        <td>${timeStr}</td>
      </tr>
    `;
  }).join('');

  fullQueueTableBody.innerHTML = rowsHtml;
}

// Log Terminal Handler
function appendLog(entry) {
  logEntries.push(entry);
  if (logEntries.length > 500) logEntries.shift();

  renderLogs();
}

function renderLogs() {
  if (!logTerminal) return;

  const filtered = logEntries.filter(e => {
    if (logFilter === 'ALL') return true;
    return e.type === logFilter;
  });

  const html = filtered.map(e => `
    <div class="log-line ${e.type}">
      <span class="timestamp">[${e.timestamp}]</span>
      <span class="msg">${e.message}</span>
    </div>
  `).join('');

  logTerminal.innerHTML = html || `<div class="log-line system"><span class="msg">Belum ada log terekam.</span></div>`;
  logTerminal.scrollTop = logTerminal.scrollHeight;
}

// Toast Helper
function showToast(msg) {
  if (!saveToast) return;
  saveToast.textContent = msg;
  saveToast.classList.remove('hidden');
  setTimeout(() => {
    saveToast.classList.add('hidden');
  }, 3000);
}

// Custom Alert / Confirm Modal Helper
function showCustomAlert({ title, message, icon = 'warning', confirmText = 'OK', cancelText = null, onConfirm = null }) {
  const alertModal = document.getElementById('alertModal');
  const alertModalIcon = document.getElementById('alertModalIcon');
  const alertModalTitle = document.getElementById('alertModalTitle');
  const alertModalMessage = document.getElementById('alertModalMessage');
  const alertModalConfirmBtn = document.getElementById('alertModalConfirmBtn');
  const alertModalCancelBtn = document.getElementById('alertModalCancelBtn');

  if (!alertModal) return;

  alertModalTitle.textContent = title || 'Pemberitahuan';
  alertModalMessage.textContent = message || '';

  // Icon styling
  alertModalIcon.className = `alert-icon-box ${icon}`;
  if (icon === 'warning') alertModalIcon.innerHTML = '<span>⚠️</span>';
  else if (icon === 'error') alertModalIcon.innerHTML = '<span>🛑</span>';
  else if (icon === 'info') alertModalIcon.innerHTML = '<span>ℹ️</span>';
  else alertModalIcon.innerHTML = '<span>🔑</span>';

  // Confirm button
  alertModalConfirmBtn.textContent = confirmText;

  // Cancel button
  if (cancelText) {
    alertModalCancelBtn.textContent = cancelText;
    alertModalCancelBtn.style.display = 'inline-flex';
  } else {
    alertModalCancelBtn.style.display = 'none';
  }

  // Prevent modal double-stacking by hiding upgrade modal if open
  const upgradeModalEl = document.getElementById('upgradeModal');
  if (upgradeModalEl) upgradeModalEl.classList.add('hidden');

  alertModal.classList.remove('hidden');

  const cleanup = () => {
    alertModal.classList.add('hidden');
    alertModalConfirmBtn.onclick = null;
    alertModalCancelBtn.onclick = null;
    alertModal.onclick = null;
  };

  alertModalConfirmBtn.onclick = async () => {
    cleanup();
    if (onConfirm) {
      await onConfirm();
    }
  };

  alertModalCancelBtn.onclick = () => {
    cleanup();
  };

  alertModal.onclick = (e) => {
    if (e.target === alertModal) {
      cleanup();
    }
  };
}

// External Developer Credit Link Handler
const devCreditLink = document.getElementById('devCreditLink');
if (devCreditLink) {
  devCreditLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.electronAPI && window.electronAPI.openExternal) {
      window.electronAPI.openExternal('https://ghazabegins.id/');
    } else {
      window.open('https://ghazabegins.id/', '_blank');
    }
  });
}


