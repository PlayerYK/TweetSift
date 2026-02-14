// src/content/highlight.js
// Tweet highlighting + recommendation tags + bookmark markers

/**
 * Show recommendation tag on a tweet
 * @param {HTMLElement} tweetEl - tweet DOM element
 * @param {Object|null} classification - return value of classifyTweet
 */
export function showRecommendTag(tweetEl, classification) {
  // Remove old recommendation tag first
  removeRecommendTag(tweetEl);

  if (!classification || !tweetEl) return;

  // Don't show recommendation on already-bookmarked tweets
  if (tweetEl.classList.contains('tweetsift-bookmarked')) return;

  // Ensure tweet has position: relative
  const style = getComputedStyle(tweetEl);
  if (style.position === 'static') {
    tweetEl.style.position = 'relative';
  }

  const tag = document.createElement('div');
  tag.className = 'tweetsift-recommend';
  tag.textContent = classification.confidence === 'high'
    ? `${classification.label} ★`
    : classification.label;
  tag.dataset.tweetsiftRecommend = '1';

  tweetEl.appendChild(tag);
}

/**
 * Remove recommendation tag from tweet
 */
export function removeRecommendTag(tweetEl) {
  if (!tweetEl) return;
  const existing = tweetEl.querySelector('[data-tweetsift-recommend]');
  if (existing) existing.remove();
}

/**
 * Mark tweet as bookmarked
 * @param {HTMLElement} tweetEl - tweet DOM element
 * @param {string} label - category label text, e.g. '✅ 📹'
 */
export function markBookmarked(tweetEl, label) {
  if (!tweetEl) return;

  // Remove recommendation tag
  removeRecommendTag(tweetEl);

  // Add bookmarked style
  tweetEl.classList.add('tweetsift-bookmarked');

  // Ensure tweet has position: relative
  const style = getComputedStyle(tweetEl);
  if (style.position === 'static') {
    tweetEl.style.position = 'relative';
  }

  // Add category tag
  const tag = document.createElement('div');
  tag.className = 'tweetsift-tag';
  tag.textContent = label;
  tag.dataset.tweetsiftTag = '1';

  tweetEl.appendChild(tag);
}

/**
 * Remove bookmark marker from tweet (used when undoing)
 * @param {HTMLElement} tweetEl - tweet DOM element
 */
export function unmarkBookmarked(tweetEl) {
  if (!tweetEl) return;

  tweetEl.classList.remove('tweetsift-bookmarked');

  const tag = tweetEl.querySelector('[data-tweetsift-tag]');
  if (tag) tag.remove();
}

/**
 * Find tweet element in DOM by tweetId
 */
export function findTweetElement(tweetId) {
  if (!tweetId) return null;
  const links = document.querySelectorAll(`a[href*="/status/${tweetId}"]`);
  for (const link of links) {
    const article = link.closest('article[data-testid="tweet"]');
    if (article) return article;
  }
  return null;
}
