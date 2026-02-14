// src/background/auth.js
// Auth info retrieval via chrome.cookies API

// This is the public Bearer token used by Twitter/X's web client (twitter.com).
// It is NOT a private API key — it is embedded in Twitter's public JavaScript
// bundle and is used by all browser-based Twitter clients. User-level
// authentication is handled separately via session cookies (ct0, auth_token).
const BEARER_TOKEN =
  'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

/**
 * Get Twitter auth info
 * @returns {Promise<{csrfToken: string, authToken: string}>}
 */
export async function getTwitterAuth() {
  const [ct0Cookie, authCookie] = await Promise.all([
    chrome.cookies.get({ url: 'https://x.com', name: 'ct0' }),
    chrome.cookies.get({ url: 'https://x.com', name: 'auth_token' }),
  ]);


  if (!ct0Cookie || !authCookie) {
    throw new Error('Not logged in to Twitter, please log in first');
  }

  return {
    csrfToken: ct0Cookie.value,
    authToken: authCookie.value,
  };
}

/**
 * Build common Twitter API request headers
 * @param {string} csrfToken
 * @returns {Object}
 */
export function buildHeaders(csrfToken) {
  return {
    authorization: BEARER_TOKEN,
    'x-csrf-token': csrfToken,
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-active-user': 'yes',
    'content-type': 'application/json',
  };
}
