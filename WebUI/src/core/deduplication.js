import { checkDuplicate } from './fingerprint.js';

/**
 * Returns imported patches split into accepted and duplicates.
 * Duplicates are never deleted or overwritten by this helper.
 */
export function partitionDuplicates(importedPatches, existingPatches, mode = 'allow') {
  if (mode === 'allow') return { accepted: importedPatches, duplicates: [] };

  const accepted = [];
  const duplicates = [];
  const seen = [...existingPatches];

  for (const patch of importedPatches) {
    const duplicate = checkDuplicate(patch.fingerprint, seen);
    if (duplicate.isDuplicate) {
      duplicates.push({ patch, existingPatch: duplicate.existingPatch });
    } else {
      accepted.push(patch);
      seen.push(patch);
    }
  }

  return { accepted, duplicates };
}
