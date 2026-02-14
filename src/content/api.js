// src/content/api.js
// Call Twitter GraphQL API from Content Script
//
// Sends same-origin requests via injected main world script (XHR),
// avoiding request differences from Content Script isolation.

const BASE_URL = 'https://x.com/i/api/graphql';
const BEARER_TOKEN =
  'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

// ── Inject main world script ──
let injectPromise = null;

function ensureInjected() {
  if (injectPromise) return injectPromise;

  injectPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = () => {
      script.remove();
      // Give injected script time to initialize
      setTimeout(resolve, 50);
    };
    script.onerror = () => {
      script.remove();
      resolve(); // Continue even on failure (will timeout)
    };
    (document.head || document.documentElement).appendChild(script);
  });

  return injectPromise;
}

// ── Request ID counter & callback pool ──
let reqId = 0;
const pending = new Map();

// Listen for responses from injected script
window.addEventListener('tweetsift-response', (e) => {
  const { id, status, statusText, body } = e.detail;
  const resolve = pending.get(id);
  if (resolve) {
    pending.delete(id);
    resolve({ status, statusText, body });
  }
});

/**
 * Send request via injected script
 */
async function injectedFetch(url, method, headers, body) {
  await ensureInjected();

  return new Promise((resolve) => {
    const id = ++reqId;
    pending.set(id, resolve);

    window.dispatchEvent(new CustomEvent('tweetsift-request', {
      detail: { id, url, method, headers, body },
    }));

    // Timeout fallback
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ status: 0, statusText: 'Timeout', body: 'Request timeout' });
      }
    }, 30000);
  });
}

// ── CSRF Token ──

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/);
  return match ? match[1] : null;
}

function buildHeaders() {
  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    throw new Error('CSRF token (ct0) not found, please make sure you are logged in to Twitter');
  }
  return {
    'authorization': BEARER_TOKEN,
    'x-csrf-token': csrfToken,
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-active-user': 'yes',
    'content-type': 'application/json',
  };
}

// ── GraphQL request ──

async function graphqlRequest(operationName, queryId, variables, method = 'POST') {

  const headers = buildHeaders();
  const url = `${BASE_URL}/${queryId}/${operationName}`;

  let result;

  if (method === 'POST') {
    const body = JSON.stringify({ variables, queryId });
    result = await injectedFetch(url, 'POST', headers, body);
  } else {
    const params = new URLSearchParams({
      variables: JSON.stringify(variables),
    });
    const fullUrl = `${url}?${params}`;
    result = await injectedFetch(fullUrl, 'GET', headers, null);
  }

  const { status, body: responseBody } = result;

  if (status === 0) {
    throw new Error(`${operationName} network error: ${responseBody}`);
  }

  if (status >= 400) {

    if (status === 401) {
      throw new Error('Session expired, please refresh the page');
    }
    if (status === 429) {
      throw new Error('Rate limited, please try again later');
    }
    if (status === 404) {
      // Don't clear hash immediately, may be temporary
      throw new Error(`${operationName} failed (404), please refresh and retry`);
    }
    throw new Error(`${operationName} failed (${status})`);
  }

  let data;
  try {
    data = JSON.parse(responseBody);
  } catch {
    throw new Error(`${operationName} response parse failed`);
  }
  return data;
}

// ── Public API ──

export async function createBookmark(queryId, tweetId) {
  return graphqlRequest('CreateBookmark', queryId, { tweet_id: tweetId });
}

export async function deleteBookmark(queryId, tweetId) {
  return graphqlRequest('DeleteBookmark', queryId, { tweet_id: tweetId });
}

export async function createBookmarkFolder(queryId, name) {
  return graphqlRequest('createBookmarkFolder', queryId, { name });
}

export async function bookmarkTweetToFolder(queryId, tweetId, folderId) {
  return graphqlRequest('bookmarkTweetToFolder', queryId, {
    tweet_id: tweetId,
    bookmark_collection_id: folderId,
  });
}

export async function removeTweetFromBookmarkFolder(queryId, tweetId, folderId) {
  return graphqlRequest('RemoveTweetFromBookmarkFolder', queryId, {
    tweet_id: tweetId,
    bookmark_collection_id: folderId,
  });
}

export async function getBookmarkFolders(queryId) {
  return graphqlRequest('BookmarkFoldersSlice', queryId, {}, 'GET');
}
