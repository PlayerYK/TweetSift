// src/popup/popup.js
// TweetSift Popup 页面逻辑

const REQUIRED_OPS = [
  'DeleteBookmark',
  'createBookmarkFolder',
  'bookmarkTweetToFolder',
  'BookmarkFoldersSlice',
];

// ── 初始化 ──
document.addEventListener('DOMContentLoaded', async () => {
  await loadEnabledState();
  await loadStats();
  await loadHashStatus();
  setupToggle();
  setDate();
});

// ── 日期显示 ──
function setDate() {
  const el = document.getElementById('statsDate');
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  el.textContent = `📅 ${y}-${m}-${d}`;
}

// ── 启用/禁用开关 ──
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
    status.textContent = '已启用';
    status.style.color = '#1d9bf0';
  } else {
    btn.classList.remove('active');
    btn.setAttribute('aria-checked', 'false');
    status.textContent = '已禁用';
    status.style.color = '#71767b';
  }
}

// ── 统计数据 ──
async function loadStats() {
  const stats = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
  document.getElementById('statVideo').textContent = stats?.today?.video || 0;
  document.getElementById('statNano').textContent = stats?.today?.nano || 0;
  document.getElementById('statImage').textContent = stats?.today?.image || 0;
}

// ── API Hash 状态 ──
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

  // 更新提示文字
  const hintEl = document.querySelector('.api-hint');
  if (missingCount === 0) {
    hintEl.textContent = '全部就绪';
    hintEl.style.color = '#00ba7c';
  } else {
    hintEl.textContent = `${missingCount} 个待捕获 — 在 Twitter 上执行一次收藏/撤销或打开书签页即可`;
    hintEl.style.color = '#f4212e';
  }
}
