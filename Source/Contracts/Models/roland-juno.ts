/**
 * Roland Juno Series ModelContract
 * Covers: Juno-106, Juno-60, Juno-6, HS-60
 *
 * SysEx formats (ABDJUNiO601 reference):
 *   Single patch:  F0 41 30 ch [18 bytes] F7                    (no checksum)
 *   Bulk dump:     F0 41 30 02 01 [64×18 bytes] [(-sum)&0x7F] F7
 *   Param change:  F0 41 32 ch paramId value F7
 *   Manual mode:   F0 41 31 ch 00 F7
 *
 * 18-byte body: 16 slider params (0-127) + SW1 + SW2
 */

import { ModelContract, validateModelContract } from '../ModelContract';

const BANK_CAPACITY = 128;
const BANKS_COUNT = 2;
const PROGRAMS_PER_BANK = 64;
const PATCH_DATA_SIZE = 18;
const PATCH_NAME_MAX_LENGTH = 0;

const CATEGORIES = ['Bass', 'Lead', 'Pad', 'FX', 'Keys', 'Perc', 'Synth', 'Other'];
const DEFAULT_CATEGORY = 'Other';
const SYSEX_MANUFACTURER_ID = [0x41];
const FORMAT_VERSION = 1;
const DEVICE_ID = 0x18;

const CMD_PATCH_DUMP   = 0x30;
const CMD_BULK_FUNC    = 0x01;

function bulkChecksum(bytes: Uint8Array): number {
  let sum = 0;
  for (const b of bytes) sum += b;
  return (-sum) & 0x7F;
}

function splitSysex(raw: Uint8Array): Uint8Array[] {
  const msgs: Uint8Array[] = [];
  let inSysex = false;
  let start = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === 0xF0 && !inSysex) { inSysex = true; start = i; }
    else if (raw[i] === 0xF7 && inSysex) { msgs.push(raw.slice(start, i + 1)); inSysex = false; }
  }
  return msgs;
}

function isJunoSinglePatch(msg: Uint8Array): boolean {
  return msg.length === 23
    && msg[0] === 0xF0
    && msg[1] === 0x41
    && msg[2] === CMD_PATCH_DUMP
    && msg[22] === 0xF7;
}

function isJunoBulkDump(msg: Uint8Array): boolean {
  if (msg.length < 24 || msg[0] !== 0xF0 || msg[1] !== 0x41) return false;
  if (msg[2] !== CMD_PATCH_DUMP || msg[3] !== 0x02 || msg[4] !== CMD_BULK_FUNC) return false;
  if (msg[msg.length - 1] !== 0xF7) return false;
  const payload = msg.slice(5, msg.length - 2);
  return msg[msg.length - 2] === bulkChecksum(payload);
}

function getBankLetter(index: number): string {
  return index < 64 ? 'A' : 'B';
}

function getProgramNumber(index: number): number {
  return (index % 64) + 1;
}

