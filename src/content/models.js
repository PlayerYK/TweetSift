// src/content/models.js
// 模型关键词库 — 用于推文自动分类

// ── 视频生成模型 ──
// 使用正则匹配以支持版本号变体
export const VIDEO_MODEL_PATTERNS = [
  { name: 'Veo',          pattern: /\b[Vv][Ee][Oo][-\s]*(\d+(?:\.\d+)?)?/i },
  { name: 'Sora',         pattern: /\b[Ss][Oo][Rr][Aa]\s*(\d+(?:\.\d+)?)?/i },
  { name: 'Kling',        pattern: /\b[Kk][Ll][Ii][Nn][Gg](?:_?[Aa][Ii])?[-\s]*(\d+(?:\.\d+)?)?/i },
  { name: 'Pika',         pattern: /\b[Pp][Ii][Kk][Aa][-\s]*(\d+(?:\.\d+)?)?/i },
  { name: 'PixVerse',     pattern: /\b[Pp][Ii][Xx][Vv][Ee][Rr][Ss][Ee][-\s]*[Vv]?[-\s]*(\d+(?:\.\d+)?)?/i },
  { name: 'Runway Gen',   pattern: /\b[Rr][Uu][Nn][Ww][Aa][Yy](?:\s*[Gg][Ee][Nn][-\s]*)?(\d+(?:\.\d+)?)?/i },
  { name: 'Luma Ray',     pattern: /\b[Ll][Uu][Mm][Aa][-\s]*[Rr][Aa][Yy][-\s]*(\d+(?:\.\d+)?)?/i },
  { name: 'Luma',         pattern: /\b[Ll][Uu][Mm][Aa](?:\s+[Dd]ream\s+[Mm]achine)?[-\s]*(\d+(?:\.\d+)?)?/i },
  { name: 'LTX',          pattern: /\b[Ll][Tt][Xx][-\s]*([Pp]ro|\d+(?:\.\d+)?)?/i },
  { name: 'Wan',          pattern: /(?:\b[Ww][Aa][Nn]|万相)[-\s]*(\d+(?:\.\d+)?)?/i },
  { name: 'Grok Imagine', pattern: /\b[Gg][Rr][Oo][Kk](?:\s+[Ii]magine)?[-\s]*(\d+(?:\.\d+)?)?/i },
  { name: 'Seedance',     pattern: /\b[Ss][Ee][Ee][Dd][Aa][Nn][Cc][Ee][-\s]*(\d+(?:\.\d+)?(?:\s*[Pp]ro)?)?/i },
  { name: 'Hailuo',       pattern: /(?:\b[Hh][Aa][Ii][Ll][Uu][Oo]|海螺)[-\s]*(\d+(?:\.\d+)?)?/i },
];

// ── Nano Banana Pro（特殊分类，独立文件夹）──
export const NANO_KEYWORDS = [
  'nano-banana', 'nanobanana', 'nano banana',
  'nano banana pro', 'nano-banana pro', 'nanobanana pro',
  'gemini', 'nanobana', 'gemini ai',
];

// ── 图片生成模型 ──
// key: 标准模型名, value: 关键词数组（lowercase）
export const IMAGE_MODELS = {
  'Nano Banana Pro':     NANO_KEYWORDS,
  'ChatGPT Image':       ['chatgpt', 'gpt4o', 'gpt-4o', 'chat gpt'],
  'DALL-E':              ['dall-e', 'dalle', 'dall\u00B7e', 'dall e'],
  'Midjourney':          ['midjourney', 'mid journey'],
  'Stable Diffusion XL': ['sdxl', 'sd xl', 'stable diffusion xl', 'sd-xl'],
  'Stable Diffusion':    ['stable diffusion', 'stable-diffusion'],
  'Flux':                ['flux 2 pro', 'flux2 pro', 'flux2pro', 'flux 2', 'flux2', 'flux.1', 'flux'],
  'Grok Imagine':        ['grok', 'imagen', 'grok image', 'grok ai', 'imagine'],
  'Ideogram':            ['ideogram', 'ideogram 3.0', 'ideogram 3'],
  'Recraft':             ['recraft', 'recraft v3'],
  'Seedream':            ['seedream', 'seedream 4'],
  'Qwen Image':          ['qwen-image', 'qwen image'],
  'Hunyuan':             ['hunyuan', 'hunyuan-dit'],
  'Wan':                 ['wan 2.2', 'wan2.2', 'wan2.2-image'],
  'Kling':               ['kling 2.6', 'kling2.6', 'kling ai', 'kling-ai', 'kling ai 2', 'kling'],
  'Meta AI':             ['meta ai', 'meta ai image'],
};

// 所有图片模型关键词（扁平化，用于快速检查是否包含任何图片模型）
export const ALL_IMAGE_KEYWORDS = Object.values(IMAGE_MODELS).flat();
