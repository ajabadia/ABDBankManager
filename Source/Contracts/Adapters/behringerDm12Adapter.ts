/**
 * Behringer DeepMind 12 / Pro-800 Adapter
 *
 * DeepMind 12 SysEx: F0 00 20 32 <0x0E> <cmd> <subId> <7to8-packed-data...> F7
 *   - modelId 0x0E, 242-byte patch data, name at offset 0x01 (16 chars)
 *   - No manufacturer-level checksum (Behringer relies on MIDI transport)
 *
 * Pro-800 SysEx (real format): F0 00 20 32 00 01 24 00 <cmd> <LSB> <MSB> <packed> F7
 *   - cmd 0x77 request / 0x78 response, data starts at byte index 11
 *   - 173-byte patch data (v1.4.4 canonical), name at decoded offset 0x96 (150)
 *   - No checksum, no channel byte. See ModelContract behringer-pro800 for the
 *     canonical, contract-driven implementation.
 */

import { BaseImportAdapter, ImportResult, PatchData } from '../ImportAdapter';
import { BaseExportAdapter, ExportOptions } from '../ExportAdapter';
import { BaseHardwareLink, HardwareDevice, ImportResult as HLImportResult } from '../HardwareLinkContract';
import { unpack7to8, pack8to7, splitSysexMessages } from './sysexUtils';

// ─── Constants ───

const MANUFACTURER_ID = [0x00, 0x20, 0x32];
const MODEL_IDS: Record<string, number> = {
  'behringer-deepmind12': 0x0E,
};

const PATCH_DATA_SIZE: Record<number, number> = {
  0x0E: 242,
};

const PRO800_CMD_RESPONSE = 0x78;
const PRO800_DATA_OFFSET = 11;
const PRO800_PATCH_DATA_SIZE = 173;
const PRO800_NAME_OFFSET = 0x96;

const CMD_DUMP = 0x01;
const ALL_MODEL_IDS = Object.keys(MODEL_IDS);
const TARGET_MODEL_IDS = [...ALL_MODEL_IDS, 'behringer-pro800'];

// ─── Helpers ───

function extractPatchName(data: Uint8Array, modelIdByte: number): string {
  if (modelIdByte === 0x00) {
    // Pro-800: name at decoded offset 0x96, up to 16 chars, null-terminated
    if (data.length <= PRO800_NAME_OFFSET) return '';
    const chars: string[] = [];
    const end = Math.min(data.length, PRO800_NAME_OFFSET + 16);
    for (let i = PRO800_NAME_OFFSET; i < end; i++) {
      const c = data[i];
      if (c === 0x00) break;
      if (c >= 0x20 && c <= 0x7E) chars.push(String.fromCharCode(c));
    }
    return chars.join('');
  }
  // DeepMind 12: name at offset 0x01, 16 chars
  if (data.length < 17) return '';
  return new TextDecoder().decode(data.slice(1, 17)).replace(/\0/g, '').trim();
}

function isPro800Msg(msg: Uint8Array): boolean {
  return msg.length >= 12
    && msg[0] === 0xF0
    && msg[1] === 0x00 && msg[2] === 0x20 && msg[3] === 0x32
    && msg[4] === 0x00 && msg[5] === 0x01 && msg[6] === 0x24
    && msg[8] === PRO800_CMD_RESPONSE
    && msg[msg.length - 1] === 0xF7;
}

function isBehringer(msg: Uint8Array): boolean {
  return msg.length >= 8
    && msg[0] === 0xF0
    && msg[1] === 0x00
    && msg[2] === 0x20
    && msg[3] === 0x32
    && msg[4] in MODEL_IDS
    && msg[5] === CMD_DUMP;
}

// ─── Import Adapter ───

export class BehringerDm12ImportAdapter extends BaseImportAdapter {
  adapterId = 'sysex-behringer-dm12';
  displayName = 'Behringer DeepMind 12 / Pro-800';
  supportedExtensions = ['.syx'];
  targetModelIds = TARGET_MODEL_IDS;

  canParse(data: Uint8Array, filename: string): boolean {
    if (!filename.toLowerCase().endsWith('.syx')) return false;
    const msgs = splitSysexMessages(data);
    return msgs.some(m => isBehringer(m) || isPro800Msg(m));
  }

