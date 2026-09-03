import { z } from 'zod';
import { FINGERPRINT_VERSION } from './operations/fingerprint.js';

const ByteArraySchema = z.instanceof(Uint8Array).refine(value => value.length > 0, 'rawData must not be empty');

export const BackupPatchSchema = z.object({
  index: z.number().int().nonnegative(),
  name: z.string().min(1),
  rawDataFile: z.string().min(1).refine(value => !value.includes('..') && !value.startsWith('/') && !value.includes('\\'), 'unsafe ZIP path'),
  address: z.string().optional(),
  category: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  isFavorite: z.boolean().optional(),
  rating: z.number().min(0).max(5).optional(),
  parameters: z.record(z.unknown()).optional(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
  versionNumber: z.number().int().positive().optional(),
  previousVersionId: z.string().nullable().optional()
});

export const BackupBankSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  modelId: z.string().min(1),
  hardwareIds: z.array(z.string()).optional(),
  manufacturer: z.string().optional(),
  isFactory: z.boolean().optional(),
  isLocked: z.boolean().optional(),
  creationDate: z.string().optional(),
  modifiedDate: z.string().optional(),
  patchCount: z.number().int().nonnegative().optional()
});

export const BackupManifestSchema = z.object({
  version: z.number().int().positive(),
  schemaVersion: z.number().int().positive().optional(),
  fpVersion: z.number().int().positive().optional(),
  format: z.literal('abdlibrary'),
  library: z.object({ bankCount: z.number().int().nonnegative().optional() }).passthrough().optional(),
  banks: z.array(z.object({ bank: BackupBankSchema, patches: z.array(BackupPatchSchema) }))
});

export const CURRENT_FINGERPRINT_VERSION = FINGERPRINT_VERSION;

export function assertBackupPatchData(patch: unknown, rawData: Uint8Array) {
  BackupPatchSchema.parse(patch);
  ByteArraySchema.parse(rawData);
}
