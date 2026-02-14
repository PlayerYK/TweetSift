// src/content/api.js
// Call Twitter GraphQL API from Content Script
//
// Sends same-origin requests via injected main world script (XHR),
// avoiding request differences from Content Script isolation.

const BASE_URL = 'https://x.com/i/api/graphql';

// This is the public Bearer token used by Twitter/X's web client (twitter.com).
// It is NOT a private API key — it is embedded in Twitter's public JavaScript
// bundle and is used by all browser-based Twitter clients. User-level
// authentication is handled separately via session cookies (ct0, auth_token).
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

async function graphqlRequest(operationName, queryId, variables, method = 'POST', features = null) {

  const headers = buildHeaders();
  const url = `${BASE_URL}/${queryId}/${operationName}`;

  let result;

  if (method === 'POST') {
    const body = JSON.stringify({ variables, queryId });
    result = await injectedFetch(url, 'POST', headers, body);
  } else {
    const paramObj = {
      variables: JSON.stringify(variables),
    };
    if (features) {
      paramObj.features = JSON.stringify(features);
    }
    const params = new URLSearchParams(paramObj);
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

// Features required by Twitter's BookmarkFolderTimeline endpoint
const TIMELINE_FEATURES = {
  graphql_timeline_v2_bookmark_timeline: true,
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  responsive_web_media_download_video_enabled: false,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_awards_web_tipping_enabled: false,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_text_conversations_enabled: false,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_home_pinned_timelines_enabled: true,
  premium_content_api_read_enabled: false,
  view_counts_everywhere_api_enabled: true,
  // Additional required features
  responsive_web_jetfuel_frame: false,
  responsive_web_grok_analysis_button_from_backend: false,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_community_note_auto_translation_is_enabled: false,
  responsive_web_profile_redirect_enabled: false,
  responsive_web_grok_show_grok_translated_post: false,
  responsive_web_grok_share_attachment_enabled: false,
  post_ctas_fetch_enabled: false,
  rweb_video_screen_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: false,
  responsive_web_grok_annotations_enabled: false,
  responsive_web_grok_imagine_annotation_enabled: false,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  responsive_web_grok_image_annotation_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: false,
};

export async function getBookmarkFolderTimeline(queryId, folderId, cursor = null) {
  const variables = {
    bookmark_collection_id: folderId,
    count: 20,
  };
  if (cursor) {
    variables.cursor = cursor;
  }
  return graphqlRequest('BookmarkFolderTimeline', queryId, variables, 'GET', TIMELINE_FEATURES);
}
