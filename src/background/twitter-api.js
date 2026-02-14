// src/background/twitter-api.js
// Twitter GraphQL API wrapper

import { getTwitterAuth, buildHeaders } from './auth.js';
import { getQueryHash, clearQueryHash, getCapturedRequest } from './hash-watcher.js';

const BASE_URL = 'https://x.com/i/api/graphql';

/**
 * Send GraphQL request
 */
async function graphqlRequest(operationName, variables, method = 'POST') {
  // 1. Get hash
  const queryId = await getQueryHash(operationName);

  if (!queryId) {
    throw new Error(`Missing ${operationName} hash. Please manually bookmark/unbookmark a tweet on Twitter so the extension can capture it`);
  }

  const captured = getCapturedRequest(operationName);

  // 2. Get auth
  let auth;
  try {
    auth = await getTwitterAuth();
  } catch (err) {
    throw err;
  }

  const headers = buildHeaders(auth.csrfToken);
  const url = `${BASE_URL}/${queryId}/${operationName}`;

  // 3. Build request body
  // Try to reuse features captured from actual Twitter requests
  let requestBody;
  if (method === 'POST') {
    const bodyObj = { variables, queryId };

    // If captured Twitter original request, extract features field
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

  // 4. Send request
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

    // GET requests may also need features
    if (captured?.body) {
      try {
        // Features for GET requests may be in URL params
        // Attempt to extract from captured URL (not yet implemented)
      } catch {}
    }

    const fullUrl = `${url}?${params}`;

    response = await fetch(fullUrl, {
      method: 'GET',
      headers,
      credentials: 'include',
    });
  }

  // 6. Error handling
  if (response.status === 401) {
    throw new Error('Session expired, please refresh the Twitter page');
  }

  if (response.status === 429) {
    const resetTime = response.headers.get('x-rate-limit-reset');
    const waitSec = resetTime ? Math.ceil(Number(resetTime) - Date.now() / 1000) : 60;
    throw new Error(`Rate limited, please wait ${waitSec} seconds`);
  }

  if (!response.ok) {
    let responseText = '';
    try {
      responseText = await response.text();
    } catch {}

    if (response.status === 400 || response.status === 404) {
      await clearQueryHash(operationName);
    }

    throw new Error(`${operationName} failed (${response.status}): ${responseText.slice(0, 200)}`);
  }

  // 7. Success
  const data = await response.json();
  return data;
}

// ── API operations ──

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
