/**
 * SysEx Edge Case Tests
 * Tests for concatenated messages, interleaved MIDI bytes,
 * truncated messages, and corrupt data.
 */

import { describe, it, expect } from 'vitest';
import { splitSysExMessages, parseSysExMessage } from '../../src/core/sysexParser.js';
import { pack8to7, unpack7to8, encodeNibble, decodeNibble, rolandChecksum, yamahaChecksum, casioChecksum, splitSysexMessages } from '@contracts/SysEx/codec';

// ─── splitSysExMessages — Concatenated Messages ───

describe('splitSysExMessages — concatenated SysEx', () => {
  it('splits two back-to-back SysEx messages', () => {
    const msg1 = new Uint8Array([0xF0, 0x43, 0x10, 0x00, 0x09, 0x20, 0x00, ...new Uint8Array(128), 0x00, 0xF7]);
    const msg2 = new Uint8Array([0xF0, 0x43, 0x10, 0x00, 0x09, 0x20, 0x00, ...new Uint8Array(128), 0x01, 0xF7]);
    const raw = new Uint8Array(msg1.length + msg2.length);
    raw.set(msg1);
    raw.set(msg2, msg1.length);

    const msgs = splitSysExMessages(raw);
    expect(msgs).toHaveLength(2);
    expect(msgs[0][0]).toBe(0xF0);
    expect(msgs[0][msgs[0].length - 1]).toBe(0xF7);
    expect(msgs[1][0]).toBe(0xF0);
    expect(msgs[1][msgs[1].length - 1]).toBe(0xF7);
  });

  it('splits three back-to-back SysEx messages', () => {
    const msg = new Uint8Array([0xF0, 0x42, 0x30, 0x58, 0x10, ...new Uint8Array(10), 0xF7]);
    const raw = new Uint8Array(msg.length * 3);
    for (let i = 0; i < 3; i++) raw.set(msg, i * msg.length);

    const msgs = splitSysExMessages(raw);
    expect(msgs).toHaveLength(3);
  });

  it('handles SysEx with no gap between F7 and next F0', () => {
    const raw = new Uint8Array([0xF0, 0x43, 0x10, 0xF7, 0xF0, 0x42, 0x30, 0xF7]);
    const msgs = splitSysExMessages(raw);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual(new Uint8Array([0xF0, 0x43, 0x10, 0xF7]));
    expect(msgs[1]).toEqual(new Uint8Array([0xF0, 0x42, 0x30, 0xF7]));
  });
});

// ─── splitSysExMessages — Interleaved MIDI Data ───

describe('splitSysExMessages — interleaved MIDI bytes', () => {
  it('ignores MIDI Note On/Off between SysEx messages', () => {
    const midiNoteOn = new Uint8Array([0x90, 0x3C, 0x7F]);  // Note On C4
    const midiNoteOff = new Uint8Array([0x80, 0x3C, 0x00]);  // Note Off C4
    const sysex1 = new Uint8Array([0xF0, 0x43, 0x10, 0xF7]);
    const sysex2 = new Uint8Array([0xF0, 0x42, 0x30, 0xF7]);

    const raw = new Uint8Array([
      ...midiNoteOn, ...sysex1, ...midiNoteOff, ...midiNoteOn, ...sysex2
    ]);

    const msgs = splitSysExMessages(raw);
    expect(msgs).toHaveLength(2);
    // First SysEx
    expect(msgs[0]).toEqual(sysex1);
    // Second SysEx
    expect(msgs[1]).toEqual(sysex2);
  });

  it('ignores MIDI Clock (0xF8) between SysEx messages', () => {
    const sysex = new Uint8Array([0xF0, 0x41, 0x10, 0xF7]);

    const raw = new Uint8Array([0xF8, 0xF8, ...sysex, 0xF8, 0xF8, ...sysex]);
    const msgs = splitSysExMessages(raw);
    expect(msgs).toHaveLength(2);
  });

  it('ignores MIDI Control Change between SysEx messages', () => {
    const cc = new Uint8Array([0xB0, 0x07, 0x64]);  // CC 7 (volume) = 100
    const sysex = new Uint8Array([0xF0, 0x44, 0x00, 0xF7]);

    const raw = new Uint8Array([...cc, ...sysex, ...cc, ...sysex]);
    const msgs = splitSysExMessages(raw);
    expect(msgs).toHaveLength(2);
  });

  it('handles SysEx interrupted by MIDI bytes mid-message', () => {
    // When F0 starts a SysEx and another F0 arrives before F7, the parser
    // ignores the second F0 (already inSysEx=true), so the first SysEx
    // absorbs everything until F7 — including the second F0.
    const raw = new Uint8Array([
      0xF0, 0x43, 0x10,  // start SysEx 1
      0x90, 0x3C, 0x7F,  // MIDI Note On (ignored, inside SysEx)
      0xF0, 0x43, 0x10, 0xF7  // second F0 + F7 closes the first SysEx
    ]);
    const msgs = splitSysExMessages(raw);
    // The parser treats everything between first F0 and first F7 as one message
    expect(msgs).toHaveLength(1);
    expect(msgs[0][0]).toBe(0xF0);
    expect(msgs[0][msgs[0].length - 1]).toBe(0xF7);
    // The message includes all bytes between F0 and F7
    expect(msgs[0].length).toBe(raw.length);
  });
});

