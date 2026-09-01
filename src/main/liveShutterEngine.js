const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { execFile, spawn } = require('child_process');

let FtpSrv = null;
try {
  FtpSrv = require('ftp-srv');
} catch (e) {
  console.warn('ftp-srv module not loaded:', e.message);
}

class LiveShutterEngine {
  constructor(app, store, uploaderEngine, sendToRenderer) {
    this.app = app;
    this.store = store;
    this.uploaderEngine = uploaderEngine;
    this.sendToRenderer = sendToRenderer;

    // Live Shutter Modes State (USB Cable & WiFi Wireless)
    this.cableConfig = {
      enabled: true,
      autoDetectDCIM: true,
      connectedCamera: null,
      cameraDetails: null,   // { name, model, path, type: 'camera' }
      connectedSdCard: null, // e.g. "SD Card (E:)"
      sdCardDetails: null,   // { name, driveLetter, path, folderName, type: 'sdcard' }
      detectedDrive: null,
      activeDeviceType: null, // 'camera' or 'sdcard' or null
      lastScanTime: null
    };

    this.wifiConfig = {
      enabled: false,
      port: 2121,
      running: false,
      connectedClients: 0
    };

    this.stats = {
      totalShots: 0,
      lastShotTime: null,
      lastShotFilename: null,
      lastShotSource: null
    };

    this.wifiServer = null;             // Real FtpSrv instance for cameras
    this.httpCompanionServer = null;    // Companion HTTP Web Portal
    this.macBridgeProcess = null;       // Swift ImageCaptureCore child process on macOS
    this.cableInterval = null;
    this.isCheckingDrives = false;

    // Camera Ingest Sync Cache (persists known filenames so switching folders will never re-copy old camera photos)
    this.syncedFilesPath = path.join(this.app.getPath('userData'), 'synced_camera_files.txt');
    this.syncedCameraFiles = new Set();

    this.init();
  }

  init() {
    this.log('INFO', '📸 Initializing Live Shutter Connect Engine (Cable USB & WiFi FTP Ingest)...');
    this.initSyncedFiles();
    this.startCableDriveMonitoring();
    if (process.platform === 'darwin') {
      const defaultIngestDir = this.store.get('watchDir') || path.join(this.app.getPath('userData'), 'camera_ingest');
      this.startMacCameraBridge(defaultIngestDir);
    }
  }

  initSyncedFiles() {
    try {
      if (fs.existsSync(this.syncedFilesPath)) {
        const lines = fs.readFileSync(this.syncedFilesPath, 'utf8').split('\n');
        for (const l of lines) {
          const trimmed = l.trim();
          if (trimmed) this.syncedCameraFiles.add(trimmed);
        }
      } else {
        // Pre-populate with existing files in current watchDir and upload history so old photos are not re-ingested
        const watchDir = this.store.get('watchDir');
        if (watchDir && fs.existsSync(watchDir)) {
          const entries = fs.readdirSync(watchDir);
          for (const f of entries) {
            if (/\.(jpg|jpeg|png|arw|cr2|cr3|nef|raf|dng)$/i.test(f)) {
              this.syncedCameraFiles.add(f);
            }
          }
        }

        if (this.uploaderEngine && this.uploaderEngine.uploadedRegistry) {
          for (const filePath of this.uploaderEngine.uploadedRegistry) {
            this.syncedCameraFiles.add(path.basename(filePath));
          }
        }

        if (this.syncedCameraFiles.size > 0) {
          fs.writeFileSync(this.syncedFilesPath, Array.from(this.syncedCameraFiles).join('\n') + '\n', 'utf8');
        } else {
          fs.writeFileSync(this.syncedFilesPath, '', 'utf8');
        }
      }
    } catch (e) {
      console.warn('Could not initialize synced files cache:', e.message);
    }
  }

  log(type, message, details = null) {
    if (this.uploaderEngine) {
      this.uploaderEngine.log(type, `[LIVE SHUTTER] ${message}`, details);
    }
  }

  getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    let fallbackIp = '127.0.0.1';

