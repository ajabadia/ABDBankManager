import { describe, it, expect } from 'vitest';
import { validateModelContract } from '@contracts/ModelContract';
import { allModelContracts, getModelContract } from '@contracts/Models';

describe('ModelContract Validation', () => {
  it('should validate all built-in model contracts', () => {
    allModelContracts.forEach(contract => {
      const result = validateModelContract(contract);
      expect(result.valid).toBe(true);
      if (!result.valid) {
        console.error(`${contract.modelId} failed:`, result.errors);
      }
    });
  });

  it('should have unique modelIds', () => {
    const ids = allModelContracts.map(c => c.modelId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should have correct bankCapacity = banksCount * programsPerBank', () => {
    allModelContracts.forEach(contract => {
      expect(contract.bankCapacity).toBe(contract.banksCount * contract.programsPerBank);
    });
  });

  it('should have valid address round-trip', () => {
    allModelContracts.forEach(contract => {
      for (let i = 0; i < Math.min(5, contract.bankCapacity); i++) {
        const addr = contract.getProgramAddress(i);
        const parsed = contract.parseProgramAddress(addr);
        expect(parsed).toBe(i);
      }
    });
  });

  it('should have sysexManufacturerId defined', () => {
    allModelContracts.forEach(contract => {
      expect(Array.isArray(contract.sysexManufacturerId)).toBe(true);
      expect(contract.sysexManufacturerId.length).toBeGreaterThan(0);
    });
  });
});

describe('ModelContract Lookup', () => {
  it('should find contracts by modelId', () => {
    expect(getModelContract('casio-cz101')).toBeDefined();
    expect(getModelContract('roland-juno106')).toBeDefined();
    expect(getModelContract('korg-ms2000')).toBeDefined();
    expect(getModelContract('behringer-deepmind12')).toBeDefined();
    expect(getModelContract('yamaha-dx7')).toBeDefined();
  });

  it('should return undefined for unknown modelId', () => {
    expect(getModelContract('unknown-model')).toBeUndefined();
  });

  it('should return compatible models', () => {
    const cz101Compat = getModelContract('casio-cz101')?.compatibleModels;
    expect(cz101Compat).toContain('casio-cz1000');
    expect(cz101Compat).toContain('casio-cz5000');
    expect(cz101Compat).toContain('casio-cz1');
  });
});