/**
 * ModelContract — Defines a synthesizer's identity and capabilities.
 */

export function validateContract(contract) {
  const errors = [];
  const required = [
    'modelId', 'displayName', 'manufacturer', 'bankCapacity',
    'banksCount', 'programsPerBank', 'getProgramAddress',
    'patchDataSize', 'categories', 'sysexManufacturerId'
  ];

  for (const field of required) {
    if (contract[field] === undefined || contract[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (typeof contract.getProgramAddress !== 'function') {
    errors.push('getProgramAddress must be a function');
  }

  if (contract.bankCapacity !== contract.banksCount * contract.programsPerBank) {
    errors.push(`bankCapacity (${contract.bankCapacity}) !== banksCount * programsPerBank (${contract.banksCount * contract.programsPerBank})`);
  }

  return { valid: errors.length === 0, errors };
}

export function areModelsCompatible(source, target) {
  if (source.modelId === target.modelId) return true;
  return (source.compatibleModels || []).includes(target.modelId);
}
