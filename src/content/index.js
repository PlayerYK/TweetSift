// src/content/index.js
// TweetSift Content Script entry
//
// Architecture: Content Script calls Twitter API via injected.js (main world, XHR).
// Background handles hash management, folder caching, and stats.

import { startViewportDetection, stopViewportDetection, getCurrentTweet } from './viewport.js';
import { extractTweetData } from './extractor.js';
import { classifyTweet } from './classifier.js';
import { showToast } from './toast.js';
import { showRecommendTag, markBookmarked, unmarkBookmarked, findTweetElement } from './highlight.js';
import { isNativeBookmarked, createBookmarkViaNativeButton, removeBookmarkViaNativeButton } from './bookmark-state.js';
import {
  bookmarkTweetToFolder,
  removeTweetFromBookmarkFolder,
  createBookmarkFolder,
  getBookmarkFolders,
  getBookmarkFolderTimeline,
} from './api.js';

const RELOAD_MSG = 'Extension updated, please refresh the page (F5)';

/**
 * Safely send message to Background.
 * If extension context is invalidated, prompt user to refresh and deactivate.
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

// ── State ──
let isActive = false;
let isEnabled = true;
let currentClassification = null;
let lastUrl = location.href;

const CATEGORY_LABELS = { 1: '📹', 2: '🍌', 3: '🖼️' };

// ── Init ──
async function init() {
  try {
    const response = await safeSend({ type: 'GET_ENABLED' });
    isEnabled = response?.enabled !== false;
  } catch {
    isEnabled = true;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'ENABLED_CHANGED') {
      isEnabled = msg.enabled;
      if (!isEnabled) {
        deactivate();
      } else {
        clearLocalBookmarkMarkers();
        onRouteChange(location.href);
      }
      return;
    }

    if (msg.type === 'GET_BOOKMARK_FOLDERS') {
      handleGetBookmarkFolders(msg).then(sendResponse).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }

    if (msg.type === 'FETCH_FOLDER_BOOKMARKS') {
      handleFetchFolderBookmarks(msg).then(sendResponse).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }
  });

  setupRouteDetection();
  onRouteChange(location.href);
}

// ── SPA route change detection ──
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

// ── Activate / Deactivate ──
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

// ── Viewport target change callback ──
async function onTargetChange(tweetEl) {
  if (!tweetEl) { currentClassification = null; return; }

  // Native Twitter bookmark state takes priority
  if (isNativeBookmarked(tweetEl)) {
    if (!tweetEl.classList.contains('tweetsift-bookmarked')) {
      markBookmarked(tweetEl, '✅ 🔖');
    }
    currentClassification = null;
    return;
  }

  // Back-check: query Background if tweet was already bookmarked
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

  // Skip classification for already-bookmarked tweets
  if (tweetEl.classList.contains('tweetsift-bookmarked')) { currentClassification = null; return; }

  const data = extractTweetData(tweetEl);
  currentClassification = classifyTweet(data);
  showRecommendTag(tweetEl, currentClassification);
}

// ── Keyboard shortcuts ──
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
    if (!currentClassification) { showToast('No recommendation for current tweet', 'error'); return; }
    category = currentClassification.category;
  } else if (key === '1') category = 2;  // 1 → Nano
  else if (key === '2') category = 1;    // 2 → Video
  else if (key === '3') category = 3;
  else return;

  e.preventDefault();
  handleBookmark(category);
}

// ── Bookmark action ──
async function handleBookmark(category) {
  const tweetEl = getCurrentTweet();
  if (!tweetEl) { showToast('Tweet not found', 'error'); return; }

  const data = extractTweetData(tweetEl);
  if (!data?.tweetId) { showToast('Cannot get tweet ID', 'error'); return; }
  if (isNativeBookmarked(tweetEl)) {
    markBookmarked(tweetEl, '✅ 🔖');
    showToast('Already bookmarked ✅', 'success');
    return;
  }
  if (tweetEl.classList.contains('tweetsift-bookmarked')) { showToast('Already bookmarked ✅', 'success'); return; }

  // 1. Get required info from Background (hash + folder ID)
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
      showToast('Already bookmarked ✅', 'success');
    } else {
      showToast(prep?.error || '❌ Preparation failed', 'error');
    }
    return;
  }


  // 2. Create folder if needed
  let folder = prep.folder;
  if (prep.needCreateFolder) {
    try {
      folder = await findOrCreateFolder(prep);
    } catch (err) {
      showToast(`❌ Folder creation failed: ${err.message}`, 'error');
      return;
    }
  }

  // 3. Trigger native CreateBookmark, then call bookmarkTweetToFolder to archive
  try {
    await createBookmarkViaNativeButton(tweetEl, data.tweetId);
    await bookmarkTweetToFolder(prep.hashes.bookmarkTweetToFolder, data.tweetId, folder.id);

    // 4. Notify Background of success
    await safeSend({
      type: 'BOOKMARK_SUCCESS',
      tweetId: data.tweetId,
      category,
      folderId: folder.id,
    }).catch(() => {});

    // 5. Visual feedback
    const label = `✅ ${CATEGORY_LABELS[category] || ''}`;
    markBookmarked(tweetEl, label);
    showToast(`✅ → ${folder.name}`);

  } catch (err) {
    showToast(`❌ Bookmark failed: ${err.message}`, 'error');
  }
}

// ── Find or create folder ──
async function findOrCreateFolder(prep) {
  const { folderName, category, hashes } = prep;

  // 1. Query existing folder list
  try {
    const listResult = await getBookmarkFolders(hashes.BookmarkFoldersSlice);
    const items =
      listResult?.data?.viewer?.user_results?.result?.bookmark_collections_slice?.items ||
      listResult?.data?.bookmark_collections_slice?.items ||
      [];

    for (const item of items) {
      const f = item;
      if (f?.name === folderName && f?.id) {
        // Cache to Background
        await safeSend({
          type: 'SAVE_FOLDER', category, folderId: f.id, folderName: f.name,
        }).catch(() => {});
        return { id: f.id, name: f.name };
      }
    }
  } catch {
  }

  // 2. Create new folder
  const createResult = await createBookmarkFolder(hashes.createBookmarkFolder, folderName);
  const folderId =
    createResult?.data?.bookmark_collection_create?.id ||
    createResult?.data?.bookmark_folder_create?.id ||
    null;

  if (!folderId) {
    throw new Error('Failed to get new folder ID');
  }

  await safeSend({
    type: 'SAVE_FOLDER', category, folderId, folderName,
  }).catch(() => {});
  return { id: folderId, name: folderName };
}

// ── Undo bookmark ──
async function handleUndo() {
  const currentTweet = getCurrentTweet();
  const currentData = extractTweetData(currentTweet);
  const canCancel =
    !!currentData?.tweetId &&
    !!currentTweet &&
    (currentTweet.classList.contains('tweetsift-bookmarked') || isNativeBookmarked(currentTweet));

  if (!canCancel) {
    showToast('Tweet not bookmarked', 'undo');
    return;
  }

  await handleCancelCurrentBookmark(currentTweet, currentData.tweetId);
}

async function handleCancelCurrentBookmark(tweetEl, tweetId) {
  try {
    // 1. Click native button to remove bookmark
    await removeBookmarkViaNativeButton(tweetEl, tweetId);

    // 2. Remove from folder (non-blocking)
    try {
      const hashResult = await safeSend({ type: 'GET_CANCEL_INFO', tweetId });
      if (hashResult?.removeHash && hashResult?.folderId) {
        await removeTweetFromBookmarkFolder(hashResult.removeHash, tweetId, hashResult.folderId);
      }
    } catch {}

    // 3. Clean up local records
    await safeSend({
      type: 'CANCEL_BOOKMARK_SUCCESS',
      tweetId,
    }).catch(() => {});
    unmarkBookmarked(tweetEl);
    showToast('Bookmark removed', 'undo');
  } catch (err) {
    showToast(`Undo failed: ${err.message}`, 'error');
  }
}

// ── Utility functions ──
function isInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  if (el.getAttribute('contenteditable') === 'true') return true;
  if (el.getAttribute('role') === 'textbox') return true;
  return false;
}

function clearLocalBookmarkMarkers() {
  document.querySelectorAll('article[data-testid="tweet"]').forEach((tweetEl) => {
    tweetEl.classList.remove('tweetsift-bookmarked');
    const tag = tweetEl.querySelector('[data-tweetsift-tag]');
    if (tag) tag.remove();
    delete tweetEl.dataset.tweetsiftChecked;
  });
}

// ── Export: Get bookmark folders ──
async function handleGetBookmarkFolders(msg) {
  const { queryId } = msg;
  if (!queryId) throw new Error('Missing BookmarkFoldersSlice queryId');

  const result = await getBookmarkFolders(queryId);
  const items =
    result?.data?.viewer?.user_results?.result?.bookmark_collections_slice?.items ||
    result?.data?.bookmark_collections_slice?.items ||
    [];

  const folders = items
    .filter(item => item?.id && item?.name)
    .map(item => ({ id: item.id, name: item.name }));

  return { success: true, folders };
}

// ── Export: Fetch all bookmarks in a folder (paginated) ──
async function handleFetchFolderBookmarks(msg) {
  const { queryId, folderId } = msg;
  if (!queryId) throw new Error('Missing BookmarkFolderTimeline queryId');
  if (!folderId) throw new Error('Missing folderId');

  const allTweets = [];
  let cursor = null;
  let pageCount = 0;
  const MAX_PAGES = 100; // Safety limit

  while (pageCount < MAX_PAGES) {
    const result = await getBookmarkFolderTimeline(queryId, folderId, cursor);

    const instructions =
      result?.data?.bookmark_collection_timeline?.timeline?.instructions ||
      result?.data?.bookmark_collection_timeline_v2?.timeline?.instructions ||
      [];

    let entries = [];
    let nextCursor = null;

    for (const instruction of instructions) {
      // First page uses 'entries', subsequent pages use 'moduleItems' or 'entries'
      const items = instruction.entries || instruction.moduleItems || [];
      for (const entry of items) {
        const entryType = entry?.entryId || '';

        // Cursor entries
        if (entryType.startsWith('cursor-bottom-') || entryType.startsWith('cursor-bottom')) {
          nextCursor =
            entry?.content?.value ||
            entry?.content?.itemContent?.value ||
            null;
          continue;
        }
        if (entryType.startsWith('cursor-top-') || entryType.startsWith('cursor-top')) {
          continue;
        }

        // Tweet entries
        const tweetResult =
          entry?.content?.itemContent?.tweet_results?.result ||
          entry?.content?.items?.[0]?.item?.itemContent?.tweet_results?.result ||
          null;

        if (tweetResult) {
          const parsed = parseTweetResult(tweetResult);
          if (parsed) entries.push(parsed);
        }
      }
    }

    allTweets.push(...entries);
    pageCount++;

    if (!nextCursor || entries.length === 0) break;
    cursor = nextCursor;

    // Rate limit protection: random 5-10s delay between pages
    const delay = 5000 + Math.random() * 5000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  return { success: true, tweets: allTweets };
}

// ── Parse a single tweet result from GraphQL response ──
function parseTweetResult(result) {
  if (!result) return null;

  // Handle tweet with visibility results wrapper
  const tweet = result.tweet || result;
  const legacy = tweet?.legacy;
  const core = tweet?.core?.user_results?.result;

  if (!legacy) return null;

  const tweetId = legacy.id_str || tweet.rest_id;
  if (!tweetId) return null;

  // Author info
  const userLegacy = core?.legacy || {};
  const userProfessional = core?.professional || {};
  const screenName = userLegacy.screen_name || '';

  // Full text & Note Tweet text
  const fullText = legacy.full_text || '';
  const noteTweetText =
    tweet?.note_tweet?.note_tweet_results?.result?.text || '';

  // Media — extract flat arrays matching reference format
  const mediaEntities = legacy.extended_entities?.media || legacy.entities?.media || [];
  const mediaURLs = mediaEntities.map(m => {
    if (m.type === 'video' || m.type === 'animated_gif') {
      const bestVariant = m.video_info?.variants
        ?.filter(v => v.content_type === 'video/mp4')
        ?.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
        ?.[0];
      return bestVariant?.url || m.media_url_https || m.url || '';
    }
    return m.media_url_https || m.url || '';
  });
  const mediaTypes = mediaEntities.map(m => m.type || 'photo');
  const mediaCount = mediaEntities.length;

  // URLs, hashtags, user mentions from entities
  const expandedURLs = (legacy.entities?.urls || []).map(u => u.expanded_url || u.url || '');
  const hashtags = (legacy.entities?.hashtags || []).map(h => h.text || '');
  const userMentions = (legacy.entities?.user_mentions || []).map(u => u.screen_name || '');

  return {
    tweetId,
    fullText,
    noteTweetText,
    tweetURL: `https://twitter.com/${screenName}/status/${tweetId}`,
    mediaURLs,
    mediaTypes,
    mediaCount,
    createdAt: legacy.created_at || '',
    conversationId: legacy.conversation_id_str || '',
    replyCount: legacy.reply_count || 0,
    retweetCount: legacy.retweet_count || 0,
    favoriteCount: legacy.favorite_count || 0,
    quoteCount: legacy.quote_count || 0,
    bookmarkCount: legacy.bookmark_count || 0,
    viewCount: tweet?.views?.count || '0',
    favorited: !!legacy.favorited,
    retweeted: !!legacy.retweeted,
    bookmarked: !!legacy.bookmarked,
    isQuoteStatus: !!legacy.is_quote_status,
    possiblySensitive: !!legacy.possibly_sensitive,
    language: legacy.lang || '',
    expandedURLs,
    hashtags,
    userMentions,
    userId: core?.rest_id || legacy.user_id_str || '',
    userName: userLegacy.name || '',
    userScreenName: screenName,
    userDescription: userLegacy.description || '',
    userFollowersCount: userLegacy.followers_count || 0,
    userFriendsCount: userLegacy.friends_count || 0,
    userFavouritesCount: userLegacy.favourites_count || 0,
    userStatusesCount: userLegacy.statuses_count || 0,
    userListedCount: userLegacy.listed_count || 0,
    userAvatarUrl: userLegacy.profile_image_url_https || '',
    userProfileBannerUrl: userLegacy.profile_banner_url || '',
    userLocation: userLegacy.location || '',
    userIsBlueVerified: !!core?.is_blue_verified,
    userIsVerified: !!userLegacy.verified,
    userIsProtected: !!userLegacy.protected,
    userProfessionalType: userProfessional?.professional_type || '',
    userCreatedAt: userLegacy.created_at || '',
    scrapedAt: new Date().toISOString(),
  };
}

init();
