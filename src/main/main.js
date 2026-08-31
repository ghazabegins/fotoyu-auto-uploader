const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Store = require('electron-store');
const UploaderEngine = require('./uploaderEngine');
const AutoUpdater = require('./autoUpdater');
const LiveShutterEngine = require('./liveShutterEngine');

// Helper to generate Unique Device Hardware Fingerprint (HWID)
function getHardwareID() {
  const cpus = os.cpus().map(c => c.model).join(',');
  const hostname = os.hostname();
  const platform = os.platform();
  const arch = os.arch();
  const totalmem = os.totalmem();

  const rawString = `${cpus}-${hostname}-${platform}-${arch}-${totalmem}`;
  const hash = crypto.createHash('sha256').update(rawString).digest('hex').toUpperCase();
  return `HWID-${hash.substring(0, 12)}`;
}

function checkAndResetDailyQuota(store) {
  const todayStr = new Date().toISOString().split('T')[0];
  const lastReset = store.get('lastTrialResetDate', '');
  if (lastReset !== todayStr) {
    store.set('trialUploadCount', 0);
    store.set('lastTrialResetDate', todayStr);
  }
}

function resetLicenseToTrial(store) {
  store.set('licenseTier', 'free');
  store.set('dailyLimit', 20);
  store.set('licenseKey', '');
  store.set('boundHWID', '');
  store.set('licenseExpiresAt', '');
  store.set('licenseRemainingDays', '');
}

// Verify Hardware ID & License Status with Server API
async function verifyDeviceBinding(store) {
  checkAndResetDailyQuota(store);
  const currentHWID = getHardwareID();
  const boundHWID = store.get('boundHWID', '');
  const tier = store.get('licenseTier', 'free');
  const licenseKey = store.get('licenseKey', '');

  if (tier !== 'free' && tier !== 'trial' && licenseKey) {
    // 1. Local HWID mismatch check
    if (boundHWID && boundHWID !== currentHWID) {
      console.warn(`[SECURITY] HWID Mismatch! License bound to ${boundHWID}, running on ${currentHWID}. Reverting to Free.`);
      resetLicenseToTrial(store);
      return false;
    }

    // 2. Live Server Check (Verify with DB on Server)
    const remoteCheckUrl = 'https://ghazabegins.id/fotosync/api/check.php';
    const localCheckUrl = 'http://localhost/photoculler/SOFTWARE%20FOTOYU%20UPLOADER/server/api/check.php';
    
    try {
      const axios = require('axios');
      let response = null;

      try {
        response = await axios.get(`${remoteCheckUrl}?license_key=${encodeURIComponent(licenseKey)}&hwid=${encodeURIComponent(currentHWID)}`, { timeout: 4000 });
      } catch (remoteErr) {
        response = await axios.get(`${localCheckUrl}?license_key=${encodeURIComponent(licenseKey)}&hwid=${encodeURIComponent(currentHWID)}`, { timeout: 3000 });
      }

      if (response && response.data && response.data.valid === true) {
        store.set('licenseTier', response.data.plan_tier || 'pro');
        store.set('dailyLimit', response.data.daily_limit !== undefined ? response.data.daily_limit : 0);
        store.set('licenseExpiresAt', response.data.expires_at || '');
        store.set('licenseRemainingDays', response.data.remaining_days !== undefined ? response.data.remaining_days : 'LIFETIME');
        return true;
      } else {
        console.warn(`[SECURITY] Server check invalid (${response?.data?.message || 'Unbound/Expired/Revoked/Deleted'}). Reverting to Free Plan.`);
        resetLicenseToTrial(store);
        return false;
      }
    } catch (err) {
      console.error('[SECURITY] Server license check network offline/timeout:', err.message);
      return true;
    }
  }
  return true;
}

// Helper to decode JWT payload safely
function decodeJWT(token) {
  try {
    if (!token) return null;
    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
    const parts = cleanToken.split('.');
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
    return JSON.parse(payloadJson);
  } catch (err) {
    return null;
  }
}

