/**
 * ABD Bank Manager — Import Engine
 * Reads .abdbank (ZIP), .abdlibrary (ZIP multi-banco), .json, .syx files
 * and returns structured bank/patch data
 * Uses SysExParser for intelligent .syx identification
 */

import JSZip from 'jszip';
import { getContractForSysex, identifyManufacturer, splitSysExMessages } from './sysexParser.js';
import { getModelContract, getHardwareIds } from '../contracts/modelContracts.js';
import { generatePatchName } from './patchNaming.js';
import { calculateFingerprint } from './fingerprint.js';

const MAX_ZIP_SIZE = 50 * 1024 * 1024;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_PATCH_SIZE = 1 * 1024 * 1024;
const MAX_IMAGE_SIZE = 1 * 1024 * 1024;
const MAX_PATCHES_PER_BANK = 128;
const MAX_BANKS_PER_LIBRARY = 64;
const MAX_SYSEX_SIZE = 1 * 1024 * 1024;

function getFileSize(file) {
  return typeof file?.size === 'number' ? file.size : null;
}

function isSafePath(targetPath) {
  if (typeof targetPath !== 'string' || targetPath.length === 0) return false;
  const normalized = targetPath.replace(/\\/g, '/');
  return !normalized.startsWith('/')
    && !/^[A-Za-z]:\//.test(normalized)
    && !normalized.split('/').includes('..');
}

function sanitizeString(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return [...value].filter(character => {
    const code = character.charCodeAt(0);
    return code > 0x1f && code !== 0x7f;
  }).join('').trim();
}

/**
 * Import a file — detects format by extension and content
 */
export async function importFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (getFileSize(file) !== null && getFileSize(file) > MAX_FILE_SIZE && ext !== 'abdbank' && ext !== 'abdlibrary') {
    return { success: false, error: `File too large: máximo ${MAX_FILE_SIZE / 1024 / 1024} MB` };
  }

  switch (ext) {
    case 'abdbank':
      return await importAbdbank(file);
    case 'abdlibrary':
      return await importLibrary(file);
    case 'json':
      return await importJson(file);
    case 'syx':
      return await importSyx(file);
    default:
      return { success: false, error: `Formato no soportado: .${ext}` };
  }
}

/**
 * Lee un ZIP .abdlibrary/.abdbank y parsea el manifest. Devuelve el manifest
 * ya validado (format abdlibrary o abdbank) o un error { success: false }.
 */
async function readAbdzip(file, expectedFormats) {
  const data = await file.arrayBuffer();
  if (data.byteLength > MAX_ZIP_SIZE) {
    return { error: `File too large: máximo ${MAX_ZIP_SIZE / 1024 / 1024} MB` };
  }

  const zip = await JSZip.loadAsync(data);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    return { error: 'Invalid file: falta manifest.json' };
  }

  const manifestText = await manifestFile.async('string');
  const manifest = JSON.parse(manifestText);

  if (!Number.isInteger(manifest.version) || !expectedFormats.includes(manifest.format)) {
    return { error: 'manifest.json tiene formato incorrecto' };
  }

  if (manifest.format === 'abdbank' && manifest.version !== 2 && manifest.version !== 3) {
    return { error: '.abdbank version not supported' };
  }
  if (manifest.format === 'abdlibrary' && manifest.version !== 1) {
    return { error: '.abdlibrary version not supported' };
  }

  return { zip, manifest };
}

/**
 * Convierte una entrada { bank, patches } del manifest en { bank, patches }
 * con los blobs leídos del ZIP y los UUIDs regenerados.
 */
