/**
 * Yamaha DX7 — Vertical Integration Tests
 *
 * Tests the full DX7 flow:
 *   1. Contract SysEx parsing & building
 *   2. Import .syx → parsed patches
 *   3. Export patches → .syx → re-import → verify roundtrip
 *   4. MIDI transport (mock ports)
 *   5. Parameter decoding from real fixture data
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getModelContract } from '../../src/contracts/modelContracts.js';
import { importFile } from '../../src/core/importEngine.js';
// Note: exportToFile is browser-only (uses saveAs). Roundtrip tested via contract.
import { decodeDx7Parameters, getDx7TableParameters, extractDx7Name } from '../../src/core/dx7Parameters.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../../../fixtures/sysex/yamaha-dx7/fixtures');

async function loadFixture(name) {
  const buf = await readFile(resolve(FIXTURES_DIR, name));
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

// ─── Contract Tests ───

describe('DX7 Contract', () => {
  const contract = getModelContract('yamaha-dx7');

  it('should be registered', () => {
    expect(contract).toBeDefined();
    expect(contract.modelId).toBe('yamaha-dx7');
    expect(contract.manufacturer).toBe('Yamaha');
    expect(contract.bankCapacity).toBe(32);
    expect(contract.patchDataSize).toBe(128);
  });

  it('should compute correct checksum', () => {
    const data = new Uint8Array([0x43, 0x00, 0x09, 0x20, 0x00]);
    const cs = contract.computeChecksum(data);
    expect(cs).toBeGreaterThanOrEqual(0);
    expect(cs).toBeLessThanOrEqual(127);
  });

  it('should verify checksum roundtrip', () => {
    const rawData = new Uint8Array(128);
    rawData[9] = 5;   // E (DX7 charset index)
    rawData[10] = 16; // P
    rawData[11] = 9;  // I
    const sysex = contract.buildPatchSysEx(rawData, 0, 1);
    expect(contract.verifyChecksum(sysex)).toBe(true);
  });

  it('should build dump request (7 bytes)', () => {
    const req = contract.buildDumpRequest('all', 1);
    expect(req.length).toBe(7);
    expect(req[0]).toBe(0xF0);
    expect(req[1]).toBe(0x43);
    expect(req[6]).toBe(0xF7);
  });

  it('should build single voice SysEx (136 bytes)', () => {
    const rawData = new Uint8Array(128);
    const sysex = contract.buildPatchSysEx(rawData, 0, 1);
    expect(sysex.length).toBe(136); // 6 header + 128 data + 1 checksum + 1 F7
    expect(sysex[0]).toBe(0xF0);
    expect(sysex[1]).toBe(0x43);
    expect(sysex[sysex.length - 1]).toBe(0xF7);
  });

  it('should parse single voice SysEx back', () => {
    const rawData = new Uint8Array(128);
    rawData[9] = 2;   // B (DX7 charset index)
    rawData[10] = 1;  // A
    rawData[11] = 19; // S
    rawData[12] = 19; // S
    const sysex = contract.buildPatchSysEx(rawData, 0, 1);
    const parsed = contract.parsePatchSysEx(sysex);
    expect(parsed).not.toBeNull();
    expect(parsed.rawData.length).toBe(128);
    expect(parsed.rawData[9]).toBe(2);
    expect(contract.extractPatchName(parsed.rawData)).toBe('BASS');
  });

  it('should parse bulk dump response (32 voices)', () => {
    // Standard DX7 6-byte header: F0 43 gg 09 20 00
    const header = new Uint8Array([0xF0, 0x43, 0x10, 0x09, 0x20, 0x00]);
    const payload = new Uint8Array(32 * 128);
    // Name for voice 0
    payload[9] = 0x56; payload[10] = 0x31; // 'V1'
    // Name for voice 15
    payload[15 * 128 + 9] = 0x56; payload[15 * 128 + 10] = 0x32; // 'V2'

    // Checksum covers header[3..5] + payload
    const checksumPayload = new Uint8Array(3 + payload.length);
    for (let i = 0; i < 3; i++) checksumPayload[i] = header[i + 3];
    checksumPayload.set(payload, 3);
    let sum = 0;
    for (const b of checksumPayload) sum += b;
    const checksum = (128 - (sum % 128)) & 0x7F;

    const full = new Uint8Array(header.length + payload.length + 2);
    full.set(header, 0);
    full.set(payload, header.length);
    full[header.length + payload.length] = checksum;
    full[header.length + payload.length + 1] = 0xF7;

    const results = contract.parseDumpResponse(full);
    expect(results.length).toBe(32);
    expect(results[0].rawData[9]).toBe(0x56);
    expect(results[15].rawData[9]).toBe(0x56);
  });
});

// ─── Fixture Import Tests ───

describe('DX7 Fixture Import', () => {
  it('should import single-voice.syx', async () => {
    const raw = await loadFixture('single-voice.syx');
    const file = { name: 'single-voice.syx', arrayBuffer: async () => raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) };
    const result = await importFile(file);
    expect(result.success).toBe(true);
    expect(result.bank).toBeDefined();
    expect(result.bank.modelId).toBe('yamaha-dx7');
    expect(result.patches.length).toBe(1);
    expect(result.patches[0].name).toBe('E.PIANO 1');
    expect(result.patches[0].rawData.length).toBe(128);
  });

  it('should import bulk-32voices.syx', async () => {
    const raw = await loadFixture('bulk-32voices.syx');
    const file = { name: 'bulk-32voices.syx', arrayBuffer: async () => raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) };
    const result = await importFile(file);
    expect(result.success).toBe(true);
    expect(result.bank.modelId).toBe('yamaha-dx7');
    expect(result.patches.length).toBe(32);
    expect(result.patches[0].name).toBe('PATCH 01');
    expect(result.patches[31].name).toBe('PATCH 32');
  });

  it('should import e-piano-bank.syx with correct names', async () => {
    const raw = await loadFixture('e-piano-bank.syx');
    const file = { name: 'e-piano-bank.syx', arrayBuffer: async () => raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) };
    const result = await importFile(file);
    expect(result.success).toBe(true);
    expect(result.patches.length).toBe(32);
    expect(result.patches[0].name).toBe('E.PIANO 1');
    expect(result.patches[3].name).toBe('TINE 1');
    expect(result.patches[31].name).toBe('BASS 3');
  });

  it('should import multi-voice.syx (3 separate messages)', async () => {
    const raw = await loadFixture('multi-voice.syx');
    const file = { name: 'multi-voice.syx', arrayBuffer: async () => raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) };
    const result = await importFile(file);
    expect(result.success).toBe(true);
    expect(result.patches.length).toBe(3);
    expect(result.patches[0].name).toBe('BASS 1');
    expect(result.patches[1].name).toBe('LEAD 1');
    expect(result.patches[2].name).toBe('PAD 1');
  });
});

// ─── Roundtrip Tests ───

describe('DX7 Roundtrip (import → export → re-import)', () => {
  it('should roundtrip a single voice through export and re-import', async () => {
    // Import
    const raw1 = await loadFixture('single-voice.syx');
    const file1 = { name: 'single-voice.syx', arrayBuffer: async () => raw1.buffer.slice(raw1.byteOffset, raw1.byteOffset + raw1.byteLength) };
    const imported = await importFile(file1);
    expect(imported.success).toBe(true);

    // Verify the contract roundtrip (export→parse→verify)
    const contract = getModelContract('yamaha-dx7');
    const rawData = imported.patches[0].rawData;
    const sysex = contract.buildPatchSysEx(rawData, 0, 1);
    const parsed = contract.parsePatchSysEx(sysex);
    expect(parsed).not.toBeNull();
    expect(parsed.rawData.length).toBe(128);
    expect(parsed.rawData[9]).toBe(rawData[9]);
    expect(parsed.rawData[10]).toBe(rawData[10]);
    expect(contract.extractPatchName(parsed.rawData)).toBe('E.PIANO 1');
  });

  it('should roundtrip all 32 voices of a bulk dump', async () => {
    const contract = getModelContract('yamaha-dx7');
    const raw = await loadFixture('e-piano-bank.syx');
    const file = { name: 'e-piano-bank.syx', arrayBuffer: async () => raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) };
    const imported = await importFile(file);
    expect(imported.patches.length).toBe(32);

    for (let i = 0; i < 32; i++) {
      const rawData = imported.patches[i].rawData;
      const sysex = contract.buildPatchSysEx(rawData, i, 1);
      const parsed = contract.parsePatchSysEx(sysex);
      expect(parsed).not.toBeNull();
      expect(contract.verifyChecksum(sysex)).toBe(true);
      expect(contract.extractPatchName(parsed.rawData)).toBe(imported.patches[i].name);
    }
  });
});

// ─── Parameter Decoding Tests ───

describe('DX7 Parameter Decoding from Fixtures', () => {
  it('should decode parameters from single-voice fixture', async () => {
    const raw = await loadFixture('single-voice.syx');
    const file = { name: 'single-voice.syx', arrayBuffer: async () => raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) };
    const imported = await importFile(file);
    const rawData = imported.patches[0].rawData;

    const params = decodeDx7Parameters(rawData);
    expect(params.length).toBe(127); // 128 - name

    // Verify algorithm (offset 116)
    const algo = params.find(p => p.name === 'Algorithm');
    expect(algo).toBeDefined();
    expect(algo.value).toBe('6'); // algo=5 → displayed as 6

    // Verify LFO Speed (offset 119)
    const lfo = params.find(p => p.name === 'LFO Speed');
    expect(lfo).toBeDefined();
    expect(lfo.value).toBe(45);

    // Verify OP1 Output Level (offset 98)
    const op1 = params.find(p => p.name === 'OP1 Output Level');
    expect(op1).toBeDefined();
    expect(op1.value).toBe(75);
  });

  it('should generate table parameters with hex offsets', async () => {
    const raw = await loadFixture('single-voice.syx');
    const file = { name: 'single-voice.syx', arrayBuffer: async () => raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) };
    const imported = await importFile(file);
    const rawData = imported.patches[0].rawData;

    const table = getDx7TableParameters(rawData);
    expect(table.length).toBe(127);
    // Verify hex format
    const first = table[0];
    expect(first.offset).toMatch(/0x00/);
  });
});

// ─── MIDI Transport Mock Tests ───

describe('DX7 MIDI Transport (mock)', () => {
  it('should create transport with mock ports', async () => {
    const { createDx7MidiTransport } = await import('../../src/core/pro800Midi.js');
    let sentData = null;
    const mockOutput = {
      name: 'Mock DX7 Out',
      send: (data) => { sentData = data; },
    };
    const mockInput = {
      name: 'Mock DX7 In',
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    const transport = createDx7MidiTransport({ input: mockInput, output: mockOutput });
    expect(transport).toBeDefined();
    expect(transport.capabilities.fetch).toBe(true);
    expect(transport.capabilities.send).toBe(true);
    transport.close();
  });

  it('should send a patch via sendPatch', async () => {
    const { createDx7MidiTransport } = await import('../../src/core/pro800Midi.js');
    let sentData = null;
    const mockOutput = {
      name: 'Mock DX7 Out',
      send: (data) => { sentData = data; },
    };
    const mockInput = {
      name: 'Mock DX7 In',
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    const transport = createDx7MidiTransport({ input: mockInput, output: mockOutput });
    const rawData = new Uint8Array(128);
    rawData[9] = 20;  // T (DX7 charset index)
    rawData[10] = 5;  // E
    rawData[11] = 19; // S
    rawData[12] = 20; // T

    transport.sendPatch({ rawData }, 0, 1);
    expect(sentData).not.toBeNull();
    expect(sentData[0]).toBe(0xF0);
    expect(sentData[1]).toBe(0x43);
    expect(sentData.length).toBe(136);

    const contract = getModelContract('yamaha-dx7');
    expect(contract.verifyChecksum(sentData)).toBe(true);
    transport.close();
  });

  it('should throw if no output provided', async () => {
    const { createDx7MidiTransport } = await import('../../src/core/pro800Midi.js');
    expect(() => createDx7MidiTransport({})).toThrow('Se requiere una salida MIDI');
  });
});
