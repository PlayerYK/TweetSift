// src/content/viewport.js
// Viewport detection — identify the tweet closest to screen center

let currentTweet = null;
let rafId = null;
let lastUpdate = 0;
const THROTTLE_MS = 100;

// Callback when selected tweet changes
let onTargetChange = null;

export function startViewportDetection(callback) {
  onTargetChange = callback;
  window.addEventListener('scroll', onScroll, { passive: true });
  // Initial detection
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
    // Skip tweets not in viewport
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

    const tweetCenter = rect.top + rect.height / 2;
    const distance = Math.abs(tweetCenter - viewportCenter);

    if (distance < minDistance) {
      minDistance = distance;
      closest = tweet;
    }
  }

  if (closest !== currentTweet) {
    // Remove old highlight (but keep bookmarked marker)
    if (currentTweet && !currentTweet.classList.contains('tweetsift-bookmarked')) {
      currentTweet.classList.remove('tweetsift-highlight');
    }
    // Add new highlight
    if (closest) {
      closest.classList.add('tweetsift-highlight');
    }
    currentTweet = closest;

    // Notify callback
    if (onTargetChange) {
      onTargetChange(currentTweet);
    }
  }
}

export function getCurrentTweet() {
  return currentTweet;
}
