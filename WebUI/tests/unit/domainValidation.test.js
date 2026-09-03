import { describe, expect, it } from 'vitest';
import { getModelContract, getHardwareIds } from '../../src/contracts/modelContracts.js';
import {
  DomainValidationError,
  validateBankAgainstContract,
  validatePatchAgainstContract
} from '../../src/core/domainValidation.js';

function patch(contract, index = 0, overrides = {}) {
  return {
    name: 'Init',
    category: 'Other',
    author: '',
    tags: [],
    notes: '',
    rawData: new Uint8Array(contract.patchDataSize),
    hardwareIds: getHardwareIds(contract.modelId),
    isFavorite: false,
    rating: 0,
    versionNumber: 1,
    index,
    originAddress: contract.getProgramAddress(index),
    ...overrides
  };
}

// The shared hardwareId set a bank may carry for a given model (matches what
// the app stores via getHardwareIds, forward + reverse).
function hardwareIdsFor(contract) {
  return getHardwareIds(contract.modelId);
}

describe('domain validation', () => {
  it('accepts a valid bank and patches', () => {
    const contract = getModelContract('korg-ms2000');
    const bank = { id: crypto.randomUUID(), name: 'User', modelId: contract.modelId, hardwareIds: getHardwareIds(contract.modelId) };
    expect(() => validateBankAgainstContract(bank, [patch(contract)], contract, hardwareIdsFor(contract))).not.toThrow();
  });

  it('rejects a patch with the wrong rawData size', () => {
    const contract = getModelContract('korg-ms2000');
    expect(() => validatePatchAgainstContract(patch(contract, 0, { rawData: new Uint8Array(1) }), contract, 0))
      .toThrow(DomainValidationError);
  });

  it('rejects incompatible hardware IDs', () => {
    const contract = getModelContract('korg-ms2000');
    expect(() => validatePatchAgainstContract(patch(contract, 0, { hardwareIds: ['yamaha-dx7'] }), contract, 0))
      .toThrow('hardwareIds');
  });

  it('rejects duplicate indexes and capacity overflow', () => {
    const contract = getModelContract('korg-ms2000');
    const bank = { id: crypto.randomUUID(), name: 'User', modelId: contract.modelId, hardwareIds: getHardwareIds(contract.modelId) };
    expect(() => validateBankAgainstContract(bank, [patch(contract, 0), patch(contract, 0)], contract, hardwareIdsFor(contract)))
      .toThrow('duplicate patch index');

    const full = Array.from({ length: contract.programsPerBank + 1 }, (_, index) => patch(contract, index));
    expect(() => validateBankAgainstContract(bank, full, contract, hardwareIdsFor(contract))).toThrow('maximum');
  });

  it('rejects an invalid patch address format', () => {
    const contract = getModelContract('korg-ms2000');
    expect(() => validatePatchAgainstContract(patch(contract, 5, { originAddress: 'Z999' }), contract, 5, hardwareIdsFor(contract)))
      .toThrow('address');
  });

  it('accepts a patch without originAddress (locally created)', () => {
    const contract = getModelContract('behringer-pro800');
    const p = patch(contract, 0, { originAddress: undefined });
    expect(() => validatePatchAgainstContract(p, contract, 0)).not.toThrow();
  });

  it('rejects an invalid bank model', () => {
    const contract = getModelContract('korg-ms2000');
    const bank = { id: crypto.randomUUID(), name: 'Wrong', modelId: 'yamaha-dx7', hardwareIds: ['yamaha-dx7'] };
    expect(() => validateBankAgainstContract(bank, [], contract)).toThrow('does not match');
  });

  it('allows generic banks while still requiring non-empty patch data', () => {
    const bank = { id: crypto.randomUUID(), name: 'Generic', modelId: 'generic', hardwareIds: ['generic'] };
    const genericPatch = {
      name: 'Raw patch',
      category: 'Other',
      rawData: new Uint8Array([1]),
      hardwareIds: ['generic']
    };
    expect(() => validateBankAgainstContract(bank, [genericPatch], null)).not.toThrow();
    expect(() => validateBankAgainstContract(bank, [{ ...genericPatch, rawData: new Uint8Array() }], null))
      .toThrow('rawData');
  });
});
