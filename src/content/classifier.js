// src/content/classifier.js
// 推文自动分类 — 根据文本和媒体类型推荐分类

import { VIDEO_MODEL_PATTERNS, NANO_KEYWORDS, IMAGE_MODELS } from './models.js';

// 检测视频模型（正则匹配，支持版本号变体）
function matchVideoModel(text) {
  for (const { name, pattern } of VIDEO_MODEL_PATTERNS) {
    if (pattern.test(text)) return name;
  }
  return null;
}

// 检测 Nano Banana Pro（关键词匹配，优先级高于普通图片模型）
function matchNano(text) {
  return NANO_KEYWORDS.some((kw) => text.includes(kw));
}

// 检测图片模型（关键词匹配）
function matchImageModel(text) {
  for (const [name, keywords] of Object.entries(IMAGE_MODELS)) {
    // 跳过 Nano（已在优先级 2 中处理）
    if (name === 'Nano Banana Pro') continue;
    if (keywords.some((kw) => text.includes(kw))) return name;
  }
  return null;
}

/**
 * 对推文进行分类推荐
 * @param {Object} tweetData - extractTweetData 的返回值
 * @returns {Object|null} { category, label, model, confidence } 或 null（不推荐）
 *   category: 1=视频, 2=Nano, 3=图片
 */
export function classifyTweet(tweetData) {
  if (!tweetData) return null;

  const text = (tweetData.text || '').toLowerCase();

  // 检查是否像 prompt（有一定长度、包含描述性文字）
  const looksLikePrompt =
    text.length > 50 ||
    text.includes('prompt') ||
    text.includes('--ar') ||
    text.includes('--v') ||
    text.includes('--style') ||
    /\b(cinematic|portrait|photo of|illustration|hyperrealistic|8k|4k)\b/i.test(text);

  // 优先级 1: 有视频 + 视频模型关键词
  if (tweetData.hasVideo) {
    const model = matchVideoModel(text);
    if (model) {
      return { category: 1, label: '📹 视频', model, confidence: 'high' };
    }
  }

  // 优先级 2: 有图片 + Nano Banana Pro / Gemini
  if (tweetData.hasImage && matchNano(text)) {
    return { category: 2, label: '🍌 Nano', model: 'Nano Banana Pro', confidence: 'high' };
  }

  // 优先级 3: 有图片 + 其他图片模型
  if (tweetData.hasImage) {
    const model = matchImageModel(text);
    if (model) {
      return { category: 3, label: '🖼️ 图片', model, confidence: 'high' };
    }
  }

  // 有媒体但没识别到模型，通过 prompt 特征猜测
  if ((tweetData.hasVideo || tweetData.hasImage) && looksLikePrompt) {
    if (tweetData.hasVideo) {
      return { category: 1, label: '📹 视频?', model: null, confidence: 'low' };
    }
    return { category: 3, label: '🖼️ 图片?', model: null, confidence: 'low' };
  }

  return null; // 不推荐
}
