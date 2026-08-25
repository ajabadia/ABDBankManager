import { describe, it, expect } from 'vitest';
import { validateContract, areModelsCompatible } from '../src/ModelContract.js';

describe('validateContract', () => {
  const validContract = {
    modelId: 'korg-ms2000',
    displayName: 'Korg MS2000',
    manufacturer: 'Korg',
    bankCapacity: 128,
    banksCount: 8,
    programsPerBank: 16,
    getProgramAddress: (i) => `${'ABCDEFGH'[Math.floor(i/16)]}.${String((i%16)+1).padStart(2,'0')}`,
    patchDataSize: 288,
    categories: ['Bass','Lead','Pad','FX','Keys'],
    sysexManufacturerId: [0x42],
    formatVersion: 1,
  };

  it('validates a correct contract', () => {
    const res = validateContract(validContract);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('catches missing fields', () => {
    const { modelId, ...incomplete } = validContract;
    const res = validateContract(incomplete);
    expect(res.valid).toBe(false);
    expect(res.errors).toContain('Missing required field: modelId');
  });
});

describe('areModelsCompatible', () => {
  const ms2000 = { modelId: 'korg-ms2000', compatibleModels: ['korg-microkorg'] };
  const microkorg = { modelId: 'korg-microkorg', compatibleModels: ['korg-ms2000'] };
  const cz101 = { modelId: 'casio-cz101', compatibleModels: ['casio-cz1000'] };

  it('handles self compatibility', () => {
    expect(areModelsCompatible(ms2000, ms2000)).toBe(true);
  });

  it('detects compatible model pair', () => {
    expect(areModelsCompatible(ms2000, microkorg)).toBe(true);
  });

  it('blocks incompatible models', () => {
    expect(areModelsCompatible(ms2000, cz101)).toBe(false);
  });
});