// ─── splitSysExMessages — Empty and Edge Cases ───

describe('splitSysExMessages — empty and minimal', () => {
  it('returns empty array for empty input', () => {
    expect(splitSysExMessages(new Uint8Array(0))).toEqual([]);
  });

  it('returns empty array for non-SysEx data', () => {
    const midi = new Uint8Array([0x90, 0x3C, 0x7F, 0x80, 0x3C, 0x00]);
    expect(splitSysExMessages(midi)).toEqual([]);
  });

  it('ignores unclosed SysEx (no F7)', () => {
    const raw = new Uint8Array([0xF0, 0x43, 0x10, 0x00]);
    expect(splitSysExMessages(raw)).toEqual([]);
  });

  it('handles minimal valid SysEx (F0 F7)', () => {
    const raw = new Uint8Array([0xF0, 0xF7]);
    const msgs = splitSysExMessages(raw);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toEqual(new Uint8Array([0xF0, 0xF7]));
  });
});

// ─── parseSysExMessage — Truncated Messages ───

describe('parseSysExMessage — truncated messages', () => {
  it('rejects message shorter than 3 bytes', () => {
    const result = parseSysExMessage(new Uint8Array([0xF0, 0x43]));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too short');
  });

  it('rejects empty message', () => {
    const result = parseSysExMessage(new Uint8Array([]));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too short');
  });

  it('rejects null input', () => {
    const result = parseSysExMessage(null);
    expect(result.valid).toBe(false);
  });

  it('rejects message without F0 start byte', () => {
    const result = parseSysExMessage(new Uint8Array([0x43, 0x10, 0x00, 0xF7]));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('F0');
  });

  it('rejects message without F7 end byte', () => {
    const result = parseSysExMessage(new Uint8Array([0xF0, 0x43, 0x10, 0x00]));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('F7');
  });
});

// ─── parseSysExMessage — Corrupt Data ───

describe('parseSysExMessage — corrupt data', () => {
  it('handles all-zeros SysEx payload', () => {
    const msg = new Uint8Array([0xF0, 0x00, 0x00, 0x00, 0xF7]);
    const result = parseSysExMessage(msg);
    // Should not crash — may not identify a model, but is valid SysEx
    expect(result.error).toBeNull();
  });

  it('handles all-0xFF SysEx payload', () => {
    const msg = new Uint8Array([0xF0, 0xFF, 0xFF, 0xFF, 0xFF, 0xF7]);
    const result = parseSysExMessage(msg);
    expect(result.error).toBeNull();
  });

  it('handles random byte sequence wrapped in F0/F7', () => {
    const payload = new Uint8Array(50);
    for (let i = 0; i < 50; i++) payload[i] = Math.floor(Math.random() * 128);
    const msg = new Uint8Array([0xF0, ...payload, 0xF7]);
    const result = parseSysExMessage(msg);
    // Should not crash
    expect(result.error).toBeNull();
  });

  it('handles very long SysEx message (4KB)', () => {
    const payload = new Uint8Array(4096);
    for (let i = 0; i < 4096; i++) payload[i] = i & 0x7F;
    const msg = new Uint8Array([0xF0, 0x43, ...payload, 0xF7]);
    const result = parseSysExMessage(msg);
    expect(result.error).toBeNull();
  });
});

// ─── Packing/Unpacking Edge Cases ───

