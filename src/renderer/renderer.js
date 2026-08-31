// State Variables
let currentTab = 'dashboard';
let logFilter = 'ALL';
let logEntries = [];
let queueListCache = [];
let historySearchQuery = '';
let historyStatusFilterVal = 'ALL';

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
const videoPriceInput = document.getElementById('videoPrice');
const userNicknamesInput = document.getElementById('userNicknames');
const locationNameInput = document.getElementById('locationName');
const latitudeInput = document.getElementById('latitude');
const longitudeInput = document.getElementById('longitude');
const descriptionInput = document.getElementById('description');

// Location Picker Box & Modal
const activeLocationText = document.getElementById('activeLocationText');
const locationPickerBox = document.getElementById('locationPickerBox');
const openLocationModalBtn = document.getElementById('openLocationModalBtn');
const locationSearchModal = document.getElementById('locationSearchModal');
const closeLocationModalBtn = document.getElementById('closeLocationModalBtn');
const locationSearchInput = document.getElementById('locationSearchInput');
const locationSearchSubmitBtn = document.getElementById('locationSearchSubmitBtn');
const locationSearchResults = document.getElementById('locationSearchResults');

// Terminals & Tables
const logTerminal = document.getElementById('logTerminal');
const fullQueueTableBody = document.getElementById('fullQueueTableBody');

// Toast
const saveToast = document.getElementById('saveToast');

// Tab Titles Mapping
const tabTitles = {
  dashboard: 'Upload dan Monitor',
  'live-shutter': 'Live Shutter Connect',
  settings: 'Pengaturan Uploader & Direct API',
  'app-settings': 'Pengaturan Aplikasi, Bahasa & Diagnostik',
  metadata: 'Info Konten & Presets Metadata',
  logs: 'Live Console Activity Logs',
  history: 'Riwayat Upload & Queue Database',
  help: 'Petunjuk Penggunaan & Pusat Bantuan'
};

// Initialize Application
async function initApp() {
  setupNavigation();
  setupFormHandlers();
  setupLicenseModal();
  setupIPCListeners();
  setupLiveShutterHandlers();
  await loadInitialSettings();
  await refreshEngineStatus();
  await refreshLiveShutterStatus();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

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
      if (priceInput) priceInput.value = settings.price !== undefined ? settings.price : 20000;
      if (videoPriceInput) videoPriceInput.value = settings.videoPrice !== undefined ? settings.videoPrice : '';
      if (userNicknamesInput) userNicknamesInput.value = settings.userNicknames || '';
      if (locationNameInput) locationNameInput.value = settings.locationName || 'Sudirman Chase plaza';
      if (latitudeInput) latitudeInput.value = settings.latitude !== undefined ? settings.latitude : -6.2095175;
      if (longitudeInput) longitudeInput.value = settings.longitude !== undefined ? settings.longitude : 106.82171;
      if (descriptionInput) descriptionInput.value = settings.description || 'Tes';

      if (activeLocationText) {
        const locName = settings.locationName || 'Sudirman Chase plaza';
        const lat = settings.latitude !== undefined ? settings.latitude : -6.2095175;
        const lng = settings.longitude !== undefined ? settings.longitude : 106.82171;
        activeLocationText.textContent = `${locName} (${lat}, ${lng})`;
      }

      // App Settings: Theme, Language, Auto-Start Watcher
      const darkModeToggleSwitch = document.getElementById('darkModeToggleSwitch');
      const autoStartWatcherCheckbox = document.getElementById('autoStartWatcherCheckbox');

      const currentTheme = settings.theme || 'light';
      if (darkModeToggleSwitch) darkModeToggleSwitch.checked = currentTheme === 'dark';
      applyTheme(currentTheme);

      const currentLang = settings.language || 'id';
      document.querySelectorAll('.lang-segment-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-lang') === currentLang);
      });

      if (autoStartWatcherCheckbox) autoStartWatcherCheckbox.checked = !!settings.autoStartWatcher;

      // Header & Event Display
      if (watchFolderText) watchFolderText.textContent = `Target: ${settings.watchDir ? settings.watchDir.split(/[\\/]/).pop() : 'Folder Belum Dipilih'}`;
      if (eventIdDisplay) eventIdDisplay.textContent = settings.locationName || settings.eventId || 'Sudirman Chase plaza';

      // Checklist Status Update
      updateChecklists(settings);

      // Account Status
      updateUserAccountUI(settings.userProfile, settings.authToken);
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

function applyTheme(theme) {
  const isDark = theme === 'dark';
  if (isDark) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }

  const darkModeToggleSwitch = document.getElementById('darkModeToggleSwitch');
  if (darkModeToggleSwitch) {
    darkModeToggleSwitch.checked = isDark;
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
  const setAccName = document.getElementById('settingsAccountName');
  const setDot = document.getElementById('settingsLoginStatusDot');

  if (token && userProfile) {
    const uname = `@${userProfile.username || userProfile.nickname || 'FotoyuUser'}`;
    if (userAccountText) userAccountText.textContent = uname;
    if (setAccName) setAccName.textContent = `Terhubung: ${uname}`;
    if (setDot) setDot.style.background = '#10b981';
    if (logoutBtn) logoutBtn.classList.remove('hidden');
  } else if (token) {
    if (userAccountText) userAccountText.textContent = 'Token Terpasang';
    if (setAccName) setAccName.textContent = 'Terhubung (Token Aktif)';
    if (setDot) setDot.style.background = '#10b981';
    if (logoutBtn) logoutBtn.classList.remove('hidden');
  } else {
    if (userAccountText) userAccountText.textContent = 'Login Akun Fotoyu';
    if (setAccName) setAccName.textContent = 'Belum Login ke Akun Fotoyu';
    if (setDot) setDot.style.background = '#ef4444';
    if (logoutBtn) logoutBtn.classList.add('hidden');
  }
}


