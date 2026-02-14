// src/background/folders.js
// Folder naming utility — only responsible for generating folder names.
// Actual folder creation/query API calls are made by Content Script.

// Category to folder suffix mapping
const CATEGORY_SUFFIX = {
  1: 'Video',
  2: 'Nano',
  3: 'Image',
};

/**
 * Get today's date string yyMMDD
 */
function getTodayPrefix() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/**
 * Generate folder name
 * @param {number} category - 1=Video, 2=Nano, 3=Image
 * @returns {string} e.g. "260210-Video"
 */
export function getFolderName(category) {
  const prefix = getTodayPrefix();
  const suffix = CATEGORY_SUFFIX[category];
  return `${prefix}-${suffix}`;
}
