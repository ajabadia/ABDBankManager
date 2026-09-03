/**
 * ABD Bank Manager — Export Engine
 * Writes .abdbank (ZIP), .abdlibrary (ZIP multi-banco), .json, .syx files
 */

import JSZip from 'jszip';
import saveAs from 'file-saver';
import { getModelContract, getHardwareIds } from '../contracts/modelContracts.js';

/**
 * Export a bank to a file — auto-detects format by extension
 */
export async function exportToFile(bank, patches, format = 'abdbank') {
  switch (format) {
    case 'abdbank':
      return await exportAbdbank(bank, patches);
    case 'json':
      return await exportJson(bank, patches);
    case 'syx':
      return await exportSyx(bank, patches);
    default:
      return { success: false, error: `Export format not supported: ${format}` };
  }
}

/**
 * Export the whole library (all banks + patches) as an .abdlibrary file.
 *
 * Formato dedicado a la librería completa (manifest `format: "abdlibrary"`):
 * `banks: [{ bank, patches }]` y los blobs en `banks/NN/patch_MMM.bin`
 * (NN = índice del banco dentro de la librería). El import (`importLibrary`)
 * reimporta todos los bancos. El `.abdbank` queda reservado a UN banco.
 */
export async function exportLibraryToFile(banks) {
  try {
    const zip = await buildLibraryZip(banks);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const filename = `abd-library-${new Date().toISOString().slice(0, 10)}.abdlibrary`;
    saveAs(blob, filename);

    return { success: true, filename, size: blob.size, bankCount: banks.length };
  } catch (e) {
    return { success: false, error: `Error exporting library .abdlibrary: ${e.message}` };
  }
}

/**
 * Construye el ZIP .abdlibrary sin descargar — función pura para poder testear
 * el roundtrip export→import en Node (donde saveAs no existe).
 *
 * @param {Array<{ bank: object, patches: Array<object> }>} banks
 * @returns {Promise<JSZip>} ZIP con manifest.json + banks/NN/patch_MMM.bin
 */
