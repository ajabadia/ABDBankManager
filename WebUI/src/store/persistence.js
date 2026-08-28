/**
 * ABD Bank Manager — Dexie.js Persistence
 * IndexedDB database with migrations v1→v4
 * Auto-backup before schema upgrades
 */

import Dexie from 'dexie';
import { getModelContract, getHardwareIds } from '../contracts/modelContracts.js';
import { validateBankAgainstContract, validatePatchAgainstContract } from '../core/domainValidation.js';
import { calculateFingerprint } from '../core/fingerprint.js';
import { partitionDuplicates } from '../core/deduplication.js';

class BankManagerDB extends Dexie {
  constructor() {
    super('ABDBankManager');

    this.version(1).stores({
      banks: '++dbId, id, modelId, name, isFactory',
      patches: '++dbId, id, bankId, [bankId+index], name, fingerprint, isFavorite',
      settings: 'key',
      history: '++dbId, patchId, timestamp'
    });

    this.version(2).stores({
      banks: '++dbId, id, modelId, name, isFactory',
      patches: '++dbId, id, bankId, [bankId+index], name, fingerprint, isFavorite, category',
      settings: 'key',
      history: '++dbId, patchId, timestamp',
      tags: '++dbId, name',
      patchTags: '++dbId, [patchId+tagId]'
    });

    // v3: la tabla `settings` desaparece de la declaración — no hay settings que
    // persistir (los ajustes MIDI se derivan del ModelContract + HARDWARE_QUEUE_CONFIGS).
    // Nota: en Dexie 4, OMITIR una tabla no la elimina (el esquema final es la unión
    // de todas las versiones declaradas), así que `settings` seguía existiendo.
    // La purga real llega en v4 con `settings: null` + upgrade explícito.
    this.version(3).stores({
      banks: '++dbId, id, modelId, name, isFactory, creationDate',
      patches: '++dbId, id, bankId, [bankId+index], name, fingerprint, isFavorite, category, creationDate',
      history: '++dbId, patchId, timestamp',
      tags: '++dbId, name',
      patchTags: '++dbId, [patchId+tagId]'
    });

    // v4: purga del object store `settings` legado (v1/v2).
    // - `settings: null` es la forma canónica de Dexie 4 para eliminar una tabla:
    //   el esquema final (db.tables) ya no la incluye y deleteRemovedTables purga
    //   el store del IndexedDB durante el upgrade v3→v4.
    // - El upgrade explícito con purgeLegacySettingsStore() es la garantía
    //   defensiva/documental; el guard contiene() lo hace un no-op seguro.
    this.version(4).stores({
      banks: '++dbId, id, modelId, name, isFactory, creationDate',
      patches: '++dbId, id, bankId, [bankId+index], name, fingerprint, isFavorite, category, creationDate',
      history: '++dbId, patchId, timestamp',
      tags: '++dbId, name',
      patchTags: '++dbId, [patchId+tagId]',
      settings: null
    }).upgrade((tx) => {
      purgeLegacySettingsStore(tx);
    });

    this.banks.hook('creating', (primKey, obj) => {
      obj.creationDate = obj.creationDate || new Date().toISOString();
      obj.modifiedDate = obj.modifiedDate || new Date().toISOString();
    });

    this.banks.hook('updating', (modifications) => {
      modifications.modifiedDate = new Date().toISOString();
    });
  }
}

// Purgar el object store `settings` legado (v1/v2) dentro de un upgrade.
// Complementa el `settings: null` de la v4: Dexie 4 no expone una API pública
// para eliminar stores (deleteObjectStore desapareció de la API pública), así
// que se usa el IDBDatabase crudo del upgrade (tx.idbtrans.db). El guard
// contains() hace que sea un no-op seguro donde el store ya no existe.
export function purgeLegacySettingsStore(tx) {
  const idb = tx.idbtrans.db;
  if (idb.objectStoreNames.contains('settings')) {
    idb.deleteObjectStore('settings');
    console.log('[DB] Object store "settings" purged (migration v4)');
  }
}

const db = new BankManagerDB();

// ─── Auto-backup before migration ───
export const CURRENT_SCHEMA_VERSION = db.verno;

export function shouldBackupBeforeMigration(installedVersion) {
  return Number.isInteger(installedVersion) && installedVersion > 0 && installedVersion < CURRENT_SCHEMA_VERSION;
}

