const { app, shell } = require('electron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class AutoUpdater {
  constructor(store, sendToRenderer) {
    this.store = store;
    this.sendToRenderer = sendToRenderer;
    this.currentVersion = app.getVersion() || '1.0.0';
    this.remoteVersionUrl = 'https://ghazabegins.id/fotosync/api/version.php';
    this.localVersionUrl = 'http://localhost/photoculler/SOFTWARE%20FOTOYU%20UPLOADER/server/api/version.php';
    this.downloading = false;
    this.downloadedFilePath = null;
  }

  // Compare semver strings (e.g. "1.0.1" > "1.0.0")
  isNewerVersion(serverVer, currentVer) {
    const parse = (v) => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const s = parse(serverVer);
    const c = parse(currentVer);

    for (let i = 0; i < Math.max(s.length, c.length); i++) {
      const sv = s[i] || 0;
      const cv = c[i] || 0;
      if (sv > cv) return true;
      if (sv < cv) return false;
    }
    return false;
  }

  async checkForUpdates() {
    try {
      let response = null;
      const cacheBust = `?t=${Date.now()}`;

      try {
        response = await axios.get(`${this.remoteVersionUrl}${cacheBust}`, { timeout: 4000 });
      } catch (remoteErr) {
        response = await axios.get(`${this.localVersionUrl}${cacheBust}`, { timeout: 3000 });
      }

      if (response && response.data && response.data.success) {
        const info = response.data;
        const hasUpdate = this.isNewerVersion(info.latest_version, this.currentVersion);

        console.log(`[AutoUpdater] Current App Version: v${this.currentVersion} | Server Latest: v${info.latest_version} | HasUpdate: ${hasUpdate}`);

        if (hasUpdate) {
          // Detect Operating System to pick appropriate download URL
          const isMac = process.platform === 'darwin';
          const downloadUrl = isMac 
            ? (info.mac_download_url || info.download_url)
            : (info.windows_download_url || info.download_url);

          console.log(`[AutoUpdater] 🚀 Update v${info.latest_version} available for ${isMac ? 'macOS' : 'Windows'}! URL: ${downloadUrl}`);
          
          this.sendToRenderer('updater:available', {
            currentVersion: this.currentVersion,
            latestVersion: info.latest_version,
            releaseNotes: info.release_notes,
            isMandatory: info.is_mandatory || false,
            downloadUrl: downloadUrl
          });
          return { hasUpdate: true, info, downloadUrl };
        } else {
          console.log(`[AutoUpdater] App is up to date (v${this.currentVersion}). Hiding update indicators.`);
          this.sendToRenderer('updater:notAvailable', {
            currentVersion: this.currentVersion
          });
        }
      }
      return { hasUpdate: false };
    } catch (err) {
      console.error('[AutoUpdater] Failed to check for updates:', err.message);
      return { hasUpdate: false, error: err.message };
    }
  }

  async downloadUpdate(downloadUrl) {
    if (this.downloading) return;
    this.downloading = true;

    try {
      const targetDir = app.getPath('temp');
      const isMac = process.platform === 'darwin';
      const ext = isMac ? 'dmg' : 'exe';
      const fileName = `FotoSync-Setup-${Date.now()}.${ext}`;
      const filePath = path.join(targetDir, fileName);

      const response = await axios({
        url: downloadUrl,
        method: 'GET',
        responseType: 'stream',
        timeout: 30000
      });

      const totalLength = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedLength = 0;

      const writer = fs.createWriteStream(filePath);

      response.data.on('data', (chunk) => {
        downloadedLength += chunk.length;
        if (totalLength > 0) {
          const progressPct = Math.round((downloadedLength / totalLength) * 100);
          this.sendToRenderer('updater:progress', { progressPct, downloadedLength, totalLength });
        }
      });

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          this.downloading = false;
          this.downloadedFilePath = filePath;
          this.sendToRenderer('updater:downloaded', { filePath });
          resolve({ success: true, filePath });
        });

        writer.on('error', (err) => {
          this.downloading = false;
          reject(err);
        });

        response.data.pipe(writer);
      });
    } catch (err) {
      this.downloading = false;
      this.sendToRenderer('updater:error', { message: err.message });
      throw err;
    }
  }

  installUpdate() {
    if (!this.downloadedFilePath || !fs.existsSync(this.downloadedFilePath)) {
      throw new Error('File installer update tidak ditemukan.');
    }

    const isMac = process.platform === 'darwin';

    if (isMac) {
      // On macOS, open .dmg or installer package
      shell.openPath(this.downloadedFilePath);
      app.quit();
    } else {
      // On Windows, launch installer silently/detached and quit app
      spawn(this.downloadedFilePath, [], {
        detached: true,
        stdio: 'ignore'
      }).unref();
      app.quit();
    }
  }
}

module.exports = AutoUpdater;
