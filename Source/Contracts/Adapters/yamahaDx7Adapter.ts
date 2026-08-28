/**
 * Yamaha DX7 / DX7II Adapter
 *
 * SysEx format: F0 43 <ch|sub> <modelId> <sub1> <sub2> <data...> <checksum> F7
 * - modelId: 0x00 (DX7), 0x01 (DX7II)
 * - Single voice (VCED): 128 bytes (DX7), 155 bytes (DX7II)
 * - Bulk dump: sub1=0x04, sub2=0x20/0x00 (voice memory), 32 voices = 4096 bytes
 * - Patch name at offset 0x09, 10 chars ASCII
 * - Checksum: sum of all bytes from modelId to last data byte, (128 - sum%128) & 0x7F
 */

import { BaseImportAdapter, ImportResult, PatchData } from '../ImportAdapter';
import { BaseExportAdapter, ExportOptions } from '../ExportAdapter';
import { BaseHardwareLink, HardwareDevice, ImportResult as HLImportResult } from '../HardwareLinkContract';
import { yamahaChecksum, splitSysexMessages } from './sysexUtils';

// ─── Constants ───

const MANUFACTURER_ID = [0x43];
const MODEL_IDS: Record<string, number> = {
  'yamaha-dx7':   0x00,
  'yamaha-dx7ii': 0x01,
};

const PATCH_DATA_SIZE: Record<number, number> = {
  0x00: 128,  // DX7 VCED
  0x01: 155,  // DX7II extended
};

const BULK_SUB1 = 0x04; // bulk dump command
const BULK_SUB2_VOICE = 0x20; // voice memory
const VOICES_PER_BULK = 32;

const ALL_MODEL_IDS = Object.keys(MODEL_IDS);

// ─── Helpers ───

function extractPatchName(data: Uint8Array): string {
  if (data.length < 0x13) return '';
  const nameBytes = data.slice(0x09, 0x13);
  return new TextDecoder().decode(nameBytes).replace(/\0/g, '').trim();
}

function isDx7Sysex(msg: Uint8Array): boolean {
  return msg.length >= 7
    && msg[0] === 0xF0
    && msg[1] === 0x43
    && msg[3] in MODEL_IDS;
}

// ─── Import Adapter ───

export class YamahaDx7ImportAdapter extends BaseImportAdapter {
  adapterId = 'sysex-yamaha-dx7';
  displayName = 'Yamaha DX7 / DX7II';
  supportedExtensions = ['.syx'];
  targetModelIds = ALL_MODEL_IDS;

  canParse(data: Uint8Array, filename: string): boolean {
    if (!filename.toLowerCase().endsWith('.syx')) return false;
    const msgs = splitSysexMessages(data);
    return msgs.some(m => isDx7Sysex(m));
  }

  verifyChecksum(data: Uint8Array): boolean {
    const msgs = splitSysexMessages(data);
    for (const msg of msgs) {
      if (!isDx7Sysex(msg)) continue;
      const payload = msg.slice(3, msg.length - 2); // modelId to last data byte
      const expected = yamahaChecksum(payload);
      if (msg[msg.length - 2] !== expected) return false;
    }
    return true;
  }

  parse(data: Uint8Array, filename: string): ImportResult {
    const msgs = splitSysexMessages(data).filter(m => isDx7Sysex(m));
    if (msgs.length === 0) {
      return this.createResult({
        success: false,
        modelId: 'yamaha-dx7',
        error: 'No se encontraron mensajes SysEx Yamaha DX7 válidos',
      });
    }

    const modelIdByte = msgs[0][3];
    const modelId = Object.entries(MODEL_IDS).find(([,id]) => id === modelIdByte)?.[0] || 'yamaha-dx7';
    const expectedSize = PATCH_DATA_SIZE[modelIdByte] || 128;
    const patches: PatchData[] = [];

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      // Check if bulk dump (sub1=0x04)
      const sub1 = msg[4];
      if (sub1 === BULK_SUB1) {
        // Bulk dump: extract individual voices
        const voiceData = msg.slice(6, msg.length - 2); // exclude header and checksum
        const voicesInBulk = Math.floor(voiceData.length / expectedSize);
        for (let v = 0; v < voicesInBulk && v < VOICES_PER_BULK; v++) {
          const voice = voiceData.slice(v * expectedSize, (v + 1) * expectedSize);
          patches.push(this.createPatchData({
            name: extractPatchName(voice) || `V${v + 1}`,
            originAddress: `V${String(v + 1).padStart(2, '0')}`,
            rawData: new Uint8Array(voice),
            hardwareIds: [modelId, ...ALL_MODEL_IDS.filter(id => id !== modelId)],
          }));
        }
      } else {
        // Single voice dump
        const rawData = msg.slice(6, msg.length - 2);
        patches.push(this.createPatchData({
          name: extractPatchName(rawData) || `V${i + 1}`,
          originAddress: `V${String(i + 1).padStart(2, '0')}`,
          rawData: new Uint8Array(rawData.slice(0, expectedSize)),
          hardwareIds: [modelId, ...ALL_MODEL_IDS.filter(id => id !== modelId)],
        }));
      }
    }

    return this.createResult({
      modelId,
      bankName: `Yamaha ${modelId.replace('yamaha-', '').toUpperCase()}`,
      patches,
    });
  }
}

