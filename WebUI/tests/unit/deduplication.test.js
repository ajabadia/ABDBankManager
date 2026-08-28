import { describe, it, expect } from 'vitest';
import { partitionDuplicates } from '../../src/core/deduplication.js';

const existing = [{ id: 'old', fingerprint: 'a'.repeat(64) }];
const imported = [
  { id: 'new-a', fingerprint: 'a'.repeat(64) },
  { id: 'new-b', fingerprint: 'b'.repeat(64) },
  { id: 'new-b2', fingerprint: 'b'.repeat(64) }
];

describe('partitionDuplicates', () => {
  it('allows every patch in allow mode', () => {
    const result = partitionDuplicates(imported, existing, 'allow');
    expect(result.accepted).toEqual(imported);
    expect(result.duplicates).toHaveLength(0);
  });

  it('skips duplicates against existing and imported patches', () => {
    const result = partitionDuplicates(imported, existing, 'skip');
    expect(result.accepted.map(patch => patch.id)).toEqual(['new-b']);
    expect(result.duplicates.map(item => item.patch.id)).toEqual(['new-a', 'new-b2']);
  });

  it('does not mutate either input collection', () => {
    const existingCopy = structuredClone(existing);
    const importedCopy = structuredClone(imported);
    partitionDuplicates(imported, existing, 'skip');
    expect(existing).toEqual(existingCopy);
    expect(imported).toEqual(importedCopy);
  });
});
