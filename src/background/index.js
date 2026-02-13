// src/background/index.js
// TweetSift Background Service Worker
//
// 不直接调用 Twitter API（Service Worker 的 fetch 不带 cookie）。
// 职责：hash 管理、文件夹缓存、撤销栈、统计、启用/禁用。

import { startHashWatcher, getHashStatus, clearQueryHash } from './hash-watcher.js';
import { getFolderName } from './folders.js';

function getLocalDateKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const EMPTY_DAILY_STATS = { video: 0, nano: 0, image: 0 };

function normalizeStats(stats) {
  const today = getLocalDateKey();
  const total = Number(stats?.total) || 0;

  if (stats?.date !== today) {
    return {
      date: today,
      today: { ...EMPTY_DAILY_STATS },
      total,
    };
  }

  return {
    date: today,
    today: {
      video: Number(stats?.today?.video) || 0,
      nano: Number(stats?.today?.nano) || 0,
      image: Number(stats?.today?.image) || 0,
    },
    total,
  };
}

// ── 撤销操作栈 ──
const undoStack = [];
const MAX_UNDO = 10;

// ── 统计 ──
async function incrementStat(category) {
  const result = await chrome.storage.local.get(['stats']);
  const stats = normalizeStats(result.stats);
  const key = { 1: 'video', 2: 'nano', 3: 'image' }[category];
  if (key) stats.today[key] = (stats.today[key] || 0) + 1;
  stats.total = (stats.total || 0) + 1;
  await chrome.storage.local.set({ stats });
}

async function decrementStat(category) {
  const result = await chrome.storage.local.get(['stats']);
  const stats = normalizeStats(result.stats);
  const key = { 1: 'video', 2: 'nano', 3: 'image' }[category];
  if (key && stats.today[key] > 0) stats.today[key]--;
  if (stats.total > 0) stats.total--;
  await chrome.storage.local.set({ stats });
}

// ── 已收藏推文记录（去重用，永久历史）──
const BOOKMARK_STORE_VERSION = 2;
const MAX_BOOKMARK_HISTORY = 120000;

function normalizeBookmarkStore(raw) {
  if (raw?.version === BOOKMARK_STORE_VERSION && raw?.tweets && typeof raw.tweets === 'object') {
    return { version: BOOKMARK_STORE_VERSION, tweets: raw.tweets };
  }

  // 兼容 v0.0.12 的结构：{ date, tweets }，迁移后不再按天清空。
  if (raw?.tweets && typeof raw.tweets === 'object') {
    return { version: BOOKMARK_STORE_VERSION, tweets: { ...raw.tweets } };
  }

  return { version: BOOKMARK_STORE_VERSION, tweets: {} };
}

async function loadBookmarkStore() {
  const result = await chrome.storage.local.get(['bookmarked']);
  const normalized = normalizeBookmarkStore(result.bookmarked);
  const shouldMigrate =
    !result.bookmarked ||
    result.bookmarked.version !== BOOKMARK_STORE_VERSION ||
    !result.bookmarked.tweets ||
    typeof result.bookmarked.tweets !== 'object';

  if (shouldMigrate) {
    await chrome.storage.local.set({ bookmarked: normalized });
  }

  return normalized;
}

async function isBookmarked(tweetId) {
  const bookmarked = await loadBookmarkStore();
  return !!bookmarked.tweets?.[tweetId];
}

async function recordBookmark(tweetId, category) {
  const bookmarked = await loadBookmarkStore();
  bookmarked.tweets[tweetId] = { category, time: Date.now() };

  const ids = Object.keys(bookmarked.tweets);
  if (ids.length > MAX_BOOKMARK_HISTORY) {
    ids
      .sort((a, b) => (bookmarked.tweets[a]?.time || 0) - (bookmarked.tweets[b]?.time || 0))
      .slice(0, ids.length - MAX_BOOKMARK_HISTORY)
      .forEach((id) => delete bookmarked.tweets[id]);
  }

  await chrome.storage.local.set({ bookmarked });
}

async function removeBookmarkRecord(tweetId) {
  const bookmarked = await loadBookmarkStore();
  const record = bookmarked.tweets?.[tweetId] || null;
  if (record) {
    delete bookmarked.tweets[tweetId];
    await chrome.storage.local.set({ bookmarked });
  }
  return record;
}