describe('7-to-8 packing — edge cases', () => {
  it('roundtrips empty input', () => {
    const empty = new Uint8Array(0);
    const packed = pack8to7(empty);
    const unpacked = unpack7to8(packed);
    expect(unpacked.length).toBe(0);
  });

  it('roundtrips 1 byte', () => {
    const data = new Uint8Array([0x42]);
    const packed = pack8to7(data);
    const unpacked = unpack7to8(packed);
    expect(unpacked[0]).toBe(0x42);
  });

  it('roundtrips 7 bytes (exact group)', () => {
    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
    const packed = pack8to7(data);
    const unpacked = unpack7to8(packed);
    for (let i = 0; i < 7; i++) expect(unpacked[i]).toBe(data[i]);
  });

  it('roundtrips 8 bytes (1 group + 1 byte)', () => {
    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    const packed = pack8to7(data);
    const unpacked = unpack7to8(packed);
    for (let i = 0; i < 8; i++) expect(unpacked[i]).toBe(data[i]);
  });

  it('preserves 0x80-0xFF values (high bit)', () => {
    const data = new Uint8Array([0x80, 0xFF, 0x80, 0xFF]);
    const packed = pack8to7(data);
    const unpacked = unpack7to8(packed);
    for (let i = 0; i < 4; i++) expect(unpacked[i]).toBe(data[i]);
  });

  it('output length is always multiple of 8', () => {
    for (const size of [1, 2, 3, 5, 7, 13, 64, 128, 255]) {
      const data = new Uint8Array(size);
      const packed = pack8to7(data);
      expect(packed.length % 8).toBe(0);
    }
  });
});

// ─── Nibble Encoding Edge Cases ───

describe('Nibble encoding — edge cases', () => {
  it('roundtrips empty input', () => {
    const empty = new Uint8Array(0);
    const encoded = encodeNibble(empty);
    const decoded = decodeNibble(encoded);
    expect(decoded.length).toBe(0);
  });

  it('roundtrips 1 byte', () => {
    const data = new Uint8Array([0xAB]);
    const encoded = encodeNibble(data);
    const decoded = decodeNibble(encoded);
    expect(decoded[0]).toBe(0xAB);
  });

  it('preserves 0x00 and 0xFF', () => {
    const data = new Uint8Array([0x00, 0xFF]);
    const encoded = encodeNibble(data);
    const decoded = decodeNibble(encoded);
    expect(decoded[0]).toBe(0x00);
    expect(decoded[1]).toBe(0xFF);
  });

  it('output length is exactly 2x input', () => {
    for (const size of [1, 10, 64, 128, 288]) {
      const data = new Uint8Array(size);
      const encoded = encodeNibble(data);
      expect(encoded.length).toBe(size * 2);
    }
  });
});

// ─── Checksum Edge Cases ───

describe('Checksum algorithms — edge cases', () => {
  it('rolandChecksum: single byte', () => {
    const data = new Uint8Array([0x7F]);
    const checksum = rolandChecksum(data);
    // XOR = 0x7F, ~0x7F & 0x7F = 0x00
    expect(checksum).toBe(0x00);
  });

  it('rolandChecksum: all zeros', () => {
    const data = new Uint8Array(10);
    expect(rolandChecksum(data)).toBe(0x7F);
  });

  it('yamahaChecksum: single byte 0x01', () => {
    const data = new Uint8Array([0x01]);
    const checksum = yamahaChecksum(data);
    // sum=1, (128-1)%128 = 127 = 0x7F
    expect(checksum).toBe(0x7F);
  });

  it('yamahaChecksum: byte 0x7F', () => {
    const data = new Uint8Array([0x7F]);
    const checksum = yamahaChecksum(data);
    // sum=127, (128-127)%128 = 1
    expect(checksum).toBe(1);
  });

  it('casioChecksum: overflow (large sum)', () => {
    const data = new Uint8Array(256);
    for (let i = 0; i < 256; i++) data[i] = 0xFF;
    const checksum = casioChecksum(data);
    // sum = 256*255 = 65280, 65280 & 0x7F = 0
    expect(checksum).toBe(0);
  });

  it('checksum roundtrip: data + checksum makes total valid', () => {
    const data = new Uint8Array([0x10, 0x20, 0x30, 0x40]);
    const cs = rolandChecksum(data);
    // XOR of data ^ checksum should equal 0x7F
    let total = 0;
    for (const b of data) total ^= b;
    total ^= cs;
    expect(total & 0x7F).toBe(0x7F);
  });
});
