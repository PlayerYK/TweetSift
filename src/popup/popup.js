// src/popup/popup.js
// TweetSift Popup logic

// Operations needed for extension to work
const CORE_OPS = [
  'bookmarkTweetToFolder',        // Essential: add tweet to folder
  'createBookmarkFolder',         // Essential: create new folder
  'BookmarkFoldersSlice',         // Essential: list folders
];

const OPTIONAL_OPS = [
  'CreateBookmark',               // Optional: can use native button
  'DeleteBookmark',               // Optional: can use native button
  'RemoveTweetFromBookmarkFolder', // Optional: only for undo feature
  'BookmarkFolderTimeline',       // Optional: only for export feature
];

const REQUIRED_OPS = [...CORE_OPS, ...OPTIONAL_OPS];
const EXPORT_DEBUG_KEY = 'exportDebugCapture';

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  await loadEnabledState();
  await loadStats();
  await loadHashStatus();
  await loadExportDebugState();
  setupToggle();
  setupTitleLink();
  setDate();
  setupExport();
  setupDiagnostics();
});

// ── Title link: open x.com ──
function setupTitleLink() {
  const header = document.querySelector('.header');
  header.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://x.com' });
  });
}

// ── Date display ──
function setDate() {
  const el = document.getElementById('statsDate');
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  el.textContent = `📅 ${y}-${m}-${d}`;
}

// ── Enable/Disable toggle ──
async function loadEnabledState() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_ENABLED' });
  const enabled = response?.enabled !== false;
  updateToggleUI(enabled);
}

function setupToggle() {
  const btn = document.getElementById('enableToggle');
  btn.addEventListener('click', async () => {
    const isActive = btn.classList.contains('active');
    const newState = !isActive;

    updateToggleUI(newState);
    await chrome.runtime.sendMessage({ type: 'SET_ENABLED', enabled: newState });
  });
}

function updateToggleUI(enabled) {
  const btn = document.getElementById('enableToggle');
  const status = document.getElementById('toggleStatus');

  if (enabled) {
    btn.classList.add('active');
    btn.setAttribute('aria-checked', 'true');
    status.textContent = 'Enabled';
    status.style.color = '#1d9bf0';
  } else {
    btn.classList.remove('active');
    btn.setAttribute('aria-checked', 'false');
    status.textContent = 'Disabled';
    status.style.color = '#71767b';
  }
}

// ── Stats ──
async function loadStats() {
  const stats = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
  document.getElementById('statVideo').textContent = stats?.today?.video || 0;
  document.getElementById('statNano').textContent = stats?.today?.nano || 0;
  document.getElementById('statImage').textContent = stats?.today?.image || 0;
}

// ── API Hash Status ──
async function loadHashStatus() {
  const hashes = await chrome.runtime.sendMessage({ type: 'GET_HASH_STATUS' });
  const listEl = document.getElementById('apiList');
  const statusMsg = document.getElementById('apiStatusMessage');
  listEl.innerHTML = '';

  let missingCore = 0;
  let missingOptional = 0;

  // Core operations
  for (const op of CORE_OPS) {
    const hash = hashes?.[op];
    const item = document.createElement('div');
    item.className = 'api-item';
    item.innerHTML = `
      <span class="api-dot ${hash ? 'ok' : 'missing'}"></span>
      <span class="api-name">${op}</span>
      <span class="api-badge core">Core</span>
      <span class="api-hash">${hash ? hash.slice(0, 8) + '...' : 'Not captured'}</span>
    `;
    listEl.appendChild(item);
    if (!hash) missingCore++;
  }

  // Optional operations
  for (const op of OPTIONAL_OPS) {
    const hash = hashes?.[op];
    const item = document.createElement('div');
    item.className = 'api-item';
    item.innerHTML = `
      <span class="api-dot ${hash ? 'ok' : 'missing'}"></span>
      <span class="api-name">${op}</span>
      <span class="api-badge optional">Optional</span>
      <span class="api-hash">${hash ? hash.slice(0, 8) + '...' : 'Not captured'}</span>
    `;
    listEl.appendChild(item);
    if (!hash) missingOptional++;
  }

  // Update status message
  if (missingCore === 0 && missingOptional === 0) {
    statusMsg.textContent = '✅ All API hashes captured';
    statusMsg.className = 'api-status-message success';
  } else if (missingCore === 0) {
    statusMsg.textContent = `✅ Core hashes ready (${missingOptional} optional missing)`;
    statusMsg.className = 'api-status-message success';
  } else if (missingCore === CORE_OPS.length) {
    statusMsg.textContent = '❌ No core API hashes captured yet';
    statusMsg.className = 'api-status-message error';
  } else {
    statusMsg.textContent = `⚠️ Missing ${missingCore} core hash(es)`;
    statusMsg.className = 'api-status-message warning';
  }

  // Update hint text
  const hintEl = document.getElementById('apiHint');
  if (missingCore === 0) {
    if (missingOptional === 0) {
      hintEl.textContent = 'Extension is ready to use (all features available)';
    } else {
      hintEl.textContent = `Extension is ready (${missingOptional} optional features unavailable)`;
    }
    hintEl.style.color = '#00ba7c';
  } else {
    hintEl.textContent = `Click the ? button for instructions`;
    hintEl.style.color = '#f4212e';
  }
}