export async function buildLibraryZip(banks) {
  const zip = new JSZip();
  const manifestBanks = [];

  for (let bi = 0; bi < banks.length; bi++) {
    const { bank, patches } = banks[bi];
    const prefix = `banks/${String(bi).padStart(3, '0')}`;
    const patchEntries = [];

    for (let i = 0; i < patches.length; i++) {
      const p = patches[i];
      const filename = `${prefix}/patch_${String(i).padStart(3, '0')}.bin`;

      if (p.rawData && p.rawData.length > 0) {
        zip.file(filename, p.rawData);
      }

      patchEntries.push({
        index: p.index ?? i,
        name: p.name,
        address: p.address || `${bi}:${i}`,
        category: p.category || 'Other',
        author: p.author || '',
        tags: p.tags || [],
        notes: p.notes || '',
        isFavorite: p.isFavorite || false,
        rating: p.rating || 0,
        rawDataFile: filename,
        parameters: p.parameters || {},
        fingerprint: p.fingerprint || null,
        versionNumber: p.versionNumber || 1,
        previousVersionId: p.previousVersionId || null
      });
    }

    // MF.5: Export bank image if present, preserving the original MIME type.
    let imageFile = null;
    if (bank.imageUrl) {
      const imageMime = bank.imageUrl.match(/^data:(image\/(?:jpeg|png|webp));/i)?.[1]?.toLowerCase() || 'image/webp';
      const imageExtension = imageMime === 'image/jpeg' ? 'jpg' : imageMime.split('/')[1];
      const imgPath = `${prefix}/image.${imageExtension}`;
      // Data URL → base64 → binary
      const base64 = bank.imageUrl.split(',')[1];
      if (base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
        zip.file(imgPath, bytes);
        imageFile = imgPath;
      }
    }

    manifestBanks.push({
      bank: {
        id: bank.id,
        name: bank.name,
        modelId: bank.modelId,
        // Asociación multi-hardware (canónico + compatibles); se deriva si el banco no la trae
        hardwareIds: bank.hardwareIds?.length ? bank.hardwareIds : (bank.modelId ? getHardwareIds(bank.modelId) : []),
        manufacturer: bank.manufacturer,
        isFactory: bank.isFactory || false,
        isLocked: bank.isLocked || false,
        includeInBundle: bank.includeInBundle ?? bank.isFactory ?? false,
        creationDate: bank.creationDate || new Date().toISOString(),
        modifiedDate: new Date().toISOString(),
        patchCount: patches.length,
        source: bank.source || null,
        // MF.7: Bank metadata
        description: bank.description || '',
        bankAuthor: bank.bankAuthor || '',
        license: bank.license || '',
        tags: bank.tags || [],
        bankNotes: bank.bankNotes || '',
        firmwareCompat: bank.firmwareCompat || '',
        knownIssues: bank.knownIssues || '',
        imageUrl: imageFile || null
      },
      patches: patchEntries
    });
  }

  const manifest = {
    version: 1,
    format: 'abdlibrary',
    // Must stay in sync with FINGERPRINT_VERSION in packages/core/src/operations/fingerprint.js
    fpVersion: 1,
    library: {
      bankCount: banks.length,
      exportedAt: new Date().toISOString()
    },
    banks: manifestBanks
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  return zip;
}

/**
 * Export as .abdbank (ZIP with manifest.json + raw patch blobs)
 */
async function exportAbdbank(bank, patches) {
  try {
    const zip = new JSZip();

    const patchEntries = [];
    for (let i = 0; i < patches.length; i++) {
      const p = patches[i];
      const filename = `patch_${String(i).padStart(3, '0')}.bin`;

      if (p.rawData && p.rawData.length > 0) {
        zip.file(filename, p.rawData);
      }

      patchEntries.push({
        index: p.index ?? i,
        name: p.name,
        address: p.address || `0:${i}`,
        category: p.category || 'Other',
        author: p.author || '',
        tags: p.tags || [],
        notes: p.notes || '',
        isFavorite: p.isFavorite || false,
        rating: p.rating || 0,
        rawDataFile: filename,
        parameters: p.parameters || {},
        fingerprint: p.fingerprint || null,
        versionNumber: p.versionNumber || 1,
        previousVersionId: p.previousVersionId || null
      });
    }

    // MF.5: Export bank image preserving its original format.
    let imageFile = null;
    if (bank.imageUrl) {
      const imageMime = bank.imageUrl.match(/^data:(image\/(?:jpeg|png|webp));/i)?.[1]?.toLowerCase() || 'image/webp';
      const imageExtension = imageMime === 'image/jpeg' ? 'jpg' : imageMime.split('/')[1];
      const base64 = bank.imageUrl.split(',')[1];
      if (base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
        imageFile = `image.${imageExtension}`;
        zip.file(imageFile, bytes);
      }
    }

    const manifest = {
      version: 1,
      format: 'abdbank',
      // Must stay in sync with FINGERPRINT_VERSION in packages/core/src/operations/fingerprint.js
      fpVersion: 1,
      bank: {
        id: bank.id,
        name: bank.name,
        modelId: bank.modelId,
        // Asociación multi-hardware (canónico + compatibles); se deriva si el banco no la trae
        hardwareIds: bank.hardwareIds?.length ? bank.hardwareIds : (bank.modelId ? getHardwareIds(bank.modelId) : []),
        manufacturer: bank.manufacturer,
        isFactory: bank.isFactory || false,
        isLocked: bank.isLocked || false,
        includeInBundle: bank.includeInBundle ?? bank.isFactory ?? false,
        creationDate: bank.creationDate || new Date().toISOString(),
        modifiedDate: new Date().toISOString(),
        patchCount: patches.length,
        source: bank.source || null,
        // MF.7: Bank metadata
        description: bank.description || '',
        bankAuthor: bank.bankAuthor || '',
        license: bank.license || '',
        tags: bank.tags || [],
        bankNotes: bank.bankNotes || '',
        firmwareCompat: bank.firmwareCompat || '',
        knownIssues: bank.knownIssues || '',
        imageUrl: imageFile || null
      },
      patches: patchEntries,
      contract: (() => {
        const modelContract = bank.modelId ? getModelContract(bank.modelId) : null;
        return {
          modelId: bank.modelId,
          patchDataSize: modelContract?.patchDataSize ?? patches[0]?.rawData?.length ?? 0,
          bankCapacity: modelContract?.bankCapacity ?? patches.length,
          banksCount: modelContract?.banksCount ?? 1,
          programsPerBank: modelContract?.programsPerBank ?? patches.length
        };
      })()
    };

    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const filename = `${bank.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.abdbank`;
    saveAs(blob, filename);

    return { success: true, filename, size: blob.size };
  } catch (e) {
    return { success: false, error: `Error exporting .abdbank: ${e.message}` };
  }
}

/**
 * Export as .json
 */
async function exportJson(bank, patches) {
  try {
    const data = {
      bank: {
        id: bank.id,
        name: bank.name,
        modelId: bank.modelId,
        hardwareIds: bank.hardwareIds?.length ? bank.hardwareIds : (bank.modelId ? getHardwareIds(bank.modelId) : []),
        manufacturer: bank.manufacturer,
        creationDate: bank.creationDate || new Date().toISOString()
      },
      patches: patches.map(p => ({
        name: p.name,
        category: p.category,
        author: p.author,
        tags: p.tags,
        notes: p.notes,
        rawData: p.rawData ? Array.from(p.rawData) : [],
        parameters: p.parameters,
        fingerprint: p.fingerprint,
        isFavorite: p.isFavorite,
        rating: p.rating,
        versionNumber: p.versionNumber
      }))
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const filename = `${bank.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    saveAs(blob, filename);

    return { success: true, filename, size: blob.size };
  } catch (e) {
    return { success: false, error: `Error exporting JSON: ${e.message}` };
  }
}

/**
 * Export as .syx — contract-driven SysEx message generation.
 * Each patch's rawData is wrapped in a proper SysEx message using
 * the model's contract.buildPatchSysEx() method.
 */
async function exportSyx(bank, patches) {
  try {
    const contract = bank?.modelId ? getModelContract(bank.modelId) : null;
    const channel = contract?.midi?.defaultChannel ?? 1;
    const sysexParts = [];
    let totalSize = 0;
    let skippedCount = 0;

    for (let i = 0; i < patches.length; i++) {
      const p = patches[i];
      if (!p.rawData || p.rawData.length === 0) {
        skippedCount++;
        continue;
      }

      if (contract && typeof contract.buildPatchSysEx === 'function') {
        // Contract-driven: build proper SysEx message with header/checksum
        const sysexMsg = contract.buildPatchSysEx(p.rawData, i, channel);
        sysexParts.push(sysexMsg);
        totalSize += sysexMsg.length;
      } else {
        // Fallback: rawData is already a SysEx message (legacy format)
        sysexParts.push(p.rawData);
        totalSize += p.rawData.length;
      }
    }

    if (sysexParts.length === 0) {
      return { success: false, error: 'No SysEx data to export' };
    }

    const combined = new Uint8Array(totalSize);
    let offset = 0;
    for (const part of sysexParts) {
      combined.set(part, offset);
      offset += part.length;
    }

    const blob = new Blob([combined], { type: 'application/octet-stream' });
    const filename = `${(bank?.name || 'patches').replace(/[^a-zA-Z0-9_-]/g, '_')}.syx`;

    const warnings = [];
    if (skippedCount > 0) {
      warnings.push(`${skippedCount} patch(es) without rawData — skipped from SysEx export.`);
    }

    saveAs(blob, filename);
    return { success: true, filename, size: blob.size, warnings };
  } catch (e) {
    return { success: false, error: `Error exporting SysEx: ${e.message}` };
  }
}
