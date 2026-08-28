/**
 * Casio CZ-101 / CZ-1000 / CZ-5000 / CZ-1 Adapter
 *
 * SysEx format: F0 44 00 00 <modelId> 10 <ch> <nibble-data...> <checksum> F7
 * - modelId: 0x12 (CZ-101), 0x13 (CZ-1000), 0x14 (CZ-5000), 0x15 (CZ-1)
 * - Patch data is nibble-encoded: each byte splits into high/low nibbles
 * - CZ-101/1000: 128-byte data (64 nibble pairs → 128 decoded bytes)
 * - CZ-1: 288 bytes
 * - No patch name in data (addressed by bank+program)
 * - Checksum: sum of all nibble bytes, AND 0x7F
 */

import { BaseImportAdapter, ImportResult, PatchData } from '../ImportAdapter';
import { BaseExportAdapter, ExportOptions } from '../ExportAdapter';
import { BaseHardwareLink, HardwareDevice, ImportResult as HLImportResult } from '../HardwareLinkContract';
import { decodeNibble, encodeNibble, casioChecksum, splitSysexMessages } from './sysexUtils';

// ─── Constants ───

const MANUFACTURER_ID = [0x44, 0x00, 0x00];
const MODEL_IDS: Record<string, number> = {
  'casio-cz101':  0x12,
  'casio-cz1000': 0x13,
  'casio-cz5000': 0x14,
  'casio-cz1':    0x15,
};

const PATCH_DATA_SIZE: Record<number, number> = {
  0x12: 128,
  0x13: 128,
  0x14: 128,
  0x15: 288,
};

const BANK_COUNTS: Record<number, number> = {
  0x12: 1,  // CZ-101: 1 bank × 16
  0x13: 1,  // CZ-1000: 1 bank × 16
  0x14: 2,  // CZ-5000: 2 banks × 16 = 32
  0x15: 4,  // CZ-1: 4 banks × 16 = 64
};

const CMD_DUMP = 0x11;
const ALL_MODEL_IDS = Object.keys(MODEL_IDS);

// ─── Helpers ───

function isCasioCz(msg: Uint8Array): boolean {
  return msg.length >= 9
    && msg[0] === 0xF0
    && msg[1] === 0x44
    && msg[2] === 0x00
    && msg[3] === 0x00
    && msg[4] in MODEL_IDS
    && msg[5] === 0x10; // command
}

// ─── Import Adapter ───

export class CasioCzImportAdapter extends BaseImportAdapter {
  adapterId = 'sysex-casio-cz';
  displayName = 'Casio CZ-101 / CZ-1000 / CZ-5000 / CZ-1';
  supportedExtensions = ['.syx'];
  targetModelIds = ALL_MODEL_IDS;

  canParse(data: Uint8Array, filename: string): boolean {
    if (!filename.toLowerCase().endsWith('.syx')) return false;
    const msgs = splitSysexMessages(data);
    return msgs.some(m => isCasioCz(m));
  }

  verifyChecksum(data: Uint8Array): boolean {
    const msgs = splitSysexMessages(data);
    for (const msg of msgs) {
      if (!isCasioCz(msg)) continue;
      // Checksum covers bytes[6] to [-2] (after channel byte, before checksum)
      const payload = msg.slice(6, msg.length - 2);
      const expected = casioChecksum(payload);
      if (msg[msg.length - 2] !== expected) return false;
    }
    return true;
  }

  parse(data: Uint8Array, filename: string): ImportResult {
    const msgs = splitSysexMessages(data).filter(m => isCasioCz(m));
    if (msgs.length === 0) {
      return this.createResult({
        success: false,
        modelId: 'casio-cz101',
        error: 'No se encontraron mensajes SysEx Casio CZ válidos',
      });
    }

    const modelIdByte = msgs[0][4];
    const modelId = Object.entries(MODEL_IDS).find(([,id]) => id === modelIdByte)?.[0] || 'casio-cz101';
    const expectedSize = PATCH_DATA_SIZE[modelIdByte] || 128;
    const bankCount = BANK_COUNTS[modelIdByte] || 1;
    const patches: PatchData[] = [];

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      // Channel byte at [6], nibble data starts at [7], checksum at [-2]
      const nibbleData = msg.slice(7, msg.length - 2);
      const rawData = decodeNibble(nibbleData);

      if (rawData.length < expectedSize) {
        const padded = new Uint8Array(expectedSize);
        padded.set(rawData.slice(0, Math.min(rawData.length, expectedSize)));
        const bank = Math.floor(i / 16);
        const prog = i % 16;
        patches.push(this.createPatchData({
          name: `${String.fromCharCode(65 + bank)}${prog + 1}`,
          originAddress: `${String.fromCharCode(65 + bank)}${prog + 1}`,
          rawData: padded,
          hardwareIds: [modelId, ...ALL_MODEL_IDS.filter(id => id !== modelId)],
        }));
      } else {
        const bank = Math.floor(i / 16);
        const prog = i % 16;
        patches.push(this.createPatchData({
          name: `${String.fromCharCode(65 + bank)}${prog + 1}`,
          originAddress: `${String.fromCharCode(65 + bank)}${prog + 1}`,
          rawData: new Uint8Array(rawData.slice(0, expectedSize)),
          hardwareIds: [modelId, ...ALL_MODEL_IDS.filter(id => id !== modelId)],
        }));
      }
    }

