/**
 * Zod Schema Validation Tests
 */

import { describe, it, expect } from 'vitest';
import {
  validatePatchData,
  validateImportResult,
  BankSchema,
  AbdbankManifestSchema
} from '@core/validationSchemas';

describe('Zod Validation Schemas', () => {
  const validPatchData = {
    name: 'Test Patch',
    category: 'Bass',
    author: 'Test Author',
    tags: ['bass', 'analog'],
    notes: 'Test notes',
    originAddress: 'A.01',
    rawData: new Uint8Array([0x01, 0x02, 0x03]),
    parameters: { osc1Wave: 0, filterCutoff: 64 },
    isFavorite: false,
    creationDate: new Date().toISOString(),
    fingerprint: 'a'.repeat(64),
    versionNumber: 1,
    previousVersionId: null
  };

  const validImportResult = {
    success: true,
    modelId: 'korg-ms2000',
    bankName: 'Test Bank',
    patches: [validPatchData],
    warnings: [],
    error: undefined
  };

  describe('PatchDataSchema', () => {
    it('should validate correct patch data', () => {
      const result = validatePatchData(validPatchData);
      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Test Patch');
    });

    it('should reject empty name', () => {
      const result = validatePatchData({ ...validPatchData, name: '' });
      expect(result.success).toBe(false);
    });

    it('should reject empty rawData', () => {
      const result = validatePatchData({ ...validPatchData, rawData: new Uint8Array() });
      expect(result.success).toBe(false);
    });

    it('should reject invalid fingerprint format', () => {
      const result = validatePatchData({ ...validPatchData, fingerprint: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should accept valid SHA-256 fingerprint', () => {
      const result = validatePatchData({ ...validPatchData, fingerprint: 'a'.repeat(64) });
      expect(result.success).toBe(true);
    });

    it('should set defaults for optional fields', () => {
      const minimal = {
        name: 'Min',
        category: 'Other',
        author: '',
        tags: [],
        notes: '',
        originAddress: 'A.01',
        rawData: new Uint8Array([1]),
        creationDate: new Date().toISOString()
      };
      const result = validatePatchData(minimal);
      expect(result.success).toBe(true);
      expect(result.data.isFavorite).toBe(false);
      expect(result.data.versionNumber).toBe(1);
    });
  });

  describe('ImportResultSchema', () => {
    it('should validate successful import', () => {
      const result = validateImportResult(validImportResult);
      expect(result.success).toBe(true);
      expect(result.data.patches).toHaveLength(1);
    });

    it('should validate failed import with error', () => {
      const failed = { ...validImportResult, success: false, error: 'Checksum mismatch', patches: [] };
      const result = validateImportResult(failed);
      expect(result.success).toBe(true);
      expect(result.data.success).toBe(false);
    });

    it('should reject missing modelId', () => {
      const result = validateImportResult({ ...validImportResult, modelId: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('hardwareIds (asociación multi-hardware)', () => {
    it('should accept hardwareIds on PatchDataSchema (optional)', () => {
      const withIds = { ...validPatchData, hardwareIds: ['korg-ms2000', 'korg-microkorg'] };
      const result = validatePatchData(withIds);
      expect(result.success).toBe(true);
      expect(result.data.hardwareIds).toEqual(['korg-ms2000', 'korg-microkorg']);
    });

    it('should accept a bank with hardwareIds and default to [] when missing', () => {
      const validBank = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Bank',
        modelId: 'korg-ms2000',
        patches: [validPatchData],
        creationDate: new Date().toISOString(),
        modifiedDate: new Date().toISOString()
      };
      const result = BankSchema.safeParse({ ...validBank, hardwareIds: ['korg-ms2000', 'korg-microkorg'] });
      expect(result.success).toBe(true);
      expect(result.data.hardwareIds).toEqual(['korg-ms2000', 'korg-microkorg']);

      const without = BankSchema.safeParse(validBank);
      expect(without.success).toBe(true);
      expect(without.data.hardwareIds).toEqual([]);
    });

    it('should accept hardwareIds on the abdbank manifest bank', () => {
      const result = AbdbankManifestSchema.safeParse({
        version: 2,
        format: 'abdbank',
        bank: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Bank',
          modelId: 'korg-ms2000',
          hardwareIds: ['korg-ms2000', 'korg-microkorg'],
          manufacturer: 'Korg',
          isFactory: false,
          isLocked: false,
          creationDate: new Date().toISOString(),
          patchCount: 1
        },
        patches: [],
        contract: {
          modelId: 'korg-ms2000',
          patchDataSize: 288,
          bankCapacity: 128,
          banksCount: 8,
          programsPerBank: 16
        }
      });
      expect(result.success).toBe(true);
      expect(result.data.bank.hardwareIds).toEqual(['korg-ms2000', 'korg-microkorg']);
    });
  });

  describe('AbdbankManifestSchema', () => {
    const validManifest = {
      version: 2,
      format: 'abdbank',
      bank: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Bank',
        modelId: 'korg-ms2000',
        manufacturer: 'Korg',
        isFactory: false,
        isLocked: false,
        creationDate: new Date().toISOString(),
        patchCount: 1
      },
      patches: [{
        index: 0,
        name: 'Test Patch',
        address: 'A.01',
        category: 'Bass',
        author: 'Test',
        tags: [],
        notes: '',
        isFavorite: false,
        rating: 0,
        rawDataFile: 'patches/000.bin',
        parameters: { osc1Wave: 0 }
      }],
      contract: {
        modelId: 'korg-ms2000',
        patchDataSize: 288,
        bankCapacity: 128,
        banksCount: 8,
        programsPerBank: 16
      }
    };

    it('should validate correct manifest', () => {
      const result = AbdbankManifestSchema.safeParse(validManifest);
      expect(result.success).toBe(true);
    });

    it('should reject wrong format', () => {
      const result = AbdbankManifestSchema.safeParse({ ...validManifest, format: 'wrong' });
      expect(result.success).toBe(false);
    });

    it('should reject invalid patchCount', () => {
      const result = AbdbankManifestSchema.safeParse({ ...validManifest, bank: { ...validManifest.bank, patchCount: -1 } });
      expect(result.success).toBe(false);
    });
  });
});