// ── Export Bookmarks ──
let loadedFolders = [];
let pollTimer = null;
let lastDownloadedIndex = -1;

function setupExport() {
  document.getElementById('loadFoldersBtn').addEventListener('click', handleLoadFolders);
  document.getElementById('exportJsonBtn').addEventListener('click', handleExportJson);
  document.getElementById('exportDebugToggle').addEventListener('change', handleExportDebugToggle);

  // Check if an export is already running (popup was reopened)
  checkExportStatus();
}

async function loadExportDebugState() {
  const result = await chrome.storage.local.get([EXPORT_DEBUG_KEY]);
  document.getElementById('exportDebugToggle').checked = !!result[EXPORT_DEBUG_KEY];
}

async function handleExportDebugToggle(e) {
  await chrome.storage.local.set({ [EXPORT_DEBUG_KEY]: !!e.target.checked });
}

async function checkExportStatus() {
  const status = await chrome.runtime.sendMessage({ type: 'EXPORT_STATUS' });
  if (status?.running || (status?.results && status.results.length > 0)) {
    showExportProgress(status);
    if (status.running) {
      startPolling();
    }
  }
}

async function handleLoadFolders() {
  const btn = document.getElementById('loadFoldersBtn');
  const hint = document.getElementById('exportHint');
  const folderListEl = document.getElementById('folderList');
  const exportBtn = document.getElementById('exportJsonBtn');

  btn.disabled = true;
  btn.textContent = 'Loading...';
  hint.textContent = '';
  hint.className = 'export-hint';

  try {
    const result = await chrome.runtime.sendMessage({ type: 'EXPORT_GET_FOLDERS' });

    if (!result?.success) {
      hint.textContent = result?.error || 'Failed to load folders';
      hint.className = 'export-hint error';
      return;
    }

    loadedFolders = result.folders || [];

    if (loadedFolders.length === 0) {
      hint.textContent = 'No bookmark folders found';
      hint.className = 'export-hint';
      folderListEl.style.display = 'none';
      document.getElementById('exportDebugRow').style.display = 'none';
      exportBtn.style.display = 'none';
      return;
    }

    // Render folder list
    folderListEl.innerHTML = '';
    for (const folder of loadedFolders) {
      const item = document.createElement('label');
      item.className = 'export-folder-item';
      item.innerHTML = `
        <input type="checkbox" value="${folder.id}" data-folder-name="${folder.name}">
        <span class="export-folder-name">${folder.name}</span>
      `;
      folderListEl.appendChild(item);
    }

    folderListEl.style.display = 'flex';
    document.getElementById('exportDebugRow').style.display = 'flex';
    exportBtn.style.display = 'inline-flex';

    // Update export button state on checkbox change
    folderListEl.addEventListener('change', updateExportBtnState);
    updateExportBtnState();

    hint.textContent = `${loadedFolders.length} folder(s) found`;
    hint.className = 'export-hint success';
  } catch (err) {
    hint.textContent = err.message;
    hint.className = 'export-hint error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Load Folders';
  }
}

function updateExportBtnState() {
  const checkboxes = document.querySelectorAll('#folderList input[type="checkbox"]:checked');
  const exportBtn = document.getElementById('exportJsonBtn');
  exportBtn.disabled = checkboxes.length === 0;
}

function getSelectedFolders() {
  const checkboxes = document.querySelectorAll('#folderList input[type="checkbox"]:checked');
  return Array.from(checkboxes).map(cb => ({
    id: cb.value,
    name: cb.dataset.folderName,
  }));
}

