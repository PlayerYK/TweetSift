// src/content/classifier.js
// Tweet auto-classification — recommend category based on text and media type

import { VIDEO_MODEL_PATTERNS, NANO_KEYWORDS, IMAGE_MODELS } from './models.js';

// Detect video model (regex matching, supports version variants)
function matchVideoModel(text) {
  for (const { name, pattern } of VIDEO_MODEL_PATTERNS) {
    if (pattern.test(text)) return name;
  }
  return null;
}

// Detect Nano Banana Pro (keyword matching, higher priority than generic image models)
function matchNano(text) {
  return NANO_KEYWORDS.some((kw) => text.includes(kw));
}

// Detect image model (keyword matching)
function matchImageModel(text) {
  for (const [name, keywords] of Object.entries(IMAGE_MODELS)) {
    // Skip Nano (handled in priority 2)
    if (name === 'Nano Banana Pro') continue;
    if (keywords.some((kw) => text.includes(kw))) return name;
  }
  return null;
}

/**
 * Classify and recommend a category for a tweet
 * @param {Object} tweetData - return value of extractTweetData
 * @returns {Object|null} { category, label, model, confidence } or null (no recommendation)
 *   category: 1=Video, 2=Nano, 3=Image
 */
export function classifyTweet(tweetData) {
  if (!tweetData) return null;

  const text = (tweetData.text || '').toLowerCase();

  // Check if text looks like a prompt
  const looksLikePrompt =
    text.length > 50 ||
    text.includes('prompt') ||
    text.includes('--ar') ||
    text.includes('--v') ||
    text.includes('--style') ||
    /\b(cinematic|portrait|photo of|illustration|hyperrealistic|8k|4k)\b/i.test(text);

  // Priority 1: has video + video model keywords
  if (tweetData.hasVideo) {
    const model = matchVideoModel(text);
    if (model) {
      return { category: 1, label: '📹 Video', model, confidence: 'high' };
    }
  }

  // Priority 2: has image + Nano Banana Pro / Gemini
  if (tweetData.hasImage && matchNano(text)) {
    return { category: 2, label: '🍌 Nano', model: 'Nano Banana Pro', confidence: 'high' };
  }

  // Priority 3: has image + other image models
  if (tweetData.hasImage) {
    const model = matchImageModel(text);
    if (model) {
      return { category: 3, label: '🖼️ Image', model, confidence: 'high' };
    }
  }

  // Has media but no model detected, guess based on prompt features
  if ((tweetData.hasVideo || tweetData.hasImage) && looksLikePrompt) {
    if (tweetData.hasVideo) {
      return { category: 1, label: '📹 Video?', model: null, confidence: 'low' };
    }
    return { category: 3, label: '🖼️ Image?', model: null, confidence: 'low' };
  }

  return null; // No recommendation
}
