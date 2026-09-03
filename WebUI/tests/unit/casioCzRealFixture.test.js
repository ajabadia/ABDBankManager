/**
 * Casio CZ — Real Fixture Roundtrip Tests
 *
 * Genera fixtures válidos usando el contrato y verifica roundtrip byte-idéntico:
 * parsePatchSysEx(buildPatchSysEx(rawData)) === rawData
 */
import { describe, it, expect } from 'vitest';
import { getModelContract } from '../../src/contracts/modelContracts.js';

const models = [
  { modelId: 'casio-cz101', modelByte: 0x12, patchSize: 128, banks: 1 },
  { modelId: 'casio-cz1000', modelByte: 0x13, patchSize: 128, banks: 1 },
  { modelId: 'casio-cz5000', modelByte: 0x14, patchSize: 128, banks: 2 },
  { modelId: 'casio-cz1', modelByte: 0x15, patchSize: 288, banks: 4 }
];

function runTests() {
  for (const { modelId, patchSize, banks } of models) {
    describe(`Casio ${modelId.toUpperCase()} — Roundtrip`, () => {
      const contract = getModelContract(modelId);

      it('should be registered with correct metadata', () => {
        expect(contract).toBeDefined();
        expect(contract.modelId).toBe(modelId);
        expect(contract.manufacturer).toBe('Casio');
        expect(contract.programsPerBank).toBe(16);
        expect(contract.patchDataSize).toBe(patchSize);
      });

      it('roundtrips a known patch through build → parse', () => {
        const rawData = new Uint8Array(patchSize);
        for (let i = 0; i < patchSize; i++) {
          rawData[i] = (i * 37 + 13) & 0xFF;
        }

        const sysex = contract.buildPatchSysEx(rawData, 0, 0);
        expect(sysex[0]).toBe(0xF0);
        expect(sysex[1]).toBe(0x44);
        expect(sysex[sysex.length - 1]).toBe(0xF7);

        const parsed = contract.parsePatchSysEx(sysex);
        expect(parsed).not.toBeNull();
        expect(parsed.rawData.length).toBe(patchSize);
        expect(parsed.rawData).toEqual(rawData);
      });

      it('roundtrips multiple patches with different slots', () => {
        for (let bank = 0; bank < banks; bank++) {
          for (let slot = 0; slot < 16; slot++) {
            const rawData = new Uint8Array(patchSize);
            for (let i = 0; i < patchSize; i++) {
              rawData[i] = (i * 31 + slot * 7 + bank * 13 + 5) & 0xFF;
            }

            const sysex = contract.buildPatchSysEx(rawData, bank * 16 + slot, 0);
            const parsed = contract.parsePatchSysEx(sysex);
            expect(parsed).not.toBeNull();
            expect(parsed.rawData).toEqual(rawData);
          }
        }
      });

      it('verifies checksum roundtrip', () => {
        const rawData = new Uint8Array(patchSize);
        for (let i = 0; i < patchSize; i++) rawData[i] = (i * 23 + 11) & 0xFF;

        const sysex = contract.buildPatchSysEx(rawData, 0, 0);
        expect(contract.verifyChecksum(sysex)).toBe(true);

        const parsed = contract.parsePatchSysEx(sysex);
        expect(parsed.rawData).toEqual(rawData);
      });
    });
  }
}

runTests();

// Cross-model identification
describe('Casio CZ — Cross-model identification', () => {
  it('identifies CZ-101 SysEx correctly', () => {
    const contract = getModelContract('casio-cz101');
    const rawData = new Uint8Array(128);
    const sysex = contract.buildPatchSysEx(rawData, 0, 0);
    const parsed = contract.parsePatchSysEx(sysex);
    expect(parsed).not.toBeNull();
  });
});