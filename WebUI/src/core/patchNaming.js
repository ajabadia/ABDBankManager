/**
 * ABD Bank Manager — Patch Naming
 *
 * Generación de nombres de patch cuando el formato no los provee, según el
 * contrato (principio de asepsia: el nombre se extrae del blob SOLO cuando el
 * contrato define dónde vive — extractPatchName). Para formatos sin nombre
 * (CZ, Juno) se genera un placeholder único usando el addressing del contrato
 * ("Casio CZ-101 A1"), para que el usuario pueda distinguir y editar a mano.
 */

/**
 * Genera un nombre de patch cuando el formato no lo provee.
 *
 * - contract con patchNameMaxLength > 0 (el formato tiene nombres, pero este
 *   patch vino vacío): '(unnamed)' — el usuario lo edita a mano.
 * - contract sin nombres en el formato (patchNameMaxLength === 0): usa el
 *   addressing del contrato → "Casio CZ-101 A1".
 * - sin contrato conocido: fallback genérico "Patch N".
 *
 * @param {object|null} contract ModelContract (o null si no se identificó)
 * @param {number} index Índice global dentro del banco importado
 * @returns {string}
 */
export function generatePatchName(contract, index) {
  if (!contract) return `Patch ${index + 1}`;
  if (contract.patchNameMaxLength > 0) return '(unnamed)';
  try {
    const address = contract.getProgramAddress(index);
    return `${contract.displayName} ${address}`;
  } catch {
    return `${contract.displayName} ${index + 1}`;
  }
}