// ─── Export Adapter ───

export class YamahaDx7ExportAdapter extends BaseExportAdapter {
  adapterId = 'export-yamaha-dx7';
  displayName = 'Yamaha DX7 / DX7II';
  fileExtension = '.syx';
  targetModelIds = ALL_MODEL_IDS;

  serialize(patches: PatchData[], bankName: string, options?: ExportOptions): Uint8Array {
    const opts = { ...this.getDefaultOptions(), ...options };
    const modelIdByte = MODEL_IDS['yamaha-dx7'];
    const patchSize = PATCH_DATA_SIZE[modelIdByte];
    const parts: number[] = [];

    // Send as bulk dump (32 voices max per bulk)
    const bulkCount = Math.min(patches.length, VOICES_PER_BULK);
    const voiceData: number[] = [];
    for (let i = 0; i < bulkCount; i++) {
      const raw = patches[i].rawData.slice(0, patchSize);
      const padded = new Uint8Array(patchSize);
      padded.set(raw);
      voiceData.push(...Array.from(padded));
    }

    // Header: F0 43 <ch|sub> 0x00 0x04 0x20 0x00
    const header = [0xF0, 0x43, 0x10 | (opts.midiChannel & 0x0F), modelIdByte, BULK_SUB1, BULK_SUB2_VOICE, 0x00];
    const payload = Uint8Array.from([...header.slice(1), ...voiceData]); // from modelId
    const checksum = yamahaChecksum(payload);
    parts.push(...header, ...voiceData, checksum, 0xF7);

    // If more than32 patches, send second bulk
    if (patches.length > VOICES_PER_BULK) {
      const voiceData2: number[] = [];
      const count2 = Math.min(patches.length - VOICES_PER_BULK, VOICES_PER_BULK);
      for (let i = VOICES_PER_BULK; i < VOICES_PER_BULK + count2; i++) {
        const raw = patches[i].rawData.slice(0, patchSize);
        const padded = new Uint8Array(patchSize);
        padded.set(raw);
        voiceData2.push(...Array.from(padded));
      }
      const payload2 = Uint8Array.from([...header.slice(1), ...voiceData2]);
      const checksum2 = yamahaChecksum(payload2);
      parts.push(...header, ...voiceData2, checksum2, 0xF7);
    }

    return new Uint8Array(parts);
  }
}

// ─── Hardware Link ───

export class YamahaDx7HardwareLink extends BaseHardwareLink {
  modelId = 'yamaha-dx7';
  supportsEditBuffer = false;
  interMessageDelayMs = 20;
  dumpTimeoutMs = 2000;

  protected getManufacturerId(): number[] { return MANUFACTURER_ID; }
  protected getModelId(): number { return MODEL_IDS[this.modelId] || 0x00; }

  detectHardware(midiOutputs: any[]): HardwareDevice | null {
    for (const output of midiOutputs) {
      const name = output.name || '';
      if (/dx7/i.test(name)) {
        return {
          name,
          inputId: output.id || '',
          outputId: output.id || '',
          manufacturer: 'Yamaha',
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

    // Single voice dump: F0 43 <ch|0> modelId 0x00 0x09 <128 bytes> <checksum> F7
    const header = [0xF0, 0x43, channel & 0x0F, modelIdByte, 0x00, 0x09];
    const payload = Uint8Array.from([...header.slice(1), ...Array.from(padded)]);
    const checksum = yamahaChecksum(payload);
    return [this.finalizeSysex([...header, ...Array.from(padded), checksum])];
  }

  buildBankDump(patches: PatchData[], channel: number): Uint8Array[] {
    // Send as bulk dump (up to32 voices)
    const modelIdByte = this.getModelId();
    const patchSize = PATCH_DATA_SIZE[modelIdByte];
    const voiceData: number[] = [];
    for (const p of patches.slice(0, VOICES_PER_BULK)) {
      const raw = p.rawData.slice(0, patchSize);
      const padded = new Uint8Array(patchSize);
      padded.set(raw);
      voiceData.push(...Array.from(padded));
    }

    const header = [0xF0, 0x43, 0x10 | (channel & 0x0F), modelIdByte, BULK_SUB1, BULK_SUB2_VOICE, 0x00];
    const payload = Uint8Array.from([...header.slice(1), ...voiceData]);
    const checksum = yamahaChecksum(payload);
    return [this.finalizeSysex([...header, ...voiceData, checksum])];
  }

  buildDumpRequest(slot: number | 'all', channel: number): Uint8Array {
    const modelIdByte = this.getModelId();
    if (slot === 'all') {
      // Bulk request: F0 43 <ch|1> modelId 0x00 0x09 0x20 0x00 F7
      return new Uint8Array([0xF0, 0x43, 0x10 | (channel & 0x0F), modelIdByte, 0x00, 0x09, 0x20, 0x00, 0xF7]);
    }
    // Single voice request
    return new Uint8Array([0xF0, 0x43, channel & 0x0F, modelIdByte, 0x00, 0x09, 0xF7]);
  }

  parseDumpResponse(data: Uint8Array): HLImportResult {
    const adapter = new YamahaDx7ImportAdapter();
    return adapter.parse(data, 'dump.syx');
  }
}
