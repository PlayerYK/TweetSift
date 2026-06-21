# TweetSift

TweetSift is a Chrome extension for quickly saving posts on Twitter/X into dated bookmark folders with keyboard shortcuts.

TweetSift 是一个 Chrome 扩展，用快捷键把 Twitter/X 上的帖子快速保存到按日期命名的书签文件夹里。

It is designed for people who triage a lot of AI, image, and video posts and want a fast local workflow: classify the current post, save it to today's folder, and optionally export folders as JSON.

它适合需要大量筛选 AI、图片、视频帖子的用户：对当前帖子分类，保存到今天的文件夹，并可按需导出书签文件夹为 JSON。

> TweetSift is an independent project and is not affiliated with X Corp. or Twitter.
>
> TweetSift 是独立项目，与 X Corp. 或 Twitter 没有关联。

## Features / 功能

- Save the current post to a dated bookmark folder with one key.
- 用一个快捷键把当前帖子保存到当天的分类书签文件夹。
- Show lightweight recommendations for Video, Nano, and Image posts.
- 对 Video、Nano、Image 类型帖子显示轻量推荐。
- Create daily folders automatically, such as `260621-Nano`.
- 自动创建当天文件夹，例如 `260621-Nano`。
- Remove the current post from bookmarks with `z`.
- 用 `z` 从书签中移除当前帖子。
- Export selected bookmark folders to JSON.
- 将选中的书签文件夹导出为 JSON。
- Keep status, counters, and captured X web operation hashes in local browser storage.
- 将状态、计数器和捕获到的 X Web 操作 hash 保存在浏览器本地存储中。

## Requirements / 使用前提

- Chrome or another Chromium browser with Manifest V3 support.
- Chrome 或其他支持 Manifest V3 的 Chromium 浏览器。
- A Twitter/X account that has Bookmark Folders access, usually through Premium/Blue.
- Twitter/X 账号需要具备书签文件夹权限，通常来自 Premium/Blue。
- You must be logged in to `x.com` or `twitter.com`.
- 需要已登录 `x.com` 或 `twitter.com`。

If your account cannot create or write bookmark folders, TweetSift cannot perform folder-based categorization.

如果账号不能创建或写入书签文件夹，TweetSift 的分类入夹功能将不可用。

## Install From Source / 从源码安装

```bash
npm install
npm run build
```

Then open `chrome://extensions/`, enable Developer mode, choose "Load unpacked", and select the generated `dist/` directory.

然后打开 `chrome://extensions/`，启用开发者模式，选择“加载已解压的扩展程序”，并选择生成的 `dist/` 目录。

`npm run build` increments the patch version in `package.json` and writes that version into `dist/manifest.json`. Use `npm run watch` during development if you do not want to bump the version.

`npm run build` 会递增 `package.json` 里的 patch 版本，并写入 `dist/manifest.json`。开发时如果不想改版本号，请使用 `npm run watch`。

## Usage / 使用方法

Open Twitter/X and browse a supported page such as Home, a profile, or a post detail page. TweetSift acts on the post closest to the center of the viewport.

打开 Twitter/X，浏览 Home、个人主页或帖子详情页等支持页面。TweetSift 会作用于最接近视口中心的帖子。

