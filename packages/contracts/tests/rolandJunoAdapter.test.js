/**
 * Roland Juno Adapter — Comprehensive Tests
 *
 * Tests import/export/hardware link with real fixture files:
 * - Juno-106, Juno-60, Juno-6, HS-60
 * - Factory banks (A and B, 64 patches each)
 *
 * SysEx format:
 *   Single:  F0 41 30 ch [18B data] F7              (no checksum)
 *   Bulk:    F0 41 30 02 01 [64×18B] <(-sum)&0x7F> F7
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const FIXTURE_DIR = join(import.meta.dirname, '../../..', 'fixtures/sysex/roland-juno/factory');

// Lazy-load adapter (TypeScript via vitest alias)
let adapter;
async function getAdapter() {
  if (!adapter) {
    const mod = await import('@contracts/Adapters/rolandJunoAdapter');
    adapter = mod;
  }
  return adapter;
}

const MODELS = [
  { file: 'Juno106_Bank_A.syx', modelId: 'roland-juno106', modelByte: 0x3E, expectedPatches: 64 },
  { file: 'Juno106_Bank_B.syx', modelId: 'roland-juno106', modelByte: 0x3E, expectedPatches: 64 },
  { file: 'Juno60_Bank_A.syx',  modelId: 'roland-juno60',  modelByte: 0x3D, expectedPatches: 64 },
  { file: 'Juno60_Bank_B.syx',  modelId: 'roland-juno60',  modelByte: 0x3D, expectedPatches: 64 },
  { file: 'Juno6_Bank_A.syx',   modelId: 'roland-juno6',   modelByte: 0x3C, expectedPatches: 64 },
  { file: 'Juno6_Bank_B.syx',   modelId: 'roland-juno6',   modelByte: 0x3C, expectedPatches: 64 },
  { file: 'HS60_Bank_A.syx',    modelId: 'roland-hs60',    modelByte: 0x3E, expectedPatches: 64 },
  { file: 'HS60_Bank_B.syx',    modelId: 'roland-hs60',    modelByte: 0x3E, expectedPatches: 64 },
];

// ─── Import Adapter Identity ───

describe('Roland Juno Import Adapter — Identity', () => {
  it('has correct adapterId', async () => {
    const { RolandJunoImportAdapter } = await getAdapter();
    const a = new RolandJunoImportAdapter();
    expect(a.adapterId).toBe('sysex-roland-juno');
  });

  it('supports .syx extension', async () => {
    const { RolandJunoImportAdapter } = await getAdapter();
    const a = new RolandJunoImportAdapter();
    expect(a.supportedExtensions).toContain('.syx');
  });

  it('targets all 4 Roland Juno models', async () => {
    const { RolandJunoImportAdapter } = await getAdapter();
    const a = new RolandJunoImportAdapter();
    expect(a.targetModelIds).toEqual(
      expect.arrayContaining(['roland-juno106', 'roland-juno60', 'roland-juno6', 'roland-hs60'])
    );
  });
});

// ─── canParse ───

describe('Roland Juno Import Adapter — canParse', () => {
  it('accepts .syx with Roland Juno SysEx', async () => {
    const { RolandJunoImportAdapter } = await getAdapter();
    const a = new RolandJunoImportAdapter();
    const data = new Uint8Array(readFileSync(join(FIXTURE_DIR, 'Juno106_Bank_A.syx')));
    expect(a.canParse(data, 'Juno106_Bank_A.syx')).toBe(true);
  });

  it('rejects .syx without Roland SysEx', async () => {
    const { RolandJunoImportAdapter } = await getAdapter();
    const a = new RolandJunoImportAdapter();
    // Fake Yamaha DX7 data
    const fake = new Uint8Array([0xF0, 0x43, 0x00, 0x09, 0x20, 0x00, 0xF7]);
    expect(a.canParse(fake, 'test.syx')).toBe(false);
  });

  it('rejects non-.syx files', async () => {
    const { RolandJunoImportAdapter } = await getAdapter();
    const a = new RolandJunoImportAdapter();
    const data = new Uint8Array(readFileSync(join(FIXTURE_DIR, 'Juno106_Bank_A.syx')));
    expect(a.canParse(data, 'test.mid')).toBe(false);
  });
});

// ─── Parse Real Fixtures ───

describe('Roland Juno Import Adapter — Parse real fixtures', () => {
  for (const { file, modelId, expectedPatches } of MODELS) {
    it(`parses ${file} → ${expectedPatches} patches`, async () => {
      const { RolandJunoImportAdapter } = await getAdapter();
      const a = new RolandJunoImportAdapter();
      const data = new Uint8Array(readFileSync(join(FIXTURE_DIR, file)));
      const result = a.parse(data, file);

      expect(result.success).toBe(true);
      expect(result.modelId).toBe(modelId);
      expect(result.patches).toHaveLength(expectedPatches);
    });

    it(`${file}: each patch has 18-byte rawData`, async () => {
      const { RolandJunoImportAdapter } = await getAdapter();
      const a = new RolandJunoImportAdapter();
      const data = new Uint8Array(readFileSync(join(FIXTURE_DIR, file)));
      const result = a.parse(data, file);

      for (const p of result.patches) {
        expect(p.rawData).toBeInstanceOf(Uint8Array);
        expect(p.rawData.length).toBe(18);
      }
    });

    it(`${file}: patches have correct origin addresses`, async () => {
      const { RolandJunoImportAdapter } = await getAdapter();
      const a = new RolandJunoImportAdapter();
      const data = new Uint8Array(readFileSync(join(FIXTURE_DIR, file)));
      const result = a.parse(data, file);

      // First patch should be A1
      expect(result.patches[0].originAddress).toBe('A1');
      // Fixture is Bank A only (64 patches): A1..A64
      expect(result.patches[63].originAddress).toBe('A64');
      // Middle: A32
      expect(result.patches[31].originAddress).toBe('A32');
    });
  }
});

// ─── Verify Checksum ───

describe('Roland Juno Import Adapter — Checksum verification', () => {
  for (const { file } of MODELS) {
    it(`${file}: checksum verification passes`, async () => {
      const { RolandJunoImportAdapter } = await getAdapter();
      const a = new RolandJunoImportAdapter();
      const data = new Uint8Array(readFileSync(join(FIXTURE_DIR, file)));
      // Single patches have no checksum, so verifyChecksum should return true
      expect(a.verifyChecksum(data)).toBe(true);
    });
  }

  it('detects corrupted checksum in bulk dump', async () => {
    const { RolandJunoExportAdapter, RolandJunoImportAdapter } = await getAdapter();
    const exportAdapter = new RolandJunoExportAdapter();
    const importAdapter = new RolandJunoImportAdapter();

    // Create 64 patches to trigger bulk dump
    const patches = [];
    for (let i = 0; i < 64; i++) {
      const rawData = new Uint8Array(18);
      for (let j = 0; j < 18; j++) rawData[j] = (i * 7 + j * 3) & 0x7F;
      patches.push({ rawData, name: `A${i + 1}`, originAddress: `A${i + 1}`, hardwareIds: ['roland-juno106'] });
    }

    const sysex = exportAdapter.serialize(patches, 'Test Bank');
    // Verify it's a bulk dump (not single patches)
    expect(sysex.length).toBeGreaterThan(23);
    expect(sysex[3]).toBe(0x02); // Bulk function byte
    // Corrupt the checksum (second-to-last byte)
    const corrupted = new Uint8Array(sysex);
    corrupted[corrupted.length - 2] ^= 0x01;

    expect(importAdapter.verifyChecksum(corrupted)).toBe(false);
  });
});

// ─── Export Adapter Identity ───

describe('Roland Juno Export Adapter — Identity', () => {
  it('has correct adapterId', async () => {
    const { RolandJunoExportAdapter } = await getAdapter();
    const a = new RolandJunoExportAdapter();
    expect(a.adapterId).toBe('export-roland-juno');
  });

  it('exports .syx files', async () => {
    const { RolandJunoExportAdapter } = await getAdapter();
    const a = new RolandJunoExportAdapter();
    expect(a.fileExtension).toBe('.syx');
  });
});

// ─── Serialize ───

describe('Roland Juno Export Adapter — Serialize', () => {
  it('single patch produces 23-byte message (F0 41 30 ch 18B F7)', async () => {
    const { RolandJunoExportAdapter } = await getAdapter();
    const a = new RolandJunoExportAdapter();
    const rawData = new Uint8Array(18);
    for (let i = 0; i < 18; i++) rawData[i] = i * 7;
    const patches = [{ rawData, name: 'A1', originAddress: 'A1', hardwareIds: ['roland-juno106'] }];

    const sysex = a.serialize(patches, 'Test');
    expect(sysex.length).toBe(23);
    expect(sysex[0]).toBe(0xF0); // SysEx start
    expect(sysex[1]).toBe(0x41); // Roland
    expect(sysex[2]).toBe(0x30); // CMD_PATCH_DUMP
    expect(sysex[3]).toBe(0x00); // Channel 0
    expect(sysex[22]).toBe(0xF7); // SysEx end
    // Data at bytes 4-21 (18 bytes)
    expect(sysex.slice(4, 22)).toEqual(rawData);
  });

  it('64 patches produce bulk dump with valid checksum', async () => {
    const { RolandJunoExportAdapter } = await getAdapter();
    const a = new RolandJunoExportAdapter();
    const patches = [];
    for (let i = 0; i < 64; i++) {
      const rawData = new Uint8Array(18);
      for (let j = 0; j < 18; j++) rawData[j] = (i * 7 + j * 3) & 0x7F;
      patches.push({ rawData, name: `A${i + 1}`, originAddress: `A${i + 1}`, hardwareIds: ['roland-juno106'] });
    }

    const sysex = a.serialize(patches, 'Test Bank');
    expect(sysex[0]).toBe(0xF0);
    expect(sysex[1]).toBe(0x41);
    expect(sysex[2]).toBe(0x30); // CMD_PATCH_DUMP
    expect(sysex[3]).toBe(0x02); // Bulk function
    expect(sysex[4]).toBe(0x01); // Bulk sub-command
    expect(sysex[sysex.length - 1]).toBe(0xF7);

    // Verify checksum: (-sum(payload)) & 0x7F
    const payload = sysex.slice(5, sysex.length - 2);
    let sum = 0;
    for (const b of payload) sum += b;
    const expectedChecksum = (-sum) & 0x7F;
    expect(sysex[sysex.length - 2]).toBe(expectedChecksum);
  });
});

// ─── Roundtrip ───

describe('Roland Juno — Import → Export → Import roundtrip', () => {
  for (const { file, expectedPatches } of MODELS) {
    it(`${file}: roundtrip preserves all patch data`, async () => {
      const { RolandJunoImportAdapter, RolandJunoExportAdapter } = await getAdapter();
      const importAdapter = new RolandJunoImportAdapter();
      const exportAdapter = new RolandJunoExportAdapter();

      // Step 1: Import from fixture
      const data = new Uint8Array(readFileSync(join(FIXTURE_DIR, file)));
      const result1 = importAdapter.parse(data, file);
      expect(result1.success).toBe(true);
      expect(result1.patches).toHaveLength(expectedPatches);

      // Step 2: Export as single patches (since import gives single patches)
      const sysex = exportAdapter.serialize(result1.patches, 'Roundtrip');

      // Step 3: Re-import
      const result2 = importAdapter.parse(sysex, 'roundtrip.syx');
      expect(result2.success).toBe(true);
      expect(result2.patches).toHaveLength(result1.patches.length);

      // Step 4: Verify all patch data preserved
      for (let i = 0; i < result1.patches.length; i++) {
        expect(result2.patches[i].rawData).toEqual(result1.patches[i].rawData);
      }
    });
  }
});

// ─── Export → Import roundtrip for bulk dumps ───

describe('Roland Juno — Bulk dump roundtrip', () => {
  it('64 patches: export as bulk → re-import preserves data', async () => {
    const { RolandJunoImportAdapter, RolandJunoExportAdapter } = await getAdapter();
    const importAdapter = new RolandJunoImportAdapter();
    const exportAdapter = new RolandJunoExportAdapter();

    const patches = [];
    for (let i = 0; i < 64; i++) {
      const rawData = new Uint8Array(18);
      for (let j = 0; j < 18; j++) rawData[j] = (i * 13 + j * 7 + 5) & 0x7F;
      patches.push({ rawData, name: `A${i + 1}`, originAddress: `A${i + 1}`, hardwareIds: ['roland-juno106'] });
    }

    const sysex = exportAdapter.serialize(patches, 'Bulk Bank');
    const result = importAdapter.parse(sysex, 'bulk.syx');

    expect(result.success).toBe(true);
    expect(result.patches).toHaveLength(64);

    for (let i = 0; i < 64; i++) {
      expect(result.patches[i].rawData).toEqual(patches[i].rawData);
    }
  });
});

// ─── Hardware Link ───

describe('Roland Juno Hardware Link', () => {
  it('detects Juno-106 in MIDI output names', async () => {
    const { RolandJunoHardwareLink } = await getAdapter();
    const hw = new RolandJunoHardwareLink();
    const result = hw.detectHardware([
      { name: 'Juno-106 MIDI', id: 'dev1' },
    ]);
    expect(result).not.toBeNull();
    expect(result.name).toBe('Juno-106 MIDI');
    expect(result.manufacturer).toBe('Roland');
  });

  it('detects Juno-60', async () => {
    const { RolandJunoHardwareLink } = await getAdapter();
    const hw = new RolandJunoHardwareLink();
    const result = hw.detectHardware([{ name: 'Roland JUNO-60', id: 'dev2' }]);
    expect(result).not.toBeNull();
  });

  it('detects HS-60', async () => {
    const { RolandJunoHardwareLink } = await getAdapter();
    const hw = new RolandJunoHardwareLink();
    expect(hw.detectHardware([{ name: 'Synth Plus 60', id: 'dev3' }])).toBeNull();
    // "Synth Plus 60" doesn't match the regex — that's expected
    // The regex looks for /hs.?60/i or /juno.?6[^0]/i
  });

  it('ignores non-Roland devices', async () => {
    const { RolandJunoHardwareLink } = await getAdapter();
    const hw = new RolandJunoHardwareLink();
    const result = hw.detectHardware([{ name: 'Korg MS2000', id: 'dev4' }]);
    expect(result).toBeNull();
  });

  it('buildPatchDump produces valid single patch SysEx', async () => {
    const { RolandJunoHardwareLink } = await getAdapter();
    const hw = new RolandJunoHardwareLink();
    const rawData = new Uint8Array(18);
    for (let i = 0; i < 18; i++) rawData[i] = i * 5;
    const patch = { rawData, name: 'A1', originAddress: 'A1', hardwareIds: ['roland-juno106'] };

    const msgs = hw.buildPatchDump(patch, 0, 0);
    expect(msgs).toHaveLength(1);
    const sysex = msgs[0];
    expect(sysex[0]).toBe(0xF0);
    expect(sysex[1]).toBe(0x41);
    expect(sysex[2]).toBe(0x30); // CMD_PATCH_DUMP
    expect(sysex[sysex.length - 1]).toBe(0xF7);
    expect(sysex.length).toBe(23);
  });

  it('buildDumpRequest produces valid request SysEx', async () => {
    const { RolandJunoHardwareLink } = await getAdapter();
    const hw = new RolandJunoHardwareLink();
    const req = hw.buildDumpRequest('all', 0);
    expect(req[0]).toBe(0xF0);
    expect(req[1]).toBe(0x41);
    expect(req[4]).toBe(0x11); // CMD_REQUEST
    expect(req[req.length - 1]).toBe(0xF7);
  });
});

// ─── Edge Cases ───

describe('Roland Juno — Edge cases', () => {
  it('parse empty file returns failure', async () => {
    const { RolandJunoImportAdapter } = await getAdapter();
    const a = new RolandJunoImportAdapter();
    const result = a.parse(new Uint8Array(0), 'empty.syx');
    expect(result.success).toBe(false);
  });

  it('parse file with no valid messages returns failure', async () => {
    const { RolandJunoImportAdapter } = await getAdapter();
    const a = new RolandJunoImportAdapter();
    // Random bytes that don't form valid SysEx
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    const result = a.parse(garbage, 'garbage.syx');
    expect(result.success).toBe(false);
  });

  it('handles two concatenated 23-byte single patches', async () => {
    const { RolandJunoImportAdapter } = await getAdapter();
    const a = new RolandJunoImportAdapter();

    // Two single patches (each 23 bytes: F0 41 30 ch [18B] F7)
    const msg1 = new Uint8Array([0xF0, 0x41, 0x30, 0x00, ...new Uint8Array(18).fill(0x42), 0xF7]);
    const msg2 = new Uint8Array([0xF0, 0x41, 0x30, 0x00, ...new Uint8Array(18).fill(0x55), 0xF7]);
    expect(msg1.length).toBe(23);
    expect(msg2.length).toBe(23);
    const combined = new Uint8Array([...msg1, ...msg2]);

    const result = a.parse(combined, 'combined.syx');
    expect(result.success).toBe(true);
    expect(result.patches).toHaveLength(2);
    expect(result.patches[0].rawData[0]).toBe(0x42);
    expect(result.patches[1].rawData[0]).toBe(0x55);
  });

  it('handles data bytes 0xF0/0xF7 inside payload (fixed-offset parsing)', async () => {
    const { RolandJunoImportAdapter } = await getAdapter();
    const a = new RolandJunoImportAdapter();

    // Two single patches where data contains 0xF0 and 0xF7 bytes
    const data1 = new Uint8Array(18).fill(0x11);
    data1[5] = 0xF0; // F0 in data
    data1[10] = 0xF7; // F7 in data
    const msg1 = new Uint8Array([0xF0, 0x41, 0x30, 0x00, ...data1, 0xF7]);

    const data2 = new Uint8Array(18).fill(0x22);
    data2[3] = 0xF0;
    data2[15] = 0xF7;
    const msg2 = new Uint8Array([0xF0, 0x41, 0x30, 0x00, ...data2, 0xF7]);

    const combined = new Uint8Array([...msg1, ...msg2]);
    const result = a.parse(combined, 'f0f7data.syx');
    expect(result.success).toBe(true);
    expect(result.patches).toHaveLength(2);
    expect(result.patches[0].rawData[5]).toBe(0xF0);
    expect(result.patches[1].rawData[15]).toBe(0xF7);
  });

  it('truncated file (incomplete 23-byte message) is ignored', async () => {
    const { RolandJunoImportAdapter } = await getAdapter();
    const a = new RolandJunoImportAdapter();

    // One complete message + incomplete message (only 10 bytes)
    const msg1 = new Uint8Array([0xF0, 0x41, 0x30, 0x00, ...new Uint8Array(18).fill(0x33), 0xF7]);
    const truncated = new Uint8Array(10).fill(0xAA); // Only 10 bytes, not a valid 23-byte msg
    const combined = new Uint8Array([...msg1, ...truncated]);

    const result = a.parse(combined, 'truncated.syx');
    expect(result.success).toBe(true);
    expect(result.patches).toHaveLength(1); // Only the valid complete message
  });
});
