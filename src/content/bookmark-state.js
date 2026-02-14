// src/content/bookmark-state.js
// Twitter native bookmark state detection + trigger CreateBookmark / DeleteBookmark via native button

const POSITIVE_ARIA_PATTERNS = [
  /remove bookmark/i,
  /remove from bookmarks/i,
  /bookmarked/i,
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

  // X switches to removeBookmark testid when bookmarked
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
  if (!initialTweet) throw new Error('Tweet element not found');

  if (isNativeBookmarked(initialTweet)) {
    return { created: false };
  }

  const button = findBookmarkButton(initialTweet);
  if (!button) {
    throw new Error('Native bookmark button not found');
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

  throw new Error('CreateBookmark timeout (native button did not enter bookmarked state)');
}

export async function removeBookmarkViaNativeButton(tweetEl, tweetId, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || 3500;
  const pollMs = Number(options.pollMs) || 80;

  const initialTweet = tweetEl || findTweetById(tweetId);
  if (!initialTweet) throw new Error('Tweet element not found');

  if (!isNativeBookmarked(initialTweet)) {
    return { removed: false };
  }

  const button = findBookmarkButton(initialTweet);
  if (!button) {
    throw new Error('Native bookmark button not found');
  }

  button.click();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const liveTweet = findTweetById(tweetId) || initialTweet;
    if (!isNativeBookmarked(liveTweet)) {
      return { removed: true };
    }
  }

  throw new Error('DeleteBookmark timeout (native button did not return to unbookmarked state)');
}
