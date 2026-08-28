/**
 * ABD Bank Manager — Unified Dexie Persistence Engine (P1.3)
 *
 * Single source of truth for IndexedDB persistence across WebUI, core, and standalone.
 * Schema v4 matches WebUI/src/store/persistence.js (banks, patches, history, tags M:N).
 * Mutations delegate to core pure operations (packages/core/src/operations/library.js).
 */
import Dexie from 'dexie';
import JSZip from 'jszip';
import { calculateFingerprint } from './operations/fingerprint.js';
import type { PatchData, Bank, Library, ImportResult, ExportOptions } from './validationSchemas.js';
import type { ImportAdapter, ExportAdapter } from '../../contracts/src/index.js';
import { BackupManifestSchema, assertBackupPatchData } from './backupValidation.js';
import {
  addBank,
  removeBank,
  renameBank,
  addPatch,
  removePatch,
  movePatch,
  updatePatchMetadata,
  movePatchBetweenBanks,
  duplicateBank,
  assertBankEditable,
  assertBankHasCapacity,
  isLibrary
} from './operations/library.js';

export interface PersistenceEngine {
  loadLibrary(): Promise<Library | null>;
  saveLibrary(library: Library): Promise<boolean>;
  importFile(data: Uint8Array, filename: string, adapters: ImportAdapter[]): Promise<ImportResult>;
  exportFile(patches: PatchData[], adapter: ExportAdapter, options: ExportOptions): Promise<Uint8Array>;
  createBackup(reason: string): Promise<Uint8Array>;
  restoreFromBackup(data: Uint8Array): Promise<boolean>;
}

class UnifiedDexiePersistence extends Dexie implements PersistenceEngine {
  banks!: Dexie.Table<Bank, string>;
  patches!: Dexie.Table<PatchData, string>;
  history!: Dexie.Table<{ dbId: number; patchId: string; rawData: Uint8Array; timestamp: number }, number>;
  tags!: Dexie.Table<{ dbId: number; name: string }, number>;
  patchTags!: Dexie.Table<{ dbId: number; patchId: string; tagId: number }, [string, number]>;

  constructor() {
    super('ABDBankManager');

    // v1: base schema
    this.version(1).stores({
      banks: '++dbId, id, modelId, name, isFactory',
      patches: '++dbId, id, bankId, [bankId+index], name, fingerprint, isFavorite, category',
      history: '++dbId, patchId, timestamp',
      tags: '++dbId, name',
      patchTags: '++dbId, [patchId+tagId]'
    });

    // v2: add category to patches
    this.version(2).stores({
      banks: '++dbId, id, modelId, name, isFactory',
      patches: '++dbId, id, bankId, [bankId+index], name, fingerprint, isFavorite, category',
      history: '++dbId, patchId, timestamp',
      tags: '++dbId, name',
      patchTags: '++dbId, [patchId+tagId]'
    });

    // v3: add creationDate to banks and patches
    this.version(3).stores({
      banks: '++dbId, id, modelId, name, isFactory, creationDate',
      patches: '++dbId, id, bankId, [bankId+index], name, fingerprint, isFavorite, category, creationDate',
      history: '++dbId, patchId, timestamp',
      tags: '++dbId, name',
      patchTags: '++dbId, [patchId+tagId]'
    });

    // v4: purge legacy settings store
    this.version(4).stores({
      banks: '++dbId, id, modelId, name, isFactory, creationDate',
      patches: '++dbId, id, bankId, [bankId+index], name, fingerprint, isFavorite, category, creationDate',
      history: '++dbId, patchId, timestamp',
      tags: '++dbId, name',
      patchTags: '++dbId, [patchId+tagId]',
      settings: null
    }).upgrade((tx) => {
      const idb = tx.idbtrans.db;
      if (idb.objectStoreNames.contains('settings')) {
        idb.deleteObjectStore('settings');
        console.log('[UnifiedPersistence] Object store "settings" purged (migration v4)');
      }
    });

    // Hooks for timestamps
    this.banks.hook('creating', (_, obj) => {
      obj.creationDate = obj.creationDate || new Date().toISOString();
      obj.modifiedDate = obj.modifiedDate || new Date().toISOString();
    });
    this.banks.hook('updating', (modifications) => {
      modifications.modifiedDate = new Date().toISOString();
    });
  }

  // ─── Load / Save ───

