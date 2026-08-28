/**
 * ABD Bank Manager — Pure immutable library operations (P1.1).
 *
 * All functions are PURE and IMMUTABLE: they never mutate their inputs and
 * always return a NEW `Library` object (with a new `banks` array and new
 * objects only where something changed). This guarantees undo/redo safety
 * and makes the rules identical for WebUI, core, restore, import, export
 * and the C++ bridge (§5.2 of DOCS/architecture.md).
 *
 * A `Library` is `{ banks: Bank[], ...extra }` where each `Bank` embeds
 * `patches: Patch[]`. The functions preserve any extra top-level fields.
 */

export const ERR_BANK_NOT_FOUND = 'ERR_BANK_NOT_FOUND';
export const ERR_DUPLICATE_BANK_ID = 'ERR_DUPLICATE_BANK_ID';
export const ERR_DUPLICATE_PATCH_ID = 'ERR_DUPLICATE_PATCH_ID';
export const ERR_FACTORY_BANK = 'ERR_FACTORY_BANK';
export const ERR_BANK_FULL = 'ERR_BANK_FULL';
export const ERR_PATCH_NOT_FOUND = 'ERR_PATCH_NOT_FOUND';
export const ERR_INDEX_CONFLICT = 'ERR_INDEX_CONFLICT';
export const ERR_INVALID_INDEX = 'ERR_INVALID_INDEX';
export const ERR_INCOMPATIBLE_HARDWARE = 'ERR_INCOMPATIBLE_HARDWARE';
export const ERR_INVALID_NAME = 'ERR_INVALID_NAME';
export const ERR_NO_SPACE = 'ERR_NO_SPACE';
export const ERR_SOURCE_EQUALS_TARGET = 'ERR_SOURCE_EQUALS_TARGET';

const ERROR_MESSAGES = {
  [ERR_BANK_NOT_FOUND]: (bankId) => `ERR_BANK_NOT_FOUND: Bank '${bankId}' not found`,
  [ERR_DUPLICATE_BANK_ID]: (bankId) => `ERR_DUPLICATE_BANK_ID: Bank '${bankId}' already exists`,
  [ERR_DUPLICATE_PATCH_ID]: (patchId) => `ERR_DUPLICATE_PATCH_ID: Patch '${patchId}' already exists`,
  [ERR_FACTORY_BANK]: () => 'ERR_FACTORY_BANK: Factory banks are immutable — copy the patch to a user bank to edit it',
  [ERR_BANK_FULL]: (count, max) => `ERR_BANK_FULL: Bank is full (${count}/${max} patches) — cannot add more`,
  [ERR_PATCH_NOT_FOUND]: (id) => `ERR_PATCH_NOT_FOUND: Patch '${id}' not found`,
  [ERR_INDEX_CONFLICT]: (index) => `ERR_INDEX_CONFLICT: Index '${index}' is already occupied`,
  [ERR_INVALID_INDEX]: (value, max) =>
    `ERR_INVALID_INDEX: Index '${value}' is outside bank capacity` + (max != null ? ` (${max})` : ''),
  [ERR_INCOMPATIBLE_HARDWARE]: (patchId, modelId) => `ERR_INCOMPATIBLE_HARDWARE: Patch cannot be moved to '${modelId}'`,
  [ERR_INVALID_NAME]: () => 'ERR_INVALID_NAME: Bank name must be 1-64 characters',
  [ERR_NO_SPACE]: () => 'ERR_NO_SPACE: Not enough free indices in target bank',
  [ERR_SOURCE_EQUALS_TARGET]: () => 'ERR_SOURCE_EQUALS_TARGET: Source and target bank are the same — use movePatch instead'
};

function fail(code, ...args) {
  const error = new Error(ERROR_MESSAGES[code] ? ERROR_MESSAGES[code](...args) : `ERR_${code}`);
  error.code = code;
  throw error;
}

// ─── Interop / shared helpers ───

export function isLibrary(value) {
  return !!value && typeof value === 'object' && Array.isArray(value.banks);
}

function assertLibrary(library) {
  if (!isLibrary(library)) {
    throw new TypeError('ERR_INVALID_LIBRARY: library must be an object with a `banks` array');
  }
}

