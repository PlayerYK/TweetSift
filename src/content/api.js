// src/content/api.js
// 从 Content Script 调用 Twitter GraphQL API
//
// 通过注入到 main world 的脚本发起同源请求（当前为 XHR），
// 避免 Content Script 隔离环境带来的请求差异。

const BASE_URL = 'https://x.com/i/api/graphql';
const BEARER_TOKEN =
  'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

// ── 注入 main world 脚本 ──
let injectPromise = null;

function ensureInjected() {
  if (injectPromise) return injectPromise;

  injectPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = () => {
      script.remove();
      // 给 injected script 一点时间完成初始化
      setTimeout(resolve, 50);
    };
    script.onerror = () => {
      script.remove();
      resolve(); // 即使失败也继续（会超时）
    };
    (document.head || document.documentElement).appendChild(script);
  });

  return injectPromise;
}

// ── 请求 ID 计数器 & 回调池 ──
let reqId = 0;
const pending = new Map();

// 监听来自 injected script 的响应
window.addEventListener('tweetsift-response', (e) => {
  const { id, status, statusText, body } = e.detail;
  const resolve = pending.get(id);
  if (resolve) {
    pending.delete(id);
    resolve({ status, statusText, body });
  }
});

/**
 * 通过 injected script 发送请求
 */
async function injectedFetch(url, method, headers, body) {
  await ensureInjected();

  return new Promise((resolve) => {
    const id = ++reqId;
    pending.set(id, resolve);

    window.dispatchEvent(new CustomEvent('tweetsift-request', {
      detail: { id, url, method, headers, body },
    }));

    // 超时兜底
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ status: 0, statusText: 'Timeout', body: '请求超时' });
      }
    }, 30000);
  });
}

// ── CSRF token ──

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/);
  return match ? match[1] : null;
}

function buildHeaders() {
  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    throw new Error('未找到 CSRF token (ct0)，请确认已登录 Twitter');
  }
  return {
    'authorization': BEARER_TOKEN,
    'x-csrf-token': csrfToken,
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-active-user': 'yes',
    'content-type': 'application/json',
  };
}

// ── GraphQL 请求 ──

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
    throw new Error(`${operationName} 网络错误: ${responseBody}`);
  }

  if (status >= 400) {

    if (status === 401) {
      throw new Error('登录已过期，请刷新页面');
    }
    if (status === 429) {
      throw new Error('频率限制，请稍后重试');
    }
    if (status === 404) {
      // 不立即清除 hash，可能只是临时问题
      throw new Error(`${operationName} 失败(404)，请刷新页面后重试`);
    }
    throw new Error(`${operationName} 失败(${status})`);
  }

  let data;
  try {
    data = JSON.parse(responseBody);
  } catch {
    throw new Error(`${operationName} 响应解析失败`);
  }
  return data;
}

// ── 公开 API ──

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

export async function getBookmarkFolders(queryId) {
  return graphqlRequest('BookmarkFoldersSlice', queryId, {}, 'GET');
}