export async function getInstalledDbVersion() {
  if (typeof indexedDB === 'undefined') return null;
  try {
    if (typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases();
      const match = (dbs || []).find(d => d.name === 'ABDBankManager');
      return match ? match.version : 0;
    }
  } catch { /* fall through */ }
  return 0;
}

export function buildMigrationBackupPayload(banks, patches, version) {
  return {
    format: 'abdlibrary-json',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sourceVersion: version,
    timestamp: Date.now(),
    bankCount: banks.length,
    patchCount: patches.length,
    banks,
    patches
  };
}

export function downloadJsonBackup(payload, filename) {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    return { downloaded: false, reason: 'no-document' };
  }
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return { downloaded: true };
}

export async function backupBeforeMigration(version, { banks, patches } = {}) {
  const payload = buildMigrationBackupPayload(
    banks || await db.banks.toArray(),
    patches || await db.patches.toArray(),
    version
  );
  const download = downloadJsonBackup(payload, `abd-backup-v${version}-${Date.now()}.json`);
  console.log(`[DB] Backup created before migration to v${version}`);
  return { ok: true, download, payload };
}

let preMigrationBackupCompleted = false;

export async function runPreMigrationBackup() {
  if (preMigrationBackupCompleted) return { attempted: false, reason: 'already-run' };
  if (typeof indexedDB === 'undefined') return { attempted: false, reason: 'no-indexeddb' };

  let installedVersion;
  try {
    installedVersion = await getInstalledDbVersion();
  } catch (e) {
    return { attempted: true, ok: false, error: String(e?.message || e) };
  }
  if (!shouldBackupBeforeMigration(installedVersion)) {
    return { attempted: false, reason: 'no-upgrade-pending', installedVersion };
  }

  preMigrationBackupCompleted = true;
  try {
    await backupBeforeMigration(installedVersion);
    return { attempted: true, ok: true, fromVersion: installedVersion };
  } catch (e) {
    console.warn('[DB] Pre-migration backup failed, continuing migration:', e);
    return { attempted: true, ok: false, fromVersion: installedVersion, error: String(e?.message || e) };
  }
}

// ─── Factory & Capacity Guards (pure, testable without IndexedDB) ───

/**
 * Throws if the bank is a factory bank (immutable by design).
 * Factory banks can only be auditioned or copied to a user bank.
 * @param {{ isFactory?: boolean }} bank
 */
export function assertBankEditable(bank) {
  if (bank?.isFactory) {
    throw new Error('ERR_FACTORY_BANK: Factory banks are immutable — copy the patch to a user bank to edit it');
  }
}

/**
 * Throws if adding a patch would exceed the model's capacity.
 * @param {number} currentCount — current number of patches in the bank
 * @param {number} maxPatches — programsPerBank from the ModelContract
 */
export function assertBankHasCapacity(currentCount, maxPatches) {
  if (maxPatches && currentCount >= maxPatches) {
    throw new Error(`ERR_BANK_FULL: Bank is full (${currentCount}/${maxPatches} patches) — cannot add more`);
  }
}

// ─── Bank Operations ───
export async function createBank(bankData) {
  const id = bankData.id || crypto.randomUUID();
  const contract = getModelContract(bankData.modelId);
  const bank = {
    id,
    name: bankData.name,
    modelId: bankData.modelId,
    // Asociación multi-hardware (canónico + compatibles); default: solo el canónico
    hardwareIds: bankData.hardwareIds || (bankData.modelId ? [bankData.modelId] : []),
    manufacturer: bankData.manufacturer || '',
    isFactory: bankData.isFactory || false,
    isLocked: bankData.isLocked || false,
    source: bankData.source || null,
    creationDate: new Date().toISOString(),
    modifiedDate: new Date().toISOString()
  };

  validateBankAgainstContract(bank, [], contract);
  await db.banks.add(bank);
  return bank;
}

export async function getBank(bankId) {
  return await db.banks.where('id').equals(bankId).first();
}

export async function getAllBanks() {
  return await db.banks.toArray();
}

export async function updateBank(bankId, changes) {
  const bank = await getBank(bankId);
  assertBankEditable(bank);
  await db.banks.where('id').equals(bankId).modify(changes);
}

