/**
 * Yamaha DX7 / DX7II ModelContract
 * Covers: DX7, DX7II (VCED single voice, VMEM 32-voice bulk)
 *
 * SysEx formats (standard DX7):
 *   Single voice:  F0 43 10|ch 00 09 20 00 [128B VCED] sum&0x7F F7
 *   Bulk 32 voice: F0 43 10|ch 00 09 20 01 [32×128B VCED] sum&0x7F F7
 *   Dump request:  F0 43 10|ch 00 09 20 00 F7
 *
 * Checksum: sum of all payload bytes (after F0 43 10|ch, before checksum), (128 - sum%128) & 0x7F
 */

import { ModelContract, validateModelContract } from '../ModelContract';

const DX7_PATCH_DATA_SIZE = 128;
const DX7_PATCH_NAME_MAX_LENGTH = 10;
const DX7II_PATCH_DATA_SIZE = 155;
const DX7II_PATCH_NAME_MAX_LENGTH = 10;

const CATEGORIES = ['Bass', 'Lead', 'Pad', 'FX', 'Keys', 'Perc', 'Synth', 'Other'];
const DEFAULT_CATEGORY = 'Other';
const SYSEX_MANUFACTURER_ID = [0x43];
const FORMAT_VERSION = 1;

const CMD_BULK     = 0x09;
const SUB_SINGLE   = 0x20;
const SUB_BULK     = 0x20;

