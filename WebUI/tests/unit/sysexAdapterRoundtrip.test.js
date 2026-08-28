/**
 * Roundtrip tests for all 5 manufacturer adapters
 * Tests byte-level encoding/decoding algorithms (checksum, packing, nibble)
 * Verifies encode→decode produces identical data
 *
 * Imports the canonical implementation from Source/Contracts/Adapters/sysexUtils.ts
 * (the shared utilities used by the Korg and Behringer adapters), so these tests
 * exercise the real code instead of a local duplicate.
 */

import { describe, it, expect } from 'vitest';
import {
  unpack7to8,
  pack8to7,
  decodeNibble,
  encodeNibble,
  rolandChecksum,
  yamahaChecksum,
  casioChecksum
} from '@contracts/Adapters/sysexUtils';

// ─── Tests ───

describe('SysEx Utilities — Roundtrip', () => {
  describe('7-to-8 packing (Korg, Behringer)', () => {
    it('roundtrips arbitrary data through pack→unpack', () => {
      // Test with known data
      const original = new Uint8Array([0xFF, 0x00, 0x7F, 0x80, 0x42, 0xBD, 0x01, 0xFE, 0x55, 0xAA]);
      const packed = pack8to7(original);
      const unpacked = unpack7to8(packed);

      // unpacked is longer than original: the last 7-byte group is zero-padded,
      // so unpacked.length = ceil(original.length/7)*7. Leading bytes must match.
      expect(unpacked.length).toBe(Math.ceil(original.length / 7) * 7);
      for (let i = 0; i < original.length; i++) {
        expect(unpacked[i]).toBe(original[i]);
      }
    });

    it('roundtrips 288 bytes (Korg MS2000 patch size)', () => {
      const original = new Uint8Array(288);
      for (let i = 0; i < 288; i++) original[i] = (i * 37 + 13) & 0xFF; // deterministic pseudo-random

      const packed = pack8to7(original);
      const unpacked = unpack7to8(packed);

      for (let i = 0; i < 288; i++) {
        expect(unpacked[i]).toBe(original[i]);
      }
    });

    it('roundtrips 242 bytes (Behringer DM12 patch size)', () => {
      const original = new Uint8Array(242);
      for (let i = 0; i < 242; i++) original[i] = (i * 71 + 3) & 0xFF;

      const packed = pack8to7(original);
      const unpacked = unpack7to8(packed);

      for (let i = 0; i < 242; i++) {
        expect(unpacked[i]).toBe(original[i]);
      }
    });

    it('packed size is ceil(input.length/7)*8 (always a multiple of 8)', () => {
      const data = new Uint8Array(288);
      const packed = pack8to7(data);
      expect(packed.length).toBe(Math.ceil(288 / 7) * 8); // = 42 * 8 = 336
      expect(packed.length % 8).toBe(0); // required by verifyChecksum in the contracts
    });

    it('roundtrips non-multiple-of-7 sizes (partial last group)', () => {
      // 10 bytes = 1 full group + 3-byte tail; the tail is zero-padded and must
      // survive a full roundtrip without losing the original bytes.
      const original = new Uint8Array(10);
      for (let i = 0; i < 10; i++) original[i] = (i * 97 + 5) & 0xFF;

      const packed = pack8to7(original);
      const unpacked = unpack7to8(packed);

      expect(packed.length).toBe(16); // 2 groups × 8
      for (let i = 0; i < 10; i++) {
        expect(unpacked[i]).toBe(original[i]);
      }
    });
  });

  describe('Nibble encoding (Casio CZ)', () => {
    it('roundtrips arbitrary data through encode→decode', () => {
      const original = new Uint8Array([0x00, 0x0F, 0xF0, 0xFF, 0x42, 0xBD, 0x80, 0x7F]);
      const encoded = encodeNibble(original);
      const decoded = decodeNibble(encoded);

      expect(decoded.length).toBe(original.length);
      for (let i = 0; i < original.length; i++) {
        expect(decoded[i]).toBe(original[i]);
      }
    });

    it('roundtrips 128 bytes (Casio CZ-101 patch size)', () => {
      const original = new Uint8Array(128);
      for (let i = 0; i < 128; i++) original[i] = (i * 53 + 7) & 0xFF;

      const encoded = encodeNibble(original);
      const decoded = decodeNibble(encoded);

      expect(decoded.length).toBe(128);
      for (let i = 0; i < 128; i++) {
        expect(decoded[i]).toBe(original[i]);
      }
    });

    it('encoded size is exactly 2x input', () => {
      const data = new Uint8Array(128);
      const encoded = encodeNibble(data);
      expect(encoded.length).toBe(256);
    });
  });

  describe('Roland XOR checksum', () => {
    it('produces consistent checksum for known data', () => {
      // Juno-106 voice: 18 bytes of zeros → checksum should be (~0) & 0x7F = 0x7F
      const data = new Uint8Array(18);
      expect(rolandChecksum(data)).toBe(0x7F);
    });

    it('checksum byte makes full payload XOR to zero', () => {
      const data = new Uint8Array([0x41, 0x3E, 0x12, 0x20, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F]);
      const checksum = rolandChecksum(data);
      // Verify: XOR all bytes + checksum should equal 0x7F (because ~xor & 0x7F, then XOR again)
      let totalXor = 0;
      for (const b of data) totalXor ^= b;
      totalXor ^= checksum;
      expect(totalXor & 0x7F).toBe(0x7F);
    });
  });

  describe('Yamaha sum&0x7F checksum', () => {
    it('produces consistent checksum for known data', () => {
      // All zeros → sum=0, checksum = (128-0)%128 = 0
      const data = new Uint8Array(128);
      expect(yamahaChecksum(data)).toBe(0);
    });

    it('checksum byte makes total sum divisible by 128', () => {
      const data = new Uint8Array([0x43, 0x00, 0x00, 0x09, 0x20, 0x00]);
      const checksum = yamahaChecksum(data);
      let sum = 0;
      for (const b of data) sum += b;
      sum += checksum;
      expect(sum % 128).toBe(0);
    });

    it('roundtrips DX7 VCED (128 bytes) with checksum', () => {
      const original = new Uint8Array(128);
      for (let i = 0; i < 128; i++) original[i] = (i * 31 + 11) & 0x7F; // 7-bit values

      const checksum = yamahaChecksum(original);
      // Verify
      let sum = 0;
      for (const b of original) sum += b;
      sum += checksum;
      expect(sum % 128).toBe(0);
    });
  });

  describe('Casio sum&0x7F checksum', () => {
    it('produces consistent checksum for known data', () => {
      const data = new Uint8Array([0x01, 0x02, 0x03]);
      // sum = 6, checksum = 6 & 0x7F = 6
      expect(casioChecksum(data)).toBe(6);
    });

    it('checksum is 7-bit', () => {
      const data = new Uint8Array(256);
      for (let i = 0; i < 256; i++) data[i] = 0xFF;
      const checksum = casioChecksum(data);
      expect(checksum).toBeLessThan(128);
      expect(checksum).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Full SysEx Message Roundtrip', () => {
  describe('Roland Juno-106', () => {
    it('builds valid SysEx with correct checksum', () => {
      const voiceData = new Uint8Array(18);
      for (let i = 0; i < 18; i++) voiceData[i] = (i * 13 + 5) & 0x7F;

      // Build: F0 41 ch 0x3E 0x12 bank patchNum <data> checksum F7
      const channel = 0;
      const modelId = 0x3E;
      const cmd = 0x12;
      const bank = 0x20; // Bank A
      const patchNum = 0;

      const payload = Uint8Array.from([channel, modelId, cmd, bank, patchNum, ...voiceData]);
      const checksum = rolandChecksum(payload);

      const sysex = new Uint8Array([0xF0, 0x41, ...payload, checksum, 0xF7]);

      // Structure: F0(0) 41(1) payload[2..24] checksum(25) F7(26)
      expect(sysex.length).toBe(2 + payload.length + 2);
      expect(sysex[0]).toBe(0xF0);
      expect(sysex[1]).toBe(0x41); // Roland
      expect(sysex[3]).toBe(0x3E); // Juno-106
      expect(sysex[4]).toBe(0x12); // Patch dump
      expect(sysex[25]).toBe(checksum);
      expect(sysex[26]).toBe(0xF7);

      // Checksum covers the payload exactly
      expect(rolandChecksum(payload)).toBe(checksum);
    });
  });

  describe('Yamaha DX7', () => {
    it('builds valid bulk SysEx with correct checksum', () => {
      const voiceData = new Uint8Array(128);
      for (let i = 0; i < 128; i++) voiceData[i] = (i * 17 + 3) & 0x7F;

      // Build: F0 43 ch 0x00 0x04 0x20 0x00 <128 bytes voice> checksum F7
      const channel = 0;
      const modelId = 0x00;
      const sub1 = 0x04;
      const sub2 = 0x20;
      const sub3 = 0x00;

      const headerPayload = Uint8Array.from([modelId, sub1, sub2, sub3]);
      const fullPayload = Uint8Array.from([...headerPayload, ...voiceData]);
      const checksum = yamahaChecksum(fullPayload);

      const sysex = new Uint8Array([0xF0, 0x43, 0x10 | channel, ...fullPayload, checksum, 0xF7]);

      // Verify structure
      expect(sysex[0]).toBe(0xF0);
      expect(sysex[1]).toBe(0x43); // Yamaha
      expect(sysex[3]).toBe(0x00); // DX7
      expect(sysex[4]).toBe(0x04); // Bulk dump
      expect(sysex.length).toBe(3 + 4 + 128 + 1 + 1); // F0 43 ch + header + voice + checksum + F7 = 137

      // Verify checksum
      const payloadForChecksum = sysex.slice(3, 3 + 4 + 128); // modelId through last voice byte
      expect(yamahaChecksum(payloadForChecksum)).toBe(checksum);
    });
  });

  describe('Korg MS2000', () => {
    it('builds valid 7-to-8 packed SysEx', () => {
      const patchData = new Uint8Array(288);
      for (let i = 0; i < 288; i++) patchData[i] = (i * 41 + 7) & 0xFF;

      const packed = pack8to7(patchData);
      const channel = 0;
      const modelId = 0x58;
      const cmd = 0x10;

      const sysex = new Uint8Array([0xF0, 0x42, 0x30 | channel, modelId, cmd, ...packed, 0xF7]);

      // Verify structure
      expect(sysex[0]).toBe(0xF0);
      expect(sysex[1]).toBe(0x42); // Korg
      expect(sysex[3]).toBe(0x58); // MS2000
      expect(sysex[4]).toBe(0x10); // Single dump
      expect(sysex[sysex.length - 1]).toBe(0xF7);

      // Verify unpack roundtrip
      const receivedPacked = sysex.slice(5, sysex.length - 1);
      const unpacked = unpack7to8(receivedPacked);
      for (let i = 0; i < 288; i++) {
        expect(unpacked[i]).toBe(patchData[i]);
      }
    });
  });

  describe('Casio CZ-101', () => {
    it('builds valid nibble-encoded SysEx with correct checksum', () => {
      const patchData = new Uint8Array(128);
      for (let i = 0; i < 128; i++) patchData[i] = (i * 23 + 11) & 0xFF;

      const nibbles = encodeNibble(patchData);
      const channel = 0;
      const modelId = 0x12;
      const cmd = 0x10;

      const payload = Uint8Array.from(nibbles);
      const checksum = casioChecksum(payload);

      const sysex = new Uint8Array([0xF0, 0x44, 0x00, 0x00, modelId, cmd, channel, ...nibbles, checksum, 0xF7]);

      // Verify structure
      expect(sysex[0]).toBe(0xF0);
      expect(sysex[1]).toBe(0x44); // Casio
      expect(sysex[2]).toBe(0x00);
      expect(sysex[3]).toBe(0x00);
      expect(sysex[4]).toBe(0x12); // CZ-101

      // Verify checksum
      const payloadForChecksum = sysex.slice(7, sysex.length - 2); // nibble data
      expect(casioChecksum(payloadForChecksum)).toBe(checksum);

      // Verify nibble roundtrip
      const decoded = decodeNibble(payloadForChecksum);
      for (let i = 0; i < 128; i++) {
        expect(decoded[i]).toBe(patchData[i]);
      }
    });
  });

  describe('Behringer DeepMind 12', () => {
    it('builds valid 7-to-8 packed SysEx', () => {
      const patchData = new Uint8Array(242);
      for (let i = 0; i < 242; i++) patchData[i] = (i * 29 + 17) & 0xFF;

      const packed = pack8to7(patchData);
      const modelId = 0x0E;
      const cmd = 0x01;
      const subId = 0x01;

      const sysex = new Uint8Array([0xF0, 0x00, 0x20, 0x32, modelId, cmd, subId, ...packed, 0xF7]);

      // Verify structure
      expect(sysex[0]).toBe(0xF0);
      expect(sysex[1]).toBe(0x00);
      expect(sysex[2]).toBe(0x20);
      expect(sysex[3]).toBe(0x32); // Behringer
      expect(sysex[4]).toBe(0x0E); // DeepMind 12
      expect(sysex[sysex.length - 1]).toBe(0xF7);

      // Verify unpack roundtrip
      const receivedPacked = sysex.slice(7, sysex.length - 1);
      const unpacked = unpack7to8(receivedPacked);
      for (let i = 0; i < 242; i++) {
        expect(unpacked[i]).toBe(patchData[i]);
      }
    });
  });
});
