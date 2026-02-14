// src/background/hash-watcher.js
// Dynamically extract Twitter GraphQL query hashes

const GRAPHQL_URL_RE =
  /^https:\/\/(x\.com|twitter\.com)\/i\/api\/graphql\/([^/]+)\/([^/?]+)/;

// Operation names to collect
const REQUIRED_OPS = [
  'CreateBookmark',
  'DeleteBookmark',
  'createBookmarkFolder',
  'bookmarkTweetToFolder',
  'BookmarkFoldersSlice',
  'RemoveTweetFromBookmarkFolder',
  'BookmarkFolderTimeline',
];

// Invalidated hashes (marked after 404, to avoid reuse)
const invalidHashes = new Set();

// Cache last captured requestBody (for debug interface)
const capturedRequests = {};

/**
 * Start webRequest listener
 */
export function startHashWatcher() {
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      const match = details.url.match(GRAPHQL_URL_RE);
      if (!match) return;

      const [, , queryId, operationName] = match;

      // Capture POST request body (for debug interface)
      if (details.requestBody) {
        let bodyStr = '(unable to parse)';
        if (details.requestBody.raw && details.requestBody.raw.length > 0) {
          try {
            const decoder = new TextDecoder();
            const bytes = details.requestBody.raw[0].bytes;
            bodyStr = decoder.decode(bytes);
          } catch {
            bodyStr = '(unable to parse)';
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
 * Get query hash for a specific operation (only returns dynamically captured ones)
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
 * Mark a specific operation's hash as invalidated
 */
export async function clearQueryHash(operationName) {
  invalidHashes.add(operationName);
  const result = await chrome.storage.local.get(['queryHashes']);
  const hashes = result.queryHashes || {};
  delete hashes[operationName];
  await chrome.storage.local.set({ queryHashes: hashes });
}

/**
 * Get captured Twitter request info (for debugging)
 */
export function getCapturedRequest(operationName) {
  return capturedRequests[operationName] || null;
}

/**
 * Get collection status of all hashes
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
