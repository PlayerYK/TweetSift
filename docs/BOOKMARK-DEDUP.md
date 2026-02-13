# 收藏去重问题分析与方案讨论

> 日期：2026-02-13
> 最后更新：2026-02-13
> 状态：待决策

---

## 问题描述

使用 TweetSift 收藏推文后，在切换页面甚至刷新页面后，已收藏的推文没有被标记出来，导致：

1. 用户看不到哪些推文已经收藏过
2. 重复收藏同一条推文时，推文被放入了新的文件夹（而不是被拦截）
3. 同一条推文可以出现在多个日期文件夹中

---

## 根因分析

### Twitter 原生的两步收藏流程

Twitter 自身的 UI 收藏一条推文到文件夹时，实际上是两步请求：

```
步骤 1: CreateBookmark(tweet_id)                        -> 推文进入"全部书签"池
步骤 2: bookmarkTweetToFolder(tweet_id, folder_id)      -> 推文归入指定文件夹
```

`CreateBookmark` 的关键作用：
- 将推文标记为"已收藏"（服务端状态）
- 触发 Twitter 前端 React 状态更新（书签图标变实心）
- 后续 Timeline 加载时，推文的 `bookmarked` 字段为 `true`，UI 据此渲染实心书签图标
- 用户再次点击已收藏推文的书签按钮时，触发的是"取消收藏"而不是"重复收藏"

### TweetSift 当前的单步流程

我们因为 `CreateBookmark` 遭遇 404（缺少 `x-client-transaction-id`），绕过了它，直接只调用 `bookmarkTweetToFolder`：

```
TweetSift 流程: bookmarkTweetToFolder(tweet_id, folder_id)  -> 推文进入文件夹
                （跳过了 CreateBookmark）
```

### 因果链

```
跳过 CreateBookmark
  -> 推文在 Twitter 服务端未被标记为"已收藏"
    -> Timeline 返回的推文数据中 bookmarked 字段仍为 false
      -> Twitter 前端书签图标始终为空心
        -> Twitter UI 层不做拦截（它认为推文没被收藏过）
          -> 下次再收藏同一推文时，bookmarkTweetToFolder 再次成功
            -> 推文出现在第二个文件夹中
```

### 证据：Twitter 推文数据中包含 bookmarked 字段

通过分析 twikit（Python Twitter API 客户端库）的源码，确认 Twitter GraphQL API 返回的推文对象中确实包含 `bookmarked` 布尔字段：

```python
# twikit/tweet.py - Tweet 类的属性定义
@property
def bookmarked(self) -> bool:
    return self._legacy.get('bookmarked')

@property
def bookmark_count(self) -> int:
    return self._legacy.get('bookmark_count')
```

该字段位于推文数据的 `legacy` 对象中，与 `favorited`（是否点赞）同级。这意味着：

- Twitter 服务端确实维护了一个"书签池"
- 每次加载 Timeline 时，服务端会将推文与当前用户的书签池对比
- 对比结果通过 `bookmarked: true/false` 字段返回给前端
- 前端据此渲染书签图标的状态（实心/空心）

### 关键推论：bookmarkTweetToFolder 不等于 "收藏"

这里需要区分两个概念：

| 概念 | 对应 API | 服务端效果 |
|------|----------|-----------|
| **收藏**（Bookmark） | `CreateBookmark` | 推文进入"书签池"，`bookmarked` 字段变为 `true` |
| **归档到文件夹**（Add to Folder） | `bookmarkTweetToFolder` | 推文进入指定文件夹，但可能不改变 `bookmarked` 状态 |

我们跳过了 `CreateBookmark`，只调用了 `bookmarkTweetToFolder`。推文虽然进了文件夹，但服务端的"书签池"可能并不知道这件事。

**待验证**：`bookmarkTweetToFolder` 是否会自动将推文加入书签池（即隐式触发 `CreateBookmark` 的效果）。如果不会，那就解释了为什么刷新页面后 Twitter 的书签图标仍然是空心的——因为推文从未进入书签池。

这也意味着，Twitter 原生 UI 中 `CreateBookmark` 不仅仅是一个"冗余步骤"，它是让整个书签体系正确工作的关键。

### 我们的去重机制为什么失效

TweetSift 自身有两层去重，但都有缺陷：

| 层级 | 机制 | 缺陷 |
|------|------|------|
| DOM 层 | `tweetsift-bookmarked` CSS class | 页面切换/刷新后 DOM 重建，class 丢失 |
| Storage 层 | `chrome.storage.local` 中的 `bookmarked.tweets` | 只保留当天记录，跨天后清空 |