const rolandJuno106Contract: ModelContract = {
  modelId: 'roland-juno106',
  displayName: 'Roland Juno-106',
  manufacturer: 'Roland',
  icon: 'roland-logo.svg',
  thumbnail: 'roland-juno106.jpg',

  bankCapacity: BANK_CAPACITY,
  banksCount: BANKS_COUNT,
  programsPerBank: PROGRAMS_PER_BANK,

  getProgramAddress(globalIndex: number): string {
    return `${getBankLetter(globalIndex)}${getProgramNumber(globalIndex)}`;
  },

  parseProgramAddress(address: string): number | null {
    const match = address.match(/^([AB])(\d+)$/i);
    if (!match) return null;
    const bank = match[1].toUpperCase();
    const prog = parseInt(match[2], 10);
    if (prog < 1 || prog > 64) return null;
    return (bank === 'A' ? 0 : 1) * 64 + (prog - 1);
  },

  patchDataSize: PATCH_DATA_SIZE,
  patchNameMaxLength: PATCH_NAME_MAX_LENGTH,
  extractPatchName: () => '',

  categories: CATEGORIES,
  defaultCategory: DEFAULT_CATEGORY,

  compatibleModels: ['roland-juno60', 'roland-juno6', 'roland-hs60'],

  sysexManufacturerId: SYSEX_MANUFACTURER_ID,
  formatVersion: FORMAT_VERSION,

  midi: { defaultChannel: 1, defaultDeviceId: DEVICE_ID },

  supportsEditBuffer: false,
  interMessageDelayMs: 50,
  dumpTimeoutMs: 3000,

  computeChecksum(data: Uint8Array): number {
    return bulkChecksum(data);
  },

  verifyChecksum(sysex: Uint8Array): boolean {
    if (sysex.length < 6) return false;
    if (sysex[0] !== 0xF0 || sysex[1] !== 0x41) return false;
    if (sysex[sysex.length - 1] !== 0xF7) return false;
    // Single patch: F0 41 30 ch [18B] F7 — no checksum, just validate format
    if (sysex.length === 23 && sysex[2] === CMD_PATCH_DUMP) return true;
    // Bulk dump: has checksum at second-to-last byte
    if (sysex.length < 24) return false;
    const payload = sysex.slice(5, sysex.length - 2);
    return sysex[sysex.length - 2] === bulkChecksum(payload);
  },

  buildPatchSysEx(rawData: Uint8Array, _slot: number, channel: number): Uint8Array {
    const data = rawData.slice(0, PATCH_DATA_SIZE);
    const padded = new Uint8Array(PATCH_DATA_SIZE);
    padded.set(data);
    return new Uint8Array([0xF0, 0x41, CMD_PATCH_DUMP, channel & 0x0F, ...padded, 0xF7]);
  },

  parsePatchSysEx(sysex: Uint8Array): { rawData: Uint8Array; slot: number } | null {
    if (!isJunoSinglePatch(sysex)) return null;
    return { rawData: new Uint8Array(sysex.slice(4, 4 + PATCH_DATA_SIZE)), slot: 0 };
  },

  buildDumpRequest(_slot: number | 'all', channel: number): Uint8Array {
    return new Uint8Array([0xF0, 0x41, channel & 0x0F, 0x3E, 0x11, 0x00, 0xF7]);
  },

  parseDumpResponse(sysex: Uint8Array): { rawData: Uint8Array; slot: number }[] {
    const msgs = splitSysex(sysex);
    const results: { rawData: Uint8Array; slot: number }[] = [];
    for (const msg of msgs) {
      if (isJunoSinglePatch(msg)) {
        results.push({ rawData: new Uint8Array(msg.slice(4, 4 + PATCH_DATA_SIZE)), slot: results.length });
      } else if (isJunoBulkDump(msg)) {
        const patchData = msg.slice(5, msg.length - 2);
        const count = Math.floor(patchData.length / PATCH_DATA_SIZE);
        for (let i = 0; i < count; i++) {
          const s = i * PATCH_DATA_SIZE;
          results.push({ rawData: new Uint8Array(patchData.slice(s, s + PATCH_DATA_SIZE)), slot: i });
        }
      }
    }
    return results;
  },

  legacySysEx: {
    modelIdByte: 0x3E,
    buildDumpRequest: (ch) => new Uint8Array([0xF0, 0x41, ch & 0x0F, 0x3E, 0x11, 0x00, 0xF7]),
    validateSysEx: (bytes) => bytes.length >= 6 && bytes[0] === 0xF0 && bytes[1] === 0x41 && bytes[2] === 0x30
  }
};

// Juno-60 (identical format, no memory)
export const rolandJuno60Contract: ModelContract = {
  ...rolandJuno106Contract,
  modelId: 'roland-juno60',
  displayName: 'Roland Juno-60',
  thumbnail: 'roland-juno60.webp',
  legacySysEx: {
    ...rolandJuno106Contract.legacySysEx!,
    modelIdByte: 0x3D
  }
};

// Juno-6 (identical format, no memory)
export const rolandJuno6Contract: ModelContract = {
  ...rolandJuno106Contract,
  modelId: 'roland-juno6',
  displayName: 'Roland Juno-6',
  thumbnail: 'roland-juno6.webp',
  legacySysEx: {
    ...rolandJuno106Contract.legacySysEx!,
    modelIdByte: 0x3C
  }
};

// HS-60 (Synth Plus 60, identical to Juno-106)
export const rolandHs60Contract: ModelContract = {
  ...rolandJuno106Contract,
  modelId: 'roland-hs60',
  displayName: 'Roland HS-60',
  thumbnail: 'roland-hs60.webp',
  legacySysEx: {
    ...rolandJuno106Contract.legacySysEx!,
    modelIdByte: 0x3E
  }
};

export const allRolandJunoContracts = [
  rolandJuno106Contract,
  rolandJuno60Contract,
  rolandJuno6Contract,
  rolandHs60Contract
];

allRolandJunoContracts.forEach(c => {
  const result = validateModelContract(c);
  if (!result.valid) {
    console.error(`❌ ${c.modelId} validation failed:`, result.errors);
  }
});

export default rolandJuno106Contract;