  async loadLibrary(): Promise<Library | null> {
    const banks = await this.banks.toArray();
    if (!banks.length) return null;

    const patches = await this.patches.toArray();
    const patchesByBank = new Map<string, PatchData[]>();
    for (const patch of patches) {
      const arr = patchesByBank.get(patch.bankId) || [];
      arr.push(patch);
      patchesByBank.set(patch.bankId, arr);
    }

    for (const bank of banks) {
      bank.patches = (patchesByBank.get(bank.id) || [])
        .slice()
        .sort((a, b) => a.index - b.index);
    }

    // Load tags M:N and attach to patches
    const tagMap = new Map<number, string>();
    const allTags = await this.tags.toArray();
    for (const t of allTags) tagMap.set(t.dbId, t.name);

    const patchTagRows = await this.patchTags.toArray();
    for (const pt of patchTagRows) {
      const patch = patches.find(p => p.id === pt.patchId);
      if (patch) {
        const tagName = tagMap.get(pt.tagId);
        if (tagName && !patch.tags?.includes(tagName)) {
          patch.tags = [...(patch.tags || []), tagName];
        }
      }
    }

    return {
      version: 1,
      activeBankId: null,
      activePresetIndex: 0,
      banks,
      lastImportPath: '',
      lastExportPath: ''
    };
  }

  async saveLibrary(library: Library): Promise<boolean> {
    if (!isLibrary(library)) throw new Error('Invalid library');

    await this.transaction('rw', this.banks, this.patches, async () => {
      // Clear and rebuild — simple and correct for library-sized data
      await this.banks.clear();
      await this.patches.clear();

      for (const bank of library.banks) {
        const { patches, ...bankData } = bank;
        await this.banks.put(bankData);
        for (const patch of patches || []) {
          await this.patches.put({ ...patch, bankId: bank.id });
        }
      }
    });
    return true;
  }

  // ─── Mutation Delegation (core pure ops) ───

  async createBank(bankData: Partial<Bank> & { id?: string }): Promise<Bank> {
    const library = await this.loadLibrary() || { version: 1, activeBankId: null, activePresetIndex: 0, banks: [] };
    const bank = {
      id: bankData.id || crypto.randomUUID(),
      name: bankData.name,
      modelId: bankData.modelId,
      hardwareIds: bankData.hardwareIds || (bankData.modelId ? [bankData.modelId] : []),
      manufacturer: bankData.manufacturer || '',
      isFactory: bankData.isFactory || false,
      isLocked: bankData.isLocked || false,
      source: bankData.source || null,
      creationDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
      patches: []
    } as Bank;

    const next = addBank(library, bank);
    await this.saveLibrary(next);
    return bank;
  }

  async createPatch(bankId: string, patchData: Partial<PatchData>, options: { maxPatches?: number } = {}): Promise<PatchData> {
    const library = await this.loadLibrary() || { version: 1, activeBankId: null, activePresetIndex: 0, banks: [] };
    const bank = library.banks.find(b => b.id === bankId);
    if (!bank) throw new Error(`ERR_BANK_NOT_FOUND: Bank '${bankId}' not found`);
    assertBankEditable(bank);

    const maxPatches = options.maxPatches ?? bank.patches?.length ?? 0; // capacity from contract handled by caller
    const existingPatches = bank.patches || [];
    const nextIndex = patchData.index ?? existingPatches.length;

    const patch: PatchData = {
      id: patchData.id || `patch-${crypto.randomUUID()}`,
      bankId,
      index: nextIndex,
      name: patchData.name || 'Init Patch',
      category: patchData.category || 'Other',
      author: patchData.author || '',
      tags: patchData.tags || [],
      notes: patchData.notes || '',
      rawData: patchData.rawData || new Uint8Array(0),
      hardwareIds: patchData.hardwareIds?.length ? patchData.hardwareIds : bank.hardwareIds || (bank.modelId ? [bank.modelId] : []),
      parameters: patchData.parameters || {},
      fingerprint: patchData.fingerprint || await calculateFingerprint(patchData.rawData || new Uint8Array(0), { programsPerBank: maxPatches } as any),
      isFavorite: patchData.isFavorite || false,
      rating: patchData.rating || 0,
      versionNumber: patchData.versionNumber || 1,
      previousVersionId: patchData.previousVersionId || null,
      creationDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString()
    };

    const next = addPatch(library, bankId, patch, undefined, { maxPatches });
    await this.saveLibrary(next);

    const created = next.banks.find(b => b.id === bankId)?.patches?.find(p => p.id === patch.id);
    return created || patch;
  }

