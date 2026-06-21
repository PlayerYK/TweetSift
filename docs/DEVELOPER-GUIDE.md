# Developer Guide

This guide documents implementation-level details for developers who want to maintain or extend TweetSift. It intentionally includes the behind-the-scenes mechanics that are easy to miss from the README.

Do not commit private bookmark exports, raw debug JSON, screenshots with private account data, or local browser artifacts.

## Runtime Architecture

TweetSift is a Chrome Manifest V3 extension with three runtime layers:

```text
popup UI
  -> chrome.runtime messages
background service worker
  -> chrome.tabs messages
content script
  -> CustomEvent bridge
injected page script
  -> same-origin XMLHttpRequest to X web endpoints
```

The background service worker does not call X APIs directly. Earlier versions tried that path, but service worker requests do not naturally share the page's authenticated browser context. The current design sends X web requests from the page context through `src/content/injected.js`.

## Why `injected.js` Exists

Content scripts run in an isolated world. TweetSift needs requests to behave like same-origin page requests, so `src/content/api.js` injects `src/content/injected.js` into the page's main world.

The bridge works like this:

1. `src/content/api.js` creates a `<script src="chrome-extension://.../injected.js">`.
2. The content script dispatches `tweetsift-request` with `{ id, url, method, headers, body }`.
3. The injected script performs `XMLHttpRequest` with `withCredentials = true`.
4. The injected script dispatches `tweetsift-response` with `{ id, status, statusText, body }`.
5. The content script resolves the pending request by `id`.

The injected script uses XHR rather than `fetch`. XHR has proven more reliable for this extension's same-origin web requests.

## Authentication Model

TweetSift uses the user's existing logged-in browser session on `x.com` or `twitter.com`.

Request headers are built in `src/content/api.js`:

- `authorization`: public Bearer token embedded in the X/Twitter web client.
- `x-csrf-token`: page-accessible `ct0` CSRF cookie from `document.cookie`.
- `x-twitter-auth-type`: `OAuth2Session`.
- `x-twitter-active-user`: `yes`.
- `content-type`: `application/json`.

The Bearer token in source is not a private API key. It is the public web-client token used by browser-based X/Twitter clients. User-level authentication still comes from the user's browser session.

TweetSift no longer uses `chrome.cookies`, and it does not read `auth_token`.

## Operation Hash Capture

X GraphQL URLs include a per-operation query hash:

```text
https://x.com/i/api/graphql/{queryId}/{operationName}
```

`src/background/hash-watcher.js` listens to:

```text
*://x.com/i/api/graphql/*
*://twitter.com/i/api/graphql/*
```

It extracts `{ queryId, operationName }` with:

```text
^https://(x\.com|twitter\.com)/i/api/graphql/([^/]+)/([^/?]+)
```

Captured hashes are persisted in `chrome.storage.local.queryHashes`. POST request bodies are also decoded into the in-memory `capturedRequests` object for debugging, but that body cache is not persisted.

### Watched Operations

| Operation | Role | Required for |
| --- | --- | --- |
| `bookmarkTweetToFolder` | Assign a bookmarked post to a folder | Core save flow |
| `createBookmarkFolder` | Create today's target folder | First save for a category/day |
| `BookmarkFoldersSlice` | List bookmark folders | Folder lookup and export folder picker |
| `BookmarkFolderTimeline` | Read a folder timeline | JSON export |
| `CreateBookmark` | Native X bookmark action | Captured for diagnostics; current save flow clicks the native button instead of calling it directly |
| `DeleteBookmark` | Native X unbookmark action | Captured for diagnostics; current remove flow clicks the native button instead of calling it directly |
| `RemoveTweetFromBookmarkFolder` | Remove a post from a folder | Best-effort cleanup after `z` |

The popup distinguishes core and optional operations. Missing optional hashes should not block basic saving.

## Message Contracts

### Popup To Background

| Message | Purpose |
| --- | --- |
| `GET_ENABLED` | Read extension enabled state. |
| `SET_ENABLED` | Toggle enabled state and broadcast to X tabs. Re-enabling clears session caches. |
| `GET_STATS` | Read normalized local counters. |
| `GET_HASH_STATUS` | Read captured operation hashes for popup status. |
| `EXPORT_GET_FOLDERS` | Ask a live X tab to list bookmark folders. |
| `EXPORT_START` | Start a background export job for selected folders. |
| `EXPORT_STATUS` | Poll export progress and completed results. |
| `EXPORT_CLEAR` | Clear completed export state after popup downloads files. |

### Content To Background

