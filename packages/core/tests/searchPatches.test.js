import { describe, it, expect } from 'vitest';
import { searchPatches, getFilteredPatches } from '../src/search/searchPatches.js';

const makeLib = (banks) => ({ version: 1, activeBankId: null, activePresetIndex: 0, banks });

const makeBank = (id, name, modelId, patches = []) => ({
  id, name, modelId, hardwareIds: [modelId], isFactory: false, isLocked: false,
  patches, source: null, creationDate: '2024-01-01T00:00:00.000Z', modifiedDate: '2024-01-01T00:00:00.000Z'
});

const makePatch = (overrides = {}) => ({
  id: `patch-${crypto.randomUUID()}`,
  name: 'Test Patch',
  category: 'Lead',
  author: 'Test Author',
  tags: ['bright', 'modular'],
  notes: 'Some notes',
  isFavorite: false,
  rating: 3,
  creationDate: '2024-01-01T00:00:00.000Z',
  modifiedDate: '2024-01-01T00:00:00.000Z',
  originModel: 'pro800',
  hardwareIds: ['pro800'],
  originAddress: 'A01',
  originBank: 'Factory Bank',
  rawData: new Uint8Array([0xF0, 0x42, 0xF7]),
  parameters: null,
  fingerprint: 'abc123',
  previousVersionId: null,
  versionNumber: 1,
  importSource: 'test.syx',
  importDate: '2024-01-01T00:00:00.000Z',
  ...overrides
});

