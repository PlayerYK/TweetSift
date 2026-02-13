// src/content/index.js
// TweetSift Content Script 入口
//
// 架构：Content Script 通过 injected.js（main world, XHR）调用 Twitter API，
// Background 负责 hash 管理、文件夹缓存、撤销栈、统计。

import { startViewportDetection, stopViewportDetection, getCurrentTweet } from './viewport.js';
import { extractTweetData } from './extractor.js';
import { classifyTweet } from './classifier.js';
import { showToast } from './toast.js';
import { showRecommendTag, markBookmarked, unmarkBookmarked, findTweetElement } from './highlight.js';
import { isNativeBookmarked, createBookmarkViaNativeButton } from './bookmark-state.js';
import {
  deleteBookmark,
  bookmarkTweetToFolder,
  createBookmarkFolder,
  getBookmarkFolders,
} from './api.js';

const RELOAD_MSG = '扩展已更新，请刷新页面 (F5)';

/**
 * 安全发送消息到 Background
 * 如果 extension context 已失效，提示用户刷新页面并停用插件
 */
async function safeSend(msg) {
  try {
    return await chrome.runtime.sendMessage(msg);
  } catch (err) {
    if (err.message?.includes('Extension context invalidated') ||
        err.message?.includes('context invalidated')) {
      deactivate();
      showToast(RELOAD_MSG, 'error', 5000);
      throw new Error(RELOAD_MSG);
    }
    throw err;
  }
}

// ── 状态 ──
let isActive = false;
let isEnabled = true;
let currentClassification = null;
let lastUrl = location.href;

const CATEGORY_LABELS = { 1: '📹', 2: '🍌', 3: '🖼️' };

// ── 初始化 ──
async function init() {
  try {
    const response = await safeSend({ type: 'GET_ENABLED' });
    isEnabled = response?.enabled !== false;
  } catch {
    isEnabled = true;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'ENABLED_CHANGED') {
      isEnabled = msg.enabled;
      if (!isEnabled) deactivate();
      else onRouteChange(location.href);
    }
  });

  setupRouteDetection();
  onRouteChange(location.href);
}

// ── SPA 路由变化检测 ──
function setupRouteDetection() {
  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onRouteChange(lastUrl);
    }
  });
  urlObserver.observe(document.body, { subtree: true, childList: true });

  window.addEventListener('popstate', () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onRouteChange(lastUrl);
    }
  });
}

function onRouteChange(url) {
  const isTimeline =
    url.includes('x.com/home') ||
    url === 'https://x.com/' ||
    /^https:\/\/x\.com\/[^/]+\/?$/.test(url) ||
    /^https:\/\/x\.com\/[^/]+\/status\//.test(url) ||
    url.includes('twitter.com/home') ||
    url === 'https://twitter.com/' ||
    /^https:\/\/twitter\.com\/[^/]+\/?$/.test(url) ||
    /^https:\/\/twitter\.com\/[^/]+\/status\//.test(url);

  if (isTimeline && isEnabled) activate();
  else deactivate();
}

// ── 激活/停用 ──
function activate() {
  if (isActive) return;
  isActive = true;
  startViewportDetection(onTargetChange);
  document.addEventListener('keydown', onKeyDown);
}

function deactivate() {
  if (!isActive) return;
  isActive = false;
  stopViewportDetection();
  document.removeEventListener('keydown', onKeyDown);
  currentClassification = null;
}

// ── 视口目标变化回调 ──
async function onTargetChange(tweetEl) {
  if (!tweetEl) { currentClassification = null; return; }

  // Twitter 原生已收藏状态优先（兼容手工收藏/其他客户端收藏）
  if (isNativeBookmarked(tweetEl)) {
    if (!tweetEl.classList.contains('tweetsift-bookmarked')) {
      markBookmarked(tweetEl, '✅ 🔖');
    }
    currentClassification = null;
    return;
  }

  // 回标：DOM 上没有标记且尚未查过，向 Background 查询是否已收藏
  if (!tweetEl.classList.contains('tweetsift-bookmarked') && !tweetEl.dataset.tweetsiftChecked) {
    tweetEl.dataset.tweetsiftChecked = '1';
    const d = extractTweetData(tweetEl);
    if (d?.tweetId) {
      try {
        const resp = await safeSend({ type: 'IS_BOOKMARKED', tweetId: d.tweetId });
        if (resp?.bookmarked) {
          markBookmarked(tweetEl, '✅');
          currentClassification = null;
          return;
        }
      } catch {}
    }
  }

  // 已收藏的推文不再分类
  if (tweetEl.classList.contains('tweetsift-bookmarked')) { currentClassification = null; return; }

  const data = extractTweetData(tweetEl);
  currentClassification = classifyTweet(data);
  showRecommendTag(tweetEl, currentClassification);
}

// ── 快捷键处理 ──
function onKeyDown(e) {
  if (isInputFocused()) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const key = e.key;

  if (key === 'z') {
    e.preventDefault();
    handleUndo();
    return;
  }

  let category = null;
  if (key === '`') {
    if (!currentClassification) { showToast('当前推文无推荐分类', 'error'); return; }
    category = currentClassification.category;
  } else if (key === '1') category = 1;
  else if (key === '2') category = 2;
  else if (key === '3') category = 3;
  else return;

  e.preventDefault();
  handleBookmark(category);
}

