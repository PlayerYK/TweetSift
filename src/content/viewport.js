// src/content/viewport.js
// 视口检测 — 识别当前屏幕中央的推文

let currentTweet = null;
let rafId = null;
let lastUpdate = 0;
const THROTTLE_MS = 100;

// 当选中推文变化时的回调
let onTargetChange = null;

export function startViewportDetection(callback) {
  onTargetChange = callback;
  window.addEventListener('scroll', onScroll, { passive: true });
  // 初始检测
  updateTarget();
}

export function stopViewportDetection() {
  window.removeEventListener('scroll', onScroll);
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (currentTweet) {
    currentTweet.classList.remove('tweetsift-highlight');
    currentTweet = null;
  }
  onTargetChange = null;
}

function onScroll() {
  const now = Date.now();
  if (now - lastUpdate < THROTTLE_MS) return;
  lastUpdate = now;

  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(updateTarget);
}

function updateTarget() {
  const tweets = document.querySelectorAll('article[data-testid="tweet"]');
  const viewportCenter = window.innerHeight / 2;
  let closest = null;
  let minDistance = Infinity;

  for (const tweet of tweets) {
    const rect = tweet.getBoundingClientRect();
    // 跳过不在视口内的推文
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

    const tweetCenter = rect.top + rect.height / 2;
    const distance = Math.abs(tweetCenter - viewportCenter);

    if (distance < minDistance) {
      minDistance = distance;
      closest = tweet;
    }
  }

  if (closest !== currentTweet) {
    // 移除旧高亮（但不移除已收藏标记）
    if (currentTweet && !currentTweet.classList.contains('tweetsift-bookmarked')) {
      currentTweet.classList.remove('tweetsift-highlight');
    }
    // 添加新高亮
    if (closest) {
      closest.classList.add('tweetsift-highlight');
    }
    currentTweet = closest;

    // 通知回调
    if (onTargetChange) {
      onTargetChange(currentTweet);
    }
  }
}

export function getCurrentTweet() {
  return currentTweet;
}
