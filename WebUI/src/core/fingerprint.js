/** Calculate the canonical SHA-256 fingerprint for patch payload bytes. */
export async function calculateFingerprint(rawData, contract) {
  if (!rawData || rawData.length === 0) return '';

  const soundBytes = contract?.extractSoundBytes
    ? contract.extractSoundBytes(rawData)
    : rawData;
  const bytes = soundBytes instanceof Uint8Array ? soundBytes : new Uint8Array(soundBytes);

  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('SHA-256 no disponible en este entorno');
}

export function checkDuplicate(fingerprint, existingPatches) {
  if (!fingerprint) return { isDuplicate: false, existingPatch: null };
  const existingPatch = existingPatches.find(patch => patch.fingerprint === fingerprint) || null;
  return { isDuplicate: !!existingPatch, existingPatch };
}