| Message | Purpose |
| --- | --- |
| `IS_BOOKMARKED` | Check today's local dedup record for a post. |
| `PREPARE_BOOKMARK` | Validate enabled state, dedup state, required hashes, and folder cache. |
| `BOOKMARK_SUCCESS` | Record successful save and increment counters. |
| `SAVE_FOLDER` | Cache a created or discovered folder ID. |
| `GET_CANCEL_INFO` | Fetch optional folder removal hash and local folder ID for `z`. |
| `CANCEL_BOOKMARK_SUCCESS` | Remove local record and decrement counters. |
| `INVALIDATE_HASH` | Clear one operation hash after a hash-related failure. |

### Background To Content

| Message | Purpose |
| --- | --- |
| `ENABLED_CHANGED` | Tell X tabs to activate/deactivate the content script behavior. |
| `GET_BOOKMARK_FOLDERS` | Content script calls `BookmarkFoldersSlice` and returns folders. |
| `FETCH_FOLDER_BOOKMARKS` | Content script calls `BookmarkFolderTimeline` and returns parsed export rows. |

## Activation And Viewport Targeting

The content script activates on:

- `https://x.com/`
- `https://x.com/home`
- `https://x.com/{profile}`
- `https://x.com/{profile}/status/{id}`
- Equivalent `twitter.com` routes

`src/content/viewport.js` finds the tweet nearest the viewport center. `src/content/index.js` classifies that tweet and listens for shortcuts.

Shortcut mapping:

| Key | Category | Internal ID |
| --- | --- | --- |
| `` ` `` | Current recommendation | Classifier result |
| `1` | Nano | `2` |
| `2` | Video | `1` |
| `3` | Image | `3` |
| `z` | Remove current bookmark | n/a |

Internal IDs are historical and should not be confused with shortcut keys.

## Save Flow Details

Save flow for `1`, `2`, `3`, or `` ` ``:

1. Content script reads the current tweet DOM with `extractTweetData`.
2. Content script checks native bookmark state and today's local dedup record.
3. Content script sends `PREPARE_BOOKMARK` to background.
4. Background checks enabled state, local dedup, `bookmarkTweetToFolder`, and folder cache.
5. If the folder is missing, content calls `BookmarkFoldersSlice` and then `createBookmarkFolder`.
6. Content clicks X's native bookmark button via `createBookmarkViaNativeButton`.
7. Content calls `bookmarkTweetToFolder` with the target folder ID.
8. Content sends `BOOKMARK_SUCCESS`.
9. Background stores `{ category, folderId, time }` under `bookmarked.tweets[tweetId]`.
10. Content marks the tweet and shows a toast.

The native bookmark button is intentionally part of the save flow. It keeps X's bookmark pool state aligned before TweetSift assigns the folder.

## Remove Flow Details

`z` removes the current post only. It is not an operation-history undo.

1. Content checks that the current tweet appears bookmarked.
2. Content clicks X's native remove-bookmark button via `removeBookmarkViaNativeButton`.
3. Content asks background for `RemoveTweetFromBookmarkFolder` and the locally recorded `folderId`.
4. If both are available, content attempts `RemoveTweetFromBookmarkFolder`.
5. Content sends `CANCEL_BOOKMARK_SUCCESS`.
6. Background removes the local record and decrements local counters.
7. Content removes the local UI marker.

Folder removal is best effort. Native unbookmarking is the important state change.

## Export Flow Details

Export is coordinated by the background service worker so it survives popup close/reopen.

1. Popup sends `EXPORT_GET_FOLDERS`.
2. Background finds an active X/Twitter tab.
3. Content calls `BookmarkFoldersSlice`.
4. Popup renders selectable folders.
5. Popup sends `EXPORT_START`.
6. Background iterates selected folders.
7. For each folder, content calls `BookmarkFolderTimeline` until no bottom cursor remains or `MAX_PAGES = 100`.
8. Content waits a random 5 to 10 seconds between pages and between folders.
9. Content parses tweet rows into flat JSON objects.
10. Content repairs missing authors through `https://publish.twitter.com/oembed` in batches of 4.
11. Popup polls `EXPORT_STATUS` and downloads completed folder JSON.
12. Popup optionally downloads `*.debug.json` if debug capture is enabled and missing-author records exist.

### Exported Fields

Exported tweet rows include:

