/**
 * ABD Bank Manager — SysEx Parser
 * Identifies manufacturer, model, and extracts patches from SysEx dumps.
 * Contract-driven: uses ModelContract.parsePatchSysEx() for data extraction
 * instead of heuristic header offsets.
 */

import { MODEL_CONTRACTS, getModelContract, getContractsForManufacturer } from '../contracts/modelContracts.js';

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
 * Uses manufacturer-specific model ID byte positions:
 * - Korg (0x42): byte[3] = model ID (0x58=MS2000/microKORG, 0x5A=Prophecy)
 * - Yamaha (0x43): byte[3] = device byte (0x00=DX7, 0x01=DX7II)
 * - Casio (0x44): byte[4] = model ID (0x12=CZ101, 0x13=CZ1000, 0x14=CZ5000, 0x15=CZ-1)
 * - Behringer (0x00 0x20 0x32): DM12 byte[4]=0x20; Pro-800 bytes[4..6]=00 01 24
 * - Roland (0x41): no model ID in single format — falls back to canonical contract
 */
function disambiguateByManufacturer(msg, contracts) {
  if (contracts.length === 0) return null;
  if (contracts.length === 1) return contracts[0];

  const mfrId = contracts[0].sysexManufacturerId;
  const mfrByte = mfrId[0];

  // Korg: byte[3] = model ID
  if (mfrByte === 0x42 && msg.length > 3) {
    const modelByte = msg[3];
    // 0x58 = MS2000 + microKORG (identical SysEx), 0x5A = Prophecy
    if (modelByte === 0x5A) {
      const prophecy = contracts.find(c => c.modelId === 'korg-prophecy');
      if (prophecy) return prophecy;
    }
    // 0x58 = MS2000 (canonical for microKORG too)
    if (modelByte === 0x58) {
      return contracts.find(c => c.modelId === 'korg-ms2000') || contracts[0];
    }
  }

  // Yamaha: byte[3] = device byte
  if (mfrByte === 0x43 && msg.length > 3) {
    const deviceByte = msg[3];
    if (deviceByte === 0x01) {
      const dx7ii = contracts.find(c => c.modelId === 'yamaha-dx7ii');
      if (dx7ii) return dx7ii;
    }
    if (deviceByte === 0x00) {
      return contracts.find(c => c.modelId === 'yamaha-dx7') || contracts[0];
    }
  }

  // Casio: byte[4] = model ID
  if (mfrByte === 0x44 && msg.length > 4) {
    const modelByte = msg[4];
    const casioMap = {
      0x12: 'casio-cz101',
      0x13: 'casio-cz1000',
      0x14: 'casio-cz5000',
      0x15: 'casio-cz1'
    };
    const targetId = casioMap[modelByte];
    if (targetId) {
      const match = contracts.find(c => c.modelId === targetId);
      if (match) return match;
    }
  }

  // Behringer: DeepMind 12 → byte[4] = 0x20 (header F0 00 20 32 20 ...)
  //            Pro-800  → bytes[4..6] = 00 01 24 (header F0 00 20 32 00 01 24 00 78 ...)
  if (mfrByte === 0x00 && mfrId.length === 3 && msg.length > 6) {
    if (msg[4] === 0x00 && msg[5] === 0x01 && msg[6] === 0x24) {
      const pro800 = contracts.find(c => c.modelId === 'behringer-pro800');
      if (pro800) return pro800;
    }
    if (msg[4] === 0x20) {
      return contracts.find(c => c.modelId === 'behringer-deepmind12') || contracts[0];
    }
  }

  // Roland: no model ID in single format — return canonical (first)
  return contracts[0];
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
