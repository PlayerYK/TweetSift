// src/content/bookmark-state.js
// Twitter 原生书签状态探测 + CreateBookmark（通过原生按钮触发）

const POSITIVE_ARIA_PATTERNS = [
  /remove bookmark/i,
  /remove from bookmarks/i,
  /bookmarked/i,
  /移除书签/,
  /取消书签/,
  /从书签中移除/,
  /已添加到书签/,
  /已加入书签/,
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findTweetById(tweetId) {
  if (!tweetId) return null;
  const links = document.querySelectorAll(`a[href*="/status/${tweetId}"]`);
  for (const link of links) {
    const article = link.closest('article[data-testid="tweet"]');
    if (article) return article;
  }
  return null;
}

export function findBookmarkButton(tweetEl) {
  if (!tweetEl) return null;
  return tweetEl.querySelector(
    'button[data-testid="removeBookmark"], button[data-testid="bookmark"]'
  );
}

export function isNativeBookmarked(tweetEl) {
  if (!tweetEl) return false;

  // X 的 action bar 通常在已收藏时切换为 removeBookmark
  if (tweetEl.querySelector('button[data-testid="removeBookmark"]')) {
    return true;
  }

  const button = findBookmarkButton(tweetEl);
  if (!button) return false;

  const ariaLabel = button.getAttribute('aria-label') || '';
  return POSITIVE_ARIA_PATTERNS.some((re) => re.test(ariaLabel));
}

export async function createBookmarkViaNativeButton(tweetEl, tweetId, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || 3500;
  const pollMs = Number(options.pollMs) || 80;

  const initialTweet = tweetEl || findTweetById(tweetId);
  if (!initialTweet) throw new Error('未找到推文元素');

  if (isNativeBookmarked(initialTweet)) {
    return { created: false };
  }

  const button = findBookmarkButton(initialTweet);
  if (!button) {
    throw new Error('未找到 Twitter 原生书签按钮');
  }

  button.click();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const liveTweet = findTweetById(tweetId) || initialTweet;
    if (isNativeBookmarked(liveTweet)) {
      return { created: true };
    }
  }

  throw new Error('CreateBookmark 超时（原生按钮未进入已收藏状态）');
}
