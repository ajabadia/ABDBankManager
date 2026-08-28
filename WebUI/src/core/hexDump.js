/**
 * ABD Bank Manager — Hex dump utilities (pure, no DOM)
 * Formatting helpers for the patch SysEx detail panel.
 */

const ASCII_START = 0x20;
const ASCII_END = 0x7E;

function toHexPair(b) {
  return b.toString(16).padStart(2, '0').toUpperCase();
}

/** Normalize input to a Uint8Array (null/undefined → empty). */
function asBytes(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (Array.isArray(bytes) || ArrayBuffer.isView(bytes)) return new Uint8Array(bytes);
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  return new Uint8Array(0);
}

/** 'F0002032' — contiguous hex, e.g. for clipboard/serialization. */
export function compactHex(bytes) {
  let out = '';
  for (const b of asBytes(bytes)) out += toHexPair(b);
  return out;
}

/** 'F0 00 20 32' — space-separated hex. */
export function spacedHex(bytes) {
  const out = [];
  for (const b of asBytes(bytes)) out.push(toHexPair(b));
  return out.join(' ');
}

/**
 * Classic hexdump: offset column + hex (grouped every 8) + ASCII column.
 *
 * ```
 * 00000000  F0 00 20 32 00 01 24 00 77 7C 00 F7              |.. 2..$.w|.     |
 * ```
 *
 * @param {Uint8Array|number[]|ArrayBuffer|null} bytes
 * @param {{ bytesPerLine?: number }} options
 * @returns {string}
 */
export function hexDump(bytes, { bytesPerLine = 16 } = {}) {
  const data = asBytes(bytes);
  if (data.length === 0) return '';
  const per = Math.max(1, Math.floor(bytesPerLine));
  const half = per / 2;

  const offsetWidth = Math.max(8, data.length.toString(16).length);
  const lines = [];

  for (let start = 0; start < data.length; start += per) {
    const row = [];
    const ascii = [];
    for (let i = 0; i < per; i++) {
      const idx = start + i;
      if (idx < data.length) {
        const b = data[idx];
        row.push(toHexPair(b));
        ascii.push(b >= ASCII_START && b <= ASCII_END ? String.fromCharCode(b) : '.');
      } else {
        row.push('  ');
        ascii.push(' ');
      }
    }

    const hexPart = row.slice(0, half).join(' ');
    const hexPart2 = row.slice(half).join(' ');
    const offset = start.toString(16).padStart(offsetWidth, '0');
    lines.push(
      `${offset}  ${hexPart}  ${hexPart2}  |${ascii.join('')}|`
    );
  }

  return lines.join('\n');
}

/** Number of bytes exactly representable (helper for the detail panel). */
export function byteCount(bytes) {
  return asBytes(bytes).length;
}