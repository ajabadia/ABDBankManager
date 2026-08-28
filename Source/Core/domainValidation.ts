import { z } from 'zod';
import type { ModelContract } from '../Contracts/ModelContract.ts';

export class DomainValidationError extends Error {
  readonly code = 'ERR_DOMAIN_VALIDATION';

  constructor(message: string) {
    super(`${DomainValidationError.prototype.code}: ${message}`);
    this.name = 'DomainValidationError';
  }
}

const PatchMetadataSchema = z.object({
  name: z.string().min(1).max(64),
  category: z.string().min(1),
  author: z.string().max(64),
  tags: z.array(z.string()),
  notes: z.string(),
  originAddress: z.string().min(1),
  rawData: z.instanceof(Uint8Array).refine(data => data.length > 0, 'rawData cannot be empty'),
  hardwareIds: z.array(z.string()).min(1),
  isFavorite: z.boolean(),
  rating: z.number().int().min(0).max(5),
  versionNumber: z.number().int().positive()
});

export function validatePatchAgainstContract(
  patch: unknown,
  contract: ModelContract,
  index?: number
): void {
  const parsed = PatchMetadataSchema.safeParse(patch);
  if (!parsed.success) {
    throw new DomainValidationError(parsed.error.issues.map(issue => issue.message).join('; '));
  }

  const value = parsed.data;
  if (value.rawData.length !== contract.patchDataSize) {
    throw new DomainValidationError(
      `patch rawData has ${value.rawData.length} bytes; ${contract.modelId} requires ${contract.patchDataSize}`
    );
  }

  const expectedHardwareIds = new Set([contract.modelId, ...(contract.compatibleModels || [])]);
  if (value.hardwareIds.some(id => !expectedHardwareIds.has(id))) {
    throw new DomainValidationError(`patch hardwareIds are incompatible with ${contract.modelId}`);
  }

  if (index !== undefined && contract.parseProgramAddress(value.originAddress) === null) {
    const expectedAddress = contract.getProgramAddress(index);
    throw new DomainValidationError(
      `patch originAddress '${value.originAddress}' is invalid; expected a valid address such as '${expectedAddress}'`
    );
  }
}

export function validateBankAgainstContract(
  bank: unknown,
  patches: readonly unknown[],
  contract: ModelContract
): void {
  if (!bank || typeof bank !== 'object') {
    throw new DomainValidationError('bank must be an object');
  }

  const value = bank as { id?: unknown; name?: unknown; modelId?: unknown; hardwareIds?: unknown };
  if (typeof value.id !== 'string' || value.id.length === 0) {
    throw new DomainValidationError('bank id is required');
  }
  if (typeof value.name !== 'string' || value.name.trim().length === 0 || value.name.length > 64) {
    throw new DomainValidationError('bank name must contain 1–64 characters');
  }
  if (value.modelId !== contract.modelId) {
    throw new DomainValidationError(`bank modelId '${String(value.modelId)}' does not match '${contract.modelId}'`);
  }

  const hardwareIds = Array.isArray(value.hardwareIds) ? value.hardwareIds : [];
  const expectedHardwareIds = new Set([contract.modelId, ...(contract.compatibleModels || [])]);
  if (hardwareIds.some(id => typeof id !== 'string' || !expectedHardwareIds.has(id))) {
    throw new DomainValidationError(`bank hardwareIds are incompatible with ${contract.modelId}`);
  }

  if (patches.length > contract.programsPerBank) {
    throw new DomainValidationError(
      `bank contains ${patches.length} patches; maximum is ${contract.programsPerBank}`
    );
  }

  const indexes = new Set<number>();
  for (const [position, patch] of patches.entries()) {
    const candidate = patch as { index?: unknown };
    const index = candidate.index ?? position;
    if (!Number.isInteger(index) || Number(index) < 0 || Number(index) >= contract.programsPerBank) {
      throw new DomainValidationError(`patch index '${String(index)}' is outside bank capacity`);
    }
    if (indexes.has(Number(index))) {
      throw new DomainValidationError(`duplicate patch index '${String(index)}'`);
    }
    indexes.add(Number(index));
    validatePatchAgainstContract(patch, contract, Number(index));
  }
}
