/**
 * Korg MS2000 / microKORG / Prophecy Adapter
 *
 * SysEx format: F0 42 <30|ch> <modelId> <cmd> <7to8-packed-data...> F7
 * - modelId: 0x58 (MS2000), 0x59 (microKORG), 0x5A (Prophecy)
 * - cmd: 0x10 = single mode dump
 * - Data is 7-to-8 bit packed
 * - Patch data: 288 bytes (MS2000/microKORG), 256 bytes (Prophecy)
 * - Patch name at offset 0x1C, 12 chars ASCII
 * - No checksum (Korg standard: data is7-bit packed, integrity via packing)
 */

import { BaseImportAdapter, ImportResult, PatchData } from '../ImportAdapter';
import { BaseExportAdapter, ExportOptions } from '../ExportAdapter';
import { BaseHardwareLink, HardwareDevice, ImportResult as HLImportResult } from '../HardwareLinkContract';
import { unpack7to8, pack8to7, splitSysexMessages } from './sysexUtils';

// ─── Constants ───

const MANUFACTURER_ID = [0x42];
const MODEL_IDS: Record<string, number> = {
  'korg-ms2000':    0x58,
  'korg-microkorg': 0x59,
  'korg-prophecy':  0x5A,
};

const PATCH_DATA_SIZE: Record<number, number> = {
  0x58: 288,
  0x59: 288,
  0x5A: 256,
};

const CMD_SINGLE_DUMP = 0x10;
const ALL_MODEL_IDS = Object.keys(MODEL_IDS);

// ─── Helpers ───

function extractPatchName(data: Uint8Array): string {
  if (data.length < 40) return '';
  const nameBytes = data.slice(0x1C, 0x1C + 12);
  return new TextDecoder().decode(nameBytes).replace(/\0/g, '').trim();
}

// ─── Import Adapter ───

export class KorgMs2000ImportAdapter extends BaseImportAdapter {
  adapterId = 'sysex-korg-ms2000';
  displayName = 'Korg MS2000 / microKORG / Prophecy';
  supportedExtensions = ['.syx'];
  targetModelIds = ALL_MODEL_IDS;

  canParse(data: Uint8Array, filename: string): boolean {
    if (!filename.toLowerCase().endsWith('.syx')) return false;
    const msgs = splitSysexMessages(data);
    return msgs.some(m => this.isKorgMs2000(m));
  }

  private isKorgMs2000(msg: Uint8Array): boolean {
    return msg.length >= 6
      && msg[0] === 0xF0
      && msg[1] === 0x42
      && (msg[2] & 0xF0) === 0x30  // 30|ch
      && msg[3] in MODEL_IDS
      && msg[4] === CMD_SINGLE_DUMP;
  }

  parse(data: Uint8Array, filename: string): ImportResult {
    const msgs = splitSysexMessages(data).filter(m => this.isKorgMs2000(m));
    if (msgs.length === 0) {
      return this.createResult({
        success: false,
        modelId: 'korg-ms2000',
        error: 'No se encontraron mensajes SysEx Korg MS2000 válidos',
      });
    }

    const modelIdByte = msgs[0][3];
    const modelId = Object.entries(MODEL_IDS).find(([,id]) => id === modelIdByte)?.[0] || 'korg-ms2000';
    const expectedSize = PATCH_DATA_SIZE[modelIdByte] || 288;
    const patches: PatchData[] = [];

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      // Data starts at byte5, ends at F7 (last byte)
      const packedData = msg.slice(5, msg.length - 1);
      const rawData = unpack7to8(packedData);

      if (rawData.length < expectedSize) {
        // Truncate or pad
        const padded = new Uint8Array(expectedSize);
        padded.set(rawData.slice(0, Math.min(rawData.length, expectedSize)));
        patches.push(this.createPatchData({
          name: extractPatchName(padded) || `P${i + 1}`,
          originAddress: `${String.fromCharCode(65 + Math.floor(i / 16))}.${String((i % 16) + 1).padStart(2, '0')}`,
          rawData: padded,
          hardwareIds: [modelId, ...ALL_MODEL_IDS.filter(id => id !== modelId)],
        }));
      } else {
        patches.push(this.createPatchData({
          name: extractPatchName(rawData) || `P${i + 1}`,
          originAddress: `${String.fromCharCode(65 + Math.floor(i / 16))}.${String((i % 16) + 1).padStart(2, '0')}`,
          rawData: new Uint8Array(rawData.slice(0, expectedSize)),
          hardwareIds: [modelId, ...ALL_MODEL_IDS.filter(id => id !== modelId)],
        }));
      }
    }

