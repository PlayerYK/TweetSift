# TweetSift（推文筛子）技术方案（同步至 v0.0.9）

## 1. 项目目标

TweetSift 是一个 Chrome MV3 扩展，用于在 Twitter/X 时间线中通过单键操作把推文快速归档到“当天分类文件夹”。

核心目标：
- 快速收藏（1/2/3/`）
- 自动分类建议（视频 / Nano / 图片）
- 一键撤销（z）
- 当天自动创建分类文件夹
- 在 Twitter 私有 API 变动时尽量可恢复

---

## 2. 当前实现状态（v0.0.9）

### 2.1 关键结论

1. `CreateBookmark` 在扩展外（页面 Console）也会返回 404，问题不在扩展运行环境。
2. 收藏主链路已改为 `bookmarkTweetToFolder` 直连，规避 `CreateBookmark` 阻塞。
3. 日期逻辑已统一为**本地日期**，跨天后文件夹创建与缓存轮转已实测正常。
4. 调试阶段的运行日志（console）已从主路径清理。

### 2.2 当前收藏链路

- 旧链路（已弃用）：`CreateBookmark` -> `bookmarkTweetToFolder`
- 新链路（当前）：`bookmarkTweetToFolder`（单请求直达）

---

## 3. 功能设计

### 3.1 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `\`` | 使用推荐分类收藏 |
| `1` | 收藏到今日“视频”文件夹 |
| `2` | 收藏到今日“Nano”文件夹 |
| `3` | 收藏到今日“图片”文件夹 |
| `z` | 撤销上一次收藏 |

限制条件：
- 仅在非输入状态生效（input/textarea/contenteditable 之外）
- 仅在 Twitter/X 相关页面生效

### 3.2 自动分类推荐

分类优先级：
1. 视频模型关键词 + 视频媒体 -> 视频
2. Nano/Gemini 关键词 + 图片媒体 -> Nano
3. 其他图片模型关键词 + 图片媒体 -> 图片
4. 无法判断时不推荐

### 3.3 文件夹规则

每天 3 个文件夹：
- `yyMMdd-视频`
- `yyMMdd-Nano`
- `yyMMdd-图片`

命名由 `src/background/folders.js` 统一生成。

### 3.4 撤销规则

- 撤销调用 `DeleteBookmark(tweet_id)`
- 成功后移除 UI 标记与统计计数
- 撤销栈仅会话内有效（内存）

---

## 4. 架构设计

### 4.1 模块职责

- `src/content/index.js`
  - 快捷键、路由检测、主流程编排、UI 反馈
- `src/content/api.js`
  - GraphQL 请求封装
- `src/content/injected.js`
  - 注入 main world，以 XHR 发同源请求
- `src/background/index.js`
  - hash 状态、文件夹缓存、统计、撤销栈、开关状态
- `src/background/hash-watcher.js`
  - 通过 webRequest 动态捕获 query hash
- `src/popup/popup.js`
  - 开关、统计、hash 状态展示

### 4.2 数据流（当前）

```text
快捷键触发（content/index.js）
  -> 向 background 请求 PREPARE_BOOKMARK（拿 hash / 文件夹信息）
  -> 如需文件夹：先 getBookmarkFolders，再 createBookmarkFolder
  -> 调用 bookmarkTweetToFolder 直连收藏
  -> 通知 background 记录统计/撤销信息
  -> 页面高亮 + Toast
```

### 4.3 为什么使用 injected.js

Content Script 在 isolated world。当前方案通过注入 main world（XHR）发请求，以减少环境差异造成的不确定性。

---

## 5. API 策略

### 5.1 动态 hash 捕获

- 监听：`*://x.com/i/api/graphql/*` / `*://twitter.com/i/api/graphql/*`
- 从 URL 捕获：`/{queryId}/{operationName}`
- 保存到 `chrome.storage.local.queryHashes`

关注的操作：
- `DeleteBookmark`
- `createBookmarkFolder`
- `bookmarkTweetToFolder`
- `BookmarkFoldersSlice`
- `CreateBookmark`（仍可捕获，但不再作为主链路必需）

### 5.2 当前主流程必需 hash

收藏主流程必需：
- `bookmarkTweetToFolder`

按需必需：
- 新建/查找文件夹时：`createBookmarkFolder`、`BookmarkFoldersSlice`
- 撤销时：`DeleteBookmark`

---

## 6. 本地日期统一策略

为避免 UTC/本地日期错位，以下状态统一使用本地日期键（`YYYY-MM-DD`）：

- `bookmarked.date`（今日去重）
- `folders.date`（今日文件夹缓存）
- `stats.date`（今日统计轮转）

实现位置：`src/background/index.js` 的 `getLocalDateKey()`。

---

## 7. 存储结构（chrome.storage.local）

```json
{
  "enabled": true,
  "folders": {
    "date": "2026-02-11",
    "video": { "id": "...", "name": "260211-视频" },
    "nano": { "id": "...", "name": "260211-Nano" },
    "image": { "id": "...", "name": "260211-图片" }
  },
  "bookmarked": {
    "date": "2026-02-11",
    "tweets": {
      "tweet_id": { "category": 1, "time": 1700000000000 }
    }
  },
  "stats": {
    "date": "2026-02-11",
    "today": { "video": 3, "nano": 2, "image": 5 },
    "total": 128
  },
  "queryHashes": {
    "bookmarkTweetToFolder": "...",
    "DeleteBookmark": "...",
    "createBookmarkFolder": "...",
    "BookmarkFoldersSlice": "...",
    "CreateBookmark": "..."
  }
}
```

---

## 8. Manifest 关键配置

当前 manifest（`src/manifest.json`）包含以下 icon 声明：

```json
{
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "action": {
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  }
}
```

说明：
- `icons`：扩展整体图标（商店、扩展管理页等）
- `action.default_icon`：工具栏按钮图标

---

## 9. 风险与后续

1. Twitter 私有 API 规则可能继续变化（hash、风控、header 校验）
2. `DeleteBookmark` 未来若被加强校验，可能只影响撤销，不影响主收藏
3. DOM 结构变更会影响提取与高亮逻辑
4. MV3 Service Worker 空闲回收导致撤销栈会话内丢失（可后续评估 `chrome.storage.session`）

---

## 10. 验证清单（已通过）

- [x] 直连收藏 `bookmarkTweetToFolder` 成功
- [x] 文件夹不存在时自动创建成功
- [x] 跨天后自动创建新日期文件夹成功
- [x] 本地日期轮转后 folders/bookmarked/stats 一致
- [x] Popup hash 状态与主链路需求一致

