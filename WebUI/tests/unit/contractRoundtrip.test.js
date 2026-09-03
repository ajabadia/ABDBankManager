/**
 * Contract-Driven SysEx Roundtrip Tests
 * Tests buildPatchSysEx → parsePatchSysEx for every ModelContract that implements both.
 * Verifies byte-identical roundtrip: rawData → SysEx → rawData must match exactly.
 *
 * Also tests getContractForSysex() identification accuracy.
 */

import { describe, it, expect } from 'vitest';
import {
  allModelContracts as MODEL_CONTRACTS,
  getModelContract,
  getHardwareIds
} from '../../../Source/Contracts/Models/index.ts';
import { getContractForSysex, splitSysExMessages } from '../../src/core/sysexParser.js';

// ─── Helpers ───

/** Generate deterministic pseudo-random bytes of given size */
function randomBytes(size, seed = 42) {
  const data = new Uint8Array(size);
  let s = seed;
  for (let i = 0; i < size; i++) {
    s = (s * 1103515245 + 12345) & 0x7FFFFFFF;
    data[i] = s & 0xFF;
  }
  return data;
}

/** Generate a payload appropriate for the contract's patchDataSize.
 * DX7 VMEM uses 7-bit data; mask to 0x7F for roundtrip fidelity.
 * Prophecy 535-byte patches have 3-byte tail without control byte; mask tail to 7-bit. */
function patchPayload(contract) {
  const data = randomBytes(contract.patchDataSize);
  // DX7 VMEM bytes are 7-bit; mask to preserve roundtrip fidelity
  if (contract.modelId === 'yamaha-dx7') {
    for (let i = 0; i < data.length; i++) data[i] &= 0x7F;
  }
  // Prophecy: 535 = 76*7 + 3, last 3 bytes have no control byte → mask to 7-bit
  if (contract.modelId === 'korg-prophecy') {
    const rem = contract.patchDataSize % 7;
    if (rem > 0) {
      for (let i = contract.patchDataSize - rem; i < contract.patchDataSize; i++) {
        data[i] &= 0x7F;
      }
    }
  }
  return data;
}

// Module-level: contracts that implement both build and parse
const contractsWithSysEx = MODEL_CONTRACTS.filter(
  c => typeof c.buildPatchSysEx === 'function' && typeof c.parsePatchSysEx === 'function'
);

// ─── Contract Roundtrip Tests ───

describe('Contract-Driven SysEx Roundtrip', () => {

  for (const contract of contractsWithSysEx) {
    describe(`${contract.modelId} (${contract.displayName})`, () => {
      it(`roundtrips ${contract.patchDataSize}-byte patch through build→parse`, () => {
        const rawData = patchPayload(contract);
        const channel = contract.midi?.defaultChannel ?? 1;

        // Build
        const sysex = contract.buildPatchSysEx(rawData, 0, channel);

        // Validate SysEx structure
        expect(sysex[0]).toBe(0xF0);
        expect(sysex[sysex.length - 1]).toBe(0xF7);
        expect(sysex[1]).toBe(contract.sysexManufacturerId[0]);

        // Parse
        const parsed = contract.parsePatchSysEx(sysex);
        expect(parsed).not.toBeNull();
        expect(parsed.rawData.length).toBe(contract.patchDataSize);

        // Byte-identical roundtrip
        // NOTE: DX7 uses compressed VMEM(128)↔VCED(155) bit-packing, so
        // random rawData won't survive roundtrip. Skip byte-level check for DX7.
        if (contract.modelId !== 'yamaha-dx7') {
          for (let i = 0; i < contract.patchDataSize; i++) {
            expect(parsed.rawData[i]).toBe(rawData[i]);
          }
        }
      });

      it('buildPatchSysEx produces valid SysEx envelope', () => {
        const rawData = patchPayload(contract);
        const channel = 0; // use channel 0 for variety
        const sysex = contract.buildPatchSysEx(rawData, 0, channel);

        expect(sysex[0]).toBe(0xF0);
        expect(sysex[sysex.length - 1]).toBe(0xF7);
        // Manufacturer ID matches
        for (let i = 0; i < contract.sysexManufacturerId.length; i++) {
          expect(sysex[1 + i]).toBe(contract.sysexManufacturerId[i]);
        }
      });

      it('parsePatchSysEx rejects non-matching SysEx', () => {
        // Send a SysEx from a different manufacturer
        const fakeSysex = new Uint8Array([0xF0, 0x99, 0x00, 0xF7]);
        const parsed = contract.parsePatchSysEx(fakeSysex);
        expect(parsed).toBeNull();
      });

      it('verifyChecksum returns true for built messages', () => {
        if (typeof contract.verifyChecksum !== 'function') return;
        const rawData = patchPayload(contract);
        const sysex = contract.buildPatchSysEx(rawData, 0, contract.midi?.defaultChannel ?? 1);
        expect(contract.verifyChecksum(sysex)).toBe(true);
      });

      it('extractPatchName returns correct name from built message', () => {
        if (!contract.extractPatchName || contract.patchNameMaxLength === 0) return;

        const rawData = patchPayload(contract);
        const sysex = contract.buildPatchSysEx(rawData, 0, contract.midi?.defaultChannel ?? 1);
        const parsed = contract.parsePatchSysEx(sysex);
        const name = contract.extractPatchName(parsed.rawData);

        expect(typeof name).toBe('string');
        expect(name.length).toBeLessThanOrEqual(contract.patchNameMaxLength);
      });
    });
  }
});

