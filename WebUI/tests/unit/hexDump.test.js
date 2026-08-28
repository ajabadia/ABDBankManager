import { describe, it, expect } from 'vitest';
import { compactHex, spacedHex, hexDump, byteCount } from '../../src/core/hexDump.js';

describe('hexDump utils', () => {
  it('compactHex renders contiguous hex pairs', () => {
    expect(compactHex(new Uint8Array([0xF0, 0x00, 0x20, 0x32, 0x0A]))).toBe('F00020320A');
  });

  it('compactHex accepts arrays and ArrayBuffers', () => {
    expect(compactHex([0xF0, 0x7F])).toBe('F07F');
    expect(compactHex(new Uint8Array([0xF0, 0x7F]).buffer)).toBe('F07F');
  });

  it('compactHex handles null/undefined as empty', () => {
    expect(compactHex(null)).toBe('');
    expect(compactHex(undefined)).toBe('');
    expect(compactHex(new Uint8Array(0))).toBe('');
  });

  it('spacedHex renders space-separated hex', () => {
    expect(spacedHex([0xF0, 0x00, 0x20])).toBe('F0 00 20');
  });

  it('spacedHex pads single-digit bytes', () => {
    expect(spacedHex([0x05, 0x7])).toBe('05 07');
  });

  it('byteCount returns normalized length', () => {
    expect(byteCount([1, 2, 3])).toBe(3);
    expect(byteCount(null)).toBe(0);
  });
});

describe('hexDump', () => {
  it('returns empty string for empty input', () => {
    expect(hexDump(new Uint8Array(0))).toBe('');
    expect(hexDump(null)).toBe('');
  });

  it('produces aligned classic layout with offset, hex and ASCII', () => {
    const dump = hexDump(new Uint8Array([0xF0, 0x00, 0x20, 0x32, 0x00, 0x01, 0x24, 0x00, 0x77, 0x7C, 0x00, 0xF7]));
    const lines = dump.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0].startsWith('00000000  F0 00 20 32 00 01 24 00  77 7C 00 F7')).toBe(true);
    expect(lines[0]).toContain('|.. 2..$.w|..');
  });

  it('splits data across multiple lines with incrementing offsets', () => {
    const bytes = new Uint8Array(20).map((_, i) => i);
    const lines = hexDump(bytes, { bytesPerLine: 8 }).split('\n');
    expect(lines).toHaveLength(3); // 20 bytes / 8 per line = 3 lines
    expect(lines[0].startsWith('00000000')).toBe(true);
    expect(lines[1].startsWith('00000008')).toBe(true);
    expect(lines[2].startsWith('00000010')).toBe(true);
  });

  it('renders non-printable bytes as dots in the ASCII column', () => {
    const dump = hexDump(new Uint8Array([0x00, 0x41, 0xFF]));
    expect(dump).toContain('|.A.');
  });

  it('keeps offsets wide enough for large buffers', () => {
    const bytes = new Uint8Array(500);
    const firstLine = hexDump(bytes).split('\n')[0];
    expect(firstLine.startsWith('00000000')).toBe(true);
    const lastLine = hexDump(bytes).split('\n').pop();
    expect(lastLine.startsWith('000001f0')).toBe(true);
  });

  it('zero-pads a short final line so columns stay aligned', () => {
    const dump = hexDump(new Uint8Array(17), { bytesPerLine: 16 });
    const lines = dump.split('\n');
    expect(lines).toHaveLength(2);
    const [first, second] = lines;
    expect(second.startsWith('00000010')).toBe(true);
    expect(second).toContain('|.');
    // Columnar alignment: all lines must be exactly the same width
    expect(first).toHaveLength(second.length);
  });
});