function dropUndoStackByTweetId(tweetId) {
  if (!tweetId) return;
  for (let i = undoStack.length - 1; i >= 0; i--) {
    if (undoStack[i]?.tweetId === tweetId) {
      undoStack.splice(i, 1);
    }
  }
}

// ── PREPARE_BOOKMARK：为 Content Script 准备收藏所需信息 ──
async function handlePrepareBookmark(tweetId, category) {

  // 检查启用
  const enabledResult = await chrome.storage.local.get(['enabled']);
  if (enabledResult.enabled === false) {
    return { success: false, error: '插件已禁用' };
  }

  // 去重
  if (await isBookmarked(tweetId)) {
    return { success: false, error: '该推文已收藏', duplicate: true };
  }

  // 获取 hash
  const hashResult = await chrome.storage.local.get(['queryHashes']);
  const hashes = hashResult.queryHashes || {};

  // CreateBookmark 由 Content Script 触发 Twitter 原生按钮完成，这里只要求归档 hash。
  const requiredOps = ['bookmarkTweetToFolder'];
  const missing = requiredOps.filter(op => !hashes[op]);
  if (missing.length > 0) {
    return { success: false, error: `缺少 hash: ${missing.join(', ')}。请先在 Twitter 上手动把一条推文加入书签文件夹` };
  }

  // 获取今日文件夹（这个需要调 API，但文件夹管理也改为让 Content Script 来创建）
  // 先检查缓存
  const folderResult = await chrome.storage.local.get(['folders']);
  const folders = folderResult.folders || {};
  const today = getLocalDateKey();
  const key = { 1: 'video', 2: 'nano', 3: 'image' }[category];

  let folder = null;
  if (folders.date === today && folders[key]?.id) {
    folder = folders[key];
  }

  // 如果缓存中没有文件夹，返回需要的 hash 让 Content Script 去创建
  const folderName = getFolderName(category);
  const needCreateFolder = !folder;
  const folderHashes = {};
  if (needCreateFolder) {
    if (!hashes['createBookmarkFolder']) {
      return { success: false, error: '缺少 createBookmarkFolder hash。请先在 Twitter 上手动创建一个书签文件夹' };
    }
    if (!hashes['BookmarkFoldersSlice']) {
      return { success: false, error: '缺少 BookmarkFoldersSlice hash。请先打开 Twitter 书签页面' };
    }
    folderHashes.createBookmarkFolder = hashes['createBookmarkFolder'];
    folderHashes.BookmarkFoldersSlice = hashes['BookmarkFoldersSlice'];
  }

  return {
    success: true,
    hashes: {
      bookmarkTweetToFolder: hashes['bookmarkTweetToFolder'],
      // 可选兼容字段：不阻塞主流程
      DeleteBookmark: hashes['DeleteBookmark'] || null,
      CreateBookmark: hashes['CreateBookmark'] || null,
      ...folderHashes,
    },
    folder: folder || null,
    folderName,
    needCreateFolder,
    category,
  };
}