    return this.createResult({
      modelId,
      bankName: `Korg ${modelId.replace('korg-', '').toUpperCase()}`,
      patches,
    });
  }
}

// ─── Export Adapter ───

export class KorgMs2000ExportAdapter extends BaseExportAdapter {
  adapterId = 'export-korg-ms2000';
  displayName = 'Korg MS2000 / microKORG / Prophecy';
  fileExtension = '.syx';
  targetModelIds = ALL_MODEL_IDS;

  serialize(patches: PatchData[], bankName: string, options?: ExportOptions): Uint8Array {
    const opts = { ...this.getDefaultOptions(), ...options };
    const modelIdByte = MODEL_IDS['korg-ms2000'];
    const parts: number[] = [];

    for (let i = 0; i < patches.length; i++) {
      const p = patches[i];
      const rawData = p.rawData.slice(0, PATCH_DATA_SIZE[modelIdByte] || 288);
      const packed = pack8to7(rawData);
      // Header: F0 42 30|ch modelId 0x10
      const header = [0xF0, 0x42, 0x30 | (opts.midiChannel & 0x0F), modelIdByte, CMD_SINGLE_DUMP];
      parts.push(...header, ...Array.from(packed), 0xF7);
    }

    return new Uint8Array(parts);
  }
}

// ─── Hardware Link ───

export class KorgMs2000HardwareLink extends BaseHardwareLink {
  modelId = 'korg-ms2000';
  supportsEditBuffer = true;
  interMessageDelayMs = 20;
  dumpTimeoutMs = 2000;

  protected getManufacturerId(): number[] { return MANUFACTURER_ID; }
  protected getModelId(): number { return MODEL_IDS[this.modelId] || 0x58; }

  detectHardware(midiOutputs: any[]): HardwareDevice | null {
    for (const output of midiOutputs) {
      const name = output.name || '';
      if (/ms.?2000/i.test(name) || /microkorg/i.test(name) || /prophecy/i.test(name)) {
        return {
          name,
          inputId: output.id || '',
          outputId: output.id || '',
          manufacturer: 'Korg',
          modelId: this.modelId,
        };
      }
    }
    return null;
  }

  buildPatchDump(patch: PatchData, slot: number, channel: number): Uint8Array[] {
    const modelIdByte = this.getModelId();
    const rawData = patch.rawData.slice(0, PATCH_DATA_SIZE[modelIdByte] || 288);
    const packed = pack8to7(rawData);
    const header = this.createSysexHeader(CMD_SINGLE_DUMP, channel);
    return [this.finalizeSysex([...header.slice(1), ...Array.from(packed)])];
  }

  buildBankDump(patches: PatchData[], channel: number): Uint8Array[] {
    return patches.flatMap((p, i) => this.buildPatchDump(p, i, channel));
  }

  buildDumpRequest(slot: number | 'all', channel: number): Uint8Array {
    const modelIdByte = this.getModelId();
    const subId = slot === 'all' ? 0x1F : 0x10;
    return new Uint8Array([0xF0, 0x42, 0x30 | (channel & 0x0F), modelIdByte, 0x10, subId, 0xF7]);
  }

  parseDumpResponse(data: Uint8Array): HLImportResult {
    const adapter = new KorgMs2000ImportAdapter();
    return adapter.parse(data, 'dump.syx');
  }
}
