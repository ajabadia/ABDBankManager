// GENERATED FILE — DO NOT EDIT
// Generator: Scripts/build_core_web.js
// Fuente canónica: packages/core/src/operations/library.js
// packages/core/src/operations/library.js
var ERR_BANK_NOT_FOUND = "ERR_BANK_NOT_FOUND";
var ERR_DUPLICATE_BANK_ID = "ERR_DUPLICATE_BANK_ID";
var ERR_DUPLICATE_PATCH_ID = "ERR_DUPLICATE_PATCH_ID";
var ERR_FACTORY_BANK = "ERR_FACTORY_BANK";
var ERR_BANK_FULL = "ERR_BANK_FULL";
var ERR_PATCH_NOT_FOUND = "ERR_PATCH_NOT_FOUND";
var ERR_INDEX_CONFLICT = "ERR_INDEX_CONFLICT";
var ERR_INVALID_INDEX = "ERR_INVALID_INDEX";
var ERR_INCOMPATIBLE_HARDWARE = "ERR_INCOMPATIBLE_HARDWARE";
var ERR_INVALID_NAME = "ERR_INVALID_NAME";
var ERR_NO_SPACE = "ERR_NO_SPACE";
var ERR_SOURCE_EQUALS_TARGET = "ERR_SOURCE_EQUALS_TARGET";
var ERROR_MESSAGES = {
  [ERR_BANK_NOT_FOUND]: (bankId) => `ERR_BANK_NOT_FOUND: Bank '${bankId}' not found`,
  [ERR_DUPLICATE_BANK_ID]: (bankId) => `ERR_DUPLICATE_BANK_ID: Bank '${bankId}' already exists`,
  [ERR_DUPLICATE_PATCH_ID]: (patchId) => `ERR_DUPLICATE_PATCH_ID: Patch '${patchId}' already exists`,
  [ERR_FACTORY_BANK]: () => "ERR_FACTORY_BANK: Factory banks are immutable \u2014 copy the patch to a user bank to edit it",
  [ERR_BANK_FULL]: (count, max) => `ERR_BANK_FULL: Bank is full (${count}/${max} patches) \u2014 cannot add more`,
  [ERR_PATCH_NOT_FOUND]: (id) => `ERR_PATCH_NOT_FOUND: Patch '${id}' not found`,
  [ERR_INDEX_CONFLICT]: (index) => `ERR_INDEX_CONFLICT: Index '${index}' is already occupied`,
  [ERR_INVALID_INDEX]: (value, max) => `ERR_INVALID_INDEX: Index '${value}' is outside bank capacity` + (max != null ? ` (${max})` : ""),
  [ERR_INCOMPATIBLE_HARDWARE]: (patchId, modelId) => `ERR_INCOMPATIBLE_HARDWARE: Patch cannot be moved to '${modelId}'`,
  [ERR_INVALID_NAME]: () => "ERR_INVALID_NAME: Bank name must be 1-64 characters",
  [ERR_NO_SPACE]: () => "ERR_NO_SPACE: Not enough free indices in target bank",
  [ERR_SOURCE_EQUALS_TARGET]: () => "ERR_SOURCE_EQUALS_TARGET: Source and target bank are the same \u2014 use movePatch instead"
};
function fail(code, ...args) {
  const error = new Error(ERROR_MESSAGES[code] ? ERROR_MESSAGES[code](...args) : `ERR_${code}`);
  error.code = code;
  throw error;
}
function isLibrary(value) {
  return !!value && typeof value === "object" && Array.isArray(value.banks);
}
function assertLibrary(library) {
  if (!isLibrary(library)) {
    throw new TypeError("ERR_INVALID_LIBRARY: library must be an object with a `banks` array");
  }
}
function findBank(library, bankId) {
  const bank = library.banks.find((b) => b.id === bankId);
  if (!bank) fail(ERR_BANK_NOT_FOUND, bankId);
  return bank;
}
function assertBankEditable(bank) {
  if (bank?.isFactory) fail(ERR_FACTORY_BANK);
}
var USER_PREFERENCE_KEYS = /* @__PURE__ */ new Set(["isFavorite", "notes"]);
function isUserPreferenceOnly(keys) {
  return keys.every((k) => USER_PREFERENCE_KEYS.has(k));
}
function assertBankHasCapacity(currentCount, maxPatches) {
  if (maxPatches != null && currentCount >= maxPatches) {
    fail(ERR_BANK_FULL, currentCount, maxPatches);
  }
}
function assertValidName(name) {
  if (typeof name !== "string" || name.length < 1 || name.length > 64) fail(ERR_INVALID_NAME);
}
function assertValidIndex(index, maxPatches) {
  if (!Number.isInteger(index) || index < 0 || maxPatches != null && index >= maxPatches) {
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
function freshPatchId(patchId, options) {
  if (options?.patchIds?.[patchId]) return options.patchIds[patchId];
  return `patch-${crypto.randomUUID()}`;
}
function freshBankId(options) {
  return options?.bankId || `bank-${crypto.randomUUID()}`;
}
function replaceBank(library, bankId, newBank) {
  return {
    ...library,
    banks: library.banks.map((b) => b.id === bankId ? newBank : b)
  };
}
function buildBank(bank, patches, modifiedDate) {
  return {
    ...bank,
    patches,
    ...modifiedDate ? { modifiedDate } : {}
  };
}
function placePatches(library, bankId, newPatches, modifiedDate) {
  const current = findBank(library, bankId);
  const seen = /* @__PURE__ */ new Set();
  for (const p of newPatches) {
    if (p.index !== void 0) {
      if (seen.has(p.index)) fail(ERR_INDEX_CONFLICT, p.index);
      seen.add(p.index);
    }
  }
  const updated = buildBank(current, newPatches, modifiedDate);
  return replaceBank(library, bankId, updated);
}
function assertCrossBankCompatible(patch, targetBank) {
  if (targetBank?.modelId && patch?.hardwareIds?.length) {
    const compatible = [targetBank.modelId, ...targetBank.hardwareIds || []];
    if (!patch.hardwareIds.some((id) => compatible.includes(id))) {
      fail(ERR_INCOMPATIBLE_HARDWARE, patch.id, targetBank.modelId);
    }
  }
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function addBank(library, bank) {
  assertLibrary(library);
  if (!bank || typeof bank !== "object" || !bank.id) {
    throw new TypeError("ERR_INVALID_BANK: bank must be an object with an `id`");
  }
  if (library.banks.some((b) => b.id === bank.id)) fail(ERR_DUPLICATE_BANK_ID, bank.id);
  const patches = (bank.patches || []).map((p) => ({ ...p, bankId: bank.id }));
  const used = /* @__PURE__ */ new Set();
  for (const p of patches) {
    assertUniquePatchId(patches, p.id);
    if (p.index !== void 0) {
      if (used.has(p.index)) fail(ERR_INDEX_CONFLICT, p.index);
      used.add(p.index);
    }
    assertCrossBankCompatible(p, bank);
  }
  return {
    ...library,
    banks: [...library.banks, { ...bank, patches }]
  };
}
function removeBank(library, bankId) {
  assertLibrary(library);
  const bank = findBank(library, bankId);
  assertBankEditable(bank);
  return {
    ...library,
    banks: library.banks.filter((b) => b.id !== bankId)
  };
}
function renameBank(library, bankId, newName) {
  assertLibrary(library);
  assertValidName(newName);
  const bank = findBank(library, bankId);
  assertBankEditable(bank);
  return replaceBank(library, bankId, { ...bank, name: newName, modifiedDate: nowIso() });
}
function duplicateBank(library, bankId, newName, options = {}) {
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
function mergeBank(library, targetBankId, sourcePatches, options = {}) {
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
      hardwareIds: src.hardwareIds?.length ? [...src.hardwareIds] : [...target.hardwareIds || []],
      modifiedDate: today
    };
    assertCrossBankCompatible(patch, target);
    assertUniquePatchIndex(merged, index, patch.id);
    merged.push(patch);
  }
  return placePatches(library, targetBankId, merged, today);
}
function addPatch(library, bankId, patch, position, options = {}) {
  assertLibrary(library);
  const bank = findBank(library, bankId);
  assertBankEditable(bank);
  const maxPatches = options.maxPatches ?? bank.maxPatches;
  assertBankHasCapacity(bank.patches.length, maxPatches);
  const entry = { ...patch, id: patch.id || freshPatchId(patch.id, options), bankId };
  assertUniquePatchId(bank.patches, entry.id);
  assertCrossBankCompatible(entry, bank);
  let index = position;
  if (index === void 0) index = patch.index;
  if (index === void 0) index = nextFreeIndex(bank.patches, maxPatches);
  assertValidIndex(index, maxPatches);
  assertUniquePatchIndex(bank.patches, index, entry.id);
  entry.index = index;
  entry.modifiedDate = entry.modifiedDate || nowIso();
  return placePatches(library, bankId, [...bank.patches.map((p) => ({ ...p })), entry]);
}
function removePatch(library, bankId, patchIndex) {
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
function movePatch(library, bankId, fromIndex, toIndex) {
  assertLibrary(library);
  const bank = findBank(library, bankId);
  assertBankEditable(bank);
  const maxPatches = bank.maxPatches;
  assertValidIndex(fromIndex, maxPatches);
  assertValidIndex(toIndex, maxPatches);
  const patches = [...bank.patches];
  const from = patches.findIndex((p) => p.index === fromIndex);
  if (from === -1) fail(ERR_PATCH_NOT_FOUND, fromIndex);
  let to = patches.findIndex((p) => p.index === toIndex);
  if (to === -1) to = patches.length - 1;
  if (from === to) return library;
  const [moved] = patches.splice(from, 1);
  patches.splice(to, 0, moved);
  const today = nowIso();
  const renumbered = patches.map((p, i) => ({
    ...p,
    index: i,
    modifiedDate: p.id === moved.id ? today : p.modifiedDate
  }));
  return placePatches(library, bankId, renumbered, today);
}
function renamePatch(library, bankId, patchIndex, newName) {
  assertLibrary(library);
  assertValidName(newName);
  const bank = findBank(library, bankId);
  assertBankEditable(bank);
  if (!bank.patches.some((p) => p.index === patchIndex)) fail(ERR_PATCH_NOT_FOUND, patchIndex);
  const today = nowIso();
  return placePatches(
    library,
    bankId,
    bank.patches.map((p) => p.index === patchIndex ? { ...p, name: newName, modifiedDate: today } : { ...p })
  );
}
function updatePatchMetadata(library, bankId, patchIndex, metadata = {}) {
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
    bank.patches.map((p) => p.index === patchIndex ? { ...p, ...rest, modifiedDate: today } : { ...p })
  );
}
function copyPatchBetweenBanks(library, sourceBankId, sourceIndex, targetBankId, targetIndex, options = {}) {
  assertLibrary(library);
  if (sourceBankId === targetBankId) fail(ERR_SOURCE_EQUALS_TARGET);
  const source = findBank(library, sourceBankId);
  const target = findBank(library, targetBankId);
  assertBankEditable(target);
  const maxPatches = options.maxPatches ?? target.maxPatches;
  const srcPatch = source.patches.find((p) => p.index === sourceIndex);
  if (!srcPatch) fail(ERR_PATCH_NOT_FOUND, sourceIndex);
  let index = targetIndex;
  if (index === void 0) index = nextFreeIndex(target.patches, maxPatches);
  assertValidIndex(index, maxPatches);
  assertUniquePatchIndex(target.patches, index, null);
  const today = nowIso();
  const copy = {
    ...srcPatch,
    id: freshPatchId(srcPatch.id, options),
    bankId: targetBankId,
    index,
    hardwareIds: srcPatch.hardwareIds?.length ? [...srcPatch.hardwareIds] : [...target.hardwareIds || []],
    modifiedDate: today,
    importDate: srcPatch.importDate || today
  };
  assertCrossBankCompatible(copy, target);
  return placePatches(library, targetBankId, [...target.patches.map((p) => ({ ...p })), copy]);
}
function movePatchBetweenBanks(library, sourceBankId, sourceIndex, targetBankId, targetIndex, options = {}) {
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
  if (index === void 0) index = nextFreeIndex(target.patches, maxPatches);
  assertValidIndex(index, maxPatches);
  assertUniquePatchIndex(target.patches, index, null);
  assertCrossBankCompatible(srcPatch, target);
  if (target.patches.some((p) => p.id === srcPatch.id)) fail(ERR_DUPLICATE_PATCH_ID, srcPatch.id);
  const today = nowIso();
  const moved = {
    ...srcPatch,
    bankId: targetBankId,
    index,
    hardwareIds: srcPatch.hardwareIds?.length ? [...srcPatch.hardwareIds] : [...target.hardwareIds || []],
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
export {
  ERR_BANK_FULL,
  ERR_BANK_NOT_FOUND,
  ERR_DUPLICATE_BANK_ID,
  ERR_DUPLICATE_PATCH_ID,
  ERR_FACTORY_BANK,
  ERR_INCOMPATIBLE_HARDWARE,
  ERR_INDEX_CONFLICT,
  ERR_INVALID_INDEX,
  ERR_INVALID_NAME,
  ERR_NO_SPACE,
  ERR_PATCH_NOT_FOUND,
  ERR_SOURCE_EQUALS_TARGET,
  addBank,
  addPatch,
  assertBankEditable,
  assertBankHasCapacity,
  copyPatchBetweenBanks,
  duplicateBank,
  isLibrary,
  isUserPreferenceOnly,
  mergeBank,
  movePatch,
  movePatchBetweenBanks,
  removeBank,
  removePatch,
  renameBank,
  renamePatch,
  updatePatchMetadata
};