// ── 消息监听 ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'IS_BOOKMARKED') {
    isBookmarked(msg.tweetId).then(result => {
      sendResponse({ bookmarked: result });
    });
    return true;
  }

  if (msg.type === 'PREPARE_BOOKMARK') {
    handlePrepareBookmark(msg.tweetId, msg.category).then(sendResponse);
    return true;
  }

  if (msg.type === 'BOOKMARK_SUCCESS') {
    // Content Script 报告收藏成功
    const { tweetId, category } = msg;
    recordBookmark(tweetId, category);
    incrementStat(category);
    undoStack.push({ tweetId, category, timestamp: Date.now() });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    sendResponse({ success: true });
    return true;
  }

  if (msg.type === 'SAVE_FOLDER') {
    // Content Script 创建了文件夹后保存到缓存
    const { category, folderId, folderName } = msg;
    const key = { 1: 'video', 2: 'nano', 3: 'image' }[category];
    const today = getLocalDateKey();
    chrome.storage.local.get(['folders'], (result) => {
      const folders = result.folders || {};
      if (folders.date !== today) {
        folders.date = today;
        folders.video = null;
        folders.nano = null;
        folders.image = null;
      }
      folders[key] = { id: folderId, name: folderName };
      chrome.storage.local.set({ folders });
    });
    sendResponse({ success: true });
    return true;
  }

  if (msg.type === 'GET_UNDO_INFO') {
    const action = undoStack.pop();
    if (!action) {
      sendResponse({ success: false, error: '没有可撤销的操作' });
      return true;
    }
    chrome.storage.local.get(['queryHashes'], (result) => {
      const hashes = result.queryHashes || {};
      const hash = hashes['DeleteBookmark'];
      if (!hash) {
        // 放回去
        undoStack.push(action);
        sendResponse({ success: false, error: '缺少 DeleteBookmark hash' });
      } else {
        sendResponse({
          success: true,
          tweetId: action.tweetId,
          category: action.category,
          hash,
        });
      }
    });
    return true;
  }

  if (msg.type === 'GET_DELETE_HASH') {
    chrome.storage.local.get(['queryHashes'], (result) => {
      const hashes = result.queryHashes || {};
      const hash = hashes['DeleteBookmark'];
      if (!hash) {
        sendResponse({ success: false, error: '缺少 DeleteBookmark hash' });
      } else {
        sendResponse({ success: true, hash });
      }
    });
    return true;
  }

  if (msg.type === 'UNDO_SUCCESS') {
    removeBookmarkRecord(msg.tweetId);
    decrementStat(msg.category);
    sendResponse({ success: true });
    return true;
  }

  if (msg.type === 'UNDO_FAILED') {
    // 撤销失败，把操作放回栈
    undoStack.push({ tweetId: msg.tweetId, category: msg.category, timestamp: Date.now() });
    sendResponse({ success: true });
    return true;
  }

  if (msg.type === 'CANCEL_BOOKMARK_SUCCESS') {
    (async () => {
      const record = await removeBookmarkRecord(msg.tweetId);
      dropUndoStackByTweetId(msg.tweetId);
      if (record?.category) {
        await decrementStat(record.category);
      }
      sendResponse({ success: true });
    })();
    return true;
  }

  if (msg.type === 'GET_ENABLED') {
    chrome.storage.local.get(['enabled'], (result) => {
      sendResponse({ enabled: result.enabled !== false });
    });
    return true;
  }

  if (msg.type === 'SET_ENABLED') {
    const enabled = !!msg.enabled;
    chrome.storage.local.set({ enabled });
    updateIcon(enabled);
    chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] }, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { type: 'ENABLED_CHANGED', enabled }).catch(() => {});
      }
    });
    sendResponse({ success: true });
    return true;
  }

  if (msg.type === 'GET_STATS') {
    chrome.storage.local.get(['stats'], (result) => {
      const normalized = normalizeStats(result.stats);
      if (JSON.stringify(normalized) !== JSON.stringify(result.stats || {})) {
        chrome.storage.local.set({ stats: normalized });
      }
      sendResponse(normalized);
    });
    return true;
  }

  if (msg.type === 'GET_HASH_STATUS') {
    getHashStatus().then(sendResponse);
    return true;
  }

  if (msg.type === 'INVALIDATE_HASH') {
    // Content Script 报告某个 hash 返回 404，清除缓存
    const { operationName } = msg;
    clearQueryHash(operationName).then(() => sendResponse({ success: true }));
    return true;
  }
});

// ── 图标状态 ──
function updateIcon(enabled) {
  if (enabled) {
    chrome.action.setIcon({ path: { 16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' } });
    chrome.action.setBadgeText({ text: '' });
  } else {
    chrome.action.setIcon({ path: { 16: 'icons/icon16-gray.png', 48: 'icons/icon48-gray.png', 128: 'icons/icon128-gray.png' } });
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#666' });
  }
}

// ── 初始化 ──
async function init() {
  // 保留已缓存的 queryHashes，遇到 404 时再按需清除
  const result = await chrome.storage.local.get(['queryHashes']);
  startHashWatcher();

  // 启动时修正统计日期基准，确保“今日统计”按本地日期滚动
  const statsResult = await chrome.storage.local.get(['stats']);
  const normalizedStats = normalizeStats(statsResult.stats);
  if (JSON.stringify(normalizedStats) !== JSON.stringify(statsResult.stats || {})) {
    await chrome.storage.local.set({ stats: normalizedStats });
  }

  chrome.storage.local.get(['enabled'], (r) => {
    updateIcon(r.enabled !== false);
  });

}

init();
