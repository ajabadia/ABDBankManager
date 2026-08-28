/**
 * ABD Bank Manager — SysEx detail view (pure logic, no DOM)
 * Builds the two views shown in the patch detail panel: the stored decoded
 * blob and the reconstructed full F0…F7 message (when the contract supports it).
 */

import { getModelContract } from '../contracts/modelContracts.js';
import { byteCount } from './hexDump.js';

function toUint8(raw) {
  if (raw instanceof Uint8Array) return raw;
  if (Array.isArray(raw)) return new Uint8Array(raw);
  if (raw?.buffer) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  if (raw?.length) return new Uint8Array(raw);
  return new Uint8Array(0);
}

function sanitizeBaseName(name) {
  if (!name) return '';
  return Array.from(name)
    .filter(ch => ch.charCodeAt(0) >= 0x20)
    .join('')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/**
 * @param {{ rawData: Uint8Array, name?: string, index?: number }} patch
 * @param {{ modelId?: string }} bank
 * @returns {{ rawData, contract, message, canMessage, meta, baseName } | null}
 */
export function buildSysExViewInfo(patch, bank) {
  const rawData = toUint8(patch?.rawData);
  if (byteCount(rawData) === 0) return null;

  const contract = bank?.modelId ? getModelContract(bank.modelId) : null;
  const index = patch.index ?? 0;

  let message = null;
  if (contract?.buildPatchSysEx) {
    try {
      message = contract.buildPatchSysEx(rawData, index, contract.midi?.defaultChannel ?? 1);
    } catch {
      message = null;
    }
  }

  const address = contract?.getProgramAddress ? contract.getProgramAddress(index) : '';
  return {
    rawData,
    contract,
    message,
    canMessage: Boolean(message),
    meta: `${contract?.displayName || bank?.modelId || 'Patch'} · ${address || '—'} · ${byteCount(rawData)} B`,
    baseName: sanitizeBaseName(patch?.name) || (address ? String(address).toLowerCase() : 'patch')
  };
}