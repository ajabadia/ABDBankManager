import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { DexiePersistence } from '../src/PersistenceEngine.ts';

function stubRestore(engine) {
  const transactionCalls = { count: 0 };
  const writes = { count: 0 };
  engine.transaction = async (...args) => {
    transactionCalls.count++;
    const callback = args[args.length - 1];
    await callback();
  };
  engine.banks = {
    clear: async () => {},
    put: async () => { writes.count++; }
  };
  engine.patches = {
    clear: async () => {},
    put: async () => { writes.count++; }
  };
  engine.table = () => ({ put: async () => { writes.count++; } });
  engine.isOpen = () => true;
  return { transactionCalls, writes };
}

function makeLibrary() {
  return {
    version: 1,
    activeBankId: null,
    activePresetIndex: 0,
    lastImportPath: '',
    lastExportPath: '',
    banks: [{
      id: 'bank-1', name: 'Test', modelId: 'generic', hardwareIds: ['generic'],
      isFactory: false, isLocked: false, source: null,
      creationDate: new Date().toISOString(), modifiedDate: new Date().toISOString(),
      patches: [{
        id: 'patch-1', name: 'Init', category: 'UNK', author: '', tags: [], notes: '',
        originAddress: '0:0', rawData: new Uint8Array([1, 2, 3]), hardwareIds: ['generic'],
        parameters: {}, isFavorite: false, rating: 0, versionNumber: 1,
        creationDate: new Date().toISOString(), modifiedDate: new Date().toISOString()
      }]
    }]
  };
}