function dx7Checksum(bytes: Uint8Array): number {
  let sum = 0;
  for (const b of bytes) sum += b;
  return (128 - (sum % 128)) & 0x7F;
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

function isDx7Voice(msg: Uint8Array, modelByte: number): boolean {
  return msg.length === 7 + DX7_PATCH_DATA_SIZE + 2
    && msg[0] === 0xF0 && msg[1] === 0x43
    && msg[3] === modelByte
    && msg[4] === CMD_BULK && msg[5] === SUB_SINGLE && msg[6] === 0x00
    && msg[msg.length - 1] === 0xF7;
}

function isDx7Bulk(msg: Uint8Array, modelByte: number): boolean {
  return msg.length === 7 + 32 * DX7_PATCH_DATA_SIZE + 2
    && msg[0] === 0xF0 && msg[1] === 0x43
    && msg[3] === modelByte
    && msg[4] === CMD_BULK && msg[5] === SUB_SINGLE && msg[6] === 0x01
    && msg[msg.length - 1] === 0xF7;
}

function getDx7ProgramNumber(index: number): number {
  return (index % 32) + 1;
}

function getDx7iiProgramNumber(index: number): number {
  return (index % 64) + 1;
}

const yamahaDx7Contract: ModelContract = {
  modelId: 'yamaha-dx7',
  displayName: 'Yamaha DX7',
  manufacturer: 'Yamaha',
  icon: 'yamaha-logo.svg',
  thumbnail: 'yamaha-dx7.webp',

  bankCapacity: 32,
  banksCount: 1,
  programsPerBank: 32,

  getProgramAddress(globalIndex: number): string {
    return `V${String(getDx7ProgramNumber(globalIndex)).padStart(2, '0')}`;
  },

  parseProgramAddress(address: string): number | null {
    const match = address.match(/^V(\d{2})$/i);
    if (!match) return null;
    const prog = parseInt(match[1], 10);
    if (prog < 1 || prog > 32) return null;
    return prog - 1;
  },

  patchDataSize: DX7_PATCH_DATA_SIZE,
  patchNameMaxLength: DX7_PATCH_NAME_MAX_LENGTH,
  extractPatchName(data: Uint8Array): string {
    if (data.length < 0x13) return '';
    return new TextDecoder().decode(data.slice(0x09, 0x13)).replace(/\0/g, '').trim();
  },

  categories: CATEGORIES,
  defaultCategory: DEFAULT_CATEGORY,

  compatibleModels: ['yamaha-dx7ii'],

  sysexManufacturerId: SYSEX_MANUFACTURER_ID,
  formatVersion: FORMAT_VERSION,

  midi: { defaultChannel: 1, defaultDeviceId: 0x10 },

  supportsEditBuffer: false,
  interMessageDelayMs: 50,
  dumpTimeoutMs: 5000,

  computeChecksum(data: Uint8Array): number {
    return dx7Checksum(data);
  },

  verifyChecksum(sysex: Uint8Array): boolean {
    if (sysex.length < 8) return false;
    if (sysex[0] !== 0xF0 || sysex[1] !== 0x43) return false;
    if (sysex[sysex.length - 1] !== 0xF7) return false;
    const payload = sysex.slice(3, sysex.length - 2);
    return sysex[sysex.length - 2] === dx7Checksum(payload);
  },

  buildPatchSysEx(rawData: Uint8Array, _slot: number, channel: number): Uint8Array {
    const data = rawData.slice(0, DX7_PATCH_DATA_SIZE);
    const padded = new Uint8Array(DX7_PATCH_DATA_SIZE);
    padded.set(data);
    const header = new Uint8Array([0xF0, 0x43, 0x10 | (channel & 0x0F), 0x00, CMD_BULK, SUB_SINGLE, 0x00]);
    const payload = new Uint8Array(header.length + DX7_PATCH_DATA_SIZE);
    payload.set(header, 0);
    payload.set(padded, header.length);
    const checksum = dx7Checksum(payload.slice(3));
    const result = new Uint8Array(payload.length + 2);
    result.set(payload, 0);
    result[payload.length] = checksum;
    result[payload.length + 1] = 0xF7;
    return result;
  },

  parsePatchSysEx(sysex: Uint8Array): { rawData: Uint8Array; slot: number } | null {
    if (!isDx7Voice(sysex, 0x00)) return null;
    return { rawData: new Uint8Array(sysex.slice(7, 7 + DX7_PATCH_DATA_SIZE)), slot: 0 };
  },

  buildDumpRequest(_slot: number | 'all', channel: number): Uint8Array {
    return new Uint8Array([0xF0, 0x43, 0x10 | (channel & 0x0F), 0x00, CMD_BULK, SUB_SINGLE, 0x00, 0xF7]);
  },

  parseDumpResponse(sysex: Uint8Array): { rawData: Uint8Array; slot: number }[] {
    const msgs = splitSysex(sysex);
    const results: { rawData: Uint8Array; slot: number }[] = [];

    for (const msg of msgs) {
      if (isDx7Voice(msg, 0x00)) {
        results.push({ rawData: new Uint8Array(msg.slice(7, 7 + DX7_PATCH_DATA_SIZE)), slot: results.length });
      } else if (isDx7Bulk(msg, 0x00)) {
        const patchData = msg.slice(7, 7 + 32 * DX7_PATCH_DATA_SIZE);
        for (let i = 0; i < 32; i++) {
          const s = i * DX7_PATCH_DATA_SIZE;
          results.push({ rawData: new Uint8Array(patchData.slice(s, s + DX7_PATCH_DATA_SIZE)), slot: i });
        }
      }
    }
    return results;
  },

  legacySysEx: {
    modelIdByte: 0x00,
    buildDumpRequest: (ch) => new Uint8Array([0xF0, 0x43, 0x10 | (ch & 0x0F), 0x00, CMD_BULK, SUB_SINGLE, 0x00, 0xF7]),
    validateSysEx: (bytes) => bytes.length >= 6 && bytes[0] === 0xF0 && bytes[1] === 0x43 && bytes[3] === 0x00
  }
};

export const yamahaDx7iiContract: ModelContract = {
  ...yamahaDx7Contract,
  modelId: 'yamaha-dx7ii',
  displayName: 'Yamaha DX7II',
  thumbnail: 'yamaha-dx7ii.webp',
  bankCapacity: 64,
  programsPerBank: 64,
  patchDataSize: DX7II_PATCH_DATA_SIZE,
  patchNameMaxLength: DX7II_PATCH_NAME_MAX_LENGTH,

  getProgramAddress(globalIndex: number): string {
    return `V${String(getDx7iiProgramNumber(globalIndex)).padStart(2, '0')}`;
  },

  parseProgramAddress(address: string): number | null {
    const match = address.match(/^V(\d{2})$/i);
    if (!match) return null;
    const prog = parseInt(match[1], 10);
    if (prog < 1 || prog > 64) return null;
    return prog - 1;
  },

  extractPatchName(data: Uint8Array): string {
    if (data.length < 0x13) return '';
    return new TextDecoder().decode(data.slice(0x09, 0x13)).replace(/\0/g, '').trim();
  },

  buildPatchSysEx(rawData: Uint8Array, _slot: number, channel: number): Uint8Array {
    const data = rawData.slice(0, DX7II_PATCH_DATA_SIZE);
    const padded = new Uint8Array(DX7II_PATCH_DATA_SIZE);
    padded.set(data);
    const header = new Uint8Array([0xF0, 0x43, 0x10 | (channel & 0x0F), 0x01, CMD_BULK, SUB_SINGLE, 0x00]);
    const payload = new Uint8Array(header.length + DX7II_PATCH_DATA_SIZE);
    payload.set(header, 0);
    payload.set(padded, header.length);
    const checksum = dx7Checksum(payload.slice(3));
    const result = new Uint8Array(payload.length + 2);
    result.set(payload, 0);
    result[payload.length] = checksum;
    result[payload.length + 1] = 0xF7;
    return result;
  },

  parsePatchSysEx(sysex: Uint8Array): { rawData: Uint8Array; slot: number } | null {
    if (sysex.length !== 7 + DX7II_PATCH_DATA_SIZE + 2) return null;
    if (sysex[0] !== 0xF0 || sysex[1] !== 0x43) return null;
    if (sysex[3] !== 0x01) return null;
    if (sysex[4] !== CMD_BULK || sysex[5] !== SUB_SINGLE || sysex[6] !== 0x00) return null;
    if (sysex[sysex.length - 1] !== 0xF7) return null;
    const payload = sysex.slice(3, sysex.length - 2);
    if (sysex[sysex.length - 2] !== dx7Checksum(payload)) return null;
    return { rawData: new Uint8Array(sysex.slice(7, 7 + DX7II_PATCH_DATA_SIZE)), slot: 0 };
  },

  legacySysEx: {
    modelIdByte: 0x01,
    buildDumpRequest: (ch) => new Uint8Array([0xF0, 0x43, 0x10 | (ch & 0x0F), 0x01, CMD_BULK, SUB_SINGLE, 0x00, 0xF7]),
    validateSysEx: (bytes) => bytes.length >= 6 && bytes[0] === 0xF0 && bytes[1] === 0x43 && bytes[3] === 0x01
  }
};

export const allYamahaContracts = [
  yamahaDx7Contract,
  yamahaDx7iiContract
];

allYamahaContracts.forEach(c => {
  const result = validateModelContract(c);
  if (!result.valid) {
    console.error(`❌ ${c.modelId} validation failed:`, result.errors);
  }
});

export default yamahaDx7Contract;