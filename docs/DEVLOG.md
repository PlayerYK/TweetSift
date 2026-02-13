# TweetSift 开发日志

## 项目概述

TweetSift（推文筛子）是一个 Chrome 浏览器扩展（Manifest V3），用于在 Twitter/X 的 Timeline 页面上通过快捷键将推文快速收藏到分类文件夹中，并自动推荐分类。

## 当前状态

**版本：** 0.0.7（代码状态已完成 v0.0.9 调整，待发布构建）
**当前状态：** 收藏主链路稳定使用 `bookmarkTweetToFolder` 直达，`CreateBookmark` 404 已不再阻塞主功能。
**最新验证：** 已实测通过“收藏流程 + 新一天自动创建文件夹”。
**剩余风险：** 主要剩余风险集中在 Twitter 私有 API 后续策略变化（hash 变更 / 风控规则变化）。



## 本次调试总结（2026-02-10）

### 调试结论

1. `CreateBookmark` 的 404 不是扩展运行环境问题：在 Twitter 页面 Console 手动发同请求仍返回 404。
2. 最终采用绕过方案：收藏链路从“`CreateBookmark` + `bookmarkTweetToFolder`”改为“仅 `bookmarkTweetToFolder` 直达”。
3. 该方案在当前账号实测可用，且已验证“跨天后自动创建当天新文件夹”正常。

### 本次完成的改动

- 收藏主链路重构为单请求直达，移除对 `CreateBookmark` 的强依赖。
- Background 的日期逻辑统一改为**本地日期**，消除 UTC 与本地日期不一致导致的跨天问题。
- Popup 的 hash 就绪检查同步调整，不再把 `CreateBookmark` 作为必需项。
- 清理调试日志：去除运行路径中的 `console.log/warn/error` 调试输出，避免噪声与敏感信息泄露风险。

### 为什么统一本地日期

此前文件夹命名使用本地日期（`yyMMDD`），而缓存轮转部分逻辑使用 UTC 日期，可能在美国时区出现“提前换天/延后换天”错位。现在统一本地日期后，以下行为一致：

- 今日去重（bookmarked）
- 今日文件夹缓存（folders）
- 今日统计（stats）


---

## 已完成的工作

### 1. 方案设计与评审

- 编写了完整的技术方案文档 [DESIGN.md](./DESIGN.md)
- 调研了 Twitter/X 私有 GraphQL API 的真实端点、参数和认证方式
- 调研了 Chrome MV3 扩展的最佳实践（cookie 访问、模块化、SPA 路由检测）
- 确定了 query hash 动态提取方案（chrome.webRequest 拦截）
- 方案经过多轮评审和修正

### 2. 项目工程化

| 内容 | 说明 |
|------|------|
| 构建工具 | esbuild，将 ES modules 源码打包为单文件 |
| 源码目录 | `src/background/`、`src/content/`、`src/popup/`、`src/icons/` |
| 输出目录 | `dist/`（构建生成，直接作为 Chrome 扩展加载） |
| 构建命令 | `npm run build`（构建 + patch 版本号）、`npm run watch`（监听模式）、`npm run release`（minor 版本） |
| 版本管理 | `package.json` 为唯一版本来源，构建时自动注入 `dist/manifest.json`，代码中可用 `__VERSION__` |

### 3. Content Script 模块

| 文件 | 功能 |
|------|------|
| `src/content/index.js` | Content Script 入口，快捷键监听、SPA 路由检测、收藏/撤销流程 |
| `src/content/api.js` | Twitter GraphQL API 调用层，通过 injected.js 在 main world 中发起请求 |
| `src/content/injected.js` | 注入到页面 main world 的脚本，使用 XHR 发起 API 请求 |
| `src/content/viewport.js` | 视口检测算法，识别屏幕中央的推文，滚动节流 + requestAnimationFrame |
| `src/content/extractor.js` | 从推文 DOM 元素中提取 tweetId、作者、文本、媒体类型 |
| `src/content/classifier.js` | 推文自动分类器，按优先级判断：视频 > Nano > 图片 > prompt 猜测 |
| `src/content/models.js` | 模型关键词库（视频模型用正则匹配，图片模型用关键词匹配） |
| `src/content/highlight.js` | 视觉反馈：推荐标签、收藏标记、撤销标记移除 |
| `src/content/toast.js` | Toast 通知组件，支持成功/错误/撤销三种类型 |
| `src/content/content.css` | Content Script 注入样式（高亮、标签、Toast） |