function findBank(library, bankId) {
  const bank = library.banks.find((b) => b.id === bankId);
  if (!bank) fail(ERR_BANK_NOT_FOUND, bankId);
  return bank;
}

export function assertBankEditable(bank) {
  if (bank?.isFactory) fail(ERR_FACTORY_BANK);
}

const USER_PREFERENCE_KEYS = new Set(['isFavorite', 'notes']);

/**
 * Factory banks are read-only, EXCEPT for the user-preference fields
 * `isFavorite` and `notes` (their modification is not a bank mutation, per
 * §5.1). Returns true when the given key set only touches those fields.
 */
export function isUserPreferenceOnly(keys) {
  return keys.every((k) => USER_PREFERENCE_KEYS.has(k));
}

export function assertBankHasCapacity(currentCount, maxPatches) {
  if (maxPatches && currentCount >= maxPatches) {
    fail(ERR_BANK_FULL, currentCount, maxPatches);
  }
}

function assertValidName(name) {
  if (typeof name !== 'string' || name.length < 1 || name.length > 64) fail(ERR_INVALID_NAME);
}

function assertValidIndex(index, maxPatches) {
  if (!Number.isInteger(index) || index < 0 || (maxPatches != null && index >= maxPatches)) {
    fail(ERR_INVALID_INDEX, index, maxPatches);
  }
}

function assertUniquePatchIndex(patches, index, ignorePatchId) {
  const occupied = patches.some((p) => p.index === index && p.id !== ignorePatchId);
  if (occupied) fail(ERR_INDEX_CONFLICT, index);
}

function assertUniquePatchId(patches, patchId) {
  if (patches.some((p) => p.id === patchId)) fail(ERR_DUPLICATE_PATCH_ID, patchId);
}

function nextFreeIndex(patches, maxPatches) {
  const used = new Set(patches.map((p) => p.index));
  const limit = maxPatches != null ? maxPatches : Number.MAX_SAFE_INTEGER;
  for (let i = 0; i < limit; i++) {
    if (!used.has(i)) return i;
  }
  fail(ERR_NO_SPACE);
}

/**
 * Fresh unique patch id. `options.patchIds` may provide an explicit map
 * (id → newId) so multi-copy ops stay deterministic in tests without sharing
 * a single `options.id` across copies.
 */
export function freshPatchId(patchId, options) {
  if (options?.patchIds?.[patchId]) return options.patchIds[patchId];
  return `patch-${crypto.randomUUID()}`;
}

function freshBankId(options) {
  return options?.bankId || `bank-${crypto.randomUUID()}`;
}

function replaceBank(library, bankId, newBank) {
  return {
    ...library,
    banks: library.banks.map((b) => (b.id === bankId ? newBank : b))
  };
}

/**
 * Returns a new library with the given `bank` structurally replaced. Does not
 * run any invariant checks — the caller must already have validated.
 */
function buildBank(bank, patches, modifiedDate) {
  return {
    ...bank,
    patches,
    ...(modifiedDate ? { modifiedDate } : {})
  };
}

function placePatches(library, bankId, newPatches, modifiedDate) {
  const current = findBank(library, bankId);
  const seen = new Set();
  for (const p of newPatches) {
    if (p.index !== undefined) {
      if (seen.has(p.index)) fail(ERR_INDEX_CONFLICT, p.index);
      seen.add(p.index);
    }
  }
  const updated = buildBank(current, newPatches, modifiedDate);
  return replaceBank(library, bankId, updated);
}

function assertCrossBankCompatible(patch, targetBank) {
  if (targetBank?.modelId && patch?.hardwareIds?.length) {
    const compatible = [targetBank.modelId, ...(targetBank.hardwareIds || [])];
    if (!patch.hardwareIds.some((id) => compatible.includes(id))) {
      fail(ERR_INCOMPATIBLE_HARDWARE, patch.id, targetBank.modelId);
    }
  }
}

function nowIso() {
  return new Date().toISOString();
}

// ─── Bank CRUD ───

