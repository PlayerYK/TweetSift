// src/background/index.js
// TweetSift Background Service Worker
//
// Does not call Twitter API directly (Service Worker fetch doesn't carry cookies).
// Responsibilities: hash management, folder caching, stats, enable/disable.

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

// ── Stats ──
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

// ── Bookmarked tweet records (dedup, today only) ──
function normalizeBookmarkStore(raw) {
  const today = getLocalDateKey();
  if (raw?.date === today && raw?.tweets && typeof raw.tweets === 'object') {
    return { date: today, tweets: raw.tweets };
  }
  // Normalize legacy structure to today-only storage model.
  return { date: today, tweets: {} };
}

async function loadBookmarkStore() {
  const result = await chrome.storage.local.get(['bookmarked']);
  const normalized = normalizeBookmarkStore(result.bookmarked);
  const shouldReset =
    !result.bookmarked ||
    result.bookmarked.date !== normalized.date ||
    !result.bookmarked.tweets ||
    typeof result.bookmarked.tweets !== 'object';

  if (shouldReset) {
    await chrome.storage.local.set({ bookmarked: normalized });
  }
  return normalized;
}

async function isBookmarked(tweetId) {
  const bookmarked = await loadBookmarkStore();
  return !!bookmarked.tweets?.[tweetId];
}

async function recordBookmark(tweetId, category, folderId) {
  const bookmarked = await loadBookmarkStore();
  bookmarked.tweets[tweetId] = { category, folderId: folderId || null, time: Date.now() };
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

async function clearSessionCaches() {
  await chrome.storage.local.remove(['bookmarked', 'folders', 'stats']);
}

// ── PREPARE_BOOKMARK: prepare bookmark info for Content Script ──
async function handlePrepareBookmark(tweetId, category) {

  // Check enabled
  const enabledResult = await chrome.storage.local.get(['enabled']);
  if (enabledResult.enabled === false) {
    return { success: false, error: 'Extension is disabled' };
  }

  // Dedup
  if (await isBookmarked(tweetId)) {
    return { success: false, error: 'Already bookmarked', duplicate: true };
  }

  // Get hash
  const hashResult = await chrome.storage.local.get(['queryHashes']);
  const hashes = hashResult.queryHashes || {};

  // CreateBookmark is triggered via native button by Content Script; only archive hash is required here.
  const requiredOps = ['bookmarkTweetToFolder'];
  const missing = requiredOps.filter(op => !hashes[op]);
  if (missing.length > 0) {
    return { success: false, error: `Missing hash: ${missing.join(', ')}. Please manually add a tweet to a bookmark folder on Twitter first` };
  }

  // Get today's folder (check cache first)
  const folderResult = await chrome.storage.local.get(['folders']);
  const folders = folderResult.folders || {};
  const today = getLocalDateKey();
  const key = { 1: 'video', 2: 'nano', 3: 'image' }[category];

  let folder = null;
  if (folders.date === today && folders[key]?.id) {
    folder = folders[key];
  }

  // If no cached folder, return hashes for Content Script to create one
  const folderName = getFolderName(category);
  const needCreateFolder = !folder;
  const folderHashes = {};
  if (needCreateFolder) {
    if (!hashes['createBookmarkFolder']) {
      return { success: false, error: 'Missing createBookmarkFolder hash. Please manually create a bookmark folder on Twitter first' };
    }
    if (!hashes['BookmarkFoldersSlice']) {
      return { success: false, error: 'Missing BookmarkFoldersSlice hash. Please open the Twitter Bookmarks page first' };
    }
    folderHashes.createBookmarkFolder = hashes['createBookmarkFolder'];
    folderHashes.BookmarkFoldersSlice = hashes['BookmarkFoldersSlice'];
  }

  return {
    success: true,
    hashes: {
      bookmarkTweetToFolder: hashes['bookmarkTweetToFolder'],
      // Optional compatibility fields: non-blocking
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

// ── Message listener ──
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
    // Content Script reports successful bookmark
    const { tweetId, category, folderId } = msg;
    recordBookmark(tweetId, category, folderId);
    incrementStat(category);
    sendResponse({ success: true });
    return true;
  }

  if (msg.type === 'SAVE_FOLDER') {
    // Content Script created a folder, save to cache
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

  if (msg.type === 'GET_CANCEL_INFO') {
    (async () => {
      const [hashResult, bookmarked] = await Promise.all([
        chrome.storage.local.get(['queryHashes']),
        loadBookmarkStore(),
      ]);
      const hashes = hashResult.queryHashes || {};
      const record = bookmarked.tweets?.[msg.tweetId] || null;
      sendResponse({
        success: true,
        removeHash: hashes['RemoveTweetFromBookmarkFolder'] || null,
        folderId: record?.folderId || null,
      });
    })();
    return true;
  }

  if (msg.type === 'CANCEL_BOOKMARK_SUCCESS') {
    (async () => {
      const record = await removeBookmarkRecord(msg.tweetId);
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
    (async () => {
      const enabled = !!msg.enabled;
      const result = await chrome.storage.local.get(['enabled']);
      const wasEnabled = result.enabled !== false;
      const shouldClear = enabled && !wasEnabled;

      await chrome.storage.local.set({ enabled });
      if (shouldClear) {
        await clearSessionCaches();
      }

      updateIcon(enabled);
      chrome.tabs.query({ url: ['*://x.com/*', '*://twitter.com/*'] }, (tabs) => {
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: 'ENABLED_CHANGED', enabled }).catch(() => {});
        }
      });
      sendResponse({ success: true, cacheCleared: shouldClear });
    })();
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
    // Content Script reports a hash returned 404, clear cache
    const { operationName } = msg;
    clearQueryHash(operationName).then(() => sendResponse({ success: true }));
    return true;
  }
});

// ── Icon state ──
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

// ── Init ──
async function init() {
  // Keep cached queryHashes, clear on 404 as needed
  const result = await chrome.storage.local.get(['queryHashes']);
  startHashWatcher();

  // Normalize stats date on startup, ensure today's stats roll over by local date
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