### 4. Background Service Worker 模块

| 文件 | 功能 |
|------|------|
| `src/background/index.js` | Service Worker 入口，消息监听、hash/文件夹/撤销栈/统计管理、启用/禁用控制 |
| `src/background/hash-watcher.js` | query hash 动态提取，webRequest 监听 + requestBody 捕获 |
| `src/background/folders.js` | 文件夹命名工具（`yyMMDD-分类`格式） |
| `src/background/auth.js` | （已弃用）原用于 Service Worker 中获取认证信息 |
| `src/background/twitter-api.js` | （已弃用）原用于 Service Worker 中调用 API |

### 5. Popup 页面

| 文件 | 功能 |
|------|------|
| `src/popup/popup.html` | Popup 页面结构 |
| `src/popup/popup.css` | Popup 样式，Twitter 深色主题风格 |
| `src/popup/popup.js` | Popup 逻辑：启用开关、今日统计、API hash 收集状态 |

### 6. 静态资源

| 文件 | 说明 |
|------|------|
| `src/manifest.json` | MV3 manifest 源文件（version 为 0.0.0 占位，构建时注入实际版本） |
| `src/icons/*.png` | 图标（蓝色=启用，灰色=禁用，16/48/128 三种尺寸） |

---

## 已验证可正常工作的功能

