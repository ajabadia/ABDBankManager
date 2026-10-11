/**
 * Tests for the context-aware visibility helpers in core/modelRegistry.js.
 *
 * A hosting synth passes its own modelId as context; the registry then exposes
 * only the hardware compatible with that context (canonical + compatibleModels
 * forward and reverse). Without context the standalone behaviour (all models)
 * must be preserved; with a context this build has no contract for, the answer is
 * "nothing" — never the whole registry (host and catalog are out of sync).
 */

import { describe, it, expect } from 'vitest';
import {
  getVisibleModelIds,
  getVisibleModels,
  getAllModels,
  getContract
} from '../../src/core/modelRegistry.js';
import { MODEL_CONTRACTS } from '../../src/contracts/modelContracts.js';

const TOTAL = MODEL_CONTRACTS.length;

describe('getVisibleModelIds (context-aware filtering)', () => {
  it('returns every model when no context is provided', () => {
    expect(getVisibleModelIds()).toHaveLength(TOTAL);
    expect(getVisibleModelIds(null)).toHaveLength(TOTAL);
  });

  it('returns nothing for a context modelId with no contract (no full-registry fallback)', () => {
    expect(getVisibleModelIds('nonexistent-model')).toEqual([]);
    expect(getVisibleModels('nonexistent-model')).toEqual([]);
  });

  it('returns only compatible hardware for abd-sm002', () => {
    const ids = getVisibleModelIds('abd-sm002');
    expect(ids).toEqual(['abd-sm002', 'korg-ms2000', 'korg-microkorg']);
    expect(ids).not.toContain('roland-juno106');
    expect(ids).not.toContain('casio-cz101');
  });

  it('returns the full Juno family for roland-juno106', () => {
    expect(getVisibleModelIds('roland-juno106')).toEqual([
      'roland-juno106',
      'roland-juno60',
      'roland-juno6',
      'roland-hs60'
    ]);
  });

  it('is bidirectional: korg-microkorg also sees abd-sm002', () => {
    const ids = getVisibleModelIds('korg-microkorg');
    expect(ids).toHaveLength(3);
    expect(ids).toEqual(expect.arrayContaining(['korg-microkorg', 'korg-ms2000', 'abd-sm002']));
  });

  it('returns only the canonical model when it has no compatibility links', () => {
    const lonely = MODEL_CONTRACTS.find(
      c => !c.compatibleModels?.length && !MODEL_CONTRACTS.some(o => o.compatibleModels?.includes(c.modelId))
    );
    if (!lonely) return; // no isolated model in the current registry → nothing to assert
    expect(getVisibleModelIds(lonely.modelId)).toEqual([lonely.modelId]);
  });
});

describe('getVisibleModels (context-aware objects)', () => {
  it('returns every model with metadata when no context is provided', () => {
    const models = getVisibleModels();
    expect(models).toHaveLength(TOTAL);
    expect(models.map(m => m.id).sort()).toEqual(getAllModels().map(m => m.id).sort());
  });

  it('returns only compatible models for a context, with full metadata', () => {
    const models = getVisibleModels('abd-sm002');
    expect(models).toHaveLength(3);
    expect(models.map(m => m.id)).toEqual(
      expect.arrayContaining(['abd-sm002', 'korg-ms2000', 'korg-microkorg'])
    );
    for (const m of models) {
      expect(typeof m.id).toBe('string');
      expect(typeof m.name).toBe('string');
      expect(typeof m.manufacturer).toBe('string');
    }
  });

  it('matches the contract displayName for visible models', () => {
    const models = getVisibleModels('roland-juno106');
    const ids = models.map(m => m.id);
    expect(ids).toEqual(
      expect.arrayContaining(['roland-juno106', 'roland-juno60', 'roland-juno6', 'roland-hs60'])
    );
    for (const m of models) {
      expect(m.name).toBe(getContract(m.id).displayName);
    }
  });
});
