import { z } from 'zod';
import type { ModelContract } from '../Contracts/ModelContract.ts';

/**
 * Custom error class for domain validation failures.
 */
export class DomainValidationError extends Error {
  readonly code = 'ERR_DOMAIN_VALIDATION';

  constructor(message: string) {
    super(`${DomainValidationError.prototype.code}: ${message}`);
    this.name = 'DomainValidationError';
  }
}

/**
 * Schema for validating patch metadata.
 */
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
  versionNumber: z.number().int().positive(),
  // Los patches llevan posicion explicita en el banco (libraryAdapter la
  // escribe y validateBankAgainstContract la lee con `patch.index ?? position`).
  index: z.number().int().min(0).optional()
});

type PatchMetadata = z.infer<typeof PatchMetadataSchema>;

/**
 * Validates hardware IDs against a given contract.
 * @param hardwareIds - The hardware IDs to validate.
 * @param contract - The contract to validate against.
 * @param entityName - The name of the entity being validated.
 */
function validateHardwareIds(hardwareIds: string[], contract: ModelContract, entityName: string): void {
  const expectedHardwareIds = new Set([contract.modelId, ...(contract.compatibleModels || [])]);
  if (hardwareIds.some(id => !expectedHardwareIds.has(id))) {
    throw new DomainValidationError(`${entityName} hardwareIds are incompatible with ${contract.modelId}`);
  }
}

/**
 * Validates a patch against a given contract.
 * @param patch - The patch to validate.
 * @param contract - The contract to validate against.
 * @param index - Optional index of the patch in the bank.
 */
export function validatePatchAgainstContract(
  patch: PatchMetadata,
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

  validateHardwareIds(value.hardwareIds, contract, 'patch');

  if (index !== undefined && contract.parseProgramAddress(value.originAddress) === null) {
    const expectedAddress = contract.getProgramAddress(index);
    throw new DomainValidationError(
      `patch originAddress '${value.originAddress}' is invalid; expected a valid address such as '${expectedAddress}'`
    );
  }
}

/**
 * Validates a bank against a given contract.
 * @param bank - The bank to validate.
 * @param patches - The patches in the bank.
 * @param contract - The contract to validate against.
 */
export function validateBankAgainstContract(
  bank: { id: string; name: string; modelId: string; hardwareIds?: string[] },
  patches: readonly PatchMetadata[],
  contract: ModelContract
): void {
  if (!bank || typeof bank !== 'object') {
    throw new DomainValidationError('bank must be an object');
  }

  if (typeof bank.id !== 'string' || bank.id.length === 0) {
    throw new DomainValidationError('bank id is required');
  }
  if (typeof bank.name !== 'string' || bank.name.trim().length === 0 || bank.name.length > 64) {
    throw new DomainValidationError('bank name must contain 1–64 characters');
  }
  if (bank.modelId !== contract.modelId) {
    throw new DomainValidationError(`bank modelId '${bank.modelId}' does not match '${contract.modelId}'`);
  }

  const hardwareIds = Array.isArray(bank.hardwareIds) ? bank.hardwareIds : [];
  validateHardwareIds(hardwareIds, contract, 'bank');

  if (patches.length > contract.programsPerBank) {
    throw new DomainValidationError(
      `bank contains ${patches.length} patches; maximum is ${contract.programsPerBank}`
    );
  }

  const indexes = new Set<number>();
  for (const [position, patch] of patches.entries()) {
    const index = patch.index ?? position;
    if (!Number.isInteger(index) || Number(index) < 0 || Number(index) >= contract.programsPerBank) {
      throw new DomainValidationError(`patch index '${index}' is outside bank capacity`);
    }
    if (indexes.has(Number(index))) {
      throw new DomainValidationError(`duplicate patch index '${index}'`);
    }
    indexes.add(Number(index));
    validatePatchAgainstContract(patch, contract, Number(index));
  }
}