/** Adds a new bank. `bank.patches` must not collide with existing ids. */
export function addBank(library, bank) {
  assertLibrary(library);
  if (!bank || typeof bank !== 'object' || !bank.id) {
    throw new TypeError('ERR_INVALID_BANK: bank must be an object with an `id`');
  }
  if (library.banks.some((b) => b.id === bank.id)) fail(ERR_DUPLICATE_BANK_ID, bank.id);

  const patches = (bank.patches || []).map((p) => ({ ...p, bankId: bank.id }));

  // Check uniqueness: new bank patches must not collide with existing library patches
  // or with each other.
  const existingIds = new Set();
  for (const b of library.banks) {
    for (const bp of (b.patches || [])) existingIds.add(bp.id);
  }
  const used = new Set();
  for (const p of patches) {
    if (existingIds.has(p.id)) fail(ERR_DUPLICATE_PATCH_ID, p.id);
    if (used.has(p.id)) fail(ERR_DUPLICATE_PATCH_ID, p.id);
    used.add(p.id);
    if (p.index !== undefined) {
      if (used.has(`idx:${p.index}`)) fail(ERR_INDEX_CONFLICT, p.index);
      used.add(`idx:${p.index}`);
    }
    assertCrossBankCompatible(p, bank);
  }

  return {
    ...library,
    banks: [...library.banks, { ...bank, patches }]
  };
}

/** Removes a bank and all its patches. Factory banks are immutable. */
export function removeBank(library, bankId) {
  assertLibrary(library);
  const bank = findBank(library, bankId);
  assertBankEditable(bank);
  return {
    ...library,
    banks: library.banks.filter((b) => b.id !== bankId)
  };
}

/** Renames a bank. Factory banks are immutable. */
export function renameBank(library, bankId, newName) {
  assertLibrary(library);
  assertValidName(newName);
  const bank = findBank(library, bankId);
  assertBankEditable(bank);
  return replaceBank(library, bankId, { ...bank, name: newName, modifiedDate: nowIso() });
}

/**
 * Copies a bank (even a factory one) into a brand-new USER bank with fresh
 * patch ids. Factory banks are the one case where duplication is allowed —
 * that is exactly how the user turns a read-only factory bank into an
 * editable copy (per §5.1).
 */
export function duplicateBank(library, bankId, newName, options = {}) {
  assertLibrary(library);
  assertValidName(newName);
  const source = findBank(library, bankId);
  const newBankId = freshBankId(options);
  if (library.banks.some((b) => b.id === newBankId)) fail(ERR_DUPLICATE_BANK_ID, newBankId);

  const today = nowIso();
  const copiedPatches = source.patches.map((p) => ({
    ...p,
    id: freshPatchId(p.id, options),
    bankId: newBankId,
    modifiedDate: today,
    importDate: today
  }));

  const newBank = buildBank(
    {
      ...source,
      id: newBankId,
      name: newName,
      isFactory: false,
      isLocked: false,
      source: null,
      creationDate: today,
      modifiedDate: today
    },
    copiedPatches
  );
  return {
    ...library,
    banks: [...library.banks, newBank]
  };
}

/**
 * Merges external patches into `targetBankId`. Source patches are COPIED with
 * fresh ids (they may still live in another bank, so the id must stay unique
 * globally). Fills free indices first; throws if there is no room. Returns a
 * new `Library` (§5.2).
 */
export function mergeBank(library, targetBankId, sourcePatches, options = {}) {
  assertLibrary(library);
  const target = findBank(library, targetBankId);
  assertBankEditable(target);
  const maxPatches = options.maxPatches ?? target.maxPatches;

  const today = nowIso();
  const merged = [...target.patches.map((p) => ({ ...p }))];

  for (const src of sourcePatches) {
    if (merged.length >= maxPatches) fail(ERR_BANK_FULL, merged.length, maxPatches);
    const index = nextFreeIndex(merged, maxPatches);
    const patch = {
      ...src,
      id: freshPatchId(src.id, options),
      bankId: target.id,
      index,
      hardwareIds: src.hardwareIds?.length ? [...src.hardwareIds] : [...(target.hardwareIds || [])],
      modifiedDate: today
    };
    assertCrossBankCompatible(patch, target);
    assertUniquePatchIndex(merged, index, patch.id);
    merged.push(patch);
  }

  return placePatches(library, targetBankId, merged, today);
}