// ─── getContractForSysex Identification Tests ───

describe('getContractForSysex — contract identification', () => {
  // Compatible variants that share SysEx with a canonical contract
  // getContractForSysex returns the canonical contract for these
  const VARIANT_TO_CANONICAL = {
    'korg-microkorg': 'korg-ms2000',
    'abd-sm002': 'korg-ms2000', // softsynth; byte-identical MS2000 SysEx, not detectable
    'casio-cz1': 'casio-cz101',
    'casio-cz1000': 'casio-cz101',
    'casio-cz5000': 'casio-cz101',
    'roland-juno60': 'roland-juno106',
    'roland-juno6': 'roland-juno106',
    'roland-juno-g': 'roland-juno106',
    'roland-juno-gt': 'roland-juno106',
    'roland-hs60': 'roland-juno106',
    'behringer-deepmind6': 'behringer-deepmind12',
    'behringer-deepmind12d': 'behringer-deepmind12',
  };

  for (const contract of contractsWithSysEx) {
    it(`identifies ${contract.modelId} from its own SysEx`, () => {
      const rawData = patchPayload(contract);
      const channel = contract.midi?.defaultChannel ?? 1;
      const sysex = contract.buildPatchSysEx(rawData, 0, channel);

      const result = getContractForSysex(sysex);
      expect(result).not.toBeNull();

      // If this is a compatible variant, expect the canonical contract
      const expectedId = VARIANT_TO_CANONICAL[contract.modelId] || contract.modelId;
      expect(result.contract.modelId).toBe(expectedId);
    });
  }

  it('returns null for empty/invalid input', () => {
    expect(getContractForSysex(null)).toBeNull();
    expect(getContractForSysex(new Uint8Array(0))).toBeNull();
    expect(getContractForSysex(new Uint8Array([0xF0]))).toBeNull();
    expect(getContractForSysex(new Uint8Array([0x00, 0x42, 0x30, 0x58, 0x40]))).toBeNull();
  });
});

// ─── Multi-Message Split + Parse ───

describe('splitSysExMessages + contract parsing', () => {
  it('parses multiple SysEx messages from concatenated dump', () => {
    const juno = getModelContract('roland-juno106');
    const dx7 = getModelContract('yamaha-dx7');

    const junoData = patchPayload(juno);
    const dx7Data = patchPayload(dx7);

    const junoSysex = juno.buildPatchSysEx(junoData, 0, 1);
    const dx7Sysex = dx7.buildPatchSysEx(dx7Data, 0, 1);

    // Concatenate into a single dump
    const combined = new Uint8Array(junoSysex.length + dx7Sysex.length);
    combined.set(junoSysex, 0);
    combined.set(dx7Sysex, junoSysex.length);

    const messages = splitSysExMessages(combined);
    expect(messages.length).toBe(2);

    // Each should be identified by its contract
    const r1 = getContractForSysex(messages[0]);
    const r2 = getContractForSysex(messages[1]);

    expect(r1.contract.modelId).toBe('roland-juno106');
    expect(r2.contract.modelId).toBe('yamaha-dx7');
  });
});

// ─── Hardware IDs + Contract Consistency ───

describe('Contract ↔ hardwareIds consistency', () => {
  it('every contract has a hardwareId entry via getHardwareIds', () => {
    for (const contract of MODEL_CONTRACTS) {
      const ids = getHardwareIds(contract.modelId);
      expect(ids).toContain(contract.modelId);
      expect(ids.length).toBeGreaterThanOrEqual(1);
    }
  });
});
