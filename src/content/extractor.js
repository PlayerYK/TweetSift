// src/content/extractor.js
// Extract structured data from tweet DOM elements

export function extractTweetData(tweetElement) {
  if (!tweetElement) return null;

  // Tweet ID: extract from internal status link
  const link = tweetElement.querySelector('a[href*="/status/"]');
  const tweetId = link?.href.match(/status\/(\d+)/)?.[1] || null;

  // Author
  const author = tweetElement.querySelector('[data-testid="User-Name"]')?.textContent || '';

  // Text content
  const text = tweetElement.querySelector('[data-testid="tweetText"]')?.textContent || '';

  // Media type
  const hasVideo = !!(
    tweetElement.querySelector('video') ||
    tweetElement.querySelector('[data-testid="videoPlayer"]')
  );
  const hasImage = !!tweetElement.querySelector('[data-testid="tweetPhoto"] img');

  return { tweetId, author, text, hasVideo, hasImage };
}