// ─── Patch CRUD within a bank ───

/**
 * Adds a patch to `bankId`. `position` (0-based) is explicit; otherwise the
 * patch's own `index` is used or the first free slot. Factory banks are
 * immutable.
 */
export function addPatch(library, bankId, patch, position, options = {}) {
  assertLibrary(library);
  const bank = findBank(library, bankId);
  assertBankEditable(bank);
  const maxPatches = options.maxPatches ?? bank.maxPatches;
  assertBankHasCapacity(bank.patches.length, maxPatches);

  const entry = { ...patch, id: patch.id || freshPatchId(patch.id, options), bankId };
  assertUniquePatchId(bank.patches, entry.id);
  assertCrossBankCompatible(entry, bank);

  let index = position;
  if (index === undefined) index = patch.index;
  if (index === undefined) index = nextFreeIndex(bank.patches, maxPatches);
  assertValidIndex(index, maxPatches);
  assertUniquePatchIndex(bank.patches, index, entry.id);

  entry.index = index;
  entry.modifiedDate = entry.modifiedDate || nowIso();

  return placePatches(library, bankId, [...bank.patches.map((p) => ({ ...p })), entry]);
}

/**
 * Removes the patch at `patchIndex`. Other indices are left untouched (the
 * position becomes a hole), so hardware addresses stay stable. Factory banks
 * are immutable.
 */
export function removePatch(library, bankId, patchIndex) {
  assertLibrary(library);
  const bank = findBank(library, bankId);
  assertBankEditable(bank);
  if (!bank.patches.some((p) => p.index === patchIndex)) fail(ERR_PATCH_NOT_FOUND, patchIndex);
  return placePatches(
    library,
    bankId,
    bank.patches.filter((p) => p.index !== patchIndex)
  );
}

/**
 * Reorders a patch within a bank from `fromIndex` to `toIndex`. The moved
 * patch keeps its identity; indices are reassigned sequentially so the bank
 * list stays contiguous. Factory banks are immutable.
 */
export function movePatch(library, bankId, fromIndex, toIndex) {
  assertLibrary(library);
  const bank = findBank(library, bankId);
  assertBankEditable(bank);
  const maxPatches = bank.maxPatches;
  assertValidIndex(fromIndex, maxPatches);
  assertValidIndex(toIndex, maxPatches);

  const patches = [...bank.patches];
  const from = patches.findIndex((p) => p.index === fromIndex);
  if (from === -1) fail(ERR_PATCH_NOT_FOUND, fromIndex);

  // Target an existing patch index where possible; otherwise move to the end.
  let to = patches.findIndex((p) => p.index === toIndex);
  if (to === -1) to = patches.length - 1;
  if (from === to) return library;

  const [moved] = patches.splice(from, 1);
  // standard list-reorder: destination is the original-array index
  patches.splice(to, 0, moved);

  const today = nowIso();
  const renumbered = patches.map((p, i) => ({
    ...p,
    index: i,
    modifiedDate: p.id === moved.id ? today : p.modifiedDate
  }));
  return placePatches(library, bankId, renumbered, today);
}

/** Renames a patch. Factory banks are immutable. */
export function renamePatch(library, bankId, patchIndex, newName) {
  assertLibrary(library);
  assertValidName(newName);
  const bank = findBank(library, bankId);
  assertBankEditable(bank);
  if (!bank.patches.some((p) => p.index === patchIndex)) fail(ERR_PATCH_NOT_FOUND, patchIndex);
  const today = nowIso();
  return placePatches(
    library,
    bankId,
    bank.patches.map((p) => (p.index === patchIndex ? { ...p, name: newName, modifiedDate: today } : { ...p }))
  );
}

/**
 * Updates patch metadata. Identity fields (`id`, `index`, `bankId`, `rawData`)
 * are ignored — they are not metadata. On factory banks only the user
 * preferences `isFavorite` and `notes` are allowed; anything else is a bank
 * mutation and is rejected (matching WebUI behavior, §5.1).
 */