| 功能 | 状态 | 说明 |
|------|------|------|
| Query hash 动态捕获 | ✅ 正常 | webRequest 成功拦截并保存所有 5 个关键操作的 hash |
| Query hash 跨会话缓存 | ✅ 正常 | chrome.storage.local 持久化，重启扩展后无需重新收集 |
| BookmarkFoldersSlice (GET) | ✅ 正常 | 成功查询文件夹列表，解析到正确的文件夹 ID 和名称 |
| createBookmarkFolder (POST) | ✅ 正常 | 成功创建文件夹（如 `260210-Nano`、`260210-图片`、`260210-视频`） |
| 文件夹缓存 | ✅ 正常 | 创建后缓存 ID，后续请求直接复用 |
| 视口检测 | ✅ 正常 | 正确识别屏幕中央的推文 |
| 推文数据提取 | ✅ 正常 | 正确提取 tweetId、作者、文本、媒体类型 |
| 自动分类推荐 | ✅ 正常 | 分类标签正确显示 |
| 快捷键监听 | ✅ 正常 | `` ` ``/1/2/3/z 均可触发 |
| Popup 状态显示 | ✅ 正常 | 启用/禁用开关、hash 收集状态、统计 |
| Extension context 失效检测 | ✅ 正常 | 扩展更新后提示刷新页面 |
| 图标 | ✅ 正常 | 有效的 8-bit RGBA PNG，Chrome 正常加载 |

---

## 核心阻塞问题：CreateBookmark 404

### 问题描述

调用 `POST /i/api/graphql/{hash}/CreateBookmark` 时始终返回 **HTTP 404**（空响应体），但 Twitter 自己用同样的 hash 和请求体格式成功。

其他 POST 操作（`createBookmarkFolder`、`bookmarkTweetToFolder`）均正常返回 200。

### 时间线与尝试过程

#### 第 1 轮：Service Worker 中直接 fetch（v0.0.1）

**架构**：Background Service Worker 中使用 `chrome.cookies` 获取 auth_token 和 ct0，然后 `fetch` 调用 API。

**结果**：所有 API 调用均返回 404。

**分析**：Service Worker 的 `fetch` 请求不携带页面的 cookie（即使设置了 `credentials: 'include'`），Twitter 检测到缺少有效 session 后返回 404（而非 401，这是刻意的反爬策略）。

**证据**：对比 webRequest 捕获到的 Twitter 原生请求头和我们发出的请求头，发现我们缺少 `x-client-transaction-id` 且 cookie 不随 fetch 发送。

#### 第 2 轮：Content Script 中直接 fetch（v0.0.3）

**架构变更**：将 API 调用从 Background 移到 Content Script。Content Script 运行在 x.com 页面的 isolated world 中，`fetch` + `credentials: 'include'` 理论上会自动携带页面的 cookie。Background 只负责 hash 管理、文件夹缓存、撤销栈、统计。

**结果**：
- GET 请求（`BookmarkFoldersSlice`）→ ✅ 200 成功
- POST 请求（`createBookmarkFolder`）→ ✅ 200 成功
- POST 请求（`CreateBookmark`）→ ❌ 404

**分析**：cookie 确实随请求发送了（GET 和部分 POST 成功证明了这一点）。但 `CreateBookmark` 特别对待——可能需要 `x-client-transaction-id` header。

**关键发现**：`x-client-transaction-id` 是 Twitter 前端 JavaScript 动态生成的反自动化 header，基于请求路径和 HTTP 方法，通过 Twitter 的 `ondemand.s` 异步模块计算得到。参考：
- https://github.com/obfio/twitter-tid-deobf
- https://github.com/isarabjitdhiman/xclienttransaction
- https://antibot.blog 系列文章

#### 第 3 轮：Injected Script + fetch（v0.0.6）

**架构变更**：创建 `injected.js` 通过 `<script>` 标签注入到页面的 **main world**，在 main world 中调用 `fetch`，期望 Twitter 的 fetch wrapper / Service Worker 拦截器自动添加 `x-client-transaction-id`。Content Script 与 injected script 通过 `CustomEvent` 通信。

**结果**：
- GET 请求 → ✅ 200 成功
- POST（`createBookmarkFolder`）→ 上一轮缓存中直接返回，未实际测试
- POST（`CreateBookmark`）→ ❌ 404

**分析**：在 main world 中调用 `window.fetch` 时，headers 中仍然没有 `x-client-transaction-id`。说明 Twitter 并没有 monkey-patch 全局 `fetch`，而是在内部模块中使用私有的 fetch wrapper。

**额外尝试**：在 injected.js 中 wrap `window.fetch` 来捕获 Twitter 请求中的 transaction ID 进行复用，但 Twitter 的请求不经过 `window.fetch`（使用的是模块内部引用），无法捕获。

#### 第 4 轮：Injected Script + XMLHttpRequest（v0.0.7）

**架构变更**：将 injected.js 中的 fetch 替换为 XMLHttpRequest，测试 XHR 是否有不同的行为。

**结果**：
- GET 请求 → ✅ 200 成功
- POST（`CreateBookmark`）→ ❌ 404

**分析**：XHR 和 fetch 行为一致，排除了 fetch 特有的问题。

#### 第 5 轮：页面 Console 手动测试

**验证方法**：直接在 x.com 页面的 DevTools Console 中手动执行 XHR 和 fetch 调用。

**测试代码**：
```javascript
// 手动 XHR
const xhr = new XMLHttpRequest();
xhr.open('POST', url, true);
xhr.withCredentials = true;
xhr.setRequestHeader('authorization', BEARER);
xhr.setRequestHeader('x-csrf-token', ct0);
xhr.setRequestHeader('x-twitter-auth-type', 'OAuth2Session');
xhr.setRequestHeader('x-twitter-active-user', 'yes');
xhr.setRequestHeader('content-type', 'application/json');
xhr.send(body);
// 结果：404

