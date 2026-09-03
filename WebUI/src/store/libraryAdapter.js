/**
 * ABD Bank Manager — Library⇄Dexie Adapter (P1.1)
 *
 * Convierte entre el modelo plano de Dexie (banks + patches como tablas separadas)
 * y el modelo anidado del core (`Library = { banks: [{...bank, patches: [...]}] }`).
 * Proporciona carga/persistencia y wrappers de mutación que delegan en `library.js`.
 */
import {
  isLibrary,
  addBank,
  removeBank,
  renameBank,
  addPatch,
  removePatch,
  movePatch,
  updatePatchMetadata,
  movePatchBetweenBanks,
  assertBankEditable,
  assertBankHasCapacity,
  ERR_BANK_NOT_FOUND,
  ERR_BANK_FULL,
  ERR_PATCH_NOT_FOUND,
  ERR_INDEX_CONFLICT,
  ERR_INCOMPATIBLE_HARDWARE,
  ERR_SOURCE_EQUALS_TARGET,
  ERR_DUPLICATE_PATCH_ID,
  freshPatchId
} from '../core/libraryOperations.js';
import { getDb } from './backend.js';

// Acceso diferido a `getDb()`: durante la evaluación ESM de este módulo aún no
// se ha registrado la instancia Dexie (lo hace `persistence.js`), así que la
// resolución se aplaza al primer uso real.
const db = new Proxy({}, {
  get: (_target, prop) => getDb()[prop]
});
import { getModelContract, getHardwareIds } from '../contracts/modelContracts.js';
import { validateBankAgainstContract, validatePatchAgainstContract } from '../core/domainValidation.js';
import { calculateFingerprint } from '../core/fingerprint.js';
import { partitionDuplicates } from '../core/deduplication.js';
import { nowIso } from './libraryAdapterUtils.js';

