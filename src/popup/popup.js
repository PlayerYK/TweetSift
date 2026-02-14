// src/popup/popup.js
// TweetSift Popup logic

const REQUIRED_OPS = [
  'DeleteBookmark',
  'createBookmarkFolder',
  'bookmarkTweetToFolder',
  'BookmarkFoldersSlice',
  'BookmarkFolderTimeline',
];

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  await loadEnabledState();
  await loadStats();
  await loadHashStatus();
  setupToggle();
  setupTitleLink();
  setDate();
  setupExport();
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
  listEl.innerHTML = '';

  let missingCount = 0;

  for (const op of REQUIRED_OPS) {
    const hash = hashes?.[op];
    const item = document.createElement('div');
    item.className = 'api-item';
    item.innerHTML = `
      <span class="api-dot ${hash ? 'ok' : 'missing'}"></span>
      <span>${op}</span>
    `;
    listEl.appendChild(item);
    if (!hash) missingCount++;
  }

  // Update hint text
  const hintEl = document.querySelector('.api-hint');
  if (missingCount === 0) {
    hintEl.textContent = 'All ready';
    hintEl.style.color = '#00ba7c';
  } else {
    hintEl.textContent = `${missingCount} pending — bookmark/unbookmark a tweet or open Bookmarks page on Twitter`;
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
  document.getElementById('selectAllFolders').addEventListener('change', handleSelectAll);

  // Check if an export is already running (popup was reopened)
  checkExportStatus();
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
  const actionsEl = document.getElementById('exportActions');
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
      actionsEl.style.display = 'none';
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
    actionsEl.style.display = 'flex';
    exportBtn.style.display = 'inline-flex';
    document.getElementById('selectAllFolders').checked = false;

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

function handleSelectAll(e) {
  const checked = e.target.checked;
  const checkboxes = document.querySelectorAll('#folderList input[type="checkbox"]');
  checkboxes.forEach(cb => { cb.checked = checked; });
  updateExportBtnState();
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
          downloadJson(r.tweets, r.folderName, r.tweets.length);
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
    progressFill.style.width = '100%';
    progressText.textContent = 'Done!';
    hint.textContent = `Exported ${totalTweets} tweet(s) from ${successCount} folder(s)`;
    hint.className = 'export-hint success';
  }

  setTimeout(() => {
    document.getElementById('exportProgress').style.display = 'none';
  }, 3000);

  // Clear background state
  chrome.runtime.sendMessage({ type: 'EXPORT_CLEAR' });
}

function downloadJson(tweets, folderName, count) {
  const json = JSON.stringify(tweets, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const safeName = folderName.replace(/[\\/:*?"<>|]/g, '_');
  const filename = `${safeName}-${count}-${ts}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