// 手动 fetch（增加了 x-twitter-client-language）
await fetch(url, {
  method: 'POST', credentials: 'include',
  headers: { ...所有 header, 'x-twitter-client-language': 'en' },
  body,
});
// 结果：404
```

**结论**：**即使完全脱离扩展环境，在页面 Console 中手动发送的 CreateBookmark 请求也返回 404。** 这证明问题不在扩展的实现方式，而在于我们构造的请求缺少 Twitter 服务端验证所需的某个要素。

#### 第 6 轮：链路重构（v0.0.8，2026-02-10）

**策略**：绕过 `CreateBookmark`，改为直接调用 `bookmarkTweetToFolder(tweet_id, folder_id)`。

**代码改动**：
- `src/content/index.js`：删除“先 `CreateBookmark` 再 `bookmarkTweetToFolder`”两阶段链路，改为单请求直达。
- `src/background/index.js`：`PREPARE_BOOKMARK` 不再强依赖 `CreateBookmark`（也不再强依赖 `DeleteBookmark`）hash。
- `src/popup/popup.js`：Hash 就绪检查移除 `CreateBookmark` 必选项，避免误报“未就绪”。

**预期收益**：
- 避开 `CreateBookmark` 专项风控，降低 404 触发概率。
- 收藏流程从 2 次写请求减少为 1 次，请求链路更短。

**验证结果（2026-02-10）**：
1. `bookmarkTweetToFolder` 直连收藏可用。
2. 跨天后自动创建新日期文件夹已验证成功。
3. 日期逻辑已统一为本地日期，避免 UTC/本地错位。

### 当前结论

| 对比项 | Twitter 原生请求 | 我们的请求 |
|--------|-----------------|-----------|
| URL | `POST /i/api/graphql/{hash}/CreateBookmark` | 相同 ✅ |
| hash (queryId) | `aoDbu3RHznuiSkQ9aNM67Q` | 相同 ✅ |
| Body | `{"variables":{"tweet_id":"..."},"queryId":"..."}` | 相同 ✅ |
| authorization | Bearer token | 相同 ✅ |
| x-csrf-token (ct0) | 从 cookie 获取 | 相同 ✅ |
| x-twitter-auth-type | OAuth2Session | 相同 ✅ |
| x-twitter-active-user | yes | 相同 ✅ |
| content-type | application/json | 相同 ✅ |
| cookie | 自动携带 | 自动携带 ✅ |
| **x-client-transaction-id** | **可能有**（webRequest 可能未完整捕获） | **缺失** ❌ |
| 结果 | 200 | 404 |

**最可能的根因**：Twitter 对 `CreateBookmark`（以及可能的 `DeleteBookmark`、`bookmarkTweetToFolder`）等关键写操作强制校验 `x-client-transaction-id` header。该 header 的生成算法：

1. 从 Twitter 主页 HTML 中提取密钥
2. 从 `ondemand.s` JavaScript 文件中提取计算逻辑
3. 基于请求路径和 HTTP 方法动态计算
4. 结果为 Base64 编码的签名

该算法已被逆向工程（参考 `isarabjitdhiman/XClientTransaction` Python 库），但：
- 实现复杂（需要解析 HTML + JS 文件）
- 密钥随 Twitter 前端部署变化
- 在 Chrome 扩展中实现有一定工程难度

**未解之谜**：`createBookmarkFolder` 也是 POST 写操作，但不需要 `x-client-transaction-id` 就能成功。说明 Twitter 对不同 endpoint 有不同的校验级别。

### 可能的解决方向

1. **实现 `x-client-transaction-id` 生成算法**
   - 参考 `isarabjitdhiman/XClientTransaction`（Python）移植到 JavaScript
   - 需要在扩展启动时获取 Twitter 主页 HTML 和 ondemand.s 文件
   - 复杂度高，但最彻底

2. **在 injected.js 中劫持 Twitter 内部的 fetch wrapper**
   - 在 main world 中拦截 Twitter 的模块系统，获取其内部 fetch 函数引用
   - 复杂度高，且依赖 Twitter 的内部实现细节

3. **模拟 DOM 交互**
   - 不调用 API，而是程序化点击推文上的书签按钮
   - 完全复用 Twitter 自己的 UI 和 API 调用链
   - 最可靠，但操作流程更复杂（需要打开弹窗、选择文件夹等）

4. **使用 `chrome.debugger` API**
   - 通过 Chrome DevTools Protocol 发送请求，可能绕过限制
   - 需要用户授权调试权限，体验较差

5. **从 webRequest 中捕获 Twitter 实际请求的 `x-client-transaction-id` 并复用**
   - 在用户手动操作时捕获，缓存供后续使用
   - 问题：每个请求的 ID 可能不同（基于路径签名），且 Twitter 可能检测重复使用

6. **（已实施）调整收藏链路：直接调用 `bookmarkTweetToFolder`**
   - 优点：不依赖 `CreateBookmark`，实现快，改动小
   - 风险：需要真实流量验证该接口在未收藏状态下是否可直接生效

---

## 已验证的 Twitter API 响应格式

### BookmarkFoldersSlice 响应
```
data.viewer.user_results.result.bookmark_collections_slice.items[]
  → { id, name, media: { ... } }
