/**
 * Migración Dexie v4 — purga del object store `settings` legado (v1/v2).
 * La suite de persistencia completa está en describe.skip (requiere IndexedDB),
 * pero la declaración de versiones y la lógica de purga son testeables en Node:
 * Dexie no toca IndexedDB hasta que se llama a open().
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  db, purgeLegacySettingsStore,
  CURRENT_SCHEMA_VERSION,
  shouldBackupBeforeMigration,
  getInstalledDbVersion,
  buildMigrationBackupPayload,
  downloadJsonBackup,
  runPreMigrationBackup
} from '../../src/store/persistence.js';

afterEach(() => {
  delete globalThis.indexedDB;
});

describe('Migración Dexie v4 (purga de settings)', () => {
  it('declara la versión 4 del esquema', () => {
    expect(db.verno).toBe(4);
  });

  it('no incluye la tabla settings en el esquema final (settings: null)', () => {
    const tableNames = db.tables.map(t => t.name);
    expect(tableNames.sort()).toEqual(['banks', 'history', 'patchTags', 'patches', 'tags']);
    expect(tableNames).not.toContain('settings');
    expect(() => db.table('settings')).toThrow();
  });

  it('purga el object store settings cuando existe', () => {
    const deleteObjectStore = vi.fn();
    const tx = {
      idbtrans: {
        db: {
          objectStoreNames: { contains: name => name === 'settings' },
          deleteObjectStore
        }
      }
    };

    purgeLegacySettingsStore(tx);

    expect(deleteObjectStore).toHaveBeenCalledTimes(1);
    expect(deleteObjectStore).toHaveBeenCalledWith('settings');
  });

  it('es un no-op seguro cuando el store ya no existe', () => {
    const deleteObjectStore = vi.fn();
    const tx = {
      idbtrans: {
        db: {
          objectStoreNames: { contains: () => false },
          deleteObjectStore
        }
      }
    };

    expect(() => purgeLegacySettingsStore(tx)).not.toThrow();
    expect(deleteObjectStore).not.toHaveBeenCalled();
  });
});

describe('Auto-backup before migration', () => {
  it('reporta la versión de esquema actual como 4', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(4);
    expect(CURRENT_SCHEMA_VERSION).toBe(db.verno);
  });

  it('decide backup solo cuando existe una base vieja por actualizar', () => {
    expect(shouldBackupBeforeMigration(1)).toBe(true);
    expect(shouldBackupBeforeMigration(3)).toBe(true);
    expect(shouldBackupBeforeMigration(4)).toBe(false);
    expect(shouldBackupBeforeMigration(5)).toBe(false);
    expect(shouldBackupBeforeMigration(0)).toBe(false);
    expect(shouldBackupBeforeMigration(null)).toBe(false);
    expect(shouldBackupBeforeMigration('4')).toBe(false);
    expect(shouldBackupBeforeMigration(3.5)).toBe(false);
  });

  it('lee la versión instalada desde indexedDB.databases()', async () => {
    globalThis.indexedDB = {
      databases: async () => [
        { name: 'otra-db', version: 2 },
        { name: 'ABDBankManager', version: 1 }
      ]
    };
    expect(await getInstalledDbVersion()).toBe(1);
  });

  it('devuelve 0 si no existe la base', async () => {
    globalThis.indexedDB = { databases: async () => [] };
    expect(await getInstalledDbVersion()).toBe(0);
  });

  it('devuelve null cuando no hay indexedDB disponible', async () => {
    expect(await getInstalledDbVersion()).toBe(null);
  });

  it('construye el payload del backup con identificación de esquema', () => {
    const payload = buildMigrationBackupPayload([{ id: 'b1' }], [{ id: 'p1' }], 1);
    expect(payload).toMatchObject({
      format: 'abdlibrary-json',
      schemaVersion: 4,
      sourceVersion: 1,
      bankCount: 1,
      patchCount: 1
    });
    expect(payload.banks).toEqual([{ id: 'b1' }]);
    expect(payload.patches).toEqual([{ id: 'p1' }]);
  });

  it('no descarga en entornos sin document (Node)', () => {
    const result = downloadJsonBackup({}, 'abd-backup.json');
    expect(result.downloaded).toBe(false);
    expect(result.reason).toBe('no-document');
  });

  it('es un no-op seguro sin indexedDB', async () => {
    const result = await runPreMigrationBackup();
    expect(result.attempted).toBe(false);
    expect(result.reason).toBe('no-indexeddb');
  });

  it('no intenta backup sin una versión vieja instalada', async () => {
    globalThis.indexedDB = { databases: async () => [{ name: 'ABDBankManager', version: 4 }] };
    const result = await runPreMigrationBackup();
    expect(result.attempted).toBe(false);
    expect(result.reason).toBe('no-upgrade-pending');
  });

  it('registra el intento fallido sin abortar, y lo ejecuta solo una vez por sesión', async () => {
    globalThis.indexedDB = { databases: async () => [{ name: 'ABDBankManager', version: 1 }] };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = await runPreMigrationBackup();
    expect(first.attempted).toBe(true);
    expect(first.ok).toBe(false);
    expect(first.fromVersion).toBe(1);
    expect(console.warn).toHaveBeenCalled();
    warn.mockRestore();

    const second = await runPreMigrationBackup();
    expect(second.reason).toBe('already-run');
  });
});