export async function deleteBank(bankId) {
  const bank = await getBank(bankId);
  assertBankEditable(bank);
  await db.patches.where('bankId').equals(bankId).delete();
  await db.banks.where('id').equals(bankId).delete();
}

// ─── Patch Operations ───
export async function createPatch(bankId, patchData, { maxPatches } = {}) {
  const bank = await db.banks.where('id').equals(bankId).first();
  assertBankEditable(bank);
  const existingPatches = await db.patches.where('bankId').equals(bankId).toArray();
  const contract = getModelContract(bank?.modelId);
  const effectiveMax = maxPatches || contract?.programsPerBank;
  assertBankHasCapacity(existingPatches.length, effectiveMax);
  const nextIndex = existingPatches.length;

  const patch = {
    id: patchData.id || crypto.randomUUID(),
    bankId,
    index: patchData.index ?? nextIndex,
    name: patchData.name || 'Init Patch',
    category: patchData.category || 'Other',
    author: patchData.author || '',
    tags: patchData.tags || [],
    notes: patchData.notes || '',
    rawData: patchData.rawData || new Uint8Array(0),
    // Asociación multi-hardware: hereda la del banco (canónico + compatibles)
    hardwareIds: patchData.hardwareIds || bank?.hardwareIds || (bank?.modelId ? [bank.modelId] : []),
    parameters: patchData.parameters || {},
    fingerprint: patchData.fingerprint || await calculateFingerprint(patchData.rawData || new Uint8Array(0), contract),
    isFavorite: patchData.isFavorite || false,
    rating: patchData.rating || 0,
    versionNumber: patchData.versionNumber || 1,
    previousVersionId: patchData.previousVersionId || null,
    creationDate: new Date().toISOString(),
    modifiedDate: new Date().toISOString()
  };

  validatePatchAgainstContract(patch, contract, patch.index);
  await db.patches.add(patch);
  return patch;
}

export async function getPatchesForBank(bankId) {
  return await db.patches.where('bankId').equals(bankId).sortBy('index');
}

export async function getAllPatches() {
  return await db.patches.toArray();
}

export async function getPatch(patchId) {
  return await db.patches.where('id').equals(patchId).first();
}

export async function updatePatch(patchId, changes) {
  const patch = await getPatch(patchId);
  if (!patch) throw new Error(`ERR_PATCH_NOT_FOUND: Patch '${patchId}' not found`);
  const bank = await getBank(patch.bankId);
  // isFavorite and notes are user preferences — allowed on factory patches.
  const bankMutationKeys = Object.keys(changes).filter(k => k !== 'isFavorite' && k !== 'notes');
  if (bankMutationKeys.length > 0) assertBankEditable(bank);

  const candidate = { ...patch, ...changes };
  validatePatchAgainstContract(candidate, getModelContract(bank?.modelId), candidate.index);
  await db.patches.where('id').equals(patchId).modify({ ...changes, modifiedDate: new Date().toISOString() });
}

export async function deletePatch(patchId) {
  const patch = await getPatch(patchId);
  if (patch) {
    const bank = await getBank(patch.bankId);
    assertBankEditable(bank);
  }
  await db.patchTags.where('patchId').equals(patchId).delete();
  await db.patches.where('id').equals(patchId).delete();
}

export async function movePatch(patchId, newBankId, newIndex) {
  const patch = await getPatch(patchId);
  if (!patch) throw new Error(`ERR_PATCH_NOT_FOUND: Patch '${patchId}' not found`);
  const sourceBank = await getBank(patch.bankId);
  const targetBank = await getBank(newBankId);
  assertBankEditable(sourceBank);
  assertBankEditable(targetBank);

  const targetContract = getModelContract(targetBank?.modelId);
  if (!targetContract) throw new Error(`ERR_MODEL_NOT_FOUND: Unknown model '${targetBank?.modelId}'`);
  if (patch.hardwareIds?.length && !patch.hardwareIds.includes(targetBank.modelId)) {
    throw new Error(`ERR_INCOMPATIBLE_HARDWARE: Patch cannot be moved to '${targetBank.modelId}'`);
  }

  const targetPatches = await getPatchesForBank(newBankId);
  const movingWithinBank = patch.bankId === newBankId;
  if (!movingWithinBank) assertBankHasCapacity(targetPatches.length, targetContract.programsPerBank);
  if (!Number.isInteger(newIndex) || newIndex < 0 || newIndex >= targetContract.programsPerBank) {
    throw new Error(`ERR_INVALID_INDEX: Index '${newIndex}' is outside bank capacity`);
  }
  if (targetPatches.some(candidate => candidate.id !== patchId && candidate.index === newIndex)) {
    throw new Error(`ERR_INDEX_CONFLICT: Index '${newIndex}' is already occupied`);
  }

  await db.patches.where('id').equals(patchId).modify({
    bankId: newBankId,
    index: newIndex,
    hardwareIds: patch.hardwareIds?.length ? patch.hardwareIds : getHardwareIds(targetBank.modelId),
    modifiedDate: new Date().toISOString()
  });
}

