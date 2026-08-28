import { describe, it, expect } from 'vitest';
import {
  addBank,
  removeBank,
  renameBank,
  duplicateBank,
  mergeBank,
  addPatch,
  removePatch,
  movePatch,
  renamePatch,
  updatePatchMetadata,
  copyPatchBetweenBanks,
  movePatchBetweenBanks,
  assertBankEditable,
  assertBankHasCapacity,
  isLibrary,
  ERR_FACTORY_BANK,
  ERR_BANK_FULL,
  ERR_DUPLICATE_BANK_ID,
  ERR_DUPLICATE_PATCH_ID,
  ERR_PATCH_NOT_FOUND,
  ERR_INDEX_CONFLICT,
  ERR_INVALID_INDEX,
  ERR_INCOMPATIBLE_HARDWARE,
  ERR_BANK_NOT_FOUND
} from '../src/operations/library.js';

// â”€â”€â”€ Fixtures â”€â”€â”€

function rawData(size = 3) {
  return new Uint8Array(size).fill(0x42);
}

function makePatch(index, overrides = {}) {
  return {
    id: `patch-${index}`,
    name: `Patch ${index}`,
    category: 'Other',
    author: '',
    tags: [],
    notes: '',
    isFavorite: false,
    rating: 0,
    rawData: rawData(),
    hardwareIds: ['roland-juno-106'],
    originAddress: `${index}`,
    index,
    modifiedDate: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function makeBank(bankId, patchCount = 2, overrides = {}) {
  const patches = [];
  for (let i = 0; i < patchCount; i++) patches.push(makePatch(i, { id: `${bankId}-patch-${i}` }));
  return {
    id: bankId,
    name: `Bank ${bankId}`,
    modelId: 'roland-juno-106',
    hardwareIds: ['roland-juno-106'],
    isFactory: false,
    isLocked: false,
    patches,
    modifiedDate: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function makeLibrary() {
  return {
    version: 1,
    activeBankId: 'b1',
    banks: [makeBank('b1', 2), makeBank('b2', 1)]
  };
}

// Deep-freeze to prove immutability: any mutation attempt throws in strict mode.
// Typed arrays (Uint8Array rawData) cannot be frozen â€” they are treated as
// immutable blobs by convention.
function deepFreeze(obj, seen = new Set()) {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return obj;
  if (ArrayBuffer.isView(obj) || obj instanceof ArrayBuffer) return obj;
  seen.add(obj);
  Object.getOwnPropertyNames(obj).forEach((k) => deepFreeze(obj[k], seen));
  return Object.freeze(obj);
}

function freezeLibrary(library) {
  return deepFreeze(library);
}

// â”€â”€â”€ Shared behavior â”€â”€â”€

describe('helpers', () => {
  it('isLibrary detects a library shape', () => {
    expect(isLibrary({ banks: [] })).toBe(true);
    expect(isLibrary(null)).toBe(false);
    expect(isLibrary({})).toBe(false);
    expect(isLibrary({ banks: 'x' })).toBe(false);
  });

  it('assertBankEditable throws on factory banks', () => {
    expect(() => assertBankEditable({ isFactory: true })).toThrowError(ERR_FACTORY_BANK);
    expect(() => assertBankEditable({ isFactory: false })).not.toThrow();
    expect(() => assertBankEditable(undefined)).not.toThrow();
  });

  it('assertBankHasCapacity enforces maxPatches', () => {
    expect(() => assertBankHasCapacity(8, 8)).toThrowError(ERR_BANK_FULL);
    expect(() => assertBankHasCapacity(7, 8)).not.toThrow();
    expect(() => assertBankHasCapacity(10, undefined)).not.toThrow();
  });
});

describe('addBank', () => {
  it('appends a new bank preserving extra library fields', () => {
    const lib = makeLibrary();
    const bank = makeBank('b3', 0, { name: 'NewBank' });
    const next = addBank(lib, bank);
    expect(next.banks).toHaveLength(3);
    expect(next.banks[2]).toEqual(bank);
    expect(next.version).toBe(1);
    expect(lib.banks).toHaveLength(2);
  });

  it('rejects duplicate bank ids', () => {
    const lib = makeLibrary();
    expect(() => addBank(lib, makeBank('b1', 0))).toThrowError(ERR_DUPLICATE_BANK_ID);
  });

  it('rejects bank with duplicate patch ids', () => {
    const lib = makeLibrary();
    const bank = { id: 'b3', modelId: 'roland-juno-106', patches: [makePatch(0), makePatch(1, { id: 'patch-0' })] };
    expect(() => addBank(lib, bank)).toThrowError(ERR_DUPLICATE_PATCH_ID);
  });

  it('is immutable: input untouched, new bank is a fresh object', () => {
    const lib = makeLibrary();
    const bank = makeBank('b3', 0, { name: 'NewBank' });
    const next = addBank(lib, bank);
    expect(lib.banks).toHaveLength(2);
    expect(lib.banks[0].patches).toHaveLength(2);
    expect(next.banks[2]).not.toBe(bank);
    expect(next.banks[2].patches).toEqual([]);
    // Unchanged banks may be shared by reference (structural sharing, no copy)
    expect(next.banks[0]).toBe(lib.banks[0]);
    expect(next).not.toBe(lib);
    expect(next.banks).not.toBe(lib.banks);
  });
});

describe('removeBank', () => {
  it('removes the bank entirely', () => {
    const lib = makeLibrary();
    const next = removeBank(lib, 'b1');
    expect(next.banks.map((b) => b.id)).toEqual(['b2']);
    expect(next.banks[0].patches).toHaveLength(1);
  });

  it('throws on unknown bank', () => {
    const lib = makeLibrary();
    expect(() => removeBank(lib, 'nope')).toThrowError(ERR_BANK_NOT_FOUND);
  });

  it('rejects removing a factory bank', () => {
    const lib = makeLibrary();
    lib.banks[0].isFactory = true;
    expect(() => removeBank(lib, 'b1')).toThrowError(ERR_FACTORY_BANK);
  });

  it('is immutable', () => {
    const lib = makeLibrary();
    const next = removeBank(lib, 'b2');
    expect(lib).toHaveProperty('banks');
    expect(lib.banks).toHaveLength(2);
    expect(next.banks).toHaveLength(1);
    expect(next.banks).not.toBe(lib.banks);
  });
});

describe('renameBank', () => {
  it('renames a user bank', () => {
    const lib = makeLibrary();
    const next = renameBank(lib, 'b1', 'ReName');
    expect(next.banks.find((b) => b.id === 'b1').name).toBe('ReName');
    expect(lib.banks.find((b) => b.id === 'b1').name).toBe('Bank b1');
  });

  it('rejects empty/too-long names', () => {
    const lib = makeLibrary();
    expect(() => renameBank(lib, 'b1', '')).toThrow();
    expect(() => renameBank(lib, 'b1', 'x'.repeat(65))).toThrow();
  });

  it('rejects factory banks', () => {
    const lib = makeLibrary();
    lib.banks[0].isFactory = true;
    expect(() => renameBank(lib, 'b1', 'x')).toThrowError(ERR_FACTORY_BANK);
  });
});

describe('duplicateBank', () => {
  it('copies a user bank with fresh ids and user-editable flags', () => {
    const lib = makeLibrary();
    const next = duplicateBank(lib, 'b1', 'Copy of b1', { bankId: 'dup-1' });
    const dup = next.banks.find((b) => b.id === 'dup-1');
    expect(dup).toBeDefined();
    expect(dup.name).toBe('Copy of b1');
    expect(dup.isFactory).toBe(false);
    expect(dup.source).toBeNull();
    expect(dup.patches).toHaveLength(2);
    expect(dup.patches[0].id).not.toBe(lib.banks[0].patches[0].id);
    expect(lib.banks[0].patches[0].id).toBe('b1-patch-0');
  });

  it('copies factory banks into an editable user bank', () => {
    const lib = makeLibrary();
    lib.banks[0].isFactory = true;
    const next = duplicateBank(lib, 'b1', 'Editable', { bankId: 'dup-1' });
    const dup = next.banks.find((b) => b.id === 'dup-1');
    expect(dup.isFactory).toBe(false);
    expect(dup.patches).toHaveLength(2);
  });

  it('rejects duplicate target bank id', () => {
    const lib = makeLibrary();
    expect(() => duplicateBank(lib, 'b1', 'x', { bankId: 'b2' })).toThrowError(ERR_DUPLICATE_BANK_ID);
  });
});

describe('mergeBank', () => {
  it('merges external patches into free slots, return library shape', () => {
    const lib = makeLibrary();
    const result = mergeBank(lib, 'b2', [makePatch(0, { id: 'ext-1', name: 'Extra' })], { maxPatches: 4 });
    expect(result).toEqual(expect.objectContaining({ banks: expect.any(Array) }));
    const target = result.banks.find((b) => b.id === 'b2');
    expect(target.patches).toHaveLength(2);
    expect(target.patches.some((p) => p.name === 'Extra')).toBe(true);
    expect(target.patches[1].id).not.toBe('ext-1');
  });

  it('throws ERR_BANK_FULL when exceeding capacity', () => {
    const lib = makeLibrary();
    expect(() => mergeBank(lib, 'b2', [makePatch(0), makePatch(1), makePatch(2), makePatch(3)], { maxPatches: 2 }))
      .toThrowError(ERR_BANK_FULL);
  });

  it('rejects factory targets', () => {
    const lib = makeLibrary();
    lib.banks[1].isFactory = true;
    expect(() => mergeBank(lib, 'b2', [makePatch(0)])).toThrowError(ERR_FACTORY_BANK);
  });
});

describe('addPatch', () => {
  it('adds at explicit position', () => {
    const lib = makeLibrary();
    const next = addPatch(lib, 'b1', makePatch(99, { id: 'new-p', name: 'Added' }), 2, { maxPatches: 8 });
    const bank = next.banks.find((b) => b.id === 'b1');
    expect(bank.patches).toHaveLength(3);
    expect(bank.patches.find((p) => p.id === 'new-p').index).toBe(2);
    expect(lib.banks[0].patches).toHaveLength(2);
  });

  it('uses the patch index when no position given', () => {
    const lib = makeLibrary();
    const next = addPatch(lib, 'b1', makePatch(9, { id: 'new-p', index: 2 }), undefined, { maxPatches: 8 });
    const bank = next.banks.find((b) => b.id === 'b1');
    expect(bank.patches.find((p) => p.id === 'new-p').index).toBe(2);
  });

  it('uses first free index when neither provided', () => {
    const lib = makeLibrary();
    lib.banks[0].patches = [makePatch(0)];
    const next = addPatch(lib, 'b1', makePatch(undefined, { id: 'new-p' }));
    const bank = next.banks.find((b) => b.id === 'b1');
    expect(bank.patches.find((p) => p.id === 'new-p').index).toBe(1);
  });

  it('rejects on capacity overflow', () => {
    const lib = makeLibrary();
    expect(() => addPatch(lib, 'b1', makePatch(5), 2, { maxPatches: 2 })).toThrowError(ERR_BANK_FULL);
  });

  it('rejects occupied index', () => {
    const lib = makeLibrary();
    expect(() => addPatch(lib, 'b1', makePatch(0, { id: 'new-p' }), 0, { maxPatches: 8 })).toThrowError(ERR_INDEX_CONFLICT);
  });

  it('rejects index outside capacity', () => {
    const lib = makeLibrary();
    expect(() => addPatch(lib, 'b1', makePatch(0, { id: 'new-p' }), 8, { maxPatches: 8 })).toThrowError(ERR_INVALID_INDEX);
  });

  it('rejects factory banks', () => {
    const lib = makeLibrary();
    lib.banks[0].isFactory = true;
    expect(() => addPatch(lib, 'b1', makePatch(0, { id: 'new-p' }), 2)).toThrowError(ERR_FACTORY_BANK);
  });
});

describe('removePatch', () => {
  it('removes by index without renumbering siblings', () => {
    const lib = makeLibrary();
    const next = removePatch(lib, 'b1', 0);
    const bank = next.banks.find((b) => b.id === 'b1');
    expect(bank.patches).toHaveLength(1);
    expect(bank.patches[0].index).toBe(1);
  });

  it('throws when index missing', () => {
    const lib = makeLibrary();
    expect(() => removePatch(lib, 'b1', 7)).toThrowError(ERR_PATCH_NOT_FOUND);
  });

  it('rejects factory banks', () => {
    const lib = makeLibrary();
    lib.banks[0].isFactory = true;
    expect(() => removePatch(lib, 'b1', 0)).toThrowError(ERR_FACTORY_BANK);
  });
});

describe('movePatch', () => {
  it('reorders within the bank and renumbers sequentially', () => {
    const lib = makeLibrary();
    const next = movePatch(lib, 'b1', 0, 1);
    const bank = next.banks.find((b) => b.id === 'b1');
    expect(bank.patches.map((p) => p.index)).toEqual([0, 1]);
    expect(bank.patches[0].id).toBe('b1-patch-1');
    expect(bank.patches[1].id).toBe('b1-patch-0');
  });

  it('returns the same library object when no-op', () => {
    const lib = makeLibrary();
    const next = movePatch(lib, 'b1', 0, 0);
    expect(next).toBe(lib);
  });

  it('throws when fromIndex is missing', () => {
    const lib = makeLibrary();
    expect(() => movePatch(lib, 'b1', 7, 0)).toThrowError(ERR_PATCH_NOT_FOUND);
  });

  it('rejects factory banks', () => {
    const lib = makeLibrary();
    lib.banks[0].isFactory = true;
    expect(() => movePatch(lib, 'b1', 0, 1)).toThrowError(ERR_FACTORY_BANK);
  });
});

describe('renamePatch', () => {
  it('renames the target patch only', () => {
    const lib = makeLibrary();
    const next = renamePatch(lib, 'b1', 0, 'Bass 01');
    const bank = next.banks.find((b) => b.id === 'b1');
    expect(bank.patches[0].name).toBe('Bass 01');
    expect(bank.patches[1].name).toBe('Patch 1');
    expect(lib.banks[0].patches[0].name).toBe('Patch 0');
  });

  it('rejects factory banks', () => {
    const lib = makeLibrary();
    lib.banks[0].isFactory = true;
    expect(() => renamePatch(lib, 'b1', 0, 'x')).toThrowError(ERR_FACTORY_BANK);
  });
});

describe('updatePatchMetadata', () => {
it('updates metadata fields and preserves identity', () => {
    const lib = makeLibrary();
    const next = updatePatchMetadata(lib, 'b1', 0, { name: 'Neo', rating: 5, tags: ['pad'] });
    const patch = next.banks[0].patches[0];
    expect(patch.name).toBe('Neo');
    expect(patch.rating).toBe(5);
    expect(patch.tags).toEqual(['pad']);
    expect(patch.id).toBe('b1-patch-0');
    expect(lib.banks[0].patches[0].name).toBe('Patch 0');
  });

  it('ignores identity fields (id/index/rawData)', () => {
    const lib = makeLibrary();
    const next = updatePatchMetadata(lib, 'b1', 0, { id: 'hijack', index: 42, rawData: new Uint8Array([9]) });
    const patch = next.banks[0].patches[0];
    expect(patch.id).toBe('b1-patch-0');
    expect(patch.index).toBe(0);
    expect(patch.rawData).toEqual(new Uint8Array([0x42, 0x42, 0x42]));
    expect(lib.banks[0].patches[0].id).toBe('b1-patch-0');
  });

  it('allows isFavorite/notes on factory banks (user prefs only)', () => {
    const lib = makeLibrary();
    lib.banks[0].isFactory = true;
    const next = updatePatchMetadata(lib, 'b1', 0, { isFavorite: true, notes: 'memorable' });
    expect(next.banks[0].patches[0].isFavorite).toBe(true);
    expect(next.banks[0].patches[0].notes).toBe('memorable');
  });

  it('rejects non-preference metadata on factory banks', () => {
    const lib = makeLibrary();
    lib.banks[0].isFactory = true;
    expect(() => updatePatchMetadata(lib, 'b1', 0, { name: 'hijack' })).toThrowError(ERR_FACTORY_BANK);
  });

  it('throws when patch is missing', () => {
    const lib = makeLibrary();
    expect(() => updatePatchMetadata(lib, 'b1', 9, { name: 'x' })).toThrowError(ERR_PATCH_NOT_FOUND);
  });
});

describe('copyPatchBetweenBanks', () => {
  it('copies, does not mutate source, fresh id at free slot', () => {
    const lib = makeLibrary();
    const result = copyPatchBetweenBanks(lib, 'b1', 0, 'b2', 1, { maxPatches: 4 });
    expect(result).toEqual(expect.objectContaining({ banks: expect.any(Array) }));
    const target = result.banks.find((b) => b.id === 'b2');
    expect(target.patches).toHaveLength(2);
const copy = target.patches.find((p) => p.id !== 'b2-patch-0');
    expect(copy.index).toBe(1);
    expect(copy.bankId).toBe('b2');
    const sourceBank = result.banks.find((b) => b.id === 'b1');
    expect(sourceBank.patches).toHaveLength(2);
    expect(sourceBank.patches[0].id).toBe('b1-patch-0');
  });

  it('throws when target index is occupied', () => {
    const lib = makeLibrary();
    expect(() => copyPatchBetweenBanks(lib, 'b1', 0, 'b2', 0, { maxPatches: 4 })).toThrowError(ERR_INDEX_CONFLICT);
  });

  it('rejects factory targets but allows factory sources', () => {
    const lib = makeLibrary();
    lib.banks[0].isFactory = true; // b1 factory = allowed source
    const result = copyPatchBetweenBanks(lib, 'b1', 0, 'b2', 1, { maxPatches: 4 });
    expect(result).toBeDefined();

    const lib2 = makeLibrary();
    lib2.banks[1].isFactory = true; // b2 factory = forbidden target
    expect(() => copyPatchBetweenBanks(lib2, 'b1', 0, 'b2', 1, { maxPatches: 4 })).toThrowError(ERR_FACTORY_BANK);
  });
});

describe('movePatchBetweenBanks', () => {
  it('moves the patch, removing it from source', () => {
    const lib = makeLibrary();
    const result = movePatchBetweenBanks(lib, 'b1', 0, 'b2', 5, { maxPatches: 8 });
    expect(result).toEqual(expect.objectContaining({ banks: expect.any(Array) }));
    const sourceBank = result.banks.find((b) => b.id === 'b1');
    expect(sourceBank.patches.map((p) => p.index)).toEqual([1]);
    const targetBank = result.banks.find((b) => b.id === 'b2');
const moved = targetBank.patches.find((p) => p.index === 5);
    expect(moved.id).toBe('b1-patch-0');
    expect(moved.bankId).toBe('b2');
  });

  it('rejects incompatible hardware', () => {
    const lib = makeLibrary();
    lib.banks[0].patches[0].hardwareIds = ['korg-ms2000'];
    const expectErr = () => movePatchBetweenBanks(lib, 'b1', 0, 'b2', 5, { maxPatches: 8 });
    expect(expectErr).toThrowError(ERR_INCOMPATIBLE_HARDWARE);
  });

  it('rejects moving into a factory bank or out of one', () => {
    const lib = makeLibrary();
    lib.banks[1].isFactory = true;
    expect(() => movePatchBetweenBanks(lib, 'b1', 0, 'b2', 5, { maxPatches: 8 })).toThrowError(ERR_FACTORY_BANK);

    const lib2 = makeLibrary();
    lib2.banks[0].isFactory = true;
    expect(() => movePatchBetweenBanks(lib2, 'b1', 0, 'b2', 5, { maxPatches: 8 })).toThrowError(ERR_FACTORY_BANK);
  });

  it('rejects same source and target bank', () => {
    const lib = makeLibrary();
    expect(() => movePatchBetweenBanks(lib, 'b1', 0, 'b1', 5, { maxPatches: 8 })).toThrow();
  });
});

describe('immutability of inputs under frozen objects', () => {
  it('does not throw when inputs are deeply frozen (no mutation)', () => {
    const lib = freezeLibrary(makeLibrary());
    expect(() => addBank(lib, freezeLibrary(makeLibrary()).banks[0])).toThrowError(ERR_DUPLICATE_BANK_ID);
    expect(() => renameBank(lib, 'b1', 'NewName')).not.toThrow();
    expect(() => renamePatch(lib, 'b1', 0, 'Neo')).not.toThrow();
    expect(() => updatePatchMetadata(lib, 'b1', 0, { rating: 4 })).not.toThrow();
    expect(() => removePatch(lib, 'b1', 1)).not.toThrow();
    expect(() => movePatch(lib, 'b1', 0, 1)).not.toThrow();
    expect(() => removeBank(lib, 'b2')).not.toThrow();
    expect(() => copyPatchBetweenBanks(lib, 'b1', 0, 'b2', 1, { maxPatches: 4 })).not.toThrow();
    expect(() => movePatchBetweenBanks(lib, 'b1', 0, 'b2', 1, { maxPatches: 4 })).not.toThrow();
    // duplicateBank/mergeBank generate new ids â€” no mutation, must not throw
    expect(() => duplicateBank(lib, 'b1', 'Copy', { bankId: 'copy-1' })).not.toThrow();
    expect(() => mergeBank(lib, 'b2', [makePatch(9, { id: 'ext' })], { maxPatches: 4 })).not.toThrow();
  });
});