async function parseBankEntry(zip, entry, sourceName) {
  const mb = entry.bank || {};
  // MF.5: Restore bank image from ZIP if present
  let imageUrl = null;
  if (mb.imageUrl && isSafePath(mb.imageUrl) && zip.file(mb.imageUrl)) {
    const imgFile = zip.file(mb.imageUrl);
    const imgBuffer = await imgFile.async('arraybuffer');
    if (imgBuffer.byteLength <= MAX_IMAGE_SIZE) {
      const extension = mb.imageUrl.split('.').pop().toLowerCase();
      const mime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg'
        : extension === 'png' ? 'image/png' : 'image/webp';
      const bytes = new Uint8Array(imgBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      imageUrl = `data:${mime};base64,${base64}`;
    }
  }

  const modelId = sanitizeString(mb.modelId);
  const bank = {
    id: mb.id || crypto.randomUUID(),
    name: sanitizeString(mb.name, 'Untitled'),
    modelId,
    hardwareIds: Array.isArray(mb.hardwareIds) ? mb.hardwareIds : (modelId ? getHardwareIds(modelId) : []),
    manufacturer: sanitizeString(mb.manufacturer, 'Unknown'),
    isFactory: mb.isFactory || false,
    isLocked: mb.isLocked || false,
    includeInBundle: mb.includeInBundle ?? mb.isFactory ?? false,
    source: sanitizeString(mb.source, sourceName),
    imageUrl,
    // MF.7: Restore metadata
    description: sanitizeString(mb.description),
    bankAuthor: sanitizeString(mb.bankAuthor),
    license: sanitizeString(mb.license),
    tags: Array.isArray(mb.tags) ? mb.tags.map(tag => sanitizeString(tag)).filter(Boolean) : [],
    bankNotes: sanitizeString(mb.bankNotes),
    firmwareCompat: sanitizeString(mb.firmwareCompat),
    knownIssues: sanitizeString(mb.knownIssues),
    creationDate: mb.creationDate || new Date().toISOString()
  };

  const patchEntries = Array.isArray(entry.patches) ? entry.patches : [];
  const patches = [];
  for (const patchEntry of patchEntries.slice(0, MAX_PATCHES_PER_BANK)) {
    if (!isSafePath(patchEntry.rawDataFile)) {
      console.warn(`[Import] Unsafe patch path rejected: ${patchEntry.rawDataFile}`);
      continue;
    }

    const rawDataFile = zip.file(patchEntry.rawDataFile);
    if (!rawDataFile) {
      console.warn(`[Import] Patch blob missing: ${patchEntry.rawDataFile}`);
      continue;
    }
    const rawDataBuffer = await rawDataFile.async('arraybuffer');
    if (rawDataBuffer.byteLength > MAX_PATCH_SIZE) {
      console.warn(`[Import] Patch blob too large: ${patchEntry.rawDataFile}`);
      continue;
    }
    const rawData = new Uint8Array(rawDataBuffer);
    const contract = getModelContract(bank.modelId);

    patches.push({
      id: crypto.randomUUID(),
      index: patchEntry.index,
      name: sanitizeString(patchEntry.name) || generatePatchName(contract, patchEntry.index),
      category: sanitizeString(patchEntry.category, 'Other'),
      author: sanitizeString(patchEntry.author),
      tags: Array.isArray(patchEntry.tags) ? patchEntry.tags.map(tag => sanitizeString(tag)).filter(Boolean) : [],
      notes: sanitizeString(patchEntry.notes),
      rawData,
      hardwareIds: Array.isArray(patchEntry.hardwareIds) ? patchEntry.hardwareIds : bank.hardwareIds,
      parameters: patchEntry.parameters || {},
      fingerprint: patchEntry.fingerprint || await calculateFingerprint(rawData, contract),
      isFavorite: patchEntry.isFavorite || false,
      rating: patchEntry.rating || 0,
      versionNumber: patchEntry.versionNumber || 1
    });
  }

  return { bank, patches };
}

/**
 * Import .abdbank (ZIP with manifest.json + patch blobs) — UN banco.
 *
 * Retiene la retrocompatibilidad con el manifest multi-banco v3 que generaba
 * `exportLibraryToFile` antes de existir `.abdlibrary`: si llega un `.abdbank`
 * con `manifest.banks`, se importa como librería ({ banks: [...] }).
 */
async function importAbdbank(file) {
  try {
    const { zip, manifest } = await readAbdzip(file, ['abdbank']);
    if (!zip) return { success: false, error: manifest };

    // Multi-banco v3 (retrocompat — el formato de librería ahora es .abdlibrary)
    if (Array.isArray(manifest.banks) && manifest.banks.length > 0) {
      if (manifest.banks.length > MAX_BANKS_PER_LIBRARY) {
        return { success: false, error: `Too many banks: máximo ${MAX_BANKS_PER_LIBRARY}` };
      }
      const banks = [];
      let patchCount = 0;
      for (const entry of manifest.banks) {
        const parsed = await parseBankEntry(zip, entry, file.name);
        banks.push(parsed);
        patchCount += parsed.patches.length;
      }
      return { success: true, banks, patchCount, warnings: [] };
    }

    // Monobanco (v1/v2)
    const { bank, patches } = await parseBankEntry(zip, { bank: manifest.bank, patches: manifest.patches }, file.name);
    return { success: true, bank, patches, warnings: [] };
  } catch (e) {
    return { success: false, error: `Error reading .abdbank: ${e.message}` };
  }
}

/**
 * Import .abdlibrary (ZIP multi-banco con manifest format "abdlibrary").
 * Devuelve `{ success: true, banks: [{ bank, patches }], patchCount, warnings }`.
 */
async function importLibrary(file) {
  try {
    const { zip, manifest } = await readAbdzip(file, ['abdlibrary']);
    if (!zip) return { success: false, error: manifest };

    if (!Array.isArray(manifest.banks) || manifest.banks.length > MAX_BANKS_PER_LIBRARY) {
      return { success: false, error: `Invalid bank count: máximo ${MAX_BANKS_PER_LIBRARY}` };
    }

    const banks = [];
    let patchCount = 0;
    for (const entry of manifest.banks || []) {
      const parsed = await parseBankEntry(zip, entry, file.name);
      banks.push(parsed);
      patchCount += parsed.patches.length;
    }

    return { success: true, banks, patchCount, warnings: [] };
  } catch (e) {
    return { success: false, error: `Error reading .abdlibrary: ${e.message}` };
  }
}

/**
 * Import .json (direct bank/patches array)
 */
async function importJson(file) {
  try {
    const fileSize = getFileSize(file);
    if (fileSize !== null && fileSize > MAX_FILE_SIZE) {
      return { success: false, error: `File too large: máximo ${MAX_FILE_SIZE / 1024 / 1024} MB` };
    }
    const text = await file.text();
    const data = JSON.parse(text);

    const modelId = data.modelId || data.bank?.modelId || 'unknown';
    const bank = {
      id: data.id || data.bank?.id || crypto.randomUUID(),
      name: sanitizeString(data.name || data.bank?.name || file.name.replace('.json', ''), 'Untitled'),
      modelId,
      hardwareIds: data.hardwareIds || data.bank?.hardwareIds || (modelId !== 'unknown' ? getHardwareIds(modelId) : []),
      manufacturer: data.manufacturer || data.bank?.manufacturer || 'Unknown',
      isFactory: false,
      source: file.name,
      creationDate: new Date().toISOString()
    };

    const rawPatches = data.patches || data;
    if (!Array.isArray(rawPatches)) {
      return { success: false, error: 'JSON no contiene array de patches' };
    }
    if (rawPatches.length > MAX_PATCHES_PER_BANK) {
      return { success: false, error: `Too many patches: máximo ${MAX_PATCHES_PER_BANK}` };
    }

    const contract = getModelContract(modelId);
    const patches = await Promise.all(rawPatches.map(async (p, i) => {
      const rawData = p.rawData ? new Uint8Array(p.rawData) : new Uint8Array(0);
      if (rawData.byteLength > MAX_PATCH_SIZE) throw new Error(`Patch too large at index ${i}`);
      return {
        id: crypto.randomUUID(),
        index: p.index ?? i,
        name: sanitizeString(p.name) || generatePatchName(contract, p.index ?? i),
        category: sanitizeString(p.category, 'Other'),
        author: sanitizeString(p.author),
        tags: Array.isArray(p.tags) ? p.tags.map(tag => sanitizeString(tag)).filter(Boolean) : [],
        notes: sanitizeString(p.notes),
        rawData,
        hardwareIds: p.hardwareIds || bank.hardwareIds,
        parameters: p.parameters || {},
        fingerprint: p.fingerprint || await calculateFingerprint(rawData, contract),
        isFavorite: p.isFavorite || false,
        rating: p.rating || 0,
        versionNumber: p.versionNumber || 1
      };
    }));

    return { success: true, bank, patches, warnings: [] };
  } catch (e) {
    return { success: false, error: `Error reading JSON: ${e.message}` };
  }
}

/**
 * Import .syx — contract-driven parsing.
 * Each SysEx message is matched to a ModelContract via getContractForSysex(),
 * then parsed with contract.parsePatchSysEx() for reliable data extraction.
 */
async function importSyx(file) {
  try {
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength > MAX_FILE_SIZE) {
      return { success: false, error: `File too large: máximo ${MAX_FILE_SIZE / 1024 / 1024} MB` };
    }
    const raw = new Uint8Array(buffer);

    const messages = splitSysExMessages(raw);
    if (messages.length === 0) {
      return { success: false, error: 'No valid SysEx messages found (F0...F7)' };
    }

    // Parse each message using contracts
    const parsed = [];
    const warnings = [];
    const modelCounts = new Map();

    for (const msg of messages) {
      if (msg.byteLength > MAX_SYSEX_SIZE) {
        warnings.push(`Mensaje SysEx demasiado grande (${msg.length} bytes), ignorado`);
        continue;
      }
      const result = getContractForSysex(msg);
      if (!result) {
        warnings.push(`SysEx message with no known contract (${msg.length} bytes, manufacturer 0x${msg[1]?.toString(16)})`);
        continue;
      }

      const { contract, confidence } = result;

      // Try single voice first, then bulk dump (e.g. DX7 32-voice bulk)
      const singleResult = contract.parsePatchSysEx?.(msg);
      if (singleResult) {
        const rawData = singleResult.rawData;
        const patchName = contract.extractPatchName?.(rawData) || null;
        modelCounts.set(contract.modelId, (modelCounts.get(contract.modelId) || 0) + 1);
        parsed.push({ contract, rawData, patchName, confidence, manufacturer: contract.manufacturer, modelId: contract.modelId });
      } else {
        const bulkResults = contract.parseDumpResponse?.(msg) || [];
        for (const br of bulkResults) {
          const patchName = contract.extractPatchName?.(br.rawData) || null;
          modelCounts.set(contract.modelId, (modelCounts.get(contract.modelId) || 0) + 1);
          parsed.push({ contract, rawData: br.rawData, patchName, confidence, manufacturer: contract.manufacturer, modelId: contract.modelId, slot: br.slot });
        }
      }
    }

    if (parsed.length === 0) {
      return { success: false, error: 'No valid patches found in SysEx file' };
    }

    // Determine primary model (most frequent)
    let primaryModel = null;
    let maxCount = 0;
    for (const [modelId, count] of modelCounts) {
      if (count > maxCount) { maxCount = count; primaryModel = modelId; }
    }
    const primaryContract = primaryModel ? getModelContract(primaryModel) : null;

    const bank = {
      id: crypto.randomUUID(),
      name: primaryContract?.displayName || file.name.replace('.syx', ''),
      modelId: primaryModel || 'unknown',
      hardwareIds: primaryModel ? getHardwareIds(primaryModel) : [],
      manufacturer: primaryContract?.manufacturer || identifyManufacturer(raw)?.manufacturer || 'Unknown',
      isFactory: false,
      source: file.name,
      creationDate: new Date().toISOString()
    };

    const patches = [];
    let unnamedCount = 0;

    for (const [idx, entry] of parsed.entries()) {
      const name = entry.patchName || generatePatchName(entry.contract, idx);
      if (!entry.patchName) unnamedCount++;

      patches.push({
        id: crypto.randomUUID(),
        index: idx,
        name,
        category: 'Other',
        rawData: entry.rawData || new Uint8Array(0),
        hardwareIds: getHardwareIds(entry.modelId),
        parameters: {},
        fingerprint: await calculateFingerprint(entry.rawData || new Uint8Array(0), entry.contract),
        isFavorite: false,
        versionNumber: 1,
        _sysexInfo: {
          manufacturer: entry.manufacturer,
          modelId: entry.modelId,
          model: entry.contract.displayName,
          confidence: entry.confidence
        }
      });
    }

    if (unnamedCount > 0) {
      warnings.push(
        `${unnamedCount} patch(es) unnamed — a placeholder was generated. Edit them manually in the patch panel.`
      );
    }

    if (modelCounts.size > 1) {
      const modelList = [...modelCounts.entries()].map(([m, c]) => `${m} (${c})`).join(', ');
      warnings.push(`Multiple models detected: ${modelList}. All imported under the primary model.`);
    }

    return { success: true, bank, patches, warnings };
  } catch (e) {
    return { success: false, error: `Error reading SysEx: ${e.message}` };
  }
}
