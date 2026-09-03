/**
 * ABD Bank Manager — SysEx Parser
 * Identifies manufacturer, model, and extracts patches from SysEx dumps.
 * Contract-driven: uses ModelContract.parsePatchSysEx() for data extraction
 * instead of heuristic header offsets.
 */

import { MODEL_CONTRACTS } from '../contracts/modelContracts.js';

// Manufacturer name lookup (for human-readable display only)
const MANUFACTURERS = {
  0x01: 'Dave Smith Instruments',
  0x20: 'Simmons',
  0x21: 'Waldorf',
  0x23: 'Hart Instruments',
  0x24: 'Clavia',
  0x27: 'Skaarhoj',
  0x3E: 'Novation',
  0x40: 'Kawai',
  0x41: 'Roland',
  0x42: 'Korg',
  0x43: 'Yamaha',
  0x44: 'Casio',
  0x45: 'Akai',
  0x47: 'Octave-Plateau',
  0x4E: 'Ensoniq',
  0x50: 'Oberheim',
  0x51: 'Moog',
  0x52: 'Hartung',
  0x54: 'E-mu',
  0x56: 'Viscount',
  0x5E: 'ABS',
  0x60: 'SSI',
  0x67: 'Peak',
  0x7D: 'Universal (MMA)',
  0x7E: 'Non-Realtime',
  0x7F: 'Realtime'
};

/**
 * Match a SysEx message against a contract's sysexManufacturerId.
 * Handles both 1-byte (Roland, Korg, Yamaha, Casio) and 3-byte (Behringer) IDs.
 */
function matchesManufacturer(msg, contract) {
  const mfrId = contract.sysexManufacturerId;
  if (!mfrId || mfrId.length === 0) return false;
  if (msg.length < 1 + mfrId.length) return false;
  for (let i = 0; i < mfrId.length; i++) {
    if (msg[1 + i] !== mfrId[i]) return false;
  }
  return true;
}

/**
 * Try to disambiguate between contracts sharing the same manufacturer byte.
 * Uses each contract's sysexModelId field (offset + expected values) to match.
 * Contract-driven: no hardcoded manufacturer-specific logic.
 */
function disambiguateByManufacturer(msg, contracts) {
  if (contracts.length === 0) return null;
  if (contracts.length === 1) return contracts[0];

  // First pass: find contracts whose sysexModelId matches the message
  for (const contract of contracts) {
    if (!contract.sysexModelId) continue;
    const { offset, values, multiByte } = contract.sysexModelId;
    if (msg.length <= offset) continue;

    if (values.includes(msg[offset])) {
      // Check multi-byte extension if present (e.g. Pro-800: bytes[4]=0x00 + bytes[5..6]=0x01,0x24)
      if (multiByte && msg.length > offset + multiByte.length) {
        let match = true;
        for (let j = 0; j < multiByte.length; j++) {
          if (msg[offset + 1 + j] !== multiByte[j]) { match = false; break; }
        }
        if (match) return contract;
      } else {
        return contract;
      }
    }
  }

  // Second pass: contracts without sysexModelId — return first one without a model ID
  const fallback = contracts.find(c => !c.sysexModelId);
  return fallback || contracts[0];
}

/**
 * Find the best-matching ModelContract for a SysEx message.
 * Returns { contract, confidence: 'high'|'low' } or null.
 *
 * Algorithm:
 * 1. Match sysexManufacturerId (byte-by-byte from msg[1])
 * 2. If multiple contracts match manufacturer, use manufacturer-specific disambiguation
 * 3. For single-match manufacturers, return with 'low' confidence
 */
export function getContractForSysex(msg) {
  if (!msg || msg.length < 3 || msg[0] !== 0xF0) return null;

  const matchedContracts = MODEL_CONTRACTS.filter(c => matchesManufacturer(msg, c));
  if (matchedContracts.length === 0) return null;
  if (matchedContracts.length === 1) return { contract: matchedContracts[0], confidence: 'low' };

  // Multiple contracts share this manufacturer — disambiguate
  const best = disambiguateByManufacturer(msg, matchedContracts);
  if (best) return { contract: best, confidence: 'high' };

  // Fallback: return first match with low confidence
  return { contract: matchedContracts[0], confidence: 'low' };
}

/**
 * Identify manufacturer from SysEx message
 * @param {Uint8Array} bytes - SysEx message (starts with 0xF0)
 * @returns {{ manufacturer: string, manufacturerId: number[] } | null}
 */