export function updatePatchMetadata(library, bankId, patchIndex, metadata = {}) {
  assertLibrary(library);
  const bank = findBank(library, bankId);
  const patch = bank.patches.find((p) => p.index === patchIndex);
  if (!patch) fail(ERR_PATCH_NOT_FOUND, patchIndex);

  const { rawData, id, index, bankId: _ignoreBankId, ...rest } = metadata;
  if (Object.keys(rest).length === 0) return library;

  if (bank.isFactory && !isUserPreferenceOnly(Object.keys(rest))) {
    assertBankEditable(bank);
  }

  const today = nowIso();
  return placePatches(
    library,
    bankId,
    bank.patches.map((p) => (p.index === patchIndex ? { ...p, ...rest, modifiedDate: today } : { ...p }))
  );
}

// ─── Cross-bank operations ───

/**
 * Copies a patch from one bank to another, leaving the source untouched.
 * A factory bank may be a SOURCE (reading is allowed) but never a target.
 * Fills the requested `targetIndex` if free, otherwise the first free slot.
 * Returns a new `Library` (§5.2).
 */
export function copyPatchBetweenBanks(library, sourceBankId, sourceIndex, targetBankId, targetIndex, options = {}) {
  assertLibrary(library);
  if (sourceBankId === targetBankId) fail(ERR_SOURCE_EQUALS_TARGET);
  const source = findBank(library, sourceBankId);
  const target = findBank(library, targetBankId);
  assertBankEditable(target);
  const maxPatches = options.maxPatches ?? target.maxPatches;

  const srcPatch = source.patches.find((p) => p.index === sourceIndex);
  if (!srcPatch) fail(ERR_PATCH_NOT_FOUND, sourceIndex);

  let index = targetIndex;
  if (index === undefined) index = nextFreeIndex(target.patches, maxPatches);
  assertValidIndex(index, maxPatches);
  assertUniquePatchIndex(target.patches, index, null);

  const today = nowIso();
  const copy = {
    ...srcPatch,
    id: freshPatchId(srcPatch.id, options),
    bankId: targetBankId,
    index,
    hardwareIds: srcPatch.hardwareIds?.length ? [...srcPatch.hardwareIds] : [...(target.hardwareIds || [])],
    modifiedDate: today,
    importDate: srcPatch.importDate || today
  };
  assertCrossBankCompatible(copy, target);

  return placePatches(library, targetBankId, [...target.patches.map((p) => ({ ...p })), copy]);
}

/**
 * Moves a patch between banks. Source and target must both be user-editable;
 * the patch keeps its id and is removed from the source bank. Returns a new
 * `Library` (§5.2).
 */
export function movePatchBetweenBanks(library, sourceBankId, sourceIndex, targetBankId, targetIndex, options = {}) {
  assertLibrary(library);
  if (sourceBankId === targetBankId) fail(ERR_SOURCE_EQUALS_TARGET);
  const source = findBank(library, sourceBankId);
  const target = findBank(library, targetBankId);
  assertBankEditable(source);
  assertBankEditable(target);
  const maxPatches = options.maxPatches ?? target.maxPatches;

  const srcPatch = source.patches.find((p) => p.index === sourceIndex);
  if (!srcPatch) fail(ERR_PATCH_NOT_FOUND, sourceIndex);

  let index = targetIndex;
  if (index === undefined) index = nextFreeIndex(target.patches, maxPatches);
  assertValidIndex(index, maxPatches);
  assertUniquePatchIndex(target.patches, index, null);
  assertCrossBankCompatible(srcPatch, target);
  if (target.patches.some((p) => p.id === srcPatch.id)) fail(ERR_DUPLICATE_PATCH_ID, srcPatch.id);

  const today = nowIso();
  const moved = {
    ...srcPatch,
    bankId: targetBankId,
    index,
    hardwareIds: srcPatch.hardwareIds?.length ? [...srcPatch.hardwareIds] : [...(target.hardwareIds || [])],
    modifiedDate: today
  };

  let next = placePatches(
    library,
    targetBankId,
    [...target.patches.map((p) => ({ ...p })), moved]
  );
  next = placePatches(
    next,
    sourceBankId,
    source.patches.filter((p) => p.index !== sourceIndex)
  );
  return next;
}