window.openLicenseModal = function() {
  const alertModalEl = document.getElementById('alertModal');
  if (alertModalEl) alertModalEl.classList.add('hidden');
  const upModal = document.getElementById('upgradeModal');
  if (upModal) upModal.classList.remove('hidden');
  const msgAlert = document.getElementById('licenseMsgAlert');
  if (msgAlert) msgAlert.classList.add('hidden');
  const keyInput = document.getElementById('licenseKeyInput');
  if (keyInput) keyInput.value = '';
};

window.closeLicenseModal = function() {
  const upModal = document.getElementById('upgradeModal');
  if (upModal) upModal.classList.add('hidden');
};

// License & Upgrade Modal Logic
function setupLicenseModal() {
  const openModal = window.openLicenseModal;
  const closeModal = window.closeLicenseModal;

  const btnHeader = document.getElementById('upgradeHeaderBtn');
  const btnSidebar = document.getElementById('sidebarUpgradeBtn');
  const btnClose = document.getElementById('closeUpgradeModalBtn');
  const upModal = document.getElementById('upgradeModal');

  if (btnHeader) btnHeader.addEventListener('click', openModal);
  if (btnSidebar) btnSidebar.addEventListener('click', openModal);
  if (btnClose) btnClose.addEventListener('click', closeModal);

  if (upModal) {
    upModal.addEventListener('click', (e) => {
      if (e.target === upModal) closeModal();
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
        if (eventIdDisplay) {
          const locVal = locationNameInput ? locationNameInput.value.trim() : '';
          eventIdDisplay.textContent = locVal || newSettings.locationName || newSettings.eventId || 'Sudirman Chase plaza';
        }
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
        videoPrice: videoPriceInput ? (parseInt(videoPriceInput.value, 10) || 0) : 0,
        userNicknames: userNicknamesInput ? userNicknamesInput.value.trim() : '',
        locationName: locationNameInput ? locationNameInput.value.trim() : '',
        latitude: parseFloat(latitudeInput.value) || -6.2095175,
        longitude: parseFloat(longitudeInput.value) || 106.82171,
        description: descriptionInput ? descriptionInput.value.trim() : ''
      };

      const res = await window.electronAPI.saveSettings(metadataSettings);
      if (res.success) {
        if (eventIdDisplay) eventIdDisplay.textContent = metadataSettings.locationName || 'Sudirman Chase plaza';
        showToast('Informasi Foto dan Video Berhasil Disimpan!');
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

  // Location / Event Search Modal Global Handlers
  window.openLocationModal = function() {
    const modal = document.getElementById('locationSearchModal');
    const input = document.getElementById('locationSearchInput');
    if (modal) {
      modal.classList.remove('hidden');
      if (input) {
        input.focus();
        window.performLocationSearch(input.value.trim() || 'Medan');
      }
    }
  };

  window.closeLocationModal = function() {
    const modal = document.getElementById('locationSearchModal');
    if (modal) {
      modal.classList.add('hidden');
    }
  };

  // Event delegation to capture clicks on locationPickerBox or openLocationModalBtn or backdrop
  document.addEventListener('click', (e) => {
    const picker = e.target.closest('#locationPickerBox') || e.target.closest('#openLocationModalBtn');
    if (picker) {
      e.preventDefault();
      window.openLocationModal();
      return;
    }

    const closeBtn = e.target.closest('#closeLocationModalBtn');
    if (closeBtn) {
      e.preventDefault();
      window.closeLocationModal();
      return;
    }

    const modal = document.getElementById('locationSearchModal');
    if (modal && e.target === modal) {
      window.closeLocationModal();
    }
  });

  window.performLocationSearch = async function(query) {
    const resultsContainer = document.getElementById('locationSearchResults');
    if (!resultsContainer) return;

    resultsContainer.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">
        Mencari lokasi & event...
      </div>
    `;

    try {
      const results = await window.electronAPI.searchLocations(query || 'Medan');
      window.renderLocationResults(results);
    } catch (err) {
      resultsContainer.innerHTML = `
        <div style="padding: 24px; text-align: center; color: #ef4444; font-size: 13px;">
          Gagal memuat lokasi: ${err.message}
        </div>
      `;
    }
  };

  window.renderLocationResults = function(results) {
    const resultsContainer = document.getElementById('locationSearchResults');
    if (!resultsContainer) return;
    resultsContainer.innerHTML = '';

    if (!results || results.length === 0) {
      resultsContainer.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">
          Tidak ada Lokasi atau Event yang ditemukan.
        </div>
      `;
      return;
    }

    results.forEach(item => {
      const card = document.createElement('div');
      card.className = 'location-result-card';
      card.style.cssText = 'display: flex; align-items: center; justify-content: space-between; background: var(--bg-card-sub, #ffffff); border: 1px solid var(--border-subtle, #cbd5e1); border-radius: 14px; padding: 12px 14px; gap: 14px; transition: all 0.15s ease; cursor: pointer;';

      const tagType = item.type || (item.eventId ? 'event' : 'place');
      const hasImage = item.imageUrl && typeof item.imageUrl === 'string' && item.imageUrl.startsWith('http');

      // Left Thumbnail Container
      const thumbBox = document.createElement('div');
      thumbBox.style.cssText = 'width: 86px; height: 58px; border-radius: 10px; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #6b21a8 0%, #4c1d95 100%); shadow: inset 0 0 10px rgba(0,0,0,0.2);';

      const renderPurpleBadge = () => {
        thumbBox.innerHTML = `
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22V10"></path>
            <path d="M12 10C12 7 9 4 6 4S0 7 0 10c0 4 6 8 6 8s6-4 6-8z"></path>
            <path d="M12 10c0-3 3-6 6-6s6 3 6 6-6 8-6 8z"></path>
            <circle cx="12" cy="7" r="2.5" fill="#ffffff"></circle>
          </svg>
        `;
      };

      if (hasImage) {
        const img = document.createElement('img');
        img.src = item.imageUrl;
        img.alt = item.title || 'Location';
        img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 10px;';
        img.onerror = () => {
          renderPurpleBadge();
        };
        thumbBox.appendChild(img);
      } else {
        renderPurpleBadge();
      }

      // Middle Info Container
      const infoBox = document.createElement('div');
      infoBox.style.cssText = 'display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1;';
      
      const titleElem = document.createElement('strong');
      titleElem.style.cssText = 'font-size: 15px; font-weight: 700; color: var(--navy-darker); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;';
      titleElem.textContent = item.title;

      const subElem = document.createElement('div');
      subElem.style.cssText = 'font-size: 12px; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;';
      subElem.innerHTML = `<span style="color: #2563eb; font-weight: 800;">VERIFIED</span> · ${tagType} · ${item.subtitle || item.locationName}`;

      infoBox.appendChild(titleElem);
      infoBox.appendChild(subElem);

      // Content Wrapper (Left + Middle)
      const leftWrapper = document.createElement('div');
      leftWrapper.style.cssText = 'display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0;';
      leftWrapper.appendChild(thumbBox);
      leftWrapper.appendChild(infoBox);

      // Save Button
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn-select-location';
      saveBtn.style.cssText = 'background: var(--bg-body, #f1f5f9); border: 1px solid var(--border-subtle, #cbd5e1); border-radius: 8px; padding: 8px 18px; font-size: 13px; font-weight: 700; color: var(--navy-darker); cursor: pointer; flex-shrink: 0; transition: background 0.2s;';
      saveBtn.textContent = 'Simpan';

      card.appendChild(leftWrapper);
      card.appendChild(saveBtn);

      const selectItem = (e) => {
        if (e) e.stopPropagation();
        const locNameInp = document.getElementById('locationName');
        const latInp = document.getElementById('latitude');
        const lngInp = document.getElementById('longitude');
        const evtIdInp = document.getElementById('eventId');
        const activeText = document.getElementById('activeLocationText');

        if (locNameInp) locNameInp.value = item.locationName;
        if (latInp) latInp.value = item.latitude;
        if (lngInp) lngInp.value = item.longitude;
        if (evtIdInp) evtIdInp.value = item.eventId || '';

        if (activeText) {
          activeText.textContent = `${item.title} (${item.latitude.toFixed(6)}, ${item.longitude.toFixed(6)})`;
        }

        const evDisplay = document.getElementById('eventIdDisplay');
        if (evDisplay) {
          evDisplay.textContent = item.locationName || item.title;
        }

        // Persist location settings automatically
        window.electronAPI.saveSettings({
          locationName: item.locationName || item.title,
          latitude: item.latitude,
          longitude: item.longitude,
          eventId: item.eventId || ''
        });

        showToast(`Pilihan FotoTree/Lokasi: ${item.title}`);
        window.closeLocationModal();
      };

      card.addEventListener('click', selectItem);
      resultsContainer.appendChild(card);
    });
  };

  document.addEventListener('click', (e) => {
    const searchBtn = e.target.closest('#locationSearchSubmitBtn');
    if (searchBtn) {
      e.preventDefault();
      const input = document.getElementById('locationSearchInput');
      if (input) performLocationSearch(input.value.trim());
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'locationSearchInput' && e.key === 'Enter') {
      e.preventDefault();
      performLocationSearch(e.target.value.trim());
    }
  });

  // Mode Gelap Toggle Switch Handler
  const darkModeToggleSwitch = document.getElementById('darkModeToggleSwitch');
  if (darkModeToggleSwitch) {
    darkModeToggleSwitch.addEventListener('change', async (e) => {
      const isDark = e.target.checked;
      const newTheme = isDark ? 'dark' : 'light';
      applyTheme(newTheme);
      await window.electronAPI.saveSettings({ theme: newTheme });
      showToast(isDark ? 'Mode Gelap Diaktifkan' : 'Mode Terang Diaktifkan');
    });
  }

  // Segmented Language Switcher Handler
  const langSegmentBtns = document.querySelectorAll('.lang-segment-btn');
  langSegmentBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const selectedLang = btn.getAttribute('data-lang');
      langSegmentBtns.forEach(b => b.classList.toggle('active', b === btn));
      await window.electronAPI.saveSettings({ language: selectedLang });
      showToast(selectedLang === 'en' ? 'Language switched to English' : 'Bahasa diubah ke Bahasa Indonesia');
    });
  });

  // Auto-Start Watcher Checkbox Handler
  const autoStartWatcherCheckbox = document.getElementById('autoStartWatcherCheckbox');
  if (autoStartWatcherCheckbox) {
    autoStartWatcherCheckbox.addEventListener('change', async (e) => {
      const isAutoStart = e.target.checked;
      await window.electronAPI.saveSettings({ autoStartWatcher: isAutoStart });
      showToast(isAutoStart ? 'Auto-Start Watcher Aktif saat aplikasi dibuka' : 'Auto-Start Watcher Nonaktif');
    });
  }

  // Send Error Report Handler
  const sendErrorReportBtn = document.getElementById('sendErrorReportBtn');
  if (sendErrorReportBtn) {
    sendErrorReportBtn.addEventListener('click', async () => {
      sendErrorReportBtn.disabled = true;
      sendErrorReportBtn.textContent = 'Membuat Laporan...';

      const reportPayload = {
        recentLogs: logEntries ? logEntries.slice(-40) : [],
        queueState: queueListCache ? queueListCache.slice(-20) : []
      };

      const res = await window.electronAPI.sendErrorReport(reportPayload);
      sendErrorReportBtn.disabled = false;
      sendErrorReportBtn.textContent = 'Kirim Laporan Error';

      if (res && res.success) {
        showCustomAlert({
          title: 'Laporan Error Berhasil Dibuat',
          message: `Laporan diagnostik sistem & error log telah berhasil dibuat!\n\nPath File:\n${res.filePath}\n\nIngin mengirimkan laporan ini ke WhatsApp Support Admin?`,
          icon: 'success',
          confirmText: 'WhatsApp Support Admin',
          cancelText: 'Tutup',
          onConfirm: () => {
            window.electronAPI.openExternal(`https://wa.me/628176498254?text=Halo%20Admin,%20saya%20mengirim%20laporan%20error%20FotoSync%20PRO.%20File:%20${encodeURIComponent(res.filePath)}`);
          }
        });
      } else {
        showCustomAlert({
          title: 'Gagal Membuat Laporan',
          message: res.message || 'Gagal menyimpan file laporan error.',
          icon: 'error',
          confirmText: 'Tutup'
        });
      }
    });
  }

  // Toggle Watcher Button with Confirmation Modal displaying Metadata before starting
  if (toggleWatcherBtn) {
    toggleWatcherBtn.addEventListener('click', async () => {
      const isCurrentlyWatching = statusBadge ? statusBadge.classList.contains('watching') : false;

      // If user wants to STOP the watcher, stop immediately
      if (isCurrentlyWatching) {
        const res = await window.electronAPI.toggleWatcher(false);
        if (res && res.success) {
          showToast('Sesi Auto-Sync Dihentikan.');
        }
        return;
      }

      // User wants to START the watcher:
      // Auto-save watchDir from input if present before toggling
      if (watchDirInput && watchDirInput.value.trim()) {
        await window.electronAPI.saveSettings({ watchDir: watchDirInput.value.trim() });
      }

      const settings = await window.electronAPI.getSettings();
      if (!settings || !settings.authToken) {
        showCustomAlert({
          title: 'Login Akun Diperlukan',
          message: 'Sesi Auto-Sync tidak dapat dimulai karena Anda belum login ke akun Fotoyu. Silakan login terlebih dahulu.',
          icon: 'warning',
          confirmText: 'Login Sekarang',
          cancelText: 'Batal',
          onConfirm: () => triggerAutoLogin()
        });
        return;
      }

      if (!settings.watchDir) {
        showCustomAlert({
          title: 'Folder Target Belum Dipilih',
          message: 'Harap pilih Watch Directory (Folder Target FTP) terlebih dahulu di Pengaturan Uploader.',
          icon: 'warning',
          confirmText: 'Pilih Folder Target',
          cancelText: 'Tutup',
          onConfirm: () => handleBrowseDir()
        });
        return;
      }

      // Format Metadata Preview Card
      const eventName = settings.eventId || 'Mandiri Jogja Marathon 2026';
      const folderName = settings.watchDir ? settings.watchDir.split(/[\\/]/).pop() : '-';
      const priceFormatted = settings.price ? `Rp ${Number(settings.price).toLocaleString('id-ID')}` : 'Gratis (Rp 0)';
      const nicknames = settings.userNicknames || 'Belum diisi';
      const location = settings.locationName || `${settings.latitude || 0}, ${settings.longitude || 0}`;
      const desc = settings.description || 'Uploaded via FotoSync Pro';

      const metadataHtml = `
        <div style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 10px; text-align: left;">
          Periksa metadata konten di bawah ini sebelum memulai proses unggah otomatis:
        </div>
        <div class="confirm-metadata-card" style="text-align: left; background: var(--bg-card-sub, #f8fafc); border: 1px solid var(--border-subtle, #e2e8f0); border-radius: 12px; padding: 14px 16px; font-size: 12.5px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-subtle, #e2e8f0); padding-bottom: 8px;">
            <span style="color: var(--text-muted);">Event ID / Nama:</span>
            <strong style="color: #2563eb; font-weight: 800;">${eventName}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-muted);">Folder Target:</span>
            <strong style="color: var(--navy-darker); max-width: 200px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${settings.watchDir}">${folderName}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-muted);">Harga Foto:</span>
            <strong style="color: var(--navy-darker);">${priceFormatted}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-muted);">Tag Nickname:</span>
            <strong style="color: var(--navy-darker);">${nicknames}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-muted);">Lokasi / GPS:</span>
            <strong style="color: var(--navy-darker); max-width: 200px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${location}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-muted);">Deskripsi:</span>
            <strong style="color: var(--navy-darker); max-width: 200px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${desc}</strong>
          </div>
        </div>
      `;

      showCustomAlert({
        title: 'Konfirmasi Metadata Konten',
        message: metadataHtml,
        icon: 'info',
        useHTML: true,
        confirmText: 'Mulai Auto-Upload',
        cancelText: 'Edit Metadata',
        onConfirm: async () => {
          const res = await window.electronAPI.toggleWatcher(true);
          if (res && res.success) {
            showToast('Sesi Auto-Sync Berhasil Dimulai!');
          } else if (res && res.message) {
            showToast(res.message);
          }
        },
        onCancel: () => {
          switchTab('metadata');
        }
      });
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

  // Queue Management & Search Filters
  const historySearchInput = document.getElementById('historySearchInput');
  const historyStatusFilter = document.getElementById('historyStatusFilter');
  const clearCompletedQueueBtn = document.getElementById('clearCompletedQueueBtn');

  if (historySearchInput) {
    historySearchInput.addEventListener('input', (e) => {
      historySearchQuery = (e.target.value || '').toLowerCase().trim();
      renderQueueTables(queueListCache);
    });
  }

  if (historyStatusFilter) {
    historyStatusFilter.addEventListener('change', (e) => {
      historyStatusFilterVal = e.target.value || 'ALL';
      renderQueueTables(queueListCache);
    });
  }

  if (clearCompletedQueueBtn) {
    clearCompletedQueueBtn.addEventListener('click', async () => {
      const res = await window.electronAPI.clearCompletedQueue();
      if (res && res.success) {
        showToast(`🧹 Berhasil membersihkan ${res.clearedCount} foto terupload dari tampilan antrean!`);
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

  const totalCount = queue ? queue.length : 0;
  const totalCountEl = document.getElementById('totalHistoryCountText');
  const filteredCountEl = document.getElementById('filteredHistoryCountText');
  if (totalCountEl) totalCountEl.textContent = totalCount;

  if (!queue || queue.length === 0) {
    if (filteredCountEl) filteredCountEl.textContent = '0';
    fullQueueTableBody.innerHTML = `<tr class="empty-row"><td colspan="7">Belum ada riwayat upload.</td></tr>`;
    return;
  }

  // Filter items by status and search query
  const filtered = queue.filter(item => {
    if (historyStatusFilterVal !== 'ALL' && item.status?.toUpperCase() !== historyStatusFilterVal) {
      return false;
    }
    if (historySearchQuery && !item.filename?.toLowerCase().includes(historySearchQuery)) {
      return false;
    }
    return true;
  });

  if (filteredCountEl) filteredCountEl.textContent = filtered.length;

  if (filtered.length === 0) {
    fullQueueTableBody.innerHTML = `<tr class="empty-row"><td colspan="7">Tidak ada foto yang cocok dengan filter "${historySearchQuery || historyStatusFilterVal}".</td></tr>`;
    return;
  }

  const rowsHtml = filtered.map(item => {
    const timeStr = new Date(item.timestamp).toLocaleTimeString();
    const sizeMb = (item.size / 1024 / 1024).toFixed(2);
    const fileUrl = item.filePath ? (item.filePath.startsWith('file://') ? item.filePath : `file:///${item.filePath.replace(/\\/g, '/')}`) : '';
    const safePath = (item.filePath || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const safeName = (item.filename || '').replace(/'/g, "\\'");

    return `
      <tr>
        <td>
          <div class="history-thumb-box" style="width: 42px; height: 42px; border-radius: 8px; overflow: hidden; background: #0f172a; cursor: pointer; border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center;" onclick="openPhotoPreviewModal('${safePath}', '${safeName}', 'Riwayat Upload')" title="Klik untuk lihat preview foto">
            ${fileUrl ? `<img src="${fileUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" /><span style="display:none; font-size:16px;">🖼️</span>` : `<span style="font-size:16px;">📷</span>`}
          </div>
        </td>
        <td title="${item.filePath}"><strong>${item.filename}</strong></td>
        <td>${sizeMb} MB</td>
        <td><span class="status-pill ${item.status}">${item.status.toUpperCase()}</span></td>
        <td>${item.retries}</td>
        <td>${timeStr}</td>
        <td style="text-align: center;">
          <button class="btn btn-ghost-sm" style="padding: 4px 10px; font-size: 11px;" onclick="openPhotoPreviewModal('${safePath}', '${safeName}', 'Riwayat Upload')">🔍 Preview</button>
        </td>
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
function showCustomAlert({ title, message, icon = 'warning', confirmText = 'OK', cancelText = null, onConfirm = null, onCancel = null, useHTML = false }) {
  const alertModal = document.getElementById('alertModal');
  const alertModalIcon = document.getElementById('alertModalIcon');
  const alertModalTitle = document.getElementById('alertModalTitle');
  const alertModalMessage = document.getElementById('alertModalMessage');
  const alertModalConfirmBtn = document.getElementById('alertModalConfirmBtn');
  const alertModalCancelBtn = document.getElementById('alertModalCancelBtn');

  if (!alertModal) return;

  alertModalTitle.textContent = title || 'Pemberitahuan';
  if (useHTML) {
    alertModalMessage.innerHTML = message || '';
  } else {
    alertModalMessage.textContent = message || '';
  }

  // Icon styling (Hidden for clean minimal aesthetic)
  alertModalIcon.style.display = 'none';

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

  alertModalCancelBtn.onclick = async () => {
    cleanup();
    if (onCancel) {
      await onCancel();
    }
  };

  alertModal.onclick = (e) => {
    if (e.target === alertModal) {
      cleanup();
      if (onCancel) {
        onCancel();
      }
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

// ==========================================================================
// LIVE SHUTTER CONNECT HANDLERS & TELEMETRY
// ==========================================================================
let shutterSoundEnabled = true;

function playShutterAudio() {
  if (!shutterSoundEnabled) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch (e) {}
}

function setupLiveShutterHandlers() {
  const cableToggle = document.getElementById('cableToggle');
  const autoDCIMCheck = document.getElementById('autoDCIMCheck');
  const forceScanCableBtn = document.getElementById('forceScanCableBtn');
  const wifiToggle = document.getElementById('wifiToggle');
  const wifiPortInput = document.getElementById('wifiPortInput');
  const copyWifiIpBtn = document.getElementById('copyWifiIpBtn');
  const triggerTestShotBtn = document.getElementById('triggerTestShotBtn');
  const toggleShutterSoundBtn = document.getElementById('toggleShutterSoundBtn');

  // Sound Toggle
  if (toggleShutterSoundBtn) {
    toggleShutterSoundBtn.addEventListener('click', () => {
      shutterSoundEnabled = !shutterSoundEnabled;
      const icon = document.getElementById('soundIcon');
      const text = document.getElementById('soundText');
      if (icon) icon.textContent = shutterSoundEnabled ? '' : '';
      if (text) text.textContent = `Suara Shutter: ${shutterSoundEnabled ? 'ON' : 'OFF'}`;
      showToast(`Suara Shutter Kamera: ${shutterSoundEnabled ? 'Diaktifkan' : 'Dimatikan'}`);
    });
  }

  // Cable Mode Toggle
  if (cableToggle) {
    cableToggle.addEventListener('change', async () => {
      const enabled = cableToggle.checked;
      const autoDetectDCIM = autoDCIMCheck ? autoDCIMCheck.checked : true;
      if (window.electronAPI && window.electronAPI.toggleCableMode) {
        await window.electronAPI.toggleCableMode({ enabled, autoDetectDCIM });
      }
      showToast(enabled ? 'Pemantauan Kabel USB Direct & MTP AKTIF' : 'Pemantauan Kabel USB Direct NON-AKTIF');
    });
  }

  if (autoDCIMCheck) {
    autoDCIMCheck.addEventListener('change', async () => {
      const enabled = cableToggle ? cableToggle.checked : true;
      const autoDetectDCIM = autoDCIMCheck.checked;
      if (window.electronAPI && window.electronAPI.toggleCableMode) {
        await window.electronAPI.toggleCableMode({ enabled, autoDetectDCIM });
      }
    });
  }

  // Force Rescan Cable & MTP Cameras Button
  if (forceScanCableBtn) {
    forceScanCableBtn.addEventListener('click', async () => {
      forceScanCableBtn.disabled = true;
      forceScanCableBtn.textContent = 'Memindai...';
      showToast('Memindai Ulang Kamera Kabel USB & MTP...');
      if (window.electronAPI && window.electronAPI.forceScanCable) {
        const res = await window.electronAPI.forceScanCable();
        if (res && res.connectedCamera) {
          showToast(`Terdeteksi: ${res.connectedCamera}`);
        } else {
          showToast('Selesai memindai. Pastikan kabel kamera terhubung & kamera menyala.');
        }
      }
      forceScanCableBtn.disabled = false;
      forceScanCableBtn.textContent = 'Pindai Ulang Kamera Kabel';
      await refreshLiveShutterStatus();
    });
  }

  // WiFi Server Toggle
  if (wifiToggle) {
    wifiToggle.addEventListener('change', async () => {
      const enabled = wifiToggle.checked;
      const port = wifiPortInput ? parseInt(wifiPortInput.value, 10) || 2121 : 2121;
      if (window.electronAPI && window.electronAPI.toggleWifiServer) {
        const res = await window.electronAPI.toggleWifiServer({ enabled, port });
        if (res && res.running) {
          showToast(`Server WiFi Kamera Berhasil Aktif di Port ${port}`);
        } else if (res && !res.running && enabled) {
          wifiToggle.checked = false;
          showToast(`Gagal membuka Server WiFi: ${res.error || 'Port terpakai'}`);
        } else {
          showToast('Server WiFi Kamera Dihentikan');
        }
      }
      await refreshLiveShutterStatus();
    });
  }

  if (wifiPortInput) {
    wifiPortInput.addEventListener('change', async () => {
      if (wifiToggle && wifiToggle.checked && window.electronAPI && window.electronAPI.toggleWifiServer) {
        const port = parseInt(wifiPortInput.value, 10) || 2121;
        await window.electronAPI.toggleWifiServer({ enabled: true, port });
        showToast(`Port WiFi Server diubah ke ${port}`);
        await refreshLiveShutterStatus();
      }
    });
  }

  // Copy WiFi IP Address Button
  if (copyWifiIpBtn) {
    copyWifiIpBtn.addEventListener('click', () => {
      const wifiIpDisplay = document.getElementById('wifiIpDisplay');
      if (wifiIpDisplay && wifiIpDisplay.textContent) {
        navigator.clipboard.writeText(wifiIpDisplay.textContent);
        showToast(`Alamat IP Server disalin: ${wifiIpDisplay.textContent}`);
      }
    });
  }

  // Camera Connection Guide Toggle Accordion & Brand Filter
  const toggleGuideHeader = document.getElementById('toggleGuideHeader');
  const toggleGuideBtn = document.getElementById('toggleGuideBtn');
  const cameraGuideContent = document.getElementById('cameraGuideContent');

  if (toggleGuideHeader && cameraGuideContent) {
    toggleGuideHeader.addEventListener('click', () => {
      const isHidden = cameraGuideContent.classList.contains('hidden');
      if (isHidden) {
        cameraGuideContent.classList.remove('hidden');
        if (toggleGuideBtn) toggleGuideBtn.textContent = '▲ Tutup Panduan';
      } else {
        cameraGuideContent.classList.add('hidden');
        if (toggleGuideBtn) toggleGuideBtn.textContent = '▼ Buka Panduan';
      }
    });
  }

  const brandPills = document.querySelectorAll('.brand-pill');
  if (brandPills.length > 0) {
    brandPills.forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent collapsing guide card when clicking pill
        brandPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        const selectedBrand = pill.getAttribute('data-brand');
        const brandItems = document.querySelectorAll('.brand-item');

        brandItems.forEach(item => {
          if (selectedBrand === 'all') {
            item.style.display = 'block';
          } else {
            if (item.classList.contains(selectedBrand)) {
              item.style.display = 'block';
            } else {
              item.style.display = 'none';
            }
          }
        });
      });
    });
  }

  // Test Shutter Trigger Button
  if (triggerTestShotBtn) {
    triggerTestShotBtn.addEventListener('click', async () => {
      if (window.electronAPI && window.electronAPI.triggerTestShot) {
        triggerTestShotBtn.disabled = true;
        triggerTestShotBtn.textContent = 'Menyinkronkan...';
        const res = await window.electronAPI.triggerTestShot();
        triggerTestShotBtn.disabled = false;
        triggerTestShotBtn.textContent = 'Tes Shutter Live';
        if (res && res.success) {
          showToast(`Tes Shutter Berhasil: ${res.filename} (${res.sizeMb} MB) dari ${res.cameraName}`);
        } else if (res && res.warning) {
          showToast(res.error);
        } else {
          showToast(res?.error || 'Kamera tidak terhubung atau mati.');
        }
      }
    });
  }

  // Live Shutter IPC Listeners
  if (window.electronAPI) {
    if (window.electronAPI.onLiveShutterStatusUpdate) {
      window.electronAPI.onLiveShutterStatusUpdate((status) => {
        updateLiveShutterUI(status);
      });
    }

    if (window.electronAPI.onLiveShotCaptured) {
      window.electronAPI.onLiveShotCaptured((shotData) => {
        handleLiveShotCaptured(shotData);
      });
    }

    if (window.electronAPI.onLiveCameraPluggedIn) {
      window.electronAPI.onLiveCameraPluggedIn((plugData) => {
        showToast(`KAMERA TERHUBUNG! ${plugData.cameraName}. Mengambil foto dari ${plugData.drivePath}...`);
        
        const watchDirInput = document.getElementById('watchDir');
        if (watchDirInput) {
          watchDirInput.value = plugData.drivePath;
        }

        const watchDirDisplay = document.getElementById('watchDirDisplay');
        if (watchDirDisplay) {
          watchDirDisplay.textContent = plugData.drivePath;
        }
      });
    }
  }
}

async function refreshLiveShutterStatus() {
  if (window.electronAPI && window.electronAPI.getLiveShutterStatus) {
    const status = await window.electronAPI.getLiveShutterStatus();
    if (status) {
      updateLiveShutterUI(status);
    }
  }
}

function updateLiveShutterUI(status) {
  if (!status) return;

  const { cable, wifi, stats } = status;

  // Cable Status
  const cableStatusBox = document.getElementById('cableStatusBox');
  const cableStatusText = document.getElementById('cableStatusText');
  if (cableStatusBox && cableStatusText) {
    if (cable && cable.connectedCamera) {
      cableStatusBox.className = 'status-box connected';
      cableStatusText.textContent = `🔌 ${cable.connectedCamera}`;
    } else if (cable && cable.enabled) {
      cableStatusBox.className = 'status-box offline';
      cableStatusText.textContent = 'Menunggu Kabel Kamera Dicolok (Mass Storage / MTP)...';
    } else {
      cableStatusBox.className = 'status-box offline';
      cableStatusText.textContent = 'Pemantauan Kabel Non-Aktif';
    }
  }

  // WiFi Server Status
  const wifiStatusBox = document.getElementById('wifiStatusBox');
  const wifiStatusText = document.getElementById('wifiStatusText');
  const wifiIpDisplay = document.getElementById('wifiIpDisplay');
  const wifiToggle = document.getElementById('wifiToggle');

  if (wifiStatusBox && wifiStatusText) {
    if (wifi && wifi.running) {
      wifiStatusBox.className = 'status-box connected';
      wifiStatusText.textContent = `📡 Server WiFi Ingest Aktif (Port ${wifi.port})`;
      if (wifiIpDisplay) wifiIpDisplay.textContent = `http://${wifi.ip}:${wifi.port}`;
      if (wifiToggle) wifiToggle.checked = true;
    } else {
      wifiStatusBox.className = 'status-box offline';
      wifiStatusText.textContent = 'Server WiFi Dihentikan';
      if (wifiIpDisplay) wifiIpDisplay.textContent = `http://${wifi?.ip || '127.0.0.1'}:${wifi?.port || 2121}`;
      if (wifiToggle) wifiToggle.checked = false;
    }
  }

  // Stats Counter
  const totalLiveShotsText = document.getElementById('totalLiveShotsText');
  if (totalLiveShotsText && stats) {
    totalLiveShotsText.textContent = stats.totalShots || 0;
  }
}

let flashTimer = null;

// Photo Lightbox Preview Modal Handler
function openPhotoPreviewModal(filePath, filename, sourceMode = 'Live Shutter') {
  const modal = document.getElementById('photoPreviewModal');
  const img = document.getElementById('photoPreviewImg');
  const title = document.getElementById('photoPreviewFilename');
  const pathCode = document.getElementById('photoPreviewPath');
  const badge = document.getElementById('photoPreviewSourceBadge');

  if (modal && img && title) {
    title.textContent = filename || 'Foto Live';
    if (pathCode) pathCode.textContent = filePath || '-';
    if (badge) badge.textContent = sourceMode || 'Live Shutter';

    // Format file URI safely for Electron renderer
    if (filePath) {
      const fileUrl = filePath.startsWith('file://') ? filePath : `file:///${filePath.replace(/\\/g, '/')}`;
      img.src = fileUrl;
    }

    modal.classList.remove('hidden');
  }
}

// Wire Close Buttons for Photo Preview Modal
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('photoPreviewModal');
  const closeBtn1 = document.getElementById('closePhotoPreviewModalBtn');
  const closeBtn2 = document.getElementById('photoPreviewCloseBtn');

  const closeModal = () => {
    if (modal) modal.classList.add('hidden');
  };

  if (closeBtn1) closeBtn1.addEventListener('click', closeModal);
  if (closeBtn2) closeBtn2.addEventListener('click', closeModal);

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }
});

function handleLiveShotCaptured(shotData) {
  playShutterAudio();

  const fileUrl = shotData.filePath ? (shotData.filePath.startsWith('file://') ? shotData.filePath : `file:///${shotData.filePath.replace(/\\/g, '/')}`) : '';

  // Trigger visual flash banner
  const flashBanner = document.getElementById('liveShotFlashBanner');
  const flashShotImg = document.getElementById('flashShotImg');
  const flashShotTitle = document.getElementById('flashShotTitle');
  const flashShotDetail = document.getElementById('flashShotDetail');
  const flashShotSource = document.getElementById('flashShotSource');

  if (flashBanner) {
    if (flashShotTitle) flashShotTitle.textContent = `LIVE SHOT: ${shotData.filename}`;
    if (flashShotDetail) flashShotDetail.textContent = `Dari: ${shotData.cameraModel || 'Kamera Direct'} · ${new Date(shotData.timestamp).toLocaleTimeString()}`;
    if (flashShotSource) flashShotSource.textContent = shotData.sourceMode || 'USB Cable';
    if (flashShotImg && fileUrl) {
      flashShotImg.src = fileUrl;
    }

    flashBanner.onclick = () => {
      openPhotoPreviewModal(shotData.filePath, shotData.filename, shotData.sourceMode);
    };

    flashBanner.classList.remove('hidden');
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flashBanner.classList.add('hidden');
    }, 4500);
  }

  // Append stream row to Live Activity Feed with Photo Thumbnail
  const feed = document.getElementById('liveStreamFeed');
  if (feed) {
    const emptyMsg = feed.querySelector('.feed-empty-msg');
    if (emptyMsg) emptyMsg.remove();

    const timeStr = new Date(shotData.timestamp).toLocaleTimeString();
    const row = document.createElement('div');
    row.className = 'stream-row stream-row-interactive';
    row.setAttribute('title', 'Klik untuk melihat preview foto penuh');

    const escapedPath = (shotData.filePath || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const escapedName = (shotData.filename || '').replace(/'/g, "\\'");
    const escapedSource = (shotData.sourceMode || '').replace(/'/g, "\\'");

    row.onclick = () => {
      openPhotoPreviewModal(shotData.filePath, shotData.filename, shotData.sourceMode);
    };

    row.innerHTML = `
      <div class="stream-left" style="display: flex; align-items: center; gap: 12px;">
        <div class="stream-thumb-box" style="width: 44px; height: 44px; border-radius: 8px; overflow: hidden; background: #0f172a; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(0,0,0,0.1);">
          ${fileUrl ? `<img src="${fileUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none';" />` : `<span style="font-size:12px; color: #fff;">PHOTO</span>`}
        </div>
        <div class="stream-info-group">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="stream-filename" style="font-weight: 800; font-size: 13px;">${shotData.filename}</span>
            <span class="stream-badge" style="font-size: 10px;">${shotData.sourceMode}</span>
          </div>
          <span class="stream-camera" style="font-size: 11px; color: var(--text-muted);">(${shotData.cameraModel})</span>
        </div>
      </div>
      <div class="stream-right" style="display: flex; align-items: center; gap: 10px;">
        <span class="stream-time" style="font-size: 11px; color: var(--text-dim);">${timeStr}</span>
        <button class="btn btn-ghost-sm" style="font-size: 11px; padding: 4px 10px;">Lihat Foto</button>
      </div>
    `;

    feed.prepend(row);

    // Limit feed to top 30 items
    while (feed.children.length > 30) {
      feed.removeChild(feed.lastChild);
    }
  }

  // Update counter display
  const totalLiveShotsText = document.getElementById('totalLiveShotsText');
  if (totalLiveShotsText) {
    totalLiveShotsText.textContent = shotData.totalShots || (parseInt(totalLiveShotsText.textContent, 10) || 0) + 1;
  }
}