v0.0.12 已修复 DOM 层的问题（视口回标），但 Storage 层仍然只保留当天。

### bookmarkTweetToFolder 的行为

实测确认：`bookmarkTweetToFolder` 允许同一条推文被放入不同的文件夹，API 不报错。这是 Twitter 书签文件夹的设计——文件夹类似标签，一条书签可以属于多个文件夹。

但在 Twitter 原生 UI 中，用户感知不到这个问题，因为：
1. `CreateBookmark` 先把推文标记为"已收藏"
2. 书签图标变实心后，再次点击触发的是"取消收藏"
3. 用户永远走不到"重复添加到文件夹"这一步

我们绕过了第 1 步，所以第 2、3 步的保护都失效了。

---

## 已完成的改进（v0.0.12）

在讨论过程中，已实施的改动：

1. **视口回标**：推文进入视口时，自动查询 `chrome.storage.local` 回标已收藏状态（绿色边框 + 标签）
2. **重复收藏提示优化**：从红色错误提示改为温和的绿色确认提示
3. **Toast 位置统一**：所有类型的 Toast 从右下角移到页面中上部居中

这些改动解决了"当天内"的重复收藏体验问题，但不解决跨天重复收藏的根因。

---

## 讨论记录与关键推理（2026-02-13）

### 第一轮：初始诊断

最初认为问题是 Twitter 的"离线缓存"导致 UI 不更新。但分析后发现根因更深：TweetSift 的收藏标记和 Twitter 原生的收藏标记是两套完全独立的系统，互不感知。

TweetSift 的标记（DOM class + chrome.storage）在页面切换/刷新后丢失，而 Twitter 前端的 React 状态树从未被通知"这条推文被收藏了"。

### 第二轮：发现 bookmarkTweetToFolder 允许重复

实测发现，以前明显已经收藏过的推文还可以再次收藏到新的文件夹。这与手工操作 Twitter UI 时的体验不一致。

追问：手工点击收藏时 Twitter 会拦截重复，为什么我们不行？

### 第三轮：质疑与深入分析

针对"即使 `CreateBookmark` 能用，也无法阻止 `bookmarkTweetToFolder` 把同一推文放入不同文件夹"这个结论提出质疑：

> "怎么跟我的使用体验不一样呢？以前手工点收藏按钮的时候没有这个问题。"

分析后发现：Twitter 原生 UI 的拦截不是在 API 层面，而是在 **UI 层面**：
1. `CreateBookmark` 让书签图标变实心
2. 用户看到实心图标后，再点击触发的是"取消收藏"
3. 用户根本走不到"重复添加到文件夹"这一步

所以 Twitter 的"去重"其实是 UI 引导，不是 API 拦截。而我们跳过了 `CreateBookmark`，书签图标始终是空心的，UI 引导这层保护就失效了。

### 第四轮：书签池假说

进一步提出假说：

> "这个'书签池'是在服务端的，每次加载推文的时候，都会去池子里对比是否已经收藏了。这个对比，可能有个查询的接口？"

通过分析 twikit 源码验证了这个假说：
- Twitter GraphQL API 返回的每条推文都带有 `legacy.bookmarked` 布尔字段
- 这个字段不需要单独的查询接口，它是 Timeline 数据的一部分
- 服务端在组装 Timeline 响应时自动做了"书签池对比"

这意味着 **不存在一个独立的"查询是否已收藏"接口**，收藏状态是跟着推文数据一起下发的。而这个状态是否为 `true`，取决于推文是否通过 `CreateBookmark` 进入了书签池。

### 核心结论

`CreateBookmark` 是整个书签体系的"入口"，它做的事情不只是"收藏一条推文"，而是：

1. 在服务端将推文标记为"已收藏"（进入书签池）
2. 后续所有 Timeline 响应中该推文的 `bookmarked` 字段变为 `true`
3. 前端据此更新 UI（实心图标），形成"已收藏"的视觉反馈
4. 这个视觉反馈阻止用户再次执行收藏操作

我们跳过了第 1 步，所以 2、3、4 全部断裂。

---

## 可选方案

### 方案 A：扩展侧永久去重

在 `chrome.storage.local` 中持久化所有历史收藏的 tweetId，不再按天清空。

**实现方式**：

```javascript
// 当前实现：只保留当天
bookmarked: {
  date: "2026-02-13",
  tweets: { "tweet_id_1": {...}, "tweet_id_2": {...} }
}

// 方案 A：永久保留，只存 ID Set
bookmarkedHistory: ["tweet_id_1", "tweet_id_2", "tweet_id_3", ...]
```

