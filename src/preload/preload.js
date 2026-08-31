const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings & Configuration
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  searchLocations: (query) => ipcRenderer.invoke('location:search', query),

  // Auto Login & Token Extractor
  openLoginModal: () => ipcRenderer.invoke('auth:openLoginModal'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  onTokenExtracted: (callback) => ipcRenderer.on('auth:tokenExtracted', (event, data) => callback(data)),


  // Watcher & Queue Control
  toggleWatcher: (shouldStart) => ipcRenderer.invoke('watcher:toggle', shouldStart),
  retryFailed: () => ipcRenderer.invoke('queue:retryFailed'),
  clearCompletedQueue: () => ipcRenderer.invoke('uploader:clearCompleted'),
  getStatus: () => ipcRenderer.invoke('status:get'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  // License & Membership Tiers
  getLicenseStatus: () => ipcRenderer.invoke('license:getStatus'),
  activateLicense: (key) => ipcRenderer.invoke('license:activate', key),
  onQuotaExceeded: (callback) => ipcRenderer.on('license:quotaExceeded', (event, data) => callback(data)),

  // Speed Test & Network Diagnostics
  testSpeed: () => ipcRenderer.invoke('net:speedTest'),
  sendErrorReport: (reportData) => ipcRenderer.invoke('system:sendErrorReport', reportData),

  // Auto Updater & App Version Control
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: (url) => ipcRenderer.invoke('updater:download', url),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdateAvailable: (callback) => ipcRenderer.on('updater:available', (event, data) => callback(data)),
  onUpdateNotAvailable: (callback) => ipcRenderer.on('updater:notAvailable', (event, data) => callback(data)),
  onUpdateProgress: (callback) => ipcRenderer.on('updater:progress', (event, data) => callback(data)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('updater:downloaded', (event, data) => callback(data)),
  onUpdateError: (callback) => ipcRenderer.on('updater:error', (event, data) => callback(data)),

  // External Link Opener
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Live Shutter Connect
  getLiveShutterStatus: () => ipcRenderer.invoke('liveShutter:getStatus'),
  toggleCableMode: (options) => ipcRenderer.invoke('liveShutter:toggleCable', options),
  forceScanCable: () => ipcRenderer.invoke('liveShutter:forceScanCable'),
  toggleWifiServer: (options) => ipcRenderer.invoke('liveShutter:toggleWifi', options),
  triggerTestShot: () => ipcRenderer.invoke('liveShutter:triggerTestShot'),
  onLiveShutterStatusUpdate: (callback) => ipcRenderer.on('live-shutter:statusUpdate', (event, data) => callback(data)),
  onLiveShotCaptured: (callback) => ipcRenderer.on('live-shutter:shotCaptured', (event, data) => callback(data)),
  onLiveCameraPluggedIn: (callback) => ipcRenderer.on('live-shutter:cameraPluggedIn', (event, data) => callback(data)),

  // Event Push Listeners
  onStatusUpdate: (callback) => ipcRenderer.on('status:update', (event, data) => callback(data)),
  onLogAdd: (callback) => ipcRenderer.on('log:add', (event, logEntry) => callback(logEntry))
});