describe('searchPatches', () => {
  const lib = makeLib([
    makeBank('b1', 'Bank 1', 'pro800', [
      makePatch({ id: 'p1', name: 'Bass Monster', category: 'Bass', author: 'Alice', tags: ['fat'], isFavorite: true, rating: 5 }),
      makePatch({ id: 'p2', name: 'Lead Scream', category: 'Lead', author: 'Bob', tags: ['sharp'], isFavorite: false, rating: 3 })
    ]),
    makeBank('b2', 'Bank 2', 'cz101', [
      makePatch({ id: 'p3', name: 'Pad Dream', category: 'Pad', author: 'Alice', tags: ['ambient'], isFavorite: true, rating: 4 }),
      makePatch({ id: 'p4', name: 'Bass Deep', category: 'Bass', author: 'Carol', tags: ['deep'], isFavorite: false, rating: 2 })
    ])
  ]);

  it('returns empty array for empty query on empty library', () => {
    expect(searchPatches({ banks: [] }, { text: '' })).toEqual([]);
    expect(searchPatches(null, { text: 'test' })).toEqual([]);
  });

  it('searches by name (case-insensitive)', () => {
    const r = searchPatches(lib, { text: 'bass' });
    expect(r.map(x => x.patch.id)).toEqual(['p1', 'p4']);
  });

  it('searches by author', () => {
    const r = searchPatches(lib, { text: 'alice' });
    expect(r.map(x => x.patch.id)).toEqual(['p1', 'p3']);
  });

  it('searches by tags', () => {
    const r = searchPatches(lib, { text: 'fat' });
    expect(r.map(x => x.patch.id)).toEqual(['p1']);
  });

  it('searches by notes', () => {
    const r = searchPatches(lib, { text: 'notes' });
    expect(r.map(x => x.patch.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('filters by modelId', () => {
    const r = searchPatches(lib, { text: '', modelId: 'pro800' });
    expect(r.map(x => x.patch.id)).toEqual(['p1', 'p2']);
  });

  it('filters by category', () => {
    const r = searchPatches(lib, { text: '', category: 'Bass' });
    expect(r.map(x => x.patch.id)).toEqual(['p1', 'p4']);
  });

  it('filters by favoritesOnly', () => {
    const r = searchPatches(lib, { text: '', favoritesOnly: true });
    expect(r.map(x => x.patch.id)).toEqual(['p1', 'p3']);
  });

  it('filters by minRating', () => {
    const r = searchPatches(lib, { text: '', minRating: 4 });
    expect(r.map(x => x.patch.id)).toEqual(['p1', 'p3']);
  });

  it('combines text + filters', () => {
    const r = searchPatches(lib, { text: 'bass', modelId: 'cz101' });
    expect(r.map(x => x.patch.id)).toEqual(['p4']);
  });

  it('includes bank context in results', () => {
    const r = searchPatches(lib, { text: 'bass' });
    expect(r[0]).toHaveProperty('bankId', 'b1');
    expect(r[0]).toHaveProperty('bankName', 'Bank 1');
    expect(r[1]).toHaveProperty('bankId', 'b2');
    expect(r[1]).toHaveProperty('bankName', 'Bank 2');
  });
});

describe('getFilteredPatches', () => {
  const lib = makeLib([
    makeBank('b1', 'Bank 1', 'pro800', [
      makePatch({ id: 'p1', name: 'Alpha', category: 'Lead', author: 'Alice', rating: 5, modifiedDate: '2024-02-01T00:00:00.000Z' }),
      makePatch({ id: 'p2', name: 'Beta', category: 'Bass', author: 'Bob', rating: 3, modifiedDate: '2024-01-15T00:00:00.000Z' })
    ]),
    makeBank('b2', 'Bank 2', 'pro800', [
      makePatch({ id: 'p3', name: 'Gamma', category: 'Pad', author: 'Alice', rating: 4, modifiedDate: '2024-03-01T00:00:00.000Z' })
    ])
  ]);

  it('filters by modelId', () => {
    const r = getFilteredPatches(lib, { modelId: 'pro800' });
    expect(r.length).toBe(3);
  });

  it('filters by category', () => {
    const r = getFilteredPatches(lib, { category: 'Bass' });
    expect(r.map(x => x.id)).toEqual(['p2']);
  });

  it('filters by author', () => {
    const r = getFilteredPatches(lib, { author: 'Alice' });
    expect(r.map(x => x.id)).toEqual(['p1', 'p3']);
  });

  it('filters by tags (all tags must match)', () => {
    const lib2 = makeLib([makeBank('b1', 'B', 'm', [
      makePatch({ id: 'p1', tags: ['a', 'b'] }),
      makePatch({ id: 'p2', tags: ['a'] })
    ])]);
    const r = getFilteredPatches(lib2, { tags: ['a'] });
    expect(r.map(x => x.id)).toEqual(['p1', 'p2']);
    const r2 = getFilteredPatches(lib2, { tags: ['b'] });
    expect(r2.map(x => x.id)).toEqual(['p1']);
  });

  it('filters by favoritesOnly', () => {
    const lib2 = makeLib([makeBank('b1', 'B', 'm', [
      makePatch({ id: 'p1', isFavorite: true }),
      makePatch({ id: 'p2', isFavorite: false })
    ])]);
    const r = getFilteredPatches(lib2, { favoritesOnly: true });
    expect(r.map(x => x.id)).toEqual(['p1']);
  });

  it('sorts by name asc', () => {
    const r = getFilteredPatches(lib, { sortBy: 'name', sortOrder: 'asc' });
    expect(r.map(x => x.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('sorts by name desc', () => {
    const r = getFilteredPatches(lib, { sortBy: 'name', sortOrder: 'desc' });
    expect(r.map(x => x.name)).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('sorts by date asc (oldest first)', () => {
    const r = getFilteredPatches(lib, { sortBy: 'date', sortOrder: 'asc' });
    expect(r.map(x => x.id)).toEqual(['p2', 'p1', 'p3']);
  });

  it('sorts by date desc (newest first)', () => {
    const r = getFilteredPatches(lib, { sortBy: 'date', sortOrder: 'desc' });
    expect(r.map(x => x.id)).toEqual(['p3', 'p1', 'p2']);
  });

  it('sorts by category', () => {
    const r = getFilteredPatches(lib, { sortBy: 'category', sortOrder: 'asc' });
    expect(r.map(x => x.category)).toEqual(['Bass', 'Lead', 'Pad']);
  });

  it('sorts by rating asc', () => {
    const r = getFilteredPatches(lib, { sortBy: 'rating', sortOrder: 'asc' });
    expect(r.map(x => x.rating)).toEqual([3, 4, 5]);
  });

  it('sorts by rating desc', () => {
    const r = getFilteredPatches(lib, { sortBy: 'rating', sortOrder: 'desc' });
    expect(r.map(x => x.rating)).toEqual([5, 4, 3]);
  });

  it('combines filters and sort', () => {
    const r = getFilteredPatches(lib, { author: 'Alice', sortBy: 'rating', sortOrder: 'desc' });
    expect(r.map(x => x.id)).toEqual(['p1', 'p3']);
  });

  it('handles missing/undefined library gracefully', () => {
    expect(getFilteredPatches(null, {})).toEqual([]);
    expect(getFilteredPatches({ banks: null }, {})).toEqual([]);
    expect(getFilteredPatches({ banks: [] }, {})).toEqual([]);
  });
});