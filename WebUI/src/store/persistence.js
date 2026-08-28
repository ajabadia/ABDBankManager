/**
 * ABD Bank Manager — Dexie.js Persistence
 * IndexedDB database with migrations v1→v4
 * Auto-backup before schema upgrades
 */

import Dexie from 'dexie';
import { getFilteredPatches } from '../../../packages/core/src/search/searchPatches.js';

import {
  isLibrary,
  assertBankEditable,
  assertBankHasCapacity,
  ERR_BANK_NOT_FOUND,
  ERR_BANK_FULL,
  ERR_PATCH_NOT_FOUND,
  ERR_INDEX_CONFLICT,
  ERR_INCOMPATIBLE_HARDWARE,
  ERR_SOURCE_EQUALS_TARGET,
  ERR_DUPLICATE_PATCH_ID,
  createBank as coreCreateBank,
  updateBank as coreUpdateBank,
  deleteBank as coreDeleteBank,
  createPatch as coreCreatePatch,
  updatePatch as coreUpdatePatch,
  deletePatch as coreDeletePatch,
  movePatch as coreMovePatch,
  importBank as coreImportBank
} from './libraryAdapter.js';

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

export {
  isLibrary,
  assertBankEditable,
  assertBankHasCapacity,
  ERR_BANK_NOT_FOUND,
  ERR_BANK_FULL,
  ERR_PATCH_NOT_FOUND,
  ERR_INDEX_CONFLICT,
  ERR_INCOMPATIBLE_HARDWARE,
  ERR_SOURCE_EQUALS_TARGET,
  ERR_DUPLICATE_PATCH_ID
};

// ─── Bank Operations ───
export async function createBank(bankData) {
  return coreCreateBank(bankData);
}

export async function getBank(bankId) {
  return await db.banks.where('id').equals(bankId).first();
}

export async function getAllBanks() {
  return await db.banks.toArray();
}

export async function updateBank(bankId, changes) {
  return coreUpdateBank(bankId, changes);
}

export async function deleteBank(bankId) {
  return coreDeleteBank(bankId);
}

// ─── Patch Operations ───
export async function createPatch(bankId, patchData, { maxPatches } = {}) {
  return coreCreatePatch(bankId, patchData, { maxPatches });
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
  return coreUpdatePatch(patchId, changes);
}

export async function deletePatch(patchId) {
  return coreDeletePatch(patchId);
}

export async function movePatch(patchId, newBankId, newIndex) {
  return coreMovePatch(patchId, newBankId, newIndex);
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
  return coreImportBank(bankData, patchesData, { deduplication });
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

export { db, getFilteredPatches };
