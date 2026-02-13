// src/background/auth.js
// 认证信息获取 — 通过 chrome.cookies API

const BEARER_TOKEN =
  'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

/**
 * 获取 Twitter 认证信息
 * @returns {Promise<{csrfToken: string, authToken: string}>}
 */
export async function getTwitterAuth() {
  const [ct0Cookie, authCookie] = await Promise.all([
    chrome.cookies.get({ url: 'https://x.com', name: 'ct0' }),
    chrome.cookies.get({ url: 'https://x.com', name: 'auth_token' }),
  ]);


  if (!ct0Cookie || !authCookie) {
    throw new Error('未登录 Twitter，请先登录');
  }

  return {
    csrfToken: ct0Cookie.value,
    authToken: authCookie.value,
  };
}

/**
 * 构建 Twitter API 请求通用 headers
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