**优点**：
- 实现简单，改动量小，一小时内可完成
- 不依赖任何新的 Twitter API
- 快速止血，立即生效

**缺点**：
- 只能拦截通过 TweetSift 收藏的推文，手动在 Twitter UI 收藏的不在记录中
- 不解决 Twitter 侧书签图标不更新的问题

**存储估算**：每天 100+ 条，一年约 40,000 条 tweetId（约 20 字节/条），约 800KB。`chrome.storage.local` 容量限制约 10MB，完全没有问题。

---

### 方案 B：攻克 CreateBookmark，恢复两步流程

研究 `x-client-transaction-id` 的生成算法，让 `CreateBookmark` 恢复工作，回到 Twitter 原生的两步收藏流程。

**已知信息**：
- `x-client-transaction-id` 的生成算法已被逆向工程（参考 `isarabjitdhiman/XClientTransaction` Python 库）
- 算法需要：从 Twitter 主页 HTML 提取密钥 + 从 `ondemand.s` JS 文件提取计算逻辑
- 基于请求路径和 HTTP 方法动态计算，结果为 Base64 编码的签名

**优点**：
- 根治问题：Twitter 服务端正确标记"已收藏"，书签图标变实心
- Twitter 自身的 UI 拦截机制生效，所有客户端都能看到正确的收藏状态
- 不需要本地持久化去重

**缺点**：
- 实现复杂度高（需要在扩展中解析 HTML + JS 文件）
- 密钥随 Twitter 前端部署变化，维护成本高
- 有被 Twitter 进一步封锁的风险

---

### 方案 C：读取推文的 bookmarked 字段做实时去重

既然 Twitter Timeline 返回的推文数据中包含 `bookmarked` 字段，可以尝试在推文进入视口时读取这个字段，识别已被收藏的推文。

**可能的实现路径**：

1. **从 DOM 推断**：检查推文上书签按钮的 `aria-label` 或 SVG 图标 path，判断是否已收藏
2. **从 React fiber 读取**：在 main world 中遍历 React fiber tree，找到推文组件的 props/state 中的 `bookmarked` 字段
3. **拦截 Timeline API 响应**：在 injected.js 中 hook XHR/fetch，解析 Timeline 响应中每条推文的 `bookmarked` 字段并缓存

**优点**：
- 能识别所有来源的收藏状态（Twitter 原生 UI + 其他客户端）
- 不需要额外的 API 调用

**缺点**：
- 依赖 Twitter 的 DOM 结构 / 内部实现，稳定性风险
- **关键限制**：由于我们跳过了 `CreateBookmark`，通过 TweetSift 收藏的推文在 Twitter 侧 `bookmarked` 仍为 `false`。此方案只能识别非 TweetSift 渠道的收藏，需要与方案 A 配合才完整。

---

### 方案 D：方案 A + C 组合

- 用方案 A（本地永久去重）拦截所有通过 TweetSift 收藏的推文
- 用方案 C（读取 Twitter 侧 bookmarked 字段）识别通过 Twitter 原生 UI 收藏的推文

**优点**：
- 覆盖面最全：无论通过哪个渠道收藏的推文都能被识别
- 方案 A 部分实现简单

**缺点**：
- 方案 C 部分的实现仍有复杂度和稳定性风险
- 两套机制并行，代码复杂度增加

---

### 方案 E：方案 A（快速止血）+ 方案 B（后续研究）

先实施方案 A 解决当前最紧迫的跨天重复收藏问题，后续有时间再研究攻克 `CreateBookmark`。

**优点**：
- 分阶段实施，风险可控
- 方案 A 可以在一小时内完成
- 方案 B 即使研究失败，方案 A 仍然兜底

**缺点**：
- 方案 A 只能拦截 TweetSift 自身的收藏记录
- Twitter 侧的书签图标问题在方案 B 完成前无法解决

---

## 方案对比

| 维度 | 方案 A | 方案 B | 方案 C | 方案 D | 方案 E |
|------|--------|--------|--------|--------|--------|
| 实现难度 | 低 | 高 | 中 | 中 | 低+高 |
| 完成时间 | 1h | 数天 | 数小时 | 数小时 | 分阶段 |
| 拦截 TweetSift 重复 | 是 | 是 | 否 | 是 | 是 |
| 拦截 Twitter 原生重复 | 否 | 是 | 是 | 是 | 分阶段 |
| Twitter 书签图标更新 | 否 | 是 | 否 | 否 | 分阶段 |
| 维护成本 | 低 | 高 | 中 | 中 | 低+高 |
| 稳定性 | 高 | 中 | 中 | 中 | 高 |

---

## 决策待定

请确认后选择方案，或提出其他思路。
