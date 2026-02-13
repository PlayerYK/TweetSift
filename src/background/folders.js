// src/background/folders.js
// 文件夹命名工具 — 仅负责生成文件夹名称
// 实际文件夹创建/查询 API 调用由 Content Script 发起

// 分类到文件夹后缀的映射
const CATEGORY_SUFFIX = {
  1: '视频',
  2: 'Nano',
  3: '图片',
};

/**
 * 获取今日日期字符串 yyMMDD
 */
function getTodayPrefix() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/**
 * 生成文件夹名称
 * @param {number} category - 1=视频, 2=Nano, 3=图片
 * @returns {string} 如 "260210-视频"
 */
export function getFolderName(category) {
  const prefix = getTodayPrefix();
  const suffix = CATEGORY_SUFFIX[category];
  return `${prefix}-${suffix}`;
}