// ─── Favorites & Search ───
export async function getFavoritePatches() {
  return await db.patches.where('isFavorite').equals(1).toArray();
}

export async function searchPatches(query) {
  const q = query.toLowerCase();
  return await db.patches
    .filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
    .toArray();
}

// ─── Tags M:N ───
export async function addTagToPatch(patchId, tagName) {
  let tag = await db.tags.where('name').equals(tagName).first();
  if (!tag) {
    const tagId = await db.tags.add({ name: tagName });
    tag = { dbId: tagId, name: tagName };
  }

  const existing = await db.patchTags
    .where('[patchId+tagId]')
    .equals([patchId, tag.dbId])
    .first();

  if (!existing) {
    await db.patchTags.add({ patchId, tagId: tag.dbId });
  }
}

export async function removeTagFromPatch(patchId, tagName) {
  const tag = await db.tags.where('name').equals(tagName).first();
  if (tag) {
    await db.patchTags.where('[patchId+tagId]').equals([patchId, tag.dbId]).delete();
  }
}

// ─── Version History ───
export async function addHistoryEntry(patchId, rawData) {
  await db.history.add({
    patchId,
    rawData: new Uint8Array(rawData),
    timestamp: Date.now()
  });
}

export async function getHistoryForPatch(patchId) {
  return await db.history.where('patchId').equals(patchId).reverse().sortBy('timestamp');
}

// ─── Bulk Operations ───
export async function importBank(bankData, patchesData, { deduplication = 'allow' } = {}) {
  const contract = getModelContract(bankData?.modelId);
  if (!contract) throw new Error(`ERR_MODEL_NOT_FOUND: Unknown model '${bankData?.modelId}'`);

  const bank = {
    ...bankData,
    id: bankData.id || crypto.randomUUID(),
    hardwareIds: bankData.hardwareIds?.length ? bankData.hardwareIds : getHardwareIds(contract.modelId),
    creationDate: bankData.creationDate || new Date().toISOString(),
    modifiedDate: new Date().toISOString()
  };
  const patches = await Promise.all(patchesData.map(async (patch, index) => ({
    ...patch,
    id: patch.id || crypto.randomUUID(),
    bankId: bank.id,
    fingerprint: patch.fingerprint || await calculateFingerprint(patch.rawData || new Uint8Array(0), contract),
    index: patch.index ?? index,
    hardwareIds: patch.hardwareIds?.length ? patch.hardwareIds : bank.hardwareIds,
    creationDate: patch.creationDate || new Date().toISOString(),
    modifiedDate: new Date().toISOString()
  })));

  const existingPatches = await db.patches.toArray();
  const { accepted, duplicates } = partitionDuplicates(patches, existingPatches, deduplication);
  validateBankAgainstContract(bank, accepted, contract);

  const bankId = await db.transaction('rw', db.banks, db.patches, async () => {
    await db.banks.add(bank);
    await db.patches.bulkAdd(accepted);
    return bank.id;
  });
  return { bankId, importedCount: accepted.length, duplicateCount: duplicates.length, duplicates };
}

export async function exportBank(bankId) {
  const bank = await db.banks.where('id').equals(bankId).first();
  const patches = await db.patches.where('bankId').equals(bankId).sortBy('index');
  return { bank, patches };
}

export async function getDatabaseStats() {
  const bankCount = await db.banks.count();
  const patchCount = await db.patches.count();
  const favCount = await db.patches.where('isFavorite').equals(1).count();
  return { bankCount, patchCount, favCount };
}

export { db };