| Key / 按键 | Action / 操作 |
| --- | --- |
| `` ` `` | Save using the current recommendation / 使用当前推荐分类保存 |
| `1` | Save to today's Nano folder / 保存到今天的 Nano 文件夹 |
| `2` | Save to today's Video folder / 保存到今天的 Video 文件夹 |
| `3` | Save to today's Image folder / 保存到今天的 Image 文件夹 |
| `z` | Remove the current post from bookmarks / 从书签中移除当前帖子 |

Shortcuts are ignored while typing in inputs, textareas, or editable text boxes.

当焦点在输入框、文本区域或可编辑文本区域里时，快捷键不会触发。

## First Run And API Status / 首次使用与 API 状态

TweetSift watches the X web app while you browse and stores the operation hashes it needs in `chrome.storage.local`. If the popup reports missing core hashes, click the `?` button in the popup and perform the listed X actions once so the extension can capture fresh values.

TweetSift 会在你浏览 X 网页时观察相关 Web 操作，并把所需 operation hash 存到 `chrome.storage.local`。如果 popup 提示缺少核心 hash，点击 popup 里的 `?` 按钮，按提示在 X 上手动执行一次对应操作，让扩展捕获最新值。

Hashes can expire when X changes its web client. Use "Clear Hash Cache" in the popup and repeat the capture steps when actions start failing with hash-related errors.

X 更新网页客户端后 hash 可能失效。如果出现 hash 相关错误，请在 popup 中点击 "Clear Hash Cache"，再重新执行捕获步骤。

## Export / 导出

The popup can load your bookmark folders and export selected folders as JSON files. Exported data may include post text, URLs, media URLs, public author profile fields, counts, and timestamps.

popup 可以加载你的书签文件夹，并将选中的文件夹导出为 JSON。导出数据可能包含帖子文本、链接、媒体链接、公开作者资料字段、计数和时间戳。

The optional debug export is only for troubleshooting missing author data. It can contain raw X GraphQL tweet fragments, so keep `*.debug.json` files private and do not commit them.

可选的 debug 导出只用于排查作者信息缺失问题，可能包含原始 X GraphQL 帖子片段。请把 `*.debug.json` 视为私人数据，不要提交到仓库。

## Privacy And Permissions / 隐私与权限

TweetSift runs locally in your browser. It does not send your data to any TweetSift server.

TweetSift 在你的浏览器本地运行，不会把数据发送到任何 TweetSift 服务器。

- `storage`: stores settings, local counters, captured operation hashes, and today's local bookmark cache.
- `storage`：保存设置、本地计数、捕获到的 operation hash，以及当天的本地书签缓存。
- `webRequest`: observes X GraphQL request URLs so the extension can keep operation hashes up to date.
- `webRequest`：观察 X GraphQL 请求 URL，用于保持 operation hash 更新。
- `https://x.com/*` and `https://twitter.com/*`: runs the content script and performs bookmark/folder actions while you are logged in.
- `https://x.com/*` 和 `https://twitter.com/*`：运行 content script，并在你已登录时执行书签和文件夹操作。
- `https://publish.twitter.com/*`: uses the public oEmbed endpoint to repair missing author names during export.
- `https://publish.twitter.com/*`：在导出时调用公开 oEmbed endpoint，用于补全缺失的作者名称和用户名。

The extension reads the page-accessible `ct0` CSRF cookie from the current X page and uses your existing browser session to perform actions as you. It does not ask for or store your password. The Bearer token in the source is the public token embedded by the X/Twitter web client, not a private API key.

扩展会读取当前 X 页面可访问的 `ct0` CSRF cookie，并使用你浏览器里已有的登录会话代表你执行操作。它不会要求或保存你的密码。源码中的 Bearer token 是 X/Twitter 网页客户端内置的公开 token，不是私人 API key。

## Limitations / 限制

- X can change its DOM or web endpoints at any time, which may break extraction, highlighting, hash capture, or export.
- X 随时可能修改 DOM 或 Web endpoint，导致提取、高亮、hash 捕获或导出失效。
- Folder actions require Bookmark Folders access on your account.
- 文件夹操作要求账号具备书签文件夹权限。
- Popup stats are local TweetSift activity counters, not a server-side truth from X.
- popup 统计是 TweetSift 本地活动计数，不是 X 服务端真实统计。
- Export is rate-limited with delays and may still fail if X throttles or changes response shapes.
- 导出流程带有延迟以降低请求频率，但如果 X 限流或修改响应结构，仍可能失败。

## Development / 开发

```bash
npm run watch
npm run build
npm run clean
```

Generated files live in `dist/` and should not be committed. Private exports should go in `exports/` or outside the repository.

生成文件位于 `dist/`，不应提交。私人导出数据请放到 `exports/` 或仓库外部。

## Docs / 文档

- [Technical Design](docs/DESIGN.md)
- [Bookmark State And Deduplication](docs/BOOKMARK-DEDUP.md)
- [Development Notes](docs/DEVLOG.md)

## License / 许可证

MIT. You may use, copy, modify, merge, publish, distribute, sublicense, and sell copies of the software, as long as the copyright and license notice are preserved.

MIT。你可以免费使用、复制、修改、合并、发布、分发、再授权和销售本软件副本，但必须保留版权声明和许可证声明。
