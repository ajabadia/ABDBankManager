/**
 * ABD Bank Manager — Dexie.js Persistence Engine
 * IndexedDB with versioned schema migrations and native ZIP backups.
 */

import Dexie from 'dexie';
import JSZip from 'jszip';
import { calculateFingerprint } from './operations/fingerprint.js';
import type { PatchData, Bank, Library, ImportResult, ExportOptions } from './validationSchemas.js';
import type { ImportAdapter, ExportAdapter } from '../../contracts/src/index.js';
import { BackupManifestSchema, assertBackupPatchData } from './backupValidation.js';

export interface PersistenceEngine {
  loadLibrary(): Promise<Library | null>;
  saveLibrary(library: Library): Promise<boolean>;
  importFile(data: Uint8Array, filename: string, adapters: ImportAdapter[]): Promise<ImportResult>;
  exportFile(patches: PatchData[], adapter: ExportAdapter, options: ExportOptions): Promise<Uint8Array>;
  createBackup(reason: string): Promise<Uint8Array>;
  restoreFromBackup(data: Uint8Array): Promise<boolean>;
}

class DexiePersistence extends Dexie implements PersistenceEngine {
  patches!: Dexie.Table<PatchData, string>;
  banks!: Dexie.Table<Bank, string>;
  tags!: Dexie.Table<{ id: string; name: string }, string>;
  patchTags!: Dexie.Table<{ patchId: string; tagId: string }, [string, string]>;

  constructor() {
    super('ABDBankManager');

    this.version(1).stores({
      patches: '++id, name, category, originModel, fingerprint, bankId, isFavorite, rating, versionNumber',
      banks: '++id, name, modelId, isFactory, isLocked',
      tags: '++id, &name',
      patchTags: '[patchId+tagId], patchId, tagId'
    });

    this.version(2).stores({
      patches: '++id, name, category, originModel, fingerprint, bankId, isFavorite, rating, versionNumber, previousVersionId'
    }).upgrade(tx => tx.table('patches').toCollection().modify(patch => {
      patch.versionNumber = patch.versionNumber || 1;
      patch.previousVersionId = patch.previousVersionId || null;
    }));

    this.version(3).stores({
      libraries: '++id, version, activeBankId, activePresetIndex, lastImportPath, lastExportPath'
    }).upgrade(tx => tx.table('libraries').add({
      id: 'default', version: 1, activeBankId: null, activePresetIndex: 0,
      lastImportPath: '', lastExportPath: ''
    }));
  }

  async loadLibrary(): Promise<Library | null> {
    const lib = await this.table('libraries').get('default');
    if (!lib) return null;
    const banks = await this.banks.toArray();
    for (const bank of banks) {
      bank.patches = await this.patches.where('bankId').equals(bank.id).toArray();
    }
    return {
      version: lib.version,
      activeBankId: lib.activeBankId,
      activePresetIndex: lib.activePresetIndex,
      banks,
      lastImportPath: lib.lastImportPath,
      lastExportPath: lib.lastExportPath
    };
  }

  async saveLibrary(library: Library): Promise<boolean> {
    await this.transaction('rw', this.banks, this.patches, this.table('libraries'), async () => {
      await this.table('libraries').put({
        id: 'default', version: library.version, activeBankId: library.activeBankId,
        activePresetIndex: library.activePresetIndex,
        lastImportPath: library.lastImportPath, lastExportPath: library.lastExportPath
      });
      await this.banks.clear();
      await this.patches.clear();
      for (const bank of library.banks) {
        const { patches, ...bankData } = bank;
        await this.banks.put(bankData);
        for (const patch of patches) await this.patches.put({ ...patch, bankId: bank.id });
      }
    });
    return true;
  }

  async importFile(data: Uint8Array, filename: string, adapters: ImportAdapter[]): Promise<ImportResult> {
    const adapter = adapters.find(candidate => candidate.canParse(data, filename));
    if (!adapter) return this.failedImport('No adapter found for file');
    if (adapter.verifyChecksum && !adapter.verifyChecksum(data)) return this.failedImport('Checksum verification failed');
    const result = adapter.parse(data, filename);
    if (!result.success) return result;

    const library = await this.loadLibrary() || this.createEmptyLibrary();
    const targetBank = library.banks.find(bank => bank.name === result.bankName) || library.banks[0];
    if (!targetBank) return this.failedImport('No target bank');

    for (const patch of result.patches) {
      patch.fingerprint = patch.fingerprint || await calculateFingerprint(patch.rawData);
      patch.hardwareIds = patch.hardwareIds?.length ? patch.hardwareIds : [result.modelId].filter(Boolean);
      patch.bankId = targetBank.id;
      patch.versionNumber = 1;
      patch.creationDate = new Date().toISOString();
      await this.patches.put(patch);
    }
    return result;
  }

  async exportFile(patches: PatchData[], adapter: ExportAdapter, options: ExportOptions): Promise<Uint8Array> {
    return adapter.serialize(patches, 'Export', options);
  }

