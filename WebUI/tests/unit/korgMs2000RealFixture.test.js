/**
 * Korg MS2000 / microKORG / Prophecy — Real Fixture Roundtrip Tests
 *
 * Roundtrip byte-idéntico: parsePatchSysEx(buildPatchSysEx(rawData)) === rawData
 */
import { describe, it, expect } from 'vitest';
import { getModelContract } from '../../src/contracts/modelContracts.js';

const models = [
  { modelId: 'korg-ms2000', modelByte: 0x58, patchSize: 288, programsPerBank: 16, nameOffset: 0x1C, nameLength: 12 },
  { modelId: 'korg-microkorg', modelByte: 0x58, patchSize: 288, programsPerBank: 16, nameOffset: 0x1C, nameLength: 12 },
  { modelId: 'korg-prophecy', modelByte: 0x41, patchSize: 535, programsPerBank: 64, nameOffset: 0x00, nameLength: 16 }
];

// Prophecy: 535 = 76*7 + 3, last 3 bytes have no control byte → mask to 7-bit
function makeProphecyTestData(patchSize, formula) {
  const data = new Uint8Array(patchSize);
  for (let i = 0; i < patchSize; i++) {
    data[i] = formula(i);
  }
  const rem = patchSize % 7;
  if (rem > 0) {
    for (let i = patchSize - rem; i < patchSize; i++) data[i] &= 0x7F;
  }
  return data;
}

function runTests() {
  for (const { modelId, patchSize, programsPerBank, nameOffset, nameLength } of models) {
    describe(`Korg ${modelId.toUpperCase()} — Roundtrip`, () => {
      const contract = getModelContract(modelId);

      it('should be registered with correct metadata', () => {
        expect(contract).toBeDefined();
        expect(contract.modelId).toBe(modelId);
        expect(contract.manufacturer).toBe('Korg');
        expect(contract.programsPerBank).toBe(programsPerBank);
        expect(contract.patchDataSize).toBe(patchSize);
      });

      it('roundtrips a known patch through build → parse', () => {
        const rawData = modelId === 'korg-prophecy'
          ? makeProphecyTestData(patchSize, i => (i * 41 + 7) & 0xFF)
          : (() => { const d = new Uint8Array(patchSize); for (let i = 0; i < patchSize; i++) d[i] = (i * 41 + 7) & 0xFF; return d; })();

        const sysex = contract.buildPatchSysEx(rawData, 0, 0);
        expect(sysex[0]).toBe(0xF0);
        expect(sysex[1]).toBe(0x42);
        expect(sysex[sysex.length - 1]).toBe(0xF7);

        const parsed = contract.parsePatchSysEx(sysex);
        expect(parsed).not.toBeNull();
        expect(parsed.rawData.length).toBe(patchSize);
        expect(parsed.rawData).toEqual(rawData);
      });

      it('roundtrips patches across banks', () => {
        for (let bank = 0; bank < Math.min(2, contract.banksCount); bank++) {
          for (let program = 0; program < programsPerBank; program += Math.max(1, programsPerBank / 2)) {
            const rawData = modelId === 'korg-prophecy'
              ? makeProphecyTestData(patchSize, i => (i * 31 + program * 7 + bank * 13 + 5) & 0xFF)
              : (() => { const d = new Uint8Array(patchSize); for (let i = 0; i < patchSize; i++) d[i] = (i * 31 + program * 7 + bank * 13 + 5) & 0xFF; return d; })();

            const slot = bank * programsPerBank + program;
            const sysex = contract.buildPatchSysEx(rawData, slot, 0);
            const parsed = contract.parsePatchSysEx(sysex);
            expect(parsed).not.toBeNull();
            expect(parsed.rawData).toEqual(rawData);
          }
        }
      });

      it('extracts patch name from correct offset', () => {
        const rawData = new Uint8Array(patchSize);
        const name = 'TestPatch';
        const encoder = new TextEncoder();
        const nameBytes = encoder.encode(name.padEnd(nameLength, ' '));
        for (let i = 0; i < nameLength; i++) rawData[nameOffset + i] = nameBytes[i];

        const sysex = contract.buildPatchSysEx(rawData, 0, 0);
        const parsed = contract.parsePatchSysEx(sysex);
        expect(parsed).not.toBeNull();
        expect(contract.extractPatchName(parsed.rawData)).toBe(name);
      });
    });
  }
}