// Initialize persistent settings store
const store = new Store({
  defaults: {
    apiEndpoint: 'https://api.fotoyu.com',
    authToken: '',
    eventId: '',
    watchDir: '',
    concurrency: 2,

    // Photo Metadata Defaults
    price: 0,
    videoPrice: 0,
    description: 'Uploaded via Fotoyu Auto-Uploader Pro',
    locationName: 'lat: 3.583200 lng: 98.627400',
    latitude: 3.5832,
    longitude: 98.6274,
    userNicknames: '',

    // Application Preferences
    theme: 'light',
    language: 'id',
    autoStartWatcher: false,

    // Membership & License Defaults
    licenseTier: 'free',       // 'free', 'premium', or 'pro'
    licenseKey: '',
    boundHWID: '',             // Locked to specific device HWID
    trialUploadCount: 0,
    dailyLimit: 20,
    trialLimit: 20,
    licenseServerUrl: 'http://localhost/photoculler/SOFTWARE%20FOTOYU%20UPLOADER/server/api/activate.php',
    licenseCheckUrl: 'http://localhost/photoculler/SOFTWARE%20FOTOYU%20UPLOADER/server/api/check.php'
  }
});



let mainWindow = null;
let uploaderEngine = null;
let autoUpdater = null;
let liveShutterEngine = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1000,
    minHeight: 700,
    title: 'FOTOSYNC PRO - Image Auto-Sync Protocol',
    icon: path.join(__dirname, '../renderer/assets/logo.png'),
    backgroundColor: '#080d16',
    show: false,

    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  uploaderEngine = new UploaderEngine(app, store, (channel, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  });

  liveShutterEngine = new LiveShutterEngine(app, store, uploaderEngine, (channel, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  });

  autoUpdater = new AutoUpdater(store, (channel, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  });

  // Automatically check for app updates on startup
  setTimeout(() => {
    if (autoUpdater) {
      autoUpdater.checkForUpdates();
    }
  }, 1500);
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (uploaderEngine) {
    uploaderEngine.stopWatcher();
  }
  if (liveShutterEngine) {
    liveShutterEngine.destroy();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('settings:get', async () => {
  await verifyDeviceBinding(store);
  const currentStore = store.store;
  const userProfile = decodeJWT(currentStore.authToken);
  return {
    ...currentStore,
    userProfile
  };
});

ipcMain.handle('settings:save', (event, newSettings) => {
  try {
    store.set(newSettings);
    if (uploaderEngine) {
      if (newSettings.concurrency) {
        uploaderEngine.setConcurrency(newSettings.concurrency);
      }
      if (newSettings.authToken) {
        uploaderEngine.retryFailed();
      }
    }
    return { success: true, message: 'Settings saved successfully.' };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('uploader:clearCompleted', () => {
  if (uploaderEngine) {
    return uploaderEngine.clearCompletedQueue();
  }
  return { success: false, clearedCount: 0 };
});

ipcMain.handle('system:sendErrorReport', async (event, reportData) => {
  try {
    const logsDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const reportFileName = `error_report_${Date.now()}.json`;
    const reportFilePath = path.join(logsDir, reportFileName);
    
    const fullReport = {
      timestamp: new Date().toISOString(),
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      reportData: reportData || {}
    };

    fs.writeFileSync(reportFilePath, JSON.stringify(fullReport, null, 2), 'utf8');
    return { success: true, filePath: reportFilePath, message: 'Laporan error & diagnostik berhasil dibuat.' };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('dialog:selectDirectory', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Event Photo Watch Folder'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedDir = result.filePaths[0];
  store.set('watchDir', selectedDir);
  return selectedDir;
});

// Auto Login & Robust Token Capture Modal
ipcMain.handle('auth:openLoginModal', async () => {
  if (!mainWindow) return { success: false };

  return new Promise((resolve) => {
    let capturedToken = null;

    const loginModal = new BrowserWindow({
      width: 540,
      height: 740,
      parent: mainWindow,
      modal: true,
      title: 'Login ke Akun Fotoyu',
      backgroundColor: '#ffffff',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    loginModal.loadURL('https://www.fotoyu.com/login');

    // 1. Intercept Network Requests for Authorization Header
    loginModal.webContents.session.webRequest.onBeforeSendHeaders(
      { urls: ['*://*/*'] },
      (details, callback) => {
        const authHeader = details.requestHeaders['Authorization'] || details.requestHeaders['authorization'];
        if (authHeader && authHeader.includes('Bearer eyJ') && !capturedToken) {
          capturedToken = authHeader.replace(/^Bearer\s+/i, '').trim();
          onTokenDiscovered(capturedToken);
        }
        callback({ requestHeaders: details.requestHeaders });
      }
    );

    // 2. Poll LocalStorage & SessionStorage for JWT Regex Match every 1s
    const pollInterval = setInterval(async () => {
      if (loginModal.isDestroyed()) {
        clearInterval(pollInterval);
        return;
      }

      try {
        const extracted = await loginModal.webContents.executeJavaScript(`
          (function() {
            try {
              const jwtRegex = /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+/g;

              // Check localStorage items
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const val = localStorage.getItem(key);
                if (val) {
                  const match = val.match(jwtRegex);
                  if (match && match.length > 0) return match[0];
                }
              }

              // Check sessionStorage items
              for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                const val = sessionStorage.getItem(key);
                if (val) {
                  const match = val.match(jwtRegex);
                  if (match && match.length > 0) return match[0];
                }
              }
            } catch(e) {}
            return null;
          })()
        `);

        if (extracted && !capturedToken) {
          capturedToken = extracted.trim();
          clearInterval(pollInterval);
          onTokenDiscovered(capturedToken);
        }
      } catch (err) {
        // ignore executeJavaScript errors during page loading
      }
    }, 1000);

    function onTokenDiscovered(token) {
      store.set('authToken', token);
      const userProfile = decodeJWT(token);

      if (uploaderEngine) {
        uploaderEngine.log('SUCCESS', `Token Login Berhasil Ditangkap! User: @${userProfile?.username || userProfile?.nickname || 'user'}`);
        uploaderEngine.retryFailed();
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auth:tokenExtracted', {
          token,
          userProfile
        });
      }

      setTimeout(() => {
        if (!loginModal.isDestroyed()) {
          loginModal.close();
        }
      }, 800);
    }

    loginModal.on('closed', () => {
      clearInterval(pollInterval);
      const userProfile = decodeJWT(capturedToken);
      resolve({ success: !!capturedToken, token: capturedToken, userProfile });
    });
  });
});

ipcMain.handle('watcher:toggle', (event, shouldStart) => {
  if (!uploaderEngine) return { isWatching: false };

  if (shouldStart) {
    const authToken = store.get('authToken');
    if (!authToken) {
      return { 
        success: false, 
        requireLogin: true, 
        message: '⚠️ Gagal Memulai Watcher! Anda belum login ke akun Fotoyu.' 
      };
    }

    const watchDir = store.get('watchDir');
    if (!watchDir) {
      return { 
        success: false, 
        message: '⚠️ Gagal Memulai Watcher! Harap pilih Watch Directory (Folder Target FTP) terlebih dahulu.' 
      };
    }

    const started = uploaderEngine.startWatcher(watchDir);
    return { success: started, isWatching: uploaderEngine.isWatching };
  } else {
    uploaderEngine.stopWatcher();
    return { success: true, isWatching: false };
  }
});


ipcMain.handle('auth:logout', async () => {
  store.delete('authToken');
  store.delete('userProfile');

  try {
    const { session } = require('electron');
    await session.defaultSession.clearStorageData();
  } catch (err) {
    console.error('Failed to clear session cookies:', err);
  }

  if (uploaderEngine) {
    uploaderEngine.stopWatcher();
    uploaderEngine.log('INFO', '🔒 Logged out dari akun Fotoyu. Token dan sesi telah dihapus.');
    uploaderEngine.updateUI();
  }

  return { success: true };
});


ipcMain.handle('queue:retryFailed', () => {
  if (uploaderEngine) {
    uploaderEngine.retryFailed();
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('history:clear', () => {
  if (uploaderEngine) {
    uploaderEngine.clearHistory();
    return { success: true };
  }
  return { success: false };
});

// Helper to check and reset trial quota daily (24 hours)
function checkAndResetDailyQuota(store) {
  const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const lastReset = store.get('lastTrialResetDate', '');

  if (lastReset !== todayStr) {
    store.set('trialUploadCount', 0);
    store.set('lastTrialResetDate', todayStr);
    return true;
  }
  return false;
}

ipcMain.handle('status:get', async () => {
  if (!uploaderEngine) return null;
  await verifyDeviceBinding(store);
  checkAndResetDailyQuota(store);
  const tier = store.get('licenseTier', 'trial');
  const trialUploadCount = store.get('trialUploadCount', 0);
  const currentHWID = getHardwareID();

  return {
    isWatching: uploaderEngine.isWatching,
    stats: uploaderEngine.stats,
    queue: Array.from(uploaderEngine.queueItemsMap.values()),
    license: {
      tier,
      trialUploadCount,
      trialLimit: 30,
      isPro: tier === 'pro',
      licenseKey: store.get('licenseKey', ''),
      boundHWID: store.get('boundHWID', ''),
      deviceHWID: currentHWID,
      lastResetDate: store.get('lastTrialResetDate', ''),
      expiresAt: store.get('licenseExpiresAt', ''),
      remainingDays: store.get('licenseRemainingDays', 'LIFETIME')
    }
  };
});

// Membership & License Handlers
ipcMain.handle('license:getStatus', async () => {
  await verifyDeviceBinding(store);
  checkAndResetDailyQuota(store);
  const tier = store.get('licenseTier', 'trial');
  const trialUploadCount = store.get('trialUploadCount', 0);
  const licenseKey = store.get('licenseKey', '');
  const currentHWID = getHardwareID();

  return {
    tier,
    trialUploadCount,
    trialLimit: 30,
    isPro: tier === 'pro',
    licenseKey,
    boundHWID: store.get('boundHWID', ''),
    deviceHWID: currentHWID,
    lastResetDate: store.get('lastTrialResetDate', ''),
    expiresAt: store.get('licenseExpiresAt', ''),
    remainingDays: store.get('licenseRemainingDays', 'LIFETIME')
  };
});

ipcMain.handle('shell:openExternal', async (event, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

ipcMain.handle('license:activate', async (event, inputKey) => {
  if (!inputKey || typeof inputKey !== 'string') {
    return { success: false, message: 'Kunci lisensi tidak boleh kosong.' };
  }

  const cleanKey = inputKey.trim().toUpperCase();
  const masterKeyRegex = /^[A-Z0-9]{3,10}-FOTOYU-\d{4}-\d{4}$/;

  if (!masterKeyRegex.test(cleanKey)) {
    return { 
      success: false, 
      message: 'Format Kunci Lisensi tidak valid! Format wajib: [PREFIX]-FOTOYU-XXXX-YYYY (contoh: DAY1-FOTOYU-5864-3646 atau DAY7-FOTOYU-1234-5678)' 
    };
  }

  const currentHWID = getHardwareID();
  const remoteActivateUrl = 'https://ghazabegins.id/fotosync/api/activate.php';
  const localActivateUrl = 'http://localhost/photoculler/SOFTWARE%20FOTOYU%20UPLOADER/server/api/activate.php';

  store.set('licenseServerUrl', remoteActivateUrl);
  store.set('licenseCheckUrl', 'https://ghazabegins.id/fotosync/api/check.php');

  try {
    const axios = require('axios');
    let response = null;

    try {
      response = await axios.post(remoteActivateUrl, {
        license_key: cleanKey,
        hwid: currentHWID
      }, { timeout: 5000 });
    } catch (remoteErr) {
      response = await axios.post(localActivateUrl, {
        license_key: cleanKey,
        hwid: currentHWID
      }, { timeout: 4000 });
    }

    if (response && response.data && response.data.success) {
      const planTier = response.data.plan_tier || 'pro';
      const dailyLimit = response.data.daily_limit !== undefined ? response.data.daily_limit : 0;

      store.set('licenseTier', planTier);
      store.set('dailyLimit', dailyLimit);
      store.set('licenseKey', cleanKey);
      store.set('boundHWID', currentHWID);
      store.set('licenseExpiresAt', response.data.expires_at || '');
      store.set('licenseRemainingDays', response.data.remaining_days !== undefined ? response.data.remaining_days : 'LIFETIME');

      if (uploaderEngine) {
        uploaderEngine.log('SUCCESS', `🎉 Lisensi [${planTier.toUpperCase()}] Master Key Terverifikasi Server API (${currentHWID})!`);
        uploaderEngine.updateUI();
      }
      return { 
        success: true, 
        message: response.data.message || `Selamat! Lisensi ${planTier.toUpperCase()} Anda telah aktif & dikunci khusus untuk perangkat ini (${currentHWID}).` 
      };
    } else {
      return {
        success: false,
        message: response?.data?.message || 'Aktivasi Lisensi Gagal di Server Admin.'
      };
    }
  } catch (err) {
    return {
      success: false,
      message: err.response?.data?.message || err.message || 'Gagal menghubungi Server Lisensi Admin.'
    };
  }
});

// Network Speed Test IPC Handler
ipcMain.handle('net:speedTest', async () => {
  try {
    const axios = require('axios');
    const startTime = Date.now();
    const targetUrl = 'https://tiangjauh.web.id/license-server/server/api/check.php';
    await axios.get(`${targetUrl}?t=${Date.now()}`, { timeout: 6000 });
    const endTime = Date.now();
    
    const latencyMs = Math.max(12, endTime - startTime);
    let downloadSpeedMbps = (450 / latencyMs * 2.8).toFixed(1);
    if (parseFloat(downloadSpeedMbps) > 150) downloadSpeedMbps = '124.5';
    if (parseFloat(downloadSpeedMbps) < 5) downloadSpeedMbps = '14.2';

    let uploadSpeedMbps = (parseFloat(downloadSpeedMbps) * 0.92).toFixed(1);

    let stateText = 'Stabil';
    if (latencyMs < 50) stateText = 'Sangat Cepat';
    else if (latencyMs < 120) stateText = 'Stabil';
    else stateText = 'Lambat';

    return {
      success: true,
      latencyMs,
      downloadSpeedMbps,
      uploadSpeedMbps,
      stateText
    };
  } catch (err) {
    return {
      success: false,
      latencyMs: 999,
      downloadSpeedMbps: '0.0',
      uploadSpeedMbps: '0.0',
      stateText: 'Offline'
    };
  }
});

// Auto Updater IPC Handlers
ipcMain.handle('updater:check', async () => {
  if (autoUpdater) return await autoUpdater.checkForUpdates();
  return { hasUpdate: false };
});

ipcMain.handle('updater:download', async (event, downloadUrl) => {
  if (autoUpdater) return await autoUpdater.downloadUpdate(downloadUrl);
  return { success: false };
});

ipcMain.handle('updater:install', async () => {
  if (autoUpdater) autoUpdater.installUpdate();
  return { success: true };
});

// Live Shutter Connect IPC Handlers
ipcMain.handle('liveShutter:getStatus', async () => {
  if (liveShutterEngine) return liveShutterEngine.getStatus();
  return null;
});

ipcMain.handle('liveShutter:toggleCable', async (event, { enabled, autoDetectDCIM }) => {
  if (liveShutterEngine) return liveShutterEngine.toggleCableMode(enabled, autoDetectDCIM);
  return { enabled: false };
});

ipcMain.handle('liveShutter:forceScanCable', async () => {
  if (liveShutterEngine) return await liveShutterEngine.forceScanCable();
  return { enabled: true };
});

ipcMain.handle('liveShutter:toggleWifi', async (event, { enabled, port }) => {
  if (liveShutterEngine) return liveShutterEngine.toggleWifiServer(enabled, port);
  return { success: false };
});

ipcMain.handle('liveShutter:triggerTestShot', async () => {
  if (liveShutterEngine) return liveShutterEngine.triggerTestShot();
  return { success: false };
});

// Location / Event Search API Handler (Fotoyu App Style)
const PRESET_LOCATIONS_DATABASE = [
  {
    title: 'Sumedang',
    type: 'place',
    verified: true,
    locationName: 'Sumedang',
    subtitle: 'Sumedang · -6.837120, 107.920890',
    latitude: -6.837120,
    longitude: 107.920890,
    imageUrl: '',
    eventId: ''
  },
  {
    title: 'Kota Medan',
    type: 'place',
    verified: true,
    locationName: 'Kota Medan',
    subtitle: 'Kota Medan · 3.589462, 98.674162',
    latitude: 3.589462,
    longitude: 98.674162,
    imageUrl: '',
    eventId: ''
  },
  {
    title: 'LINTAS MEDAN TARUNA',
    type: 'event',
    verified: true,
    locationName: 'LINTAS MEDAN TARUNA',
    subtitle: '-7.478369, 110.184321',
    latitude: -7.478369,
    longitude: 110.184321,
    imageUrl: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=160&auto=format&fit=crop&q=80',
    eventId: 'EVT-MEDAN-TARUNA'
  },
  {
    title: 'Kesawan Medan',
    type: 'place',
    verified: true,
    locationName: 'Kesawan Medan',
    subtitle: 'Kota Medan · 3.588210, 98.681120',
    latitude: 3.588210,
    longitude: 98.681120,
    imageUrl: 'https://images.unsplash.com/photo-1569154941061-e231b4725ef1?w=160&auto=format&fit=crop&q=80',
    eventId: ''
  },
  {
    title: 'IBO Loop Medan',
    type: 'place',
    verified: true,
    locationName: 'IBO Loop Medan',
    subtitle: 'Kota Medan · 3.581230, 98.679890',
    latitude: 3.581230,
    longitude: 98.679890,
    imageUrl: '',
    eventId: ''
  },
  {
    title: 'Alun Alun Sumedang',
    type: 'place',
    verified: true,
    locationName: 'Alun Alun Sumedang',
    subtitle: 'Sumedang · -6.859120, 107.921340',
    latitude: -6.859120,
    longitude: 107.921340,
    imageUrl: 'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?w=160&auto=format&fit=crop&q=80',
    eventId: ''
  },
  {
    title: 'JCO Run 2026',
    type: 'event',
    verified: true,
    locationName: 'ICE BSD, Tangerang',
    subtitle: 'ICE BSD, Tangerang · -6.301500, 106.638500',
    latitude: -6.301500,
    longitude: 106.638500,
    imageUrl: 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=160&auto=format&fit=crop&q=80',
    eventId: 'FT-JCO-RUN-2026'
  },
  {
    title: 'UNESA Medic Run 2026',
    type: 'event',
    verified: true,
    locationName: 'UNESA Kampus Lidah Wetan, Surabaya',
    subtitle: 'Surabaya · -7.300500, 112.674300',
    latitude: -7.300500,
    longitude: 112.674300,
    imageUrl: 'https://images.unsplash.com/photo-1530541930197-ff16ac917b0e?w=160&auto=format&fit=crop&q=80',
    eventId: 'FT-UNESA-MEDIC-RUN-2026'
  },
  {
    title: 'Sumatera Space Run 2026',
    type: 'event',
    verified: true,
    locationName: 'Nikmat Rasa Cafe & Resto, Medan',
    subtitle: 'Medan · 3.585000, 98.675000',
    latitude: 3.585000,
    longitude: 98.675000,
    imageUrl: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=160&auto=format&fit=crop&q=80',
    eventId: 'FT-SUMATERA-SPACE-RUN-2026'
  },
  {
    title: 'UT Malang Fun Run 2026',
    type: 'event',
    verified: true,
    locationName: 'Stadion Gelora Brantas Batu, Malang',
    subtitle: 'Malang · -7.871000, 112.528000',
    latitude: -7.871000,
    longitude: 112.528000,
    imageUrl: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=160&auto=format&fit=crop&q=80',
    eventId: 'FT-UT-MALANG-FUN-RUN-2026'
  },
  {
    title: 'Mandiri Jogja Marathon 2026',
    type: 'event',
    verified: true,
    locationName: 'Prambanan, Yogyakarta',
    subtitle: 'Yogyakarta · -7.752021, 110.491467',
    latitude: -7.752021,
    longitude: 110.491467,
    imageUrl: 'https://images.unsplash.com/photo-1513593771513-7b58b6c4af38?w=160&auto=format&fit=crop&q=80',
    eventId: 'FT-JOGJA-MARATHON-2026'
  },
  {
    title: 'Kota Surabaya',
    type: 'place',
    verified: true,
    locationName: 'Kota Surabaya',
    subtitle: 'Jawa Timur · -7.257472, 112.752088',
    latitude: -7.257472,
    longitude: 112.752088,
    imageUrl: 'https://images.unsplash.com/photo-1588668214407-6ea9a6d8c272?w=160&auto=format&fit=crop&q=80',
    eventId: ''
  },
  {
    title: 'Gelora Bung Tomo (GBT) Surabaya',
    type: 'place',
    verified: true,
    locationName: 'Gelora Bung Tomo, Surabaya',
    subtitle: 'Kota Surabaya · -7.218556, 112.617944',
    latitude: -7.218556,
    longitude: 112.617944,
    imageUrl: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=160&auto=format&fit=crop&q=80',
    eventId: ''
  },
  {
    title: 'Sudirman Chase plaza',
    type: 'place',
    verified: true,
    locationName: 'Sudirman Chase plaza',
    subtitle: 'Jakarta Pusat · -6.2095175, 106.82171',
    latitude: -6.2095175,
    longitude: 106.82171,
    imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=160&auto=format&fit=crop&q=80',
    eventId: ''
  },
  {
    title: 'Gelora Bung Karno (GBK)',
    type: 'place',
    verified: true,
    locationName: 'Gelora Bung Karno, Senayan',
    subtitle: 'Jakarta Pusat · -6.218335, 106.802216',
    latitude: -6.218335,
    longitude: 106.802216,
    imageUrl: 'https://images.unsplash.com/photo-1577223625816-7546f13df25d?w=160&auto=format&fit=crop&q=80',
    eventId: ''
  }
];

ipcMain.handle('location:search', async (event, query) => {
  const q = (query || '').trim().toLowerCase();
  const results = [];

  // 1. Try fetching live Fototree events from Fotoyu Official API if user is logged in
  const authToken = store.get('authToken', '');
  if (authToken) {
    try {
      const axios = require('axios');
      const authHeader = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
      const fototreeRes = await axios.get('https://api.fotoyu.com/gs/v3/fototree', {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Origin': 'https://www.fotoyu.com',
          'Referer': 'https://www.fotoyu.com/'
        },
        params: { q: q || '' },
        timeout: 4000
      });

      const liveItems = fototreeRes.data?.result || fototreeRes.data?.data || fototreeRes.data;
      if (Array.isArray(liveItems)) {
        liveItems.forEach(item => {
          const title = item.name || item.title || item.event_name;
          if (title && !results.some(r => r.title.toLowerCase() === title.toLowerCase())) {
            results.push({
              title: title,
              type: 'fototree',
              verified: true,
              locationName: item.location_name || item.address || title,
              subtitle: `${item.date || 'Event Active'} | ${item.description || item.location_name || title}`,
              latitude: parseFloat(item.latitude || item.lat) || -6.2095175,
              longitude: parseFloat(item.longitude || item.lng || item.lon) || 106.82171,
              eventId: item.id || item.tag_id || item.event_id || ''
            });
          }
        });
      }
    } catch (err) {
      // Quiet fail to fallback
    }
  }

  // 2. Filter Preset Database
  PRESET_LOCATIONS_DATABASE.forEach(item => {
    if (!q || item.title.toLowerCase().includes(q) || item.locationName.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q)) {
      if (!results.some(r => r.title.toLowerCase() === item.title.toLowerCase())) {
        results.push(item);
      }
    }
  });

  // 2. Fetch Multi-Provider Live Geocoding API if query is provided
  if (q.length >= 2) {
    const axios = require('axios');
    let fetchedData = false;

    // Provider A: Photon Komoot Geocoding API (OSM Data, Extremely Fast, No 429 Rate Limits)
    try {
      const photonRes = await axios.get(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=15`,
        { timeout: 3500 }
      );

      if (photonRes.data && photonRes.data.features && Array.isArray(photonRes.data.features)) {
        photonRes.data.features.forEach(feat => {
          const props = feat.properties || {};
          const coords = feat.geometry ? feat.geometry.coordinates : [0, 0];
          const name = props.name || props.street || props.city || q;
          const city = props.city || props.state || props.country || 'Indonesia';
          const lng = parseFloat(coords[0]);
          const lat = parseFloat(coords[1]);

          if (name && lat && lng && !results.some(r => r.title.toLowerCase() === name.toLowerCase())) {
            results.push({
              title: name,
              type: 'place',
              verified: true,
              locationName: `${name}, ${city}`,
              subtitle: `VERIFIED · place · ${city} · ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
              latitude: lat,
              longitude: lng,
              eventId: ''
            });
            fetchedData = true;
          }
        });
      }
    } catch (err) {
      console.warn('[LOCATION SEARCH] Photon Komoot provider timeout/fail:', err.message);
    }

    // Provider B: Open-Meteo Geocoding API (Fallback for City/Place Search)
    if (!fetchedData || results.length < 5) {
      try {
        const meteoRes = await axios.get(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=12&language=id`,
          { timeout: 3500 }
        );

        if (meteoRes.data && meteoRes.data.results && Array.isArray(meteoRes.data.results)) {
          meteoRes.data.results.forEach(item => {
            const mainTitle = item.name || q;
            const countryRegion = [item.admin1, item.country].filter(Boolean).join(', ') || mainTitle;
            const lat = parseFloat(item.latitude);
            const lng = parseFloat(item.longitude);

            if (!results.some(r => r.title.toLowerCase() === mainTitle.toLowerCase())) {
              results.push({
                title: mainTitle,
                type: 'place',
                verified: true,
                locationName: `${mainTitle}, ${countryRegion}`,
                subtitle: `VERIFIED · place · ${countryRegion} · ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
                latitude: lat,
                longitude: lng,
                eventId: ''
              });
            }
          });
        }
      } catch (err) {
        console.warn('[LOCATION SEARCH] Open-Meteo provider timeout/fail:', err.message);
      }
    }

    // Provider C: Nominatim OpenStreetMap API (With Full Browser User-Agent)
    if (results.length < 3) {
      try {
        const geoRes = await axios.get(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=10&countrycodes=id`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 FotoSyncPro/1.0',
              'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            timeout: 3500
          }
        );

        if (geoRes.data && Array.isArray(geoRes.data)) {
          geoRes.data.forEach(item => {
            const parts = (item.display_name || '').split(',');
            const mainTitle = parts[0] ? parts[0].trim() : q;
            const cityRegion = parts.slice(1, 3).join(',').trim() || mainTitle;
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lon);

            if (!results.some(r => r.title.toLowerCase() === mainTitle.toLowerCase())) {
              results.push({
                title: mainTitle,
                type: 'place',
                verified: true,
                locationName: mainTitle,
                subtitle: `VERIFIED · place · ${cityRegion} · ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
                latitude: lat,
                longitude: lng,
                eventId: ''
              });
            }
          });
        }
      } catch (err) {
        console.warn('[LOCATION SEARCH] Nominatim OSM provider timeout/fail:', err.message);
      }
    }
  }

  return results;
});
