/**
 * Roland Juno — Real Fixture Roundtrip Tests
 *
 * Roundtrip byte-idéntico: parsePatchSysEx(buildPatchSysEx(rawData)) === rawData
 */
import { describe, it, expect } from 'vitest';
import { getModelContract } from '../../src/contracts/modelContracts.js';

const models = [
  { modelId: 'roland-juno106', modelByte: 0x3E, patchSize: 18 },
  { modelId: 'roland-juno60', modelByte: 0x3D, patchSize: 18 },
  { modelId: 'roland-juno6', modelByte: 0x3C, patchSize: 18 },
  { modelId: 'roland-hs60', modelByte: 0x3E, patchSize: 18 }
];

function runTests() {
  for (const { modelId, modelByte, patchSize } of models) {
    describe(`Roland ${modelId.toUpperCase()} — Roundtrip`, () => {
      const contract = getModelContract(modelId);

      it('should be registered with correct metadata', () => {
        expect(contract).toBeDefined();
        expect(contract.modelId).toBe(modelId);
        expect(contract.manufacturer).toBe('Roland');
        expect(contract.programsPerBank).toBe(64);
        expect(contract.patchDataSize).toBe(patchSize);
      });

      it('roundtrips a known patch through build → parse', () => {
        const rawData = new Uint8Array(patchSize);
        for (let i = 0; i < patchSize; i++) {
          rawData[i] = (i * 37 + 13) & 0x7F;
        }

        const sysex = contract.buildPatchSysEx(rawData, 0, 0);
        expect(sysex[0]).toBe(0xF0);
        expect(sysex[1]).toBe(0x41);
        expect(sysex[sysex.length - 1]).toBe(0xF7);

        const parsed = contract.parsePatchSysEx(sysex);
        expect(parsed).not.toBeNull();
        expect(parsed.rawData.length).toBe(patchSize);
        expect(parsed.rawData).toEqual(rawData);
      });

      it('roundtrips multiple patches across banks', () => {
        for (let bank = 0; bank < 2; bank++) {
          for (let patchNum = 0; patchNum < 64; patchNum += 16) {
            const rawData = new Uint8Array(patchSize);
            for (let i = 0; i < patchSize; i++) {
              rawData[i] = (i * 31 + patchNum * 7 + bank * 13 + 5) & 0x7F;
            }

            const sysex = contract.buildPatchSysEx(rawData, bank * 64 + patchNum, 0);
            const parsed = contract.parsePatchSysEx(sysex);
            expect(parsed).not.toBeNull();
            expect(parsed.rawData).toEqual(rawData);
          }
        }
      });

      it('verifies checksum roundtrip', () => {
        const rawData = new Uint8Array(patchSize);
        for (let i = 0; i < patchSize; i++) rawData[i] = (i * 23 + 11) & 0x7F;

        const sysex = contract.buildPatchSysEx(rawData, 0, 0);
        expect(contract.verifyChecksum(sysex)).toBe(true);

        const parsed = contract.parsePatchSysEx(sysex);
        expect(parsed.rawData).toEqual(rawData);
      });
    });
  }
}

runTests();

// Cross-model: Juno-106 and HS-60 share modelByte 0x3E but are distinct models
describe('Roland Juno — Cross-model identification', () => {
  it('Juno-106 and HS-60 are distinct models with same manufacturer byte', () => {
    const juno106 = getModelContract('roland-juno106');
    const hs60 = getModelContract('roland-hs60');
    expect(juno106.modelId).toBe('roland-juno106');
    expect(hs60.modelId).toBe('roland-hs60');
    expect(juno106.manufacturer).toBe('Roland');
    expect(hs60.manufacturer).toBe('Roland');
  });
});