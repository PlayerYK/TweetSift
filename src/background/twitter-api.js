// src/background/twitter-api.js
// Twitter GraphQL API 封装

import { getTwitterAuth, buildHeaders } from './auth.js';
import { getQueryHash, clearQueryHash, getCapturedRequest } from './hash-watcher.js';

const BASE_URL = 'https://x.com/i/api/graphql';

/**
 * 发送 GraphQL 请求
 */
async function graphqlRequest(operationName, variables, method = 'POST') {
  // 1. 获取 hash
  const queryId = await getQueryHash(operationName);

  if (!queryId) {
    throw new Error(`缺少 ${operationName} 的 hash。请在 Twitter 上手动收藏/取消收藏一条推文，插件会自动捕获`);
  }

  const captured = getCapturedRequest(operationName);

  // 2. 获取认证
  let auth;
  try {
    auth = await getTwitterAuth();
  } catch (err) {
    throw err;
  }

  const headers = buildHeaders(auth.csrfToken);
  const url = `${BASE_URL}/${queryId}/${operationName}`;

  // 3. 构建请求体
  // 尝试复用 Twitter 实际请求中捕获到的 features（如果有的话）
  let requestBody;
  if (method === 'POST') {
    const bodyObj = { variables, queryId };

    // 如果捕获到了 Twitter 原始请求，提取其中的 features 字段
    if (captured?.body) {
      try {
        const capturedBody = JSON.parse(captured.body);
        if (capturedBody.features) {
          bodyObj.features = capturedBody.features;
        }
      } catch {}
    }

    requestBody = JSON.stringify(bodyObj);
  }

  // 4. 发送请求
  let response;
  if (method === 'POST') {

    response = await fetch(url, {
      method: 'POST',
      headers,
      body: requestBody,
      credentials: 'include',
    });
  } else {
    const params = new URLSearchParams({
      variables: JSON.stringify(variables),
    });

    // GET 请求也可能需要 features
    if (captured?.body) {
      try {
        // GET 请求中 features 可能在 URL 参数里
        // 从捕获的 URL 中尝试提取 (暂不实现，先看 POST 是否通过)
      } catch {}
    }

    const fullUrl = `${url}?${params}`;

    response = await fetch(fullUrl, {
      method: 'GET',
      headers,
      credentials: 'include',
    });
  }

  // 6. 错误处理
  if (response.status === 401) {
    throw new Error('登录已过期，请刷新 Twitter 页面');
  }

  if (response.status === 429) {
    const resetTime = response.headers.get('x-rate-limit-reset');
    const waitSec = resetTime ? Math.ceil(Number(resetTime) - Date.now() / 1000) : 60;
    throw new Error(`频率限制，请等待 ${waitSec} 秒`);
  }

  if (!response.ok) {
    let responseText = '';
    try {
      responseText = await response.text();
    } catch {}

    if (response.status === 400 || response.status === 404) {
      await clearQueryHash(operationName);
    }

    throw new Error(`${operationName} 失败(${response.status}): ${responseText.slice(0, 200)}`);
  }

  // 7. 成功
  const data = await response.json();
  return data;
}

// ── 具体 API 操作 ──

export async function createBookmark(tweetId) {
  return graphqlRequest('CreateBookmark', { tweet_id: tweetId });
}

export async function deleteBookmark(tweetId) {
  return graphqlRequest('DeleteBookmark', { tweet_id: tweetId });
}

export async function createBookmarkFolder(name) {
  return graphqlRequest('createBookmarkFolder', { name });
}

export async function bookmarkTweetToFolder(tweetId, folderId) {
  return graphqlRequest('bookmarkTweetToFolder', {
    tweet_id: tweetId,
    bookmark_folder_id: folderId,
  });
}

export async function getBookmarkFolders() {
  return graphqlRequest('BookmarkFoldersSlice', {}, 'GET');
}