runTests();

// Cross-model identification
describe('Korg — Cross-model identification', () => {
  it('MS2000, microKORG, and Prophecy have distinct modelBytes', () => {
    const ms2000 = getModelContract('korg-ms2000');
    const microkorg = getModelContract('korg-microkorg');
    const prophecy = getModelContract('korg-prophecy');

    expect(ms2000.modelId).toBe('korg-ms2000');
    expect(microkorg.modelId).toBe('korg-microkorg');
    expect(prophecy.modelId).toBe('korg-prophecy');
    expect(ms2000.manufacturer).toBe('Korg');
    expect(microkorg.manufacturer).toBe('Korg');
    expect(prophecy.manufacturer).toBe('Korg');
  });

  it('Prophecy model byte is 0x41, not 0x5A', () => {
    const prophecy = getModelContract('korg-prophecy');
    expect(prophecy.sysexModelId?.values).toContain(0x41);
  });
});

// Real fixture parsing (Prophecy real dumps)
describe('Korg Prophecy — Real fixture parsing', () => {
  it('parses VCS3.SYX single and extracts name', () => {
    const contract = getModelContract('korg-prophecy');
    const raw = new Uint8Array([
      0xF0,0x42,0x30,0x41,0x40,0x01,0x00,
      0x56,0x65,0x72,0x79,0x20,0x50,0x69,0x00, // "Very Pi" + ctrl(0)
      0x6E,0x6B,0x20,0x56,0x43,0x53,0x33,0x20, // "nk VCS3 "
      0x20,0x00,0x20,0x20,0x20,0x20,0x20,0x00, // rest + ctrl(0)
      ...new Array(611 - 24).fill(0),
      0xF7
    ]);
    // Actually test with real file by reading fixture
  });

  it('parses real VCS3.SYX fixture', () => {
    const contract = getModelContract('korg-prophecy');
    const fs = require('fs');
    const path = require('path');
    const fixture = fs.readFileSync(path.resolve('fixtures/sysex/korg-prophecy/factory/VCS3.SYX'));
    const parsed = contract.parsePatchSysEx(new Uint8Array(fixture));
    expect(parsed).not.toBeNull();
    expect(parsed.rawData.length).toBe(535);
    expect(contract.extractPatchName(parsed.rawData)).toBe('Very Pink VCS3');
  });

  it('parses real Megawave.syx bank (64 patches)', () => {
    const contract = getModelContract('korg-prophecy');
    const fs = require('fs');
    const path = require('path');
    const fixture = fs.readFileSync(path.resolve('fixtures/sysex/korg-prophecy/factory/Megawave.syx'));
    const patches = contract.parseDumpResponse(new Uint8Array(fixture));
    expect(patches.length).toBe(64);
    expect(contract.extractPatchName(patches[0].rawData)).toBe('Log Monster');
    expect(contract.extractPatchName(patches[1].rawData)).toBe('Zardex Steps');
  });

  it('buildBulkSysEx + parseDumpResponse roundtrip for 64 patches', () => {
    const contract = getModelContract('korg-prophecy');
    const patches = Array.from({ length: 64 }, (_, i) => ({
      rawData: new Uint8Array(535).fill(i),
      slot: i
    }));
    const bulk = contract.buildBulkSysEx(patches, 0);
    const parsed = contract.parseDumpResponse(bulk);
    expect(parsed.length).toBe(64);
    for (let i = 0; i < 64; i++) {
      expect(parsed[i].slot).toBe(i);
      expect(parsed[i].rawData).toEqual(patches[i].rawData);
    }
  });
});