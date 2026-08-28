/**
 * isFactory Enforcement & Capacity Validation Tests
 *
 * Tests the pure guard functions from persistence.js:
 *   - assertBankEditable(bank): throws for factory banks
 *   - assertBankHasCapacity(currentCount, maxPatches): throws when full
 *
 * These functions are pure (no IndexedDB) and are the core of the enforcement.
 * The async CRUD wrappers (updateBank, createPatch, etc.) call these guards.
 */

import { describe, it, expect } from 'vitest';
import { assertBankEditable, assertBankHasCapacity } from '@webui/store/persistence.js';

// ─── assertBankEditable ───

describe('assertBankEditable', () => {
  it('allows editing a user bank (isFactory=false)', () => {
    expect(() => assertBankEditable({ isFactory: false })).not.toThrow();
  });

  it('allows editing a bank with no isFactory field (default is false)', () => {
    expect(() => assertBankEditable({})).not.toThrow();
    expect(() => assertBankEditable(null)).not.toThrow();
    expect(() => assertBankEditable(undefined)).not.toThrow();
  });

  it('throws for a factory bank (isFactory=true)', () => {
    expect(() => assertBankEditable({ isFactory: true })).toThrow('ERR_FACTORY_BANK');
  });

  it('throws for a factory bank even with isLocked=false', () => {
    expect(() => assertBankEditable({ isFactory: true, isLocked: false })).toThrow('ERR_FACTORY_BANK');
  });

  it('allows editing a locked-but-not-factory bank', () => {
    // isLocked is a separate concept from isFactory — only isFactory blocks mutations
    expect(() => assertBankEditable({ isFactory: false, isLocked: true })).not.toThrow();
  });
});

// ─── assertBankHasCapacity ───

describe('assertBankHasCapacity', () => {
  it('allows adding when under capacity', () => {
    expect(() => assertBankHasCapacity(5, 16)).not.toThrow();
  });

  it('allows adding at exactly capacity-1', () => {
    expect(() => assertBankHasCapacity(15, 16)).not.toThrow();
  });

  it('throws when at capacity', () => {
    expect(() => assertBankHasCapacity(16, 16)).toThrow('ERR_BANK_FULL');
    expect(() => assertBankHasCapacity(16, 16)).toThrow('16/16');
  });

  it('throws when over capacity (import edge case)', () => {
    expect(() => assertBankHasCapacity(17, 16)).toThrow('ERR_BANK_FULL');
  });

  it('allows adding when maxPatches is 0 or undefined (no limit)', () => {
    expect(() => assertBankHasCapacity(100, 0)).not.toThrow();
    expect(() => assertBankHasCapacity(100, undefined)).not.toThrow();
    expect(() => assertBankHasCapacity(100, null)).not.toThrow();
  });

  it('allows adding to an empty bank', () => {
    expect(() => assertBankHasCapacity(0, 16)).not.toThrow();
  });

  it('works with real ModelContract capacities', () => {
    // Korg MS2000: programsPerBank = 16
    expect(() => assertBankHasCapacity(15, 16)).not.toThrow();
    expect(() => assertBankHasCapacity(16, 16)).toThrow('ERR_BANK_FULL');

    // Casio CZ-101: programsPerBank = 32
    expect(() => assertBankHasCapacity(31, 32)).not.toThrow();
    expect(() => assertBankHasCapacity(32, 32)).toThrow('ERR_BANK_FULL');

    // Roland Juno-106: programsPerBank = 64
    expect(() => assertBankHasCapacity(63, 64)).not.toThrow();
    expect(() => assertBankHasCapacity(64, 64)).toThrow('ERR_BANK_FULL');
  });
});

// ─── Error code conventions ───

describe('Error codes', () => {
  it('factory bank error has ERR_FACTORY_BANK code', () => {
    try {
      assertBankEditable({ isFactory: true });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e.message).toMatch(/^ERR_FACTORY_BANK/);
    }
  });

  it('full bank error has ERR_BANK_FULL code', () => {
    try {
      assertBankHasCapacity(16, 16);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e.message).toMatch(/^ERR_BANK_FULL/);
    }
  });
});