// ── 收藏操作 ──
async function handleBookmark(category) {
  const tweetEl = getCurrentTweet();
  if (!tweetEl) { showToast('未找到当前推文', 'error'); return; }

  const data = extractTweetData(tweetEl);
  if (!data?.tweetId) { showToast('无法获取推文 ID', 'error'); return; }
  if (isNativeBookmarked(tweetEl)) {
    markBookmarked(tweetEl, '✅ 🔖');
    showToast('该推文已收藏 ✅', 'success');
    return;
  }
  if (tweetEl.classList.contains('tweetsift-bookmarked')) { showToast('该推文已收藏 ✅', 'success'); return; }

  // 1. 向 Background 获取所需信息（hash + 文件夹 ID）
  let prep;
  try {
    prep = await safeSend({
      type: 'PREPARE_BOOKMARK',
      tweetId: data.tweetId,
      category,
    });
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
    return;
  }

  if (!prep?.success) {
    if (prep?.duplicate) {
      markBookmarked(tweetEl, '✅');
      showToast('该推文已收藏 ✅', 'success');
    } else {
      showToast(prep?.error || '❌ 准备失败', 'error');
    }
    return;
  }


  // 2. 如果需要创建文件夹，先处理
  let folder = prep.folder;
  if (prep.needCreateFolder) {
    try {
      folder = await findOrCreateFolder(prep);
    } catch (err) {
      showToast(`❌ 文件夹创建失败: ${err.message}`, 'error');
      return;
    }
  }

  // 3. 先触发 Twitter 原生 CreateBookmark，再调用 bookmarkTweetToFolder 归档
  try {
    await createBookmarkViaNativeButton(tweetEl, data.tweetId);
    await bookmarkTweetToFolder(prep.hashes.bookmarkTweetToFolder, data.tweetId, folder.id);

    // 4. 通知 Background 记录成功
    await safeSend({
      type: 'BOOKMARK_SUCCESS',
      tweetId: data.tweetId,
      category,
    }).catch(() => {});

    // 5. 视觉反馈
    const label = `✅ ${CATEGORY_LABELS[category] || ''}`;
    markBookmarked(tweetEl, label);
    showToast(`✅ → ${folder.name}`);

  } catch (err) {
    showToast(`❌ 收藏失败: ${err.message}`, 'error');
  }
}

// ── 查找或创建文件夹 ──
async function findOrCreateFolder(prep) {
  const { folderName, category, hashes } = prep;

  // 1. 查询现有文件夹列表
  try {
    const listResult = await getBookmarkFolders(hashes.BookmarkFoldersSlice);
    const items =
      listResult?.data?.viewer?.user_results?.result?.bookmark_collections_slice?.items ||
      listResult?.data?.bookmark_collections_slice?.items ||
      [];

    for (const item of items) {
      // item 本身就有 id 和 name 字段
      const f = item;
      if (f?.name === folderName && f?.id) {
        // 缓存到 Background
        await safeSend({
          type: 'SAVE_FOLDER', category, folderId: f.id, folderName: f.name,
        }).catch(() => {});
        return { id: f.id, name: f.name };
      }
    }
  } catch {
  }

  // 2. 创建新文件夹
  const createResult = await createBookmarkFolder(hashes.createBookmarkFolder, folderName);
  const folderId =
    createResult?.data?.bookmark_collection_create?.id ||
    createResult?.data?.bookmark_folder_create?.id ||
    null;

  if (!folderId) {
    throw new Error('无法获取新文件夹 ID');
  }

  await safeSend({
    type: 'SAVE_FOLDER', category, folderId, folderName,
  }).catch(() => {});
  return { id: folderId, name: folderName };
}

// ── 撤销操作 ──
async function handleUndo() {
  const currentTweet = getCurrentTweet();
  const currentData = extractTweetData(currentTweet);
  const canCancelCurrent =
    !!currentData?.tweetId &&
    !!currentTweet &&
    (currentTweet.classList.contains('tweetsift-bookmarked') || isNativeBookmarked(currentTweet));

  if (canCancelCurrent) {
    await handleCancelCurrentBookmark(currentTweet, currentData.tweetId);
    return;
  }

  // 向 Background 获取撤销信息
  let undoInfo;
  try {
    undoInfo = await safeSend({ type: 'GET_UNDO_INFO' });
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }

  if (!undoInfo?.success) {
    showToast(undoInfo?.error || '没有可撤销的操作', 'undo');
    return;
  }


  try {
    await deleteBookmark(undoInfo.hash, undoInfo.tweetId);

    // 通知 Background 撤销成功
    await safeSend({
      type: 'UNDO_SUCCESS',
      tweetId: undoInfo.tweetId,
      category: undoInfo.category,
    }).catch(() => {});

    const tweetEl = findTweetElement(undoInfo.tweetId);
    if (tweetEl) unmarkBookmarked(tweetEl);
    showToast('↩️ 已撤销', 'undo');
  } catch (err) {
    // 告诉 Background 把操作放回栈
    await safeSend({
      type: 'UNDO_FAILED',
      tweetId: undoInfo.tweetId,
      category: undoInfo.category,
    }).catch(() => {});
    showToast(`撤销失败: ${err.message}`, 'error');
  }
}

async function handleCancelCurrentBookmark(tweetEl, tweetId) {
  let hashResult;
  try {
    hashResult = await safeSend({ type: 'GET_DELETE_HASH' });
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }

  if (!hashResult?.success || !hashResult.hash) {
    showToast(hashResult?.error || '缺少 DeleteBookmark hash', 'error');
    return;
  }

  try {
    await deleteBookmark(hashResult.hash, tweetId);
    await safeSend({
      type: 'CANCEL_BOOKMARK_SUCCESS',
      tweetId,
    }).catch(() => {});
    unmarkBookmarked(tweetEl);
    showToast('已取消收藏', 'undo');
  } catch (err) {
    showToast(`取消收藏失败: ${err.message}`, 'error');
  }
}

// ── 工具函数 ──
function isInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  if (el.getAttribute('contenteditable') === 'true') return true;
  if (el.getAttribute('role') === 'textbox') return true;
  return false;
}

init();
