const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const chokidar = require('chokidar');
const axios = require('axios');
const FormData = require('form-data');

class UploaderEngine {
  constructor(app, store, sendToRenderer) {
    this.app = app;
    this.store = store;
    this.sendToRenderer = sendToRenderer;

    this.watcher = null;
    this.isWatching = false;

    // Queue & Execution state
    this.queue = [];             // Array of file path strings
    this.activeUploads = 0;
    this.concurrency = this.store.get('concurrency', 2);

    // Stats
    this.stats = {
      queued: 0,
      uploaded: 0,
      failed: 0,
      retrying: 0
    };

    // History Persistence File
    this.historyFilePath = path.join(this.app.getPath('userData'), 'uploaded_history.json');
    this.uploadedRegistry = this.loadHistory();

    // Cache of queue item statuses for UI rendering
    this.queueItemsMap = new Map(); // path -> { filePath, filename, size, status, retries, error, timestamp }
  }

  loadHistory() {
    try {
      if (fs.existsSync(this.historyFilePath)) {
        const raw = fs.readFileSync(this.historyFilePath, 'utf8');
        const data = JSON.parse(raw);
        return new Set(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load upload history:', err);
    }
    return new Set();
  }

  saveHistory() {
    try {
      const data = Array.from(this.uploadedRegistry);
      fs.writeFileSync(this.historyFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save upload history:', err);
    }
  }

  clearHistory() {
    this.uploadedRegistry.clear();
    this.queueItemsMap.clear();
    this.queue = [];
    this.stats = { queued: 0, uploaded: 0, failed: 0, retrying: 0 };
    this.saveHistory();
    this.log('INFO', 'Upload history and queue cleared successfully.');
    this.updateUI();
  }

  retryFailed() {
    let count = 0;
    for (const [filePath, item] of this.queueItemsMap.entries()) {
      if (item.status === 'failed') {
        item.status = 'pending';
        item.error = null;
        item.retries = 0;
        if (!this.queue.includes(filePath)) {
          this.queue.push(filePath);
        }
        count++;
      }
    }

    if (count > 0) {
      this.stats.failed = Math.max(0, this.stats.failed - count);
      this.log('INFO', `Re-queued ${count} failed file(s) for automatic upload retry.`);
      this.updateUI();
      if (this.isWatching) {
        this.processQueue();
      }
    } else {
      this.log('INFO', 'No failed items found to retry.');
    }
  }

  log(type, message, details = null) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    const logEntry = { timestamp, type, message, details };
    this.sendToRenderer('log:add', logEntry);
    console.log(`[${timestamp}] [${type}] ${message}`, details || '');
  }

  checkAndResetDailyQuota() {
    const todayStr = new Date().toISOString().split('T')[0];
    const lastReset = this.store.get('lastTrialResetDate', '');

    if (lastReset !== todayStr) {
      this.store.set('trialUploadCount', 0);
      this.store.set('lastTrialResetDate', todayStr);
      this.log('INFO', `📅 Kuota Harian Trial (30 foto) di-reset otomatis untuk hari baru (${todayStr}).`);
      return true;
    }
    return false;
  }

  updateUI() {
    this.checkAndResetDailyQuota();

    const queueList = Array.from(this.queueItemsMap.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100); // Send top 100 recent items

    const tier = this.store.get('licenseTier', 'free');
    const trialUploadCount = this.store.get('trialUploadCount', 0);
    const dailyLimit = this.store.get('dailyLimit', 20);

    this.sendToRenderer('status:update', {
      isWatching: this.isWatching,
      stats: {
        ...this.stats,
        queued: this.queue.length,
        historyTotal: this.uploadedRegistry.size
      },
      queue: queueList,
      license: {
        tier,
        trialUploadCount,
        dailyLimit,
        trialLimit: dailyLimit,
        isPro: tier === 'pro',
        isPremium: tier === 'premium',
        isFree: tier === 'free' || tier === 'trial',
        licenseKey: this.store.get('licenseKey', ''),
        remainingDays: this.store.get('licenseRemainingDays', ''),
        lastResetDate: this.store.get('lastTrialResetDate', '')
      }
    });
  }


  setConcurrency(value) {
    this.concurrency = Math.max(1, Math.min(10, parseInt(value, 10) || 2));
    this.store.set('concurrency', this.concurrency);
    this.log('INFO', `Upload concurrency set to ${this.concurrency}`);
    if (this.isWatching) {
      this.processQueue();
    }
  }

  startWatcher(watchDir) {
    if (this.isWatching) {
      this.stopWatcher();
    }

    if (!watchDir || !fs.existsSync(watchDir)) {
      this.log('ERROR', `Target watch directory does not exist: "${watchDir}"`);
      return false;
    }

    this.log('INFO', `Initializing folder watcher on: "${watchDir}"`);

    // 1. Immediately scan existing files in directory to queue existing photos instantly
    try {
      const scanFiles = (dir) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.startsWith('.')) continue; // skip hidden dotfiles
          const fullPath = path.join(dir, file);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              scanFiles(fullPath);
            } else {
              this.onFileDiscovered(fullPath);
            }
          } catch (e) {}
        }
      };
      scanFiles(watchDir);
    } catch (scanErr) {
      console.error('Initial directory scan error:', scanErr);
    }

    // 2. Using Chokidar with polling for 100% cross-platform compatibility (macOS fsevents permission bypass)
    this.watcher = chokidar.watch(watchDir, {
      persistent: true,
      usePolling: true,
      interval: 800,
      binaryInterval: 1000,
      ignored: [
        /(^|[\/\\])\../,     // dotfiles
        /\.tmp$/i,            // temp files
        /\.part$/i,           // partial FTP files
        /\.crdownload$/i      // chrome downloads
      ],
      ignoreInitial: true,    // initial files already handled by scanFiles
      awaitWriteFinish: {
        stabilityThreshold: 1500, // wait until size doesn't change for 1.5s
        pollInterval: 500         // check size every 500ms
      },
      depth: 10
    });

    this.watcher.on('add', (filePath) => this.onFileDiscovered(filePath));
    this.watcher.on('error', (err) => {
      this.log('ERROR', `Watcher error: ${err.message}`);
    });

    this.isWatching = true;
    this.log('SUCCESS', `Watcher started. Monitoring JPEG/PNG files in "${path.basename(watchDir)}".`);
    this.updateUI();
    this.processQueue();
    return true;
  }

  stopWatcher() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.isWatching = false;
    this.log('WARN', 'Watcher stopped. Automatic file discovery & queue paused.');
    this.updateUI();
  }

  clearCompletedQueue() {
    let clearedCount = 0;
    for (const [filePath, item] of this.queueItemsMap.entries()) {
      if (item.status === 'uploaded') {
        this.queueItemsMap.delete(filePath);
        clearedCount++;
      }
    }
    this.log('INFO', `🧹 Membersihkan ${clearedCount} foto terupload dari tampilan memori antrean.`);
    this.updateUI();
    return { success: true, clearedCount };
  }

  onFileDiscovered(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      return; // Skip non-image files
    }

    // Check if already uploaded
    if (this.uploadedRegistry.has(filePath)) {
      return;
    }

    // Check if already in active queue or currently uploading
    const existing = this.queueItemsMap.get(filePath);
    if (this.queue.includes(filePath) || existing?.status === 'uploading' || existing?.status === 'uploaded') {
      return;
    }

    let stats = { size: 0 };
    try {
      stats = fs.statSync(filePath);
    } catch (e) {
      return;
    }

    const item = {
      filePath,
      filename: path.basename(filePath),
      size: stats.size,
      status: 'pending', // pending, uploading, uploaded, failed
      retries: 0,
      error: null,
      timestamp: Date.now()
    };

    this.queueItemsMap.set(filePath, item);
    this.queue.push(filePath);
    this.log('INFO', `Discovered file queued: ${item.filename} (${(item.size / 1024 / 1024).toFixed(2)} MB)`);

    this.updateUI();
    if (this.isWatching) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (!this.isWatching) {
      return; // Stop queue execution immediately if watcher is stopped
    }

    while (this.isWatching && this.activeUploads < this.concurrency && this.queue.length > 0) {
      // Check Daily Quota Limit
      const licenseTier = this.store.get('licenseTier', 'free');
      const trialUploadCount = this.store.get('trialUploadCount', 0);
      let dailyLimit = 20;
      if (licenseTier === 'premium') dailyLimit = 500;
      else if (licenseTier === 'pro') dailyLimit = 0;
      else dailyLimit = this.store.get('dailyLimit', 20);

      if (dailyLimit > 0 && trialUploadCount >= dailyLimit) {
        const planName = licenseTier === 'premium' ? 'PREMIUM (500 Foto/Hari)' : 'FREE PLAN (20 Foto/Hari)';
        this.log('WARN', `[KUOTA HABIS] Kuota Harian ${planName} telah tercapai (${trialUploadCount}/${dailyLimit}). Pengunggahan dihentikan.`);
        this.sendToRenderer('license:quotaExceeded', { trialUploadCount, trialLimit: dailyLimit, planName });
        this.stopWatcher();
        break;
      }

      const filePath = this.queue.shift();
      const item = this.queueItemsMap.get(filePath);

      if (!item) continue;

      if (!fs.existsSync(filePath)) {
        this.log('WARN', `File no longer exists, skipping: ${item.filename}`);
        this.queueItemsMap.delete(filePath);
        this.updateUI();
        continue;
      }

      this.activeUploads++;
      item.status = 'uploading';
      this.updateUI();

      // Execute upload asynchronously
      this.uploadFileWithRetry(item)
        .then(() => {
          this.activeUploads--;
          this.stats.uploaded++;
          this.uploadedRegistry.add(filePath);
          this.saveHistory();

          // Increment daily upload counter
          const currentCount = this.store.get('trialUploadCount', 0) + 1;
          this.store.set('trialUploadCount', currentCount);

          item.status = 'uploaded';
          this.log('SUCCESS', `Successfully uploaded & registered: ${item.filename}`);
          this.updateUI();
          if (this.isWatching) {
            this.processQueue();
          }
        })
        .catch((err) => {
          this.activeUploads--;
          const isDup = err.message && (
            err.message.toLowerCase().includes('duplicate') ||
            err.message.toLowerCase().includes('reupload') ||
            err.message.toLowerCase().includes('sudah pernah diunggah') ||
            err.message.toLowerCase().includes('exist')
          );

          if (isDup) {
            item.status = 'skipped';
            item.error = 'Duplikat (Sudah ada di Fotoyu)';
            this.uploadedRegistry.add(filePath);
            this.saveHistory();
            this.log('WARN', `⏩ Skipping ${item.filename}: Foto sudah pernah diunggah ke Fotoyu.`);
          } else {
            this.stats.failed++;
            item.status = 'failed';
            item.error = err.message;
            this.log('ERROR', `Failed to upload ${item.filename}: ${err.message}`);
          }
          this.updateUI();
          if (this.isWatching) {
            this.processQueue();
          }
        });
    }
  }

  async uploadFileWithRetry(item, maxRetries = 3) {
    const apiEndpoint = this.store.get('apiEndpoint', '');
    const authToken = this.store.get('authToken', '');
    const eventId = this.store.get('eventId', '');

    // Check Daily Quota Limit (Free: 20/day, Premium: 500/day, Pro: Unlimited)
    const licenseTier = this.store.get('licenseTier', 'free');
    const trialUploadCount = this.store.get('trialUploadCount', 0);
    
    let dailyLimit = 20;
    if (licenseTier === 'premium') dailyLimit = 500;
    else if (licenseTier === 'pro') dailyLimit = 0;
    else dailyLimit = this.store.get('dailyLimit', 20);

    if (dailyLimit > 0 && trialUploadCount >= dailyLimit) {
      const planName = licenseTier === 'premium' ? 'PREMIUM (500 Foto/Hari)' : 'FREE PLAN (20 Foto/Hari)';
      this.sendToRenderer('license:quotaExceeded', { trialUploadCount, trialLimit: dailyLimit, planName });
      throw new Error(`Batas Kuota Harian ${planName} telah tercapai (${trialUploadCount}/${dailyLimit}). Upgrade ke PRO Plan untuk mengunggah tanpa batas.`);
    }

    if (!apiEndpoint) {
      throw new Error('API Endpoint is not configured in Settings.');
    }

    if (!authToken) {
      throw new Error('Authorization Token is empty. Please click "Login Fotoyu" to authenticate.');
    }

    let attempt = 0;

    while (attempt <= maxRetries) {
      if (!this.isWatching) {
        throw new Error('Upload cancelled by user (Watcher Stopped).');
      }

      try {
        if (attempt > 0) {
          item.retries = attempt;
          this.stats.retrying++;
          const backoffDelay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 1s, 2s, 4s...
          this.log('WARN', `Retrying ${item.filename} (Attempt ${attempt}/${maxRetries}) after ${backoffDelay}ms...`);
          this.updateUI();
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        }

        const res = await this.executeUploadRequest(item.filePath, apiEndpoint, authToken, eventId);
        return res; // Success!

      } catch (error) {
        attempt++;

        // Check HTTP response status code for fatal authentication or client errors
        if (error.response) {
          const status = error.response.status;
          const serverMsg = error.response.data?.message || error.response.statusText;
          
          if (status === 401 || status === 403) {
            this.log('ERROR', `Auth Error [HTTP ${status}] for ${item.filename}: Token Kedaluwarsa / Tidak Valid. Silakan Login Ulang.`);
            throw new Error(`HTTP ${status}: Token Kedaluwarsa/Tidak Valid. Klik "Login Fotoyu".`);
          }

          if (status >= 400 && status < 500) {
            this.log('ERROR', `Permanent Client Error [HTTP ${status}] for ${item.filename}: ${serverMsg}`);
            throw new Error(`HTTP ${status}: ${serverMsg} (Fatal client error - no retry)`);
          }
        }

        if (error.message && (
          error.message.includes('Token Kedaluwarsa') ||
          error.message.includes('401') ||
          error.message.includes('403') ||
          error.message.includes('cancelled') ||
          error.message.includes('Kuota Trial') ||
          error.message.toLowerCase().includes('duplicate') ||
          error.message.toLowerCase().includes('reupload') ||
          error.message.toLowerCase().includes('sudah pernah diunggah') ||
          error.message.toLowerCase().includes('exist')
        )) {
          throw error; // Immediate fail/skip without looping 3x retries
        }

        if (attempt > maxRetries) {
          throw new Error(`Max retries (${maxRetries}) reached. Final error: ${error.message}`);
        }
      }
    }
  }

  async executeUploadRequest(filePath, apiEndpoint, authToken, eventId) {
    const fileBuffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    const fileStats = fs.statSync(filePath);
    const rawExt = path.extname(filePath).replace('.', '').toLowerCase();
    const extension = rawExt === 'jpg' ? 'jpeg' : (rawExt || 'jpeg');

    // Load User Configured Metadata
    const price = parseInt(this.store.get('price', 0), 10) || 0;
    const description = this.store.get('description', 'Uploaded via Fotoyu Auto-Uploader Pro');
    const locationName = this.store.get('locationName', 'lat: 3.583200 lng: 98.627400');
    const latitude = parseFloat(this.store.get('latitude', 3.5832)) || 3.5832;
    const longitude = parseFloat(this.store.get('longitude', 98.6274)) || 98.6274;
    const userNicknamesRaw = this.store.get('userNicknames', '');
    const nicknameArray = userNicknamesRaw ? userNicknamesRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

    const locationString = JSON.stringify({
      name: locationName,
      latitude: latitude,
      longitude: longitude
    });

    // MD5 checksum calculation
    const md5Signature = crypto.createHash('md5').update(fileBuffer).digest('hex');
    const authHeader = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;

    const headers = {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Origin': 'https://www.fotoyu.com',
      'Referer': 'https://www.fotoyu.com/'
    };

    // Detect Fotoyu AWS S3 3-step API flow vs direct multipart endpoint
    if (apiEndpoint.includes('fotoyu.com')) {
      // STEP 1: Request AWS S3 Pre-signed URL from /gs/v3/creations/link
      this.log('INFO', `Step 1/3: Requesting S3 presigned link for ${filename}...`);
      let linkRes;
      try {
        linkRes = await axios.post(
          'https://api.fotoyu.com/gs/v3/creations/link',
          {
            contents: [
              {
                height: 1,
                width: 1,
                size: fileStats.size,
                extension: extension,
                file: {},
                signature: md5Signature
              }
            ]
          },
          { headers, timeout: 20000 }
        );
      } catch (err) {
        if (err.response) {
          const status = err.response.status;
          const msg = err.response.data?.message || JSON.stringify(err.response.data);
          this.log('ERROR', `Step 1 Request Error [HTTP ${status}]: ${msg}`);
          if (status === 401 || status === 403) {
            throw new Error(`Token Kedaluwarsa / Tidak Valid [HTTP ${status}]. Silakan klik "Login Fotoyu".`);
          }
          throw new Error(`Step 1 Gagal [HTTP ${status}]: ${msg}`);
        }
        throw err;
      }

      const contentObj = linkRes.data?.result?.[0];

      // Check if Fotoyu rejected duplicate photo signature
      if (contentObj && contentObj.error) {
        const errStr = String(contentObj.error);
        if (errStr.includes('reupload') || errStr.includes('exist') || errStr.includes('duplicate')) {
          this.log('WARN', `Fotoyu Server Reject: Foto ${filename} sudah terdaftar sebelumnya di Fotoyu (${errStr}).`);
          throw new Error(`Foto ini sudah pernah diunggah sebelumnya ke Fotoyu (Duplicate Signature: ${errStr})`);
        }
        this.log('ERROR', `Step 1 Content Error for ${filename}: ${errStr}`);
        throw new Error(`Fotoyu Content Error: ${errStr}`);
      }

      if (!contentObj || !contentObj.original_link || !contentObj.upload_key) {
        const fullServerResp = JSON.stringify(linkRes.data);
        this.log('ERROR', `Step 1 Response Missing Links: ${fullServerResp}`);
        throw new Error(`Fotoyu S3 Link Missing: ${fullServerResp}`);
      }

      const presignedUrl = contentObj.original_link;
      const uploadKey = contentObj.upload_key;

      // STEP 2: Upload raw image binary to AWS S3
      this.log('INFO', `Step 2/3: Uploading binary to AWS S3 for ${filename}...`);
      try {
        await axios.put(presignedUrl, fileBuffer, {
          headers: {
            'Content-Type': `image/${extension}`,
            'x-amz-meta-imagewidth': '1',
            'x-amz-meta-imageheight': '1'
          },
          timeout: 90000
        });
      } catch (err) {
        if (err.response) {
          this.log('ERROR', `Step 2 AWS S3 Error [HTTP ${err.response.status}]`);
        }
        throw err;
      }

      // STEP 3: Register Creation metadata to Fotoyu API via /gs/v4/creations
      this.log('INFO', `Step 3/3: Registering photo metadata to Fotoyu API for ${filename}...`);
      let creationRes;
      try {
        creationRes = await axios.post(
          'https://api.fotoyu.com/gs/v4/creations',
          {
            currency_id: "MR9Xdjv70WpeODE8DEPLAyb8xVBQzq31",
            location: locationString,
            original_at: new Date(fileStats.mtime || Date.now()).toISOString(),
            unix_original_at: Math.floor((fileStats.mtimeMs || Date.now()) / 1000),
            description: description,
            is_bibs: [],
            nickname: nicknameArray,
            price: price,
            resend: true,
            tag_ids: eventId && eventId.trim().length > 3 ? [eventId.trim()] : [],
            contents: [
              {
                title: filename,
                content: presignedUrl,
                height: 1,
                width: 1,
                size: fileStats.size,
                signature: md5Signature,
                upload_key: uploadKey
              }
            ]
          },
          { headers, timeout: 20000 }
        );
      } catch (err) {
        if (err.response) {
          const status = err.response.status;
          const detailMsg = err.response.data?.detail ? JSON.stringify(err.response.data.detail) : (err.response.data?.message || JSON.stringify(err.response.data));
          this.log('ERROR', `Step 3 Registration Error [HTTP ${status}]: ${detailMsg}`);
          throw new Error(`Step 3 Metadata Failed [HTTP ${status}]: ${detailMsg}`);
        }
        throw err;
      }

      return creationRes.data;

    } else {
      // Fallback: Direct Multipart HTTP Form-Data Upload
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath), filename);
      if (eventId) form.append('event_id', eventId);
      form.append('price', price);
      form.append('description', description);
      form.append('location', locationString);

      const res = await axios.post(apiEndpoint, form, {
        headers: {
          ...form.getHeaders(),
          'Authorization': authHeader
        },
        timeout: 60000
      });

      return res.data;
    }
  }
}

module.exports = UploaderEngine;