    return this.createResult({
      modelId,
      bankName: `Casio ${modelId.replace('casio-', '').toUpperCase()}`,
      patches,
    });
  }
}

// ─── Export Adapter ───

export class CasioCzExportAdapter extends BaseExportAdapter {
  adapterId = 'export-casio-cz';
  displayName = 'Casio CZ-101 / CZ-1000 / CZ-5000 / CZ-1';
  fileExtension = '.syx';
  targetModelIds = ALL_MODEL_IDS;

  serialize(patches: PatchData[], bankName: string, options?: ExportOptions): Uint8Array {
    const opts = { ...this.getDefaultOptions(), ...options };
    const modelIdByte = MODEL_IDS['casio-cz101'];
    const patchSize = PATCH_DATA_SIZE[modelIdByte];
    const parts: number[] = [];

    for (let i = 0; i < patches.length; i++) {
      const p = patches[i];
      const rawData = p.rawData.slice(0, patchSize);
      const padded = new Uint8Array(patchSize);
      padded.set(rawData);

      const nibbleData = encodeNibble(padded);
      // Header: F0 44 00 00 modelId 10 ch
      const header = [0xF0, 0x44, 0x00, 0x00, modelIdByte, 0x10, opts.midiChannel & 0x0F];
      const payload = Uint8Array.from(nibbleData);
      const checksum = casioChecksum(payload);

      parts.push(...header, ...Array.from(nibbleData), checksum, 0xF7);
    }

    return new Uint8Array(parts);
  }
}

// ─── Hardware Link ───

export class CasioCzHardwareLink extends BaseHardwareLink {
  modelId = 'casio-cz101';
  supportsEditBuffer = false;
  interMessageDelayMs = 100;
  dumpTimeoutMs = 5000;

  protected getManufacturerId(): number[] { return MANUFACTURER_ID; }
  protected getModelId(): number { return MODEL_IDS[this.modelId] || 0x12; }

  detectHardware(midiOutputs: any[]): HardwareDevice | null {
    for (const output of midiOutputs) {
      const name = output.name || '';
      if (/cz.?101/i.test(name) || /cz.?1000/i.test(name) || /cz.?5000/i.test(name) || /cz.?1[^0]/i.test(name)) {
        return {
          name,
          inputId: output.id || '',
          outputId: output.id || '',
          manufacturer: 'Casio',
          modelId: this.modelId,
        };
      }
    }
    return null;
  }

  buildPatchDump(patch: PatchData, slot: number, channel: number): Uint8Array[] {
    const modelIdByte = this.getModelId();
    const patchSize = PATCH_DATA_SIZE[modelIdByte];
    const rawData = patch.rawData.slice(0, patchSize);
    const padded = new Uint8Array(patchSize);
    padded.set(rawData);

    const nibbleData = encodeNibble(padded);
    const bank = Math.floor(slot / 16);
    const prog = slot % 16;

    // Casio: F0 44 00 00 modelId 10 ch bank prog nibbleData checksum F7
    const header = [0xF0, 0x44, 0x00, 0x00, modelIdByte, 0x11, channel & 0x0F, bank, prog];
    const payload = Uint8Array.from(nibbleData);
    const checksum = casioChecksum(payload);

    return [this.finalizeSysex([...header, ...Array.from(nibbleData), checksum])];
  }

  buildBankDump(patches: PatchData[], channel: number): Uint8Array[] {
    return patches.flatMap((p, i) => this.buildPatchDump(p, i, channel));
  }

  buildDumpRequest(slot: number | 'all', channel: number): Uint8Array {
    const modelIdByte = this.getModelId();
    if (slot === 'all') {
      return new Uint8Array([0xF0, 0x44, 0x00, 0x00, modelIdByte, 0x10, channel & 0x0F, 0xF7]);
    }
    const bank = Math.floor(slot / 16);
    const prog = slot % 16;
    return new Uint8Array([0xF0, 0x44, 0x00, 0x00, modelIdByte, 0x10, channel & 0x0F, bank, prog, 0xF7]);
  }

  parseDumpResponse(data: Uint8Array): HLImportResult {
    const adapter = new CasioCzImportAdapter();
    return adapter.parse(data, 'dump.syx');
  }
}
