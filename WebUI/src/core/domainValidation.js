export class DomainValidationError extends Error {
  constructor(message) {
    super(`ERR_DOMAIN_VALIDATION: ${message}`);
    this.name = 'DomainValidationError';
  }
}

function validateCommonPatch(patch) {
  if (!patch || typeof patch !== 'object') throw new DomainValidationError('patch must be an object');
  if (!patch.name || patch.name.length > 64) throw new DomainValidationError('patch name must contain 1–64 characters');
  if (!patch.category) throw new DomainValidationError('patch category is required');
  if (!(patch.rawData instanceof Uint8Array) || patch.rawData.length === 0) {
    throw new DomainValidationError('patch rawData cannot be empty');
  }
  if ((patch.hardwareIds || []).some(id => typeof id !== 'string' || id.length === 0)) {
    throw new DomainValidationError('patch hardwareIds must contain non-empty strings');
  }
}

/**
 * Allowed hardware ids: the set a bank/patch may carry. Defaults to the
 * contract's forward family (modelId + compatibleModels). A caller may pass
 * the richer result of getHardwareIds() so reverse-listed softsynth/derived
 * models are also accepted.
 */
function allowedHardwareIds(contract, hardwareIds) {
  if (hardwareIds) return new Set(hardwareIds);
  return new Set([contract.modelId, ...(contract.compatibleModels || [])]);
}

export function validatePatchAgainstContract(patch, contract, index, hardwareIds) {
  validateCommonPatch(patch);
  if (!contract) return;

  if (patch.rawData.length !== contract.patchDataSize) {
    throw new DomainValidationError(`patch rawData has ${patch.rawData.length} bytes; ${contract.patchDataSize} required`);
  }

  const allowed = allowedHardwareIds(contract, hardwareIds);
  if ((patch.hardwareIds || []).some(id => !allowed.has(id))) {
    throw new DomainValidationError(`patch hardwareIds are incompatible with ${contract.modelId}`);
  }

  // originAddress is optional (e.g. patches created locally); only validate
  // the address format when one is actually present
  if (index !== undefined && patch.originAddress && contract.parseProgramAddress(patch.originAddress) === null) {
    throw new DomainValidationError(`invalid patch address '${patch.originAddress}'`);
  }
}

export function validateBankAgainstContract(bank, patches, contract, hardwareIds) {
  if (!bank || typeof bank !== 'object') throw new DomainValidationError('bank must be an object');
  if (!bank.id || !bank.name || bank.name.length > 64) {
    throw new DomainValidationError('bank id and a 1–64 character name are required');
  }

  if (!contract) {
    if (!Array.isArray(patches)) throw new DomainValidationError('patches must be an array');
    patches.forEach(validateCommonPatch);
    return;
  }

  if (bank.modelId !== contract.modelId) {
    throw new DomainValidationError(`bank modelId '${bank.modelId}' does not match '${contract.modelId}'`);
  }
  const allowed = allowedHardwareIds(contract, hardwareIds);
  if ((bank.hardwareIds || []).some(id => !allowed.has(id))) {
    throw new DomainValidationError(`bank hardwareIds are incompatible with ${contract.modelId}`);
  }
  if (patches.length > contract.programsPerBank) {
    throw new DomainValidationError(`bank contains ${patches.length} patches; maximum is ${contract.programsPerBank}`);
  }

  const indexes = new Set();
  patches.forEach((patch, position) => {
    const index = patch.index ?? position;
    if (!Number.isInteger(index) || index < 0 || index >= contract.programsPerBank) {
      throw new DomainValidationError(`patch index '${index}' is outside bank capacity`);
    }
    if (indexes.has(index)) throw new DomainValidationError(`duplicate patch index '${index}'`);
    indexes.add(index);
    validatePatchAgainstContract(patch, contract, index, hardwareIds);
  });
}
