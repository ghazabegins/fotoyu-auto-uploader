const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { execFile } = require('child_process');

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
      detectedDrive: null,
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

    this.wifiServer = null;
    this.cableInterval = null;

    this.init();
  }

  init() {
    this.log('INFO', '📸 Initializing Live Shutter Connect Engine (Cable USB & WiFi Ingest)...');
    this.startCableDriveMonitoring();
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

      const args = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Action', 'sync', '-TargetDir', targetDir];
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
    try {
      let detectedDrive = null;
      let cameraName = null;

      // 1. Check Mass Storage Drive Letters (e.g. D:\DCIM, E:\DCIM, etc.)
      if (process.platform === 'win32') {
        const driveLetters = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
        for (const letter of driveLetters) {
          const drivePath = `${letter}:\\`;
          const dcimPath = path.join(drivePath, 'DCIM');
          
          if (fs.existsSync(dcimPath)) {
            let subfolder = null;
            let brandTag = 'Kamera Digital';
            try {
              const subItems = fs.readdirSync(dcimPath);
              for (const item of subItems) {
                const fullSub = path.join(dcimPath, item);
                if (fs.statSync(fullSub).isDirectory() && !item.startsWith('.')) {
                  subfolder = fullSub;
                  if (item.includes('CANON') || item.includes('EOS')) brandTag = 'Canon EOS Camera';
                  else if (item.includes('MSDCF') || item.includes('SONY')) brandTag = 'Sony Alpha Camera';
                  else if (item.includes('NIKON') || item.includes('NCD')) brandTag = 'Nikon Z Studio Camera';
                  else if (item.includes('FUJI')) brandTag = 'Fujifilm X-Series Camera';
                  else if (item.includes('GOPRO')) brandTag = 'GoPro Camera';
                  else if (item.includes('PANA')) brandTag = 'Lumix Camera';
                  else brandTag = `Kamera Folder (${item})`;
                  break;
                }
              }
            } catch (e) {}

            detectedDrive = subfolder || dcimPath;
            cameraName = `${brandTag} (${letter}:\\DCIM)`;
            break;
          }
        }
      } else {
        // macOS / Linux volume mounts & USB Camera detection
        const volumesPath = '/Volumes';
        if (fs.existsSync(volumesPath)) {
          try {
            const vols = fs.readdirSync(volumesPath);
            for (const vol of vols) {
              if (vol === 'Macintosh HD' || vol === 'Macintosh HD - Data' || vol.startsWith('.')) continue;
              const fullVolPath = path.join(volumesPath, vol);
              
              // Case-insensitive DCIM search & subfolder inspection
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
                let brandTag = `Kamera (${vol})`;
                try {
                  const subItems = fs.readdirSync(dcimFoundPath);
                  for (const item of subItems) {
                    const fullSub = path.join(dcimFoundPath, item);
                    if (fs.statSync(fullSub).isDirectory() && !item.startsWith('.')) {
                      subfolder = fullSub;
                      if (item.includes('NIKON') || item.includes('NCD')) brandTag = `Nikon Camera (${vol})`;
                      else if (item.includes('CANON') || item.includes('EOS')) brandTag = `Canon Camera (${vol})`;
                      else if (item.includes('MSDCF') || item.includes('SONY')) brandTag = `Sony Camera (${vol})`;
                      else if (item.includes('FUJI')) brandTag = `Fujifilm Camera (${vol})`;
                      else brandTag = `Kamera ${item} (${vol})`;
                      break;
                    }
                  }
                } catch (e) {}

                detectedDrive = subfolder || dcimFoundPath;
                cameraName = `${brandTag}/DCIM`;

                // Auto Sync New Photos on macOS (Same auto-ingest behavior as Windows MTP)
                const targetIngestDir = this.store.get('watchDir') || path.join(this.app.getPath('userData'), 'camera_ingest');
                if (!fs.existsSync(targetIngestDir)) {
                  fs.mkdirSync(targetIngestDir, { recursive: true });
                }

                try {
                  const targetFolderToScan = subfolder || dcimFoundPath;
                  const photoFiles = fs.readdirSync(targetFolderToScan);
                  let macCopiedCount = 0;

                  for (const f of photoFiles) {
                    if (!/\.(jpg|jpeg|png)$/i.test(f) || f.startsWith('.')) continue;
                    const srcPhotoPath = path.join(targetFolderToScan, f);
                    const destPhotoPath = path.join(targetIngestDir, f);

                    if (!fs.existsSync(destPhotoPath)) {
                      fs.copyFileSync(srcPhotoPath, destPhotoPath);
                      macCopiedCount++;
                      this.onLiveShutterReceived(destPhotoPath, 'Kabel USB Direct (macOS)', brandTag);
                    }
                  }

                  if (macCopiedCount > 0) {
                    this.log('SUCCESS', `📸 macOS Cable Ingest: Sync ${macCopiedCount} foto baru dari ${brandTag}!`);
                  }
                } catch (eMacCopy) {}

                break;
              }
            }
          } catch (errVol) {}
        }

        // Fallback: Check connected USB Cameras via system_profiler on macOS
        if (!detectedDrive && process.platform === 'darwin') {
          try {
            const { execSync } = require('child_process');
            const usbInfo = execSync('system_profiler SPUSBDataType 2>/dev/null', { timeout: 3000 }).toString();
            const cameraMatch = usbInfo.match(/(Nikon|Canon|Sony|Fujifilm|GoPro|Olympus|Panasonic|Lumix|Leica)[^\n]*/i);
            if (cameraMatch) {
              const detectedCamModel = cameraMatch[0].trim();
              this.log('SUCCESS', `🔌 KAMERA TERHUBUNG VIA USB (macOS PTP): "${detectedCamModel}"`);
            }
          } catch (eUsb) {}
        }
      }

      // 2. Check Windows MTP / WPD Cameras (e.g. Nikon Z 6 II, Sony ILCE, Canon EOS in MTP mode)
      if (!detectedDrive && process.platform === 'win32') {
        const defaultIngestDir = this.store.get('watchDir') || path.join(this.app.getPath('userData'), 'camera_ingest');
        if (!fs.existsSync(defaultIngestDir)) {
          fs.mkdirSync(defaultIngestDir, { recursive: true });
        }

        const mtpRes = await this.checkMtpCamera(defaultIngestDir);
        if (mtpRes && mtpRes.found) {
          detectedDrive = defaultIngestDir;
          cameraName = `Kamera MTP: ${mtpRes.cameraName}`;

          if (mtpRes.copiedCount > 0) {
            this.log('SUCCESS', `📸 MTP Camera Ingest: Sync ${mtpRes.copiedCount} foto baru dari ${mtpRes.cameraName}!`);
            if (Array.isArray(mtpRes.copiedFiles) && mtpRes.copiedFiles.length > 0) {
              for (const filename of mtpRes.copiedFiles) {
                const fullPath = path.join(defaultIngestDir, filename);
                this.onLiveShutterReceived(fullPath, 'Kabel USB Direct (MTP)', mtpRes.cameraName);
              }
            }
          }
        }
      }

      this.cableConfig.lastScanTime = new Date().toISOString();

      const isNewConnection = (detectedDrive && (this.cableConfig.detectedDrive !== detectedDrive || !this.cableConfig.connectedCamera));

      if (isNewConnection) {
        this.cableConfig.detectedDrive = detectedDrive;
        this.cableConfig.connectedCamera = cameraName;
        this.log('SUCCESS', `🔌 KAMERA TERHUBUNG! Auto-deteksi: "${cameraName}" -> "${detectedDrive}"`);
        
        // Auto assign watchDir
        if (this.cableConfig.autoDetectDCIM) {
          this.store.set('watchDir', detectedDrive);
          this.log('INFO', `Auto-assign Watch Directory ke folder kamera: "${detectedDrive}" (Menunggu Tombol Start manual)`);
        }

        // Notify renderer with plug-in alert banner
        this.sendToRenderer('live-shutter:cameraPluggedIn', {
          cameraName,
          drivePath: detectedDrive,
          timestamp: Date.now()
        });

        this.updateUI();
      } else if (detectedDrive && cameraName && cameraName.startsWith('Kamera MTP:')) {
        // Periodic background sync for MTP camera
        this.cableConfig.connectedCamera = cameraName;
        const defaultIngestDir = detectedDrive;
        const mtpRes = await this.checkMtpCamera(defaultIngestDir);
        
        if (mtpRes && mtpRes.copiedCount > 0) {
          this.log('SUCCESS', `⚡ MTP LIVE SHOT! ${mtpRes.copiedCount} foto baru ditarik dari ${mtpRes.cameraName}.`);
          
          if (Array.isArray(mtpRes.copiedFiles) && mtpRes.copiedFiles.length > 0) {
            for (const filename of mtpRes.copiedFiles) {
              const fullPath = path.join(defaultIngestDir, filename);
              this.onLiveShutterReceived(fullPath, 'Kabel USB Direct (MTP)', mtpRes.cameraName);
            }
          }
        }
        this.updateUI();
      } else if (!detectedDrive && this.cableConfig.detectedDrive) {
        this.cableConfig.detectedDrive = null;
        this.cableConfig.connectedCamera = null;
        this.log('WARN', '🔌 Kabel Kamera Terputus/Dilepas.');
        this.updateUI();
      }
    } catch (err) {
      // ignore stat errors on drive scan
    }
  }

  toggleCableMode(enabled, autoDetectDCIM = true) {
    this.cableConfig.enabled = enabled;
    this.cableConfig.autoDetectDCIM = autoDetectDCIM;
    this.log('INFO', `USB Cable Mode: ${enabled ? 'AKTIF' : 'NON-AKTIF'}`);
    if (enabled) {
      this.checkConnectedDrives();
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

  // --- 2. PERFECTED WIFI WIRELESS CAMERA INGEST SERVER ---
  toggleWifiServer(enabled, port = 2121) {
    this.wifiConfig.port = port;

    if (enabled) {
      if (this.wifiConfig.running) {
        this.stopWifiServer();
      }
      return this.startWifiServer();
    } else {
      this.stopWifiServer();
      return { success: true, running: false };
    }
  }

  startWifiServer() {
    try {
      const targetDir = this.store.get('watchDir') || path.join(this.app.getPath('userData'), 'wifi_ingest');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // HTTP & Raw Photo Ingest Endpoint for Wireless Cameras (Canon WFT, Nikon WT, Sony FTP Over HTTP)
      this.wifiServer = http.createServer((req, res) => {
        if (req.method === 'POST' || req.method === 'PUT') {
          const filename = `WIFI_SHOT_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
          const savePath = path.join(targetDir, filename);
          const writeStream = fs.createWriteStream(savePath);

          req.pipe(writeStream);

          req.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', filename }));

            this.onLiveShutterReceived(savePath, 'WiFi Wireless Ingest', 'Kamera Wireless WiFi');
          });

          req.on('error', (err) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          });
        } else {
          const ip = this.getLocalIPAddress();
          const html = this.getWifiPortalHTML(ip, this.wifiConfig.port);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
        }
      });

      this.wifiServer.listen(this.wifiConfig.port, () => {
        this.wifiConfig.running = true;
        const ip = this.getLocalIPAddress();
        this.log('SUCCESS', `📡 Server Ingest WiFi Kamera Aktif pada http://${ip}:${this.wifiConfig.port}`);
        this.updateUI();
      });

      this.wifiServer.on('error', (err) => {
        this.wifiConfig.running = false;
        this.log('ERROR', `Gagal membuka Server WiFi (Port ${this.wifiConfig.port}): ${err.message}`);
        this.updateUI();
      });

      return { success: true, running: true, ip: this.getLocalIPAddress(), port: this.wifiConfig.port };
    } catch (err) {
      this.log('ERROR', `Gagal memulai WiFi Server: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  stopWifiServer() {
    if (this.wifiServer) {
      this.wifiServer.close();
      this.wifiServer = null;
    }
    this.wifiConfig.running = false;
    this.log('WARN', '📡 Server Ingest WiFi Kamera Dihentikan.');
    this.updateUI();
  }

  getWifiPortalHTML(ip, port) {
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
        <span>SERVER LIVE & READY</span>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-title">⚙️ Informasi Server Ingest</div>
        <div class="info-row">
          <span class="info-label">Alamat IP Server:</span>
          <span class="info-val">http://${ip}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Port HTTP / FTP Ingest:</span>
          <span class="info-val">${port}</span>
        </div>
        <div class="info-row">
          <span class="info-label">URL Endpoint Lengkap:</span>
          <span class="info-val">http://${ip}:${port}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Metode Transmisi:</span>
          <span class="info-val">HTTP POST / Raw Binary</span>
        </div>

        <div style="margin-top: 20px;">
          <div class="card-title">📱 Tes Upload Foto dari HP / Laptop Browser</div>
          <div class="dropzone" onclick="document.getElementById('fileInput').click()">
            <div class="dz-icon">📤</div>
            <div class="dz-text">Pilih Foto atau Seret ke Sini</div>
            <div class="dz-sub">Foto akan langsung terkirim ke Desktop Uploader & Masuk Antrean</div>
            <input type="file" id="fileInput" accept="image/*" multiple onchange="uploadFiles(this.files)" />
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">📖 Panduan Koneksi Kamera Wireless (FTP / Push)</div>

        <div class="brand-section">
          <div class="brand-header">🟡 Nikon (Z9 / Z8 / Z6 II / WT-7)</div>
          <ol class="brand-steps">
            <li>Buka Menu 🌐 <strong>Network Settings</strong> ➔ <strong>Connect to FTP Server</strong>.</li>
            <li>Pilih <strong>Add Network Profile</strong> ➔ Hubungkan ke WiFi yang sama dengan laptop.</li>
            <li>Masukkan Server Address: <span class="highlight">http://${ip}:${port}</span></li>
            <li>Aktifkan <strong>Auto Send on Shoot</strong>. Setiap foto jepretan otomatis terkirim.</li>
          </ol>
        </div>

        <div class="brand-section">
          <div class="brand-header">🟠 Sony (Alpha A7 IV / A9 / A1 / FX3)</div>
          <ol class="brand-steps">
            <li>Buka Menu ⚙️ <strong>Network</strong> ➔ <strong>FTP Transfer Func.</strong>.</li>
            <li>Set <strong>FTP Transfer ➔ ON</strong>.</li>
            <li>Buka <strong>Server Setting 1</strong> ➔ Destination IP: <span class="highlight">${ip}</span> & Port: <span class="highlight">${port}</span>.</li>
            <li>Aktifkan <strong>Auto Transfer During Save</strong>.</li>
          </ol>
        </div>

        <div class="brand-section">
          <div class="brand-header">🔴 Canon (EOS R / 1DX III / 5D IV)</div>
          <ol class="brand-steps">
            <li>Buka Menu 🌐 <strong>Wireless Communication Settings</strong> ➔ <strong>FTP Transfer</strong>.</li>
            <li>Set <strong>Transfer Mode ➔ Auto Transfer</strong>.</li>
            <li>Pilih <strong>Target Server ➔ Address Set</strong>: <span class="highlight">${ip}</span>, Port: <span class="highlight">${port}</span>.</li>
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
    this.stats.totalShots++;
    this.stats.lastShotTime = new Date().toISOString();
    this.stats.lastShotFilename = path.basename(filePath);
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
      let mtpResult = null;
      let cameraName = 'Kamera';

      if (process.platform === 'win32') {
        mtpResult = await this.checkMtpCamera(targetDir);
        if (mtpResult && mtpResult.found) {
          isCameraActive = true;
          cameraName = mtpResult.cameraName ? `Kamera ${mtpResult.cameraName}` : 'Kamera MTP';
        }
      }

      // Also check if mass storage drive is detected
      if (!isCameraActive && this.cableConfig.detectedDrive && fs.existsSync(this.cableConfig.detectedDrive)) {
        isCameraActive = true;
        cameraName = this.cableConfig.connectedCamera || 'Kamera USB Direct';
      }

      // Also check if WiFi Ingest Server is running
      if (!isCameraActive && this.wifiConfig.running) {
        isCameraActive = true;
        cameraName = 'Kamera WiFi Wireless Ingest';
      }

      // IF CAMERA IS NOT CONNECTED OR CAMERA IS OFF -> FAIL IMMEDIATELY!
      if (!isCameraActive) {
        this.log('WARN', '❌ Tes Shutter GAGAL: Kamera tidak terhubung / Kamera dalam posisi MATI.');
        return {
          success: false,
          error: 'Kamera tidak terhubung atau dalam posisi MATI. Colokkan kabel USB & pastikan kamera menyala (ON).'
        };
      }

      // 2. Camera IS active -> Sync photos from camera right now
      if (mtpResult && mtpResult.copiedCount > 0 && Array.isArray(mtpResult.copiedFiles) && mtpResult.copiedFiles.length > 0) {
        // Sync newly shot photos
        const latestFile = mtpResult.copiedFiles[mtpResult.copiedFiles.length - 1];
        const fullPath = path.join(targetDir, latestFile);
        const stats = fs.statSync(fullPath);
        const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

        this.onLiveShutterReceived(fullPath, 'Kabel USB Direct', cameraName);
        this.log('SUCCESS', `📸 TES SHUTTER REAL BERHASIL! Foto jepretan baru [${latestFile}] (${sizeMb} MB) dari ${cameraName} disinkronkan & masuk antrean!`);

        return {
          success: true,
          isRealPhoto: true,
          filename: latestFile,
          filePath: fullPath,
          sizeMb,
          cameraName
        };
      }

      // 3. Camera is connected & ON, but no NEW photo was taken right now
      this.log('WARN', `⚠️ Tes Shutter: Kamera "${cameraName}" AKTIF & Terhubung, namun belum ada jepretan foto baru.`);
      return {
        success: false,
        warning: true,
        error: `Kamera (${cameraName}) terhubung & AKTIF, namun belum ada jepretan foto baru. Silakan jepret foto baru pada kamera Anda.`
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

  destroy() {
    if (this.cableInterval) clearInterval(this.cableInterval);
    if (this.wifiServer) this.wifiServer.close();
  }
}

module.exports = LiveShutterEngine;