  parse(data: Uint8Array, filename: string): ImportResult {
    const msgs = splitSysexMessages(data).filter(m => isBehringer(m) || isPro800Msg(m));
    if (msgs.length === 0) {
      return this.createResult({
        success: false,
        modelId: 'behringer-deepmind12',
        error: 'No se encontraron mensajes SysEx Behringer válidos',
      });
    }

    const isPro800 = isPro800Msg(msgs[0]);
    const modelId = isPro800 ? 'behringer-pro800' : 'behringer-deepmind12';
    const expectedSize = isPro800 ? PRO800_PATCH_DATA_SIZE : PATCH_DATA_SIZE[MODEL_IDS['behringer-deepmind12']];
    const patches: PatchData[] = [];

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      // Pro-800: data starts at byte 11; DM12: data starts at byte 7
      const dataOffset = isPro800 ? PRO800_DATA_OFFSET : 7;
      const packedData = msg.slice(dataOffset, msg.length - 1);
      const rawData = unpack7to8(packedData);

      if (rawData.length < expectedSize) {
        const padded = new Uint8Array(expectedSize);
        padded.set(rawData.slice(0, Math.min(rawData.length, expectedSize)));
        patches.push(this.createPatchData({
          name: extractPatchName(padded, isPro800 ? 0x00 : 0x0E) || `P${i + 1}`,
          originAddress: `${String.fromCharCode(65 + Math.floor(i / 100))}${String((i % 100) + 1).padStart(3, '0')}`,
          rawData: padded,
          hardwareIds: [modelId],
        }));
      } else {
        patches.push(this.createPatchData({
          name: extractPatchName(rawData, isPro800 ? 0x00 : 0x0E) || `P${i + 1}`,
          originAddress: `${String.fromCharCode(65 + Math.floor(i / 100))}${String((i % 100) + 1).padStart(3, '0')}`,
          rawData: new Uint8Array(rawData.slice(0, expectedSize)),
          hardwareIds: [modelId],
        }));
      }
    }

    return this.createResult({
      modelId,
      bankName: `Behringer ${modelId.replace('behringer-', '').toUpperCase()}`,
      patches,
    });
  }
}

// ─── Export Adapter ───

export class BehringerDm12ExportAdapter extends BaseExportAdapter {
  adapterId = 'export-behringer-dm12';
  displayName = 'Behringer DeepMind 12 / Pro-800';
  fileExtension = '.syx';
  targetModelIds = TARGET_MODEL_IDS;

  serialize(patches: PatchData[], bankName: string, options?: ExportOptions): Uint8Array {
    const opts = { ...this.getDefaultOptions(), ...options };
    const modelIdByte = MODEL_IDS['behringer-deepmind12'];
    const patchSize = PATCH_DATA_SIZE[modelIdByte];
    const parts: number[] = [];

    for (let i = 0; i < patches.length; i++) {
      const p = patches[i];
      const rawData = p.rawData.slice(0, patchSize);
      const padded = new Uint8Array(patchSize);
      padded.set(rawData);

      const packed = pack8to7(padded);
      // Header: F0 00 20 32 modelId cmd subId
      const header = [0xF0, 0x00, 0x20, 0x32, modelIdByte, CMD_DUMP, 0x01];
      parts.push(...header, ...Array.from(packed), 0xF7);
    }

    return new Uint8Array(parts);
  }
}

// ─── Hardware Link ───

export class BehringerDm12HardwareLink extends BaseHardwareLink {
  modelId = 'behringer-deepmind12';
  supportsEditBuffer = true;
  interMessageDelayMs = 10;
  dumpTimeoutMs = 1000;

  protected getManufacturerId(): number[] { return MANUFACTURER_ID; }
  protected getModelId(): number { return MODEL_IDS[this.modelId] || 0x0E; }

  detectHardware(midiOutputs: any[]): HardwareDevice | null {
    for (const output of midiOutputs) {
      const name = output.name || '';
      if (/deep.?mind.?12/i.test(name) || /dm.?12/i.test(name) || /pro.?800/i.test(name)) {
        return {
          name,
          inputId: output.id || '',
          outputId: output.id || '',
          manufacturer: 'Behringer',
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

    const packed = pack8to7(padded);
    const header = this.createSysexHeader(CMD_DUMP, channel);
    // Replace channel byte: Behringer uses 00 20 32 not 00 20 32 ch
    const behringerHeader = [0xF0, 0x00, 0x20, 0x32, modelIdByte, CMD_DUMP, 0x01];
    return [this.finalizeSysex([...behringerHeader, ...Array.from(packed)])];
  }

  buildBankDump(patches: PatchData[], channel: number): Uint8Array[] {
    return patches.flatMap((p, i) => this.buildPatchDump(p, i, channel));
  }

  buildDumpRequest(slot: number | 'all', channel: number): Uint8Array {
    const modelIdByte = this.getModelId();
    const subId = slot === 'all' ? 0x01 : 0x01;
    return new Uint8Array([0xF0, 0x00, 0x20, 0x32, modelIdByte, 0x00, subId, channel & 0x0F, 0xF7]);
  }

  parseDumpResponse(data: Uint8Array): HLImportResult {
    const adapter = new BehringerDm12ImportAdapter();
    return adapter.parse(data, 'dump.syx');
  }
}