async function handleExportJson() {
  const selected = getSelectedFolders();
  if (selected.length === 0) return;

  lastDownloadedIndex = -1;

  // Tell background to start the export job
  const resp = await chrome.runtime.sendMessage({
    type: 'EXPORT_START',
    folders: selected,
    debugCapture: document.getElementById('exportDebugToggle').checked,
  });

  if (!resp?.success) {
    const hint = document.getElementById('exportHint');
    hint.textContent = resp?.error || 'Failed to start export';
    hint.className = 'export-hint error';
    return;
  }

  // Disable UI while running
  document.getElementById('exportJsonBtn').disabled = true;
  document.getElementById('exportJsonBtn').textContent = 'Exporting...';
  document.getElementById('loadFoldersBtn').disabled = true;

  startPolling();
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(pollExportStatus, 1500);
  pollExportStatus(); // immediate first poll
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollExportStatus() {
  try {
    const status = await chrome.runtime.sendMessage({ type: 'EXPORT_STATUS' });
    showExportProgress(status);

    // Download any new completed results
    if (status?.results) {
      for (let i = lastDownloadedIndex + 1; i < status.results.length; i++) {
        const r = status.results[i];
        if (r.success && r.tweets) {
          const timestamp = getExportTimestamp();
          downloadJson(r.tweets, r.folderName, r.tweets.length, timestamp);
          if (shouldDownloadDebug(r.debug)) {
            downloadDebugJson(r.debug, r.folderName, r.tweets.length, timestamp);
          }
          lastDownloadedIndex = i;
        } else if (!r.success) {
          lastDownloadedIndex = i; // skip failed ones
        }
      }
    }

    if (!status?.running) {
      stopPolling();
      onExportFinished(status);
    }
  } catch {
    // Extension context lost, stop polling
    stopPolling();
  }
}

function showExportProgress(status) {
  if (!status) return;

  const progressEl = document.getElementById('exportProgress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const hint = document.getElementById('exportHint');

  progressEl.style.display = 'flex';

  const total = status.totalFolders || 1;
  const completed = status.completedFolders || 0;
  const pct = Math.round((completed / total) * 100);
  progressFill.style.width = `${pct}%`;

  if (status.running) {
    const current = status.currentFolder || '';
    progressText.textContent = `${completed}/${total}: ${current}`;
    hint.textContent = status.phase === 'waiting' ? 'Waiting between requests...' : '';
    hint.className = 'export-hint';

    // Keep UI disabled
    document.getElementById('exportJsonBtn').disabled = true;
    document.getElementById('exportJsonBtn').textContent = 'Exporting...';
    document.getElementById('loadFoldersBtn').disabled = true;
  }
}

function onExportFinished(status) {
  const hint = document.getElementById('exportHint');
  const exportBtn = document.getElementById('exportJsonBtn');
  const loadBtn = document.getElementById('loadFoldersBtn');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');

  loadBtn.disabled = false;
  exportBtn.disabled = false;
  exportBtn.textContent = 'Export JSON';

  if (status?.error) {
    hint.textContent = status.error;
    hint.className = 'export-hint error';
  } else {
    const results = status?.results || [];
    const totalTweets = results.reduce((sum, r) => sum + (r.tweets?.length || 0), 0);
    const successCount = results.filter(r => r.success).length;
    const debugCount = results.reduce((sum, r) => sum + (r.debug?.missingAuthorCount || 0), 0);
    progressFill.style.width = '100%';
    progressText.textContent = 'Done!';
    hint.textContent = debugCount > 0
      ? `Exported ${totalTweets} tweet(s) from ${successCount} folder(s) · ${debugCount} missing-author record(s) captured`
      : `Exported ${totalTweets} tweet(s) from ${successCount} folder(s)`;
    hint.className = 'export-hint success';
  }

  setTimeout(() => {
    document.getElementById('exportProgress').style.display = 'none';
  }, 3000);

  // Clear background state
  chrome.runtime.sendMessage({ type: 'EXPORT_CLEAR' });
}

function downloadJson(tweets, folderName, count, timestamp = getExportTimestamp()) {
  const safeName = folderName.replace(/[\\/:*?"<>|]/g, '_');
  triggerJsonDownload(tweets, `${safeName}-${count}-${timestamp}.json`);
}

function downloadDebugJson(debug, folderName, count, timestamp = getExportTimestamp()) {
  const safeName = folderName.replace(/[\\/:*?"<>|]/g, '_');
  triggerJsonDownload(debug, `${safeName}-${count}-${timestamp}.debug.json`);
}

function shouldDownloadDebug(debug) {
  return !!(debug?.enabled && debug?.missingAuthorCount);
}

function getExportTimestamp() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
}

function triggerJsonDownload(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Diagnostics ──
function setupDiagnostics() {
  document.getElementById('helpBtn').addEventListener('click', showTroubleshooting);
  document.getElementById('closeTroubleshootingBtn').addEventListener('click', hideTroubleshooting);
  document.getElementById('clearHashBtn').addEventListener('click', handleClearHash);
}

function showTroubleshooting() {
  const panel = document.getElementById('troubleshootingPanel');
  panel.style.display = 'block';
  
  // Scroll to bottom
  setTimeout(() => {
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 100);
}

function hideTroubleshooting() {
  document.getElementById('troubleshootingPanel').style.display = 'none';
}

async function handleClearHash() {
  const btn = document.getElementById('clearHashBtn');
  
  if (!confirm('Clear all API hash cache?\n\nYou will need to manually perform Twitter actions again to recapture them.')) {
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'Clearing...';
  
  try {
    await chrome.storage.local.remove(['queryHashes']);
    
    // Show success
    const hint = document.getElementById('apiHint');
    hint.textContent = '✅ Cache cleared! Follow the troubleshooting guide to recapture hashes.';
    hint.style.color = '#00ba7c';
    hint.className = 'api-hint success';
    
    // Reload hash status
    setTimeout(async () => {
      await loadHashStatus();
      showTroubleshooting();
    }, 1000);
  } catch (err) {
    const hint = document.getElementById('apiHint');
    hint.textContent = '❌ Failed to clear cache: ' + err.message;
    hint.style.color = '#f4212e';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Clear Hash Cache';
  }
}
