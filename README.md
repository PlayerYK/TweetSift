# TweetSift 推文筛子

Chrome 扩展，在 Twitter/X Timeline 上用快捷键将推文快速收藏到分类文件夹。

## 使用前提

- 需要 Twitter/X 账号具备「书签文件夹」权限（通常为 Premium/Blue 权限）。
- 若账号没有该权限，Twitter API 无法创建或写入书签文件夹，TweetSift 的分类入夹功能将不可用。

## 快捷键

| 键 | 操作 |
|----|------|
| `` ` `` | 确认推荐分类 |
| `1` | 📹 视频 |
| `2` | 🍌 Nano |
| `3` | 🖼️ 图片 |
| `z` | ↩️ 撤销 |

## 开发

```bash
npm install
npm run build    # 构建
npm run watch    # 监听模式
```

加载 `dist/` 目录到 `chrome://extensions/`（开发者模式）。

## 文档

- [技术方案](docs/DESIGN.md)
- [开发日志](docs/DEVLOG.md)
