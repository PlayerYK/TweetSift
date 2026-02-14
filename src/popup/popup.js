// src/popup/popup.js
// TweetSift Popup logic

const REQUIRED_OPS = [
  'DeleteBookmark',
  'createBookmarkFolder',
  'bookmarkTweetToFolder',
  'BookmarkFoldersSlice',
];

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  await loadEnabledState();
  await loadStats();
  await loadHashStatus();
  setupToggle();
  setupTitleLink();
  setDate();
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
