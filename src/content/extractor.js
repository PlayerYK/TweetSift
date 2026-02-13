// src/content/extractor.js
// 从推文 DOM 元素中提取结构化数据

export function extractTweetData(tweetElement) {
  if (!tweetElement) return null;

  // 推文 ID：从内部 status 链接提取
  const link = tweetElement.querySelector('a[href*="/status/"]');
  const tweetId = link?.href.match(/status\/(\d+)/)?.[1] || null;

  // 作者
  const author = tweetElement.querySelector('[data-testid="User-Name"]')?.textContent || '';

  // 文本内容
  const text = tweetElement.querySelector('[data-testid="tweetText"]')?.textContent || '';

  // 媒体类型
  const hasVideo = !!(
    tweetElement.querySelector('video') ||
    tweetElement.querySelector('[data-testid="videoPlayer"]')
  );
  const hasImage = !!tweetElement.querySelector('[data-testid="tweetPhoto"] img');

  return { tweetId, author, text, hasVideo, hasImage };
}
