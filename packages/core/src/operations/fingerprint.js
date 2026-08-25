export async function calculateFingerprint(rawData, contract) {
  if (!rawData || rawData.length === 0) return '';

  const soundBytes = contract?.extractSoundBytes
    ? contract.extractSoundBytes(rawData)
    : rawData;

  const hashBuffer = await crypto.subtle.digest('SHA-256', soundBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function checkDuplicate(fingerprint, existingPatches) {
  if (!fingerprint) return { isDuplicate: false, existingPatch: null };
  const match = existingPatches.find(p => p.fingerprint === fingerprint);
  return { isDuplicate: !!match, existingPatch: match || null };
}
