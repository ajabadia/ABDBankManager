/**
 * Migración Dexie v1→v4 real sobre fake-indexeddb.
 * Verifica el arranque en frío, la cadena v1→v2→v3→v4 (datos conservados,
 * object store `settings` purgado físicamente) y el rollback atómico
 * cuando la migración falla (la base permanece en la versión antigua).
 */

import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

globalThis.indexedDB = new IDBFactory();
globalThis.IDBKeyRange = IDBKeyRange;
Dexie.dependencies.indexedDB = globalThis.indexedDB;
Dexie.dependencies.IDBKeyRange = globalThis.IDBKeyRange;

const { db } = await import('../../src/store/persistence.js');

async function resetDb() {
  try { await db.delete(); } catch { /* already deleted */ }
}

describe('Migración Dexie real (fake-indexeddb)', () => {
  it('abre una base nueva directamente en la versión 4', async () => {
    await resetDb();
    await db.open();
    expect(db.verno).toBe(4);
    const tables = db.tables.map(t => t.name).sort();
    expect(tables).toEqual(['banks', 'history', 'patchTags', 'patches', 'tags']);
  });

  it('migra una base v1 a v4 conservando datos y purgando settings', async () => {
    await resetDb();

    const legacy = new Dexie('ABDBankManager');
    legacy.version(1).stores({
      banks: '++dbId, id, modelId, name, isFactory',
      patches: '++dbId, id, bankId, [bankId+index], name, fingerprint, isFavorite',
      settings: 'key',
      history: '++dbId, patchId, timestamp'
    });
    await legacy.open();
    await legacy.banks.add({
      id: 'bank-1', name: 'Mi Banco', modelId: 'behringer-pro800', isFactory: false,
      creationDate: new Date().toISOString()
    });
    await legacy.patches.add({
      id: 'patch-1', bankId: 'bank-1', index: 0, name: 'Lead',
      rawData: new Uint8Array([1, 2, 3]), fingerprint: 'a'.repeat(64), isFavorite: 1
    });
    await legacy.settings.put({ key: 'midiChannel', value: 3 });
    legacy.close();

    await db.open();
    expect(db.verno).toBe(4);

    const bank = await db.banks.where('id').equals('bank-1').first();
    expect(bank).not.toBeUndefined();
    expect(bank.name).toBe('Mi Banco');

    const patch = await db.patches.where('id').equals('patch-1').first();
    expect(patch.name).toBe('Lead');
    expect(patch.isFavorite).toBe(1);

    expect(db.tables.map(t => t.name)).not.toContain('settings');
    const idb = await new Promise((resolve, reject) => {
      const req = indexedDB.open('ABDBankManager');
      req.onsuccess = () => { req.result.close(); resolve(req.result); };
      req.onerror = () => reject(req.error);
    });
    expect(Array.from(idb.objectStoreNames)).not.toContain('settings');
  });

  it('hace rollback completo si la migración falla y la base permanece en v1', async () => {
    await resetDb();

    const legacy = new Dexie('ABDBankManager');
    legacy.version(1).stores({ banks: '++dbId, id, modelId, name' });
    await legacy.open();
    await legacy.banks.add({ id: 'bank-x', name: 'Sobrevive', modelId: 'generic' });
    legacy.close();

    const failing = new Dexie('ABDBankManager');
    failing.version(2).stores({ newTable: '++id', others: '++id' });
    failing.version(3).upgrade(() => { throw new Error('migración simulada rota'); });
    await expect(failing.open()).rejects.toThrow('migración simulada rota');
    try { failing.close(); } catch { /* already torn down */ }

    const probe = new Dexie('ABDBankManager');
    probe.version(1).stores({ banks: '++dbId, id, modelId, name' });
    await probe.open();
    expect(probe.verno).toBe(1);
    const rows = await probe.banks.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Sobrevive');
    probe.close();
  });
});