export function identifyManufacturer(bytes) {
  if (bytes.length < 3 || bytes[0] !== 0xF0) return null;

  const mfr1 = bytes[1];

  // 3-byte manufacturer IDs (0x00 + 2 more)
  if (mfr1 === 0x00 && bytes.length >= 5) {
    if (bytes[2] === 0x20 && bytes[3] === 0x32) {
      return { manufacturer: 'Behringer', manufacturerId: [0x00, 0x20, 0x32] };
    }
    return { manufacturer: `Unknown (0x${mfr1.toString(16)} 0x${bytes[2].toString(16)} 0x${bytes[3].toString(16)})`, manufacturerId: [mfr1, bytes[2], bytes[3]] };
  }

  // 1-byte manufacturer IDs
  const name = MANUFACTURERS[mfr1] || `Unknown (0x${mfr1.toString(16)})`;
  return { manufacturer: name, manufacturerId: [mfr1] };
}

/**
 * Identify specific model from SysEx message using contract matching
 * @param {Uint8Array} bytes - SysEx message
 * @returns {{ modelId: string, contract: object | null, confidence: 'high'|'low'|'none' } | null}
 */
export function identifyModel(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xF0) return null;

  const result = getContractForSysex(bytes);
  if (!result) return null;

  return {
    modelId: result.contract.modelId,
    contract: result.contract,
    confidence: result.confidence
  };
}

/**
 * Parse a single SysEx message using contract-driven extraction.
 * Falls back to heuristic only for unknown models.
 * @param {Uint8Array} bytes - Single SysEx message (F0 ... F7)
 * @returns {{ valid: boolean, manufacturer: string, modelId: string|null, model: string|null, patchData: Uint8Array|null, patchName: string|null, error: string|null }}
 */
export function parseSysExMessage(bytes) {
  const result = {
    valid: false,
    manufacturer: 'Unknown',
    modelId: null,
    model: null,
    patchData: null,
    patchName: null,
    error: null
  };

  // Validate basic structure
  if (!bytes || bytes.length < 3) {
    result.error = 'SysEx message too short';
    return result;
  }
  if (bytes[0] !== 0xF0) {
    result.error = 'Missing SysEx start byte (0xF0)';
    return result;
  }
  if (bytes[bytes.length - 1] !== 0xF7) {
    result.error = 'Missing SysEx end byte (0xF7)';
    return result;
  }

  // Identify manufacturer
  const mfrInfo = identifyManufacturer(bytes);
  if (mfrInfo) result.manufacturer = mfrInfo.manufacturer;

  // Identify model via contract matching
  const modelInfo = identifyModel(bytes);
  if (modelInfo) {
    result.modelId = modelInfo.modelId;
    result.model = modelInfo.contract?.displayName || modelInfo.modelId;

    // Contract-driven extraction: use parsePatchSysEx if available
    const contract = modelInfo.contract;
    if (contract && typeof contract.parsePatchSysEx === 'function') {
      const parsed = contract.parsePatchSysEx(bytes);
      if (parsed) {
        result.patchData = parsed.rawData;
        result.patchName = contract.extractPatchName?.(parsed.rawData) || null;
        result.valid = true;
      } else {
        // Contract rejected this message — still valid SysEx, just not matching this model's format
        result.valid = true;
      }
    } else if (contract) {
      // Contract exists but no parsePatchSysEx — mark as recognized but unparseable
      result.valid = true;
    }
  } else {
    // Unknown model — still valid SysEx, just unrecognized
    result.valid = true;
  }

  return result;
}

/**
 * Split a raw byte array into individual SysEx messages.
 * Handles interleaved non-SysEx data (MIDI clock, notes, etc.)
 * @param {Uint8Array} raw
 * @returns {Uint8Array[]}
 */
export function splitSysExMessages(raw) {
  const messages = [];
  let inSysEx = false;
  let start = -1;

  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === 0xF0 && !inSysEx) {
      inSysEx = true;
      start = i;
    } else if (raw[i] === 0xF7 && inSysEx) {
      messages.push(raw.slice(start, i + 1));
      inSysEx = false;
      start = -1;
    }
  }

  return messages;
}

/**
 * Parse a full SysEx dump file using contract-driven extraction.
 * Groups messages by model and extracts patch data via contracts.
 * @param {Uint8Array} raw - Raw file bytes
 * @returns {{ messages: object[], identifiedModels: Map<string, number>, totalPatches: number, errors: string[] }}
 */
export function parseSysExDump(raw) {
  const rawMessages = splitSysExMessages(raw);
  const messages = [];
  const identifiedModels = new Map();
  const errors = [];
  let totalPatches = 0;

  for (const msg of rawMessages) {
    const parsed = parseSysExMessage(msg);
    if (parsed.error) {
      errors.push(parsed.error);
      continue;
    }
    messages.push(parsed);
    if (parsed.modelId) {
      identifiedModels.set(parsed.modelId, (identifiedModels.get(parsed.modelId) || 0) + 1);
      totalPatches++;
    }
  }

  return { messages, identifiedModels, totalPatches, errors };
}