    for (const name of Object.keys(interfaces)) {
      const lowerName = name.toLowerCase();
      // Skip macOS virtual / tunnel / AirDrop interfaces
      if (lowerName.includes('awdl') || lowerName.includes('llw') || lowerName.includes('utun') || 
          lowerName.includes('vbox') || lowerName.includes('vmnet') || lowerName.includes('docker') || 
          lowerName.includes('bridge')) {
        continue;
      }

      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          const ip = iface.address;
          // Ignore link-local 169.254.x.x addresses
          if (ip.startsWith('169.254.')) continue;

          // Prioritize real LAN / Wi-Fi IP ranges (192.168.x.x, 10.x.x.x, 172.x.x.x)
          if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
            return ip;
          }
          fallbackIp = ip;
        }
      }
    }
    return fallbackIp;
  }

  // --- 1. PERFECTED USB CABLE & MTP AUTO-DETECTION ENGINE ---
  startCableDriveMonitoring() {
    if (this.cableInterval) clearInterval(this.cableInterval);

    // Fast polling every 2 seconds for instant USB camera detection
    this.cableInterval = setInterval(() => {
      if (!this.cableConfig.enabled) return;
      this.checkConnectedDrives();
    }, 2000);

    // Initial check
    this.checkConnectedDrives();
  }

  checkMtpCamera(targetDir) {
    return new Promise((resolve) => {
      if (process.platform !== 'win32') return resolve({ success: false });
      let scriptPath = path.join(__dirname, 'scripts', 'scan_mtp_camera.ps1');
      if (scriptPath.includes('app.asar')) {
        scriptPath = scriptPath.replace('app.asar', 'app.asar.unpacked');
      }
      if (!fs.existsSync(scriptPath)) {
        return resolve({ success: false });
      }

      const args = [
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        '-Action', 'sync',
        '-TargetDir', targetDir,
        '-KnownFilesPath', this.syncedFilesPath
      ];
      execFile('powershell.exe', args, { windowsHide: true, timeout: 15000 }, (err, stdout) => {
        if (err || !stdout) return resolve({ success: false });
        try {
          const res = JSON.parse(stdout.trim());
          resolve(res);
        } catch (e) {
          resolve({ success: false });
        }
      });
    });
  }

  async checkConnectedDrives() {
    if (this.isCheckingDrives) return;
    this.isCheckingDrives = true;

    try {
      let detectedCamera = null; // { name, model, path, type: 'camera' }
      let detectedSdCard = null; // { name, driveLetter, path, folderName, type: 'sdcard' }

      // 1. CHECK DIRECT CAMERA (Windows MTP / WPD or macOS ImageCapture)
      if (process.platform === 'win32') {
        const defaultIngestDir = this.store.get('watchDir') || path.join(this.app.getPath('userData'), 'camera_ingest');
        if (!fs.existsSync(defaultIngestDir)) {
          fs.mkdirSync(defaultIngestDir, { recursive: true });
        }

        const mtpRes = await this.checkMtpCamera(defaultIngestDir);
        if (mtpRes && mtpRes.found) {
          detectedCamera = {
            name: mtpRes.cameraName,
            model: mtpRes.cameraName,
            path: defaultIngestDir,
            type: 'camera'
          };

          if (mtpRes.copiedCount > 0) {
            this.log('SUCCESS', `⚡ LIVE SHUTTER KAMERA! ${mtpRes.copiedCount} foto baru ditarik dari ${mtpRes.cameraName}.`);
            if (Array.isArray(mtpRes.copiedFiles) && mtpRes.copiedFiles.length > 0) {
              for (const filename of mtpRes.copiedFiles) {
                const fullPath = path.join(defaultIngestDir, filename);
                this.onLiveShutterReceived(fullPath, 'Kabel USB Direct (Live Shutter)', mtpRes.cameraName);
              }
            }
          }
        }
      }

      // 2. CHECK SD CARD / CARD READER (Removable Drive Letters with DCIM folder)
      if (process.platform === 'win32') {
        const driveLetters = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
        for (const letter of driveLetters) {
          const drivePath = `${letter}:\\`;
          const dcimPath = path.join(drivePath, 'DCIM');
          
          if (fs.existsSync(dcimPath)) {
            let subfolder = null;
            let folderName = 'DCIM';
            try {
              const subItems = fs.readdirSync(dcimPath);
              for (const item of subItems) {
                const fullSub = path.join(dcimPath, item);
                if (fs.statSync(fullSub).isDirectory() && !item.startsWith('.')) {
                  subfolder = fullSub;
                  folderName = item;
                  break;
                }
              }
            } catch (e) {}

            detectedSdCard = {
              name: `SD Card (${letter}:)`,
              driveLetter: letter,
              path: subfolder || dcimPath,
              folderName: folderName,
              type: 'sdcard'
            };
            break;
          }
        }
      } else {
        // macOS / Linux volume mounts
        const volumesPath = '/Volumes';
        if (fs.existsSync(volumesPath)) {
          try {
            const vols = fs.readdirSync(volumesPath);
            for (const vol of vols) {
              if (vol === 'Macintosh HD' || vol === 'Macintosh HD - Data' || vol.startsWith('.')) continue;
              const fullVolPath = path.join(volumesPath, vol);
              
              let dcimFoundPath = null;
              try {
                const volItems = fs.readdirSync(fullVolPath);
                const dcimItem = volItems.find(i => i && i.toUpperCase() === 'DCIM');
                if (dcimItem) {
                  dcimFoundPath = path.join(fullVolPath, dcimItem);
                }
              } catch (e) {}

              if (dcimFoundPath && fs.existsSync(dcimFoundPath)) {
                let subfolder = null;
                let folderName = vol;
                try {
                  const subItems = fs.readdirSync(dcimFoundPath);
                  for (const item of subItems) {
                    const fullSub = path.join(dcimFoundPath, item);
                    if (fs.statSync(fullSub).isDirectory() && !item.startsWith('.')) {
                      subfolder = fullSub;
                      folderName = item;
                      break;
                    }
                  }
                } catch (e) {}

                detectedSdCard = {
                  name: `SD Card (${vol})`,
                  driveLetter: vol,
                  path: subfolder || dcimFoundPath,
                  folderName: folderName,
                  type: 'sdcard'
                };

                // SD Card detected - do NOT auto-copy files. Wait for user confirmation in UI.
                break;
              }
            }
          } catch (errVol) {}
        }

        if (process.platform === 'darwin') {
          const defaultIngestDir = this.store.get('watchDir') || path.join(this.app.getPath('userData'), 'camera_ingest');
          if (!this.macBridgeProcess && this.cableConfig.enabled) {
            this.startMacCameraBridge(defaultIngestDir);
          }
        }
      }

      this.cableConfig.lastScanTime = new Date().toISOString();

      // Check for CAMERA connection changes on Windows (WPD)
      if (process.platform === 'win32') {
        const wasCameraConnected = !!this.cableConfig.cameraDetails;
        const isCameraNowConnected = !!detectedCamera;

        if (!wasCameraConnected && isCameraNowConnected) {
          this.cableConfig.cameraDetails = detectedCamera;
          this.cableConfig.connectedCamera = detectedCamera.name;
          this.cableConfig.detectedDrive = detectedCamera.path;
          this.cableConfig.activeDeviceType = 'camera';
          this.log('SUCCESS', `📸 KAMERA TERHUBUNG (Live Shutter)! ${detectedCamera.name} via USB Direct.`);

          const payload = {
            deviceType: 'camera',
            deviceName: detectedCamera.name,
            deviceIcon: '📷',
            cameraName: detectedCamera.name,
            drivePath: detectedCamera.path,
            description: `Kamera ${detectedCamera.name} terhubung via kabel USB Direct. Siap menerima jepretan live shutter!`,
            timestamp: Date.now()
          };
          this.sendToRenderer('live-shutter:devicePluggedIn', payload);
          this.sendToRenderer('live-shutter:cameraPluggedIn', payload);
        } else if (wasCameraConnected && !isCameraNowConnected) {
          this.log('WARN', `🔌 Kamera ${this.cableConfig.connectedCamera || ''} Terputus / Dilepas.`);
          this.cableConfig.cameraDetails = null;
          this.cableConfig.connectedCamera = null;
          this.cableConfig.detectedDrive = null;
          this.cableConfig.activeDeviceType = null;
        }
      } else if (process.platform === 'darwin') {
        // Dual-layer macOS Hardware USB Prober (covers Nikon Z6_2, Sony, Canon, Fuji)
        const macCam = this.scanMacUsbCameras();
        if (macCam) {
          const wasCameraConnected = !!this.cableConfig.cameraDetails;
          if (!wasCameraConnected) {
            const defaultIngestDir = this.store.get('watchDir') || path.join(this.app.getPath('userData'), 'camera_ingest');
            this.cableConfig.cameraDetails = {
              name: macCam.name,
              model: macCam.name,
              path: defaultIngestDir,
              type: 'camera'
            };
            this.cableConfig.connectedCamera = macCam.name;
            this.cableConfig.detectedDrive = defaultIngestDir;
            this.cableConfig.activeDeviceType = 'camera';
            this.log('SUCCESS', `📸 KAMERA TERHUBUNG (macOS USB Hardware): "${macCam.name}"`);

            const payload = {
              deviceType: 'camera',
              deviceName: macCam.name,
              deviceIcon: '📷',
              cameraName: macCam.name,
              drivePath: defaultIngestDir,
              description: `Kamera ${macCam.name} terdeteksi di port USB macOS. Siap Live Shutter Ingest!`,
              timestamp: Date.now()
            };
            this.sendToRenderer('live-shutter:devicePluggedIn', payload);
            this.sendToRenderer('live-shutter:cameraPluggedIn', payload);
            this.updateUI();

            if (!this.macBridgeProcess && this.cableConfig.enabled) {
              this.startMacCameraBridge(defaultIngestDir);
            }
          }
        } else if (this.cableConfig.cameraDetails && !this.macBridgeProcess) {
          this.log('WARN', `🔌 Kamera ${this.cableConfig.connectedCamera || ''} Terputus dari port USB macOS.`);
          this.cableConfig.cameraDetails = null;
          this.cableConfig.connectedCamera = null;
          this.cableConfig.detectedDrive = null;
          this.cableConfig.activeDeviceType = null;
          this.updateUI();
        }
      }

      // Check for SD CARD connection changes
      const wasSdCardConnected = !!this.cableConfig.sdCardDetails;
      const isSdCardNowConnected = !!detectedSdCard;

      if (!wasSdCardConnected && isSdCardNowConnected) {
        this.cableConfig.sdCardDetails = detectedSdCard;
        this.cableConfig.connectedSdCard = detectedSdCard.name;
        this.log('SUCCESS', `💾 SD CARD TERDETEKSI! Kartu memori terpasang di Drive ${detectedSdCard.driveLetter}:\\ (${detectedSdCard.path})`);

        if (this.cableConfig.autoDetectDCIM) {
          this.store.set('watchDir', detectedSdCard.path);
          this.log('INFO', `[SD CARD] Auto-assign Watch Directory ke folder SD Card: "${detectedSdCard.path}"`);
        }

        const payload = {
          deviceType: 'sdcard',
          deviceName: detectedSdCard.name,
          deviceIcon: '💾',
          cameraName: detectedSdCard.name,
          driveLetter: detectedSdCard.driveLetter,
          folderName: detectedSdCard.folderName,
          drivePath: detectedSdCard.path,
          description: `Kartu SD Card terdeteksi di Drive ${detectedSdCard.driveLetter}:\\. Siap mengimpor batch foto!`,
          timestamp: Date.now()
        };
        this.sendToRenderer('live-shutter:devicePluggedIn', payload);
        this.sendToRenderer('live-shutter:cameraPluggedIn', payload);
      } else if (wasSdCardConnected && !isSdCardNowConnected) {
        this.log('WARN', `💾 SD Card di Drive ${this.cableConfig.sdCardDetails?.driveLetter || ''}:\\ Dicabut / Dilepas.`);
        this.cableConfig.sdCardDetails = null;
        this.cableConfig.connectedSdCard = null;

        // If SD card removed and camera is connected, switch notification to camera
        if (isCameraNowConnected) {
          this.log('INFO', `[LIVE SHUTTER] Berpindah ke Kamera: ${detectedCamera.name}`);
          const payload = {
            deviceType: 'camera',
            deviceName: detectedCamera.name,
            deviceIcon: '📷',
            cameraName: detectedCamera.name,
            drivePath: detectedCamera.path,
            description: `Kamera ${detectedCamera.name} terhubung via USB Direct.`,
            timestamp: Date.now()
          };
          this.sendToRenderer('live-shutter:devicePluggedIn', payload);
          this.sendToRenderer('live-shutter:cameraPluggedIn', payload);
        }
      }

      // Single properties for backward compatibility
      this.cableConfig.detectedDrive = detectedCamera ? detectedCamera.path : (detectedSdCard ? detectedSdCard.path : null);
      this.cableConfig.activeDeviceType = detectedCamera ? 'camera' : (detectedSdCard ? 'sdcard' : null);

      this.updateUI();
    } catch (err) {
      // ignore stat errors on drive scan
    } finally {
      this.isCheckingDrives = false;
    }
  }

  toggleCableMode(enabled, autoDetectDCIM = true) {
    this.cableConfig.enabled = enabled;
    this.cableConfig.autoDetectDCIM = autoDetectDCIM;
    this.log('INFO', `USB Cable Mode: ${enabled ? 'AKTIF' : 'NON-AKTIF'}`);
    if (enabled) {
      this.checkConnectedDrives();
      if (process.platform === 'darwin') {
        const defaultIngestDir = this.store.get('watchDir') || path.join(this.app.getPath('userData'), 'camera_ingest');
        this.startMacCameraBridge(defaultIngestDir);
      }
    } else {
      if (process.platform === 'darwin') {
        this.stopMacCameraBridge();
      }
    }
    this.updateUI();
    return this.cableConfig;
  }

  async forceScanCable() {
    this.log('INFO', '🔄 Memindai Ulang Kamera Kabel / MTP...');
    // Reset connection state to force fresh detection & alert push
    this.cableConfig.connectedCamera = null;
    this.cableConfig.detectedDrive = null;
    await this.checkConnectedDrives();
    return this.cableConfig;
  }

  // --- 2. PERFECTED WIFI WIRELESS CAMERA INGEST SERVER (REAL FTP + WEB COMPANION) ---
  async toggleWifiServer(enabled, port = 2121) {
    this.wifiConfig.port = port;

    if (enabled) {
      if (this.wifiConfig.running) {
        this.stopWifiServer();
      }
      return await this.startWifiServer();
    } else {
      this.stopWifiServer();
      return { success: true, running: false };
    }
  }

  async startWifiServer() {
    try {
      const targetDir = this.store.get('watchDir') || path.join(this.app.getPath('userData'), 'wifi_ingest');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const ip = this.getLocalIPAddress();
      const ftpPort = this.wifiConfig.port || 2121;
      const httpPort = ftpPort + 1; // e.g. 2122 for companion web portal

      // 1. START REAL FTP / FTPS SERVER FOR PROFESSIONAL CAMERAS (Sony, Nikon, Canon, Fuji)
      if (FtpSrv) {
        this.ftpServer = new FtpSrv({
          url: `ftp://0.0.0.0:${ftpPort}`,
          pasv_url: ip,
          anonymous: true,
          greeting: ['FotoSync PRO Camera Ingest Server Ready']
        });

        this.ftpServer.on('login', ({ connection, username, password }, resolve, reject) => {
          this.wifiConfig.connectedClients++;
          const clientIp = connection.ip || 'Kamera';
          this.log('SUCCESS', `📡 Kamera Terhubung via WiFi FTP! [${clientIp}] User: ${username || 'anonymous'}`);
          this.updateUI();

          connection.on('STOR', (err, serverPath) => {
            if (!err && serverPath) {
              const filename = path.basename(serverPath);
              this.log('SUCCESS', `📸 LIVE SHOT WIRELESS! Foto diterima dari kamera via FTP: ${filename}`);
              this.onLiveShutterReceived(serverPath, 'WiFi Wireless (FTP)', 'Kamera Wireless (FTP)');
            }
          });

          connection.on('close', () => {
            this.wifiConfig.connectedClients = Math.max(0, this.wifiConfig.connectedClients - 1);
            this.log('INFO', `🔌 Sesi FTP Kamera terputus/selesai dari ${clientIp}`);
            this.updateUI();
          });

          resolve({ root: targetDir });
        });

        this.ftpServer.on('client-error', ({ connection, context, error }) => {
          console.warn(`[FTP Error ${context}]:`, error?.message);
        });

        await this.ftpServer.listen();
        this.wifiConfig.running = true;
        this.log('SUCCESS', `📡 Server FTP Kamera Aktif pada ftp://${ip}:${ftpPort}`);
      }

      // 2. START COMPANION HTTP WEB PORTAL (For Mobile/Browser Uploads on port + 1)
      try {
        this.httpCompanionServer = http.createServer((req, res) => {
          if (req.method === 'POST' || req.method === 'PUT') {
            const filename = `MOBILE_SHOT_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
            const savePath = path.join(targetDir, filename);
            const writeStream = fs.createWriteStream(savePath);

            req.pipe(writeStream);

            req.on('end', () => {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'ok', filename }));

              this.onLiveShutterReceived(savePath, 'Mobile Web Ingest', 'Smartphone Browser');
            });

            req.on('error', (err) => {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            });
          } else {
            const html = this.getWifiPortalHTML(ip, ftpPort, httpPort);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
          }
        });

        this.httpCompanionServer.listen(httpPort, () => {
          this.log('INFO', `📱 Web Ingest Portal untuk HP/Browser Aktif pada http://${ip}:${httpPort}`);
        });

        this.httpCompanionServer.on('error', (err) => {
          console.warn('[HTTP Companion Server Warning]:', err.message);
        });
      } catch (eHttp) {
        console.warn('Could not start HTTP companion server:', eHttp.message);
      }

      this.updateUI();
      return { success: true, running: true, ip, port: ftpPort, httpPort };
    } catch (err) {
      this.wifiConfig.running = false;
      this.log('ERROR', `Gagal memulai Server WiFi FTP: ${err.message}`);
      this.updateUI();
      return { success: false, error: err.message };
    }
  }

  stopWifiServer() {
    if (this.ftpServer) {
      try {
        this.ftpServer.close();
      } catch (e) {}
      this.ftpServer = null;
    }
    if (this.httpCompanionServer) {
      try {
        this.httpCompanionServer.close();
      } catch (e) {}
      this.httpCompanionServer = null;
    }
    this.wifiConfig.running = false;
    this.wifiConfig.connectedClients = 0;
    this.log('WARN', '📡 Server Ingest WiFi Kamera Dihentikan.');
    this.updateUI();
  }

  getWifiPortalHTML(ip, ftpPort, httpPort) {
    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FotoSync PRO - WiFi Camera Ingest Portal</title>
  <style>
    :root {
      --bg: #0b1120;
      --card-bg: #1e293b;
      --primary: #3b82f6;
      --accent: #10b981;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --border: #334155;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 24px 16px; min-height: 100vh; display: flex; flex-direction: column; align-items: center; }
    .container { max-width: 860px; width: 100%; display: flex; flex-direction: column; gap: 24px; }
    .header { text-align: center; padding: 28px; background: linear-gradient(135deg, rgba(30,58,138,0.6), rgba(15,23,42,0.9)); border-radius: 20px; border: 1px solid var(--border); box-shadow: 0 10px 30px rgba(0,0,0,0.4); }
    .logo { font-size: 36px; margin-bottom: 8px; }
    h1 { font-size: 24px; font-weight: 800; color: #fff; margin-bottom: 6px; }
    p.sub { font-size: 14px; color: var(--text-muted); }
    .status-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(16,185,129,0.15); border: 1px solid var(--accent); color: #34d399; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; margin-top: 14px; }
    .pulse { width: 8px; height: 8px; background: #34d399; border-radius: 50%; box-shadow: 0 0 10px #34d399; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.3); } 100% { opacity: 1; transform: scale(1); } }
    
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 20px; }
    .card { background: var(--card-bg); border-radius: 18px; border: 1px solid var(--border); padding: 22px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
    .card-title { font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 14px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 10px; }
    .info-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 13px; }
    .info-label { color: var(--text-muted); }
    .info-val { font-family: monospace; font-weight: 700; background: #0f172a; padding: 4px 10px; border-radius: 6px; color: #60a5fa; border: 1px solid rgba(255,255,255,0.1); }
    
    .brand-section { margin-bottom: 18px; background: rgba(15,23,42,0.6); padding: 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); }
    .brand-section:last-child { margin-bottom: 0; }
    .brand-header { font-size: 14px; font-weight: 700; color: #f1f5f9; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
    .brand-steps { font-size: 12.5px; color: var(--text-muted); line-height: 1.6; padding-left: 18px; }
    .brand-steps li { margin-bottom: 4px; }
    .highlight { color: #f59e0b; font-weight: 700; font-family: monospace; }
    
    .dropzone { border: 2px dashed var(--primary); border-radius: 14px; padding: 30px 16px; text-align: center; background: rgba(59,130,246,0.06); cursor: pointer; transition: all 0.2s; margin-top: 10px; }
    .dropzone:hover { background: rgba(59,130,246,0.14); border-color: #60a5fa; }
    .dz-icon { font-size: 38px; margin-bottom: 8px; }
    .dz-text { font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 4px; }
    .dz-sub { font-size: 12px; color: var(--text-muted); }
    #fileInput { display: none; }
    
    .toast { position: fixed; bottom: 24px; right: 24px; background: #10b981; color: #fff; padding: 12px 22px; border-radius: 12px; font-size: 13px; font-weight: 700; box-shadow: 0 10px 30px rgba(0,0,0,0.5); opacity: 0; transform: translateY(20px); transition: all 0.3s; pointer-events: none; z-index: 9999; }
    .toast.show { opacity: 1; transform: translateY(0); }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">📸 📡</div>
      <h1>FotoSync PRO - WiFi Camera Ingest Portal</h1>
      <p class="sub">Server Receiver Nirkabel Kamera (Canon, Nikon, Sony, Fujifilm & Mobile Upload)</p>
      <div class="status-badge">
        <span class="pulse"></span>
        <span>SERVER FTP LIVE & READY</span>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-title">⚙️ Parameter FTP Server Kamera</div>
        <div class="info-row">
          <span class="info-label">Alamat Host / IP:</span>
          <span class="info-val">${ip}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Port FTP Kamera:</span>
          <span class="info-val">${ftpPort}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Username / Login:</span>
          <span class="info-val">anonymous</span>
        </div>
        <div class="info-row">
          <span class="info-label">Password:</span>
          <span class="info-val">(kosongkan)</span>
        </div>
        <div class="info-row">
          <span class="info-label">Mode Transfer:</span>
          <span class="info-val">Passive (PASV)</span>
        </div>

        <div style="margin-top: 20px;">
          <div class="card-title">📱 Upload Foto dari Browser HP / Laptop</div>
          <div class="dropzone" onclick="document.getElementById('fileInput').click()">
            <div class="dz-icon">📤</div>
            <div class="dz-text">Pilih Foto atau Seret ke Sini</div>
            <div class="dz-sub">Foto otomatis diteruskan ke Desktop Uploader & Masuk Antrean</div>
            <input type="file" id="fileInput" accept="image/*" multiple onchange="uploadFiles(this.files)" />
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">📖 Panduan Koneksi Kamera Wireless (FTP Push)</div>

        <div class="brand-section">
          <div class="brand-header">🟡 Nikon (Z9 / Z8 / Z6 II / WT-7)</div>
          <ol class="brand-steps">
            <li>Buka Menu 🌐 <strong>Network Settings</strong> ➔ <strong>Connect to FTP Server</strong>.</li>
            <li>Pilih <strong>Add Network Profile</strong> ➔ Hubungkan ke WiFi yang sama dengan laptop.</li>
            <li>Server Type: <strong>FTP</strong>, Host: <span class="highlight">${ip}</span>, Port: <span class="highlight">${ftpPort}</span>.</li>
            <li>Aktifkan <strong>Auto Send on Shoot</strong>. Setiap foto otomatis terkirim.</li>
          </ol>
        </div>

        <div class="brand-section">
          <div class="brand-header">🟠 Sony (Alpha A7 IV / A9 / A1 / FX3)</div>
          <ol class="brand-steps">
            <li>Buka Menu ⚙️ <strong>Network</strong> ➔ <strong>FTP Transfer Func.</strong> ➔ <strong>FTP Transfer: ON</strong>.</li>
            <li>Buka <strong>Server Setting 1</strong> ➔ Destination IP / Host: <span class="highlight">${ip}</span>, Port: <span class="highlight">${ftpPort}</span>.</li>
            <li>User Info: <strong>Anonymous</strong>, Directory: <strong>/</strong>.</li>
            <li>Aktifkan <strong>Auto Transfer During Save</strong>.</li>
          </ol>
        </div>

        <div class="brand-section">
          <div class="brand-header">🔴 Canon (EOS R / 1DX III / 5D IV)</div>
          <ol class="brand-steps">
            <li>Buka Menu 🌐 <strong>Wireless Communication Settings</strong> ➔ <strong>FTP Transfer</strong>.</li>
            <li>Set <strong>Transfer Mode ➔ Auto Transfer</strong>.</li>
            <li>Pilih <strong>Target Server ➔ Address Set</strong>: <span class="highlight">${ip}</span>, Port: <span class="highlight">${ftpPort}</span>.</li>
          </ol>
        </div>

        <div class="brand-section">
          <div class="brand-header">🟢 Fujifilm (X-T5 / X-H2 / GFX)</div>
          <ol class="brand-steps">
            <li>Menu <strong>Connection Setting</strong> ➔ <strong>FTP Transfer Setup</strong>.</li>
            <li>Host: <span class="highlight">${ip}</span>, Port: <span class="highlight">${ftpPort}</span>, Mode: <strong>PASV</strong>.</li>
          </ol>
        </div>
      </div>
    </div>
  </div>

  <div id="toast" class="toast">✅ Foto Berhasil Terkirim ke FotoSync Uploader!</div>

  <script>
    async function uploadFiles(files) {
      if (!files || files.length === 0) return;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const res = await fetch(window.location.href, {
            method: 'POST',
            body: file
          });
          if (res.ok) {
            showToast('✅ Foto ' + file.name + ' berhasil terkirim!');
          }
        } catch (e) {
          showToast('❌ Gagal mengunggah foto: ' + e.message);
        }
      }
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3500);
    }
  </script>
</body>
</html>`;
  }

  // --- 3. SHUTTER TRIGGER & PHOTO RECEIVE PIPELINE ---
  onLiveShutterReceived(filePath, sourceMode = 'Kabel USB Direct', cameraModel = 'Kamera Live') {
    const filename = path.basename(filePath);

    // Record in syncedCameraFiles & syncedFilesPath so changing folders will never re-copy this photo
    if (!this.syncedCameraFiles.has(filename)) {
      this.syncedCameraFiles.add(filename);
      try {
        fs.appendFileSync(this.syncedFilesPath, filename + '\n', 'utf8');
      } catch (e) {}
    }

    this.stats.totalShots++;
    this.stats.lastShotTime = new Date().toISOString();
    this.stats.lastShotFilename = filename;
    this.stats.lastShotSource = sourceMode;

    this.log('SUCCESS', `⚡ LIVE SHUTTER! Foto Diterima [${sourceMode}]: ${this.stats.lastShotFilename}`);

    // Send audio-visual live shutter event to renderer UI
    this.sendToRenderer('live-shutter:shotCaptured', {
      filename: this.stats.lastShotFilename,
      filePath,
      sourceMode,
      cameraModel,
      timestamp: Date.now(),
      totalShots: this.stats.totalShots
    });

    // Pass to uploader engine queue (will stay pending if uploader is paused)
    if (this.uploaderEngine) {
      this.uploaderEngine.onFileDiscovered(filePath);
    }

    this.updateUI();
  }

  // Trigger Real Live Shutter Sync & Test Photo Processing
  async triggerTestShot() {
    try {
      const targetDir = this.store.get('watchDir') || path.join(this.app.getPath('userData'), 'camera_ingest');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      this.log('INFO', '📸 Menjalankan Tes Shutter Kamera...');

      // 1. Check if camera is connected via MTP or USB Drive
      let isCameraActive = false;
      let isSdCardActive = false;
      let mtpResult = null;
      let cameraName = 'Kamera';

      if (process.platform === 'win32') {
        mtpResult = await this.checkMtpCamera(targetDir);
        if (mtpResult && mtpResult.found) {
          isCameraActive = true;
          cameraName = mtpResult.cameraName ? `Kamera ${mtpResult.cameraName}` : 'Kamera MTP';
        }
      }

      if (!isCameraActive && this.cableConfig.cameraDetails) {
        isCameraActive = true;
        cameraName = this.cableConfig.cameraDetails.name;
      }

      if (this.cableConfig.sdCardDetails && fs.existsSync(this.cableConfig.sdCardDetails.path)) {
        isSdCardActive = true;
      }

      // Also check if WiFi Ingest Server is running
      if (!isCameraActive && !isSdCardActive && this.wifiConfig.running) {
        isCameraActive = true;
        cameraName = 'Kamera WiFi Wireless Ingest';
      }

      // IF NEITHER CAMERA NOR SD CARD CONNECTED -> FAIL
      if (!isCameraActive && !isSdCardActive) {
        this.log('WARN', '❌ Tes Shutter GAGAL: Tidak ada Kamera atau SD Card yang terhubung.');
        return {
          success: false,
          error: 'Tidak ada Kamera atau SD Card yang terhubung. Colokkan kabel USB kamera atau masukkan SD Card ke card reader.'
        };
      }

      // 2. Camera IS active -> Sync photos from camera right now
      if (mtpResult && mtpResult.copiedCount > 0 && Array.isArray(mtpResult.copiedFiles) && mtpResult.copiedFiles.length > 0) {
        const latestFile = mtpResult.copiedFiles[mtpResult.copiedFiles.length - 1];
        const fullPath = path.join(targetDir, latestFile);
        const stats = fs.statSync(fullPath);
        const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

        this.onLiveShutterReceived(fullPath, 'Kabel USB Direct (Kamera)', cameraName);
        this.log('SUCCESS', `📸 TES SHUTTER KAMERA BERHASIL! Foto jepretan baru [${latestFile}] (${sizeMb} MB) dari ${cameraName} disinkronkan & masuk antrean!`);

        return {
          success: true,
          isRealPhoto: true,
          filename: latestFile,
          filePath: fullPath,
          sizeMb,
          cameraName
        };
      }

      // If SD Card is active and camera didn't have a new shot, read from SD card
      if (isSdCardActive) {
        const sdPath = this.cableConfig.sdCardDetails.path;
        try {
          const files = fs.readdirSync(sdPath).filter(f => /\.(jpg|jpeg|png|arw|cr2|cr3|nef|raf|dng)$/i.test(f));
          if (files.length > 0) {
            const latestFile = files[files.length - 1];
            const fullPath = path.join(sdPath, latestFile);
            const stats = fs.statSync(fullPath);
            const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

            this.onLiveShutterReceived(fullPath, 'SD Card Reader', this.cableConfig.sdCardDetails.name);
            this.log('SUCCESS', `💾 TES SD CARD BERHASIL! Foto [${latestFile}] (${sizeMb} MB) dari kartu memori disinkronkan & masuk antrean!`);

            return {
              success: true,
              isRealPhoto: true,
              filename: latestFile,
              filePath: fullPath,
              sizeMb,
              cameraName: this.cableConfig.sdCardDetails.name
            };
          }
        } catch (eSd) {}
      }

      // 3. Camera is connected & ON, but no NEW photo was taken right now
      this.log('WARN', `⚠️ Tes Shutter: Perangkat "${cameraName}" terhubung, namun belum ada foto baru.`);
      return {
        success: false,
        warning: true,
        error: `Kamera (${cameraName}) terhubung, namun belum ada jepretan foto baru. Silakan jepret foto baru pada kamera Anda.`
      };

    } catch (err) {
      this.log('ERROR', `Gagal memproses Tes Shutter: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  getStatus() {
    return {
      cable: this.cableConfig,
      wifi: {
        ...this.wifiConfig,
        ip: this.getLocalIPAddress()
      },
      stats: this.stats
    };
  }

  updateUI() {
    this.sendToRenderer('live-shutter:statusUpdate', this.getStatus());
  }

  // --- 4. MACOS HARDWARE USB CAMERA PROBE ---
  scanMacUsbCameras() {
    if (process.platform !== 'darwin') return null;
    try {
      const out = execSync('/usr/sbin/system_profiler SPUSBDataType -json -detailLevel basic', {
        timeout: 2500,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });

      if (!out || !out.trim()) return null;
      const data = JSON.parse(out);

      const findCameraInTree = (items) => {
        if (!items || !Array.isArray(items)) return null;
        for (const item of items) {
          const name = (item._name || '').trim();
          const vendorId = (item.vendor_id || '').toLowerCase();
          const serial = (item.serial_num || '').trim();

          const isNikon = vendorId.includes('0x04b0') || /nikon|z\s*6|z\s*7|z\s*8|z\s*9|z\s*5|z\s*30|z\s*50|z\s*fc|d850|d750/i.test(name);
          const isSony = vendorId.includes('0x054c') || /sony|ilce-|dsc-|alpha/i.test(name);
          const isCanon = vendorId.includes('0x04a9') || /canon|eos/i.test(name);
          const isFuji = vendorId.includes('0x04cb') || /fujifilm|fuji|x-t|x-h|x-s|gfx/i.test(name);
          const isPanasonic = vendorId.includes('0x04da') || /lumix|panasonic/i.test(name);
          const isOlympus = vendorId.includes('0x07b4') || /olympus|om\s*system/i.test(name);

          const isBuiltInWebcam = /facetime|apple|isight|built-in/i.test(name) || /apple/i.test(vendorId);

          if (!isBuiltInWebcam && (isNikon || isSony || isCanon || isFuji || isPanasonic || isOlympus)) {
            let cleanName = name;
            if (isNikon && !cleanName.toLowerCase().includes('nikon')) cleanName = `Nikon ${cleanName}`;
            if (isSony && !cleanName.toLowerCase().includes('sony')) cleanName = `Sony ${cleanName}`;
            if (isCanon && !cleanName.toLowerCase().includes('canon')) cleanName = `Canon ${cleanName}`;
            if (isFuji && !cleanName.toLowerCase().includes('fuji')) cleanName = `Fujifilm ${cleanName}`;
            return {
              name: cleanName,
              vendorId,
              serial
            };
          }

          if (item._items) {
            const nested = findCameraInTree(item._items);
            if (nested) return nested;
          }
        }
        return null;
      };

      return findCameraInTree(data.SPUSBDataType);
    } catch (e) {
      return null;
    }
  }

  // --- 5. MACOS APPLE IMAGECAPTURECORE USB CAMERA BRIDGE ---
  startMacCameraBridge(targetDir) {
    if (process.platform !== 'darwin') return;
    if (this.macBridgeProcess) return;

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let binaryPath = path.join(__dirname, 'scripts', 'mac_camera_bridge');
    if (binaryPath.includes('app.asar')) {
      binaryPath = binaryPath.replace('app.asar', 'app.asar.unpacked');
    }

    let scriptPath = path.join(__dirname, 'scripts', 'mac_camera_bridge.swift');
    if (scriptPath.includes('app.asar')) {
      scriptPath = scriptPath.replace('app.asar', 'app.asar.unpacked');
    }

    try {
      if (fs.existsSync(binaryPath)) {
        try { fs.chmodSync(binaryPath, 0o755); } catch (e) {}
        this.macBridgeProcess = spawn(binaryPath, [targetDir]);
        this.log('INFO', `🍏 [macOS] Apple ImageCaptureCore Camera Bridge aktif (Native Binary).`);
      } else if (fs.existsSync(scriptPath)) {
        this.macBridgeProcess = spawn('/usr/bin/swift', [scriptPath, targetDir]);
        this.log('INFO', `🍏 [macOS] Apple ImageCaptureCore Camera Bridge aktif (Swift Interpreter).`);
      } else {
        this.log('WARN', `[macOS Bridge] File bridge kamera tidak ditemukan di ${scriptPath}`);
        return;
      }

      let buffer = '';
      this.macBridgeProcess.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line.trim());
            if (ev.event === 'camera_connected') {
              this.cableConfig.connectedCamera = ev.camera;
              this.cableConfig.cameraDetails = {
                name: ev.camera,
                model: ev.camera,
                path: targetDir,
                type: 'camera'
              };
              this.cableConfig.detectedDrive = targetDir;
              this.cableConfig.activeDeviceType = 'camera';
              this.log('SUCCESS', `📸 [macOS] KAMERA TERHUBUNG (Apple ImageCapture): "${ev.camera}"`);
              
              const payload = {
                deviceType: 'camera',
                deviceName: ev.camera,
                deviceIcon: '📷',
                cameraName: ev.camera,
                drivePath: targetDir,
                description: `Kamera ${ev.camera} terhubung via kabel USB di macOS (Apple ImageCapture Core).`,
                timestamp: Date.now()
              };
              this.sendToRenderer('live-shutter:devicePluggedIn', payload);
              this.sendToRenderer('live-shutter:cameraPluggedIn', payload);
              this.updateUI();
            } else if (ev.event === 'camera_disconnected') {
              this.cableConfig.connectedCamera = null;
              this.cableConfig.cameraDetails = null;
              this.cableConfig.detectedDrive = null;
              this.cableConfig.activeDeviceType = null;
              this.log('WARN', `🔌 [macOS] Kamera "${ev.camera}" terputus/dilepas.`);
              this.updateUI();
            } else if (ev.event === 'photo_downloaded') {
              this.log('SUCCESS', `⚡ [macOS] LIVE SHOT USB! ${ev.file} ditarik dari ${ev.camera}.`);
              this.onLiveShutterReceived(ev.path, 'Kabel USB Direct (macOS)', ev.camera);
            }
          } catch (e) {}
        }
      });

      this.macBridgeProcess.stderr.on('data', (data) => {
        const errText = data.toString().trim();
        if (errText) console.warn('[macOS Camera Bridge STDERR]:', errText);
      });

      this.macBridgeProcess.on('close', (code) => {
        this.macBridgeProcess = null;
        if (code !== 0 && code !== null) {
          this.log('WARN', `[macOS Camera Bridge] Berhenti (exit code ${code})`);
        }
      });
    } catch (err) {
      this.log('ERROR', `Gagal menjalankan macOS Camera Bridge: ${err.message}`);
    }
  }

  stopMacCameraBridge() {
    if (this.macBridgeProcess) {
      try {
        this.macBridgeProcess.kill('SIGTERM');
      } catch (e) {}
      this.macBridgeProcess = null;
    }
  }

  destroy() {
    if (this.cableInterval) clearInterval(this.cableInterval);
    this.stopWifiServer();
    this.stopMacCameraBridge();
  }
}

module.exports = LiveShutterEngine;