```

### createBookmarkFolder 响应
```
data.bookmark_collection_create
  → { id, name, media: { ... } }
```

### bookmarkTweetToFolder 请求体
```json
{
  "variables": {
    "bookmark_collection_id": "文件夹ID",
    "tweet_id": "推文ID"
  },
  "queryId": "hash"
}
```

---

## 架构演变

```
v0.0.1  Background 直接 fetch API（所有请求 404 — cookie 不随 SW fetch 发送）
  ↓
v0.0.3  Content Script 直接 fetch API（GET 成功，CreateBookmark POST 404）
  ↓
v0.0.6  Injected Script (main world) + fetch（CreateBookmark POST 仍然 404）
  ↓
v0.0.7  Injected Script (main world) + XHR（CreateBookmark POST 仍然 404）
        手动 Console 测试也 404 — 确认问题在请求构造层面，非扩展实现问题
  ↓
v0.0.8  收藏链路重构：bookmarkTweetToFolder 直连（绕过 CreateBookmark）
        已实测可用
  ↓
v0.0.9  日期逻辑统一为本地日期（bookmarked/folders/stats）+ 清理调试日志
```

当前架构：
```
用户快捷键 → Content Script → CustomEvent → injected.js (main world, XHR) → Twitter API
                ↕ (chrome.runtime.sendMessage)
           Background (hash管理、文件夹缓存、撤销栈、统计)
```

---

## 文件结构

```
TweetSift/
├── docs/
│   ├── DESIGN.md              # 技术方案文档
│   └── DEVLOG.md              # 本文件 — 开发日志
├── src/
│   ├── manifest.json          # MV3 manifest 源文件（version 占位）
│   ├── icons/                 # 图标源文件
│   │   ├── icon16.png / icon16-gray.png
│   │   ├── icon48.png / icon48-gray.png
│   │   └── icon128.png / icon128-gray.png
│   ├── background/
│   │   ├── index.js           # Service Worker 入口
│   │   ├── hash-watcher.js    # query hash 动态提取
│   │   ├── folders.js         # 文件夹命名工具
│   │   ├── auth.js            # （已弃用）
│   │   └── twitter-api.js     # （已弃用）
│   ├── content/
│   │   ├── index.js           # Content Script 入口
│   │   ├── api.js             # API 调用层（通过 injected.js）
│   │   ├── injected.js        # 注入 main world 的 XHR 脚本
│   │   ├── content.css        # 注入样式
│   │   ├── viewport.js        # 视口检测
│   │   ├── extractor.js       # 推文数据提取
│   │   ├── classifier.js      # 自动分类器
│   │   ├── models.js          # 模型关键词库
│   │   ├── highlight.js       # 高亮 + 标签
│   │   └── toast.js           # Toast 通知
│   └── popup/
│       ├── popup.html
│       ├── popup.css
│       └── popup.js
├── dist/                      # 构建产物（npm run build 生成）
├── esbuild.config.js          # 构建配置（含版本号管理）
├── package.json
└── package-lock.json
```
