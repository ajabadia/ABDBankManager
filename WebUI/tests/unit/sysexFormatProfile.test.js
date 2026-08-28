import { describe, it, expect } from 'vitest';
import { createNormativeContractRow, validateSysexFormatProfile } from '../../../Source/Contracts/SysexFormatProfile.ts';
import { getModelContract } from '../../src/contracts/modelContracts.js';

describe('SysEx format profiles', () => {
  it('validates the required profile fields', () => {
    expect(validateSysexFormatProfile({ profileId: '', modelId: '', manufacturerId: [], rawDataSize: 0, addressing: '' })).toEqual([
      'profileId is required', 'modelId is required', 'manufacturerId is required', 'rawDataSize must be positive', 'addressing is required'
    ]);
  });

  it('builds a normative row from a registered contract', () => {
    const contract = getModelContract('behringer-pro800');
    const row = createNormativeContractRow(contract, {
      profileId: 'behringer-pro800-default', modelId: 'behringer-pro800', displayName: 'Default',
      manufacturerId: [0, 32, 50], commands: { request: 0x77, response: 0x78 },
      rawDataSize: 173, packing: '8to7', checksum: 'none', addressing: 'A001..D100'
    });
    expect(row.bankCapacity).toBe(400);
    expect(row.programsPerBank).toBe(100);
    expect(row.modelId).toBe('behringer-pro800');
  });

  it('rejects a profile assigned to a different model', () => {
    const contract = getModelContract('yamaha-dx7');
    expect(() => createNormativeContractRow(contract, {
      profileId: 'wrong', modelId: 'korg-ms2000', displayName: 'Wrong', manufacturerId: [0x42],
      commands: {}, rawDataSize: 128, addressing: 'A.01'
    })).toThrow('does not belong');
  });
});
