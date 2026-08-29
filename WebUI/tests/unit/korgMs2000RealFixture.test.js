/**
 * Korg MS2000 / microKORG / Prophecy — Real Fixture Roundtrip Tests
 *
 * Roundtrip byte-idéntico: parsePatchSysEx(buildPatchSysEx(rawData)) === rawData
 */
import { describe, it, expect } from 'vitest';
import { getModelContract } from '../../src/contracts/modelContracts.js';

const models = [
  { modelId: 'korg-ms2000', modelByte: 0x58, patchSize: 288, programsPerBank: 16 },
  { modelId: 'korg-microkorg', modelByte: 0x59, patchSize: 288, programsPerBank: 16 },
  { modelId: 'korg-prophecy', modelByte: 0x5A, patchSize: 256, programsPerBank: 16 }
];

function runTests() {
  for (const { modelId, modelByte, patchSize, programsPerBank } of models) {
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
        const rawData = new Uint8Array(patchSize);
        for (let i = 0; i < patchSize; i++) {
          rawData[i] = (i * 41 + 7) & 0xFF;
        }

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
        for (let bank = 0; bank < 2; bank++) {
          for (let program = 0; program < programsPerBank; program += 16) {
            const rawData = new Uint8Array(patchSize);
            for (let i = 0; i < patchSize; i++) {
              rawData[i] = (i * 31 + program * 7 + bank * 13 + 5) & 0xFF;
            }

            const sysex = contract.buildPatchSysEx(rawData, bank * programsPerBank + program, 0);
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
        const nameBytes = encoder.encode(name.padEnd(12, ' '));
        for (let i = 0; i < 12; i++) rawData[0x1C + i] = nameBytes[i];

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
});