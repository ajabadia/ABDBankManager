/**
 * ABD Bank Manager — Zod Validation Schemas
 * Runtime validation for all imported/exported data
 *
 * The canonical PatchData type is defined in Source/Contracts/PatchData.ts
 * and re-exported here so consumers can import it from either location.
 */

import { z } from 'zod';
import type { PatchData } from '../Contracts/PatchData.ts';

// Re-export the canonical interface so existing
// `import { PatchData } from './validationSchemas'` keeps working.
export type { PatchData } from '../Contracts/PatchData.ts';

// --- Base Types ---

export const PatchDataSchema = z.object({
  name: z.string().min(1).max(64),
  category: z.string().min(1),
  author: z.string().max(64).default('Unknown'),
  tags: z.array(z.string()).default([]),
  notes: z.string().default(''),
  originAddress: z.string().min(1),
  rawData: z.instanceof(Uint8Array).refine(d => d.length > 0, 'Empty patch data'),
  // Asociación multi-hardware (canónico + compatibles); el gestor no interpreta el blob
  hardwareIds: z.array(z.string()).optional(),
  // RESERVADO para plugins/editores — el gestor nunca lo usa ni lo muestra
  parameters: z.record(z.number()).optional(),
  isFavorite: z.boolean().default(false),
  creationDate: z.string().datetime(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  versionNumber: z.number().int().positive().default(1),
  previousVersionId: z.string().uuid().nullable().optional()
});

export const ImportResultSchema = z.object({
  success: z.boolean(),
  modelId: z.string().min(1),
  bankName: z.string().min(1).max(64),
  patches: z.array(PatchDataSchema),
  warnings: z.array(z.string()).default([]),
  error: z.string().optional()
});

export type ImportResult = z.infer<typeof ImportResultSchema>;

export const BankSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(64),
  modelId: z.string().min(1),
  // Hardwares donde el banco es válido (canónico + compatibles); default: solo el canónico
  hardwareIds: z.array(z.string()).default([]),
  isFactory: z.boolean().default(false),
  isLocked: z.boolean().default(false),
  patches: z.array(PatchDataSchema),
  source: z.string().nullable().optional(),
  creationDate: z.string().datetime(),
  modifiedDate: z.string().datetime()
});

export type Bank = z.infer<typeof BankSchema>;

export const LibrarySchema = z.object({
  version: z.number().int().positive(),
  activeBankId: z.string().uuid().nullable(),
  activePresetIndex: z.number().int().nonnegative(),
  banks: z.array(BankSchema),
  lastImportPath: z.string().optional(),
  lastExportPath: z.string().optional()
});

export type Library = z.infer<typeof LibrarySchema>;

// --- Abdbank Manifest Schema ---

export const AbdbankManifestSchema = z.object({
  version: z.number().int().positive(),
  format: z.literal('abdbank'),
  bank: z.object({
    id: z.string().uuid(),
    name: z.string().max(64),
    modelId: z.string().min(1),
    hardwareIds: z.array(z.string()).optional(),
    manufacturer: z.string().min(1),
    isFactory: z.boolean(),
    isLocked: z.boolean().default(false),
    creationDate: z.string().datetime(),
    modifiedDate: z.string().datetime().optional(),
    patchCount: z.number().int().nonnegative(),
    source: z.string().nullable().optional()
  }),
  patches: z.array(z.object({
    index: z.number().int().nonnegative(),
    name: z.string().max(64),
    address: z.string().min(1),
    category: z.string().min(1),
    author: z.string(),
    tags: z.array(z.string()),
    notes: z.string().default(''),
    isFavorite: z.boolean(),
    rating: z.number().int().min(0).max(5),
    rawDataFile: z.string(),
    parameters: z.record(z.number()).optional(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    versionNumber: z.number().int().positive().default(1),
    previousVersionId: z.string().uuid().nullable().optional()
  })),
  contract: z.object({
    modelId: z.string(),
    patchDataSize: z.number().int().positive(),
    bankCapacity: z.number().int().positive(),
    banksCount: z.number().int().positive(),
    programsPerBank: z.number().int().positive()
  })
});

export type AbdbankManifest = z.infer<typeof AbdbankManifestSchema>;

// --- Validation Functions ---

export function validatePatchData(data: unknown): { success: true; data: PatchData } | { success: false; errors: z.ZodError } {
  const result = PatchDataSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, errors: result.error };
}

export function validateImportResult(data: unknown): { success: true; data: ImportResult } | { success: false; errors: z.ZodError } {
  const result = ImportResultSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, errors: result.error };
}

export function validateBank(data: unknown): { success: true; data: Bank } | { success: false; errors: z.ZodError } {
  const result = BankSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, errors: result.error };
}

export function validateLibrary(data: unknown): { success: true; data: Library } | { success: false; errors: z.ZodError } {
  const result = LibrarySchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, errors: result.error };
}

export function validateAbdbankManifest(data: unknown): { success: true; data: AbdbankManifest } | { success: false; errors: z.ZodError } {
  const result = AbdbankManifestSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, errors: result.error };
}