  async updatePatch(patchId: string, changes: Partial<PatchData>): Promise<void> {
    const library = await this.loadLibrary();
    if (!library) throw new Error('Library not loaded');

    let bankId = '';
    let patchIndex = -1;
    for (const bank of library.banks) {
      const idx = bank.patches?.findIndex(p => p.id === patchId) ?? -1;
      if (idx >= 0) { bankId = bank.id; patchIndex = idx; break; }
    }
    if (!bankId) throw new Error(`ERR_PATCH_NOT_FOUND: Patch '${patchId}' not found`);

    const bank = library.banks.find(b => b.id === bankId)!;
    assertBankEditable(bank);

    // Separate metadata (core handles) from identity/content fields
    const { id, index, bankId: _b, rawData, ...metadata } = changes;
    let next = updatePatchMetadata(library, bankId, patchIndex, metadata);

    // Handle rawData/content updates separately (core ignores them)
    if ('rawData' in changes) {
      next = {
        ...next,
        banks: next.banks.map(b =>
          b.id === bankId
            ? { ...b, patches: b.patches.map(p => p.id === patchId ? { ...p, rawData: changes.rawData!, modifiedDate: new Date().toISOString() } : p) }
            : b
        )
      };
    }

    await this.saveLibrary(next);
  }

  async deletePatch(patchId: string): Promise<void> {
    const library = await this.loadLibrary();
    if (!library) return;

    let bankId = '';
    let patchIndex = -1;
    for (const bank of library.banks) {
      const idx = bank.patches?.findIndex(p => p.id === patchId) ?? -1;
      if (idx >= 0) { bankId = bank.id; patchIndex = idx; break; }
    }
    if (!bankId) return;

    const bank = library.banks.find(b => b.id === bankId)!;
    assertBankEditable(bank);

    const next = removePatch(library, bankId, patchIndex);
    await this.saveLibrary(next);

    // Clean M:N tags
    await this.patchTags.where('patchId').equals(patchId).delete();
  }

  async movePatch(patchId: string, newBankId: string, newIndex: number): Promise<void> {
    const library = await this.loadLibrary();
    if (!library) throw new Error('Library not loaded');

    let sourceBankId = '';
    let sourceIndex = -1;
    for (const bank of library.banks) {
      const idx = bank.patches?.findIndex(p => p.id === patchId) ?? -1;
      if (idx >= 0) { sourceBankId = bank.id; sourceIndex = idx; break; }
    }
    if (!sourceBankId) throw new Error(`ERR_PATCH_NOT_FOUND: Patch '${patchId}' not found`);

    const sourceBank = library.banks.find(b => b.id === sourceBankId)!;
    const targetBank = library.banks.find(b => b.id === newBankId)!;
    assertBankEditable(sourceBank);
    assertBankEditable(targetBank);

    if (sourceBankId === newBankId) {
      const next = movePatch(library, sourceBankId, sourceIndex, newIndex);
      await this.saveLibrary(next);
      return;
    }

    // Cross-bank: delegate to core
    const next = movePatchBetweenBanks(library, sourceBankId, sourceIndex, newBankId, newIndex);
    await this.saveLibrary(next);
  }

  async deleteBank(bankId: string): Promise<void> {
    const library = await this.loadLibrary();
    if (!library) return;
    const next = removeBank(library, bankId);
    await this.saveLibrary(next);
  }

  // ─── Import / Export / Backup ───

  async importFile(data: Uint8Array, filename: string, adapters: ImportAdapter[]): Promise<ImportResult> {
    const adapter = adapters.find(candidate => candidate.canParse(data, filename));
    if (!adapter) return this.failedImport('No adapter found for file');
    if (adapter.verifyChecksum && !adapter.verifyChecksum(data)) return this.failedImport('Checksum verification failed');
    const result = adapter.parse(data, filename);
    if (!result.success) return result;

    const library = await this.loadLibrary() || { version: 1, activeBankId: null, activePresetIndex: 0, banks: [] };
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

      for (let patchIndex = 0; patchIndex < (bank.patches?.length || 0); patchIndex++) {
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

      await this.transaction('rw', this.banks, this.patches, async () => {
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
}

export const persistenceEngine = new UnifiedDexiePersistence();
export { UnifiedDexiePersistence };
export { UnifiedDexiePersistence as DexiePersistence };