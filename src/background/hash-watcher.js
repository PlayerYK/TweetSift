// src/background/hash-watcher.js
// 动态提取 Twitter GraphQL query hash

const GRAPHQL_URL_RE =
  /^https:\/\/(x\.com|twitter\.com)\/i\/api\/graphql\/([^/]+)\/([^/?]+)/;

// 需要收集的操作名
const REQUIRED_OPS = [
  'CreateBookmark',
  'DeleteBookmark',
  'createBookmarkFolder',
  'bookmarkTweetToFolder',
  'BookmarkFoldersSlice',
];

// 已失效的 hash（404 后标记，避免重复使用）
const invalidHashes = new Set();

// 缓存最近一次捕获到的 requestBody（兼容旧调试接口）
const capturedRequests = {};

/**
 * 启动 webRequest 监听
 */
export function startHashWatcher() {
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      const match = details.url.match(GRAPHQL_URL_RE);
      if (!match) return;

      const [, , queryId, operationName] = match;

      // 捕获 POST 请求的 requestBody（保留给调试接口）
      if (details.requestBody) {
        let bodyStr = '(无法解析)';
        if (details.requestBody.raw && details.requestBody.raw.length > 0) {
          try {
            const decoder = new TextDecoder();
            const bytes = details.requestBody.raw[0].bytes;
            bodyStr = decoder.decode(bytes);
          } catch {
            bodyStr = '(无法解析)';
          }
        } else if (details.requestBody.formData) {
          bodyStr = JSON.stringify(details.requestBody.formData);
        }

        capturedRequests[operationName] = {
          queryId,
          body: bodyStr,
          timestamp: Date.now(),
        };
      }

      invalidHashes.delete(operationName);

      chrome.storage.local.get(['queryHashes'], (result) => {
        const hashes = result.queryHashes || {};
        if (hashes[operationName] !== queryId) {
          hashes[operationName] = queryId;
          chrome.storage.local.set({ queryHashes: hashes });
        }
      });
    },
    {
      urls: ['*://x.com/i/api/graphql/*', '*://twitter.com/i/api/graphql/*'],
    },
    ['requestBody']
  );
}

/**
 * 获取指定操作的 query hash（只返回动态捕获的）
 */
export async function getQueryHash(operationName) {
  const result = await chrome.storage.local.get(['queryHashes']);
  const hashes = result.queryHashes || {};
  const hash = hashes[operationName] || null;

  if (hash && invalidHashes.has(operationName)) {
    return null;
  }

  return hash;
}

/**
 * 标记指定操作的 hash 为失效
 */
export async function clearQueryHash(operationName) {
  invalidHashes.add(operationName);
  const result = await chrome.storage.local.get(['queryHashes']);
  const hashes = result.queryHashes || {};
  delete hashes[operationName];
  await chrome.storage.local.set({ queryHashes: hashes });
}

/**
 * 获取 Twitter 实际请求的捕获信息（供调试用）
 */
export function getCapturedRequest(operationName) {
  return capturedRequests[operationName] || null;
}

/**
 * 获取所有 hash 的收集状态
 */
export async function getHashStatus() {
  const result = await chrome.storage.local.get(['queryHashes']);
  const hashes = result.queryHashes || {};
  const status = {};
  for (const op of REQUIRED_OPS) {
    status[op] = hashes[op] || null;
  }
  return status;
}
