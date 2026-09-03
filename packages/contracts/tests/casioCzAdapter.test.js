/**
 * Casio CZ Adapter Tests
 * Tests import, export, checksum verification, and roundtrip
 * using real SysEx fixture files from all 4 Casio CZ models.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { CasioCzImportAdapter, CasioCzExportAdapter } from '@contracts/Adapters/casioCzAdapter';
import { encodeNibble, decodeNibble } from '@contracts/Adapters/sysexUtils';

// ─── Helpers ───

function readFixture(path) {
  return new Uint8Array(fs.readFileSync(path));
}

// ─── Import Adapter Tests ───

describe('CasioCzImportAdapter', () => {
  const adapter = new CasioCzImportAdapter();

  describe('identity', () => {
    it('has correct adapterId', () => {
      expect(adapter.adapterId).toBe('sysex-casio-cz');
    });

    it('supports .syx extension', () => {
      expect(adapter.supportedExtensions).toContain('.syx');
    });

    it('targets all 4 Casio CZ models', () => {
      expect(adapter.targetModelIds).toContain('casio-cz101');
      expect(adapter.targetModelIds).toContain('casio-cz1000');
      expect(adapter.targetModelIds).toContain('casio-cz5000');
      expect(adapter.targetModelIds).toContain('casio-cz1');
    });
  });

  describe('canParse', () => {
    it('accepts .syx files with Casio SysEx', () => {
      const data = readFixture('fixtures/sysex/casio-cz/factory/CZ101_Bank_A.syx');
      expect(adapter.canParse(data, 'CZ101_Bank_A.syx')).toBe(true);
    });

    it('rejects non-.syx files', () => {
      const data = readFixture('fixtures/sysex/casio-cz/factory/CZ101_Bank_A.syx');
      expect(adapter.canParse(data, 'CZ101_Bank_A.txt')).toBe(false);
    });
  });

  describe('verifyChecksum', () => {
    it('validates checksum on CZ-101 factory bank', () => {
      const data = readFixture('fixtures/sysex/casio-cz/factory/CZ101_Bank_A.syx');
      expect(adapter.verifyChecksum(data)).toBe(true);
    });

    it('validates checksum on CZ-1000 factory bank', () => {
      const data = readFixture('fixtures/sysex/casio-cz/factory/CZ1000_Bank_A.syx');
      expect(adapter.verifyChecksum(data)).toBe(true);
    });

    it('validates checksum on CZ-5000 factory banks', () => {
      for (const bank of ['CZ5000_Bank_A.syx', 'CZ5000_Bank_B.syx']) {
        const data = readFixture(`fixtures/sysex/casio-cz/factory/${bank}`);
        expect(adapter.verifyChecksum(data)).toBe(true);
      }
    });

    it('validates checksum on CZ-1 factory banks', () => {
      for (const bank of ['CZ1_Bank_A.syx', 'CZ1_Bank_B.syx', 'CZ1_Bank_C.syx', 'CZ1_Bank_D.syx']) {
        const data = readFixture(`fixtures/sysex/casio-cz/factory/${bank}`);
        expect(adapter.verifyChecksum(data)).toBe(true);
      }
    });
  });

  describe('parse', () => {
    it('parses CZ-101 bank and extracts 16 patches', () => {
      const data = readFixture('fixtures/sysex/casio-cz/factory/CZ101_Bank_A.syx');
      const result = adapter.parse(data, 'CZ101_Bank_A.syx');
      expect(result.success).toBe(true);
      expect(result.modelId).toBe('casio-cz101');
      expect(result.patches).toHaveLength(16);
    });

    it('parses CZ-1000 bank and extracts 16 patches', () => {
      const data = readFixture('fixtures/sysex/casio-cz/factory/CZ1000_Bank_A.syx');
      const result = adapter.parse(data, 'CZ1000_Bank_A.syx');
      expect(result.success).toBe(true);
      expect(result.modelId).toBe('casio-cz1000');
      expect(result.patches).toHaveLength(16);
    });

    it('parses CZ-5000 bank and extracts 16 patches', () => {
      const data = readFixture('fixtures/sysex/casio-cz/factory/CZ5000_Bank_A.syx');
      const result = adapter.parse(data, 'CZ5000_Bank_A.syx');
      expect(result.success).toBe(true);
      expect(result.modelId).toBe('casio-cz5000');
      expect(result.patches).toHaveLength(16);
    });

    it('parses CZ-1 bank and extracts 16 patches', () => {
      const data = readFixture('fixtures/sysex/casio-cz/factory/CZ1_Bank_A.syx');
      const result = adapter.parse(data, 'CZ1_Bank_A.syx');
      expect(result.success).toBe(true);
      expect(result.modelId).toBe('casio-cz1');
      expect(result.patches).toHaveLength(16);
    });

    it('each patch has correct rawData size', () => {
      const data = readFixture('fixtures/sysex/casio-cz/factory/CZ101_Bank_A.syx');
      const result = adapter.parse(data, 'CZ101_Bank_A.syx');
      for (const patch of result.patches) {
        expect(patch.rawData.length).toBe(128);
      }
    });

    it('CZ-1 patches have 288-byte rawData', () => {
      const data = readFixture('fixtures/sysex/casio-cz/factory/CZ1_Bank_A.syx');
      const result = adapter.parse(data, 'CZ1_Bank_A.syx');
      for (const patch of result.patches) {
        expect(patch.rawData.length).toBe(288);
      }
    });

    it('patches have hardwareIds set', () => {
      const data = readFixture('fixtures/sysex/casio-cz/factory/CZ101_Bank_A.syx');
      const result = adapter.parse(data, 'CZ101_Bank_A.syx');
      for (const patch of result.patches) {
        expect(patch.hardwareIds).toBeDefined();
        expect(patch.hardwareIds.length).toBeGreaterThan(0);
        expect(patch.hardwareIds).toContain('casio-cz101');
      }
    });

    it('patches have originAddress set', () => {
      const data = readFixture('fixtures/sysex/casio-cz/factory/CZ101_Bank_A.syx');
      const result = adapter.parse(data, 'CZ101_Bank_A.syx');
      expect(result.patches[0].originAddress).toBe('A1');
      expect(result.patches[15].originAddress).toBe('A16');
    });

    it('returns error for empty input', () => {
      const result = adapter.parse(new Uint8Array(0), 'empty.syx');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

// ─── Export Adapter Tests ───

describe('CasioCzExportAdapter', () => {
  const exportAdapter = new CasioCzExportAdapter();
  const importAdapter = new CasioCzImportAdapter();

  describe('identity', () => {
    it('has correct adapterId', () => {
      expect(exportAdapter.adapterId).toBe('export-casio-cz');
    });

    it('exports to .syx', () => {
      expect(exportAdapter.fileExtension).toBe('.syx');
    });
  });

  describe('serialize', () => {
    it('produces valid SysEx with F0 start and F7 end', () => {
      const data = readFixture('fixtures/sysex/casio-cz/factory/CZ101_Bank_A.syx');
      const imported = importAdapter.parse(data, 'CZ101_Bank_A.syx');
      const exported = exportAdapter.serialize(imported.patches, 'Test Bank');
      expect(exported[0]).toBe(0xF0);
      expect(exported[exported.length - 1]).toBe(0xF7);
    });

    it('produces correct manufacturer ID', () => {
      const data = readFixture('fixtures/sysex/casio-cz/factory/CZ101_Bank_A.syx');
      const imported = importAdapter.parse(data, 'CZ101_Bank_A.syx');
      const exported = exportAdapter.serialize(imported.patches, 'Test Bank');
      expect(exported[1]).toBe(0x44); // Casio
    });
  });

  describe('roundtrip', () => {
    // NOTE: The export adapter always exports as CZ-101 (modelId 0x12, 128B).
    // This is a known limitation — the modelId should be parameterized.
    // Roundtrip tests below verify that 128-byte models survive correctly.

    it('CZ-101: import → export → import produces same rawData', () => {
      const data = readFixture('fixtures/sysex/casio-cz/factory/CZ101_Bank_A.syx');
      const imported1 = importAdapter.parse(data, 'CZ101_Bank_A.syx');
      expect(imported1.success).toBe(true);

      const exported = exportAdapter.serialize(imported1.patches, 'Test Bank');
      const imported2 = importAdapter.parse(exported, 'roundtrip.syx');
      expect(imported2.success).toBe(true);
      expect(imported2.patches).toHaveLength(imported1.patches.length);

      for (let i = 0; i < imported1.patches.length; i++) {
        expect(imported2.patches[i].rawData).toEqual(imported1.patches[i].rawData);
      }
    });

    it('CZ-1000: roundtrip preserves rawData (128B, same as CZ-101)', () => {
      const data = readFixture('fixtures/sysex/casio-cz/factory/CZ1000_Bank_A.syx');
      const imported1 = importAdapter.parse(data, 'CZ1000_Bank_A.syx');
      // Export as CZ-101 (128B), re-import — first 128 bytes should match
      const exported = exportAdapter.serialize(imported1.patches, 'Test');
      const imported2 = importAdapter.parse(exported, 'roundtrip.syx');
      for (let i = 0; i < imported1.patches.length; i++) {
        expect(imported2.patches[i].rawData).toEqual(imported1.patches[i].rawData);
      }
    });

    it('CZ-5000: roundtrip preserves rawData (128B)', () => {
      const data = readFixture('fixtures/sysex/casio-cz/factory/CZ5000_Bank_A.syx');
      const imported1 = importAdapter.parse(data, 'CZ5000_Bank_A.syx');
      const exported = exportAdapter.serialize(imported1.patches, 'Test');
      const imported2 = importAdapter.parse(exported, 'roundtrip.syx');
      for (let i = 0; i < imported1.patches.length; i++) {
        expect(imported2.patches[i].rawData).toEqual(imported1.patches[i].rawData);
      }
    });

    it('CZ-1: export truncates to 128B (known limitation)', () => {
      // CZ-1 has 288B patches, but export always uses 128B (CZ-101 format)
      const data = readFixture('fixtures/sysex/casio-cz/factory/CZ1_Bank_A.syx');
      const imported1 = importAdapter.parse(data, 'CZ1_Bank_A.syx');
      const exported = exportAdapter.serialize(imported1.patches, 'Test');
      const imported2 = importAdapter.parse(exported, 'roundtrip.syx');
      // Re-imported patches are 128B (CZ-101 format), not 288B
      expect(imported2.patches[0].rawData.length).toBe(128);
      // First 128 bytes should match the original
      for (let i = 0; i < imported1.patches.length; i++) {
        const original128 = imported1.patches[i].rawData.slice(0, 128);
        expect(imported2.patches[i].rawData).toEqual(original128);
      }
    });

    it('exported SysEx has valid checksum', () => {
      const data = readFixture('fixtures/sysex/casio-cz/factory/CZ101_Bank_A.syx');
      const imported = importAdapter.parse(data, 'CZ101_Bank_A.syx');
      const exported = exportAdapter.serialize(imported.patches, 'Test Bank');
      expect(importAdapter.verifyChecksum(exported)).toBe(true);
    });
  });
});

// ─── Nibble Encoding Roundtrip ───

describe('Nibble encoding roundtrip (via raw utilities)', () => {
  it('encodeNibble + decodeNibble roundtrips 128 bytes', () => {
    const original = new Uint8Array(128);
    for (let i = 0; i < 128; i++) original[i] = i;
    const encoded = encodeNibble(original);
    const decoded = decodeNibble(encoded);
    expect(decoded).toEqual(original);
  });

  it('encodeNibble + decodeNibble preserves 0x00 and 0xFF', () => {
    const original = new Uint8Array([0x00, 0xFF, 0x00, 0xFF]);
    const encoded = encodeNibble(original);
    const decoded = decodeNibble(encoded);
    expect(decoded).toEqual(original);
  });
});
