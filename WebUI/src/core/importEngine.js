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

/**
 * Import a file — detects format by extension and content
 */
export async function importFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

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
  const zip = await JSZip.loadAsync(data);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    return { error: 'Archivo inválido: falta manifest.json' };
  }

  const manifestText = await manifestFile.async('string');
  const manifest = JSON.parse(manifestText);

  if (!manifest.version || !expectedFormats.includes(manifest.format)) {
    return { error: 'manifest.json tiene formato incorrecto' };
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
  if (mb.imageUrl && zip.file(mb.imageUrl)) {
    const imgFile = zip.file(mb.imageUrl);
    const imgBuffer = await imgFile.async('arraybuffer');
    const bytes = new Uint8Array(imgBuffer);
    // Convert binary back to data URL (assume webp from export)
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    imageUrl = `data:image/webp;base64,${base64}`;
  }

  const bank = {
    id: mb.id || crypto.randomUUID(),
    name: mb.name || 'Sin nombre',
    modelId: mb.modelId,
    hardwareIds: mb.hardwareIds || (mb.modelId ? getHardwareIds(mb.modelId) : []),
    manufacturer: mb.manufacturer,
    isFactory: mb.isFactory || false,
    isLocked: mb.isLocked || false,
    source: mb.source || sourceName,
    imageUrl,
    // MF.7: Restore metadata
    description: mb.description || '',
    bankAuthor: mb.bankAuthor || '',
    license: mb.license || '',
    tags: mb.tags || [],
    bankNotes: mb.bankNotes || '',
    firmwareCompat: mb.firmwareCompat || '',
    knownIssues: mb.knownIssues || '',
    creationDate: mb.creationDate || new Date().toISOString()
  };

  const patches = [];
  for (const patchEntry of entry.patches || []) {
    const rawDataFile = zip.file(patchEntry.rawDataFile);
    if (!rawDataFile) {
      console.warn(`[Import] Patch blob missing: ${patchEntry.rawDataFile}`);
      continue;
    }
    const rawDataBuffer = await rawDataFile.async('arraybuffer');
    const rawData = new Uint8Array(rawDataBuffer);

    patches.push({
      id: crypto.randomUUID(),
      index: patchEntry.index,
      name: patchEntry.name || generatePatchName(getModelContract(bank.modelId), patchEntry.index),
      category: patchEntry.category || 'Other',
      author: patchEntry.author || '',
      tags: patchEntry.tags || [],
      notes: patchEntry.notes || '',
      rawData,
      hardwareIds: patchEntry.hardwareIds || bank.hardwareIds,
      parameters: patchEntry.parameters || {},
      fingerprint: patchEntry.fingerprint || await calculateFingerprint(rawData, getModelContract(bank.modelId)),
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
      const banks = [];
      let patchCount = 0;
      for (const entry of manifest.banks) {
        const { bank, patches } = await parseBankEntry(zip, entry, file.name);
        banks.push({ bank, patches });
        patchCount += patches.length;
      }
      return { success: true, banks, patchCount, warnings: [] };
    }

    // Monobanco (v1/v2)
    const { bank, patches } = await parseBankEntry(zip, { bank: manifest.bank, patches: manifest.patches }, file.name);
    return { success: true, bank, patches, warnings: [] };
  } catch (e) {
    return { success: false, error: `Error leyendo .abdbank: ${e.message}` };
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

    const banks = [];
    let patchCount = 0;
    for (const entry of manifest.banks || []) {
      const { bank, patches } = await parseBankEntry(zip, entry, file.name);
      banks.push({ bank, patches });
      patchCount += patches.length;
    }

    return { success: true, banks, patchCount, warnings: [] };
  } catch (e) {
    return { success: false, error: `Error leyendo .abdlibrary: ${e.message}` };
  }
}

/**
 * Import .json (direct bank/patches array)
 */
async function importJson(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    const modelId = data.modelId || data.bank?.modelId || 'unknown';
    const bank = {
      id: data.id || data.bank?.id || crypto.randomUUID(),
      name: data.name || data.bank?.name || file.name.replace('.json', ''),
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

    const patches = await Promise.all(rawPatches.map(async (p, i) => {
      const rawData = p.rawData ? new Uint8Array(p.rawData) : new Uint8Array(0);
      return {
        id: crypto.randomUUID(),
        index: p.index ?? i,
        // Nombre del archivo si lo trae; si no, generado según el contrato
        name: p.name || generatePatchName(getModelContract(modelId), p.index ?? i),
        category: p.category || 'Other',
        author: p.author || '',
        tags: p.tags || [],
        notes: p.notes || '',
        rawData,
        hardwareIds: p.hardwareIds || bank.hardwareIds,
        parameters: p.parameters || {},
        fingerprint: p.fingerprint || await calculateFingerprint(rawData, getModelContract(modelId)),
        isFavorite: p.isFavorite || false,
        rating: p.rating || 0,
        versionNumber: p.versionNumber || 1
      };
    }));

    return { success: true, bank, patches, warnings: [] };
  } catch (e) {
    return { success: false, error: `Error leyendo JSON: ${e.message}` };
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
    const raw = new Uint8Array(buffer);

    const messages = splitSysExMessages(raw);
    if (messages.length === 0) {
      return { success: false, error: 'No se encontraron mensajes SysEx válidos (F0...F7)' };
    }

    // Parse each message using contracts
    const parsed = [];
    const warnings = [];
    const modelCounts = new Map();

    for (const msg of messages) {
      const result = getContractForSysex(msg);
      if (!result) {
        warnings.push(`Mensaje SysEx sin contrato conocido (${msg.length} bytes, manufacturer 0x${msg[1]?.toString(16)})`);
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
      return { success: false, error: 'No se encontraron patches válidos en el archivo SysEx' };
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
        `${unnamedCount} patch(es) sin nombre — se generó un placeholder. Edítalos a mano en el panel del patch.`
      );
    }

    if (modelCounts.size > 1) {
      const modelList = [...modelCounts.entries()].map(([m, c]) => `${m} (${c})`).join(', ');
      warnings.push(`Múltiples modelos detectados: ${modelList}. Todos se importaron bajo el modelo principal.`);
    }

    return { success: true, bank, patches, warnings };
  } catch (e) {
    return { success: false, error: `Error leyendo SysEx: ${e.message}` };
  }
}
