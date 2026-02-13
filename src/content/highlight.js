// src/content/highlight.js
// 推文高亮 + 推荐标签 + 收藏标记

/**
 * 在推文上显示推荐标签
 * @param {HTMLElement} tweetEl - 推文 DOM 元素
 * @param {Object|null} classification - classifyTweet 的返回值
 */
export function showRecommendTag(tweetEl, classification) {
  // 先移除旧的推荐标签
  removeRecommendTag(tweetEl);

  if (!classification || !tweetEl) return;

  // 已经收藏过的推文不显示推荐
  if (tweetEl.classList.contains('tweetsift-bookmarked')) return;

  // 确保推文有 position: relative
  const style = getComputedStyle(tweetEl);
  if (style.position === 'static') {
    tweetEl.style.position = 'relative';
  }

  const tag = document.createElement('div');
  tag.className = 'tweetsift-recommend';
  tag.textContent = classification.confidence === 'high'
    ? `${classification.label} 推荐`
    : classification.label;
  tag.dataset.tweetsiftRecommend = '1';

  tweetEl.appendChild(tag);
}

/**
 * 移除推文上的推荐标签
 */
export function removeRecommendTag(tweetEl) {
  if (!tweetEl) return;
  const existing = tweetEl.querySelector('[data-tweetsift-recommend]');
  if (existing) existing.remove();
}

/**
 * 标记推文为已收藏
 * @param {HTMLElement} tweetEl - 推文 DOM 元素
 * @param {string} label - 分类标签文字，如 '✅ 📹'
 */
export function markBookmarked(tweetEl, label) {
  if (!tweetEl) return;

  // 移除推荐标签
  removeRecommendTag(tweetEl);

  // 添加已收藏样式
  tweetEl.classList.add('tweetsift-bookmarked');

  // 确保推文有 position: relative
  const style = getComputedStyle(tweetEl);
  if (style.position === 'static') {
    tweetEl.style.position = 'relative';
  }

  // 添加分类标签
  const tag = document.createElement('div');
  tag.className = 'tweetsift-tag';
  tag.textContent = label;
  tag.dataset.tweetsiftTag = '1';

  tweetEl.appendChild(tag);
}

/**
 * 移除推文的已收藏标记（撤销时使用）
 * @param {HTMLElement} tweetEl - 推文 DOM 元素
 */
export function unmarkBookmarked(tweetEl) {
  if (!tweetEl) return;

  tweetEl.classList.remove('tweetsift-bookmarked');

  const tag = tweetEl.querySelector('[data-tweetsift-tag]');
  if (tag) tag.remove();
}

/**
 * 通过 tweetId 查找 DOM 中的推文元素
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
