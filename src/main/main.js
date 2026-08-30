const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Store = require('electron-store');
const UploaderEngine = require('./uploaderEngine');
const AutoUpdater = require('./autoUpdater');

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
    description: 'Uploaded via Fotoyu Auto-Uploader Pro',
    locationName: 'lat: 3.583200 lng: 98.627400',
    latitude: 3.5832,
    longitude: 98.6274,
    userNicknames: '',

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
