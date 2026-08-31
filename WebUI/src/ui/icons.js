/**
 * ABD Bank Manager — SVG Icon System
 * Monochrome icons that adapt to CSS theme variables.
 * Usage: <span class="icon">${icons.download}</span>
 * Color via: .icon { color: var(--text-secondary); }
 */

// Helper: wrap SVG string in a span for inline use
function icon(svg) {
  return `<span class="icon" aria-hidden="true">${svg}</span>`;
}

// ─── Navigation ───

export const arrowLeft = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg>`);
export const arrowDown = icon(`<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l4 4 4-4"/></svg>`);
export const arrowRight = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>`);
export const arrowUp = icon(`<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8l4-4 4 4"/></svg>`);
export const chevronDown = icon(`<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5l3 3 3-3"/></svg>`);
export const chevronRight = icon(`<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 2l3 3-3 3"/></svg>`);

// ─── Actions ───

export const download = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5M2 13h12"/></svg>`);
export const upload = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 11V2M4.5 4.5L8 1l3.5 3.5M2 13h12"/></svg>`);
export const importIcon = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v8M5 7l3 3 3-3M2 12v2h12v-2"/></svg>`);
export const exportIcon = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10V2M5 5l3-3 3 3M2 12v2h12v-2"/></svg>`);
export const save = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 14H3.5A1.5 1.5 0 012 12.5v-9A1.5 1.5 0 013.5 2h7.586a1.5 1.5 0 011.06.44l1.415 1.414A1.5 1.5 0 0114 4.914V12.5a1.5 1.5 0 01-1.5 1.5z"/><path d="M11 14V9H5v5M5 2v3h4"/></svg>`);
export const edit = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/></svg>`);
export const trash = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4M12.667 4v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z"/></svg>`);
export const close = icon(`<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l8 8M11 3l-8 8"/></svg>`);

// ─── Status / Indicators ───

export const warning = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7.127 2.133a1.5 1.5 0 011.746 0l5.39 3.467A1.5 1.5 0 0114.5 6.81v5.38a1.5 1.5 0 01-.763 1.31l-5.39 3.466a1.5 1.5 0 01-1.746 0L1.208 13.5A1.5 1.5 0 01.445 12.19V6.81a1.5 1.5 0 01.763-1.31l5.39-3.467z"/><path d="M8 6v3M8 11.5v.01"/></svg>`);
export const lock = icon(`<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="8" height="7" rx="1"/><path d="M5 6V4a2 2 0 114 0v2"/></svg>`);
export const link = icon(`<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 8.5l3-3M4.2 6.3a3 3 0 000 4.243l.707.707a3 3 0 004.243 0l.707-.707a3 3 0 000-4.243M9.8 7.7a3 3 0 000-4.243l-.707-.707a3 3 0 00-4.243 0L4.14 3.66a3 3 0 000 4.243"/></svg>`);
export const user = icon(`<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="4.5" r="2.5"/><path d="M2.5 12.5c0-2.485 2.015-4.5 4.5-4.5s4.5 2.015 4.5 4.5"/></svg>`);

// ─── Files / Content ───

export const folder = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5A1.5 1.5 0 013.5 2h2.879a1.5 1.5 0 011.06.44l.872.871a1.5 1.5 0 001.06.44H12.5A1.5 1.5 0 0114 5.207V12.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-9z"/></svg>`);
export const file = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 1.5h4v4"/><path d="M13.5 1.5L7.5 7.5"/><path d="M3.5 1.5h-1a1 1 0 00-1 1v11a1 1 0 001 1h9a1 1 0 001-1V6.5"/></svg>`);
export const clipboard = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 1.5h-2a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1v-12a1 1 0 00-1-1h-2"/><rect x="5.5" y="0.5" width="4" height="3" rx="0.5"/></svg>`);
export const image = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="12" height="10" rx="1"/><circle cx="5" cy="6" r="1.5"/><path d="M14 10l-3-3-4 4-2-2-3.5 3.5"/></svg>`);

// ─── Music / Synth ───

export const keyboard = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="14" height="8" rx="1"/><path d="M4 4v4M7 4v4M10 4v4M13 4v4M2.5 8v3M5.5 8v3M8.5 8v3M11.5 8v3"/></svg>`);
export const music = icon(`<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 1.5v8.733a2.5 2.5 0 11-1.5-2.3V3.5L4 5v7.233a2.5 2.5 0 11-1.5-2.3V2.5l7.5-1z"/></svg>`);
export const tree = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v12M4 6h8M4 10h8M4 14h8"/></svg>`);

// ─── Search ───

export const search = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10l3.5 3.5"/></svg>`);

// ─── Comparison ───

export const compare = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v12M12 2v12M1 5h6M9 11h6"/></svg>`);
export const swap = icon(`<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h10M9 1l3 3-3 3M12 10H2M5 7l-3 3 3 3"/></svg>`);

// ─── Favorite ───

export const star = icon(`<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 1.5l1.763 3.573L13 5.764l-3 2.924.708 4.13L7 10.997l-3.708 1.82L4 8.688 1 5.764l4.237-.691L7 1.5z"/></svg>`);
export const starOutline = icon(`<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 1.5l1.763 3.573L13 5.764l-3 2.924.708 4.13L7 10.997l-3.708 1.82L4 8.688 1 5.764l4.237-.691L7 1.5z"/></svg>`);

// ─── Camera ───

export const camera = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 2.5h-2a1 1 0 00-1 1v9a1 1 0 001 1h10a1 1 0 001-1v-9a1 1 0 00-1-1h-2"/><circle cx="8" cy="7.5" r="2.5"/></svg>`);

// ─── MIDI ───

export const midi = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="5" height="10" rx="0.5"/><rect x="10" y="1" width="5" height="12" rx="0.5"/><path d="M6 7h4"/></svg>`);

// ─── Misc ───

export const specs = icon(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="1.5" width="12" height="13" rx="1"/><path d="M5 5h6M5 8h6M5 11h3"/></svg>`);
export const dropZone = icon(`<svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4v16M10 14l6 6 6-6"/><path d="M4 22v6h24v-6"/></svg>`);

// ─── Icon map (for dynamic lookup) ───

export const icons = {
  arrowLeft, arrowDown, arrowRight, arrowUp,
  chevronDown, chevronRight,
  download, upload, importIcon, exportIcon, save, edit, trash, close,
  warning, lock, link, user,
  folder, file, clipboard, image,
  keyboard, music, search,
  compare, swap,
  star, starOutline,
  camera, midi, specs, dropZone,
};

export default icons;
