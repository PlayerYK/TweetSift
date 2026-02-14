# TweetSift

Chrome extension for quickly bookmarking tweets into categorized folders on Twitter/X Timeline using keyboard shortcuts.

Chrome 扩展，在 Twitter/X Timeline 上用快捷键将推文快速收藏到分类文件夹。

## Prerequisites / 使用前提

- Requires a Twitter/X account with "Bookmark Folders" permission (typically Premium/Blue).
- If your account lacks this permission, the Twitter API cannot create or write to bookmark folders, and TweetSift's folder-based categorization will not work.

- 需要 Twitter/X 账号具备「书签文件夹」权限（通常为 Premium/Blue）。
- 若账号没有该权限，Twitter API 无法创建或写入书签文件夹，分类入夹功能将不可用。

## Shortcuts / 快捷键

| Key | Action |
|-----|--------|
| `` ` `` | Accept recommendation / 确认推荐 |
| `1` | 🍌 Nano |
| `2` | 📹 Video / 视频 |
| `3` | 🖼️ Image / 图片 |
| `z` | ↩️ Undo / 撤销 |

## Development / 开发

```bash
npm install
npm run build    # Build / 构建
npm run watch    # Watch mode / 监听模式
```

Load the `dist/` directory in `chrome://extensions/` (Developer mode).

加载 `dist/` 目录到 `chrome://extensions/`（开发者模式）。

## Docs / 文档

- [Design](docs/DESIGN.md)
- [Dev Log](docs/DEVLOG.md)