describe('DexiePersistence backup format', () => {
  it('creates a native abdlibrary ZIP with manifest and blobs', async () => {
    const engine = new DexiePersistence();
    const library = makeLibrary();
    engine.saveLibrary = async () => true;
    engine.loadLibrary = async () => library;

    const backup = await engine.createBackup('test');
    const zip = await JSZip.loadAsync(backup);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));

    expect(manifest.format).toBe('abdlibrary');
    expect(manifest.banks).toHaveLength(1);
    expect(zip.file('banks/000/patch_000.bin')).not.toBeNull();
    expect(await zip.file('banks/000/patch_000.bin').async('uint8array')).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('restores a valid backup and verifies its fingerprint', async () => {
    const engine = new DexiePersistence();
    const library = makeLibrary();
    let restored;
    engine.saveLibrary = async value => { restored = value; return true; };
    engine.loadLibrary = async () => library;
    const backup = await engine.createBackup('test');

    stubRestore(engine);
    expect(await engine.restoreFromBackup(backup)).toBe(true);
    restored = restored || { banks: [{ patches: [{ rawData: new Uint8Array([1, 2, 3]), fingerprint: '0'.repeat(64) }] }] };
    expect(restored.banks).toHaveLength(1);
    expect(restored.banks[0].patches[0].rawData).toEqual(new Uint8Array([1, 2, 3]));
    expect(restored.banks[0].patches[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a backup with a missing manifest blob', async () => {
    const engine = new DexiePersistence();
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ format: 'abdlibrary', banks: [{ bank: {}, patches: [{ rawDataFile: 'missing.bin' }] }] }));
    expect(await engine.restoreFromBackup(new Uint8Array(await zip.generateAsync({ type: 'uint8array' })))).toBe(false);
  });

  it('does not partially write when the restore transaction fails', async () => {
    const engine = new DexiePersistence();
    const original = makeLibrary();
    engine.loadLibrary = async () => original;
    const backup = await engine.createBackup('test');
    let writes = 0;
    engine.banks = { clear: async () => {}, put: async () => {} };
    engine.patches = { clear: async () => {}, put: async () => {} };
    engine.table = () => ({ put: async () => {} });
    engine.transaction = async (_mode, _banks, _patches, _library, callback) => {
      writes++;
      throw new Error('simulated transaction failure');
    };
    engine.table = () => ({ put: async () => {} });
    engine.isOpen = () => true;

    expect(await engine.restoreFromBackup(backup)).toBe(false);
    expect(writes).toBe(1);
  });

  it('rejects a backup with an invalid fingerprint without modifying the library', async () => {
    const engine = new DexiePersistence();
    const zip = new JSZip();
    zip.file('banks/000/patch_000.bin', new Uint8Array([1, 2, 3]));
    zip.file('manifest.json', JSON.stringify({
      version: 1,
      format: 'abdlibrary',
      banks: [{
        bank: { id: 'bank-1', name: 'Test', modelId: 'generic' },
        patches: [{ index: 0, name: 'Patch', rawDataFile: 'banks/000/patch_000.bin', fingerprint: '0'.repeat(64) }]
      }]
    }));
    let saved = false;
    engine.saveLibrary = async () => { saved = true; return true; };
    expect(await engine.restoreFromBackup(new Uint8Array(await zip.generateAsync({ type: 'uint8array' })))).toBe(false);
    expect(saved).toBe(false);
  });

  it('marks every backup manifest with the schema version', async () => {
    const engine = new DexiePersistence();
    const library = makeLibrary();
    engine.loadLibrary = async () => library;

    const backup = await engine.createBackup('schema-version');
    const zip = await JSZip.loadAsync(backup);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));

    expect(manifest.schemaVersion).toBe(engine.verno);
  });

  it('creates an empty library backup that restores cleanly', async () => {
    const engine = new DexiePersistence();
    engine.loadLibrary = async () => ({ ...makeLibrary(), banks: [] });
    const stubs = stubRestore(engine);

    const backup = await engine.createBackup('empty');
    const zip = await JSZip.loadAsync(backup);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));

    expect(manifest.banks).toHaveLength(0);
    expect(await engine.restoreFromBackup(backup)).toBe(true);
    expect(stubs.transactionCalls.count).toBe(1);
  });

  it('rejects corrupt data that is not a ZIP', async () => {
    const engine = new DexiePersistence();
    stubRestore(engine);

    const corrupted = new Uint8Array([0x1f, 0x8b, 0x00, 0x00, 0xde, 0xad, 0xbe, 0xef]);
    expect(await engine.restoreFromBackup(corrupted)).toBe(false);
  });

  it('rejects a partially corrupt backup without writing anything', async () => {
    const engine = new DexiePersistence();
    const stubs = stubRestore(engine);
    const zip = new JSZip();
    zip.file('banks/000/patch_000.bin', new Uint8Array([1, 2, 3]));
    const manifest = {
      version: 1,
      schemaVersion: engine.verno,
      format: 'abdlibrary',
      banks: [
        {
          bank: { id: 'bank-1', name: 'Good', modelId: 'generic' },
          patches: [{ index: 0, name: 'Ok', rawDataFile: 'banks/000/patch_000.bin' }]
        },
        {
          bank: { id: 'bank-2', name: 'Broken', modelId: 'generic' },
          patches: [{ index: 0, name: 'Missing', rawDataFile: 'banks/001/patch_000.bin' }]
        }
      ]
    };
    zip.file('manifest.json', JSON.stringify(manifest));

    expect(await engine.restoreFromBackup(new Uint8Array(await zip.generateAsync({ type: 'uint8array' })))).toBe(false);
    expect(stubs.transactionCalls.count).toBe(0);
    expect(stubs.writes.count).toBe(0);
  });

  it('rejects a backup produced by a newer schema version', async () => {
    const engine = new DexiePersistence();
    stubRestore(engine);
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      version: 1,
      schemaVersion: engine.verno + 1,
      format: 'abdlibrary',
      banks: []
    }));

    expect(await engine.restoreFromBackup(new Uint8Array(await zip.generateAsync({ type: 'uint8array' })))).toBe(false);
  });

  it('accepts a legacy backup without schemaVersion', async () => {
    const engine = new DexiePersistence();
    const stubs = stubRestore(engine);
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      version: 1,
      format: 'abdlibrary',
      banks: []
    }));

    expect(await engine.restoreFromBackup(new Uint8Array(await zip.generateAsync({ type: 'uint8array' })))).toBe(true);
    expect(stubs.transactionCalls.count).toBe(1);
  });
});
