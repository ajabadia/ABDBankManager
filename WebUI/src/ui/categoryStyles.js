/**
 * ABD Bank Manager — Category Styles
 *
 * Central registry for patch category colors and icons.
 * Each category gets a distinct color and a small inline SVG icon.
 */

export const CATEGORIES = [
  'Bass', 'Lead', 'Pad', 'Keys', 'FX', 'Perc', 'Synth', 'UNK'
];

const CATEGORY_MAP = {
  Bass: {
    color: '#e74c3c',
    bg: 'rgba(231, 76, 60, 0.15)',
    icon: `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M6 2a1 1 0 0 0-1 1v3.586l-1.707 1.707A1 1 0 0 0 3 10h2.586l1.707 1.707a1 1 0 0 0 1.414 0L10.414 10H13a1 1 0 0 0 0-2h-2.586L8.707 6.293a1 1 0 0 0-1.414 0L5.586 8H4V3a1 1 0 0 0-1-1H2v12h1v-1h1.586l1.707 1.707a1 1 0 0 0 1.414 0L10.414 13H13v1h1V3h-1v1H3z"/></svg>`
  },
  Lead: {
    color: '#e67e22',
    bg: 'rgba(230, 126, 34, 0.15)',
    icon: `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1a.5.5 0 0 1 .5.5v5.243l1.06-1.06a.5.5 0 0 1 .708.708L8.354 8.854a.5.5 0 0 1-.708 0L5.732 6.991a.5.5 0 0 1 .708-.708L7.5 7.243V1.5A.5.5 0 0 1 8 1z"/><path d="M4 11a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 11zm0 2a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm0 2a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5z"/></svg>`
  },
  Pad: {
    color: '#9b59b6',
    bg: 'rgba(155, 89, 182, 0.15)',
    icon: `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm4 1v1h2v-1H4zm3 0v1h2v-1H7zm3 0v1h2v-1h-2zM4 5v1h2V5H4zm3 0v1h2V5H7zm3 0v1h2V5h-2zM4 7v1h2V7H4zm3 0v1h2V7H7zm3 0v1h2V7h-2zM4 9v1h2V9H4zm3 0v1h2V9H7zm3 0v1h2V9h-2zm-6 2v1h2v-1H4zm3 0v1h2v-1H7zm3 0v1h2v-1h-2z"/></svg>`
  },
  Keys: {
    color: '#3498db',
    bg: 'rgba(52, 152, 219, 0.15)',
    icon: `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M1 14a1 1 0 0 1-1-1V1a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H1zm4-6V3h2v5H5zm3 0V3h2v5H8zm3 0V3h2v5h-2zm-7 4V9h2v3H4zm3 0V9h2v3H7zm3 0V9h2v3h-2z"/></svg>`
  },
  FX: {
    color: '#1abc9c',
    bg: 'rgba(26, 188, 156, 0.15)',
    icon: `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1A.5.5 0 0 1 8 1zm-4.465 1.765a.5.5 0 0 1 .707 0l.707.707a.5.5 0 1 1-.707.707l-.707-.707a.5.5 0 0 1 0-.707zm8.93 0a.5.5 0 0 1 0 .707l-.707.707a.5.5 0 0 1-.707-.707l.707-.707a.5.5 0 0 1 .707 0zM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-3 2a3 3 0 1 1 6 0 3 3 0 0 1-6 0z"/></svg>`
  },
  Perc: {
    color: '#e84393',
    bg: 'rgba(232, 67, 147, 0.15)',
    icon: `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M10.97 4.97a.235.235 0 0 0-.02.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05z"/></svg>`
  },
  Synth: {
    color: '#2ecc71',
    bg: 'rgba(46, 204, 113, 0.15)',
    icon: `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M6.354 5.5H4a3 3 0 0 0 0 6h3a3 3 0 0 0 2.83-4H8.83A2 2 0 0 1 7 9H4a2 2 0 1 1 0-4h1.535a3.037 3.037 0 0 1 2.82-2z"/><path d="M9 5.5a3 3 0 0 0-2.83 4h1.098A2 2 0 0 1 9 7H12a2 2 0 1 1 0 4H8.5a3 3 0 0 0 2.82 2H12a3 3 0 1 0 0-6H9z"/></svg>`
  },
  UNK: {
    color: '#95a5a6',
    bg: 'rgba(149, 165, 166, 0.15)',
    icon: `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H3zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/></svg>`
  }
};

/**
 * Get the style info for a category.
 * @param {string} category
 * @returns {{ color: string, bg: string, icon: string }}
 */
export function getCategoryStyle(category) {
  return CATEGORY_MAP[category] || CATEGORY_MAP.UNK;
}

/**
 * Render a category badge with color and icon.
 * @param {string} category
 * @param {string} [extraClass] - additional CSS class
 * @returns {string} HTML string
 */
export function renderCategoryBadge(category, extraClass = '') {
  const style = getCategoryStyle(category);
  return `<span class="category-badge ${extraClass}" style="color:${style.color};background:${style.bg}">${style.icon} ${escHtml(category)}</span>`;
}

// Minimal escHtml for badge text
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
