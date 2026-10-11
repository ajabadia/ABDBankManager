/**
 * Korg MS2000 / microKORG / Prophecy Adapter — Comprehensive Tests
 *
 * Tests import/export/hardware link with real fixture files.
 *
 * SysEx format:
 *   Single:  F0 42 <3n> <modelId> 40 [7-to-8 packed data] F7
 *   Request: F0 42 <3n> <modelId> 10 F7
 *
 * 7-to-8 packing: every 7 input bytes → 1 control + 7 encoded bytes
 * No checksum (integrity via packing structure)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const FIXTURES = {
  ms2000: join(import.meta.dirname, '../../..', 'fixtures/sysex/korg-ms2000/factory'),
  microkorg: join(import.meta.dirname, '../../..', 'fixtures/sysex/korg-microkorg/factory'),
  prophecy: join(import.meta.dirname, '../../..', 'fixtures/sysex/korg-prophecy/factory'),
};

// Lazy-load adapter
let adapter;
async function getAdapter() {
  if (!adapter) {
    const mod = await import('@contracts/Adapters/korgMs2000Adapter');
    adapter = mod;
  }
  return adapter;
}

// ─── Import Adapter Identity ───

describe('Korg MS2000 Import Adapter — Identity', () => {
  it('has correct adapterId', async () => {
    const { KorgMs2000ImportAdapter } = await getAdapter();
    const a = new KorgMs2000ImportAdapter();
    expect(a.adapterId).toBe('sysex-korg-ms2000');
  });

  it('supports .syx extension', async () => {
    const { KorgMs2000ImportAdapter } = await getAdapter();
    const a = new KorgMs2000ImportAdapter();
    expect(a.supportedExtensions).toContain('.syx');
  });

  it('targets MS2000, microKORG, and Prophecy', async () => {
    const { KorgMs2000ImportAdapter } = await getAdapter();
    const a = new KorgMs2000ImportAdapter();
    expect(a.targetModelIds).toEqual(
      expect.arrayContaining(['korg-ms2000', 'korg-microkorg', 'korg-prophecy'])
    );
  });
});

// ─── canParse ───

describe('Korg MS2000 Import Adapter — canParse', () => {
  it('accepts MS2000 .syx files', async () => {
    const { KorgMs2000ImportAdapter } = await getAdapter();
    const a = new KorgMs2000ImportAdapter();
    const data = new Uint8Array(readFileSync(join(FIXTURES.ms2000, 'MS2000_Bank_A.syx')));
    expect(a.canParse(data, 'MS2000_Bank_A.syx')).toBe(true);
  });

  it('accepts microKORG .syx files', async () => {
    const { KorgMs2000ImportAdapter } = await getAdapter();
    const a = new KorgMs2000ImportAdapter();
    const data = new Uint8Array(readFileSync(join(FIXTURES.microkorg, 'MicroKORG_Bank_A.syx')));
    expect(a.canParse(data, 'MicroKORG_Bank_A.syx')).toBe(true);
  });

  it('accepts Prophecy .syx files', async () => {
    const { KorgMs2000ImportAdapter } = await getAdapter();
    const a = new KorgMs2000ImportAdapter();
    // Prophecy now uses a completely different format (model 0x41, different packing)
    // This adapter is for MS2000/microKORG format; Prophecy has its own contract
    const data = new Uint8Array(readFileSync(join(FIXTURES.prophecy, 'Megawave.syx')));
    expect(a.canParse(data, 'Megawave.syx')).toBe(false);
  });

  it('rejects non-.syx files', async () => {
    const { KorgMs2000ImportAdapter } = await getAdapter();
    const a = new KorgMs2000ImportAdapter();
    const data = new Uint8Array(readFileSync(join(FIXTURES.ms2000, 'MS2000_Bank_A.syx')));
    expect(a.canParse(data, 'test.mid')).toBe(false);
  });

  it('rejects non-Korg SysEx', async () => {
    const { KorgMs2000ImportAdapter } = await getAdapter();
    const a = new KorgMs2000ImportAdapter();
    const fake = new Uint8Array([0xF0, 0x43, 0x00, 0x09, 0x20, 0x00, 0xF7]);
    expect(a.canParse(fake, 'test.syx')).toBe(false);
  });
});

// ─── Parse Real Fixtures ───

describe('Korg MS2000 Import Adapter — Parse MS2000 fixtures', () => {
  const bankFiles = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  for (const bank of bankFiles) {
    it(`parses MS2000_Bank_${bank}.syx → 16 patches`, async () => {
      const { KorgMs2000ImportAdapter } = await getAdapter();
      const a = new KorgMs2000ImportAdapter();
      const data = new Uint8Array(readFileSync(join(FIXTURES.ms2000, `MS2000_Bank_${bank}.syx`)));
      const result = a.parse(data, `MS2000_Bank_${bank}.syx`);

      expect(result.success).toBe(true);
      expect(result.modelId).toBe('korg-ms2000');
      expect(result.patches).toHaveLength(16);
    });

    it(`MS2000_Bank_${bank}: each patch has 254-byte rawData (real program size)`, async () => {
      const { KorgMs2000ImportAdapter } = await getAdapter();
      const a = new KorgMs2000ImportAdapter();
      const data = new Uint8Array(readFileSync(join(FIXTURES.ms2000, `MS2000_Bank_${bank}.syx`)));
      const result = a.parse(data, `MS2000_Bank_${bank}.syx`);

      for (const p of result.patches) {
        expect(p.rawData).toBeInstanceOf(Uint8Array);
        expect(p.rawData.length).toBe(254);
      }
    });

    it(`MS2000_Bank_${bank}: patches have correct origin addresses`, async () => {
      const { KorgMs2000ImportAdapter } = await getAdapter();
      const a = new KorgMs2000ImportAdapter();
      const data = new Uint8Array(readFileSync(join(FIXTURES.ms2000, `MS2000_Bank_${bank}.syx`)));
      const result = a.parse(data, `MS2000_Bank_${bank}.syx`);

      // Patches are numbered A.01–A.16 within each bank file
      expect(result.patches[0].originAddress).toBe('A.01');
      expect(result.patches[15].originAddress).toBe('A.16');
    });
  }
});

describe('Korg MS2000 Import Adapter — Parse microKORG fixtures', () => {
  const bankFiles = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  for (const bank of bankFiles) {
    it(`parses MicroKORG_Bank_${bank}.syx → 16 patches`, async () => {
      const { KorgMs2000ImportAdapter } = await getAdapter();
      const a = new KorgMs2000ImportAdapter();
      const data = new Uint8Array(readFileSync(join(FIXTURES.microkorg, `MicroKORG_Bank_${bank}.syx`)));
      const result = a.parse(data, `MicroKORG_Bank_${bank}.syx`);

      expect(result.success).toBe(true);
      expect(result.modelId).toBe('korg-microkorg');
      expect(result.patches).toHaveLength(16);
    });
  }
});

describe('Korg MS2000 Import Adapter — Prophecy format (different from MS2000)', () => {
  it('does not parse Prophecy bank files (different format: model 0x41, 535-byte patches, 64/bank)', async () => {
    const { KorgMs2000ImportAdapter } = await getAdapter();
    const a = new KorgMs2000ImportAdapter();
    const data = new Uint8Array(readFileSync(join(FIXTURES.prophecy, 'Megawave.syx')));
    const result = a.parse(data, 'Megawave.syx');
    // MS2000 adapter expects model 0x58; Prophecy uses 0x41 with different packing
    expect(result.success).toBe(false);
  });

  it('does not parse Prophecy single dumps (different format)', async () => {
    const { KorgMs2000ImportAdapter } = await getAdapter();
    const a = new KorgMs2000ImportAdapter();
    const data = new Uint8Array(readFileSync(join(FIXTURES.prophecy, 'VCS3.SYX')));
    const result = a.parse(data, 'VCS3.SYX');
    expect(result.success).toBe(false);
  });
});

// ─── Export Adapter Identity ───

describe('Korg MS2000 Export Adapter — Identity', () => {
  it('has correct adapterId', async () => {
    const { KorgMs2000ExportAdapter } = await getAdapter();
    const a = new KorgMs2000ExportAdapter();
    expect(a.adapterId).toBe('export-korg-ms2000');
  });

  it('exports .syx files', async () => {
    const { KorgMs2000ExportAdapter } = await getAdapter();
    const a = new KorgMs2000ExportAdapter();
    expect(a.fileExtension).toBe('.syx');
  });
});

// ─── Serialize ───

describe('Korg MS2000 Export Adapter — Serialize', () => {
  it('single patch produces correct SysEx structure', async () => {
    const { KorgMs2000ExportAdapter } = await getAdapter();
    const a = new KorgMs2000ExportAdapter();
    const rawData = new Uint8Array(288);
    for (let i = 0; i < 288; i++) rawData[i] = i & 0x7F;
    const patches = [{ rawData, name: 'Test', originAddress: 'A.01', hardwareIds: ['korg-ms2000'] }];

    const sysex = a.serialize(patches, 'Test');
    expect(sysex[0]).toBe(0xF0); // SysEx start
    expect(sysex[1]).toBe(0x42); // Korg
    expect(sysex[2]).toBe(0x30); // 3n (channel 0)
    expect(sysex[3]).toBe(0x58); // MS2000 model ID
    expect(sysex[4]).toBe(0x40); // CMD_SINGLE_DUMP
    expect(sysex[sysex.length - 1]).toBe(0xF7); // SysEx end
  });

  it('exports microKORG with correct model ID', async () => {
    const { KorgMs2000ExportAdapter } = await getAdapter();
    const a = new KorgMs2000ExportAdapter();
    const rawData = new Uint8Array(288).fill(0x42);
    const patches = [{ rawData, name: 'Test', originAddress: 'A.01', hardwareIds: ['korg-microkorg'] }];

    const sysex = a.serialize(patches, 'Test');
    // microKORG and MS2000 share model ID 0x58
    expect(sysex[3]).toBe(0x58);
  });

  it('exports Prophecy with legacy model ID (0x5A) — Export Adapter uses legacy format', async () => {
    const { KorgMs2000ExportAdapter } = await getAdapter();
    const a = new KorgMs2000ExportAdapter();
    const rawData = new Uint8Array(256).fill(0x42);
    const patches = [{ rawData, name: 'Test', originAddress: 'A.01', hardwareIds: ['korg-prophecy'] }];

    const sysex = a.serialize(patches, 'Test');
    // Export Adapter uses legacy format (model 0x5A, 256-byte patches) for Prophecy
    // New Prophecy format (0x41, 535 bytes) is handled by the contract directly
    expect(sysex[3]).toBe(0x5A);
  });
});

// ─── Roundtrip ───

describe('Korg MS2000 — Import → Export → Import roundtrip', () => {
  it('MS2000 Bank A: roundtrip preserves all patch data', async () => {
    const { KorgMs2000ImportAdapter, KorgMs2000ExportAdapter } = await getAdapter();
    const importAdapter = new KorgMs2000ImportAdapter();
    const exportAdapter = new KorgMs2000ExportAdapter();

    const data = new Uint8Array(readFileSync(join(FIXTURES.ms2000, 'MS2000_Bank_A.syx')));
    const result1 = importAdapter.parse(data, 'MS2000_Bank_A.syx');
    expect(result1.success).toBe(true);
    expect(result1.patches).toHaveLength(16);

    const sysex = exportAdapter.serialize(result1.patches, 'Roundtrip');
    const result2 = importAdapter.parse(sysex, 'roundtrip.syx');
    expect(result2.success).toBe(true);
    expect(result2.patches).toHaveLength(result1.patches.length);

    for (let i = 0; i < result1.patches.length; i++) {
      expect(result2.patches[i].rawData).toEqual(result1.patches[i].rawData);
    }
  });

  it('microKORG Bank A: roundtrip preserves all patch data', async () => {
    const { KorgMs2000ImportAdapter, KorgMs2000ExportAdapter } = await getAdapter();
    const importAdapter = new KorgMs2000ImportAdapter();
    const exportAdapter = new KorgMs2000ExportAdapter();

    const data = new Uint8Array(readFileSync(join(FIXTURES.microkorg, 'MicroKORG_Bank_A.syx')));
    const result1 = importAdapter.parse(data, 'MicroKORG_Bank_A.syx');
    expect(result1.success).toBe(true);

    const sysex = exportAdapter.serialize(result1.patches, 'Roundtrip');
    const result2 = importAdapter.parse(sysex, 'roundtrip.syx');
    expect(result2.success).toBe(true);

    for (let i = 0; i < result1.patches.length; i++) {
      expect(result2.patches[i].rawData).toEqual(result1.patches[i].rawData);
    }
  });

  it('Prophecy Bank A: roundtrip NOT supported (MS2000 adapter for different format)', async () => {
    const { KorgMs2000ImportAdapter, KorgMs2000ExportAdapter } = await getAdapter();
    const importAdapter = new KorgMs2000ImportAdapter();
    const exportAdapter = new KorgMs2000ExportAdapter();

    // Prophecy uses a completely different format (model 0x41, 535-byte patches, 64/bank)
    // The MS2000 adapter is for model 0x58 format only
    const data = new Uint8Array(readFileSync(join(FIXTURES.prophecy, 'Megawave.syx')));
    const result1 = importAdapter.parse(data, 'Megawave.syx');
    expect(result1.success).toBe(false);
  });
});

// ─── Hardware Link ───

describe('Korg MS2000 Hardware Link', () => {
  it('detects MS2000 in MIDI output names', async () => {
    const { KorgMs2000HardwareLink } = await getAdapter();
    const hw = new KorgMs2000HardwareLink();
    const result = hw.detectHardware([{ name: 'MS2000 MIDI', id: 'dev1' }]);
    expect(result).not.toBeNull();
    expect(result.name).toBe('MS2000 MIDI');
    expect(result.manufacturer).toBe('Korg');
  });

  it('detects microKORG', async () => {
    const { KorgMs2000HardwareLink } = await getAdapter();
    const hw = new KorgMs2000HardwareLink();
    const result = hw.detectHardware([{ name: 'microKORG', id: 'dev2' }]);
    expect(result).not.toBeNull();
  });

  it('ignores non-Korg devices', async () => {
    const { KorgMs2000HardwareLink } = await getAdapter();
    const hw = new KorgMs2000HardwareLink();
    const result = hw.detectHardware([{ name: 'Roland Juno-106', id: 'dev3' }]);
    expect(result).toBeNull();
  });

  it('buildPatchDump produces valid SysEx', async () => {
    const { KorgMs2000HardwareLink } = await getAdapter();
    const hw = new KorgMs2000HardwareLink();
    const rawData = new Uint8Array(288);
    for (let i = 0; i < 288; i++) rawData[i] = i & 0x7F;
    const patch = { rawData, name: 'Test', originAddress: 'A.01', hardwareIds: ['korg-ms2000'] };

    const msgs = hw.buildPatchDump(patch, 0, 0);
    expect(msgs).toHaveLength(1);
    const sysex = msgs[0];
    expect(sysex[0]).toBe(0xF0);
    expect(sysex[1]).toBe(0x42);
    expect(sysex[3]).toBe(0x58); // MS2000 model ID
    expect(sysex[4]).toBe(0x40); // CMD_SINGLE_DUMP
    expect(sysex[sysex.length - 1]).toBe(0xF7);
  });
});

// ─── Edge Cases ───

describe('Korg MS2000 — Edge cases', () => {
  it('parse empty file returns failure', async () => {
    const { KorgMs2000ImportAdapter } = await getAdapter();
    const a = new KorgMs2000ImportAdapter();
    const result = a.parse(new Uint8Array(0), 'empty.syx');
    expect(result.success).toBe(false);
  });

  it('handles concatenated SysEx messages', async () => {
    const { KorgMs2000ImportAdapter } = await getAdapter();
    const a = new KorgMs2000ImportAdapter();

    // Two MS2000 single patches concatenated
    const msg1 = new Uint8Array([0xF0, 0x42, 0x30, 0x58, 0x40, ...new Uint8Array(336).fill(0x07), 0xF7]);
    const msg2 = new Uint8Array([0xF0, 0x42, 0x30, 0x58, 0x40, ...new Uint8Array(336).fill(0x15), 0xF7]);
    const combined = new Uint8Array([...msg1, ...msg2]);

    const result = a.parse(combined, 'combined.syx');
    expect(result.success).toBe(true);
    expect(result.patches).toHaveLength(2);
  });

  it('handles interleaved non-SysEx bytes', async () => {
    const { KorgMs2000ImportAdapter } = await getAdapter();
    const a = new KorgMs2000ImportAdapter();

    const msg1 = new Uint8Array([0xF0, 0x42, 0x30, 0x58, 0x40, ...new Uint8Array(336).fill(0x11), 0xF7]);
    const clock = new Uint8Array([0xF8, 0xF8]);
    const msg2 = new Uint8Array([0xF0, 0x42, 0x30, 0x58, 0x40, ...new Uint8Array(336).fill(0x22), 0xF7]);
    const combined = new Uint8Array([...msg1, ...clock, ...msg2]);

    const result = a.parse(combined, 'mixed.syx');
    expect(result.success).toBe(true);
    expect(result.patches).toHaveLength(2);
  });
});

// ─── Canal 16 por todas las rutas de serialización ───
//
// Regresión: el adapter enmascaraba el canal antes de delegar en el contrato
// (`opts.midiChannel & 0x0F`), y como `16 & 0x0F === 0` el canal 16 se colapsaba en el 1
// —el 16 quedaba inalcanzable—. El contrato ya acota a 1..16 (`korgChannelByte`), así que
// el adapter pasa el canal tal cual. Estos tests fijan el byte `3n` en **todas** las rutas
// que serializan, no solo en la que ya cubría el contrato.

describe('Korg MS2000 — Channel 16 on every serialization route (no collapse into channel 1)', () => {
  const rawPatch = () => {
    const d = new Uint8Array(288);
    for (let i = 0; i < d.length; i++) d[i] = i & 0x7F;
    return d;
  };
  const patchFor = (hardwareId) => ({
    rawData: rawPatch(),
    name: 'Test',
    originAddress: 'A.01',
    hardwareIds: [hardwareId],
  });

  // El byte que el MS2000 lee como canal 16: 0x3F (y nunca el 0x30 del canal 1).
  const CHANNEL_16 = 0x3F;
  const CHANNEL_1 = 0x30;

  it('ExportAdapter.serialize (MS2000) puts 0x3F in the 3n byte, not 0x30', async () => {
    const { KorgMs2000ExportAdapter } = await getAdapter();
    const a = new KorgMs2000ExportAdapter();

    const sysex = a.serialize([patchFor('korg-ms2000')], 'Test', { midiChannel: 16 });
    expect(sysex[0]).toBe(0xF0);
    expect(sysex[1]).toBe(0x42);
    expect(sysex[2]).toBe(CHANNEL_16);
    expect(sysex[2]).not.toBe(CHANNEL_1);
    expect(sysex[3]).toBe(0x58);
  });

  it('ExportAdapter.serialize (microKORG) uses the same 3n byte', async () => {
    const { KorgMs2000ExportAdapter } = await getAdapter();
    const a = new KorgMs2000ExportAdapter();

    const sysex = a.serialize([patchFor('korg-microkorg')], 'Test', { midiChannel: 16 });
    expect(sysex[2]).toBe(CHANNEL_16);
    expect(sysex[3]).toBe(0x58);
  });

  it('ExportAdapter.serialize (Prophecy legacy retag) keeps channel 16 and retags the model byte', async () => {
    const { KorgMs2000ExportAdapter } = await getAdapter();
    const a = new KorgMs2000ExportAdapter();

    const sysex = a.serialize([patchFor('korg-prophecy')], 'Test', { midiChannel: 16 });
    expect(sysex[2]).toBe(CHANNEL_16);
    expect(sysex[3]).toBe(0x5A);
  });

  it('HardwareLink.buildPatchDump keeps channel 16', async () => {
    const { KorgMs2000HardwareLink } = await getAdapter();
    const hw = new KorgMs2000HardwareLink();

    const msgs = hw.buildPatchDump(patchFor('korg-ms2000'), 15, 16);
    expect(msgs).toHaveLength(1);
    expect(msgs[0][2]).toBe(CHANNEL_16);
    expect(msgs[0][4]).toBe(0x40);
  });

  it('HardwareLink.buildBankDump keeps channel 16 on every message of the bank', async () => {
    const { KorgMs2000HardwareLink } = await getAdapter();
    const hw = new KorgMs2000HardwareLink();
    const patches = Array.from({ length: 16 }, () => patchFor('korg-ms2000'));

    const msgs = hw.buildBankDump(patches, 16);
    expect(msgs).toHaveLength(16);
    for (const msg of msgs) expect(msg[2]).toBe(CHANNEL_16);
  });

  it('HardwareLink.buildDumpRequest keeps channel 16 for a slot and for the whole bank', async () => {
    const { KorgMs2000HardwareLink } = await getAdapter();
    const hw = new KorgMs2000HardwareLink();

    expect(Array.from(hw.buildDumpRequest(0, 16))).toEqual([0xF0, 0x42, CHANNEL_16, 0x58, 0x10, 0xF7]);
    expect(Array.from(hw.buildDumpRequest('all', 16))).toEqual([0xF0, 0x42, CHANNEL_16, 0x58, 0x0E, 0xF7]);
  });

  it('the whole 1..16 range is addressable: 16 distinct bytes, none shared', async () => {
    const { KorgMs2000ExportAdapter } = await getAdapter();
    const a = new KorgMs2000ExportAdapter();

    const bytes = [];
    for (let channel = 1; channel <= 16; channel++) {
      bytes.push(a.serialize([patchFor('korg-ms2000')], 'Test', { midiChannel: channel })[2]);
    }
    expect(bytes[0]).toBe(CHANNEL_1);
    expect(bytes[15]).toBe(CHANNEL_16);
    expect(new Set(bytes).size).toBe(16);
    // El caso exacto de la regresión: 16 y 1 no pueden compartir byte.
    expect(bytes[15]).not.toBe(bytes[0]);
  });

  it('an out-of-range channel clamps to 1 / 16 instead of wrapping into another channel', async () => {
    const { KorgMs2000ExportAdapter } = await getAdapter();
    const a = new KorgMs2000ExportAdapter();

    const below = a.serialize([patchFor('korg-ms2000')], 'Test', { midiChannel: 0 });
    const above = a.serialize([patchFor('korg-ms2000')], 'Test', { midiChannel: 17 });
    expect(below[2]).toBe(CHANNEL_1);
    expect(above[2]).toBe(CHANNEL_16);
  });
});