export {
  isLibrary,
  movePatch,
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

function groupBy(array, key) {
  return array.reduce((acc, item) => {
    const k = item[key];
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}

function stripPatches(bank) {
  const { patches, ...rest } = bank;
  return rest;
}

export async function loadLibrary() {
  const [banks, patches] = await Promise.all([
    db.banks.toArray(),
    db.patches.toArray()
  ]);

  const patchesByBank = groupBy(patches, 'bankId');
  const today = nowIso();

  return {
    banks: banks.map(b => ({
      ...b,
      patches: (patchesByBank[b.id] || [])
        .slice()
        .sort((a, z) => a.index - z.index)
        .map(p => ({ ...p, modifiedDate: p.modifiedDate || today }))
    }))
  };
}

/** Replace the persisted library with a complete state received from a native host. */
export async function replaceLibrary(nextLibrary) {
  const prev = await loadLibrary();
  const next = {
    banks: (nextLibrary?.banks || []).map(bank => ({
      ...bank,
      patches: (bank.patches || []).map(patch => ({
        ...patch,
        bankId: bank.id,
        rawData: patch.rawData instanceof Uint8Array
          ? patch.rawData
          : (typeof patch.rawDataBase64 === 'string' ? decodeBase64(patch.rawDataBase64) : new Uint8Array(patch.rawData || []))
      }))
    }))
  };
  await persistLibrary(prev, next, { notify: false });
  return next;
}

function decodeBase64(value) {
  if (typeof atob !== 'function') return new Uint8Array(0);
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function changedEntity(prev, next) {
  if (!prev || !next) return true;
  return prev.modifiedDate !== next.modifiedDate;
}

async function writeBankRow(bank) {
  const row = stripPatches(bank);
  if (bank.dbId) {
    await db.banks.put(row);
  } else {
    await db.banks.add(row);
  }
}

async function deleteBankAndPatches(bankId) {
  await db.patches.where('bankId').equals(bankId).delete();
  await db.banks.where('id').equals(bankId).delete();
}

async function persistPatchesForBank(bankId, patches, prevPatchesById) {
  const toPut = [];
  const toAdd = [];

  for (const p of patches) {
    const prev = prevPatchesById.get(p.id);
    if (prev) {
      if (changedEntity(prev, p) || p.bankId !== prev.bankId || p.index !== prev.index) {
        p.dbId = prev.dbId;
        toPut.push(p);
      }
    } else {
      toAdd.push(p);
    }
  }

  const removedIds = [...prevPatchesById.keys()].filter(id => !patches.some(p => p.id === id));
  if (removedIds.length) {
    await Promise.all(removedIds.map(id => db.patches.where('id').equals(id).delete()));
  }

  if (toAdd.length) await db.patches.bulkAdd(toAdd);
  if (toPut.length) await db.patches.bulkPut(toPut);
}

export async function persistLibrary(prevLibrary, nextLibrary, { notify = true } = {}) {
  const prevBanksById = new Map(prevLibrary.banks.map(b => [b.id, b]));
  const nextBanksById = new Map(nextLibrary.banks.map(b => [b.id, b]));

  await db.transaction('rw', db.banks, db.patches, async () => {
    for (const bank of nextLibrary.banks) {
      const prevBank = prevBanksById.get(bank.id);
      if (!prevBank) {
        await writeBankRow(bank);
        if (bank.patches?.length) {
          await db.patches.bulkAdd(bank.patches.map(p => ({ ...p })));
        }
      } else if (changedEntity(prevBank, bank)) {
        await writeBankRow(bank);
        const prevPatchesById = new Map(prevBank.patches?.map(p => [p.id, p]) || []);
        await persistPatchesForBank(bank.id, bank.patches, prevPatchesById);
      }
    }

    for (const bank of prevLibrary.banks) {
      if (!nextBanksById.has(bank.id)) {
        await deleteBankAndPatches(bank.id);
      }
    }
  });

  if (notify && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('abd-library-changed', { detail: nextLibrary }));
  }
}

function findPatchLocation(library, patchId) {
  for (const bank of library.banks) {
    const idx = bank.patches?.findIndex(p => p.id === patchId);
    if (idx !== -1) return { bankId: bank.id, index: idx };
  }
  return null;
}

function findBank(library, bankId) {
  return library.banks.find(b => b.id === bankId);
}

export async function createBank(bankData) {
  const prev = await loadLibrary();
  const contract = getModelContract(bankData.modelId);

  const bank = {
    id: bankData.id || `bank-${crypto.randomUUID()}`,
    name: bankData.name,
    modelId: bankData.modelId,
    hardwareIds: bankData.hardwareIds || (bankData.modelId ? [bankData.modelId] : []),
    manufacturer: bankData.manufacturer || '',
    isFactory: bankData.isFactory || false,
    isLocked: bankData.isLocked || false,
    includeInBundle: bankData.includeInBundle ?? bankData.isFactory ?? false,
    source: bankData.source || null,
    // MF.5: Custom image
    imageUrl: bankData.imageUrl || null,
    // MF.7: Bank metadata / data sheet
    description: bankData.description || '',
    bankAuthor: bankData.bankAuthor || '',
    license: bankData.license || '',
    tags: bankData.tags || [],
    bankNotes: bankData.bankNotes || '',
    firmwareCompat: bankData.firmwareCompat || '',
    knownIssues: bankData.knownIssues || '',
    // MF.7: History
    lastImportDate: bankData.lastImportDate || null,
    lastModifiedDate: bankData.lastModifiedDate || null,
    lastSentDate: bankData.lastSentDate || null,
    lastSentTarget: bankData.lastSentTarget || null,
    creationDate: nowIso(),
    modifiedDate: nowIso()
  };

  validateBankAgainstContract(bank, [], contract, getHardwareIds(contract.modelId));
  const next = addBank(prev, bank);
  await persistLibrary(prev, next);
  return bank;
}

export async function updateBankAdmin(bankId, changes) {
  const prev = await loadLibrary();
  const bank = findBank(prev, bankId);
  if (!bank) throw new Error(`ERR_BANK_NOT_FOUND: Bank '${bankId}' not found`);

  const updated = { ...bank, ...changes, modifiedDate: nowIso() };
  const next = { ...prev, banks: prev.banks.map(b => b.id === bankId ? updated : b) };
  await persistLibrary(prev, next);
}

export async function updateBank(bankId, changes) {
  const prev = await loadLibrary();
  const bank = findBank(prev, bankId);
  if (!bank) throw new Error(`ERR_BANK_NOT_FOUND: Bank '${bankId}' not found`);

  assertBankEditable(bank);

  if (Object.keys(changes).length === 1 && 'name' in changes) {
    const next = renameBank(prev, bankId, changes.name);
    await persistLibrary(prev, next);
    return;
  }

  const updated = { ...bank, ...changes, modifiedDate: nowIso() };
  const next = { ...prev, banks: prev.banks.map(b => b.id === bankId ? updated : b) };
  await persistLibrary(prev, next);
}

export async function deleteBank(bankId) {
  const prev = await loadLibrary();
  const next = removeBank(prev, bankId);
  await persistLibrary(prev, next);
}

export async function createPatch(bankId, patchData, { maxPatches } = {}) {
  const prev = await loadLibrary();
  const bank = findBank(prev, bankId);
  if (!bank) throw new Error(`ERR_BANK_NOT_FOUND: Bank '${bankId}' not found`);

  const contract = getModelContract(bank.modelId);
  const effectiveMax = maxPatches ?? contract?.programsPerBank;

  const existingPatches = await db.patches.where('bankId').equals(bankId).toArray();
  const nextIndex = patchData.index ?? existingPatches.length;

  const patch = {
    id: patchData.id || freshPatchId(patchData.id),
    bankId,
    index: nextIndex,
    name: patchData.name || 'Init Patch',
    category: patchData.category || 'Other',
    author: patchData.author || '',
    tags: patchData.tags || [],
    notes: patchData.notes || '',
    rawData: patchData.rawData || new Uint8Array(0),
    hardwareIds: patchData.hardwareIds?.length
      ? patchData.hardwareIds
      : (bank.hardwareIds || (bank.modelId ? [bank.modelId] : [])),
    parameters: patchData.parameters || {},
    fingerprint: patchData.fingerprint || await calculateFingerprint(patchData.rawData || new Uint8Array(0), contract),
    isFavorite: patchData.isFavorite || false,
    rating: patchData.rating || 0,
    versionNumber: patchData.versionNumber || 1,
    previousVersionId: patchData.previousVersionId || null,
    creationDate: nowIso(),
    modifiedDate: nowIso()
  };

  validatePatchAgainstContract(patch, contract, patch.index, getHardwareIds(contract.modelId));
  const next = addPatch(prev, bankId, patch, undefined, { maxPatches: effectiveMax });
  await persistLibrary(prev, next);

  const created = findPatchLocation(next, patch.id);
  return { ...patch, ...created };
}

export async function updatePatch(patchId, changes) {
  const prev = await loadLibrary();
  const loc = findPatchLocation(prev, patchId);
  if (!loc) throw new Error(`ERR_PATCH_NOT_FOUND: Patch '${patchId}' not found`);

  const bank = findBank(prev, loc.bankId);
  assertBankEditable(bank);

  const metadata = { ...changes };
  delete metadata.id;
  delete metadata.index;
  delete metadata.bankId;

  let next = updatePatchMetadata(prev, loc.bankId, loc.index, metadata);

  if ('rawData' in changes) {
    next = {
      ...next,
      banks: next.banks.map(b =>
        b.id === loc.bankId
          ? { ...b, patches: b.patches.map(p => p.id === patchId ? { ...p, rawData: changes.rawData, modifiedDate: nowIso() } : p) }
          : b
      )
    };
  }

  await persistLibrary(prev, next);
  const updatedLoc = findPatchLocation(next, patchId);
  return { ...changes, ...updatedLoc };
}

export async function deletePatch(patchId) {
  const prev = await loadLibrary();
  const loc = findPatchLocation(prev, patchId);
  if (!loc) return;

  const bank = findBank(prev, loc.bankId);
  assertBankEditable(bank);

  const next = removePatch(prev, loc.bankId, loc.index);
  await persistLibrary(prev, next);

  await db.patchTags.where('patchId').equals(patchId).delete();
}

export async function movePatchPersistent(patchId, newBankId, newIndex) {
  const prev = await loadLibrary();
  const loc = findPatchLocation(prev, patchId);
  if (!loc) throw new Error(`ERR_PATCH_NOT_FOUND: Patch '${patchId}' not found`);

  const sourceBank = findBank(prev, loc.bankId);
  const targetBank = findBank(prev, newBankId);
  assertBankEditable(sourceBank);
  assertBankEditable(targetBank);

  const targetContract = getModelContract(targetBank?.modelId);
  if (!targetContract) throw new Error(`ERR_MODEL_NOT_FOUND: Unknown model '${targetBank?.modelId}'`);

  const patch = sourceBank.patches[loc.index];
  const movingWithinBank = loc.bankId === newBankId;

  if (movingWithinBank) {
    const next = movePatch(prev, loc.bankId, loc.index, newIndex);
    await persistLibrary(prev, next);
    return;
  }

  if (patch.hardwareIds?.length && !patch.hardwareIds.includes(targetBank.modelId)) {
    throw new Error(`ERR_INCOMPATIBLE_HARDWARE: Patch cannot be moved to '${targetBank.modelId}'`);
  }

  const targetPatches = await db.patches.where('bankId').equals(newBankId).toArray();
  assertBankHasCapacity(targetPatches.length, targetContract.programsPerBank);
  if (!Number.isInteger(newIndex) || newIndex < 0 || newIndex >= targetContract.programsPerBank) {
    throw new Error(`ERR_INVALID_INDEX: Index '${newIndex}' is outside bank capacity`);
  }
  if (targetPatches.some(c => c.id !== patchId && c.index === newIndex)) {
    throw new Error(`ERR_INDEX_CONFLICT: Index '${newIndex}' is already occupied`);
  }

  const next = movePatchBetweenBanks(prev, loc.bankId, loc.index, newBankId, newIndex);
  await persistLibrary(prev, next);
}

export async function importBank(bankData, patchesData, { deduplication = 'allow' } = {}) {
  const prev = await loadLibrary();
  const contract = getModelContract(bankData?.modelId);
  if (!contract) throw new Error(`ERR_MODEL_NOT_FOUND: Unknown model '${bankData?.modelId}'`);

  // MF.18: Auto-populate hardwareIds from contract if not provided
  const hardwareIds = bankData.hardwareIds?.length ? bankData.hardwareIds : getHardwareIds(contract.modelId);

  const bank = {
    ...bankData,
    id: bankData.id || `bank-${crypto.randomUUID()}`,
    hardwareIds,
    // MF.7: Track import date
    lastImportDate: nowIso(),
    creationDate: bankData.creationDate || nowIso(),
    modifiedDate: nowIso()
  };

  // MF.18: Check for existing banks with compatible models (deduplication)
  const compatibleBank = prev.banks.find(b =>
    b.id !== bank.id &&
    b.name === bank.name &&
    hardwareIds.includes(b.modelId)
  );
  if (compatibleBank) {
    // Bank with same name exists for a compatible model — merge hardwareIds instead of creating duplicate
    const mergedIds = [...new Set([...(compatibleBank.hardwareIds || []), ...hardwareIds])];
    const updated = { ...compatibleBank, hardwareIds: mergedIds, modifiedDate: nowIso() };
    const next = {
      ...prev,
      banks: prev.banks.map(b => b.id === compatibleBank.id ? updated : b)
    };
    await persistLibrary(prev, next);
    return { bankId: compatibleBank.id, importedCount: 0, duplicateCount: patchesData.length, merged: true };
  }

  const patches = await Promise.all(patchesData.map(async (patch, index) => ({
    ...patch,
    id: patch.id || freshPatchId(patch.id),
    bankId: bank.id,
    fingerprint: patch.fingerprint || await calculateFingerprint(patch.rawData || new Uint8Array(0), contract),
    index: patch.index ?? index,
    hardwareIds: patch.hardwareIds?.length ? patch.hardwareIds : bank.hardwareIds,
    creationDate: patch.creationDate || nowIso(),
    modifiedDate: nowIso()
  })));

  const existingPatches = await db.patches.toArray();
  const existingIds = new Set(existingPatches.map(p => p.id));

  // Filter out patches with IDs that already exist in the library
  const idFiltered = patches.filter(p => !existingIds.has(p.id));
  const idDuplicates = patches.filter(p => existingIds.has(p.id));

  const { accepted, duplicates } = partitionDuplicates(idFiltered, existingPatches, deduplication);
  const allDuplicates = [...idDuplicates.map(p => ({ patch: p, existingPatch: existingPatches.find(e => e.id === p.id) })), ...duplicates];

  validateBankAgainstContract(bank, accepted, contract, getHardwareIds(contract.modelId));

  const next = addBank(prev, { ...bank, patches: accepted });
  await persistLibrary(prev, next);

  return { bankId: bank.id, importedCount: accepted.length, duplicateCount: allDuplicates.length, duplicates: allDuplicates };
}