- Tweet identity: `tweetId`, `tweetURL`, `conversationId`.
- Text: `fullText`, `noteTweetText`.
- Media: `mediaURLs`, `mediaTypes`, `mediaCount`.
- Engagement: replies, retweets, favorites, quotes, bookmarks, views.
- Flags: favorited, retweeted, bookmarked, quote status, possibly sensitive, language.
- Entities: expanded URLs, hashtags, user mentions.
- Author fields: ID, name, handle, bio, follower counts, avatar, banner, location, verification flags, professional type, created time.
- `scrapedAt`.

Debug export may include raw `tweetResult` fragments for records whose author block was missing. Treat debug JSON as private data.

## Local Storage Keys

```json
{
  "enabled": true,
  "queryHashes": {
    "bookmarkTweetToFolder": "...",
    "createBookmarkFolder": "...",
    "BookmarkFoldersSlice": "...",
    "BookmarkFolderTimeline": "...",
    "CreateBookmark": "...",
    "DeleteBookmark": "...",
    "RemoveTweetFromBookmarkFolder": "..."
  },
  "folders": {
    "date": "2026-06-21",
    "video": { "id": "...", "name": "260621-Video" },
    "nano": { "id": "...", "name": "260621-Nano" },
    "image": { "id": "...", "name": "260621-Image" }
  },
  "bookmarked": {
    "date": "2026-06-21",
    "tweets": {
      "tweet_id": { "category": 2, "folderId": "...", "time": 1780000000000 }
    }
  },
  "stats": {
    "date": "2026-06-21",
    "today": { "video": 0, "nano": 0, "image": 0 },
    "total": 0
  },
  "exportDebugCapture": false
}
```

`bookmarked`, `folders`, and `stats` are local-date scoped. Re-enabling the extension after disabling it clears those session caches but leaves `queryHashes` intact.

## Build System

`esbuild.config.js` has three bundled entry points:

| Entry | Output |
| --- | --- |
| `src/content/index.js` | `dist/content.bundle.js` |
| `src/background/index.js` | `dist/background.bundle.js` |
| `src/popup/popup.js` | `dist/popup.js` |

Static files copied into `dist/`:

- `src/manifest.json` with version injected from `package.json`.
- `src/popup/popup.html`.
- `src/popup/popup.css`.
- `src/content/content.css`.
- `src/content/injected.js`.
- `src/icons/*.png`.

Version behavior:

- `npm run build` runs `node esbuild.config.js --bump=patch`.
- `npm run release` runs `node esbuild.config.js --bump=minor`.
- `npm run watch` does not bump the version.
- Running `node esbuild.config.js` directly in non-watch mode defaults to patch bump.

`dist/` is generated output and should not be committed.

## Permissions

Manifest permissions:

- `storage`: local settings, counters, folder cache, dedup cache, and hashes.
- `webRequest`: observe X GraphQL request URLs and request bodies for hash capture.

Host permissions:

- `https://x.com/*`: content script, X web actions, hash capture.
- `https://twitter.com/*`: same as above for legacy domain routes.
- `https://publish.twitter.com/*`: public oEmbed lookup during export author repair.

No `cookies`, `tabs`, or `activeTab` permission is currently required.

## Troubleshooting Notes

### Missing Core Hashes

The popup shows missing hashes when the extension has not yet observed required X operations.

Common recapture actions:

- `bookmarkTweetToFolder`: manually add any bookmarked tweet to a folder.
- `createBookmarkFolder`: manually create a bookmark folder.
- `BookmarkFoldersSlice`: open the X bookmarks page.
- `BookmarkFolderTimeline`: open a bookmark folder page.

### 404 From X GraphQL

Usually means the hash is stale or the web client changed. Clear the hash cache in the popup and recapture operations.

### 503 From X GraphQL

Can mean stale hash, X server issue, or throttling. Try clearing hashes, waiting, and recapturing.

### Session Expired Or Missing CSRF

Refresh X and make sure the user is logged in. The `ct0` cookie must be visible to page JavaScript.

### Native Bookmark Button Not Found

X changed the DOM or the current tweet is not in a supported layout. Check `src/content/bookmark-state.js` and `src/content/extractor.js`.

### Export Missing Authors

Some `BookmarkFolderTimeline` pages omit the author block. TweetSift repairs names/handles with public oEmbed and can optionally write debug JSON containing raw tweet fragments.

## Privacy And Safety Rules For Development

- Never commit exported bookmark JSON.
- Never commit `*.debug.json`.
- Never commit screenshots showing private bookmarks or account data.
- Do not add fixed private credentials. The Bearer token in source is the public X web-client token.
- Keep permission changes documented in both README and `docs/DESIGN.md`.
- Treat export outputs as user data, even if the original tweets are public.
