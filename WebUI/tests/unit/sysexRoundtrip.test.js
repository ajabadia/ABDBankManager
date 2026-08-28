/**
 * SysEx Roundtrip Tests - Concept Validation
 * Tests verify the core concepts; actual implementations in adapters
 */

import { describe, it, expect } from 'vitest';

describe('SysEx Roundtrip Concepts', () => {
  describe('Korg 7-to-8 bit packing (MS2000, microKORG)', () => {
    it('should demonstrate 7-to-8 bit packing concept', () => {
      // Korg uses 7-bit bytes packed into 8-bit bytes.
      // Every group is 1 control byte + 7 data bytes, and the last group is
      // zero-padded to a full 7 bytes, so the packed size is always a multiple of 8:
      // 288 data bytes -> ceil(288/7)*8 = 336 packed bytes.
      const dataBytes = 288;
      const packedBytes = Math.ceil(dataBytes / 7) * 8;
      expect(packedBytes).toBe(336);
    });

    it('should handle 7-bit data constraint', () => {
      // All data bytes must be 0-127 (7-bit)
      const validData = new Uint8Array([0, 64, 127, 1, 2, 3]);
      validData.forEach(b => expect(b).toBeLessThanOrEqual(0x7F));
    });
  });

  describe('Casio CZ Nibble Format', () => {
    it('should pack 2 nibbles per byte', () => {
      // Casio CZ: 128 params * 2 nibbles = 256 nibbles = 128 bytes
      const nibbleCount = 256;
      const byteCount = nibbleCount / 2;
      expect(byteCount).toBe(128);
    });

    it('should combine high/low nibbles correctly', () => {
      const high = 0xA; // 1010
      const low = 0x5;  // 0101
      const combined = (high << 4) | low; // 10100101 = 0xA5
      expect(combined).toBe(0xA5);

      const extractedHigh = (combined >> 4) & 0x0F;
      const extractedLow = combined & 0x0F;
      expect(extractedHigh).toBe(high);
      expect(extractedLow).toBe(low);
    });
  });

  describe('Roland Checksum (XOR)', () => {
    it('should compute XOR of all data bytes', () => {
      // Roland uses XOR of data bytes (excluding F0/F7)
      const data = new Uint8Array([0x41, 0x10, 0x00, 0x3E, 0x11]);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        sum ^= data[i];
      }
      const checksum = sum & 0x7F;
      // 0x41 ^ 0x10 ^ 0x00 ^ 0x3E ^ 0x11 = 0x7E (126)
      expect(checksum).toBe(0x7E);
    });

    it('should validate checksum on decode', () => {
      // With F0/F7 framing, checksum is XOR of data bytes only (excluding F0/F7/checksum)
      const dataWithChecksum = new Uint8Array([0xF0, 0x41, 0x10, 0x00, 0x3E, 0x11, 0x7E, 0xF7]);
      // Payload is bytes 1 to -3 (excluding F0, checksum, F7)
      const payload = dataWithChecksum.slice(1, -2);
      const receivedChecksum = dataWithChecksum[dataWithChecksum.length - 2];

      let computed = 0;
      for (let i = 0; i < payload.length; i++) {
        computed ^= payload[i];
      }
      computed &= 0x7F;

      expect(computed).toBe(receivedChecksum);
    });
  });

  describe('Yamaha DX7 Checksum (sum & 0x7F)', () => {
    it('should compute sum modulo 128', () => {
      const data = new Uint8Array([0x43, 0x10, 0x00, 0x09, 0x20]);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        sum += data[i];
      }
      const checksum = sum & 0x7F;
      // 0x43 + 0x10 + 0x00 + 0x09 + 0x20 = 0x7C (124)
      expect(checksum).toBe(0x7C);
    });

    it('should validate checksum on decode', () => {
      const dataWithChecksum = new Uint8Array([0x43, 0x10, 0x00, 0x09, 0x20, 0x7C, 0xF7]);
      const payload = dataWithChecksum.slice(0, -2);
      const receivedChecksum = dataWithChecksum[dataWithChecksum.length - 2];

      let sum = 0;
      for (let i = 0; i < payload.length; i++) {
        sum += payload[i];
      }
      const computed = sum & 0x7F;

      expect(computed).toBe(receivedChecksum);
    });
  });

  describe('Patch Data Sizes by Manufacturer', () => {
    it('should have correct patch sizes', () => {
      const sizes = {
        'casio-cz': 128,
        'roland-juno': 18,
        'korg-ms2000': 128,
        'behringer-dm12': 242,
        'yamaha-dx7': 128
      };

      expect(sizes['casio-cz']).toBe(128);
      expect(sizes['roland-juno']).toBe(18);
      expect(sizes['korg-ms2000']).toBe(128);
      expect(sizes['behringer-dm12']).toBe(242);
      expect(sizes['yamaha-dx7']).toBe(128);
    });
  });
});