  async createBackup(reason: string): Promise<Uint8Array> {
    const library = await this.loadLibrary();
    if (!library) throw new Error('No library to backup');

    const zip = new JSZip();
    const banks = [];
    for (let bankIndex = 0; bankIndex < library.banks.length; bankIndex++) {
      const bank = library.banks[bankIndex];
      const patches = [];
      for (let patchIndex = 0; patchIndex < bank.patches.length; patchIndex++) {
        const patch = bank.patches[patchIndex];
        const rawDataFile = `banks/${String(bankIndex).padStart(3, '0')}/patch_${String(patchIndex).padStart(3, '0')}.bin`;
        if (!(patch.rawData instanceof Uint8Array) || patch.rawData.length === 0) {
          throw new Error(`Cannot backup empty rawData for patch '${patch.id}'`);
        }
        zip.file(rawDataFile, patch.rawData);
        patches.push({
          index: patch.index ?? patchIndex,
          name: patch.name,
          address: patch.originAddress || `${bankIndex}:${patchIndex}`,
          category: patch.category,
          author: patch.author,
          tags: patch.tags,
          notes: patch.notes,
          isFavorite: patch.isFavorite,
          rating: patch.rating,
          rawDataFile,
          parameters: patch.parameters || {},
          fingerprint: patch.fingerprint,
          versionNumber: patch.versionNumber,
          previousVersionId: patch.previousVersionId || null
        });
      }
      banks.push({
        bank: {
          id: bank.id,
          name: bank.name,
          modelId: bank.modelId,
          hardwareIds: bank.hardwareIds,
          manufacturer: (bank as Bank & { manufacturer?: string }).manufacturer || 'Unknown',
          isFactory: bank.isFactory,
          isLocked: bank.isLocked,
          creationDate: bank.creationDate,
          modifiedDate: bank.modifiedDate,
          patchCount: patches.length
        },
        patches
      });
    }

    zip.file('manifest.json', JSON.stringify({
      version: 1,
      schemaVersion: this.verno,
      format: 'abdlibrary',
      library: { bankCount: banks.length, exportedAt: new Date().toISOString(), reason },
      banks
    }, null, 2));

    return new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
  }

  async restoreFromBackup(data: Uint8Array): Promise<boolean> {
    try {
      const zip = await JSZip.loadAsync(data);
      const manifestFile = zip.file('manifest.json');
      if (!manifestFile) return false;
      const manifest = BackupManifestSchema.parse(JSON.parse(await manifestFile.async('string')));
      if (manifest.schemaVersion != null && manifest.schemaVersion > this.verno) return false;
      const banks: Bank[] = [];
      const bankIds = new Set<string>();

      for (const entry of manifest.banks) {
        if (bankIds.has(entry.bank.id)) return false;
        bankIds.add(entry.bank.id);
        const patches: PatchData[] = [];
        const patchIndexes = new Set<number>();
        for (const patchEntry of entry.patches) {
          if (patchIndexes.has(patchEntry.index)) return false;
          patchIndexes.add(patchEntry.index);
          const blob = zip.file(patchEntry.rawDataFile);
          if (!blob) return false;
          const rawData = new Uint8Array(await blob.async('arraybuffer'));
          assertBackupPatchData(patchEntry, rawData);
          const fingerprint = await calculateFingerprint(rawData);
          if (patchEntry.fingerprint && patchEntry.fingerprint !== fingerprint) return false;
          patches.push({
            ...patchEntry,
            id: crypto.randomUUID(),
            bankId: entry.bank.id,
            rawData,
            fingerprint,
            originAddress: patchEntry.address,
            hardwareIds: entry.bank.hardwareIds || [],
            creationDate: new Date().toISOString()
          } as PatchData);
        }
        banks.push({ ...entry.bank, patches } as Bank);
      }

      await this.transaction('rw', this.banks, this.patches, this.table('libraries'), async () => {
        await this.table('libraries').put({
          id: 'default', version: manifest.version, activeBankId: null,
          activePresetIndex: 0, lastImportPath: '', lastExportPath: ''
        });
        await this.banks.clear();
        await this.patches.clear();
        for (const bank of banks) {
          const { patches, ...bankData } = bank;
          await this.banks.put(bankData);
          for (const patch of patches) {
            await this.patches.put({ ...patch, bankId: bank.id });
          }
        }
      });
      return true;
    } catch {
      return false;
    }
  }

  private failedImport(error: string): ImportResult {
    return { success: false, modelId: '', bankName: '', patches: [], warnings: [], error };
  }

  private createEmptyLibrary(): Library {
    return {
      version: 1,
      activeBankId: null,
      activePresetIndex: 0,
      banks: [],
      lastImportPath: '',
      lastExportPath: ''
    };
  }
}

export const persistenceEngine = new DexiePersistence();
export { DexiePersistence };
